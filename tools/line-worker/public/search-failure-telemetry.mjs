const REQUEST_ID_PATTERN = /^[a-f0-9-]{20,64}$/iu;
const SAFE_CODE_PATTERN = /^(?:AI|CONSENT|KNOWLEDGE|ORIGIN|REQUEST|SEARCH|TURNSTILE)_[A-Z0-9_]{2,72}$/u;

function safeRequestId(value) {
  const requestId = String(value || '').trim();
  return REQUEST_ID_PATTERN.test(requestId) ? requestId.toLowerCase() : '';
}

// Convert browser exceptions to a small operational vocabulary. Raw exception
// text is never returned because it may contain a URL or user-controlled data.
export function clientSearchFailureTelemetry(error, requestId = '') {
  const raw = String(error?.message || error || '').trim();
  const upper = raw.toUpperCase();
  const name = String(error?.name || '').trim();
  const status = Math.trunc(Number(error?.status || 0));
  let errorCode = 'SEARCH_CLIENT_FAILURE';

  if (SAFE_CODE_PATTERN.test(upper)) errorCode = upper;
  else if (raw === 'Failed to fetch' || name === 'TypeError') errorCode = 'SEARCH_NETWORK_FAILED';
  else if (name === 'SyntaxError') errorCode = 'SEARCH_RESPONSE_INVALID';
  else if (name === 'TimeoutError' || name === 'AbortError') errorCode = 'SEARCH_TIMEOUT';
  else if (status >= 400 && status <= 599) errorCode = `SEARCH_HTTP_${status}`;

  return { error_code: errorCode, request_id: safeRequestId(requestId || error?.requestId) };
}

export const searchFailureTelemetryTest = { safeRequestId };
