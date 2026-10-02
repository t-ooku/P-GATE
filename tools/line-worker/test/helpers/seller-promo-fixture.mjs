// AI販促担当テスト用: node:sqlite で D1 を模し、Gemini の応答を固定で返す。実 API は呼ばない。
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export const PROMO_MIGRATIONS = ['0081_seller_demand_match', '0089_seller_listing_pilot', '0090_seller_promo_profiles', '0091_seller_promo_jobs', '0092_seller_promo_ops'];

export function promoDb(migrations = PROMO_MIGRATIONS) {
  const db = new DatabaseSync(':memory:');
  for (const name of migrations) db.exec(readFileSync(new URL(`../../migrations/${name}.sql`, import.meta.url), 'utf8'));
  const adapter = {
    prepare(sql) {
      const stmt = db.prepare(sql);
      let values = [];
      return {
        bind(...args) { values = args.map((v) => (v === undefined ? null : v)); return this; },
        async all() { return { success: true, results: stmt.all(...values) }; },
        async run() { const r = stmt.run(...values); return { success: true, meta: { changes: Number(r.changes) } }; }
      };
    },
    async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; }
  };
  return { db, adapter };
}

export const TEST_KEK = 'a'.repeat(64);

export function promoEnv(adapter, extra = {}) {
  return {
    PRODUCT_DB: adapter, SELLER_PROMO_ENABLED: 'true', GEMINI_API_KEY: 'test-gemini-key-000000000000', SELLER_PROMO_KEK: TEST_KEK,
    ...extra
  };
}

const SENTENCE = 'お部屋の雰囲気に合わせて選びやすい落ち着いた色合いで、毎日の片付けが少し楽になります。';
export const longText = (count) => Array.from({ length: count }, () => SENTENCE).join('');

export function articlePayload(productId, overrides = {}) {
  return {
    title: '玄関まわりをすっきり見せる収納の選び方',
    slug: 'entrance-storage-guide',
    lead: longText(3),
    sections: [
      { h2: '置き場所から考える', body_md: longText(11) },
      { h2: '素材と手入れのしやすさ', body_md: longText(11) },
      { h2: 'よくある迷いどころ', body_md: longText(11) }
    ],
    faq: [{ q: '色は選べますか', a: 'お店の商品ページでご確認ください。' }],
    product_refs: [productId],
    image_alt: '玄関に置いた収納ボックス',
    meta_description: '玄関まわりの収納の選び方を、置き場所・素材・手入れの順にまとめました。',
    ...overrides
  };
}

export function snsPayload(productId) {
  const post = (theme) => ({
    theme,
    variants: { instagram: `${theme}のご紹介です。${SENTENCE}`, x: `${theme}。片付けが少し楽になります。`, threads: `${theme}について。${SENTENCE}` },
    image_brief: { product_id: productId, headline: '玄関すっきり', sub: '置き場所から選ぶ収納' }
  });
  return { posts: [post('玄関の収納'), post('手入れのしやすさ')] };
}

export function improvementPayload(productId, questionId) {
  return { product_id: productId, issue: '大きさの比べ方が商品ページに無い', evidence: [questionId], before: '収納ボックスの説明', after_md: '- 置き場所の幅を先に測ってからお選びください', where: 'PRODUCT_PAGE' };
}

// prompt の「作るもの: TYPE」を読んで、型に合う応答を返す。overrides[type] は呼ばれた順に使う配列。
export function fakeGemini({ productId, questionId, overrides = {}, failTimes = 0 } = {}) {
  const calls = [];
  let failures = 0;
  const queues = Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, [...v]]));
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    if (failures < failTimes) { failures += 1; return new Response('{}', { status: 503 }); }
    const prompt = JSON.parse(init.body).contents[0].parts[0].text;
    const type = prompt.match(/作るもの: (ARTICLE|SNS|IMPROVEMENT)/u)[1];
    const queued = queues[type]?.shift();
    const json = queued || (type === 'ARTICLE' ? articlePayload(productId) : type === 'SNS' ? snsPayload(productId) : improvementPayload(productId, questionId));
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 2000, thoughtsTokenCount: 0 } });
  };
  return { fetchImpl, calls };
}

export async function seedQaShop(env, { sellerKey = 'qa-shop-1', plan = 'LIGHT', qa = true } = {}) {
  const { upsertPromoProfile, importPromoProducts, addPromoQuestions } = await import('../../src/seller-promo-store.mjs');
  await upsertPromoProfile(env.PRODUCT_DB, { seller_key: sellerKey, display_name: 'QA雑貨店', plan, categories: ['生活雑貨'], qa, notify_email: 'owner@example.com' });
  await importPromoProducts(env.PRODUCT_DB, sellerKey, 'CSV', [{ external_id: 'box-1', name: '玄関収納ボックス', price_jpy: 2980, url: 'https://item.rakuten.co.jp/qa/box-1/', image_url: 'https://example.com/box.jpg', attrs: { 幅: '40cm' } }]);
  await addPromoQuestions(env.PRODUCT_DB, sellerKey, [{ source: 'STORE_PASTE', text: '玄関に置けるか知りたい', product_ref: 'box-1', weight: 3, period_from: '', period_to: '' }]);
  const product = (await env.PRODUCT_DB.prepare('SELECT id FROM seller_promo_products WHERE seller_key=?1').bind(sellerKey).all()).results[0];
  const question = (await env.PRODUCT_DB.prepare('SELECT id FROM seller_promo_questions WHERE seller_key=?1').bind(sellerKey).all()).results[0];
  return { sellerKey, productId: product.id, questionId: question.id };
}

// 月曜 06:05 JST = 日曜 21:05 UTC
export const MONDAY_0605_JST = new Date('2026-10-04T21:05:00Z');
