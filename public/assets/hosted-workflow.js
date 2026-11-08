/* Hosted Protocolo OSINT: account login, real asynchronous engines, and image search.
 * No admin token is requested from a visitor or embedded in this script.
 * Cases and evidence remain encrypted in the existing per-browser vault.
 */
(() => {
  "use strict";
  if (document.body?.dataset.runtime !== "hosted") return;
  window.ProtocoloHostedWorkflow = true;

  const panel = document.querySelector("#panel-engines");
  if (!panel) return;
  const $ = (selector, root=document) => root.querySelector(selector);
  const legacy = $("#engine-form", panel);
  if (legacy) { legacy.hidden = true; legacy.style.display = "none"; }
  const terminal = $("#engine-terminal", panel);
  if (terminal) { terminal.hidden = true; terminal.style.display = "none"; }
  const originalProgress = $("#engine-progress", panel);
  if (originalProgress) originalProgress.hidden = true;
  // The hosted UI uses one guided search instead of displaying two consoles.
  for(const selector of [".engine-catalog",".engine-legend"]){
    const node=$(selector,panel);
    if(node){ node.hidden=true; node.style.display="none"; }
  }

  const wrapper = document.createElement("section");
  wrapper.className = "hosted-workflow";
  wrapper.setAttribute("aria-label", "Pesquisa integrada e assíncrona");
  wrapper.innerHTML =
    '<div class="eyebrow">PESQUISA INTEGRADA · VERCEL QUEUE</div>' +
    '<h2>Uma pesquisa, vários motores.</h2>' +
    '<p>Username: Sherlock e Maigret. Domínio: subfinder, Amass e SpiderFoot. ' +
    'As consultas são externas, explícitas e sujeitas a limites. Nenhum resultado é simulado.</p>' +
    '<div id="workflow-auth" class="hosted-auth" role="status">Verificando acesso…</div>' +
    '<form id="workflow-form" class="hosted-workflow-form" autocomplete="off" hidden>' +
      '<label for="workflow-query">Username ou domínio público autorizado</label>' +
      '<input id="workflow-query" maxlength="253" required placeholder="Ex.: usuario_publico ou example.org" spellcheck="false">' +
      '<label for="workflow-engine">Ferramentas</label>' +
      '<select id="workflow-engine">' +
        '<option value="auto">Automático (seleciona conforme o alvo)</option>' +
        '<option value="sherlock">Sherlock</option><option value="maigret">Maigret</option>' +
        '<option value="subfinder">subfinder</option><option value="amass">OWASP Amass</option>' +
        '<option value="spiderfoot">SpiderFoot (passivo)</option></select>' +
      '<label class="hosted-check"><input type="checkbox" id="workflow-spiderfoot" checked> ' +
        'Incluir SpiderFoot em pesquisas automáticas de domínio (pode demorar vários minutos)</label>' +
      '<button id="workflow-submit" type="submit" class="button primary-button">Iniciar pesquisa autorizada</button>' +
    '</form>' +
    '<div id="workflow-status" role="status" aria-live="polite"></div>' +
    '<div id="workflow-results" class="hosted-workflow-results" aria-live="polite"></div>';
  const aside = $(".engine-console", panel);
  if (aside) aside.append(wrapper); else panel.append(wrapper);

  const state = {authenticated:false, configured:false, csrf:"", running:false, jobs:[]};
  const authBox = $("#workflow-auth",wrapper);
  const form = $("#workflow-form",wrapper);
  const status = $("#workflow-status",wrapper);
  const results = $("#workflow-results",wrapper);
  const submit = $("#workflow-submit",wrapper);

  async function request(path, options={}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(path, {
        ...options, signal:controller.signal, credentials:"same-origin",
        cache:"no-store", redirect:"error",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(String(data.detail||("HTTP "+response.status)).slice(0,300));
      return data;
    } finally { clearTimeout(timeout); }
  }
  const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
  function el(tag, className, content) {
    const node=document.createElement(tag);
    if(className) node.className=className;
    if(content!==undefined) node.textContent=String(content);
    return node;
  }
  async function inspectAuth() {
    try {
      const data=await request("/api/v1/auth/status");
      state.configured=data.configured===true;
      state.authenticated=data.authenticated===true;
      state.csrf=typeof data.csrf==="string"?data.csrf:"";
      authBox.replaceChildren();
      if(!state.configured) {
        authBox.append(el("p","", "O login para motores hospedados ainda não foi configurado pelo administrador. O catálogo e o laboratório local continuam disponíveis."));
      } else if(!state.authenticated) {
        authBox.append(el("p","", "Entre com GitHub para executar os motores da Vercel sem digitar chaves ou tokens."));
        const link=el("a","button primary-button","Entrar com GitHub");
        link.href="/api/v1/auth/github/start"; authBox.append(link);
      } else {
        authBox.append(el("p","", "Acesso autorizado: "+String(data.username||"operador")+". Não é necessária chave administrativa."));
        const logout=el("button","button","Sair da sessão");
        logout.type="button";
        logout.addEventListener("click",async () => {
          try { await request("/api/v1/auth/logout",{
            method:"POST",headers:{"X-OSINT-CSRF":state.csrf,"Content-Type":"application/json"}
          }); } catch(error) { status.textContent=error.message; }
          location.reload();
        });
        authBox.append(logout);
      }
      form.hidden=!state.authenticated;
    } catch(error) {
      authBox.textContent="Não foi possível verificar o acesso: "+error.message;
      form.hidden=true;
    }
  }
  function renderJobs(jobs) {
    results.replaceChildren();
    return jobs.map(job => {
      const card=el("section","hosted-result");
      const heading=el("h3","",job.engine);
      const stateNode=el("p","hosted-status","Na fila · "+job.job_id.slice(0,8));
      const dataNode=el("pre","hosted-records","Aguardando resultado do Daemon…");
      card.append(heading,stateNode,dataNode);
      results.append(card);
      return {job,statusNode:stateNode,dataNode,done:false};
    });
  }
  async function pollJobs(cards) {
    // No continuous background polling or phantom progress. The queued
    // Daemon has timeouts, and pending tasks can wait behind other work.
    for(let i=0;i<60&&cards.some(item=>!item.done);i++){
      await sleep(15000);
      if(document.hidden) { i--; continue; }
      for(const card of cards) {
        if(card.done) continue;
        try {
          const response=await request("/api/v1/operator/jobs/"+card.job.job_id);
          card.statusNode.textContent=(response.status||"pending")+" · "+card.job.job_id.slice(0,8);
          if(response.status==="pending"||response.status==="queued"||response.status==="running")continue;
          card.done=true;
          const records=Array.isArray(response.records)?response.records.slice(0,120):[];
          const excerpt=typeof response.stdout_excerpt==="string"?response.stdout_excerpt.slice(0,12000):"";
          const diagnostic=typeof response.stderr_excerpt==="string"?response.stderr_excerpt.slice(0,1200):"";
          card.dataNode.textContent=(records.join("\n")||excerpt||"(Nenhum registro retornado)")+
            (diagnostic?"\n\nDiagnóstico: "+diagnostic:"")+
            "\n\n"+(response.warning||"Resultados externos exigem validação independente.");
          const copy=el("button","button","Copiar resultado");
          copy.type="button";
          copy.addEventListener("click",()=>navigator.clipboard?.writeText(card.dataNode.textContent)
            .catch(()=>{ status.textContent="Cópia indisponível neste navegador."; }));
          card.dataNode.after(copy);
        } catch(error){
          card.statusNode.textContent="Falha ao consultar: "+error.message;
          // Authentication or permission errors should not generate endless Blob reads.
          if(/401|403|autoriz|sessão/i.test(error.message)){card.done=true;}
        }
      }
    }
    if(cards.some(item=>!item.done)) status.textContent="A consulta pode ainda estar processando. O acompanhamento automático foi encerrado para limitar consumo.";
    else status.textContent="Processamento concluído. Avalie os registros e confira as fontes originais.";
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if(!state.authenticated||state.running)return;
    const value=$("#workflow-query",wrapper).value.trim();
    const engine=$("#workflow-engine",wrapper).value;
    const include=$("#workflow-spiderfoot",wrapper).checked;
    if(!value){status.textContent="Informe um username ou domínio.";return;}
    if(!window.confirm("Confirmar consulta OSINT externa para "+value+"? Ferramentas e fontes públicas receberão o termo; o serviço utiliza recursos da Vercel."))return;
    state.running=true; submit.disabled=true; results.replaceChildren();
    status.textContent="Enviando tarefas para a fila privada…";
    try {
      const response=await request("/api/v1/operator/search",{
        method:"POST",
        headers:{"Content-Type":"application/json","X-OSINT-CSRF":state.csrf},
        body:JSON.stringify({value,engine,include_spiderfoot:include}),
      });
      if(!Array.isArray(response.jobs)||!response.jobs.length)throw Error("Nenhuma tarefa retornada.");
      const cards=renderJobs(response.jobs);
      status.textContent=response.jobs.length+" tarefas recebidas pela fila. Resultados reais serão mostrados individualmente.";
      if(Array.isArray(response.errors)&&response.errors.length){
        status.textContent+=" Alguns motores não foram enfileirados: "+response.errors.map(e=>e.engine).join(", ")+".";
      }
      await pollJobs(cards);
    }catch(error){status.textContent="Não foi possível iniciar a consulta: "+error.message;}
    finally{state.running=false;submit.disabled=false;}
  });
  // The existing global search remains a no-cost link planner. Add an explicit
  // pivot to the real engine workflow without triggering paid scans on typing.
  const sourcePanel=$("#panel-sources");
  if(sourcePanel){
    const anchor=$(".results-head",sourcePanel);
    const pivot=el("button","button","Investigar com os motores OSINT");
    pivot.type="button";
    pivot.addEventListener("click",()=>{
      const value=$("#source-query")?.value.trim()||$("#global-query")?.value.trim()||"";
      const field=$("#workflow-query",wrapper);
      if(field)field.value=value;
      const nav=document.querySelector('#primary-nav [data-view="engines"]');
      if(nav)nav.click();
      if(field)field.focus();
    });
    if(anchor) anchor.after(pivot);
  }

  // Existing media-ui.js owns OCR and optional Vision under the same session.
  inspectAuth();
})();
