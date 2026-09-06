import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  IDENTIFY_LATENCY_RETENTION_MS, identifyLatencyRow, purgeIdentifyLatencyLog, recordIdentifyLatency
} from '../src/identify-latency.mjs';
import { deferredPreviewResponse, isIdentifyPreviewKey, readIdentifyPreviews } from '../src/identify-route.mjs';
import { writeIdentifyCache } from '../src/ai-identify-cache.mjs';

function databaseEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0074_identify_latency_log.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0073_ai_identify_cache.sql', import.meta.url), 'utf8'));
  const env = { PRODUCT_DB: { prepare(sql) { const statement = db.prepare(sql); let values = [];
    return { bind(...next) { values = next; return this; },
      async run() { statement.run(...values); return { success: true }; },
      async all() { return { results: statement.all(...values) }; } }; } } };
  return { db, env };
}

test('所要時間はミリ秒とキャッシュ状態だけを残す（質問文も利用者の情報も残さない）', () => {
  const row = identifyLatencyRow({ route: 'identify', cacheState: 'miss', aiMs: 3210.4, previewMs: 900, totalMs: 4300 });
  assert.deepEqual(Object.keys(row), ['log_id', 'route', 'cache_state', 'ai_ms', 'preview_ms', 'total_ms', 'created_at']);
  assert.equal(row.ai_ms, 3210);
  // 想定外の値は書かない（未知の経路・未知のキャッシュ状態）。
  assert.equal(identifyLatencyRow({ route: 'knowledge', cacheState: 'miss' }), null);
  assert.equal(identifyLatencyRow({ route: 'identify', cacheState: 'unknown' }), null);
  // 異常な数値は丸める（負・巨大）。
  assert.equal(identifyLatencyRow({ route: 'identify', cacheState: 'hit', aiMs: -5, totalMs: 9e9 }).total_ms, 600000);
});

test('所要時間はD1に残り、14日で消える', async () => {
  const { db, env } = databaseEnv();
  const now = new Date('2026-09-06T00:00:00.000Z');
  assert.equal(await recordIdentifyLatency(env, { route: 'identify', cacheState: 'hit', totalMs: 42, now }), true);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM identify_latency_log').get().n, 1);
  await purgeIdentifyLatencyLog(env, new Date(now.getTime() + IDENTIFY_LATENCY_RETENTION_MS + 1000));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM identify_latency_log').get().n, 0);
  // 計測が落ちても検索は止めない。
  assert.equal(await recordIdentifyLatency({}, { route: 'identify', cacheState: 'hit' }), false);
});

test('参考画像は候補カードの後から取りに行ける', async () => {
  const { env } = databaseEnv();
  const key = 'a'.repeat(64);
  assert.equal(isIdentifyPreviewKey(key), true);
  assert.equal(isIdentifyPreviewKey('zz'), false);
  // まだ書かれていない間は ready:false（カードは画像なしのまま出ている）。
  assert.deepEqual(await readIdentifyPreviews(env, key), { ready: false, candidate_previews: [], previews_key: key });
  await writeIdentifyCache(env, key, {
    candidate_name: 'サーモス 水筒',
    candidate_previews: [{ name: '水筒', image: 'https://example.com/a.jpg', marketplace: 'RAKUTEN_JP' }]
  });
  const ready = await readIdentifyPreviews(env, key);
  assert.equal(ready.ready, true);
  assert.equal(ready.candidate_previews[0].image, 'https://example.com/a.jpg');
  // 鍵が不正なら何も返さない。
  assert.deepEqual(await readIdentifyPreviews(env, 'not-a-key'), { ready: false, candidate_previews: [] });
  assert.deepEqual(deferredPreviewResponse('', null), { ready: false, candidate_previews: [], previews_key: '' });
});

test('Workerと画面に配線されている（先にカード、あとから画像、所要時間を記録）', () => {
  const index = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(index, /if \(input\.defer_previews && cacheKey\)/u);
  assert.match(index, /url\.pathname === '\/api\/identify\/previews'/u);
  assert.match(index, /recordIdentifyLatency\(env, \{/u);
  assert.match(index, /purgeIdentifyLatencyLog\(env, scheduledAt\)/u);
  const ui = readFileSync(new URL('../public/ai-search-ui.mjs', import.meta.url), 'utf8');
  assert.match(ui, /defer_previews: true/u);
  assert.match(ui, /async function fetchDeferredPreviews\(previewsKey, onReady\)/u);
  assert.match(ui, /if\(!previews\.length&&result\.previews_key\)\{/u);
});

test('Search grounding は自信が低いときだけ引き直す', () => {
  const analysis = readFileSync(new URL('../src/search-input-analysis.mjs', import.meta.url), 'utf8');
  assert.match(analysis, /export const IDENTIFY_GROUNDING_MIN_SCORE = 60;/u);
  assert.match(analysis, /grounded \? \{ tools: \[\{ googleSearch: \{\} \}\] \} : \{\}/u);
  assert.match(analysis, /const groundingEnabled = String\(env\.GEMINI_IDENTIFY_GROUNDING \|\| ''\) === 'true'/u);
  assert.match(analysis, /const weakCandidate = !result\.candidate_name \|\| result\.match_score < IDENTIFY_GROUNDING_MIN_SCORE/u);
  // 自信が高いときは足さない（毎回引くと待ち時間が伸びるため）。
  assert.match(analysis, /if \(groundingEnabled && weakCandidate && !socialUrl && normalizedImage\)/u);
  // grounding が失敗しても元の候補で確認カードを出す。
  assert.match(analysis, /groundedResult\.candidate_name && groundedResult\.match_score >= result\.match_score/u);
  const wrangler = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(wrangler.vars.GEMINI_IDENTIFY_GROUNDING, 'true');
});
