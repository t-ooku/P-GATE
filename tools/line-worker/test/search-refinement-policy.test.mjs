import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRefinementChips,
  knownRefinementDimensions,
  refinementDimensionLabel,
  refinementRequest,
  suggestRefinementChips,
} from "../src/search-refinement-policy.mjs";

test("suggests ten relevant one-tap chips by default", () => {
  const chips = suggestRefinementChips(
    { query_types: ["color_package"] },
    "ja",
  );
  assert.equal(chips.length, 10);
  assert.ok(chips.every((chip) => chip.dimension !== "appearance"));
});

test("uses candidate category branches first", () => {
  const chips = suggestRefinementChips(
    {
      candidate_categories: ["kitchen", "electronics"],
      query_types: [],
    },
    "en",
    2,
  );
  assert.deepEqual(
    chips.map((chip) => chip.label),
    ["Kitchen or dining", "Electric or battery-powered"],
  );
});

test("preserves the original memory and appends one value per dimension", () => {
  const query = applyRefinementChips(
    "丸くてシリコンっぽい台所用品",
    [
      { dimension: "size", value: "palm" },
      { dimension: "power", value: "none" },
      { dimension: "size", value: "large" },
    ],
    "ja",
  );
  assert.match(query, /^丸くてシリコンっぽい台所用品/);
  assert.match(query, /手のひらサイズ/);
  assert.match(query, /電源不要/);
  assert.doesNotMatch(query, /大型/);
});

test("builds a continuation request linked to the prior search", () => {
  const request = refinementRequest(
    "日本で使える米国の小型電化製品",
    [{ dimension: "scene", value: "home" }],
    { search_id: "search-1" },
    "ja-JP",
  );
  assert.equal(request.original_query, "日本で使える米国の小型電化製品");
  assert.equal(request.continuation, true);
  assert.equal(request.prior_search_id, "search-1");
  assert.match(request.refined_query, /家で使う/);
});

// Condition search wiring (Phase C item 11, 2026-08-07). This module held a
// complete, tested condition model that nothing in the app ever called - the
// AI free-text box was the only way to search. These cover the two pieces
// added so the UI can present it as grouped facets, and confirm the two
// entry points really do share one condition model: a chip's label is
// appended to the same query string the AI search reads.
test("条件検索の見出しラベルを4言語ぶん返す", () => {
  assert.equal(refinementDimensionLabel("power", "ja"), "電源");
  assert.equal(refinementDimensionLabel("scene", "en"), "Where you use it");
  assert.equal(refinementDimensionLabel("size", "zh"), "大小");
  assert.equal(refinementDimensionLabel("category", "ko"), "종류");
  assert.equal(refinementDimensionLabel("unknown", "ja"), "");
});

test("既に条件が入っている軸は再提示しない", () => {
  assert.deepEqual(knownRefinementDimensions("ワイヤレスイヤホン", "ja"), []);
  assert.deepEqual(knownRefinementDimensions("モバイル充電器 / USB充電", "ja"), ["power"]);
  assert.deepEqual(knownRefinementDimensions("バッグ / 旅行中 / 黒", "ja"), ["scene", "appearance"]);
  assert.deepEqual(knownRefinementDimensions("", "ja"), []);
  // 検出する語は applyRefinementChips が追加しうる語と同一なので、
  // チップで足した条件はそのまま「決定済み」として扱われる
  const refined = applyRefinementChips("充電器", [{ dimension: "power", value: "usb" }], "ja");
  assert.equal(refined, "充電器 / USB充電");
  assert.deepEqual(knownRefinementDimensions(refined, "ja"), ["power"]);
});
