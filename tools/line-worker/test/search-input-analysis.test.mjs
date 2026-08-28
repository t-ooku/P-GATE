import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeSearchInput, normalizeInlineSearchImage, normalizeSearchInputAnalysis,
  normalizeSocialPostUrl, searchInputAnalysisTest
} from '../src/search-input-analysis.mjs';

const JPEG = { mime_type: 'image/jpeg', data: '/9j/4AAQ' };
const ENV = { GEMINI_API_KEY: 'g'.repeat(32), GEMINI_PRODUCT_DISCOVERY_MODEL: 'gemini-test' };

test('公開SNS投稿URLだけを許可し追跡パラメータを除く', () => {
  assert.equal(
    normalizeSocialPostUrl('https://www.instagram.com/p/ABC123/?igsh=tracking#fragment'),
    'https://www.instagram.com/p/ABC123/'
  );
  assert.equal(
    normalizeSocialPostUrl('https://www.threads.com/@hoshilu/post/ABC123/?xmt=tracking'),
    'https://www.threads.com/@hoshilu/post/ABC123/'
  );
  assert.equal(normalizeSocialPostUrl('https://www.tiktok.com/t/ABC123/?share=x'), 'https://www.tiktok.com/t/ABC123/');
  assert.equal(normalizeSocialPostUrl('https://vm.tiktok.com/ABC123/?share=x'), 'https://vm.tiktok.com/ABC123/');
  assert.equal(
    normalizeSocialPostUrl('https://www.facebook.com/story.php?story_fbid=ABC123&id=9988&utm_source=x'),
    'https://www.facebook.com/story.php?story_fbid=ABC123&id=9988'
  );
  assert.equal(
    normalizeSocialPostUrl('https://www.facebook.com/watch/?v=ABC123&utm_source=x'),
    'https://www.facebook.com/watch/?v=ABC123'
  );
  assert.throws(() => normalizeSocialPostUrl('http://instagram.com/p/a'), /SOCIAL_URL_UNSUPPORTED/);
  assert.throws(() => normalizeSocialPostUrl('https://instagram.com.evil.example/p/a'), /SOCIAL_URL_UNSUPPORTED/);
  assert.throws(() => normalizeSocialPostUrl('https://user:pass@x.com/a/status/1'), /SOCIAL_URL_UNSUPPORTED/);
  assert.throws(() => normalizeSocialPostUrl('https://x.com/settings/security'), /SOCIAL_URL_UNSUPPORTED/);
  assert.throws(() => normalizeSocialPostUrl('https://x.com/settings/status/12345'), /SOCIAL_URL_UNSUPPORTED/);
  assert.throws(() => normalizeSocialPostUrl('https://instagram.com/accounts/password/reset/key/token/'), /SOCIAL_URL_UNSUPPORTED/);
  assert.throws(() => normalizeSocialPostUrl('https://studio.youtube.com/video/abcdef/edit'), /SOCIAL_URL_UNSUPPORTED/);
  assert.throws(() => normalizeSocialPostUrl('https://instagram.com:444/p/ABC123/'), /SOCIAL_URL_UNSUPPORTED/);
  assert.throws(() => normalizeSocialPostUrl('https://www.tiktok.com/login/reset/SECRET'), /SOCIAL_URL_UNSUPPORTED/);
  assert.throws(() => normalizeSocialPostUrl('https://www.tiktok.com/t/login/reset/SECRET'), /SOCIAL_URL_UNSUPPORTED/);
  assert.throws(() => normalizeSocialPostUrl('https://www.tiktok.com/ABC123'), /SOCIAL_URL_UNSUPPORTED/);
  assert.throws(() => normalizeSocialPostUrl('https://www.youtube.com/account?v=abc123'), /SOCIAL_URL_UNSUPPORTED/);
  assert.throws(() => normalizeSocialPostUrl('https://www.youtube.com/watch?v=abc123'), /SOCIAL_URL_UNSUPPORTED/);
  assert.throws(() => normalizeSocialPostUrl('https://youtu.be/abc123'), /SOCIAL_URL_UNSUPPORTED/);
  assert.throws(() => normalizeSocialPostUrl('https://www.facebook.com/login?story_fbid=ABC123'), /SOCIAL_URL_UNSUPPORTED/);
  assert.throws(() => normalizeSocialPostUrl('https://www.facebook.com/login/posts/ABCDE'), /SOCIAL_URL_UNSUPPORTED/);
  for (const namespace of [
    'ads', 'bookmarks', 'commerce', 'creatorstudio', 'developers', 'friends',
    'fundraisers', 'groups', 'legal', 'live', 'marketplace', 'memories',
    'photos', 'policies', 'saved', 'stories', 'terms'
  ]) {
    assert.throws(
      () => normalizeSocialPostUrl(`https://www.facebook.com/${namespace}/posts/ABCDE`),
      /SOCIAL_URL_UNSUPPORTED/,
      namespace
    );
  }
  assert.throws(() => normalizeSocialPostUrl('https://www.facebook.com/photos?v=ABC123'), /SOCIAL_URL_UNSUPPORTED/);
  for (const url of [
    'https://pin.it/AbCd/extra',
    'https://www.pinterest.com/pin/ABC123/extra',
    'https://www.facebook.com/share/r/ABCDE/extra/private',
    'https://www.facebook.com/reel/ABCDE/extra',
    'https://www.instagram.com/p/ABC123/extra'
  ]) assert.throws(() => normalizeSocialPostUrl(url), /SOCIAL_URL_UNSUPPORTED/, url);
});

test('画像は許可MIME・base64・実ファイル署名を照合する', () => {
  assert.deepEqual(normalizeInlineSearchImage(JPEG), { ...JPEG, byte_length: 6 });
  assert.throws(() => normalizeInlineSearchImage({ mime_type: 'image/gif', data: 'R0lGODlh' }), /SEARCH_IMAGE_TYPE_UNSUPPORTED/);
  assert.throws(() => normalizeInlineSearchImage({ mime_type: 'image/png', data: JPEG.data }), /SEARCH_IMAGE_SIGNATURE_INVALID/);
  assert.throws(() => normalizeInlineSearchImage({ mime_type: 'image/jpeg', data: 'not-base64!' }), /SEARCH_IMAGE_INVALID/);
});

test('AI出力のURL・価格・在庫断定を全表示フィールドから除く', () => {
  const value = normalizeSearchInputAnalysis({
    refined_query: '透明イヤホン https://shop.example ¥9,800 在庫あり',
    candidate_name: 'Sample Buds 9,800円',
    candidate_brand: 'Sample https://brand.example',
    candidate_reason: '販売中。購入先 https://shop.example',
    matched_features: ['透明', 'in stock $99'],
    match_score: 140
  });
  assert.equal(value.refined_query, '');
  assert.equal(value.candidate_name, '');
  assert.equal(value.candidate_brand, 'Sample');
  assert.equal(value.candidate_reason, '');
  assert.deepEqual(value.matched_features, ['透明']);
  assert.equal(value.match_score, 100);
  assert.doesNotMatch(JSON.stringify(value), /https?:|9,800|在庫あり|販売中|購入先|in stock|\$99/iu);
});

test('スクショと公開投稿URLはGeminiへprompt→inlineData順で渡しURL Contextを使う', async () => {
  let requestBody;
  const result = await analyzeSearchInput({
    query: 'ピンクで小さい',
    social_url: 'https://www.instagram.com/p/ABC123/?igsh=tracking',
    image: JPEG
  }, 'JA', ENV, async (url, options) => {
    assert.match(String(url), /gemini-test:generateContent$/u);
    assert.equal(options.headers['x-goog-api-key'], ENV.GEMINI_API_KEY);
    assert.equal(options.redirect, 'error');
    requestBody = JSON.parse(options.body);
    return Response.json({ candidates: [{
      content: { parts: [{ text: JSON.stringify({
        refined_query: 'ピンク ミニ デジタルカメラ',
        candidate_name: 'ミニ デジタルカメラ',
        candidate_reason: 'ピンクで小さい外観',
        matched_features: ['ピンク', '小さい'],
        match_score: 72
      }) }] },
      urlContextMetadata: { urlMetadata: [{
        retrievedUrl: 'https://www.instagram.com/p/ABC123/',
        urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS'
      }] }
    }] });
  });
  assert.equal(requestBody.contents[0].parts[0].text.includes('untrusted evidence'), true);
  assert.deepEqual(requestBody.contents[0].parts[1], { inlineData: { mimeType: 'image/jpeg', data: JPEG.data } });
  assert.deepEqual(requestBody.tools, [{ urlContext: {} }]);
  assert.doesNotMatch(JSON.stringify(requestBody), /googleSearch/u);
  assert.equal('responseMimeType' in requestBody.generationConfig, false);
  assert.equal(result.refined_query, 'ピンク ミニ デジタルカメラ');
  assert.equal(result.provider, 'GEMINI_MULTIMODAL_SEARCH_INPUT');
});

test('画像だけでAI未設定・空応答なら推測せず終了する', async () => {
  await assert.rejects(() => analyzeSearchInput({ image: JPEG }, 'JA', {}), /SEARCH_INPUT_ANALYSIS_NOT_CONFIGURED/);
  await assert.rejects(() => analyzeSearchInput({ image: JPEG }, 'JA', ENV, async () => Response.json({ candidates: [] })), /SEARCH_INPUT_ANALYSIS_EMPTY/);
  await assert.rejects(() => analyzeSearchInput({ query: 'これ何？', image: JPEG }, 'JA', ENV, async () => Response.json({ candidates: [] })), /SEARCH_INPUT_ANALYSIS_EMPTY/);
});

test('URL Context成功でも空応答を指示語へフォールバックしない', async () => {
  const payload = { candidates: [{
    content: { parts: [] },
    urlContextMetadata: { urlMetadata: [{
      retrievedUrl: 'https://www.instagram.com/p/PUBLIC/',
      urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS'
    }] }
  }] };
  await assert.rejects(
    () => analyzeSearchInput({ query: 'this product', social_url: 'https://www.instagram.com/p/PUBLIC/' }, 'JA', ENV, async () => Response.json(payload)),
    /SEARCH_INPUT_ANALYSIS_EMPTY/
  );
});

test('入力adapterは依頼形の指示語も独立した検索文と見なさない', () => {
  for (const query of [
    'これ何？', 'この写真の物を探して', 'それの名前', 'please find this',
    'what is this product?', 'can you find this', 'show me this',
    'これの名前を教えて', 'これは何の商品', 'この商品を教えて', 'この画像は何',
    'これ買いたい', 'これを特定して', '写真のこれ', 'what is this thing',
    'tell me what this is', 'find me this', 'I want this one', 'search for this',
    'look for this', 'this thing', '这个是什么', '帮我找这个', '이거 찾아줘', '이게 뭐야',
    'これの商品名', 'これどこで買える', 'where can I buy this', '이거 뭐예요', '이 제품', '이 상품'
    , 'what is this called', 'where is this sold', 'where can this be found',
    'これどこに売ってる', 'これどこで手に入る', 'これどこにある',
    '这个哪里可以买', '这个哪里有卖', '那件商品是什么', '这张图片里的商品',
    '이거 어디서 사요', '그거 어디서 사요', '그 상품 찾아줘', '이게 어디서 팔아요',
    '그 제품 찾아 주세요', '저 제품 찾아 주세요', '그 상품', '저 상품',
    '그 물건 뭐예요', '저 사진 상품명', '그 게시물의 제품', '그 이미지 제품'
  ]) assert.equal(searchInputAnalysisTest.isIndependentSearchText(query), false, query);
  for (const query of ['ピンクのこれ', 'AB-123のこれ', '24cmのこれ',
    'please find this pink bag', '这个粉色相机', '이거 핑크 카메라']) {
    assert.equal(searchInputAnalysisTest.isIndependentSearchText(query), true, query);
  }
});

test('provider通信・JSON例外は入力断片を外へ出さず固定コードへ変換する', async () => {
  const leaked = 'private OCR phrase https://private.example';
  for (const fetchImpl of [
    async () => { throw new Error(leaked); },
    async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError(leaked); } })
  ]) {
    await assert.rejects(
      () => analyzeSearchInput({ image: JPEG }, 'JA', ENV, fetchImpl),
      (error) => error?.message === 'SEARCH_INPUT_ANALYSIS_FAILED'
        && !String(error).includes('private OCR')
    );
  }
});

test('公開投稿URLだけ・指示語+URLはURL Contextで完全一致取得できなければ推測しない', async () => {
  const answer = { candidates: [{ content: { parts: [{ text: JSON.stringify({
    refined_query: '推測の商品名', candidate_name: '推測の商品名'
  }) }] } }] };
  await assert.rejects(
    () => analyzeSearchInput({ social_url: 'https://www.instagram.com/p/PRIVATE/' }, 'JA', ENV, async () => Response.json(answer)),
    /SEARCH_INPUT_ANALYSIS_NO_PUBLIC_EVIDENCE/
  );
  await assert.rejects(
    () => analyzeSearchInput({ query: 'これ', social_url: 'https://www.instagram.com/p/PRIVATE/' }, 'JA', ENV, async () => Response.json(answer)),
    /SEARCH_INPUT_ANALYSIS_NO_PUBLIC_EVIDENCE/
  );
  const failed = structuredClone(answer);
  failed.candidates[0].urlContextMetadata = { urlMetadata: [{
    retrievedUrl: 'https://www.instagram.com/p/PRIVATE/',
    urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_ERROR'
  }] };
  await assert.rejects(
    () => analyzeSearchInput({ social_url: 'https://www.instagram.com/p/PRIVATE/' }, 'JA', ENV, async () => Response.json(failed)),
    /SEARCH_INPUT_ANALYSIS_NO_PUBLIC_EVIDENCE/
  );
});

test('URL Contextの取得URLと投稿IDが完全一致した候補だけを採用する', async () => {
  const answer = { candidates: [{ content: { parts: [{ text: JSON.stringify({
    refined_query: '公開投稿の商品', candidate_name: '公開投稿の商品'
  }) }] } }] };
  const grounded = structuredClone(answer);
  grounded.candidates[0].urlContextMetadata = { urlMetadata: [{
    retrievedUrl: 'https://www.instagram.com/p/PUBLIC/',
    urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS'
  }] };
  const result = await analyzeSearchInput(
    { social_url: 'https://www.instagram.com/p/PUBLIC/' }, 'JA', ENV,
    async () => Response.json(grounded)
  );
  assert.equal(result.refined_query, '公開投稿の商品');

  for (const retrievedUrl of [
    'https://www.instagram.com/p/PUBLICITY/',
    'https://instagram.com.evil.example/p/PUBLIC/',
    'https://www.tiktok.com/t/PUBLIC/'
  ]) {
    const wrong = structuredClone(grounded);
    wrong.candidates[0].urlContextMetadata.urlMetadata[0].retrievedUrl = retrievedUrl;
    await assert.rejects(
      () => analyzeSearchInput({ social_url: 'https://www.instagram.com/p/PUBLIC/' }, 'JA', ENV, async () => Response.json(wrong)),
      /SEARCH_INPUT_ANALYSIS_NO_PUBLIC_EVIDENCE/
    );
  }
});

test('URL Contextの成功metadataと同じcandidate本文だけを採用する', async () => {
  const payload = { candidates: [
    {
      content: { parts: [{ text: '{"refined_query":"別投稿からの危険な推測"}' }] },
      urlContextMetadata: { urlMetadata: [{
        retrievedUrl: 'https://www.instagram.com/p/DIFFERENT/',
        urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS'
      }] }
    },
    {
      content: { parts: [{ text: '{"refined_query":"対象投稿の商品"}' }] },
      urlContextMetadata: { urlMetadata: [{
        retrievedUrl: 'https://www.instagram.com/p/PUBLIC/',
        urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS'
      }] }
    }
  ] };
  const result = await analyzeSearchInput(
    { social_url: 'https://www.instagram.com/p/PUBLIC/' }, 'JA', ENV,
    async () => Response.json(payload)
  );
  assert.equal(result.refined_query, '対象投稿の商品');
});

test('信頼済み短縮URLは同一candidate・同一SNSのcanonical redirectを許可する', async () => {
  const cases = [
    ['https://vm.tiktok.com/ShareCode/', 'https://www.tiktok.com/@creator/video/12345678'],
    ['https://www.tiktok.com/t/ShareCode/', 'https://www.tiktok.com/@creator/video/12345678'],
    ['https://pin.it/AbCd/', 'https://www.pinterest.com/pin/12345/'],
    ['https://www.facebook.com/share/r/ShareCode/', 'https://www.facebook.com/reel/12345/']
  ];
  for (const [target, retrievedUrl] of cases) {
    const payload = { candidates: [{
      content: { parts: [{ text: '{"refined_query":"短縮先の商品"}' }] },
      urlContextMetadata: { urlMetadata: [{
        retrievedUrl, urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS'
      }] }
    }] };
    const result = await analyzeSearchInput({ social_url: target }, 'JA', ENV, async () => Response.json(payload));
    assert.equal(result.refined_query, '短縮先の商品', target);
  }

  for (const urlMetadata of [
    [{
      retrievedUrl: 'https://www.pinterest.com/pin/12345/',
      urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS'
    }],
    [
      { retrievedUrl: 'https://www.tiktok.com/@creator/video/12345678', urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS' },
      { retrievedUrl: 'https://www.tiktok.com/@other/video/87654321', urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS' }
    ],
    [{
      retrievedUrl: 'https://vm.tiktok.com/OtherCode/',
      urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS'
    }]
  ]) {
    const payload = { candidates: [{
      content: { parts: [{ text: '{"refined_query":"誤った推測"}' }] },
      urlContextMetadata: { urlMetadata }
    }] };
    await assert.rejects(
      () => analyzeSearchInput({ social_url: 'https://vm.tiktok.com/ShareCode/' }, 'JA', ENV, async () => Response.json(payload)),
      /SEARCH_INPUT_ANALYSIS_NO_PUBLIC_EVIDENCE/
    );
  }
});

test('プラットフォーム名中の部分文字列を投稿IDの証拠として扱わない', async () => {
  const cases = [
    ['https://www.instagram.com/p/agram/', 'https://www.instagram.com/p/Instagram/'],
    ['https://www.tiktok.com/t/iktok/', 'https://www.tiktok.com/login'],
    ['https://www.threads.com/@hoshilu/post/reads/', 'https://www.threads.com/@hoshilu/post/Threads/'],
    ['https://www.facebook.com/reel/ebook/', 'https://www.facebook.com/reel/Facebook/'],
    ['https://www.pinterest.com/pin/erest/', 'https://www.pinterest.com/pin/Pinterest/']
  ];
  for (const [target, retrievedUrl] of cases) {
    const payload = { candidates: [{
      content: { parts: [{ text: '{"refined_query":"推測"}' }] },
      urlContextMetadata: { urlMetadata: [{
        retrievedUrl, urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS'
      }] }
    }] };
    await assert.rejects(
      () => analyzeSearchInput({ social_url: target }, 'JA', ENV, async () => Response.json(payload)),
      /SEARCH_INPUT_ANALYSIS_NO_PUBLIC_EVIDENCE/
    );
  }
});

test('意味のある文+未取得URLはAI推測を捨てて元の文へフォールバックする', async () => {
  const result = await analyzeSearchInput(
    { query: 'ピンクの小さいカメラ', social_url: 'https://www.instagram.com/p/PRIVATE/' },
    'JA', ENV,
    async () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      refined_query: 'URLだけから作った危険な推測', candidate_name: '危険な推測'
    }) }] } }] })
  );
  assert.equal(result.provider, 'GEMINI_MULTIMODAL_FALLBACK');
  assert.equal(result.refined_query, 'ピンクの小さいカメラ');
  assert.equal(result.candidate_name, '');
});

test('スクショ+未取得URLはURLを外して画像だけを再解析する', async () => {
  const bodies = [];
  const result = await analyzeSearchInput(
    { query: 'これ', social_url: 'https://www.instagram.com/p/PRIVATE/', image: JPEG },
    'JA', ENV,
    async (_url, options) => {
      const body = JSON.parse(options.body);
      bodies.push(body);
      if (bodies.length === 1) return Response.json({ candidates: [{ content: { parts: [{ text: '{"refined_query":"URL由来の推測"}' }] } }] });
      return Response.json({ candidates: [{ content: { parts: [{ text: '{"refined_query":"ピンク ミニカメラ"}' }] } }] });
    }
  );
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0].tools, [{ urlContext: {} }]);
  assert.equal('tools' in bodies[1], false);
  assert.match(bodies[1].contents[0].parts[0].text, /Public social-post URL: \(none\)/u);
  assert.deepEqual(bodies[1].contents[0].parts[1], { inlineData: { mimeType: 'image/jpeg', data: JPEG.data } });
  assert.equal(result.provider, 'GEMINI_MULTIMODAL_IMAGE_FALLBACK');
  assert.equal(result.refined_query, 'ピンク ミニカメラ');
});

test('スクショ+URL Context通信失敗もURLを外して画像だけを再解析する', async () => {
  const firstFailures = [
    () => { throw new Error('network detail must not escape'); },
    () => new Response('', { status: 503 }),
    () => new Response('not-json', { status: 200, headers: { 'content-type': 'application/json' } })
  ];
  for (const firstFailure of firstFailures) {
    const bodies = [];
    const result = await analyzeSearchInput(
      { query: 'これ', social_url: 'https://www.instagram.com/p/PUBLIC/', image: JPEG },
      'JA', ENV,
      async (_url, options) => {
        bodies.push(JSON.parse(options.body));
        if (bodies.length === 1) return firstFailure();
        return Response.json({ candidates: [{ content: { parts: [{
          text: '{"refined_query":"ピンク バッグ"}'
        }] } }] });
      }
    );
    assert.equal(bodies.length, 2);
    assert.deepEqual(bodies[0].tools, [{ urlContext: {} }]);
    assert.equal('tools' in bodies[1], false);
    assert.match(bodies[1].contents[0].parts[0].text, /Public social-post URL: \(none\)/u);
    assert.equal(result.provider, 'GEMINI_MULTIMODAL_IMAGE_FALLBACK');
    assert.equal(result.refined_query, 'ピンク バッグ');
  }
});

test('URL Context取得成功でも解析本文が使えなければ画像だけを再解析する', async () => {
  const unusableParts = [
    [],
    [{ text: 'not json' }],
    [{ text: '{"refined_query":"¥9,800 在庫あり"}' }]
  ];
  for (const parts of unusableParts) {
    const bodies = [];
    const result = await analyzeSearchInput(
      { query: 'これ', social_url: 'https://www.instagram.com/p/PUBLIC/', image: JPEG },
      'JA', ENV,
      async (_url, options) => {
        bodies.push(JSON.parse(options.body));
        if (bodies.length === 1) return Response.json({ candidates: [{
          content: { parts },
          urlContextMetadata: { urlMetadata: [{
            retrievedUrl: 'https://www.instagram.com/p/PUBLIC/',
            urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS'
          }] }
        }] });
        return Response.json({ candidates: [{ content: { parts: [{
          text: '{"refined_query":"透明 ミニバッグ"}'
        }] } }] });
      }
    );
    assert.equal(bodies.length, 2);
    assert.deepEqual(bodies[0].tools, [{ urlContext: {} }]);
    assert.equal('tools' in bodies[1], false);
    assert.equal(result.provider, 'GEMINI_MULTIMODAL_IMAGE_FALLBACK');
    assert.equal(result.refined_query, '透明 ミニバッグ');
  }
});

test('promptはAIとHOSHILUの責任境界を固定する', () => {
  const prompt = searchInputAnalysisTest.analysisPrompt('手掛かり', '', 'JA');
  assert.match(prompt, /only a hypothesis/iu);
  assert.match(prompt, /Never include a URL, price, stock status/iu);
  assert.match(prompt, /use URL Context only/iu);
  assert.doesNotMatch(prompt, /Google Search/iu);
  assert.match(prompt, /JSON only/iu);
});
