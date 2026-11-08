/* Browser MCP client: opt-in, memory-only credentials, no backend proxy. */
(function(root){
'use strict';
const MAX_BODY=1000000;
const presets=Object.freeze([
 {id:'custom',label:'Personalizado',url:''},
 {id:'cloudflare',label:'Cloudflare MCP (endereço fornecido pelo operador)',url:''},
 {id:'github',label:'GitHub MCP (endereço fornecido pelo operador)',url:''},
 {id:'search',label:'Pesquisa MCP (endereço fornecido pelo operador)',url:''}
]);
function validateEndpoint(raw){
 let u;try{u=new URL(String(raw||'').trim());}catch{throw Error('Informe a URL HTTPS completa do MCP.');}
 if(u.protocol!=='https:'||u.username||u.password||u.hash)throw Error('Use HTTPS sem credenciais embutidas ou fragmentos.');
 if(!u.hostname||u.hostname==='localhost'||u.hostname.endsWith('.localhost')||u.hostname.endsWith('.local')||u.hostname.endsWith('.internal'))throw Error('Host local não permitido.');
 if(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(u.hostname)||u.hostname.includes(':'))throw Error('Use hostname DNS público, não endereço IP.');
 return u.href;
}
function validateToolName(name){if(typeof name!=='string'||!name||name.length>128)throw Error('Nome de ferramenta inválido.');return name;}
function safeArgs(text){if(!String(text).trim())return {};if(String(text).length>12000)throw Error('Argumentos muito extensos.');let o;try{o=JSON.parse(text);}catch{throw Error('Argumentos devem ser JSON válido.');}if(!o||Array.isArray(o)||typeof o!=='object')throw Error('Argumentos devem ser objeto JSON.');return o;}
function createClient(endpoint,token,fetcher=fetch){
 const url=validateEndpoint(endpoint);
 if(typeof token!=='string'||token.length>4096)throw Error('Token inválido.');
 let session=null;let nextId=0;let initialized=false;
 async function send(method,params={},notification=false){
  const headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2025-06-18'};
  if(token)headers.Authorization='Bearer '+token;
  if(session)headers['Mcp-Session-Id']=session;
  const body=JSON.stringify({jsonrpc:'2.0',...(notification?{}:{id:++nextId}),method,params});
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetcher(url,{method:'POST',mode:'cors',redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',headers,body,signal:controller.signal});
   if(!response.ok)throw Error('Servidor MCP retornou HTTP '+response.status+'.');
   const sid=response.headers?.get?.('mcp-session-id');if(sid&&sid.length<200)session=sid;
   if(notification||response.status===202)return null;
   const raw=await response.text();if(raw.length>MAX_BODY)throw Error('Resposta MCP excedeu limite de segurança.');
   const type=response.headers?.get?.('content-type')||'';
   let result;
   if(type.includes('text/event-stream')){
     const events=raw.split(/\r?\n\r?\n/);let message=null;
     for(const event of events){const lines=event.split(/\r?\n/).filter(line=>line.startsWith('data:'));if(!lines.length)continue;try{const v=JSON.parse(lines.map(x=>x.slice(5).trim()).join('\n'));if(v.id===nextId){message=v;break;}}catch{}}
     if(!message)throw Error('Fluxo MCP sem resposta JSON-RPC correspondente.');
     result=message;
   }else{try{result=JSON.parse(raw);}catch{throw Error('Resposta MCP não é JSON válido.');}}
   if(result?.jsonrpc!=='2.0'||result.id!==nextId)throw Error('Resposta JSON-RPC inválida ou fora de sequência.');
   if(result.error)throw Error('MCP: '+String(result.error.message||'Erro remoto').slice(0,200));
   return result.result;
  }catch(err){if(err.name==='AbortError')throw Error('Tempo limite de 15 segundos atingido.');throw err;}
  finally{clearTimeout(timeout);}
 }
 return {
  async connect(){
   const init=await send('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'Protocolo OSINT V2',version:'0.7.0'}});
   if(!init?.serverInfo||!init?.protocolVersion)throw Error('Servidor não respondeu ao handshake MCP.');
   initialized=true;
   await send('notifications/initialized',{},true);
   return {serverInfo:init.serverInfo,protocolVersion:init.protocolVersion,capabilities:init.capabilities||{}};
  },
  async tools(){if(!initialized)throw Error('Conecte primeiro.');const x=await send('tools/list',{});return Array.isArray(x?.tools)?x.tools.slice(0,100):[];},
  async call(name,args){if(!initialized)throw Error('Conecte primeiro.');return send('tools/call',{name:validateToolName(name),arguments:args});},
  close(){token='';session=null;initialized=false;}
 };
}
root.ProtocoloMCP={presets,validateEndpoint,safeArgs,createClient};
if(typeof module!=='undefined'&&module.exports)module.exports=root.ProtocoloMCP;
})(typeof globalThis!=='undefined'?globalThis:this);
