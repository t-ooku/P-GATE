// Shared vertical auto-rotating ticker behavior for HOSHILU NEWS, SALE
// RADAR, and the AIウォッチ通知 list (2026-08-05 v3/v4.0 instructions).
// The container is a fixed-height, natively scrollable list
// (overflow-y: auto, scroll-snap-type: y mandatory - see ticker.css) with
// every row stacked inside it. Manual wheel/touch scrolling uses the
// browser's native handling. Automatic rotation animates scrollTop with a
// setInterval-driven step loop (NOT requestAnimationFrame): both CSS
// `scroll-behavior: smooth` and Element.scrollTo({behavior:'smooth'}) were
// observed to silently no-op when combined with scroll-snap-type, and rAF
// does not run at all in a backgrounded/inactive tab (verified: 0 callbacks
// fired over 500ms). setInterval/setTimeout keep firing regardless of tab
// visibility, so a small fixed-step loop is the one approach that reliably
// produces a smooth, non-instant transition in every environment tested.
//
// Usage: call attachVerticalTicker(viewportElement) once after each render
// that replaces the row children. Calling it again on the same element
// clears any previous timer first, so re-rendering is safe.

const timers = new WeakMap();
const STEP_MS = 16;
const STEP_DURATION_MS = 600;

function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function animateScrollTop(viewport, target, onDone) {
  const start = viewport.scrollTop;
  const distance = target - start;
  if (!distance) { onDone(); return () => {}; }
  // scroll-snap can pull scrollTop to the destination while the fixed-step
  // animation is still in progress, which looks like a small jump. Disable
  // snapping only for the automatic transition, then restore the caller's
  // inline value for touch/wheel scrolling.
  const previousScrollSnapType = viewport.style.scrollSnapType;
  viewport.style.scrollSnapType = 'none';
  const steps = Math.max(1, Math.round(STEP_DURATION_MS / STEP_MS));
  let step = 0;
  let finished = false;
  const finish = (completed) => {
    if (finished) return;
    finished = true;
    clearInterval(stepTimer);
    viewport.style.scrollSnapType = previousScrollSnapType;
    if (completed) {
      viewport.scrollTop = target;
      onDone();
    }
  };
  const stepTimer = setInterval(() => {
    step += 1;
    const progress = Math.min(1, step / steps);
    const eased = 1 - (1 - progress) ** 3;
    viewport.scrollTop = start + distance * eased;
    if (progress >= 1) finish(true);
  }, STEP_MS);
  return () => finish(false);
}

export function attachVerticalTicker(viewport, { intervalMs = 5000, rowSelector = ':scope > *', useRowOffsets = false } = {}) {
  if (!viewport) return;
  const existing = timers.get(viewport);
  if (existing) {
    clearInterval(existing.timer);
    existing.cancelAnimation();
    existing.cancelResume();
    viewport.removeEventListener('pointerenter', existing.pause);
    viewport.removeEventListener('pointerleave', existing.resume);
    viewport.removeEventListener('touchstart', existing.pause);
    viewport.removeEventListener('touchend', existing.resume);
    viewport.removeEventListener('focusin', existing.pause);
    viewport.removeEventListener('focusout', existing.focusout);
    timers.delete(viewport);
  }

  const rows = [...viewport.querySelectorAll(rowSelector)];
  if (rows.length < 2 || prefersReducedMotion()) return;

  let timer = null;
  let animating = false;
  let cancelAnimation = () => {};
  const advance = () => {
    if (animating) return;
    const rowHeight = rows[0]?.getBoundingClientRect().height || 0;
    if (!rowHeight) return;
    const maxScroll = viewport.scrollHeight - viewport.clientHeight;
    let next = viewport.scrollTop + rowHeight;
    if (useRowOffsets) {
      const positions = rows.map((row) => Math.max(0, row.offsetTop - rows[0].offsetTop));
      next = positions.find((position) => position > viewport.scrollTop + 2) ?? 0;
    }
    animating = true;
    cancelAnimation = animateScrollTop(viewport, next > maxScroll - 1 ? 0 : next, () => {
      animating = false;
      cancelAnimation = () => {};
    });
  };
  const start = () => {
    if (timer) return;
    timer = setInterval(advance, intervalMs);
  };
  const pause = () => {
    if (timer) { clearInterval(timer); timer = null; }
  };
  let resumeTimeout = null;
  const resume = () => {
    if (resumeTimeout) clearTimeout(resumeTimeout);
    resumeTimeout = setTimeout(start, 400);
  };
  const cancelResume = () => {
    if (resumeTimeout) { clearTimeout(resumeTimeout); resumeTimeout = null; }
  };
  const focusout = (event) => {
    if (!viewport.contains(event.relatedTarget)) resume();
  };

  viewport.addEventListener('pointerenter', pause);
  viewport.addEventListener('pointerleave', resume);
  viewport.addEventListener('touchstart', pause, { passive: true });
  viewport.addEventListener('touchend', resume);
  viewport.addEventListener('focusin', pause);
  viewport.addEventListener('focusout', focusout);

  start();
  timers.set(viewport, {
    get timer() { return timer; },
    pause,
    resume,
    focusout,
    cancelAnimation: () => { cancelAnimation(); animating = false; },
    cancelResume
  });
}
