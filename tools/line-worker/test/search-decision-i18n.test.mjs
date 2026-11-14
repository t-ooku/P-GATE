import test from "node:test";
import assert from "node:assert/strict";

import {
  localizeSearchDecision,
  normalizeDecisionLocale,
} from "../src/search-decision-i18n.mjs";

test("normalizes supported regional locale values", () => {
  assert.equal(normalizeDecisionLocale("ja-JP"), "ja");
  assert.equal(normalizeDecisionLocale("en_US"), "en");
  assert.equal(normalizeDecisionLocale("zh-CN"), "zh");
  assert.equal(normalizeDecisionLocale("ko-KR"), "ko");
  assert.equal(normalizeDecisionLocale("fr-FR"), "ja");
});

test("localizes one clarification question and its options", () => {
  const localized = localizeSearchDecision(
    {
      action: "clarify",
      question: {
        id: "size",
        text: "Japanese source copy",
        options: ["palm", "bag", "unsure"],
      },
    },
    "en",
  );
  assert.equal(localized.locale, "en");
  assert.equal(localized.question.text, "Which size was it closest to?");
  assert.deepEqual(
    localized.question.options.map((option) => option.label),
    ["Palm-sized", "Fits in a bag", "Not sure"],
  );
});

test("localizes wish fallback without exposing internal reason text", () => {
  const localized = localizeSearchDecision(
    {
      action: "save_to_wish",
      reason: "context_only_low_confidence",
      message: "source",
    },
    "ko",
  );
  assert.equal(localized.locale, "ko");
  assert.match(localized.message, /호싯토쿠/);
  assert.notEqual(localized.message, "source");
});
