const ORIGIN = 'https://hoshilu.app';

const pages = {
  'american-products-in-japan': {
    ja: ['アメリカ商品を日本で探す', 'アメリカ商品や海外商品を、名前が分からなくても特徴から探せます。', '母国やSNSで見た商品の色・形・用途を入力してください。Amazon、楽天市場、Yahoo!ショッピング、Qoo10、SHEINの主要5モールを確認し、ファッション検索時だけ追加5モールを加えます。表示する商品リンクは確認済みのものに限ります。'],
    en: ['Find American products in Japan', 'Find US and overseas products available in Japan—even when you do not know the product name.', 'Describe the color, shape, use, or where you saw it. HOSHILU checks five core marketplaces—Amazon, Rakuten, Yahoo Shopping, Qoo10, and SHEIN—and adds five fashion marketplaces only for fashion searches. Product links are shown only when verified.']
  },
  'find-product-without-name': {
    ja: ['商品名が分からない商品を探す', 'SNSで見た商品の名前を忘れても、覚えている特徴から検索できます。', '見た場所、使い方、色、形、サイズを文章にすると、HOSHILUが商品向けの検索条件へ整理します。'],
    en: ['Find a product without knowing its name', 'Turn an incomplete memory into a useful product search.', 'Tell HOSHILU where you saw it, what it does, and what it looks like. The service turns those clues into product search terms.']
  },
  'how-to-search-by-description': {
    ja: ['特徴から商品を探す方法', '色・形・用途だけでも、商品検索を始められます。', '「透明で小さいイヤホン」「机で使う折りたたみライト」のように、分かることだけを入力してください。'],
    en: ['How to search for a product by description', 'Search by color, shape, purpose, or remembered context.', 'Try a phrase such as “small transparent wireless earbuds” or “foldable light for a desk.” Exact product names are optional.']
  },
  'shopping-in-japan': {
    ja: ['日本で海外商品を探す', '日本で買える海外商品を、複数のマーケットプレイスから探します。', '日本語名が分からない商品も、英語や覚えている特徴から検索できます。'],
    en: ['Shopping in Japan for international residents', 'Find overseas products and familiar items available from Japanese marketplaces.', 'Search in English or describe what you remember. HOSHILU supports product discovery without requiring a Japanese product name.']
  },
  'product-requests': {
    ja: ['探してほしい商品をリクエスト', '見つからない商品をMYWISHへ保存し、あとから再検索できます。', '特徴や見た場所を入力して検索し、候補が足りない場合はMYWISHへ保存してください。個人情報は入力しないでください。'],
    en: ['Request help finding a product', 'Save an unresolved search to MYWISH and return when new candidates are available.', 'Describe the product and search first. If the result is not enough, save it to MYWISH. Do not include personal information.']
  },
  'find-product-seen-online': {
    ja: ['動画や記事で見た商品を探す方法', '動画、記事、店頭や街中で見た商品の名前が分からなくても、見た場所や色・形・用途などの手がかりから検索できます。', '見た媒体や場所、色、形、大きさ、素材、使われ方など、確かな手がかりから入力してください。画像そのものを検索する機能ではありません。'],
    en: ['How to find a product you saw online or in person', 'Find a product seen in a video, article, shop, or public place by describing where you saw it and the details you remember.', 'Start with reliable clues such as the source or place, color, shape, size, material, and how the item was used. HOSHILU does not perform image search.']
  }
};

const faqs = {
  'american-products-in-japan': {
    ja: ['英語の商品名しか分からなくても探せますか？', 'はい。英語の商品名や、色・形・用途など覚えている特徴を入力して検索できます。各モールで購入できるかは、表示された商品ページで確認してください。'],
    en: ['Can I search using only an English product name?', 'Yes. Enter the English product name or describe details such as its color, shape, and purpose. Confirm current availability on the linked marketplace page.']
  },
  'find-product-without-name': {
    ja: ['商品名が分からなくても検索できますか？', 'はい。色、形、用途、見た場所など、覚えている特徴をそのまま入力できます。個人情報は入力しないでください。'],
    en: ['Can I search without knowing the product name?', 'Yes. Enter any clues you remember, such as color, shape, purpose, or where you saw it. Do not include personal information.']
  },
  'how-to-search-by-description': {
    ja: ['どのような特徴を入力すると探しやすいですか？', '色、形、大きさ、素材、用途、使う場所などを組み合わせてください。確実でない特徴は、断定せず「たぶん」などを添えて入力できます。'],
    en: ['Which details make a description search more useful?', 'Combine details such as color, shape, size, material, purpose, and where it is used. You can mark uncertain clues as approximate instead of presenting them as certain.']
  },
  'shopping-in-japan': {
    ja: ['日本語の商品名が分からなくても探せますか？', 'はい。英語や覚えている特徴から検索できます。価格、在庫、配送条件は変わるため、購入前に各モールの商品ページで確認してください。'],
    en: ['Do I need to know the Japanese product name?', 'No. You can search in English or describe the product. Prices, availability, and delivery terms can change, so confirm them on the marketplace page before purchasing.']
  },
  'product-requests': {
    ja: ['見つからない検索をあとで確認できますか？', '無料会員は検索内容をMYWISHへ保存して、あとから再検索できます。氏名、住所、連絡先などの個人情報は入力しないでください。'],
    en: ['Can I return to an unresolved search later?', 'Free members can save the search to MYWISH and try it again later. Do not enter personal information such as names, addresses, or contact details.']
  },
  'find-product-seen-online': {
    ja: ['画像をアップロードして検索できますか？', '現在は画像検索ではありません。見た場所、色、形、用途などを文章で入力してください。個人情報は入力しないでください。'],
    en: ['Can I upload an image to search?', 'HOSHILU currently uses text descriptions rather than image search. Describe where you saw the item and the details you remember, and do not include personal information.']
  }
};

const guideSteps = {
  'american-products-in-japan': {
    ja: ['英語名が分かればそのまま入力し、分からなければ用途を入力する', '色・形・サイズ・素材など、確かな特徴を1〜3個加える', '表示された候補の価格・在庫・配送条件を各モールで確認する'],
    en: ['Enter the English name when known, or start with what the product is used for', 'Add one to three reliable details such as color, shape, size, or material', 'Check the current price, availability, and delivery terms on the marketplace page']
  },
  'find-product-without-name': {
    ja: ['見た場所や使われ方を思い出す', '色・形・大きさなど、覚えている外見を加える', '候補が広すぎる場合は、違う点や除外したい特徴を追加する'],
    en: ['Start with where you saw the item or how it was used', 'Add remembered visual details such as color, shape, or size', 'If the results are too broad, add what looked different or what should be excluded']
  },
  'how-to-search-by-description': {
    ja: ['商品カテゴリまたは用途を短く書く', '色・形・素材・サイズから重要な特徴を加える', '確実でない内容には「たぶん」「〜のような」と添える'],
    en: ['Write a short product category or purpose', 'Add the most useful details from color, shape, material, and size', 'Mark uncertain clues with words such as “maybe” or “similar to”']
  },
  'shopping-in-japan': {
    ja: ['英語名、日本語名、または商品の用途を入力する', '日本で使うために必要なサイズ・電圧・規格などを加える', '購入前に配送地域、送料、返品条件を販売ページで確認する'],
    en: ['Enter the English name, Japanese name, or the product purpose', 'Add requirements for use in Japan, such as size, voltage, or standard', 'Confirm delivery area, shipping cost, and return terms before purchasing']
  },
  'product-requests': {
    ja: ['覚えている特徴だけで、まず横断検索する', '候補が足りなければ検索内容をMYWISHへ保存する', 'あとで再検索し、購入条件は各モールで確認する'],
    en: ['Run a cross-marketplace search with the clues you remember', 'If the candidates are not enough, save the search to MYWISH', 'Search again later and confirm purchase terms on the marketplace page']
  },
  'find-product-seen-online': {
    ja: ['動画・記事・店頭など、見た媒体や場所を書く', '色・形・素材・使われ方など、画面や現場で確認できた特徴を加える', '人物名や連絡先などの個人情報を除き、文章で検索する'],
    en: ['Write where you saw it, such as a video, article, shop, or public place', 'Add details you could observe, such as color, shape, material, or how it was used', 'Remove names, contact details, and other personal information before searching']
  }
};

const esc = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

export const seoPagePaths = Object.keys(pages).flatMap((slug) => [`/ja/${slug}`, `/en/${slug}`]);

export function renderSeoPage(pathname) {
  const match = /^\/(ja|en)\/([a-z-]+)\/?$/.exec(pathname);
  if (!match || !pages[match[2]]) return null;
  const [, locale, slug] = match;
  const [title, description, body] = pages[slug][locale];
  const alternate = locale === 'ja' ? 'en' : 'ja';
  const lang = locale === 'ja' ? 'ja' : 'en';
  const searchLabel = locale === 'ja' ? '覚えている特徴を入力' : 'Describe what you remember';
  const submit = locale === 'ja' ? 'HOSHILUで探す' : 'Search with HOSHILU';
  const faqTitle = locale === 'ja' ? 'よくある質問' : 'Frequently asked questions';
  const [question, answer] = faqs[slug][locale];
  const steps = guideSteps[slug][locale];
  const stepsTitle = locale === 'ja' ? '探すときの3ステップ' : 'Three steps to search';
  const canonical = `${ORIGIN}/${locale}/${slug}`;
  const shareImage = `${ORIGIN}/og/hoshilu-x-v3.png`;
  const ogLocale = locale === 'ja' ? 'ja_JP' : 'en_US';
  const ogLocaleAlternate = locale === 'ja' ? 'en_US' : 'ja_JP';
  const homeLabel = locale === 'ja' ? 'ホーム' : 'Home';
  const guideLabel = locale === 'ja' ? '商品検索ガイド' : 'Product search guides';
  const languageLabel = locale === 'ja' ? 'English' : '日本語';
  const relatedTitle = locale === 'ja' ? '関連する探し方' : 'Related search guides';
  const relatedLinks = Object.entries(pages)
    .filter(([relatedSlug]) => relatedSlug !== slug)
    .map(([relatedSlug, translations]) => `<li><a href="/${locale}/${relatedSlug}">${esc(translations[locale][0])}</a></li>`)
    .join('');
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: title, description, url: canonical, primaryImageOfPage: { '@type': 'ImageObject', url: shareImage, width: 1200, height: 630 }, isPartOf: { '@type': 'WebSite', name: 'HOSHILU', url: `${ORIGIN}/` } },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: homeLabel, item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: title, item: canonical }
      ] },
      { '@type': 'FAQPage', mainEntity: [{
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer }
      }] }
    ]
  };
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | HOSHILU</title><meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}"><link rel="alternate" hreflang="${locale}" href="${canonical}">
<link rel="alternate" hreflang="${alternate}" href="${ORIGIN}/${alternate}/${slug}"><link rel="alternate" hreflang="x-default" href="${ORIGIN}/ja/${slug}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)} | HOSHILU"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}">
<meta property="og:locale" content="${ogLocale}"><meta property="og:locale:alternate" content="${ogLocaleAlternate}">
<meta property="og:image" content="${shareImage}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="HOSHILU">
<script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g, '\\u003c')}</script>
<link rel="stylesheet" href="/styles.css"></head>
<body data-growth-content="seo_${slug.replaceAll('-', '_')}"><main class="shell"><nav aria-label="${esc(guideLabel)}"><a href="/">${esc(homeLabel)}</a><span aria-hidden="true"> / </span><span aria-current="page">${esc(title)}</span><span aria-hidden="true"> · </span><a class="language-switch" href="/${alternate}/${slug}" hreflang="${alternate}" lang="${alternate}">${esc(languageLabel)}</a></nav><section class="hero"><p class="eyebrow">HOSHILU</p><h1>${esc(title)}</h1><p>${esc(description)}</p>
<form action="/" method="get" data-growth-cta><label for="seo-search">${esc(searchLabel)}</label><textarea id="seo-search" name="q" required maxlength="200"></textarea><button type="submit">${esc(submit)}</button></form>
</section><section><h2>${esc(stepsTitle)}</h2><p>${esc(body)}</p><ol>${steps.map((step) => `<li>${esc(step)}</li>`).join('')}</ol><h2>${esc(faqTitle)}</h2><details><summary>${esc(question)}</summary><p>${esc(answer)}</p></details>
<p><a href="/">${locale === 'ja' ? 'HOSHILUの検索画面へ' : 'Open HOSHILU search'}</a> · <a href="/login.html">${locale === 'ja' ? '無料会員になる' : 'Create a free account'}</a></p></section><aside aria-labelledby="related-guides"><h2 id="related-guides">${esc(relatedTitle)}</h2><ul>${relatedLinks}</ul></aside></main><script type="module" src="/growth-analytics.mjs"></script></body></html>`;
}

