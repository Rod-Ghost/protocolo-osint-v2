/* Original bytes preservation: content-addressable hash, encrypted payload,
 * repeatable verification and CORS-only browser fetch. NO external requests.
 */
'use strict';
const assert=require('node:assert/strict');
const {createHash,webcrypto}=require('node:crypto');
const {createVault,STORAGE_KEY}=require('../apps/web/assets/vault.js');
const {markdown}=require('../apps/web/assets/browser-case-report.js');
const cap=require('../apps/web/assets/source-capture-core.js');

assert.equal(cap.MAX_BYTES,196608);
for(const url of [
  'http://example.org/data','https://localhost/secret',
  'https://127.0.0.1/private','https://10.0.0.10/',
  'https://192.168.2.7/','https://intranet.local/',
  'https://example.org:4443/path','https://user:pass@example.org/a',
  'file:///etc/passwd','https://[::1]/secret','https://example.test/x'
]){
  assert.throws(()=>cap.validatePublicUrl(url),/URL|domínio|pública|Use somente/);
}
assert.equal(cap.validatePublicUrl('https://EXAMPLE.org/docs/#token'),
  'https://example.org/docs/');
assert.equal(cap.validateMime('application/pdf; charset=binary'),'application/pdf');
assert.throws(()=>cap.validateMime('application/x-executable'),/Formato/);
const fixture=new TextEncoder().encode('OSINT: arquivo fictício, sem dados de pessoas\n');
const expected=createHash('sha256').update(fixture).digest('hex');

async function test(){
  const selectedFile={
    size:fixture.length,type:'text/plain',name:'exemplo.txt',
    arrayBuffer:async()=>fixture.buffer.slice(fixture.byteOffset,fixture.byteOffset+fixture.byteLength)
  };
  const file=await cap.readFile(selectedFile);
  assert.deepEqual(file.bytes,fixture);
  assert.equal(file.method,'user-file');
  await assert.rejects(cap.readFile({...selectedFile,size:196609}),/192 KiB/);
  await assert.rejects(cap.readFile({...selectedFile,type:'application/x-msdownload'}),/Formato/);

  const requests=[];
  const cors=await cap.readUrl('https://example.org/arquivo.txt',{
    fetcher:async(url,options)=>{
      requests.push({url,options});
      return new Response(fixture,{status:200,
        headers:{'content-type':'text/plain','content-length':String(fixture.length)}});
    }
  });
  assert.equal(cors.method,'cors-https');
  assert.equal(cors.http_status,200);
  assert.deepEqual(cors.bytes,fixture);
  assert.equal(requests[0].options.credentials,'omit');
  assert.equal(requests[0].options.redirect,'error');
  assert.equal(requests[0].options.mode,'cors');
  assert.equal(requests[0].options.referrerPolicy,'no-referrer');
  await assert.rejects(cap.readUrl('https://example.org/missing',{
    fetcher:async()=>new Response('missing',{status:404})
  }),/HTTP 404/);
  await assert.rejects(cap.readUrl('https://example.org/blocked',{
    fetcher:async()=>{throw new TypeError('CORS blocked')}
  }),/CORS/);
  await assert.rejects(cap.readUrl('https://example.org/too-big',{
    fetcher:async()=>new Response(new Uint8Array(196609),{
      status:200,headers:{'content-type':'application/pdf'}
    })
  }),/192 KiB/);

  let raw=null;
  const storage={getItem:()=>raw,setItem:(key,value)=>{raw=value}};
  const password='Strong test-only local browser vault 2026';
  const v=createVault(storage,webcrypto);
  await v.setup(password);
  const c=await v.createCase('Caso fictício de preservação','Dados de laboratório');
  const result=await v.addCapture(c.id,{...file,note:'Anexo fornecido pelo investigador'});
  assert.equal(result.saved,true);
  assert.equal(result.sha256_bytes,expected);
  assert(!raw.includes('arquivo fictício')&&!raw.includes('exemplo.txt'));
  let current=await v.getCase(c.id);
  assert.equal(current.evidence.length,1);
  assert.equal(current.evidence[0].kind,'capture');
  assert.equal(current.evidence[0].capture.sha256_bytes,expected);
  assert.equal(current.evidence[0].capture.byte_count,fixture.length);
  assert.notEqual(current.evidence[0].sha256,expected,
    'Metadata hash is not the hash of the original file bytes');
  const verify=await v.verifyCapture(c.id,result.evidence_id);
  assert.equal(verify.valid,true);
  const recovered=await v.getCaptureBytes(c.id,result.evidence_id);
  assert.deepEqual(recovered.bytes,fixture);
  const duplicate=await v.addCapture(c.id,{...cors,note:'Duplicata exata'});
  assert.equal(duplicate.saved,false);
  assert.equal(duplicate.duplicate_id,result.evidence_id);
  assert.equal((await v.getCase(c.id)).evidence.length,1);
  const report=markdown(current);
  assert(report.includes('**SHA-256 dos BYTES originais:** '+expected));
  assert(report.includes('não comprova autoria'));
  assert(!report.includes(Buffer.from(fixture).toString('base64')),
    'Plaintext report must exclude embedded payload');
  await assert.rejects(v.addCapture(c.id,{...file,bytes:new Uint8Array(196609)}),/192 KiB/);
  await assert.rejects(v.addCapture(c.id,{...file,mime_type:'application/x-msdownload'}),/Formato/);
  await assert.rejects(v.addCapture(c.id,{...file,source_url:'https://127.0.0.1/'}),/Fonte deve ser/);
  assert.equal((await v.getCase(c.id)).evidence.length,1);
  v.lock();
  await assert.rejects(v.getCaptureBytes(c.id,result.evidence_id),/cofre primeiro/);
  await v.unlock(password);
  assert.equal((await v.verifyCapture(c.id,result.evidence_id)).valid,true);

  // Corrupt the original bytes while keeping the stored hash unchanged,
  // then reencrypt with the test password to exercise the integrity check.
  const envelope=JSON.parse(storage.getItem(STORAGE_KEY));
  const from64=str=>Uint8Array.from(Buffer.from(str,'base64'));
  const salt=from64(envelope.salt),iv=from64(envelope.iv);
  const derived=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(password),
    'PBKDF2',false,['deriveKey']);
  const key=await webcrypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:envelope.iterations,
    hash:'SHA-256'},derived,{name:'AES-GCM',length:256},false,['decrypt','encrypt']);
  const plaintext=await webcrypto.subtle.decrypt({name:'AES-GCM',iv},key,from64(envelope.data));
  const state=JSON.parse(new TextDecoder().decode(plaintext));
  state.cases[0].evidence[0].capture.bytes_base64=Buffer.from('changed').toString('base64');
  const nextIv=webcrypto.getRandomValues(new Uint8Array(12));
  envelope.iv=Buffer.from(nextIv).toString('base64');
  envelope.data=Buffer.from(await webcrypto.subtle.encrypt({name:'AES-GCM',iv:nextIv},
    key,new TextEncoder().encode(JSON.stringify(state)))).toString('base64');
  raw=JSON.stringify(envelope);
  v.lock();
  await v.unlock(password);
  const bad=await v.verifyCapture(c.id,result.evidence_id);
  assert.equal(bad.valid,false);
  await assert.rejects(v.getCaptureBytes(c.id,result.evidence_id),/Integridade da captura falhou/);
  console.log('Verifiable capture: original bytes, CORS scope, AES-GCM, export and tamper detection OK');
}
test().catch(e=>{console.error(e);process.exitCode=1});
