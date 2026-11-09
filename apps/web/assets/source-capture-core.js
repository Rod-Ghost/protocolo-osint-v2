/* Offline-first capture of authorized public HTTPS resources or user-selected files.
 * Browser CORS applies. No server proxy, credentials, redirect following, or crawler.
 */
(function(root){
  'use strict';
  const MAX_BYTES=192*1024;
  const TYPES=new Set([
    'text/html','text/plain','text/csv','text/xml','application/xml',
    'application/json','application/pdf','image/png','image/jpeg','image/webp'
  ]);
  const IP=/^\d{1,3}(?:\.\d{1,3}){3}$/;
  const DOMAIN=/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/i;
  function validatePublicUrl(value){
    if(typeof value!=='string'||value.length>1800)throw Error('URL pública HTTPS inválida ou longa demais.');
    let url;
    try{url=new URL(value.trim())}catch{throw Error('URL pública HTTPS inválida.')}
    const host=url.hostname.toLowerCase().replace(/\.$/,'');
    if(url.protocol!=='https:'||url.username||url.password||
       (url.port&&url.port!=='443')||!DOMAIN.test(host)||
       IP.test(host)||host.endsWith('.local')||host.endsWith('.internal')||
       host.endsWith('.test')||host.endsWith('.invalid')||host.endsWith('.localhost'))
      throw Error('Use somente domínio público HTTPS sem credenciais, IP ou porta especial.');
    if(url.hash)url.hash='';
    return url.toString();
  }
  function mime(value){
    return String(value||'').split(';',1)[0].trim().toLowerCase();
  }
  function validateMime(value){
    const normalized=mime(value);
    if(!TYPES.has(normalized))
      throw Error('Formato não permitido: texto, JSON, XML, CSV, PDF, PNG, JPEG ou WebP.');
    return normalized;
  }
  function bytes(input){
    if(input instanceof Uint8Array)return new Uint8Array(input);
    if(input instanceof ArrayBuffer)return new Uint8Array(input);
    throw Error('Bytes de captura inválidos.');
  }
  async function readFile(file){
    if(!file||typeof file.arrayBuffer!=='function')throw Error('Selecione um arquivo local.');
    if(!Number.isSafeInteger(file.size)||file.size<1||file.size>MAX_BYTES)
      throw Error('Arquivo deve ter entre 1 byte e 192 KiB.');
    const type=validateMime(file.type);
    const name=String(file.name||'arquivo').slice(0,140);
    const data=bytes(await file.arrayBuffer());
    if(data.length<1||data.length>MAX_BYTES)throw Error('Arquivo acima do limite.');
    return {bytes:data,filename:name,mime_type:type,method:'user-file',
      source_url:null,http_status:null,source_declared:false};
  }
  async function readUrl(value,{fetcher=fetch,timeoutMs=12000}={}){
    const url=validatePublicUrl(value);
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Math.min(timeoutMs,15000));
    let reader;
    try{
      const response=await fetcher(url,{
        method:'GET',credentials:'omit',redirect:'error',
        referrerPolicy:'no-referrer',mode:'cors',cache:'no-store',
        signal:controller.signal,headers:{'Accept':
          'text/html,text/plain,application/pdf,application/json,image/png,image/jpeg,image/webp;q=0.9'}
      });
      if(!response.ok)throw Error('Fonte retornou HTTP '+response.status+'.');
      if(response.type==='opaque'||response.type==='opaqueredirect')
        throw Error('Resposta não acessível devido às restrições do navegador.');
      if(response.url && validatePublicUrl(response.url)!==url)
        throw Error('Redirecionamento de fonte não permitido.');
      const type=validateMime(response.headers.get('content-type'));
      const length=response.headers.get('content-length');
      if(length!=null && Number(length)>MAX_BYTES)throw Error('Conteúdo remoto acima de 192 KiB.');
      if(!response.body || typeof response.body.getReader!=='function')
        throw Error('O navegador não permitiu ler a resposta com limite de tamanho.');
      reader=response.body.getReader();
      const chunks=[];let total=0;
      for(;;){
        const result=await reader.read();
        if(result.done)break;
        if(!(result.value instanceof Uint8Array))throw Error('Resposta binária inválida.');
        total+=result.value.length;
        if(total>MAX_BYTES)throw Error('Conteúdo remoto acima de 192 KiB.');
        chunks.push(result.value);
      }
      if(total<1)throw Error('Fonte retornou conteúdo vazio.');
      const data=new Uint8Array(total);let offset=0;
      for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length}
      const name=new URL(url).hostname+'-'+new Date().toISOString().slice(0,10);
      return {bytes:data,filename:name,mime_type:type,method:'cors-https',
        source_url:url,http_status:response.status,source_declared:false};
    }catch(error){
      if(error?.name==='AbortError')throw Error('Tempo limite de acesso à fonte (15 s).');
      if(error instanceof TypeError)throw Error('O site não permite leitura direta via CORS. Salve uma cópia autorizada e anexe o arquivo manualmente.');
      throw error;
    }finally{
      clearTimeout(timer);
      if(reader){try{await reader.cancel()}catch{}}
    }
  }
  const api=Object.freeze({MAX_BYTES,validatePublicUrl,validateMime,readFile,readUrl});
  root.ProtocoloSourceCapture=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
