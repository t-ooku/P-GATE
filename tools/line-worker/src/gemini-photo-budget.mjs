// 2026-11-14 大隆さん承認「上位モデルを使う。上限は月 3,000 円。上限に達したら自動で今のモデルに戻す」
// （Cowork 依頼 2026-11-14-cowork-photo-search-lens-level.md 第 2 段）。
// - 対象は写真・スクショの解析（search-input-analysis.mjs の画像つきの呼び出し）だけ。文字だけの検索は今のモデル。
// - モデル名は GEMINI_PHOTO_IDENTIFY_MODEL。既定は空＝上位モデルを使わない（今のまま）。
// - 月ごとの利用額を D1 で数える。Vision の google_visual_web_detection_usage_monthly と同じ「先に枠を取る」方式。
//   呼ぶ前に見込み額を確保し、応答の usageMetadata のトークン数 × 単価で実額に精算する（数えられない時は見込み額のまま）。
// - 上限 GEMINI_PHOTO_MONTHLY_BUDGET_JPY（既定 3000。3000 を超える値は 3000 に切る）。
//   上限に達した月・数えられない時（D1 失敗・migration 未適用）は上位モデルを使わない（上限を超えない側に倒す）。
// - 単価と為替は環境変数。既定は 12/1 以降の単価（入力 $4／出力 $20 per 1M）・1 ドル 160 円で保守的に。

export const PHOTO_PREMIUM_MAX_BUDGET_JPY = 3000;
const MICRO = 1_000_000;
const DEFAULTS = Object.freeze({
  inputUsdPerM: 4,
  outputUsdPerM: 20,
  usdJpy: 160,
  // Google 検索を引いた呼び出し 1 回あたりの上乗せ（検索の回数で課金されるため、多めに見る）。
  groundingUsdPerCall: 0.05,
  reserveInputTokens: 8000,
  reserveOutputTokens: 4096
});

function positiveNumber(value, fallback, max) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= max ? number : fallback;
}

export function photoPremiumModel(env = {}) {
  const name = String(env.GEMINI_PHOTO_IDENTIFY_MODEL || '').trim();
  return /^[a-z0-9][a-z0-9.\-]{2,63}$/u.test(name) ? name : '';
}

export function photoPremiumBudgetJpy(env = {}) {
  const raw = String(env.GEMINI_PHOTO_MONTHLY_BUDGET_JPY ?? '').trim();
  if (raw === '') return PHOTO_PREMIUM_MAX_BUDGET_JPY;
  const configured = Number(raw);
  if (!Number.isFinite(configured) || configured < 0) return PHOTO_PREMIUM_MAX_BUDGET_JPY;
  return Math.min(PHOTO_PREMIUM_MAX_BUDGET_JPY, Math.floor(configured));
}

export function photoPremiumPricing(env = {}) {
  return Object.freeze({
    inputUsdPerM: positiveNumber(env.GEMINI_PHOTO_PRICE_INPUT_USD_PER_M, DEFAULTS.inputUsdPerM, 1000),
    outputUsdPerM: positiveNumber(env.GEMINI_PHOTO_PRICE_OUTPUT_USD_PER_M, DEFAULTS.outputUsdPerM, 1000),
    usdJpy: positiveNumber(env.GEMINI_PHOTO_USD_JPY, DEFAULTS.usdJpy, 1000),
    groundingUsdPerCall: positiveNumber(env.GEMINI_PHOTO_GROUNDING_USD_PER_CALL, DEFAULTS.groundingUsdPerCall, 10)
  });
}

function costMicroJpy(inputTokens, outputTokens, grounded, pricing) {
  const usd = (inputTokens * pricing.inputUsdPerM + outputTokens * pricing.outputUsdPerM) / 1_000_000
    + (grounded ? pricing.groundingUsdPerCall : 0);
  return Math.ceil(usd * pricing.usdJpy * MICRO);
}

export function photoPremiumReserveMicroJpy(env = {}, { grounded = false } = {}) {
  return costMicroJpy(DEFAULTS.reserveInputTokens, DEFAULTS.reserveOutputTokens, grounded, photoPremiumPricing(env));
}

// usageMetadata から実額を出す。トークン数が読めない時は null（見込み額のまま残す）。
export function photoPremiumActualMicroJpy(usageMetadata, env = {}, { grounded = false } = {}) {
  if (!usageMetadata || typeof usageMetadata !== 'object') return null;
  const count = (value) => (Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0);
  const input = count(usageMetadata.promptTokenCount) + count(usageMetadata.toolUsePromptTokenCount);
  const output = count(usageMetadata.candidatesTokenCount) + count(usageMetadata.thoughtsTokenCount);
  if (input + output <= 0) return null;
  return costMicroJpy(input, output, grounded, photoPremiumPricing(env));
}

function billingMonthKey(now) {
  // Google の請求月（Vision の枠と同じく America/Los_Angeles 基準）。
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit'
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value || '';
  const month = parts.find((part) => part.type === 'month')?.value || '';
  return /^\d{4}$/u.test(year) && /^\d{2}$/u.test(month) ? `${year}-${month}` : '';
}

// 呼ぶ前に見込み額の枠を取る。取れなければ上位モデルは使わない。
export async function reservePhotoPremiumBudget(env = {}, { grounded = false, now = new Date() } = {}) {
  if (!photoPremiumModel(env)) return Object.freeze({ allowed: false, reason: 'NOT_CONFIGURED' });
  if (!env.PRODUCT_DB?.prepare) return Object.freeze({ allowed: false, reason: 'GUARD' });
  const month = billingMonthKey(now);
  if (!month) return Object.freeze({ allowed: false, reason: 'GUARD' });
  const budget = photoPremiumBudgetJpy(env) * MICRO;
  const reserve = photoPremiumReserveMicroJpy(env, { grounded });
  if (budget <= 0 || reserve > budget) return Object.freeze({ allowed: false, reason: 'LIMIT' });
  const timestamp = now.toISOString();
  try {
    const row = await env.PRODUCT_DB.prepare(
      `INSERT INTO gemini_photo_usage_monthly
      (usage_month,spent_micro_jpy,request_count,monthly_budget_jpy,created_at,updated_at)
      VALUES(?1,?2,1,?3,?4,?4)
      ON CONFLICT(usage_month) DO UPDATE SET
        spent_micro_jpy=spent_micro_jpy+?2,request_count=request_count+1,monthly_budget_jpy=?3,updated_at=?4
      WHERE spent_micro_jpy+?2<=?5
      RETURNING spent_micro_jpy`
    ).bind(month, reserve, photoPremiumBudgetJpy(env), timestamp, budget).first();
    if (!row) return Object.freeze({ allowed: false, reason: 'LIMIT' });
    return Object.freeze({ allowed: true, reason: '', month, reserved_micro_jpy: reserve });
  } catch {
    return Object.freeze({ allowed: false, reason: 'GUARD' });
  }
}

// 応答のトークン数で実額に精算する。失敗しても見込み額が残る（多めに数える側）。
export async function settlePhotoPremiumBudget(env = {}, reservation = {}, usageMetadata = null, { grounded = false, now = new Date() } = {}) {
  if (!reservation?.allowed || !reservation.month || !env.PRODUCT_DB?.prepare) return false;
  const actual = photoPremiumActualMicroJpy(usageMetadata, env, { grounded });
  if (actual === null) return false;
  const delta = actual - Number(reservation.reserved_micro_jpy || 0);
  if (!Number.isFinite(delta) || delta === 0) return true;
  try {
    await env.PRODUCT_DB.prepare(
      `UPDATE gemini_photo_usage_monthly
      SET spent_micro_jpy=MAX(0,spent_micro_jpy+?2),updated_at=?3
      WHERE usage_month=?1`
    ).bind(reservation.month, delta, now.toISOString()).run();
    return true;
  } catch {
    return false;
  }
}
