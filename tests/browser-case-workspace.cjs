/* Case Workspace V2.7 Chromium regression — only local synthetic fixtures. */
'use strict';
const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {readFileSync,mkdirSync}=require('node:fs');
const {resolve,extname,sep}=require('node:path');
const assert=require('node:assert/strict');
const root=resolve(__dirname,'../public');
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json'};
const start=()=>new Promise(done=>{
 const server=createServer((req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');
   const file=resolve(root,url.pathname==='/'?'index.html':url.pathname.slice(1));
   if(file!==resolve(root,'index.html')&&!file.startsWith(root+sep))return res.writeHead(403).end();
   res.writeHead(200,{'Content-Type':types[extname(file)]||'text/plain'}).end(readFileSync(file));
  }catch{res.writeHead(404).end()}
 });
 server.listen(0,'127.0.0.1',()=>done({server,url:'http://127.0.0.1:'+server.address().port}));
});
async function main(){
 const {server,url}=await start(),browser=await chromium.launch({headless:true});
 const context=await browser.newContext({locale:'pt-BR',viewport:{width:1440,height:900},acceptDownloads:false});
 const page=await context.newPage(),errors=[],thirdParty=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(new URL(r.url()).origin!==new URL(url).origin)thirdParty.push(r.url())});
 await page.route('**/api/v1/**',route=>{
  const path=new URL(route.request().url()).pathname;
  const value=path==='/api/v1/summary'?{sources:48,cases:0,evidence:0}:
   path==='/api/v1/sources'?{sources:[],total:0}:path==='/api/v1/auth/status'?
   {configured:true,authenticated:false}:path==='/api/v1/system/readiness'?
   {queue:{configured:false}}:{};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
 });
 mkdirSync('test-artifacts',{recursive:true});
 try{
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#primary-nav [data-view=cases]').click();
  await page.locator('#case-workspace').waitFor();
  assert.match(await page.locator('#cw-pane').innerText(),/protegidos|protegido/i);
  await page.locator('#vault-pass').fill('laboratory vault password test only 2026');
  await page.locator('#vault-submit').click();
  await page.locator('#vault-gate.unlocked').waitFor();
  await page.locator('#new-case-toggle').click();
  await page.locator('#case-title').fill('Caso laboratório example.org');
  await page.locator('#case-description').fill('Dados artificiais de homologação');
  await page.locator('#case-form button[type=submit]').click();
  await page.locator('#case-list').getByText('Caso laboratório example.org').waitFor();
  await page.locator('#cw-title').getByText('Caso laboratório example.org').waitFor();
  assert.match(await page.locator('#cw-pane').innerText(),/0\s*Registros/);
  await page.screenshot({path:'test-artifacts/case-workspace-desktop.png',fullPage:false});
  await page.locator('#cw-tab-timeline').click();
  assert.match(await page.locator('#cw-pane').innerText(),/Investigação criada/);
  await page.locator('#cw-tab-evidence').click();
  assert.match(await page.locator('#cw-pane').innerText(),/Nenhum registro/);
  await page.locator('#evidence-title').fill('Registro manual sintético');
  await page.locator('#evidence-note').fill('Apenas texto de laboratório');
  await page.locator('#evidence-form button[type=submit]').click();
  await page.locator('#cw-pane').getByText('Registro manual sintético').waitFor();
  await page.locator('#cw-tab-plans').click();
  assert.match(await page.locator('#cw-pane').innerText(),/Nenhum plano/);
  await page.locator('#cw-tab-overview').click();
  assert.match(await page.locator('#cw-pane').innerText(),/1\s*Registros/);
  await page.locator('#cw-tab-overview').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#cw-tab-timeline').getAttribute('aria-selected'),'true');
  await page.locator('#vault-lock').click();
  await page.locator('#cw-pane').getByText(/Dados protegidos/).waitFor();
  assert.equal((await page.locator('#case-workspace').innerText()).includes('Registro manual sintético'),false);
  assert.equal((await page.locator('#case-workspace').innerText()).includes('Caso laboratório example.org'),false);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-artifacts/case-workspace-mobile.png',fullPage:false});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert(overflow<=2,'Mobile horizontal overflow '+overflow);
  assert.deepEqual(errors,[]);
  assert.deepEqual(thirdParty,[]);
  console.log('Case workspace desktop/mobile, AES lock and accessibility PASS');
 }finally{await context.close();await browser.close();server.close()}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
