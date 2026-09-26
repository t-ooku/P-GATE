import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSellerMarketingCurrent } from '../src/seller-marketing-guard.mjs';
import { publishSocialPost } from '../src/social-publisher.mjs';
import { renderSeoPage } from '../src/seo-pages.mjs';
import { PILOT_OFFER } from '../public/seller-trial-policy.mjs';
const active = { SELLER_MANUAL_PILOT_ENABLED:'true', SELLER_PILOT_OFFER_VERSION:PILOT_OFFER, SELLER_PILOT_RECRUITMENT_VERIFIED:PILOT_OFFER };
test('old saved seller copy and old media never reach a provider, even with an active offer', async()=>{
  for(const post of [
    {caption:'HOSHILU Seller 最初の3か月は月額0円です'},
    {caption:'Seller 3ヶ月無料'},
    {caption:'Seller 最初の３か月\n０円'},
    {caption:'Seller 商品公開から30日間無料',media_urls:JSON.stringify(['https://hoshilu.app/social/carousel/seller-demand-visible/4.jpg'])},
    {caption:'Seller 新規30日無料は準備中',media_url:'https://hoshilu.app/social/old-reel.mp4'}
  ]) await assert.rejects(publishSocialPost({...post,platform:'X',status:'APPROVED'},active,()=>{assert.fail('provider must not be called');}),/SELLER_MARKETING_REVIEW_REQUIRED/);
});
test('new offer cannot be advertised as available before production verification',()=>{
  const post={content_id:'seller-price',caption:'商品公開から30日間無料。支払い登録不要。'};
  assert.throws(()=>assertSellerMarketingCurrent(post),/TRIAL_NOT_ACTIVE/);
  assert.doesNotThrow(()=>assertSellerMarketingCurrent(post,active));
  assert.doesNotThrow(()=>assertSellerMarketingCurrent({...post,caption:post.caption+'体験開始は準備中。'}));
  assert.doesNotThrow(()=>assertSellerMarketingCurrent({content_id:'runway-seller-shop',caption:'お店の掲載見本をご相談ください',media_url:'https://hoshilu.app/neutral-seller-reel.mp4'}));
  assert.doesNotThrow(()=>assertSellerMarketingCurrent({content_id:'buyer-usual',caption:'3か月ごとに洗剤を買う',media_url:'https://hoshilu.app/buyer.jpg'}));
});
test('versioned seller media is allowed and mixed old/new images are rejected',()=>{
  const post={content_id:'carousel-seller-shop',caption:'新規30日無料は準備中。自店の掲載見本を相談する',media_urls:JSON.stringify(['https://hoshilu.app/social/carousel/seller30-20260927-r2/seller-shop/1.jpg'])};
  assert.doesNotThrow(()=>assertSellerMarketingCurrent(post));
  assert.throws(()=>assertSellerMarketingCurrent({...post,media_url:'https://hoshilu.app/old.jpg'}),/MEDIA_OFFER_UNVERIFIED/);
});
test('SEO visible copy and JSON-LD agree on preparation vs verified active trial',()=>{
  const pending=renderSeoPage('/ja/ec-shukyaku-without-ad-budget');
  assert.match(pending,/30日間無料/);assert.match(pending,/準備中/);assert.doesNotMatch(pending,/最初の3か月/);
  const live=renderSeoPage('/ja/ec-shukyaku-without-ad-budget',active);
  assert.match(live,/商品公開から30日間無料/);assert.doesNotMatch(live,/体験開始の準備中/);
});
