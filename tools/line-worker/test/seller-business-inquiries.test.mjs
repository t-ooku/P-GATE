import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createSellerBusinessInquiry, fallbackInquiryAllowed, handleSellerBusinessInquiryRoutes,
  normalizeSellerBusinessInquiry } from '../src/seller-business-inquiries.mjs';

function databaseEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0058_seller_business_inquiries.sql', import.meta.url), 'utf8'));
  return { db, env: { TURNSTILE_VERIFY: async token => token === 'test-token', PRODUCT_DB: { prepare(sql) { const statement = db.prepare(sql); let values = [];
    return { bind(...next) { values = next; return this; }, async run() { const info=statement.run(...values); return { success: true, meta:{changes:Number(info.changes)} }; },
      async all() { return { results: statement.all(...values) }; } }; } } } };
}

const valid = { inquiry_type: 'ACCOUNT_APPLICATION', organization_type: 'MAKER',
  organization_name: '星商事株式会社', contact_name: '星 太郎', contact_email: 'sales@example.com',
  storefront_url: 'https://example.com/store', marketplaces: ['AMAZON', 'YAHOO', 'UNKNOWN'],
  monthly_order_range: '50_199', plan_interest: 'BUSINESS', payment_preference: 'INVOICE',
  message: '掲載と分析について相談したいです。', privacy_consent: true };

test('メーカー・セラー問い合わせは必要項目だけを正規化しSecretを要求しない', () => {
  const result = normalizeSellerBusinessInquiry(valid);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.value.marketplaces, ['AMAZON', 'YAHOO']);
  assert.equal(result.value.contact_email, 'sales@example.com');
  assert.equal('password' in result.value, false);
  assert.equal('api_key' in result.value, false);
});

test('同意なし・不正URL・不正メールの問い合わせを拒否する', () => {
  const result = normalizeSellerBusinessInquiry({ ...valid, privacy_consent: false,
    contact_email: 'invalid', storefront_url: 'http://example.com' });
  assert.deepEqual(result.errors, ['CONTACT_EMAIL_INVALID', 'STOREFRONT_URL_INVALID', 'PRIVACY_CONSENT_REQUIRED']);
});

test('有効な登録申請をD1へNEWとして保存する', async () => {
  const { db, env } = databaseEnv();
  const result = await createSellerBusinessInquiry(env, valid, new Date('2026-08-21T00:00:00Z'));
  assert.equal(result.accepted, true);
  const row = db.prepare('SELECT * FROM seller_business_inquiries').get();
  assert.equal(row.status, 'NEW');
  assert.equal(row.organization_name, '星商事株式会社');
  assert.equal(row.created_at, '2026-08-21T00:00:00.000Z');
});

test('公開問い合わせAPIは同一Originだけを受け付ける', async () => {
  const { env } = databaseEnv();
  const blocked = await handleSellerBusinessInquiryRoutes(new Request('https://hoshilu.app/api/seller-business/inquiries', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: JSON.stringify({ ...valid, turnstile_token: 'test-token' })
  }), env);
  assert.equal(blocked.status, 403);
  const accepted = await handleSellerBusinessInquiryRoutes(new Request('https://hoshilu.app/api/seller-business/inquiries', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' }, body: JSON.stringify({ ...valid, turnstile_token: 'test-token' })
  }), env);
  assert.equal(accepted.status, 201);
  assert.equal((await accepted.json()).status, 'RECEIVED');
});

test('公開LPは相談・登録・支払い準備を明示し機密情報を要求しない', () => {
  const html = readFileSync(new URL('../public/for-sellers.html', import.meta.url), 'utf8');
  assert.match(html, /自店の掲載見本を相談する/u);
  assert.match(html, /name="privacy_consent" required/u);
  assert.match(html, /name="marketing_consent">/u);
  assert.match(html, /フォーム送信だけで課金されることはありません/u);
  assert.doesNotMatch(html, /ITグループ|ITG以外/u);
  assert.match(html, /売上、注文、掲載順位は保証しません/u);
  assert.match(html, /property="og:url" content="https:\/\/hoshilu\.app\/for-sellers"/u);
  assert.match(html, /"@type":"FAQPage"/u);
  assert.match(html, /data-seller-cta="hero-inquiry"/u);
  // 2026-09-19 §1・§15・§18: 商品は 1 つ。HOSHILU Seller 4,980円/月、最初の3か月 月額0円。
  // 2026-09-21 大隆さん決定: Demand Match Click 50円を廃止。値段は月額の1つだけになった。
  assert.match(html, /月額4,980円/u);
  assert.match(html, /最初の3か月 月額0円/u);
  assert.match(html, /追加料金 <strong>なし<\/strong>/u);
  assert.match(html, /1法人単位ではなく、1事業者アカウント単位/u);
  assert.match(html, /月額に含まれるもの: HOSHILU SHOP掲載、全ショップ横断検索への露出、商品クリック/u);
  assert.match(html, /従量課金はありません/u);
  // 値段として 50円 を掲げない（廃止の説明としてだけ出てよい）
  assert.ok(!/1有効クリック 50円/u.test(html), '廃止した単価を値段として出さない');
  assert.match(html, /新しいECモールを増やす必要はありません/u);
  assert.match(html, /<summary>クリックされると料金は増えますか？<\/summary><p>増えません。料金は月額4,980円だけです/u);
  assert.match(html, /<summary>ユーザーの個人情報は見られますか？<\/summary><p>見られません/u);
  assert.match(html, /<summary>費用が勝手に増えませんか？<\/summary>/u);
  // 2026-09-19 大隆さん決定で課金開始。予算上限は実装済みなので「準備中」と書かない（§33）
  assert.doesNotMatch(html, /準備中/u);
  // 2026-09-21: 予算上限は、上限を置く支出そのものが無くなったので説明ごと消した。
  assert.match(html, /従量課金はありません。クリックされた回数で請求が増えることはありません/u);
  assert.ok(!html.includes('Demand Match予算'), '無くした設定の説明を残さない');
  assert.match(html, /id="demandNow"/u);
  assert.doesNotMatch(html, /9,800/u);
  assert.doesNotMatch(html, /Growth/u);
  assert.doesNotMatch(html, /定価の50%/u);
  assert.doesNotMatch(html, /毎月5,000円分/u);
  assert.doesNotMatch(html, /Businessあり/u);
  assert.doesNotMatch(html, /name="(?:password|api_key|secret|access_token)"/iu);
  const script = readFileSync(new URL('../public/for-sellers.js', import.meta.url), 'utf8');
  assert.match(script, /sendSellerEvent\('seller_landing_view'/u);
  assert.match(script, /sendSellerEvent\('seller_cta_clicked'/u);
});

test('公開LPはスマホで見出しを3行以上に崩さず余白を圧縮する', () => {
  const html = readFileSync(new URL('../public/for-sellers.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../public/for-sellers-pricing.css', import.meta.url), 'utf8');
  assert.match(css, /\.hero h1,\.hero h1 span\{white-space:nowrap\}/u);
  assert.match(css, /\.hero\{min-height:auto;padding:36px 4px 42px\}/u);
  assert.match(css, /\.values\{gap:10px;margin-bottom:38px\}/u);
  assert.match(css, /\.form-shell\{margin:38px 0/u);
  assert.match(css, /\.flow h2\{[^}]*white-space:nowrap/u);
  assert.match(css, /\.price-table-wrap table\{min-width:0;table-layout:fixed\}/u);
  // 2026-09-19: 8 段の流れはスマホで 1 列、タブレットで 2 列
  assert.match(css, /@media\(max-width:520px\)\{\.dm-flow ol\{grid-template-columns:1fr\}/u);
  assert.match(html, /<section class="flow dm-flow" id="how">/u);
  const dmFlow = html.slice(html.indexOf('<section class="flow dm-flow"'), html.indexOf('</section>', html.indexOf('<section class="flow dm-flow"')));
  assert.equal((dmFlow.match(/<li><span>[1-8]<\/span><div><strong>/gu) || []).length, 8);
});

test('値下げ待ちと見つからなかった検索を匿名需要としてBusinessへ届ける', () => {
  const html = readFileSync(new URL('../public/for-sellers.html', import.meta.url), 'utf8');
  assert.match(html, /値下げ通知に登録された商品条件/u);
  assert.match(html, /見つからなかった需要/u);
  assert.match(html, /仕入れ・商品開発・価格判断/u);
  assert.match(html, /検索文そのものや個人情報は共有しません/u);
  assert.match(html, /匿名需要が5件以上/u);
});

// 2026-09-03 セラー獲得の運用開始: これまで問い合わせはD1に入るだけで通知が
// 無く、管理APIを人が見に行かない限り気づけなかった。届いた時点でメールを
// 1通送る。通知に失敗しても問い合わせ自体は必ず受け付ける。
test('セラー問い合わせは届いた時点で通知メールを送る', async () => {
  const { env } = databaseEnv();
  const sent = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response('{"id":"test-receipt"}', { status: 200 });
  };
  try {
    const result = await createSellerBusinessInquiry({
      ...env, RESEND_API_KEY: 're_test', MEMBER_EMAIL_FROM: 'notification@auth.hoshilu.app',
      SELLER_INQUIRY_NOTIFY_EMAIL: 'owner@example.com'
    }, valid, new Date('2026-09-03T00:00:00Z'));
    assert.equal(result.accepted, true);
    assert.equal(result.notified, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, 'https://api.resend.com/emails');
    assert.deepEqual(sent[0].body.to, ['owner@example.com']);
    // そのまま返信できるようにする(対応は手作業のため)。
    assert.equal(sent[0].body.reply_to, 'sales@example.com');
    assert.match(sent[0].body.subject, /星商事株式会社/u);
    assert.match(sent[0].body.text, /sales@example\.com/u);
    assert.match(sent[0].body.text, /掲載と分析について相談したいです。/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('通知先が未設定でも、通知が失敗しても問い合わせは受け付ける', async () => {
  const { db, env } = databaseEnv();
  const noConfig = await createSellerBusinessInquiry(env, valid, new Date('2026-09-03T00:00:00Z'));
  assert.equal(noConfig.accepted, true);
  assert.equal(noConfig.notified, false);

  const { db: db2, env: env2 } = databaseEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('NETWORK_DOWN'); };
  try {
    const failed = await createSellerBusinessInquiry({
      ...env2, RESEND_API_KEY: 're_test', MEMBER_EMAIL_FROM: 'notification@auth.hoshilu.app',
      SELLER_INQUIRY_NOTIFY_EMAIL: 'owner@example.com'
    }, valid, new Date('2026-09-03T00:00:00Z'));
    assert.equal(failed.accepted, true, '通知の失敗で見込み客を落とさない');
    assert.equal(failed.notified, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(db2.prepare('SELECT COUNT(*) AS n FROM seller_business_inquiries').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM seller_business_inquiries').get().n, 1);
});

// 2026-09-03: 実機(iOS Safari)でTurnstileが読み込めず、フォームを一切送信でき
// なかった。問い合わせ口が塞がる損失の方が大きいので、確認欄を通らない送信も
// 件数を絞って受け付ける。通常の受付とはsourceで区別し、通知の件名にも出す。
test('確認欄を通らない送信も件数を絞って受け付け、sourceで区別する', async () => {
  const { db, env } = databaseEnv();
  const result = await createSellerBusinessInquiry(env, valid, new Date('2026-09-03T00:00:00Z'), { verified: false });
  assert.equal(result.accepted, true);
  assert.equal(result.verified, false);
  const row = db.prepare('SELECT * FROM seller_business_inquiries').get();
  assert.equal(row.source, 'FOR_SELLERS_FALLBACK');
  assert.equal(row.status, 'NEW');

  const verified = await createSellerBusinessInquiry(env, { ...valid, contact_email: 'a@example.com' },
    new Date('2026-09-03T00:00:01Z'));
  assert.equal(verified.verified, true);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM seller_business_inquiries WHERE source='FOR_SELLERS'").get().n, 1);
});

test('確認欄なしの受付は1時間3件・1日10件で打ち切る', async () => {
  const { env } = databaseEnv();
  const now = new Date('2026-09-03T12:00:00Z');
  assert.equal(await fallbackInquiryAllowed(env, now), true);
  for (let index = 0; index < 3; index += 1) {
    await createSellerBusinessInquiry(env, { ...valid, contact_email: `spam${index}@example.com` },
      new Date(now.getTime() - index * 60_000), { verified: false });
  }
  assert.equal(await fallbackInquiryAllowed(env, now), false, '1時間で3件を超えたら受け付けない');
  // 1時間より前の分は時間枠から外れるが、24時間の上限には残る。
  const later = new Date(now.getTime() + 2 * 3600_000);
  assert.equal(await fallbackInquiryAllowed(env, later), true);
});

test('確認欄を通った受付は件数制限の対象にしない', async () => {
  const { env } = databaseEnv();
  const now = new Date('2026-09-03T12:00:00Z');
  for (let index = 0; index < 12; index += 1) {
    await createSellerBusinessInquiry(env, { ...valid, contact_email: `ok${index}@example.com` },
      new Date(now.getTime() - index * 1000));
  }
  assert.equal(await fallbackInquiryAllowed(env, now), true, '通常の受付で枠を消費してはいけない');
});

test('確認欄が通らなくても公開APIは受け付け、通知の件名に要確認と出す', async () => {
  const { env } = databaseEnv();
  const sent = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response('{"id":"test-receipt"}', { status: 200 }); };
  try {
    const response = await handleSellerBusinessInquiryRoutes(new Request('https://hoshilu.app/api/seller-business/inquiries', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
      body: JSON.stringify({ ...valid, turnstile_token: '' })
    }), { ...env, RESEND_API_KEY: 're_test', MEMBER_EMAIL_FROM: 'notification@auth.hoshilu.app',
      SELLER_INQUIRY_NOTIFY_EMAIL: 'owner@example.com' });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.verified, false);
    assert.equal(sent.length, 1);
    assert.match(sent[0].subject, /要確認/u);
    assert.match(sent[0].text, /未通過/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// 2026-09-17 SHOP指示書 §30〜31: /for-sellers の中心メッセージは「欲しい人が見える。欲しい人に商品を届けられる。」。成果保証の語は使わない。
test('掲載見本の相談を主導線にし、未承認の体験条件・保証を訴求しない', () => {
  const html = readFileSync(new URL('../public/for-sellers.html', import.meta.url), 'utf8');
  assert.match(html, /今のショップを変えずに、/u);
  assert.match(html, /data-seller-cta="hero-inquiry">自店の掲載見本を相談する</u);
  assert.match(html, /非公開の見本/u);
  assert.match(html, /店舗様ご本人/u);
  assert.doesNotMatch(html, /クリック50円|今月の利用額|予算上限の設定|自動課金なし|支払い登録不要の3か月/u);
  assert.match(html, /同じ条件を5人以上が探している項目だけを、検索文ではなく正規化した条件/u);
  for (const banned of ['必ず売れ', '売上が上がり', '多数のユーザー', '業界No', '確実に']) assert.ok(!html.includes(banned), banned);
});

// 2026-09-22 大隆さん報告「位置が左にズレてるよ」（/for-sellers の料金欄）。
// 丸い錠剤の形（999px）だと、スマホで3行に折り返したとき上下の行が丸みに
// 食い込み、左へずれて見える。他の枠と同じ角丸にする。
test('料金欄は角丸。折り返しても文字の左端がそろう', () => {
  const css = readFileSync(new URL('../public/for-sellers-pricing.css', import.meta.url), 'utf8');
  const rule = css.slice(css.indexOf('.hero-price{'), css.indexOf('}', css.indexOf('.hero-price{')));
  assert.ok(!rule.includes('border-radius:999px'), '錠剤の形にしない');
  assert.match(rule, /border-radius:18px/u);
  const html = readFileSync(new URL('../public/for-sellers.html', import.meta.url), 'utf8');
  assert.match(html, /for-sellers-pricing\.css\?v=8/u);
});


test('同じ受付キーの再試行は同じ受付番号で1件だけ保存する', async () => {
  const { db, env } = databaseEnv();
  const input = {...valid, request_id:'consultation-test-key-0001'};
  const first = await createSellerBusinessInquiry(env, input);
  const second = await createSellerBusinessInquiry(env, input);
  assert.equal(first.inquiry_id,second.inquiry_id);
  assert.equal(second.duplicate,true);
  assert.equal(db.prepare('SELECT count(*) n FROM seller_business_inquiries').get().n,1);
});

test('相談回答の同意と継続案内の希望を分けて保存し、自動で送信許諾にしない', async () => {
  const { db, env } = databaseEnv();
  const result = await createSellerBusinessInquiry(env,{...valid,inquiry_type:'CONSULTATION',contact_name:'',marketing_consent:true});
  assert.equal(result.accepted,true);
  assert.match(db.prepare('SELECT message FROM seller_business_inquiries').get().message,/yes_pending_verification/);
  assert.equal(result.notification_tracking,false);
});

test('通知の失敗を保存して申込みを残す（0088適用後）', async () => {
  const { db, env } = databaseEnv();
  db.exec(readFileSync(new URL('../migrations/0088_seller_inquiry_notifications.sql',import.meta.url),'utf8'));
  const result=await createSellerBusinessInquiry(env,valid);
  assert.equal(result.accepted,true);
  assert.equal(result.notification_tracking,true);
  assert.equal(db.prepare('SELECT state FROM seller_inquiry_notifications').get().state,'FAILED');
});

test('保存できなければ成功表示用のレスポンスを返さない', async () => {
  const {env}=databaseEnv();
  env.PRODUCT_DB.prepare=()=>{throw new Error('DB_UNAVAILABLE')};
  const response=await handleSellerBusinessInquiryRoutes(new Request('https://hoshilu.app/api/seller-business/inquiries',{
    method:'POST',headers:{origin:'https://hoshilu.app'},body:JSON.stringify({...valid,turnstile_token:'test-token'})
  }),env);
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,'INQUIRY_SAVE_FAILED');
});


test('同時に再送されても申込みと通知は1件', async () => {
  const {db,env}=databaseEnv();const input={...valid,request_id:'concurrent-test-00001'};
  const results=await Promise.all([createSellerBusinessInquiry(env,input),createSellerBusinessInquiry(env,input)]);
  assert.equal(results[0].inquiry_id,results[1].inquiry_id);
  assert.equal(results.filter(r=>r.duplicate).length,1);
  assert.equal(db.prepare('SELECT count(*) n FROM seller_business_inquiries').get().n,1);
});
