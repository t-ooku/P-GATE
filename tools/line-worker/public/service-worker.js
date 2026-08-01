const CACHE = 'hoshilu-shell-v125';
const SHELL = ['/', '/privacy.html', '/terms.html', '/styles.css', '/seo-pages.css', '/seo/hoshilu-seo-hero-v1.png', '/seo/hoshilu-category-guide-v1.png', '/wish-carousel.css', '/mywatch.css', '/hero-fixes.css', '/hero-slides.css', '/hero-slides.mjs', '/hoshilu-fashion-collage-v1.png', '/hoshilu-electronics-collage-v1.png', '/lp-layout.mjs', '/marketplace-coverage.css', '/marketplace-coverage.mjs', '/sale-center.css', '/sale-center.mjs', '/hero-collage-overlay.css', '/hero-collage-overlay.mjs', '/discovery.css', '/hoshilu-discovery-collage.webp', '/hoshilu-discovery-collage-mobile.webp', '/sticky-nav.css', '/speech-input.css', '/speech-input.js', '/social-share-targets.js', '/install.css', '/app.js', '/growth-analytics.mjs', '/campaign-attribution.mjs', '/wish-localization.mjs', '/marketplace-search-keywords-v2.mjs', '/manifest-v2.webmanifest', '/og-hoshilu.png', '/icons/icon.svg', '/icons/hoshilu-v2-180.png', '/icons/hoshilu-v2-192.png', '/icons/hoshilu-v2-512.png', '/auth.css', '/site-i18n.js', '/member-login.js', '/login.html', '/seller-login.html', '/seller-login.js'];

SHELL.push('/discovery-actions.mjs');

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/seller') || url.pathname === '/go') return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request).then((response) => response || caches.match('/'))));
});
