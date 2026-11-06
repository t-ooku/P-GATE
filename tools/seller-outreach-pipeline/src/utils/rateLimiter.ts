import { randomInt } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

export class OriginBlockedError extends Error {
  constructor() { super('ORIGIN_BLOCKED_NO_RETRY'); }
}

/** One FIFO queue across domains: a single process cannot burst from its IP. */
export class RateLimiter {
  private tail: Promise<unknown> = Promise.resolve();
  private blocked = new Set<string>();
  constructor(private pause: (ms: number, signal?: AbortSignal) => Promise<unknown> =
    (ms, signal) => sleep(ms, undefined, { signal }),
    private random: () => number = () => randomInt(3000, 7001)) {}

  block(raw: string): void { this.blocked.add(new URL(raw).origin); }

  wait(raw: string, signal?: AbortSignal): Promise<number> {
    const origin = new URL(raw).origin;
    if (this.blocked.has(origin)) return Promise.reject(new OriginBlockedError());
    const slot = this.tail.then(async () => {
      signal?.throwIfAborted();
      if (this.blocked.has(origin)) throw new OriginBlockedError();
      const delay = this.random();
      if (!Number.isInteger(delay) || delay < 3000 || delay > 7000) throw new Error('WAIT_RANGE_INVALID');
      await this.pause(delay, signal);
      signal?.throwIfAborted();
      if (this.blocked.has(origin)) throw new OriginBlockedError();
      return delay;
    });
    this.tail = slot.catch(() => {});
    return slot;
  }
}

// Reused by the crawler and browser routes in this process. No proxy/identity rotation.
export const requestLimiter = new RateLimiter();
