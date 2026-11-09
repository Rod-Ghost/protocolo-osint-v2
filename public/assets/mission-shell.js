/* Protocolo OSINT · Mission Control shell v2.5
 * Navigation-only interface enhancements. No requests, telemetry, data sync
 * or changes to investigative state. All module actions use existing routes.
 */
(() => {
  'use strict';
  const root=document.querySelector('.app-shell');
  const sidebar=document.querySelector('#app-sidebar');
  const main=document.querySelector('#app-main');
  const triggerTop=document.querySelector('#shell-sidebar-toggle');
  const triggerSide=document.querySelector('#sidebar-collapse-toggle');
  const mobileTrigger=document.querySelector('#mobile-menu');
  const navBackdrop=document.querySelector('#ops-nav-backdrop');
  const commandLayer=document.querySelector('#ops-command-dialog');
  if(!root||!sidebar||!main||!triggerTop||!triggerSide||
     !mobileTrigger||!navBackdrop||!commandLayer)return;

  const STORAGE='protocolo-osint:sidebar-collapsed:v1';
  const BREAKPOINT='(max-width: 760px)';
  const narrow=window.matchMedia(BREAKPOINT);
  const $=selector=>document.querySelector(selector);
  let lastFocus=null,activeIndex=0,choices=[];
  const commandTrigger=$('#shell-open-command');
  const commandInput=$('#ops-command-query');
  const commandResults=$('#ops-command-results');

  // Names are interface navigation hints, not claims about operational tools.
  const modules=[
    {view:'dashboard',name:'Central de operações',info:'Visão geral, indicadores e atividade local',terms:'inicio dashboard painel home atividade'},
    {view:'sources',name:'Explorar fontes e construir buscas',info:'Catálogo de consultas e planos por caso',terms:'busca busca guiada google construtor fluxo pesquisas'},
    {view:'infra',name:'Consulta em tempo real',info:'Consultas explícitas a fontes públicas',terms:'dns certificado crtsh github dominio'},
    {view:'engines',name:'Motores OSINT',info:'Sherlock, Maigret, subfinder, Amass e SpiderFoot',terms:'username motores ferramentas job fila'},
    {view:'images',name:'Laboratório de imagens',info:'Metadados, hashes e análise local',terms:'foto imagem ocr exif'},
    {view:'cases',name:'Meus casos e evidências',info:'Casos, capturas, histórico e backup protegido',terms:'cofre evidencia documentos novo caso backup'},
    {view:'graph',name:'Mapa de conexões',info:'Registros, observáveis e vínculos documentais',terms:'grafo quadro relacoes rede'},
    {view:'integrations',name:'Integrações e MCP',info:'Estado das integrações e API do projeto',terms:'api plugin mcp servicos'},
    {view:'assistant',name:'Assistência de análise',info:'Ferramentas opcionais de IA quando disponíveis',terms:'inteligencia artificial ia analista'}
  ];
  function navFor(view){
    return document.querySelector('#primary-nav [data-view="'+view+'"]')||
      document.querySelector('.side-nav [data-view="'+view+'"]')||
      document.querySelector('button[data-view="'+view+'"]');
  }
  const available=()=>modules.filter(item=>
    document.getElementById('panel-'+item.view)&&navFor(item.view));
  function setAccessibleNavNames(){
    for(const node of sidebar.querySelectorAll('.nav-link')){
      if(!node.hasAttribute('title')){
        const plain=[...node.childNodes].filter(n=>n.nodeType===Node.ELEMENT_NODE)
          .filter(n=>!n.hasAttribute('data-icon')&&!n.classList.contains('nav-marker'))
          .map(n=>n.textContent.trim()).filter(Boolean).join(' ')||
          node.textContent.trim();
        if(plain){node.title=plain;node.setAttribute('aria-label',plain);}
      }
    }
  }
  const readCollapsed=()=>{
    try{return window.localStorage.getItem(STORAGE)==='true'}catch{return false}
  };
  const writeCollapsed=state=>{
    try{window.localStorage.setItem(STORAGE,state?'true':'false')}catch{
      /* UI layout preference is optional when storage access is denied. */
    }
  };
  function syncButtons(){
    const collapsed=root.classList.contains('is-collapsed');
    const name=collapsed?'Expandir barra lateral':'Recolher barra lateral';
    for(const button of [triggerTop,triggerSide]){
      button.setAttribute('aria-label',name);
      button.setAttribute('aria-expanded',String(!collapsed));
      button.title=name;
    }
    const open=sidebar.classList.contains('open')&&narrow.matches;
    mobileTrigger.setAttribute('aria-expanded',String(open));
    mobileTrigger.setAttribute('aria-label',open?'Fechar menu':'Abrir menu');
    navBackdrop.hidden=!open;
    document.body.classList.toggle('ops-nav-open',open);
  }
  function collapse(state,{persist=true}={}){
    root.classList.toggle('is-collapsed',Boolean(state));
    if(persist)writeCollapsed(Boolean(state));
    syncButtons();
  }
  function closeMobile({restore=false}={}){
    if(!sidebar.classList.contains('open'))return;
    sidebar.classList.remove('open');
    syncButtons();
    if(restore)mobileTrigger.focus();
  }
  function toggleSidebar(){
    if(narrow.matches){
      sidebar.classList.toggle('open');
      syncButtons();
    }else collapse(!root.classList.contains('is-collapsed'));
  }
  triggerTop.addEventListener('click',toggleSidebar);
  triggerSide.addEventListener('click',toggleSidebar);
  // Existing app.js handles the mobile toggle; synchronize its state only.
  mobileTrigger.addEventListener('click',()=>syncButtons());
  navBackdrop.addEventListener('click',()=>closeMobile({restore:true}));
  document.addEventListener('click',event=>{
    if(event.target.closest('#app-sidebar [data-view]'))syncButtons();
  });
  function onBreakpoint(){
    closeMobile();
    syncButtons();
  }
  if(narrow.addEventListener)narrow.addEventListener('change',onBreakpoint);
  else if(narrow.addListener)narrow.addListener(onBreakpoint);
  collapse(readCollapsed(),{persist:false});
  setAccessibleNavNames();

  function status(){
    const label=$('#shell-vault-state'),chip=$('#shell-vault-indicator');
    if(!label||!chip)return;
    const hosted=['hosted','static'].includes(document.body.dataset.runtime||'');
    if(!hosted){
      label.textContent='Casos no servidor local';
      chip.dataset.status='local';
      chip.title='Abrir gestão de casos no ambiente local';
      return;
    }
    const unlocked=typeof browserVault!=='undefined'&&browserVault&&
      browserVault.status().unlocked;
    label.textContent=unlocked?'Cofre desbloqueado':'Cofre protegido';
    chip.dataset.status=unlocked?'unlocked':'locked';
    chip.title=unlocked?'Cofre local desbloqueado':'Cofre local bloqueado';
  }
  window.addEventListener('protocolo:vault-change',status);
  status();

  function openView(view){
    if(!document.getElementById('panel-'+view))return;
    const nav=navFor(view);
    if(!nav)return;
    closeCommand();
    closeMobile();
    nav.click();  // Existing app router; no duplicate navigation implementation.
    if(narrow.matches)closeMobile();
  }
  $('#shell-vault-indicator')?.addEventListener('click',()=>openView('cases'));
  $('#shell-quick-case')?.addEventListener('click',()=>{
    openView('cases');
    $('#new-case-toggle')?.click(); // Respects existing locked-vault protection.
  });

  const normalize=text=>(text||'').normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  function renderCommands(){
    commandResults.replaceChildren();
    const needle=normalize(commandInput.value.trim()).slice(0,90);
    choices=available().filter(item=>
      normalize(item.name+' '+item.info+' '+item.terms).includes(needle));
    if(!choices.length){
      const empty=document.createElement('p');
      empty.className='ops-command-empty';
      empty.textContent='Nenhum módulo corresponde a essa busca.';
      commandResults.append(empty);
      return;
    }
    activeIndex=Math.min(activeIndex,choices.length-1);
    for(const [index,item] of choices.entries()){
      const option=document.createElement('button');
      option.type='button';option.className='ops-command-option';
      option.dataset.commandView=item.view;
      option.setAttribute('role','option');
      option.setAttribute('aria-selected',String(index===activeIndex));
      const text=document.createElement('span');
      text.className='ops-command-text';
      const name=document.createElement('strong');name.textContent=item.name;
      const description=document.createElement('small');description.textContent=item.info;
      text.append(name,description);
      const shortcut=document.createElement('span');shortcut.className='ops-command-enter';
      shortcut.textContent='↵';
      option.append(text,shortcut);
      option.addEventListener('mouseenter',()=>{
        activeIndex=index;syncSelection();
      });
      option.addEventListener('click',()=>openView(item.view));
      commandResults.append(option);
    }
    syncSelection();
  }
  function syncSelection(){
    [...commandResults.querySelectorAll('[role="option"]')].forEach((n,i)=>{
      n.setAttribute('aria-selected',String(i===activeIndex));
    });
    commandResults.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({block:'nearest'});
  }
  function openCommand(){
    if(!commandLayer.hidden)return;
    closeMobile();
    lastFocus=document.activeElement;
    commandInput.value='';
    activeIndex=0;
    commandLayer.hidden=false;
    document.body.classList.add('ops-command-open');
    renderCommands();
    commandInput.focus();
  }
  function closeCommand(){
    if(commandLayer.hidden)return;
    commandLayer.hidden=true;
    document.body.classList.remove('ops-command-open');
    if(lastFocus?.isConnected&&typeof lastFocus.focus==='function')lastFocus.focus();
    lastFocus=null;
  }
  commandTrigger?.addEventListener('click',openCommand);
  $('#ops-command-close')?.addEventListener('click',closeCommand);
  $('#ops-command-backdrop')?.addEventListener('click',closeCommand);
  commandInput.addEventListener('input',()=>{
    activeIndex=0;renderCommands();
  });
  document.addEventListener('keydown',event=>{
    const isShortcut=(event.ctrlKey||event.metaKey)&&
      !event.altKey&&event.key.toLowerCase()==='k';
    if(isShortcut){
      event.preventDefault();
      commandLayer.hidden?openCommand():closeCommand();
      return;
    }
    if(event.key==='Escape'){
      if(!commandLayer.hidden){event.preventDefault();closeCommand();}
      else if(narrow.matches)closeMobile({restore:true});
      return;
    }
    if(commandLayer.hidden)return;
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      if(!choices.length)return;
      event.preventDefault();
      activeIndex=(activeIndex+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length;
      syncSelection();
    }
    if(event.key==='Enter'&&choices.length){
      if(document.activeElement===commandInput){
        event.preventDefault();openView(choices[activeIndex].view);
      }
    }
    // Keep keyboard navigation inside the modal while it is open.
    if(event.key==='Tab'){
      const focusables=[$('#ops-command-close'),commandInput].filter(Boolean);
      const at=focusables.indexOf(document.activeElement);
      if(event.shiftKey&&at===0){event.preventDefault();focusables[focusables.length-1].focus();}
      else if(!event.shiftKey&&at===focusables.length-1){
        event.preventDefault();focusables[0].focus();
      }
    }
  });
  // Navigation modules can be appended by installed engine/MCP widgets.
  const observer=new MutationObserver(()=>setAccessibleNavNames());
  for(const nav of sidebar.querySelectorAll('nav.side-nav')){
    observer.observe(nav,{childList:true,subtree:true});
  }
  // This event helps tests and future UI updates without leaking case data.
  window.ProtocoloMissionShell=Object.freeze({
    openCommand,closeCommand,
    setCollapsed:state=>collapse(Boolean(state)),
    getState:()=>({collapsed:root.classList.contains('is-collapsed'),
      mobileOpen:sidebar.classList.contains('open'),paletteOpen:!commandLayer.hidden})
  });
})();
