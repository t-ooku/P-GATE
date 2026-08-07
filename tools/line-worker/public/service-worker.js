const CACHE = 'hoshilu-shell-v310';
const SHELL = ['/', '/privacy.html', '/terms.html', '/styles.css', '/seo-pages.css', '/seo/hoshilu-seo-hero-v1.png', '/seo/hoshilu-category-guide-v1.png', '/wish-carousel.css', '/mywatch.css', '/hero-fixes.css', '/hero-slides.css', '/hero-slides.mjs', '/hoshilu-fashion-collage-v1.png', '/hoshilu-electronics-collage-v1.png', '/lp-layout.mjs', '/marketplace-coverage.css', '/marketplace-coverage.mjs', '/sale-center.css', '/sale-center.mjs', '/hero-collage-overlay.css', '/hero-collage-overlay.mjs', '/discovery.css', '/hoshilu-discovery-collage.webp', '/hoshilu-discovery-collage-mobile.webp', '/sticky-nav.css', '/speech-input.css', '/speech-input.js', '/social-share-targets.js', '/install.css', '/app.js', '/growth-analytics.mjs', '/campaign-attribution.mjs', '/wish-localization.mjs', '/marketplace-search-keywords-v2.mjs', '/manifest-v2.webmanifest', '/og-hoshilu.png', '/icons/icon.svg', '/icons/hoshilu-v2-180.png', '/icons/hoshilu-v2-192.png', '/icons/hoshilu-v2-512.png', '/auth.css', '/site-i18n.js', '/member-login.js', '/login.html', '/seller-login.html', '/seller-login.js'];

SHELL.push('/discovery-actions.mjs', '/growth-marketplaces.mjs', '/ai-search-ui.mjs', '/ai-search-ui.css', '/ai-search-layout-fix.css', '/layout-v3.css', '/announcements.mjs');

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/seller') || url.pathname.startsWith('/admin') || url.pathname === '/go') return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    }
    return response;
  // ignoreSearch: the precache stores '/app.js', but the page requests
  // '/app.js?v=91'. Without this the offline lookup always missed on exactly
  // the cache-busted assets the shell was meant to cover.
  }).catch(() => caches.match(event.request, { ignoreSearch: true }).then((response) => {
    if (response) return response;
    // Only navigations may fall back to the app shell. Previously *every*
    // miss fell back to '/', so a failed CSS/JS request was answered with
    // HTML - the stylesheet then failed to parse and the page rendered
    // completely unstyled (mall names as bullet lists, links as blue text).
    if (event.request.mode === 'navigate') return caches.match('/');
    return Response.error();
  })));
});

self.addEventListener('message',(event)=>{if(event.data?.type!=='HOSHILU_NOTIFY')return;const title=String(event.data.title||'HOSHILU').slice(0,120),body=String(event.data.body||'').slice(0,500);event.waitUntil(self.registration.showNotification(title,{body,icon:'/icons/hoshilu-v2-192.png',badge:'/icons/icon.svg',tag:String(event.data.id||'hoshilu-notification'),data:{url:'/#mywatchTitle'}}));});
self.addEventListener('notificationclick',(event)=>{event.notification.close();event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then((windows)=>{const existing=windows.find((item)=>item.url.startsWith(self.location.origin));if(existing)return existing.focus();return clients.openWindow(event.notification.data?.url||'/');}));});
