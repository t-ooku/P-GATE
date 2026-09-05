// 2026-09-05 夜 大隆さん指示: トップに「ショップから探す」。/api/shops（掲載中ショップ）を
// そのまま並べる。先駆者は ITG の3店舗。ショップが0件なら欄を畳む。
const root = document.querySelector('#shopDirectoryList');
const section = document.querySelector('#shopDirectory');
const button = document.querySelector('#shopSearchButton');

const text = (value) => String(value ?? '');

function el(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

function card(shop) {
  const link = el('a', 'shop-directory-card');
  link.href = text(shop.url || `/shop/${shop.slug}`);
  const logo = el('span', 'shop-directory-logo');
  if (/^https:\/\//i.test(text(shop.logo_url)) || text(shop.logo_url).startsWith('/')) {
    const img = document.createElement('img');
    img.src = text(shop.logo_url); img.alt = ''; img.loading = 'lazy'; img.width = 56; img.height = 56;
    logo.append(img);
  } else {
    logo.classList.add('shop-directory-logo-text');
    logo.textContent = text(shop.name).slice(0, 1).toUpperCase();
  }
  const body = el('span', 'shop-directory-body');
  body.append(el('strong', 'shop-directory-name', text(shop.name)));
  if (shop.tagline) body.append(el('small', 'shop-directory-tagline', text(shop.tagline)));
  if (shop.coupon) body.append(el('em', 'shop-directory-coupon', 'HOSHILU限定クーポンあり'));
  link.append(logo, body, el('span', 'shop-directory-arrow', '→'));
  // 2026-09-05 夜 大隆さん指示: 各ショップの Amazon ストアフロントへの直リンクも掲示。
  if (/^https:\/\/www\.amazon\.co\.jp\//i.test(text(shop.amazon_url))) {
    const wrap = el('div', 'shop-directory-item');
    const amazon = el('a', 'shop-directory-amazon', 'Amazonのショップページを見る →');
    amazon.href = text(shop.amazon_url); amazon.target = '_blank'; amazon.rel = 'nofollow sponsored noopener';
    wrap.append(link, amazon);
    return wrap;
  }
  return link;
}

function render(shops) {
  root.textContent = '';
  if (!shops.length) { section.classList.add('hidden'); button?.classList.add('hidden'); return; }
  for (const shop of shops) root.append(card(shop));
}

async function load() {
  if (!root || !section) return;
  try {
    const response = await fetch('/api/shops', { headers: { accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok || payload.ok !== true) throw new Error(payload.error || 'SHOP_DIRECTORY_FAILED');
    render(Array.isArray(payload.shops) ? payload.shops : []);
  } catch {
    section.classList.add('hidden');
    button?.classList.add('hidden');
  }
}

button?.addEventListener('click', () => {
  section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

load();
