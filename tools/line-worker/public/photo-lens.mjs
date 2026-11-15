import { rememberPhotoShutter } from './photo-qa-timing.mjs?v=2';
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
  label.addEventListener('click', onCameraEntry);
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
  // 何という言葉で探したかを見せる（2026-11-15: 外れた時に、読み違いなのか並び順なのかが分かるように）
  const queryNote = document.createElement('p');
  queryNote.className = 'photo-lens-query';
  queryNote.hidden = true;
  view.append(photo, bar, queryNote);
  const grip = document.createElement('button');
  grip.type = 'button';
  grip.className = 'photo-lens-grip';
  grip.setAttribute('aria-label', '結果を広げる・戻す');
  grip.addEventListener('click', () => document.body.classList.toggle('photo-lens-tall'));
  const loading = document.createElement('div');
  loading.className = 'photo-lens-loading';
  loading.setAttribute('role', 'status');
  loading.innerHTML = '<span class="photo-lens-loading-bar" aria-hidden="true"></span><p>商品を探しています…</p>';
  document.body.append(view, grip, loading);
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
  const usedQuery = String(document.querySelector('#query')?.value || '').replace(/\s+/gu, ' ').trim().slice(0, 60);
  const queryNote = view.querySelector('.photo-lens-query');
  if (queryNote) { queryNote.textContent = usedQuery ? `「${usedQuery}」で探しました` : ''; queryNote.hidden = !usedQuery; }
  clearTimeout(loadingTimer);
  shown = true;
  if (!already) { document.body.classList.remove('photo-lens-tall'); results.scrollTop = 0; }
}

// 開いた枠だけを片づける（検索語・写真・結果はそのまま）。うまく探せなかった時に、ふつうの画面の案内を見せるため。
function hideLens() {
  const wasOpen = document.body.classList.contains('photo-lens-open');
  document.body.classList.remove('photo-lens-open', 'photo-lens-ready', 'photo-lens-tall');
  clearTimeout(loadingTimer);
  pendingFile = false;
  if (wasOpen) userClosed = true;
  return wasOpen;
}

// × で閉じたら、検索語も写真も結果も片づけて、最初の画面に戻す（2026-11-15 大隆さん指示）。
export function closeLens() {
  if (!hideLens()) return;
  armed = false; photoSrc = '';
  document.querySelector('#removeScreenshot')?.click();
  const query = document.querySelector('#query');
  if (query && query.value) { query.value = ''; query.dispatchEvent(new Event('input', { bubbles: true })); }
  document.querySelector('#clearQuery')?.classList.add('hidden');
  results?.classList.add('hidden');
  window.scrollTo(0, 0);
}

// 2026-11-15 大隆さん指示: 撮った（選んだ）ら、そのまま探し始める。写真を上に出し、下に「探しています」を出す。
let pendingFile = false;
let fileTurn = 0;
let loadingTimer = 0;
function onFileChosen(event) {
  const file = event.target?.files?.[0];
  if (!file) return;
  closeCamera();
  // 選んだ写真をすぐ上に出す（端末の中で読むだけ。blob: はこのサイトの決まりで画像に使えないので data: で読む）
  const image = ensureView().querySelector('img');
  image.removeAttribute('src');
  { const note = view?.querySelector('.photo-lens-query'); if (note) note.hidden = true; }
  const reader = new FileReader();
  const turn = ++fileTurn;
  reader.addEventListener('load', () => {
    if (turn !== fileTurn || !document.body.classList.contains('photo-lens-open') || document.body.classList.contains('photo-lens-ready')) return;
    image.src = String(reader.result || '');
  });
  reader.readAsDataURL(file);
  pendingFile = true; userClosed = false; shown = false; armed = true; photoSrc = '';
  document.body.classList.remove('photo-lens-ready', 'photo-lens-tall');
  document.body.classList.add('photo-lens-open');
  clearTimeout(loadingTimer);
  // 60 秒たっても結果が出ない時は、枠を片づけてふつうの画面を見せる（行き止まりにしない）
  loadingTimer = setTimeout(() => { if (!document.body.classList.contains('photo-lens-ready')) hideLens(); }, 60000);
}
// 写真の準備ができたら検索を始める。準備に失敗した時は枠を片づけて、画面の案内を見せる。
function onPreviewChanged() {
  rememberPhoto();
  if (!pendingFile || preview?.getAttribute('aria-busy') === 'true') return;
  pendingFile = false;
  if (!hasPhoto()) { hideLens(); return; }
  const form = document.querySelector('#knowledgeForm');
  if (!form) { hideLens(); return; }
  // 準備の後始末（app.js の finally）が終わってから送る
  setTimeout(() => { if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }, 0);
}
// 探している途中で案内（確認のお願い・失敗）が出た時は、枠を片づけて見せる
function onStatusChanged() {
  const status = document.querySelector('#status');
  if (!status?.classList.contains('error')) return;
  if (document.body.classList.contains('photo-lens-open') && !document.body.classList.contains('photo-lens-ready')) hideLens();
}

// 写真なしの新しい検索が始まったら、前の写真は使わない。
// ただし、写真の結果をまだ 1 度も出していない間（写真の検索の続きの合図）と、開いている間は残す。
function onSearchStarted() {
  rememberPhoto();
  if (!hasPhoto() && shown && !document.body.classList.contains('photo-lens-open')) { armed = false; photoSrc = ''; }
}

// ── ホシルの撮影画面（2026-11-15 大隆さん指示: 撮影画面の中に、シャッターと、その右にアルバムのボタンを置く）──
// カメラの映像は端末の中だけで使い、撮った 1 枚を今までの「写真で探す」の入力に渡す。使えない端末では標準のカメラに任せる。
let cam = null;
let camStream = null;
function ensureCamera() {
  if (cam) return cam;
  cam = document.createElement('div');
  cam.className = 'photo-cam';
  cam.setAttribute('role', 'dialog');
  cam.setAttribute('aria-label', '写真で探す');
  cam.innerHTML = '<video class="photo-cam-video" playsinline autoplay muted></video>'
    + '<div class="photo-cam-bar"><span>ホシル 写真で探す</span><button type="button" class="photo-lens-close photo-cam-close" aria-label="閉じる">×</button></div>'
    + '<p class="photo-cam-hint">シャッターを押して検索</p>'
    + '<p class="photo-cam-fallback" hidden>カメラを使えませんでした。下のボタンから選べます。<label class="photo-cam-native" for="searchCamera">カメラを開く</label></p>'
    + '<div class="photo-cam-controls"><span class="photo-cam-spacer" aria-hidden="true"></span><button type="button" class="photo-cam-shutter" aria-label="撮って探す"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5l1.9 4.3 4.6.5-3.4 3.1 1 4.6-4.1-2.4-4.1 2.4 1-4.6-3.4-3.1 4.6-.5z" fill="currentColor"/></svg></button><label class="photo-cam-album" for="searchScreenshot" aria-label="アルバムから選ぶ" title="アルバムから選ぶ"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg></label></div>';
  cam.querySelector('.photo-cam-close').addEventListener('click', closeCamera);
  cam.querySelector('.photo-cam-shutter').addEventListener('click', takePhoto);
  document.body.append(cam);
  return cam;
}
function stopStream() {
  for (const track of camStream?.getTracks?.() || []) track.stop();
  camStream = null;
  const video = cam?.querySelector('video');
  if (video) video.srcObject = null;
}
function closeCamera() {
  stopStream();
  document.body.classList.remove('photo-cam-open');
}
function showCameraFallback() {
  stopStream();
  const view = ensureCamera();
  view.classList.add('photo-cam-failed');
  view.querySelector('.photo-cam-fallback').hidden = false;
}
async function openCamera() {
  const view = ensureCamera();
  view.classList.remove('photo-cam-failed');
  view.querySelector('.photo-cam-fallback').hidden = true;
  document.body.classList.add('photo-cam-open');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
    if (!document.body.classList.contains('photo-cam-open')) { for (const track of stream.getTracks()) track.stop(); return; }
    camStream = stream;
    const video = view.querySelector('video');
    video.srcObject = stream;
    await video.play().catch(() => {});
  } catch {
    showCameraFallback();
  }
}
function onCameraEntry(event) {
  // 使えない端末（古いブラウザなど）は、今までどおり標準のカメラ（label の動き）に任せる
  if (!navigator.mediaDevices?.getUserMedia || typeof DataTransfer !== 'function') return;
  event.preventDefault();
  openCamera();
}
function takePhoto() {
  const video = cam?.querySelector('video');
  const input = document.querySelector('#searchCamera');
  if (!video || !input || !video.videoWidth) return;
  try {
    const shutterAt = performance.now();
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) { showCameraFallback(); return; }
      try {
        const transfer = new DataTransfer();
        transfer.items.add(new File([blob], 'hoshilu-photo.jpg', { type: 'image/jpeg' }));
        input.files = transfer.files;
        const assignedFile = input.files?.[0];
        if (assignedFile) rememberPhotoShutter(assignedFile, shutterAt);
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch { showCameraFallback(); }
    }, 'image/jpeg', 0.9);
  } catch { showCameraFallback(); }
}
document.addEventListener('visibilitychange', () => { if (document.hidden && document.body.classList.contains('photo-cam-open')) closeCamera(); });

addCameraButton();
if (previewImage) new MutationObserver(onPreviewChanged).observe(previewImage, { attributes: true, attributeFilter: ['src'] });
if (preview) new MutationObserver(onPreviewChanged).observe(preview, { attributes: true, attributeFilter: ['class', 'aria-busy'] });
for (const id of ['#searchCamera', '#searchScreenshot']) document.querySelector(id)?.addEventListener('change', onFileChosen);
{ const status = document.querySelector('#status'); if (status) new MutationObserver(onStatusChanged).observe(status, { attributes: true, attributeFilter: ['class'] }); }
document.querySelector('#removeScreenshot')?.addEventListener('click', () => { if (!document.body.classList.contains('photo-lens-open')) { armed = false; photoSrc = ''; } });
document.addEventListener('hoshilu:search-execution-started', onSearchStarted);
document.addEventListener('hoshilu:search-knowledge-started', onSearchStarted);
document.addEventListener('hoshilu:results-rendered', showResults);
document.addEventListener('hoshilu:search-completed', showResults);
document.addEventListener('keydown', (event) => { if (event.key !== 'Escape') return; if (document.body.classList.contains('photo-cam-open')) closeCamera(); else closeLens(); });
