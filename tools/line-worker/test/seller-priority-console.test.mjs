import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import cryptoModule from 'node:crypto';
import {
  applySellerPriority, changeSellerPriority, sellerPriorityContext
} from '../src/seller-priority-console.mjs';
import { sellerPageResponse } from '../src/seller-page.mjs';
import { rankSellerOffers } from '../src/index.mjs';
import { handleSellerRoutes } from '../src/seller-auth.mjs';

globalThis.crypto ??= cryptoModule.webcrypto;

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const migration of [
    '../migrations/0010_sp_api_listing_sync.sql',
    '../migrations/0011_marketplace_offers.sql',
    '../migrations/0028_seller_login_guard.sql',
    '../migrations/0043_outbound_commerce_events.sql',
    '../migrations/0048_seller_priority_console.sql',
    '../migrations/0067_seller_billing_stripe.sql'
  ]) sqlite.exec(readFileSync(new URL(migration, import.meta.url), 'utf8'));
  const wrap = (statement, values = []) => ({
    bind: (...next) => wrap(statement, next),
    all: async () => ({ results: statement.all(...values) }),
    first: async () => statement.get(...values) || null,
    run: async () => {
      const result = statement.run(...values);
      return { meta: { changes: Number(result.changes || 0), last_row_id: Number(result.lastInsertRowid || 0) } };
    }
  });
  const db = {
    prepare: (sql) => wrap(sqlite.prepare(sql)),
    batch: async (statements) => {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
  return { sqlite, db };
}

const seller = {
  account: 'ITG GROUP', tenants: ['itg', 'itt'], plan: 'PARTNER',
  seller_key: 'seller_key_12345678901234567890'
};

test('全商品ONは検証済みSeller IDを紐付け、監査ログを残す', async () => {
  const { sqlite, db } = database();
  sqlite.prepare(`INSERT INTO marketplace_offers
    (tenant,record_key,asin,marketplace,external_product_id,seller_id,product_url,price,currency,stock_status,active,observed_at,source)
    VALUES('itg','r1','B000000001','AMAZON_JP','p1','SELLER-A','https://amazon.co.jp/dp/B000000001',1000,'JPY','IN_STOCK',1,'2026-08-11T00:00:00Z','partner_feed')`).run();
  sqlite.prepare(`INSERT INTO sp_api_listings
    (tenant,seller_sku,marketplace_id,store_name,merchant_id,asin,sync_id,observed_at)
    VALUES('itg','SKU-1','A1VC38T7YXB528','ITG','SELLER-SP','B000000001','sync-1','2026-08-11T00:00:00Z')`).run();
  const result = await changeSellerPriority({ PRODUCT_DB: db }, seller, {
    action: 'SET_ALL', tenant: 'itg', active: true
  }, '2026-08-11T01:00:00Z');
  assert.equal(result.mapped_seller_ids, 2);
  assert.equal(sqlite.prepare('SELECT active FROM seller_priority_rules').get().active, 1);
  assert.deepEqual(sqlite.prepare('SELECT seller_id FROM seller_priority_memberships ORDER BY seller_id')
    .all().map((row) => row.seller_id), ['SELLER-A', 'SELLER-SP']);
  assert.equal(sqlite.prepare('SELECT action FROM seller_console_audit').get().action, 'PRIORITY_RULE_ENABLED');
});

test('全商品OFFはジャンルやAI推奨を含む店舗の全ルールを停止する', async () => {
  const { sqlite, db } = database();
  await changeSellerPriority({ PRODUCT_DB: db }, seller, {
    action: 'UPSERT_RULE', tenant: 'itg', scope_type: 'CATEGORY', scope_value: 'カラーコンタクト', active: true
  }, '2026-08-11T01:00:00Z');
  await changeSellerPriority({ PRODUCT_DB: db }, seller, {
    action: 'UPSERT_RULE', tenant: 'itg', scope_type: 'AI_RECOMMENDED', active: true
  }, '2026-08-11T01:01:00Z');
  await changeSellerPriority({ PRODUCT_DB: db }, seller, {
    action: 'SET_ALL', tenant: 'itg', active: false
  }, '2026-08-11T01:02:00Z');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM seller_priority_rules WHERE active=1`).get().n, 0);
});

test('他テナントと商品単位操作は拒否する', async () => {
  const { db } = database();
  await assert.rejects(changeSellerPriority({ PRODUCT_DB: db }, seller, {
    action: 'SET_ALL', tenant: 'other', active: true
  }), /SELLER_TENANT_NOT_ALLOWED/);
  await assert.rejects(changeSellerPriority({ PRODUCT_DB: db }, seller, {
    action: 'UPSERT_RULE', tenant: 'itg', scope_type: 'PRODUCT', scope_value: 'SKU-1', active: true
  }), /SELLER_PRIORITY_SCOPE_INVALID/);
});

test('停止したルールの再開日時を更新して先着順を再計算できる', async () => {
  const { sqlite, db } = database();
  await changeSellerPriority({ PRODUCT_DB: db }, seller, {
    action: 'UPSERT_RULE', tenant: 'itg', scope_type: 'BRAND', scope_value: 'HOSHILU', active: true
  }, '2026-08-11T01:00:00Z');
  const ruleId = sqlite.prepare('SELECT rule_id FROM seller_priority_rules').get().rule_id;
  await changeSellerPriority({ PRODUCT_DB: db }, seller, {
    action: 'SET_RULE_STATUS', rule_id: ruleId, active: false
  }, '2026-08-11T02:00:00Z');
  await changeSellerPriority({ PRODUCT_DB: db }, seller, {
    action: 'SET_RULE_STATUS', rule_id: ruleId, active: true
  }, '2026-08-11T03:00:00Z');
  assert.equal(sqlite.prepare('SELECT priority_started_at FROM seller_priority_rules').get().priority_started_at,
    '2026-08-11T03:00:00Z');
});

test('セラー画面は自社クリック・確定消化額・残高だけを表示する', async () => {
  const { sqlite, db } = database();
  sqlite.exec(`
    INSERT INTO marketplace_offers
      (tenant,record_key,asin,marketplace,external_product_id,seller_id,product_url,price,currency,stock_status,active,observed_at,source)
      VALUES('itg','r1','B000000001','AMAZON_JP','p1','SELLER-A','https://amazon.co.jp/dp/B000000001',1000,'JPY','IN_STOCK',1,'2026-08-11T00:00:00Z','partner_feed');
    INSERT INTO outbound_commerce_events
      (event_id,event_type,occurred_at,hoshilu_product_id,source_marketplace,destination_marketplace,seller_id,organic_or_sponsored,search_intent_id,session_id)
      VALUES('own','OUTBOUND_COMMERCE_CLICK',datetime('now'),'HP1','HOSHILU','AMAZON_JP','SELLER-A','SPONSORED','q1','session1'),
            ('other','OUTBOUND_COMMERCE_CLICK',datetime('now'),'HP2','HOSHILU','RAKUTEN_JP','SELLER-B','SPONSORED','q2','session2');
    INSERT INTO seller_billing_wallets
      (seller_key,currency,balance_micros_jpy,reserved_micros_jpy,status,updated_at)
      VALUES('${seller.seller_key}','JPY',10000000000,2000000000,'ACTIVE','2026-08-11T00:00:00Z');
    INSERT INTO seller_qualified_click_charges
      (charge_id,source_event_id,seller_key,tenant,seller_id,hoshilu_product_id,amount_micros_jpy,status,occurred_at,created_at,settled_at)
      VALUES('c1','own','${seller.seller_key}','itg','SELLER-A','HP1',25000000,'SETTLED',datetime('now'),datetime('now'),datetime('now'));
  `);
  const response = await sellerPageResponse({ PRODUCT_DB: db }, seller);
  const html = await response.text();
  assert.match(html, /30日総送客クリック<\/span><strong>1/);
  assert.match(html, /30日消化額<\/span><strong>¥25/);
  assert.match(html, /利用可能残高<\/span><strong>¥8,000/);
  assert.doesNotMatch(html, /RAKUTEN_JP<\/td><td>1/);
  assert.match(html, /with care/);
  assert.match(html, /Find fun/);
  assert.match(html, /全商品で優先出品を開始/);
  assert.doesNotMatch(html, /全商品ON|ルールON・残高待ち/);
  assert.doesNotMatch(html, /有効な優先ルール/);
  assert.match(html, /保存済みの対象指定/);
  assert.match(html, /商品数や表示回数ではありません/);
  assert.match(html, /購入完了を意味しません/);
  assert.match(html, /優先順の基準日時/);
  assert.match(html, /Business<\/span><strong>月額9,800円/);
  assert.match(html, /ジャンル別単価の有効クリック/);
  assert.match(html, /商品数が多いため、商品1件ずつの操作は設けていません/);
});

test('決済未接続時は店舗名と開始しない理由を明示し、操作を一つに絞る', async () => {
  const { db } = database();
  await changeSellerPriority({ PRODUCT_DB: db }, seller, {
    action: 'UPSERT_RULE', tenant: 'itg', scope_type: 'CATEGORY', scope_value: 'カラーコンタクト', active: true
  }, '2026-08-11T01:00:00Z');
  const response = await sellerPageResponse({ PRODUCT_DB: db }, seller);
  const html = await response.text();
  assert.match(html, /決済・チャージ機能は接続準備中です/);
  assert.match(html, /with care/);
  assert.match(html, /Amazon店舗 · ITG/);
  assert.match(html, /設定済み・開始待ち/);
  assert.match(html, /この店舗の設定をすべて停止/);
  assert.match(html, /全商品を対象に設定/);
  assert.match(html, /現在有効な設定数です。商品数や表示回数ではありません/);
  assert.match(html, /残高未接続などで優先表示が開始していない場合もあります/);
  assert.doesNotMatch(html, /ルールON・残高待ち|全商品ON|全商品OFF/);
});

test('残高・ルール・Seller IDが揃う優先出品だけを同一商品の購入先先頭へ送る', async () => {
  const { sqlite, db } = database();
  sqlite.exec(`
    INSERT INTO seller_priority_rules
      (rule_id,seller_key,tenant,scope_type,scope_value,active,priority_started_at,created_at,updated_at)
      VALUES('r1','${seller.seller_key}','itg','ALL','*',1,'2026-08-01T00:00:00Z','2026-08-01T00:00:00Z','2026-08-01T00:00:00Z');
    INSERT INTO seller_priority_memberships(seller_key,tenant,seller_id,verified_at)
      VALUES('${seller.seller_key}','itg','SELLER-A','2026-08-01T00:00:00Z');
    INSERT INTO seller_billing_wallets
      (seller_key,currency,balance_micros_jpy,reserved_micros_jpy,status,updated_at)
      VALUES('${seller.seller_key}','JPY',1000000000,0,'ACTIVE','2026-08-01T00:00:00Z');
  `);
  const candidate = { asin: 'B000000001', manufacturer: 'Maker', offers: [
    { tenant: 'itg', seller_id: 'SELLER-B', seller_plan: 'PARTNER', marketplace: 'AMAZON_JP', product_url: 'https://amazon.co.jp/dp/B000000001?m=b', stock_status: 'IN_STOCK' },
    { tenant: 'itg', seller_id: 'SELLER-A', seller_plan: 'LITE', marketplace: 'AMAZON_JP', product_url: 'https://amazon.co.jp/dp/B000000001?m=a', stock_status: 'IN_STOCK' }
  ] };
  const context = await sellerPriorityContext({ PRODUCT_DB: db }, [candidate]);
  const offers = applySellerPriority(candidate, candidate.offers, context);
  assert.equal(offers[1].priority_listing, true);
  assert.equal(rankSellerOffers(offers)[0].seller_id, 'SELLER-A');

  sqlite.prepare(`UPDATE seller_billing_wallets SET balance_micros_jpy=0`).run();
  const unfunded = applySellerPriority(candidate, candidate.offers,
    await sellerPriorityContext({ PRODUCT_DB: db }, [candidate]));
  assert.equal(unfunded.some((offer) => offer.priority_listing === true), false);
});

test('店舗が欠けた旧オファーはSeller IDが複数店舗に跨る場合に優先扱いしない', () => {
  const rule = {
    scope_type: 'ALL', scope_value: '*', priority_started_at: '2026-08-01T00:00:00Z',
    wallet_status: 'ACTIVE', available_micros_jpy: 1
  };
  const context = new Map([
    ['itg\nSELLER-A', [rule]],
    ['itt\nSELLER-A', [rule]]
  ]);
  const [offer] = applySellerPriority({}, [{ seller_id: 'SELLER-A' }], context);
  assert.equal(offer.priority_listing, undefined);
});

test('認証済み同一Originだけが優先出品APIを操作できる', async () => {
  const { sqlite, db } = database();
  const env = {
    PRODUCT_DB: db,
    SELLER_AUTH_ID: 'seller@example.com',
    SELLER_AUTH_PASSWORD: 'seller-password-123',
    AUTH_SESSION_SECRET: 's'.repeat(64),
    SELLER_ALLOWED_TENANTS: 'itg',
    SELLER_ACCOUNT_NAME: 'ITG GROUP',
    SELLER_PLAN: 'PARTNER'
  };
  const login = await handleSellerRoutes(new Request('https://hoshilu.app/api/seller/login', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
    body: JSON.stringify({ id: env.SELLER_AUTH_ID, password: env.SELLER_AUTH_PASSWORD })
  }), env);
  const cookie = login.headers.get('set-cookie').match(/__Host-hoshilu_seller_session=([^;]+)/)[1];
  const update = await handleSellerRoutes(new Request('https://hoshilu.app/api/seller/priority-rules', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app', cookie: `__Host-hoshilu_seller_session=${cookie}` },
    body: JSON.stringify({ action: 'SET_ALL', tenant: 'itg', active: true })
  }), env);
  assert.equal(update.status, 200);
  assert.equal((await update.json()).ok, true);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM seller_priority_rules`).get().n, 1);

  const blocked = await handleSellerRoutes(new Request('https://hoshilu.app/api/seller/priority-rules', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie: `__Host-hoshilu_seller_session=${cookie}` },
    body: JSON.stringify({ action: 'SET_ALL', tenant: 'itg', active: false })
  }), env);
  assert.equal(blocked.status, 403);
});
