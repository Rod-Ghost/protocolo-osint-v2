/* Stateless investigation lab; input is sent to API, never persisted. */
(()=>{
'use strict';
const host=document.getElementById('panel-graph');if(!host)return;
const operations=[
 ['timeline','Linha do tempo',{events:[{date:'2026-11-08',title:'Publicação',source:'https://example.org'}]}],
 ['entities','Extrair indicadores',{text:'contato@example.org publicou https://example.org em 2026-11-08'}],
 ['source-quality','Checklist de fontes',{sources:[{url:'https://example.org',primary:true,observed_at:'2026-11-08',independently_confirmed:false}]}],
 ['graph','Relações com evidências',{relations:[{source:'Entidade A',target:'Entidade B',relation:'citação pública',evidence_id:'ev-1'}]}],
 ['manifest','Manifesto SHA-256',{evidence:[{id:'ev-1',sha256:'a'.repeat(64),source:'https://example.org',collected_at:'2026-11-08'}]}],
 ['report','Relatório Markdown',{report:{title:'Investigação de laboratório',objective:'Analisar fontes públicas',findings:[{claim:'Achado demonstrativo',source:'https://example.org',limitation:'Não validado'}]}}],
 ['email-headers','Cabeçalhos de e-mail',{headers:'From: exemplo <test@example.org>\nReceived: from mx.example.org'}],
 ['url-inspect','Inspeção de URL',{url:'https://example.org/path?x=1'}],
 ['text-compare','Comparação de textos',{texts:['Primeira referência','primeira  referência','Outra fonte']}],
 ['methodology','Checklist metodológico',{}]
];
const block=document.createElement('section');block.className='lab-workspace';
block.innerHTML='<div class="lab-title"><div><div class="eyebrow">ANÁLISE / LABORATÓRIO</div><h2>Laboratório investigativo</h2><p>Dez operações no backend, sem consultas externas e sem persistência. Não envie dados sigilosos: o conteúdo é transmitido à API durante o processamento.</p></div></div><label for="lab-operation">Operação</label><select id="lab-operation"></select><label for="lab-payload">Entrada JSON (exemplo editável)</label><textarea id="lab-payload" rows="8" spellcheck="false"></textarea><div class="lab-actions"><button type="button" id="lab-run" class="button">Analisar dados</button><button type="button" id="lab-copy" class="button">Copiar resultado</button></div><div id="lab-status" role="status" aria-live="polite"></div><pre id="lab-output" tabindex="0" aria-label="Resultado da análise"></pre>';
host.append(block);
const select=block.querySelector('#lab-operation'),payload=block.querySelector('#lab-payload'),out=block.querySelector('#lab-output'),status=block.querySelector('#lab-status');
operations.forEach(([id,label])=>{const o=document.createElement('option');o.value=id;o.textContent=label;select.append(o);});
function update(){const found=operations.find(x=>x[0]===select.value);payload.value=JSON.stringify(found[2],null,2);out.textContent='';status.textContent='Aguardando análise.';}
select.addEventListener('change',update);update();
block.querySelector('#lab-run').addEventListener('click',async()=>{
 let data;try{data=JSON.parse(payload.value);if(!data||Array.isArray(data)||typeof data!=='object')throw Error('Informe um objeto JSON.');}catch(e){status.textContent='Entrada inválida: '+e.message;return;}
 const btn=block.querySelector('#lab-run');btn.disabled=true;status.textContent='Processando sem consultar fontes externas...';
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch('/api/v1/lab/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:select.value,payload:data}),signal:controller.signal,cache:'no-store',credentials:'same-origin'});
  const result=await response.json();
  if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'HTTP '+response.status);
  out.textContent=JSON.stringify(result.result,null,2);
  status.textContent='Análise concluída. Resultado derivado somente da entrada; nenhuma fonte externa validada.';
 }catch(e){out.textContent='';status.textContent='Falha: '+e.message;}
 finally{clearTimeout(timer);btn.disabled=false;}
});
block.querySelector('#lab-copy').addEventListener('click',async()=>{
 if(!out.textContent)return;
 try{await navigator.clipboard.writeText(out.textContent);status.textContent='Resultado copiado.';}
 catch{status.textContent='Cópia automática indisponível; selecione o resultado manualmente.';}
});
})();
