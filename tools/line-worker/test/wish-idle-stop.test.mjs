import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { runWishIdleStop } from '../src/wish-idle-stop.mjs';

// 2026-09-20 GPT 指示書 §P0/§6: 90 日無反応の探し中 → 確認通知 → 14 日後に「あとで見る」。本人が触った条件は止めない。
const MIGRATIONS = ['0002_member_wishes.sql', '0003_member_wish_preferences.sql', '0005_mywatch_notifications.sql', '0036_mywatch_notification_product_fields.sql', '0044_insight_search_watch.sql', '0065_member_wish_insight_explicit_opt_in.sql'];
function d1() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of MIGRATIONS) sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  return { sqlite, db: { prepare(sql) { const st = sqlite.prepare(sql); return { bind(...v) { return { run: async () => { st.run(...v); return {}; }, first: async () => st.get(...v) || null, all: async () => ({ results: st.all(...v) }) }; } }; } } };
}
const DAY = 86_400_000;
const NOW = Date.parse('2026-12-20T00:00:00Z');
const at = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();
function wish(sqlite, id, { enabledDaysAgo, updatedDaysAgo, searching = 1 }) {
  sqlite.prepare(`INSERT INTO member_wishes(member_id,wish_id,query_text,language,created_at,updated_at,watch_frequency,notify_new_match,insight_enabled_at)
    VALUES('m1',?,?,'JA',?,?,'INSTANT',?,?)`).run(id, `条件 ${id}`, at(enabledDaysAgo), at(updatedDaysAgo), searching, searching ? at(enabledDaysAgo) : null);
}

test('90 日無反応の探し中だけに確認通知を 1 回出し、14 日後に本人の操作が無ければ「あとで見る」へ。触った条件・発見があった条件は止めない', async () => {
  const { sqlite, db } = d1();
  wish(sqlite, 'idle', { enabledDaysAgo: 120, updatedDaysAgo: 120 });          // 対象
  wish(sqlite, 'touched', { enabledDaysAgo: 120, updatedDaysAgo: 3 });         // 本人が最近触った → 対象外
  wish(sqlite, 'young', { enabledDaysAgo: 30, updatedDaysAgo: 30 });           // まだ 30 日 → 対象外
  wish(sqlite, 'found', { enabledDaysAgo: 120, updatedDaysAgo: 120 });         // 最近 発見あり → 対象外
  sqlite.prepare(`INSERT INTO search_watch_matches(member_id,wish_id,product_identity_key,matched_at) VALUES('m1','found','ASIN:B0X',?)`).run(at(10));
  wish(sqlite, 'saved', { enabledDaysAgo: 120, updatedDaysAgo: 120, searching: 0 }); // 保存だけ → 対象外
  const first = await runWishIdleStop({ PRODUCT_DB: db }, new Date(NOW));
  assert.deepEqual(first, { asked: 1, stopped: 0 });
  const notices = sqlite.prepare(`SELECT wish_id, event_type, title, status FROM mywatch_notifications`).all();
  assert.deepEqual(notices.map((n) => [n.wish_id, n.event_type, n.status]), [['idle', 'INSIGHT_IDLE_CHECK', 'DELIVERED']]);
  assert.equal(notices[0].title, 'まだ探し続けますか？');
  // 同じ日にもう一度走っても 2 通目は出ない・止めない
  assert.deepEqual(await runWishIdleStop({ PRODUCT_DB: db }, new Date(NOW + DAY)), { asked: 0, stopped: 0 });
  // 14 日後: 本人の操作なし → あとで見る
  const later = await runWishIdleStop({ PRODUCT_DB: db }, new Date(NOW + 15 * DAY));
  assert.deepEqual(later, { asked: 0, stopped: 1 });
  const row = sqlite.prepare(`SELECT notify_new_match, insight_enabled_at FROM member_wishes WHERE wish_id='idle'`).get();
  assert.equal(row.notify_new_match, 0);
  assert.equal(row.insight_enabled_at, null);
  // 他の条件は無変更
  for (const id of ['touched', 'young', 'found']) assert.equal(sqlite.prepare(`SELECT notify_new_match FROM member_wishes WHERE wish_id=?`).get(id).notify_new_match, 1);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM member_wishes`).get().n, 5); // 削除しない
});

test('確認通知のあとに本人が条件を触れば（updated_at が新しい）止めない', async () => {
  const { sqlite, db } = d1();
  wish(sqlite, 'idle', { enabledDaysAgo: 120, updatedDaysAgo: 120 });
  await runWishIdleStop({ PRODUCT_DB: db }, new Date(NOW));
  sqlite.prepare(`UPDATE member_wishes SET updated_at=? WHERE wish_id='idle'`).run(new Date(NOW + 2 * DAY).toISOString());
  assert.deepEqual(await runWishIdleStop({ PRODUCT_DB: db }, new Date(NOW + 20 * DAY)), { asked: 0, stopped: 0 });
  assert.equal(sqlite.prepare(`SELECT notify_new_match FROM member_wishes WHERE wish_id='idle'`).get().notify_new_match, 1);
});

test('cron（15 分ごとの通常ジョブ）に組み込まれている', () => {
  const worker = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(worker, /runWishIdleStop\(env, scheduledAt\),/u);
});
