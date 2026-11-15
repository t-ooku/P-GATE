// QA-only, in-memory measurements. No network, storage, or input data in output.
const enabled = typeof location !== 'undefined' && new URLSearchParams(location.search).get('qa') === '1';
const captures = new WeakMap();
const rows = [];
const elapsed = (from, to) => Number.isFinite(from) && Number.isFinite(to) && to >= from ? Math.round(to - from) : null;
const labels = Object.freeze({
  shutterToFileMs: '撮影→画像ファイル', prepareMs: '画像の準備', readyToSubmitMs: '準備完了→送信操作',
  tokenWaitMs: 'Turnstile待ち（合計）', submitToSendMs: '送信操作→通信開始（確認待ち除く）',
  sendToHeadersMs: '最終送信→応答ヘッダ', firstSendToHeadersMs: '初回送信→応答ヘッダ',
  headersToBodyMs: '応答ヘッダ→本文', bodyToPaintCheckpointMs: '本文→カード描画チェック', totalMs: '合計'
});
let panel;
let panelText;

function showLatestTiming(row) {
  if (!enabled || typeof document === 'undefined' || !document.body) return;
  if (!panel?.isConnected) {
    panel = document.createElement('details');
    panel.dataset.qaPhotoTiming = 'latest';
    Object.assign(panel.style, {
      position: 'fixed', bottom: 'max(12px, env(safe-area-inset-bottom))', right: '12px',
      zIndex: '903', padding: '8px 10px', background: '#fff', color: '#20193d',
      border: '1px solid #6950ba', borderRadius: '8px', width: 'max-content',
      maxWidth: 'min(305px, calc(100vw - 24px))', maxHeight: '46vh', overflow: 'auto',
      font: '12px/1.4 system-ui, sans-serif'
    });
    const summary = document.createElement('summary');
    summary.textContent = '写真検索 QA タイミング';
    panelText = document.createElement('pre');
    panelText.style.whiteSpace = 'pre-wrap';
    panelText.style.margin = '6px 0 0';
    panel.append(summary, panelText);
    document.body.append(panel);
  }
  panelText.textContent = [
    `${row.input} / ${row.outcome} / 送信 ${row.attempts} 回`,
    ...Object.entries(labels).map(([key, label]) => `${label}: ${row[key] === null ? '未計測' : `${row[key]} ms`}`)
  ].join('\n');
}

export function rememberPhotoShutter(file, at) {
  if (enabled) captures.set(file, at);
}
export function startPhotoTiming(file, source, now = performance.now()) {
  if (!enabled) return null;
  return { source: source === 'CAMERA' ? (captures.has(file) ? 'LENS_CAMERA' : 'NATIVE_CAMERA') : 'ALBUM',
    shutter: captures.get(file), selected: now };
}
export function startPhotoRequest(prepared, now = performance.now()) {
  return prepared ? { ...prepared, submitted: now, attempts: 0 } : null;
}
export function recordPhotoTokenWait(t, from, to) {
  if (!t || !Number.isFinite(from) || !Number.isFinite(to) || to < from) return;
  const duration = to - from;
  t.tokenWait = (t.tokenWait ?? 0) + duration;
  if (t.firstSend === undefined) t.tokenWaitBeforeFirstSend = (t.tokenWaitBeforeFirstSend ?? 0) + duration;
}
export function finishPhotoTiming(t, outcome, now = performance.now()) {
  if (!t || t.finished) return;
  t.finished = true;
  const beforeSend = Number.isFinite(t.submitted) ? t.submitted + (t.tokenWaitBeforeFirstSend ?? 0) : null;
  const row = Object.freeze({
    input: t.source, outcome: outcome === 'CARD_CHECKPOINT' ? 'CARD_CHECKPOINT' : 'NOT_RENDERED', attempts: t.attempts,
    shutterToFileMs: elapsed(t.shutter, t.selected),
    prepareMs: elapsed(t.selected, t.prepared),
    readyToSubmitMs: elapsed(t.prepared, t.submitted),
    tokenWaitMs: Number.isFinite(t.tokenWait) ? Math.round(t.tokenWait) : null,
    submitToSendMs: elapsed(beforeSend, t.firstSend),
    sendToHeadersMs: elapsed(t.lastSend, t.headers),
    firstSendToHeadersMs: elapsed(t.firstSend, t.headers),
    headersToBodyMs: elapsed(t.headers, t.body),
    bodyToPaintCheckpointMs: elapsed(t.body, t.painted),
    totalMs: elapsed(t.shutter ?? t.selected, now)
  });
  rows.push(row);
  if (rows.length > 100) rows.shift();
  showLatestTiming(row);
}
if (enabled) globalThis.hoshiluQaPhotoTimings = () => rows.slice();
