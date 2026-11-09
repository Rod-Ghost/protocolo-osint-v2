/* Dynamic dashboard regression tests: no HTTP calls, no OSINT scans. */
'use strict';
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {webcrypto}=require('node:crypto');
const {summarize}=require('../apps/web/assets/case-dashboard-model.js');
const {createVault}=require('../apps/web/assets/vault.js');

const now=Date.parse('2026-11-09T12:00:00Z');
const cases=[
  {id:'case1',title:'Caso de laboratório',created_at:'2026-11-01T12:00:00Z',
   evidence:[{title:'Fonte A',created_at:'2026-11-08T12:00:00Z'}],
   search_plans:[
    {id:'p1',title:'Plano vencido',created_at:'2026-11-01T12:00:00Z',
     interval_days:7,reviews:[]},
    {id:'p2',title:'Plano revisado',created_at:'2026-11-01T12:00:00Z',
     updated_at:'2026-11-07T12:00:00Z',interval_days:7,
     reviews:[{observed_at:'2026-11-07T12:00:00Z',count:3}]}
   ]},
  {id:'case2',title:'Outro caso',created_at:'2026-11-09T09:00:00Z',
   evidence:[],search_plans:[]}
];
const result=summarize(cases,now);
assert.equal(result.caseCount,2);
assert.equal(result.evidenceCount,1);
assert.equal(result.planCount,2);
assert.equal(result.reviewedPlans,1);
assert.equal(result.reviewRate,50);
assert.equal(result.dueCount,1);
assert.equal(result.due[0].planId,'p1');
assert.equal(result.cases[0].id,'case2');
assert.equal(result.cases[1].pending,1);
assert.equal(result.scope,'local-browser-data');
assert.equal(result.externalRequests,0);
assert(result.events.some(e=>e.type==='evidence'));
assert(result.events.some(e=>e.type==='review'));
assert(result.events.some(e=>e.type==='plan'));
assert.equal(summarize([{id:'old',title:'Legado',evidence:[]}],now).planCount,0);
assert.equal(summarize(cases,Date.parse('2026-11-07T12:00:00Z')).dueCount,0);
assert.throws(()=>summarize({},now),TypeError);

// An emitted event contains NO case titles, search terms or plaintext details.
// It only allows the in-tab dashboard to refresh its encrypted-vault read model.
async function testEvent(){
  let encrypted=null;
  const storage={getItem:()=>encrypted,setItem:(_,value)=>{encrypted=value}};
  const events=[];
  const originalDispatch=globalThis.dispatchEvent,OriginalEvent=globalThis.Event;
  globalThis.Event=class Event{constructor(type){this.type=type}};
  globalThis.dispatchEvent=event=>{events.push(event);return true};
  try{
    const v=createVault(storage,webcrypto);
    await v.setup('Long and private test-only password');
    const c=await v.createCase('Sensitive test subject','Description private');
    await v.saveSearchPlan(c.id,{
      title:'Confidential query',query:'private.example.org',
      source_ids:['google'],interval_days:7
    });
    assert(encrypted&&!encrypted.includes('Confidential query'));
    assert(events.length>=3);
    assert(events.every(e=>e.type==='protocolo:vault-change'&&!('detail' in e)));
    v.lock();
    assert.equal(v.status().unlocked,false);
    assert(events.length>=4);
    await v.unlock('Long and private test-only password');
    assert.equal(v.status().unlocked,true);
    assert(events.length>=5);
  }finally{
    if(originalDispatch===undefined)delete globalThis.dispatchEvent;else globalThis.dispatchEvent=originalDispatch;
    if(OriginalEvent===undefined)delete globalThis.Event;else globalThis.Event=OriginalEvent;
  }
}
// Both deployed assets must be byte-for-byte identical, and the dashboard
// must be loaded by both entry points without third-party scripts.
for(const name of ['case-dashboard-model.js','dynamic-dashboard.js','dynamic-dashboard.css']){
  const a=readFileSync('apps/web/assets/'+name,'utf8');
  const b=readFileSync('public/assets/'+name,'utf8');
  assert.equal(a,b,name+' source/production drift');
}
for(const page of ['apps/web/index.html','public/index.html']){
  const html=readFileSync(page,'utf8');
  assert(html.includes('assets/dynamic-dashboard.js'));
  assert(html.includes('assets/case-dashboard-model.js'));
  assert(html.includes('assets/dynamic-dashboard.css'));
}
testEvent().then(()=>console.log('Dynamic dashboard: metrics, due-review and privacy events OK'))
  .catch(e=>{console.error(e);process.exitCode=1});
