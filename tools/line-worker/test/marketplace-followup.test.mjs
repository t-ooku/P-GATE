// 2026-10-03 大隆さん指示「Yahoo!・ZOZO 以外も、間に合わなかったら『さらに見る』で後から出す」
// 「できるだけ間に合うようにして欲しい」。本検索の締め切りに間に合わなかったモールを、続きトークンで取り直す。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MARKETPLACE_FOLLOWUP_BUDGET_MS, MARKETPLACE_FOLLOWUP_TOKEN_TTL_SECONDS, MARKETPLACE_STAGE_BUDGET_MS,
  createTrackToken, followupLaneKeys, startMarketplaceLanes, validateKnowledgeRequest, verifyTrackToken
} from '../src/index.mjs';

const source = () => readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');

test('取り直すレーンは LATE・SKIPPED・REQUEST_FAILED だけ。AI 語のレーンは本体のレーン名に直し、重複は 1 つ', () => {
  const keys = followupLaneKeys({ sources: [
    { source: 'rakuten_catalog_connected', status: 'AVAILABLE' },
    { source: 'yahoo_catalog_connected', status: 'LATE' },
    { source: 'yahoo_catalog_refined', status: 'SKIPPED' },
    { source: 'zozotown_official_store', status: 'SKIPPED' },
    { source: 'hands_official_store', status: 'REQUEST_FAILED' },
    { source: 'matsukiyo_official_store', status: 'NO_RESULTS' },
    { source: 'rakuten_catalog_refined', status: 'LATE' }
  ] });
  assert.deepEqual(keys, ['yahoo_catalog_connected', 'zozotown_official_store', 'hands_official_store', 'rakuten_catalog_connected']);
  assert.deepEqual(followupLaneKeys(null), []);
});

test('続きは名前のレーンだけを作る（API 未設定なら作らない）', () => {
  const env = {};
  const { marketplaceSearches } = startMarketplaceLanes({ env, requestId: 'r', query: 'x', stageDeadlineAt: Date.now() + 1000, skippedLanes: [], only: new Set(['zozotown_official_store']) });
  assert.deepEqual(marketplaceSearches, [], '楽天・Yahoo! の鍵が無い環境ではレーンを作らない');
});

test('本検索の締め切りは 3.5 秒、続きは 6 秒・トークンは 3 分', () => {
  assert.equal(MARKETPLACE_STAGE_BUDGET_MS, 3500);
  assert.equal(MARKETPLACE_FOLLOWUP_BUDGET_MS, 6000);
  assert.equal(MARKETPLACE_FOLLOWUP_TOKEN_TTL_SECONDS, 180);
});

test('続きトークンは本検索の応答に付き、検索文そのものは入れない（ハッシュとレーン名だけ）', async () => {
  const code = source();
  assert.match(code, /result\.marketplace_followup = \{\s*lanes: followupLanes,\s*token: await createTrackToken\(\{\s*t: 'SEARCH_FOLLOWUP', u: await hashUser\(input\.session_id\), q: await hashUser\(expandedQuery\.query\), l: followupLanes,/u);
  const block = code.slice(code.indexOf("t: 'SEARCH_FOLLOWUP'"), code.indexOf("t: 'SEARCH_FOLLOWUP'") + 300);
  assert.ok(!/query: |input\.query,|submittedQuery/u.test(block));
  const token = await createTrackToken({ t: 'SEARCH_FOLLOWUP', u: 'u', q: 'q', l: ['yahoo_catalog_connected'], exp: Math.floor(Date.now() / 1000) + 60 }, 'secret');
  assert.deepEqual((await verifyTrackToken(token, 'secret')).l, ['yahoo_catalog_connected']);
});

test('続きはボット確認・トークン無し枠の前で受け、トークンが合わなければ 4xx で断る', () => {
  const code = source();
  const followup = code.indexOf('if (validatedInput.followup_token && options.internalQa !== true) {');
  const turnstile = code.indexOf('if (validatedInput.turnstile_token) {');
  assert.ok(followup > 0 && followup < turnstile);
  assert.match(code, /payload\.t !== 'SEARCH_FOLLOWUP' \|\| payload\.u !== sessionHash \|\| payload\.q !== await hashUser\(expandedQuery\.query\)/u);
  assert.match(code, /'FOLLOWUP_TOKEN_INVALID'/u);
  const input = validateKnowledgeRequest({ query: 'ステンレス 水筒', session_id: 'abcdefghijklmnop', processing_notice_shown: true, followup_token: ' tok.en ' });
  assert.equal(input.followup_token, 'tok.en');
});

test('画面: 間に合わなかったモールがある時だけボタンを出し、届いた商品は末尾に足す（既存のカードは動かさない）', () => {
  const ui = readFileSync(new URL('../public/unified-results-ui.mjs', import.meta.url), 'utf8');
  assert.match(ui, /hoshilu:search-followup/u);
  assert.match(ui, /hoshilu:results-followup/u);
  assert.match(ui, /\{ once: true \}/u, 'ボタンは 1 回だけ');
  assert.match(ui, /known\.has\(item\.url\)/u, '同じ URL は足さない');
  assert.match(ui, /candidate_index \+ offset/u, '候補の番号は後ろへずらす');
  for (const mall of ['楽天市場', 'Yahoo!ショッピング', 'ZOZOTOWN', 'ハンズ', 'マツキヨ', '@cosme', 'ABC-MART']) assert.ok(ui.includes(mall), mall);
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /marketplace_followup:result\?\.marketplace_followup\|\|null/u);
  assert.match(app, /followup_token:token/u);
  assert.ok(!/turnstile_token:token,[^\n]*followup_token/u.test(app), '続きにはボット確認トークンを付けない');
});

// 2026-10-03 大隆さん指示: 下部固定のボタンを押したら、そのページの一番上へ戻す。
test('下部ナビは押したタブのページ先頭へスクロールする（同じタブをもう一度押した時も）', () => {
  const nav = readFileSync(new URL('../public/tab-nav.mjs', import.meta.url), 'utf8');
  assert.match(nav, /const view = activate\(item\.dataset\.view\);\s*if \(current === view\.id\) window\.scrollTo\(\{ top: 0, behavior: 'smooth' \}\);/u);
});

// 2026-10-04 大隆さん指示: 「○件を末尾に足しました」→「○件を追加表示しました」
test('さらに見るで足した後の文言は「○件を追加表示しました」', () => {
  const ui = readFileSync(new URL('../public/unified-results-ui.mjs', import.meta.url), 'utf8');
  assert.match(ui, /followupAdded: \(n\) => `\$\{n\}件を追加表示しました`/u);
  assert.ok(!ui.includes('末尾に足しました'));
});

// 2026-10-04 大隆さん報告「さらに見るボタンが反応してない」: スマホは横スライドなので、足したカードは
// 画面の外に入っていた。足した最初のカードまで列を送る。続きの商品は今見えているカードのすぐ後ろに入れる。
test('さらに見る・結果も見るで足したカードまで列を送る（スマホの横スライドで見えるように）', () => {
  const ui = readFileSync(new URL('../public/unified-results-ui.mjs', import.meta.url), 'utf8');
  assert.match(ui, /export function revealAppended\(list, node\)/u);
  assert.match(ui, /list\.scrollWidth > list\.clientWidth \+ 1/u);
  assert.equal((ui.match(/revealAppended\(list, cards\[0\]\)/gu) || []).length, 2, 'さらに見る と 結果も見る の両方');
  assert.match(ui, /const insertAt = state\.shown;/u);
  // 「さらに見る」を描き直す時に、続きのボタンを消さない
  assert.match(ui, /host\.querySelector\('\.unified-more:not\(\.unified-followup\)'\)\?\.remove\(\)/u);
});
