import { setTimeout as sleep } from 'node:timers/promises';

export class RetryableReadError extends Error {}

export function isTransientReadError(error: unknown): boolean {
  if (error instanceof RetryableReadError) return true;
  if (!(error instanceof Error)) return false;
  if (['TimeoutError', 'AbortError'].includes(error.name)) return true;
  const code = 'code' in error ? String(error.code) : '';
  return ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)
    || /net::ERR_(?:TIMED_OUT|CONNECTION_RESET|CONNECTION_CLOSED|NETWORK_CHANGED)|REQUEST_TIMEOUT/u.test(error.message);
}

/** Read-only operations only. At most 3 retries = 4 total attempts. */
export async function retryRead<T>(work: () => Promise<T>,
  options: { pause?: (ms: number) => Promise<unknown>; onRetry?: (attempt: number) => void } = {}): Promise<T> {
  const pause = options.pause ?? sleep;
  for (let attempt = 0; ; attempt++) {
    try { return await work(); }
    catch (error) {
      if (attempt >= 3 || !isTransientReadError(error)) throw error;
      options.onRetry?.(attempt + 1);
      await pause(1000 * 2 ** attempt);
    }
  }
}
