import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const indexPath = path.join(root, 'src', 'index.mjs');
const appPath = path.join(root, 'public', 'app.js');
const testPath = path.join(root, 'test', 'ai-search-v2-marketplace-links.test.mjs');

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, content) { fs.writeFileSync(file, content, 'utf8'); }
function replaceOnce(content, before, after, label) {
  const count = content.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return content.replace(before, after);
}

let index = read(indexPath);

const signedMarker = `async function signedMarketplaceSearchLinks(query, context) {`;
const helpers = `function preferredAiIntentKeywords(aiDiscovery, language = 'JA') {
  const analysis = aiDiscovery?.analysis || {};
  const languageKey = { JA: 'ja', EN: 'en', ZH: 'zh', KO: 'ko' }[language] || 'ja';
  const localized = analysis?.multilingual_keywords?.[languageKey] || [];
  const english = analysis?.multilingual_keywords?.en || [];
  const general = analysis?.search_keywords || [];
  return [...new Set([...localized, ...general, ...english]
    .map((value) => String(value || '').normalize('NFKC').trim())
    .filter(Boolean))].slice(0, 12);
}

function aiCandidateSearchQuery(candidate = {}, fallbackKeywords = [], originalQuery = '') {
  return [...new Set([
    candidate.name,
    candidate.brand && candidate.model ? \`${'${candidate.brand} ${candidate.model}'}\` : '',
    ...(Array.isArray(candidate.search_keywords) ? candidate.search_keywords : []),
    ...fallbackKeywords,
    originalQuery
  ].map((value) => String(value || '').normalize('NFKC').trim()).filter(Boolean))]
    .slice(0, 5).join(' ');
}

async function decorateAiIntentCandidates(aiDiscovery, language, originalQuery, context) {
  const analysis = aiDiscovery?.analysis;
  if (!analysis) return [];
  const fallbackKeywords = preferredAiIntentKeywords(aiDiscovery, language);
  const output = [];
  for (const candidate of (analysis.product_candidates || []).slice(0, 5)) {
    const query = aiCandidateSearchQuery(candidate, fallbackKeywords, originalQuery);
    const links = await signedMarketplaceSearchLinks(query, {
      ...context,
      seed: \`${'${context.seed}'}:AI:\${'${output.length + 1}'}\`
    });
    output.push({
      name: String(candidate.name || ''),
      brand: String(candidate.brand || ''),
      model: String(candidate.model || ''),
      match_score: Math.max(1, Math.min(100, Number(candidate.match_score || 0))),
      reason: String(candidate.reason || ''),
      matched_features: Array.isArray(candidate.matched_features) ? candidate.matched_features.slice(0, 8) : [],
      search_keywords: Array.isArray(candidate.search_keywords) ? candidate.search_keywords.slice(0, 8) : [],
      marketplace_search_links: links
    });
  }
  return output;
}

${signedMarker}`;
if (!index.includes('function preferredAiIntentKeywords(')) {
  index = replaceOnce(index, signedMarker, helpers, 'insert AI intent helpers');
}

const oldDecorateBlock = `  const marketplaceSearchLinks = await signedMarketplaceSearchLinks(query, {
    env, origin, sessionHash, seed, category: demandCategory,
    trafficClass: result.traffic_class || 'UNATTRIBUTED'
  });
  const amazonSearchUrl = marketplaceSearchLinks
    .find((link) => link.marketplace === 'AMAZON_JP')?.url || '';
  return {
    ...result,
    candidates,
    amazon_search_url: amazonSearchUrl,
    amazon_search_keywords: buildAmazonSearchKeywords(query),
    search_keywords: buildAmazonSearchKeywords(query),
    marketplace_search_links: marketplaceSearchLinks
  };`;
const newDecorateBlock = `  const aiKeywords = preferredAiIntentKeywords(result.ai_discovery, result.language || 'JA');
  const primarySearchQuery = aiKeywords[0] || query;
  const linkContext = {
    env, origin, sessionHash, seed, category: demandCategory,
    trafficClass: result.traffic_class || 'UNATTRIBUTED'
  };
  const marketplaceSearchLinks = await signedMarketplaceSearchLinks(primarySearchQuery, linkContext);
  const aiIntentCandidates = await decorateAiIntentCandidates(
    result.ai_discovery,
    result.language || 'JA',
    query,
    linkContext
  );
  const amazonSearchUrl = marketplaceSearchLinks
    .find((link) => link.marketplace === 'AMAZON_JP')?.url || '';
  return {
    ...result,
    candidates,
    ai_intent_candidates: aiIntentCandidates,
    amazon_search_url: amazonSearchUrl,
    amazon_search_keywords: buildAmazonSearchKeywords(primarySearchQuery),
    search_keywords: aiKeywords.length ? aiKeywords.join(' / ') : buildAmazonSearchKeywords(query),
    multilingual_search_keywords: result.ai_discovery?.analysis?.multilingual_keywords || null,
    marketplace_search_links: marketplaceSearchLinks
  };`;
if (!index.includes('ai_intent_candidates: aiIntentCandidates')) {
  index = replaceOnce(index, oldDecorateBlock, newDecorateBlock, 'decorate PWA result');
}

const oldResultBlock = `    result = {
      ...(result || {}),
      traffic_class: input.traffic_class,
      candidates: filterCategoryMismatches(input.query, result?.candidates || []).slice(0, 10)
    };`;
const newResultBlock = `    result = {
      ...(result || {}),
      language: input.language,
      traffic_class: input.traffic_class,
      candidates: filterCategoryMismatches(input.query, result?.candidates || []).slice(0, 10)
    };`;
if (!index.includes('language: input.language,')) {
  index = replaceOnce(index, oldResultBlock, newResultBlock, 'preserve response language');
}

write(indexPath, index);

let app = read(appPath);
const start = app.indexOf('function aiDiscoveryCard(result){');
const end = app.indexOf('function renderResults(result){', start);
if (start < 0 || end < 0) throw new Error('app.js: AI discovery renderer boundaries not found');
const replacement = `function aiDiscoveryCard(result){const intentItems=(result?.ai_intent_candidates||[]).slice(0,5);if(intentItems.length){const labels={JA:{badge:'AI INTENT',title:'AIが理解した商品候補',body:'曖昧な説明を商品候補と検索語に変換しました。候補ごとに各モールで探せます。score:'一致率'},EN:{badge:'AI INTENT',title:'Product candidates understood by AI',body:'Your description was converted into product candidates and marketplace search terms.',score:'Match'},ZH:{badge:'AI 意图',title:'AI理解的商品候选',body:'已将模糊描述转换为商品候选和商城搜索词。',score:'匹配度'},KO:{badge:'AI 의도',title:'AI가 이해한 상품 후보',body:'모호한 설명을 상품 후보와 쇼핑몰 검색어로 변환했습니다.',score:'일치도'}}[elements.language.value]||null;const card=document.createElement('article');card.className='ai-discovery-card ai-intent-card';card.append(textElement('span','ai-discovery-badge',labels.badge),textElement('h3','',labels.title),textElement('p','ai-discovery-notice',labels.body));const list=document.createElement('div');list.className='ai-discovery-list ai-intent-list';intentItems.forEach(item=>{const row=document.createElement('section');row.className='ai-discovery-item ai-intent-item';const name=[item.brand,item.name||item.model].filter(Boolean).join(' ').trim()||item.name;row.append(textElement('strong','',name),textElement('small','',\`${'${labels.score} ${Math.round(Number(item.match_score||0))}%'}\`));if(item.reason)row.append(textElement('p','',item.reason));if(item.matched_features?.length)row.append(textElement('div','evidence',item.matched_features.slice(0,5).join(' / ')));const links=marketplaceLinks(item.marketplace_search_links||[],true);if(links)row.append(links);list.append(row);});card.append(list);return card;}const items=(result?.ai_discovery?.candidates||[]).filter(item=>item?.url&&item?.image).slice(0,3);if(!items.length)return null;const labels={JA:['AIが見つけた可能性のある商品','公開Webから近い候補を探しました。商品ページで内容を確認してください。','候補ページを見る'],EN:['Possible products found by AI','AI searched the public web for close candidates. Verify the product page.','View candidate page'],ZH:['AI找到的可能商品','AI从公开网页中寻找了相近候选，请在商品页核实。','查看候选页面'],KO:['AI가 찾은 가능성 있는 상품','AI가 공개 웹에서 가까운 후보를 찾았습니다. 상품 페이지에서 확인하세요.','후보 페이지 보기']}[elements.language.value]||null;const card=document.createElement('article');card.className='ai-discovery-card';card.append(textElement('span','ai-discovery-badge','AI DISCOVERY'),textElement('h3','',labels[0]),textElement('p','ai-discovery-notice',labels[1]));const list=document.createElement('div');list.className='ai-discovery-list';items.forEach(item=>{const link=document.createElement('a');link.className='ai-discovery-item';link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';const image=document.createElement('img');image.src=item.image;image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';link.append(image,textElement('strong','',item.title),textElement('small','',item.source||''),textElement('span','',labels[2]));list.append(link);});card.append(list);return card;}`;
app = app.slice(0, start) + replacement + app.slice(end);
write(appPath, app);

const test = `import test from 'node:test';
import assert from 'node:assert/strict';
import cryptoModule from 'node:crypto';
import worker from '../src/index.mjs';

globalThis.crypto ??= cryptoModule.webcrypto;
globalThis.btoa ??= (value) => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ??= (value) => Buffer.from(value, 'base64').toString('binary');

const context={waitUntil(){}};
function env(){return{TURNSTILE_SECRET_KEY:'turnstile-secret',TURNSTILE_SITE_KEY:'site-key',GAS_BACKEND_URL:'https://gas.example.test/exec',GAS_BRIDGE_SECRET:'g'.repeat(32),LINK_SIGNING_SECRET:'l'.repeat(32),GEMINI_API_KEY:'x'.repeat(32),AMAZON_ASSOCIATE_TAG:'hoshilu-22',PRODUCT_DB:{prepare(){return{bind(){return{all:async()=>({results:[]})}}}}}};}
function request(language){return new Request('https://hoshilu.app/api/knowledge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:language==='KO'?'투명한 무선 이어폰':'韓国っぽい透明イヤホン',language,search_attempt:1,consent:true,session_id:'anonymous_session_123456',turnstile_token:'verified-token'})});}

test('AI Search v2 returns candidate-specific marketplace links and four-language keywords',async()=>{const originalFetch=globalThis.fetch;globalThis.fetch=async(url)=>{const target=String(url);if(target.includes('siteverify'))return Response.json({success:true});if(target.includes(':generateContent'))return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({category:'完全ワイヤレスイヤホン',intent_summary:'透明な完全ワイヤレスイヤホン',features:['透明','ワイヤレス'],product_candidates:[{name:'Nothing Ear',brand:'Nothing',match_score:95,reason:'透明デザインが一致',matched_features:['透明'],search_keywords:['Nothing Ear 透明']}],search_keywords:['透明 ワイヤレスイヤホン'],multilingual_keywords:{ja:['透明 ワイヤレスイヤホン'],en:['transparent earbuds'],zh:['透明 无线耳机'],ko:['투명 무선 이어폰']}})}]}}]});return Response.json({ok:true,result:{query_id:'q-ai-v2',candidates:[],message:''}});};try{const payload=await(await worker.fetch(request('KO'),env(),context)).json();assert.equal(payload.ok,true);assert.equal(payload.result.ai_discovery.provider,'GEMINI_PRODUCT_INTENT');assert.equal(payload.result.ai_intent_candidates.length,1);assert.equal(payload.result.ai_intent_candidates[0].name,'Nothing Ear');assert.equal(payload.result.ai_intent_candidates[0].marketplace_search_links.length>=5,true);assert.deepEqual(payload.result.multilingual_search_keywords.ko,['투명 무선 이어폰']);assert.match(payload.result.search_keywords,/투명 무선 이어폰/);}finally{globalThis.fetch=originalFetch;}});
`;
write(testPath, test);
console.log('AI Search v2 STEP2 patch applied.');
console.log('Updated:', path.relative(process.cwd(), indexPath));
console.log('Updated:', path.relative(process.cwd(), appPath));
console.log('Created:', path.relative(process.cwd(), testPath));
