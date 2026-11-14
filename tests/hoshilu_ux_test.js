const fs = require('node:fs');
const assert = require('node:assert/strict');
const read = (path) => fs.readFileSync(path, 'utf8');
const index = read('tools/line-worker/public/index.html');
const app = read('tools/line-worker/public/app.js');

for (const id of ['goSearch', 'goWish', 'clearQuery', 'mywish']) {
  assert.match(index, new RegExp(`id="${id}"`));
}
assert.doesNotMatch(index, /id="goWatch"|id="goInsight"|id="goAccount"/);
assert.match(app, /features:\['ホシル','ほしっとく'\]/);
assert.match(app, /account:'マイページ'/);
assert.doesNotMatch(app, /elements\.goWatch|elements\.goInsight|elements\.goAccount/);
assert.match(app, /function focusSearch\(\)/);
assert.match(app, /elements\.query\.focus/);
assert.match(app, /className='wish-item'/);
assert.match(app, /method:'PATCH'/);
assert.match(app, /method:'DELETE'/);
assert.match(app, /removeLocalWish/);
assert.match(app, /watchOptionsFor/);
assert.match(index, /商品名が分からなくても、うまく説明できなくても大丈夫。<\/span><span>見た目、見た場所、使い方。覚えていることから話してください。/);
console.log('PASS HOSHILU navigation and MYWISH management');
