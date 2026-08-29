import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const publicDir = new URL('../public/', import.meta.url);
const read = (name) => fs.readFileSync(new URL(name, publicDir), 'utf8');

test('同意チェックなしで一言・カメラ・画像・投稿URLを検索手掛かりにできる', () => {
  const html = read('index.html');
  const app = read('app.js');
  assert.doesNotMatch(html, /id="consent"|class="consent"/u);
  assert.match(html, /id="query"/u);
  const camera = html.match(/<input id="searchCamera"[^>]+>/u)?.[0] || '';
  const screenshot = html.match(/<input id="searchScreenshot"[^>]+>/u)?.[0] || '';
  assert.match(camera, /type="file"/u);
  assert.match(camera, /accept="image\/jpeg,image\/png,image\/webp"/u);
  assert.match(camera, /capture="environment"/u);
  assert.match(camera, /aria-describedby="searchInputNotice"/u);
  assert.doesNotMatch(screenshot, /capture=/u);
  assert.match(html, /id="searchScreenshot"/u);
  assert.match(html, /id="socialUrl"/u);
  assert.match(app, /elements\.camera\?\.addEventListener\('change',\(\)=>handleSearchImageSelection\(elements\.camera,'CAMERA'\)\)/u);
  assert.match(app, /submittedImageSource==='CAMERA'\?'CAMERA':'SCREENSHOT'/u);
  assert.match(app, /processing_notice_shown:true/u);
  assert.doesNotMatch(app, /consent:true|elements\.consent|consent\.checked/u);
});

test('取消・削除・画像差し替えで既存画像を失わず古い非同期変換結果も復活させない', () => {
  const app = read('app.js');
  const clearStart = app.indexOf('function clearPreparedSearchImage');
  const handlerStart = app.indexOf('async function handleSearchImageSelection', clearStart);
  const handlerEnd = app.indexOf("elements.removeScreenshot?.addEventListener", handlerStart);
  const clear = app.slice(clearStart, app.indexOf('function hasSupplementalSearchInput', clearStart));
  const handler = app.slice(handlerStart, handlerEnd);
  assert.match(clear, /searchImageGeneration\+=1/u);
  assert.match(clear, /elements\.camera\.value=''/u);
  assert.match(handler, /const generation=\+\+searchImageGeneration/u);
  assert.match(handler, /const file=input\?\.files\?\.\[0\];if\(!file\)return;/u);
  assert.match(handler, /previous=\{payload:preparedSearchImage,source:preparedSearchImageSource/u);
  assert.match(handler, /if\(generation!==searchImageGeneration\)return;\s*const labels=selectedSearchInputCopy\(\);\s*preparedSearchImage=/u);
  assert.match(handler, /catch\(error\)\{\s*if\(generation!==searchImageGeneration\)return;/u);
  assert.match(handler, /preparedSearchImage=previous\.payload;preparedSearchImageSource=previous\.source/u);
  assert.match(handler, /finally\{if\(generation===searchImageGeneration\)\{searchImagePreparing=false/u);
});

test('画像準備中の言語切替は準備中表示を保ち、完了時は最新言語を使う', () => {
  const app = read('app.js');
  assert.match(app, /screenshotPreviewStatus\.textContent=searchImagePreparing\?inputLabels\.preparing:inputLabels\.imageReady/u);
  assert.match(app, /const prepared=await prepareSearchImage\(file\);if\(generation!==searchImageGeneration\)return;\s*const labels=selectedSearchInputCopy\(\)/u);
  assert.match(app, /catch\(error\)\{\s*if\(generation!==searchImageGeneration\)return;const labels=selectedSearchInputCopy\(\)/u);
});

test('投稿URLの入力欄を閉じると値も消え、旧HTMLでも新appが壊れない', () => {
  const app = read('app.js');
  const toggleStart = app.indexOf("elements.socialUrlToggle?.addEventListener('click'");
  const toggle = app.slice(toggleStart, app.indexOf("elements.socialUrl?.addEventListener('input'", toggleStart));
  assert.match(toggle, /else\{elements\.socialUrl\.value=''/u);
  for (const optionalNode of ['heroPromise', 'queryLabel', 'searchInputActions', 'cameraActionLabel', 'screenshotActionLabel']) {
    assert.match(app, new RegExp(`if\\(elements\\.${optionalNode}\\)`));
  }
});

test('V1カメラ検索はライブ映像権限を開けず、端末の撮影UIだけを使う', () => {
  const app = read('app.js');
  const headers = read('_headers');
  const css = read('ai-search-layout-fix.css');
  assert.doesNotMatch(app, /getUserMedia|MediaStream/u);
  assert.match(headers, /Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\)/u);
  assert.match(css, /\.screenshot-preview img:not\(\[src\]\)\{visibility:hidden\}/u);
});

test('ブラウザ側も公開投稿URLだけをサーバーと同じ境界で許可する', () => {
  const app = read('app.js');
  const start = app.indexOf('function supportedSocialUrl(value)');
  const end = app.indexOf('\nfunction fileAsDataUrl', start);
  assert.ok(start >= 0 && end > start);
  const source = app.slice(start, end).replace(/^function supportedSocialUrl/u, 'function');
  const supportedSocialUrl = Function(`"use strict";return (${source});`)();

  for (const url of [
    'https://www.tiktok.com/@hoshilu/video/12345678',
    'https://www.tiktok.com/t/ABC123/',
    'https://vm.tiktok.com/ABC123/',
    'https://www.facebook.com/permalink.php?story_fbid=ABC123&id=42',
    'https://www.facebook.com/watch/?v=ABC123'
  ]) assert.equal(supportedSocialUrl(url), true, url);

  for (const url of [
    'https://www.tiktok.com/login/reset/SECRET',
    'https://www.tiktok.com/t/login/reset/SECRET',
    'https://www.tiktok.com/ABC123',
    'https://www.youtube.com/account?v=abc123',
    'https://www.youtube.com/watch?v=abc123',
    'https://youtu.be/abc123',
    'https://www.facebook.com/login?story_fbid=ABC123',
    'https://www.facebook.com/login/posts/ABCDE',
    'https://www.facebook.com/groups/posts/ABCDE',
    'https://www.facebook.com/marketplace/posts/ABCDE',
    'https://www.facebook.com/developers/posts/ABCDE',
    'https://x.com/settings/status/12345',
    'https://www.facebook.com/photos?v=ABC123',
    'https://instagram.com.evil.example/p/ABC123/',
    'https://pin.it/AbCd/extra',
    'https://www.pinterest.com/pin/ABC123/extra',
    'https://www.facebook.com/share/r/ABCDE/extra/private',
    'https://www.facebook.com/reel/ABCDE/extra',
    'https://www.instagram.com/p/ABC123/extra'
  ]) assert.equal(supportedSocialUrl(url), false, url);
});

test('ブラウザ側も指示語だけの文と実属性を含む文を区別する', () => {
  const app = read('app.js');
  const start = app.indexOf('function isUsableProductQuery(value)');
  const end = app.indexOf('\nfunction selectedSearchInputCopy', start);
  assert.ok(start >= 0 && end > start);
  const source = `${app.slice(start, end)}\nreturn isIndependentSearchText;`;
  const isIndependentSearchText = Function(`"use strict";${source}`)();
  for (const query of [
    'これ何？', 'これを探して', 'この画像の商品', 'この投稿の商品',
    'これ欲しい', 'それの名前', 'この写真の物を探して', 'what is this?',
    'find this', 'this product', 'please find this', 'what is this product?',
    'can you find this', 'show me this', 'これの名前を教えて', 'これは何の商品',
    'この商品を教えて', 'この画像は何', 'これ買いたい', 'これを特定して',
    '写真のこれ', 'what is this thing', 'tell me what this is', 'find me this',
    'I want this one', 'search for this', 'look for this', 'this thing',
    '这个是什么', '帮我找这个', '이거 찾아줘', '이게 뭐야', 'これの商品名',
    'これどこで買える', 'where can I buy this', '이거 뭐예요', '이 제품', '이 상품'
    , 'what is this called', 'where is this sold', 'where can this be found',
    'これどこに売ってる', 'これどこで手に入る', 'これどこにある',
    '这个哪里可以买', '这个哪里有卖', '那件商品是什么', '这张图片里的商品',
    '이거 어디서 사요', '그거 어디서 사요', '그 상품 찾아줘', '이게 어디서 팔아요',
    '그 제품 찾아 주세요', '저 제품 찾아 주세요', '그 상품', '저 상품',
    '그 물건 뭐예요', '저 사진 상품명', '그 게시물의 제품', '그 이미지 제품'
  ]) assert.equal(isIndependentSearchText(query), false, query);
  for (const query of ['ピンクのこれ', '24cmのこれ', 'small pink camera',
    'find this pink camera', '这个粉色相机', '이거 핑크 카메라']) {
    assert.equal(isIndependentSearchText(query), true, query);
  }
});
