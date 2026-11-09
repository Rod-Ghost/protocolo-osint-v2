/* Engine evidence imports: no real user data, OAuth, network or OSINT executions. */
'use strict';
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {readFileSync}=require('node:fs');
const {createVault}=require('../apps/web/assets/vault.js');
const {normalize}=require('../apps/web/assets/engine-findings.js');
const {markdown}=require('../apps/web/assets/browser-case-report.js');
const jobId='a'.repeat(32);
const job={engine:'sherlock',job_id:jobId};
const base={
  engine:'sherlock',job_id:jobId,status:'completed',
  source:'https://github.com/sherlock-project/sherlock',
  observed_at:'2026-11-09T10:00:00Z',
  records:['https://github.com/exampleuser', 'http://example.net/user', '<img src=x onerror=alert(1)>']
};
const ctx={target:'exampleuser',kind:'username'};
assert.deepEqual(normalize(job,{...base,status:'failed'},ctx),[]);
assert.deepEqual(normalize(job,{...base,job_id:'b'.repeat(32)},ctx),[]);
const output=normalize(job,base,ctx);
assert.equal(output.length,3);
assert.equal(output[0].raw_record,'https://github.com/exampleuser');
assert.equal(output[2].raw_record,'<img src=x onerror=alert(1)>');
assert.equal(output[2].verification,'unverified');
assert.equal(output[0].target_kind,'username');
assert.equal(normalize(job,{...base,records:['','abc','abc','Z'.repeat(402)]},ctx).length,1);
assert.equal(normalize({...job,engine:'nonexistent'},base,ctx).length,0);

async function test(){
  let cipher=null;
  const store={getItem:()=>cipher,setItem:(_,v)=>cipher=v};
  const vault=createVault(store,webcrypto);
  await vault.setup('Test local vault password only 2026!');
  const c=await vault.createCase('Exemplo de investigação','Sem alvos reais');
  assert.equal(c.evidence.length,0);
  const saved=await vault.saveEngineFindings(c.id,output.slice(0,2),{
    reviewNote:'Resultados selecionados manualmente. Falta verificar URLs.'
  });
  assert.equal(saved.saved.length,2);
  assert.equal(saved.duplicates,0);
  assert(!cipher.includes('exampleuser'));
  let current=await vault.getCase(c.id);
  assert.equal(current.evidence.length,2);
  const provenance=current.evidence[0].provenance;
  assert.equal(provenance.type,'engine_observation');
  assert.equal(provenance.job_id,jobId);
  assert.equal(provenance.verification_status,'unverified');
  assert.equal(provenance.review_status,'manually_selected_not_verified');
  assert.match(provenance.raw_sha256,/^[0-9a-f]{64}$/);
  assert.match(current.evidence[0].sha256,/^[0-9a-f]{64}$/);
  const duplicate=await vault.saveEngineFindings(c.id,[output[0]]);
  assert.equal(duplicate.saved.length,0);
  assert.equal(duplicate.duplicates,1);
  const anotherJob=normalize({engine:'sherlock',job_id:'b'.repeat(32)},
    {...base,job_id:'b'.repeat(32),records:[base.records[0]]},ctx);
  const another=await vault.saveEngineFindings(c.id,anotherJob);
  assert.equal(another.saved.length,1,'Independent job provenance should be preserved');
  current=await vault.getCase(c.id);
  assert.equal(current.evidence.length,3);
  await assert.rejects(vault.saveEngineFindings(c.id,[output[2],{
    ...output[1],engine:'arbitrary_cli'
  }]),/inválido ou sem procedência/);
  assert.equal((await vault.getCase(c.id)).evidence.length,3,
    'A failed batch must not change the existing case');
  const md=markdown(current);
  assert(md.includes('**Job ID:** '+jobId));
  assert(md.includes('NÃO VERIFICADO'));
  assert(md.includes('SHA-256 da linha registrada'));
  assert(md.includes('https://github.com/exampleuser'));
  assert(md.includes('Referência do software (não da fonte verificada)'));
  const exportResult=await vault.exportCase(c.id);
  assert.equal(exportResult.case.evidence.length,3);
  vault.lock();
  await assert.rejects(vault.getCase(c.id),/Desbloqueie o cofre/);
  await vault.unlock('Test local vault password only 2026!');
  assert.equal((await vault.getCase(c.id)).evidence.length,3);
  console.log('Engine evidence: normalizer, encrypted case import, provenance, dedup, rollback and Markdown PASS');
}
test().catch(e=>{console.error(e);process.exitCode=1});

for(const name of ['engine-findings.js','engine-evidence-ui.js','engine-evidence-ui.css']){
  assert.equal(readFileSync('apps/web/assets/'+name,'utf8'),
    readFileSync('public/assets/'+name,'utf8'),name+' mirrored assets');
}
