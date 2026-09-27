// Read-only, aggregate-only release evidence. Never exports customer IDs, contacts,
// payment methods, consent bodies, Worker secrets, or entire Worker settings/source.
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCloudflareReadOnlyD1} from './read-codex-kpi-snapshot.mjs';
import {AUTO_RENEW_OFFER,AUTO_RENEW_TERMS} from '../public/seller-trial-policy.mjs';
const accountId=process.env.CLOUDFLARE_ACCOUNT_ID,apiToken=process.env.CLOUDFLARE_API_TOKEN;
const db=createCloudflareReadOnlyD1({accountId,apiToken});
async function query(sql) {
 try{return {verified:true,rows:(await db.prepare(sql).all()).results};}
 catch(error){return {verified:false,error:/^CODEX_KPI_[A-Z0-9_]+$/u.test(error.message)?error.message:'READ_UNAVAILABLE'};}
}
async function workerGet(suffix,raw=false) {
 const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/project-gate-line-bridge${suffix}`,{headers:{authorization:`Bearer ${apiToken}`},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error(`WORKER_READ_HTTP_${response.status}`);
 return raw?response.text():(await response.json()).result;
}
const result={checked_at:new Date().toISOString(),source_commit:process.env.GITHUB_SHA||null,read_only:true,stripe_verified:false};
result.applied_migrations=await query('SELECT name FROM d1_migrations ORDER BY name');
const local=(await readdir(new URL('../migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort();
result.pending_migrations=result.applied_migrations.verified?local.filter(n=>!result.applied_migrations.rows.some(r=>r.name===n)):null;
result.legacy_accounts=await query("SELECT plan,status,subscription_status,CASE WHEN stripe_subscription_id<>'' THEN 1 ELSE 0 END AS has_subscription,CASE WHEN trial_end_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 1 ELSE 0 END AS in_trial,COUNT(*) AS count FROM seller_billing_accounts GROUP BY 1,2,3,4,5");
result.pilot_contracts=await query("SELECT json_extract(document_json,'$.offer_version') AS offer,json_extract(document_json,'$.autorenew.terms') AS terms,json_extract(document_json,'$.autorenew.contract.amount') AS agreed_amount,json_extract(document_json,'$.autorenew.status') AS subscription_status,coalesce(json_extract(document_json,'$.test'),0) AS internal_test,CASE WHEN json_extract(document_json,'$.autorenew.cancel_requested_at') IS NOT NULL THEN 1 ELSE 0 END AS cancel_requested,COUNT(*) AS count FROM seller_listing_pilots GROUP BY 1,2,3,4,5,6");
result.recent_yahoo_canary=await query("SELECT occurred_at,content FROM growth_events WHERE event_type='deep_canary_result' AND source='worker' AND traffic_class='QA' AND marketplace='YAHOO' ORDER BY occurred_at DESC LIMIT 3");
try{
 const settings=await workerGet('/settings');
 const permitted=new Set(['SELLER_MANUAL_PILOT_ENABLED','SELLER_PILOT_OFFER_VERSION','SELLER_PILOT_RECRUITMENT_VERIFIED','SELLER_PILOT_AUTORENEW_ENABLED','SELLER_PILOT_PAYMENTS_ENABLED','SELLER_PILOT_PAYMENT_MODE','SELLER_PILOT_PRICE_ID','SELLER_PILOT_1980_TEST_PRICE_ID','SELLER_PILOT_1980_TEST_PRODUCT_ID','SELLER_PILOT_1980_LIVE_PRICE_ID','SELLER_PILOT_1980_LIVE_PRODUCT_ID']);
 result.seller_configuration=Object.fromEntries((settings.bindings||[]).filter(b=>b.type==='plain_text'&&permitted.has(b.name)).map(b=>[b.name,b.text]));
 result.seller_configuration_verified=true;
}catch(error){result.seller_configuration_verified=false;}
try {
 const source=await workerGet('',true);
 const expected=process.env.SELLER_VERIFY_BUNDLE_PATH?await readFile(process.env.SELLER_VERIFY_BUNDLE_PATH,'utf8'):null;
 result.production_source={verified:true,matches_built_bundle:expected?source.includes(expected.trim()):null,built_bundle_sha256:expected?createHash('sha256').update(expected).digest('hex'):null,sha256:createHash('sha256').update(source).digest('hex'),contains_new_offer:source.includes(AUTO_RENEW_OFFER),contains_new_terms:source.includes(AUTO_RENEW_TERMS),preserves_old_offer:source.includes('external-seller-30d-autorenew-v1')};
}catch(error){result.production_source={verified:false};}
await writeFile('seller-1980-production-audit.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(result,null,2));
if(process.env.SELLER_VERIFY_BUNDLE_PATH&&result.production_source.matches_built_bundle!==true)process.exitCode=1;
