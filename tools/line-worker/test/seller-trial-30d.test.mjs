import test from 'node:test';
import assert from 'node:assert/strict';
import {trialEnd,PILOT_OFFER,LEGACY_PILOT_OFFER,DAY_MS,jstDateTime,followupTasks} from '../public/seller-trial-policy.mjs';
import {transitionPilot,pilotEntitlement,acquisitionComplete,publicPilotOffer} from '../src/seller-listing-pilot.mjs';
const draft=()=>({status:'DRAFT',offer_version:PILOT_OFFER,products:[{id:'1'}]});
const approve=doc=>transitionPilot(doc,'APPROVE',{offer_version:doc.offer_version,publication_consent:true},{actor:'OWNER',offerEnabled:true,now:new Date('2026-01-31T15:00:00Z')});
const publish=(doc,now='2026-01-31T15:00:00Z')=>transitionPilot(doc,'PUBLISH',{}, {actor:'ADMIN',offerEnabled:true,now:new Date(now)});
test('30x24h across leap day/year/month end, UTC storage and JST display',()=>{
 for(const at of ['2026-01-31T15:00:00Z','2027-12-31T23:59:59Z','2028-02-29T14:59:59Z']) assert.equal(Date.parse(trialEnd(at,PILOT_OFFER))-Date.parse(at),30*DAY_MS);
 assert.equal(jstDateTime('2026-01-31T15:00:00Z'),'2026/02/01 00:00:00 JST');
 assert.equal(trialEnd('2026-01-31T03:30:00Z',LEGACY_PILOT_OFFER),'2026-04-30T03:30:00.000Z');
});
test('only publication starts trial, first product independent of acquisition, exact end exclusive',()=>{
 const a=approve(draft());assert.equal(a.starts_at,undefined);assert.ok(a.terms_accepted_at);
 const d=publish(a);assert.equal(d.ends_at,'2026-03-02T15:00:00.000Z');
 assert.equal(pilotEntitlement(d,new Date(Date.parse(d.starts_at)-1)).active,false);
 assert.equal(pilotEntitlement(d,new Date(Date.parse(d.ends_at)-1)).active,true);
 assert.equal(pilotEntitlement(d,new Date(d.ends_at)).active,false);
 assert.equal(acquisitionComplete({...d,external_verified:true,owner_confirmed_at:d.starts_at},new Date(d.starts_at)),false);
 assert.equal(d.payment_method,undefined);assert.equal(pilotEntitlement({...d,payment_method:'other-use-card'},new Date(d.ends_at)).billing_status,'NO_PAID_CONTRACT');
});
test('duplicate, unpublish/republish preserve immutable start/end; expired cannot restart',()=>{
 const d=publish(approve(draft()));assert.strictEqual(publish(d,'2026-02-02T00:00:00Z'),d);
 const hidden=transitionPilot(d,'UNPUBLISH',{}, {actor:'OWNER'});
 const again=publish(hidden,'2026-02-02T00:00:00Z');assert.equal(again.starts_at,d.starts_at);assert.equal(again.ends_at,d.ends_at);
 assert.throws(()=>publish(hidden,d.ends_at),/TRIAL_EXPIRED/);
});
test('legacy agreed offer survives new default; unknown old drafts cannot silently convert',()=>{
 const old=approve({...draft(),offer_version:LEGACY_PILOT_OFFER});const d=publish(old,'2026-01-31T03:30:00Z');assert.equal(d.ends_at,'2026-04-30T03:30:00.000Z');
 assert.throws(()=>approve({...draft(),offer_version:undefined}),/CONDITIONS/);
});
test('7/21/30 day manual followups are due once, missing data is not zero; no automatic sending',()=>{
 const d=publish(approve(draft()));assert.equal(followupTasks(d,new Date(d.starts_at))[0].status,'UPCOMING');
 const now=new Date(Date.parse(d.starts_at)+7*DAY_MS);
 const input={day:7,evidence_ref:'restricted-record-7',operator:'assigned-operator',measurement_status:'UNAVAILABLE'};
 assert.throws(()=>transitionPilot(d,'FOLLOWUP',{...input,day:21},{actor:'ADMIN',now}),/NOT_DUE/);
 const done=transitionPilot(d,'FOLLOWUP',input,{actor:'ADMIN',now});
 assert.strictEqual(transitionPilot(done,'FOLLOWUP',input,{actor:'ADMIN',now}),done);
 assert.equal(followupTasks(done,now)[0].record.measurement_status,'UNAVAILABLE');assert.equal(followupTasks({...d,test:true},now).length,0);
});
test('continuation interest cannot start a paid contract or shorten trial',()=>{
 const d=publish(approve(draft()));const n=transitionPilot(d,'CONTINUE_INTEREST',{continuation_interest:true},{actor:'OWNER'});
 assert.equal(n.ends_at,d.ends_at);assert.equal(n.paid_opt_in_at,undefined);assert.equal(pilotEntitlement(n).automatic_charge,false);
 assert.strictEqual(transitionPilot(n,'CONTINUE_INTEREST',{continuation_interest:true},{actor:'OWNER'}),n);
});
test('LP offer stays hidden until same version is enabled and verified',()=>{
 const env={SELLER_MANUAL_PILOT_ENABLED:'true',SELLER_PILOT_OFFER_VERSION:PILOT_OFFER};
 assert.equal(publicPilotOffer(env).enabled,false);
 assert.equal(publicPilotOffer({...env,SELLER_PILOT_RECRUITMENT_VERIFIED:LEGACY_PILOT_OFFER}).enabled,false);
 assert.equal(publicPilotOffer({...env,SELLER_PILOT_RECRUITMENT_VERIFIED:PILOT_OFFER}).enabled,true);
});
