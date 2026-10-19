import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { growthMarketplace } from '../public/growth-marketplaces.mjs';

function browser(visibility = 'visible') {
  const listeners = new Map(), timers = new Map(), events = [];
  let timerId = 0;
  const add = (name, fn) => listeners.set(name, [...(listeners.get(name) || []), fn]);
  const remove = (name, fn) => listeners.set(name, (listeners.get(name) || []).filter(f => f !== fn));
  const dispatch = event => { for (const fn of [...(listeners.get(event.type) || [])]) fn(event); };
  const storage = () => { const m = new Map(); return {getItem:k=>m.get(k) ?? null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}; };
  class Element {}
  const document = { visibilityState:visibility, documentElement:{lang:'ja'}, referrer:'',
    addEventListener:add, removeEventListener:remove, dispatchEvent:dispatch, querySelectorAll:()=>[] };
  const context = { document, location:{origin:'https://hoshilu.app',hostname:'hoshilu.app',pathname:'/',search:''},
    URL, URLSearchParams, Blob, Element, navigator:{}, localStorage:storage(),sessionStorage:storage(),
    growthMarketplace, growthSessionId:()=> 'local-session', growthVisitorId:()=> 'local-visitor',
    addEventListener:add,removeEventListener:remove,
    setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
    CustomEvent:class { constructor(type, init={}) {this.type=type;Object.assign(this,init);} },
    fetch:async (url,init)=>{if(url==='/api/events') events.push(JSON.parse(init.body));return {ok:true,status:202};}
  };
  context.window = context;
  const source = readFileSync(new URL('../public/growth-analytics.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gmu,'');
  runInNewContext(source, context);
  return {context,document,timers,events,dispatch,Element};
}

test('browser analytics survives startup, records one visible visit and a unified card purchase click once', () => {
  const b=browser();
  assert.equal(b.events.length,0);
  for(const [id,t] of [...b.timers]) if(t.ms===1500){b.timers.delete(id);t.fn();}
  b.dispatch({type:'pointerdown'});
  assert.equal(b.events.filter(e=>e.event_type==='landing_view').length,1);
  const link=new b.Element();
  Object.assign(link,{tagName:'A',dataset:{marketplace:'RAKUTEN_JP'},textContent:'fixed public sample',
    classList:{contains:c=>c==='unified-card-link'},
    closest:s=>s==='a,button'?link:null,
    matches:s=>s.includes('.unified-card-link')});
  b.dispatch({type:'click',target:link});
  const clicks=b.events.filter(e=>e.event_type==='marketplace_click');
  assert.equal(clicks.length,1);
  assert.equal(clicks[0].marketplace,'RAKUTEN_JP');
  assert.equal(b.events.filter(e=>e.event_type==='ai_result_clicked').length,1);
  assert.doesNotMatch(JSON.stringify(b.events),/fixed public sample|query|href/);
});

test('a hidden preload does not become a visit; a later visible interaction still records it', () => {
  const b=browser('hidden');
  assert.equal([...b.timers.values()].filter(t=>t.ms===1500).length,0);
  b.document.visibilityState='visible';b.dispatch({type:'visibilitychange'});
  b.dispatch({type:'wheel'});b.dispatch({type:'wheel'});
  assert.equal(b.events.filter(e=>e.event_type==='landing_view').length,1);
});

test('watch entry and notification revisit reach mall click without leaking product or notification details', () => {
  const b = browser();
  const button = (selector) => {
    const element = new b.Element();
    Object.assign(element, { tagName: 'BUTTON', dataset: {}, classList: { contains: () => false },
      closest: (value) => value === selector ? element : null, matches: () => false });
    return element;
  };
  b.dispatch({ type: 'click', target: button('.watch-settings-button') });
  b.dispatch({ type: 'click', target: button('.watch-save-button') });
  b.dispatch({ type: 'notification-destination-opened', detail: {
    marketplace: 'RAKUTEN_JP', notification_id: 'private-fixture', product_name: 'private-product-fixture'
  } });
  assert.deepEqual(b.events.map((event) => event.event_type), [
    'target_price_watch_started', 'target_price_watch_save_clicked', 'notification_opened', 'marketplace_click'
  ]);
  assert.equal(b.events.at(-1).marketplace, 'RAKUTEN_JP');
  assert.doesNotMatch(JSON.stringify(b.events), /private-fixture|private-product-fixture|notification_id|product_name/u);
  assert.equal(b.events.some((event) => event.event_type === 'target_price_watch_set'), false, 'completion belongs to server, not button click');
});
