/* Protocolo OSINT · evidence-first correlation, no network, no identity inference.
 * Every edge that describes an observable is anchored to one concrete evidence ID.
 * A shared hostname/hash is a repeated string, never independent verification.
 */
(function(root){
  'use strict';
  const MAX_EVIDENCE=250,MAX_OBSERVABLES=250;
  const HOST=/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/i;
  const HASH=/^[a-f0-9]{64}$/i;
  const DOMAIN_OUTPUT=/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/i;
  const normal=value=>typeof value==='string'?value.trim():'';
  function hostname(value){
    if(typeof value!=='string'||value.length>1800)return null;
    try{
      const p=new URL(value);
      if(!['http:','https:'].includes(p.protocol)||p.username||p.password)return null;
      const h=p.hostname.toLowerCase().replace(/\.$/,'');
      if(!HOST.test(h)||/\.(local|internal|test|invalid|localhost)$/.test(h))return null;
      return h;
    }catch{return null}
  }
  function observableFromLine(value){
    const text=normal(value);
    if(text.length>400)return null;
    if(/^https?:\/\/\S+$/i.test(text))return hostname(text);
    if(DOMAIN_OUTPUT.test(text)&&!/\.(local|internal|test|invalid|localhost)$/i.test(text))
      return text.toLowerCase().replace(/\.$/,'');
    return null;
  }
  function build(caseData){
    if(!caseData||typeof caseData!=='object'||!Array.isArray(caseData.evidence))
      throw new TypeError('Caso inválido para correlação.');
    const caseId=normal(caseData.id),title=normal(caseData.title);
    if(!caseId||caseId.length>130)throw new TypeError('Identificador do caso inválido.');
    const source=caseData.evidence.slice(0,MAX_EVIDENCE);
    const nodes=[{id:'case:'+caseId,label:title.slice(0,120)||'Caso',kind:'case',
      evidence_ids:[],verification:'organizational'}];
    const edges=[],byId=new Map(nodes.map(n=>[n.id,n]));
    const addedEdges=new Set(),shared=new Map();
    function observable(e,kind,value,relation,status){
      if(!value||typeof value!=='string'||value.length>290)return;
      const id=kind+':'+value.toLowerCase();
      if(!byId.has(id)){
        if(byId.size>=MAX_EVIDENCE+MAX_OBSERVABLES+1)return;
        const node={id,label:value.slice(0,120),kind,evidence_ids:[],
          verification:'not_independently_verified'};
        byId.set(id,node);nodes.push(node);
      }
      const node=byId.get(id);
      if(!node.evidence_ids.includes(e.id))node.evidence_ids.push(e.id);
      const key=e.id+'|'+id+'|'+relation;
      if(!addedEdges.has(key)){
        addedEdges.add(key);
        edges.push({id:key,source:'evidence:'+e.id,target:id,
          evidence_id:e.id,relation,verification:status||'unverified'});
      }
    }
    for(const e of source){
      if(!e||typeof e!=='object'||typeof e.id!=='string'||!e.id||e.id.length>130)continue;
      const evidId='evidence:'+e.id;
      if(byId.has(evidId))continue;
      const kind=typeof e.kind==='string'?e.kind.slice(0,30):'note';
      const node={id:evidId,label:normal(e.title).slice(0,120)||'Evidência',
        kind:'evidence',evidence_id:e.id,evidence_kind:kind,
        sha256:normal(e.sha256).slice(0,64),
        evidence_ids:[e.id],verification:'record_only'};
      byId.set(evidId,node);nodes.push(node);
      edges.push({id:'registered:'+e.id,source:'case:'+caseId,target:evidId,
        evidence_id:e.id,relation:'registrado no caso',verification:'organizational'});

      const cap=e.capture;
      if(kind==='capture'&&cap?.format==='protocolo-osint/capture-v1'){
        const hash=normal(cap.sha256_bytes).toLowerCase();
        if(HASH.test(hash))observable(e,'sha256',hash,'hash informado do arquivo armazenado','local_hash_recheck_required');
        const h=hostname(cap.source_url);
        if(h)observable(e,'domain',h,cap.source_url_declared
          ?'domínio de origem declarado manualmente'
          :'domínio de URL consultada via navegador','unverified_origin');
      }else if(kind==='reference'&&typeof e.url==='string'){
        const h=hostname(e.url);
        if(h)observable(e,'domain',h,'domínio citado como referência','unverified_source');
      }
      const p=e.provenance;
      if(p?.type==='engine_observation'){
        const value=normal(p.target);
        const k=normal(p.target_kind).toLowerCase()||'auto';
        // The searched target is a CONTEXT, never a discovered property.
        if(value&&value.length<=253&&/^(username|domain|url|email|ip|cidr|asn|phone|name|bitcoin|auto)$/.test(k)){
          observable(e,'query',k+':'+value,'alvo fornecido à pesquisa','query_context_only');
        }
        const host=observableFromLine(p.raw_record);
        if(host)observable(e,'domain',host,'domínio textual na saída do motor','unverified_engine_output');
      }
    }
    for(const n of nodes){
      if(n.kind==='case'||n.kind==='evidence'||n.evidence_ids.length<2)continue;
      shared.set(n.id,{id:n.id,label:n.label,kind:n.kind,
        evidence_ids:[...n.evidence_ids],count:n.evidence_ids.length});
    }
    return {nodes,edges,case_id:caseId,
      repeated_observables:[...shared.values()].sort((a,b)=>b.count-a.count).slice(0,60),
      stats:{evidence:nodes.filter(n=>n.kind==='evidence').length,
        observable:nodes.filter(n=>n.kind!=='case'&&n.kind!=='evidence').length,
        relations:edges.length,shared:shared.size},
      scope:'local-structured-evidence',external_requests:0,
      truncated:caseData.evidence.length>MAX_EVIDENCE,
      notice:'Associações de campos estruturados, não identidade confirmada; hash de arquivo requer conferência independente.'};
  }
  const api=Object.freeze({build,hostname,observableFromLine});
  root.ProtocoloEvidenceGraph=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
