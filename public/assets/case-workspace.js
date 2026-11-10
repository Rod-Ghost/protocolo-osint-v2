/* Case Workspace V2.7: additive, browser-local case review.
 * No new persistence, network calls, scans or changes to case CRUD.
 */
(function(root){
  'use strict';
  const arr=x=>Array.isArray(x)?x:[];
  const date=x=>{const n=Date.parse(x||'');return Number.isFinite(n)?n:null};
  const str=x=>typeof x==='string'?x.slice(0,260):'';
  function view(caseData){
    const c=caseData||{},ev=arr(c.evidence),plans=arr(c.search_plans),events=[];
    const add=(at,kind,title,id,detail)=>{const time=date(at);if(time!==null)events.push({time,kind,title:str(title),id:str(id),detail:str(detail)})};
    add(c.created_at,'case','Investigação criada',c.id,'Registro local');
    for(const e of ev)add(e.created_at,'evidence',e.title||'Registro',e.id,e.provenance?.type==='engine_observation'?'Observação de motor não verificada':'Registro documentado');
    for(const p of plans){
      add(p.created_at,'plan',p.title||'Plano de pesquisa',p.id,'Plano salvo no cofre');
      for(const r of arr(p.reviews))add(r.observed_at,'review',p.title||'Revisão de plano',r.id,'Revisão manual não verificada');
    }
    events.sort((a,b)=>b.time-a.time||a.kind.localeCompare(b.kind));
    const runs=arr(c.investigation_runs);
    for(const run of runs)add(run.saved_at,'results','Relatório de consultas: '+str(run.target),run.id,'Resultados de provedores guardados no cofre');
    events.sort((a,b)=>b.time-a.time||a.kind.localeCompare(b.kind));
    return {id:str(c.id),title:str(c.title),description:str(c.description),evidence:ev,
      plans,runs,events,counts:{evidence:ev.length,plans:plans.length,reviews:plans.reduce((n,p)=>n+arr(p.reviews).length,0),reports:runs.length}};
  }
  const api={view};
  root.ProtocoloCaseWorkspaceModel=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(!root.document)return;
  const d=root.document,legacy=d.getElementById('case-detail'),caseList=d.getElementById('case-list'),panel=d.getElementById('panel-cases');
  if(!legacy||!caseList||!panel)return;
  const workspace=d.createElement('section');
  workspace.id='case-workspace';workspace.className='cw-workspace';
  workspace.setAttribute('aria-label','Área investigativa do caso selecionado');
  workspace.innerHTML='<div class="cw-heading"><div><span class="eyebrow">WORKSPACE INVESTIGATIVO · ETAPA 3</span><h2 id="cw-title">Painel do caso</h2><p id="cw-subtitle">Selecione uma investigação para visualizar seus registros locais organizados.</p></div><span class="cw-scope">Dados do cofre neste navegador</span></div>'+
  '<div class="cw-tabs" role="tablist" aria-label="Visões do caso">'+
  '<button type="button" role="tab" id="cw-tab-overview" aria-controls="cw-pane" data-cw-tab="overview" aria-selected="true" tabindex="0">Resumo</button>'+
  '<button type="button" role="tab" id="cw-tab-timeline" aria-controls="cw-pane" data-cw-tab="timeline" aria-selected="false" tabindex="-1">Linha do tempo</button>'+
  '<button type="button" role="tab" id="cw-tab-evidence" aria-controls="cw-pane" data-cw-tab="evidence" aria-selected="false" tabindex="-1">Evidências</button>'+
  '<button type="button" role="tab" id="cw-tab-plans" aria-controls="cw-pane" data-cw-tab="plans" aria-selected="false" tabindex="-1">Planos</button>'+
  '<button type="button" role="tab" id="cw-tab-results" aria-controls="cw-pane" data-cw-tab="results" aria-selected="false" tabindex="-1">Resultados</button></div>'+
  '<div id="cw-pane" role="tabpanel" tabindex="0" aria-labelledby="cw-tab-overview" aria-live="polite"><p class="cw-empty">Selecione um caso na lista.</p></div>'+
  '<p class="cw-footnote">Histórico local, não monitoramento externo. Vínculos documentais não comprovam identidade ou autenticidade. Os controles originais de registros, capturas e relatórios permanecem abaixo.</p>';
  const layout=panel.querySelector('.case-layout');
  if(!layout)return;
  layout.before(workspace);
  const title=workspace.querySelector('#cw-title'),subtitle=workspace.querySelector('#cw-subtitle'),pane=workspace.querySelector('#cw-pane');
  const tabs=[...workspace.querySelectorAll('[data-cw-tab]')];
  let active='overview',currentId='',current=null,sequence=0;
  const el=(tag,cls,text)=>{const e=d.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e};
  const fmt=ms=>new Date(ms).toLocaleString('pt-BR');
  const vault=()=>typeof browserVault!=='undefined'?browserVault:null;
  const unlocked=()=>{try{return Boolean(vault()?.status().unlocked)}catch{return false}};
  function blank(message){
    pane.replaceChildren(el('p','cw-empty',message));
  }
  function item(label,body,meta){
    const e=el('article','cw-item');e.append(el('strong','',label));
    if(body)e.append(el('p','',body));
    if(meta)e.append(el('small','',meta));
    return e;
  }
  function render(){
    if(!unlocked()){title.textContent='Painel do caso';subtitle.textContent='Desbloqueie o cofre para consultar o workspace.';blank('Dados protegidos. Nenhum detalhe é exibido enquanto o cofre estiver bloqueado.');return}
    if(!current){title.textContent='Painel do caso';subtitle.textContent='Selecione uma investigação na lista.';blank('Nenhum caso selecionado.');return}
    title.textContent=current.title||'Investigação';
    subtitle.textContent=current.description||'Escopo não informado.';
    const list=el('div','cw-list');
    if(active==='overview'){
      const metrics=el('div','cw-metrics');
      for(const [n,label] of [[current.counts.evidence,'Registros'],[current.counts.plans,'Planos'],[current.counts.reviews,'Revisões manuais'],[current.counts.reports,'Relatórios']]){
        const m=el('div','cw-metric');m.append(el('b','',n),el('span','',label));metrics.append(m);
      }
      list.append(metrics,item('Atividade mais recente',current.events[0]?.title||'Nenhuma atividade registrada',current.events[0]?fmt(current.events[0].time):''));
    }else if(active==='timeline'){
      if(!current.events.length)list.append(el('p','cw-empty','Nenhuma atividade documentada.'));
      for(const e of current.events.slice(0,100))list.append(item(e.title,e.detail,fmt(e.time)+' · '+e.kind));
    }else if(active==='evidence'){
      if(!current.evidence.length)list.append(el('p','cw-empty','Nenhum registro neste caso.'));
      for(const e of current.evidence.slice(0,250)){
        const card=item(str(e.title)||'Registro',e.provenance?.type==='engine_observation'?'Observação do motor — não verificada':str(e.note).slice(0,180),[str(e.kind),date(e.created_at)!==null?fmt(date(e.created_at)):'sem data','ID: '+str(e.id)].join(' · '));
        list.append(card);
      }
    }else if(active==='plans'){
      if(!current.plans.length)list.append(el('p','cw-empty','Nenhum plano de pesquisa salvo.'));
      for(const p of current.plans.slice(0,30))list.append(item(str(p.title)||'Plano',str(p.query),arr(p.reviews).length+' revisões manuais · '+arr(p.source_ids).length+' fontes escolhidas'));
    }else if(active==='results'){
      if(!current.runs.length)list.append(el('p','cw-empty','Nenhuma consulta observada foi salva neste caso. Planos anteriores contêm apenas links preparados.'));
      for(const run of current.runs.slice().reverse().slice(0,20)){
        const stats=root.ProtocoloInvestigationReport?.summary(run);
        const card=item('Consulta: '+str(run.target),
          stats?stats.returned+' registro(s) retornado(s) · '+stats.with_records+
            ' fonte(s) com registros · '+stats.failed+' falha(s)':
            'Relatório de consulta salvo',str(run.saved_at));
        const details=el('details','cw-results-details');
        details.append(el('summary','','Ver fontes e registros'));
        for(const source of arr(run.sources)){
          const itemLine=el('div','cw-results-source');
          itemLine.append(el('strong','',str(source.label||source.id)+' · '+str(source.status)+
            ' · '+(source.count==null?'sem contagem':source.count+' registro(s)')));
          for(const evidence of arr(source.items).slice(0,35))
            itemLine.append(el('small','',typeof evidence==='string'?evidence.slice(0,400):JSON.stringify(evidence).slice(0,400)));
          const manualHref=root.ProtocoloInvestigationReport?.safeLink(source.query_url);
          if(manualHref){
            const link=el('a','','Abrir consulta manual — fonte não verificada');
            link.href=manualHref;link.target='_blank';link.rel='noopener noreferrer';
            itemLine.append(link);
          }
          const href=root.ProtocoloInvestigationReport?.safeLink(source.source_url);
          if(href){
            const a=el('a','','Abrir fonte pública');a.href=href;a.target='_blank';a.rel='noopener noreferrer';itemLine.append(a);
          }
          details.append(itemLine);
        }
        card.append(details);
        const pdf=el('button','button ghost-button','Baixar PDF deste relatório');
        pdf.type='button';pdf.addEventListener('click',()=>{
          try{root.ProtocoloInvestigationReport?.downloadPdf(run)}
          catch(error){pdf.textContent='PDF indisponível: '+String(error.message).slice(0,100)}
        });
        card.append(pdf);list.append(card);
      }
    }
    pane.replaceChildren(list);
  }
  function selectTab(next,focus=false){
    if(!['overview','timeline','evidence','plans','results'].includes(next))return;
    active=next;
    for(const t of tabs){const selected=t.dataset.cwTab===active;t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;if(selected&&focus)t.focus()}
    pane.setAttribute('aria-labelledby','cw-tab-'+active);render();
  }
  for(const [i,t] of tabs.entries()){
    t.addEventListener('click',()=>selectTab(t.dataset.cwTab));
    t.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
      let index=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      selectTab(tabs[index].dataset.cwTab,true);
    });
  }
  async function refresh(){
    const epoch=++sequence;
    if(!unlocked()){current=null;currentId='';render();return}
    const selected=caseList.querySelector('.case-item.active')?.dataset.case||'';
    if(!selected){current=null;currentId='';render();return}
    if(selected!==currentId){current=null;currentId=selected;blank('Carregando registros locais…')}
    try{
      const data=await vault().getCase(selected);
      if(epoch!==sequence||!unlocked()||caseList.querySelector('.case-item.active')?.dataset.case!==selected)return;
      current=data?view(data):null;render();
    }catch{
      if(epoch===sequence){current=null;blank('Não foi possível carregar o caso do cofre.')}
    }
  }
  let queued=false;
  function queueRefresh(){if(queued)return;queued=true;Promise.resolve().then(()=>{queued=false;refresh()})}
  new MutationObserver(queueRefresh).observe(legacy,{childList:true});
  new MutationObserver(queueRefresh).observe(caseList,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  root.addEventListener('protocolo:vault-change',()=>{current=null;currentId='';render();queueRefresh()});
  root.addEventListener('protocolo:case-selected',queueRefresh);
  queueRefresh();
})(typeof globalThis!=='undefined'?globalThis:this);
