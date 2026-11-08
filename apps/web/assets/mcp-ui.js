/* MCP workspace UI: direct browser transport; no stored tokens or server proxy. */
(()=>{
'use strict';
const core=window.ProtocoloMCP;const panel=document.querySelector('#panel-integrations');if(!core||!panel)return;
const card=document.createElement('section');card.className='mcp-workspace';card.setAttribute('aria-label','Conexões MCP personalizadas');
card.innerHTML='<div class="mcp-head"><div><div class="eyebrow">MCP / CONNECTION STUDIO</div><h2>Conexões remotas</h2><p>Conecte um servidor MCP HTTPS compatível com Streamable HTTP. O token permanece apenas nesta aba e é enviado diretamente ao servidor escolhido.</p></div><span class="mcp-indicator" id="mcp-indicator">Desconectado</span></div><form id="mcp-connect-form" autocomplete="off"><div class="mcp-fields"><label>Modelo<select id="mcp-preset"></select></label><label>URL HTTPS do MCP<input id="mcp-url" type="url" inputmode="url" placeholder="https://mcp.exemplo.com/mcp" required spellcheck="false"></label><label>Bearer token (opcional)<input id="mcp-token" type="password" autocomplete="off" placeholder="Somente nesta sessão"></label></div><div class="mcp-actions"><button class="button primary-button" id="mcp-connect" type="submit">Conectar e listar ferramentas</button><button class="button" id="mcp-disconnect" type="button">Desconectar</button></div></form><p class="mcp-disclaimer">A conexão direta depende de CORS permitido pelo servidor MCP. Não use tokens de administrador em servidores desconhecidos. Servidores locais, stdio e endpoints sem HTTPS não são suportados no navegador. Nenhum token é salvo.</p><div id="mcp-status" role="status" aria-live="polite"></div><div id="mcp-tools" hidden><div class="eyebrow">FERRAMENTAS RETORNADAS PELO SERVIDOR</div><select id="mcp-tool-list" aria-label="Ferramenta MCP"></select><label for="mcp-args">Argumentos JSON</label><textarea id="mcp-args" rows="5" spellcheck="false">{}</textarea><button class="button primary-button" type="button" id="mcp-call">Executar ferramenta selecionada</button><pre id="mcp-result" aria-live="polite"></pre></div>';
panel.append(card);
const $=s=>card.querySelector(s);let client=null,tools=[],busy=false;
const state=(message,ok=false)=>{$('#mcp-status').textContent=message;$('#mcp-indicator').textContent=ok?'Conectado':'Desconectado';};
for(const p of core.presets){const o=document.createElement('option');o.value=p.id;o.textContent=p.label;$('#mcp-preset').append(o);}
$('#mcp-preset').addEventListener('change',()=>{const p=core.presets.find(x=>x.id===$('#mcp-preset').value);if(p?.url)$('#mcp-url').value=p.url;});
function reset(){client?.close();client=null;tools=[];$('#mcp-token').value='';$('#mcp-tools').hidden=true;$('#mcp-result').textContent='';state('Sessão encerrada.');}
$('#mcp-disconnect').addEventListener('click',reset);
$('#mcp-connect-form').addEventListener('submit',async e=>{
 e.preventDefault();if(busy)return;busy=true;$('#mcp-connect').disabled=true;
 client?.close();client=null;tools=[];$('#mcp-tools').hidden=true;state('Conectando...');
 try{
  const token=$('#mcp-token').value;const instance=core.createClient($('#mcp-url').value,token);
  $('#mcp-token').value='';const handshake=await instance.connect();tools=await instance.tools();client=instance;
  const select=$('#mcp-tool-list');select.replaceChildren();
  for(const t of tools){if(typeof t.name!=='string')continue;const o=document.createElement('option');o.value=t.name;o.textContent=t.name+(t.description?' — '+t.description.slice(0,80):'');select.append(o);}
  $('#mcp-tools').hidden=tools.length===0;
  state('Conectado a '+String(handshake.serverInfo.name||'servidor MCP')+'. '+tools.length+' ferramentas anunciadas.',true);
 }catch(err){client?.close();client=null;state('Falha: '+err.message+'. Verifique URL, token, CORS e suporte Streamable HTTP.');}
 finally{busy=false;$('#mcp-connect').disabled=false;}
});
$('#mcp-call').addEventListener('click',async()=>{
 if(!client||busy)return;
 const name=$('#mcp-tool-list').value;const meta=tools.find(x=>x.name===name);
 if(!meta){state('Ferramenta não encontrada.');return;}
 const confirmed=window.confirm('Enviar os argumentos para a ferramenta remota "'+name+'"? Ela poderá realizar ações externas. Confirme somente em servidores confiáveis.');
 if(!confirmed)return;
 busy=true;$('#mcp-call').disabled=true;$('#mcp-result').textContent='Executando...';
 try{const result=await client.call(name,core.safeArgs($('#mcp-args').value));$('#mcp-result').textContent=JSON.stringify(result,null,2).slice(0,20000);}
 catch(err){$('#mcp-result').textContent='Falha: '+err.message;}
 finally{busy=false;$('#mcp-call').disabled=false;}
});
})();
