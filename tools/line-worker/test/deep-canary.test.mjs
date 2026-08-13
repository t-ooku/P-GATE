import test from 'node:test';
import assert from 'node:assert/strict';
import { deepCanaryTest, runDeepCanaryCycle } from '../src/deep-canary.mjs';
import { normalizeGrowthEvent } from '../src/growth-events.mjs';

function environment(rows, spend = 0) {
  return {
    GEMINI_API_KEY:'g'.repeat(32), OPENAI_API_KEY:'o'.repeat(32),
    RAKUTEN_APPLICATION_ID:'app', RAKUTEN_ACCESS_KEY:'access',
    YAHOO_SHOPPING_CLIENT_ID:'yahoo',
    PRODUCT_DB:{ prepare(sql) { return {
      bind(...values) { return {
        async first() { return { estimated_micro_usd:spend }; },
        async all() { return { results:[...new Set(rows.map((row)=>row.values?.[2]).filter(Boolean))].map((component)=>({component})) }; },
        async run() { rows.push({ sql, values }); return { meta:{ changes:1 } }; }
      }; }
    }; } }
  };
}

function providerFetch(url, options = {}) {
  const target = String(url);
  if (target.includes('generativelanguage.googleapis.com')) return Response.json({ candidates:[{ content:{ parts:[{ text:JSON.stringify({ needs_clarification:false, refined_query:'軽い ワイヤレスイヤホン' }) }] } }] });
  if (target.includes('api.openai.com')) return Response.json({ output:[{ type:'message', content:[{ type:'output_text', text:JSON.stringify({ needs_clarification:false, refined_query:'軽い ワイヤレスイヤホン' }) }] }] });
  if (target.includes('openapi.rakuten.co.jp')) return Response.json({ items:[{ itemName:'イヤホン',itemCode:'shop:item',itemPrice:1000,itemUrl:'https://item.rakuten.co.jp/shop/item/' }] });
  if (target.includes('shopping.yahooapis.jp')) return Response.json({ hits:[{ name:'イヤホン',code:'shop_item',price:1000,url:'https://store.shopping.yahoo.co.jp/shop/item.html' }] });
  throw new Error(`UNEXPECTED_${new URL(target).hostname}`);
}

test('deep canary frequency is 15m/1h/6h without a public endpoint', () => {
  assert.deepEqual(deepCanaryTest.scheduledComponents(new Date('2026-08-13T01:15:00Z')), ['query_structurer','rakuten','yahoo']);
  assert.deepEqual(deepCanaryTest.scheduledComponents(new Date('2026-08-13T01:00:00Z')), ['query_structurer','rakuten','yahoo','ai_chat_primary']);
  assert.deepEqual(deepCanaryTest.scheduledComponents(new Date('2026-08-13T06:00:00Z')), ['query_structurer','rakuten','yahoo','ai_chat_primary','openai_backup']);
});

test('deep canary records only safe component/status/code metadata', async () => {
  const rows=[];
  const result=await runDeepCanaryCycle(environment(rows),new Date('2026-08-13T06:00:00Z'),providerFetch);
  assert.equal(result.results.every((row)=>row.status==='PASS'),true);
  assert.equal(rows.length,5);
  const stored=JSON.stringify(rows);
  assert.doesNotMatch(stored,/軽い|ワイヤレス|イヤホン|api-key|authorization|response/iu);
  assert.match(stored,/deep_canary_result/u);
});

test('monthly five-dollar fuse blocks paid probes before another charge', async () => {
  const rows=[];
  const result=await runDeepCanaryCycle(environment(rows,4_999_900),new Date('2026-08-13T06:00:00Z'),providerFetch);
  assert.equal(result.results.find((row)=>row.component==='query_structurer').code,'CANARY_MONTHLY_BUDGET_LIMIT');
  assert.equal(result.results.find((row)=>row.component==='rakuten').status,'PASS');
});

test('public growth endpoint cannot forge deep canary results', () => {
  assert.throws(() => normalizeGrowthEvent({ event_type:'deep_canary_result' }), /GROWTH_EVENT_INVALID/u);
});
