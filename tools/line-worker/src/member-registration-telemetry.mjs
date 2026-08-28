const encoder = new TextEncoder();
const LOCALES = new Set(['JA', 'EN', 'ZH', 'KO']);
const ANONYMOUS_ID = /^[a-f0-9-]{20,64}$/iu;

function clean(value, length = 80) {
  return String(value || '').trim()
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '')
    .replace(/\b0\d{1,4}-?\d{1,4}-?\d{3,4}\b/gu, '')
    .replace(/[^\p{L}\p{N}_.-]/gu, '').slice(0, length);
}

function anonymousId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ANONYMOUS_ID.test(normalized) ? normalized : '';
}

function trafficClass(context) {
  const source = context.source.toLowerCase();
  const medium = context.medium.toLowerCase();
  const campaign = context.campaign.toLowerCase();
  const content = context.content.toLowerCase();
  const qaSignal = source.startsWith('codex')
    || source.startsWith('test')
    || source.startsWith('qa')
    || medium === 'qa'
    || campaign.includes('acceptance')
    || campaign.includes('test');
  if (qaSignal) return 'QA';
  return source || medium || campaign || content ? 'ATTRIBUTED' : 'UNATTRIBUTED';
}

function registrationSecret(env = {}) {
  const value = String(env.MEMBER_SESSION_SECRET || env.LINK_SIGNING_SECRET || '');
  if (value.length < 32) throw new Error('MEMBER_REGISTRATION_SECRET_REQUIRED');
  return value;
}

function b64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function normalizeMemberRegistrationContext(input = {}) {
  const locale = String(input.locale || 'JA').trim().toUpperCase();
  return {
    locale: LOCALES.has(locale) ? locale : 'JA',
    source: clean(input.source),
    medium: clean(input.medium),
    campaign: clean(input.campaign),
    content: clean(input.content),
    visitor_id: anonymousId(input.visitor_id),
    session_id: anonymousId(input.session_id)
  };
}

export function memberRegistrationContextFromUrl(url) {
  return normalizeMemberRegistrationContext({
    locale: url.searchParams.get('locale'),
    source: url.searchParams.get('source'),
    medium: url.searchParams.get('medium'),
    campaign: url.searchParams.get('campaign'),
    content: url.searchParams.get('content'),
    visitor_id: url.searchParams.get('visitor_id'),
    session_id: url.searchParams.get('session_id')
  });
}

async function registrationEventId(env, memberId) {
  // A domain-separated HMAC gives the registration a stable idempotency key
  // without writing the member ID, email address, LINE subject or auth code to
  // growth_events. It cannot be joined back to a member without the secret.
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(registrationSecret(env)),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC', key, encoder.encode(`hoshilu-growth:member_registered:${String(memberId || '')}`)
  );
  return `registration_${b64(new Uint8Array(signature))}`;
}

export async function buildMemberRegistrationEvent(env, memberId, input = {}, now = new Date()) {
  if (!String(memberId || '')) throw new Error('MEMBER_REGISTRATION_ID_REQUIRED');
  const context = normalizeMemberRegistrationContext(input);
  return {
    event_id: await registrationEventId(env, memberId),
    event_type: 'member_registered',
    ...context,
    marketplace: '',
    occurred_at: new Date(now).toISOString(),
    traffic_class: trafficClass(context)
  };
}
