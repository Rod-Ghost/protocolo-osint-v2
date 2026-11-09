/* Encrypted vault case-search plans: no external calls or plaintext storage. */
'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto').webcrypto;
const {createVault}=require('../apps/web/assets/vault.js');

async function main(){
  let stored=null;
  const storage={
    getItem:()=>stored,
    setItem:(key,value)=>{stored=value;}
  };
  const vault=createVault(storage,crypto);
  await vault.setup('A reasonably long test passphrase for vault security');
  const caseItem=await vault.createCase('Investigação autorizada','Plano e revisões');
  assert.equal(caseItem.search_plans.length,0);
  const first=await vault.saveSearchPlan(caseItem.id,{
    title:'Pesquisa em fontes públicas',query:'example.org',kind:'domain',
    source_ids:['google','viewdns-whois','google'],filters:{
      exact:true,site:'example.org',filetype:'pdf',exclude:'spam'
    },interval_days:7
  });
  assert.equal(first.source_ids.length,2);
  assert.equal(first.reviews.length,0);
  assert(!stored.includes('example.org'),'Encrypted storage must not contain cleartext query');
  let loaded=await vault.getCase(caseItem.id);
  assert.equal(loaded.search_plans.length,1);
  assert.equal(loaded.search_plans[0].source_ids[0],'google');
  const firstReview=await vault.reviewSearchPlan(caseItem.id,first.id,{
    count:12,note:'Contagem declarada após abertura manual do provedor'
  });
  assert.equal(firstReview.delta,null);
  const secondReview=await vault.reviewSearchPlan(caseItem.id,first.id,{
    count:15,note:'A estimativa mudou, não comprova novos documentos'
  });
  assert.equal(secondReview.delta,3);
  await vault.saveSearchPlan(caseItem.id,{...first,id:first.id,title:'Plano revisado'});
  loaded=await vault.getCase(caseItem.id);
  assert.equal(loaded.search_plans.length,1);
  assert.equal(loaded.search_plans[0].reviews.length,2);
  const exportData=await vault.exportCase(caseItem.id);
  assert.equal(exportData.case.search_plans[0].reviews.length,2);
  vault.lock();
  assert.rejects(vault.getCase(caseItem.id),/cofre primeiro/);
  await vault.unlock('A reasonably long test passphrase for vault security');
  loaded=await vault.getCase(caseItem.id);
  assert.equal(loaded.search_plans[0].title,'Plano revisado');
  await assert.rejects(vault.reviewSearchPlan(caseItem.id,first.id,{count:-1}),/Contagem manual inválida/);
  await assert.rejects(vault.saveSearchPlan(caseItem.id,{
    title:'Busca inválida',query:'example.org',source_ids:[...Array(61)].map((_,i)=>'source'+i)
  }),/entre 1 e 60/);
  console.log('Vault case-search builder: encrypted persistence, manual review and compatibility OK');
}
main().catch(err=>{console.error(err);process.exitCode=1});
