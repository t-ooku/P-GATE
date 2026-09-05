// 2026-09-05 大隆さん指示: インフルエンサー（クリエイター）直接募集。
// 報酬: Instagram 1,500円 / X・TikTok 1,000円（税抜）。投稿と認めた日の属する月の月末締め・翌月末払い・請求書に対する振込。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { CREATOR_REWARDS_JPY, createCreatorInquiry, creatorInquiryNotificationText, handleCreatorInquiryRoutes,
  normalizeCreatorInquiry } from '../src/creator-inquiries.mjs';

function databaseEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0071_creator_inquiries.sql', import.meta.url), 'utf8'));
  return { db, env: { TURNSTILE_VERIFY: async token => token === 'test-token', PRODUCT_DB: { prepare(sql) { const statement = db.prepare(sql); let values = [];
    return { bind(...next) { values = next; return this; }, async run() { statement.run(...values); return { success: true }; },
      async all() { return { results: statement.all(...values) }; } }; } } } };
}

const valid = { inquiry_type: 'APPLY', creator_name: 'ほし ママ', contact_email: 'Creator@example.com',
  platforms: ['INSTAGRAM', 'x', 'YOUTUBE'], account_url: 'https://www.instagram.com/hoshi_mama/',
  follower_range: '1000_4999', genre: 'MOM_KIDS', message: '育児グッズの紹介が得意です。', terms_consent: true, privacy_consent: true };

test('報酬額は Instagram 1,500円・X 1,000円・TikTok 1,000円（税抜）', () => {
  assert.deepEqual(CREATOR_REWARDS_JPY, { INSTAGRAM: 1500, X: 1000, TIKTOK: 1000 });
});

test('応募は媒体を正規化し、規約同意・プライバシー同意・アカウントURLを必須にする', () => {
  const ok = normalizeCreatorInquiry(valid);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.value.platforms, ['INSTAGRAM', 'X']);
  assert.equal(ok.value.contact_email, 'creator@example.com');
  const bad = normalizeCreatorInquiry({ ...valid, terms_consent: false, account_url: 'http://insecure.example', platforms: [] });
  assert.deepEqual(bad.errors, ['PLATFORMS_REQUIRED', 'ACCOUNT_URL_REQUIRED', 'ACCOUNT_URL_INVALID', 'TERMS_CONSENT_REQUIRED']);
  const report = normalizeCreatorInquiry({ ...valid, inquiry_type: 'REPORT_POST' });
  assert.deepEqual(report.errors, ['POST_URL_REQUIRED']);
  const question = normalizeCreatorInquiry({ inquiry_type: 'QUESTION', creator_name: 'A', contact_email: 'a@b.co', terms_consent: true, privacy_consent: true });
  assert.deepEqual(question.errors, []);
});

test('有効な応募をD1へNEWで保存し、通知文に報酬条件と支払い条件を含める', async () => {
  const { db, env } = databaseEnv();
  const result = await createCreatorInquiry(env, valid, new Date('2026-09-05T00:00:00Z'));
  assert.equal(result.accepted, true);
  const row = db.prepare('SELECT * FROM creator_inquiries').get();
  assert.equal(row.status, 'NEW');
  assert.equal(row.source, 'FOR_CREATORS');
  assert.equal(row.platforms, '["INSTAGRAM","X"]');
  const text = creatorInquiryNotificationText(row.inquiry_id, normalizeCreatorInquiry(valid).value, row.created_at);
  assert.match(text, /Instagram 1,500円 \/ X 1,000円 \/ TikTok 1,000円/);
  assert.match(text, /月末締め・翌月末払い・請求書に対する振込/);
  assert.match(text, /https:\/\/hoshilu\.app\/api\/admin\/creators\/inquiries/);
});

test('APIは同一Originを要求し、Turnstile通過で201を返す', async () => {
  const { env } = databaseEnv();
  const blocked = await handleCreatorInquiryRoutes(new Request('https://hoshilu.app/api/creators/inquiries', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: JSON.stringify(valid)
  }), env);
  assert.equal(blocked.status, 403);
  const accepted = await handleCreatorInquiryRoutes(new Request('https://hoshilu.app/api/creators/inquiries', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
    body: JSON.stringify({ ...valid, turnstile_token: 'test-token' })
  }), env);
  assert.equal(accepted.status, 201);
  const payload = await accepted.json();
  assert.equal(payload.status, 'RECEIVED');
});

test('募集ページと規約ページは報酬・締め支払い・投稿ルールを明記し、フォームは規約同意を必須にする', () => {
  const html = readFileSync(new URL('../public/for-creators.html', import.meta.url), 'utf8');
  const terms = readFileSync(new URL('../public/creator-terms.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../public/for-creators.js', import.meta.url), 'utf8');
  const index = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  assert.match(html, /Instagram 1投稿 1,500円/);
  assert.match(html, /X 1投稿 1,000円/);
  assert.match(html, /TikTok 1投稿 1,000円/);
  assert.match(html, /月末締め/);
  assert.match(html, /翌月末払い/);
  assert.match(html, /請求書に対する銀行振込/);
  assert.match(html, /#PR/);
  assert.match(html, /実際に検索した画面/);
  assert.match(html, /name="terms_consent" required/);
  assert.match(html, /id="turnstile"/);
  assert.match(html, /\/social\/hoshilu-ai-actress-watch-v1\.mp4/);
  assert.match(html, /href="\/creator-terms"/);
  assert.match(terms, /第4条（報酬）/);
  assert.match(terms, /承認日の属する月の<strong>月末<\/strong>で締め/);
  assert.match(terms, /<strong>翌月末日<\/strong>までに指定の銀行口座へ振り込みます/);
  assert.match(terms, /ステルスマーケティング規制/);
  assert.match(script, /\/api\/creators\/inquiries/);
  assert.match(script, /terms_consent: data\.get\('terms_consent'\) === 'on'/);
  assert.match(index, /href="\/for-creators"/);
  assert.match(sitemap, /<loc>https:\/\/hoshilu\.app\/for-creators<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/hoshilu\.app\/creator-terms<\/loc>/);
});
