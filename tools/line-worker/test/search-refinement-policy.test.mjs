import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRefinementChips,
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
