/* V2.8 browser regression: quick entry -> encrypted case -> plan -> reload.
 * Synthetic values and mocked source catalog, no real OSINT requests.
 */
'use strict';
const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {readFileSync,mkdirSync}=require('node:fs');
const {resolve,extname,sep}=require('node:path');
const assert=require('node:assert/strict');
const root=resolve(__dirname,'../public');
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json'};
const sources=[
 {id:'google',name:'Google',category:'Buscadores',kinds:['domain','free_text']},
 {id:'bing',name:'Bing',category:'Buscadores',kinds:['domain','free_text']},
 {id:'google-pdf',name:'Google PDF',category:'Documentos',kinds:['domain','free_text']}
];
async function serve(){return new Promise(done=>{
 const server=createServer((req,res)=>{
  try{
   const uri=new URL(req.url,'http://localhost');
   const f=resolve(root,uri.pathname==='/'?'index.html':uri.pathname.slice(1));
   if(f!==resolve(root,'index.html')&&!f.startsWith(root+sep))return res.writeHead(403).end();
   res.writeHead(200,{'Content-Type':types[extname(f)]||'text/plain'}).end(readFileSync(f));
  }catch{return res.writeHead(404).end()}
 });
 server.listen(0,'127.0.0.1',()=>done({server,url:'http://127.0.0.1:'+server.address().port}));
})}
async function run(){
 const {server,url}=await serve(),browser=await chromium.launch({headless:true});
 const context=await browser.newContext({locale:'pt-BR',viewport:{width:1440,height:900},acceptDownloads:false});
 const page=await context.newPage(),errors=[],outsiders=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',req=>{if(new URL(req.url()).origin!==new URL(url).origin)outsiders.push(req.url())});
 page.on('dialog',d=>d.accept('Plano de laboratório example.org'));
 await page.route('**/api/v1/**',route=>{
  const pathname=new URL(route.request().url()).pathname;
  const reply=(payload,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)});
  if(pathname==='/api/v1/sources')return reply({sources,total:sources.length});
  if(pathname==='/api/v1/summary')return reply({sources:3,cases:0,evidence:0});
  if(pathname==='/api/v1/auth/status')return reply({configured:true,authenticated:false});
  if(pathname==='/api/v1/system/readiness')return reply({queue:{configured:false}});
  if(pathname==='/api/v1/search/builder'){
   const payload=route.request().postDataJSON();requests.push(payload);
   return reply({total:payload.source_ids.length,results:payload.source_ids.map(id=>({
    id,name:id,category:'Consulta pública',query_mode:'basic',
    url:'https://example.org/demo?q='+encodeURIComponent(payload.value)
   })),skipped:[],external_requests:0,actual_results:null});
  }
  return reply({});
 });
 mkdirSync('test-artifacts',{recursive:true});
 try{
  await page.goto(url,{waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('#quick-investigate').isVisible(),true);
  await page.locator('#primary-nav [data-view=cases]').click();
  await page.locator('#vault-pass').fill('laboratory-only-persistent-vault-passphrase');
  await page.locator('#vault-submit').click();
  await page.locator('#vault-gate.unlocked').waitFor();
  await page.locator('#new-case-toggle').click();
  await page.locator('#case-title').fill('Caso rápido example.org');
  await page.locator('#case-form button[type=submit]').click();
  await page.locator('#case-saved-notice:visible').waitFor();
  const id=await page.evaluate(async()=> (await browserVault.listCases())[0].id);
  assert(id,'Created case missing');
  await page.locator('#case-start-investigation').click();
  await page.locator('#panel-sources:visible').waitFor();
  await page.locator('#primary-nav [data-view=dashboard]').click();
  await page.locator('#global-query').fill('example.org');
  await page.locator('#quick-kind').selectOption('domain');
  await page.screenshot({path:'test-artifacts/quick-investigation-desktop.png',fullPage:false});
  await page.locator('#quick-investigate').click();
  await page.locator('#cb-query').waitFor({state:'visible'});
  assert.equal(await page.locator('#cb-query').inputValue(),'example.org');
  assert.equal(await page.locator('#cb-kind').inputValue(),'domain');
  await page.locator('#wf-next').click();
  await page.locator('#cb-compatible').click();
  assert.equal(await page.locator('#wf-selected-count').innerText(),'3');
  assert.equal(requests.length,0,'Selecting sources must not query the Internet');
  await page.locator('#wf-next').click();
  await page.locator('#cb-generate').click();
  await page.locator('#cb-results .cb-count').waitFor();
  await page.locator('#wf-next').click();
  assert.equal(await page.locator('#cb-case').inputValue(),id,
   'Newly created case must be linked without manual refresh');
  assert.equal(await page.locator('#cb-save').isEnabled(),true,
   'Save button should enable after explicit case selection and plan creation');
  await page.locator('#cb-save').click();
  await page.locator('#cb-state').getByText(/Plano salvo no cofre criptografado/).waitFor();
  const saved=await page.evaluate(async()=>await browserVault.getCase(
   (await browserVault.listCases())[0].id));
  assert.equal(saved.search_plans.length,1);
  assert.equal(saved.search_plans[0].query,'example.org');
  assert.equal(requests.length,1);
  assert.equal(requests[0].kind,'domain');
  await page.locator('#primary-nav [data-view=dashboard]').click();
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-artifacts/quick-investigation-mobile.png',fullPage:false});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert(overflow<=2,'Mobile horizontal scroll: '+overflow);
  const local=await page.evaluate(()=>localStorage.getItem('protocolo-osint:vault:1'));
  assert(local&&!local.includes('Caso rápido example.org'),'Plaintext case leaked to localStorage');
  await page.setViewportSize({width:1440,height:900});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#primary-nav [data-view=cases]').click();
  await page.locator('#vault-pass').fill('laboratory-only-persistent-vault-passphrase');
  await page.locator('#vault-submit').click();
  await page.locator('#vault-gate.unlocked').waitFor();
  const after=await page.evaluate(async()=>{
   const ids=await browserVault.listCases();return browserVault.getCase(ids[0].id);
  });
  assert.equal(after.title,'Caso rápido example.org');
  assert.equal(after.search_plans.length,1);
  assert.deepEqual(errors,[]);assert.deepEqual(outsiders,[]);
  console.log('PASS: quick investigation, case save, guided plan, encrypted persistence, mobile');
 }finally{await context.close();await browser.close();server.close()}
}
run().catch(e=>{console.error(e.stack||e);process.exitCode=1});
