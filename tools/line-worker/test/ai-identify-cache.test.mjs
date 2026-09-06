import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  IDENTIFY_CACHE_TTL_MS, bumpIdentifyCacheHit, identifyCacheKey, normalizeIdentifyQuery,
  purgeExpiredIdentifyCache, readIdentifyCache, sanitizeIdentifyPayload, writeIdentifyCache
} from '../src/ai-identify-cache.mjs';

function databaseEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0073_ai_identify_cache.sql', import.meta.url), 'utf8'));
  const env = { PRODUCT_DB: { prepare(sql) { const statement = db.prepare(sql); let values = [];
    return { bind(...next) { values = next; return this; },
      async run() { const info = statement.run(...values); return { success: true, meta: { changes: Number(info.changes || 0) } }; },
      async all() { return { results: statement.all(...values) }; } }; } } };
  return { db, env };
}

const RESULT = {
  candidate_name: 'サーモス 真空断熱ケータイマグ 500ml',
  candidate_brand: 'サーモス', candidate_reason: '説明に合う定番品です', refined_query: 'サーモス 水筒 500ml',
  match_score: 82, matched_features: ['保温', '500ml'],
  candidate_previews: [{ name: '水筒A', image: 'https://example.com/a.jpg', price: 2980, marketplace: 'RAKUTEN_JP', tracking_url: 'https://hoshilu.app/go?token=x' }]
};

test('質問文の表記ゆれは同じキーになる（全角空白・大文字・末尾の記号）', async () => {
  assert.equal(normalizeIdentifyQuery('  サーモス　水筒 500ML？ '), 'サーモス 水筒 500ml');
  const a = await identifyCacheKey('サーモス　水筒 500ML？', 'JA', 'IDENTIFY');
  const b = await identifyCacheKey('サーモス 水筒 500ml', 'JA', 'IDENTIFY');
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/u);
  // 言語・モードが違えば別キー。空の質問はキーを作らない。
  assert.notEqual(a, await identifyCacheKey('サーモス 水筒 500ml', 'EN', 'IDENTIFY'));
  assert.notEqual(a, await identifyCacheKey('サーモス 水筒 500ml', 'JA', 'REFINE'));
  assert.equal(await identifyCacheKey('   ', 'JA', 'IDENTIFY'), '');
});

test('保存するのは確認カードに出す項目だけ。署名付きリンクと価格は残さない', () => {
  const payload = sanitizeIdentifyPayload(RESULT);
  assert.equal(payload.candidate_name, RESULT.candidate_name);
  assert.equal(payload.match_score, 82);
  assert.deepEqual(Object.keys(payload.candidate_previews[0]), ['name', 'image', 'marketplace']);
  assert.equal(payload.candidate_previews[0].tracking_url, undefined);
  assert.equal(payload.candidate_previews[0].price, undefined);
  // http や画像なしの候補は落とす。候補名が無いものは保存しない。
  assert.equal(sanitizeIdentifyPayload({ ...RESULT, candidate_previews: [{ name: 'x', image: 'http://a/b.jpg' }] }).candidate_previews.length, 0);
  assert.equal(sanitizeIdentifyPayload({ ...RESULT, candidate_name: '' }), null);
  assert.equal(sanitizeIdentifyPayload(null), null);
});

test('2回目は D1 から返し、期限切れは返さない', async () => {
  const { db, env } = databaseEnv();
  const key = await identifyCacheKey('サーモス 水筒', 'JA', 'IDENTIFY');
  const now = new Date('2026-09-06T00:00:00.000Z');
  assert.equal(await readIdentifyCache(env, key, now), null);
  assert.equal(await writeIdentifyCache(env, key, RESULT, { language: 'JA', now }), true);
  const cached = await readIdentifyCache(env, key, now);
  assert.equal(cached.candidate_name, RESULT.candidate_name);
  assert.equal(cached.candidate_previews[0].image, 'https://example.com/a.jpg');
  await bumpIdentifyCacheHit(env, key);
  assert.equal(db.prepare('SELECT hits FROM ai_identify_cache').get().hits, 1);
  // TTL を過ぎたら使わない。掃除で消える。
  const later = new Date(now.getTime() + IDENTIFY_CACHE_TTL_MS + 1000);
  assert.equal(await readIdentifyCache(env, key, later), null);
  await purgeExpiredIdentifyCache(env, later);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ai_identify_cache').get().n, 0);
});

test('D1 が無い・壊れていても検索を止めない', async () => {
  assert.equal(await readIdentifyCache({}, 'k'), null);
  assert.equal(await writeIdentifyCache({}, 'k', RESULT), false);
  const broken = { PRODUCT_DB: { prepare() { throw new Error('D1_DOWN'); } } };
  assert.equal(await readIdentifyCache(broken, 'k'), null);
  assert.equal(await writeIdentifyCache(broken, 'k', RESULT), false);
});

test('Workerに配線されている（1問目だけキャッシュし、cron で掃除する）', () => {
  const index = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(index, /from '\.\/ai-identify-cache\.mjs'/u);
  assert.match(index, /input\.mode === 'IDENTIFY' && input\.history\.length === 1/u);
  assert.match(index, /purgeExpiredIdentifyCache\(env, scheduledAt\)/u);
});
