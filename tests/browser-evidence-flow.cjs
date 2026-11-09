/* Real Chromium E2E on local Vercel static bundle, with auth and jobs mocked.
 * No GitHub credentials, real engine scans, or external network requests.
 */
'use strict';
const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../public');
const id='a'.repeat(32);
const contentTypes={'.js':'text/javascript','.css':'text/css','.html':'text/html'};

async function server(){
  return new Promise(resolve=>{
    const instance=createServer((req,res)=>{
      try{
        const url=new URL(req.url,'http://localhost');
        const rel=url.pathname==='/'?'index.html':url.pathname.replace(/^\/+/,'');
        const filename=path.resolve(root,rel);
        if(!filename.startsWith(root+path.sep)&&filename!==path.resolve(root,'index.html')){
          res.writeHead(403).end();return;
        }
        const body=readFileSync(filename);
        res.writeHead(200,{'Content-Type':contentTypes[path.extname(filename)]||'text/plain'});
        res.end(body);
      }catch(error){res.writeHead(404).end();}
    });
    instance.listen(0,'127.0.0.1',()=>{
      const address=instance.address();
      resolve({instance,url:'http://127.0.0.1:'+address.port});
    });
  });
}
async function run(){
  const local=await server(),browser=await chromium.launch({headless:true});
  const context=await browser.newContext({locale:'pt-BR',acceptDownloads:false});
  const page=await context.newPage(),errors=[],calls=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept());
  await page.route('**/api/v1/**',route=>{
    const req=route.request(),url=new URL(req.url()),p=url.pathname;
    calls.push({path:p,method:req.method()});
    const reply=json=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(json)});
    if(p==='/api/v1/auth/status')return reply({
      configured:true,authenticated:true,username:'e2e-operator',csrf:'mocked-csrf'});
    if(p==='/api/v1/summary')return reply({
      sources:48,categories:11,cases:0,evidence:0,online_integrations:0});
    if(p==='/api/v1/sources')return reply({sources:[
      {id:'google',name:'Google',category:'Buscadores',description:'Example',
       kinds:['domain','username_candidate'],template:'https://www.google.com/search?q={query}'}
    ],total:1});
    if(p==='/api/v1/engines')return reply({engines:[]});
    if(p==='/api/v1/lookup/providers')return reply({providers:[]});
    if(p==='/api/v1/engines/queue/capabilities')return reply({configured:true,engines:[]});
    if(p==='/api/v1/system/readiness')return reply({queue:{configured:true}});
    if(p==='/api/v1/operator/search'){
      assert.equal(req.method(),'POST');
      const body=JSON.parse(req.postData());
      assert.equal(body.value,'exampleuser');
      return route.fulfill({status:202,contentType:'application/json',body:JSON.stringify({
        kind:'username',normalized_target:'exampleuser',jobs:[
          {engine:'sherlock',job_id:id,status:'queued'}
        ],errors:[],records_verified:false
      })});
    }
    if(p==='/api/v1/operator/jobs/'+id)return reply({
      engine:'sherlock',job_id:id,status:'completed',
      source:'https://github.com/sherlock-project/sherlock',
      observed_at:'2026-11-09T12:00:00Z',
      records:['https://github.com/exampleuser','<img src=x onerror=alert(42)>'],
      warning:'Output is not verified.'
    });
    return reply({});
  });
  try{
    await page.goto(local.url,{waitUntil:'domcontentloaded'});
    await page.locator('#panel-dashboard .dynamic-center').waitFor();
    await page.locator('#primary-nav [data-view="cases"]').click();
    await page.locator('#vault-pass').fill('E2E mocked hosted evidence password');
    await page.locator('#vault-submit').click();
    await page.locator('#vault-gate.unlocked').waitFor();
    await page.locator('#new-case-toggle').click();
    await page.locator('#case-title').fill('Caso exemplo evidências');
    await page.locator('#case-description').fill('Somente dados fictícios, nenhuma pesquisa externa');
    await page.locator('#case-form button[type=submit]').click();
    await page.locator('#case-list').getByText('Caso exemplo evidências').waitFor();

    await page.locator('#primary-nav [data-view="engines"]').click();
    await page.locator('#workflow-form').waitFor({state:'visible'});
    await page.locator('#workflow-query').fill('exampleuser');
    await page.locator('#workflow-kind').selectOption('username');
    await page.locator('#workflow-engine').selectOption('sherlock');
    await page.locator('#workflow-submit').click();
    await page.locator('#workflow-results .engine-review summary').waitFor({timeout:20000});
    await page.locator('#workflow-results .engine-review summary').click();
    await page.locator('.engine-review-row input[type=checkbox]').first().check();
    await page.locator('.engine-review-case').selectOption({label:'Caso exemplo evidências'});
    await page.locator('.engine-review-note').fill('Selecionado e anotado; identidade não verificada.');
    await page.locator('.engine-review-consent input').check();
    await page.locator('.engine-review-controls button.primary-button').click();
    await page.locator('.engine-review-feedback').getByText('1 registro(s) salvo(s)',{exact:false}).waitFor();

    const evidence=await page.evaluate(async()=>{
      const list=await browserVault.listCases();
      const c=await browserVault.getCase(list[0].id);
      return c.evidence;
    });
    assert.equal(evidence.length,1);
    assert.equal(evidence[0].provenance.engine,'sherlock');
    assert.equal(evidence[0].provenance.job_id,id);
    assert.equal(evidence[0].provenance.verification_status,'unverified');

    // HTML from a malicious CLI line must remain inert text, never execute.
    assert.equal(await page.locator('img[onerror]').count(),0);
    assert.equal(errors.length,0,'Unexpected JS exceptions: '+errors.join('; '));
    await page.locator('#primary-nav [data-view="cases"]').click();
    await page.locator('#case-list').getByText('Caso exemplo evidências').click();
    await page.locator('.engine-evidence-trace').waitFor();
    assert((await page.locator('.engine-evidence-trace').innerText()).includes('NÃO VERIFICADO'));
    const output=await page.evaluate(async()=>{
      const list=await browserVault.listCases();
      const c=await browserVault.getCase(list[0].id);
      return ProtocoloCaseReport.markdown(c);
    });
    assert(output.includes('**Job ID:** '+id));
    await page.locator('#vault-lock').click();
    const encrypted=await page.evaluate(()=>localStorage.getItem('protocolo-osint:vault:1'));
    assert(encrypted&&!encrypted.includes('exampleuser'));
    assert.equal(await page.locator('#case-detail').getByText('Caso exemplo evidências').count(),0);
    assert(!calls.some(x=>x.path.startsWith('/api/v1/engines/jobs')||
      x.path==='/api/v1/images/reverse'),'No real extra jobs/images allowed');
    console.log('Browser engine evidence E2E PASS: login mock, job mock, manual selection, case, report, privacy.');
  }finally{
    await context.close();await browser.close();
    await new Promise(resolve=>local.instance.close(resolve));
  }
}
run().catch(error=>{console.error(error);process.exitCode=1});
