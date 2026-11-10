/* Regression: user can save a plan with NO pre-existing case.
 * Local Chromium vault, artificial target, no actual external lookups.
 */
'use strict';
const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {readFileSync,mkdirSync}=require('node:fs');
const {resolve,extname,sep}=require('node:path');
const assert=require('node:assert/strict');
const root=resolve(__dirname,'../public');
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json'};
const sources=[
 {id:'google',name:'Google',category:'Buscadores',kinds:['domain','free_text']},
 {id:'bing',name:'Bing',category:'Buscadores',kinds:['domain','free_text']}
];
async function serve(){return new Promise(done=>{
 const server=createServer((req,res)=>{
  try{
   const uri=new URL(req.url,'http://localhost');
   const file=resolve(root,uri.pathname==='/'?'index.html':uri.pathname.slice(1));
   if(file!==resolve(root,'index.html')&&!file.startsWith(root+sep))return res.writeHead(403).end();
   res.writeHead(200,{'Content-Type':mime[extname(file)]||'text/plain'}).end(readFileSync(file));
  }catch{res.writeHead(404).end()}
 });
 server.listen(0,'127.0.0.1',()=>done({server,url:'http://127.0.0.1:'+server.address().port}));
})}
async function main(){
 const {server,url}=await serve(),browser=await chromium.launch({headless:true});
 const context=await browser.newContext({locale:'pt-BR',viewport:{width:1440,height:900}});
 const page=await context.newPage(),errors=[],external=[],builders=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(new URL(r.url()).origin!==new URL(url).origin)external.push(r.url())});
 page.on('dialog',d=>d.accept('Plano sintético example.org'));
 await page.route('**/api/v1/**',r=>{
  const path=new URL(r.request().url()).pathname;
  const reply=(data)=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  if(path==='/api/v1/sources')return reply({sources,total:sources.length});
  if(path==='/api/v1/summary')return reply({sources:2,cases:0,evidence:0});
  if(path==='/api/v1/auth/status')return reply({configured:true,authenticated:false});
  if(path==='/api/v1/system/readiness')return reply({queue:{configured:false}});
  if(path==='/api/v1/search/builder'){
   const body=r.request().postDataJSON();builders.push(body);
   return reply({total:body.source_ids.length,results:body.source_ids.map(id=>({
    id,name:id,category:'Buscadores',query_mode:'basic',
    url:'https://example.org/test?q='+encodeURIComponent(body.value)
   })),skipped:[],external_requests:0,actual_results:null});
  }
  return reply({});
 });
 mkdirSync('test-artifacts',{recursive:true});
 try{
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#primary-nav [data-view=cases]').click();
  await page.locator('#vault-pass').fill('strong-synthetic-browser-vault-password');
  await page.locator('#vault-submit').click();
  await page.locator('#vault-gate.unlocked').waitFor();
  assert.equal((await page.evaluate(()=>browserVault.listCases())).length,0);
  await page.locator('#primary-nav [data-view=sources]').click();
  await page.locator('#cb-query').fill('example.org');
  await page.locator('#cb-kind').selectOption('domain');
  await page.locator('#wf-next').click();
  await page.locator('#cb-source-list input[value=google]').check();
  await page.locator('#wf-next').click();
  await page.locator('#cb-generate').click();
  await page.locator('#cb-results .cb-count').waitFor();
  await page.locator('#wf-next').click();
  await page.locator('#cb-new-case-row:visible').waitFor();
  assert.equal(await page.locator('#cb-case').inputValue(),'__new__');
  assert.equal(await page.locator('#cb-new-case-title').inputValue(),'example.org');
  assert.equal(await page.locator('#cb-save').isEnabled(),true);
  assert.equal(await page.locator('#cb-vault-help').isVisible(),false);
  await page.locator('#cb-new-case-title').fill('Caso criado no próprio salvamento');
  await page.screenshot({path:'test-artifacts/save-plan-inline-desktop.png',fullPage:false});
  await page.locator('#cb-save').click();
  await page.locator('#cb-state').getByText(/Salvo e confirmado no cofre/).waitFor();
  const saved=await page.evaluate(async()=>{
   const list=await browserVault.listCases();
   const item=await browserVault.getCase(list[0].id);
   return {count:list.length,title:item.title,plans:item.search_plans.map(p=>p.query),
     select:document.querySelector('#cb-case').value};
  });
  assert.equal(saved.count,1);assert.equal(saved.title,'Caso criado no próprio salvamento');
  assert.deepEqual(saved.plans,['example.org']);
  assert.notEqual(saved.select,'__new__');
  assert.equal(builders.length,1);
  // Regression: second case can be created directly without overwriting first.
  await page.locator('#cb-case').selectOption('__new__');
  await page.locator('#cb-new-case-title').fill('Segundo caso de laboratório');
  assert.equal(await page.locator('#cb-save').isEnabled(),true);
  await page.locator('#cb-save').click();
  await page.locator('#cb-state').getByText(/Salvo e confirmado no cofre/).waitFor();
  assert.equal((await page.evaluate(()=>browserVault.listCases())).length,2);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-artifacts/save-plan-inline-mobile.png',fullPage:false});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert(overflow<=2,'Unexpected mobile horizontal overflow: '+overflow);
  await page.setViewportSize({width:1440,height:900});
  await page.locator('#primary-nav [data-view=cases]').click();
  await page.locator('#vault-lock').click();
  await page.locator('#primary-nav [data-view=sources]').click();
  await page.locator('#cb-vault-help:visible').waitFor();
  assert.equal(await page.locator('#cb-save').isEnabled(),false);
  assert.match(await page.locator('#cb-vault-help').innerText(),/cofre criptografado/i);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#primary-nav [data-view=cases]').click();
  await page.locator('#vault-pass').fill('strong-synthetic-browser-vault-password');
  await page.locator('#vault-submit').click();
  await page.locator('#vault-gate.unlocked').waitFor();
  const persisted=await page.evaluate(async()=>{
   const cases=await browserVault.listCases();
   return Promise.all(cases.map(c=>browserVault.getCase(c.id)));
  });
  assert.equal(persisted.length,2);
  assert(persisted.every(c=>c.search_plans.length===1));
  // After a reload with multiple cases, require explicit destination.
  await page.locator('#primary-nav [data-view=sources]').click();
  await page.locator('#cb-refresh-cases').click();
  assert.equal(await page.locator('#cb-case').inputValue(),'');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS: no-case save, inline creation, 2 cases, vault lock, persisted plans, mobile');
 }finally{await context.close();await browser.close();server.close()}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
