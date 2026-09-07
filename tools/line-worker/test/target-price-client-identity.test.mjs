import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Exercise the real save-button handler, including the unauthenticated handoff.
function watchDialog(memberSession, postPurchase = false) {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const created = [];
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.classList = { add() {}, toggle() {} }; created.push(this); }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute() {}
    setCustomValidity() {}
    reportValidity() { throw new Error('Unexpected invalid input'); }
    addEventListener(type, callback) { this.listeners[type] = callback; }
    querySelector(selector) { return created.find(node => node.className === selector.slice(1)) || null; }
  }
  const storage = new Map();
  const context = {
    document: { createElement: tag => new Element(tag) },
    textElement: (tag, className, text) => Object.assign(new Element(tag), { className, textContent: text }),
    elements: { language: { value: 'JA' }, query: { value: 'テスト バッグ' } },
    memberSession, actionCopy: { JA: { saveWatch: '保存' } },
    getWatchPreferences: () => [], formatMoney: () => '¥2,800',
    localStorage: { setItem: (key, value) => storage.set(key, value) },
    saveWish: (_query, _options, target) => { context.saved = target; return true; },
    createWatchQuickJoin: () => new Element('div'), setTimeout() {},
    watchFrequencyFor: () => 'INSTANT', watchAttributionPayload: () => ({}),
    candidate: { target_product_key: 'RAKUTEN:shop:item-1', display_name: 'テスト バッグ', offers: [] },
    result: null, saved: null
  };
  const source = app.match(/function createWatchOptions[\s\S]*?(?=\nfunction saveWatchChoice)/u)?.[0];
  const payload = app.match(/function payloadFor[^\n]+/u)?.[0];
  assert.ok(source && payload);
  runInNewContext(`${source}\n${payload}\nresult=createWatchOptions(candidate,{});`, context);
  created.find(node => node.type === 'number').value = '2500';
  created.find(node => node.type === 'checkbox').checked = postPurchase;
  created.find(node => node.className === 'watch-save-button').listeners.click();
  return { context, storage };
}

test('会員の希望価格ボタンは公開された商品IDを保存ペイロードへ渡す', () => {
  for (const postPurchase of [false,true]) {
    const { context } = watchDialog({ id: 'test-member' }, postPurchase);
    runInNewContext("result=payloadFor('テスト バッグ',[], 'INSTANT', saved);", context);
    assert.equal(context.result.target_product_key, 'RAKUTEN:shop:item-1');
    assert.equal(context.result.target_price_jpy, postPurchase ? 2499 : 2500);
  }
});

test('未ログインの希望価格ボタンもメール・LINE認証用の保留データに商品IDを残す', () => {
  for (const postPurchase of [false,true]) {
    const { storage } = watchDialog(null, postPurchase);
    const pending = JSON.parse(storage.get('hoshilu_pending_watch'));
    assert.equal(pending.target_product_key, 'RAKUTEN:shop:item-1');
    assert.equal(pending.target_price_jpy, postPurchase ? 2499 : 2500);
  }
});
