/* Protected portable backup regressions; no network and no real user data. */
'use strict';
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {readFileSync}=require('node:fs');
const core=require('../apps/web/assets/portable-backup-core.js');
const {createVault,STORAGE_KEY}=require('../apps/web/assets/vault.js');
const pass='Backup-2026! Separate strong passphrase #example';
const vaultPassword='Different new vault passphrase 2026!';
const fixture=new TextEncoder().encode('Protocolo OSINT — conteúdo público de laboratório\n');

function mockStore(){
  let value=null,fail=false;
  return {
    getItem:key=>key===STORAGE_KEY?value:null,
    setItem:(key,next)=>{if(fail)throw Error('QuotaExceededError: simulated');value=next;},
    setFail:v=>{fail=v},
    snapshot:()=>value
  };
}
async function main(){
  const originalStore=mockStore(),v=createVault(originalStore,webcrypto);
  await v.setup('Original local vault password 2026!');
  const c=await v.createCase('Caso de backup e restauração','Material de teste');
  const saved=await v.addCapture(c.id,{
    bytes:fixture,filename:'anexo.txt',mime_type:'text/plain',
    method:'user-file',source_url:'https://example.org/public',note:'Conteúdo fictício'
  });
  assert.equal(saved.saved,true);
  await v.saveSearchPlan(c.id,{title:'Plano documental',query:'example.org',
    source_ids:['google','viewdns-whois'],interval_days:7});
  await v.saveEngineFindings(c.id,[{
    engine:'sherlock',job_id:'a'.repeat(32),target:'exampleuser',target_kind:'username',
    raw_record:'https://github.com/exampleuser',observed_at:'2026-11-09T14:00:00Z',
    tool_source:'https://github.com/sherlock-project/sherlock',
    verification:'unverified',capture_method:'daemon-output'
  }],{reviewNote:'Teste sem consulta real'});
  const before=await v.exportAll();
  assert.equal(before.cases.length,1);
  const encrypted=await core.encrypt(before,pass,webcrypto);
  assert.equal(encrypted.summary.cases,1);
  assert.equal(encrypted.summary.evidence,2);
  assert.equal(JSON.parse(encrypted.json).format,core.FORMAT);
  for(const sensitive of ['Caso de backup','exampleuser','anexo.txt',
    'viewdns-whois','bytes_base64','example.org']){
    assert(!encrypted.json.includes(sensitive),'Encrypted file leaked '+sensitive);
  }
  assert(!encrypted.json.includes(Buffer.from(fixture).toString('base64')));
  assert(!encrypted.json.includes(vaultPassword));
  assert(encrypted.json.length>100);
  const again=await core.encrypt(before,pass,webcrypto);
  assert.notEqual(encrypted.json,again.json,
    'New salt/nonce must produce different encrypted backups');

  await assert.rejects(core.decrypt(encrypted.json,'incorrect-passphrase-2026',webcrypto),
    /Senha do backup incorreta ou arquivo adulterado/);
  const envelope=JSON.parse(encrypted.json);
  const tampered={...envelope,ciphertext:envelope.ciphertext.slice(0,-8)+
    (envelope.ciphertext.slice(-8,-7)==='A'?'B':'A')+envelope.ciphertext.slice(-7)};
  await assert.rejects(core.decrypt(JSON.stringify(tampered),pass,webcrypto),
    /Senha do backup incorreta ou arquivo adulterado|inválida/);
  await assert.rejects(core.decrypt(JSON.stringify({...envelope,
    crypto:{...envelope.crypto,iterations:1}}),pass,webcrypto),/incompatível/);
  await assert.rejects(core.decrypt('{bad json',pass,webcrypto),/JSON inválido/);
  await assert.rejects(core.encrypt(before,'short',webcrypto),/12/);
  await assert.rejects(core.decrypt(encrypted.json,'short',webcrypto),/12/);

  const restored=await core.decrypt(encrypted.json,pass,webcrypto);
  assert.equal(restored.summary.evidence,2);
  assert.equal(restored.summary.cases,1);
  assert.equal(restored.cases[0].evidence.length,2);
  const newStore=mockStore(),other=createVault(newStore,webcrypto);
  await other.setup(vaultPassword);
  const preview=await other.previewBackupRestore(restored.cases);
  assert.equal(preview.new_cases,1);
  assert.equal(preview.duplicates,0);
  assert.equal(preview.conflicts.length,0);
  const outcome=await other.restoreBackupCases(restored.cases);
  assert.equal(outcome.restored,1);
  const recovered=await other.getCase(c.id);
  assert.deepEqual(recovered,before.cases[0],
    'Cases, all plans, findings, hashes and binary captures must survive without edits');
  const verify=await other.verifyCapture(c.id,saved.evidence_id);
  assert.equal(verify.valid,true);
  const bytes=await other.getCaptureBytes(c.id,saved.evidence_id);
  assert.deepEqual(bytes.bytes,fixture);

  const restoredTwice=await other.restoreBackupCases(restored.cases);
  assert.deepEqual(restoredTwice,{restored:0,duplicates:1,total:1});
  assert.equal((await other.summary()).cases,1);
  await other.addEvidence(c.id,{kind:'note',title:'Nota adicionada depois do backup',note:'Mudança local'});
  const previousBytes=newStore.snapshot();
  const conflict=await other.previewBackupRestore(restored.cases);
  assert.equal(conflict.conflicts.length,1);
  await assert.rejects(other.restoreBackupCases(restored.cases),/IDs de casos já existem/);
  assert.equal(newStore.snapshot(),previousBytes,'Conflict must not overwrite existing vault');
  assert.equal((await other.getCase(c.id)).evidence.length,3);

  // Bad capture digest must fail BEFORE import, even if the archive can be
  // encrypted with a valid password — metadata alone is not enough.
  const corrupt=JSON.parse(JSON.stringify(before));
  corrupt.cases[0].evidence[0].capture.sha256_bytes='0'.repeat(64);
  await assert.rejects(core.encrypt(corrupt,pass,webcrypto),/hash SHA-256/);
  const repeated=JSON.parse(JSON.stringify(before));
  repeated.cases.push(JSON.parse(JSON.stringify(repeated.cases[0])));
  await assert.rejects(core.encrypt(repeated,pass,webcrypto),/IDs de casos duplicados/);

  // An authenticated (correct-password) archive is still UNTRUSTED input:
  // never restore script URLs, credential-bearing links or private captures
  // which could become active links when a case is displayed.
  const unsafeReference=JSON.parse(JSON.stringify(before));
  unsafeReference.cases[0].evidence[1].url='javascript:alert(1)';
  await assert.rejects(core.validateCases(unsafeReference.cases,webcrypto),
    /Registro de evidência inválido/);
  const unsafeUrl=JSON.parse(JSON.stringify(before));
  unsafeUrl.cases[0].evidence[0].url='https://127.0.0.1/private';
  await assert.rejects(core.validateCases(unsafeUrl.cases,webcrypto),
    /Registro de evidência inválido/);
  const unsafeCaptured=JSON.parse(JSON.stringify(before));
  unsafeCaptured.cases[0].evidence[0].capture.source_url='https://user:password@example.org/file';
  await assert.rejects(core.validateCases(unsafeCaptured.cases,webcrypto),
    /Captura do backup sem manifesto íntegro/);
  const unsafeMismatch=JSON.parse(JSON.stringify(before));
  unsafeMismatch.cases[0].evidence[0].capture.source_url='https://example.org/other';
  await assert.rejects(core.validateCases(unsafeMismatch.cases,webcrypto),
    /Captura do backup sem manifesto íntegro/);

  // Legacy reference bookmarks using HTTPS fragments remain importable.
  const bookmark=JSON.parse(JSON.stringify(before));
  bookmark.cases[0].evidence[1].url='https://example.org/docs#chapter';
  await core.validateCases(bookmark.cases,webcrypto);

  // Quota failures must be atomic: keep original encrypted data and
  // in-memory case state; never partially import.
  const quotaStore=mockStore(),quota=createVault(quotaStore,webcrypto);
  await quota.setup('Another original local password 2026');
  const prior=quotaStore.snapshot();
  quotaStore.setFail(true);
  await assert.rejects(quota.restoreBackupCases(restored.cases),/QuotaExceededError/);
  quotaStore.setFail(false);
  assert.equal(quotaStore.snapshot(),prior);
  assert.equal((await quota.listCases()).length,0);

  // Independent vault passwords and browser profiles are supported.
  other.lock();
  await assert.rejects(other.getCase(c.id),/Desbloqueie/);
  await other.unlock(vaultPassword);
  assert.equal((await other.getCase(c.id)).evidence.length,3);
  assert.notEqual(originalStore.snapshot(),newStore.snapshot());

  for(const name of ['portable-backup-core.js','portable-backup-ui.js','portable-backup-ui.css']){
    assert.equal(readFileSync('apps/web/assets/'+name,'utf8'),
      readFileSync('public/assets/'+name,'utf8'),name+' production drift');
  }
  console.log('Portable backup PASS: AES-GCM, fresh IV/salt, no PII plaintext, cross-vault restore, duplicate/collision safety, hash validation, tamper/quota rollback');
}
main().catch(error=>{console.error(error);process.exitCode=1});
