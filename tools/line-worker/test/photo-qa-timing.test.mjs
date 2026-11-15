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
  m.recordPhotoTokenWait(r, 60, 70);
  r.firstSend = 75;
  m.recordPhotoTokenWait(r, 80, 85);
  Object.assign(r, { attempts: 2, lastSend: 90, headers: 110, body: 121, painted: 145 });
  m.finishPhotoTiming(r, 'CARD_CHECKPOINT', 145);
  m.finishPhotoTiming(r, 'NOT_RENDERED', 146);
  const rows = globalThis.hoshiluQaPhotoTimings();
  assert.deepEqual(rows, [{ input: 'LENS_CAMERA', outcome: 'CARD_CHECKPOINT', attempts: 2, shutterToFileMs: 25,
    prepareMs: 20, readyToSubmitMs: 3, tokenWaitMs: 15, submitToSendMs: 7, sendToHeadersMs: 20, firstSendToHeadersMs: 35,
    headersToBodyMs: 11, bodyToPaintCheckpointMs: 24, totalMs: 135 }]);
  assert.doesNotMatch(JSON.stringify(rows), /private|data|url/i);
  const native = m.startPhotoRequest(m.startPhotoTiming(other, 'CAMERA', 180), 190);
  m.recordPhotoTokenWait(native, 191, 207);
  m.finishPhotoTiming(native, 'NOT_RENDERED', 208);
  const failure = globalThis.hoshiluQaPhotoTimings()[1];
  assert.equal(failure.shutterToFileMs, null);
  assert.equal(failure.tokenWaitMs, 16);
  assert.equal(failure.submitToSendMs, null);
  assert.equal(failure.sendToHeadersMs, null);
  delete globalThis.hoshiluQaPhotoTimings;
  delete globalThis.location;
});

test('QA phone panel renders only the latest row, with no identifiers', async () => {
  const make = (tag) => ({
    tag, style: {}, dataset: {}, children: [], isConnected: false, textContent: '',
    append(...nodes) { this.children.push(...nodes); for (const node of nodes) node.isConnected = true; }
  });
  globalThis.location = { search: '?qa=1' };
  globalThis.document = { body: make('body'), createElement: make };
  try {
    const m = await import('../public/photo-qa-timing.mjs?test=panel');
    assert.equal(document.body.children.length, 0);
    for (const [source, elapsed] of [['CAMERA', 15], ['SCREENSHOT', 21]]) {
      const r = m.startPhotoRequest(m.startPhotoTiming({ name: 'private file' }, source, 10), 11);
      m.finishPhotoTiming(r, 'NOT_RENDERED', 10 + elapsed);
    }
    assert.equal(document.body.children.length, 1);
    const [panel] = document.body.children;
    assert.equal(panel.tag, 'details');
    assert.equal(panel.children[0].tag, 'summary');
    assert.match(panel.children[1].textContent, /ALBUM.*\n[\s\S]*合計: 21 ms/u);
    assert.doesNotMatch(panel.children[1].textContent, /NATIVE_CAMERA|private file/u);
  } finally {
    delete globalThis.hoshiluQaPhotoTimings;
    delete globalThis.location;
    delete globalThis.document;
  }
});

test('measurement is disabled outside qa=1', async () => {
  globalThis.location = { search: '?qa=0' };
  globalThis.document = { get body() { assert.fail('QA panel must not access the DOM'); } };
  const m = await import('../public/photo-qa-timing.mjs?test=off');
  assert.equal(m.startPhotoTiming({}, 'CAMERA', 1), null);
  assert.equal(typeof globalThis.hoshiluQaPhotoTimings, 'undefined');
  delete globalThis.location;
  delete globalThis.document;
});
