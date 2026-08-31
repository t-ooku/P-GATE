import { expandSearchQuery } from './query-expansion.mjs';
import { relatedProductExpansionQueries } from './related-product-expansion.mjs';
import {
  containsUnsafeAiOutputContent, sanitizeAiOutputText
} from './ai-output-safety.mjs';

const AI_TIMEOUT_MS = 4000;

function boundedSignal(signal, timeoutMs = AI_TIMEOUT_MS) {
  const timeout = AbortSignal.timeout(Math.max(100, Math.min(AI_TIMEOUT_MS, Number(timeoutMs) || AI_TIMEOUT_MS)));
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

const RULES = [
  { match:/スマホ.{0,4}(?:ケース|カバー)|iphone.{0,4}(?:case|ケース|カバー)/iu, items:[['スマホ充電器','一緒に使う充電用品'],['スマホストラップ','持ち歩きや落下防止に関連'],['スマホ保護フィルム','端末保護に関連']] },
  { match:/ハンディファン|携帯扇風機|顔用扇風機/iu, items:[['モバイルバッテリー','外出先での給電に関連'],['冷感タオル','暑さ対策として関連'],['ネッククーラー','同じ利用場面の暑さ対策']] },
  { match:/ワイヤレスイヤホン|bluetooth.{0,3}イヤホン/iu, items:[['イヤホンケース','持ち運びと保護に関連'],['USB充電器','イヤホンの充電に関連'],['Bluetoothトランスミッター','接続機器の拡張に関連']] },
  { match:/スニーカー|ランニングシューズ/iu, items:[['靴下','一緒に着用する商品'],['インソール','履き心地の調整に関連'],['防水スプレー 靴','靴の手入れに関連']] },
  { match:/化粧水|フェイスローション/iu, items:[['乳液','スキンケア手順で関連'],['美容液','同じスキンケア用途'],['コットン 化粧用','化粧水の使用時に関連']] },
  { match:/ピアス|イヤリング/iu, items:[['アクセサリーケース','ピアスの保管に関連'],['ピアスキャッチ','紛失防止や交換に関連'],['ジュエリークロス','アクセサリーの手入れに関連']] },
  // 度あり/度なし・ブランド名を含む検索でも、商品本体の別候補ではなく
  // 使用時に必要になるケア用品へ横展開する。専用APIが実在商品を確認した
  // 場合だけ表示されるため、ここでは商品や価格を創作しない。
  { match:/カラコン|カラー\s*コンタクト|コンタクト\s*レンズ/iu, items:[['コンタクトレンズ洗浄液','レンズの洗浄・保存に関連'],['コンタクトレンズケース','レンズの保管に関連'],['コンタクトレンズ装着液','装着時のケアに関連']] },
  { match:/ノート\s*パソコン|ノート\s*pc|laptop/iu, items:[['ワイヤレスマウス','パソコン操作に関連'],['ノートパソコンケース','持ち運びと保護に関連'],['USB Type-C ハブ','周辺機器の接続に関連']] },
  { match:/タブレット|ipad/iu, items:[['タブレットケース','端末の保護に関連'],['タブレット用タッチペン','入力や操作に関連'],['タブレット保護フィルム','画面保護に関連']] },
  { match:/デジタルカメラ|ミラーレス|一眼レフ/iu, items:[['SDカード カメラ用','写真データの保存に関連'],['カメラバッグ','持ち運びと保護に関連'],['カメラ三脚','撮影時の固定に関連']] },
  { match:/テレビ|モニター|ディスプレイ/iu, items:[['HDMIケーブル','映像機器の接続に関連'],['テレビ台','設置環境に関連'],['画面クリーナー','画面の手入れに関連']] },
  { match:/プリンター|複合機/iu, items:[['プリンター用紙','印刷時に使用する商品'],['プリンターインク','印刷用の消耗品'],['USBプリンターケーブル','機器の接続に関連']] },
  { match:/炊飯器/iu, items:[['米びつ','お米の保存に関連'],['米とぎボウル','炊飯準備に関連'],['キッチンスケール','分量の計測に関連']] },
  { match:/コーヒー\s*メーカー|コーヒー\s*マシン/iu, items:[['コーヒーフィルター','抽出時に使用する商品'],['コーヒーグラインダー','豆の準備に関連'],['コーヒーマグ','飲用時に関連']] },
  { match:/マットレス/iu, items:[['ポケットコイルマットレス','マットレス本体の別構造'],['高反発マットレス','マットレス本体の別の硬さ'],['低反発マットレス','マットレス本体の別の硬さ']] },
  { match:/ベッド/iu, items:[['ベッドシーツ','寝具として一緒に使用'],['枕','睡眠環境に関連'],['マットレスプロテクター','汚れや湿気の対策に関連']] },
  { match:/ソファ|カウチ/iu, items:[['ソファカバー','汚れ防止や模様替えに関連'],['クッション','座り心地の調整に関連'],['サイドテーブル','ソファ周辺での使用に関連']] },
  { match:/ベビーカー|バギー/iu, items:[['ベビーカー レインカバー','雨天時の利用に関連'],['ベビーカーフック','荷物の持ち運びに関連'],['ベビーカーシート','座面の汚れ対策に関連']] },
  { match:/おむつ|オムツ|紙パンツ/iu, items:[['おしりふき','おむつ交換時に使用'],['おむつ替えシート','交換時の衛生に関連'],['おむつ消臭袋','使用済みおむつの処理に関連']] },
  { match:/シャンプー/iu, items:[['コンディショナー','洗髪後のケアに関連'],['ヘアマスク','髪の集中ケアに関連'],['頭皮ブラシ','洗髪時のケアに関連']] },
  { match:/ファンデーション/iu, items:[['化粧下地','ベースメイクの前工程に関連'],['メイクスポンジ','ファンデーションの塗布に関連'],['フェイスパウダー','ベースメイクの仕上げに関連']] },
  { match:/アイブロウ|眉(?:毛)?(?:ペン|ペンシル|描き)|眉墨/iu, items:[['アイブロウブラシ','眉メイクの仕上げに関連'],['眉マスカラ','眉色の調整に関連'],['アイブロウコート','眉メイクの持続に関連']] },
  { match:/掃除機|クリーナー/iu, items:[['すき間掃除ブラシ','細部の掃除に関連'],['掃除用ウェットシート','床や家具の仕上げ掃除に関連'],['収納ラック 掃除機','掃除用品の収納に関連']] },
  { match:/ペット\s*フード|ドッグ\s*フード|キャット\s*フード/iu, items:[['ペットフード保存容器','フードの保存に関連'],['ペット用フードボウル','給餌時に使用'],['ペット用計量スプーン','給餌量の計測に関連']] }
];

// AIの関連カテゴリ提案は商品検索そのものではない。AIは用途の連続性だけを
// 理解し、実在商品・価格・在庫は後段のモールAPIで必ず確認する。
// 医療・摂取・年齢制限品は誤った組み合わせの影響が大きいため自動生成しない。
const AI_FALLBACK_BLOCKLIST = /(?:医薬品|処方薬|市販薬|薬|薬剤|サプリ|健康食品|治療|妊娠|授乳|乳児用ミルク|酒|ビール|ワイン|たばこ|タバコ|電子タバコ|武器|ナイフ|包丁|アダルト|成人向け)/iu;

function clean(value, max = 100) {
  return String(value || '').normalize('NFKC').replace(/\s+/gu, ' ').trim().slice(0, max);
}

function parseJsonText(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1] || raw;
  try { return JSON.parse(fenced.trim()); } catch {}
  const object = fenced.match(/\{[\s\S]*\}/u)?.[0];
  if (!object) return null;
  try { return JSON.parse(object); } catch { return null; }
}

function providerText(payload = {}) {
  let text = '';
  for (const candidate of Array.isArray(payload.candidates) ? payload.candidates : []) {
    for (const part of Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []) text += `${part?.text || ''}\n`;
  }
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    for (const block of Array.isArray(item?.content) ? item.content : []) if (block?.type === 'output_text') text += `${block.text || ''}\n`;
  }
  return text.trim();
}

export function normalizeAiRelatedQueries(payload = {}, sourceQuery = '') {
  const source = clean(sourceQuery).toLocaleLowerCase();
  const sourceCompact = source.replace(/[\s・/_-]+/gu, '');
  const items = Array.isArray(payload?.categories) ? payload.categories : [];
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const rawQuery = clean(item?.query || item?.category, 60);
    const rawReason = clean(item?.reason, 100);
    // Related-category text is both rendered and turned into signed
    // marketplace searches. Any AI-invented URL/price/stock/seller claim
    // invalidates the whole suggestion; silently trimming it could leave a
    // misleading query or reason attached to a real marketplace link.
    if (containsUnsafeAiOutputContent(rawQuery) || containsUnsafeAiOutputContent(rawReason)) continue;
    const query = sanitizeAiOutputText(rawQuery, 60);
    const reason = sanitizeAiOutputText(rawReason, 100);
    const key = query.toLocaleLowerCase().replace(/[\s・/_-]+/gu, '');
    if (query.length < 2 || !reason || !key || key === sourceCompact || seen.has(key)) continue;
    if (/\b(?:amazon|楽天市場|yahoo!?ショッピング)\b/iu.test(query) || AI_FALLBACK_BLOCKLIST.test(query)) continue;
    seen.add(key);
    output.push({ query, reason });
    if (output.length >= 3) break;
  }
  return output;
}

function aiPrompt(query, language) {
  return `You are HOSHILU's complementary-product category planner.\nSearch query: ${clean(query, 200)}\nDisplay language: ${clean(language, 10) || 'JA'}\n\nSuggest up to 3 DIFFERENT product categories commonly used together with the searched product. HOSHILU will separately search marketplace APIs and display only verified real products.\nReturn JSON only: {"categories":[{"query":"short Japanese marketplace category","reason":"short reason in the display language"}]}\nRules:\n- Recommend complements or accessories, not another brand/model of the searched product.\n- Use a short generic Japanese marketplace search term for query.\n- Never invent a product, brand, model, price, stock, seller, URL, medical effect, or compatibility.\n- Do not suggest medicine, supplements, alcohol, tobacco, weapons, or age-restricted products.\n- If a safe and useful complement cannot be inferred, return {"categories":[]}.`;
}

async function providerFetch(fetchImpl, url, requestOptions, control = {}) {
  return fetchImpl(url, {
    ...requestOptions,
    redirect: 'manual',
    signal: boundedSignal(control.signal, control.timeoutMs)
  });
}

async function requestAiRelatedQueries(query, language, env, fetchImpl, options = {}) {
  const providers = [
    String(env.GEMINI_API_KEY || '').length >= 20 && 'gemini',
    String(env.OPENAI_API_KEY || '').length >= 20 && 'openai'
  ].filter(Boolean);
  const prompt = aiPrompt(query, language);
  for (const provider of providers) {
    if (options.signal?.aborted) break;
    try {
      const response = provider === 'gemini'
        ? await providerFetch(fetchImpl, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(String(env.GEMINI_PRODUCT_DISCOVERY_MODEL || 'gemini-3.6-flash'))}:generateContent`, {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } })
        }, options)
        : await providerFetch(fetchImpl, 'https://api.openai.com/v1/responses', {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
          body: JSON.stringify({ model: String(env.OPENAI_PRODUCT_DISCOVERY_MODEL || 'gpt-5'), input: prompt, reasoning: { effort: 'low' }, text: { format: { type: 'json_object' } } })
        }, options);
      if (!response.ok) continue;
      const suggestions = normalizeAiRelatedQueries(parseJsonText(providerText(await response.json())) || {}, query);
      if (suggestions.length) return suggestions;
    } catch {
      if (options.signal?.aborted) break;
    }
  }
  return [];
}

export function relatedProductRecommendationQueries(rawQuery) {
  const query=expandSearchQuery(rawQuery).query;
  const rule=RULES.find(item=>item.match.test(query));
  if (!rule) return [];
  const sourceCompact = clean(query).toLocaleLowerCase().replace(/[\s・/_-]+/gu, '');
  return rule.items
    .map(([itemQuery,reason])=>({query:itemQuery,reason}))
    // 「テレビ台」を検索した時に、テレビ用ルールの「テレビ台」自体を
    // レコメンドへ再掲しない。別カテゴリへの横展開だけを残す。
    .filter(({query:itemQuery})=>!sourceCompact.includes(clean(itemQuery).toLocaleLowerCase().replace(/[\s・/_-]+/gu, '')));
}

// 2026-08-18のユーザー指示:
//   「『その商品と一緒に使うもの』と横展開どちらも提示して良いよ」
//
// 従来は補完提案(一緒に使うもの)だけを返し、静的ルールに当たった時点で
// 打ち切っていた。そのため『天然石 ピアス』にはアクセサリーケース・
// ピアスキャッチ・ジュエリークロスしか出ず、『天然石 指輪』『シルバー ピアス』
// のような横展開が一切出なかった。
//
// 横展開(related-product-expansion.mjs)を先に並べ、そのあとに補完提案を足す。
// 横展開を先にするのは、利用者が今探している物により近く、外したときの
// 損失が小さいため。どちらの提案も、実在確認は後段のモールAPIが行う。
export async function resolveRelatedProductRecommendationQueries(
  rawQuery, language = 'JA', env = {}, fetchImpl = fetch, options = {}
) {
  const merged = [];
  const seen = new Set();
  for (const item of [...relatedProductExpansionQueries(rawQuery, language), ...relatedProductRecommendationQueries(rawQuery)]) {
    const key = String(item?.query || '').toLocaleLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  if (merged.length) return merged;
  const query = expandSearchQuery(rawQuery).query;
  if (!query || AI_FALLBACK_BLOCKLIST.test(query)) return [];
  return requestAiRelatedQueries(query, language, env, fetchImpl, options);
}

export const relatedProductRecommendationTest = { aiPrompt, parseJsonText, providerText };
