import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('const continuousSearchCopy='),app.indexOf('// 検索完了時、結果セクション'));
function setup(member,save){
  const events=[];
  class Element{
    constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.listeners={};this.classList={remove(){}};}
    append(...nodes){this.children.push(...nodes);}
    setAttribute(name,value){this[name]=value;}
    addEventListener(name,handler){this.listeners[name]=handler;}
    showModal(){this.open=true;}
    close(){this.open=false;this.listeners.close?.();}
    remove(){this.removed=true;}
  }
  const document={body:new Element('body'),createElement:tag=>new Element(tag),dispatchEvent:e=>events.push(e)};
  const context=vm.createContext({document,memberSession:member?{}:null,elements:{language:{value:'JA'}},getWishes:()=>[],insightEnabledFor:()=>false,
    textElement:(tag,cls,text)=>Object.assign(new Element(tag),{className:cls,textContent:text}),saveInsightWatch:save,
    wishSavedCopy:()=> 'この端末に条件を保存しました（登録後、通知を明示的に有効化できます）',wishSaveFailedCopy:()=> '通知設定に失敗しました',
    CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}});
  vm.runInContext(source,context);
  const card=vm.runInContext("continuousSearchCard('テスト条件')",context);
  return {document,events,button:card.children[2].children[0]};
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
test('guest success explicitly says local saving and offers signup',async()=>{
  const {document,button}=setup(false,async()=>true);await button.listeners.click();
  const panel=document.body.children[0].children[0];
  assert.match(panel.children[1].textContent,/この端末/);
  assert.match(panel.children.find(e=>e.tag==='a').href,/login.html/);
  assert.equal(button.disabled,false);
});
test('failed server save and storage exceptions never show a success popup',async()=>{
  for(const [save,localSavedEvents] of [[async()=>false,1],[async()=>{throw new Error('storage unavailable');},0]]){
    const {document,events,button}=setup(true,save);await button.listeners.click();
    assert.equal(document.body.children[0].children[0].children[0].textContent,'保存を確認できませんでした');
    // The existing event measures local saving, not notification activation.
    assert.equal(events.length,localSavedEvents);assert.equal(button.disabled,false);
  }
});
