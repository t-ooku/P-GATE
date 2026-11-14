import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  IDENTIFY_LATENCY_RETENTION_MS, identifyLatencyDetail, identifyLatencyRow, purgeIdentifyLatencyLog, recordIdentifyLatency
} from '../src/identify-latency.mjs';
import { deferredPreviewResponse, identifyCandidateFromAnalysis, isIdentifyPreviewKey, readIdentifyPreviews } from '../src/identify-route.mjs';
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
  assert.equal(identifyLatencyRow({ route: 'other', cacheState: 'miss' }), null);
  assert.equal(identifyLatencyRow({ route: 'knowledge', cacheState: 'off' }).route, 'knowledge');
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

test('写真からの特定は毎回 Google 検索を引く（見つかることを優先）', () => {
  const analysis = readFileSync(new URL('../src/search-input-analysis.mjs', import.meta.url), 'utf8');
  assert.match(analysis, /grounded \? \{ tools: \[\{ googleSearch: \{\} \}\] \} : \{\}/u);
  // 写真があるときは既定で grounding 付き（低確信のときだけ、ではない）。
  assert.match(analysis, /const groundImages = String\(env\.GEMINI_IDENTIFY_GROUNDING \|\| ''\) === 'true'\s*&& Boolean\(normalizedImage\) && !socialUrl;/u);
  assert.match(analysis, /grounded = groundImages/u);
  // 候補が出せなかったときの読み直しは grounding 無しにして、別の形で読む。
  assert.match(analysis, /requestAnalysisOnce\('', normalizedImage, IMAGE_ANALYSIS_RETRY_TIMEOUT_MS, fallbackModel, false\)/u);
  const wrangler = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(wrangler.vars.GEMINI_IDENTIFY_GROUNDING, 'true');
});

// 2026-11-14 Cowork 依頼（写真検索 第1段 その1）: どの経路で答えたか・どこで落ちたかを残す。
test('経路・診断コード・入力の種類は固定語彙だけを残し、想定外の形は空にする', () => {
  assert.deepEqual(identifyLatencyDetail({
    provider: 'GOOGLE_VISION_BEST_GUESS_FALLBACK',
    diagnostic: 'OK__G_TIMEOUT_V_USED_E5_T0_J0_B1',
    inputKind: 'image'
  }), { provider: 'GOOGLE_VISION_BEST_GUESS_FALLBACK', diagnostic: 'OK__G_TIMEOUT_V_USED_E5_T0_J0_B1', input_kind: 'image' });
  // 検索語・商品名・小文字や空白入りの値は書かない。
  assert.deepEqual(identifyLatencyDetail({ provider: 'エレコム トラックボール', diagnostic: 'mouse Computer', inputKind: 'raw' }),
    { provider: '', diagnostic: '', input_kind: '' });
  assert.equal(identifyLatencyDetail({ diagnostic: 'A'.repeat(81) }).diagnostic, '');
  // 行の基本形（時間の列）は変えない。
  const row = identifyLatencyRow({ route: 'identify', cacheState: 'miss', provider: 'GEMINI_SEARCH_GROUNDED' });
  assert.equal('provider' in row, false);
});

test('0097 適用後は経路・診断も残り、未適用でも時間だけは従来どおり残る', async () => {
  const now = new Date('2026-11-14T00:00:00.000Z');
  const input = {
    route: 'identify', cacheState: 'miss', aiMs: 9000, totalMs: 9500, now,
    provider: 'FAILED', diagnostic: 'SEARCH_INPUT_ANALYSIS_FAILED__G_TIMEOUT_V_USED_E2_T0_J0_B1', inputKind: 'url'
  };
  const legacy = databaseEnv();
  assert.equal(await recordIdentifyLatency(legacy.env, input), true);
  assert.equal(legacy.db.prepare('SELECT COUNT(*) AS n FROM identify_latency_log').get().n, 1);
  const applied = databaseEnv();
  applied.db.exec(readFileSync(new URL('../migrations/0097_identify_latency_provider.sql', import.meta.url), 'utf8'));
  assert.equal(await recordIdentifyLatency(applied.env, input), true);
  const stored = applied.db.prepare('SELECT provider, diagnostic, input_kind, ai_ms FROM identify_latency_log').get();
  assert.deepEqual({ ...stored }, {
    provider: 'FAILED', diagnostic: 'SEARCH_INPUT_ANALYSIS_FAILED__G_TIMEOUT_V_USED_E2_T0_J0_B1', input_kind: 'url', ai_ms: 9000
  });
  // 既存の行（時間だけ）は空文字の既定値で読める。
  assert.equal(await recordIdentifyLatency(applied.env, { route: 'identify', cacheState: 'hit', now }), true);
  assert.equal(applied.db.prepare("SELECT COUNT(*) AS n FROM identify_latency_log WHERE provider=''").get().n, 1);
  // 14日で消える（列が増えても同じ）。
  await purgeIdentifyLatencyLog(applied.env, new Date(now.getTime() + IDENTIFY_LATENCY_RETENTION_MS + 1000));
  assert.equal(applied.db.prepare('SELECT COUNT(*) AS n FROM identify_latency_log').get().n, 0);
  const migration = readFileSync(new URL('../migrations/0097_identify_latency_provider.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(migration, /query|session|member|image_data|candidate/iu);
});

test('識別APIは経路・診断を記録に渡し、利用者への応答には出さない', () => {
  const index = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(index, /provider: analysis\?\.provider \|\| '', diagnostic: analysis\?\.diagnostic \|\| ''/u);
  assert.match(index, /provider: 'FAILED', diagnostic: String\(error\?\.diagnostic \|\| code\)/u);
  const candidate = identifyCandidateFromAnalysis({
    candidate_name: 'エレコム トラックボール', provider: 'GEMINI_SEARCH_GROUNDED', diagnostic: 'OK__G_OK_V_USED_E1_T0_J0_B1'
  });
  assert.equal('provider' in candidate, false);
  assert.equal('diagnostic' in candidate, false);
});
