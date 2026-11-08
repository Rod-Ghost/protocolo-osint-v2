/* Protocolo OSINT V2 · Obsidian Console
   UI state reflects real engine inventory and execution authorization; no fake results. */
(() => {
  'use strict';
  const q = (selector, root=document) => root.querySelector(selector);
  const escapeHTML = (v='') => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = {engines:[],selected:'sherlock',loading:false,ran:false,local:document.body?.dataset.runtime!=='hosted'};
  const names = {
    ready:'EXECUTÁVEL', approval_required:'AGUARDA ACESSO', worker_required:'WORKER', worker_available:'WORKER ATIVO',
    not_installed:'NÃO INSTALADO', unavailable:'SEM CONEXÃO'
  };
  const group = q('#primary-nav');
  const workspace = q('.content-wrap');
  if(!group || !workspace) return;

  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'nav-link';
  item.dataset.view = 'engines';
  item.innerHTML = '<span data-icon="scan"></span><span>Motores de pesquisa</span><span class="engine-nav-dot" aria-hidden="true"></span>';
  const infra = group.querySelector('[data-view="infra"]');
  if(infra) infra.after(item); else group.append(item);

  const content = document.createElement('section');
  content.id = 'panel-engines';
  content.className = 'panel';
  content.setAttribute('aria-label','Motores de pesquisa e verificações');
  content.innerHTML = `
    <div class="page-heading">
      <div><div class="engine-eyebrow">ENGINE STUDIO / OPEN INTELLIGENCE</div>
      <h1>Os motores. <span style="color:#fa536c">Uma única estação.</span></h1>
      <p>Ferramentas de código aberto executadas com escopo definido e limites. A instalação e o estado de cada motor são detectados no servidor; nada é simulado.</p></div>
      <div class="engine-live-pill" id="engine-summary">Verificando ambiente</div>
    </div>
    <div class="engine-legend" aria-label="Legenda dos estados">
      <span><i class="green"></i> Executável autorizado</span><span><i></i> Aguardando configuração</span><span><i class="amber"></i> Depende de worker</span>
    </div>
    <div class="engine-layout">
      <div class="engine-catalog" id="engine-catalog" aria-live="polite">
        <div class="placeholder">Lendo inventário de motores do backend...</div>
      </div>
      <aside class="engine-console" aria-label="Console de execução">
        <div class="engine-console-head"><div><div class="engine-eyebrow">EXECUÇÃO / CONTROLE</div><h2>Console de consulta</h2></div><span data-icon="scan"></span></div>
        <form id="engine-form" autocomplete="off">
          <label for="engine-choice">Motor selecionado</label>
          <select id="engine-choice" name="engine" aria-label="Selecionar motor"><option value="sherlock">Sherlock</option></select>
          <label for="engine-query">Alvo público autorizado</label>
          <input id="engine-query" name="query" maxlength="253" placeholder="Username ou domínio" required spellcheck="false" />
          <label for="engine-token" id="engine-token-label">Chave de execução (apenas hospedagem administrada)</label>
          <input id="engine-token" type="password" name="token" autocomplete="off" placeholder="Não armazenada no navegador" />
          <p class="console-copy" id="engine-explain">Selecione um motor para consultar capacidades e restrições.</p>
          <button id="engine-run" class="button primary-button" type="submit" disabled>Executar consulta limitada <span data-icon="arrow-right"></span></button>
        </form>
        <div class="engine-progress" id="engine-progress" aria-hidden="true"></div>
        <div class="engine-terminal" role="status" aria-live="polite" id="engine-terminal">[workstation] aguardando conexão ao inventário…</div>
        <div class="engine-help"><strong>Importante:</strong> verificações de contas e ativos não provam identidade nem propriedade. Não faça consultas abusivas. Os motores executam apenas após sua ação e autorização do servidor.</div>
      </aside>
    </div>
    <div class="engine-command-note" id="engine-ops-note">Os projetos Sherlock, Maigret, subfinder, OWASP Amass e SpiderFoot têm autores e licenças próprios. Esta interface é do Protocolo OSINT. Os motores são componentes separados, não funcionalidades criadas originalmente pelo Protocolo OSINT.</div>
  `;
  const footer = workspace.querySelector('.global-footer');
  if(footer) footer.before(content); else workspace.append(content);
  // Local workstation: never request or transmit a server administrator token.
  if(state.local){
    for(const el of [q('#engine-token-label'),q('#engine-token')]){
      if(el){el.hidden=true;el.style.display='none';}
    }
  }
  if(typeof window.icons === 'function') window.icons(content);
  else if(typeof icons === 'function') icons(content);

  const feature = document.createElement('button');
  feature.type = 'button';
  feature.className = 'feature-card';
  feature.dataset.view = 'engines';
  feature.innerHTML = '<span class="feature-icon fi-orange" data-icon="scan"></span><span class="feature-tag">MOTORES INTEGRADOS</span><strong>Engine Studio</strong><span class="feature-desc">Sherlock, Maigret, subfinder, Amass e SpiderFoot — estado real e execução protegida.</span><span class="feature-foot">EXPLORAR <span data-icon="arrow-up-right"></span></span>';
  q('.feature-grid')?.append(feature);
  if(typeof icons === 'function') {icons(feature);icons(item);}

  const terminal = q('#engine-terminal');
  const statuses = q('#engine-summary');
  const consoleButton = q('#engine-run');
  const defaultDescriptions = {
    sherlock:'Perfis públicos por username. O modo limitado evita buscas massivas e exige autorização.',
    maigret:'Verificação limitada de identificadores públicos. Não há associação automática entre perfis e pessoas.',
    subfinder:'Enumeração passiva de subdomínios. Fontes externas podem exigir chaves de API.',
    amass:'Mapeamento passivo de ativos. É um processo demorado e requer worker/fila.',
    spiderfoot:'Módulos de investigação e análise. Requer worker isolado, configuração e fila de tarefas.'
  };
  const fallback = Object.entries(defaultDescriptions).map(([id,description]) => ({
    id,title:({sherlock:'Sherlock',maigret:'Maigret',subfinder:'subfinder',amass:'OWASP Amass',spiderfoot:'SpiderFoot'})[id],
    input_kind:['sherlock','maigret'].includes(id)?'username':'domain', status:'unavailable',
    installed:false,runnable:false,mode:['amass','spiderfoot'].includes(id)?'worker':'bounded',
    source:({sherlock:'https://github.com/sherlock-project/sherlock',maigret:'https://github.com/soxoj/maigret',subfinder:'https://github.com/projectdiscovery/subfinder',amass:'https://github.com/owasp-amass/amass',spiderfoot:'https://github.com/smicallef/spiderfoot'})[id],description,
    reason:'Não foi possível consultar o runtime.'
  }));

  function render(){
    const engines = state.engines;
    const running = engines.filter(e=>e.status === 'ready').length;
    const available = engines.filter(e=>e.installed).length;
    statuses.textContent = `${available}/${engines.length} detectados · ${running} liberados`;
    q('#engine-catalog').innerHTML = engines.map((e,i)=>`
      <button class="engine-tile ${e.id===state.selected?'is-selected':''}" type="button" data-engine-id="${escapeHTML(e.id)}" aria-pressed="${e.id===state.selected}">
        <div class="engine-tile-header"><span class="engine-tile-symbol">${String(i+1).padStart(2,'0')}</span><span class="engine-state ${escapeHTML(e.status)}">${names[e.status]||'EM ANÁLISE'}</span></div>
        <h3>${escapeHTML(e.title)}</h3><p>${escapeHTML(e.description)}</p>
        <div class="engine-tile-foot"><span>${e.input_kind==='username'?'IDENTIDADE PÚBLICA':'INFRAESTRUTURA'}</span><span>${e.installed?'INSTALADO':'PENDENTE'} • ${escapeHTML(e.license||'OSS')}</span></div>
      </button>`).join('');
    const selector=q('#engine-choice');
    selector.innerHTML = engines.map(e=>`<option value="${escapeHTML(e.id)}">${escapeHTML(e.title)}</option>`).join('');
    selector.value=state.selected;
    describe();
  }

  function describe(){
    const engine=state.engines.find(x=>x.id===state.selected);
    if(!engine)return;
    q('#engine-choice').value=engine.id;
    q('#engine-query').placeholder=engine.input_kind==='username'?'Ex.: exemplo_usuario':'Ex.: example.org';
    q('#engine-explain').textContent=engine.reason||engine.description;
    consoleButton.disabled=!engine.runnable || state.loading;
    consoleButton.textContent=engine.runnable?'Executar consulta limitada':'Execução indisponível';
    q('#engine-catalog').querySelectorAll('[data-engine-id]').forEach(el=>{
      const active=el.dataset.engineId===engine.id;
      el.classList.toggle('is-selected',active);el.setAttribute('aria-pressed',String(active));
    });
  }
  async function readInventory(){
    try {
      const response=await fetch('/api/v1/engines',{headers:{Accept:'application/json'},cache:'no-store',credentials:'same-origin'});
      if(!response.ok)throw new Error(`API indisponível (${response.status})`);
      const payload=await response.json();
      if(!Array.isArray(payload.engines))throw new Error('Inventário inválido');
      state.engines=payload.engines;
      terminal.textContent=`[engine registry] ${state.engines.length} motores cadastrados\n[availability] ${state.engines.filter(e=>e.installed).length} executáveis detectados\n[mode] ${state.local?'local: sem token; motores dependem de instalação e ativação no computador':'Vercel: execução administrativa protegida'}`;
    }catch(error){
      state.engines=fallback;
      statuses.textContent='Offline · API não disponível';
      terminal.textContent=`[network] ${error.message}\n[offline] mostraremos os motores planejados, sem simular instalações ou resultados.`;
    }
    render();
  }

  q('#engine-catalog').addEventListener('click',event=>{
    const button=event.target.closest('[data-engine-id]');
    if(!button)return;
    state.selected=button.dataset.engineId;
    describe();
  });
  q('#engine-choice').addEventListener('change',event=>{state.selected=event.target.value;describe()});
  async function localJobRequest(path,options={}){
    const ctrl=new AbortController();
    const timeout=setTimeout(()=>ctrl.abort(),12000);
    try{
      const response=await fetch(path,{...options,signal:ctrl.signal,cache:'no-store',credentials:'same-origin'});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(String(payload.detail||'HTTP '+response.status).slice(0,250));
      return payload;
    }finally{clearTimeout(timeout);}
  }
  async function runLocalJob(engine,value){
    const created=await localJobRequest('/api/v1/local-engines/jobs',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({engine:engine.id,value})
    });
    if(!/^[a-f0-9]{32}$/.test(created.job_id))throw Error('ID de tarefa local inválido.');
    const jobId=created.job_id;
    terminal.textContent='[local] '+engine.title+' · tarefa '+jobId+'\n[queue] '+created.status+'\nNenhuma chave administrativa enviada.';
    let previous='';
    // Real statuses from local service; longest worker timeout is 220 seconds.
    for(let i=0;i<600;i++){
      await new Promise(resolve=>setTimeout(resolve,1500));
      const job=await localJobRequest('/api/v1/local-engines/jobs/'+jobId);
      if(job.status==='queued'||job.status==='running'){
        if(job.status!==previous){
          terminal.textContent='[local] '+engine.title+'\n[estado] '+job.status+'\n[tarefa] '+jobId+'\nAguardando resultado da execução no computador.';
          previous=job.status;
        }
        continue;
      }
      const result=job.result||{};
      const records=Array.isArray(result.records)?result.records.slice(0,120):[];
      const excerpt=String(result.stdout_excerpt||'').slice(0,20000);
      const output=records.length?records.join('\n'):excerpt;
      const diagnostic=job.error||result.stderr_excerpt||'';
      terminal.textContent='['+job.status+'] '+engine.title+'\n[tarefa] '+jobId+
        '\n[registros] '+records.length+'\n[finalizado] '+(job.finished_at||'não informado')+
        '\n---\n'+(output||'(motor sem resultados confirmados)')+
        (diagnostic?'\n[diagnóstico] '+String(diagnostic).slice(0,1800):'')+
        '\n---\n'+(result.warning||'Resultados externos podem conter falsos positivos.');
      return;
    }
    throw Error('O acompanhamento expirou. O processo local pode continuar; não reenvie a tarefa automaticamente.');
  }

  q('#engine-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const engine=state.engines.find(x=>x.id===state.selected);
    if(!engine?.runnable||state.loading)return;
    const value=q('#engine-query').value.trim();
    const token=q('#engine-token').value;
    if(!state.local&&!token){terminal.textContent='[auth] Chave administrativa necessária somente na implantação hospedada.';return;}
    if(!value){terminal.textContent='[input] Informe um alvo válido.';return;}
    if(state.local&&!window.confirm('Executar '+engine.title+' para '+value+' no seu computador? Os módulos podem consultar fontes públicas externas.'))return;
    state.loading=true;consoleButton.disabled=true;
    q('#engine-progress').classList.add('is-active');
    terminal.textContent=`[${state.local?'local':'hosted'}] Verificando ${engine.title}…\n[scope] 1 alvo, prazo limitado\n[security] ${state.local?'execução no dispositivo sem token':'autenticação para operação hospedada'}`; // no fake progress
    const started=Date.now();
    try{
      if(state.local){
        await runLocalJob(engine,value);
      }else{
      const ctrl=new AbortController();
      const timeout=setTimeout(()=>ctrl.abort(),state.local?50000:30000);
      let response;
      try{const headers={'Content-Type':'application/json'};if(!state.local)headers.Authorization=`Bearer ${token}`;response=await fetch('/api/v1/engines/run',{method:'POST',signal:ctrl.signal,headers,body:JSON.stringify({engine:engine.id,value})})}
      finally{clearTimeout(timeout)}
      const payload=await response.json();
      if(!response.ok)throw new Error(payload.detail||`HTTP ${response.status}`);
      const records=Array.isArray(payload.records)?payload.records.slice(0,60):null;
       const output=records?records.join('\n'):String(payload.stdout||'').slice(0,12000);
      const duration=((Date.now()-started)/1000).toFixed(1);
      const status=payload.status||(payload.returncode===0?'concluído':'finalizado com ressalvas');
       const count=records?records.length:output.split('\n').filter(Boolean).length;
       const stderr=state.local&&payload.stderr?'\n[stderr] '+String(payload.stderr).slice(0,1200):'';
       terminal.textContent=`[${status}] ${engine.title} • ${duration}s\n[registros/linhas] ${count}\n---\n${output || '(nenhum registro confirmado pela saída do motor)'}${stderr}\n---\n${payload.notice||payload.warning||'Resultados exigem validação independente.'}`;
      }
    }catch(error){terminal.textContent=`[erro] ${error.name==='AbortError'?'Consulta excedeu o tempo limite.':error.message}\nNenhum resultado foi fabricado.`}
    finally{state.loading=false;q('#engine-progress').classList.remove('is-active');q('#engine-token').value='';describe()}
  });

  // Low-cost real micro-interactions; respect reduced motion and avoid endless JS timers.
  if(window.matchMedia && !matchMedia('(prefers-reduced-motion: reduce)').matches){
    const hero=q('.hero-card');
    hero?.addEventListener('pointermove',e=>{
      const b=hero.getBoundingClientRect();
      hero.style.setProperty('--mouse-x',`${Math.round(e.clientX-b.left-b.width/2)}px`);
      hero.style.setProperty('--mouse-y',`${Math.round(e.clientY-b.top-b.height/2)}px`);
    },{passive:true});
    hero?.addEventListener('pointerleave',()=>{hero.style.removeProperty('--mouse-x');hero.style.removeProperty('--mouse-y')});
  }
  document.addEventListener('click',event=>{
    const nav=event.target.closest('[data-view="engines"]');
    if(nav){setTimeout(()=>{q('#breadcrumb-current').textContent='Motores OSINT'},0)}
  });
  readInventory();
})();
