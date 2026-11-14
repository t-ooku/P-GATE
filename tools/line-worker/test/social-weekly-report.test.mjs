import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSocialWeeklyReport,
  displayMetric,
  nullableRate,
  postPerformance
} from '../src/social-weekly-report.mjs';

function row(postId, overrides = {}) {
  return {
    post_id: postId,
    platform: 'INSTAGRAM',
    snapshot_at: '2026-08-02T00:00:00Z',
    traffic_class: 'ATTRIBUTED',
    concept: `concept-${postId}`,
    cta: 'プロフィールから検索',
    impressions: 1000,
    saves: 20,
    shares: 10,
    comments: 5,
    link_clicks: 50,
    search_starts: 40,
    free_registrations: 5,
    marketplace_clicks: 10,
    ...overrides
  };
}

test('未取得と実績0を区別して率を算出する', () => {
  assert.equal(nullableRate(null, 100), null);
  assert.equal(nullableRate(0, 100), 0);
  assert.equal(displayMetric(null), '未取得');
  assert.equal(displayMetric(0, { percent: true }), '0.00%');
  assert.equal(postPerformance(row('missing', { saves: null })).reaction_rate, null);
});

test('QAと社内アクセスを除外し上位下位3投稿とCVRを作る', () => {
  const current = [
    row('p1', { saves: 70 }), row('p2', { saves: 60 }), row('p3', { saves: 50 }),
    row('p4', { saves: 10 }), row('p5', { saves: 5 }), row('p6', { saves: 0 }),
    row('qa', { traffic_class: 'QA', saves: 999 }),
    row('internal', { traffic_class: 'INTERNAL', saves: 999 })
  ];
  const previous = current.slice(0, 6).map(item => ({ ...item, saves: 10 }));
  const report = buildSocialWeeklyReport(current, previous);

  assert.deepEqual(report.top_3.map(item => item.post_id), ['p1', 'p2', 'p3']);
  assert.deepEqual(report.bottom_3.map(item => item.post_id), ['p6', 'p5', 'p4']);
  assert.equal(report.current.registration_cvr, 0.1);
  assert.equal(report.current.outbound_cvr, 0.25);
  assert.equal(report.current.post_count, 6);
  assert.ok(report.week_over_week.reactions_per_post > 0);
});

test('媒体指標が未取得の投稿は0扱いせずランキングから除外する', () => {
  const report = buildSocialWeeklyReport([
    row('known'),
    row('unknown', { impressions: null, saves: null, shares: null, comments: null })
  ]);
  assert.deepEqual(report.top_3.map(item => item.post_id), ['known']);
  assert.equal(report.current.reactions_per_post, null);
  assert.equal(report.current.ctr, null);
});
