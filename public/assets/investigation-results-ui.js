/* Investigation results V3.1 — real, allowlisted provider/worker responses.
 * No scraping, arbitrary URL fetch, phantom counts, or automatic job submission.
 */
(function(root){
  'use strict';
  const d=root.document,model=root.ProtocoloInvestigationReport;
  const stage=d?.querySelector('.wf-stage[data-wf-stage="3"]');
  if(!stage||!model)return;
  const q=(s,base=d)=>base.querySelector(s);
  const el=(tag,cls,value)=>{const node=d.createElement(tag);if(cls)node.className=cls;
    if(value!==undefined)node.textContent=String(value);return node;};
  const box=el('section','ir-panel');box.id='ir-panel';
  box.setAttribute('aria-label','Resultados reais de consultas públicas');
  box.innerHTML='<div class="ir-top"><div><span class="eyebrow">CONSULTA REAL · FONTES PÚBLICAS</span>'+
    '<h3>Resultados no próprio sistema</h3>'+
    '<p>Um clique consulta os provedores suportados. Contamos registros retornados, não páginas de toda a Internet.</p></div></div>'+
    '<div class="ir-buttons">'+
    '<button type="button" class="button primary-button" id="ir-run">Consultar fontes públicas</button>'+
    '<button type="button" class="button ghost-button" id="ir-engines">Ampliar com motores autorizados</button></div>'+
    '<div id="ir-status" role="status" aria-live="polite">Informe o alvo nas etapas anteriores. Consultas externas só começam após seu clique.</div>'+
    '<div id="ir-summary" class="ir-summary" hidden></div>'+
    '<div id="ir-list" class="ir-list"></div>'+
    '<div id="ir-actions" class="ir-actions" hidden>'+
    '<button type="button" class="button primary-button" id="ir-pdf">Baixar relatório PDF</button>'+
    '<button type="button" class="button ghost-button" id="ir-save">Salvar resultados no cofre (opcional)</button>'+
    '<button type="button" class="button ghost-button" id="ir-refresh" hidden>Atualizar motores pendentes</button></div>'+
    '<p class="ir-limits">As fontes apresentadas têm limites e podem falhar. Um registro retornado não prova identidade, autoria nem cobertura completa. O PDF não é criptografado.</p>';
  const caseSettings=q('.cb-case-settings',stage);
  if(caseSettings)caseSettings.before(box);else stage.append(box);
  const status=q('#ir-status',box),list=q('#ir-list',box),summary=q('#ir-summary',box),
    actions=q('#ir-actions',box),runButton=q('#ir-run',box),engineButton=q('#ir-engines',box),
    pdfButton=q('#ir-pdf',box),saveButton=q('#ir-save',box),refreshButton=q('#ir-refresh',box);
  const vault=()=>typeof browserVault!=='undefined'?browserVault:null;
  const unlocked=()=>{try{return !!vault()?.status().unlocked}catch{return false}};
  const date=()=>new Date().toISOString();
  let run=null,signature='',busy=false,engineBusy=false,pollEpoch=0,engineJobs=[],lastSavedId='';
  const formTarget=()=>q('#cb-query')?.value.trim()||'';
  const selectedKind=()=>q('#cb-kind')?.value||'auto';
  function config(){
    const value=formTarget(),kind=selectedKind();
    let type=kind,query=value,notice='';
    if(kind==='auto'){
      if(/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(value))type='domain';
      else if(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(value))type='username_candidate';
      else type='free_text';
    }
    if(kind==='url'){
      try{const u=new URL(value);if(u.protocol==='https:'&&u.hostname&&
          /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(u.hostname)){
        query=u.hostname;type='domain';notice='Somente o domínio do endereço será consultado.'}
      }catch{type='url'}
    }
    const providers=type==='domain'?[['dns','DNS público'],['certificates','Certificados TLS']]:
      type==='username_candidate'?[['github','Perfil público do GitHub']]:[];
    const engineKind=type==='username_candidate'?'username':
      type==='free_text'&&value.includes(' ')?'name':
      ['domain','email','ip','url'].includes(type)?type:'auto';
    return {value,kind,type,query,providers,notice,engineKind};
  }
  const sig=()=>JSON.stringify([formTarget(),selectedKind()]);
  function invalidate(){
    if(!run&&!engineJobs.length)return;
    if(sig()===signature)return;
    pollEpoch++;run=null;engineJobs=[];lastSavedId='';
    list.replaceChildren();summary.hidden=true;actions.hidden=true;refreshButton.hidden=true;
    status.textContent='Alvo ou critério alterado. Consulte novamente para obter resultados correspondentes.';
  }
  function startRun(cfg){
    signature=sig();run={format:'protocolo-osint/investigation-run-v1',
      target:cfg.value,kind:cfg.type,observed_at:date(),sources:[]};
    engineJobs=[];lastSavedId='';list.replaceChildren();render();
  }
  function render(){
    if(!run){actions.hidden=true;summary.hidden=true;return}
    const stats=model.summary(run);
    summary.hidden=false;summary.textContent=stats.with_records+' fonte(s) com registros · '+
      stats.no_records+' sem registros retornados · '+stats.failed+' falha(s) · '+
      stats.pending+' pendente(s) · '+stats.returned+' registro(s) retornado(s)';
    actions.hidden=run.sources.length===0;
    refreshButton.hidden=!engineJobs.some(j=>j.pending);
    saveButton.disabled=!unlocked()||!run.sources.length||!!lastSavedId;
    saveButton.title=!unlocked()?'Abra o cofre em Meus casos antes de salvar.':
      lastSavedId?'Relatório já registrado neste caso':'Salvar uma cópia criptografada desta consulta';
    pdfButton.disabled=!run.sources.length;
    list.replaceChildren();
    const labels={observed:'Registros retornados',completed:'Saída retornada',
      no_result:'Nenhum registro retornado',failed:'Falha na consulta',
      pending:'Pendente',unavailable:'Não disponível'};
    for(const source of run.sources){
      const card=el('article','ir-source ir-'+source.status);
      const head=el('div','ir-source-head'),h=el('strong','',source.label);
      const badge=el('span','ir-state',labels[source.status]||source.status);
      head.append(h,badge);card.append(head);
      const countText=Number.isSafeInteger(source.count)?
        source.count+' registro(s) retornado(s) nesta consulta':
        'Quantidade não confirmada';
      card.append(el('small','ir-count',countText));
      if(source.notice)card.append(el('p','ir-source-note',source.notice));
      if(source.source_url){
        const link=el('a','ir-source-link','Abrir fonte original');
        link.href=source.source_url;link.target='_blank';link.rel='noopener noreferrer';card.append(link);
      }
      if(source.job_id)card.append(el('small','ir-job','Tarefa: '+source.job_id.slice(0,12)));
      if(source.items.length){
        const details=el('details','ir-records'),sum=el('summary','',
          'Ver '+source.items.length+' registro(s) retornado(s)');
        details.append(sum);
        for(const record of source.items){
          const row=el('div','ir-record');
          const text=typeof record==='string'?record:JSON.stringify(record);
          row.append(el('span','',text.slice(0,540)));
          const match=text.match(/https:\/\/[^\s"<>\u0000-\u001f]{5,200}/);
          const url=match?model.safeLink(match[0].replace(/[.,;)]$/,'')):'';
          if(url){const link=el('a','','Abrir referência');link.href=url;
            link.target='_blank';link.rel='noopener noreferrer';row.append(link)}
          details.append(row);
        }
        card.append(details);
      }
      list.append(card);
    }
  }
  const sleep=ms=>new Promise(r=>root.setTimeout(r,ms));
  async function request(path,body,limit=18000){
    const controller=new AbortController();
    const timeout=root.setTimeout(()=>controller.abort(),limit);
    try{
      const result=await fetch(path,{method:body?'POST':'GET',
        headers:body?{'Content-Type':'application/json',...body.headers}:undefined,
        body:body?JSON.stringify(body.data):undefined,credentials:'same-origin',
        cache:'no-store',redirect:'error',signal:controller.signal});
      const data=await result.json().catch(()=>({}));
      if(!result.ok)throw Error(String(data.detail||'HTTP '+result.status).slice(0,180));
      return data;
    }finally{root.clearTimeout(timeout)}
  }
  async function publicScan(){
    if(busy||engineBusy)return;
    const cfg=config();
    if(cfg.value.length<2||cfg.value.length>240){
      status.textContent='Informe um alvo entre 2 e 240 caracteres.';q('#cb-query')?.focus();return}
    if(!cfg.providers.length){
      status.textContent='Para esse critério não há provedor público automático homologado. '+
        'Não será exibido zero fictício. Os motores autenticados podem ter capacidades adicionais.';
      return;
    }
    if(!root.confirm('Consultar '+cfg.providers.map(p=>p[1]).join(' e ')+
      ' para '+cfg.query+'? O alvo será enviado aos provedores públicos.'))return;
    busy=true;runButton.disabled=true;startRun(cfg);
    status.textContent='Consultando '+cfg.providers.length+' provedor(es) real(is)… '+cfg.notice;
    const seq=signature;
    try{
      await Promise.all(cfg.providers.map(async ([id,label])=>{
        let entry;
        try{
          const response=await request('/api/v1/lookup',{data:{value:cfg.query,provider:id}},16000);
          entry=model.normalizeLookup(id,response,cfg.query);
        }catch(error){entry=model.failure(id,label,error)}
        if(signature!==seq||sig()!==seq)return;
        run.sources.push(entry);render();
      }));
      if(signature===seq&&sig()===seq)
        status.textContent='Consulta encerrada. Veja os registros por provedor. '+
          'Falhas não contam como ausência de resultados; baixe o PDF ou salve no cofre.';
    }finally{busy=false;runButton.disabled=false}
  }
  async function checkJobs(once=false){
    if(!run||!engineJobs.length)return;
    const epoch=++pollEpoch,original=signature;
    refreshButton.disabled=true;
    try{
      for(let round=0;round<(once?1:12);round++){
        if(epoch!==pollEpoch||sig()!==original)return;
        if(round)await sleep(5000);
        if(d.hidden&&!once)continue;
        for(const j of engineJobs.filter(x=>x.pending)){
          try{
            const response=await request('/api/v1/operator/jobs/'+encodeURIComponent(j.job_id),null,15000);
            if(epoch!==pollEpoch||sig()!==original)return;
            const normalized=model.normalizeEngine(j,response);
            const index=run.sources.findIndex(x=>x.job_id===j.job_id);
            if(index>=0)run.sources[index]=normalized;
            j.pending=normalized.status==='pending';
          }catch(error){
            j.lastError=String(error.message).slice(0,180);
            if(/401|403|404/.test(j.lastError))j.pending=false;
          }
          render();
        }
        if(engineJobs.every(x=>!x.pending))break;
      }
      if(epoch===pollEpoch){
        const pending=engineJobs.filter(x=>x.pending).length;
        status.textContent=pending?pending+' tarefa(s) ainda pendentes. Use “Atualizar motores pendentes” mais tarde.':
          'Tarefas consultadas. Registros retornados são observações não verificadas.';
      }
    }finally{refreshButton.disabled=false;render()}
  }
  async function engineScan(){
    if(busy||engineBusy)return;
    const cfg=config();
    if(cfg.value.length<2||cfg.value.length>253){status.textContent='Informe um alvo válido.';return}
    engineBusy=true;engineButton.disabled=true;
    try{
      const auth=await request('/api/v1/auth/status',null,12000);
      if(!auth.configured||!auth.authenticated||!auth.csrf){
        status.replaceChildren(el('span','',
          'Execução de motores exige login GitHub autorizado e Daemon disponível. '));
        const link=el('a','ir-source-link','Entrar com GitHub');
        link.href='/api/v1/auth/github/start';status.append(link);return;
      }
      if(!root.confirm('Executar motores OSINT compatíveis para "'+cfg.value+
        '"? Uma operação pode consumir recursos do Daemon e consultar serviços externos.'))return;
      if(!run||signature!==sig())startRun(cfg);
      const response=await request('/api/v1/operator/search',{
        headers:{'X-OSINT-CSRF':auth.csrf},
        data:{value:cfg.value,target_kind:cfg.engineKind,engine:'auto',include_spiderfoot:true}
      },19000);
      if(!Array.isArray(response.jobs)||!response.jobs.length)
        throw Error('Nenhuma tarefa aceita pelo worker.');
      const jobs=response.jobs.slice(0,3).filter(j=>
        /^[a-f0-9]{32}$/.test(String(j.job_id))&&
        ['sherlock','maigret','subfinder','amass','spiderfoot'].includes(j.engine));
      for(const job of jobs){
        engineJobs.push({...job,pending:true});
        run.sources.push(model.normalizeEngine(job,{status:'pending'}));
      }
      render();
      status.textContent=jobs.length+' tarefa(s) aceitas. Buscando registros no armazenamento privado…';
      await checkJobs();
    }catch(error){status.textContent='Motores não iniciados ou indisponíveis: '+error.message}
    finally{engineBusy=false;engineButton.disabled=false}
  }
  async function saveRun(){
    if(!run||!run.sources.length){status.textContent='Consulte as fontes antes de salvar resultados.';return}
    if(!unlocked()){status.textContent='Desbloqueie o cofre em Meus casos. O PDF funciona sem cofre.';return}
    let caseId=q('#cb-case')?.value||'';
    try{
      saveButton.disabled=true;
      if(caseId==='__new__'){
        const title=q('#cb-new-case-title')?.value.trim()||'';
        if(title.length<2||title.length>120)throw Error('Informe o nome do novo caso.');
        const record=await vault().createCase(title,'');
        caseId=record.id;
        d.dispatchEvent(new CustomEvent('protocolo:case-created',{detail:{caseId}}));
      }
      if(!caseId)throw Error('Selecione ou crie um caso na etapa 4.');
      const snapshot=await vault().saveInvestigationRun(caseId,run);
      lastSavedId=snapshot.id;
      status.textContent='Resultados retornados foram salvos no cofre, no caso selecionado. '+ 
        'Reabra em Meus casos → Resultados. PDF disponível separadamente.';
      render();
    }catch(error){status.textContent='Não foi possível salvar os resultados: '+error.message}
    finally{saveButton.disabled=!!lastSavedId||!unlocked()}
  }
  runButton.addEventListener('click',()=>publicScan().catch(e=>status.textContent=e.message));
  engineButton.addEventListener('click',()=>engineScan().catch(e=>status.textContent=e.message));
  refreshButton.addEventListener('click',()=>checkJobs(true).catch(e=>status.textContent=e.message));
  pdfButton.addEventListener('click',()=>{
    try{model.downloadPdf(run);status.textContent='PDF gerado a partir dos registros retornados. O arquivo não é criptografado.'}
    catch(error){status.textContent='Falha ao gerar PDF: '+error.message}
  });
  saveButton.addEventListener('click',saveRun);
  for(const name of ['#cb-query','#cb-kind'])
    q(name)?.addEventListener('input',invalidate);
  root.addEventListener('protocolo:vault-change',render);
  root.ProtocoloInvestigationUI=Object.freeze({
    view:()=>({run:run?JSON.parse(JSON.stringify(run)):null,
      summary:run?model.summary(run):null}),
    publicScan
  });
})(typeof globalThis!=='undefined'?globalThis:this);
