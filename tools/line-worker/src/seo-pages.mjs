const ORIGIN = 'https://hoshilu.app';

const pages = {
  'american-products-in-japan': {
    ja: ['アメリカ商品を日本で探す', 'アメリカ商品や海外商品を、名前が分からなくても特徴から探せます。', '母国やSNSで見た商品の色・形・用途を入力してください。Amazon、楽天市場、Qoo10、SHEINの購入先を横断して確認できます。'],
    en: ['Find American products in Japan', 'Find US and overseas products available in Japan—even when you do not know the product name.', 'Describe the color, shape, use, or where you saw it. HOSHILU helps you compare available listings across Amazon, Rakuten, Qoo10, and SHEIN.']
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
  const question = locale === 'ja' ? '商品名が分からなくても検索できますか？' : 'Can I search without knowing the product name?';
  const answer = locale === 'ja'
    ? 'はい。色、形、用途、見た場所など、覚えている特徴をそのまま入力できます。'
    : 'Yes. Enter any clues you remember, such as color, shape, purpose, or where you saw it.';
  const canonical = `${ORIGIN}/${locale}/${slug}`;
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | HOSHILU</title><meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}"><link rel="alternate" hreflang="${locale}" href="${canonical}">
<link rel="alternate" hreflang="${alternate}" href="${ORIGIN}/${alternate}/${slug}"><link rel="alternate" hreflang="x-default" href="${ORIGIN}/en/${slug}">
<link rel="stylesheet" href="/styles.css"></head>
<body><main class="shell"><section class="hero"><p class="eyebrow">HOSHILU</p><h1>${esc(title)}</h1><p>${esc(description)}</p>
<form action="/" method="get"><label for="seo-search">${esc(searchLabel)}</label><textarea id="seo-search" name="q" required maxlength="500"></textarea><button type="submit">${esc(submit)}</button></form>
</section><section><h2>${esc(faqTitle)}</h2><p>${esc(body)}</p><details><summary>${esc(question)}</summary><p>${esc(answer)}</p></details>
<p><a href="/">${locale === 'ja' ? 'HOSHILUの検索画面へ' : 'Open HOSHILU search'}</a> · <a href="/login.html">MYWISH</a></p></section></main></body></html>`;
}

