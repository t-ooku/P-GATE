/**
 * Localized, accessible overlay for the HOSHILU product collage.
 * Keep the text in HTML rather than baking it into the image.
 */

const OVERLAY_COPY = Object.freeze({
  ja: "欲しいものは？",
  en: "What are you looking for?",
  zh: "你想要什么？",
  ko: "무엇을 찾고 있나요?",
});

export function heroOverlayText(locale) {
  const language = String(locale || "ja").toLowerCase().split(/[-_]/)[0];
  return OVERLAY_COPY[language] || OVERLAY_COPY.ja;
}

export function mountHeroCollageOverlay({
  collage,
  locale = "ja",
  documentRef = document,
} = {}) {
  if (!collage) throw new Error("collage element is required");
  const existing = collage.querySelector?.("[data-hoshilu-collage-question]");
  const overlay = existing || documentRef.createElement("p");
  overlay.dataset.hoshiluCollageQuestion = "";
  overlay.className = "hoshilu-collage-question";
  overlay.textContent = heroOverlayText(locale);
  overlay.setAttribute("aria-label", overlay.textContent);
  if (!existing) collage.appendChild(overlay);
  collage.classList.add("hoshilu-collage-with-question");

  return {
    element: overlay,
    updateLocale(nextLocale) {
      overlay.textContent = heroOverlayText(nextLocale);
      overlay.setAttribute("aria-label", overlay.textContent);
    },
    destroy() {
      overlay.remove();
      collage.classList.remove("hoshilu-collage-with-question");
    },
  };
}

export function mountLocalizedHeroCollageOverlay({
  collage,
  documentRef = document,
  root = documentRef.documentElement,
} = {}) {
  const mounted = mountHeroCollageOverlay({
    collage,
    locale: root?.lang || "ja",
    documentRef,
  });
  const Observer = documentRef.defaultView?.MutationObserver;
  const observer = Observer
    ? new Observer(() => mounted.updateLocale(root?.lang || "ja"))
    : null;
  observer?.observe(root, { attributes: true, attributeFilter: ["lang"] });

  return {
    ...mounted,
    destroy() {
      observer?.disconnect();
      mounted.destroy();
    },
  };
}

const heroCollage = globalThis.document?.querySelector?.(".hero-visual");
if (heroCollage) {
  mountLocalizedHeroCollageOverlay({ collage: heroCollage });
}
