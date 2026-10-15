import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/for-sellers.js', import.meta.url), 'utf8');
function tracker() {
  const handlers = new Map(), events = [];
  runInNewContext(source.slice(source.indexOf('let sellerFormStarted'), source.indexOf('const failureSent')), {
    form: { addEventListener(type, handler) { handlers.set(type, handler); } },
    sendSellerEvent(type, extra) { events.push({ type, content: extra.content }); }
  });
  return { events, fire(type, event) { handlers.get(type)?.(event); } };
}

test('focus and script-generated input cannot turn preview visits into input-start evidence', () => {
  const page = tracker();
  page.fire('focusin', { isTrusted: true });
  page.fire('input', { isTrusted: false });
  page.fire('change', {});
  assert.deepEqual(page.events, []);
  page.fire('input', { isTrusted: true, get target() { throw Error('field contents must never be inspected'); } });
  page.fire('change', { isTrusted: true });
  assert.deepEqual(page.events, [{ type: 'seller_form_started', content: 'consultation_input' }]);
});

test('a trusted change also records select or autofill interaction once without reading values', () => {
  const page = tracker();
  page.fire('change', { isTrusted: true, get target() { throw Error('no field access'); } });
  page.fire('input', { isTrusted: true });
  assert.equal(page.events.length, 1);
  assert.equal(page.events[0].content, 'consultation_input');
});
