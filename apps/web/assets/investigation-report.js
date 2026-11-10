/* Observed investigation model and dependency-free, downloadable PDF.
 * Prepared links are NOT findings. Every count is scoped to returned records.
 */
(function(root){
  'use strict';
  const trim=(v,max=300)=>String(v==null?'':v).trim().slice(0,max);
  const arr=v=>Array.isArray(v)?v:[];
  const safeLink=value=>{
    try{
      const u=new URL(String(value||''));
      return u.protocol==='https:'&&!u.username&&!u.password&&u.hostname&&!/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(u.hostname)?u.toString().slice(0,1600):'';
    }catch{return ''}
  };
  const validDate=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():'';
  const statuses=new Set(['observed','no_result','failed','pending','unavailable','completed','partial']);
  function normalizeLookup(provider,response,query){
    if(!response||typeof response!=='object'||response.provider!==provider||
       response.query!==query||!['observed','no_result'].includes(response.status))
      throw Error('Resposta inesperada da fonte '+provider+'.');
    const items=arr(response.items).slice(0,40).map(item=>{
      if(!item||typeof item!=='object')return null;
      const out={};
      for(const [key,value] of Object.entries(item).slice(0,12)){
        if(!/^[a-z_]{1,24}$/i.test(key))continue;
        if(typeof value==='string')out[key]=trim(value,500);
        else if(typeof value==='number'&&Number.isFinite(value))out[key]=value;
      }
      return out;
    }).filter(Boolean);
    return {id:trim(provider,32),label:trim(response.provider_name||provider,80),
      status:items.length?'observed':'no_result',count:items.length,items,
      source_url:safeLink(response.source_url),
      observed_at:validDate(response.observed_at),
      notice:'Registros retornados pela API; não representam o total de páginas da web nem confirmam identidade.'};
  }
  function failure(id,label,error){
    return {id:trim(id,32),label:trim(label,80),status:'failed',
      count:null,items:[],source_url:'',observed_at:new Date().toISOString(),
      notice:trim(error instanceof Error?error.message:error,220)||'Consulta indisponível'};
  }
  function normalizeEngine(job,response){
    const status=String(response?.status||'pending').toLowerCase();
    const records=status==='completed'?arr(response.records).slice(0,80)
      .filter(x=>typeof x==='string').map(x=>trim(x,400)):[];
    return {id:trim(job.engine,32),label:trim(job.engine,80),
      status:status==='completed'?'completed':status==='failed'?'failed':'pending',
      count:status==='completed'?records.length:null,items:records,
      job_id:trim(job.job_id,64),source_url:'',
      observed_at:validDate(response?.completed_at),
      notice:status==='failed'?trim(response.error||'Motor falhou; resultado não confirmado.',200):
        status==='completed'?'Saída do motor. Origem e titularidade não verificadas.':
        'Tarefa pendente; ainda não é resultado.'};
  }
  function summary(run){
    const sources=arr(run?.sources);
    return {
      sources:sources.length,
      checked:sources.filter(x=>['observed','no_result','completed'].includes(x.status)).length,
      with_records:sources.filter(x=>['observed','completed'].includes(x.status)&&x.count>0).length,
      no_records:sources.filter(x=>['no_result','completed'].includes(x.status)&&x.count===0).length,
      failed:sources.filter(x=>x.status==='failed').length,
      pending:sources.filter(x=>x.status==='pending').length,
      returned:sources.reduce((n,x)=>n+(Number.isSafeInteger(x.count)&&x.count>=0?x.count:0),0)
    };
  }
  function fingerprint(run){
    return JSON.stringify({target:run.target,kind:run.kind,sources:arr(run.sources).map(s=>
      [s.id,s.job_id||'',s.status,s.count,s.observed_at])});
  }
  // PDF/WinAnsi. Replaces characters unsupported by built-in Helvetica.
  const ascii=v=>String(v||'').replace(/[–—]/g,'-').replace(/[“”]/g,'"')
    .replace(/[‘’]/g,"'").replace(/…/g,'...').replace(/[\u2022\u25CF]/g,'-')
    .normalize('NFC').replace(/[^\x20-\x7e\u00a0-\u00ff]/g,'?');
  const escapePDF=v=>ascii(v).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
  function pdfBytes(run){
    if(!run||typeof run!=='object'||!Array.isArray(run.sources)||run.sources.length>65)
      throw Error('Relatório de investigação inválido.');
    const lines=[],line=(text,link='')=>lines.push({text:trim(text,420),link:safeLink(link)});
    const stats=summary(run);
    line('PROTOCOLO OSINT V2 | RELATORIO DE INVESTIGACAO PUBLICA');
    line('Documento preliminar. Resultados e candidatos sujeitos a verificacao independente.');
    line('Alvo: '+trim(run.target,253)+'   Tipo: '+trim(run.kind,32));
    line('Consulta iniciada: '+(validDate(run.observed_at)||'nao informada'));
    line('FONTES: '+run.sources.length+' entradas · '+stats.checked+' efetivamente consultadas');
    line('Com registros: '+stats.with_records+' | Sem registros retornados: '+stats.no_records+
      ' | Falhas: '+stats.failed+' | Pendentes: '+stats.pending);
    line('NAO consultadas manualmente: '+run.sources.filter(x=>x.status==='not_queried').length+
      ' | Incompativeis: '+run.sources.filter(x=>x.status==='incompatible').length);
    line('Registros retornados (limitados por provedor): '+stats.returned);
    line('Contagens nao indicam total de resultados na Internet nem identidade comprovada.');
    line('');
    for(const [idx,s] of run.sources.entries()){
      const statusName={
        observed:'REGISTROS RETORNADOS',no_result:'SEM REGISTROS RETORNADOS',
        completed:'SAIDA DE MOTOR',failed:'FALHA DE CONSULTA',
        pending:'PENDENTE',not_queried:'NAO CONSULTADA',
        incompatible:'INCOMPATIVEL',unavailable:'INDISPONIVEL'
      }[s.status]||trim(s.status,30);
      line((idx+1)+'. '+trim(s.label||s.id,65)+' | '+statusName+
        ' | '+(Number.isSafeInteger(s.count)?s.count+' registro(s)':'sem contagem confirmada'));
      if(s.observed_at)line('   Observado: '+trim(s.observed_at,40));
      if(s.job_id)line('   Tarefa: '+trim(s.job_id,64));
      if(s.source_url)line('   Abrir fonte original (clique aqui): '+trim(s.source_url,70),s.source_url);
      if(s.query_url)line('   Abrir pesquisa preparada (NAO executada): '+
        trim(s.query_url,65),s.query_url);
      if(s.status==='not_queried')line('   IMPORTANTE: nao houve GET/API nesta fonte. Link manual apenas.');
      if(s.notice)line('   Nota: '+trim(s.notice,170));
      for(const item of arr(s.items).slice(0,40)){
        if(typeof item==='string'){
          const text=trim(item,190);
          const match=text.match(/https:\/\/[^\s"<>]{5,200}/);
          line('     '+text,match?match[0].replace(/[.,;)]$/,''):'');
          continue;
        }
        if(!item||typeof item!=='object')continue;
        const head=trim(item.display_name||item.label||item.login||item.name||
          item.data||item.id||'Registro sem rotulo',100);
        const detail=[
          item.description, item.type,
          item.data!=null?'Dado: '+item.data:'',
          item.works_count!=null?'Trabalhos: '+item.works_count:'',
          item.ttl!=null?'TTL: '+item.ttl:''
        ].filter(Boolean).map(x=>trim(x,110)).join(' | ');
        const url=safeLink(item.profile_url||item.entity_url||item.author_url||'');
        line('     '+head+(detail?' | '+detail:''),url);
        if(url)line('       Abrir perfil ou referencia (clique): '+trim(url,65),url);
      }
      if(arr(s.items).length>40)line('     [Outros registros omitidos no PDF]');
      line('');
    }
    line('LIMITES: consulta autorizada; apenas endpoints suportados; falha/ausencia nao prova inexistencia.');
    line('Sem captura forense das paginas externas, assinatura independente ou cadeia de custodia.');
    line('Este PDF nao e criptografado. Guarde e compartilhe com cuidado.');
    const rows=[];
    for(const entry of lines){
      const txt=ascii(entry.text).slice(0,190);
      if(txt.length<=92){rows.push({text:txt,link:entry.link});continue}
      let remaining=txt,first=true;
      while(remaining.length){
        const length=remaining.length<=92?remaining.length:Math.max(40,remaining.lastIndexOf(' ',92));
        rows.push({text:(first?'':'     ')+remaining.slice(0,length).trim(),link:first?entry.link:''});
        remaining=remaining.slice(length).trim();first=false;
      }
    }
    const pages=[],perPage=44;
    for(let i=0;i<rows.length;i+=perPage)pages.push(rows.slice(i,i+perPage));
    if(!pages.length)pages.push([{text:'Nenhum registro.',link:''}]);
    const obj=[null],reserve=()=>{obj.push('');return obj.length-1};
    const catalog=reserve(),pagesId=reserve(),font=reserve();
    obj[font]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    const pageRefs=[];
    for(const [pi,page] of pages.entries()){
      const pageId=reserve(),contentId=reserve(),annotations=[];
      let stream='';
      for(const [i,row] of page.entries()){
        const y=779-i*16;
        stream+='BT /F1 10 Tf 44 '+y+' Td ('+escapePDF(row.text)+') Tj ET\n';
        if(row.link){
          const annot=reserve(),uri=escapePDF(row.link);
          obj[annot]='<< /Type /Annot /Subtype /Link /Rect [42 '+(y-3)+' 550 '+(y+13)+
            '] /Border [0 0 0] /A << /S /URI /URI ('+uri+') >> >>';
          annotations.push(annot+' 0 R');
        }
      }
      obj[contentId]='<< /Length '+stream.length+' >>\nstream\n'+stream+'endstream';
      obj[pageId]='<< /Type /Page /Parent '+pagesId+' 0 R /MediaBox [0 0 595 842] '+
        '/Resources << /Font << /F1 '+font+' 0 R >> >> /Contents '+contentId+' 0 R '+
        '/Annots ['+annotations.join(' ')+'] >>';
      pageRefs.push(pageId+' 0 R');
    }
    obj[catalog]='<< /Type /Catalog /Pages '+pagesId+' 0 R >>';
    obj[pagesId]='<< /Type /Pages /Kids ['+pageRefs.join(' ')+'] /Count '+pageRefs.length+' >>';
    let text='%PDF-1.4\n',offsets=[0];
    for(let id=1;id<obj.length;id++){
      offsets[id]=text.length;
      text+=id+' 0 obj\n'+obj[id]+'\nendobj\n';
    }
    const start=text.length;
    text+='xref\n0 '+obj.length+'\n0000000000 65535 f \n';
    for(let id=1;id<obj.length;id++)text+=String(offsets[id]).padStart(10,'0')+' 00000 n \n';
    text+='trailer\n<< /Size '+obj.length+' /Root '+catalog+
      ' 0 R >>\nstartxref\n'+start+'\n%%EOF\n';
    return Uint8Array.from(text,ch=>ch.charCodeAt(0));
  }
  function downloadPdf(run){
    if(!root.document||!root.Blob||!root.URL?.createObjectURL)
      throw Error('Download PDF não disponível neste navegador.');
    const bytes=pdfBytes(run),blob=new root.Blob([bytes],{type:'application/pdf'});
    const href=root.URL.createObjectURL(blob);
    const a=root.document.createElement('a');
    const safe=trim(run.target,80).replace(/[^a-z0-9_.-]/gi,'-').slice(0,45)||'consulta';
    a.href=href;a.download='protocolo-osint-'+safe+'.pdf';
    root.document.body.append(a);a.click();a.remove();
    // Revoke on later user interaction via microtask? Browser may still need URL.
    root.setTimeout(()=>root.URL.revokeObjectURL(href),30000);
  }
  const api={normalizeLookup,normalizeEngine,failure,summary,fingerprint,pdfBytes,downloadPdf,safeLink};
  root.ProtocoloInvestigationReport=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
