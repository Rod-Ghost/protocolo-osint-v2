/* Protocolo OSINT V2 · zero-build client. No analytics, external scripts or network requests beyond local API. */
'use strict';
const $ = (selector, root=document)=>root.querySelector(selector);
const $$ = (selector, root=document)=>[...root.querySelectorAll(selector)];
const esc = (value='')=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ICONS = {
  dashboard:'<rect x="3" y="3" width="7" height="8" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="15" width="7" height="6" rx="1"/>',
  search:'<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 16-5.5-5.5L5 21"/>',
  folder:'<path d="M3 7V5a2 2 0 0 1 2-2h5l3 3h6a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  network:'<circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M7 6.5 11 17M17 6.5 13 17M7 5h10"/>',
  plug:'<path d="M9 3v5M15 3v5M7 8h10v4a5 5 0 0 1-10 0V8ZM12 17v4"/>',
  code:'<path d="m9 7-5 5 5 5m6-10 5 5-5 5M13 4l-2 16"/>',
  shield:'<path d="m12 2 9 4v6c0 6-4 9-9 10-5-1-9-4-9-10V6l9-4Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  activity:'<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 4 5 14 0 18M12 3c-5 4-5 14 0 18"/>',
  'file-text':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
  'arrow-right':'<path d="M4 12h16m-7-7 7 7-7 7"/>',
  'arrow-up-right':'<path d="M7 17 17 7M8 7h9v9"/>',
  radar:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 12 19 5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  fingerprint:'<path d="M12 11a2 2 0 0 1 2 2c0 3-.5 5.4-1.5 8M7 15c0-3 1.5-6 5-6s5 3 5 6c0 2-.3 4-1 6M4 15c0-5 3-9 8-9s8 4 8 9M12 3a12 12 0 0 0-9 4M4 19l1-3M9 17c0 1.3-.1 2.5-.5 4"/>',
  scan:'<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M4 12h16M9 9h6M9 15h6"/>',
  camera:'<path d="M4 7h4l2-3h4l2 3h4v13H4V7Z"/><circle cx="12" cy="13" r="4"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.5 1.5m11.2 11.2 1.5 1.5M2 12h2m16 0h2M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5"/>',
  moon:'<path d="M20 15a8 8 0 0 1-11-11A8.5 8.5 0 1 0 20 15Z"/>',
  copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
};
function icons(root=document){$$('[data-icon]',root).forEach(node=>{const key=node.getAttribute('data-icon');if(!ICONS[key])return;node.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[key]}</svg>`;});}
const state={view:'dashboard',category:'Todas',kind:null,query:'',sources:[],plan:null,cases:[],activeCase:null,imageFile:null,imageURL:null};
const typeLabels={domain:'Domínio',ip:'Endereço IP',email:'E-mail',url:'URL',username_candidate:'Possível usuário',free_text:'Texto livre'};
let toastTimer=null;
function toast(message,error=false){const elem=$('#toast');elem.textContent=message;elem.className='toast show'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>elem.className='toast',4500)}
async function api(path,options={}){
  const response=await fetch(path,options);
  if(!response.ok){let msg=`Falha local (${response.status})`;try{const detail=await response.json();msg=typeof detail.detail==='string'?detail.detail:msg}catch{}throw new Error(msg)}
  return response.json();
}
const post=(path,data)=>api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
function go(view){
  if(!document.getElementById('panel-'+view))return;
  state.view=view;
  $$('.panel').forEach(n=>n.classList.toggle('is-visible',n.id==='panel-'+view));
  $$('[data-view]').forEach(n=>n.classList.toggle('is-active',n.classList.contains('nav-link')&&n.dataset.view===view));
  const names={dashboard:'Visão geral',sources:'Explorar fontes',images:'Laboratório de imagens',cases:'Meus casos',graph:'Mapa de conexões',integrations:'Integrações & MCP'};
  $('#breadcrumb-current').textContent=names[view]||view;
  $('.sidebar').classList.remove('open');window.scrollTo(0,0);
  if(view==='sources')renderSources();
  if(view==='cases')refreshCases();
  if(view==='images')refreshCaseSelects();
  if(view==='graph')refreshCaseSelects().then(drawGraph);
  if(view==='integrations')loadIntegrations();
}
async function loadSummary(){try{const s=await api('/api/v1/summary');$('#metric-sources').textContent=s.sources;$('#metric-cases').textContent=s.cases;$('#metric-evidence').textContent=s.evidence;$('#sources-count').textContent=s.sources;}catch(e){toast('API local indisponível. Inicie o servidor antes de usar as ferramentas.',true)}}
async function loadSources(){try{const payload=await api('/api/v1/sources');state.sources=payload.sources;$('#sources-count').textContent=payload.total;drawFilters();renderSources()}catch(e){toast(e.message,true)}}
function drawFilters(){const categories=['Todas',...new Set(state.sources.map(s=>s.category))];$('#source-filters').innerHTML=categories.map(category=>`<button type="button" class="filter-chip ${category===state.category?'active':''}" data-category="${esc(category)}">${esc(category)}</button>`).join('');}
function renderSources(){
  drawFilters();
  let sources=state.plan?state.plan.results:state.sources;
  if(state.category!=='Todas')sources=sources.filter(s=>s.category===state.category);
  $('#results-heading').textContent=state.plan?'Consultas preparadas':'Fontes disponíveis';
  $('#results-count').textContent=`${sources.length} fontes`;
  $('#source-results').innerHTML=sources.length?sources.map(s=>{
    let canOpen=false;try{if(s.url&&new URL(s.url).protocol==='https:')canOpen=true}catch{}
    return `<article class="source-card"><div class="source-card-top"><span class="source-card-icon" data-icon="${s.icon in ICONS?s.icon:'globe'}"></span><span class="source-card-category">${esc(s.category)}</span></div><div><h3>${esc(s.name)}</h3><p>${esc(s.description)}</p></div><div class="source-card-footer"><span>${state.plan?'DESTINO NÃO TESTADO':'CATÁLOGO LOCAL'}</span>${canOpen?`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir ${esc(s.name)}">Abrir fonte <span data-icon="arrow-up-right"></span></a>`:`<span class="source-inactive">${state.plan?'Sem destino':'Preparar busca'} <span data-icon="arrow-right"></span></span>`}</div></article>`;
  }).join(''):'<div class="placeholder">Nenhuma fonte para esta combinação. Experimente outra categoria ou termo.</div>';
  icons($('#source-results'));
}
async function search(value){
  if(!value.trim()){toast('Informe um termo para pesquisar.',true);return}
  try{
    const plan=await post('/api/v1/search/plan',{value});
    state.query=plan.query;state.kind=plan.kind;state.plan=plan;state.category='Todas';
    $('#source-query').value=plan.query;
    $('#search-detection').innerHTML=`<span data-icon="radar"></span> ${esc(typeLabels[plan.kind]||plan.kind)} identificado · ${plan.total} fontes compatíveis`;
    icons($('#search-detection'));go('sources');toast(`${plan.total} links preparados localmente. Clique em um provedor para consultar.`);
  }catch(e){toast(e.message,true)}
}
async function refreshCases(){try{const data=await api('/api/v1/cases');state.cases=data.items;renderCases();await loadSummary()}catch(e){toast(e.message,true)}}
function renderCases(){
  $('#cases-count').textContent=`${state.cases.length} casos`;
  $('#case-list').innerHTML=state.cases.length?state.cases.map(c=>`<button class="case-item ${c.id===state.activeCase?'active':''}" data-case="${esc(c.id)}" type="button"><span class="case-icon" data-icon="folder"></span><span class="case-item-body"><strong>${esc(c.title)}</strong><small>${c.evidence_count} registros · ${new Date(c.created_at).toLocaleDateString('pt-BR')}</small></span><span data-icon="arrow-right"></span></button>`).join(''):'<div class="placeholder">Nenhum caso criado. Use “Novo caso” para começar.</div>';
  icons($('#case-list'));
  if(state.activeCase){loadCase(state.activeCase)}
}
async function loadCase(id){
  try{
    const c=await api('/api/v1/cases/'+encodeURIComponent(id));state.activeCase=id;
    $$('.case-item').forEach(el=>el.classList.toggle('active',el.dataset.case===id));
    $('#case-detail').innerHTML=`<div class="case-detail-top"><div><div class="eyebrow">INVESTIGAÇÃO ATIVA</div><h2>${esc(c.title)}</h2><p>${esc(c.description||'Sem descrição cadastrada.')}</p></div><a class="button ghost-button" href="/api/v1/cases/${encodeURIComponent(c.id)}/export" download="case-${esc(c.id)}.json"><span data-icon="download"></span> Exportar</a></div><div class="case-detail-subheading"><h3>Registros e referências</h3><span class="subtext">${c.evidence.length} registros</span></div><div>${c.evidence.length?c.evidence.map(e=>`<div class="evidence-item"><span data-icon="file-text"></span><div><strong>${esc(e.title)}</strong><small>${esc(e.kind==='note'?'Nota local':'Referência externa')} · ${new Date(e.created_at).toLocaleString('pt-BR')}</small>${e.url?`<small><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">Abrir fonte original ↗</a></small>`:''}${e.note?`<small>${esc(e.note).slice(0,300)}</small>`:''}</div></div>`).join(''):'<div class="subtext">Ainda não há registros. Adicione referências documentadas abaixo.</div>'}</div><form id="evidence-form" class="evidence-form"><div class="eyebrow">ADICIONAR REGISTRO</div><input id="evidence-title" placeholder="Título ou descrição do achado" maxlength="180" minlength="2" required/><input id="evidence-url" type="url" placeholder="URL HTTPS da fonte (opcional)" maxlength="2000"/><textarea id="evidence-note" rows="2" maxlength="5000" placeholder="Observações, contexto e limites"></textarea><button class="button primary-button" type="submit"><span data-icon="plus"></span> Adicionar registro</button><small class="subtext">O hash protege os metadados do registro, não captura a página externa.</small></form>`;
    icons($('#case-detail'));
    $('#evidence-form').addEventListener('submit',async event=>{
      event.preventDefault();
      try{
        await post(`/api/v1/cases/${encodeURIComponent(id)}/evidence`,{title:$('#evidence-title').value,url:$('#evidence-url').value||null,note:$('#evidence-note').value,kind:$('#evidence-url').value?'reference':'note'});
        toast('Registro adicionado com hash de integridade.');await refreshCases();await loadCase(id);
      }catch(err){toast(err.message,true)}
    });
  }catch(e){toast(e.message,true)}
}
async function refreshCaseSelects(){
  try{const data=await api('/api/v1/cases');state.cases=data.items;
    const options=state.cases.map(c=>`<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('');
    const currentImage=$('#image-case').value,currentGraph=$('#graph-case').value;
    $('#image-case').innerHTML='<option value="">Somente analisar, sem salvar</option>'+options;
    $('#graph-case').innerHTML='<option value="">Selecione um caso</option>'+options;
    if(state.cases.some(c=>c.id===currentImage))$('#image-case').value=currentImage;
    if(state.cases.some(c=>c.id===currentGraph))$('#graph-case').value=currentGraph;
  }catch(e){toast(e.message,true)}
}
function humanSize(bytes){return bytes<1024?`${bytes} B`:bytes<1048576?`${Math.round(bytes/1024)} KB`:`${(bytes/1048576).toFixed(2)} MB`}
function setImage(file){if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){toast('Escolha uma imagem PNG, JPG ou WebP.',true);return}if(file.size>10485760){toast('Imagem maior que 10 MB.',true);return}state.imageFile=file;if(state.imageURL)URL.revokeObjectURL(state.imageURL);state.imageURL=URL.createObjectURL(file);$('#image-preview').src=state.imageURL;$('#image-filename').textContent=file.name;$('#image-filesize').textContent=humanSize(file.size);$('#image-preview-wrap').hidden=false;$('#analyze-image-button').disabled=false;$('#image-output').hidden=true;}
async function analyzeImage(){
  if(!state.imageFile)return;
  const btn=$('#analyze-image-button');btn.disabled=true;btn.textContent='Analisando localmente...';
  const data=new FormData();data.append('file',state.imageFile);if($('#image-case').value)data.append('case_id',$('#image-case').value);
  try{
    const r=await api('/api/v1/images/analyze',{method:'POST',body:data});
    $('#image-output').hidden=false;
    $('#image-output').innerHTML=`<div class="eyebrow">RESULTADO DA ANÁLISE LOCAL</div><h2>Imagem processada com sucesso</h2><div class="analysis-stats"><div class="analysis-stat"><small>FORMATO</small><b>${esc(r.format)}</b></div><div class="analysis-stat"><small>DIMENSÕES</small><b>${r.width} × ${r.height}</b></div><div class="analysis-stat"><small>TAMANHO</small><b>${esc(humanSize(r.bytes))}</b></div></div><div class="eyebrow">SHA-256 ORIGINAL</div><p class="analysis-hash">${esc(r.sha256)}</p><div class="eyebrow">HASH PERCEPTUAL (dHash)</div><p class="analysis-hash">${esc(r.dhash)}</p><div class="eyebrow">METADADOS</div><p class="analysis-text">Câmera: ${esc(r.metadata.camera_make||'Não informada')} ${esc(r.metadata.camera_model||'')} · Data EXIF: ${esc(r.metadata.captured_at||'Não disponível')} · GPS presente: ${r.metadata.gps_present?'sim (coordenadas ocultadas)':'não'}</p><div class="eyebrow">OCR · ${r.ocr.status==='completed'?'CONCLUÍDO':'INDISPONÍVEL'}</div><p class="analysis-text">${esc(r.ocr.text||'Nenhum texto extraído nesta execução.')}</p><div class="eyebrow">COMPARAÇÕES NO CASO</div><p class="analysis-text">${r.similar_in_case.length?esc(r.similar_in_case.map(x=>`${x.title}: distância perceptual ${x.distance}`).join(' · ')):'Nenhum arquivo semelhante já registrado neste caso.'}</p><p class="subtext">${r.registered_in_case?'Hashes e resumo registrados no caso.':'Somente análise temporária.'} Nenhuma chamada a serviço externo.</p>`;
    toast('Análise concluída sem envio a serviços externos.');await loadSummary();
  }catch(e){toast(e.message,true)}finally{btn.disabled=false;btn.innerHTML='Analisar imagem <span data-icon="arrow-right"></span>';icons(btn)}
}
async function drawGraph(){const id=$('#graph-case').value;if(!id){$('#graph-canvas').innerHTML='<div class="empty-state"><span data-icon="network"></span><h3>Um mapa para cada investigação.</h3><p>Selecione um caso para visualizar vínculos documentados.</p></div>';icons($('#graph-canvas'));return}
 try{
 const data=await api(`/api/v1/cases/${encodeURIComponent(id)}/graph`);const nodes=data.nodes.slice(0,31);const center={x:420,y:220};const rest=nodes.slice(1);const positions=new Map([[nodes[0].id,center]]);
 rest.forEach((n,i)=>{const a=(i/rest.length)*Math.PI*2-Math.PI/2;const radius=rest.length>10?175:148;positions.set(n.id,{x:center.x+Math.cos(a)*radius,y:center.y+Math.sin(a)*radius})});
 const lines=rest.map(n=>{const p=positions.get(n.id);return `<line x1="${center.x}" y1="${center.y}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}"/>`}).join('');
 const dots=nodes.map((n,i)=>{const p=positions.get(n.id);const radius=i===0?25:13;const label=esc(n.label.length>27?n.label.slice(0,25)+'…':n.label);return `<g><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${radius}" fill="${i===0?'#56e2c8':'#9da2f4'}"/><text x="${p.x.toFixed(1)}" y="${(p.y+radius+18).toFixed(1)}" text-anchor="middle">${label}</text></g>`}).join('');
 $('#graph-canvas').innerHTML=`<svg viewBox="0 0 840 450" role="img" aria-label="Grafo com um caso e ${rest.length} registros">${lines}${dots}</svg>`;
 if(data.nodes.length>31)toast('Mapa mostra os 30 registros mais recentes.');
 }catch(e){toast(e.message,true)}
}
async function loadIntegrations(){try{const r=await api('/api/v1/integrations');$('#integration-list').innerHTML=r.integrations.map(item=>`<article class="integration-card"><span class="integration-symbol" data-icon="${item.status==='active'?'shield':item.status==='experimental'?'plug':'layers'}"></span><div class="integration-card-main"><h3>${esc(item.name)}</h3><p>${esc(item.detail)}</p></div><span class="integration-status ${esc(item.status)}">${item.status==='active'?'ATIVO':item.status==='experimental'?'EXPERIMENTAL':'PLANEJADO'}</span></article>`).join('');icons($('#integration-list'))}catch(e){toast(e.message,true)}}
function bind(){
  icons();
  document.addEventListener('click',event=>{const view=event.target.closest('[data-view]');if(view){event.preventDefault();go(view.dataset.view)}const hint=event.target.closest('[data-query]');if(hint){$('#global-query').value=hint.dataset.query;search(hint.dataset.query)}const category=event.target.closest('[data-category]');if(category){state.category=category.dataset.category;renderSources()}const choice=event.target.closest('[data-case]');if(choice){loadCase(choice.dataset.case)}});
  $('#global-search-form').addEventListener('submit',event=>{event.preventDefault();search($('#global-query').value)});
  $('#source-search-form').addEventListener('submit',event=>{event.preventDefault();search($('#source-query').value)});
  $('#new-case-toggle').addEventListener('click',()=>{$('#case-form').hidden=false;$('#case-title').focus()});
  $('#cancel-case').addEventListener('click',()=>{$('#case-form').hidden=true});
  $('#case-form').addEventListener('submit',async event=>{event.preventDefault();try{const result=await post('/api/v1/cases',{title:$('#case-title').value,description:$('#case-description').value});$('#case-form').reset();$('#case-form').hidden=true;state.activeCase=result.id;await refreshCases();toast('Caso criado no banco local.')}catch(e){toast(e.message,true)}});
  $('#image-input').addEventListener('change',event=>setImage(event.target.files[0]));
  const drop=$('#image-dropzone');drop.addEventListener('dragover',event=>{event.preventDefault();drop.classList.add('dragging')});drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));drop.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('dragging');setImage(event.dataTransfer.files[0])});
  $('#analyze-image-button').addEventListener('click',analyzeImage);
  $('#graph-case').addEventListener('change',drawGraph);
  $('#copy-mcp').addEventListener('click',async()=>{try{await navigator.clipboard.writeText('python -m protocolo_osint.mcp_stdio');toast('Comando MCP copiado.')}catch{toast('Cópia indisponível neste navegador.',true)}});
  $('#theme-toggle').addEventListener('click',()=>{document.documentElement.classList.toggle('light');$('#theme-toggle').innerHTML='<span data-icon="'+(document.documentElement.classList.contains('light')?'moon':'sun')+'"></span>';icons($('#theme-toggle'))});
  $('#mobile-menu').addEventListener('click',()=>$('.sidebar').classList.toggle('open'));
  $('#today-label').textContent=new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'}).toUpperCase();
}
bind();loadSummary();loadSources();
