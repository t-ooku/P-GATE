import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { copyForLanguage, loginHrefFor, shouldShowNudge } from '../public/member-registration-nudge.mjs';

// 2026-09-06: D1実測でmarketplace_click(月195件)に対しmember_registered(会員登録)が
// 0件だったボトルネックへの対応。詳細は member-registration-nudge.mjs 冒頭のコメント。

test('shouldShowNudge()は未表示かつ非会員のときだけ真になる', () => {
  assert.equal(shouldShowNudge({ alreadyShown: false, isMember: false }), true);
  assert.equal(shouldShowNudge({ alreadyShown: true, isMember: false }), false);
  assert.equal(shouldShowNudge({ alreadyShown: false, isMember: true }), false);
  assert.equal(shouldShowNudge({ alreadyShown: true, isMember: true }), false);
});

test('copyForLanguage()は4言語を返し、未知の言語はJAへ落ちる', () => {
  for (const lang of ['JA', 'EN', 'ZH', 'KO']) {
    const copy = copyForLanguage(lang);
    assert.equal(typeof copy.text, 'string');
    assert.ok(copy.text.length > 0);
    assert.equal(typeof copy.cta, 'string');
  }
  assert.deepEqual(copyForLanguage('fr'), copyForLanguage('JA'));
  assert.deepEqual(copyForLanguage(), copyForLanguage('JA'));
});

test('loginHrefFor()は/login.htmlへnextパラメータ付きで戻す', () => {
  assert.equal(loginHrefFor('/'), '/login.html?next=%2F');
  assert.equal(loginHrefFor('/#wishTitle'), `/login.html?next=${encodeURIComponent('/#wishTitle')}`);
});

test('growth-analytics.mjsはmarketplace_click直後にhoshilu:marketplace-clickを発火する', async () => {
  const analytics = await readFile(new URL('../public/growth-analytics.mjs', import.meta.url), 'utf8');
  assert.match(analytics, /send\('marketplace_click', \{ marketplace \}\);[\s\S]{0,600}CustomEvent\('hoshilu:marketplace-click'/);
});

test('member-registration-nudge.mjsはhoshilu:marketplace-clickを購読し、/api/member/sessionで会員判定する', async () => {
  const source = await readFile(new URL('../public/member-registration-nudge.mjs', import.meta.url), 'utf8');
  assert.match(source, /addEventListener\('hoshilu:marketplace-click'/);
  assert.match(source, /\/api\/member\/session/);
  assert.match(source, /hoshilu_registration_nudge_shown/);
  assert.match(source, /registration-nudge-close/);
  // セッション中1回だけ: 表示前に必ずsessionStorageの既読フラグを立てる
  assert.match(source, /markNudgeShown/);
});

test('index.htmlはmember-registration-nudge.mjsを読み込む', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /member-registration-nudge\.mjs/);
});

test('styles.cssは.registration-nudgeを常時表示の固定フッターとして定義する', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.registration-nudge\{[^}]*position:fixed/);
  assert.match(css, /\.registration-nudge-link/);
});
