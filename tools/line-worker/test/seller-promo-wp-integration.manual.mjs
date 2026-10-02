// 手動の統合確認（npm test では走らない）。ローカルの WordPress（PHP 内蔵サーバー＋SQLite 連携）に
// 実際に公開し、GET で確認できることを見る。Worker の SSRF ガードは https・公開ホスト名しか通さないので、
// ここでは https://wp-qa.example.jp を WP_LOCAL_BASE（既定 http://localhost:8080）へ書き換える fetch で繋ぐ。
// 使い方: WP_APP_PASSWORD=... node test/seller-promo-wp-integration.manual.mjs
import { runSellerPromoCycle } from '../src/seller-promo-scheduler.mjs';
import { approveDeliverable, publishDeliverable, saveWordPressConnection } from '../src/seller-promo-publish.mjs';
import { promoDb, promoEnv, fakeGemini, seedQaShop, MONDAY_0605_JST } from './helpers/seller-promo-fixture.mjs';

const local = process.env.WP_LOCAL_BASE || 'http://localhost:8080';
const rewrite = async (url, init) => fetch(String(url).replace('https://wp-qa.example.jp', local), init);
const { db, adapter } = promoDb();
const env = promoEnv(adapter, { SELLER_PROMO_FETCH: rewrite });
const seed = await seedQaShop(env);
db.prepare("UPDATE seller_promo_profiles SET publish_target='WORDPRESS' WHERE seller_key=?").run(seed.sellerKey);
await runSellerPromoCycle(env, MONDAY_0605_JST, { fetchImpl: fakeGemini(seed).fetchImpl });
await saveWordPressConnection(env, { seller_key: seed.sellerKey, site_url: 'https://wp-qa.example.jp', username: process.env.WP_USER || 'hoshilu',
  app_password: process.env.WP_APP_PASSWORD, scope: { category_ids: [Number(process.env.WP_CATEGORY_ID || 1)] } });
const id = db.prepare("SELECT id FROM seller_promo_deliverables WHERE type='ARTICLE'").get().id;
const first = await approveDeliverable(env, id, { actor: 'SELLER', sellerKey: seed.sellerKey, approvedBy: 'SELLER' });
console.log('publish:', first.status, first.external_id, first.published_url);
// 2 回目は同じ投稿の更新（新規を作らない）
const again = await publishDeliverable(env, id, { actor: 'ADMIN' }).catch((e) => ({ status: e.message }));
const check = await (await fetch(`${local}/?rest_route=/wp/v2/posts/${first.external_id}`)).json();
console.log('wordpress:', check.status, check.title?.rendered, 'categories', JSON.stringify(check.categories));
const list = await (await fetch(`${local}/?rest_route=/wp/v2/posts&per_page=100`)).json();
console.log('posts with same slug:', list.filter((p) => p.slug === check.slug).length, 'second publish state:', again.status);
console.log('audit:', db.prepare("SELECT actor||':'||action a FROM seller_promo_audit WHERE target_type='ARTICLE' ORDER BY created_at").all().map((r) => r.a).join(', '));
