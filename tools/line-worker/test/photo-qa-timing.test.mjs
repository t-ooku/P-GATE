import test from 'node:test';
import assert from 'node:assert/strict';

test('QA timing returns only stage durations and never mixes captures', async () => {
  globalThis.location = { search: '?qa=1' };
  const m = await import('../public/photo-qa-timing.mjs?test=qa');
  const file = { name: 'private-name', data: 'private-photo' };
  const other = {};
  m.rememberPhotoShutter(file, 10);
  const prepared = m.startPhotoTiming(file, 'CAMERA', 35);
  assert.equal(m.startPhotoTiming(other, 'CAMERA', 35).shutter, undefined);
  prepared.prepared = 55;
  const r = m.startPhotoRequest(prepared, 58);
  Object.assign(r, { attempts: 2, firstSend: 75, lastSend: 90, headers: 110, body: 121, painted: 145 });
  m.finishPhotoTiming(r, 'CARD_CHECKPOINT', 145);
  m.finishPhotoTiming(r, 'NOT_RENDERED', 146);
  const rows = globalThis.hoshiluQaPhotoTimings();
  assert.deepEqual(rows, [{ input: 'LENS_CAMERA', outcome: 'CARD_CHECKPOINT', attempts: 2, shutterToFileMs: 25,
    prepareMs: 20, readyToSubmitMs: 3, submitToSendMs: 17, sendToHeadersMs: 20, firstSendToHeadersMs: 35,
    headersToBodyMs: 11, bodyToPaintCheckpointMs: 24, totalMs: 135 }]);
  assert.doesNotMatch(JSON.stringify(rows), /private|data|url/i);
  const native = m.startPhotoRequest(m.startPhotoTiming(other, 'CAMERA', 180), 190);
  m.finishPhotoTiming(native, 'NOT_RENDERED', 208);
  assert.equal(globalThis.hoshiluQaPhotoTimings()[1].shutterToFileMs, null);
  assert.equal(globalThis.hoshiluQaPhotoTimings()[1].sendToHeadersMs, null);
  delete globalThis.hoshiluQaPhotoTimings;
  delete globalThis.location;
});

test('measurement is disabled outside qa=1', async () => {
  globalThis.location = { search: '?qa=0' };
  const m = await import('../public/photo-qa-timing.mjs?test=off');
  assert.equal(m.startPhotoTiming({}, 'CAMERA', 1), null);
  assert.equal(typeof globalThis.hoshiluQaPhotoTimings, 'undefined');
  delete globalThis.location;
});
