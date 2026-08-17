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
  // color_package means the query already states a color, so "color" itself
  // is the one dimension that should be suppressed - not "appearance", which
  // now only covers shape words (round/foldable/transparent) since color
  // moved into its own dimension (2026-08-15, dedicated color-swatch picker).
  assert.ok(chips.every((chip) => chip.dimension !== "color"));
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
  assert.equal(refinementDimensionLabel("color", "ja"), "色");
  assert.equal(refinementDimensionLabel("scene", "en"), "Where you use it");
  assert.equal(refinementDimensionLabel("size", "zh"), "大小");
  assert.equal(refinementDimensionLabel("category", "ko"), "종류");
  assert.equal(refinementDimensionLabel("unknown", "ja"), "");
});

test("既に条件が入っている軸は再提示しない", () => {
  assert.deepEqual(knownRefinementDimensions("ワイヤレスイヤホン", "ja"), []);
  assert.deepEqual(knownRefinementDimensions("モバイル充電器 / USB充電", "ja"), ["power"]);
  // "黒" is now a color-dimension label (moved out of "appearance" so color
  // gets its own dedicated swatch picker, 2026-08-15) - order follows
  // DIMENSION_ORDER, where "color" sits right after "category".
  assert.deepEqual(knownRefinementDimensions("バッグ / 旅行中 / 黒", "ja"), ["color", "scene"]);
  assert.deepEqual(knownRefinementDimensions("", "ja"), []);
  // 検出する語は applyRefinementChips が追加しうる語と同一なので、
  // チップで足した条件はそのまま「決定済み」として扱われる
  const refined = applyRefinementChips("充電器", [{ dimension: "power", value: "usb" }], "ja");
  assert.equal(refined, "充電器 / USB充電");
  assert.deepEqual(knownRefinementDimensions(refined, "ja"), ["power"]);
});

test("色ディメンションが16色ぶん、スウォッチ用hexつきで返る", () => {
  const chips = suggestRefinementChips(
    { force_dimensions: ["color"] },
    "ja",
    60,
  );
  const colorChips = chips.filter((chip) => chip.dimension === "color");
  assert.equal(colorChips.length, 16);
  colorChips.forEach((chip) => {
    assert.match(chip.swatch, /^#[0-9a-f]{6}$/);
    assert.ok(chip.label.length > 0);
  });
  // 選んだ色は他の軸と同じくクエリへ1件だけ追記される
  const query = applyRefinementChips(
    "スマホケース",
    [{ dimension: "color", value: "pink" }],
    "ja",
  );
  assert.equal(query, "スマホケース / ピンク");
});
