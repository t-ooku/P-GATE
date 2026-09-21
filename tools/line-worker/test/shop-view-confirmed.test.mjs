// 2026-09-21 主幹指示書「内部テスト・クローラ・bot は経営KPIから除外する。数字が取れない場合は
// 『0』と断定せず、『計測不能』と区別する」への対応。
// shop_viewed はショップページの HTML 配信時にサーバーが記録しており visitor_id/session_id が
// 常に空なので、実際の閲覧者と JS を実行しないクローラを構造的に区別できない。
// ブラウザが実際に描画した閲覧だけを shop_view_confirmed として別に数える。
// shop_viewed の数え方自体は変えない（KPI 定義の変更は ChatGPT 側の判断）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeGrowthEvent } from '../src/growth-events.mjs';
import { recordShopEvent } from '../src/seller-shop.mjs';

const analytics = () => readFileSync(new URL('../public/growth-analytics.mjs', import.meta.url), 'utf8');

test('shop_view_confirmed は受け付ける正規イベントで、visitor/session を保持する', () => {
  const visitor = '4f2b1c8a-0d3e-4a5b-9c6d-7e8f90a1b2c3';
  const session = 'a1b2c3d4-e5f6-4071-8293-a4b5c6d7e8f9';
  const event = normalizeGrowthEvent({ event_type: 'shop_view_confirmed', content: 'demo-shop', visitor_id: visitor, session_id: session });
  assert.equal(event.event_type, 'shop_view_confirmed');
  assert.equal(event.content, 'demo-shop');
  assert.equal(event.visitor_id, visitor);
  assert.equal(event.session_id, session);
});

test('ブラウザ側はショップページでだけ shop_view_confirmed を送る', () => {
  const source = analytics();
  assert.match(source, /\/\^\\\/shop\\\/\(\[A-Za-z0-9_-\]\{1,40\}\)/u);
  assert.match(source, /send\('shop_view_confirmed', \{ content: shopPath\[1\] \}\)/u);
  // 既存の shop_viewed をブラウザから撃ち直さない（二重計上しない）
  assert.ok(!source.includes("send('shop_viewed'"));
});

const captureDb = (sink) => ({
  PRODUCT_DB: {
    prepare(sql) {
      return { bind: (...args) => ({ run: async () => { sink.push({ sql, args }); } }) };
    }
  }
});

test('recordShopEvent は渡された visitor/session をそのまま記録する', async () => {
  const calls = [];
  await recordShopEvent(captureDb(calls), 'shop_followed', 'demo-shop', { visitor_id: 'v-1', session_id: 's-1' });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /visitor_id,session_id/u);
  assert.equal(calls[0].args.at(-2), 'v-1');
  assert.equal(calls[0].args.at(-1), 's-1');
});

test('recordShopEvent は識別子が無ければ空で記録する（0 件と混同しない）', async () => {
  const calls = [];
  await recordShopEvent(captureDb(calls), 'shop_viewed', 'demo-shop', { content: 'view' });
  assert.equal(calls[0].args.at(-2), '');
  assert.equal(calls[0].args.at(-1), '');
});

test('visitor_id 列が無い環境でも従来の列だけで記録に退避する', async () => {
  const calls = [];
  let first = true;
  const env = {
    PRODUCT_DB: {
      prepare(sql) {
        return { bind: (...args) => ({ run: async () => {
          if (first) { first = false; throw new Error('table growth_events has no column named visitor_id'); }
          calls.push({ sql, args });
        } }) };
      }
    }
  };
  await recordShopEvent(env, 'shop_viewed', 'demo-shop', {});
  assert.equal(calls.length, 1);
  assert.ok(!calls[0].sql.includes('visitor_id'));
});
