import test from "node:test";
import assert from "node:assert/strict";

import {
  mergeSpeechTranscript,
  normalizeSpeechLocale,
  speechLanguageTag,
} from "../public/speech-input.mjs";

test("maps all four interface languages to speech language tags", () => {
  assert.equal(speechLanguageTag("ja-JP"), "ja-JP");
  assert.equal(speechLanguageTag("en"), "en-US");
  assert.equal(speechLanguageTag("zh-TW"), "zh-CN");
  assert.equal(speechLanguageTag("ko_KR"), "ko-KR");
  assert.equal(normalizeSpeechLocale("fr"), "ja");
});

test("appends speech without replacing typed memory", () => {
  assert.equal(
    mergeSpeechTranscript("ハワイのスーパーで見た", "青いパッケージのお菓子"),
    "ハワイのスーパーで見た 青いパッケージのお菓子",
  );
});

test("ignores empty and duplicate transcripts", () => {
  assert.equal(mergeSpeechTranscript("白いボトル", "  "), "白いボトル");
  assert.equal(
    mergeSpeechTranscript("白いボトルの化粧水", "白いボトル"),
    "白いボトルの化粧水",
  );
});
