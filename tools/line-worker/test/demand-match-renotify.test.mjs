// 2026-09-21 指示書 ⑲「再通知の経路確認」。
// 探し中需要が満たされたときの再通知は、WEB（アプリ内）・LINE・メールの3経路で届く。
// WEB の通知パネルがリンクを落としていたため本人が商品へ進めなかった。その穴を塞ぐ。
// 許すのは HOSHILU 自身が組み立てた URL だけ（外部 URL を通知に載せない）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeDemandMatchResultUrl } from '../src/mywatch-routes.mjs';
import { SHOP_DEMAND_EVENT_TYPE, demandResultUrl } from '../src/shop-demand.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('署名付きの Seller 商品ページは同一オリジンの相対URLで返す', () => {
  assert.equal(
    safeDemandMatchResultUrl('https://hoshilu.app/shop/itg-store/product/B0ABCDEFGH?dm=abc.def'),
    '/shop/itg-store/product/B0ABCDEFGH?dm=abc.def'
  );
});

test('横断検索の結果URLも通す', () => {
  const url = demandResultUrl('黒 本革 トート');
  assert.equal(safeDemandMatchResultUrl(url), url.replace('https://hoshilu.app', ''));
});

test('外部・別ホスト・細工された URL は通さない', () => {
  for (const bad of [
    'https://example.com/shop/a/product/B0ABCDEFGH?dm=x',
    'http://hoshilu.app/shop/a/product/B0ABCDEFGH?dm=x',
    'https://user:pass@hoshilu.app/shop/a/product/B0ABCDEFGH?dm=x',
    'https://hoshilu.app.evil.example/?shop_search=a#tab-shops',
    'https://hoshilu.app/shop/a/product/B0ABCDEFGH?dm=x&next=https://evil.example',
    'https://hoshilu.app/admin?dm=x',
    'https://hoshilu.app/?shop_search=a#tab-admin',
    'javascript:alert(1)',
    '',
    null
  ]) {
    assert.equal(safeDemandMatchResultUrl(bad), '', String(bad));
  }
});

test('ASIN・slug の形が違えば通さない', () => {
  assert.equal(safeDemandMatchResultUrl('https://hoshilu.app/shop/itg/product/notanasin?dm=x'), '');
  assert.equal(safeDemandMatchResultUrl('https://hoshilu.app/shop/ITG/product/B0ABCDEFGH?dm=x'), '');
});

test('長すぎるトークン・検索語は通さない', () => {
  assert.equal(safeDemandMatchResultUrl(`https://hoshilu.app/shop/itg/product/B0ABCDEFGH?dm=${'a'.repeat(401)}`), '');
  assert.equal(safeDemandMatchResultUrl(`https://hoshilu.app/?shop_search=${'a'.repeat(201)}#tab-shops`), '');
});

test('通知パネルが SHOP_DEMAND_MATCH のリンクを返す', () => {
  const source = read('src/mywatch-routes.mjs');
  // HOSHILU 自身が組み立てた行き先を持つ種類だけ、リンクにする
  assert.match(source, /const HOSHILU_LINK_EVENT_TYPES = new Set\(\[([^\]]*)'SHOP_DEMAND_MATCH'/u);
  assert.match(source, /HOSHILU_LINK_EVENT_TYPES\.has\(String\(row\?\.event_type \|\| ''\)\)\) return safeDemandMatchResultUrl\(row\?\.result_url\)/u);
  assert.equal(SHOP_DEMAND_EVENT_TYPE, 'SHOP_DEMAND_MATCH', '通知側と同じ文字列を使う');
});

test('WEB 通知の一覧に SHOP_DEMAND_MATCH が含まれる（event_type で絞っていない）', () => {
  const source = read('src/mywatch-routes.mjs');
  const list = source.slice(source.indexOf('async function list('), source.indexOf('async function markRead'));
  assert.ok(list.includes("n.channel IN ('WEB','APP')"), 'WEB を読む');
  assert.ok(!/n\.event_type\s*=\s*'INSIGHT_NEW_MATCH'/u.test(list), 'INSIGHT だけに絞っていない');
});

test('LINE・メールは本文に URL を載せている（経路が3つとも生きている）', () => {
  const source = read('src/shop-demand.mjs');
  assert.match(source, /const externalBody = `\$\{body\}\\n\\n商品を見る\\n\$\{resultUrl\}`;/u);
  assert.match(source, /channel IN \('LINE','EMAIL'\) AND verified_at<>''/u, '本人が許可した経路だけ');
});

test('外部配信は SHOP_DEMAND_MATCH を落とさない（INSIGHT だけを止める）', () => {
  const source = read('src/member-notification-delivery.mjs');
  assert.match(source, /event_type<>'INSIGHT_NEW_MATCH' OR EXISTS\(/u);
});

test('再判定は 15 分ごとに回っている', () => {
  const index = read('src/index.mjs');
  assert.match(index, /ctx\.waitUntil\(runShopDemandRematch\(env, scheduledAt\.toISOString\(\)\)/u);
  const worker = read('wrangler.jsonc');
  assert.ok(worker.includes('"1,5,16,20,31,35,46,50 * * * *"'), '再判定と配信のトリガーがある');
});
