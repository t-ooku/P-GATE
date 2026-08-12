const ORIGIN = 'https://hoshilu.app';
const UPDATED_AT = '2026-08-12';

const jaDefaults = {
  audience: [
    '商品名や型番は分からないものの、用途や見た目は説明できる人',
    '複数の購入先を行き来せず、同じ条件で探し始めたい人',
    '検索語の作り方に自信がなく、条件を整理してから探したい人'
  ],
  criteria: [
    ['商品を特定する手がかり', '商品名、型番、ブランド、用途、色、形、サイズ、使う人の順に、分かる項目だけを整理します。'],
    ['同一商品かどうか', '型番、容量、色、セット数、対応機種が一致するかを確認します。似た商品は同じ価格比較に混ぜません。'],
    ['購入前の最終確認', '価格、送料、在庫、販売条件は変わるため、必ず遷移先の販売ページで確認します。']
  ],
  comparison: [
    ['商品名・型番が分かる', '型番や正式名称をそのまま入力', '同一商品を見分けやすい'],
    ['用途だけ分かる', '使う人・場面・予算・避けたい条件を入力', '候補を絞る条件が重要'],
    ['見た目だけ覚えている', '色・形・大きさ・見た場所を入力', '類似商品を含めて探し、後から違いを確認']
  ],
  evidence: [
    'HOSHILUが画面上で取得元と確認状態を示している情報を優先します。',
    '価格や在庫は取得日時を確認し、最新状況は販売ページで再確認します。',
    'AIの役割は条件整理です。商品、価格、在庫、口コミ、ランキングの事実は作りません。'
  ],
  review: '口コミは評価点だけでなく、件数、投稿日、利用条件、低評価で繰り返される指摘を確認します。少数の高評価だけで決めず、自分の用途と近い投稿を探してください。HOSHILU上に取得元を確認できる口コミがない場合は、販売ページで確認します。',
  identity: '同じ名称でも、型番、容量、カラー、対応機種、付属品、セット数が異なれば別商品です。比較前にこれらをそろえ、完全一致しない候補は「類似商品」として分けて見てください。',
  faq: [
    ['商品名が分からなくても検索できますか？', 'はい。色、形、用途、見た場所など、覚えている特徴を文章で入力できます。'],
    ['表示された価格は確定価格ですか？', 'いいえ。取得日時や確認状態を見て、購入前に必ず販売ページで最新価格、送料、在庫を確認してください。']
  ]
};

const enDefaults = {
  audience: [
    'People who remember the purpose or appearance but not the product name',
    'People who want to begin with the same conditions across shopping destinations',
    'People who want help turning a description into searchable terms'
  ],
  criteria: [
    ['Product clues', 'Use the official name or model number when known. Otherwise add purpose, color, shape, size, and who will use it.'],
    ['Product identity', 'Match the model, capacity, color, pack quantity, and compatible device before comparing offers.'],
    ['Final purchase check', 'Price, shipping, availability, and terms change. Confirm them on the seller page before buying.']
  ],
  comparison: [
    ['Name or model known', 'Enter the exact name or model', 'Best for identifying the same product'],
    ['Purpose known', 'Add user, situation, budget, and exclusions', 'Useful for narrowing candidates'],
    ['Appearance remembered', 'Add color, shape, size, and where you saw it', 'Explore similar candidates, then verify differences']
  ],
  evidence: [
    'Prefer information whose source and confirmation state are visible in HOSHILU.',
    'Check the retrieval time for price or availability and reconfirm on the marketplace.',
    'AI organizes the request. It must not invent products, prices, availability, reviews, or rankings.'
  ],
  review: 'Do not rely on a rating alone. Check review count, date, usage context, and repeated concerns in lower ratings. If HOSHILU does not show reviews with a verifiable source, check the marketplace page.',
  identity: 'Products with a similar name may differ by model, capacity, color, compatibility, accessories, or pack quantity. Compare exact matches separately from similar products.',
  faq: [
    ['Can I search without knowing the product name?', 'Yes. Describe any clues you remember, including color, shape, purpose, and where you saw it.'],
    ['Is a displayed price guaranteed?', 'No. Check the retrieval time and confirm the current price, shipping, and availability on the marketplace before buying.']
  ]
};

const guide = (locale, input) => ({ ...(locale === 'ja' ? jaDefaults : enDefaults), ...input });

const pages = {
  'american-products-in-japan': {
    ja: guide('ja', {
      title: 'アメリカ商品を日本で探す方法',
      description: 'アメリカ商品や海外商品を、英語名や特徴から日本の購入先で探す手順を解説します。',
      conclusion: '英語の商品名が分かればそのまま入力し、分からなければ用途・形・見た場所を加えるのが近道です。候補が出たら型番や容量をそろえ、販売ページで輸入条件と最新情報を確認してください。',
      query: 'アメリカで見た、透明で小さいワイヤレスイヤホン',
      tips: ['英語の商品名やブランド名は無理に日本語へ置き換えない', '電圧、対応規格、サイズなど日本で使う条件を加える', '並行輸入品は保証、付属品、販売者の説明を購入前に確認する']
    }),
    en: guide('en', {
      title: 'Find American products in Japan',
      description: 'Search for US and overseas products available from shopping destinations in Japan, even when you do not know the Japanese name.',
      conclusion: 'Use the English name when you know it. Otherwise describe its purpose, appearance, and where you saw it. Verify the exact model, compatibility, seller terms, and current availability before buying.',
      query: 'small transparent wireless earbuds I saw in the US',
      tips: ['Keep the English brand or model name', 'Add Japan compatibility requirements', 'Check warranty, accessories, and seller terms for imported products']
    })
  },
  'find-product-without-name': {
    ja: guide('ja', {
      title: '商品名が分からない商品を探す方法',
      description: 'SNSや街で見た商品の名前を忘れても、用途・見た目・見た場所から検索条件を作る方法を解説します。',
      conclusion: '「どこで見た・誰が使う・何に使う・どんな形」の4点を、分かる範囲で文章にしてください。HOSHILUが条件を検索向けに整理し、実在する候補と購入先を探します。',
      query: 'SNSで見た、スマホの写真をその場で印刷できる手のひらサイズのもの',
      tips: ['商品名を推測して決め打ちしない', '色、素材、大きさ、動き方を具体的に書く', '候補が違うときは「違う点」を次の検索条件に加える']
    }),
    en: guide('en', {
      title: 'Find a product without knowing its name',
      description: 'Turn an incomplete memory from social media or daily life into useful product search conditions.',
      conclusion: 'Describe where you saw it, who uses it, what it does, and what it looks like. HOSHILU organizes those clues into a product search without inventing a product.',
      query: 'a palm-sized thing that prints phone photos on the spot',
      tips: ['Do not lock onto a guessed product name', 'Add color, material, size, or movement', 'When a candidate is wrong, add the difference to the next search']
    })
  },
  'how-to-search-by-description': {
    ja: guide('ja', {
      title: '特徴から商品を探す方法',
      description: '色・形・用途・予算など、覚えている特徴から商品検索を始める具体的な書き方を紹介します。',
      conclusion: '検索文は長くても構いません。商品カテゴリ、使う人、利用場面、必須条件、避けたい条件の順に書くと、候補を比較しやすくなります。',
      query: '机で使う、折りたためて明るさを変えられる小さいライト',
      tips: ['必須条件と、できれば欲しい条件を分ける', '「軽い」だけでなく持ち運ぶ場面を書く', '予算は上限として明記し、送料込みかを販売ページで確認する']
    }),
    en: guide('en', {
      title: 'How to search for a product by description',
      description: 'Use color, shape, purpose, budget, and other remembered details to begin a product search.',
      conclusion: 'A full sentence is fine. State the category, user, situation, required conditions, and exclusions so that candidates are easier to compare.',
      query: 'a small foldable desk light with adjustable brightness',
      tips: ['Separate required conditions from preferences', 'Describe the situation instead of using only a vague adjective', 'State a budget ceiling and check whether shipping is included']
    })
  },
  'shopping-in-japan': {
    ja: guide('ja', {
      title: '日本で海外商品を探す買い物ガイド',
      description: '日本語の商品名が分からない海外商品を、英語や特徴から日本の購入先で探す方法を解説します。',
      conclusion: '母国語や英語の商品名を残し、日本で必要な対応規格や配送条件を追加してください。候補は商品同一性を確認し、販売者・送料・返品条件を販売ページで確認します。',
      query: '海外で使っていた、USB-Cで充電する小さい旅行用ライト',
      tips: ['分かる場合は原語の商品名を入力する', '日本で使える規格や対応機種を条件に加える', '配送、返品、保証の条件を購入先で確認する']
    }),
    en: guide('en', {
      title: 'Shopping in Japan for international residents',
      description: 'Find familiar overseas products from shopping destinations in Japan using English or remembered features.',
      conclusion: 'Keep the original or English product name and add any compatibility or delivery requirements for Japan. Verify the exact product and seller terms before buying.',
      query: 'small USB-C travel light I used overseas',
      tips: ['Use the original-language name when known', 'Add compatibility requirements for use in Japan', 'Confirm shipping, returns, and warranty on the seller page']
    })
  },
  'product-requests': {
    ja: guide('ja', {
      title: '見つからない商品を保存して探し直す方法',
      description: '一度で見つからない商品を検索条件として保存し、新しい候補をあとから確認する手順を解説します。',
      conclusion: '最初に特徴から検索し、候補が足りない場合は検索条件を保存します。保存するのは商品条件であり、住所・電話番号などの個人情報は入力しないでください。',
      query: '昔見た、iPhoneの後ろにつける丸い磁石のような充電器',
      tips: ['見つからなかった検索文をそのまま捨てずに保存する', '候補が違った理由を条件へ追加して再検索する', '個人情報や購入に不要な情報は入力しない']
    }),
    en: guide('en', {
      title: 'Save an unresolved product search and try again',
      description: 'Save product conditions when the first search is not enough, then return to check for new candidates.',
      conclusion: 'Search from remembered features first. If the candidates are not enough, save the product conditions without adding personal information.',
      query: 'a round magnetic charger attached to the back of an iPhone',
      tips: ['Save the unresolved search instead of discarding it', 'Add why a candidate was wrong before trying again', 'Do not include personal information']
    })
  },
  'compare-amazon-rakuten-yahoo-shopping': {
    ja: guide('ja', {
      title: 'Amazon・楽天市場・Yahoo!ショッピングを比較して探す方法',
      description: '同じ検索条件をAmazon・楽天市場・Yahoo!ショッピングへ引き継ぎ、商品と購入条件を比較する手順を解説します。',
      conclusion: 'HOSHILUでは楽天市場とYahoo!ショッピングの商品候補をまとめて確認し、Amazonは同じ検索条件を引き継いだ検索先で確認します。比較時は型番や容量をそろえ、価格だけでなく送料・在庫・販売者を販売ページで確認してください。',
      query: '型番が分かるワイヤレスイヤホンをAmazon 楽天市場 Yahoo!ショッピングで比較',
      tips: ['3モールで同じ型番・容量・セット数にそろえる', 'HOSHILUの確認済み情報と、モール検索先で確認する情報を区別する', '価格、送料、ポイント等を単純合算せず、購入時に適用される条件を確認する'],
      comparison: [
        ['楽天市場', 'HOSHILUのまとめて検索対象', '取得できた商品候補と確認状態を見て、販売ページで最終確認'],
        ['Yahoo!ショッピング', 'HOSHILUのまとめて検索対象', '取得できた商品候補と確認状態を見て、販売ページで最終確認'],
        ['Amazon', '同じ検索条件を引き継ぐ個別検索先', '検索結果で同一商品を確認し、価格・送料・在庫を確認']
      ]
    })
  },
  'search-product-by-model-number': {
    ja: guide('ja', {
      title: '商品名・型番から同じ商品を探す方法',
      description: '商品名や型番が分かるときに、表記ゆれを抑えて同一商品と購入先を探す手順を解説します。',
      conclusion: '型番は記号や数字を省略せず入力し、商品名は補助として加えます。候補ごとに型番、容量、色、セット数、対応機種を照合してから購入条件を比較してください。',
      query: '商品名と型番を入力して同じ商品を複数モールで探す',
      tips: ['本体や箱、メーカーの商品情報で型番を確認する', 'ハイフン、世代、末尾記号を省略しない', '同じシリーズ名でも仕様違いは別商品として扱う']
    })
  },
  'how-to-compare-the-same-product': {
    ja: guide('ja', {
      title: '同じ商品を正しく比較する方法',
      description: '容量・色・セット数・対応機種の違いを見落とさず、同一商品だけを比較するための確認項目を解説します。',
      conclusion: '比較前に商品識別条件を固定することが最重要です。型番が一致しても容量やセット内容が異なる場合があるため、商品ページの仕様と販売単位まで確認します。',
      query: '同じ型番 容量 色 セット数をそろえて購入先を比較',
      tips: ['型番だけでなく容量、色、セット内容も照合する', '本体とアクセサリー、旧型と新型を混ぜない', '送料込み総額を確認できない場合は最安と断定しない'],
      comparison: [
        ['完全一致', '型番・容量・色・セット数・対応機種が一致', '同一商品の購入条件として比較'],
        ['一部違い', '容量、色、付属品、セット数のいずれかが違う', '類似商品として分離'],
        ['確認不能', '商品ページで識別情報を確認できない', '比較保留。販売ページで追加確認']
      ]
    })
  },
  'shopping-guide-for-parents': {
    ja: guide('ja', {
      title: '子ども用品を用途から探す買い物ガイド',
      description: '子どもの年齢、使用場面、サイズ、安全上の注意を整理して、商品名が分からない用品を探す方法を解説します。',
      conclusion: '年齢だけで決めず、使う場面、体格、保護者が確認したい条件を検索文に含めます。対象年齢や注意事項は候補名から推測せず、メーカー・販売ページの表示を確認してください。',
      query: '5歳の子が家で使う、片付けやすく角が少ない工作用テーブル',
      tips: ['年齢、体格、利用場所、保護者が重視する条件を書く', '対象年齢、材質、注意事項を販売ページで確認する', '口コミは子どもの年齢や使った環境が近い投稿を確認する']
    })
  },
  'shopping-guide-for-seniors': {
    ja: guide('ja', {
      title: '高齢者が使いやすい商品を用途から探すガイド',
      description: '握りやすさ、見やすさ、重さ、操作方法など、使う人に合う条件から商品を探す方法を解説します。',
      conclusion: '「高齢者向け」という言葉だけで決めず、握力、視認性、重さ、操作回数、使用場所を具体的な条件にします。医療・介護上の適合性は商品名から判断せず、必要に応じて専門職やメーカーへ確認してください。',
      query: '高齢の家族が使う、表示が大きく操作が少ない軽いタイマー',
      tips: ['使う人の困りごとを本人と確認して検索条件にする', '文字の大きさ、ボタン数、重さ、電源方式を確認する', '医療・介護用途では適合性を販売ページだけで断定しない']
    })
  }
};

const esc = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

const pathFor = (locale, slug) => `/${locale}/${slug}`;

export const seoPagePaths = Object.entries(pages).flatMap(([slug, locales]) =>
  Object.keys(locales).map((locale) => pathFor(locale, slug))
);

function list(items) {
  return `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;
}

function table(rows, locale) {
  const headings = locale === 'ja'
    ? ['確認する状況', '入力・確認方法', '比較時の考え方']
    : ['Situation', 'What to enter or check', 'How to compare'];
  return `<div class="seo-table-wrap"><table><thead><tr>${headings.map((heading) => `<th>${esc(heading)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function alternateLinks(slug, locale) {
  const available = pages[slug];
  const links = Object.keys(available).map((language) =>
    `<link rel="alternate" hreflang="${language}" href="${ORIGIN}${pathFor(language, slug)}">`
  );
  const fallback = available.ja ? 'ja' : Object.keys(available)[0];
  links.push(`<link rel="alternate" hreflang="x-default" href="${ORIGIN}${pathFor(fallback, slug)}">`);
  return links.join('');
}

function relatedLinks(locale, currentSlug) {
  const preferred = locale === 'ja'
    ? ['find-product-without-name', 'how-to-search-by-description', 'compare-amazon-rakuten-yahoo-shopping', 'how-to-compare-the-same-product']
    : ['find-product-without-name', 'how-to-search-by-description', 'shopping-in-japan', 'american-products-in-japan'];
  return preferred.filter((slug) => slug !== currentSlug && pages[slug]?.[locale]).slice(0, 3)
    .map((slug) => `<li><a href="${pathFor(locale, slug)}">${esc(pages[slug][locale].title)}</a></li>`).join('');
}

function structuredData(page, locale, slug, canonical) {
  const graph = [
    {
      '@type': 'Article', '@id': `${canonical}#article`, headline: page.title,
      description: page.description, dateModified: UPDATED_AT, inLanguage: locale,
      mainEntityOfPage: canonical, author: { '@type': 'Organization', name: 'HOSHILU', url: ORIGIN },
      publisher: { '@type': 'Organization', name: 'HOSHILU', url: ORIGIN }
    },
    {
      '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'HOSHILU', item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: page.title, item: canonical }
      ]
    },
    {
      '@type': 'FAQPage', mainEntity: page.faq.map(([name, text]) => ({
        '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text }
      }))
    }
  ];
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

export function renderSeoPage(pathname) {
  const match = /^\/(ja|en)\/([a-z-]+)\/?$/.exec(pathname);
  if (!match) return null;
  const [, locale, slug] = match;
  const page = pages[slug]?.[locale];
  if (!page) return null;
  const canonical = `${ORIGIN}${pathFor(locale, slug)}`;
  const isJa = locale === 'ja';
  const searchLabel = isJa ? '探したい商品の条件' : 'Product conditions';
  const submit = isJa ? 'この条件でHOSHILU検索へ' : 'Search these conditions with HOSHILU';
  const labels = isJa ? {
    conclusion: '結論', audience: 'この方法が向く人', criteria: '選ぶ条件と注意点', comparison: '候補を比較するときの見方',
    evidence: 'おすすめ・比較の根拠', reviews: '口コミを確認するときのポイント', identity: '同一商品と類似商品の違い',
    try: 'HOSHILUで実際に探す', sources: '情報取得元と更新日', related: '関連記事', faq: 'よくある質問',
    sourceText: 'HOSHILU本番公開画面・公開機能仕様。価格・在庫・販売条件は各販売ページで確認してください。'
  } : {
    conclusion: 'Conclusion', audience: 'Who this method is for', criteria: 'Selection criteria and cautions', comparison: 'How to compare candidates',
    evidence: 'Basis for recommendations and comparisons', reviews: 'How to check reviews', identity: 'Exact matches and similar products',
    try: 'Search with HOSHILU', sources: 'Sources and last update', related: 'Related guides', faq: 'Frequently asked questions',
    sourceText: 'HOSHILU production pages and published feature specifications. Confirm price, availability, and seller terms on each marketplace.'
  };
  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(page.title)} | HOSHILU</title><meta name="description" content="${esc(page.description)}"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<link rel="canonical" href="${canonical}">${alternateLinks(slug, locale)}
<meta property="og:type" content="article"><meta property="og:site_name" content="HOSHILU"><meta property="og:title" content="${esc(page.title)}"><meta property="og:description" content="${esc(page.description)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${ORIGIN}/og/hoshilu-x-v3.png">
<link rel="stylesheet" href="/seo-article.css"><script type="application/ld+json">${structuredData(page, locale, slug, canonical)}</script></head>
<body data-seo-article-id="${esc(slug)}"><header class="seo-header"><a href="/" aria-label="HOSHILU home">HOSHILU <small>${isJa ? 'ホシル' : 'product discovery'}</small></a></header>
<main class="seo-shell"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">HOSHILU</a><span aria-hidden="true">›</span><span>${esc(page.title)}</span></nav>
<article><header class="seo-hero"><p class="eyebrow">HOSHILU SHOPPING GUIDE</p><h1>${esc(page.title)}</h1><p class="lead">${esc(page.description)}</p><p class="updated"><time datetime="${UPDATED_AT}">${isJa ? '最終更新' : 'Last updated'}: ${UPDATED_AT}</time></p></header>
<section class="answer"><h2>${labels.conclusion}</h2><p>${esc(page.conclusion)}</p></section>
<section><h2>${labels.audience}</h2>${list(page.audience)}</section>
<section><h2>${labels.criteria}</h2><dl>${page.criteria.map(([term, description]) => `<div><dt>${esc(term)}</dt><dd>${esc(description)}</dd></div>`).join('')}</dl>${page.tips ? list(page.tips) : ''}</section>
<section><h2>${labels.comparison}</h2>${table(page.comparison, locale)}</section>
<aside class="mid-cta"><h2>${labels.try}</h2><p>${isJa ? '例を編集して、現在のHOSHILU検索へ進めます。' : 'Edit the example and continue to the current HOSHILU search.'}</p><form action="/" method="get" data-seo-search-form><label for="seo-search">${searchLabel}</label><textarea id="seo-search" name="q" required maxlength="200">${esc(page.query)}</textarea><button type="submit">${submit}</button></form></aside>
<section><h2>${labels.evidence}</h2>${list(page.evidence)}</section>
<section><h2>${labels.reviews}</h2><p>${esc(page.review)}</p></section>
<section><h2>${labels.identity}</h2><p>${esc(page.identity)}</p></section>
<section><h2>${labels.faq}</h2>${page.faq.map(([question, answer]) => `<details><summary>${esc(question)}</summary><p>${esc(answer)}</p></details>`).join('')}</section>
<section class="source-note"><h2>${labels.sources}</h2><p>${esc(labels.sourceText)}</p><p>${isJa ? '最終更新日' : 'Last updated'}: <time datetime="${UPDATED_AT}">${UPDATED_AT}</time></p></section>
<nav class="related" aria-label="${labels.related}"><h2>${labels.related}</h2><ul>${relatedLinks(locale, slug)}</ul></nav>
<p class="bottom-cta"><a href="/?q=${encodeURIComponent(page.query)}" data-seo-search-link>${submit}</a></p></article></main>
<footer><a href="/privacy.html">${isJa ? 'プライバシー' : 'Privacy'}</a><a href="/terms.html">${isJa ? '利用上の注意' : 'Terms'}</a></footer>
<script type="module" src="/seo-article-analytics.mjs"></script></body></html>`;
}
