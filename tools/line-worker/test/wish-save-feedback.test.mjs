import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('const continuousSearchCopy='),app.indexOf('// 検索完了時、結果セクション'));
function setup(member,save){
  const events=[];
  class Element{
    constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.listeners={};this.style={};this.classList={remove(){}};}
    append(...nodes){this.children.push(...nodes);}
    setAttribute(name,value){this[name]=value;}
    addEventListener(name,handler){this.listeners[name]=handler;}
    showModal(){this.open=true;}
    close(){this.open=false;this.listeners.close?.();}
    remove(){this.removed=true;}
    // 2026-09-25: 未登録の保存後はカード内の登録欄へ scrollIntoView する（モーダルは出さない）。
    querySelector(selector){const cls=selector.replace(/^\./u,'');for(const child of this.children){if(child.className===cls)return child;const found=child.querySelector?.(selector);if(found)return found;}return null;}
    scrollIntoView(options){this.scrolledInto=options;}
  }
  const document={addEventListener(){},body:new Element('body'),createElement:tag=>new Element(tag),dispatchEvent:e=>events.push(e)};
  const context=vm.createContext({document,window:{matchMedia:()=>({matches:false}),setTimeout(){},innerHeight:800},memberSession:member?{}:null,elements:{language:{value:'JA'}},getWishes:()=>[],insightEnabledFor:()=>false,
    textElement:(tag,cls,text)=>Object.assign(new Element(tag),{className:cls,textContent:text}),saveInsightWatch:save,
    wishSavedCopy:()=> 'この端末に条件を保存しました（登録後、通知を明示的に有効化できます）',wishSaveFailedCopy:()=> '通知設定に失敗しました',
    createWatchQuickJoin:()=>Object.assign(new Element('div'),{className:'watch-quick-join'}),localStorage:{setItem(){},removeItem(){}},
    CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}});
  vm.runInContext(source,context);
  const card=vm.runInContext("continuousSearchCard('テスト条件')",context);
  return {document,events,button:card.children[2].children[0],card};
}
test('member success popup waits for saving, then can be dismissed',async()=>{
  let finish;const pending=new Promise(resolve=>{finish=resolve;});
  const {document,events,button}=setup(true,()=>pending);
  const click=button.listeners.click();
  assert.equal(document.body.children.length,0);assert.equal(events.length,0);
  finish(true);await click;
  const dialog=document.body.children[0],panel=dialog.children[0];
  assert.equal(panel.children[0].textContent,'保存しました');assert.equal(dialog.open,true);
  assert.equal(events.length,1);assert.equal(button.disabled,true);
  panel.children.at(-1).listeners.click();assert.equal(dialog.removed,true);
});
// 2026-09-15 指示書§6: 登録前はその場でメール6桁 or LINE の登録欄（createWatchQuickJoin）を出す。登録ページへは飛ばさない。
// 2026-09-25 D1 実測: 9/16〜9/24 に未登録の「無料でホシっとく」6回に対し、登録操作（LINE開始・メールコード要求）は0回。
// 「保存しました／OK」モーダルが登録欄の上に被さり OK で終わっていたので、未登録ではモーダルを出さず登録欄へ視線を移す。
test('guest success shows the inline signup (email code or LINE) in the card, without the saved popup',async()=>{
  const {document,button,card,events}=setup(false,async()=>true);await button.listeners.click();
  assert.equal(document.body.children.length,0,'未登録では保存モーダルを出さない');
  const join=card.children[2].children.find(e=>e.className==='watch-quick-join');
  assert.ok(join);
  assert.equal(join.scrolledInto?.block,'start');assert.equal(join.style.scrollMarginTop,'124px');assert.equal(join.scrolledInto?.behavior,'smooth');
  assert.equal(card.dataset.quickJoin,'shown');
  assert.equal(button.disabled,true);
  assert.equal(button.textContent,'この端末に保存しました');
  assert.equal(events.length,1,'continuous_search_saved の計測はそのまま');
  // 2回目に押しても登録欄は増えない
  await button.listeners.click();
  assert.equal(card.children[2].children.filter(e=>e.className==='watch-quick-join').length,1);
});
test('failed server save and storage exceptions never show a success popup',async()=>{
  for(const [save,localSavedEvents] of [[async()=>false,1],[async()=>{throw new Error('storage unavailable');},0]]){
    const {document,events,button}=setup(true,save);await button.listeners.click();
    assert.equal(document.body.children[0].children[0].children[0].textContent,'保存を確認できませんでした');
    // The existing event measures local saving, not notification activation.
    assert.equal(events.length,localSavedEvents);assert.equal(button.disabled,false);
  }
});
