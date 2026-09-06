import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchInputAnalysisTest } from '../src/search-input-analysis.mjs';
import { identifyCandidateFromAnalysis } from '../src/identify-route.mjs';
import { sanitizeIdentifyPayload } from '../src/ai-identify-cache.mjs';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('AIが根拠にしたページを取り出す（httpsのみ・自社除外・重複なし・最大3件）', () => {
  const references = searchInputAnalysisTest.groundedReferenceUrls({
    candidates: [{ groundingMetadata: { groundingChunks: [
      { web: { uri: 'https://example.com/p/1', title: 'メーカー公式ページ' } },
      { web: { uri: 'https://hoshilu.app/ja/guides', title: '自社' } },
      { web: { uri: 'http://insecure.example.com/p', title: '非https' } },
      { web: { uri: 'https://example.com/p/1', title: '重複' } },
      { web: { uri: 'https://shop.example.jp/item/2', title: '' } },
      { web: { uri: 'https://a.example/3', title: 'a' } },
      { web: { uri: 'https://b.example/4', title: 'b' } }
    ] } }]
  });
  assert.equal(references.length, 3);
  assert.deepEqual(references[0], { title: 'メーカー公式ページ', url: 'https://example.com/p/1' });
  // タイトルが無ければドメインを出す（何のページか分かるように）。
  assert.equal(references[1].title, 'shop.example.jp');
  assert.equal(searchInputAnalysisTest.groundedReferenceUrls({}).length, 0);
});

test('参考ページは候補とキャッシュを通って画面まで運ばれる', () => {
  const candidate = identifyCandidateFromAnalysis({
    candidate_name: 'テスト商品',
    reference_urls: [{ title: '公式', url: 'https://example.com/x' }, { title: 'bad', url: 'ftp://example.com' }]
  });
  assert.deepEqual(candidate.reference_urls, [{ title: '公式', url: 'https://example.com/x' }]);
  const cached = sanitizeIdentifyPayload({ candidate_name: 'テスト商品', reference_urls: candidate.reference_urls });
  assert.deepEqual(cached.reference_urls, [{ title: '公式', url: 'https://example.com/x' }]);
});

test('参考ページはアフィリエイトを通さず、未確認だと明記する', () => {
  const app = read('public/app.js');
  // リンクは素のURL。トラッキング（/go?token=）にも rel=sponsored にもしない。
  assert.match(app, /link\.rel='noopener noreferrer nofollow'/u);
  assert.match(app, /class="?ai-candidate-reference-links|ai-candidate-reference-links/u);
  const block = app.slice(app.indexOf('const references=(Array.isArray(aiCandidate.reference_urls)'), app.indexOf('return card;}'));
  assert.doesNotMatch(block, /createTrackToken|\/go\?token=|sponsored/u);
  // 4言語すべてに「未確認・アフィリエイトなし」の断り書きがある。
  assert.equal((app.match(/referenceNote:/gu) || []).length, 4);
  assert.match(app, /HOSHILU未確認・アフィリエイトなし/u);
  assert.match(app, /not verified by HOSHILU, no affiliate links/u);
});
