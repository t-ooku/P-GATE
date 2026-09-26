import { recruitmentVerified } from '../public/seller-trial-policy.mjs';

// Check the original payload before platform truncation; never rewrite sent history.
export function assertSellerMarketingCurrent(post = {}, env = {}) {
  const caption = String(post.caption || '');
  const pricingText = caption.normalize('NFKC').replace(/\s+/gu, '');
  const identity = [post.content_id, post.campaign_id, post.link, caption].join(' ');
  const seller = /seller|セラー|事業者|月額4,?980/iu.test(identity);
  if (!seller) return;
  if (/[3３](?:か|ヶ|カ|ケ|箇)月.{0,15}(?:無料|[0０]円)|無料.{0,15}[3３](?:か|ヶ|カ|ケ|箇)月/u.test(pricingText)) {
    throw new Error('SELLER_MARKETING_REVIEW_REQUIRED:OLD_TRIAL_COPY');
  }
  const media = [post.media_url, post.media_urls].filter(Boolean).join(' ');
  // Previous image/video assets may have the old offer burned into the pixels.
  // The new versioned carousel directory is built from reviewed 30-day sources.
  const mentionsTrial = /30日.{0,10}無料/u.test(pricingText);
  const oldCarousel = /\/social\/carousel\/seller-/u.test(media);
  if (media && (oldCarousel || mentionsTrial) && !media.split(/[,\s"\[\]]+/u).filter(Boolean).every(url => url.includes('/social/carousel/seller30-20260927/'))) {
    throw new Error('SELLER_MARKETING_REVIEW_REQUIRED:MEDIA_OFFER_UNVERIFIED');
  }
  if (mentionsTrial && !recruitmentVerified(env) && !/準備中/u.test(caption)) {
    throw new Error('SELLER_MARKETING_REVIEW_REQUIRED:TRIAL_NOT_ACTIVE');
  }
}
