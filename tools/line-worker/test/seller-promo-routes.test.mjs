import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSellerPromoRoutes } from '../src/seller-promo-routes.mjs';
import { sellerPageResponse } from '../src/seller-page.mjs';
import { publicPromoPlans, ensurePricesAllowed, ensurePromoPrices, PROMO_PAID_PLANS } from '../src/seller-promo-billing.mjs';
import { createMonthlyReport, previousMonthKey, monthlyReportDue } from '../src/seller-promo-report.mjs';
import { readPromoProfile } from '../src/seller-promo-store.mjs';
import { promoDb, promoEnv, fakeGemini, MONDAY_0605_JST } from './helpers/seller-promo-fixture.mjs';

const ORIGIN = 'https://hoshilu.app';
function call(env, path, { method = 'GET', body, deps = {}, origin = ORIGIN } = {}) {
  const init = { method, headers: origin ? { origin } : {} };
  if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
  return handleSellerPromoRoutes(new Request(`${ORIGIN}${path}`, init), env, deps);
}
const admin = { authorize: async () => ({ mode: 'bearer' }), now: () => MONDAY_0605_JST };

test('runbook の流れ: 店の登録→商品 CSV→疑問→手動起動→一覧→契約者が承認', async () => {
  const { db, adapter } = promoDb();
  const env = promoEnv(adapter);
  assert.equal((await call(env, '/api/admin/seller-promo/profiles', { method: 'POST', body: {} })).status, 401);
  const badCategory = await call(env, '/api/admin/seller-promo/profiles', { method: 'POST', body: { seller_key: 'qa-shop-1', categories: ['健康食品'] }, deps: admin });
  assert.equal(badCategory.status, 400);
  assert.equal((await badCategory.json()).error, 'CATEGORY_NOT_ALLOWED');
  const profile = await call(env, '/api/admin/seller-promo/profiles', { method: 'POST', deps: admin,
    body: { seller_key: 'qa-shop-1', display_name: 'QA雑貨店', categories: ['生活雑貨'], plan: 'LIGHT', qa: true, notify_email: 'owner@example.com' } });
  const profileBody = await profile.json();
  assert.equal(profileBody.profile.notify_email_set, true);
  assert.equal(profileBody.profile.notify_email, undefined);
  const csv = '商品管理番号（商品URL）,商品名,販売価格\nbox-1,玄関収納ボックス,2980\n';
  const imported = await (await call(env, '/api/admin/seller-promo/products/import', { method: 'POST', deps: admin, body: { seller_key: 'qa-shop-1', csv } })).json();
  assert.deepEqual([imported.received, imported.imported], [1, 1]);
  const questions = await (await call(env, '/api/admin/seller-promo/questions', { method: 'POST', deps: admin,
    body: { seller_key: 'qa-shop-1', items: [{ source: 'STORE_PASTE', text: '玄関に置けるか', product_ref: 'box-1' }] } })).json();
  assert.equal(questions.added, 1);
  const productId = db.prepare('SELECT id FROM seller_promo_products').get().id;
  const questionId = db.prepare('SELECT id FROM seller_promo_questions').get().id;
  const ai = fakeGemini({ productId, questionId });
  // kill switch OFF では手動起動も止まる
  assert.equal((await call({ ...env, SELLER_PROMO_ENABLED: 'false' }, '/api/admin/seller-promo/run', { method: 'POST', deps: admin, body: { seller_key: 'qa-shop-1' } })).status, 503);
  assert.equal((await call(env, '/api/admin/seller-promo/run', { method: 'POST', deps: admin, body: { seller_key: 'qa-shop-1', week_key: 'W41' } })).status, 400);
  const run = await (await call(env, '/api/admin/seller-promo/run', { method: 'POST', deps: { ...admin, fetchImpl: ai.fetchImpl }, body: { seller_key: 'qa-shop-1' } })).json();
  assert.equal(run.result.status, 'DONE');
  assert.equal(run.job.week_key, '2026-W41');
  const listed = await (await call(env, '/api/admin/seller-promo/deliverables?seller_key=qa-shop-1&week_key=2026-W41', { deps: admin })).json();
  assert.equal(listed.deliverables.length, 3);
  const usage = await (await call(env, '/api/admin/seller-promo/usage?month=2026-10', { deps: admin })).json();
  assert.equal(usage.usage[0].calls, 3);
  // 契約者側: seller_key はセッションから取る
  const seller = { readSeller: async () => ({ seller_key: 'qa-shop-1' }), now: () => MONDAY_0605_JST };
  const mine = await (await call(env, '/api/seller-promo/deliverables', { deps: seller })).json();
  assert.equal(mine.enrolled, true);
  assert.equal(mine.deliverables.length, 3);
  assert.equal(mine.deliverables[0].qa.model, undefined);
  const article = mine.deliverables.find((d) => d.type === 'ARTICLE');
  assert.equal((await call(env, `/api/seller-promo/deliverables/${article.id}/approve`, { method: 'POST', body: {}, deps: seller, origin: 'https://evil.example' })).status, 403);
  const approved = await (await call(env, `/api/seller-promo/deliverables/${article.id}/approve`, { method: 'POST', body: {}, deps: seller })).json();
  assert.equal(approved.deliverable.status, 'DELIVERED');
  const other = { readSeller: async () => ({ seller_key: 'other-shop' }) };
  assert.equal((await call(env, `/api/seller-promo/deliverables/${article.id}/approve`, { method: 'POST', body: {}, deps: other })).status, 404);
  assert.equal((await call(env, '/api/seller-promo/deliverables', { deps: { readSeller: async () => null } })).status, 401);
});

test('SELLER_PROMO_ENABLED=false では契約者 API・タブを出さず、料金（9,800／19,800）はどこにも出ない', async () => {
  const { adapter } = promoDb();
  const off = promoEnv(adapter, { SELLER_PROMO_ENABLED: 'false' });
  const response = await call(off, '/api/seller-promo/deliverables', { deps: { readSeller: async () => ({ seller_key: 'x-shop' }) } });
  assert.equal(response.status, 404);
  const html = await (await sellerPageResponse({ SELLER_PROMO_ENABLED: 'false' }, { account: 'A', tenants: ['itg'], plan: 'SELLER' })).text();
  assert.doesNotMatch(html, /今週のサポート|seller-promo\.js/);
  const on = await (await sellerPageResponse({ SELLER_PROMO_ENABLED: 'true' }, { account: 'A', tenants: ['itg'], plan: 'SELLER' })).text();
  assert.match(on, /今週のサポート/);
  assert.match(on, /seller-promo\.js/);
  for (const text of [html, on]) assert.doesNotMatch(text.normalize('NFKC'), /9,?800|19,?800/);
  assert.deepEqual(publicPromoPlans({}), { enabled: false, plans: [] });
  assert.equal(publicPromoPlans({ SELLER_PROMO_PLANS_ENABLED: 'true' }).plans.length, 2);
  const { readFileSync } = await import('node:fs');
  const client = readFileSync(new URL('../public/seller-promo.js', import.meta.url), 'utf8');
  assert.doesNotMatch(client, /9,?800|19,?800|\.innerHTML|insertAdjacentHTML/);
});

test('Stripe Price 作成は OK② の後だけ。lookup_key で冪等に、税込・JPY・月次で作る', async () => {
  assert.equal(ensurePricesAllowed({}, { confirm: 'CREATE_PRICES' }), 'STRIPE_PRICES_NOT_APPROVED');
  assert.equal(ensurePricesAllowed({ SELLER_PROMO_STRIPE_PRICES_APPROVED: 'true' }, {}), 'CONFIRM_REQUIRED');
  const calls = [];
  const created = new Map();
  const env = {
    STRIPE_SECRET_KEY: 'sk_test_0123456789abcdefABCDEF', SELLER_PROMO_STRIPE_PRICES_APPROVED: 'true',
    STRIPE_FETCH: async (url, init) => {
      const u = new URL(url);
      const form = new URLSearchParams(init.body || '');
      calls.push({ path: u.pathname, method: init.method, idem: init.headers['idempotency-key'] });
      if (init.method === 'GET') {
        const key = u.searchParams.get('lookup_keys[0]');
        return Response.json({ data: created.has(key) ? [created.get(key)] : [] });
      }
      if (u.pathname === '/v1/products') return Response.json({ id: `prod_${form.get('metadata[plan]')}` });
      const price = { id: `price_${form.get('lookup_key')}`, active: true, currency: form.get('currency'), unit_amount: Number(form.get('unit_amount')),
        recurring: { interval: form.get('recurring[interval]'), interval_count: Number(form.get('recurring[interval_count]')) },
        tax_behavior: form.get('tax_behavior'), lookup_key: form.get('lookup_key'), livemode: false };
      created.set(price.lookup_key, price);
      return Response.json(price);
    }
  };
  assert.equal(ensurePricesAllowed(env, { confirm: 'CREATE_PRICES' }), '');
  const first = await ensurePromoPrices(env);
  assert.equal(first.mode, 'test');
  assert.equal(first.prices.LIGHT.created, true);
  assert.equal(created.get(PROMO_PAID_PLANS.LIGHT.lookup_key).unit_amount, 9800);
  assert.equal(created.get(PROMO_PAID_PLANS.STANDARD.lookup_key).unit_amount, 19800);
  assert.ok(calls.filter((c) => c.method === 'POST').every((c) => c.idem?.startsWith('seller-promo-')));
  const second = await ensurePromoPrices(env);
  assert.equal(second.prices.STANDARD.created, false);
  assert.equal(calls.filter((c) => c.method === 'POST').length, 4);
});

test('月次レポート: 前月分を 1 回だけ作り、取れない数字は「計測不能」、提案に数字を書かない', async () => {
  const { db, adapter } = promoDb();
  const env = promoEnv(adapter, { INTERNAL_MEMBER_IDS: 'staff' });
  await call(env, '/api/admin/seller-promo/profiles', { method: 'POST', deps: admin, body: { seller_key: 'qa-shop-1', categories: ['文具'], qa: true, pilot_id: 'pilot_1' } });
  db.prepare(`INSERT INTO seller_promo_questions(id,seller_key,source,product_ref,text,text_hash,weight,created_at) VALUES('q1','qa-shop-1','STORE_PASTE','','替え芯は3本入りですか','h1',1,?)`).run('2026-09-20T00:00:00Z');
  db.prepare(`INSERT INTO seller_listing_pilot_saves(pilot_id,product_id,member_id,saved_at) VALUES('pilot_1','p','m1','2026-09-10T00:00:00Z'),('pilot_1','p','staff','2026-09-11T00:00:00Z')`).run();
  db.prepare(`INSERT INTO seller_promo_deliverables(id,job_id,seller_key,week_key,type,version,status,payload,qa,approved_at,published_target,published_url,published_at,created_at)
    VALUES('spd_x','j','qa-shop-1','2026-W38','ARTICLE',1,'PUBLISHED','{}','{}','2026-09-16T00:00:00Z','WORDPRESS','https://shop.example.jp/a','2026-09-16T00:00:00Z','2026-09-14T00:00:00Z')`).run();
  const profile = await readPromoProfile(adapter, 'qa-shop-1');
  const now = new Date('2026-09-30T21:05:00Z');
  assert.equal(monthlyReportDue(now), true);
  assert.equal(previousMonthKey(now), '2026-09');
  const first = await createMonthlyReport(env, profile, '2026-09', now);
  assert.equal(first.created, true);
  assert.equal(first.report.published_count, 1);
  assert.equal(first.report.approval_days_avg, 2);
  assert.deepEqual(first.report.published_urls, ['https://shop.example.jp/a']);
  assert.equal(first.report.hoshilu.saves, 1);
  assert.equal(first.report.hoshilu.notifications, '計測不能');
  assert.equal(first.report.hoshilu.referrals, 0);
  assert.equal(first.report.google_traffic, '計測不能');
  assert.equal(first.report.proposals.length, 3);
  assert.ok(first.report.proposals.every((p) => !/[0-9０-９]/u.test(p)));
  assert.equal((await createMonthlyReport(env, profile, '2026-09', now)).created, false);
});

test('/for-sellers-preview（案内メールのリンク先）は公開 LP /for-sellers へ 301 で送る', async () => {
  for (const path of ['/for-sellers-preview', '/for-sellers-preview.html', '/for-sellers-preview/']) {
    const res = await handleSellerPromoRoutes(new Request(`${ORIGIN}${path}`), {}, {});
    assert.equal(res.status, 301, path);
    assert.equal(res.headers.get('location'), `${ORIGIN}/for-sellers`);
  }
});

// 2026-10-03 自社の販促素材 §0（大隆さん決定 b）: 公開 LP に AI販促担当を料金まで載せる。料金は販売 ON のときだけ Worker が差し込む。
test('公開 LP: 販売 ON で「モールの外」の訴求と 3 段の料金を差し込み、JSON-LD・FAQ・特商法・規約も 3 段に揃える', async () => {
  const { readFileSync } = await import('node:fs');
  const { applyPromoPlansToPublicPage, PROMO_LP_MARKERS } = await import('../src/seller-promo-public-pages.mjs');
  const { PROMO_FORBIDDEN_PHRASES } = await import('../src/seller-promo-qa.mjs');
  const read = (name) => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');
  const raw = read('for-sellers.html');
  // 販売 OFF のまま配るファイルには AI販促担当の料金を置かない
  assert.doesNotMatch(raw.normalize('NFKC'), /9,?800|19,?800/u);
  for (const marker of Object.values(PROMO_LP_MARKERS)) assert.equal(raw.split(marker).length - 1, 1, marker);
  const html = applyPromoPlansToPublicPage('/for-sellers', raw);
  const text = html.replace(/<script[\s\S]*?<\/script>/gu, '').replace(/<style>[\s\S]*?<\/style>/gu, '').replace(/<!--[\s\S]*?-->/gu, '').replace(/<[^>]+>/gu, ' ').replace(/&amp;/gu, '&');
  // 2026-10-09 大隆さん指示「まず入り口は1980円」: 第一画面の主役は掲載プラン 月額1,980円。AI販促担当は次の一歩として第一画面に添える。
  assert.match(text, /まずは月額1,980円で、\s*探している人の目の前へ。/u);
  assert.match(text, /販促まで任せるなら、AI販促担当 Light 月額9,800円・Standard 月額19,800円（税込）/u);
  assert.ok(text.indexOf('START WITH ¥1,980') !== -1 && text.indexOf('START WITH ¥1,980') < text.indexOf('なぜ「モールの外」なのか'), '1,980円の説明が AI販促担当の説明より先');
  assert.doesNotMatch(text, /モールの出店は、そのまま。/u, '第一画面は差し替える');
  for (const heading of ['なぜ「モールの外」なのか', 'HOSHILU の中と外、両方で', '毎週届くもの']) {
    assert.ok(text.indexOf(heading) !== -1 && text.indexOf(heading) < text.indexOf('まずは掲載プラン1,980円から。'), `${heading} は料金の前`);
  }
  assert.match(text, /¥1,980/u);
  assert.match(text, /AI販促担当 Light\s*¥9,800/u);
  assert.match(text, /AI販促担当 Standard\s*¥19,800/u);
  assert.match(text, /記事・SNS原稿・画像の制作は含みません/u, '掲載プランは掲載のみのまま');
  assert.match(text, /31日目から月額9,800円（税込）で自動課金/u);
  assert.match(text, /売上、注文、掲載順位は保証しません/u);
  assert.doesNotMatch(text, /料金は月額1,980円だけ/u, '1,980円だけ、と言い切る文を残さない');
  for (const phrase of PROMO_FORBIDDEN_PHRASES) assert.ok(!text.includes(phrase), `禁止表現: ${phrase}`);
  assert.match(html, /data-seller-cta="hero-inquiry"/u);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/u)[1]);
  const service = ld['@graph'].find((n) => n['@type'] === 'Service');
  assert.deepEqual(service.offers.map((o) => o.price), ['1980', '9800', '19800']);
  const faq = ld['@graph'].find((n) => n['@type'] === 'FAQPage').mainEntity;
  assert.ok(faq.some((q) => q.name === 'AI販促担当の料金は？' && /Light 月額9,800円、Standard 月額19,800円/u.test(q.acceptedAnswer.text)));
  assert.ok(!faq.some((q) => /料金は月額1,980円だけ/u.test(q.acceptedAnswer.text)));
  const legal = applyPromoPlansToPublicPage('/legal', read('legal.html'));
  assert.match(legal, /掲載プラン 月額1,980円（税込）。AI販促担当 Light 月額9,800円（税込）、AI販促担当 Standard 月額19,800円（税込）。/u);
  const terms = applyPromoPlansToPublicPage('/terms', read('terms.html'));
  assert.match(terms, /申し込んだプランの月額料金（掲載プラン1,980円・AI販促担当 Light 9,800円・Standard 19,800円、いずれも税込）/u);
  const source = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(source, /\['\/for-sellers','\/legal','\/terms'\]\.includes\(url\.pathname\)&&asset\.ok&&promoPlansEnabled\(env\)/u);
});

test('見出しが分からない CSV は AI が対応表の案を出すだけで取り込まず、人が確認して mapping 付きで再送する', async () => {
  const { db, adapter } = promoDb();
  const env = promoEnv(adapter);
  await call(env, '/api/admin/seller-promo/profiles', { method: 'POST', deps: admin, body: { seller_key: 'qa-shop-1', categories: ['文具'], qa: true } });
  const csv = '品目コード,品目,値段（円）\nA1,ノート,300\n';
  const ai = async () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ external_id: '品目コード', name: '品目', price_jpy: '値段（円）', url: '存在しない列', image_url: '' }) }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 } });
  const proposed = await call(env, '/api/admin/seller-promo/products/import', { method: 'POST', deps: { ...admin, fetchImpl: ai }, body: { seller_key: 'qa-shop-1', csv } });
  assert.equal(proposed.status, 409);
  const body = await proposed.json();
  assert.deepEqual(body.proposal, { external_id: '品目コード', name: '品目', price_jpy: '値段（円）', url: '', image_url: '' });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM seller_promo_products').get().n, 0);
  assert.ok(db.prepare("SELECT 1 FROM seller_promo_audit WHERE action='CSV_MAPPING_PROPOSED'").get());
  const imported = await (await call(env, '/api/admin/seller-promo/products/import', { method: 'POST', deps: admin, body: { seller_key: 'qa-shop-1', csv, mapping: body.proposal } })).json();
  assert.equal(imported.imported, 1);
  assert.deepEqual({ ...db.prepare('SELECT external_id,name,price_jpy FROM seller_promo_products').get() }, { external_id: 'A1', name: 'ノート', price_jpy: 300 });
  // AI を使わない指定・AI 未設定なら従来どおり見出しを返す
  const plain = await call({ ...env, GEMINI_API_KEY: '' }, '/api/admin/seller-promo/products/import', { method: 'POST', deps: admin, body: { seller_key: 'qa-shop-1', csv } });
  assert.equal((await plain.json()).error, 'CSV_MAPPING_REQUIRED');
});
