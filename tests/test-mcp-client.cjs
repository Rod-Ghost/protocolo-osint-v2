const assert=require('node:assert/strict');
const m=require('../apps/web/assets/mcp-client.js');
assert.equal(m.validateEndpoint('https://example.org/mcp'),'https://example.org/mcp');
assert.equal(m.presets.find(x=>x.id==='protocolo').url,'https://protocolo-osint-v2-nine.vercel.app/mcp/');
for(const u of ['http://example.org','https://localhost/mcp','https://127.0.0.1/mcp','https://[::1]/mcp','https://user:pw@example.org/mcp','https://example.org/mcp#secret'])assert.throws(()=>m.validateEndpoint(u));
assert.deepEqual(m.safeArgs('{"target":"example.org"}'),{target:'example.org'});
for(const s of ['[]','"hi"','{invalid'])assert.throws(()=>m.safeArgs(s));
let id=0;const calls=[];
const fetcher=async(url,opts)=>{
 const body=JSON.parse(opts.body);calls.push({url,body,headers:opts.headers,credentials:opts.credentials});
 if(body.method==='notifications/initialized')return {ok:true,status:202,headers:{get:()=>null}};
 return {ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify({jsonrpc:'2.0',id:body.id,result:body.method==='initialize'?{protocolVersion:'2025-06-18',serverInfo:{name:'mock'}}:body.method==='tools/list'?{tools:[{name:'inspect_domain'}]}:{content:[{type:'text',text:'ok'}]}})};
};
(async()=>{const c=m.createClient('https://example.org/mcp','session-secret',fetcher);await c.connect();assert.equal((await c.tools())[0].name,'inspect_domain');assert.equal((await c.call('inspect_domain',{domain:'example.org'})).content[0].text,'ok');assert.equal(calls[0].headers.Authorization,'Bearer session-secret');assert.equal(calls[0].credentials,'omit');assert.equal(calls.length,4);c.close();console.log('MCP browser client: 10+ assertions passed');})().catch(e=>{console.error(e);process.exit(1)});
