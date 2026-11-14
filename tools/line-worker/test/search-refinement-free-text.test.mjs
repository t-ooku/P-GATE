import test from "node:test";
import assert from "node:assert/strict";

import {
  appendFreeText,
  refinementRequestWithFreeText,
} from "../src/search-refinement-free-text.mjs";

test("appends a free-word memory without replacing the original query", () => {
  const query = appendFreeText(
    "韓国のコンビニで見た変な形のゼリー",
    "青いパッケージだったと思う",
  );
  assert.match(query, /^韓国のコンビニ/);
  assert.match(query, /青いパッケージ/);
});

test("combines chips and free text in one continuation request", () => {
  const request = refinementRequestWithFreeText({
    query: "友達が使ってた折りたたみできる水筒",
    selectedChips: [{ dimension: "size", value: "bag" }],
    context: { search_id: "search-2" },
    locale: "ja",
    freeText: "半透明でストラップがあった",
  });
  assert.match(request.refined_query, /バッグに入る/);
  assert.match(request.refined_query, /半透明でストラップ/);
  assert.equal(request.free_text, "半透明でストラップがあった");
});

test("does not append duplicate free text", () => {
  assert.equal(
    appendFreeText("白いボトルの化粧水", "白いボトル"),
    "白いボトルの化粧水",
  );
});

test("normalizes whitespace and limits free text", () => {
  const request = refinementRequestWithFreeText({
    query: "透明な収納ケース",
    selectedChips: [],
    freeText: `  蛇腹に   なっている ${"長".repeat(400)} `,
  });
  assert.doesNotMatch(request.free_text, /\s{2,}/);
  assert.equal(request.free_text.length, 300);
});
