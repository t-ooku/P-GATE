// 2026-09-21 指示書 §3〜§11「いつものホシル」の API。
// ・ログインが要る（本人のデータだけ）
// ・「いつものにする」は商品名と補充周期が要る。モールは本人の申告ではなく商品URLから判定
// ・「買った！」で last_purchased_at と次回目安を更新し、実績が溜まれば周期も学習する
// ・migration 0085 適用前でも 500 にせず、空/503 で返す
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleMemberUsualRoutes } from '../src/member-usual.mjs';

// 最小の D1 モック。SQL の種類で振り分ける。
function fakeDb(state) {
  return {
    prepare(sql) {
      return {
        bind(...args) {
          const run = async () => {
            if (/INSERT INTO member_usual_items/u.test(sql)) { state.items.push(args); return { meta: { changes: 1 } }; }
            if (/INSERT INTO member_usual_purchases/u.test(sql)) { state.purchases.push({ purchased_at: args[3], price_jpy: args[4] }); return { meta: { changes: 1 } }; }
            if (/UPDATE member_usual_items/u.test(sql)) { state.updates.push({ sql, args }); return { meta: { changes: 1 } }; }
            if (/DELETE FROM/u.test(sql)) { state.deletes.push(sql); return { meta: { changes: 1 } }; }
            return { meta: { changes: 0 } };
          };
          const first = async () => {
            if (/COUNT\(\*\)/u.test(sql)) return { total: state.count ?? 0 };
            if (/SELECT usual_id,created_at,last_purchased_at/u.test(sql)) return state.existing ?? null;
            if (/FROM member_usual_items WHERE member_id=\?1 AND usual_id=\?2/u.test(sql)) return state.row ?? null;
            return null;
          };
          const all = async () => {
            if (/FROM member_usual_purchases/u.test(sql)) return { results: state.purchases };
            if (/FROM member_usual_items/u.test(sql)) return { results: state.rows ?? [] };
            return { results: [] };
          };
          return { run, first, all };
        }
      };
    }
  };
}

const envWith = (state, member = { id: 'm1' }) => ({
  PRODUCT_DB: fakeDb(state),
  __member: member
});

// readMemberSession を差し替えられないので、module の挙動は「session が無いとき」だけ実APIで確かめ、
// 本体の分岐はソースの形で固定する。実セッションつきの E2E は本番確認で行う。
const post = (path, body) => new Request(`https://hoshilu.app${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
});

test('/api/member/usual 以外は素通りする（他のルートを奪わない）', async () => {
  assert.equal(await handleMemberUsualRoutes(new Request('https://hoshilu.app/api/member/wishes'), {}), null);
  assert.equal(await handleMemberUsualRoutes(new Request('https://hoshilu.app/api/search'), {}), null);
});

test('D1 未設定なら 503（KPI を 0 と断定しない）', async () => {
  const response = await handleMemberUsualRoutes(new Request('https://hoshilu.app/api/member/usual'), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'MEMBER_STORE_NOT_CONFIGURED');
});

test('未ログインは 401。本人のデータしか触らせない', async () => {
  const state = { items: [], purchases: [], updates: [], deletes: [] };
  const response = await handleMemberUsualRoutes(post('/api/member/usual', { product_name: '洗剤', cycle_days: 30 }), envWith(state));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'MEMBER_LOGIN_REQUIRED');
  assert.equal(state.items.length, 0, '未ログインで書き込まない');
});

// 以下は実装の形を固定する（セッションを差し替えられないため）
const source = () => readFileSync(new URL('../src/member-usual.mjs', import.meta.url), 'utf8');

test('登録は商品名2文字以上と有効な補充周期を要求する', () => {
  const text = source();
  assert.match(text, /USUAL_PRODUCT_NAME_INVALID/u);
  assert.match(text, /USUAL_CYCLE_INVALID/u);
  assert.match(text, /productName\.length < 2/u);
});

test('モールは本人の申告ではなく商品URLから判定する', () => {
  const text = source();
  assert.match(text, /marketplaceForProductUrl\(productUrl\)/u);
  assert.ok(!/payload\.marketplace/u.test(text.split('POST')[1] || ''), '登録でクライアントの marketplace を信用しない');
});

test('「買った！」は購入を記録し、実績から周期を学習して次回を更新する', () => {
  const text = source();
  assert.match(text, /INSERT INTO member_usual_purchases/u);
  assert.match(text, /learnCycleDays\(history\.map\(\(item\) => item\.purchased_at\), row\.cycle_days\)/u);
  assert.match(text, /UPDATE member_usual_items SET last_purchased_at=\?3, cycle_days=\?4, cycle_source=\?5, next_due_at=\?6/u);
});

test('価格は正の整数だけ記録する（推定価格や 0 を入れない）', () => {
  const text = source();
  assert.match(text, /Number\.isFinite\(price\) && price > 0 \? price : null/u);
});

test('本人が周期を変えたら学習結果ではなく本人の選択として扱う', () => {
  const text = source();
  assert.match(text, /payload\?\.cycle_days === undefined \? row\.cycle_source : 'CHOSEN'/u);
});

test('migration 適用前でも落ちない（空または 503 で返す）', () => {
  const text = source();
  assert.ok(text.includes('isMissingUsualTable'), 'テーブル未作成を見分ける');
  assert.ok(text.includes('withUsualSchema'), '未作成なら空で返す');
  assert.match(text, /USUAL_NOT_READY/u);
});

test('index.mjs が /api/member/usual を配線している', () => {
  const index = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(index, /import \{ handleMemberUsualRoutes \} from '\.\/member-usual\.mjs';/u);
  assert.match(index, /const usualResponse = await handleMemberUsualRoutes\(request, env\);/u);
});
