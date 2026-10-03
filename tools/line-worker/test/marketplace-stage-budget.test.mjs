// 2026-09-21 大隆さん指示「検索時間を短くしてほしい。平均10秒掛かってる」への対応。
// Yahoo! は 1 リクエストあたり 2.1 秒の全体間隔で直列化されるため、キーワード候補を
// 3 通り試すと待ち時間だけで 4.2 秒、公式店レーンを足すと 6.3 秒が検索の所要時間に
// そのまま乗っていた。モール検索に実時間の締め切りを置き、間に合ったモールの結果で返す。
// 間に合わなかったレーンは捨てずに走り切らせ、価格キャッシュにだけ反映する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MARKETPLACE_STAGE_BUDGET_MS, marketplaceStageBudgetMs, searchMarketplaceApiWithFallback,
  summarizeMarketplaceSearchOutcomes, withMarketplaceStageBudget
} from '../src/index.mjs';

const sleep = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

test('締め切り内に終わったレーンの結果はそのまま返る', async () => {
  const result = await withMarketplaceStageBudget(sleep(10, [{ asin: 'A' }]), 500);
  assert.deepEqual(result, [{ asin: 'A' }]);
});

test('締め切りを超えたレーンは空で返り、0件とは別に late として通知される', async () => {
  const late = [];
  const started = Date.now();
  const result = await withMarketplaceStageBudget(sleep(400, [{ asin: 'A' }]), 60, {
    onLate: (settled) => late.push(settled)
  });
  assert.deepEqual(result, []);
  assert.equal(late.length, 1, 'onLate が呼ばれること');
  assert.ok(Date.now() - started < 300, '締め切りで切り上げること');
  // 遅れたレーンも捨てずに走り切る（価格キャッシュへ回せる）
  assert.deepEqual(await late[0], { ok: true, value: [{ asin: 'A' }] });
});

test('締め切り前に失敗したレーンは従来どおり reject する（握りつぶさない）', async () => {
  await assert.rejects(
    withMarketplaceStageBudget(Promise.reject(new Error('RAKUTEN_DOWN')), 500),
    /RAKUTEN_DOWN/u
  );
});

test('締め切り後に失敗したレーンで unhandled rejection を出さない', async () => {
  const late = [];
  const result = await withMarketplaceStageBudget(
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error('YAHOO_TIMEOUT')), 80)),
    20,
    { onLate: (settled) => late.push(settled) }
  );
  assert.deepEqual(result, []);
  const settled = await late[0];
  assert.equal(settled.ok, false);
  assert.match(String(settled.error?.message || ''), /YAHOO_TIMEOUT/u);
});

test('締め切りは env で上書きでき、極端な値は既定へ戻す', () => {
  assert.equal(marketplaceStageBudgetMs({}), MARKETPLACE_STAGE_BUDGET_MS);
  assert.equal(marketplaceStageBudgetMs({ MARKETPLACE_STAGE_BUDGET_MS: '3000' }), 3000);
  assert.equal(marketplaceStageBudgetMs({ MARKETPLACE_STAGE_BUDGET_MS: '10' }), MARKETPLACE_STAGE_BUDGET_MS);
  assert.equal(marketplaceStageBudgetMs({ MARKETPLACE_STAGE_BUDGET_MS: '999999' }), MARKETPLACE_STAGE_BUDGET_MS);
  assert.equal(marketplaceStageBudgetMs({ MARKETPLACE_STAGE_BUDGET_MS: 'abc' }), MARKETPLACE_STAGE_BUDGET_MS);
});

test('Yahoo! カタログ検索は候補2通りまでに抑え、待ち行列も段階の締め切りまでに合わせる', () => {
  const source = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(source, /queueTimeoutMs: yahooQueueTimeoutMs\(\)/u);
  assert.match(source, /const yahooQueueTimeoutMs = \(\) => Math\.max\(500, stageDeadlineAt - Date\.now\(\)\)/u);
  assert.match(source, /\{ maxVariants: 2, deadlineAt: stageDeadlineAt, nextVariantCostMs: yahooFollowUpCostMs \}/u);
});

// 2026-10-03 検索時間 2 秒短縮（実測: 対策前 3 回とも段階が 4500ms で、ZOZOTOWN 公式店レーンが 3/3、
// Yahoo! カタログが 2/3 締め切りに遅れていた）。追加の Yahoo! 呼び出しは締め切りに収まる時だけ行う。
test('Yahoo! の 2 候補目は「待ち間隔＋応答時間」が締め切りに収まる時だけ試す', async () => {
  const calls = [];
  const searcher = async (keywords) => { calls.push(keywords); return []; };
  // 収まらない: 1 候補目だけ
  await searchMarketplaceApiWithFallback(searcher, ['a', 'b'], '', '', { maxVariants: 2, deadlineAt: Date.now() + 1000, nextVariantCostMs: 3600 });
  assert.deepEqual(calls, ['a']);
  // 収まる: 2 候補目も試す
  calls.length = 0;
  await searchMarketplaceApiWithFallback(searcher, ['a', 'b'], '', '', { maxVariants: 2, deadlineAt: Date.now() + 10000, nextVariantCostMs: 3600 });
  assert.deepEqual(calls, ['a', 'b']);
  // 締め切り指定なし: 従来どおり
  calls.length = 0;
  await searchMarketplaceApiWithFallback(searcher, ['a', 'b'], '', '', { maxVariants: 2 });
  assert.deepEqual(calls, ['a', 'b']);
});

test('公式店の Yahoo! レーンは締め切りに収まらない時は呼ばず SKIPPED にする（裏にも回さない）', () => {
  const source = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(source, /if \(Date\.now\(\) \+ yahooFollowUpCostMs > stageDeadlineAt\) \{ skippedLanes\.push\(store\.key\); return \[\]; \}/u);
  assert.match(source, /const yahooFollowUpCostMs = YAHOO_REQUEST_INTERVAL_MS \+ 1500/u);
  assert.match(source, /summarizeMarketplaceSearchOutcomes\(\s*marketplaceSearches, outcomes, acceptedCounts, \{ lateLanes, skippedLanes \}/u);
});

test('締め切りに遅れたレーン・呼ばなかったレーンは 0 件と区別して返す', () => {
  const searches = [{ key: 'rakuten_catalog_connected' }, { key: 'yahoo_catalog_connected' }, { key: 'zozotown_official_store' }, { key: 'hands_official_store' }];
  const summary = summarizeMarketplaceSearchOutcomes(searches, [
    { status: 'fulfilled', value: [{ product_name: 'A' }] },
    { status: 'fulfilled', value: [] },
    { status: 'fulfilled', value: [] },
    { status: 'fulfilled', value: [] }
  ], [1, 0, 0, 0], { lateLanes: ['yahoo_catalog_connected'], skippedLanes: ['zozotown_official_store'] });
  assert.deepEqual(summary.sources.map((s) => s.status), ['AVAILABLE', 'LATE', 'SKIPPED', 'NO_RESULTS']);
  assert.equal(summary.any_request_succeeded, true);
  const allLate = summarizeMarketplaceSearchOutcomes(searches.slice(1, 2), [{ status: 'fulfilled', value: [] }], [0], { lateLanes: ['yahoo_catalog_connected'] });
  assert.equal(allLate.any_request_succeeded, false, '遅れただけのレーンを「成功」に数えない');
  assert.equal(allLate.all_requests_failed, false, '遅れただけのレーンを「失敗」にも数えない');
});

test('モール検索は締め切り付きで待ち、遅れたレーンを記録する', () => {
  const source = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(source, /withMarketplaceStageBudget\(item\.run, stageRemainingMs/u);
  assert.match(source, /const stageRemainingMs = Math\.max\(0, stageDeadlineAt - Date\.now\(\)\)/u);
  assert.match(source, /SEARCH_MARKETPLACE_STAGE_MS/u);
  // 検索文をログに載せない（プライバシー境界）
  const log = source.slice(source.indexOf('SEARCH_MARKETPLACE_STAGE_MS'), source.indexOf('SEARCH_MARKETPLACE_STAGE_MS') + 400);
  assert.ok(!/input\.query|submittedQuery|expandedQuery/u.test(log));
});

// 2026-10-03 大隆さん指示「あと 2 秒短くして」: モール検索は AI 変換（GAS・D1 と並列、約 2 秒）の完了を待たずに
// 展開後の検索語で先に始め、AI が検索語を変えた時だけ追加レーンを足す。
test('モール検索は AI 変換の完了を待たずに始まり、AI が語を変えた時だけ追加レーンを足す', () => {
  const source = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  const lanesStart = source.indexOf("key: 'rakuten_catalog_connected'");
  const lookupStart = source.indexOf("callGas(env, 'KNOWLEDGE', { request: { query: input.query, consent: true } })");
  assert.ok(lanesStart > 0 && lookupStart > 0 && lanesStart < lookupStart, 'レーンの作成が GAS・D1・AI 変換の await より前にある');
  assert.match(source, /if \(shouldSearchMarketplaces && queryWasAiRefined\) \{/u);
  assert.match(source, /key: 'rakuten_catalog_refined'/u);
  assert.match(source, /key: 'yahoo_catalog_refined'/u);
  // Yahoo! の追加レーンも締め切りに収まる時だけ（1 件ずつ 2.1 秒の直列待ちは変えない）
  assert.match(source, /skippedLanes\.push\('yahoo_catalog_refined'\)/u);
  // 締め切りは起点から 1 つ（レーンを作った時刻 + 予算）
  assert.match(source, /const stageDeadlineAt = stageStartedAt \+ stageBudgetMs/u);
});

test('AI 変換と GAS の待ち時間は 1.2 秒に詰める', () => {
  const intent = readFileSync(new URL('../src/ai-chat-intent.mjs', import.meta.url), 'utf8');
  assert.match(intent, /timeoutMs: 1200,\n\s*totalBudgetMs: 1200,/u);
  const source = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(source, /action === 'KNOWLEDGE' \? 1200/u);
});
