import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  GROWTH_SESSION_ID_KEY,
  GROWTH_SESSION_TTL_MS,
  GROWTH_VISITOR_ID_KEY,
  growthSessionId,
  growthVisitorId
} from '../public/growth-identity.mjs';

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.get(key) ?? null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
}

const visitorA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sessionA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const sessionB = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

test('visitor IDはlocalStorageで再利用し、不正値は安全なIDへ置き換える', () => {
  const storage = new MemoryStorage();
  storage.setItem(GROWTH_VISITOR_ID_KEY, 'invalid');
  let creates = 0;
  const first = growthVisitorId({ storage, randomId: () => { creates += 1; return visitorA; } });
  const second = growthVisitorId({ storage, randomId: () => { creates += 1; return 'unused-unused-unused-unused'; } });
  assert.equal(first, visitorA);
  assert.equal(second, visitorA);
  assert.equal(creates, 1);
});

test('session IDは操作から30分間再利用し、期限到達時に更新する', () => {
  const storage = new MemoryStorage();
  let nowMs = 1_000;
  const ids = [sessionA, sessionB];
  const options = { storage, now: () => nowMs, randomId: () => ids.shift() };
  assert.equal(growthSessionId(options), sessionA);
  nowMs += GROWTH_SESSION_TTL_MS - 1;
  assert.equal(growthSessionId(options), sessionA);
  assert.deepEqual(JSON.parse(storage.getItem(GROWTH_SESSION_ID_KEY)), { id: sessionA, touched_at: nowMs });
  nowMs += GROWTH_SESSION_TTL_MS;
  assert.equal(growthSessionId(options), sessionB);
});

test('記事と検索画面は共通ID、Beacon拒否時fallback、SEO文脈の引継ぎを使う', async () => {
  const [growth, seo, worker] = await Promise.all([
    readFile(new URL('../public/growth-analytics.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../public/seo-article-analytics.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../public/service-worker.js', import.meta.url), 'utf8')
  ]);
  assert.match(growth, /from '\.\/growth-identity\.mjs'/);
  assert.match(seo, /from '\.\/growth-identity\.mjs'/);
  assert.doesNotMatch(seo, /hoshilu_seo_session_id/);
  assert.match(growth, /navigator\.sendBeacon\([\s\S]*?\) === true\) return/);
  assert.match(seo, /navigator\.sendBeacon\([\s\S]*?\) === true\) return/);
  assert.match(seo, /article_id: articleId, search_intent: searchIntent, content_kind: contentKind, created_at: Date\.now\(\)/);
  assert.match(seo, /contentKind === 'hub' \? 'seo_hub' : 'seo_article'/);
  assert.match(growth, /seoContext\.search_intent/);
  assert.match(growth, /seoContext\.content_kind === 'hub'/);
  for (const className of ['price-offer', 'product-primary-link', 'price-compare-link', 'price-compare-search-link']) {
    assert.match(growth, new RegExp(className));
  }
  assert.match(growth, /marketplace_fallback_click/);
  assert.match(growth, /BROWSER_EMERGENCY_FALLBACK/);
  assert.match(worker, /hoshilu-shell-v390/);
  assert.match(worker, /growth-identity\.mjs/);
});
