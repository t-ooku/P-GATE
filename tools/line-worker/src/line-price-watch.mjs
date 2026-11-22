import { isInvalidJanProductKey } from './jan-validity.mjs';
// 2026-11-07 大隆さん（office hours「ホシルの売上を爆速で伸ばしたい」→ B「通知で戻ってくる」を選択、11/8「とりあえず進めて」）:
// 値下がりカードの「もっと下がったらLINEで知らせる」。メール登録・6桁コード・LINEログインなしで、
// LINE の「送信」1 回（友だち追加していなければ追加も）で、その商品の見張りが始まる。
// - 9/16〜9/24 の記録: 未登録の人が「無料でホシっとく」を 6 回押し、その後の登録は 0 人（登録の壁）。
// - 比べる価格は HOSHILU が API で記録した price_observations だけ（AI の推定は使わない）。記録が続かない商品は知らせない。
// - 通知の文面は「ホシルの記録で下がった」という事実だけ。「買い時」「底値」は書かない。
// - LINE の push は月の無料通数を超えないように、月の上限（LINE_WATCH_MONTHLY_PUSH_CAP、既定 150）で止める（有料プランにしない）。
// - D1 に入れるのは LINE の userId（push に要る）と商品の公開情報だけ。検索文・会員 ID は入れない。
// - growth_events には件数だけ（line_watch_clicked / line_watch_line_opened / line_watch_started / line_watch_notified / line_watch_returned）。
// 2026-11-22 大隆さん「ok」（Cowork 指示 docs/handoff/claude-inbox/2026-11-22-cowork-line-watch-on-product-page.md）:
// 11/8〜11/21 に line_watch_clicked 93 件・開始 1 件。session_id を入れていなかったので「1 セッション」に見えていたが、別々のクリック。
// - 入口を content に入れる（from=product：商品ページのグラフ下／drops：値下がりカード）。商品ページから来たときは session_id も入れる。
// - /line/watch はすぐ LINE に飛ばさず、ホシルの小さなページで「LINE が開いたら『送信』を押すと見張りが始まります」と見せる。
//   このページの表示＝line_watch_clicked、1 秒後の自動移動かボタンで LINE へ進んだ＝line_watch_line_opened（/line/watch/open）。
//   自動移動は JS だけなので、JS を動かさない機械は line_watch_line_opened に数えられない（人と機械を分ける）。

export const WATCH_TEXT_PREFIX = '見張る：';
export const STOP_WORDS = Object.freeze(['やめる', '見張りをやめる', 'ストップ', '停止']);
export const WATCH_LIMIT_PER_USER = 20;
export const WATCH_CODE_PATTERN = /見張る[:：]\s*([0-9a-f]{10})/u;
const DEFAULT_MONTHLY_PUSH_CAP = 150;
const OBSERVATION_FRESH_DAYS = 3;
const CYCLE_HOUR_JST = 19; // 毎日 19:00〜19:14 JST の 1 回だけ（夕方の買い物前）
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const text = (value, max = 200) => String(value ?? '').replace(/\s+/gu, ' ').trim().slice(0, max);
const jstDate = (now) => new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
const jstMonth = (now) => jstDate(now).slice(0, 7);
const daysAgo = (now, days) => jstDate(new Date(now.getTime() - days * 86_400_000));
const yen = (value) => `${Number(value).toLocaleString('ja-JP')}円`;

// 2026-11-08 実機: 「★4日20時〜20%オフクーポン配布！【ロムアンド公式】ロムアンド ザジューシー」のように、店の商品名の頭に
// セール・クーポンの宣伝が付いていて、ホシルが割引を約束しているように読めた。LINE に出す名前は宣伝の部分を外す（外して空なら元のまま）。
export function cleanProductName(name = '') {
  const original = text(name, 200);
  const cleaned = original
    .replace(/【[^】]*】|\[[^\]]*\]|＜[^＞]*＞|<[^>]*>/gu, ' ')
    .replace(/[★☆◆◇■□●○♪※][^★☆◆◇■□●○♪※！!]*[！!]?/gu, ' ')
    .replace(/(?:送料無料|ポイント\s*\d+\s*倍|\d+\s*[%％]\s*(?:OFF|オフ)|クーポン(?:配布|利用|で)?[^ 　]*|最大\s*\d+[%％円]?[^ 　]*|楽天\s*\d*位|ランキング\s*\d*位)/giu, ' ')
    .replace(/\s+/gu, ' ').trim();
  return cleaned.length >= 2 ? cleaned : original;
}

export function monthlyPushCap(env = {}) {
  const value = Number(env.LINE_WATCH_MONTHLY_PUSH_CAP);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : DEFAULT_MONTHLY_PUSH_CAP;
}

export async function watchCode(recordKey) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`line-watch:${recordKey}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 10);
}

export function watchMessageText(code, productName = '') {
  const name = text(cleanProductName(productName), 24);
  return `${WATCH_TEXT_PREFIX}${code}${name ? `（${name}）` : ''}`;
}

export function productPageUrl(recordKey, from = 'line_watch') {
  return `https://hoshilu.app/product?key=${encodeURIComponent(recordKey)}&from=${from}`;
}

// その商品の最新の記録（直近 3 日、同じ日に複数あれば最安）。記録が無ければ null。
export async function latestObservation(db, recordKey, now = new Date()) {
  if (isInvalidJanProductKey(recordKey)) return null;
  const row = await db.prepare(`SELECT record_key, product_name, MIN(price) AS price, observed_date FROM price_observations
      WHERE record_key=?1 AND observed_date>=?2 GROUP BY observed_date ORDER BY observed_date DESC LIMIT 1`)
    .bind(recordKey, daysAgo(now, OBSERVATION_FRESH_DAYS)).first();
  return row && Number(row.price) > 0 ? { ...row, price: Number(row.price) } : null;
}

export const WATCH_ENTRIES = Object.freeze(['product', 'drops']);
export const watchEntry = (value) => (WATCH_ENTRIES.includes(String(value || '')) ? String(value) : '');
// growth-events.mjs の anonymousId と同じ形だけ受け取る（それ以外は空＝匿名の 1 クリック 1 行）。
export function watchSessionId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[a-f0-9-]{20,64}$/u.test(normalized) ? normalized : '';
}

async function recordWatchEvent(env, eventType, now = new Date(), { content = '', sessionId = '' } = {}) {
  if (!env?.PRODUCT_DB) return false;
  const id = crypto.randomUUID();
  const entry = watchEntry(content);
  try {
    await env.PRODUCT_DB.prepare(`INSERT INTO growth_events
        (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class,session_id)
        VALUES(?1,?2,'JA','line','line_watch','',?3,'',?4,'UNATTRIBUTED',?5)`)
      .bind(id, eventType, entry, now.toISOString(), watchSessionId(sessionId)).run();
    return true;
  } catch (error) {
    if (!/(?:no column named|has no column named|no such column).*session_id/iu.test(String(error?.message || ''))) return false;
  }
  try {
    await env.PRODUCT_DB.prepare(`INSERT INTO growth_events
        (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class)
        VALUES(?1,?2,'JA','line','line_watch','',?3,'',?4,'UNATTRIBUTED')`)
      .bind(id, eventType, entry, now.toISOString()).run();
    return true;
  } catch { return false; }
}

let cachedBasicId = '';
export async function lineBotBasicId(env, fetchImpl = fetch) {
  const fixed = text(env.LINE_BOT_BASIC_ID, 40);
  if (fixed) return fixed;
  if (cachedBasicId) return cachedBasicId;
  const token = String(env.LINE_CHANNEL_ACCESS_TOKEN || '');
  if (!token) return '';
  try {
    const response = await fetchImpl('https://api.line.me/v2/bot/info', { headers: { authorization: `Bearer ${token}` }, redirect: 'manual' });
    if (!response.ok) return '';
    const info = await response.json();
    cachedBasicId = /^@[0-9a-z._-]{2,40}$/iu.test(String(info?.basicId || '')) ? String(info.basicId) : '';
    return cachedBasicId;
  } catch { return ''; }
}

const esc = (value) => String(value ?? '').replace(/[&<>"']/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const PAGE_HEADERS = Object.freeze({
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'",
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY'
});

function watchParams(url) {
  return {
    recordKey: text(url.searchParams.get('key'), 160),
    from: watchEntry(url.searchParams.get('from')),
    sessionId: watchSessionId(url.searchParams.get('s'))
  };
}

function backTo(url, recordKey, reason) {
  return Response.redirect(`${url.origin}${recordKey ? `/product?key=${encodeURIComponent(recordKey)}&from=line_watch&line=${reason}` : '/media/price-drops'}`, 302);
}

export function lineWatchOpenPath({ recordKey, from = '', sessionId = '' }) {
  const params = new URLSearchParams({ key: recordKey });
  if (watchEntry(from)) params.set('from', watchEntry(from));
  if (watchSessionId(sessionId)) params.set('s', watchSessionId(sessionId));
  return `/line/watch/open?${params.toString()}`;
}

// LINE の手前の小さなページ。1 秒後に /line/watch/open へ自動で進む（public/line-watch.mjs。JS が動く時だけ）。ボタンでも進める。
export function renderLineWatchPage({ recordKey, productName = '', from = '', sessionId = '' }) {
  const open = lineWatchOpenPath({ recordKey, from, sessionId });
  const name = text(cleanProductName(productName), 60);
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><link rel="stylesheet" href="/line-watch.css?v=1"><link rel="icon" href="/icons/icon.svg"><title>LINEで見張りを始める｜ホシル</title></head><body>
<main class="line-watch-step">
<p class="line-watch-brand">HOSHILU</p>
<h1 class="line-watch-title">LINE が開いたら『送信』を押すと見張りが始まります（友だち追加がまだなら追加も）</h1>
${name ? `<p class="line-watch-product">${esc(name)}</p>` : ''}
<p class="line-watch-note">ホシルの記録で、この値段より下がったら LINE でお知らせします。1 秒後に LINE を開きます。</p>
<a class="line-watch-open" id="lineWatchOpen" href="${esc(open)}" rel="nofollow">LINE を開く</a>
<a class="line-watch-back" href="/product?key=${esc(encodeURIComponent(recordKey))}" rel="nofollow">商品ページに戻る</a>
</main>
<script type="module" src="/line-watch.mjs?v=1"></script>
</body></html>`;
}

// GET /line/watch?key=<record_key>&from=product|drops[&s=<session>]: 見張りの番号を作り、LINE の手前の小さなページを出す。
// このページの表示を line_watch_clicked として数える（クローラは数えない）。
export async function handleLineWatchStart(request, env, { fetchImpl = fetch, now = new Date(), isCrawler = () => false } = {}) {
  const url = new URL(request.url);
  const { recordKey, from, sessionId } = watchParams(url);
  if (!recordKey || !env?.PRODUCT_DB) return backTo(url, recordKey, 'unavailable');
  const latest = await latestObservation(env.PRODUCT_DB, recordKey, now).catch(() => null);
  if (!latest) return backTo(url, recordKey, 'no_record');
  const basicId = await lineBotBasicId(env, fetchImpl);
  if (!basicId) return backTo(url, recordKey, 'unavailable');
  const code = await watchCode(recordKey);
  await env.PRODUCT_DB.prepare(`INSERT INTO line_watch_codes (code, record_key, product_name, created_at) VALUES (?1,?2,?3,?4)
      ON CONFLICT(code) DO UPDATE SET product_name=excluded.product_name`)
    .bind(code, recordKey, text(latest.product_name, 120), now.toISOString()).run();
  if (!isCrawler(request.headers.get('user-agent'))) await recordWatchEvent(env, 'line_watch_clicked', now, { content: from, sessionId });
  return new Response(renderLineWatchPage({ recordKey, productName: latest.product_name, from, sessionId }), { headers: PAGE_HEADERS });
}

// GET /line/watch/open?key=...: 小さなページから LINE へ進んだ回数（line_watch_line_opened）を数えて、
// LINE を「見張る：番号」入力済みで開く。番号は /line/watch で作ったものだけ（ここでは作らない）。
export async function handleLineWatchOpen(request, env, { fetchImpl = fetch, now = new Date(), isCrawler = () => false } = {}) {
  const url = new URL(request.url);
  const { recordKey, from, sessionId } = watchParams(url);
  if (!recordKey || !env?.PRODUCT_DB) return backTo(url, recordKey, 'unavailable');
  const code = await watchCode(recordKey);
  const row = await env.PRODUCT_DB.prepare('SELECT record_key, product_name FROM line_watch_codes WHERE code=?1').bind(code).first().catch(() => null);
  if (!row || row.record_key !== recordKey) return backTo(url, recordKey, 'no_record');
  const basicId = await lineBotBasicId(env, fetchImpl);
  if (!basicId) return backTo(url, recordKey, 'unavailable');
  if (!isCrawler(request.headers.get('user-agent'))) await recordWatchEvent(env, 'line_watch_line_opened', now, { content: from, sessionId });
  return Response.redirect(`https://line.me/R/oaMessage/${encodeURIComponent(basicId)}/?${encodeURIComponent(watchMessageText(code, row.product_name))}`, 302);
}

// LINE のメッセージが「見張る：番号」「やめる」なら、ここで返信まで済ませて true を返す（検索には回さない）。
export async function handleLineWatchMessage(event, env, { reply, now = new Date() } = {}) {
  if (event?.type !== 'message' || event.message?.type !== 'text') return false;
  const body = text(event.message.text, 300);
  const userId = String(event.source?.type === 'user' ? event.source.userId || '' : '');
  const db = env?.PRODUCT_DB;
  if (STOP_WORDS.includes(body)) {
    if (!userId || !db) return false;
    const result = await db.prepare(`UPDATE line_price_watches SET status='STOPPED', updated_at=?2 WHERE line_user_id=?1 AND status='ACTIVE'`)
      .bind(userId, now.toISOString()).run();
    const stopped = Number(result?.meta?.changes || 0);
    await reply(stopped ? 'ホシルの見張りを止めました。また見張りたい物があれば、値下がりカードの「もっと下がったらLINEで知らせる」から。' : '今、見張っている物はありません。');
    return true;
  }
  const match = body.match(WATCH_CODE_PATTERN);
  if (!match) return false;
  if (!userId || !db) {
    await reply('見張りは、ホシルと 1 対 1 のトークでだけ使えます。');
    return true;
  }
  const codeRow = await db.prepare('SELECT record_key, product_name FROM line_watch_codes WHERE code=?1').bind(match[1]).first();
  const latest = codeRow ? await latestObservation(db, codeRow.record_key, now).catch(() => null) : null;
  if (!codeRow || !latest) {
    await reply('この商品は、今はホシルの価格の記録が続いていないため見張れません。ほかの値下がり中の物から選んでね。');
    return true;
  }
  const active = await db.prepare(`SELECT COUNT(*) AS n FROM line_price_watches WHERE line_user_id=?1 AND status='ACTIVE' AND record_key<>?2`)
    .bind(userId, codeRow.record_key).first();
  if (Number(active?.n || 0) >= WATCH_LIMIT_PER_USER) {
    await reply(`見張れるのは ${WATCH_LIMIT_PER_USER} 個までです。止めるときは「やめる」と送ってね（全部止まります）。`);
    return true;
  }
  const at = now.toISOString();
  const name = text(cleanProductName(latest.product_name || codeRow.product_name), 120);
  await db.prepare(`INSERT INTO line_price_watches (line_user_id, record_key, product_name, start_price, notified_price, status, created_at, updated_at, notified_at)
      VALUES (?1,?2,?3,?4,0,'ACTIVE',?5,?5,'')
      ON CONFLICT(line_user_id, record_key) DO UPDATE SET status='ACTIVE', product_name=excluded.product_name,
        start_price=excluded.start_price, notified_price=0, updated_at=excluded.updated_at`)
    .bind(userId, codeRow.record_key, name, latest.price, at).run();
  await recordWatchEvent(env, 'line_watch_started', now);
  await reply([
    `「${text(name, 40)}」を見張ります。`,
    `ホシルの記録で今の ${yen(latest.price)} より下がったら、ここで知らせます。`,
    '※ホシルが価格を記録できている間だけ。価格は変わるので、買う前に商品ページで確認してね。',
    '止めるときは「やめる」と送ってね。'
  ].join('\n'));
  return true;
}

export function dropNoticeText({ productName, fromPrice, toPrice, observedDate, recordKey }) {
  return [
    `「${text(cleanProductName(productName), 40)}」が、ホシルの記録で下がりました。`,
    `${yen(fromPrice)} → ${yen(toPrice)}（${String(observedDate || '').slice(5).replace('-', '/')} の記録）`,
    '価格は変わるので、買う前に商品ページで今の価格を確認してね。',
    productPageUrl(recordKey),
    '',
    '止めるときは「やめる」と送ってね。'
  ].join('\n');
}

async function pushLine(env, to, message, fetchImpl) {
  const response = await fetchImpl('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ to, messages: [{ type: 'text', text: message.slice(0, 5000) }] }),
    redirect: 'manual'
  });
  return response.ok;
}

// 毎日 19:00 JST に 1 回。見張り始め（または前回の通知）より記録の価格が下がった物だけ知らせる。
export async function runLinePriceWatchCycle(env, now = new Date(), { fetchImpl = fetch, force = false } = {}) {
  const db = env?.PRODUCT_DB;
  if (!db || env.LINE_WATCH_ENABLED === 'false' || !String(env.LINE_CHANNEL_ACCESS_TOKEN || '')) return { ran: false, reason: 'disabled' };
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  if (!force && !(jst.getUTCHours() === CYCLE_HOUR_JST && jst.getUTCMinutes() < 15)) return { ran: false, reason: 'not_time' };
  const month = jstMonth(now);
  const cap = monthlyPushCap(env);
  const usedRow = await db.prepare('SELECT COUNT(*) AS n FROM line_watch_pushes WHERE month=?1').bind(month).first();
  let used = Number(usedRow?.n || 0);
  const today = jstDate(now);
  const { results: watches = [] } = await db.prepare(`SELECT line_user_id, record_key, product_name, start_price, notified_price, notified_at
      FROM line_price_watches WHERE status='ACTIVE' ORDER BY updated_at ASC LIMIT 300`).all();
  let notified = 0; let skippedCap = 0; let failed = 0;
  for (const watch of watches) {
    if (String(watch.notified_at || '').slice(0, 10) === today) continue; // 1 商品 1 日 1 回まで
    const latest = await latestObservation(db, watch.record_key, now).catch(() => null);
    const baseline = Number(watch.notified_price) > 0 ? Number(watch.notified_price) : Number(watch.start_price);
    if (!latest || !(baseline > 0) || !(latest.price < baseline)) continue;
    if (used >= cap) { skippedCap += 1; continue; }
    const message = dropNoticeText({ productName: watch.product_name || latest.product_name, fromPrice: baseline, toPrice: latest.price,
      observedDate: latest.observed_date, recordKey: watch.record_key });
    let ok = false;
    try { ok = await pushLine(env, watch.line_user_id, message, fetchImpl); } catch { ok = false; }
    const at = now.toISOString();
    if (!ok) {
      failed += 1;
      continue;
    }
    used += 1;
    notified += 1;
    await db.prepare(`UPDATE line_price_watches SET notified_price=?3, notified_at=?4, updated_at=?4 WHERE line_user_id=?1 AND record_key=?2`)
      .bind(watch.line_user_id, watch.record_key, latest.price, at).run();
    await db.prepare('INSERT INTO line_watch_pushes (id, month, pushed_at) VALUES (?1,?2,?3)').bind(crypto.randomUUID(), month, at).run();
    await recordWatchEvent(env, 'line_watch_notified', now);
  }
  if (skippedCap) console.warn('LINE_WATCH_MONTHLY_CAP_REACHED', { month, cap, skipped: skippedCap });
  return { ran: true, watches: watches.length, notified, skipped_cap: skippedCap, failed, used, cap };
}

// 通知から商品ページに戻ってきた回数（/product?from=line_watch）。中身は入れない。
export async function recordLineWatchReturned(env, now = new Date()) {
  return recordWatchEvent(env, 'line_watch_returned', now);
}
