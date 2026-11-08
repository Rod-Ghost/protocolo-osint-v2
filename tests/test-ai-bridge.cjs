'use strict';
const assert=require('node:assert/strict');
const core=require('../apps/web/assets/ai-bridge.js');
async function main(){
 const offline=await core.run({mode:'offline',task:'plan',input:'example.org'},()=>{throw Error('unexpected external request')});
 assert.equal(offline.external_requests,0);
 assert.equal(offline.model_used,false);
 assert.match(offline.text,/SEM IA/);
 assert.match(offline.copied_prompt,/NÃO VERIFICADO/);
 for(const bad of [
  'http://example.org/v1/chat/completions',
  'https://user:pass@example.org/v1/chat/completions',
  'https://example.org/v1/chat/completions?secret=value',
  'https://example.org/v1/models',
  'https://127.0.0.1/v1/chat/completions']){
  assert.throws(()=>core.endpoint('byok',bad));
 }
 let calls=[];
 const fetcher=async(url,init)=>{
  calls.push({url,init});
  return {ok:true,status:200,headers:{get:()=>null},
    text:async()=>JSON.stringify({choices:[{message:{content:'Análise preliminar'}}]})};
 };
 const cfg={mode:'byok',endpoint:'https://api.example.org/v1/chat/completions',
  model:'model-test-1',apiKey:'not-stored-123',task:'verify',input:'fonte fictícia'};
 const result=await core.run(cfg,fetcher);
 assert.equal(result.text,'Análise preliminar');
 assert.equal(calls.length,1);
 assert.equal(calls[0].init.headers.Authorization,'Bearer not-stored-123');
 assert.equal(calls[0].init.redirect,'error');
 assert.equal(calls[0].init.credentials,'omit');
 assert.equal(calls[0].init.referrerPolicy,'no-referrer');
 assert.equal(calls[0].init.cache,'no-store');
 const payload=JSON.parse(calls[0].init.body);
 assert.deepEqual(payload.messages.map(x=>x.role),['system','user']);
 assert.equal(payload.stream,false);
 assert.equal(payload.tools,undefined);
 assert.ok(!calls[0].init.body.includes('not-stored-123'));
 calls=[];
 await core.run({mode:'ollama',task:'report',input:'fato declarado',
  model:'gemma3:4b',apiKey:'should-not-be-used'},fetcher);
 assert.equal(calls[0].url,core.OLLAMA_URL);
 assert.equal(calls[0].init.headers.Authorization,undefined);
 assert.throws(()=>core.validate({mode:'offline',task:'plan',input:'x'.repeat(6001)}));
 assert.throws(()=>core.validate({mode:'offline',task:'bad-task',input:'x'}));
 assert.throws(()=>core.validate({...cfg,apiKey:'bad\nheader'}));
 await assert.rejects(()=>core.run(cfg,async()=>({
  ok:false,status:403,headers:{get:()=>null},
  text:async()=>('not-stored-123')})),(e)=>e.message.includes('403')&&!e.message.includes('not-stored-123'));
 await assert.rejects(()=>core.run(cfg,async()=>({
  ok:true,status:200,headers:{get:()=>null},
  text:async()=>JSON.stringify({choices:[{message:{tool_calls:[{}]}}]})
 })),/não retornou texto/);
 await assert.rejects(()=>core.run(cfg,async()=>({
  ok:true,status:200,headers:{get:()=>String(100001)},
  text:async()=>JSON.stringify({choices:[{message:{content:'ok'}}]})
 })),/limite/);
 console.log('AI bridge: local+BYOK+offline and security checks passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
