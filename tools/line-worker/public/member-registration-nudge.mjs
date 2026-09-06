// 2026-09-06: 大隆さんの日次KPI確認で判明したボトルネックへの対応。
// D1 growth_events / member_email_challenges の実測:
//   - 直近30日のmarketplace_click(モール遷移) = 195件
//   - 同期間のmember_registered(会員登録) = 0件（全期間を通じても0件）
//   - member_email_challenges(メール認証コード発行)も全期間で0行
// 既存の登録導線(/login.html)はナビの「マイページ」と、ウォッチ保存時の
// ゲストCTA(.watch-login-cta)にしか出ていない。ウォッチ保存自体が
// 月3件しかなく、実際に最も繰り返し起きている高意図イベントである
// モール遷移の直後には、登録を促す導線が一度も出ていなかった。
//
// ここでは growth-analytics.mjs が発火する hoshilu:marketplace-click を
// 受けて、未ログインのゲストにのみ、セッション中1回だけ、控えめな
// 常時表示の下部バーで登録を案内する。会員かどうかは /api/member/session
// で確認する(HttpOnly cookieのためJSからは直接読めない)。

const NUDGE_SHOWN_KEY = 'hoshilu_registration_nudge_shown';

const COPY = {
  JA: { text: '無料会員になると、値下がり・再入荷の通知が届きます。', cta: '無料会員登録', close: '閉じる' },
  EN: { text: 'Free members get notified about price drops and restocks.', cta: 'Join free', close: 'Close' },
  ZH: { text: '成为免费会员即可收到降价和补货通知。', cta: '免费注册', close: '关闭' },
  KO: { text: '무료 회원이 되면 가격 인하·재입고 알림을 받을 수 있어요.', cta: '무료 회원가입', close: '닫기' }
};

export function copyForLanguage(lang) {
  const key = String(lang || 'JA').trim().toUpperCase();
  return COPY[key] || COPY.JA;
}

export function loginHrefFor(next = '/') {
  return `/login.html?next=${encodeURIComponent(next)}`;
}

// あちこちから呼ばれても副作用を持ち込まないよう、判定は純粋関数にする。
export function shouldShowNudge({ alreadyShown, isMember }) {
  return !alreadyShown && !isMember;
}

function readNudgeShown() {
  try { return sessionStorage.getItem(NUDGE_SHOWN_KEY) === '1'; } catch { return false; }
}

function markNudgeShown() {
  try { sessionStorage.setItem(NUDGE_SHOWN_KEY, '1'); } catch {}
}

async function fetchIsMember() {
  try {
    const response = await fetch('/api/member/session', { cache: 'no-store' });
    if (!response.ok) return false;
    const payload = await response.json();
    return Boolean(payload?.member);
  } catch { return false; }
}

function currentLanguage() {
  return document.documentElement.lang || 'ja';
}

function renderNudge() {
  if (document.querySelector('.registration-nudge')) return;
  const copy = copyForLanguage(currentLanguage());
  const note = document.createElement('div');
  note.className = 'registration-nudge';
  note.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.className = 'registration-nudge-text';
  text.textContent = copy.text;
  const link = document.createElement('a');
  link.className = 'registration-nudge-link';
  link.href = loginHrefFor('/');
  link.textContent = copy.cta;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'registration-nudge-close';
  close.setAttribute('aria-label', copy.close);
  close.textContent = '×';
  close.addEventListener('click', () => note.remove());
  note.append(text, link, close);
  document.body.append(note);
  markNudgeShown();
}

let memberCheckPromise = null;

// ブラウザ以外(このファイルをテストからimportした場合など)ではdocumentが
// 存在しないため配線しない。純粋関数(copyForLanguage/loginHrefFor/
// shouldShowNudge)だけをテストから直接検証できるようにするためのガード。
if (typeof document !== 'undefined') {
  document.addEventListener('hoshilu:marketplace-click', () => {
    if (readNudgeShown()) return;
    if (!memberCheckPromise) memberCheckPromise = fetchIsMember();
    memberCheckPromise.then((isMember) => {
      if (!shouldShowNudge({ alreadyShown: readNudgeShown(), isMember })) return;
      renderNudge();
    });
  });
}
