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

// 2026-09-14 事故: AI が書いた本文に「弁然のご連絡失箰いたします」「取り揁って」「リピーグー」
// 「冒頃なご連絡失祬いたします」「商品情報ヘージ」のような誤った漢字・カナが混ざり、9/11 投入分 5 通は
// そのまま実送信された。本文は「型を固定し hook の1文だけを会社ごとに変える」約束なので、型の文を
// 一字一句そのまま含まない行は送らず SKIPPED（template_mismatch）にする。AI が作ったものは
// 指示ではなく機械検査でしか担保できない。型を変えるときは、この配列と投入側の文面を同時に変える。
// 2026-09-23 大隆さん指示「RIZAPグループ株式会社のグループ企業や店舗には絶対送らない」
// 「その孫会社とかもあるからそれも全てng」「とにかくRIZAPグループ株式会社の連結会社は全てng」。
// 送り先の選定は人と AI の両方がやるので、選定の段階だけでなく**送る直前にも**機械で止める。
// 判定は社名・ブランド名・自社ドメインだけで行う（似た一般語は入れない。無関係の店を巻き込まない
// ため。「BRUNO のホットプレートを扱っています」という再販店は止めない）。当たった行は送らず
// SKIPPED（excluded_organization）にして理由を残す。
// 出典（いずれも 2026-09-23 確認）:
//   全グループ会社 https://www.rizapgroup.com/privacy/corporategroup
//   主なグループ企業 https://www.rizapgroup.com/about/group
//   2026年3月期 決算短信 https://www.sse.or.jp/wp-content/uploads/2026/05/rizap2026.3.pdf
//   孫会社: MRK https://www.mrkholdings.co.jp/group/ ／ REXT・SD・夢展望・BRUNO・アンティローザ各社サイト
// 資本関係は変わる。増えたと分かった時点でここに足す（消すのは大隆さんの確認を取ってから）。
export const OUTREACH_EXCLUDED_ORGANIZATIONS = [
  // 自社ドメイン（末尾・前後の切れ目を見てから当てる。文中の URL でも効く）
  'rizapgroup.com', 'rizap.co.jp', 'rizap.jp', 'chocozap.jp', 'kenkoucorp.com',
  'kenkoums.com', 'kenkouc.com', 'rizap-tech.co.jp', 'rizap-build.co.jp',
  'rizap-agency.co.jp', 'rizap-rbs.co.jp',
  'mrkholdings.co.jp', 'maruko.com', 'misel.co.jp', 'altiqs.com', 'marukonet.cn',
  'bruno-inc.com', 'bruno-onlineshop.com', 'idea-onlineshop.jp',
  'rext.jp', 'wondergoo.com', 'wonderrex.jp', 'shinseido.co.jp',
  'auntierosa.com', 'shop-arholiday.jp', 'dreamv.co.jp', 'dreamvs.jp',
  'dmsupporter.jp', 'gorinpki.co.jp', 'sankeiliving.co.jp', 'sdentertainment.jp',
  'isshin.com',
  // 持株会社・中核会社（RIZAP / ライザップ で RIZAP◯◯株式会社は全部当たる）
  'RIZAP', 'ライザップ', 'chocoZAP', 'チョコザップ',
  '健康コーポレーション', '健康メディカルサービス', '健康コミュニケーションズ',
  'ジャパンギャルズ',
  // MRKホールディングス系（孫会社）
  'MRKホールディングス', 'マルコ株式会社', 'MARUKO CO', 'MISEL株式会社',
  '株式会社ALTIQS', '瑪露珂爾', 'ドクターシーラボ',
  // REXT（旧ワンダーコーポレーション）系（孫会社・店舗名）
  'REXT Holdings', 'REXT株式会社', 'WonderGOO', 'ワンダーグー', 'WonderREX',
  'ワンダーレックス', '新星堂', 'ワンダーコーポレーション',
  // BRUNO（旧イデアインターナショナル）系
  'BRUNO株式会社', 'BRUNO,Inc', 'イデアインターナショナル', 'MILESTO', 'ミレスト',
  // アパレル系（孫会社・ブランド名）
  'アンティローザ', 'AuntieRosa', 'Auntie Rosa', 'アントマリーズ',
  '夢展望', 'DearMyLove', 'ディアマイラブ',
  // インベストメント事業・その他の連結会社
  '五輪パッキング', 'サンケイリビング新聞社', 'SDエンターテイメント', 'SDフィットネス',
  'エムシーツー株式会社', '株式会社フォーユー', '一新時計', '株式会社D&M', 'D&M株式会社',
  // 直近まで連結にあった会社（資本が抜けたばかりの相手も送らない）
  '堀田丸正', 'タツミマネジメント', '株式会社ビーアンドディー',
  // 2026-09-23 大隆さん指示「ITグループ株式会社の関連企業もね」。
  // https://it-group.jp/company/ （2026-09-23 確認）に SDエンターテイメント・エムシーツー・
  // 株式会社フォーユー・合同会社TAISETSU が主グループ企業として載っている（前3社は上に既出）。
  // 施設名「リバイブ」は一般語なので入れない（同名の無関係な店を止めてしまうため）。
  // ドメイン revive-support.jp で当てる。
  'ITグループ株式会社', 'ＩＴグループ株式会社', '合同会社TAISETSU',
  'カメリアキッズ', 'たいせつ保育園',
  'it-group.jp', 'camellia-kids.jp', 'taisetsu-hoikuen.jp', 'revive-support.jp'
];

// ドメインは前後の切れ目を見る（'isshin.com' が 'kisshin.com' に当たらないように）。
function domainHit(haystack, needle) {
  for (let index = haystack.indexOf(needle); index >= 0; index = haystack.indexOf(needle, index + 1)) {
    const before = haystack[index - 1];
    const after = haystack[index + needle.length];
    if ((before && /[a-z0-9.-]/u.test(before)) || (after && /[a-z0-9-]/u.test(after))) continue;
    return true;
  }
  return false;
}
export function findExcludedOrganization(...values) {
  const haystack = values.map((value) => String(value || '')).join('\n').toLowerCase();
  return OUTREACH_EXCLUDED_ORGANIZATIONS.find((name) => {
    const needle = name.toLowerCase();
    return needle.includes('.') ? domainHit(haystack, needle) : haystack.includes(needle);
  }) || '';
}

// 2026-09-24 大隆さん「短い版で出し直す」。9/8〜9/24 に135通送って返信0（配信停止1）だった。
// 旧版は950字・機能4つの箇条書き・但し書き多め。読まれる前に閉じられていた可能性が高い。
// 短い版は「なぜ連絡したか」「何をしてくれるか」「いくらか」「どう返せばいいか」の4つだけにした。
// 機能の説明・掲載順の方針・クリック課金が無いことは、返信があってから伝える。
// 成果の約束はしない（禁止語の検査は別にある）。ユーザー数にも触れない。
export const OUTREACH_SUBJECT = '商品掲載のご相談｜HOSHILU（ホシル）';
export const OUTREACH_REQUIRED_SENTENCES = [
  'ご担当者様',
  '突然のご連絡失礼いたします。買い物検索サービス HOSHILU（ホシル）の大久津です。',
  'に記載の連絡先へお送りしています。',
  'HOSHILU は Amazon・楽天・Yahoo!ショッピング・Qoo10 をまとめて探せるサービスです。御社の商品も、同じ検索結果に並べることができます。',
  'ショップページの作成と商品の登録はこちらで代行します。今のモール出店はそのままで構いません。',
  '最初の3か月は無料です。その後も続ける場合のみ月額4,980円（税込）で、いつでも解約できます。',
  'ご興味があれば、このメールに「興味あり」とひと言だけご返信ください。こちらから詳しくご案内いたします。'
];
export function findMissingTemplateSentences(body) {
  const haystack = String(body || '');
  return OUTREACH_REQUIRED_SENTENCES.filter((sentence) => !haystack.includes(sentence));
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
    'HOSHILU（ホシル） 運営: 大久津',
    'HOSHILU セラー向け案内: https://hoshilu.app/for-sellers?utm_source=seller_outreach&utm_medium=email&utm_campaign=initial_outreach',
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
  const candidates = (await env.PRODUCT_DB.prepare(`SELECT c.contact_id,c.contact_email,c.email_hash,c.subject,c.body,c.unsubscribe_token,c.shop_name FROM seller_outreach_contacts c
    WHERE c.status='QUEUED' AND c.scheduled_at<=?1
    AND NOT EXISTS (SELECT 1 FROM seller_outreach_suppressions s WHERE s.email_hash=c.email_hash)
    AND NOT EXISTS (SELECT 1 FROM seller_outreach_contacts p WHERE p.email_hash=c.email_hash AND p.contact_id<>c.contact_id AND p.status IN ('SENDING','SENT','REPLIED','OPTED_OUT'))
    ORDER BY c.scheduled_at ASC, c.contact_id ASC LIMIT ?2`).bind(now.toISOString(), budget).all()).results || [];
  const results = [];
  for (const row of candidates) {
    const timestamp = new Date().toISOString();
    // 送らないと決めた相手（2026-09-23 大隆さん指示）。選定の誤りをここで最後に止める。
    const excluded = findExcludedOrganization(row.shop_name, row.contact_email, row.body);
    if (excluded) {
      await env.PRODUCT_DB.prepare(`UPDATE seller_outreach_contacts SET status='SKIPPED',last_error=?2,updated_at=?3 WHERE contact_id=?1 AND status='QUEUED'`)
        .bind(row.contact_id, clean(`excluded_organization:${excluded}`, 200), timestamp).run();
      results.push({ contact_id: row.contact_id, status: 'SKIPPED', reason: 'excluded_organization' });
      continue;
    }
    const forbidden = findForbiddenPhrases(`${row.subject}\n${row.body}`);
    if (forbidden.length) {
      await env.PRODUCT_DB.prepare(`UPDATE seller_outreach_contacts SET status='SKIPPED',last_error=?2,updated_at=?3 WHERE contact_id=?1 AND status='QUEUED'`)
        .bind(row.contact_id, `forbidden_phrase:${forbidden.join(',')}`, timestamp).run();
      results.push({ contact_id: row.contact_id, status: 'SKIPPED', reason: 'forbidden_phrase' });
      continue;
    }
    const missing = findMissingTemplateSentences(row.body);
    if (missing.length) {
      await env.PRODUCT_DB.prepare(`UPDATE seller_outreach_contacts SET status='SKIPPED',last_error=?2,updated_at=?3 WHERE contact_id=?1 AND status='QUEUED'`)
        .bind(row.contact_id, clean(`template_mismatch:${missing[0]}`, 200), timestamp).run();
      results.push({ contact_id: row.contact_id, status: 'SKIPPED', reason: 'template_mismatch' });
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
