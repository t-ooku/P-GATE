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
// 9件を続けて流すとモールAPI(特に楽天は1秒1回)の429で候補ゼロになることが
// ある(2026-09-03 3回目: smoky_quartz_ring が C0)。クエリ間に間を置き、
// 候補ゼロの時だけ1回やり直す。
const FIXTURE_PAUSE_MS = 2500;
const EMPTY_RETRY_PAUSE_MS = 5000;

// 期待は「候補の上位3件のいずれかが expect に一致し、本命(1件目)が reject に
// 一致しない」。商品名の完全一致は要求しない(モール在庫は日々変わる)。
// 2026-09-03 2回目: 上位3件全部に reject を掛けると、本命が正しくても2件目の
// 「2wayショルダー」で落ちる(standing_leather_tote)ので本命だけに掛ける。
// 3回目: 「マジックリップ」(クリップ)・「体型カバー」(カバー)のように語の一部や
// 説明語で正しい本命を落としていた。別語の一部・付属品は H(主名詞スコア)が
// 判定するので、reject は明確な別商品語だけにする。
export const SEARCH_QA_CANARY_QUERIES = Object.freeze([
  { id: 'ig_mattress', query: 'Instagramで見たマットレス', expect: /マットレス|mattress/iu, reject: /枕|シーツ|カバー|Tシャツ|パッド/u },
  { id: 'koala_mattress', query: 'コアラマットレス', expect: /コアラ\s*・?\s*マットレス|koala\s*mattress/iu, reject: /Tシャツ|シャツ|ぬいぐるみ|おもちゃ|枕|ピロー/u },
  { id: 'qoo10_korean_lip', query: 'Qoo10で見た韓国リップ', expect: /リップ|ティント|lip|tint/iu, reject: /ケース|ホルダー/u },
  { id: 'korean_pink_lip', query: '韓国コスメ ピンク リップ', expect: /リップ|ティント|lip|tint/iu, reject: /純正|ピストン/u },
  { id: 'standing_leather_tote', query: '自立する本革トートバッグ', expect: /トート/u, reject: /財布|リュック|合皮|フェイクレザー|カバー|持ち手|ハンドル/u },
  { id: 'smoky_quartz_ring', query: 'スモーキークォーツ リング', expect: /リング|指輪|ring/iu, reject: /ネックレス|ピアス|ブレスレット|イヤリング/u },
  { id: 'ig_white_bag', query: 'Instagramで見た白いバッグ', expect: /バッグ|bag/iu, reject: /財布|枚入|枚セット|紙袋|ポリ袋/u },
  { id: 'shein_one_piece', query: 'SHEINで見たワンピース', expect: /ワンピース|ワンピ|dress/iu, reject: /防虫|ハンガー|お玉|おたま|用\b/u },
  { id: 'amazon_storage', query: 'Amazonで見た収納用品', expect: /収納|ケース|ボックス|ラック|storage/iu, reject: /リモコン|Fire TV|Alexa|交換用/u },
  // 2026-09-04 大隆さん実機報告: 「底開口 水筒」で sokomo「そこまで洗えるボトル」（楽天に在庫あり）が出ない。
  // 本番経路で毎日確かめる（期待: 上位3件に底が外せる水筒、本命がブラシ等の付属品でない）。
  { id: 'bottom_removable_bottle', query: '底開口 水筒', expect: /そこまで洗える|底.{0,4}(?:取り外|外せ|外れ)|sokomo|ソコモ|底ヂカラ|分解.{0,4}洗/iu, reject: /ブラシ|スポンジ|洗剤|パッキン|替え|交換用/u },
  // 2026-09-06 展開規則 pet-shedding-brush の代表クエリ（機能語「ごっそり取れる」→ 売り手の語「抜け毛取り」「スリッカー」）。
  { id: 'pet_shedding_brush', query: '猫の抜け毛がごっそり取れるブラシ', expect: /ブラシ|コーム|くし|ファーミネーター|抜け毛|brush/iu, reject: /シャンプー|爪切り|フード|おやつ|トイレ|首輪|ケージ/u }
]);

export const PRIORITY_SEARCH_QA_QUERIES = Object.freeze([
  { id: 'p0_ready_storage', query: '組み立てがいらない収納ボックス', expect: /(?=.*(?:収納|ボックス|ケース))(?=.*(?:完成品|組立不要|組み立て不要|組立て不要))/u, reject: /要組立|組立式|組み立て式/u },
  { id: 'p0_litter_toilet', query: '猫砂が飛び散らない猫トイレ', expect: /(?=.*(?:トイレ))(?=.*(?:飛び散|飛散|上から|上入|深型|フルカバー))/u, reject: /スコップのみ|シートのみ|猫砂のみ/u },
  { id: 'p0_quickdry_shoes', query: 'すぐ乾く上履き', expect: /(?=.*(?:上履|上靴))(?=.*(?:速乾|メッシュ|通気))/u, reject: /中敷きのみ|洗剤|洗濯ネット/u },
  { id: 'p0_washable_fan', query: '羽根が外れて洗える扇風機', expect: /(?=.*扇風機)(?=.*(?:分解|丸洗|水洗|羽根.*(?:外|洗)))/u, reject: /交換用|羽根のみ|カバーのみ/u },
  { id: 'p0_quiet_toothbrush', query: '音が静かな電動歯ブラシ', expect: /(?=.*電動歯ブラシ)(?=.*(?:静音|低騒音|静か))/u, reject: /替えブラシ|交換用|ヘッドのみ/u }
]);

export async function runPrioritySearchQaCanary(env, now, handler) {
  // One explicitly requested release audit; it cannot become a recurring bill.
  if (now.toISOString().slice(0, 10) !== '2026-09-07' || !env.PRODUCT_DB) return;
  const existing = await env.PRODUCT_DB.prepare(`SELECT medium FROM growth_events WHERE event_type='search_qa_result'
    AND traffic_class='QA' AND event_id LIKE 'search-qa:2026-09-07:p0_%'`).all();
  const done = new Set((existing.results || []).map(row => row.medium));
  const fixtures = PRIORITY_SEARCH_QA_QUERIES.filter(fixture => !done.has(fixture.id));
  if (fixtures.length) return runSearchQaCanary(env, now, handler, { fixtures, force: true });
}

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
  origin = 'https://hoshilu.app', fixtures = SEARCH_QA_CANARY_QUERIES, force = false, pauseMs = FIXTURE_PAUSE_MS
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
  const sleep = (ms) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());
  const runOnce = async (fixture) => {
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
    return { payload, error };
  };
  let index = 0;
  for (const fixture of fixtures) {
    if (index > 0) await sleep(pauseMs);
    index += 1;
    const startedAt = Date.now();
    let { payload, error } = await runOnce(fixture);
    const candidateCount = Array.isArray(payload?.result?.candidates) ? payload.result.candidates.length : 0;
    if (candidateCount === 0) {
      await sleep(pauseMs > 0 ? EMPTY_RETRY_PAUSE_MS : 0);
      const retry = await runOnce(fixture);
      const retryCount = Array.isArray(retry.payload?.result?.candidates) ? retry.payload.result.candidates.length : 0;
      if (retryCount > 0 || (!retry.error && error)) ({ payload, error } = retry);
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
    if (PRIORITY_SEARCH_QA_QUERIES.some(item => item.id === fixture.id) && payload?.result?.qa_trace) {
      await env.PRODUCT_DB.prepare(`INSERT INTO growth_events
        (event_id,event_type,locale,source,medium,campaign,content,marketplace,occurred_at,traffic_class,visitor_id,session_id)
        VALUES(?1,'search_qa_trace','JA','worker',?2,?3,?4,'',?5,'QA','','')
        ON CONFLICT(event_id) DO UPDATE SET content=excluded.content,occurred_at=excluded.occurred_at`)
        .bind(`${runId}:${fixture.id}:trace`, fixture.id, status,
          JSON.stringify({ ...payload.result.qa_trace, top_names: evaluation.top_names }), new Date().toISOString()).run();
    }
  }
  return { run_id: runId, results, passed: results.filter((r) => r.status === 'PASS').length, total: results.length };
}
