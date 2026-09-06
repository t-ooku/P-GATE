import { growthMarketplace } from './growth-marketplaces.mjs';
import { growthSessionId, growthVisitorId } from './growth-identity.mjs';

const params = new URLSearchParams(location.search);
let seoContext = null;
try {
  const stored = JSON.parse(sessionStorage.getItem('hoshilu_seo_context') || 'null');
  if (stored?.article_id && Date.now() - Number(stored.created_at || 0) < 30 * 60 * 1000) seoContext = stored;
  else sessionStorage.removeItem('hoshilu_seo_context');
} catch {}
// params.has() ではなく実値で判定する。?utm_source= のように空値で付いてくる
// URLだと has() が真になり、UTMが実質無いのにSEO文脈のフォールバックまで
// 止まって、流入元が丸ごと不明になっていた。
const hasUrlAttribution = ['utm_source', 'utm_medium', 'utm_campaign', 'campaign', 'utm_content']
  .some((name) => String(params.get(name) || '').trim() !== '');
const urlAttribution = {
  source: params.get('utm_source') || (!hasUrlAttribution && seoContext ? `seo_${seoContext.content_kind === 'hub' ? 'hub' : 'article'}` : ''),
  medium: params.get('utm_medium') || (!hasUrlAttribution && seoContext ? 'internal' : ''),
  campaign: params.get('utm_campaign') || params.get('campaign') || (!hasUrlAttribution && seoContext ? String(seoContext.search_intent || '').slice(0, 80) : ''),
  content: params.get('utm_content') || (!hasUrlAttribution && seoContext ? String(seoContext.article_id).slice(0, 64) : '')
};

// 流入元はセッションが続く限り引き継ぐ。
//
// これが無かったため、UTM付きで着地しても2ページ目以降のイベントは
// source='' になっていた。セッションIDは growth-identity.mjs が30分の
// スライディングTTLで維持するので、リロード・戻る・/privacy等への遷移・
// インストール済みPWAの再起動(start_urlにUTMは付かない)のたびに、同じ
// セッションの残りのイベントが「直接・不明」へ落ちる。
// 特に socialPromotionSummary はセッションではなく生イベントを数えるので、
// X/Instagramのファネルは初回ページ以降が丸ごと欠測していた。
//
// 内部SEO文脈(hoshilu_seo_context)は既にこの方式で引き継がれており、
// 外部からのUTMだけが引き継がれていなかった。この非対称は意図した設計
// ではなく実装漏れと判断して揃える。
//
// 個人を特定する情報は入れない(UTMの4項目のみ)。sessionStorageなので
// タブを閉じれば消える。
const ATTRIBUTION_KEY = 'hoshilu_growth_attribution';
const ATTRIBUTION_TTL_MS = 30 * 60 * 1000;
function storedAttribution() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(ATTRIBUTION_KEY) || 'null');
    if (!stored || Date.now() - Number(stored.created_at || 0) >= ATTRIBUTION_TTL_MS) return null;
    if (!stored.source && !stored.medium && !stored.campaign && !stored.content) return null;
    return {
      source: String(stored.source || ''), medium: String(stored.medium || ''),
      campaign: String(stored.campaign || ''), content: String(stored.content || '')
    };
  } catch { return null; }
}
const hasUrlValue = Boolean(urlAttribution.source || urlAttribution.medium
  || urlAttribution.campaign || urlAttribution.content);
// 新しいUTMで着地したなら、そちらが最新の流入元。保存済みより優先する。
const attribution = hasUrlValue ? urlAttribution : (storedAttribution() || urlAttribution);
if (hasUrlValue) {
  try {
    sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({ ...attribution, created_at: Date.now() }));
  } catch {}
}
// 2026-09-04 総合実行指示書 §66–70: Creator 別計測URL。
// ?creator_id=&campaign_id=&creative_id=（短縮 cr / cp / cv も可）で着地したら、この訪問者の
// イベント全部に Creator・施策・クリエイティブを付ける。UTM より長く（30日・localStorage）
// 引き継ぐのは、SNS で見て後日ふらっと戻る動きを Creator の成果として数えるため。
// 新しい Creator URL で着地したらそちらが優先（ラストタッチ）。個人を特定する情報は入れない。
const CREATOR_KEY = 'hoshilu_creator_attribution';
const CREATOR_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const creatorSafeId = (value) => { const v = String(value || '').trim().toLowerCase(); return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(v) ? v : ''; };
const urlCreator = {
  creator_id: creatorSafeId(params.get('creator_id') || params.get('creator') || params.get('cr')),
  campaign_id: creatorSafeId(params.get('campaign_id') || params.get('cp')),
  creative_id: creatorSafeId(params.get('creative_id') || params.get('creative') || params.get('cv'))
};
function storedCreator() {
  try {
    const stored = JSON.parse(localStorage.getItem(CREATOR_KEY) || 'null');
    if (!stored?.creator_id || Date.now() - Number(stored.created_at || 0) >= CREATOR_TTL_MS) return null;
    return { creator_id: creatorSafeId(stored.creator_id), campaign_id: creatorSafeId(stored.campaign_id), creative_id: creatorSafeId(stored.creative_id) };
  } catch { return null; }
}
const creator = urlCreator.creator_id ? urlCreator : (storedCreator() || { creator_id: '', campaign_id: '', creative_id: '' });
if (urlCreator.creator_id) {
  try { localStorage.setItem(CREATOR_KEY, JSON.stringify({ ...creator, created_at: Date.now() })); } catch {}
  // UTM が無い Creator URL でも、既存の流入元集計（source/medium）に載るよう補う。
  if (!attribution.source) attribution.source = 'creator';
  if (!attribution.medium) attribution.medium = 'influencer';
  if (!attribution.campaign) attribution.campaign = creator.campaign_id || creator.creator_id;
  try { sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({ ...attribution, created_at: Date.now() })); } catch {}
}
if (creator.creator_id) Object.assign(attribution, creator);
window.HoshiluGrowthAttribution = Object.freeze({ ...attribution });
// 2026-09-06 大隆さん指示（§27）: 希望価格ウォッチの登録も「どこから来た人か」を
// 数えられるようにする。session_id は30分で切り替わるので、値ではなく取得関数を渡す。
window.HoshiluGrowthIdentity = Object.freeze({ visitorId: () => growthVisitorId(), sessionId: () => growthSessionId() });
const locale = () => String(document.documentElement.lang || 'ja').split('-')[0].toUpperCase();
const visitorId = growthVisitorId();
const send = (event_type, extra = {}) => {
  const body = JSON.stringify({ event_type, locale: locale(), visitor_id: visitorId, session_id: growthSessionId(), ...attribution, ...extra });
  if (typeof navigator.sendBeacon === 'function') {
    try {
      if (navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' })) === true) return;
    } catch {}
  }
  fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
};
const SEARCH_WATCHDOG_MS = 75000;
const searchWatches = new Map();
// One enum event is emitted per accepted search execution. The enum contains
// presence flags only; the query, URL and image never enter analytics.
const SEARCH_INPUT_EVENT = Object.freeze({
  TEXT: 'search_input_text',
  SCREENSHOT: 'search_input_screenshot',
  CAMERA: 'search_input_camera',
  SOCIAL_URL: 'search_input_social_url',
  TEXT_SCREENSHOT: 'search_input_text_screenshot',
  TEXT_CAMERA: 'search_input_text_camera',
  TEXT_SOCIAL_URL: 'search_input_text_social_url',
  SCREENSHOT_SOCIAL_URL: 'search_input_screenshot_social_url',
  CAMERA_SOCIAL_URL: 'search_input_camera_social_url',
  TEXT_SCREENSHOT_SOCIAL_URL: 'search_input_text_screenshot_social_url',
  TEXT_CAMERA_SOCIAL_URL: 'search_input_text_camera_social_url'
});
const SEARCH_COMPLETED_INPUT_EVENT = Object.freeze({
  TEXT: 'search_completed_text', SCREENSHOT: 'search_completed_screenshot',
  CAMERA: 'search_completed_camera', SOCIAL_URL: 'search_completed_social_url',
  TEXT_SCREENSHOT: 'search_completed_text_screenshot', TEXT_CAMERA: 'search_completed_text_camera',
  TEXT_SOCIAL_URL: 'search_completed_text_social_url',
  SCREENSHOT_SOCIAL_URL: 'search_completed_screenshot_social_url',
  CAMERA_SOCIAL_URL: 'search_completed_camera_social_url',
  TEXT_SCREENSHOT_SOCIAL_URL: 'search_completed_text_screenshot_social_url',
  TEXT_CAMERA_SOCIAL_URL: 'search_completed_text_camera_social_url'
});
const SEARCH_OUTBOUND_INPUT_EVENT = Object.freeze({
  TEXT: 'search_outbound_text', SCREENSHOT: 'search_outbound_screenshot',
  CAMERA: 'search_outbound_camera', SOCIAL_URL: 'search_outbound_social_url',
  TEXT_SCREENSHOT: 'search_outbound_text_screenshot', TEXT_CAMERA: 'search_outbound_text_camera',
  TEXT_SOCIAL_URL: 'search_outbound_text_social_url',
  SCREENSHOT_SOCIAL_URL: 'search_outbound_screenshot_social_url',
  CAMERA_SOCIAL_URL: 'search_outbound_camera_social_url',
  TEXT_SCREENSHOT_SOCIAL_URL: 'search_outbound_text_screenshot_social_url',
  TEXT_CAMERA_SOCIAL_URL: 'search_outbound_text_camera_social_url'
});
let lastCompletedSearch = null;
const clearSearchWatch = executionId => {
  const watch = searchWatches.get(String(executionId || ''));
  if (!watch) return;
  clearTimeout(watch.timer);
  searchWatches.delete(String(executionId));
  return watch;
};
const armSearchWatch = (executionId, inputType) => {
  clearSearchWatch(executionId);
  const watch = { inputType, timer: 0 };
  watch.timer = setTimeout(() => {
    if (searchWatches.get(executionId) !== watch) return;
    searchWatches.delete(executionId);
    // No query text or exception body is sent. A timeout means the real
    // result/degraded terminal events never arrived for this execution.
    send('search_dead_end');
  }, SEARCH_WATCHDOG_MS);
  searchWatches.set(executionId, watch);
};
const startSearchWatch = event => {
  const executionId = String(event.detail?.executionId || '');
  if (!/^[a-f0-9-]{20,64}$/iu.test(executionId)) return;
  const inputType = String(event.detail?.inputType || '');
  const inputEvent = SEARCH_INPUT_EVENT[inputType];
  if (inputEvent) send(inputEvent, { execution_id: executionId });
  clearSearchWatch(executionId);
  lastCompletedSearch = inputEvent ? { executionId, inputType, outboundSent: false } : null;
  // AI確認の即時モール導線はattemptだけを記録する。本検索へ進むまで
  // dead-end監視を始めず、通常のダイアログ終了を失敗扱いしない。
  if (event.detail?.watchdog === false) return;
  armSearchWatch(executionId, inputEvent ? inputType : '');
};
const resumeSearchWatch = event => {
  const executionId = String(event.detail?.executionId || '');
  if (!lastCompletedSearch || lastCompletedSearch.executionId !== executionId) return;
  armSearchWatch(executionId, lastCompletedSearch.inputType);
};
const cancelSearchWatch = event => {
  const executionId = String(event.detail?.executionId || '');
  clearSearchWatch(executionId);
  if (lastCompletedSearch?.executionId === executionId) lastCompletedSearch = null;
};
const completeSearchWatch = event => {
  const executionId = String(event.detail?.executionId || '');
  const watch = clearSearchWatch(executionId);
  const completedEvent = SEARCH_COMPLETED_INPUT_EVENT[watch?.inputType];
  if (completedEvent) {
    send(completedEvent, { execution_id: executionId });
    if (!lastCompletedSearch || lastCompletedSearch.executionId !== executionId) {
      lastCompletedSearch = { executionId, inputType: watch.inputType, outboundSent: false };
    }
  }
  send('search_completed');
  collectMarketplaceImpressions(executionId);
};

// 2026-09-03 §17: モール別の表示率・クリック率を実数で出すため、検索結果に
// 導線が出たモールを記録する。結果行は非同期に描画されるので、完了直後から
// 数回だけ画面を見て、実行1回につき1モール1件だけ送る。送るのはモール名の
// 列挙だけで、検索文・商品名・URL・画像は一切送らない。
const MARKETPLACE_IMPRESSION_DELAYS_MS = Object.freeze([300, 1500, 4000]);
const marketplaceImpressions = new Map();
const MARKETPLACE_LINK_SELECTOR = '.buy-link,.offer-link,.price-offer,.product-primary-link,.price-compare-link,.price-compare-search-link';
function collectMarketplaceImpressions(executionId) {
  const key = String(executionId || '');
  if (!key || marketplaceImpressions.has(key)) return;
  const seen = new Set();
  marketplaceImpressions.set(key, seen);
  if (marketplaceImpressions.size > 20) {
    marketplaceImpressions.delete(marketplaceImpressions.keys().next().value);
  }
  const sweep = () => {
    for (const link of document.querySelectorAll(MARKETPLACE_LINK_SELECTOR)) {
      if (link.closest('.ranking-product-card,.buzz-home-card')) continue;
      const marketplace = growthMarketplace(link.dataset?.marketplace, link.textContent);
      if (!marketplace || seen.has(marketplace)) continue;
      seen.add(marketplace);
      send('marketplace_shown', { marketplace });
    }
  };
  for (const delay of MARKETPLACE_IMPRESSION_DELAYS_MS) setTimeout(sweep, delay);
}

send('landing_view');
try {
  const visitKey = 'hoshilu_last_visit_at';
  const previous = Number(localStorage.getItem(visitKey) || 0);
  const now = Date.now();
  if (previous > 0 && now - previous >= 30 * 60 * 1000) send('returning_visit');
  localStorage.setItem(visitKey, String(now));
} catch {}

document.addEventListener('submit', event => {
  if (event.target?.id === 'knowledgeForm') send('search_started');
});

// search_started is emitted only after the browser accepts a submit. Keep a
// separate attempt signal so malformed optional URL input and any future
// native validation can be distinguished from a user who never pressed the
// button. Capture runs before native validation and never includes input data.
document.addEventListener('click', event => {
  const target = event.target?.closest?.('#submitButton, button[type=submit]');
  if (target && target.form?.id === 'knowledgeForm') send('search_attempted');
}, true);

// 検証で止められたことを記録する。invalid はバブリングしないので capture で拾う。
// どのフィールドで止まったかは送らない: extraで content 等を渡すと流入元の
// 項目を上書きしてしまい、traffic_class が ATTRIBUTED に化けて流入元計測を
// 汚す。検索文も従来どおり一切送らない。
document.addEventListener('invalid', event => {
  if (event.target?.form?.id === 'knowledgeForm') send('search_blocked');
}, true);

document.addEventListener('hoshilu:search-execution-started', startSearchWatch);
document.addEventListener('hoshilu:search-knowledge-started', resumeSearchWatch);
document.addEventListener('hoshilu:search-cancelled', cancelSearchWatch);
document.addEventListener('hoshilu:search-completed', completeSearchWatch);
document.addEventListener('hoshilu:search-failed', event => { clearSearchWatch(event.detail?.executionId); send('search_dead_end'); });
document.addEventListener('hoshilu:search-degraded', event => {
  clearSearchWatch(event.detail?.executionId);
  // Attribution is preserved. Only an allowlisted code and UUID-shaped
  // request ID accompany the event; query text and exception bodies do not.
  send('search_degraded', {
    failure_code: event.detail?.errorCode,
    request_id: event.detail?.requestId
  });
});
document.addEventListener('hoshilu:wish-saved', event => {
  if (event.detail?.source !== 'continuous_search') {
    send('wish_saved');
    return;
  }
  // A guest save is a browser-observable conversion. Notification enablement
  // is recorded only by the authenticated member-wish endpoint, so a browser
  // cannot forge that business KPI.
  send('continuous_search_saved');
});

document.addEventListener('click', event => {
  const target = event.target.closest('a,button');
  if (!target) return;
  if (target.classList.contains('price-compare-button') || target.classList.contains('ai-price-compare-button')) send('price_comparison_opened');
  if (target.classList.contains('share-discovery-button') || target.classList.contains('share-copy-button')
    || target.classList.contains('share-gmail-button') || target.classList.contains('social-target')
    || target.dataset.channel === 'line') send('share_started');
  if (target.matches('.buy-link,.offer-link,.price-offer,.product-primary-link,.price-compare-link,.price-compare-search-link,.buzz-home-card') && target.tagName === 'A') {
    // LINE is a share handoff, not a product-result click. It was previously
    // misclassified as ai_result_clicked because it reuses the buy-link style.
    if (target.dataset.channel === 'line') return;
    const marketplace = growthMarketplace(target.dataset.marketplace, target.textContent);
    send(target.closest('.ranking-product-card,.buzz-home-card') ? 'ranking_result_clicked' : 'ai_result_clicked', marketplace ? { marketplace } : {});
    if (marketplace) {
      send('marketplace_click', { marketplace });
      // 2026-09-06: モール遷移(marketplace_click)は直近30日で195件に対し、
      // 会員登録(member_registered)はD1実測で0件だった。登録導線は「ホシっとく」
      // 保存操作(月3件)にしか出ておらず、最頻の高意図イベントである本クリックの
      // 直後には一度も出ていなかった。member-registration-nudge.mjsへ合図する。
      document.dispatchEvent(new CustomEvent('hoshilu:marketplace-click', { detail: { marketplace } }));
      // Count one conversion per completed search, not every shop click.
      const clickedExecutionId=String(target.closest('[data-search-execution-id]')?.dataset.searchExecutionId||'');
      if (!target.closest('.ranking-product-card,.buzz-home-card') && lastCompletedSearch
        && clickedExecutionId===lastCompletedSearch.executionId && !lastCompletedSearch.outboundSent) {
        const outboundEvent = SEARCH_OUTBOUND_INPUT_EVENT[lastCompletedSearch.inputType];
        if (outboundEvent) {
          send(outboundEvent, { execution_id: lastCompletedSearch.executionId });
          lastCompletedSearch.outboundSent = true;
        }
      }
      if (target.dataset.measurementContext === 'BROWSER_EMERGENCY_FALLBACK') {
        send('marketplace_fallback_click', { marketplace, medium: 'fallback', campaign: 'browser_emergency' });
      }
    }
  }
});
