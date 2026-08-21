import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('スマホの主要5モールは1行でYahooだけ指定位置で改行する', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/marketplace-coverage.css', import.meta.url), 'utf8')
  ]);
  assert.match(html, /class="marketplace-yahoo"><span>Yahoo!<br>ショッピング<\/span>/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.marketplace-group-core ul \{\s*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 390px\)[\s\S]*\.marketplace-group-core ul \{\s*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.marketplace-yahoo span \{[\s\S]*text-align: center/);
});
