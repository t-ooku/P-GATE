// 2026-09-21 指示書 P2「バーコードから いつものにする」。
//
// 手元の商品のバーコード（JAN/EAN/UPC）を読んで、その番号でそのまま HOSHILU を検索する。
// 見つかった商品カードの「いつものにする」を押せば、いつものホシルに入る。
//
// 守ること:
//   ・読み取れた番号しか使わない。似た番号を補ったり、桁を直したりしない
//   ・番号から商品名を推測しない。商品は HOSHILU の検索結果（実データ）で確かめる
//   ・ブラウザがバーコードを読めないなら、ボタン自体を出さない（できないことを約束しない）
//   ・映像は端末の中だけで処理する。どこにも送らない・保存しない
//   ・カメラは読み取れた時点ですぐ止める

const SUPPORTED_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const COPY = {
  open: 'バーコードで探す',
  title: 'バーコードを枠に入れてください',
  cancel: 'やめる',
  hint: '手元の商品のバーコードを読み取って、その番号で探します。映像は端末の中だけで処理します。',
  denied: 'カメラを使えませんでした。ブラウザの設定でカメラを許可すると使えます。',
  failed: '読み取れませんでした。明るいところで、もう一度試してください。'
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function barcodeSupported(scope = globalThis) {
  return typeof scope?.BarcodeDetector === 'function' && typeof scope?.navigator?.mediaDevices?.getUserMedia === 'function';
}

// 読み取れた値のうち、バーコードとして成り立つものだけ通す。
// 桁を足したり削ったりして「それらしく」しない。
export function normalizeBarcode(value) {
  const digits = String(value || '').replace(/\D/gu, '');
  return [8, 12, 13].includes(digits.length) ? digits : '';
}

function stopStream(stream) {
  for (const track of stream?.getTracks?.() || []) {
    try { track.stop(); } catch { /* 既に止まっている */ }
  }
}

function overlay() {
  const root = el('div', 'barcode-overlay');
  root.id = 'barcodeOverlay';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', COPY.title);
  const box = el('div', 'barcode-box');
  box.append(el('p', 'barcode-title', COPY.title));
  const video = document.createElement('video');
  video.id = 'barcodeVideo';
  video.playsInline = true;
  video.muted = true;
  box.append(video);
  box.append(el('p', 'barcode-hint', COPY.hint));
  const status = el('p', 'barcode-status');
  status.id = 'barcodeStatus';
  status.setAttribute('role', 'status');
  box.append(status);
  const cancel = el('button', 'barcode-cancel', COPY.cancel);
  cancel.type = 'button';
  box.append(cancel);
  root.append(box);
  return { root, video, status, cancel };
}

// 読み取った番号を検索窓に入れて、いつもの検索をそのまま走らせる。
// ここで商品を作らない。商品は検索結果（実データ）から選んでもらう。
export function runSearch(code, doc = document) {
  const form = doc.querySelector('#knowledgeForm');
  const query = doc.querySelector('#query');
  if (!form || !query) return false;
  query.value = code;
  query.dispatchEvent(new Event('input', { bubbles: true }));
  if (typeof form.requestSubmit === 'function') form.requestSubmit();
  else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  return true;
}

async function scan() {
  const { root, video, status, cancel } = overlay();
  document.body.append(root);
  let stream = null;
  let stopped = false;
  const close = () => {
    stopped = true;
    stopStream(stream);
    root.remove();
  };
  cancel.addEventListener('click', close);
  root.addEventListener('click', (event) => { if (event.target === root) close(); });

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch {
    status.textContent = COPY.denied;
    return;
  }
  video.srcObject = stream;
  try { await video.play(); } catch { /* 自動再生が止められても検出は続けられる */ }

  const detector = new BarcodeDetector({ formats: SUPPORTED_FORMATS });
  const deadline = Date.now() + 30_000;
  while (!stopped && Date.now() < deadline) {
    let found = '';
    try {
      const codes = await detector.detect(video);
      for (const entry of codes || []) {
        const code = normalizeBarcode(entry?.rawValue);
        if (code) { found = code; break; }
      }
    } catch { /* フレームが読めない回はとばす */ }
    if (found) {
      close();
      runSearch(found);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!stopped) {
    status.textContent = COPY.failed;
    stopStream(stream);
  }
}

function mount() {
  // 読めないブラウザにはボタンを出さない。できないことを約束しない。
  if (!barcodeSupported()) return;
  const host = document.querySelector('#searchInputActions');
  if (!host || document.querySelector('#barcodeScan')) return;
  const button = el('button', 'search-input-action barcode-action', '');
  button.id = 'barcodeScan';
  button.type = 'button';
  button.append(el('span', null, '▥'), el('span', null, COPY.open));
  button.querySelector('span').setAttribute('aria-hidden', 'true');
  button.addEventListener('click', () => { scan(); });
  host.append(button);
}

mount();
