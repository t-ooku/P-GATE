const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const index = read('tools/line-worker/public/index.html');
const app = read('tools/line-worker/public/app.js');
const pwa = JSON.parse(read('tools/line-worker/public/manifest-v2.webmanifest'));
const extension = JSON.parse(read('tools/chrome-extension/manifest.json'));
const serviceWorker = read('tools/line-worker/public/service-worker.js');

assert.match(index, /ホシル｜欲しいを、ちゃんと見つける。/);
assert.match(index, /ほしっとく/);
assert.match(index, /ホシっといて/);
assert.match(index, /HOSHILU INSIGHT/);
assert.match(index, /og-hoshilu/);
assert.doesNotMatch(index, />MYGATE</);

assert.equal(pwa.short_name, 'ホシル');
assert.match(pwa.name, /^ホシル/);
assert.equal(extension.short_name, '__MSG_extensionShortName__');
assert.equal(extension.default_locale, 'ja');
const extensionJa = JSON.parse(read('tools/chrome-extension/_locales/ja/messages.json'));
assert.equal(extensionJa.extensionShortName.message, 'ホシル');
assert.equal(extension.name, '__MSG_extensionName__');
assert.match(extensionJa.extensionName.message, /^ホシル/);
assert.equal(extension.version, '0.4.0');

assert.match(app, /ホシルからの提案/);
assert.match(app, /ほしっとくしました/);
assert.match(app, /Suggestions from HOSHILU/);
assert.match(serviceWorker, /hoshilu-shell-v\d+/);

assert.match(app, /mygate_session_id/);
assert.match(app, /mygate_language/);
assert.match(app, /mygate_wishes/);
assert.match(app, /syncMemberWishes/);
assert.match(app, /\/api\/member\/wishes/);

console.log('PASS HOSHILU public brand');
console.log('PASS legacy local-storage compatibility');
