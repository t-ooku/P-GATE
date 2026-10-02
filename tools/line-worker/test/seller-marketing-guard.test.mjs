import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { assertSellerMarketingCurrent } from '../src/seller-marketing-guard.mjs';
import { publishSocialPost } from '../src/social-publisher.mjs';
import { renderSeoPage } from '../src/seo-pages.mjs';
import { AUTO_RENEW_OFFER, AUTO_RENEW_COPY, TRIAL_SOCIAL_COPY, socialTrialCaption } from '../public/seller-trial-policy.mjs';
const active = { SELLER_MANUAL_PILOT_ENABLED:'true', SELLER_PILOT_OFFER_VERSION:AUTO_RENEW_OFFER, SELLER_PILOT_RECRUITMENT_VERIFIED:AUTO_RENEW_OFFER, SELLER_PILOT_AUTORENEW_ENABLED:'true', SELLER_PILOT_PAYMENTS_ENABLED:'true',SELLER_PILOT_PAYMENT_MODE:'live',SELLER_PILOT_1980_LIVE_PRICE_ID:'price_fixture',SELLER_PILOT_1980_LIVE_PRODUCT_ID:'prod_fixture' };
test('old saved seller copy and old media never reach a provider, even with an active offer', async()=>{
  for(const post of [
    {caption:'HOSHILU Seller 最初の3か月は月額0円です'},
    {caption:'Seller 3ヶ月無料'},
    {caption:'Seller 月額4,980円'},
    {caption:'Seller 値下げしました'},
    {caption:'Seller 永久1,980円'},
    {caption:'Seller 最初の３か月\n０円'},
    {caption:'Seller 商品公開から30日間無料',media_urls:JSON.stringify(['https://hoshilu.app/social/carousel/seller-demand-visible/4.jpg'])},
    {caption:'Seller 新規30日無料は準備中',media_url:'https://hoshilu.app/social/old-reel.mp4'}
  ]) await assert.rejects(publishSocialPost({...post,platform:'X',status:'APPROVED'},active,()=>{assert.fail('provider must not be called');}),/SELLER_MARKETING_REVIEW_REQUIRED/);
});
test('new offer cannot be advertised as available before production verification',()=>{
  const post={content_id:'seller-price',caption:'商品公開から30日間無料。開始前カード登録必須。31日目から月額1,980円で毎月自動更新。'};
  assert.throws(()=>assertSellerMarketingCurrent(post),/TRIAL_NOT_ACTIVE/);
  assert.doesNotThrow(()=>assertSellerMarketingCurrent(post,active));
  assert.doesNotThrow(()=>assertSellerMarketingCurrent({...post,caption:post.caption+'体験開始は準備中。'}));
  assert.doesNotThrow(()=>assertSellerMarketingCurrent({content_id:'runway-seller-shop',caption:'お店の掲載見本をご相談ください',media_url:'https://hoshilu.app/neutral-seller-reel.mp4'}));
  assert.doesNotThrow(()=>assertSellerMarketingCurrent({content_id:'buyer-usual',caption:'3か月ごとに洗剤を買う',media_url:'https://hoshilu.app/buyer.jpg'}));
});
test('versioned seller media is allowed and mixed old/new images are rejected',()=>{
  const post={content_id:'carousel-seller-shop',caption:'新規30日無料は準備中。自店の掲載見本を相談する',media_urls:JSON.stringify(['https://hoshilu.app/social/carousel/seller1980-30d-autorenew-20260927/seller-shop/1.jpg'])};
  assert.doesNotThrow(()=>assertSellerMarketingCurrent(post));
  assert.throws(()=>assertSellerMarketingCurrent({...post,media_url:'https://hoshilu.app/old.jpg'}),/MEDIA_OFFER_UNVERIFIED/);
});
test('SEO visible copy and JSON-LD agree on preparation vs verified active trial',()=>{
  const pending=renderSeoPage('/ja/ec-shukyaku-without-ad-budget');
  assert.match(pending,/30日間無料/);assert.match(pending,/準備中/);assert.doesNotMatch(pending,/最初の3か月/);
  const live=renderSeoPage('/ja/ec-shukyaku-without-ad-budget',active);
  assert.match(live,/商品公開から30日間無料/);assert.doesNotMatch(live,/体験開始の準備中/);
});

test('reusable acquisition kit uses current offer and its recruitment drafts pass the publishing guard',()=>{
  const kit=readFileSync(new URL('../../../docs/seller-acquisition/2026-09-27-kit.md',import.meta.url),'utf8');
  assert.ok(kit.includes(AUTO_RENEW_COPY), 'the shared fee answer must include the canonical consent conditions');
  assert.doesNotMatch(kit,/4,980|支払い方法の登録は不要|本人のお申込みなしに課金|自動で有料プランに切り替わることはありません/);
  const drafts=kit.split(/^## /mu).filter(section=>/^(募集投稿|料金を聞かれた場合|紹介用メッセージ)/u.test(section));
  assert.equal(drafts.length,4);
  for(const caption of drafts)assert.doesNotThrow(()=>assertSellerMarketingCurrent({content_id:'seller-acquisition-kit',caption},{}));
});

// 2026-10-02 大隆さん承認: 受付開始後は「（体験開始は準備中）」を投稿から外す。送信前の行とこれからの行だけ。
test('after recruitment is verified the pending notice is stripped from seller captions, never before',()=>{
  const pending='お店の入口を。 新規Sellerは商品公開から30日間無料。(体験開始は準備中)開始前にカード登録必須。';
  assert.equal(socialTrialCaption(pending,active),'お店の入口を。 新規Sellerは商品公開から30日間無料。開始前にカード登録必須。');
  assert.equal(socialTrialCaption(pending,{}),pending,'受付前は外さない');
  assert.equal(socialTrialCaption('月額1,980円。体験開始は準備中で、掲載見本を相談できます。',active),'月額1,980円。掲載見本を相談できます。');
  assert.doesNotMatch(TRIAL_SOCIAL_COPY,/準備中/);assert.match(TRIAL_SOCIAL_COPY,/30日間無料。開始前にカード登録必須/);
  // 受付前に「準備中」を外した投稿は、これまでどおり guard が止める
  assert.throws(()=>assertSellerMarketingCurrent({content_id:'seller-x',caption:TRIAL_SOCIAL_COPY},{}),/TRIAL_NOT_ACTIVE/);
  assert.doesNotThrow(()=>assertSellerMarketingCurrent({content_id:'seller-x',caption:TRIAL_SOCIAL_COPY},active));
});
