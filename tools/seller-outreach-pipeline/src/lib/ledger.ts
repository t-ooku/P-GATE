import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const storeKey = (raw: string) => {
  const u = new URL(raw);
  return createHash('sha256').update(u.origin.toLowerCase() + u.pathname.replace(/\/+$/u, '')).digest('hex');
};

export class Ledger {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS attempts (
        store_key TEXT PRIMARY KEY, day TEXT NOT NULL, state TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
    `);
  }
  reserve(key: string, limit = 10, now = new Date()): boolean {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(now);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const count = this.db.prepare('SELECT count(*) AS n FROM attempts WHERE day=?').get(day) as { n: number };
      if (count.n >= limit) { this.db.exec('ROLLBACK'); return false; }
      const r = this.db.prepare("INSERT OR IGNORE INTO attempts VALUES (?,?,'RESERVED','',?)")
        .run(key, day, now.toISOString());
      this.db.exec('COMMIT'); return r.changes === 1;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  finish(key: string, state: string, reason: string): void {
    this.db.prepare('UPDATE attempts SET state=?,reason=? WHERE store_key=?').run(state, reason, key);
  }
  close(): void { this.db.close(); }
}
