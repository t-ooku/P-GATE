// 2026-09-06 大隆さん決定（Seller獲得マスター指示書 §31-§33・§49）: セラー向け営業メール。
// 大隆さんの Gmail からの送信は安全システムに止まるため、HOSHILU 側の Resend（専用アドレス）から送る。
//
// 流れ: Claude の日次セッションが D1 seller_outreach_contacts に「宛先・件名・本文（1社ごとに個別化）」を
// QUEUED で入れる → 本モジュールの cron が 平日 09:00〜18:00 JST に 1サイクル最大3通・1日最大10通を送る →
// 送信結果を行に残す。1メールアドレスには生涯1回だけ。配信停止リンク（トークン）を踏むと OPTED_OUT、
// 以後そのアドレスには送らない（suppressions）。
//
// 守ること（§33・§49・特定電子メール法）: 公開されている事業者向け連絡先にだけ送る（登録は人＝Claudeが判断）、
// 送信者表示（HOSHILU・運営者・住所代わりの問い合わせ先）と配信停止手段を本文に必ず入れる、
// 同じ文面の大量送信をしない（本文は行ごとに個別化して投入する）、成果保証・ユーザー数の誇張を書かない
// （投入前に禁止表現を機械チェックし、含む行は SKIPPED にする）。
// Cloudflare Workers には node:crypto が無い（nodejs_compat を付けていない）。
// Web Crypto（Workers・Node 22 の両方でグローバル）だけを使う。
export const OUTREACH_DAILY_LIMIT_DEFAULT = 10;
export const OUTREACH_PER_CYCLE_LIMIT = 3;
export const OUTREACH_FORBIDDEN_PHRASES = ['必ず売れ', '売上が上がり', '多数のユーザー', '多くのユーザー', '成果保証', '業界No.1', '業界ナンバー', '必ず儲か', '確実に'];
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const CONTROL_CHARS = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']', 'g');
const clean = (value, max) => String(value ?? '').replace(CONTROL_CHARS, '').trim().slice(0, max);

const toHex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

export async function emailHash(email) {
  const source = new TextEncoder().encode(String(email || '').trim().toLowerCase());
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', source)));
}

export function newUnsubscribeToken() {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

export function jstBusinessHours(date) {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS);
  const day = shifted.getUTCDay();
  const hour = shifted.getUTCHours();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 18;
}

export function jstDayRange(date) {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS);
  const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - JST_OFFSET_MS;
  return { from: new Date(start).toISOString(), to: new Date(start + 24 * 60 * 60 * 1000).toISOString() };
}

export function findForbiddenPhrases(text) {
  const haystack = String(text || '');
  return OUTREACH_FORBIDDEN_PHRASES.filter((phrase) => haystack.includes(phrase));
}

export function unsubscribeUrl(token) {
  // 2026-09-06: トークンはパスに置く。クエリの t= は経路のどこかで落ちることが実測で分かったため
  //（?debug=1 は届くのに ?t= だけ届かない = 追跡パラメータ扱いで除去されている）。
  return `https://hoshilu.app/seller-outreach/unsubscribe/${encodeURIComponent(token)}`;
}

// 本文の末尾に、送信者表示と配信停止手段を必ず付ける（本文側に書き忘れても落ちない）。
export function composeOutreachText(body, token, env = {}) {
  const contact = clean(env.SELLER_OUTREACH_REPLY_TO || env.SELLER_INQUIRY_NOTIFY_EMAIL || '', 320);
  const lines = [
    String(body || '').trim(),
    '',
    '――',
    'HOSHILU（ホシル） 運営: 大隆',
    'https://hoshilu.app/  セラー向け案内: https://hoshilu.app/for-sellers',
    contact ? `ご返信・お問い合わせ: ${contact}（このメールに返信いただいても届きます）` : 'ご返信はこのメールにそのままお願いします。',
    `今後のご案内が不要な場合は、こちらから配信停止できます（ワンクリック）: ${unsubscribeUrl(token)}`,
    'このメールは、公開されている事業者向けの連絡先に、1回だけお送りしています。'
  ];
  return lines.join('\n');
}

export function outreachReadiness(env) {
  const apiKey = String(env.RESEND_API_KEY || '');
  const from = clean(env.SELLER_OUTREACH_FROM || '', 320);
  return { ok: apiKey.startsWith('re_') && Boolean(from) && Boolean(env.PRODUCT_DB), from };
}

async function sendViaResend(env, { to, subject, text, token, replyTo }, fetchImpl = fetch) {
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: `HOSHILU Seller担当 <${env.SELLER_OUTREACH_FROM}>`,
      to: [to],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      text,
      headers: { 'List-Unsubscribe': `<${unsubscribeUrl(token)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    }),
    redirect: 'manual'
  });
  let id = '';
  try { id = clean((await response.json())?.id, 120); } catch { id = ''; }
  return { ok: response.ok, status: response.status, id };
}

// 15分 cron から呼ぶ。送れなかった理由は行に残す。例外は投げない（他ジョブを止めない）。
export async function runSellerOutreachCycle(env, now = new Date(), fetchImpl = fetch) {
  const readiness = outreachReadiness(env);
  if (!readiness.ok) return { action: 'skipped', reason: 'not_configured' };
  if (!jstBusinessHours(now)) return { action: 'skipped', reason: 'outside_business_hours' };
  const limit = Math.max(1, Math.min(50, Number(env.SELLER_OUTREACH_DAILY_LIMIT || OUTREACH_DAILY_LIMIT_DEFAULT)));
  const day = jstDayRange(now);
  const sentToday = Number((await env.PRODUCT_DB.prepare(`SELECT COUNT(*) AS n FROM seller_outreach_contacts WHERE status IN ('SENT','SENDING') AND sent_at>=?1 AND sent_at<?2`).bind(day.from, day.to).all()).results?.[0]?.n || 0);
  const budget = Math.min(OUTREACH_PER_CYCLE_LIMIT, limit - sentToday);
  if (budget <= 0) return { action: 'skipped', reason: 'daily_limit', sent_today: sentToday };
  const candidates = (await env.PRODUCT_DB.prepare(`SELECT c.contact_id,c.contact_email,c.email_hash,c.subject,c.body,c.unsubscribe_token FROM seller_outreach_contacts c
    WHERE c.status='QUEUED' AND c.scheduled_at<=?1
    AND NOT EXISTS (SELECT 1 FROM seller_outreach_suppressions s WHERE s.email_hash=c.email_hash)
    AND NOT EXISTS (SELECT 1 FROM seller_outreach_contacts p WHERE p.email_hash=c.email_hash AND p.contact_id<>c.contact_id AND p.status IN ('SENDING','SENT','REPLIED','OPTED_OUT'))
    ORDER BY c.scheduled_at ASC, c.contact_id ASC LIMIT ?2`).bind(now.toISOString(), budget).all()).results || [];
  const results = [];
  for (const row of candidates) {
    const timestamp = new Date().toISOString();
    const forbidden = findForbiddenPhrases(`${row.subject}\n${row.body}`);
    if (forbidden.length) {
      await env.PRODUCT_DB.prepare(`UPDATE seller_outreach_contacts SET status='SKIPPED',last_error=?2,updated_at=?3 WHERE contact_id=?1 AND status='QUEUED'`)
        .bind(row.contact_id, `forbidden_phrase:${forbidden.join(',')}`, timestamp).run();
      results.push({ contact_id: row.contact_id, status: 'SKIPPED', reason: 'forbidden_phrase' });
      continue;
    }
    // claim（cron が重なっても二重送信しない）
    const claim = await env.PRODUCT_DB.prepare(`UPDATE seller_outreach_contacts SET status='SENDING',sent_at=?2,updated_at=?2 WHERE contact_id=?1 AND status='QUEUED'`).bind(row.contact_id, timestamp).run();
    const changes = Number(claim?.meta?.changes ?? claim?.changes ?? 1);
    if (changes !== 1) continue;
    try {
      const sent = await sendViaResend(env, {
        to: row.contact_email, subject: row.subject,
        text: composeOutreachText(row.body, row.unsubscribe_token, env), token: row.unsubscribe_token,
        replyTo: clean(env.SELLER_OUTREACH_REPLY_TO || env.SELLER_INQUIRY_NOTIFY_EMAIL || '', 320)
      }, fetchImpl);
      if (sent.ok) {
        await env.PRODUCT_DB.prepare(`UPDATE seller_outreach_contacts SET status='SENT',resend_id=?2,last_error='',updated_at=?3 WHERE contact_id=?1 AND status='SENDING'`).bind(row.contact_id, sent.id, new Date().toISOString()).run();
        results.push({ contact_id: row.contact_id, status: 'SENT' });
      } else {
        await env.PRODUCT_DB.prepare(`UPDATE seller_outreach_contacts SET status='FAILED',last_error=?2,updated_at=?3 WHERE contact_id=?1 AND status='SENDING'`).bind(row.contact_id, `resend_http_${sent.status}`, new Date().toISOString()).run();
        results.push({ contact_id: row.contact_id, status: 'FAILED', reason: `resend_http_${sent.status}` });
      }
    } catch (error) {
      await env.PRODUCT_DB.prepare(`UPDATE seller_outreach_contacts SET status='FAILED',last_error=?2,updated_at=?3 WHERE contact_id=?1 AND status='SENDING'`).bind(row.contact_id, clean(error?.message || 'send_failed', 200), new Date().toISOString()).run();
      results.push({ contact_id: row.contact_id, status: 'FAILED', reason: 'exception' });
    }
  }
  return { action: 'processed', sent_today_before: sentToday, results };
}

const UNSUB_HTML = (message) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>配信停止｜HOSHILU</title><style>body{margin:0;font-family:system-ui,-apple-system,"Noto Sans JP",sans-serif;background:#fbfaff;color:#161629}main{max-width:560px;margin:64px auto;padding:32px;border:1px solid #e8e3f4;border-radius:20px;background:#fff}h1{font-size:22px;margin:0 0 12px}p{line-height:1.8;color:#4a4860}a{color:#5140ba}</style></head><body><main><h1>${message.title}</h1><p>${message.body}</p><p><a href="https://hoshilu.app/">HOSHILU トップへ</a></p></main></body></html>`;

// GET /seller-outreach/unsubscribe?t=<token> → OPTED_OUT + suppression。POST（List-Unsubscribe-Post）も同じ扱い。
export async function handleSellerOutreachRoutes(request, env) {
  const url = new URL(request.url);
  const UNSUB_PREFIX = '/seller-outreach/unsubscribe';
  if (url.pathname !== UNSUB_PREFIX && !url.pathname.startsWith(`${UNSUB_PREFIX}/`)) return null;
  if (!['GET', 'POST'].includes(request.method)) return new Response('Method Not Allowed', { status: 405 });
  // 本命はパス。過去に送った ?token= / ?t= 形式も受ける（届けば動く）。
  const pathToken = url.pathname.startsWith(`${UNSUB_PREFIX}/`) ? decodeURIComponent(url.pathname.slice(UNSUB_PREFIX.length + 1)) : '';
  const token = clean(pathToken || url.searchParams.get('token') || url.searchParams.get('t'), 64);
  const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' };
  // 配信停止のリンクを踏んだ人に 404 を返すと「壊れている」と見える。案内ページとして 200 で返す。
  // reason は運用時の切り分け用（本文には出さず HTML コメントに入れる。個人情報は含めない）。
  const invalid = (reason) => new Response(`${UNSUB_HTML({ title: 'リンクが無効です', body: 'このリンクは無効か、期限切れです。配信停止をご希望の場合は、届いたメールに「不要」とご返信ください。' })}<!-- unsubscribe: ${reason} -->`, { status: 200, headers });
  const tokenOk = /^[0-9a-f]{32}$/.test(token);
  const row = tokenOk && env.PRODUCT_DB
    ? (await env.PRODUCT_DB.prepare(`SELECT contact_id,email_hash,status FROM seller_outreach_contacts WHERE unsubscribe_token=?1`).bind(token).all()).results?.[0]
    : null;
  if (!tokenOk) return invalid('token_format');
  if (!env.PRODUCT_DB) return invalid('no_database');
  if (!row) return invalid(`not_found len=${token.length}`);
  const timestamp = new Date().toISOString();
  await env.PRODUCT_DB.prepare(`INSERT OR IGNORE INTO seller_outreach_suppressions (email_hash,reason,created_at) VALUES (?1,'OPTED_OUT',?2)`).bind(row.email_hash, timestamp).run();
  await env.PRODUCT_DB.prepare(`UPDATE seller_outreach_contacts SET status='OPTED_OUT',updated_at=?2 WHERE email_hash=?1 AND status IN ('QUEUED','SENT','FAILED','REPLIED','SKIPPED')`).bind(row.email_hash, timestamp).run();
  return new Response(UNSUB_HTML({ title: '配信停止を受け付けました', body: '今後、HOSHILU からセラー向けのご案内メールはお送りしません。ご確認ありがとうございました。' }), { status: 200, headers });
}
