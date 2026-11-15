// QA-only, in-memory measurements. No network, storage, or input data in output.
const enabled = typeof location !== 'undefined' && new URLSearchParams(location.search).get('qa') === '1';
const captures = new WeakMap();
const rows = [];
const elapsed = (from, to) => Number.isFinite(from) && Number.isFinite(to) && to >= from ? Math.round(to - from) : null;

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
export function finishPhotoTiming(t, outcome, now = performance.now()) {
  if (!t || t.finished) return;
  t.finished = true;
  rows.push(Object.freeze({
    input: t.source, outcome: outcome === 'CARD_CHECKPOINT' ? 'CARD_CHECKPOINT' : 'NOT_RENDERED', attempts: t.attempts,
    shutterToFileMs: elapsed(t.shutter, t.selected),
    prepareMs: elapsed(t.selected, t.prepared),
    readyToSubmitMs: elapsed(t.prepared, t.submitted),
    submitToSendMs: elapsed(t.submitted, t.firstSend),
    sendToHeadersMs: elapsed(t.lastSend, t.headers),
    firstSendToHeadersMs: elapsed(t.firstSend, t.headers),
    headersToBodyMs: elapsed(t.headers, t.body),
    bodyToPaintCheckpointMs: elapsed(t.body, t.painted),
    totalMs: elapsed(t.shutter ?? t.selected, now)
  }));
  if (rows.length > 100) rows.shift();
}
if (enabled) globalThis.hoshiluQaPhotoTimings = () => rows.slice();
