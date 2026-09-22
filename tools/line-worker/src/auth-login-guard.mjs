const encoder = new TextEncoder();
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const hex = (bytes) => Array.from(
  new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')
).join('');

export function createLoginGuard({ scope, guardTable, auditTable }) {
  const fingerprint = async (request, secret) => {
    const address = String(request.headers.get('cf-connecting-ip') || 'unknown').trim().slice(0, 80);
    return hex(await crypto.subtle.digest(
      'SHA-256', encoder.encode(`${scope}\n${address}\n${secret}`)
    ));
  };
  const locked = async (db, hash, now = new Date()) => {
    const row = await db.prepare(`SELECT locked_until FROM ${guardTable}
      WHERE fingerprint_hash=?1`).bind(hash).first();
    const lockedUntil = Date.parse(row?.locked_until || '');
    return Number.isFinite(lockedUntil) && lockedUntil > new Date(now).getTime();
  };
  const failure = async (db, hash, now = new Date()) => {
    const current = new Date(now);
    const occurredAt = current.toISOString();
    const windowCutoff = new Date(current.getTime() - WINDOW_MS).toISOString();
    const lockedUntil = new Date(current.getTime() + LOCK_MS).toISOString();
    const guard = db.prepare(`INSERT INTO ${guardTable}
      (fingerprint_hash,window_started_at,failure_count,locked_until,updated_at)
      VALUES(?1,?2,1,'',?2)
      ON CONFLICT(fingerprint_hash) DO UPDATE SET
      failure_count=CASE WHEN ${guardTable}.window_started_at<=?3 THEN 1
        ELSE ${guardTable}.failure_count+1 END,
      window_started_at=CASE WHEN ${guardTable}.window_started_at<=?3 THEN ?2
        ELSE ${guardTable}.window_started_at END,
      locked_until=CASE
        WHEN ${guardTable}.window_started_at>?3
          AND ${guardTable}.failure_count+1>=${MAX_FAILURES} THEN ?4
        ELSE '' END,
      updated_at=?2`).bind(hash, occurredAt, windowCutoff, lockedUntil);
    const audit = db.prepare(`INSERT INTO ${auditTable}
      (event_id,event_type,fingerprint_hash,occurred_at)
      VALUES(?1,'LOGIN_FAILURE',?2,?3)`)
      .bind(crypto.randomUUID(), hash, occurredAt);
    await db.batch([guard, audit]);
  };
  const audit = async (db, hash, eventType, now = new Date()) => {
    await db.prepare(`INSERT INTO ${auditTable}
      (event_id,event_type,fingerprint_hash,occurred_at)
      VALUES(?1,?2,?3,?4)`)
      .bind(crypto.randomUUID(), eventType, hash, new Date(now).toISOString()).run();
  };
  const success = async (db, hash, now = new Date()) => {
    const occurredAt = new Date(now).toISOString();
    const clear = db.prepare(`DELETE FROM ${guardTable} WHERE fingerprint_hash=?1`).bind(hash);
    const auditSuccess = db.prepare(`INSERT INTO ${auditTable}
      (event_id,event_type,fingerprint_hash,occurred_at)
      VALUES(?1,'LOGIN_SUCCESS',?2,?3)`)
      .bind(crypto.randomUUID(), hash, occurredAt);
    await db.batch([clear, auditSuccess]);
  };
  const purge = async (env, now = new Date()) => {
    if (!env.PRODUCT_DB) return { audit_deleted: 0, guards_deleted: 0, available: false };
    const current = new Date(now);
    if (!Number.isFinite(current.getTime())) {
      return { audit_deleted: 0, guards_deleted: 0, available: false };
    }
    const auditCutoff = new Date(current.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const guardCutoff = new Date(current.getTime() - 24 * 60 * 60 * 1000).toISOString();
    try {
      const results = await env.PRODUCT_DB.batch([
        env.PRODUCT_DB.prepare(`DELETE FROM ${auditTable} WHERE occurred_at<?1`).bind(auditCutoff),
        env.PRODUCT_DB.prepare(`DELETE FROM ${guardTable}
          WHERE updated_at<?1 AND (locked_until='' OR locked_until<=?2)`)
          .bind(guardCutoff, current.toISOString())
      ]);
      return {
        audit_deleted: Math.max(0, Number(results?.[0]?.meta?.changes || 0)),
        guards_deleted: Math.max(0, Number(results?.[1]?.meta?.changes || 0)),
        available: true
      };
    } catch {
      return { audit_deleted: 0, guards_deleted: 0, available: false };
    }
  };
  return {
    fingerprint, locked, failure,
    lockedAudit: (db, hash, now) => audit(db, hash, 'LOGIN_LOCKED', now),
    success,
    logout: (db, hash, now) => audit(db, hash, 'LOGOUT', now),
    purge
  };
}
