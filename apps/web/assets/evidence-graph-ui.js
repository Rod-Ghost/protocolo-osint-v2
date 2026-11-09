/* Additional graph: links are backed by existing encrypted case evidence.
 * Does not remove the original organizational case→record visualization.
 */
(() => {
  'use strict';
  if(!['hosted','static'].includes(document.body?.dataset.runtime)||
     !window.ProtocoloEvidenceGraph)return;
  const panel=document.querySelector('#panel-graph');
  if(!panel)return;
  const $=(q,root=document)=>root.querySelector(q);
  const make=(tag,cls,value)=>{
    const e=document.createElement(tag);
    if(cls)e.className=cls;
    if(value!==undefined)e.textContent=String(value);
    return e;
  };
  const NS='http://www.w3.org/2000/svg';
  const svgNode=(tag,attrs={})=>{
    const e=document.createElementNS(NS,tag);
    for(const [name,value] of Object.entries(attrs))e.setAttribute(name,String(value));
    return e;
  };
  const section=make('section','evidence-graph');
  section.setAttribute('aria-label','Correlação documental de observáveis');
  section.innerHTML=[
    '<div class="eyebrow">CAMADA DE CORRELAÇÃO DOCUMENTAL · COFRE LOCAL</div>',
    '<h2>Observáveis e registros de origem</h2>',
    '<p>Descubra quais registros citam o mesmo domínio, alvo de consulta ou hash. ',
    'Repetições textuais não comprovam identidade, propriedade ou autenticidade.</p>',
    '<div class="eg-controls"><label>Tipo de observável ',
    '<select id="eg-type"><option value="">Todos</option><option value="domain">Domínios</option>',
    '<option value="query">Alvos pesquisados</option><option value="sha256">Hashes de arquivos</option>',
    '</select></label><label><input id="eg-shared-only" type="checkbox">',
    ' Somente valores com 2+ registros</label>',
    '<button id="eg-refresh" type="button" class="button ghost-button">Atualizar conexões</button></div>',
    '<div id="eg-stats" class="eg-stats" aria-live="polite"></div>',
    '<div id="eg-visual" class="eg-visual"></div>',
    '<div id="eg-detail" class="eg-detail"></div>',
    '<p class="eg-disclaimer">As associações são organizacionais, estruturais ou textuais. ',
    'Uma busca não equivale a descoberta. Toda ligação tem evidência identificável.</p>'
  ].join('');
  const anchor=$('#graph-canvas',panel);
  if(anchor)anchor.after(section);else panel.append(section);
  const visual=$('#eg-visual',section),stats=$('#eg-stats',section),
    detail=$('#eg-detail',section),caseSelect=$('#graph-case',panel);
  let graph=null,caseData=null,revision=0,currentSelection=null;
  const ready=()=>typeof browserVault!=='undefined'&&!!browserVault&&browserVault.status().unlocked;
  const humanKind=kind=>({domain:'Domínio textual',query:'Contexto de consulta',
    sha256:'Hash de arquivo',evidence:'Registro',case:'Caso'}[kind]||'Observável');
  function empty(message){
    visual.replaceChildren();detail.replaceChildren();
    visual.append(make('p','eg-empty',message));
  }
  function explain(relation){
    return ({
      'registered':'Registro pertencente ao caso.',
      'hash informado do arquivo armazenado':'SHA-256 guardado; requer conferência de integridade.',
      'domínio de origem declarado manualmente':'URL declarada pelo investigador, não verificada.',
      'domínio de URL consultada via navegador':'Hostname da captura HTTPS/CORS; não é certificação da publicação.',
      'domínio citado como referência':'Hostname presente na referência cadastrada.',
      'alvo fornecido à pesquisa':'O valor foi consultado, não descoberto automaticamente.',
      'domínio textual na saída do motor':'String da saída não verificada do motor.'
    })[relation]||relation;
  }
  function detailFor(node){
    detail.replaceChildren();
    if(!node)return;
    detail.append(make('h3','',humanKind(node.kind)+': '+node.label));
    detail.append(make('p','eg-warning',node.kind==='query'
      ?'ALVO INFORMADO: a pesquisa foi solicitada, não comprova a existência da conta.'
      :node.kind==='sha256'
      ?'HASH LOCAL: não certifica fonte, autoria ou data de publicação.'
      :'CONEXÃO DOCUMENTAL: coincidência textual não demonstra identidade.'));
    const byEvidence=new Map((caseData?.evidence||[]).map(e=>[e.id,e]));
    const ids=new Set(node.evidence_ids||[]);
    if(node.evidence_id)ids.add(node.evidence_id);
    for(const id of ids){
      const e=byEvidence.get(id);
      if(!e)continue;
      const row=make('div','eg-support');
      row.append(make('strong','',e.title||'Registro'));
      row.append(make('small','',
        'ID: '+e.id+' · tipo: '+e.kind+
        (e.provenance?.engine?' · motor: '+e.provenance.engine:'')+
        (e.capture?.sha256_bytes?' · SHA-256: '+e.capture.sha256_bytes:'')));
      for(const edge of graph.edges.filter(edge=>edge.evidence_id===id&&edge.target===node.id)){
        row.append(make('p','',explain(edge.relation)));
      }
      const open=make('button','button ghost-button','Abrir caso');
      open.type='button';
      open.addEventListener('click',()=>{
        document.dispatchEvent(new CustomEvent('protocolo:open-case',
          {detail:{caseId:caseData.id}}));
      });
      row.append(open);detail.append(row);
    }
    if(!ids.size)detail.append(make('p','eg-empty','Sem referências associadas.'));
  }
  function getView(){
    const type=$('#eg-type',section).value,shared=$('#eg-shared-only',section).checked;
    const all=graph.nodes.filter(n=>!['case','evidence'].includes(n.kind)&&
      (!type||n.kind===type)&&(!shared||n.evidence_ids.length>1));
    const observables=all.slice(0,22);
    const supporting=new Set(observables.flatMap(n=>n.evidence_ids));
    const evidence=graph.nodes.filter(n=>n.kind==='evidence'&&supporting.has(n.evidence_id)).slice(0,28);
    const eIDs=new Set(evidence.map(n=>n.evidence_id));
    const oIDs=new Set(observables.map(n=>n.id));
    const edges=graph.edges.filter(e=>eIDs.has(e.evidence_id)&&oIDs.has(e.target));
    return {observables,evidence,edges,truncated:all.length>22||supporting.size>28,found:all.length};
  }
  function render(){
    visual.replaceChildren();
    if(!graph){empty('Selecione um caso desbloqueado.');return}
    const view=getView(),{observables,evidence,edges}=view;
    stats.textContent=graph.stats.evidence+' registros · '+graph.stats.observable+
      ' observáveis · '+graph.stats.shared+' valores compartilhados por registros · '+
      view.found+' observáveis no filtro.';
    if(!observables.length){
      empty('Não há dados estruturados neste filtro. Notas livres não geram associações automaticamente.');
      return;
    }
    const h=Math.max(420,Math.min(900,Math.max(evidence.length,observables.length)*36+75));
    const y=(i,length)=>length<=1?h/2:45+i*(h-90)/(length-1);
    const ePos=new Map(evidence.map((n,i)=>[n.evidence_id,{x:350,y:y(i,evidence.length)}]));
    const oPos=new Map(observables.map((n,i)=>[n.id,{x:780,y:y(i,observables.length)}]));
    const center={x:65,y:h/2};
    const svg=svgNode('svg',{viewBox:'0 0 960 '+h,role:'img',
      'aria-label':'Grafo com '+evidence.length+' registros e '+observables.length+' observáveis'});
    const lineLayer=svgNode('g',{'class':'eg-lines'});
    for(const n of evidence){
      const p=ePos.get(n.evidence_id);
      lineLayer.append(svgNode('line',{x1:center.x,y1:center.y,x2:p.x,y2:p.y,'class':'eg-line-case'}));
    }
    for(const edge of edges){
      const a=ePos.get(edge.evidence_id),b=oPos.get(edge.target);
      if(a&&b)lineLayer.append(svgNode('line',
        {x1:a.x,y1:a.y,x2:b.x,y2:b.y,'class':'eg-line-evidence'}));
    }
    svg.append(lineLayer);
    function dot(pos,n,r){
      const g=svgNode('g',{role:'button',tabindex:'0','class':'eg-node',
        'aria-label':humanKind(n.kind)+': '+n.label});
      g.append(svgNode('circle',{cx:pos.x,cy:pos.y,r,'class':'eg-node-'+n.kind}));
      const text=svgNode('text',{x:pos.x,y:pos.y+r+16,'text-anchor':'middle'});
      text.textContent=n.label.length>26?n.label.slice(0,23)+'…':n.label;
      g.append(text);
      const activate=()=>{currentSelection=n.id;detailFor(n)};
      g.addEventListener('click',activate);
      g.addEventListener('keydown',e=>{
        if(e.key==='Enter'||e.key===' '){e.preventDefault();activate()}
      });
      return g;
    }
    svg.append(dot(center,graph.nodes[0],21));
    for(const n of evidence)svg.append(dot(ePos.get(n.evidence_id),n,9));
    for(const n of observables)svg.append(dot(oPos.get(n.id),n,12));
    visual.append(svg);
    visual.append(make('p','eg-legend',
      'Esquerda: caso · Centro: evidências · Direita: observáveis. Selecione um nó para abrir sua origem.'));
    if(view.truncated)visual.append(make('p','eg-empty',
      'Visualização limitada a 28 registros e 22 observáveis; utilize os filtros. Nenhum registro foi excluído do cofre.'));
    const same=graph.repeated_observables.filter(n=>!$('#eg-type',section).value||
      n.kind===$('#eg-type',section).value).slice(0,8);
    if(same.length){
      const group=make('div','eg-repeated');
      group.append(make('h3','','Valores repetidos em diferentes registros'));
      for(const n of same){
        const button=make('button','eg-repeated-button',
          n.label+' · '+n.count+' registros (coincidência textual)');
        button.type='button';
        button.addEventListener('click',()=>detailFor(graph.nodes.find(x=>x.id===n.id)));
        group.append(button);
      }
      visual.append(group);
    }
    const selected=graph.nodes.find(n=>n.id===currentSelection);
    detailFor(selected&&
      (selected.kind==='evidence'?ePos.has(selected.evidence_id):oPos.has(selected.id))
      ?selected:observables[0]);
  }
  async function refresh(){
    const token=++revision;
    if(!ready()){
      graph=null;caseData=null;stats.textContent='Cofre bloqueado';
      empty('Desbloqueie o cofre em Meus casos. Dados sensíveis estão ocultos.');
      return;
    }
    const id=caseSelect?.value;
    if(!id){
      graph=null;caseData=null;stats.textContent='';
      empty('Escolha um caso no seletor acima.');
      return;
    }
    try{
      const result=await browserVault.getCase(id);
      if(token!==revision)return;
      if(!result){graph=null;caseData=null;empty('Caso não encontrado.');return}
      caseData=result;graph=window.ProtocoloEvidenceGraph.build(result);
      render();
    }catch(error){
      if(token===revision){graph=null;caseData=null;empty('Correlação indisponível: '+error.message)}
    }
  }
  $('#eg-refresh',section).addEventListener('click',refresh);
  $('#eg-type',section).addEventListener('change',render);
  $('#eg-shared-only',section).addEventListener('change',render);
  caseSelect?.addEventListener('change',refresh);
  window.addEventListener('protocolo:vault-change',refresh);
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-view="graph"]'))setTimeout(refresh,100);
  });
  refresh();
})();
