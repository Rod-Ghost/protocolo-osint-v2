/* Evidence graph: every observable edge must cite source evidence, no
 * identity inference, network, HTML execution or plaintext persistence.
 */
'use strict';
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {webcrypto}=require('node:crypto');
const {build,hostname,observableFromLine}=require('../apps/web/assets/evidence-graph-model.js');
const {createVault}=require('../apps/web/assets/vault.js');

assert.equal(hostname('https://example.org/path?a=1'),'example.org');
assert.equal(hostname('https://USER:secret@example.org/'),null);
assert.equal(hostname('file:///etc/passwd'),null);
assert.equal(hostname('https://127.0.0.1/private'),null);
assert.equal(hostname('https://example.local/page'),null);
assert.equal(observableFromLine('https://EXAMPLE.org/alice'),'example.org');
assert.equal(observableFromLine('sub.example.org'),'sub.example.org');
assert.equal(observableFromLine('this person controls example.org'),null);
assert.equal(observableFromLine('<img src=x onerror=alert(1)>'),null);
const caseData={
  id:'case-001',title:'Caso de laboratório',
  evidence:[
    {id:'e1',kind:'reference',title:'Referência A',
      url:'https://example.org/one',sha256:'b'.repeat(64)},
    {id:'e2',kind:'capture',title:'Cópia B',sha256:'c'.repeat(64),
      capture:{format:'protocolo-osint/capture-v1',
        sha256_bytes:'a'.repeat(64),source_url:'https://example.org/two',
        source_url_declared:true}},
    {id:'e3',kind:'note',title:'Anotação solta',
      note:'exemplo.org é dono de conta de alguém [alegação não verificada]'},
    {id:'e4',kind:'note',title:'Registro motor',
      provenance:{type:'engine_observation',
        target:'alice.dev',target_kind:'username',
        raw_record:'https://example.org/public-profile',engine:'sherlock',
        job_id:'1'.repeat(32)}},
    {id:'e5',kind:'note',title:'Registro com HTML malicioso',
      provenance:{type:'engine_observation',target:'alice.dev',
        target_kind:'username',raw_record:'<svg onload=alert(1)>',
        job_id:'2'.repeat(32)}}
  ]
};
const graph=build(caseData);
assert.equal(graph.scope,'local-structured-evidence');
assert.equal(graph.external_requests,0);
assert.equal(graph.stats.evidence,5);
assert(graph.nodes.some(n=>n.id==='domain:example.org'));
const domain=graph.nodes.find(n=>n.id==='domain:example.org');
assert.deepEqual([...domain.evidence_ids].sort(),['e1','e2','e4']);
assert(graph.repeated_observables.find(n=>n.id===domain.id)?.count===3);
const hash=graph.nodes.find(n=>n.id==='sha256:'+('a'.repeat(64)));
assert.deepEqual(hash.evidence_ids,['e2']);
assert(!graph.nodes.some(n=>n.id==='sha256:'+('c'.repeat(64))),
  'Metadata hash must never be presented as original-file hash');
const query=graph.nodes.find(n=>n.id==='query:username:alice.dev');
assert.deepEqual([...query.evidence_ids].sort(),['e4','e5']);
assert(graph.edges.some(e=>e.target===query.id &&
  e.verification==='query_context_only'));
assert(!graph.nodes.some(n=>n.label.includes('svg onload')));
assert(!graph.nodes.some(n=>n.label.includes('dono de conta')));
assert(!graph.nodes.some(n=>n.kind==='person' ||
  ['verified','identity_confirmed'].includes(n.verification)));
assert(graph.edges.every(edge=>typeof edge.evidence_id==='string'&&edge.evidence_id));
assert(graph.edges.every(edge=>graph.nodes.some(n=>n.evidence_id===edge.evidence_id)));
const solo=build({id:'empty',title:'Caso vazio',evidence:[]});
assert.equal(solo.stats.observable,0);
assert.equal(solo.stats.relations,0);
assert.throws(()=>build({title:'Sem ID',evidence:[]}),/Identificador/);
assert.equal(build({id:'legacy',title:'Antigo',evidence:[{id:'1',kind:'note',title:'Nota'}]}).stats.observable,0);
const capped=build({id:'many',title:'Lote grande',evidence:
  Array.from({length:260},(_,i)=>({id:String(i),kind:'reference',title:'URL',
    url:'https://domain'+i+'.example.org'}))});
assert(capped.truncated);
assert(capped.stats.evidence<=250);
assert(capped.stats.observable<=250);

async function testVault(){
  let encrypted=null;
  const storage={getItem:()=>encrypted,setItem:(_,value)=>{encrypted=value}};
  const vault=createVault(storage,webcrypto);
  await vault.setup('Safe ephemeral graph test password 2026');
  const c=await vault.createCase('Caso grafo privado','');
  await vault.addEvidence(c.id,{kind:'reference',title:'Referência',
    url:'https://example.org/sample',note:'Observação não verificada'});
  const view=build(await vault.getCase(c.id));
  assert.equal(view.stats.evidence,1);
  assert.equal(view.nodes.find(n=>n.id==='domain:example.org').evidence_ids.length,1);
  assert(encrypted && !encrypted.includes('example.org'));
  vault.lock();
  await assert.rejects(vault.getCase(c.id),/Desbloqueie/);
  await vault.unlock('Safe ephemeral graph test password 2026');
  const back=build(await vault.getCase(c.id));
  assert.deepEqual(back.nodes,view.nodes);
  for(const name of ['evidence-graph-model.js','evidence-graph-ui.js','evidence-graph-ui.css']){
    assert.equal(readFileSync('apps/web/assets/'+name,'utf8'),
      readFileSync('public/assets/'+name,'utf8'),name+' asset drift');
  }
  for(const path of ['apps/web/index.html','public/index.html']){
    const html=readFileSync(path,'utf8');
    assert(html.includes('assets/evidence-graph-model.js'));
    assert(html.includes('assets/evidence-graph-ui.js'));
  }
  console.log('Evidence graph: typed observables, source-backed edges, no identity inference, encrypted vault PASS');
}
testVault().catch(e=>{console.error(e);process.exitCode=1});
