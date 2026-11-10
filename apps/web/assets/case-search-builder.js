/* Protocolo OSINT — case-scoped search planner, no scraping or hidden requests.
 * Uses existing HTTPS source catalog and AES-GCM browser vault; no cloud sync.
 */
(() => {
  'use strict';
  const host=document.querySelector('#panel-sources');
  const casesHost=document.querySelector('#panel-cases');
  if(!host||!casesHost)return;
  const $=(selector,root=document)=>root.querySelector(selector);
  const create=(tag,className,content)=>{
    const el=document.createElement(tag);
    if(className)el.className=className;
    if(content!==undefined)el.textContent=String(content);
    return el;
  };
  const vault=()=>typeof browserVault!=='undefined'?browserVault:null;
  const canSave=()=>!!vault()&&vault().status().unlocked;
  const state={sources:[],planned:null,caseId:'',editing:null};
  const block=create('section','case-builder');
  block.innerHTML=
    '<div class="eyebrow">CONSTRUTOR DE BUSCAS · PLANO SEM COLETA AUTOMÁTICA</div>'+
    '<h2>Escolha o que investigar e onde pesquisar</h2>'+
    '<p>Combine fontes e operadores. Os destinos serão abertos somente quando você clicar. '+
    'Nenhum site é consultado para estimar a quantidade de resultados.</p>'+
    '<form id="cb-form" autocomplete="off">'+
      '<div class="cb-fields"><label>Termo de busca <input id="cb-query" maxlength="240" minlength="2" required placeholder="Ex.: empresa, username ou domínio" /></label>'+
      '<label>Tipo <select id="cb-kind"><option value="auto">Detectar automaticamente</option>'+
      '<option value="free_text">Texto livre</option><option value="username_candidate">Username</option>'+
      '<option value="domain">Domínio</option><option value="email">E-mail</option>'+
      '<option value="ip">IP</option><option value="url">URL</option></select></label>'+
      '<label>Domínio específico — site: <input id="cb-site" maxlength="120" placeholder="example.org (opcional)" /></label>'+
      '<label>Formato — filetype: <select id="cb-file"><option value="">Todos</option><option value="pdf">PDF</option>'+
      '<option value="docx">DOCX</option><option value="xlsx">XLSX</option>'+
      '<option value="csv">CSV</option><option value="txt">TXT</option></select></label>'+
      '<label>Excluir palavras <input id="cb-exclude" maxlength="100" placeholder="Até quatro palavras" /></label>'+
      '<label class="cb-checkbox"><input id="cb-exact" type="checkbox"> Expressão exata (aspas)</label></div>'+
      '<p class="cb-small">Operadores avançados são aplicados apenas aos destinos Google compatíveis. '+
      'Outras fontes recebem o termo original.</p>'+
      '<div class="cb-source-head"><strong>Fontes do catálogo</strong>'+
        '<label>Categoria <select id="cb-category"><option value="">Todas</option></select></label>'+
        '<button id="cb-compatible" type="button" class="button ghost-button">Todas compatíveis</button>'+
        '<button id="cb-select" type="button" class="button ghost-button">Selecionar visíveis</button>'+
        '<button id="cb-clear" type="button" class="button ghost-button">Limpar</button></div>'+
      '<div id="cb-source-list" class="cb-source-list" role="group" aria-label="Selecionar fontes"></div>'+
      '<div class="cb-case-settings"><label>Caso (opcional) <select id="cb-case">'+
        '<option value="">Somente preparar links</option></select></label>'+
        '<button id="cb-refresh-cases" type="button" class="button ghost-button">Atualizar casos</button>'+
        '<label>Revisão manual <select id="cb-interval">'+
          '<option value="0">Sem lembrete</option><option value="7">A cada 7 dias</option>'+
          '<option value="30">A cada 30 dias</option></select></label></div>'+
      '<div class="cb-actions"><button class="button primary-button" id="cb-generate" type="submit">Preparar consultas</button>'+
      '<button class="button ghost-button" id="cb-save" type="button" disabled>Salvar plano no caso</button></div>'+
    '</form>'+
    '<p id="cb-state" role="status" aria-live="polite">Escolha o termo e as fontes.</p>'+
    '<div id="cb-results" class="cb-results"></div>';
  const existing=host.querySelector('.filter-row');
  if(existing)existing.before(block);else host.append(block);
  const form=$('#cb-form',block),list=$('#cb-source-list',block);
  const message=$('#cb-state',block),resultList=$('#cb-results',block);
  const caseBlock=create('section','case-builder cb-case-library');
  caseBlock.innerHTML='<div class="eyebrow">PLANOS VINCULADOS AO CASO</div>'+
    '<h2>Estratégias e revisões</h2>'+
    '<p>Salvos somente no cofre criptografado deste navegador. Revisões não monitoram a internet em segundo plano.</p>'+
    '<button id="cb-library-refresh" class="button ghost-button" type="button">Carregar planos do cofre</button>'+
    '<div id="cb-library" class="cb-library"></div>';
  const layout=casesHost.querySelector('.case-layout');
  if(layout)layout.after(caseBlock);else casesHost.append(caseBlock);
  const library=$('#cb-library',caseBlock);
  // Save-step controls live inside the existing wizard stage, not another screen.
  const caseSettings=$('.cb-case-settings',block);
  const newCaseRow=create('label','cb-new-case-row');
  newCaseRow.id='cb-new-case-row';
  newCaseRow.hidden=true;
  newCaseRow.append(create('span','','Nome da nova investigação'));
  const newCaseTitle=create('input');
  newCaseTitle.id='cb-new-case-title';
  newCaseTitle.type='text';newCaseTitle.maxLength=120;newCaseTitle.minLength=2;
  newCaseTitle.placeholder='Ex.: Investigação de domínio example.org';
  newCaseRow.append(newCaseTitle);
  caseSettings.append(newCaseRow);
  const vaultHelp=create('div','cb-vault-help');
  vaultHelp.id='cb-vault-help';
  vaultHelp.hidden=true;
  const vaultHint=create('span','','Para salvar, abra o cofre criptografado neste mesmo navegador e domínio.');
  const vaultOpen=create('button','button ghost-button','Abrir cofre');
  vaultOpen.type='button';vaultOpen.id='cb-open-vault';
  vaultOpen.addEventListener('click',()=>{
    document.querySelector('#primary-nav [data-view="cases"]')?.click();
    document.querySelector('#vault-pass')?.focus();
  });
  vaultHelp.append(vaultHint,vaultOpen);
  caseSettings.append(vaultHelp);
  let casesLoadSequence=0,saving=false;
  function refreshSaveControls(){
    const unlocked=canSave(),id=$('#cb-case',block).value;
    const creating=id==='__new__';
    const name=newCaseTitle.value.trim();
    newCaseRow.hidden=!unlocked||!creating;
    vaultHelp.hidden=unlocked;
    const btn=$('#cb-save',block);
    btn.textContent=creating?'Criar caso e salvar plano':'Salvar plano no caso';
    btn.disabled=saving||!unlocked||!state.planned||!id||
      (creating&&(name.length<2||name.length>120));
  }
  newCaseTitle.addEventListener('input',refreshSaveControls);

  function selected(){
    return [...list.querySelectorAll('input[type=checkbox]:checked')].map(n=>n.value);
  }
  function showSources(){
    const category=$('#cb-category',block).value;
    const active=new Set(selected());
    list.replaceChildren();
    for(const src of state.sources){
      const li=create('label','cb-source');
      if(category&&src.category!==category)li.hidden=true;
      const cb=create('input');cb.type='checkbox';cb.value=src.id;
      cb.checked=active.has(src.id);
      const meta=create('span');meta.append(create('strong','',src.name),create('small','',src.category));
      li.append(cb,meta);list.append(li);
    }
  }
  async function loadSources(){
    try{
      const response=await fetch('/api/v1/sources',{credentials:'same-origin',cache:'no-store'});
      if(!response.ok)throw Error('Catálogo indisponível: '+response.status);
      const data=await response.json();
      state.sources=Array.isArray(data.sources)?data.sources:[];
      const category=$('#cb-category',block);
      const values=[...new Set(state.sources.map(x=>x.category))].sort();
      for(const value of values){const opt=create('option','',value);opt.value=value;category.append(opt)}
      showSources();
      for(const id of ['google','bing','duckduckgo','google-pdf']){
        const cb=list.querySelector('input[value="'+id+'"]');
        if(cb)cb.checked=true;
      }
      message.textContent=state.sources.length+' fontes disponíveis para planejamento (nenhum resultado externo consultado).';
    }catch(error){message.textContent=error.message;}
  }
  function getFilters(){
    return {exact:$('#cb-exact',block).checked,site:$('#cb-site',block).value.trim(),
      filetype:$('#cb-file',block).value,exclude:$('#cb-exclude',block).value.trim()};
  }
  function formPayload(){
    const value=$('#cb-query',block).value.trim();
    const sources=selected();
    if(!sources.length)throw Error('Selecione ao menos uma fonte.');
    return {value,source_ids:sources,kind:$('#cb-kind',block).value,filters:getFilters()};
  }
  async function loadCases(){
    const request=++casesLoadSequence;
    const select=$('#cb-case',block);
    const current=state.caseId||select.value;
    let data=[];
    try{
      if(canSave())data=await vault().listCases();
    }catch(error){
      if(request===casesLoadSequence){
        message.textContent='Não foi possível carregar os casos: '+error.message;
        refreshSaveControls();
      }
      throw error;
    }
    if(request!==casesLoadSequence)return data;
    select.replaceChildren();
    const first=create('option','',canSave()?'Somente preparar links':'Cofre bloqueado — abra para salvar');
    first.value='';select.append(first);
    if(!canSave()){
      state.caseId='';
      refreshSaveControls();
      return [];
    }
    for(const c of data){
      const option=create('option','',c.title);option.value=c.id;select.append(option);
    }
    const createNew=create('option','','+ Criar novo caso e salvar plano');
    createNew.value='__new__';select.append(createNew);
    // Never pick an arbitrary destination when multiple cases exist.
    const desired=data.some(x=>x.id===current)?current:
      current==='__new__'?'__new__':
      data.length===1?data[0].id:
      data.length===0?'__new__':'';
    select.value=desired;state.caseId=desired;
    if(desired==='__new__'&&!newCaseTitle.value.trim())
      newCaseTitle.value=$('#cb-query',block).value.trim().slice(0,120);
    refreshSaveControls();
    if(!data.length){
      message.textContent='Nenhum caso salvo neste cofre. Informe um nome e use “Criar caso e salvar plano”.';
    }else if(!desired){
      message.textContent='Escolha um caso existente ou “Criar novo caso e salvar plano”.';
    }
    return data;
  }
  function renderResults(data){
    resultList.replaceChildren();
    const intro=create('p','cb-count',data.total+' links preparados; resultados externos: NÃO MEDIDOS.');
    resultList.append(intro);
    for(const item of data.results||[]){
      const line=create('div','cb-link');
      const title=create('span','',item.name+' · '+item.category);
      const tag=create('small','',item.query_mode==='advanced'?'Operadores avançados':'Consulta básica');
      const link=create('a','button ghost-button','Abrir fonte');
      link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';
      line.append(title,tag,link);resultList.append(line);
    }
    if(data.skipped?.length)resultList.append(create('p','cb-small',
      data.skipped.length+' fontes ignoradas por incompatibilidade; nenhuma foi consultada.'));
  }
  async function generate(event){
    if(event)event.preventDefault();
    const submit=$('#cb-generate',block);
    try{
      const payload=formPayload();
      submit.disabled=true;message.textContent='Construindo URLs, sem visitar os destinos...';
      const response=await fetch('/api/v1/search/builder',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(String(data.detail||'Não foi possível construir a pesquisa.'));
      state.planned={payload,data};state.editing=null;
      await loadCases();
      refreshSaveControls();
      renderResults(data);
      message.textContent='Plano pronto: '+data.total+' links. Abra fontes individualmente e registre suas descobertas.';
    }catch(error){message.textContent=error.message;state.planned=null;$('#cb-save',block).disabled=true}
    finally{submit.disabled=false}
  }
  async function savePlan(){
    if(saving)return;
    saving=true;refreshSaveControls();
    let createdId='';
    try{
      if(!canSave())throw Error('O cofre está bloqueado. Use “Abrir cofre” nesta etapa.');
      if(!state.planned)throw Error('Prepare as consultas antes de salvar.');
      // Refuse stale targets, filters, and source selections.
      if(JSON.stringify(formPayload())!==JSON.stringify(state.planned.payload))
        throw Error('O alvo, os filtros ou as fontes mudaram. Prepare novamente antes de salvar.');
      let id=$('#cb-case',block).value;
      if(id==='__new__'){
        const name=newCaseTitle.value.trim();
        if(name.length<2||name.length>120)
          throw Error('Informe um nome de 2 a 120 caracteres para a investigação.');
        const record=await vault().createCase(name,'');
        createdId=record.id;id=record.id;state.caseId=id;
        await loadCases();
        document.dispatchEvent(new CustomEvent('protocolo:case-created',{detail:{caseId:id}}));
      }
      if(!id)throw Error('Escolha um caso existente ou crie um nesta tela.');
      // A case may have been deleted/changed between selection and save.
      if(!createdId && !await vault().getCase(id))
        throw Error('O caso não está mais disponível neste cofre. Atualize a lista.');
      const p=state.planned.payload;
      const title=prompt('Título do plano de busca',p.value.slice(0,70))||p.value.slice(0,70);
      const item=await vault().saveSearchPlan(id,{
        id:state.editing?.caseId===id?state.editing?.planId:undefined,
        title,query:p.value,kind:p.kind,source_ids:p.source_ids,
        filters:p.filters,interval_days:Number($('#cb-interval',block).value)
      });
      state.caseId=id;state.editing={caseId:id,planId:item.id};
      await loadCases();
      await renderLibrary();
      message.textContent='Salvo e confirmado no cofre: '+(createdId?'caso criado e ':'')+
        'plano vinculado ao caso. Disponível em Meus casos.';
    }catch(error){
      message.textContent=(createdId?
        'O caso foi criado, mas o plano ainda não foi salvo: ':
        'Não foi possível salvar: ')+error.message;
    }finally{
      saving=false;refreshSaveControls();
    }
  }
  function dateLabel(iso){
    try{return new Date(iso).toLocaleDateString('pt-BR')}catch{return '?'}
  }
  async function renderLibrary(){
    library.replaceChildren();
    if(!canSave()){library.append(create('p','cb-small','Cofre bloqueado. Desbloqueie-o em Meus casos.'));return}
    const cases=await vault().listCases();
    const sectionCase=state.caseId||$('#cb-case',block).value||cases[0]?.id;
    if(!sectionCase){library.append(create('p','cb-small','Crie um caso para guardar planos.'));return}
    const current=await vault().getCase(sectionCase);
    if(!current)return;
    const h=create('p','cb-count','Caso: '+current.title);
    library.append(h);
    if(!current.search_plans?.length){
      library.append(create('p','cb-small','Nenhum plano registrado. Abra o Construtor em Explorar fontes.'));
      return;
    }
    for(const plan of current.search_plans){
      const entry=create('article','cb-plan');
      const last=plan.reviews?.length?plan.reviews[plan.reviews.length-1]:null;
      const base=last?.observed_at||plan.created_at;
      const due=Number(plan.interval_days)>0&&Date.now()-Date.parse(base)>=plan.interval_days*86400000;
      entry.append(create('h3','',plan.title),create('p','cb-small',
        plan.source_ids.length+' fontes · '+dateLabel(plan.updated_at)+
        (due?' · Revisão manual pendente':'')+
        (last?' · Contagem declarada: '+(last.count??'não informada'):'')+
        (last?.delta!=null?' · Variação declarada: '+(last.delta>0?'+':'')+last.delta:'')));
      const actions=create('div','cb-actions');
      const open=create('button','button ghost-button','Editar/abrir consultas');open.type='button';
      open.addEventListener('click',()=>{
        state.caseId=sectionCase;state.editing={caseId:sectionCase,planId:plan.id};
        $('#cb-query',block).value=plan.query;
        $('#cb-kind',block).value=plan.kind;
        $('#cb-site',block).value=plan.filters?.site||'';
        $('#cb-file',block).value=plan.filters?.filetype||'';
        $('#cb-exclude',block).value=plan.filters?.exclude||'';
        $('#cb-exact',block).checked=plan.filters?.exact===true;
        $('#cb-interval',block).value=String(plan.interval_days||0);
        for(const cb of list.querySelectorAll('input[type=checkbox]'))cb.checked=plan.source_ids.includes(cb.value);
        $('#cb-case',block).value=sectionCase;
        document.querySelector('#primary-nav [data-view=sources]')?.click();
        block.scrollIntoView({block:'start',behavior:'smooth'});
        generate().then(()=>{state.editing={caseId:sectionCase,planId:plan.id};});
      });
      actions.append(open);
      const reviewButton=create('button','button ghost-button','Registrar revisão manual');
      reviewButton.type='button';
      reviewButton.addEventListener('click',()=>{
        const form=create('form','cb-review');
        form.innerHTML='<label>Resultados aproximados vistos no provedor (opcional) <input type="number" min="0" max="1000000000" placeholder="Sem contagem"></label>'+
          '<label>Observação <input type="text" maxlength="500" placeholder="Descreva a fonte e o que mudou"></label>'+
          '<button class="button primary-button" type="submit">Salvar revisão</button>';
        form.addEventListener('submit',async event=>{
          event.preventDefault();
          try{
            const number=form.querySelector('input[type=number]').value;
            await vault().reviewSearchPlan(sectionCase,plan.id,{
              count:number===''?null:Number(number),
              note:form.querySelector('input[type=text]').value
            });
            await renderLibrary();
          }catch(error){form.append(create('p','cb-error',error.message))}
        });
        reviewButton.after(form);reviewButton.remove();
      });
      actions.append(reviewButton);entry.append(actions);library.append(entry);
    }
  }
  $('#cb-category',block).addEventListener('change',showSources);
  $('#cb-compatible',block).addEventListener('click',()=>{
    const kind=$('#cb-kind',block).value;
    const compatible=new Set(state.sources.filter(src=>kind==='auto'||
      (Array.isArray(src.kinds)&&src.kinds.includes(kind))).slice(0,60).map(src=>src.id));
    const boxes=[...list.querySelectorAll('input[type=checkbox]')];
    for(const cb of boxes)cb.checked=compatible.has(cb.value);
    // Trigger the existing stale-plan guard and selection counter.
    boxes[0]?.dispatchEvent(new Event('change',{bubbles:true}));
    message.textContent=compatible.size+' fontes compatíveis selecionadas. Nenhuma foi consultada.';
  });
  $('#cb-select',block).addEventListener('click',()=>{
    for(const cb of list.querySelectorAll('label:not([hidden]) input'))cb.checked=true;
  });
  $('#cb-clear',block).addEventListener('click',()=>{
    for(const cb of list.querySelectorAll('input'))cb.checked=false;
  });
  $('#cb-refresh-cases',block).addEventListener('click',()=>loadCases().then(renderLibrary).catch(e=>message.textContent=e.message));
  $('#cb-case',block).addEventListener('change',event=>{
    state.caseId=event.target.value;
    if(state.caseId==='__new__'&&!newCaseTitle.value.trim())
      newCaseTitle.value=$('#cb-query',block).value.trim().slice(0,120);
    refreshSaveControls();
    if(state.caseId&&state.caseId!=='__new__')
      renderLibrary().catch(error=>{message.textContent=error.message});
  });
  form.addEventListener('submit',generate);
  $('#cb-save',block).addEventListener('click',savePlan);
  $('#cb-library-refresh',caseBlock).addEventListener('click',()=>loadCases().then(renderLibrary).catch(e=>library.textContent=e.message));
  // Manual refresh only: do not poll people or third-party services.
  const sourcesReady=loadSources();
  // Open a saved plan from dashboard reminders or activity. Only user clicks
  // can trigger this: it does not poll third-party providers or start engines.
  document.addEventListener('protocolo:open-plan',async event=>{
    const caseId=event.detail?.caseId,planId=event.detail?.planId;
    if(typeof caseId!=='string'||typeof planId!=='string'||!caseId||!planId)return;
    if(!canSave()){
      document.querySelector('#primary-nav [data-view="cases"]')?.click();
      message.textContent='Desbloqueie seu cofre antes de abrir um plano salvo.';
      return;
    }
    try{
      await sourcesReady;
      const c=await vault().getCase(caseId);
      const plan=c?.search_plans?.find(p=>p.id===planId);
      if(!plan)throw Error('Plano não encontrado no cofre atual.');
      await loadCases();
      state.caseId=caseId;
      $('#cb-case',block).value=caseId;
      $('#cb-query',block).value=plan.query;
      $('#cb-kind',block).value=plan.kind||'auto';
      $('#cb-site',block).value=plan.filters?.site||'';
      $('#cb-file',block).value=plan.filters?.filetype||'';
      $('#cb-exclude',block).value=plan.filters?.exclude||'';
      $('#cb-exact',block).checked=plan.filters?.exact===true;
      $('#cb-interval',block).value=String(plan.interval_days||0);
      for(const input of list.querySelectorAll('input[type=checkbox]'))
        input.checked=plan.source_ids.includes(input.value);
      document.querySelector('#primary-nav [data-view="sources"]')?.click();
      block.scrollIntoView({block:'start',behavior:'smooth'});
      await generate();
      state.editing={caseId,planId};
      if(state.planned)message.textContent='Plano salvo aberto. Revise as fontes antes de consultar.';
    }catch(error){message.textContent='Não foi possível abrir o plano: '+error.message}
  });
  // Existing app vault may be unlocked after initial paint.
  $('#cb-case',block).addEventListener('focus',()=>loadCases().catch(e=>message.textContent=e.message));
  document.addEventListener('protocolo:save-step-open',()=>loadCases().catch(e=>message.textContent=e.message));
  loadCases().catch(e=>{message.textContent=e.message});
  window.addEventListener('protocolo:vault-change',()=>{
    if(!canSave()){state.caseId='';state.planned=null;}
    loadCases().catch(e=>{message.textContent=e.message});
  });
  document.addEventListener('protocolo:case-created',event=>{
    const id=event.detail?.caseId;
    if(typeof id!=='string'||!id)return;
    state.caseId=id;
    loadCases().catch(e=>{message.textContent=e.message});
  });
  document.addEventListener('protocolo:prepare-investigation',async event=>{
    const raw=event.detail;
    if(!raw||typeof raw.query!=='string'||raw.query.trim().length<2)return;
    await sourcesReady;
    $('#cb-query',block).value=raw.query.trim().slice(0,240);
    const allowed=['auto','domain','username_candidate','email','ip','url','free_text'];
    $('#cb-kind',block).value=allowed.includes(raw.kind)?raw.kind:'auto';
    $('#cb-query',block).dispatchEvent(new Event('input',{bubbles:true}));
    $('#cb-kind',block).dispatchEvent(new Event('change',{bubbles:true}));
    if(canSave())await loadCases();
    block.scrollIntoView({block:'start',behavior:'smooth'});
  });
})();