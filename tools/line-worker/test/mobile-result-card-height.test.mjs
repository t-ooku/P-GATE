import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('商品提示はPC4列・モバイル横長行でページ全体を縦スクロールする', async () => {
  const [app, styles] = await Promise.all([read('app.js'), read('ai-search-layout-fix.css')]);
  assert.match(styles, /\.result-track\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\);[\s\S]*?max-height:none;[\s\S]*?overflow-y:visible;/);
  assert.match(styles, /@media\(max-width:760px\)\{[\s\S]*?\.result-track\{[\s\S]*?flex-direction:column/);
  assert.match(styles, /grid-template-columns:minmax\(126px,40%\) minmax\(0,1fr\)/);
  assert.match(styles, /@media\(max-width:760px\)\{[\s\S]*?\.result-track>\.product-card\{[\s\S]*?min-height:0;/);
  assert.match(styles, /\.result-track>\.product-card>\.product-card-media-column\{[\s\S]*?grid-row:1 \/ span 5;/);
  assert.doesNotMatch(styles, /grid-row:1 \/ span 14/);
  assert.doesNotMatch(app, /attachVerticalTicker\(track,\{intervalMs:6500,rowSelector:':scope > \.product-card',useRowOffsets:true\}\)/);
  assert.match(app, /scrollBy\(horizontal\?\{left:[^}]+\}:\{top:/);
});

test('レコメンド商品だけは共通の縦回転を上書きして横回転する', async () => {
  const styles = await read('ai-search-layout-fix.css');
  const mobileVerticalRule = styles.indexOf('@media(max-width:760px)');
  const recommendationHorizontalRule = styles.lastIndexOf('.result-row-recommended .result-track{');
  assert.ok(recommendationHorizontalRule > mobileVerticalRule);
  assert.match(styles, /\.result-row-recommended \.result-track\{[\s\S]*?flex-direction:row;[\s\S]*?overflow-x:auto;[\s\S]*?overflow-y:hidden;[\s\S]*?scroll-snap-type:x mandatory;/);
  assert.match(styles, /@media\(max-width:760px\)\{[\s\S]*?\.result-row-recommended \.result-track\{[\s\S]*?flex-direction:row;[\s\S]*?gap:12px;/);
  assert.match(styles, /\.result-row-recommended \.result-track>\.product-card\{[\s\S]*?display:flex;[\s\S]*?flex-direction:column;[\s\S]*?border-radius:19px;/);
  assert.match(styles, /\.result-row-recommended \.result-carousel>\.carousel-button\{[\s\S]*?top:42%;[\s\S]*?bottom:auto;[\s\S]*?transform:none;/);
  assert.match(styles, /\.result-row-recommended \.result-carousel>\.carousel-button\.previous\{left:-4px;right:auto\}/);
  assert.match(styles, /\.result-row-recommended \.result-carousel>\.carousel-button\.next\{left:auto;right:-4px\}/);
});

test('レコメンド理由は商品名直後に置き価格枠をカード幅内へ収める', async () => {
  const [app, styles] = await Promise.all([read('app.js'), read('ai-search-layout-fix.css')]);
  assert.match(app, /const title=textElement\('h3','',candidate\.display_name[\s\S]*?card\.append\(title\);[\s\S]*?title\.after\(textElement\('div','recommendation-reason'/);
  assert.doesNotMatch(app, /if\(!confirmed&&candidate\.recommendation_reason\)card\.append\(textElement\('div','recommendation-reason'/);
  assert.match(styles, /\.result-row-recommended \.price-comparison,[\s\S]*?\.result-row-recommended \.price-offer,[\s\S]*?max-width:100%;[\s\S]*?min-width:0;/);
  assert.match(styles, /\.result-row-recommended \.price-offer strong,[\s\S]*?overflow-wrap:anywhere;/);
});

test('Turnstileは初回トークン待機中にwidgetをリセットしない', async () => {
  const [app, html] = await Promise.all([read('app.js'), read('index.html')]);
  assert.match(app, /async function waitForTurnstileApi\(\)/);
  assert.doesNotMatch(app, /window\.turnstile\.ready\(/);
  assert.match(app, /retry:'auto','retry-interval':3000,'refresh-expired':'auto','refresh-timeout':'auto'/);
  assert.match(app, /callback:onTurnstileToken/);
  assert.match(app, /if\(lastIssuedTurnstileToken\)await resetTurnstileWidget\(\)/);
  assert.doesNotMatch(app, /turnstile\?\.getResponse|turnstile\.getResponse/);
  assert.match(html, /api\.js\?render=explicit" defer/);
  assert.doesNotMatch(html, /api\.js\?render=explicit" async defer/);
});

test('PC4列では画像と価格が同じ表示範囲に収まるようカードをコンパクト化する', async () => {
  const styles = await read('ai-search-layout-fix.css');
  assert.match(styles, /@media\(min-width:761px\)\{[\s\S]*?\.result-track>\.product-card\{min-height:0;gap:6px;padding:10px\}/);
  assert.match(styles, /height:clamp\(180px,15vw,225px\);[\s\S]*?aspect-ratio:auto/);
  assert.match(styles, /\.result-track>\.product-card p\{-webkit-line-clamp:1;line-clamp:1/);
  assert.match(styles, /\.result-track>\.product-card \.price-offer\{padding:7px 8px\}/);
});

// 2026-09-22 大隆さん指示「まだレコメンド欄のボタンがホシル提示欄と全く同じ配置に
// なってないよ」。統合カードと同じ形（価格比較は価格の行、口コミはボタン1つ）にそろえる。
test('レコメンドのボタンは統合カードと同じ配置（価格比較は価格の行、口コミは1ボタン）', async () => {
  const [app, styles] = await Promise.all([read('app.js'), read('result-compact.css')]);
  assert.match(app, /function compactCardActions\(card\)\{/u);
  assert.match(app, /row\.className='product-card-price-row'/u);
  assert.match(app, /button\.className='unified-reviews-toggle'/u);
  assert.match(app, /const post=card\.querySelector\('\.experience-post'\);/u);
  // ♡ の升目は隣と同じ大きさ（2026-09-22 大隆さん報告「気になるボタンが統一されてない」）
  assert.match(styles, /\.result-row-recommended \.result-track>\.product-card \.keep-product\{display:flex;flex-direction:column;gap:4px;width:100%\}/u);
  // レコメンドの3つの作り口（主結果・代替・関連API）はすべて同じカードを通す
  assert.equal(app.split('=>recommendationCard(candidate,index,').length - 1, 3);
  assert.doesNotMatch(app, /resultRow\(products\.map\(\(candidate,index\)=>productCard\(/u);
  assert.match(styles, /\.result-row-recommended \.result-track>\.product-card>\.product-card-price-row\{[\s\S]*?display:flex;/u);
  assert.match(styles, /\.result-row-recommended \.result-track>\.product-card \.experience-block\{display:none\}/u);
  assert.match(styles, /\.result-row-recommended \.result-track>\.product-card\.reviews-open \.experience-block\{display:block\}/u);
});
