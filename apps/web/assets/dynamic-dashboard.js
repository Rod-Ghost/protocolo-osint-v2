/* Dynamic investigation center: decrypted vault data never leaves the browser.
 * No background scans, third-party requests, or passive monitoring.
 */
(() => {
  'use strict';
  const host=document.querySelector('#panel-dashboard');
  const model=window.ProtocoloDashboardModel;
  if(!host||!model)return;
  const $=(selector,root=document)=>root.querySelector(selector);
  const node=(tag,className,text)=>{
    const e=document.createElement(tag);
    if(className)e.className=className;
    if(text!==undefined)e.textContent=String(text);
    return e;
  };
  const browserStorage=['hosted','static'].includes(document.body?.dataset.runtime||'');
  const isUnlocked=()=>typeof browserVault!=='undefined'&&!!browserVault&&browserVault.status().unlocked;
  const localVault=()=>typeof browserVault!=='undefined'?browserVault:null;
  let current=null,mode='all',filter='',revision=0;

  const panel=node('section','dynamic-center');
  panel.setAttribute('aria-label','Centro de acompanhamento dos casos');
  panel.innerHTML=[
    '<div class="dynamic-heading"><div><span class="eyebrow">CENTRAL DE INVESTIGAÇÃO · DADOS DO DISPOSITIVO</span>',
    '<h2>Seu trabalho, em movimento.</h2>',
    '<p>Casos, planos de pesquisa e revisões registrados neste dispositivo, sem sincronização e sem varreduras automáticas.</p></div>',
    '<button id="dc-refresh" type="button" class="button ghost-button">Atualizar visão</button></div>',
    '<div id="dc-locked" class="dc-locked" hidden>',
    '<strong>Seu cofre está protegido.</strong>',
    '<p>Desbloqueie em Meus casos para visualizar as atividades. Nenhum título, alvo ou histórico é exibido enquanto o cofre estiver bloqueado.</p>',
    '<button id="dc-unlock" type="button" class="button primary-button">Abrir Meus casos</button></div>',
    '<div id="dc-content" hidden>',
    '<div class="dc-metrics" id="dc-metrics" aria-label="Indicadores dos registros locais"></div>',
    '<div class="dc-toolbar"><div class="dc-switch" role="group" aria-label="Filtro dos casos">',
    '<button type="button" data-dc-filter="all" aria-pressed="true">Todos</button>',
    '<button type="button" data-dc-filter="due" aria-pressed="false">Revisões pendentes</button></div>',
    '<label class="dc-search">Localizar caso <input id="dc-search" type="search" maxlength="120" autocomplete="off" placeholder="Filtrar por título, neste navegador"></label></div>',
    '<div class="dc-columns"><section class="dc-board" aria-label="Casos recentes">',
    '<div class="dc-section-title"><h3>Investigações</h3><span id="dc-case-label"></span></div>',
    '<div id="dc-cases"></div><button type="button" id="dc-new-case" class="button ghost-button">Abrir gestão de casos</button></section>',
    '<section class="dc-board" aria-label="Lembretes manuais">',
    '<div class="dc-section-title"><h3>Revisões a conferir</h3><span id="dc-due-label"></span></div>',
    '<div id="dc-due"></div><p class="dc-disclaimer">Lembretes locais: não verificam mudanças em pessoas, sites nem fontes externas.</p></section></div>',
    '<section class="dc-activity" aria-label="Atividades registradas">',
    '<div class="dc-section-title"><h3>Atividade registrada</h3><span>Histórico do cofre, não eventos da internet</span></div>',
    '<div id="dc-timeline"></div></section>',
    '<div class="dc-quick-actions"><button type="button" data-dc-go="sources">Construir pesquisa</button>',
    '<button type="button" data-dc-go="engines">Motores OSINT</button>',
    '<button type="button" data-dc-go="images">Analisar imagem</button>',
    '<button type="button" data-dc-go="graph">Ver conexões</button></div></div>',
    '<p id="dc-status" class="dc-status" role="status" aria-live="polite"></p>'
  ].join('');
  const tools=host.querySelector('.content-heading');
  if(tools)tools.before(panel);else host.append(panel);
  const locked=$('#dc-locked',panel),contentBox=$('#dc-content',panel);
  const status=$('#dc-status',panel),board=$('#dc-cases',panel);
  const dueBox=$('#dc-due',panel),timeline=$('#dc-timeline',panel);
  const filters=[...panel.querySelectorAll('[data-dc-filter]')];
  const toView=view=>{
    const button=document.querySelector('#primary-nav [data-view="'+view+'"]')||
      document.querySelector('[data-view="'+view+'"]');
    if(button)button.click();
  };
  function openCase(id){
    document.dispatchEvent(new CustomEvent('protocolo:open-case',{detail:{caseId:id}}));
  }
  function openPlan(caseId,planId){
    document.dispatchEvent(new CustomEvent('protocolo:open-plan',{detail:{caseId,planId}}));
  }
  const prettyDate=time=>{
    if(!Number.isFinite(time))return 'Sem data';
    return new Date(time).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});
  };
  function metric(value,label,detail,kind){
    const item=node('div','dc-metric '+(kind||''));
    item.append(node('strong','',value),node('span','',label),node('small','',detail));
    return item;
  }
  function fill(){
    if(!current)return;
    const data=current;
    const metrics=$('#dc-metrics',panel);
    metrics.replaceChildren(
      metric(data.caseCount,'Casos locais','Investigações registradas'),
      metric(data.evidenceCount,'Registros','Referências e notas'),
      metric(data.planCount,'Planos de busca','Estratégias guardadas'),
      metric(data.dueCount,'Revisões pendentes','Apenas lembretes manuais','dc-accent')
    );
    const rate=node('div','dc-progress');
    const info=node('div','dc-progress-label');
    info.append(node('span','','Planos com revisão manual registrada'),
      node('strong','',data.reviewedPlans+' / '+data.planCount));
    const bar=node('div','dc-track');bar.setAttribute('role','progressbar');
    bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');
    bar.setAttribute('aria-valuenow',String(data.reviewRate));
    bar.setAttribute('aria-label','Porcentagem de planos com revisão manual registrada');
    const inner=node('div','dc-fill');inner.style.width=data.reviewRate+'%';bar.append(inner);
    rate.append(info,bar);metrics.append(rate);

    const visible=data.cases.filter(c=>(mode!=='due'||c.pending>0)&&
      (!filter||c.title.toLocaleLowerCase('pt-BR').includes(filter)));
    $('#dc-case-label',panel).textContent=visible.length+' de '+data.caseCount;
    board.replaceChildren();
    if(!visible.length)board.append(node('p','dc-empty',
      data.caseCount?'Nenhum caso corresponde a este filtro.':'Crie um caso no cofre para iniciar sua investigação.'));
    for(const c of visible.slice(0,8)){
      const button=node('button','dc-case');
      button.type='button';button.addEventListener('click',()=>openCase(c.id));
      const name=node('span','dc-case-name',c.title);
      const meta=node('span','dc-case-meta',c.evidence+' registros · '+c.plans+' planos'+
        (c.pending?' · '+c.pending+' revisão(ões) pendente(s)':''));
      const arrow=node('span','dc-arrow','Abrir caso');button.append(name,meta,arrow);board.append(button);
    }
    if(visible.length>8)board.append(node('p','dc-empty','Mostrando os 8 casos mais recentes. Use Meus casos para ver os demais.'));

    dueBox.replaceChildren();
    $('#dc-due-label',panel).textContent=String(data.dueCount);
    if(!data.due.length)dueBox.append(node('p','dc-empty','Nenhuma revisão manual vencida. Os planos novos podem ter frequência de 7 ou 30 dias.'));
    for(const task of data.due.slice(0,5)){
      const row=node('button','dc-due-row');
      row.type='button';row.addEventListener('click',()=>openPlan(task.caseId,task.planId));
      row.append(node('strong','',task.title),
        node('small','',task.caseTitle+' · prevista para '+prettyDate(task.dueAt)),
        node('span','dc-action','Abrir plano'));
      dueBox.append(row);
    }
    if(data.dueCount>5)dueBox.append(node('p','dc-empty',
      'Mais '+(data.dueCount-5)+' revisões pendentes. Filtre os casos para continuar.'));

    timeline.replaceChildren();
    if(!data.events.length)timeline.append(node('p','dc-empty','A atividade aparece após criar casos, registrar evidências e salvar planos.'));
    for(const e of data.events.slice(0,7)){
      const row=node('button','dc-event');
      row.type='button';
      row.addEventListener('click',()=>e.planId?openPlan(e.caseId,e.planId):openCase(e.caseId));
      const icon=node('span','dc-event-mark '+e.type);
      icon.setAttribute('aria-hidden','true');
      const body=node('span','dc-event-body');
      body.append(node('b','',e.label),
        node('span','',e.title+' · '+e.caseTitle));
      row.append(icon,body,node('time','',prettyDate(e.time)));
      timeline.append(row);
    }
    for(const button of filters)button.setAttribute('aria-pressed',String(button.dataset.dcFilter===mode));
    status.textContent='Resumo atualizado a partir de dados registrados no dispositivo. Nenhum provedor externo consultado.';
  }
  async function snapshot(){
    if(browserStorage){
      if(!isUnlocked())return null;
      const v=localVault(),list=await v.listCases(),cases=[];
      for(const item of list){const c=await v.getCase(item.id);if(c)cases.push(c)}
      return model.summarize(cases);
    }
    // Desktop/local server retains its existing SQLite database.
    const response=await fetch('/api/v1/cases',{cache:'no-store',credentials:'same-origin'});
    if(!response.ok)throw Error('O backend local de casos está indisponível.');
    const payload=await response.json(),items=Array.isArray(payload.items)?payload.items:[];
    const cases=[];
    for(const item of items){
      const res=await fetch('/api/v1/cases/'+encodeURIComponent(item.id),
        {cache:'no-store',credentials:'same-origin'});
      if(res.ok)cases.push(await res.json());
    }
    return model.summarize(cases);
  }
  async function refresh(){
    const token=++revision;
    if(browserStorage&&!isUnlocked()){
      current=null;contentBox.hidden=true;locked.hidden=false;status.textContent='';
      return;
    }
    status.textContent='Atualizando indicadores locais…';
    try{
      const result=await snapshot();
      if(token!==revision)return;
      if(!result){current=null;contentBox.hidden=true;locked.hidden=false;return}
      current=result;locked.hidden=true;contentBox.hidden=false;fill();
    }catch(error){
      if(token===revision){
        current=null;contentBox.hidden=true;locked.hidden=false;
        status.textContent='Não foi possível abrir os registros neste dispositivo. '+error.message;
      }
    }
  }
  $('#dc-refresh',panel).addEventListener('click',refresh);
  $('#dc-unlock',panel).addEventListener('click',()=>toView('cases'));
  $('#dc-new-case',panel).addEventListener('click',()=>toView('cases'));
  $('#dc-search',panel).addEventListener('input',e=>{
    filter=e.target.value.trim().toLocaleLowerCase('pt-BR');
    if(current)fill();
  });
  for(const b of filters)b.addEventListener('click',()=>{
    mode=b.dataset.dcFilter;if(current)fill();
  });
  for(const b of panel.querySelectorAll('[data-dc-go]'))b.addEventListener('click',()=>toView(b.dataset.dcGo));
  window.addEventListener('protocolo:vault-change',refresh);
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-view="dashboard"]'))refresh();
  });
  refresh();
})();
