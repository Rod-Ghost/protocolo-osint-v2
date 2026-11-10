'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const model=require('../apps/web/assets/case-workspace.js');
test('workspace sorts recorded local activity with traceable IDs',()=>{
 const c={id:'case-1',title:'Laboratório',created_at:'2026-01-01T00:00:00Z',
 evidence:[{id:'ev-1',title:'Arquivo',created_at:'2026-01-03T00:00:00Z'}],
 search_plans:[{id:'plan-1',title:'Revisão',created_at:'2026-01-02T00:00:00Z',
 reviews:[{id:'review-1',observed_at:'2026-01-04T00:00:00Z'}]}]};
 const v=model.view(c);
 assert.deepEqual(v.counts,{evidence:1,plans:1,reviews:1,reports:0});
 assert.deepEqual(v.events.map(x=>x.id),['review-1','ev-1','plan-1','case-1']);
 assert.equal(v.events[0].detail,'Revisão manual não verificada');
});
test('workspace handles missing timestamps and does not infer remote results',()=>{
 const v=model.view({id:'x',evidence:[{id:'e',title:'sem data'}],search_plans:[]});
 assert.equal(v.events.length,0);
 assert.equal(v.counts.evidence,1);
});
test('workspace does not mutate source case',()=>{
 const c={id:'x',evidence:[],search_plans:[]};model.view(c);
 assert.deepEqual(c,{id:'x',evidence:[],search_plans:[]});
});

test('workspace includes encrypted result snapshots without mutating them',()=>{
 const c={id:'x',evidence:[],search_plans:[],
 investigation_runs:[{id:'run-1',target:'example.org',
 saved_at:'2026-11-10T12:00:00Z',sources:[{id:'dns',items:[{type:'A'}]}]}]};
 const view=model.view(c);
 assert.equal(view.counts.reports,1);
 assert.equal(view.runs[0].sources[0].id,'dns');
 assert.equal(view.events[0].kind,'results');
 assert.equal(c.investigation_runs.length,1);
});
