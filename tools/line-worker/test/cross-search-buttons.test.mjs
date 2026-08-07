import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { socialDiscoverySearchLinks } from '../public/discovery-actions.mjs';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

// 「10モールとSNSを横断して探す」カードのカラーボタンが、ブランド色の付いた
// ボタンとして描画され続けることを固定する回帰テスト。
// 退行の内容: SNSリンクは marketplace ではなく channel を持つのに、
// marketplaceLinks() が data-channel を出力していなかったため
// ai-search-ui.css の [data-channel="..."] 配色が一切当たらず、背景なしの
// 既定リンク＝青文字リンクとして表示されていた。

test('SNS横断検索リンクはブランド配色用のchannelと明示的な操作ラベルを持つ', () => {
  const links = socialDiscoverySearchLinks('丸く光るライト', 'https://hoshilu.app');
  assert.deepEqual(links.map((link) => link.channel), ['instagram', 'x', 'tiktok', 'youtube', 'line']);
  assert.deepEqual(links.map((link) => link.label), [
    'Instagramで探す', 'Xで探す', 'TikTokで探す', 'YouTubeで探す', 'LINEで共有'
  ]);
  // 「Instagram公式」等のアカウント誘導ではなく、検索/共有導線であること。
  assert.equal(links.some((link) => /公式/.test(link.label)), false);
});

test('SNS横断検索リンクは現在の検索語をURLエンコードして各サービスの検索結果へ渡す', () => {
  const query = '韓国っぽい透明のワイヤレスイヤホン';
  const links = socialDiscoverySearchLinks(query, 'https://hoshilu.app');
  const encoded = encodeURIComponent(query);
  const byChannel = Object.fromEntries(links.map((link) => [link.channel, link.url]));
  assert.ok(byChannel.instagram.includes(encoded));
  assert.ok(byChannel.x.includes(encoded));
  assert.ok(byChannel.tiktok.includes(encoded));
  assert.ok(byChannel.youtube.includes(encoded));
  // LINEは共有先としてHOSHILUの検索結果URLを渡す。
  assert.ok(byChannel.line.includes(encodeURIComponent(`https://hoshilu.app/?q=${encoded}`)));
  for (const link of links) {
    assert.match(link.url, /^https:\/\//);
    assert.doesNotMatch(link.url, /^https:\/\/[^/]+\/?$/); // トップページだけのURLにしない
    assert.doesNotMatch(link.url, /javascript:|^#$/);
  }
});

test('marketplaceLinks()はSNSリンクへdata-channelを出力し、ラベルを削らない', async () => {
  const app = await read('app.js');
  assert.match(app, /if\(item\.channel\)link\.dataset\.channel=String\(item\.channel\)/);
  // モールボタンだけが「〜で探す」を落とし、SNSボタンは原文のまま描画する。
  assert.match(app, /item\.channel\?rawLabel:rawLabel\.replace\(\/\(\?:で探す\|で検索\)\$\/u,''\)/);
});

test('ai-search-ui.cssはモール10件とSNS5チャネル全てへブランド配色を定義する', async () => {
  const css = await read('ai-search-ui.css');
  for (const marketplace of [
    'AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP', 'QOO10_JP', 'SHEIN_JP',
    'ZOZOTOWN_JP', 'SHOPLIST_JP', 'MUSINSA_JP', 'BUYMA_JP', 'SNKRDUNK_JP'
  ]) {
    assert.ok(
      css.includes(`.marketplace-search-link[data-marketplace="${marketplace}"]`),
      `missing brand colour for ${marketplace}`
    );
  }
  for (const channel of ['instagram', 'x', 'tiktok', 'youtube', 'line']) {
    assert.ok(
      css.includes(`.marketplace-search-link[data-channel="${channel}"]`),
      `missing brand colour for ${channel}`
    );
  }
  // スマートフォンでのタップ領域を確保する(44px以上)。
  assert.match(css, /\.marketplace-search-link\{min-height:4[4-9]px|min-height:[5-9]\dpx/);
});

test('SEARCH AGENT→DISCOVERY→OFFICIALの3セクションは順に隣接する', async () => {
  const html = await read('index.html');
  // 2026-08-07 指示書 #14: 正式なセクション順は
  // MARKETPLACE COVERAGE(6) -> SEARCH AGENT(7) -> DISCOVERY(8) -> OFFICIAL(9)。
  // 2026-08-07: MARKETPLACE COVERAGE moved up to sit above SALE RADAR, so it
  // is no longer adjacent to SEARCH AGENT. The remaining three stay adjacent.
  const order = ['HOSHILU SEARCH AGENT', 'HOSHILU DISCOVERY', 'HOSHILU OFFICIAL'];
  const positions = order.map((label) => {
    const index = html.indexOf(`<p class="step">${label}</p>`);
    assert.notEqual(index, -1, `missing section: ${label}`);
    return index;
  });
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  // この4つの間に他セクションの見出し(step)を挟まない。
  const between = html.slice(positions[0], positions[2]);
  const steps = [...between.matchAll(/<p class="step">([^<]+)<\/p>/g)].map((match) => match[1]);
  assert.deepEqual(steps, order.slice(0, 2));
});

test('オフライン時のフォールバックはナビゲーションだけを対象にする', async () => {
  const sw = await read('service-worker.js');
  // CSS/JSの取得失敗にHTMLシェルを返すと、全スタイルが外れて
  // モール名が箇条書き・リンクが青文字になる。navigationのみに限定する。
  assert.match(sw, /event\.request\.mode === 'navigate'/);
  assert.match(sw, /ignoreSearch: true/);
});
