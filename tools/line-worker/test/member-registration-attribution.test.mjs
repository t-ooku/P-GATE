import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('member registration preserves existing landing or campaign content', async () => {
  const source = await readFile(new URL('../public/member-login.js', import.meta.url), 'utf8');
  assert.match(source, /HoshiluGrowthAttribution\?\.content/);
  assert.match(source, /event\.startsWith\('registration_'\)&&attributionContent/);
  assert.match(source, /\{\.\.\.extra,content:attributionContent\}/);
  assert.match(source, /content:'email'/);
  assert.match(source, /content:'line'/);
});
