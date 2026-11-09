/* Protocolo OSINT · normalized engine observations (no scraping, no identity claims).
 * An engine CLI line is untrusted text. It is never HTML, and its upstream
 * project homepage is not proof of the line's source or authenticity.
 */
(function (root) {
  'use strict';
  const ENGINES=Object.freeze(['sherlock','maigret','subfinder','amass','spiderfoot']);
  const JOB=/^[0-9a-f]{32}$/;
  const plain=value=>typeof value==='string'?value:'';
  function normalize(job,response,context={}){
    if(!job || !response || typeof job!=='object' || typeof response!=='object')
      return [];
    if(!ENGINES.includes(job.engine) || !JOB.test(job.job_id) ||
       response.job_id !== job.job_id || response.engine !== job.engine ||
       response.status!=='completed')return [];
    const target=plain(context.target).trim();
    if(target.length<2 || target.length>253)return [];
    const kind=plain(context.kind).slice(0,32);
    const observed=plain(response.observed_at||response.completed_at);
    const observedAt=Number.isFinite(Date.parse(observed))?observed:null;
    const source=plain(response.source).slice(0,240);
    const rows=Array.isArray(response.records)?response.records:[];
    const seen=new Set(),items=[];
    for(const raw of rows){
      if(typeof raw!=='string')continue;
      const text=raw.trim();
      if(!text || text.length>400 || seen.has(text))continue;
      seen.add(text);
      items.push(Object.freeze({
        engine:job.engine,job_id:job.job_id,target,target_kind:kind,
        raw_record:text,observed_at:observedAt,tool_source:source,
        // This is the user's interpretation of a raw CLI line, not a
        // verification of a person or remote provider.
        verification:'unverified',capture_method:'daemon-output'
      }));
      if(items.length>=120)break;
    }
    return items;
  }
  const api=Object.freeze({normalize,ENGINES,JOB});
  root.ProtocoloEngineFindings=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
