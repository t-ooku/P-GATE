import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { heroOverlayText } from "../public/hero-collage-overlay.mjs";

test("provides the short collage question in all four languages", () => {
  assert.equal(heroOverlayText("ja-JP"), "欲しいものは？");
  assert.equal(heroOverlayText("en"), "What are you looking for?");
  assert.equal(heroOverlayText("zh-CN"), "你想要什么？");
  assert.equal(heroOverlayText("ko_KR"), "무엇을 찾고 있나요?");
});

test("falls back to Japanese for an unsupported locale", () => {
  assert.equal(heroOverlayText("fr"), "欲しいものは？");
});

test("loads the localized collage overlay and its styles on the home page", async () => {
  const [html, sw] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/service-worker.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /href="\/hero-collage-overlay\.css"/);
  assert.match(html, /src="\/hero-collage-overlay\.mjs"/);
  assert.match(sw, /hero-collage-overlay\.css/);
  assert.match(sw, /hero-collage-overlay\.mjs/);
});

test("mounts the overlay on the hero product collage", async () => {
  const source = await readFile(
    new URL("../public/hero-collage-overlay.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /querySelector\?\.\("\.hero-visual"\)/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /attributeFilter: \["lang"\]/);
});
