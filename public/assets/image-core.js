/* Protocolo OSINT V2 — locally authored image comparison helpers. No network. */
(function (root) {
  'use strict';
  const HASH = /^[0-9a-f]{16}$/i;
  function hamming(a,b){
    if(typeof a!=='string'||typeof b!=='string'||!HASH.test(a)||!HASH.test(b))throw new Error('dHash inválido');
    let diff=BigInt('0x'+a)^BigInt('0x'+b),bits=0;
    while(diff){bits++;diff&=diff-1n;}
    return bits;
  }
  function compareAcrossCases(sha256,dhash,cases,limit=20){
    if(!HASH.test(dhash)||!Array.isArray(cases))throw new Error('Dados de comparação inválidos');
    const output=[];
    for(const item of cases.slice(0,500)){
      if(!item||!Array.isArray(item.images))continue;
      for(const image of item.images.slice(0,250)){
        if(!image||!HASH.test(image.dhash||''))continue;
        const distance=hamming(dhash,image.dhash);
        const exact=image.sha256===sha256&&typeof sha256==='string'&&sha256.length===64;
        if(distance<=14||exact)output.push({case_id:item.id,case_title:item.title,title:image.title,distance,exact,created_at:image.created_at});
      }
    }
    return output.sort((a,b)=>Number(b.exact)-Number(a.exact)||a.distance-b.distance).slice(0,Math.min(100,Math.max(1,limit)));
  }
  function safeFileType(file){
    if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size===0||file.size>10_485_760)throw Error('Use uma imagem PNG, JPEG ou WebP entre 1 byte e 10 MB.');
    return file;
  }
  const api={hamming,compareAcrossCases,safeFileType};
  root.ProtocoloImageTools=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
