export const GROWTH_VISITOR_ID_KEY = 'hoshilu_anonymous_visitor_id';
export const GROWTH_SESSION_ID_KEY = 'hoshilu_anonymous_session';
export const GROWTH_SESSION_TTL_MS = 30 * 60 * 1000;

const VALID_ID = /^[a-f0-9-]{20,64}$/i;
const createId = () => globalThis.crypto.randomUUID();

export function growthVisitorId({
  storage = globalThis.localStorage,
  randomId = createId
} = {}) {
  try {
    const current = storage?.getItem(GROWTH_VISITOR_ID_KEY);
    if (VALID_ID.test(current || '')) return current;
    const created = randomId();
    storage?.setItem(GROWTH_VISITOR_ID_KEY, created);
    return created;
  } catch {
    return randomId();
  }
}

export function growthSessionId({
  storage = globalThis.sessionStorage,
  randomId = createId,
  now = () => Date.now()
} = {}) {
  const nowMs = Number(now());
  try {
    const current = JSON.parse(storage?.getItem(GROWTH_SESSION_ID_KEY) || 'null');
    const touchedAt = Number(current?.touched_at);
    const elapsed = nowMs - touchedAt;
    if (VALID_ID.test(current?.id || '') && Number.isFinite(touchedAt) && elapsed >= 0 && elapsed < GROWTH_SESSION_TTL_MS) {
      storage?.setItem(GROWTH_SESSION_ID_KEY, JSON.stringify({ id: current.id, touched_at: nowMs }));
      return current.id;
    }
    const next = { id: randomId(), touched_at: nowMs };
    storage?.setItem(GROWTH_SESSION_ID_KEY, JSON.stringify(next));
    return next.id;
  } catch {
    return randomId();
  }
}
