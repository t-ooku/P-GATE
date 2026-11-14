// 2026-11-15 大隆さん指示（実機の比較を見て）:
// 1) 写真で探す入口を、検索窓のマイクの隣に置く。
// 2) 写真で探した時は、撮った写真を上に残したまま、商品を下からのシートで出す。
// 既存の検索・結果の描画（app.js）には手を入れず、表示の枠だけを足す。写真は端末内のプレビューを使い、どこにも送らない。
const preview = document.querySelector('#screenshotPreview');
const previewImage = document.querySelector('#screenshotPreviewImage');
const results = document.querySelector('#resultsSection');
const field = document.querySelector('.query-field');

function hasPhoto() {
  return Boolean(preview && !preview.classList.contains('hidden') && previewImage?.getAttribute('src'));
}

function addCameraButton() {
  if (!field || !document.querySelector('#searchCamera') || field.querySelector('.query-camera')) return;
  const label = document.createElement('label');
  label.className = 'query-camera';
  label.htmlFor = 'searchCamera';
  label.setAttribute('aria-label', '写真で探す');
  label.title = '写真で探す';
  label.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V7a3 3 0 0 1 3-3h2"/><path d="M15 4h2a3 3 0 0 1 3 3v2"/><path d="M20 15v2a3 3 0 0 1-3 3h-2"/><path d="M9 20H7a3 3 0 0 1-3-3v-2"/><path d="M12 8.2l1.1 2.5 2.7.3-2 1.8.6 2.7-2.4-1.4-2.4 1.4.6-2.7-2-1.8 2.7-.3z" fill="currentColor" stroke="none"/></svg>';
  field.append(label);
}

let view = null;
function ensureView() {
  if (view) return view;
  view = document.createElement('div');
  view.className = 'photo-lens-view';
  view.setAttribute('role', 'dialog');
  view.setAttribute('aria-label', '写真で探した結果');
  const bar = document.createElement('div');
  bar.className = 'photo-lens-bar';
  const title = document.createElement('span');
  title.textContent = 'ホシル 写真で探す';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'photo-lens-close';
  close.setAttribute('aria-label', '閉じる');
  close.textContent = '×';
  close.addEventListener('click', closeLens);
  bar.append(title, close);
  const photo = document.createElement('div');
  photo.className = 'photo-lens-photo';
  const img = document.createElement('img');
  img.alt = '撮影した写真';
  photo.append(img);
  view.append(photo, bar);
  const grip = document.createElement('button');
  grip.type = 'button';
  grip.className = 'photo-lens-grip';
  grip.setAttribute('aria-label', '結果を広げる・戻す');
  grip.addEventListener('click', () => document.body.classList.toggle('photo-lens-tall'));
  document.body.append(view, grip);
  return view;
}

// 撮った写真を覚えておく（検索のあとでプレビューが片づけられても、結果の上に残せるように）。
// 2026-11-15 大隆さん実機「写真撮ってから検索すると消えるよ」: 検索の開始・やり直しの合図で閉じていたのをやめた。
let photoSrc = '';
let armed = false;      // 写真つきの検索の結果を待っている
let userClosed = false; // 利用者が × で閉じた（同じ写真では勝手に開き直さない）
let shown = false;      // この写真の結果を 1 度は出した
function rememberPhoto() {
  if (!hasPhoto()) return;
  const src = previewImage.getAttribute('src');
  if (src !== photoSrc) { userClosed = false; shown = false; }
  photoSrc = src;
  armed = true;
}

// 結果が描かれてから開く（探している間は今までどおりの画面。確認の操作が要る場面を隠さない）
function showResults() {
  rememberPhoto();
  if (!armed || userClosed || !photoSrc || !results || results.classList.contains('hidden')) return;
  ensureView().querySelector('img').src = photoSrc;
  const already = document.body.classList.contains('photo-lens-open');
  document.body.classList.add('photo-lens-open', 'photo-lens-ready');
  shown = true;
  if (!already) { document.body.classList.remove('photo-lens-tall'); results.scrollTop = 0; }
}

export function closeLens() {
  const wasOpen = document.body.classList.contains('photo-lens-open');
  document.body.classList.remove('photo-lens-open', 'photo-lens-ready', 'photo-lens-tall');
  if (wasOpen) userClosed = true;
  // 閉じたら、ふつうの画面の結果の位置へ（行き止まりにしない）
  if (wasOpen && results && !results.classList.contains('hidden')) results.scrollIntoView({ block: 'start' });
}

// 写真なしの新しい検索が始まったら、前の写真は使わない。
// ただし、写真の結果をまだ 1 度も出していない間（写真の検索の続きの合図）と、開いている間は残す。
function onSearchStarted() {
  rememberPhoto();
  if (!hasPhoto() && shown && !document.body.classList.contains('photo-lens-open')) { armed = false; photoSrc = ''; }
}

addCameraButton();
if (previewImage) new MutationObserver(rememberPhoto).observe(previewImage, { attributes: true, attributeFilter: ['src'] });
if (preview) new MutationObserver(rememberPhoto).observe(preview, { attributes: true, attributeFilter: ['class'] });
document.querySelector('#removeScreenshot')?.addEventListener('click', () => { if (!document.body.classList.contains('photo-lens-open')) { armed = false; photoSrc = ''; } });
document.addEventListener('hoshilu:search-execution-started', onSearchStarted);
document.addEventListener('hoshilu:search-knowledge-started', onSearchStarted);
document.addEventListener('hoshilu:results-rendered', showResults);
document.addEventListener('hoshilu:search-completed', showResults);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeLens(); });
