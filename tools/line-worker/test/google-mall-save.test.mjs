import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const moduleCode = readFileSync(new URL('../public/google-mall-results.mjs', import.meta.url), 'utf8');
class Element {
  children = []; dataset = {}; listeners = {}; style = {}; className = ''; textContent = '';
  classList = { add() {}, remove() {} };
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  addEventListener(name, fn) { this.listeners[name] = fn; }
  insertAdjacentElement() {}
  // 2026-09-25: 未登録の保存後はカード内の登録欄へ scrollIntoView する（モーダルは出さない）。
  querySelector(selector) { const cls = selector.replace(/^\./u, ''); for (const child of this.children) { if (child.className === cls) return child; const found = child.querySelector?.(selector); if (found) return found; } return null; }
  scrollIntoView(options) { this.scrolledInto = options; }
}
function context(member = true) {
  const handlers = {}, saved = [], feedback = [], storage = new Map();
  const document = {
    createElement: () => new Element(),
    querySelector: (selector) => selector === '#languageSelect' ? { value: 'JA' } : new Element(),
    addEventListener: (name, fn) => { handlers[name] = fn; },
    dispatchEvent: (event) => handlers[event.type]?.(event)
  };
  const labels = { action: 'ホシっとく', localAction: 'ホシっとく', active: '探し中', local: '端末に保存', login: 'ログイン' };
  const ctx = vm.createContext({
    document, window: { matchMedia: () => ({ matches: false }), setTimeout() {}, innerHeight: 800 }, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    requestAnimationFrame() {}, elements: { language: { value: 'JA' } },
    continuousSearchCopy: { JA: labels }, memberSession: member ? {} : null,
    textElement: () => new Element(), getWishes: () => [], insightEnabledFor: () => false,
    saveInsightWatch: async (query) => { saved.push(query); return true; },
    wishSaveFailedCopy: () => '保存失敗', showWishSaveFeedback: (value) => feedback.push(value),
    createWatchQuickJoin: (_amount, onDone) => { const node = new Element(); node.className = 'watch-quick-join'; node.onDone = onDone; return node; },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }
  });
  vm.runInContext(app.slice(app.indexOf('function continuousSearchCard('), app.indexOf('// 検索完了時、結果セクションが画面外')), ctx);
  return { ctx, document, handlers, saved, feedback, storage };
}

test('Google product cards reuse one-click member saving; category links do not get a save control', async () => {
  const state = context();
  vm.runInContext(moduleCode, state.ctx);
  state.ctx.item = { title: 'リリーイブ 頭皮ケア', product_page: true, product_url: 'https://www.amazon.co.jp/dp/B000000000' };
  const card = vm.runInContext('card(item, COPY.JA)', state.ctx);
  const control = card.children[1].children[0];
  assert.equal(control.children.length, 1); // compact actions
  const button = control.children[0].children[0];
  await button.listeners.click();
  assert.deepEqual(state.saved, ['リリーイブ 頭皮ケア']);
  assert.equal(button.textContent, '探し中');
  assert.equal(state.feedback[0].saved, true);
  state.ctx.item.product_page = false;
  assert.equal(vm.runInContext('card(item, COPY.JA)', state.ctx).children.length, 1);
});

test('failed member save stays retryable and never claims searching', async () => {
  const state = context();
  state.ctx.saveInsightWatch = async () => false;
  const container = new Element();
  state.handlers['hoshilu:google-mall-save-control']({ detail: { item: { title: '商品', product_page: true }, container } });
  const button = container.children[0].children[0].children[0];
  await button.listeners.click();
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, '保存失敗');
  assert.equal(state.feedback[0].saved, false);
});

test('guest preserves the chosen title for registration and does not claim active on failed post-registration save', async () => {
  const state = context(false);
  const container = new Element();
  state.handlers['hoshilu:google-mall-save-control']({ detail: { item: { title: '商品タイトル', product_page: true }, container } });
  const actions = container.children[0].children[0], button = actions.children[0];
  await button.listeners.click();
  assert.equal(JSON.parse(state.storage.get('hoshilu_pending_insight')).query, '商品タイトル');
  // 2026-09-25: 未登録では「保存しました」モーダルを出さず、登録欄へ視線を移す
  assert.equal(state.feedback.length, 0);
  assert.ok(actions.children[2].scrolledInto);
  state.ctx.memberSession = {};
  actions.children[2].onDone();
  assert.equal(button.textContent, '保存失敗');
  assert.equal(button.disabled, false);
});

test('pending insight is retained on failure and removed only after confirmed saving', async () => {
  const state = context();
  vm.runInContext(app.slice(app.indexOf('async function applyPendingInsight(){'), app.indexOf('// 会員セッションの同期後に')), state.ctx);
  state.storage.set('hoshilu_pending_insight', JSON.stringify({ query: '商品', saved_at: Date.now() }));
  state.ctx.saveInsightWatch = async () => false;
  await vm.runInContext('applyPendingInsight()', state.ctx);
  assert.ok(state.storage.has('hoshilu_pending_insight'));
  state.ctx.saveInsightWatch = async () => true;
  await vm.runInContext('applyPendingInsight()', state.ctx);
  assert.equal(state.storage.has('hoshilu_pending_insight'), false);
});
