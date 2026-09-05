import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SEARCH_QA_CANARY_QUERIES, evaluateSearchQaResult, runSearchQaCanary, searchQaCanaryDue
} from '../src/search-qa-canary.mjs';

// 2026-09-03 指示書 §37/§54: 代表クエリを毎日本番経路で流し、候補の正しさと
// Amazon/Qoo10/SHEIN 導線の有無を固定語彙で記録する。

const links = (malls) => malls.map((marketplace) => ({ marketplace, url: `https://hoshilu.app/go?token=${marketplace}` }));
const ALL = ['AMAZON_JP', 'RAKUTEN_JP', 'YAHOO_JP', 'QOO10_JP', 'SHEIN_JP', 'ZOZOTOWN_JP'];

test('固定クエリは指示書 §54 の9件＋2026-09-04 の「底開口 水筒」で、利用者入力を含まない', () => {
  assert.equal(SEARCH_QA_CANARY_QUERIES.length, 11);
  assert.ok(SEARCH_QA_CANARY_QUERIES.some((f) => f.id === 'pet_shedding_brush' && f.query === '猫の抜け毛がごっそり取れるブラシ'));
  assert.ok(SEARCH_QA_CANARY_QUERIES.some((f) => f.id === 'bottom_removable_bottle' && f.query === '底開口 水筒'));
  const bottle = SEARCH_QA_CANARY_QUERIES.find((f) => f.id === 'bottom_removable_bottle');
  assert.match('＼ポイント10倍／【公式通販】sokomo（ソコモ）そこまで洗えるボトル 500ml', bottle.expect);
  assert.match('【そこまで洗えるボトル】ドウシシャ 水筒 底が取り外せる', bottle.expect);
  assert.doesNotMatch('moz マグボトル 500ml ステンレスボトル ハンドル付き', bottle.expect);
  assert.ok(SEARCH_QA_CANARY_QUERIES.some((f) => f.query === 'コアラマットレス'));
  assert.ok(SEARCH_QA_CANARY_QUERIES.some((f) => f.query === '自立する本革トートバッグ'));
  for (const fixture of SEARCH_QA_CANARY_QUERIES) {
    assert.match(fixture.id, /^[a-z0-9_]{3,40}$/u);
    assert.ok(fixture.expect instanceof RegExp);
  }
});

test('判定: 期待一致・除外なし・必須5モールのリンクが揃えば PASS、欠けると FAIL', () => {
  const tote = SEARCH_QA_CANARY_QUERIES.find((f) => f.id === 'standing_leather_tote');
  const pass = evaluateSearchQaResult(tote, { ok: true, result: {
    candidates: [{ product_name: '本革 自立 トートバッグ A4', offers: [{ marketplace: 'RAKUTEN_JP' }] }],
    marketplace_search_links: links(ALL)
  } }, 1234);
  assert.equal(pass.pass, true);
  assert.equal(pass.code, 'C1_E1_R0_H2_L5_T1234');
  assert.equal(pass.top_marketplace, 'RAKUTEN_JP');
  assert.deepEqual(pass.missing_malls, []);
  const wrongCategory = evaluateSearchQaResult(tote, { ok: true, result: {
    candidates: [{ product_name: '本革 長財布 メンズ' }],
    marketplace_search_links: links(ALL)
  } }, 900);
  assert.equal(wrongCategory.pass, false);
  assert.match(wrongCategory.code, /^C1_E0_R1_H0_L5_/u);
  const hiddenMalls = evaluateSearchQaResult(tote, { ok: true, result: {
    candidates: [{ product_name: '本革 トートバッグ' }],
    marketplace_search_links: links(['RAKUTEN_JP', 'YAHOO_JP'])
  } }, 900);
  assert.equal(hiddenMalls.pass, false);
  assert.deepEqual(hiddenMalls.missing_malls, ['AMAZON_JP', 'QOO10_JP', 'SHEIN_JP']);
  // 2026-09-03 初回カナリアの実例: 期待語には一致するが商品が別物 → FAIL
  const koala = SEARCH_QA_CANARY_QUERIES.find((f) => f.id === 'koala_mattress');
  const tshirt = evaluateSearchQaResult(koala, { ok: true, result: {
    candidates: [{ product_name: 'コアラ Tシャツ アニマル（ コアラ ファン ） マットレス マーチ' }],
    marketplace_search_links: links(ALL)
  } }, 900);
  assert.equal(tshirt.pass, false);
  const lip = SEARCH_QA_CANARY_QUERIES.find((f) => f.id === 'korean_pink_lip');
  const clip = evaluateSearchQaResult(lip, { ok: true, result: {
    candidates: [{ product_name: '【即納】 94601-13000 ホンダ純正 ピストンピンクリップ JP店' }],
    marketplace_search_links: links(ALL)
  } }, 900);
  assert.equal(clip.pass, false);
  assert.match(clip.code, /_H0_/u);
  // 2026-09-03 2回目の実例: 本命が正しく、2件目が2wayショルダーでも落とさない
  const twoWay = evaluateSearchQaResult(tote, { ok: true, result: {
    candidates: [{ product_name: 'ミニトートバッグ レディース 革 レザー 手提げバッグ' }, { product_name: '本革 トートバッグ 2way ショルダー' }, { product_name: '長財布' }],
    marketplace_search_links: links(ALL)
  } }, 900);
  assert.equal(twoWay.pass, true);
  const ladle = SEARCH_QA_CANARY_QUERIES.find((f) => f.id === 'shein_one_piece');
  const otama = evaluateSearchQaResult(ladle, { ok: true, result: {
    candidates: [{ product_name: 'パール金属 Easy Fit ワンピース お玉 大 G-3131' }],
    marketplace_search_links: links(ALL)
  } }, 900);
  assert.equal(otama.pass, false);
  assert.match(otama.code, /^C1_E1_R1_H0_/u);
  const failed = evaluateSearchQaResult(tote, { ok: false, error: 'SEARCH_FAILED' }, 50);
  assert.equal(failed.pass, false);
  assert.equal(failed.code, 'C0_E0_R0_H0_L0_T50');
});

test('実行は1日1回・QA記録のみ・Turnstile内部迂回のリクエストを検索ハンドラへ渡す', async () => {
  const rows = [];
  const requests = [];
  let existing = 0;
  const env = { PRODUCT_DB: { prepare(sql) { return { bind(...values) { return {
    first: async () => ({ n: existing }),
    run: async () => { rows.push({ sql, values }); return { meta: { changes: 1 } }; }
  }; } }; } } };
  const handler = async (request) => {
    const body = await request.json();
    requests.push({ url: request.url, body });
    return Response.json({ ok: true, result: {
      candidates: [{ product_name: body.query.includes('コアラ') ? 'コアラマットレス オリジナル' : 'エマ・マットレス ハイブリッド', offers: [{ marketplace: 'YAHOO_JP' }] }],
      marketplace_search_links: links(ALL)
    } });
  };
  const outcome = await runSearchQaCanary(env, new Date('2026-09-03T22:22:00Z'), handler,
    { fixtures: SEARCH_QA_CANARY_QUERIES.slice(0, 2), pauseMs: 0 });
  assert.equal(outcome.total, 2);
  assert.equal(outcome.passed, 2);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'https://hoshilu.app/api/knowledge');
  assert.equal(requests[0].body.medium, 'qa');
  assert.equal(requests[0].body.turnstile_token, 'internal-qa-canary');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].values[0], 'search-qa:2026-09-03:ig_mattress');
  assert.equal(rows[0].values[1], 'search_qa_result');
  assert.doesNotMatch(String(rows[0].values[4]), /Instagramで見た/u, 'クエリ文そのものは content に残さない');
  existing = 1;
  const again = await runSearchQaCanary(env, new Date('2026-09-03T22:37:00Z'), handler, { pauseMs: 0 });
  assert.equal(again.skipped, true);
  assert.equal(again.reason, 'ALREADY_RAN_TODAY');
  // 2026-09-03 3回目: 候補ゼロ(モールAPIの429等)は1回だけやり直し、2回目の結果を採る
  existing = 0;
  let calls = 0;
  const flaky = async () => {
    calls += 1;
    return Response.json({ ok: true, result: {
      candidates: calls === 1 ? [] : [{ product_name: 'コアラマットレス オリジナル', offers: [{ marketplace: 'RAKUTEN_JP' }] }],
      marketplace_search_links: links(ALL)
    } });
  };
  const retried = await runSearchQaCanary(env, new Date('2026-09-04T22:22:00Z'), flaky,
    { fixtures: SEARCH_QA_CANARY_QUERIES.filter((f) => f.id === 'koala_mattress'), pauseMs: 0 });
  assert.equal(calls, 2);
  assert.equal(retried.passed, 1);
  assert.equal(searchQaCanaryDue(new Date('2026-09-03T22:22:00Z')), true);
  assert.equal(searchQaCanaryDue(new Date('2026-09-03T22:37:00Z')), false);
});

test('公開の /api/knowledge は常にTurnstileを検証し、内部迂回は cron と管理者ルートだけ', () => {
  const source = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.match(source, /url\.pathname === '\/api\/knowledge'\) return handleKnowledgeApi\(request, env, ctx\);/u);
  assert.match(source, /if \(options\.internalQa !== true\) \{\s*await verifyTurnstile\(/u);
  assert.equal((source.match(/\{ internalQa: true \}/g) || []).length, 2);
  assert.match(source, /url\.pathname === '\/api\/internal\/search\/qa-canary'\) \{\s*if \(!await authorizeAdminRequest\(request, env\)\)/u);
  assert.match(source, /if \(searchQaCanaryDue\(scheduledAt\)\)/u);
});
