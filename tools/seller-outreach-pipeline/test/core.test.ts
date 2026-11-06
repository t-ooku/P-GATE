import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSeller } from '../src/crawler/sellerScraper.js';
import { cosine, matchDemand, validateDemand } from '../src/services/demandMatcher.js';
import { generatePitch } from '../src/services/pitchGenerator.js';
import { Ledger, storeKey } from '../src/lib/ledger.js';
import { publicAddress } from '../src/lib/publicWeb.js';
import type { SellerInfo, DemandRecord } from '../src/types/index.js';

export const seller: SellerInfo = {
  name: 'テスト店舗', platform: 'BASE', storeUrl: 'https://shop.example/',
  contactFormUrl: 'https://shop.example/contact', email: null, categories: ['アクセサリー'],
  mainProducts: [{ name: '天然石アクセサリー', url: 'https://shop.example/items/1' }],
  features: '一つひとつ丁寧に手作りした天然石のアクセサリーをお届けします。',
  fetchedAt: '2026-11-06T00:00:00Z', sourceUrls: ['https://shop.example/']
};
export const demand: DemandRecord = {
  keyword: '天然石アクセサリー', monthlySearchVolume: 100, unmetSearchCount: 30,
  periodStart: '2026-09-30T15:00:00Z', periodEnd: '2026-10-31T15:00:00Z',
  timezone: 'Asia/Tokyo', qaInternalExcluded: true, complete: true, source: 'TEST_FIXTURE_NOT_PRODUCTION'
};
export const sender = { name: 'テスト担当', email: 'sender@example.com', company: 'HOSHILU テスト' };

test('exact cosine and no-overlap do not invent a match', () => {
  assert.ok(Math.abs(cosine('天然石アクセサリー', '天然石アクセサリー') - 1) < 1e-10);
  assert.equal(cosine('天然石', '冷蔵庫'), 0);
  assert.equal(matchDemand(seller, [{ ...demand, keyword: '業務用冷蔵庫' }]), null);
  assert.equal(matchDemand(seller, [demand])?.monthlySearchVolume, 100);
});
test('partial, stale, zero and QA-inclusive counts cannot become monthly claims', () => {
  for (const d of [{ ...demand, complete: false }, { ...demand, qaInternalExcluded: false },
    { ...demand, monthlySearchVolume: 0 }, { ...demand, unmetSearchCount: 101 },
    { ...demand, periodEnd: '2026-10-30T15:00:00Z' },
    { ...demand, periodStart: '2026-10-01T00:00:00Z' }]) {
    assert.throws(() => validateDemand(d as DemandRecord));
  }
  assert.throws(() => validateDemand(demand, new Date('2027-03-01T00:00:00Z')));
});
test('parser keeps at most five observed products and refuses arbitrary contact domains', () => {
  const products = Array.from({ length: 8 }, (_, i) => `<a href="/items/${i}"><img alt="商品${i}"></a>`).join('');
  const html = `<title>テストショップ</title><meta name="description" content="丁寧に手作りした雑貨です">
    ${products}<a href="http://127.0.0.1/contact">問い合わせ</a><a href="/contact">お問い合わせ</a>`;
  const r = parseSeller(html, 'https://demo.thebase.in/');
  assert.equal(r.mainProducts.length, 5); assert.equal(r.platform, 'BASE');
  assert.equal(r.contactFormUrl, 'https://demo.thebase.in/contact');
  assert.equal(r.mainProducts[0].name, '商品0');
});
test('official BASE inquiry links are retained; fake same-looking domains are not', () => {
  const r = parseSeller('<title>店</title><a href="https://thebase.com.evil.example/inquiry/a">contact</a>'
    + '<a href="https://thebase.com/inquiry/shop">お問い合わせ</a>', 'https://demo.thebase.in/');
  assert.equal(r.contactFormUrl, 'https://thebase.com/inquiry/shop');
});
test('pitch is 400–600 characters, preserves observed counts and current sample offer', async () => {
  const match = matchDemand(seller, [demand])!;
  const r = await generatePitch(seller, match, sender, async () => '一つひとつ丁寧に手作りした天然石のアクセサリー');
  assert.ok(Array.from(r.body).length >= 400 && Array.from(r.body).length <= 600);
  assert.match(r.body, /2026年10月/u); assert.match(r.body, /100回/u); assert.match(r.body, /30回/u);
  assert.match(r.body, /カード登録・課金はなく/u); assert.match(r.body, /最大2件/u);
  assert.doesNotMatch(r.body, /月間1000回|売上保証|モール手数料0/u);
});
test('AI cannot inject an invented store claim', async () => {
  await assert.rejects(generatePitch(seller, matchDemand(seller, [demand])!, sender,
    async () => '月商一億円を達成した日本一のブランド'), /UNSUPPORTED_FEATURE_QUOTE/u);
});
test('SQLite claim is durable across connections; unknown state is not retryable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hoshilu-ledger-'));
  const a = new Ledger(join(dir, 'ledger.db')), b = new Ledger(join(dir, 'ledger.db'));
  try {
    const key = storeKey(seller.storeUrl); assert.equal(a.reserve(key), true);
    a.finish(key, 'UNKNOWN', 'timeout'); assert.equal(b.reserve(key), false);
    assert.equal(a.reserve(storeKey('https://another.example/'), 1), false);
  } finally { a.close(); b.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('public fetch refuses local, literal and credential-bearing URLs before connecting', async () => {
  for (const url of ['https://localhost/', 'http://shop.example/', 'https://127.0.0.1/',
    'https://[::1]/', 'https://2130706433/', 'https://user:password@shop.example/', 'https://shop.example:8080/']) {
    await assert.rejects(publicAddress(url));
  }
});
