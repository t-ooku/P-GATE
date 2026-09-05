// 2026-09-05 大隆さん指示: クリエイター募集フォーム。for-sellers.js と同じ Turnstile＋フォールバック運用。
const form = document.querySelector('#creatorInquiryForm');
const status = document.querySelector('#formStatus');
const turnstileContainer = document.querySelector('#turnstile');
let turnstileToken = '';
let turnstileWidget = null;
// 2026-09-03: Turnstileが出ないとフォームは一切送信できず、しかも画面上は
// 「確認を完了してください」としか出ないため、利用者は何を押せばいいのか
// 分からない。読み込みに失敗した事実と、次に何をすればいいかを必ず出す。
let turnstileFailure = '';

// 高さ0のまま消えると、押すものが無いことに利用者が気づけない。枠を確保する。
// スタイルはこのファイルだけで完結させる(for-sellers.cssは触らない)。
if (turnstileContainer) {
  turnstileContainer.style.minHeight = '70px';
  turnstileContainer.style.margin = '4px 0';
  turnstileContainer.style.display = 'grid';
  turnstileContainer.style.alignContent = 'center';
}

function showTurnstileFailure(reason) {
  turnstileFailure = reason;
  status.className = 'status error';
  // 確認欄が動かない環境でも送信できる。サーバ側で件数を絞って受け付ける。
  status.style.whiteSpace = 'pre-line';
  status.textContent = `${reason}\nこのまま「内容を送信」を押しても受け付けます。`;
  if (!turnstileContainer || turnstileContainer.querySelector('.turnstile-retry')) return;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'turnstile-retry';
  retry.textContent = '確認欄を再読み込みする';
  retry.style.cssText = 'justify-self:start;padding:10px 14px;border:1px solid #ded7ff;border-radius:12px;background:#fff;color:#5140ba;font:inherit;font-weight:800;cursor:pointer';
  retry.addEventListener('click', () => {
    retry.disabled = true;
    turnstileContainer.replaceChildren();
    turnstileFailure = '';
    status.className = 'status';
    status.textContent = '確認欄を読み込んでいます…';
    initializeTurnstile().then(() => { status.textContent = ''; }, error => showTurnstileFailure(error.message));
  });
  turnstileContainer.append(retry);
}

// api.js は async defer で読み込むため実行順が保証されない。出現を待ってから使う。
async function waitForTurnstileApi(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (!window.turnstile?.render) {
    if (Date.now() > deadline) return null;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return window.turnstile;
}

async function initializeTurnstile() {
  if (!turnstileContainer) throw new Error('確認欄を表示できませんでした。ページを再読み込みしてください。');
  let sitekey = '';
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    const config = response.ok ? await response.json() : {};
    sitekey = String(config.turnstile_site_key || '');
  } catch { sitekey = ''; }
  if (!sitekey) throw new Error('確認欄の設定を取得できませんでした。通信環境を変えて再読み込みしてください。');
  const api = await waitForTurnstileApi();
  if (!api) {
    throw new Error('確認欄を読み込めませんでした。アプリ内ブラウザではなくSafariやChromeで開くと表示されます。');
  }
  // 検索画面(app.js)と同じ設定にそろえる。要素をそのまま渡し、失効・再試行は
  // Turnstile側に任せる。セレクタ文字列だと再読み込み時に前の枠を掴んでしまう。
  turnstileWidget = api.render(turnstileContainer, {
    sitekey, theme: 'light', size: 'flexible',
    retry: 'auto', 'retry-interval': 3000,
    'refresh-expired': 'auto', 'refresh-timeout': 'auto',
    callback: token => { turnstileToken = token; turnstileFailure = ''; },
    'expired-callback': () => { turnstileToken = ''; },
    'timeout-callback': () => { turnstileToken = ''; },
    'unsupported-callback': () => {
      showTurnstileFailure('このブラウザは確認欄に対応していません。SafariやChromeで開いてください。');
      return true;
    },
    'error-callback': code => {
      turnstileToken = '';
      showTurnstileFailure(`確認欄でエラーが発生しました(${String(code || 'unknown').slice(0, 24)})。再読み込みしてください。`);
      return false;
    }
  });
  if (turnstileWidget === undefined) throw new Error('確認欄を表示できませんでした。ページを再読み込みしてください。');
}

initializeTurnstile().catch(error => showTurnstileFailure(error.message));

form?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  status.className = 'status';
  // 確認欄が読み込めていない環境では、トークン無しのまま送る。サーバ側で
  // 件数を絞って受け付けるので、問い合わせ口が完全に塞がることはない。
  if (!turnstileToken && !turnstileFailure) {
    status.textContent = '不正送信防止の確認を完了してください。';
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  const data = new FormData(form);
  const payload = {
    inquiry_type: data.get('inquiry_type'), creator_name: data.get('creator_name'),
    contact_email: data.get('contact_email'), platforms: data.getAll('platforms'),
    account_url: data.get('account_url'), follower_range: data.get('follower_range'),
    genre: data.get('genre'), post_url: data.get('post_url'), message: data.get('message'),
    company_website: data.get('company_website'),
    terms_consent: data.get('terms_consent') === 'on', privacy_consent: true, turnstile_token: turnstileToken
  };
  button.disabled = true;
  status.textContent = '送信しています…';
  try {
    const response = await fetch('/api/creators/inquiries', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error === 'VALIDATION_FAILED' ? `入力内容をご確認ください（${(result.fields || []).join(', ')}）。` : '送信できませんでした。入力内容をご確認ください。');
    form.reset();
    turnstileToken = '';
    if (turnstileWidget !== null) window.turnstile?.reset(turnstileWidget);
    status.className = 'status success';
    status.textContent = '受付しました。3営業日以内（投稿の報告は5営業日以内）にメールでご連絡します。';
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message || '送信できませんでした。時間をおいてお試しください。';
  } finally {
    button.disabled = false;
    if (!status.classList.contains('success')) {
      turnstileToken = '';
      if (turnstileWidget !== null) window.turnstile?.reset(turnstileWidget);
    }
  }
});
