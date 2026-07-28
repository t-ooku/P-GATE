const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const i18n = read('tools/line-worker/public/site-i18n.js');
const index = read('tools/line-worker/public/index.html');
const login = read('tools/line-worker/public/login.html');
const sellerLogin = read('tools/line-worker/public/seller-login.html');
const sellerPage = read('tools/line-worker/src/seller-page.mjs');
const app = read('tools/line-worker/public/app.js');

for (const language of ['JA', 'EN', 'ZH', 'KO']) {
  assert.match(i18n, new RegExp(`${language}:\\{`));
}
for (const file of [index, login, sellerLogin, sellerPage]) {
  assert.match(file, /site-i18n\.js/);
}
assert.match(login, /data-i18n="member\.title"/);
assert.match(sellerLogin, /data-i18n="seller\.title"/);
assert.match(sellerPage, /data-i18n="seller\.consoleTitle"/);
assert.match(index, /data-i18n="nav\.business"/);
for (const message of [
  '一致するほしっトクはありません。',
  'No saved items match your search.',
  '没有符合搜索条件的已保存商品。',
  '검색과 일치하는 저장 항목이 없습니다.'
]) {
  assert.match(app, new RegExp(message));
}
assert.match(app, /term\?t\.filteredEmptyWish:t\.emptyWish/);

console.log('PASS HOSHILU four-language shared UI');
