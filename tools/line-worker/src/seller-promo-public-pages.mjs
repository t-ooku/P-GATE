// 2026-10-03 Cowork 依頼（自社の販促素材 §0・§3-1、大隆さん決定 b）: 公開 LP /for-sellers に AI販促担当を料金まで載せる。
// - 料金（9,800／19,800）は公開アセットに置かない（seller-promo-billing.mjs の方針）。SELLER_PROMO_PLANS_ENABLED=true の
//   ときだけ、Worker がここの文面を /for-sellers・/legal・/terms に差し込む。OFF なら今までの掲載プランだけのページのまま。
// - 掲載プラン 1,980円の欄は「掲載のみ」のまま残し、3 段の料金にする。JSON-LD・FAQ・規約・特商法表示も同じ 3 段に揃える。
// - 「最安」「No.1」・売上や順位の約束は書かない。数字は確定している料金と 30 日だけ。
import { PROMO_PAID_PLANS } from './seller-promo-billing.mjs';

const yen = (amount) => `${amount.toLocaleString('en-US')}円`;
const LIGHT = yen(PROMO_PAID_PLANS.LIGHT.unit_amount);
const STANDARD = yen(PROMO_PAID_PLANS.STANDARD.unit_amount);
const trialCopy = (amount) => `初回公開から30日間無料。無料利用の開始前にカード登録が必要です。無料期間の終了期限までに解約しない場合、31日目から月額${amount}（税込）で自動課金され、以後毎月自動更新されます。解約は掲載管理画面から行えます。`;

export const PROMO_LP_MARKERS = Object.freeze({
  heroStart: '<!--SELLER_PROMO_HERO_START-->', heroEnd: '<!--SELLER_PROMO_HERO_END-->',
  sections: '<!--SELLER_PROMO_SECTIONS-->',
  pricingHeadStart: '<!--SELLER_PROMO_PRICING_HEAD_START-->', pricingHeadEnd: '<!--SELLER_PROMO_PRICING_HEAD_END-->',
  pricing: '<!--SELLER_PROMO_PRICING-->',
  faq: '<!--SELLER_PROMO_FAQ-->'
});

// 2026-10-09 大隆さん指示「もっと1980円のshop掲載ページを充実させて。陰に隠れてるけど、まず入り口は1980円でもあるよね」:
// 第一画面の主役を AI販促担当から「掲載プラン 月額1,980円」へ。AI販促担当は「販促まで任せるなら」の次の一歩として残す。
export const PROMO_LP_HERO = `<section class="hero promo-hero seller-showcase-hero"><style>.promo-hero h1,.promo-hero h1 span{white-space:normal}.promo-section p{max-width:760px;line-height:1.85}.promo-section ul{margin:0;padding-left:1.2em;line-height:1.9}</style><div class="seller-hero-copy"><p class="eyebrow">HOSHILU SELLER</p><h1>まずは月額1,980円で、<br><span>探している人の目の前へ。</span></h1><p class="lead">Amazonや楽天市場の出店はそのまま。検索語の条件にすべて合うときは、HOSHILUの検索結果の一番上にある「PR」枠に、お店の商品を表示します（最大2件）。HOSHILUで何が探されていて、何が見つからなかったかも、契約者画面で見られます。<br>まずは、商品3点の掲載見本をご相談ください。公開は店舗様の確認・承認後です。</p><p class="hero-price">掲載プラン <strong>月額1,980円（税込）</strong><br><small>新規は商品公開から30日間無料（開始前にカード登録と自動更新への同意が必要です。期限までに解約しない場合、31日目から自動課金・毎月更新）。相談フォーム送信だけでは課金されません。</small><br><small>販促まで任せるなら、AI販促担当 Light 月額${LIGHT}・Standard 月額${STANDARD}（税込）</small></p><div class="hero-actions"><a class="primary" href="#businessForm" data-seller-cta="hero-inquiry">1,980円の掲載を相談する</a><a class="ghost" href="#included" data-seller-cta="hero-included">1,980円でできることを見る</a></div></div><div class="seller-pr-visual" aria-hidden="true"><div class="seller-pr-browser"><div class="seller-pr-browser-bar"><i></i><i></i><i></i><b></b></div><div class="seller-pr-search"><span></span><em></em></div><div class="seller-pr-result"><strong>PR</strong><div class="seller-pr-thumb"></div><div class="seller-pr-lines"><i></i><i></i><i></i></div><div class="seller-pr-price"></div></div><div class="seller-pr-result seller-pr-result-secondary"><strong>PR</strong><div class="seller-pr-thumb"></div><div class="seller-pr-lines"><i></i><i></i><i></i></div><div class="seller-pr-price"></div></div></div><span class="seller-pr-orbit seller-pr-orbit-one"></span><span class="seller-pr-orbit seller-pr-orbit-two"></span></div></section>`;

export const PROMO_LP_SECTIONS = `<section class="promo-section" id="why-outside"><p class="eyebrow">WHY OUTSIDE THE MALL</p><h2>なぜ「モールの外」なのか</h2>
    <p>お客さまの多くは、買う前に Google や Instagram で「選び方」や「使い方」を調べています。モールの中の対策だけでは、その人たちにお店の名前は届きません。</p>
    <p>モールの広告は、出し続けている間だけ見つけてもらえる仕組みです。一方、お店のサイトに積み上げた記事は消えずに残り、時間がたつほど入口が増えていきます。</p>
    <p>大切だと分かっていても後回しになりがちなこの仕事を、毎週止めずに続けるのが HOSHILU の役目です。</p>
  </section>
  <section class="promo-section" id="inside-outside"><p class="eyebrow">INSIDE &amp; OUTSIDE</p><h2>HOSHILU の中と外、両方で</h2>
    <p><strong>HOSHILU の中（掲載プラン 1,980円から）:</strong> 検索結果の「PR」枠への優先出品と商品掲載。「これを探している」人がいれば、お店にお知らせします。</p>
    <p><strong>HOSHILU の外:</strong> Google 検索向けの記事、Instagram／X／Threads の投稿文と画像、お店のサイト（WordPress）や楽天GOLD への公開。</p>
  </section>
  <section class="promo-section" id="weekly"><p class="eyebrow">EVERY WEEK</p><h2>毎週届くもの</h2>
    <p>AI販促担当（Light・Standard）で届くものです。掲載プランだけの場合は含みません。</p>
    <ul><li>記事 1本</li><li>SNS 投稿文 2本と画像</li><li>商品ページの直し案 1件</li><li>月に1回、作ったもの・公開したもの・数字のレポート</li></ul>
    <p>お店が中身を確かめて承認したものだけを公開します。お店の商品情報に根拠の無い表現は「要確認」としてお知らせし、自動では公開しません。</p>
  </section>`;

export const PROMO_LP_PRICING_HEAD = '<style>#pricing{grid-template-columns:repeat(3,minmax(0,1fr));align-items:start}#pricing .pricing-head{grid-column:1/-1}#pricing .pricing-head h2,#pricing .pricing-head h2 span{white-space:normal}#pricing .price strong{font-size:clamp(40px,4.2vw,56px)}@media(max-width:860px){#pricing{grid-template-columns:minmax(0,1fr)}}</style><div class="pricing-head"><p class="eyebrow">THREE PLANS</p><h2>まずは掲載プラン1,980円から。<br><span>販促まで任せるなら、AI販促担当。</span></h2><p>1法人単位ではなく、1事業者アカウント単位。担当者は複数人で利用できます。初期費用・解約金は0円です。どのプランもクリックによる追加料金はありません。</p></div>';

export const PROMO_LP_PRICING = `<article class="price-card" id="promo-light"><p class="price-label">AI販促担当 Light</p><p class="price"><strong>¥${PROMO_PAID_PLANS.LIGHT.unit_amount.toLocaleString('en-US')}</strong><span>/ 月・税込</span></p><p class="campaign">${trialCopy(LIGHT)}</p><ul><li>毎週月曜に、記事1本・SNS投稿文2本と画像・商品ページの直し案1件が届きます</li><li>月に1回、作ったもの・公開したもの・数字のレポート</li><li>公開はお店が行います</li></ul><a class="primary" href="#businessForm" data-seller-cta="pricing-light">AI販促担当を相談する</a></article>
    <article class="price-card" id="promo-standard"><p class="price-label">AI販促担当 Standard</p><p class="price"><strong>¥${PROMO_PAID_PLANS.STANDARD.unit_amount.toLocaleString('en-US')}</strong><span>/ 月・税込</span></p><p class="campaign">${trialCopy(STANDARD)}</p><ul><li>Light の内容に加えて</li><li>お店のサイト（WordPress）への公開</li><li>楽天GOLD 用の HTML</li><li>任意の声フォーム、需要への再案内</li></ul><a class="primary" href="#businessForm" data-seller-cta="pricing-standard">AI販促担当を相談する</a></article>`;

export const PROMO_LP_FAQ = `<details><summary>AI販促担当の料金は？</summary><p>Light 月額${LIGHT}、Standard 月額${STANDARD}（いずれも税込）です。HOSHILU 内の掲載だけなら月額1,980円（税込）です。どのプランも初回公開から30日間無料で、開始前にカード登録と自動更新への同意が必要です。無料期間の終了期限までに解約すれば費用はかかりません。</p></details><details><summary>記事やSNSの投稿は、勝手に公開されますか？</summary><p>されません。お店が中身を確かめて承認したものだけを公開します。自動公開はお店が自分で設定した場合だけで、お店の商品情報に根拠の無い表現がある版は自動では公開しません。</p></details>`;

const FAQ_PROMO_ANSWERS = Object.freeze({
  'AI販促担当の料金は？': `Light 月額${LIGHT}、Standard 月額${STANDARD}（いずれも税込）です。HOSHILU 内の掲載だけなら月額1,980円（税込）です。どのプランも初回公開から30日間無料で、開始前にカード登録と自動更新への同意が必要です。無料期間の終了期限までに解約すれば費用はかかりません。`,
  '記事やSNSの投稿は、勝手に公開されますか？': 'されません。お店が中身を確かめて承認したものだけを公開します。自動公開はお店が自分で設定した場合だけで、お店の商品情報に根拠の無い表現がある版は自動では公開しません。'
});

// 1,980円だけを前提にした既存の文（本文・JSON-LD の FAQ）を 3 段に合わせる。[置き換え前, 置き換え後]
const PLAN_PRICES = `掲載プラン1,980円・AI販促担当 Light ${LIGHT}・Standard ${STANDARD}、いずれも税込`;
export const PROMO_LP_REPLACEMENTS = Object.freeze([
  ['増えません。料金は月額1,980円だけです。', `増えません。料金は選んだプランの月額（${PLAN_PRICES}）だけです。`],
  ['増えません。料金は月額1,980円だけで、従量課金はありません。', '増えません。料金は選んだプランの月額だけで、従量課金はありません。'],
  ['月額1,980円の掲載プランには含みません。掲載プランは、検索結果の「PR」枠への優先出品・商品掲載・探されている需要の通知です。',
    `月額1,980円の掲載プランには含みません。AI販促担当（Light 月額${LIGHT}・Standard 月額${STANDARD}、税込）で、毎週の記事・SNS投稿文と画像・商品ページの直し案をお届けします。`],
  ['月額1,980円（税込）はHOSHILUの利用料です。', `月額料金（${PLAN_PRICES}）はHOSHILUの利用料です。`],
  ['<p class="price-label">HOSHILU SELLER</p>', '<p class="price-label">掲載プラン（まずはここから）</p>'],
  ['通常料金は月額1,980円（税込）。', `掲載プランは月額1,980円、AI販促担当は Light 月額${LIGHT}・Standard 月額${STANDARD}（いずれも税込）。`]
]);

export const PROMO_LEGAL_REPLACEMENTS = Object.freeze([
  ['<p>月額1,980円（税込）。初期費用・解約金は0円です。クリックによる従量課金はありません。</p>',
    `<p>掲載プラン 月額1,980円（税込）。AI販促担当 Light 月額${LIGHT}（税込）、AI販促担当 Standard 月額${STANDARD}（税込）。初期費用・解約金は0円です。クリックによる従量課金はありません。</p>`]
]);

export const PROMO_TERMS_REPLACEMENTS = Object.freeze([
  ['無料期間終了後（31日目）から月額1,980円（税込）の有料契約に自動移行します。',
    `無料期間終了後（31日目）から、申し込んだプランの月額料金（${PLAN_PRICES}）の有料契約に自動移行します。`]
]);

function replaceBetween(html, start, end, replacement) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from);
  if (from === -1 || to === -1) return html;
  return html.slice(0, from) + replacement + html.slice(to + end.length);
}

function applyReplacements(html, pairs) {
  return pairs.reduce((out, [from, to]) => out.split(from).join(to), html);
}

// JSON-LD は文字列置換ではなく、読み直してから offers と FAQ を 3 段に揃える。
function promoJsonLd(html) {
  return html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/u, (whole, body) => {
    let data;
    try { data = JSON.parse(body); } catch { return whole; }
    for (const node of data['@graph'] || []) {
      if (node['@type'] === 'Service' && node.offers && !Array.isArray(node.offers)) {
        node.offers = [
          { ...node.offers, name: '掲載プラン' },
          { '@type': 'Offer', name: 'AI販促担当 Light', price: String(PROMO_PAID_PLANS.LIGHT.unit_amount), priceCurrency: 'JPY',
            description: `月額・税込。毎週、記事1本・SNS投稿文2本と画像・商品ページの直し案1件。${trialCopy(LIGHT)}` },
          { '@type': 'Offer', name: 'AI販促担当 Standard', price: String(PROMO_PAID_PLANS.STANDARD.unit_amount), priceCurrency: 'JPY',
            description: `月額・税込。Light の内容に加えて、お店のサイト（WordPress）への公開・楽天GOLD 用の HTML・任意の声フォーム・需要への再案内。${trialCopy(STANDARD)}` }
        ];
      }
      if (node['@type'] === 'FAQPage' && Array.isArray(node.mainEntity)) {
        for (const q of node.mainEntity) {
          const text = q?.acceptedAnswer?.text;
          if (typeof text === 'string') q.acceptedAnswer.text = applyReplacements(text, PROMO_LP_REPLACEMENTS);
        }
        const known = new Set(node.mainEntity.map((q) => q.name));
        const added = Object.entries(FAQ_PROMO_ANSWERS).filter(([name]) => !known.has(name))
          .map(([name, text]) => ({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } }));
        node.mainEntity = [...added, ...node.mainEntity];
      }
    }
    return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
  });
}

// pathname: '/for-sellers' | '/legal' | '/terms'。販売 OFF のときは呼ばない（呼び出し側で promoPlansEnabled を見る）。
export function applyPromoPlansToPublicPage(pathname, html) {
  if (pathname === '/for-sellers') {
    let out = promoJsonLd(String(html));
    out = replaceBetween(out, PROMO_LP_MARKERS.heroStart, PROMO_LP_MARKERS.heroEnd, PROMO_LP_HERO);
    out = replaceBetween(out, PROMO_LP_MARKERS.pricingHeadStart, PROMO_LP_MARKERS.pricingHeadEnd, PROMO_LP_PRICING_HEAD);
    out = out.replace(PROMO_LP_MARKERS.sections, PROMO_LP_SECTIONS).replace(PROMO_LP_MARKERS.pricing, PROMO_LP_PRICING)
      .replace(PROMO_LP_MARKERS.faq, PROMO_LP_FAQ);
    // JSON-LD の外（本文）だけに置き換えを当てる（JSON-LD は上で済）。
    const [head, ...rest] = out.split('</script></head>');
    return rest.length ? [head, applyReplacements(rest.join('</script></head>'), PROMO_LP_REPLACEMENTS)].join('</script></head>') : applyReplacements(out, PROMO_LP_REPLACEMENTS);
  }
  if (pathname === '/legal') return applyReplacements(String(html), PROMO_LEGAL_REPLACEMENTS);
  if (pathname === '/terms') return applyReplacements(String(html), PROMO_TERMS_REPLACEMENTS);
  return html;
}
