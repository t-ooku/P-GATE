import test from "node:test";
import assert from "node:assert/strict";

import {
  appendClarificationToQuery,
  decideSearchResponse,
} from "../src/search-decision-policy.mjs";

test("answers when top candidate has sufficient confidence", () => {
  const decision = decideSearchResponse({
    candidates: [
      { id: "p1", category: "kitchen", score: 0.91 },
      { id: "p2", category: "kitchen", score: 0.6 },
    ],
    context: { query_types: ["shape_function"] },
  });
  assert.equal(decision.action, "answer");
  assert.equal(decision.candidates.length, 2);
});

test("asks one category question when top candidates split categories", () => {
  const decision = decideSearchResponse({
    candidates: [
      { id: "p1", category: "kitchen", score: 0.67 },
      { id: "p2", category: "electronics", score: 0.64 },
    ],
    context: { query_types: ["usage_scene"] },
  });
  assert.equal(decision.action, "clarify");
  assert.equal(decision.reason, "category_branch");
  assert.ok(decision.question.text);
  assert.ok(Array.isArray(decision.question.options));
});

test("offers wish saving for context-only ultra-ambiguous memory", () => {
  const decision = decideSearchResponse({
    candidates: [],
    context: {
      information_level: "ultra_ambiguous",
      query_types: ["color_package", "place_memory"],
    },
  });
  assert.equal(decision.action, "save_to_wish");
});

test("does not ask multiple questions", () => {
  const decision = decideSearchResponse({
    candidates: [{ id: "p1", category: "home", score: 0.5 }],
    context: { query_types: ["color_package"] },
  });
  assert.equal(decision.action, "clarify");
  assert.equal(typeof decision.question.text, "string");
  assert.equal(Object.hasOwn(decision, "questions"), false);
});

test("appends a selected refinement without replacing the original memory", () => {
  const query = appendClarificationToQuery(
    "丸くてシリコンっぽい台所用品",
    { id: "size" },
    "palm",
  );
  assert.match(query, /丸くてシリコン/);
  assert.match(query, /手のひらサイズ/);
});
