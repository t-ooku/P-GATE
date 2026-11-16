import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PHOTO_PREMIUM_MAX_BUDGET_JPY, photoPremiumActualMicroJpy, photoPremiumBudgetJpy, photoPremiumModel,
  photoPremiumReserveMicroJpy, reservePhotoPremiumBudget, settlePhotoPremiumBudget
} from '../src/gemini-photo-budget.mjs';
import { analyzeSearchInput } from '../src/search-input-analysis.mjs';

const JPEG = { mime_type: 'image/jpeg', data: '/9j/4AAQ' };
const NOW = new Date('2026-12-10T03:00:00Z');

// gemini_photo_usage_monthly だけを真似る D1（Vision の枠テーブルは常に許可）。
function fakeDb({ fail = false } = {}) {
  const rows = new Map();
  const calls = [];
  return {
    rows,
    calls,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes('google_visual_web_detection_usage_monthly')) return { reserved_requests: 1, monthly_limit: 900 };
              if (fail) throw new Error('D1_DOWN');
              calls.push('reserve');
              const [month, reserve, budgetJpy, at, budgetMicro] = args;
              const row = rows.get(month);
              if (!row) {
                rows.set(month, { spent: reserve, count: 1, budgetJpy, at });
                return { spent_micro_jpy: reserve };
              }
              if (row.spent + reserve > budgetMicro) return null;
              row.spent += reserve; row.count += 1;
              return { spent_micro_jpy: row.spent };
            },
            async run() {
              if (fail) throw new Error('D1_DOWN');
              calls.push('settle');
              const [month, delta] = args;
              const row = rows.get(month);
              if (row) row.spent = Math.max(0, row.spent + delta);
              return {};
            }
          };
        }
      };
    }
  };
}

const answer = (name, usage) => Response.json({
  candidates: [{ content: { parts: [{ text: JSON.stringify({ refined_query: name, candidate_name: name }) }] } }],
  ...(usage ? { usageMetadata: usage } : {})
});

function envWith(db, extra = {}) {
  return {
    GEMINI_API_KEY: 'g'.repeat(32),
    GEMINI_PRODUCT_DISCOVERY_MODEL: 'gemini-test',
    GEMINI_PRODUCT_DISCOVERY_FALLBACK_MODEL: 'gemini-lite',
    GEMINI_PHOTO_IDENTIFY_MODEL: 'gemini-4-argon',
    PRODUCT_DB: db,
    ...extra
  };
}

function routedFetch(handlers, seen) {
  return async (url, options) => {
    const text = String(url);
    if (text.startsWith('https://vision.googleapis.com/')) return Response.json({ responses: [{ webDetection: {} }] });
    const model = decodeURIComponent(text.match(/models\/([^:]+):/u)?.[1] || '');
    seen.push(model);
    return handlers[model](options);
  };
}

test('既定は上位モデルを使わない（モデル名が空・不正）。上限は 3,000 円を超えない', () => {
  assert.equal(photoPremiumModel({}), '');
  assert.equal(photoPremiumModel({ GEMINI_PHOTO_IDENTIFY_MODEL: 'models/../x' }), '');
  assert.equal(photoPremiumModel({ GEMINI_PHOTO_IDENTIFY_MODEL: ' gemini-4-argon ' }), 'gemini-4-argon');
  assert.equal(photoPremiumBudgetJpy({}), 3000);
  assert.equal(photoPremiumBudgetJpy({ GEMINI_PHOTO_MONTHLY_BUDGET_JPY: '50000' }), PHOTO_PREMIUM_MAX_BUDGET_JPY);
  assert.equal(photoPremiumBudgetJpy({ GEMINI_PHOTO_MONTHLY_BUDGET_JPY: '1000' }), 1000);
  assert.equal(photoPremiumBudgetJpy({ GEMINI_PHOTO_MONTHLY_BUDGET_JPY: '0' }), 0);
});

test('単価は既定で 12/1 以降（入力 $4・出力 $20 per 1M）・1 ドル 160 円。思考と道具のトークンも数える', () => {
  // 入力 1,000,000（prompt 900k + tool 100k）→ $4、出力 100,000（候補 60k + 思考 40k）→ $2。計 $6 × 160 = 960 円。
  const micro = photoPremiumActualMicroJpy({
    promptTokenCount: 900_000, toolUsePromptTokenCount: 100_000, candidatesTokenCount: 60_000, thoughtsTokenCount: 40_000
  }, {});
  assert.equal(micro, 960 * 1_000_000);
  assert.equal(photoPremiumActualMicroJpy(null, {}), null);
  assert.equal(photoPremiumActualMicroJpy({}, {}), null);
  // 見込み額: 8,000 入力 + 4,096 出力 → (0.032 + 0.08192) × 160 ≒ 18.23 円。検索ありは $0.05 上乗せ。
  const reserve = photoPremiumReserveMicroJpy({});
  assert.ok(reserve > 18 * 1_000_000 && reserve < 19 * 1_000_000);
  assert.ok(photoPremiumReserveMicroJpy({}, { grounded: true }) - reserve >= 8 * 1_000_000);
});

test('先に枠を取り、上限に達した月は取れない。D1 が失敗・未設定の時も取れない（上限を超えない側）', async () => {
  const db = fakeDb();
  const env = { GEMINI_PHOTO_IDENTIFY_MODEL: 'gemini-4-argon', GEMINI_PHOTO_MONTHLY_BUDGET_JPY: '40', PRODUCT_DB: db };
  const first = await reservePhotoPremiumBudget(env, { now: NOW });
  const second = await reservePhotoPremiumBudget(env, { now: NOW });
  const third = await reservePhotoPremiumBudget(env, { now: NOW });
  assert.equal(first.allowed, true);
  assert.equal(first.month, '2026-12');
  assert.equal(second.allowed, true);
  assert.deepEqual([third.allowed, third.reason], [false, 'LIMIT'], '約 18 円 × 3 は 40 円を超える');
  assert.deepEqual(await reservePhotoPremiumBudget({ ...env, PRODUCT_DB: fakeDb({ fail: true }) }, { now: NOW }), { allowed: false, reason: 'GUARD' });
  assert.deepEqual(await reservePhotoPremiumBudget({ GEMINI_PHOTO_IDENTIFY_MODEL: 'gemini-4-argon' }, { now: NOW }), { allowed: false, reason: 'GUARD' });
  assert.equal((await reservePhotoPremiumBudget({ ...env, GEMINI_PHOTO_MONTHLY_BUDGET_JPY: '0' }, { now: NOW })).reason, 'LIMIT');
  assert.equal((await reservePhotoPremiumBudget({ PRODUCT_DB: db }, { now: NOW })).reason, 'NOT_CONFIGURED');
});

test('応答のトークン数で実額に精算する。数えられない時は見込み額のまま', async () => {
  const db = fakeDb();
  const env = { GEMINI_PHOTO_IDENTIFY_MODEL: 'gemini-4-argon', PRODUCT_DB: db };
  const reservation = await reservePhotoPremiumBudget(env, { now: NOW });
  const reserved = db.rows.get('2026-12').spent;
  assert.equal(await settlePhotoPremiumBudget(env, reservation, null, { now: NOW }), false);
  assert.equal(db.rows.get('2026-12').spent, reserved);
  assert.equal(await settlePhotoPremiumBudget(env, reservation, { promptTokenCount: 2000, candidatesTokenCount: 300 }, { now: NOW }), true);
  // (2000×4 + 300×20)/1e6 × 160 = 2.24 円
  assert.equal(db.rows.get('2026-12').spent, 2_240_000);
});

test('写真: 枠が取れたら上位モデルで答え、provider と診断で分かる。トークン数で精算する', async () => {
  const db = fakeDb();
  const seen = [];
  const result = await analyzeSearchInput({ image: JPEG }, 'JA', envWith(db), routedFetch({
    'gemini-4-argon': () => answer('エレコム トラックボール', { promptTokenCount: 2000, candidatesTokenCount: 300 }),
    'gemini-test': () => answer('マウス')
  }, seen));
  assert.deepEqual(seen, ['gemini-4-argon']);
  assert.equal(result.refined_query, 'エレコム トラックボール');
  assert.equal(result.provider, 'GEMINI_MULTIMODAL_SEARCH_INPUT_PREMIUM');
  assert.equal(result.model, 'gemini-4-argon');
  assert.match(result.diagnostic, /_PUSED$/u);
  assert.deepEqual(db.calls, ['reserve', 'settle']);
  assert.ok(db.rows.get([...db.rows.keys()][0]).spent > 0);
});

test('写真: 上限に達した月・D1 失敗の時は上位モデルを呼ばず、今のモデルで答える', async () => {
  for (const [db, code] of [[fakeDb({ fail: true }), 'GUARD']]) {
    const seen = [];
    const result = await analyzeSearchInput({ image: JPEG }, 'JA', envWith(db), routedFetch({
      'gemini-4-argon': () => { throw new Error('must not call'); },
      'gemini-test': () => answer('トラックボール')
    }, seen));
    assert.deepEqual(seen, ['gemini-test']);
    assert.equal(result.provider, 'GEMINI_MULTIMODAL_SEARCH_INPUT');
    assert.equal(result.model, 'gemini-test');
    assert.match(result.diagnostic, new RegExp(`_P${code}$`, 'u'));
  }
  const seen = [];
  const limited = await analyzeSearchInput({ image: JPEG }, 'JA', envWith(fakeDb(), { GEMINI_PHOTO_MONTHLY_BUDGET_JPY: '1' }), routedFetch({
    'gemini-4-argon': () => { throw new Error('must not call'); },
    'gemini-test': () => answer('トラックボール')
  }, seen));
  assert.deepEqual(seen, ['gemini-test']);
  assert.match(limited.diagnostic, /_PLIMIT$/u);
});

test('写真: 上位モデルが失敗・候補なしの時は 今のモデル → 予備 の順（行き止まりにしない）', async () => {
  const seen = [];
  const failed = await analyzeSearchInput({ image: JPEG }, 'JA', envWith(fakeDb()), routedFetch({
    'gemini-4-argon': () => new Response('{}', { status: 500 }),
    'gemini-test': () => new Response('{}', { status: 503 }),
    'gemini-lite': () => answer('トラックボール')
  }, seen));
  assert.deepEqual(seen, ['gemini-4-argon', 'gemini-test', 'gemini-lite']);
  assert.equal(failed.refined_query, 'トラックボール');
  assert.equal(failed.provider, 'GEMINI_MULTIMODAL_SEARCH_INPUT');
  assert.match(failed.diagnostic, /_PFAIL$/u);
  const seen2 = [];
  const empty = await analyzeSearchInput({ image: JPEG }, 'JA', envWith(fakeDb()), routedFetch({
    'gemini-4-argon': () => Response.json({ candidates: [{ content: { parts: [{ text: '{}' }] } }], usageMetadata: { promptTokenCount: 10 } }),
    'gemini-test': () => answer('トラックボール')
  }, seen2));
  assert.deepEqual(seen2, ['gemini-4-argon', 'gemini-test']);
  assert.equal(empty.model, 'gemini-test');
  assert.match(empty.diagnostic, /_PEMPTY$/u);
});

test('文字だけの検索・モデル名が空の時は上位モデルにも D1 の枠にも触れない', async () => {
  const db = fakeDb();
  const seen = [];
  const text = await analyzeSearchInput({ query: 'トラックボール' }, 'JA', envWith(db), routedFetch({}, seen));
  assert.equal(text.refined_query, 'トラックボール');
  assert.deepEqual(seen, []);
  const off = await analyzeSearchInput({ image: JPEG }, 'JA', envWith(db, { GEMINI_PHOTO_IDENTIFY_MODEL: '' }), routedFetch({
    'gemini-test': () => answer('トラックボール')
  }, seen));
  assert.deepEqual(seen, ['gemini-test']);
  assert.equal(off.provider, 'GEMINI_MULTIMODAL_SEARCH_INPUT');
  assert.doesNotMatch(off.diagnostic, /_P/u);
  assert.deepEqual(db.calls, []);
});

test('migration は表を作るだけ（既存の行を変えない）。上限 3,000 円を表の制約でも持つ', async () => {
  const sql = await readFile(new URL('../migrations/0098_gemini_photo_budget.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS gemini_photo_usage_monthly/u);
  assert.match(sql, /monthly_budget_jpy <= 3000/u);
  assert.doesNotMatch(sql, /\b(UPDATE|DELETE|DROP|ALTER)\b/u);
});
