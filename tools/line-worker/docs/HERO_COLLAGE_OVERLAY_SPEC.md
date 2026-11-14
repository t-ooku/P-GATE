# HOSHILU hero collage overlay

## Purpose

The product collage should explain the product-finding experience at a glance
without competing with the primary heading or search form.

## Copy

| Locale | Text |
| --- | --- |
| Japanese | 欲しいものは？ |
| English | What are you looking for? |
| Simplified Chinese | 你想要什么？ |
| Korean | 무엇을 찾고 있나요? |

## Implementation rules

- Render the copy as HTML text over the center opening in the collage.
- Do not bake the copy into the bitmap; language switching and accessibility
  must continue to work.
- Keep the collage decorative and expose the message once through accessible
  text only.
- Use the current HOSHILU navy for the copy with a soft white shadow so the
  text remains readable without adding a visible panel or border.
- Preserve the product cutouts around the perimeter. The text must not overlap
  the heel, headphones, lip product, camera, tumbler, case, charm, or pouch.
- The overlay must scale down on phones and remain on one line in Japanese.
- If the center opening becomes too narrow, reduce the font size before moving
  or hiding any product.
- The primary heading remains the strongest message on the page.

## Acceptance checks

1. Changing the display language changes the overlay copy immediately.
2. At 320 CSS pixels wide, no copy or product is clipped.
3. The overlay does not cover a product at desktop, tablet, or phone widths.
4. The collage has no visible rectangular edge against the page background.
5. Keyboard and screen-reader users receive no duplicated decorative content.
