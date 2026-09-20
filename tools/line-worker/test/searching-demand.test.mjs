import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { demandGroupKey, searchingDemandOverview } from '../src/searching-demand.mjs';

function db(rows = []) {
  const database = new DatabaseSync(':memory:');
  database.exec(`CREATE TABLE member_wishes (
    member_id TEXT, wish_id TEXT, query_text TEXT, language TEXT,
    created_at TEXT, updated_at TEXT, watch_sale INTEGER, watch_price INTEGER,
    watch_coupon INTEGER, watch_restock INTEGER, watch_frequency TEXT,
    notify_new_match INTEGER, condition_snapshot TEXT, insight_enabled_at TEXT)`);
  const insert = database.prepare(`INSERT INTO member_wishes
    (member_id,wish_id,query_text,language,created_at,updated_at,watch_frequency,notify_new_match,insight_enabled_at)
    VALUES(?,?,?,'JA',?,?,?,?,?)`);
  for (const [index, row] of rows.entries()) {
    insert.run(row.member_id, row.wish_id || `w${index}`, row.query_text,
      row.created_at || '2026-09-01T00:00:00Z', row.updated_at || '2026-09-10T00:00:00Z',
      row.watch_frequency || 'INSTANT', row.notify_new_match ?? 1, row.insight_enabled_at ?? '2026-09-01T00:00:00Z');
  }
  return {
    prepare(sql) {
      const statement = database.prepare(sql);
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async first() { return statement.get(...params) ?? null; },
        async run() { statement.run(...params); return { success: true }; },
        async all() { return { results: statement.all(...params) }; }
      };
    }
  };
}

test('demandGroupKey は条件の並び順に依存しない（同じ需要は同じ鍵）', () => {
  const a = [{ label: '黒' }, { label: '綿' }, { label: 'Mサイズ' }];
  const b = [{ label: 'Mサイズ' }, { label: '黒' }, { label: '綿' }];
  assert.equal(demandGroupKey(a), demandGroupKey(b));
  assert.notEqual(demandGroupKey(a), demandGroupKey([{ label: '白' }, { label: '綿' }]));
  assert.equal(demandGroupKey([]), '');
});

test('数えるのは active な探し中だけ。あとで見る・MUTED・insight 未開始は含めない（§6）', async () => {
  const rows = [];
  // 同じ条件を 5 人の別会員が active で探し中 → 表示される
  for (let i = 0; i < 5; i += 1) rows.push({ member_id: `m${i}`, query_text: '子ども ステンレス 水筒 500ml' });
  // あとで見る（notify_new_match=0）は数えない
  rows.push({ member_id: 'later1', query_text: '子ども ステンレス 水筒 500ml', notify_new_match: 0 });
  // insight 未開始も数えない
  rows.push({ member_id: 'noinsight', query_text: '子ども ステンレス 水筒 500ml', insight_enabled_at: '' });
  // MUTED も数えない
  rows.push({ member_id: 'muted1', query_text: '子ども ステンレス 水筒 500ml', watch_frequency: 'MUTED' });
  const result = await searchingDemandOverview({ PRODUCT_DB: db(rows) });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].people, 5);
  assert.equal(result.active_total, 5);
  assert.equal(result.active_members, 5);
  assert.ok(result.items[0].conditions.length > 0);
  // Seller には個人情報も検索文そのものも渡さない
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('member_id'));
  assert.ok(!serialized.includes('wish_id'));
  assert.ok(!serialized.includes('m0'));
});

test('5 人未満は表示せず件数だけ返す。内部会員は除外する。人数は会員の実数（同一会員の複数条件で増えない）', async () => {
  const rows = [
    { member_id: 'a', query_text: '黒 綿 トートバッグ' },
    { member_id: 'a', wish_id: 'a2', query_text: '綿 黒 トートバッグ' },
    { member_id: 'b', query_text: '黒 綿 トートバッグ' },
    { member_id: 'internal1', query_text: '黒 綿 トートバッグ' },
    { member_id: 'internal2', query_text: '黒 綿 トートバッグ' },
    { member_id: 'internal3', query_text: '黒 綿 トートバッグ' }
  ];
  const env = { PRODUCT_DB: db(rows), INTERNAL_MEMBER_IDS: 'internal1, internal2,internal3' };
  const result = await searchingDemandOverview(env);
  assert.deepEqual(result.items, []);
  assert.equal(result.min_people, 5);
  assert.equal(result.below_threshold.groups, 1);
  // 会員 a は同じ条件を 2 件持つが 1 人として数える → a と b の 2 人
  assert.equal(result.below_threshold.people, 2);
  assert.equal(result.active_members, 2);
  assert.equal(result.active_total, 3);
});

test('DB が無い・クエリが失敗しても空を返し、数字を作らない', async () => {
  const none = await searchingDemandOverview({});
  assert.deepEqual(none.items, []);
  assert.equal(none.active_total, 0);
  assert.equal(none.below_threshold.people, 0);
  const broken = await searchingDemandOverview({ PRODUCT_DB: { prepare() { throw new Error('D1_DOWN'); } } });
  assert.deepEqual(broken.items, []);
  assert.equal(broken.active_total, 0);
});

test('人数の多い需要が先に並ぶ', async () => {
  const rows = [];
  for (let i = 0; i < 6; i += 1) rows.push({ member_id: `few${i}`, query_text: '白 レザー スニーカー' });
  for (let i = 0; i < 9; i += 1) rows.push({ member_id: `many${i}`, query_text: '黒 ステンレス 水筒' });
  const result = await searchingDemandOverview({ PRODUCT_DB: db(rows) });
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].people, 9);
  assert.equal(result.items[1].people, 6);
});
