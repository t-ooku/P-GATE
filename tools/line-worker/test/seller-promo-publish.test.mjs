import test from 'node:test';
import assert from 'node:assert/strict';
import { runSellerPromoCycle } from '../src/seller-promo-scheduler.mjs';
import {
  approveDeliverable, rejectDeliverable, publishDeliverable, saveWordPressConnection, safeWordPressBase, rakutenGoldZip, crc32,
  markdownToHtml, setAutoPublish
} from '../src/seller-promo-publish.mjs';
import { promoDb, promoEnv, fakeGemini, seedQaShop, MONDAY_0605_JST } from './helpers/seller-promo-fixture.mjs';

async function generated(extra = {}, profile = {}) {
  const { db, adapter } = promoDb();
  const env = promoEnv(adapter, extra);
  const seed = await seedQaShop(env);
  if (profile.publish_target) db.prepare('UPDATE seller_promo_profiles SET publish_target=? WHERE seller_key=?').run(profile.publish_target, seed.sellerKey);
  await runSellerPromoCycle(env, MONDAY_0605_JST, { fetchImpl: fakeGemini(seed).fetchImpl });
  const ids = Object.fromEntries(db.prepare('SELECT type,id FROM seller_promo_deliverables').all().map((r) => [r.type, r.id]));
  return { db, env, seed, ids };
}

function wordpress({ confirm = true, redirect = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), method: init.method, auth: init.headers?.authorization, body: init.body ? JSON.parse(init.body) : null, redirect: init.redirect });
    if (redirect) return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } });
    if (init.method === 'POST') return Response.json({ id: 321, link: 'https://shop.example.jp/?p=321', status: 'publish' }, { status: 201 });
    if (!confirm) return new Response('{}', { status: 500 });
    return Response.json({ id: 321, status: 'publish', link: 'https://shop.example.jp/entrance-storage-guide/' });
  };
  return { fetchImpl, calls };
}

test('承認できるのは QA_PASSED だけ。差し戻しは理由が要り、監査が残る。他店の納品物は触れない', async () => {
  const { db, env, ids } = await generated();
  await assert.rejects(rejectDeliverable(env, ids.SNS, { actor: 'SELLER', sellerKey: 'qa-shop-1', reason: 'BAD' }), /REJECT_REASON_REQUIRED/);
  const rejected = await rejectDeliverable(env, ids.SNS, { actor: 'SELLER', sellerKey: 'qa-shop-1', reason: 'WORDING', note: '硬い' });
  assert.equal(rejected.status, 'REJECTED');
  assert.equal(rejected.rejected_reason, 'WORDING: 硬い');
  await assert.rejects(approveDeliverable(env, ids.SNS, { actor: 'SELLER', sellerKey: 'qa-shop-1' }), /ONLY_QA_PASSED/);
  await assert.rejects(approveDeliverable(env, ids.ARTICLE, { actor: 'SELLER', sellerKey: 'someone-else' }), /DELIVERABLE_NOT_FOUND/);
  // 公開先 NONE: 承認＝原稿納品
  const article = await approveDeliverable(env, ids.ARTICLE, { actor: 'SELLER', sellerKey: 'qa-shop-1', approvedBy: 'SELLER' });
  assert.equal(article.status, 'DELIVERED');
  assert.equal(article.published_target, 'MANUSCRIPT');
  const actions = db.prepare('SELECT actor,action FROM seller_promo_audit WHERE target_type IN (\'ARTICLE\',\'SNS\') ORDER BY created_at').all().map((r) => `${r.actor}:${r.action}`);
  assert.deepEqual(actions.sort(), ['SELLER:DELIVERABLE_APPROVE', 'SELLER:DELIVERABLE_DELIVER', 'SELLER:DELIVERABLE_REJECT'].sort());
});

test('WordPress: 公開→GET で確認→PUBLISHED と URL。確認できなければ CONFIRMING。秘密は平文で残さない', async () => {
  const wp = wordpress();
  const { db, env, ids } = await generated({ SELLER_PROMO_FETCH: wp.fetchImpl }, { publish_target: 'WORDPRESS' });
  // 接続が無いうちは公開に失敗として残る（承認は取り消さない）
  assert.equal((await approveDeliverable(env, ids.ARTICLE, { actor: 'SELLER', sellerKey: 'qa-shop-1' })).status, 'PUBLISH_FAILED');
  await saveWordPressConnection(env, { seller_key: 'qa-shop-1', site_url: 'https://shop.example.jp/', username: 'hoshilu', app_password: 'abcd efgh ijkl mnop qrst uvwx', scope: { category_ids: [7] } });
  const conn = db.prepare('SELECT * FROM seller_promo_connections').get();
  assert.doesNotMatch(JSON.stringify(conn), /abcdefgh|abcd efgh/);
  const published = await publishDeliverable(env, ids.ARTICLE, { actor: 'ADMIN' });
  assert.equal(published.status, 'PUBLISHED');
  assert.equal(published.published_url, 'https://shop.example.jp/entrance-storage-guide/');
  assert.equal(published.external_id, '321');
  const post = wp.calls.find((c) => c.method === 'POST');
  assert.equal(post.url, 'https://shop.example.jp/wp-json/wp/v2/posts');
  assert.equal(post.redirect, 'manual');
  assert.equal(post.body.status, 'publish');
  assert.deepEqual(post.body.categories, [7]);
  assert.match(post.body.content, /<h2>置き場所から考える<\/h2>/);
  assert.equal(post.auth, `Basic ${btoa('hoshilu:abcdefghijklmnopqrstuvwx')}`);
  // 確認が取れない場合
  const wp2 = wordpress({ confirm: false });
  const second = await generated({ SELLER_PROMO_FETCH: wp2.fetchImpl }, { publish_target: 'WORDPRESS' });
  await saveWordPressConnection(second.env, { seller_key: 'qa-shop-1', site_url: 'https://shop.example.jp', username: 'u', app_password: 'abcdefghijklmnopqrst' });
  const confirming = await approveDeliverable(second.env, second.ids.ARTICLE, { actor: 'SELLER', sellerKey: 'qa-shop-1' });
  assert.equal(confirming.status, 'CONFIRMING');
  // 再公開は自分の external_id の投稿の更新になる
  await publishDeliverable(second.env, second.ids.ARTICLE, { actor: 'ADMIN' });
  assert.equal(wp2.calls.filter((c) => c.method === 'POST').at(-1).url, 'https://shop.example.jp/wp-json/wp/v2/posts/321');
});

test('SSRF: https のみ・IP 直指定／localhost／内部名を拒否・trycloudflare は許可リストのときだけ・リダイレクトは追わない', async () => {
  assert.throws(() => safeWordPressBase('http://shop.example.jp'), /HTTPS_REQUIRED/);
  for (const bad of ['https://127.0.0.1', 'https://10.0.0.5/wp', 'https://[::1]/', 'https://localhost', 'https://wp.internal', 'https://intranet', 'https://shop.example.jp:8443'])
    assert.throws(() => safeWordPressBase(bad), /FORBIDDEN|INVALID/, bad);
  assert.throws(() => safeWordPressBase('https://abc-def.trycloudflare.com'), /NOT_ALLOWLISTED/);
  assert.equal(safeWordPressBase('https://abc-def.trycloudflare.com/', { SELLER_PROMO_WP_HOST_ALLOWLIST: 'trycloudflare.com' }), 'https://abc-def.trycloudflare.com');
  assert.equal(safeWordPressBase('https://shop.example.jp/blog/'), 'https://shop.example.jp/blog');
  const wp = wordpress({ redirect: true });
  const { env, ids } = await generated({ SELLER_PROMO_FETCH: wp.fetchImpl }, { publish_target: 'WORDPRESS' });
  await saveWordPressConnection(env, { seller_key: 'qa-shop-1', site_url: 'https://shop.example.jp', username: 'u', app_password: 'abcdefghijklmnopqrst' });
  const failed = await approveDeliverable(env, ids.ARTICLE, { actor: 'SELLER', sellerKey: 'qa-shop-1' });
  assert.equal(failed.status, 'PUBLISH_FAILED');
  assert.equal(wp.calls.length, 1);
});

test('楽天GOLD: 承認後に ZIP（index.html・README）を出し、ダウンロードで DELIVERED', async () => {
  const { env, ids } = await generated({}, { publish_target: 'RAKUTEN_GOLD_DELIVERY' });
  await assert.rejects(rakutenGoldZip(env, ids.ARTICLE, { actor: 'SELLER', sellerKey: 'qa-shop-1' }), /APPROVAL_REQUIRED/);
  const approved = await approveDeliverable(env, ids.ARTICLE, { actor: 'SELLER', sellerKey: 'qa-shop-1' });
  assert.equal(approved.status, 'APPROVED');
  const { zip, filename } = await rakutenGoldZip(env, ids.ARTICLE, { actor: 'SELLER', sellerKey: 'qa-shop-1' });
  assert.equal(filename, 'hoshilu-2026-W41-entrance-storage-guide.zip');
  assert.equal(new DataView(zip.buffer).getUint32(0, true), 0x04034b50);
  const text = new TextDecoder().decode(zip);
  assert.match(text, /index\.html/);
  assert.match(text, /README\.txt/);
  assert.match(text, /<meta charset="UTF-8">/);
  assert.doesNotMatch(text, /<script/);
  assert.match(text, /https:\/\/example\.com\/box\.jpg/);
  assert.equal((await env.PRODUCT_DB.prepare('SELECT status FROM seller_promo_deliverables WHERE id=?1').bind(ids.ARTICLE).all()).results[0].status, 'DELIVERED');
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('自動公開は店本人の切り替えで、監査が残り、次回から検査に通った版を自動で納品する', async () => {
  const { db, adapter } = promoDb();
  const env = promoEnv(adapter);
  const seed = await seedQaShop(env);
  assert.equal(await setAutoPublish(env, seed.sellerKey, true), 'AUTO');
  await runSellerPromoCycle(env, MONDAY_0605_JST, { fetchImpl: fakeGemini(seed).fetchImpl });
  assert.deepEqual(db.prepare('SELECT DISTINCT status FROM seller_promo_deliverables').all().map((r) => r.status), ['DELIVERED']);
  assert.ok(db.prepare("SELECT 1 FROM seller_promo_audit WHERE actor='SELLER' AND action='APPROVAL_MODE_SET'").get());
  assert.ok(db.prepare("SELECT 1 FROM seller_promo_audit WHERE actor='SYSTEM' AND action='DELIVERABLE_APPROVE'").get());
});

test('Markdown は HTML をエスケープする', () => {
  assert.equal(markdownToHtml('<script>x</script> **太字**\n\n- a\n- b'), '<p>&lt;script&gt;x&lt;/script&gt; <strong>太字</strong></p>\n<ul><li>a</li><li>b</li></ul>');
});
