'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto').webcrypto;
const {createVault}=require('../apps/web/assets/vault.js');
async function main(){
 let storageValue=null;
 const storage={getItem:()=>storageValue,setItem:(_,value)=>{storageValue=value}};
 const v=createVault(storage,crypto);
 await v.setup('very-long-demo-password-synthetic-2026');
 const c=await v.createCase('Laboratório de integração', 'Sem dados pessoais');
 const manual=Array.from({length:48},(_,i)=>({
   id:'manual-'+String(i+1),label:'Fonte manual '+(i+1),
   status:'not_queried',executed:false,count:null,items:[],
   query_url:'https://example.org/?q=synthetic-'+i,
   notice:'Acesso manual não executado'
 }));
 const seen={
   id:'github-users',label:'Candidatos no GitHub',
   status:'observed',executed:true,count:1,
   provider:'github_name',
   observed_at:'2026-11-10T12:00:00Z',
   source_url:'https://github.com/search?q=Test',
   query_url:'https://github.com/search?q=Test&type=users',
   items:[{login:'synthetic-account',profile_url:'https://github.com/synthetic-account'}]
 };
 const run={format:'protocolo-osint/investigation-run-v2',
   target:'Test Person',kind:'free_text',observed_at:'2026-11-10T12:00:00Z',
   sources:[...manual,seen]};
 const record=await v.saveInvestigationRun(c.id,run);
 assert.equal(record.sources.length,49);
 assert.equal(record.sources.filter(s=>s.status==='not_queried').length,48);
 assert.equal(record.sources.filter(s=>s.status==='observed').length,1);
 assert.equal(record.sources[0].count,null);
 assert.equal(record.sources[48].items[0].login,'synthetic-account');
 assert(!storageValue.includes('synthetic-account')&&!storageValue.includes('Test Person'),
   'Cleartext investigation leaked into localStorage');
 await assert.rejects(
   v.saveInvestigationRun(c.id,{...run,sources:[{...seen,executed:false}]}),
   /sem execução registrada/
 );
 v.lock();
 const v2=createVault(storage,crypto);
 await v2.unlock('very-long-demo-password-synthetic-2026');
 const loaded=await v2.getCase(c.id);
 assert.equal(loaded.investigation_runs.length,1);
 assert.equal(loaded.investigation_runs[0].sources.length,49);
 assert.equal(loaded.investigation_runs[0].sources[0].query_url,'https://example.org/?q=synthetic-0');
 console.log('source archive: 49 sources, encrypted, reloaded, provenance invariant OK');
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
