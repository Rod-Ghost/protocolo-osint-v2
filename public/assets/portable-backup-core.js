/* Portable, authenticated, off-device backup for the existing browser-local vault.
 * Encrypted with a SEPARATE passphrase. No upload, service keys or network calls.
 * AES-256-GCM authenticated encryption + PBKDF2-HMAC-SHA256 310k iterations.
 */
(function(root){
  'use strict';
  const FORMAT='protocolo-osint/encrypted-portable-backup-v1';
  const PAYLOAD='protocolo-osint/portable-backup-payload-v1';
  const ITERATIONS=310000,MAX_STATE_BYTES=1000000,MAX_FILE_BYTES=2250000;
  const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
  const AAD=enc.encode(FORMAT);
  const HEX=/^[a-f0-9]{64}$/i;
  const to64=bytes=>{
    let s='';for(const b of bytes)s+=String.fromCharCode(b);
    return typeof btoa==='function'?btoa(s):Buffer.from(bytes).toString('base64');
  };
  const from64=s=>{
    if(typeof s!=='string'||s.length>1800000||s.length%4!==0||
       !/^[A-Za-z0-9+/]+={0,2}$/.test(s))throw Error('Codificação do backup inválida.');
    const binary=typeof atob==='function'?atob(s):Buffer.from(s,'base64').toString('binary');
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    if(to64(bytes)!==s)throw Error('Codificação não canônica no backup.');
    return bytes;
  };
  const sha=async(cryptoApi,bytes)=>Array.from(
    new Uint8Array(await cryptoApi.subtle.digest('SHA-256',bytes)),
    n=>n.toString(16).padStart(2,'0')).join('');
  const cryptoReady=c=>{
    if(!c||!c.subtle||typeof c.getRandomValues!=='function')
      throw Error('É necessário Web Crypto em contexto HTTPS.');
  };
  const passwordReady=value=>{
    if(typeof value!=='string'||value.length<12||value.length>1024)
      throw Error('A senha do backup deve ter entre 12 e 1.024 caracteres.');
  };
  async function derive(cryptoApi,password,salt){
    const raw=await cryptoApi.subtle.importKey('raw',enc.encode(password),
      'PBKDF2',false,['deriveKey']);
    return cryptoApi.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,
      hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  function parseJSON(value){
    try{return JSON.parse(value,(k,v)=>{
      if(['__proto__','prototype','constructor'].includes(k))
        throw Error('Chave proibida no arquivo de backup.');
      return v;
    })}catch{throw Error('Backup JSON inválido ou contém campos proibidos.')}
  }
  function checkDepth(value,depth,quota){
    quota.count++;
    if(quota.count>50000||depth>20)throw Error('Backup excede o limite de complexidade.');
    if(!value||typeof value!=='object')return;
    for(const [k,v] of Object.entries(value)){
      if(['__proto__','prototype','constructor'].includes(k))
        throw Error('Chave proibida no backup.');
      checkDepth(v,depth+1,quota);
    }
  }
  async function validateCases(cases,cryptoApi){
    cryptoReady(cryptoApi);
    if(!Array.isArray(cases)||cases.length>150)
      throw Error('Lista de casos inválida ou excede 150 casos.');
    checkDepth(cases,0,{count:0});
    const seen=new Set();
    for(const c of cases){
      if(!c||typeof c!=='object'||Array.isArray(c)||
        typeof c.id!=='string'||!c.id||c.id.length>130||
        typeof c.title!=='string'||c.title.trim().length<2||c.title.length>120||
        (c.description!=null&&(typeof c.description!=='string'||c.description.length>1500))||
        !Array.isArray(c.evidence)||c.evidence.length>500||
        (c.images!=null&&(!Array.isArray(c.images)||c.images.length>1000))||
        (c.search_plans!=null&&(!Array.isArray(c.search_plans)||c.search_plans.length>50)))
        throw Error('Estrutura de caso incompatível com o Protocolo OSINT.');
      if(seen.has(c.id))throw Error('O arquivo contém IDs de casos duplicados.');
      seen.add(c.id);
      const evidences=new Set();
      for(const e of c.evidence){
        if(!e||typeof e!=='object'||Array.isArray(e)||
          typeof e.id!=='string'||!e.id||e.id.length>130||
          typeof e.title!=='string'||e.title.length>180||
          (e.case_id!=null&&e.case_id!==c.id)||
          (typeof e.kind!=='string'||!['note','reference','capture'].includes(e.kind))||
          (e.sha256!=null&&(typeof e.sha256!=='string'||!HEX.test(e.sha256))))
          throw Error('Registro de evidência inválido em um caso do backup.');
        if(evidences.has(e.id))throw Error('Registro de evidência duplicado no backup.');
        evidences.add(e.id);
        if(e.kind==='capture'){
          const p=e.capture;
          if(!p||p.format!=='protocolo-osint/capture-v1'||
            typeof p.bytes_base64!=='string'||
            typeof p.sha256_bytes!=='string'||!HEX.test(p.sha256_bytes)||
            !Number.isSafeInteger(p.byte_count)||p.byte_count<1||p.byte_count>192*1024)
            throw Error('Captura do backup sem manifesto íntegro.');
          const bytes=from64(p.bytes_base64);
          if(bytes.length!==p.byte_count||
            (await sha(cryptoApi,bytes))!==p.sha256_bytes.toLowerCase())
            throw Error('O hash SHA-256 da captura não corresponde aos bytes.');
        }
      }
      if(c.search_plans){
        const plans=new Set();
        for(const plan of c.search_plans){
          if(!plan||typeof plan.id!=='string'||!plan.id||
            typeof plan.query!=='string'||plan.query.length>240||
            !Array.isArray(plan.source_ids)||plan.source_ids.length>60||
            (plan.reviews!=null&&(!Array.isArray(plan.reviews)||plan.reviews.length>25)))
            throw Error('Plano de pesquisa inválido no backup.');
          if(plans.has(plan.id))throw Error('Plano duplicado no backup.');
          plans.add(plan.id);
        }
      }
    }
    const size=enc.encode(JSON.stringify({schema:1,cases})).length;
    if(size>MAX_STATE_BYTES)throw Error('Backup ultrapassa o limite de 1 MB do cofre local.');
    return {cases:cases.length,evidence:cases.reduce((n,c)=>n+c.evidence.length,0),state_bytes:size};
  }
  async function encrypt(backup,password,cryptoApi=root.crypto){
    cryptoReady(cryptoApi);passwordReady(password);
    if(!backup||backup.format!=='protocolo-osint/v2-vault-backup'||
      !Array.isArray(backup.cases))
      throw Error('O conteúdo fornecido não é uma exportação do cofre.');
    const stats=await validateCases(backup.cases,cryptoApi);
    const salted=cryptoApi.getRandomValues(new Uint8Array(16));
    const iv=cryptoApi.getRandomValues(new Uint8Array(12));
    const key=await derive(cryptoApi,password,salted);
    const casesJSON=JSON.stringify(backup.cases);
    const payload={format:PAYLOAD,schema:1,created_at_device:new Date().toISOString(),
      cases_sha256:await sha(cryptoApi,enc.encode(casesJSON)),cases:backup.cases};
    const plain=enc.encode(JSON.stringify(payload));
    if(plain.length>MAX_STATE_BYTES+1500)throw Error('Backup excede o limite de tamanho.');
    const cipher=new Uint8Array(await cryptoApi.subtle.encrypt({
      name:'AES-GCM',iv,additionalData:AAD,tagLength:128},key,plain));
    const result={format:FORMAT,version:1,
      crypto:{kdf:'PBKDF2-HMAC-SHA256',iterations:ITERATIONS,
        cipher:'AES-256-GCM',salt:to64(salted),iv:to64(iv)},
      ciphertext:to64(cipher)};
    const serialized=JSON.stringify(result);
    if(enc.encode(serialized).length>MAX_FILE_BYTES)throw Error('Arquivo criptografado excedeu o limite.');
    return {json:serialized,summary:stats};
  }
  async function decrypt(input,password,cryptoApi=root.crypto){
    cryptoReady(cryptoApi);passwordReady(password);
    if(typeof input!=='string'||enc.encode(input).length>MAX_FILE_BYTES)
      throw Error('Arquivo de backup inválido ou acima do limite de tamanho.');
    const envelope=parseJSON(input);
    if(!envelope||typeof envelope!=='object'||envelope.format!==FORMAT||
      envelope.version!==1||envelope.crypto?.kdf!=='PBKDF2-HMAC-SHA256'||
      envelope.crypto?.cipher!=='AES-256-GCM'||
      envelope.crypto?.iterations!==ITERATIONS)
      throw Error('Formato, versão ou algoritmo do backup incompatível.');
    const salt=from64(envelope.crypto.salt),iv=from64(envelope.crypto.iv);
    const ciphertext=from64(envelope.ciphertext);
    if(salt.length!==16||iv.length!==12||ciphertext.length<17||
      ciphertext.length>MAX_STATE_BYTES+1600)
      throw Error('Parâmetros criptográficos do backup inválidos.');
    const key=await derive(cryptoApi,password,salt);
    let data;
    try{
      data=await cryptoApi.subtle.decrypt({
        name:'AES-GCM',iv,additionalData:AAD,tagLength:128},key,ciphertext);
    }catch{throw Error('Senha do backup incorreta ou arquivo adulterado.')}
    let payload;
    try{payload=parseJSON(dec.decode(data))}catch{
      throw Error('Conteúdo descriptografado inválido.')}
    if(!payload||payload.format!==PAYLOAD||payload.schema!==1||
      !Array.isArray(payload.cases)||typeof payload.cases_sha256!=='string')
      throw Error('Conteúdo de backup incompatível.');
    const actual=await sha(cryptoApi,enc.encode(JSON.stringify(payload.cases)));
    if(actual!==payload.cases_sha256)
      throw Error('A verificação interna SHA-256 do backup falhou.');
    const summary=await validateCases(payload.cases,cryptoApi);
    return {cases:payload.cases,summary,created_at_device:payload.created_at_device,
      format:FORMAT};
  }
  const api=Object.freeze({FORMAT,MAX_FILE_BYTES,encrypt,decrypt,validateCases});
  root.ProtocoloPortableBackup=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
