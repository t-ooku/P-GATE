// 2026-09-06 大隆さん指示（AI検索ハイブリッド化）:
// 「まず Gemini が見つけて、提案した商品に YES と答えたときだけ、ホシルの検索エンジンが探し始める」。
// この順番を、文字だけでなく **写真・投稿URL** の検索でも同じにするための入口。
//
// ここは「候補を1つ出す」だけ。在庫・価格・購入先は一切扱わない（それは /api/knowledge の責任）。
// 文字だけの質問は従来どおり /api/ai-chat（IDENTIFY）で足りるので、この経路は画像・URL専用。
//
// 速さのための約束:
// - 同じ写真・同じURLなら、Vision も Gemini も呼ばずに D1 キャッシュから即返す。
// - 参考画像（楽天/Yahoo の上位）が間に合わなくても候補の提示は止めない。
import { multimodalIdentifyCacheKey, readIdentifyCache, bumpIdentifyCacheHit, writeIdentifyCache } from './ai-identify-cache.mjs';

export const IDENTIFY_PREVIEW_BUDGET_MS = 3000;

export function identifyCandidateFromAnalysis(analysis) {
  const source = analysis && typeof analysis === 'object' ? analysis : {};
  const name = String(source.candidate_name || '').trim().slice(0, 160);
  if (!name) return null;
  return {
    candidate_name: name,
    candidate_brand: String(source.candidate_brand || '').trim().slice(0, 120),
    candidate_reason: String(source.candidate_reason || '').trim().slice(0, 300),
    refined_query: String(source.refined_query || name).trim().slice(0, 200),
    match_score: Math.max(0, Math.min(100, Math.round(Number(source.match_score) || 0))),
    matched_features: (Array.isArray(source.matched_features) ? source.matched_features : [])
      .map((item) => String(item || '').trim().slice(0, 100)).filter(Boolean).slice(0, 8),
    // 2026-09-06 大隆さん指示: 連携先に無かったときに出す「AIが見つけたページ」。
    // アフィリエイトは通さない。価格・在庫は未確認。
    reference_urls: (Array.isArray(source.reference_urls) ? source.reference_urls : [])
      .filter((item) => String(item?.url || '').startsWith('https://'))
      .map((item) => ({ title: String(item.title || '').trim().slice(0, 120), url: String(item.url).trim().slice(0, 1000) }))
      .slice(0, 3)
  };
}

// 参考画像は「あると分かりやすい」もので、無くても確認カードは出す。
// 予算を過ぎたら待たずに空で返し、取得自体は裏で終わらせる。
export function withPreviewBudget(previewPromise, budgetMs = IDENTIFY_PREVIEW_BUDGET_MS) {
  return Promise.race([
    Promise.resolve(previewPromise).catch(() => []),
    new Promise((resolve) => setTimeout(() => resolve([]), budgetMs))
  ]);
}

export async function readMultimodalIdentifyCache(env, input, language, { waitUntil = null } = {}) {
  const cacheKey = await multimodalIdentifyCacheKey(input, language);
  if (!cacheKey) return { cacheKey: '', cached: null };
  const cached = await readIdentifyCache(env, cacheKey);
  if (cached) {
    const bump = bumpIdentifyCacheHit(env, cacheKey);
    if (typeof waitUntil === 'function') waitUntil(bump); else void bump;
  }
  return { cacheKey, cached };
}

export function storeMultimodalIdentifyCache(env, cacheKey, result, language, { waitUntil = null } = {}) {
  if (!cacheKey) return;
  const store = writeIdentifyCache(env, cacheKey, result, { language });
  if (typeof waitUntil === 'function') waitUntil(store); else void store;
}

// 2026-09-06 大隆さん指示（待たせない）: 参考画像が揃うまでカードを止めない。
// 候補名が分かった時点でカードを返し、画像はあとから差し込む。
// 画像取得は Worker 側で続け、結果はキャッシュへ書く。画面はこのキーで取りに来る。
export function deferredPreviewResponse(cacheKey, cached) {
  const previews = Array.isArray(cached?.candidate_previews) ? cached.candidate_previews : [];
  return { ready: Boolean(cached), candidate_previews: previews, previews_key: String(cacheKey || '') };
}

export function isIdentifyPreviewKey(value) {
  return /^[0-9a-f]{64}$/.test(String(value || ''));
}

export async function readIdentifyPreviews(env, cacheKey) {
  if (!isIdentifyPreviewKey(cacheKey)) return { ready: false, candidate_previews: [] };
  const cached = await readIdentifyCache(env, cacheKey);
  return deferredPreviewResponse(cacheKey, cached);
}
