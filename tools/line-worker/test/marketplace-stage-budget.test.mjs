// 2026-09-21 大隆さん指示「検索時間を短くしてほしい。平均10秒掛かってる」への対応。
// Yahoo! は 1 リクエストあたり 2.1 秒の全体間隔で直列化されるため、キーワード候補を
// 3 通り試すと待ち時間だけで 4.2 秒、公式店レーンを足すと 6.3 秒が検索の所要時間に
// そのまま乗っていた。モール検索に実時間の締め切りを置き、間に合ったモールの結果で返す。
// 間に合わなかったレーンは捨てずに走り切らせ、価格キャッシュにだけ反映する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MARKETPLACE_STAGE_BUDGET_MS, marketplaceStageBudgetMs, withMarketplaceStageBudget
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

test('Yahoo! カタログ検索は候補2通りまでに抑え、待ち行列も段階予算に合わせる', () => {
  const source = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(source, /queueTimeoutMs: marketplaceStageBudgetMs\(env\)/u);
  assert.match(source, /\{ maxVariants: 2 \}/u);
});

test('モール検索は締め切り付きで待ち、遅れたレーンを記録する', () => {
  const source = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(source, /withMarketplaceStageBudget\(item\.run, stageBudgetMs/u);
  assert.match(source, /SEARCH_MARKETPLACE_STAGE_MS/u);
  // 検索文をログに載せない（プライバシー境界）
  const log = source.slice(source.indexOf('SEARCH_MARKETPLACE_STAGE_MS'), source.indexOf('SEARCH_MARKETPLACE_STAGE_MS') + 400);
  assert.ok(!/input\.query|submittedQuery|expandedQuery/u.test(log));
});
