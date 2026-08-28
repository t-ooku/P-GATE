// Provider error bodies are untrusted and may echo a user's query. Syntax is
// not enough: PRIVATE_MEDICAL_QUERY and key-like strings also look like valid
// tokens. Only codes created/recognized by HOSHILU may cross into logs.
const SAFE_PROVIDER_CODES = new Set([
  'AI_PROVIDER_TIMEOUT', 'AI_PROVIDER_RATE_LIMITED', 'AI_PROVIDER_UPSTREAM_5XX',
  'AI_PROVIDER_REQUEST_REJECTED', 'AI_PROVIDER_AUTH_FAILED',
  'AI_PROVIDER_INVALID_JSON', 'AI_PROVIDER_OUTPUT_LIMIT',
  'AI_PROVIDER_NETWORK_FAILED', 'AI_PROVIDER_FAILED',
  'AI_PROVIDER_NOT_CONFIGURED', 'AI_PROVIDERS_NOT_CONFIGURED',
  'AI_ALL_PROVIDERS_FAILED', 'INSUFFICIENT_QUOTA',
  'BILLING_HARD_LIMIT_REACHED', 'TOO_MANY_REQUESTS',
  'PROVIDER_REQUEST_FAILED', 'RAKUTEN_PROVIDER_FAILED', 'YAHOO_PROVIDER_FAILED'
]);

export function safeProviderErrorCode(value, status = 0, fallback = 'PROVIDER_REQUEST_FAILED') {
  const token = String(value || '').normalize('NFKC').trim().toUpperCase();
  if (SAFE_PROVIDER_CODES.has(token)) return token;
  const httpStatus = Math.trunc(Number(status) || 0);
  if (httpStatus >= 100 && httpStatus <= 599) return `HTTP_${httpStatus}`;
  const fallbackToken = String(fallback || '').trim().toUpperCase();
  return SAFE_PROVIDER_CODES.has(fallbackToken) ? fallbackToken : 'PROVIDER_REQUEST_FAILED';
}
