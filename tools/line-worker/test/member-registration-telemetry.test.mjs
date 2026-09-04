import assert from 'node:assert/strict';
import cryptoModule from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { handleMemberRoutes } from '../src/member-auth.mjs';
import { linkEmailDestination, requestEmailCode, verifyEmailCode } from '../src/member-email-auth.mjs';
import { linkMemberNotificationIdentity, resolveMemberIdentityAlias, storeMemberRegistrationDestination } from '../src/member-notification-delivery.mjs';
import { normalizeMemberRegistrationContext } from '../src/member-registration-telemetry.mjs';

globalThis.crypto ??= cryptoModule.webcrypto;
globalThis.btoa ??= value => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ??= value => Buffer.from(value, 'base64').toString('binary');

const visitorId = '550e8400-e29b-41d4-a716-446655440000';
const sessionId = '650e8400-e29b-41d4-a716-446655440000';
const secret = 'member-session-secret-32-characters-minimum';
const context = {
  locale: 'JA', source: 'instagram', medium: 'organic_social', campaign: 'signup_launch',
  content: 'member_cta', visitor_id: visitorId, session_id: sessionId
};

test('registration attribution strips contact details and rejects non-random identity values', () => {
  const normalized = normalizeMemberRegistrationContext({
    campaign: 'launch private@example.com 090-1234-5678',
    visitor_id: 'private@example.com', session_id: 'not-random'
  });
  assert.doesNotMatch(JSON.stringify(normalized), /private|example|090|1234|5678/u);
  assert.equal(normalized.visitor_id, '');
  assert.equal(normalized.session_id, '');
});

function setup() {
  const db = new DatabaseSync(':memory:');
  for (const migration of [
    '0004_unmet_demand_events.sql', '0009_member_email_auth.sql', '0012_growth_events.sql',
    '0013_growth_event_traffic_class.sql', '0031_member_notification_destinations.sql',
    '0047_growth_visitor_sessions.sql'
  ]) db.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  return db;
}

function setupBeforeIdentityMigration() {
  const db = new DatabaseSync(':memory:');
  for (const migration of [
    '0004_unmet_demand_events.sql', '0009_member_email_auth.sql', '0012_growth_events.sql',
    '0013_growth_event_traffic_class.sql', '0031_member_notification_destinations.sql'
  ]) db.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  return db;
}

function setupWithoutGrowthEvents() {
  const db = new DatabaseSync(':memory:');
  for (const migration of ['0009_member_email_auth.sql', '0031_member_notification_destinations.sql']) {
    db.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  }
  return db;
}

function d1(db, batches = []) {
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        bind(...values) {
          return {
            __sql: sql, __statement: statement, __values: values,
            async first() { return statement.get(...values) || null; },
            async all() { return { results: statement.all(...values) }; },
            async run() {
              const result = statement.run(...values);
              return { meta: { changes: Number(result.changes || 0) } };
            }
          };
        }
      };
    },
    async batch(statements) {
      batches.push(statements.map(statement => statement.__sql));
      db.exec('BEGIN');
      try {
        const results = statements.map(statement => {
          const result = statement.__statement.run(...statement.__values);
          return { meta: { changes: Number(result.changes || 0) } };
        });
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

function env(db, batches = []) {
  return { PRODUCT_DB: d1(db, batches), MEMBER_SESSION_SECRET: secret };
}

test('new registration writes one attributed event before destination; repeat and historic members write none', async () => {
  const db = setup(), batches = [], workerEnv = env(db, batches);
  const first = await storeMemberRegistrationDestination(
    workerEnv, 'new-member', 'EMAIL', 'person@example.com', context
  );
  assert.equal(first.registered, true);
  assert.match(batches[0][0], /INSERT OR IGNORE INTO growth_events/u);
  assert.match(batches[0][1], /INSERT INTO member_notification_destinations/u);

  const event = db.prepare("SELECT * FROM growth_events WHERE event_type='member_registered'").get();
  assert.equal(event.source, 'instagram');
  assert.equal(event.medium, 'organic_social');
  assert.equal(event.visitor_id, visitorId);
  assert.equal(event.session_id, sessionId);
  assert.equal(event.traffic_class, 'ATTRIBUTED');
  assert.doesNotMatch(JSON.stringify(event), /person@example\.com|new-member/u);

  const repeat = await storeMemberRegistrationDestination(
    workerEnv, 'new-member', 'EMAIL', 'person@example.com', context
  );
  assert.equal(repeat.registered, false);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM growth_events WHERE event_type='member_registered'").get().total, 1);

  db.prepare(`INSERT INTO member_notification_destinations
    (member_id,channel,encrypted_destination,verified_at,updated_at) VALUES(?,?,?,?,?)`)
    .run('historic-member', 'LINE', 'already-encrypted', '2026-08-01', '2026-08-01');
  const historicLogin = await storeMemberRegistrationDestination(
    workerEnv, 'historic-member', 'LINE', 'line-subject', context
  );
  assert.equal(historicLogin.registered, false);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM growth_events WHERE event_type='member_registered'").get().total, 1);
});

test('registration remains available before visitor/session identity migration', async () => {
  const db = setupBeforeIdentityMigration(), batches = [];
  const result = await storeMemberRegistrationDestination(
    env(db, batches), 'legacy-schema-member', 'EMAIL', 'legacy@example.com', context
  );
  assert.equal(result.registered, true);
  assert.ok(batches.length >= 1, 'legacy-compatible batch commits');
  assert.doesNotMatch(batches.at(-1)[0], /visitor_id,session_id/u);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM growth_events WHERE event_type='member_registered'").get().total, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM member_notification_destinations WHERE member_id='legacy-schema-member'").get().total, 1);
  const repeat = await storeMemberRegistrationDestination(
    env(db), 'legacy-schema-member', 'EMAIL', 'legacy@example.com', context
  );
  assert.equal(repeat.registered, false);
});

test('growth telemetry outage never blocks a valid registration destination', async () => {
  const db = setupWithoutGrowthEvents();
  const result = await storeMemberRegistrationDestination(
    env(db), 'telemetry-outage-member', 'LINE', 'private-line-subject', context
  );
  assert.equal(result.registered, false);
  assert.equal(result.telemetry_recorded, false);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM member_notification_destinations WHERE member_id='telemetry-outage-member'").get().total, 1);
});

test('verified email creation emits exactly once and never stores email, code, or member id in telemetry', async () => {
  const db = setup(), workerEnv = {
    ...env(db), RESEND_API_KEY: 're_test', MEMBER_EMAIL_FROM: 'notification@auth.hoshilu.app'
  };
  const originalFetch = globalThis.fetch;
  let deliveredCode = '';
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    deliveredCode = body.text.match(/(\d{6})/u)?.[1] || '';
    return Response.json({ id: 'sent' });
  };
  try {
    const email = 'private@example.com';
    const requested = await requestEmailCode(new Request('https://hoshilu.app/api/member/email/request', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
      body: JSON.stringify({ email })
    }), workerEnv, 1000);
    assert.equal(requested.status, 200);
    assert.match(deliveredCode, /^\d{6}$/u);

    const verified = await verifyEmailCode(new Request('https://hoshilu.app/api/member/email/verify', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
      body: JSON.stringify({ email, code: deliveredCode, registration_context: context })
    }), workerEnv, async () => Response.json({ ok: true }), 1001);
    assert.equal(verified.status, 200);
    const rows = db.prepare("SELECT * FROM growth_events WHERE event_type='member_registered'").all();
    assert.equal(rows.length, 1);
    assert.doesNotMatch(JSON.stringify(rows), /private@example\.com/u);
    assert.equal(JSON.stringify(rows).includes(deliveredCode), false);
    assert.equal('member_id' in rows[0], false);

    const requestedAgain = await requestEmailCode(new Request('https://hoshilu.app/api/member/email/request', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
      body: JSON.stringify({ email })
    }), workerEnv, 1062);
    assert.equal(requestedAgain.status, 200);
    const verifiedAgain = await verifyEmailCode(new Request('https://hoshilu.app/api/member/email/verify', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
      body: JSON.stringify({ email, code: deliveredCode, registration_context: context })
    }), workerEnv, async () => Response.json({ ok: true }), 1063);
    assert.equal(verifiedAgain.status, 200);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM growth_events WHERE event_type='member_registered'").get().total, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('LINE会員へ連携したメールは同じcanonical会員として再ログインする', async () => {
  const db = setup(), workerEnv = {
    ...env(db), RESEND_API_KEY: 're_test', MEMBER_EMAIL_FROM: 'notification@auth.hoshilu.app'
  };
  const lineMemberId = 'line_member_12345678901234567890';
  await storeMemberRegistrationDestination(workerEnv, lineMemberId, 'LINE', 'private-line-subject', context);
  const originalFetch = globalThis.fetch;
  let deliveredCode = '';
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    deliveredCode = body.text.match(/(\d{6})/u)?.[1] || '';
    return Response.json({ id: 'sent' });
  };
  const email = 'linked@example.com';
  const requestCode = time => requestEmailCode(new Request('https://hoshilu.app/api/member/email/request', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
    body: JSON.stringify({ email })
  }), workerEnv, time);
  const codeRequest = () => new Request('https://hoshilu.app/api/member/email/verify', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
    body: JSON.stringify({ email, code: deliveredCode, registration_context: context })
  });
  try {
    assert.equal((await requestCode(1000)).status, 200);
    const linked = await linkEmailDestination(codeRequest(), workerEnv, lineMemberId, 1001);
    assert.equal(linked.status, 200);
    const identities = db.prepare(`SELECT member_id,channel FROM member_notification_destinations
      ORDER BY member_id,channel`).all();
    assert.ok(identities.some(row => row.member_id === lineMemberId && row.channel === 'LINE'));
    assert.ok(identities.some(row => row.member_id === lineMemberId && row.channel === 'EMAIL'));
    const alias = identities.find(row => row.channel === 'IDENTITY_ALIAS');
    assert.ok(alias);
    assert.equal(identities.some(row => row.member_id === alias.member_id && row.channel === 'EMAIL'), false);

    assert.equal((await requestCode(1062)).status, 200);
    let issuedProfile = null;
    const verified = await verifyEmailCode(codeRequest(), workerEnv, async profile => {
      issuedProfile = profile;
      return Response.json({ ok: true });
    }, 1063);
    assert.equal(verified.status, 200);
    assert.equal(issuedProfile.id, lineMemberId);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM growth_events WHERE event_type='member_registered'").get().total, 1);

    assert.equal((await requestCode(1124)).status, 200);
    const conflictingMemberId = 'other_member_1234567890123456789';
    const conflict = await linkEmailDestination(codeRequest(), workerEnv, conflictingMemberId, 1125);
    assert.equal(conflict.status, 409);
    assert.equal(db.prepare(`SELECT COUNT(*) AS total FROM member_notification_destinations
      WHERE member_id=? AND channel='EMAIL'`).get(conflictingMemberId).total, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('alias読取障害・不正marker・alias chainは会員IDを分裂させずfail-closedにする', async () => {
  const rawId = 'raw_member_12345678901234567890';
  const missingSchema = { PRODUCT_DB: { prepare() { throw new Error('no such table: member_notification_destinations'); } } };
  assert.equal(await resolveMemberIdentityAlias(missingSchema, rawId), rawId);
  const unavailable = { PRODUCT_DB: { prepare() { throw new Error('D1 temporary unavailable'); } } };
  await assert.rejects(resolveMemberIdentityAlias(unavailable, rawId), /IDENTITY_ALIAS_UNAVAILABLE/u);

  const db = setup(), workerEnv = env(db);
  const malformed = 'malformed_alias_123456789012345';
  db.prepare(`INSERT INTO member_notification_destinations
    (member_id,channel,encrypted_destination,verified_at,updated_at) VALUES(?,?,?,?,?)`)
    .run(malformed, 'IDENTITY_ALIAS', 'broken-marker', '2026-08-28', '2026-08-28');
  await assert.rejects(resolveMemberIdentityAlias(workerEnv, malformed), /IDENTITY_ALIAS_INVALID/u);

  const chainAlias = 'chain_alias_12345678901234567890';
  const chainMiddle = 'chain_middle_123456789012345678';
  const chainRoot = 'chain_root_12345678901234567890';
  const insert = db.prepare(`INSERT INTO member_notification_destinations
    (member_id,channel,encrypted_destination,verified_at,updated_at) VALUES(?,?,?,?,?)`);
  insert.run(chainRoot, 'LINE', 'encrypted-root', '2026-08-28', '2026-08-28');
  insert.run(chainMiddle, 'LINE', 'encrypted-middle', '2026-08-28', '2026-08-28');
  insert.run(chainMiddle, 'IDENTITY_ALIAS', `member:${chainRoot}`, '2026-08-28', '2026-08-28');
  insert.run(chainAlias, 'IDENTITY_ALIAS', `member:${chainMiddle}`, '2026-08-28', '2026-08-28');
  await assert.rejects(resolveMemberIdentityAlias(workerEnv, chainAlias), /IDENTITY_ALIAS_CHAIN/u);

  const newAlias = 'new_alias_1234567890123456789012';
  await assert.rejects(
    linkMemberNotificationIdentity(workerEnv, newAlias, chainMiddle, 'EMAIL', 'chain@example.com'),
    /IDENTITY_ALIAS_CONFLICT/u
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM member_notification_destinations WHERE member_id=?').get(newAlias).total, 0);
});

test('email loginはalias読取障害時にdestinationもsessionも発行しない', async () => {
  const db = setup(), base = d1(db);
  const failingDb = {
    ...base,
    prepare(sql) {
      if (/SELECT encrypted_destination FROM member_notification_destinations/u.test(sql)) {
        return { bind() { return { async first() { throw new Error('D1 temporary unavailable'); } }; } };
      }
      return base.prepare(sql);
    }
  };
  const workerEnv = {
    PRODUCT_DB: failingDb, MEMBER_SESSION_SECRET: secret,
    RESEND_API_KEY: 're_test', MEMBER_EMAIL_FROM: 'notification@auth.hoshilu.app'
  };
  const originalFetch = globalThis.fetch;
  let deliveredCode = '', sessionIssued = false;
  globalThis.fetch = async (_url, options) => {
    deliveredCode = JSON.parse(options.body).text.match(/(\d{6})/u)?.[1] || '';
    return Response.json({ id: 'sent' });
  };
  try {
    const email = 'outage@example.com';
    const requested = await requestEmailCode(new Request('https://hoshilu.app/api/member/email/request', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
      body: JSON.stringify({ email })
    }), workerEnv, 2000);
    assert.equal(requested.status, 200);
    const verified = await verifyEmailCode(new Request('https://hoshilu.app/api/member/email/verify', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
      body: JSON.stringify({ email, code: deliveredCode, registration_context: context })
    }), workerEnv, async () => { sessionIssued = true; return Response.json({ ok: true }); }, 2001);
    assert.equal(verified.status, 503);
    assert.equal((await verified.json()).error, 'IDENTITY_ALIAS_UNAVAILABLE');
    assert.equal(sessionIssued, false);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM member_notification_destinations WHERE channel='EMAIL'").get().total, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM growth_events WHERE event_type='member_registered'").get().total, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('email loginのresolve直後にLINE linkが完了してもcanonicalへ再収束する', async () => {
  const db = setup(), base = d1(db);
  const canonicalMemberId = 'race_line_member_1234567890123456';
  await storeMemberRegistrationDestination(
    { PRODUCT_DB: base, MEMBER_SESSION_SECRET: secret }, canonicalMemberId, 'LINE', 'race-line-subject', context
  );
  let injected = false;
  const racingDb = {
    ...base,
    async batch(statements) {
      if (!injected && /INSERT OR IGNORE INTO growth_events/u.test(statements?.[0]?.__sql || '')
        && /INSERT INTO member_notification_destinations/u.test(statements?.[1]?.__sql || '')) {
        injected = true;
        const aliasMemberId = String(statements[1].__values[0]);
        db.prepare(`INSERT INTO member_notification_destinations
          (member_id,channel,encrypted_destination,verified_at,updated_at) VALUES(?,?,?,?,?)`)
          .run(aliasMemberId, 'IDENTITY_ALIAS', `member:${canonicalMemberId}`, '2026-08-28', '2026-08-28');
      }
      return base.batch(statements);
    }
  };
  const workerEnv = {
    PRODUCT_DB: racingDb, MEMBER_SESSION_SECRET: secret,
    RESEND_API_KEY: 're_test', MEMBER_EMAIL_FROM: 'notification@auth.hoshilu.app'
  };
  const originalFetch = globalThis.fetch;
  let deliveredCode = '', issuedProfile = null;
  globalThis.fetch = async (_url, options) => {
    deliveredCode = JSON.parse(options.body).text.match(/(\d{6})/u)?.[1] || '';
    return Response.json({ id: 'sent' });
  };
  try {
    const email = 'race@example.com';
    assert.equal((await requestEmailCode(new Request('https://hoshilu.app/api/member/email/request', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
      body: JSON.stringify({ email })
    }), workerEnv, 3000)).status, 200);
    const verified = await verifyEmailCode(new Request('https://hoshilu.app/api/member/email/verify', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
      body: JSON.stringify({ email, code: deliveredCode, registration_context: context })
    }), workerEnv, async profile => { issuedProfile = profile; return Response.json({ ok: true }); }, 3001);
    assert.equal(verified.status, 200);
    assert.equal(injected, true);
    assert.equal(issuedProfile.id, canonicalMemberId);
    const alias = db.prepare("SELECT member_id FROM member_notification_destinations WHERE channel='IDENTITY_ALIAS'").get();
    assert.ok(alias);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM member_notification_destinations WHERE member_id=? AND channel='EMAIL'").get(alias.member_id).total, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM member_notification_destinations WHERE member_id=? AND channel='EMAIL'").get(canonicalMemberId).total, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM growth_events WHERE event_type='member_registered'").get().total, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('同じemail codeは並列login/linkの片方だけが消費できる', async () => {
  const db = setup(), workerEnv = {
    ...env(db), RESEND_API_KEY: 're_test', MEMBER_EMAIL_FROM: 'notification@auth.hoshilu.app'
  };
  const canonicalMemberId = 'single_consumer_line_1234567890123';
  await storeMemberRegistrationDestination(workerEnv, canonicalMemberId, 'LINE', 'single-consumer-line', context);
  const originalFetch = globalThis.fetch;
  let deliveredCode = '';
  globalThis.fetch = async (_url, options) => {
    deliveredCode = JSON.parse(options.body).text.match(/(\d{6})/u)?.[1] || '';
    return Response.json({ id: 'sent' });
  };
  const email = 'single-consumer@example.com';
  const verificationRequest = () => new Request('https://hoshilu.app/api/member/email/verify', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
    body: JSON.stringify({ email, code: deliveredCode, registration_context: context })
  });
  try {
    assert.equal((await requestEmailCode(new Request('https://hoshilu.app/api/member/email/request', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://hoshilu.app' },
      body: JSON.stringify({ email })
    }), workerEnv, 4000)).status, 200);
    const responses = await Promise.all([
      verifyEmailCode(verificationRequest(), workerEnv, async () => Response.json({ ok: true }), 4001),
      linkEmailDestination(verificationRequest(), workerEnv, canonicalMemberId, 4001)
    ]);
    assert.deepEqual(responses.map(response => response.status).sort((a, b) => a - b), [200, 401]);
    const rejected = responses.find(response => response.status === 401);
    assert.equal((await rejected.json()).error, 'CODE_EXPIRED');
    assert.equal(db.prepare(`SELECT COUNT(*) AS total FROM member_notification_destinations alias
      JOIN member_notification_destinations email ON email.member_id=alias.member_id
      WHERE alias.channel='IDENTITY_ALIAS' AND email.channel='EMAIL'`).get().total, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('LINE OAuth carries anonymous attribution through the signed flow and repeat login is not registration', async () => {
  const db = setup(), workerEnv = {
    ...env(db), LINE_LOGIN_CHANNEL_ID: '1234567890', LINE_LOGIN_CHANNEL_SECRET: 'line-secret'
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => String(url).includes('/oauth2/v2.1/token')
    ? Response.json({ id_token: 'verified-token' })
    : Response.json({ sub: 'line-private-subject', name: 'Test Member', picture: '' });
  try {
    const runLogin = async () => {
      const query = new URLSearchParams({ next: '/', ...context });
      const started = await handleMemberRoutes(
        new Request(`https://hoshilu.app/api/member/line/start?${query}`), workerEnv
      );
      const authorize = new URL(started.headers.get('location'));
      const oauthCookie = started.headers.get('set-cookie').split(';', 1)[0];
      return handleMemberRoutes(new Request(
        `https://hoshilu.app/api/member/line/callback?${new URLSearchParams({ code: 'line-code', state: authorize.searchParams.get('state') })}`,
        { headers: { cookie: oauthCookie } }
      ), workerEnv);
    };

    assert.equal((await runLogin()).status, 302);
    const event = db.prepare("SELECT * FROM growth_events WHERE event_type='member_registered'").get();
    assert.equal(event.visitor_id, visitorId);
    assert.equal(event.session_id, sessionId);
    assert.equal(event.source, 'instagram');
    assert.doesNotMatch(JSON.stringify(event), /line-private-subject|Test Member/u);

    assert.equal((await runLogin()).status, 302);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM growth_events WHERE event_type='member_registered'").get().total, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('member login page sends only anonymous growth context to both verified registration paths', () => {
  const client = readFileSync(new URL('../public/member-login.js', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../public/login.html', import.meta.url), 'utf8');
  assert.match(page, /<script type="module" src="\/member-login\.js"><\/script>/u);
  assert.match(page, /growth-analytics\.mjs\?v=10/u);
  assert.match(client, /growthVisitorId\(\)/u);
  assert.match(client, /growthSessionId\(\)/u);
  assert.match(client, /registration_context:registrationContext/u);
  assert.match(client, /new URLSearchParams\(\{next:safeNext,\.\.\.registrationContext\}\)/u);
  assert.doesNotMatch(client, /member_id|auth_code/u);
});
