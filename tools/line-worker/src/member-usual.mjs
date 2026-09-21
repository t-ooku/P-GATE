// 2026-09-21 大隆さん指示書「成長・収益化 統合実装」§2〜§11: 「いつものホシル」。
//
// 「なくなる前に、ホシっとく。」洗剤・コーヒー・ペットフードのように繰り返し買うものを
// HOSHILU が覚え、必要になる頃に知らせる。
//
// 方針（指示書より）:
//   ・残量（あと◯ml）は本人に入力させない。周期は 7/14/30/60 日か本人指定から始める（§4）。
//   ・「買った！」の実績＝購入間隔の平均で周期を更新する。最初から高度なAI予測にしない（§6）。
//   ・状態表示は「まだ大丈夫／そろそろ／もうすぐ／今ホシっとこ」の4段階だけ（§7）。
//   ・事実データが揃わないときは、無理に判断を出さない（§8）。
//   ・価格は API で確認できた実測値だけを使う。推定価格は使わない（主幹指示書）。

export const USUAL_CYCLE_PRESETS_DAYS = Object.freeze([7, 14, 30, 60]);
export const USUAL_CYCLE_MIN_DAYS = 3;
export const USUAL_CYCLE_MAX_DAYS = 365;
// 学習に使う直近の購入間隔の本数。古すぎる間隔に引きずられないようにする。
export const USUAL_LEARNING_WINDOW = 6;
// 無料上限は member-wish-v2.mjs の WISH_LIMIT_DEFAULTS.usual（30 件）に集約する。
// §13 が 4 種の上限をまとめて定めているので、「いつものホシル」もそこへ並べた。
// ここに別の数字を置くと、画面に出す上限と実際に弾く上限がずれるため定義しない。

const DAY_MS = 86_400_000;

export function usualCycleDays(value) {
  const days = Math.round(Number(value));
  if (!Number.isFinite(days)) return 0;
  return days >= USUAL_CYCLE_MIN_DAYS && days <= USUAL_CYCLE_MAX_DAYS ? days : 0;
}

function parsedTime(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? time : null;
}

// 次回の目安 = 直近の購入日（無ければ登録日）+ 周期。
export function nextDueAt(cycleDays, { lastPurchasedAt = '', createdAt = '' } = {}) {
  const days = usualCycleDays(cycleDays);
  if (!days) return '';
  const base = parsedTime(lastPurchasedAt) ?? parsedTime(createdAt);
  if (base === null) return '';
  return new Date(base + days * DAY_MS).toISOString();
}

// §6: 購入間隔の平均で周期を更新する。間隔が 1 本も取れないうちは本人の選択を尊重する。
// 極端な外れ値（1日・3年など）は範囲外として捨てる。「たまたま2回続けて買った」で
// 周期を 1 日にしてしまうと、毎日通知することになるため。
export function learnCycleDays(purchasedAtList = [], fallbackCycleDays = 0) {
  const times = purchasedAtList
    .map(parsedTime)
    .filter((value) => value !== null)
    .sort((a, b) => a - b);
  const intervals = [];
  for (let index = 1; index < times.length; index += 1) {
    const days = Math.round((times[index] - times[index - 1]) / DAY_MS);
    if (days >= USUAL_CYCLE_MIN_DAYS && days <= USUAL_CYCLE_MAX_DAYS) intervals.push(days);
  }
  const recent = intervals.slice(-USUAL_LEARNING_WINDOW);
  if (!recent.length) return { cycle_days: usualCycleDays(fallbackCycleDays), cycle_source: 'CHOSEN', samples: 0 };
  const average = Math.round(recent.reduce((total, days) => total + days, 0) / recent.length);
  return { cycle_days: usualCycleDays(average) || usualCycleDays(fallbackCycleDays), cycle_source: 'LEARNED', samples: recent.length };
}

// §7: 4段階だけ。周期の長短で意味が変わらないよう、残り日数ではなく周期に対する割合で決める。
// （7日周期の「あと6日」と60日周期の「あと6日」は、利用者にとって別の意味なので）
export const USUAL_STATES = Object.freeze(['PLENTY', 'SOON', 'NEARLY', 'BUY_NOW']);
export const USUAL_STATE_LABELS_JA = Object.freeze({
  PLENTY: 'まだ大丈夫', SOON: 'そろそろ', NEARLY: 'もうすぐ', BUY_NOW: '今ホシっとこ'
});
// §8 の判断の見出し。状態（4段階）とは別物なので、別の表で持つ。
// 画面に同じ文言を置かないよう、判断のときも文言はここから返す。
export const USUAL_ADVICE_LABELS_JA = Object.freeze({ BUY_NOW: '今ホシっとこ', WAIT: 'まだ待ってOK' });

export function usualState(nextDue, cycleDays, now = Date.now()) {
  const days = usualCycleDays(cycleDays);
  const due = parsedTime(nextDue);
  if (!days || due === null) return { state: '', days_left: null };
  const daysLeft = Math.ceil((due - now) / DAY_MS);
  const ratio = daysLeft / days;
  const state = ratio <= 0.05 ? 'BUY_NOW' : ratio < 0.2 ? 'NEARLY' : ratio < 0.5 ? 'SOON' : 'PLENTY';
  return { state, days_left: daysLeft };
}

// §9「いつもの価格」: API で確認できた購入価格だけの中央値。推定価格は混ぜない。
// 平均ではなく中央値にするのは、1回のまとめ買いや特売で平常価格が歪むのを避けるため。
export function usualPriceJpy(priceList = []) {
  const prices = priceList
    .map((value) => Math.round(Number(value)))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (!prices.length) return null;
  const middle = Math.floor(prices.length / 2);
  return prices.length % 2 ? prices[middle] : Math.round((prices[middle - 1] + prices[middle]) / 2);
}

// §8「今ホシっとこ / まだ待ってOK」。事実が揃わないときは判断を出さない（null を返す）。
// 判断に使うのは、API で確認できた現在価格・本人の購入履歴から出した いつもの価格・
// 補充までの日数だけ。配送日は取れているときだけ添える。
export function usualBuyAdvice({ state = '', daysLeft = null, currentPriceJpy = null, usualPrice = null } = {}) {
  if (!USUAL_STATES.includes(state) || !Number.isFinite(Number(daysLeft))) return null;
  const current = Number(currentPriceJpy);
  const usual = Number(usualPrice);
  const comparable = Number.isFinite(current) && current > 0 && Number.isFinite(usual) && usual > 0;
  const difference = comparable ? usual - current : null;
  // 価格が比べられないときでも、補充が迫っていることだけは伝えてよい（事実なので）。
  if (!comparable) {
    return state === 'BUY_NOW' || state === 'NEARLY'
      ? { verdict: 'BUY_NOW', days_left: daysLeft, price_difference_jpy: null }
      : null;
  }
  const cheaper = difference > 0;
  if (state === 'BUY_NOW' || state === 'NEARLY') {
    return { verdict: 'BUY_NOW', days_left: daysLeft, price_difference_jpy: difference };
  }
  // まだ先だが、いつもよりはっきり安いなら買い時として出す。5% 未満の差は誤差として扱う。
  if (cheaper && difference >= usual * 0.05) {
    return { verdict: 'BUY_NOW', days_left: daysLeft, price_difference_jpy: difference };
  }
  return { verdict: 'WAIT', days_left: daysLeft, price_difference_jpy: difference };
}

// §11「今週の補充」: 7日以内に必要になるものを近い順に。
export function dueWithinDays(items = [], days = 7, now = Date.now()) {
  const limit = now + Math.max(1, Math.round(Number(days) || 7)) * DAY_MS;
  return items
    .filter((item) => {
      if (String(item?.status || 'ACTIVE') !== 'ACTIVE') return false;
      const due = parsedTime(item?.next_due_at);
      return due !== null && due <= limit;
    })
    .sort((a, b) => parsedTime(a.next_due_at) - parsedTime(b.next_due_at));
}

// 2026-09-21 指示書 P2「今週の補充最適化・まとめ買い最適化」。
//
// 同じモールで補充が近いものは、1回の買い物でまとめられる。それだけを言う。
// **節約額は言わない**: 送料は取れていないことが多く、いくら浮くかは数えられない。
// 数えられないものを金額で語ると、それは推定になる（主幹指示書で禁止）。
//
// モールが分からないもの（外部URL・手入力）は無理に寄せず、ひとまとめにしない。
export const BUY_TOGETHER_MIN_ITEMS = 2;

export function buyTogetherGroups(items = [], { days = 7, now = Date.now() } = {}) {
  const due = dueWithinDays(items, days, now);
  const groups = new Map();
  const alone = [];
  for (const item of due) {
    const marketplace = String(item?.marketplace || '').trim();
    // モールが分からないものは、どこでまとめられるか言えないので単独のまま。
    if (!marketplace) { alone.push(item); continue; }
    const group = groups.get(marketplace) || { marketplace, items: [] };
    group.items.push(item);
    groups.set(marketplace, group);
  }
  const together = [];
  for (const group of groups.values()) {
    if (group.items.length >= BUY_TOGETHER_MIN_ITEMS) {
      together.push({
        marketplace: group.marketplace,
        usual_ids: group.items.map((item) => String(item.usual_id || '')),
        count: group.items.length,
        // 一番近いものに合わせる。まとめるなら、その日までに買う必要がある。
        earliest_due_at: group.items[0]?.next_due_at || ''
      });
      continue;
    }
    alone.push(...group.items);
  }
  // 件数が多い順。同数なら期限が近い順。
  together.sort((a, b) => b.count - a.count
    || (String(a.earliest_due_at) < String(b.earliest_due_at) ? -1 : 1));
  return {
    together,
    alone: alone
      .sort((a, b) => parsedTime(a.next_due_at) - parsedTime(b.next_due_at))
      .map((item) => String(item.usual_id || ''))
  };
}

// ---- API ルート ------------------------------------------------------------
// GET    /api/member/usual              いつものホシル一覧（状態・残り日数・いつもの価格つき）
// POST   /api/member/usual              「いつものにする」（商品＋補充周期）
// POST   /api/member/usual/<id>/purchased 「買った！」（周期を実績から更新）
// PATCH  /api/member/usual/<id>         周期・絶対これ・止める/再開
// DELETE /api/member/usual/<id>         やめる
import { readMemberSession } from './member-auth.mjs';
import { marketplaceForProductUrl } from './marketplace-product-url-policy.mjs';
import { wishLimitsFor } from './member-wish-v2.mjs';

const clean = (value, limit) => String(value || '').normalize('NFKC')
  .replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, limit);
const httpsUrl = (value, limit = 500) => {
  const text = String(value || '').trim();
  return /^https:\/\/[^\s"'<>]+$/iu.test(text) && text.length <= limit ? text : '';
};
const validId = (value) => /^[a-f0-9]{32}$/u.test(String(value || ''));
const jsonResponse = (body, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

async function makeUsualId(memberId, productName, productKey) {
  const seed = `usual:${memberId}:${String(productKey || '').toLowerCase()}:${String(productName || '').toLowerCase()}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

const USUAL_COLUMNS = 'usual_id,product_key,product_name,image_url,product_url,marketplace,cycle_days,cycle_source,last_purchased_at,next_due_at,exact_only,status,created_at,updated_at';

// migration 0085 適用前に Worker が先に出ても落ちないようにする（既存の withArchiveSchema と同じ作法）。
const isMissingUsualTable = (error) => /no such table:?\s*main\.?member_usual/iu.test(String(error?.message || error));
async function withUsualSchema(run, fallback) {
  try { return await run(); } catch (error) {
    if (isMissingUsualTable(error)) return fallback();
    throw error;
  }
}

async function purchaseRows(env, memberId, usualId) {
  const result = await env.PRODUCT_DB.prepare(
    'SELECT purchased_at,price_jpy FROM member_usual_purchases WHERE member_id=?1 AND usual_id=?2 ORDER BY purchased_at DESC LIMIT 24'
  ).bind(memberId, usualId).all();
  return result?.results || [];
}

// §8「今ホシっとこ / まだ待ってOK」に使う現在価格。
// 推測も生成もしない。本人が同じ商品を値下がり待ちにしていて、実際に観測できた価格が
// あるときだけ使う（target_price_observations＝取得済みの実測値）。
// 無ければ null のまま返し、判断は補充の時期だけで出す（価格の話はしない）。
export async function observedPriceByProductKey(env, memberId) {
  const empty = new Map();
  if (!env?.PRODUCT_DB?.prepare || !memberId) return empty;
  try {
    const result = await env.PRODUCT_DB.prepare(
      `SELECT COALESCE(json_extract(w.condition_snapshot,'$.price_condition.target_product_key'),'') AS product_key,
         o.price_jpy AS price_jpy, o.marketplace AS marketplace, o.observed_at AS observed_at
       FROM member_wishes w
       JOIN target_price_observations o ON o.wish_id=w.wish_id
       WHERE w.member_id=?1 AND w.archived_at IS NULL AND o.price_jpy IS NOT NULL AND o.price_jpy>0
       ORDER BY o.observed_at DESC
       LIMIT 400`
    ).bind(memberId).all();
    const latest = new Map();
    for (const row of result?.results || []) {
      const key = String(row.product_key || '').trim();
      if (!key || latest.has(key)) continue;
      latest.set(key, {
        current_price_jpy: Number(row.price_jpy) || null,
        current_price_marketplace: String(row.marketplace || ''),
        current_price_observed_at: String(row.observed_at || '')
      });
    }
    return latest;
  } catch { return empty; }
}

// 判断の見出しをサーバー側で付ける。画面に同じ日本語を置かないため。
function labelledAdvice(advice) {
  if (!advice) return null;
  return { ...advice, label: USUAL_ADVICE_LABELS_JA[advice.verdict] || '' };
}

const NO_CURRENT_PRICE = Object.freeze({ current_price_jpy: null, current_price_marketplace: '', current_price_observed_at: '' });

// 一覧の 1 行を、画面がそのまま出せる形にして返す。
// 状態・残り日数・いつもの価格は、保存済みの事実からその場で出す（推測はしない）。
function decorateUsualRow(row, purchases = [], now = Date.now(), current = NO_CURRENT_PRICE) {
  const { state, days_left: daysLeft } = usualState(row.next_due_at, row.cycle_days, now);
  const usual = usualPriceJpy(purchases.map((item) => item.price_jpy));
  const price = current || NO_CURRENT_PRICE;
  return {
    ...row,
    exact_only: Number(row.exact_only) === 1,
    state,
    state_label: USUAL_STATE_LABELS_JA[state] || '',
    days_left: daysLeft,
    usual_price_jpy: usual,
    purchase_count: purchases.length,
    ...price,
    // 事実が揃わないときは null。画面は null のとき何も言い切らない。
    buy_advice: labelledAdvice(usualBuyAdvice({
      state, daysLeft, currentPriceJpy: price.current_price_jpy, usualPrice: usual
    }))
  };
}

export async function handleMemberUsualRoutes(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/member/usual')) return null;
  if (!env?.PRODUCT_DB) return jsonResponse({ ok: false, error: 'MEMBER_STORE_NOT_CONFIGURED' }, 503);
  const member = await readMemberSession(request, env);
  if (!member) return jsonResponse({ ok: false, error: 'MEMBER_LOGIN_REQUIRED' }, 401);
  const now = new Date().toISOString();
  const rest = url.pathname.slice('/api/member/usual'.length).replace(/^\//u, '');
  const [usualId, action] = rest.split('/');

  if (request.method === 'GET' && !rest) {
    const rows = await withUsualSchema(
      () => env.PRODUCT_DB.prepare(
        `SELECT ${USUAL_COLUMNS} FROM member_usual_items WHERE member_id=?1 AND status<>'ARCHIVED' ORDER BY next_due_at ASC LIMIT 200`
      ).bind(member.id).all(),
      () => ({ results: [] })
    );
    const observed = await observedPriceByProductKey(env, member.id);
    const items = [];
    for (const row of rows.results || []) {
      items.push(decorateUsualRow(
        row, await purchaseRows(env, member.id, row.usual_id), Date.now(),
        observed.get(String(row.product_key || '').trim()) || NO_CURRENT_PRICE
      ));
    }
    // 画面が「いつものホシル 12 / 30」を出せるよう、上限と使用数も返す（探し中・値下がり待ちと同じ）。
    return jsonResponse({
      ok: true, items,
      this_week: dueWithinDays(items, 7).map((item) => item.usual_id),
      // P2: 同じモールでまとめて買えるものをまとめる。節約額は言わない。
      buy_together: buyTogetherGroups(items, { days: 7 }),
      limit: wishLimitsFor(env).usual,
      usage: items.filter((item) => item.status === 'ACTIVE').length
    });
  }

  if (request.method === 'POST' && !rest) {
    const payload = await request.json().catch(() => null);
    if (!payload) return jsonResponse({ ok: false, error: 'USUAL_BODY_INVALID' }, 400);
    const productName = clean(payload.product_name, 200);
    if (productName.length < 2) return jsonResponse({ ok: false, error: 'USUAL_PRODUCT_NAME_INVALID' }, 400);
    const cycleDays = usualCycleDays(payload.cycle_days);
    if (!cycleDays) return jsonResponse({ ok: false, error: 'USUAL_CYCLE_INVALID' }, 400);
    const productKey = clean(payload.product_key, 160);
    const productUrl = httpsUrl(payload.product_url);
    // モールは本人の申告ではなく、商品ページ URL から判定する（値下がり待ちと同じ作法）。
    const marketplace = productUrl ? String(marketplaceForProductUrl(productUrl)?.marketplace || '') : '';
    const id = await makeUsualId(member.id, productName, productKey);
    const existing = await withUsualSchema(
      () => env.PRODUCT_DB.prepare('SELECT usual_id,created_at,last_purchased_at FROM member_usual_items WHERE member_id=?1 AND usual_id=?2').bind(member.id, id).first(),
      () => null
    );
    // §13 の無料上限。既に登録済みの商品を編集するときは数えない（既存行は弾かない）。
    // 止めた（PAUSED）ものは枠を使う扱いにする。ARCHIVED（やめた）だけ枠を返す。
    if (!existing) {
      const limit = wishLimitsFor(env).usual;
      const count = await withUsualSchema(
        () => env.PRODUCT_DB.prepare("SELECT COUNT(*) AS total FROM member_usual_items WHERE member_id=?1 AND status<>'ARCHIVED'").bind(member.id).first(),
        () => ({ total: 0 })
      );
      const usage = Number(count?.total || 0);
      if (usage >= limit) {
        return jsonResponse({
          ok: false, error: 'USUAL_LIMIT_REACHED', limit_kind: 'usual', limit, usage,
          message: `いつものホシルは ${limit} 件までです。もう買わなくなったものを「やめる」にしてから、もう一度お試しください。`
        }, 409);
      }
    }
    const createdAt = existing?.created_at || now;
    const due = nextDueAt(cycleDays, { lastPurchasedAt: existing?.last_purchased_at || '', createdAt });
    const exactOnly = payload.exact_only === true ? 1 : 0;
    try {
      await env.PRODUCT_DB.prepare(
        `INSERT INTO member_usual_items (member_id,usual_id,product_key,product_name,image_url,product_url,marketplace,cycle_days,cycle_source,last_purchased_at,next_due_at,exact_only,status,created_at,updated_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,'CHOSEN',?9,?10,?11,'ACTIVE',?12,?13)
         ON CONFLICT(member_id,usual_id) DO UPDATE SET
           product_name=excluded.product_name,
           image_url=CASE WHEN excluded.image_url<>'' THEN excluded.image_url ELSE member_usual_items.image_url END,
           product_url=CASE WHEN excluded.product_url<>'' THEN excluded.product_url ELSE member_usual_items.product_url END,
           marketplace=CASE WHEN excluded.marketplace<>'' THEN excluded.marketplace ELSE member_usual_items.marketplace END,
           cycle_days=excluded.cycle_days, cycle_source='CHOSEN',
           next_due_at=excluded.next_due_at, exact_only=excluded.exact_only,
           status='ACTIVE', updated_at=excluded.updated_at`
      ).bind(member.id, id, productKey, productName, httpsUrl(payload.image_url), productUrl, marketplace,
        cycleDays, existing?.last_purchased_at || null, due, exactOnly, createdAt, now).run();
    } catch (error) {
      if (isMissingUsualTable(error)) return jsonResponse({ ok: false, error: 'USUAL_NOT_READY' }, 503);
      throw error;
    }
    return jsonResponse({ ok: true, usual_id: id, cycle_days: cycleDays, next_due_at: due });
  }

  if (!validId(usualId)) return jsonResponse({ ok: false, error: 'USUAL_NOT_FOUND' }, 404);
  const row = await withUsualSchema(
    () => env.PRODUCT_DB.prepare(`SELECT ${USUAL_COLUMNS} FROM member_usual_items WHERE member_id=?1 AND usual_id=?2`).bind(member.id, usualId).first(),
    () => null
  );
  if (!row) return jsonResponse({ ok: false, error: 'USUAL_NOT_FOUND' }, 404);

  // §5「買った！」: 押した日を last_purchased_at に保存し、次回を再計算。
  // §6: 実績（購入間隔）が取れたら周期も更新する。価格は API で確認できた時だけ記録する。
  if (request.method === 'POST' && action === 'purchased') {
    const payload = await request.json().catch(() => ({}));
    const purchasedAt = Date.parse(String(payload?.purchased_at || '')) ? new Date(payload.purchased_at).toISOString() : now;
    const price = Math.round(Number(payload?.price_jpy));
    const priceJpy = Number.isFinite(price) && price > 0 ? price : null;
    const purchaseId = crypto.randomUUID();
    await env.PRODUCT_DB.prepare(
      'INSERT INTO member_usual_purchases (purchase_id,member_id,usual_id,purchased_at,price_jpy,marketplace,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7)'
    ).bind(purchaseId, member.id, usualId, purchasedAt, priceJpy, clean(payload?.marketplace, 20), now).run();
    const history = await purchaseRows(env, member.id, usualId);
    const learned = learnCycleDays(history.map((item) => item.purchased_at), row.cycle_days);
    const due = nextDueAt(learned.cycle_days, { lastPurchasedAt: purchasedAt, createdAt: row.created_at });
    await env.PRODUCT_DB.prepare(
      'UPDATE member_usual_items SET last_purchased_at=?3, cycle_days=?4, cycle_source=?5, next_due_at=?6, updated_at=?7 WHERE member_id=?1 AND usual_id=?2'
    ).bind(member.id, usualId, purchasedAt, learned.cycle_days, learned.cycle_source, due, now).run();
    return jsonResponse({
      ok: true, usual_id: usualId, last_purchased_at: purchasedAt, next_due_at: due,
      cycle_days: learned.cycle_days, cycle_source: learned.cycle_source, learned_from: learned.samples,
      usual_price_jpy: usualPriceJpy(history.map((item) => item.price_jpy))
    });
  }

  if (request.method === 'PATCH' && !action) {
    const payload = await request.json().catch(() => ({}));
    const cycleDays = payload?.cycle_days === undefined ? Number(row.cycle_days) : usualCycleDays(payload.cycle_days);
    if (!cycleDays) return jsonResponse({ ok: false, error: 'USUAL_CYCLE_INVALID' }, 400);
    const exactOnly = payload?.exact_only === undefined ? Number(row.exact_only) : (payload.exact_only === true ? 1 : 0);
    const status = ['ACTIVE', 'PAUSED', 'ARCHIVED'].includes(String(payload?.status || '').toUpperCase())
      ? String(payload.status).toUpperCase() : row.status;
    // 周期を本人が変えたら、学習結果ではなく本人の選択として扱う。
    const cycleSource = payload?.cycle_days === undefined ? row.cycle_source : 'CHOSEN';
    const due = nextDueAt(cycleDays, { lastPurchasedAt: row.last_purchased_at || '', createdAt: row.created_at });
    await env.PRODUCT_DB.prepare(
      'UPDATE member_usual_items SET cycle_days=?3, cycle_source=?4, exact_only=?5, status=?6, next_due_at=?7, updated_at=?8 WHERE member_id=?1 AND usual_id=?2'
    ).bind(member.id, usualId, cycleDays, cycleSource, exactOnly, status, due, now).run();
    return jsonResponse({ ok: true, usual_id: usualId, cycle_days: cycleDays, exact_only: exactOnly === 1, status, next_due_at: due });
  }

  if (request.method === 'DELETE' && !action) {
    await env.PRODUCT_DB.prepare('DELETE FROM member_usual_purchases WHERE member_id=?1 AND usual_id=?2').bind(member.id, usualId).run();
    await env.PRODUCT_DB.prepare('DELETE FROM member_usual_items WHERE member_id=?1 AND usual_id=?2').bind(member.id, usualId).run();
    return jsonResponse({ ok: true, usual_id: usualId, deleted: true });
  }

  return jsonResponse({ ok: false, error: 'USUAL_METHOD_NOT_ALLOWED' }, 405);
}
