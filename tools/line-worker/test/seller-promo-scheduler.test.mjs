import test from 'node:test';
import assert from 'node:assert/strict';
import { runSellerPromoCycle, runPromoManually, promoDue, promoProfileEligible, promoBudgetState } from '../src/seller-promo-scheduler.mjs';
import { estimateCostJpy, pickFocusProducts, buildPromoPrompt } from '../src/seller-promo-generate.mjs';
import { promoDb, promoEnv, fakeGemini, seedQaShop, articlePayload, longText, MONDAY_0605_JST } from './helpers/seller-promo-fixture.mjs';

test('QA店舗: 月曜 06:00 JST のサイクルで 取り込み→生成→検査 が通り、原価が記録される', async () => {
  const { db, adapter } = promoDb();
  const env = promoEnv(adapter);
  const seed = await seedQaShop(env);
  const ai = fakeGemini(seed);
  const outcome = await runSellerPromoCycle(env, MONDAY_0605_JST, { fetchImpl: ai.fetchImpl });
  assert.equal(outcome.week_key, '2026-W41');
  assert.equal(outcome.ran, 1);
  assert.equal(outcome.results[0].status, 'DONE');
  const rows = db.prepare('SELECT type,version,status FROM seller_promo_deliverables ORDER BY type').all().map((r) => ({ ...r }));
  assert.deepEqual(rows, [
    { type: 'ARTICLE', version: 1, status: 'QA_PASSED' },
    { type: 'IMPROVEMENT', version: 1, status: 'QA_PASSED' },
    { type: 'SNS', version: 1, status: 'QA_PASSED' }
  ]);
  const sns = JSON.parse(db.prepare("SELECT payload FROM seller_promo_deliverables WHERE type='SNS'").get().payload);
  assert.equal(sns.posts.length, 2);
  const usage = db.prepare('SELECT COUNT(*) n, SUM(input_tokens) i, SUM(output_tokens) o, ROUND(SUM(cost_jpy_est),2) c FROM seller_promo_usage').get();
  assert.equal(usage.n, 3);
  assert.equal(usage.i, 3000);
  assert.equal(usage.o, 6000);
  assert.equal(usage.c, Math.round(3 * estimateCostJpy(env, 'gemini', 1000, 2000) * 100) / 100); // 1 回 1.24 円（150円/USD）
  const job = db.prepare('SELECT status,attempt,error FROM seller_promo_jobs').get();
  assert.deepEqual({ ...job }, { status: 'DONE', attempt: 1, error: 'IMAGE_SKIPPED_NO_R2' });
  // 同じ週にもう一度回っても二重に作らない
  const again = await runSellerPromoCycle(env, new Date(MONDAY_0605_JST.getTime() + 5 * 60000), { fetchImpl: ai.fetchImpl });
  assert.equal(again.ran, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM seller_promo_jobs').get().n, 1);
  assert.equal(ai.calls.length, 3);
  // テストは実 API を呼ばない
  assert.ok(ai.calls.every((c) => c.url.startsWith('https://generativelanguage.googleapis.com/')));
});

test('kill switch OFF・時刻外・対象外プランでは何もしない', async () => {
  const { db, adapter } = promoDb();
  const env = promoEnv(adapter);
  const seed = await seedQaShop(env);
  const ai = fakeGemini(seed);
  assert.deepEqual(await runSellerPromoCycle({ ...env, SELLER_PROMO_ENABLED: 'false' }, MONDAY_0605_JST, { fetchImpl: ai.fetchImpl }), { skipped: 'DISABLED' });
  const off = await runSellerPromoCycle(env, new Date('2026-10-04T21:20:00Z'), { fetchImpl: ai.fetchImpl });
  assert.equal(off.created, 0);
  assert.equal(ai.calls.length, 0);
  assert.equal(promoDue({ weekday: 1, hour_jst: 6 }, MONDAY_0605_JST), true);
  assert.equal(promoDue({ weekday: 2, hour_jst: 6 }, MONDAY_0605_JST), false);
  // 販売 OFF の間は QA 店舗・パイロット店だけ。販売 ON では LIGHT/STANDARD だけ。
  const paying = { status: 'ACTIVE', plan: 'LIGHT', qa: false, seller_key: 'ext-1' };
  assert.equal(promoProfileEligible(paying, {}), false);
  assert.equal(promoProfileEligible(paying, { SELLER_PROMO_PILOT_SELLER_KEYS: 'ext-1' }), true);
  assert.equal(promoProfileEligible(paying, { SELLER_PROMO_PLANS_ENABLED: 'true' }), true);
  assert.equal(promoProfileEligible({ ...paying, plan: 'LISTING' }, { SELLER_PROMO_PLANS_ENABLED: 'true' }), false);
  assert.equal(promoProfileEligible({ ...paying, status: 'PAUSED', qa: true }, {}), false);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM seller_promo_jobs').get().n, 0);
});

test('migration 未適用でも cron は静かに戻る', async () => {
  const { adapter } = promoDb([]);
  assert.deepEqual(await runSellerPromoCycle(promoEnv(adapter), MONDAY_0605_JST, { fetchImpl: async () => { throw new Error('no'); } }), { skipped: 'MIGRATION_PENDING' });
});

test('検査で落ちたら理由を添えて作り直し、落ちた版も残す（最大 2 回）', async () => {
  const { db, adapter } = promoDb();
  const env = promoEnv(adapter);
  const seed = await seedQaShop(env);
  const bad = articlePayload(seed.productId, { lead: `${longText(3)}容量は25リットルです。` });
  const ai = fakeGemini({ ...seed, overrides: { ARTICLE: [bad] } });
  await runSellerPromoCycle(env, MONDAY_0605_JST, { fetchImpl: ai.fetchImpl });
  const articles = db.prepare("SELECT version,status,qa FROM seller_promo_deliverables WHERE type='ARTICLE' ORDER BY version").all();
  assert.deepEqual(articles.map((a) => [a.version, a.status]), [[1, 'QA_FAILED'], [2, 'QA_PASSED']]);
  assert.equal(JSON.parse(articles[0].qa).reasons[0].code, 'NUMBER_NOT_IN_PRODUCT_DATA');
  const retryPrompt = ai.calls[1].body.contents[0].parts[0].text;
  assert.match(retryPrompt, /前回の出力は検査で不合格/);
  assert.match(retryPrompt, /数字を一切書かない/);
  // 3 回とも落ちたら QA_FAILED が 3 版、承認できる版は無い
  const { db: db2, adapter: a2 } = promoDb();
  const env2 = promoEnv(a2);
  const seed2 = await seedQaShop(env2);
  const ai2 = fakeGemini({ ...seed2, overrides: { ARTICLE: [bad, bad, bad] } });
  await runSellerPromoCycle(env2, MONDAY_0605_JST, { fetchImpl: ai2.fetchImpl });
  assert.deepEqual(db2.prepare("SELECT status FROM seller_promo_deliverables WHERE type='ARTICLE'").all().map((r) => r.status), ['QA_FAILED', 'QA_FAILED', 'QA_FAILED']);
});

test('AI が 3 回失敗したら FAILED で止めて管理者へ知らせ、force で作り直せる', async () => {
  const { db, adapter } = promoDb();
  const mails = [];
  const env = promoEnv(adapter, {
    RESEND_API_KEY: 're_test', MEMBER_EMAIL_FROM: 'notification@example.com', SELLER_INQUIRY_NOTIFY_EMAIL: 'admin@example.com',
    SELLER_PROMO_FETCH: async (url, init) => { mails.push(JSON.parse(init.body)); return Response.json({ id: 'mail' }); }
  });
  const seed = await seedQaShop(env);
  const failing = fakeGemini({ ...seed, failTimes: 100 });
  for (let i = 0; i < 4; i += 1) await runSellerPromoCycle(env, new Date(MONDAY_0605_JST.getTime() + i * 15 * 60000), { fetchImpl: failing.fetchImpl });
  const job = db.prepare('SELECT status,attempt,error FROM seller_promo_jobs').get();
  assert.deepEqual({ ...job }, { status: 'FAILED', attempt: 3, error: 'SELLER_PROMO_GEMINI_FAILED' });
  assert.equal(mails.filter((m) => m.to[0] === 'admin@example.com').length, 1);
  const ok = fakeGemini(seed);
  const notForced = await runPromoManually(env, { seller_key: seed.sellerKey, week_key: '2026-W41' }, { fetchImpl: ok.fetchImpl, now: MONDAY_0605_JST });
  assert.equal(notForced.result.status, 'ALREADY_FAILED');
  const forced = await runPromoManually(env, { seller_key: seed.sellerKey, week_key: '2026-W41', force: true }, { fetchImpl: ok.fetchImpl, now: MONDAY_0605_JST });
  assert.equal(forced.result.status, 'DONE');
  assert.equal(forced.job.status, 'DONE');
  // 承認待ちのお知らせが店へ届く（本文に料金は書かない）
  const ready = mails.find((m) => m.to[0] === 'owner@example.com');
  assert.match(ready.subject, /今週の分ができました/);
  assert.doesNotMatch(ready.text, /9,?800|19,?800/);
});

test('予算上限を超えた店は SKIPPED、AI を呼ばない', async () => {
  const { db, adapter } = promoDb();
  const env = promoEnv(adapter, { SELLER_PROMO_MONTHLY_TOKEN_CAP_PER_SELLER: '100' });
  const seed = await seedQaShop(env);
  db.prepare(`INSERT INTO seller_promo_usage(id,seller_key,job_id,provider,model,input_tokens,output_tokens,images,cost_jpy_est,created_at)
    VALUES('u1',?,'','gemini','m',80,40,0,1,?)`).run(seed.sellerKey, MONDAY_0605_JST.toISOString());
  assert.equal((await promoBudgetState(env, seed.sellerKey, MONDAY_0605_JST)).over, 'SELLER_TOKEN_CAP');
  const ai = fakeGemini(seed);
  const outcome = await runSellerPromoCycle(env, MONDAY_0605_JST, { fetchImpl: ai.fetchImpl });
  assert.equal(outcome.results[0].status, 'SKIPPED');
  assert.equal(ai.calls.length, 0);
  const costCapped = promoEnv(adapter, { SELLER_PROMO_MONTHLY_COST_CAP_JPY: '1' });
  assert.equal((await promoBudgetState(costCapped, 'other-shop', MONDAY_0605_JST)).over, 'MONTHLY_COST_CAP');
});

test('重点商品は 疑問が多い→未使用→価格が中央値に近い の順。プロンプトは数値の禁止を書く', () => {
  const products = [
    { id: 'a', external_id: 'A', price_jpy: 100, last_featured_week: '2026-W40' },
    { id: 'b', external_id: 'B', price_jpy: 5000, last_featured_week: '' },
    { id: 'c', external_id: 'C', price_jpy: 1000, last_featured_week: '' },
    { id: 'd', external_id: 'D', price_jpy: 900, last_featured_week: '2026-W39' }
  ];
  const picked = pickFocusProducts(products, [{ product_ref: 'D' }, { product_ref: 'd' }], 3).map((p) => p.id);
  assert.deepEqual(picked, ['d', 'c', 'b']);
  const prompt = buildPromoPrompt('ARTICLE', { profile: { display_name: '店', categories: ['文具'], ng_words: [] }, focus: products.slice(0, 1), questions: [], pastTitles: ['前の記事'] });
  assert.match(prompt, /商品データに無い数字は一切書かない/);
  assert.match(prompt, /前の記事/);
});

test('§9: 自動公開でも「要確認」の注記（商品データに無い性質語）が付いた版は承認しない', async () => {
  const { db, adapter } = promoDb();
  const env = promoEnv(adapter);
  const seed = await seedQaShop(env);
  db.prepare("UPDATE seller_promo_profiles SET approval_mode='AUTO'").run();
  const sns = (theme) => ({ theme, variants: { instagram: `${theme}。丈夫な収納ボックスです。`, x: theme, threads: theme },
    image_brief: { product_id: seed.productId, headline: '玄関すっきり', sub: '置き場所から選ぶ収納' } });
  const ai = fakeGemini({ ...seed, overrides: { SNS: [{ posts: [sns('玄関の収納'), sns('置き場所')] }] } });
  await runSellerPromoCycle(env, MONDAY_0605_JST, { fetchImpl: ai.fetchImpl });
  const rows = Object.fromEntries(db.prepare('SELECT type,status,qa FROM seller_promo_deliverables').all().map((r) => [r.type, r]));
  assert.equal(rows.SNS.status, 'QA_PASSED');
  assert.deepEqual(JSON.parse(rows.SNS.qa).notes, [{ code: 'PROPERTY_CLAIM_UNVERIFIED', detail: '丈夫' }, { code: 'PROPERTY_CLAIM_UNVERIFIED', detail: '丈夫' }]);
  assert.notEqual(rows.ARTICLE.status, 'QA_PASSED');
});
