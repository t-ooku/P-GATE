import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('mobile result carousel does not stretch short cards to match the tallest sibling', async () => {
  const styles = await read('styles.css');
  // .result-track is display:flex with no align-items override, so the
  // default `stretch` forces every card in the horizontal-scroll row to the
  // height of the tallest candidate - even on mobile where only one card is
  // visible at a time (flex-basis:100%). A short single-offer card then
  // shows a large block of blank space (from .product-card p{flex:1}) below
  // its content, pushing the buy button off-screen. Fixed by resetting
  // align-items to flex-start inside the mobile breakpoint so each card
  // sizes to its own content.
  assert.match(
    styles,
    /@media\(max-width:760px\)\{\.result-track\{align-items:flex-start\}\.result-track>\.product-card\{flex-basis:100%\}/
  );
});
