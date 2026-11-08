/* Protocolo OSINT · Admin-only job interface. No credentials are stored. */
(()=>{
'use strict';
const panel=document.querySelector('#panel-engines');
if(!panel)return;
const card=document.createElement('section');card.className='engine-queue-card';card.setAttribute('aria-label','Fila de motores OSINT');
card.innerHTML='<div class="engine-queue-head"><div><div class="eyebrow">WORKER / EXECUÇÃO ASSÍNCRONA</div><h2>Processamento em fila</h2><p>Enfileire uma consulta individual apenas quando o worker estiver conectado e autorizado. Nenhum resultado é simulado.</p></div><span id="queue-availability" class="mcp-indicator">Verificando...</span></div><p id="queue-note" class="engine-queue-note">A execução depende de infraestrutura isolada, autorização administrativa e custos de provedores.</p><div class="engine-queue-actions"><button type="button" id="queue-send" class="button primary-button" disabled>Enviar consulta à fila</button><button type="button" id="queue-refresh" class="button">Consultar resultado</button></div><div id="queue-status" class="engine-queue-status" role="status" aria-live="polite"></div><pre id="queue-result" class="engine-queue-result" aria-live="polite" hidden></pre>';
panel.append(card);
const $=sel=>card.querySelector(sel);
let config=false,jobId='',busy=false;
async function request(path,options={}){
 const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),18000);
 try{
  const response=await fetch(path,{...options,signal:ctrl.signal,cache:'no-store',credentials:'same-origin'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(String(data.detail||'HTTP '+response.status).slice(0,300));
  return data;
 }finally{clearTimeout(timer)}
}
function showStatus(message){$('#queue-status').textContent=message;}
async function inspect(){
 try{
  const data=await request('/api/v1/engines/queue/capabilities');
  config=data.configured===true;
  $('#queue-availability').textContent=!config?'Fila indisponível':data.workers_health==='heartbeat-recent'?'Worker detectado · teste de consulta pendente':'Fila configurada · worker não verificado';
  $('#queue-note').textContent=config?'O envio exige autenticação administrativa. Uma tarefa enfileirada não comprova que um worker está ativo.':'A fila/worker não estão ativados nesta hospedagem. A interface permanece em modo informativo.';
  $('#queue-send').disabled=!config;
 }catch(e){$('#queue-availability').textContent='Estado indisponível';$('#queue-send').disabled=true;showStatus('Não foi possível consultar a fila: '+e.message);}
}
$('#queue-send').addEventListener('click',async()=>{
 if(!config||busy)return;
 const engine=document.querySelector('#engine-choice')?.value;
 const target=document.querySelector('#engine-query')?.value?.trim();
 const field=document.querySelector('#engine-token');const token=field?.value||'';
 if(!engine||!target){showStatus('Escolha um motor e informe o alvo no console acima.');return;}
 if(!token){showStatus('Informe a chave administrativa no campo acima.');return;}
 if(!window.confirm('Confirmar consulta externa de '+engine+' para '+target+'? Isso pode consumir recursos e gerar requisições a terceiros.'))return;
 busy=true;$('#queue-send').disabled=true;$('#queue-result').hidden=true;showStatus('Enviando tarefa...');
 try{
  const data=await request('/api/v1/engines/jobs',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({engine,value:target})});
  if(!/^[a-f0-9]{32}$/.test(data.job_id))throw Error('Identificador inesperado.');
  jobId=data.job_id;showStatus('Tarefa '+jobId+' enfileirada. Consulte o resultado quando o worker terminar.');
 }catch(e){showStatus('Falha ao enfileirar: '+e.message);}
 finally{if(field)field.value='';busy=false;$('#queue-send').disabled=!config;}
});
$('#queue-refresh').addEventListener('click',async()=>{
 if(busy)return;
 if(!jobId){showStatus('Nenhuma tarefa foi enviada nesta sessão.');return;}
 const field=document.querySelector('#engine-token');const token=field?.value||'';
 if(!token){showStatus('Informe novamente a chave administrativa para ler o resultado. Ela não é armazenada.');return;}
 busy=true;$('#queue-refresh').disabled=true;
 try{
  const data=await request('/api/v1/engines/jobs/'+jobId,{headers:{Authorization:'Bearer '+token}});
  $('#queue-result').hidden=false;$('#queue-result').textContent=JSON.stringify(data,null,2).slice(0,24000);
  showStatus(data.status==='pending'?'Tarefa ainda pendente.':'Resposta do armazenamento privado recebida. Valide a origem dos registros.');
 }catch(e){showStatus('Falha ao consultar resultado: '+e.message);}
 finally{if(field)field.value='';busy=false;$('#queue-refresh').disabled=false;}
});
inspect();
})();
