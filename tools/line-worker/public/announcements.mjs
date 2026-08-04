// HOSHILU product/feature announcements ("お知らせ"). Static for now - a
// future iteration can move this list to a small D1 table the way sale
// events already are (see sale-center.mjs). The row markup and CSS classes
// (.info-row / .info-row-list) are shared with the Sale Radar panel so both
// lists render as the same fixed-height, manually-scrollable, one-row-per-item
// format specified for HOSHILU UI v3.
import { attachVerticalTicker } from './vertical-ticker.mjs';

const labels = {
  JA: { title: 'お知らせ', more: 'もっと見る' },
  EN: { title: 'Announcements', more: 'Show more' },
  ZH: { title: '通知', more: '查看更多' },
  KO: { title: '공지사항', more: '더 보기' }
};

const badgeCopy = {
  JA: { NEW: 'NEW', INFO: 'INFO' },
  EN: { NEW: 'NEW', INFO: 'INFO' },
  ZH: { NEW: '新', INFO: '资讯' },
  KO: { NEW: '신규', INFO: '안내' }
};

const announcements = [
  {
    type: 'NEW',
    date: '2026-08-06',
    url: '/',
    text: {
      JA: 'HOSHILU AI Search v2.0リリース',
      EN: 'HOSHILU AI Search v2.0 released',
      ZH: 'HOSHILU AI Search v2.0 已发布',
      KO: 'HOSHILU AI Search v2.0 출시'
    }
  },
  {
    type: 'INFO',
    date: '2026-08-05',
    url: '/',
    text: {
      JA: '複数モール横断検索にQoo10を追加',
      EN: 'Qoo10 added to cross-marketplace search',
      ZH: '跨商城搜索新增 Qoo10',
      KO: '통합 쇼핑몰 검색에 Qoo10 추가'
    }
  },
  {
    type: 'INFO',
    date: '2026-08-01',
    url: '/',
    text: {
      JA: 'ファッション5モールを追加し最大10モール対応に',
      EN: 'Added five fashion marketplaces, now up to ten total',
      ZH: '新增五个时尚商城，最多支持十个商城',
      KO: '패션 5개 쇼핑몰 추가로 최대 10개 쇼핑몰 지원'
    }
  }
];

function language() {
  return document.querySelector('[data-language-select]')?.value || 'JA';
}

function formatDate(value) {
  const lang = language();
  const locale = lang === 'JA' ? 'ja-JP' : lang === 'KO' ? 'ko-KR' : lang === 'ZH' ? 'zh-CN' : 'en-US';
  return new Intl.DateTimeFormat(locale, { month: '2-digit', day: '2-digit' }).format(new Date(value));
}

const PAGE_SIZE = 8;
let visibleCount = PAGE_SIZE;

function render() {
  const list = document.querySelector('#announcementList');
  if (!list) return;
  const lang = language();
  const t = labels[lang] || labels.JA;
  const badges = badgeCopy[lang] || badgeCopy.JA;
  document.querySelector('#announcementsTitle').textContent = t.title;
  const sorted = [...announcements].sort((a, b) => new Date(b.date) - new Date(a.date));
  const visible = sorted.slice(0, visibleCount);
  list.replaceChildren(...visible.map((item) => {
    const row = document.createElement('a');
    row.className = 'info-row';
    row.href = item.url;
    const label = document.createElement('span');
    label.className = `info-row-label info-row-label-${item.type.toLowerCase()}`;
    label.textContent = badges[item.type] || item.type;
    const dateEl = document.createElement('time');
    dateEl.className = 'info-row-date';
    dateEl.textContent = formatDate(item.date);
    const spacer = document.createElement('span');
    spacer.className = 'info-row-mall';
    const title = document.createElement('span');
    title.className = 'info-row-title';
    title.textContent = item.text[lang] || item.text.JA;
    row.append(label, dateEl, spacer, title);
    return row;
  }));
  attachVerticalTicker(list);
  const moreWrap = document.querySelector('#announcementListMore');
  if (moreWrap) {
    moreWrap.replaceChildren();
    if (sorted.length > visibleCount) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'info-row-more-button';
      button.textContent = t.more;
      button.addEventListener('click', () => { visibleCount += PAGE_SIZE; render(); });
      moreWrap.append(button);
    }
  }
}

render();
window.addEventListener('hoshilu:languagechange', render);
document.querySelector('[data-language-select]')?.addEventListener('change', render);
