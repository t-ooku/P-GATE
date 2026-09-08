const fs = require('node:fs');
const assert = require('node:assert/strict');
const index = fs.readFileSync('tools/line-worker/public/index.html', 'utf8');
const script = fs.readFileSync('tools/line-worker/public/speech-input.js', 'utf8');
const css = fs.readFileSync('tools/line-worker/public/speech-input.css', 'utf8');
const serviceWorker = fs.readFileSync('tools/line-worker/public/service-worker.js', 'utf8');

assert.match(index, /id="speechInput"/);
assert.match(index, /\/speech-input\.js/);
assert.match(script, /SpeechRecognition \|\| window\.webkitSpeechRecognition/);
for (const locale of ['ja-JP','en-US','zh-CN','ko-KR']) assert.match(script, new RegExp(locale));
assert.match(script, /query\.dispatchEvent\(new Event\('input'/);
assert.match(script, /button\.classList\.remove\('hidden'\)/);
assert.match(css, /\.speech-input\.listening/);
assert.match(serviceWorker, /hoshilu-shell-v31/);
console.log('PASS HOSHILU four-language speech input');
