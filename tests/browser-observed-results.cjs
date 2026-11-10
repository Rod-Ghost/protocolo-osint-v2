/* V3.1: real observed provider/engine responses, PDF export and encrypted vault.
 * All external APIs mocked, no actual OSINT scans or GitHub auth.
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
   const f=resolve(root,uri.pathname==='/'?'index.html':uri.pathname.slice(1));
   if(f!==resolve(root,'index.html')&&!f.startsWith(root+sep))return res.writeHead(403).end();
   res.writeHead(200,{'Content-Type':mime[extname(f)]||'text/plain'}).end(readFileSync(f));
  }catch{res.writeHead(404).end()}
 });
 server.listen(0,'127.0.0.1',()=>done({server,url:'http://127.0.0.1:'+server.address().port}));
})}
async function main(){
 const {server,url}=await serve(),browser=await chromium.launch({headless:true});
 const context=await browser.newContext({locale:'pt-BR',viewport:{width:1440,height:900},acceptDownloads:true});
 const page=await context.newPage(),errors=[],outsiders=[],calls=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>d.accept('Plano de laboratório'));
 page.on('request',r=>{if(new URL(r.url()).origin!==new URL(url).origin)outsiders.push(r.url())});
 await page.route('**/api/v1/**',route=>{
  const path=new URL(route.request().url()).pathname;
  const reply=(result,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(result)});
  if(path==='/api/v1/summary')return reply({sources:2,cases:0,evidence:0});
  if(path==='/api/v1/sources')return reply({sources,total:2});
  if(path==='/api/v1/auth/status')return reply({configured:true,authenticated:true,csrf:'test-csrf'});
  if(path==='/api/v1/system/readiness')return reply({queue:{configured:false}});
  if(path==='/api/v1/search/builder'){
   const body=route.request().postDataJSON();calls.push({path,body});
   return reply({total:body.source_ids.length,results:body.source_ids.map(id=>({
    id,name:id,category:'Consulta planejada',query_mode:'basic',
    url:'https://example.org/?q='+encodeURIComponent(body.value)
   })),skipped:[],external_requests:0,actual_results:null});
  }
  if(path==='/api/v1/lookup'){
   const body=route.request().postDataJSON();calls.push({path,body});
   if(body.provider==='dns')return reply({
    provider:'dns',provider_name:'DNS público',query:body.value,
    status:'observed',items:[{type:'A',name:body.value,data:'192.0.2.1',ttl:30}],
    count:1,observed_at:'2026-11-10T12:00:00Z',
    source_url:'https://cloudflare-dns.com/dns-query',verified:false
   });
   if(body.provider==='github_name')return reply({
    provider:'github_name',provider_name:'Candidatos por nome no GitHub',query:body.value,
    status:'observed',items:[{login:'candidate-example',profile_url:'https://github.com/candidate-example'}],
    count:1,observed_at:'2026-11-10T12:00:03Z',
    source_url:'https://github.com/search?q=Test%20Example&type=users',verified:false
   });
   if(body.provider==='certificates')return reply({
    provider:'certificates',provider_name:'Certificados TLS',query:body.value,
    status:'no_result',items:[],count:0,observed_at:'2026-11-10T12:00:02Z',
    source_url:'https://crt.sh/?q=example.org',verified:false
   });
  }
  if(path==='/api/v1/operator/search'){
   const body=route.request().postDataJSON();calls.push({path,body,csrf:route.request().headers()['x-osint-csrf']});
   return reply({kind:'domain',normalized_target:'example.org',
    jobs:[{job_id:'a'.repeat(32),engine:'subfinder',status:'queued'}],errors:[]});
  }
  if(path==='/api/v1/operator/jobs/'+'a'.repeat(32)){
   calls.push({path});
   return reply({status:'completed',job_id:'a'.repeat(32),engine:'subfinder',
    records:['sub.example.org'],completed_at:'2026-11-10T12:00:03Z',
    warning:'Não verificado'});
  }
  return reply({});
 });
 mkdirSync('test-artifacts',{recursive:true});
 try{
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#primary-nav [data-view=cases]').click();
  await page.locator('#vault-pass').fill('test-observed-only-vault-password-2026');
  await page.locator('#vault-submit').click();
  await page.locator('#vault-gate.unlocked').waitFor();
  await page.locator('#new-case-toggle').click();
  await page.locator('#case-title').fill('Caso consultas reais example.org');
  await page.locator('#case-form button[type=submit]').click();
  await page.locator('#case-list').getByText('Caso consultas reais example.org').waitFor();
  await page.locator('#primary-nav [data-view=sources]').click();
  await page.locator('#cb-query').fill('example.org');
  await page.locator('#cb-kind').selectOption('domain');
  await page.locator('#wf-next').click();
  await page.locator('#cb-source-list input[value=google]').check();
  await page.locator('#wf-next').click();
  await page.locator('#wf-next').click();
  await page.locator('#ir-panel:visible').waitFor();
  assert.equal(await page.locator('#ir-pdf').isVisible(),false);
  assert.equal(calls.filter(c=>c.path==='/api/v1/lookup').length,0);
  await page.locator('#ir-run').click();
  await page.locator('#ir-list .ir-source').nth(1).waitFor();
  const first=await page.evaluate(()=>ProtocoloInvestigationUI.view());
  assert.equal(first.summary.returned,1);
  assert.equal(first.summary.no_records,1);
  assert.equal(first.summary.with_records,1);
  assert.equal(first.summary.failed,0);
  assert.equal(calls.filter(c=>c.path==='/api/v1/lookup').length,2);
  assert.match(await page.locator('#ir-summary').innerText(),/1 registro\(s\) retornado/);
  assert.equal(await page.locator('#ir-list a[href^="https://cloudflare-dns.com"]').count(),1);
  await page.locator('#ir-list details').first().locator('summary').click();
  await page.screenshot({path:'test-artifacts/observed-results-desktop.png',fullPage:false});
  const downloadEvent=page.waitForEvent('download');
  await page.locator('#ir-pdf').click();
  const download=await downloadEvent;
  assert.match(download.suggestedFilename(),/^protocolo-osint-.*\.pdf$/);
  const pdf=readFileSync(await download.path()).toString('latin1');
  assert(pdf.startsWith('%PDF-1.4'));
  assert.match(pdf,/\/Subtype \/Link/);
  assert.match(pdf,/192\.0\.2\.1/);
  await page.locator('#ir-engines').click();
  await page.locator('#ir-list .ir-source').nth(2).waitFor();
  const combined=await page.evaluate(()=>ProtocoloInvestigationUI.view());
  assert.equal(combined.summary.returned,2);
  assert.equal(combined.sources,undefined);
  assert.equal(combined.run.sources[2].id,'subfinder');
  assert.equal(combined.run.sources[2].items[0],'sub.example.org');
  assert.equal(calls.find(c=>c.path==='/api/v1/operator/search').csrf,'test-csrf');
  await page.locator('#ir-save').click();
  await page.locator('#ir-status').getByText(/Resultados retornados foram salvos no cofre/).waitFor();
  const saved=await page.evaluate(async()=>{
   const cases=await browserVault.listCases();
   const c=await browserVault.getCase(cases[0].id);
   return {runs:c.investigation_runs,plans:c.search_plans,evidence:c.evidence};
  });
  assert.equal(saved.runs.length,1);
  assert.equal(saved.runs[0].sources.length,3);
  assert.equal(saved.runs[0].sources[0].count,1);
  assert.equal(saved.runs[0].sources[2].status,'completed');
  assert.equal(saved.plans.length,0,'Only observed results should be persisted by save results');
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-artifacts/observed-results-mobile.png',fullPage:false});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert(overflow<=2,'Horizontal overflow: '+overflow);
  const local=await page.evaluate(()=>localStorage.getItem('protocolo-osint:vault:1'));
  assert(local&&!local.includes('192.0.2.1'),'Observed records leaked in plaintext storage');
  await page.setViewportSize({width:1440,height:900});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#primary-nav [data-view=cases]').click();
  await page.locator('#vault-pass').fill('test-observed-only-vault-password-2026');
  await page.locator('#vault-submit').click();
  await page.locator('#vault-gate.unlocked').waitFor();
  await page.locator('#case-list').getByText('Caso consultas reais example.org').click();
  await page.locator('#cw-tab-results').click();
  await page.locator('#cw-pane').getByText('Consulta: example.org').waitFor();
  await page.locator('#cw-pane details summary').click();
  assert.match(await page.locator('#cw-pane').innerText(),/192\.0\.2\.1/);
  const again=page.waitForEvent('download');
  await page.locator('#cw-pane').getByText('Baixar PDF deste relatório').click();
  const dl=await again;
  assert.match(dl.suggestedFilename(),/\.pdf$/);

  // User-entered full names give public-profile CANDIDATES, never identity proof.
  await page.locator('#primary-nav [data-view=sources]').click();
  await page.locator('#wf-progress [data-wf-step="0"]').click();
  await page.locator('#cb-query').fill('Test Example');
  await page.locator('#cb-kind').selectOption('free_text');
  await page.locator('#wf-progress [data-wf-step="3"]').click();
  await page.locator('#ir-run').click();
  await page.locator('#ir-list .ir-observed').waitFor();
  const names=await page.evaluate(()=>ProtocoloInvestigationUI.view());
  assert.equal(names.summary.returned,1);
  assert.equal(names.run.sources[0].id,'github_name');
  assert.equal(calls.at(-1).body.provider,'github_name');
  assert.match(await page.locator('#ir-panel').innerText(),/Candidatos por nome no GitHub/);
  assert.deepEqual(errors,[]);
  assert.deepEqual(outsiders,[]);
  console.log('PASS: real provider records, per-source status, authorized queued motor, linked PDF, vault archive, mobile, reload');
 }finally{await context.close();await browser.close();server.close()}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
