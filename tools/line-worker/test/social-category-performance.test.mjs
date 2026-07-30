import test from "node:test";
import assert from "node:assert/strict";
import {
  safeRate,
  summarizeCategoryPerformance,
} from "../src/social-category-performance.mjs";

function row(postId, category, values = {}) {
  return {
    elapsed_hours: 168,
    post_id: postId,
    channel: "INSTAGRAM",
    format: "REEL",
    category,
    reach: 1000,
    non_follower_reach: 700,
    saves: 20,
    shares: 10,
    search_completions: 30,
    wish_saves: 6,
    marketplace_clicks: 9,
    ...values,
  };
}

test("分母がない率は評価不能としてnullを返す", () => {
  assert.equal(safeRate(10, 0), null);
  assert.equal(safeRate(25, 100), 0.25);
});

test("同じチャネル・形式のジャンルを7日値で比較する", () => {
  const rows = [
    row("c1", "COSMETICS"),
    row("c2", "COSMETICS"),
    row("c3", "COSMETICS"),
    row("g1", "GADGET", {
      saves: 50,
      shares: 30,
      search_completions: 80,
      wish_saves: 24,
      marketplace_clicks: 40,
    }),
    row("g2", "GADGET", {
      saves: 50,
      shares: 30,
      search_completions: 80,
      wish_saves: 24,
      marketplace_clicks: 40,
    }),
    row("g3", "GADGET", {
      saves: 50,
      shares: 30,
      search_completions: 80,
      wish_saves: 24,
      marketplace_clicks: 40,
    }),
  ];

  const summary = summarizeCategoryPerformance(rows);
  assert.equal(summary[0].category, "GADGET");
  assert.equal(summary[0].decision, "INCREASE_5_POINTS");
  assert.equal(summary[1].category, "COSMETICS");
});

test("3投稿未満のジャンルは勝敗を判定しない", () => {
  const summary = summarizeCategoryPerformance([
    row("f1", "FASHION"),
    row("f2", "FASHION"),
  ]);

  assert.equal(summary[0].sampleQualified, false);
  assert.equal(summary[0].score, null);
  assert.equal(summary[0].decision, "COLLECT_MORE_DATA");
});

test("24時間値を7日評価へ混ぜない", () => {
  const rows = [
    row("p1", "PET"),
    row("p2", "PET"),
    row("p3", "PET"),
    { ...row("p4", "PET"), elapsed_hours: 24, search_completions: 999 },
  ];
  const summary = summarizeCategoryPerformance(rows);

  assert.equal(summary[0].postCount, 3);
  assert.equal(summary[0].metrics.searchCompletions, 90);
});
