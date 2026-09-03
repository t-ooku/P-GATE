// 検索品質カナリア(2026-09-03, docs/HOSHILU_SUCCESS_DIRECTIVE_2026-09-03.md §37/§54)。
// 代表クエリを毎日1回、本番の /api/knowledge と同じ経路(Turnstileだけ内部
// 迂回・traffic_class=QA)で実行し、「正しい商品候補が出るか」「Amazon/Qoo10/
// SHEIN の検索導線が消えていないか」を growth_events(QA) に固定語彙で記録する。
// 利用者の入力は一切扱わず、ここに書いた固定クエリだけを使う。
//
// 結果行: event_type='search_qa_result', medium=<query_id>, campaign=PASS|FAIL,
// content=<判定コード列 + 本命候補名(≤80字)>, marketplace=<本命候補のモール>,
// traffic_class='QA'。KPI集計(traffic_class<>'QA')には含まれない。

import { headNounScore } from './search-head-noun.mjs';

const EVENT_TYPE = 'search_qa_result';
const REQUIRED_MALL_LINKS = Object.freeze(['AMAZON_JP', 'QOO10_JP', 'SHEIN_JP', 'RAKUTEN_JP', 'YAHOO_JP']);
const QUERY_TIMEOUT_MS = 40000;

// 期待は「候補の上位3件のいずれかが expect に一致し、本命(1件目)が reject に
// 一致しない」。商品名の完全一致は要求しない(モール在庫は日々変わる)。
// 2026-09-03 2回目: 上位3件全部に reject を掛けると、本命が正しくても2件目の
// 「2wayショルダー」で落ちる(standing_leather_tote)ので本命だけに掛ける。
export const SEARCH_QA_CANARY_QUERIES = Object.freeze([
  { id: 'ig_mattress', query: 'Instagramで見たマットレス', expect: /マットレス|mattress/iu, reject: /枕|シーツ|カバー|Tシャツ|パッド/u },
  { id: 'koala_mattress', query: 'コアラマットレス', expect: /コアラ\s*・?\s*マットレス|koala\s*mattress/iu, reject: /Tシャツ|シャツ|ぬいぐるみ|おもちゃ|枕|ピロー/u },
  { id: 'qoo10_korean_lip', query: 'Qoo10で見た韓国リップ', expect: /リップ|ティント|lip|tint/iu, reject: /クリップ|グリップ|ケース|ホルダー/u },
  { id: 'korean_pink_lip', query: '韓国コスメ ピンク リップ', expect: /リップ|ティント|lip|tint/iu, reject: /クリップ|グリップ|純正|ピストン/u },
  { id: 'standing_leather_tote', query: '自立する本革トートバッグ', expect: /トート/u, reject: /財布|リュック|合皮|フェイクレザー|カバー|持ち手|ハンドル/u },
  { id: 'smoky_quartz_ring', query: 'スモーキークォーツ リング', expect: /リング|指輪|ring/iu, reject: /ネックレス|ピアス|ブレスレット|イヤリング/u },
  { id: 'ig_white_bag', query: 'Instagramで見た白いバッグ', expect: /バッグ|bag/iu, reject: /財布|枚入|枚セット|紙袋|ポリ袋/u },
  { id: 'shein_one_piece', query: 'SHEINで見たワンピース', expect: /ワンピース|ワンピ|dress/iu, reject: /防虫|カバー|ハンガー|お玉|おたま|用\b/u },
  { id: 'amazon_storage', query: 'Amazonで見た収納用品', expect: /収納|ケース|ボックス|ラック|storage/iu, reject: /リモコン|Fire TV|Alexa|交換用/u }
]);

function candidateName(candidate) {
  return String(candidate?.product_name || candidate?.display_name || candidate?.name || '').trim();
}

function candidateMarketplace(candidate) {
  const direct = String(candidate?.marketplace || '').trim();
  if (direct) return direct.slice(0, 40);
  const offer = Array.isArray(candidate?.offers) ? candidate.offers.find((item) => item?.marketplace) : null;
  return String(offer?.marketplace || '').trim().slice(0, 40);
}

// 判定は固定語彙のコードだけで表す(入力断片を含めない)。
//   C<n>   確認済み候補の件数
//   E1/E0  期待語に一致する候補が上位3件にある/ない
//   R1/R0  本命(1件目)が除外語に一致する/しない(R1は失敗)
//   H<n>   本命(1件目)の主名詞スコア(2=商品そのもの, 1=弱い一致, 0=カテゴリ違い/付属品)
//   L<n>   必須5モール(Amazon/Qoo10/SHEIN/楽天/Yahoo!)のうち検索リンクが揃った数
//   T<ms>  応答時間(ms)
export function evaluateSearchQaResult(fixture, payload, elapsedMs) {
  const result = payload?.result || {};
  const candidates = Array.isArray(result.candidates) ? result.candidates : [];
  const top = candidates.slice(0, 3);
  const names = top.map(candidateName);
  const expected = names.some((name) => fixture.expect.test(name));
  const rejected = fixture.reject && names[0] ? fixture.reject.test(names[0]) : false;
  const headScore = names[0] ? (headNounScore(fixture.query, names[0]) ?? 2) : 0;
  const links = Array.isArray(result.marketplace_search_links) ? result.marketplace_search_links : [];
  const presentMalls = new Set(links.map((link) => String(link?.marketplace || '')));
  const mallLinkCount = REQUIRED_MALL_LINKS.filter((mall) => presentMalls.has(mall)).length;
  const missingMalls = REQUIRED_MALL_LINKS.filter((mall) => !presentMalls.has(mall));
  const pass = payload?.ok === true && candidates.length > 0 && expected && !rejected && headScore >= 1
    && mallLinkCount === REQUIRED_MALL_LINKS.length;
  const code = [
    `C${Math.min(99, candidates.length)}`,
    expected ? 'E1' : 'E0',
    rejected ? 'R1' : 'R0',
    `H${headScore}`,
    `L${mallLinkCount}`,
    `T${Math.max(0, Math.min(99999, Math.round(elapsedMs)))}`
  ].join('_');
  return {
    pass,
    code,
    missing_malls: missingMalls,
    top_name: (names[0] || '').slice(0, 80),
    top_marketplace: candidateMarketplace(candidates[0]),
    top_names: names.map((name) => name.slice(0, 80))
  };
}

function qaRequest(fixture, origin) {
  return new Request(`${origin}/api/knowledge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: fixture.query,
      processing_notice_shown: true,
      session_id: `qa-canary-${fixture.id}-0000000000`,
      language: 'JA',
      search_attempt: 1,
      // 内部カナリアはTurnstileを持たない。handleKnowledgeApi は options.internalQa
      // の時だけ検証を省略する(公開経路からは到達不能)。
      turnstile_token: 'internal-qa-canary',
      source: 'qa_canary',
      medium: 'qa',
      campaign: 'search_qa_canary'
    })
  });
}

export function searchQaCanaryDue(now) {
  // 07:22 JST(22:22 UTC)の deep cron スロットで1日1回。
  return now.getUTCHours() === 22 && now.getUTCMinutes() === 22;
}

export async function runSearchQaCanary(env, now, searchHandler, {
  origin = 'https://hoshilu.app', fixtures = SEARCH_QA_CANARY_QUERIES, force = false
} = {}) {
  if (!env?.PRODUCT_DB) return { skipped: true, reason: 'DATABASE_NOT_CONFIGURED' };
  if (typeof searchHandler !== 'function') return { skipped: true, reason: 'SEARCH_HANDLER_MISSING' };
  const date = now.toISOString().slice(0, 10);
  const runId = `search-qa:${date}`;
  if (!force) {
    const existing = await env.PRODUCT_DB.prepare(`SELECT COUNT(*) AS n FROM growth_events
      WHERE event_type=?1 AND source='worker' AND traffic_class='QA' AND event_id LIKE ?2`)
      .bind(EVENT_TYPE, `${runId}:%`).first();
    if (Number(existing?.n || 0) > 0) return { skipped: true, reason: 'ALREADY_RAN_TODAY', run_id: runId };
  }
  const results = [];
  for (const fixture of fixtures) {
    const startedAt = Date.now();
    let payload = null;
    let error = '';
    try {
      const response = await Promise.race([
        searchHandler(qaRequest(fixture, origin)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('SEARCH_QA_TIMEOUT')), QUERY_TIMEOUT_MS))
      ]);
      payload = await response.json().catch(() => ({ ok: false, error: 'INVALID_JSON' }));
      if (!payload?.ok) error = String(payload?.error || `HTTP_${response.status}`).slice(0, 40);
    } catch (cause) {
      error = String(cause?.message || cause || 'SEARCH_QA_FAILED').replace(/[^A-Z0-9_]/giu, '_').slice(0, 40);
    }
    const elapsed = Date.now() - startedAt;
    const evaluation = evaluateSearchQaResult(fixture, payload, elapsed);
    const status = evaluation.pass ? 'PASS' : 'FAIL';
    const content = `${evaluation.code}${error ? `_X_${error}` : ''} ${evaluation.top_name}`.trim().slice(0, 160);
    await env.PRODUCT_DB.prepare(`INSERT INTO growth_events
      (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class,visitor_id,session_id)
      VALUES(?1,?2,'JA','worker',?3,?4,?5,?6,?7,'QA','','')
      ON CONFLICT(event_id) DO UPDATE SET campaign=excluded.campaign,
        content=excluded.content,marketplace=excluded.marketplace,occurred_at=excluded.occurred_at`)
      .bind(`${runId}:${fixture.id}`, EVENT_TYPE, fixture.id, status, content,
        evaluation.top_marketplace, new Date().toISOString()).run();
    results.push({ id: fixture.id, status, code: evaluation.code, error, elapsed_ms: elapsed,
      missing_malls: evaluation.missing_malls, top_name: evaluation.top_name, top_marketplace: evaluation.top_marketplace });
  }
  return { run_id: runId, results, passed: results.filter((r) => r.status === 'PASS').length, total: results.length };
}
