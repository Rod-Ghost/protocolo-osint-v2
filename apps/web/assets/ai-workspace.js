/* Optional AI Studio: no vault access and no automatic network requests. */
(()=>{
'use strict';
const core=window.ProtocoloAI;
const nav=document.querySelector('.nav-secondary-title')?.nextElementSibling;
const area=document.querySelector('.content-wrap');
if(!core||!nav||!area)return;
const button=document.createElement('button');
button.type='button';button.className='nav-link';button.dataset.view='assistant';
button.innerHTML='<span data-icon="code"></span><span>IA opcional</span>';
nav.append(button);
const panel=document.createElement('section');
panel.className='panel';panel.id='panel-assistant';
panel.setAttribute('aria-label','Assistente metodológico e conexão de modelos opcional');
panel.innerHTML=[
 '<div class="page-heading"><div><div class="eyebrow">ASSISTENTE / CONTROLE DO INVESTIGADOR</div>',
 '<h1>Inteligência, com controle.</h1><p>Roteiro gratuito por padrão. Use um modelo local ou sua própria chave apenas se desejar.</p></div>',
 '<div class="heading-badge">GRATUITO POR PADRÃO</div></div>',
 '<div class="ai-layout"><form id="ai-form" class="ai-config" autocomplete="off">',
 '<div class="eyebrow">01 / CONFIGURAÇÃO</div>',
 '<label for="ai-mode">Modo de trabalho</label><select id="ai-mode"></select>',
 '<div id="ai-provider-fields" hidden>',
 '<label for="ai-endpoint">Endpoint</label><input id="ai-endpoint" type="url" maxlength="400" autocomplete="off" spellcheck="false" placeholder="https://provedor.exemplo/v1/chat/completions">',
 '<label for="ai-model">Modelo</label><input id="ai-model" type="text" maxlength="100" autocomplete="off" spellcheck="false" placeholder="Identificador do modelo">',
 '</div><div id="ai-secret-field" hidden>',
 '<label for="ai-token">Minha chave API (se exigida)</label><input id="ai-token" type="password" maxlength="512" autocomplete="off" spellcheck="false" placeholder="Não armazenada">',
 '<small>A chave só será enviada diretamente ao provedor escolhido, no clique.</small></div>',
 '<label for="ai-task">Tarefa investigativa</label><select id="ai-task"></select>',
 '<label for="ai-input">Texto autorizado para análise</label>',
 '<textarea id="ai-input" maxlength="6000" rows="8" placeholder="Descreva fatos e fontes públicas. Não inclua credenciais nem dados sensíveis."></textarea>',
 '<div class="ai-controls"><button id="ai-run" class="button primary-button" type="submit">Gerar roteiro sem IA</button>',
 '<button id="ai-copy-prompt" class="button" type="button">Copiar prompt</button>',
 '<button id="ai-clear" class="button ghost-button" type="button">Limpar</button></div>',
 '<p id="ai-warning" class="ai-warning">O modo offline não consulta nenhum modelo.</p></form>',
 '<aside class="ai-response"><div class="eyebrow">02 / RESULTADO</div>',
 '<h2>Resposta e limitações</h2><div id="ai-status" class="ai-status" role="status" aria-live="polite">Aguardando texto.</div>',
 '<pre id="ai-result" tabindex="0" aria-label="Resposta gerada"></pre>',
 '<div class="ai-controls"><button id="ai-copy-answer" class="button" type="button">Copiar resposta</button></div>',
 '<p class="ai-privacy">IA pode errar. As respostas não constituem evidência ou confirmação de identidade. Nenhum comando ou ferramenta indicado pelo modelo será executado.</p>',
 '</aside></div>'
].join('');
const footer=area.querySelector('.global-footer');
if(footer)footer.before(panel);else area.append(panel);
if(typeof window.icons==='function')window.icons(button);
else if(typeof icons==='function')icons(button);
const $=id=>panel.querySelector('#'+id),modeSelect=$('ai-mode');
for(const item of core.MODES){
 const opt=document.createElement('option');
 opt.value=item.id;opt.textContent=item.label;modeSelect.append(opt);
}
for(const [id,label] of Object.entries(core.TASKS)){
 const opt=document.createElement('option');
 opt.value=id;opt.textContent=label;$('ai-task').append(opt);
}
const status=message=>{$('ai-status').textContent=message;};
function onMode(){
 const mode=modeSelect.value;
 $('ai-provider-fields').hidden=mode==='offline';
 $('ai-secret-field').hidden=mode!=='byok';
 $('ai-token').value='';
 $('ai-endpoint').readOnly=mode==='ollama';
 $('ai-endpoint').value=mode==='ollama'?core.OLLAMA_URL:'';
 $('ai-model').value=mode==='ollama'?'gemma3:4b':'';
 $('ai-run').textContent=mode==='offline'?'Gerar roteiro sem IA':'Consultar modelo autorizado';
 $('ai-warning').textContent=mode==='offline'
  ?'Checklist fixo e gratuito. Sem IA, sem acesso externo e sem custo de API.'
  :mode==='ollama'
   ?'Ollama e o modelo devem estar instalados no seu computador. O navegador pode bloquear conexões locais por CORS.'
   :'O texto e a chave serão enviados diretamente ao endpoint HTTPS escolhido. O provedor pode cobrar e deve permitir CORS; nenhum dado é enviado ao nosso backend.';
 $('ai-result').textContent='';status('Aguardando consulta iniciada por você.');
}
modeSelect.addEventListener('change',onMode);onMode();
let busy=false;
$('ai-form').addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;
 const options={mode:modeSelect.value,task:$('ai-task').value,input:$('ai-input').value,
  model:$('ai-model').value,endpoint:$('ai-endpoint').value,apiKey:$('ai-token').value};
 let verified;
 try{verified=core.validate(options);}catch(err){status(err.message);return;}
 if(verified.mode!=='offline'){
  const destination=new URL(verified.url).origin;
  const ok=window.confirm('Enviar APENAS o texto digitado ao serviço '+destination+'? '+
    'Nenhum dado do cofre será incluído automaticamente. '+
    (verified.mode==='byok'?'Sua chave irá ao provedor; ele poderá cobrar pelo uso.':
     'O modelo local precisa estar em execução. '));
  if(!ok)return;
 }
 $('ai-token').value='';
 busy=true;$('ai-run').disabled=true;$('ai-result').textContent='';
 status(verified.mode==='offline'?'Montando o roteiro offline...':'Consultando modelo...');
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),45000);
 try{
  const result=await core.run(options,undefined,ctrl.signal);
  $('ai-result').textContent=result.text;
  status(result.model_used?'Modelo respondeu. Informações ainda não verificadas.':
   'Roteiro determinístico gerado sem IA, sem rede e sem cobrança.');
 }catch(err){status(ctrl.signal.aborted?'Tempo limite da chamada atingido.':err.message);}
 finally{options.apiKey='';busy=false;$('ai-run').disabled=false;clearTimeout(timer);}
});
$('ai-copy-prompt').addEventListener('click',async()=>{
 try{
  const p=core.preparePrompt($('ai-task').value,$('ai-input').value);
  await navigator.clipboard.writeText(p.system+'\n\n'+p.user);
  status('Prompt copiado. A área de transferência contém texto sem criptografia.');
 }catch(err){status('Falha ao copiar: '+err.message);}
});
$('ai-copy-answer').addEventListener('click',async()=>{
 if(!$('ai-result').textContent)return;
 try{await navigator.clipboard.writeText($('ai-result').textContent);
  status('Resposta copiada para a área de transferência.');}
 catch{status('Não foi possível copiar a resposta.');}
});
$('ai-clear').addEventListener('click',()=>{
 $('ai-input').value='';$('ai-token').value='';
 $('ai-result').textContent='';status('Dados digitados limpos nesta aba.');
});
})();
