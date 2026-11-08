/* Public, read-only infrastructure diagnostics. Credentials are NEVER fetched. */
(() => {
'use strict';
const panel=document.querySelector('#panel-engines');if(!panel)return;
const box=document.createElement('section');box.className='ops-readiness';
box.innerHTML='<div class="ops-head"><div><div class="eyebrow">OPERAÇÃO / DIAGNÓSTICO</div><h2>Infraestrutura dos motores</h2><p>Indicadores reais da Vercel. Esta tela não executa consultas nem ativa cobranças.</p></div><button type="button" id="ops-refresh" class="button">Atualizar</button></div><div id="ops-cards" class="ops-cards" aria-live="polite"></div><p id="ops-summary" role="status" aria-live="polite">Consultando...</p>';
const before=panel.querySelector('.engine-command-note');if(before)before.before(box);else panel.append(box);
const cards=box.querySelector('#ops-cards'),summary=box.querySelector('#ops-summary');
function tile(label,ok,detail){
 const card=document.createElement('div');card.className='ops-card';
 const name=document.createElement('strong');name.textContent=label;
 const state=document.createElement('span');state.className='ops-state'+(ok?' ops-yes':'');state.textContent=ok?'Detectado':'Pendente';
 const info=document.createElement('small');info.textContent=detail;card.append(name,state,info);return card;
}
async function refresh(){
 const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),9000);
 summary.textContent='Verificando infraestrutura...';
 try{
  const response=await fetch('/api/v1/system/readiness',{signal:ctrl.signal,cache:'no-store',credentials:'same-origin'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const d=await response.json();
  cards.replaceChildren(
   tile('Fila de tarefas',d.queue?.configured,'Região '+String(d.queue?.region||'não informada')),
   tile('Autorização',d.operator_auth?.configured,'Credencial de servidor não exibida'),
   tile('Armazenamento privado',d.private_blob?.binding_detected,'Vínculo detectado; operações não testadas'),
   tile('Worker isolado',d.daemon?.recent_heartbeat,'Presença recente; consulta externa não testada')
  );
  summary.textContent=d.can_submit_jobs?'Pré-requisitos detectados. Ainda falta testar uma tarefa real autorizada.':'Execução de motores indisponível até os recursos estarem conectados e seguros.';
 }catch(err){cards.replaceChildren();summary.textContent='Diagnóstico indisponível: '+err.message;}
 finally{clearTimeout(timeout);}
}
box.querySelector('#ops-refresh').addEventListener('click',refresh);refresh();
})();
