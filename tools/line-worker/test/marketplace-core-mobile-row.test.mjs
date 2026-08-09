import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('13モール名は1行を維持しYahoo!ショッピングも改行しない', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/marketplace-coverage.css', import.meta.url), 'utf8')
  ]);
  assert.match(html, /class="marketplace-yahoo"><span>Yahoo!ショッピング<\/span>/);
  assert.match(css, /grid-template-columns: repeat\(13, minmax\(82px, 1fr\)\)/);
  assert.match(css, /@media \(min-width: 1024px\)[\s\S]*grid-template-columns: repeat\(13, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.marketplace-yahoo span \{\s*white-space: nowrap/);
  assert.match(css, /overflow-x: auto/);
});
