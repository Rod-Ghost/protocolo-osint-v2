/* Guided search planner v2.6.
 * Presentation only: MOVES the existing builder controls without cloning them.
 * External URLs remain unvisited until a person chooses "Abrir fonte".
 */
(() => {
  'use strict';
  const host=document.querySelector('#panel-sources .case-builder');
  const form=host?.querySelector('#cb-form');
  if(!host||!form||!host.querySelector('#cb-source-list'))return;
  const $=(q,parent=host)=>parent.querySelector(q);
  const node=(tag,cls,value)=>{
    const n=document.createElement(tag);
    if(cls)n.className=cls;
    if(value!==undefined)n.textContent=String(value);
    return n;
  };
  const steps=[
    ['Definir o alvo','Qual identificador ou assunto será investigado?','Alvo'],
    ['Selecionar as fontes','Escolha onde deseja consultar informações públicas.','Fontes'],
    ['Preparar as consultas','Monte URLs e confira os destinos escolhidos.','Preparar'],
    ['Vincular ao caso','Registre a estratégia no cofre local, se desejar.','Registrar']
  ];
  const state={step:0,mode:'guided',prepared:false};
  const message=$('#cb-state'),results=$('#cb-results'),fields=$('.cb-fields'),
    categoryRow=$('.cb-source-head'),sources=$('#cb-source-list'),
    caseSettings=$('.cb-case-settings'),actions=$('.cb-actions');
  const query=$('#cb-query'),kind=$('#cb-kind'),save=$('#cb-save'),
    generate=$('#cb-generate'),filterNote=fields.nextElementSibling;
  if(!message||!results||!fields||!categoryRow||!sources||
    !caseSettings||!actions||!query||!kind||!save||!generate)return;
  host.classList.add('wf-enabled');
  const title=host.querySelector('h2');
  if(title)title.textContent='Construtor de investigação guiada';
  const intro=host.querySelector('h2+p');
  if(intro)intro.textContent=
    'Organize seu processo em quatro passos. Prepare URLs de fontes públicas sem visitar os destinos automaticamente.';

  const header=node('div','wf-header');
  header.innerHTML=
    '<div class="wf-identity"><span class="wf-label">WORKFLOW / PLANEJAMENTO VERIFICÁVEL</span>'+
    '<p id="wf-current-description" aria-live="polite"></p></div>'+
    '<div class="wf-mode" role="group" aria-label="Modo de apresentação">'+
      '<button type="button" id="wf-mode-guided" aria-pressed="true">Guiado</button>'+
      '<button type="button" id="wf-mode-advanced" aria-pressed="false">Tudo à vista</button></div>';
  const progress=node('ol','wf-progress');
  progress.id='wf-progress';
  progress.setAttribute('aria-label','Etapas do plano de investigação');
  steps.forEach((entry,index)=>{
    const item=node('li','wf-progress-item'),button=node('button','wf-step-button');
    button.type='button';button.dataset.wfStep=String(index);
    button.setAttribute('aria-label','Etapa '+(index+1)+': '+entry[0]);
    button.append(node('span','wf-step-number',index+1),node('span','wf-step-label',entry[2]));
    item.append(button);progress.append(item);
  });
  form.before(header,progress);
  const overview=node('div','wf-overview');
  overview.innerHTML='<span class="wf-live-dot" aria-hidden="true"></span>'+
    '<div><strong id="wf-overview-title">Nova estratégia</strong>'+
    '<p id="wf-overview-note">Informe um alvo para iniciar. Nenhuma fonte externa foi consultada.</p></div>';
  form.before(overview);

  const flow=node('div','wf-body');
  const stage=steps.map((entry,index)=>{
    const pane=node('section','wf-stage');
    pane.dataset.wfStage=String(index);
    pane.setAttribute('aria-label','Etapa '+(index+1)+': '+entry[0]);
    const heading=node('header','wf-stage-head');
    heading.append(node('span','wf-stage-index','PASSO 0'+(index+1)+' / 04'),
      node('h3','',entry[0]),node('p','',entry[1]));
    pane.append(heading);
    flow.append(pane);
    return pane;
  });
  form.prepend(flow);

  const labels=[...fields.children];
  if(labels.length<6)return;
  const advanced=node('div','cb-advanced-fields');
  for(const input of labels.slice(2))advanced.append(input);
  const presets=node('div','wf-target-types');
  presets.setAttribute('aria-label','Tipo do alvo');
  const kinds=[
    ['auto','Automático','Detecção assistida'],
    ['domain','Domínio','Sites e infraestrutura'],
    ['username_candidate','Usuário','Nomes de perfil'],
    ['email','E-mail','Endereço informado'],
    ['ip','IP','Endereço público'],
    ['free_text','Texto livre','Assuntos e expressões']
  ];
  for(const [value,name,description] of kinds){
    const button=node('button','wf-type-card');
    button.type='button';button.dataset.wfKind=value;
    button.setAttribute('aria-pressed',String(kind.value===value));
    button.append(node('strong','',name),node('small','',description));
    button.addEventListener('click',()=>{
      kind.value=value;kind.dispatchEvent(new Event('change',{bubbles:true}));
      query.focus();
    });
    presets.append(button);
  }
  stage[0].append(presets,fields,node('p','wf-stage-tip',
    'Informe somente dados adequados ao escopo autorizado. Classificar o alvo não identifica pessoas nem executa consultas.'));

  const sourceOverview=node('div','wf-source-metrics');
  sourceOverview.innerHTML='<div><strong id="wf-selected-count">0</strong><span>fontes selecionadas</span></div>'+
    '<div><strong id="wf-catalog-count">—</strong><span>fontes no catálogo</span></div>'+
    '<p>As fontes são destinos de busca, não resultados coletados.</p>';
  stage[1].append(sourceOverview,categoryRow,sources,node('p','wf-stage-tip',
    'Filtre por categoria para reduzir a lista. As fontes só recebem consultas quando você abre cada link.'));

  const details=node('details','wf-advanced-options');
  details.id='wf-advanced-options';
  details.append(node('summary','','Operadores avançados de pesquisa'),
    node('p','wf-stage-tip','Opcional: site:, filetype:, exclusões e aspas apenas em destinos Google compatíveis.'),
    advanced);
  if(filterNote)details.append(filterNote);
  const prepareCallout=node('div','wf-prepare-note');
  prepareCallout.innerHTML='<strong>Preparação, não coleta</strong><p>Links estruturados não são resultados de investigação. '+
    'A plataforma não visita os destinos nesta etapa, não executa motores e não mede quantas páginas foram encontradas.</p>';
  const generateBar=node('div','wf-prepare-actions');
  generateBar.append(generate);
  stage[2].append(details,prepareCallout,generateBar,results,
    node('p','wf-stage-tip','Após gerar, use “Abrir fonte” para consultar o provedor original manualmente.'));

  const saveBar=node('div','wf-save-actions');
  saveBar.append(save);
  const reviewLinks=node('button','wf-inline-link','Revisar links preparados');
  reviewLinks.type='button';reviewLinks.id='wf-review-links';
  stage[3].append(node('p','wf-stage-tip',
    'Salvamento opcional no cofre criptografado. Se quiser apenas abrir links, você pode concluir sem escolher um caso.'),
    caseSettings,saveBar,reviewLinks);
  actions.remove();

  const footer=node('div','wf-navigation');
  footer.innerHTML='<button type="button" id="wf-back" class="button ghost-button">Voltar</button>'+
    '<div class="wf-navigation-center"><span id="wf-step-count">Etapa 1 de 4</span>'+
    '<span id="wf-draft-status">Ainda não preparado</span></div>'+
    '<button type="button" id="wf-next" class="button primary-button">Continuar</button>';
  form.append(footer);
  header.after(message);
  const countSelected=()=>[...sources.querySelectorAll('input[type="checkbox"]:checked')].length;
  const next=$('#wf-next'),back=$('#wf-back'),note=$('#wf-current-description');

  function refresh(){
    const selected=countSelected(),count=sources.querySelectorAll('input[type=checkbox]').length;
    $('#wf-selected-count').textContent=String(selected);
    $('#wf-catalog-count').textContent=count?String(count):'—';
    $('#wf-overview-title').textContent=query.value.trim()||'Nova estratégia';
    $('#wf-overview-note').textContent=(kind.selectedOptions[0]?.textContent||'Auto')+
      ' · '+selected+' fonte(s) · '+(state.prepared?'URLs preparadas (resultados não medidos)':'Aguardando preparação')+'.';
    $('#wf-draft-status').textContent=state.prepared?'Links preparados':'Ainda não preparado';
    $('#wf-step-count').textContent='Etapa '+(state.step+1)+' de 4';
    note.textContent=state.mode==='guided'?
      steps[state.step][0]+' — '+steps[state.step][1]:
      'Modo avançado — todas as etapas à vista, sem ocultar recursos.';
    for(const card of presets.children)
      card.setAttribute('aria-pressed',String(card.dataset.wfKind===kind.value));
  }
  function present(){
    host.dataset.wfMode=state.mode;
    for(const [index,pane] of stage.entries()){
      pane.hidden=state.mode==='guided'&&index!==state.step;
      pane.setAttribute('aria-hidden',String(pane.hidden));
    }
    for(const button of progress.querySelectorAll('[data-wf-step]')){
      const index=Number(button.dataset.wfStep);
      button.setAttribute('aria-current',state.mode==='guided'&&index===state.step?'step':'false');
      button.dataset.complete=String(index<state.step);
      button.setAttribute('aria-expanded',String(state.mode==='advanced'||index===state.step));
    }
    back.hidden=state.mode==='advanced'||state.step===0;
    next.hidden=state.mode==='advanced'||state.step===3;
    next.textContent=state.step===2?'Continuar para o caso':'Continuar';
    for(const mode of ['guided','advanced'])
      $('#wf-mode-'+mode).setAttribute('aria-pressed',String(state.mode===mode));
    if(state.mode==='advanced')details.open=true;
    refresh();
  }
  function changeStep(step,{focus=false}={}){
    if(!Number.isInteger(step)||step<0||step>=stage.length)return;
    state.step=step;present();
    if(focus){
      const heading=stage[step].querySelector('.wf-stage-head h3');
      heading.setAttribute('tabindex','-1');heading.focus();
    }
  }
  function validate(step){
    if(step===0){
      const value=query.value.trim();
      if(value.length<2||value.length>240){
        message.textContent='Informe um termo de 2 a 240 caracteres.';
        query.focus();return false;
      }
    }
    if(step===1&&!countSelected()){
      message.textContent='Selecione ao menos uma fonte de consulta.';
      sources.querySelector('input[type=checkbox]')?.focus();return false;
    }
    return true;
  }
  next.addEventListener('click',()=>{
    if(validate(state.step))changeStep(state.step+1,{focus:true});
  });
  back.addEventListener('click',()=>changeStep(state.step-1,{focus:true}));
  reviewLinks.addEventListener('click',()=>changeStep(2,{focus:true}));
  progress.addEventListener('click',event=>{
    const button=event.target.closest('[data-wf-step]');
    if(!button)return;
    const selected=Number(button.dataset.wfStep);
    if(state.mode==='guided'&&selected>state.step)
      for(let i=state.step;i<selected;i++)if(!validate(i))return;
    changeStep(selected,{focus:true});
  });
  for(const mode of ['guided','advanced']){
    $('#wf-mode-'+mode).addEventListener('click',()=>{
      state.mode=mode;present();
    });
  }
  // A changed target/source/filter makes old preview stale. Keep the original
  // API builder as the owner of URLs and validation; just hide old UI output.
  function changed(event){
    if(event.target?.matches?.(
      '#cb-query,#cb-kind,#cb-site,#cb-file,#cb-exclude,#cb-exact,#cb-source-list input')){
      if(state.prepared){
        state.prepared=false;
        save.disabled=true;
        results.replaceChildren();
        message.textContent='Pesquisa alterada. Prepare novamente antes de salvar.';
      }
    }
    refresh();
  }
  form.addEventListener('input',changed);
  form.addEventListener('change',changed);
  // The old "select visible" and "clear" buttons change checkbox.checked
  // programmatically, without emitting native input/change events.
  for(const control of ['#cb-select','#cb-clear']){
    $(control).addEventListener('click',()=>{
      if(state.prepared){
        state.prepared=false;
        save.disabled=true;
        results.replaceChildren();
        message.textContent='Seleção de fontes alterada. Prepare as consultas novamente antes de salvar.';
      }
      refresh();
    });
  }
  // The original case selector may re-enable its save button on change.
  // A stale configuration must never be saved just by switching cases.
  $('#cb-case').addEventListener('change',()=>{
    if(!state.prepared)save.disabled=true;
    refresh();
  });
  form.addEventListener('submit',()=>{
    state.prepared=false;
    results.replaceChildren();
    refresh();
  });
  new MutationObserver(()=>{
    if(results.querySelector('.cb-count')?.textContent?.includes('links preparados')){
      state.prepared=true;
      // Saved plans opened from other modules must reveal their result links.
      if(state.mode==='guided'&&state.step!==2)changeStep(2);
    }
    refresh();
  }).observe(results,{childList:true});
  new MutationObserver(refresh).observe(sources,{childList:true});
  document.addEventListener('protocolo:open-plan',()=>{
    if(state.mode==='guided')changeStep(2);
  });
  window.addEventListener('protocolo:vault-change',refresh);
  present();
  window.ProtocoloGuidedWorkflow=Object.freeze({
    changeStep,
    showAdvanced:()=>{state.mode='advanced';present()},
    view:()=>({step:state.step,mode:state.mode,prepared:state.prepared})
  });
})();
