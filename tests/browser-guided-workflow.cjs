/* Chromium E2E for the actual case-search planner, not a simulated wizard.
 * Uses an ephemeral local browser vault and an in-memory mock of the
 * existing builder API; no external sites or engines are queried.
 */
'use strict';
const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {readFileSync,mkdirSync}=require('node:fs');
const {resolve,extname,sep}=require('node:path');
const assert=require('node:assert/strict');
const dir=resolve(__dirname,'../public');
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json'};
const fixtureSources=[
  {id:'google',name:'Google',category:'Buscadores',kinds:['domain','free_text','username_candidate','email','ip','url']},
  {id:'bing',name:'Bing',category:'Buscadores',kinds:['domain','free_text','email','url']},
  {id:'google-pdf',name:'Google PDF',category:'Documentos',kinds:['domain','free_text']},
  {id:'viewdns-whois',name:'ViewDNS',category:'Infraestrutura',kinds:['domain']}
];
async function serve(){
  return new Promise(done=>{
    const server=createServer((req,res)=>{
      try{
        const uri=new URL(req.url,'http://localhost');
        const file=resolve(dir,uri.pathname==='/'?'index.html':uri.pathname.slice(1));
        if(file!==resolve(dir,'index.html')&&!file.startsWith(dir+sep)){
          res.writeHead(403).end();return;
        }
        res.writeHead(200,{'Content-Type':mime[extname(file)]||'text/plain'});
        res.end(readFileSync(file));
      }catch{res.writeHead(404).end();}
    });
    server.listen(0,'127.0.0.1',()=>done({server,url:'http://127.0.0.1:'+server.address().port}));
  });
}
async function run(){
  const {server,url}=await serve();
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({
    locale:'pt-BR',viewport:{width:1440,height:900},acceptDownloads:false
  });
  const page=await context.newPage();
  const pageErrors=[],requests=[],thirdParty=[];
  page.on('pageerror',e=>pageErrors.push(e.message));
  page.on('dialog',dialog=>dialog.accept('Plano de laboratório — documentação de fontes'));
  page.on('request',request=>{
    const url=new URL(request.url());
    if(!url.origin.startsWith('http://127.0.0.1:'))thirdParty.push(url.origin);
  });
  await page.route('**/api/v1/**',route=>{
    const path=new URL(route.request().url()).pathname;
    const reply=(data,status=200)=>route.fulfill({
      status,contentType:'application/json',body:JSON.stringify(data)});
    if(path==='/api/v1/summary')return reply({sources:fixtureSources.length,cases:0,evidence:0});
    if(path==='/api/v1/sources')return reply({sources:fixtureSources,total:fixtureSources.length});
    if(path==='/api/v1/auth/status')return reply({configured:true,authenticated:false});
    if(path==='/api/v1/system/readiness')return reply({queue:{configured:false}});
    if(path==='/api/v1/search/builder'){
      const payload=route.request().postDataJSON();
      requests.push(payload);
      const data=payload.source_ids.map(id=>{
        const src=fixtureSources.find(s=>s.id===id);
        return {id,name:src?.name||id,category:src?.category||'Busca',
          query_mode:id==='google'?'advanced':'basic',
          url:'https://example.org/laboratorio?q='+encodeURIComponent(payload.value)};
      });
      return reply({total:data.length,results:data,skipped:[],external_requests:0,
        actual_results:null});
    }
    return reply({});
  });
  mkdirSync('test-artifacts',{recursive:true});
  try{
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.locator('#primary-nav [data-view="cases"]').click();
    await page.locator('#vault-pass').fill('A strong lab-only passphrase for guided search');
    await page.locator('#vault-submit').click();
    await page.locator('#vault-gate.unlocked').waitFor();
    await page.locator('#new-case-toggle').click();
    await page.locator('#case-title').fill('Caso demonstrativo — investigação guiada');
    await page.locator('#case-form button[type=submit]').click();
    await page.locator('#case-list').getByText('Caso demonstrativo — investigação guiada').waitFor();
    await page.locator('#toast.show').getByText('Caso criado no cofre criptografado deste navegador.',{exact:true}).waitFor();
    // Capture design screenshots only after ephemeral notifications vanish.
    await page.locator('#toast.show').waitFor({state:'hidden',timeout:12000});

    await page.locator('#primary-nav [data-view="sources"]').click();
    await page.locator('.case-builder.wf-enabled').waitFor();
    const legacyCatalog=page.locator('#wf-legacy-catalog');
    await legacyCatalog.waitFor();
    assert.equal(await legacyCatalog.getAttribute('open'),null,
      'Original source catalog must start collapsed in guided mode');
    await legacyCatalog.locator('summary').click();
    assert.equal(await page.locator('#source-results').isVisible(),true,
      'Original source explorer must remain accessible on demand');
    await legacyCatalog.locator('summary').click();
    assert.equal(await page.locator('#source-results').isVisible(),false);
    assert.equal(await page.locator('#wf-mode-guided').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('.wf-stage[data-wf-stage="0"]').isVisible(),true);
    assert.equal(await page.locator('.wf-stage[data-wf-stage="1"]').isVisible(),false);
    await page.screenshot({path:'test-artifacts/workflow-guided-target.png',fullPage:false});

    await page.locator('#wf-next').click();
    await page.locator('#cb-state').getByText('Informe um termo',{exact:false}).waitFor();
    await page.locator('.wf-type-card[data-wf-kind=domain]').click();
    await page.locator('#cb-query').fill('example.org');
    await page.locator('#wf-next').click();
    assert.equal(await page.locator('.wf-stage[data-wf-stage="1"]').isVisible(),true);
    await page.locator('#cb-source-list input[value=google]').waitFor();
    await page.locator('#cb-clear').click();
    await page.locator('#wf-next').click();
    await page.locator('#cb-state').getByText('Selecione ao menos uma fonte',{exact:false}).waitFor();
    await page.locator('#cb-source-list input[value=google]').check();
    await page.locator('#cb-source-list input[value=viewdns-whois]').check();
    assert.equal(await page.locator('#wf-selected-count').innerText(),'2');
    await page.screenshot({path:'test-artifacts/workflow-guided-sources.png',fullPage:false});
    await page.locator('#wf-next').click();
    assert.equal(await page.locator('.wf-stage[data-wf-stage="2"]').isVisible(),true);
    await page.locator('#wf-advanced-options summary').click();
    await page.locator('#cb-site').fill('example.org');
    await page.locator('#cb-file').selectOption('pdf');
    await page.locator('#cb-exact').check();
    await page.locator('#cb-generate').click();
    await page.locator('#cb-results .cb-count').getByText('2 links preparados',{exact:false}).waitFor();
    assert((await page.locator('#cb-results .cb-count').innerText()).includes('NÃO MEDIDOS'));
    assert.equal(requests.length,1);
    assert.deepEqual([...requests[0].source_ids].sort(),['google','viewdns-whois'].sort());
    assert.equal(requests[0].kind,'domain');
    assert.equal(requests[0].filters.filetype,'pdf');
    assert.equal(requests[0].filters.site,'example.org');
    assert.equal(requests[0].filters.exact,true);
    assert.equal(await page.locator('#cb-results .cb-link').count(),2);
    await page.screenshot({path:'test-artifacts/workflow-guided-results.png',fullPage:false});
    await page.locator('#wf-next').click();
    await page.locator('#cb-refresh-cases').click();
    await page.locator('#cb-case').selectOption({label:'Caso demonstrativo — investigação guiada'});
    assert.equal(await page.locator('#cb-save').isEnabled(),true);
    await page.locator('#cb-save').click();
    await page.locator('#cb-state').getByText('Plano salvo no cofre criptografado',{exact:false}).waitFor();
    const saved=await page.evaluate(async()=>{
      const cases=await browserVault.listCases();
      const item=await browserVault.getCase(cases[0].id);
      return {caseId:item.id,plans:item.search_plans};
    });
    assert.equal(saved.plans.length,1);
    assert.deepEqual([...saved.plans[0].source_ids].sort(),['google','viewdns-whois'].sort());
    assert.equal(saved.plans[0].filters.filetype,'pdf');
    // The original advanced workflow is still accessible in the exact same DOM.
    await page.locator('#wf-mode-advanced').click();
    assert.equal(await page.locator('#cb-query').isVisible(),true);
    assert.equal(await page.locator('#cb-site').isVisible(),true);
    assert.equal(await page.locator('#cb-source-list').isVisible(),true);
    assert.equal(await page.locator('#cb-save').isVisible(),true);
    await page.locator('#cb-query').fill('example.com');
    assert.equal(await page.locator('#cb-save').isEnabled(),false);
    assert.equal(await page.locator('#cb-results .cb-count').count(),0);
    await page.locator('#cb-generate').click();
    await page.locator('#cb-results .cb-count').getByText('links preparados',{exact:false}).waitFor();
    assert.equal(requests.at(-1).value,'example.com');
    await page.locator('#cb-select').click();
    assert.equal(await page.locator('#cb-save').isEnabled(),false,
      'Bulk source selection did not invalidate stale prepared links');
    assert.equal(await page.locator('#cb-results .cb-count').count(),0);
    await page.locator('#cb-case').selectOption('');
    await page.locator('#cb-case').selectOption({label:'Caso demonstrativo — investigação guiada'});
    assert.equal(await page.locator('#cb-save').isEnabled(),false,
      'Changing case incorrectly re-enabled a stale search plan');
    await page.evaluate(()=>{
      // A synthetic stale click confirms the original savePlan guard,
      // independently of the wizard's disabled state.
      const save=document.querySelector('#cb-save');
      save.disabled=false;save.click();
    });
    await page.locator('#cb-state').getByText('O alvo, os filtros ou as fontes mudaram',{exact:false}).waitFor();
    assert.equal((await page.evaluate(async()=>{
      const items=await browserVault.listCases();
      return (await browserVault.getCase(items[0].id)).search_plans.length;
    })),1,'A changed plan was saved without regeneration');

    // A saved plan opened elsewhere should be visible in the guided result
    // stage, without triggering any external request or engine job.
    await page.locator('#wf-mode-guided').click();
    await page.evaluate(({caseId,planId})=>{
      document.dispatchEvent(new CustomEvent('protocolo:open-plan',
        {detail:{caseId,planId}}));
    },{caseId:saved.caseId,planId:saved.plans[0].id});
    await page.locator('#cb-results .cb-count').waitFor({timeout:15000});
    await page.waitForFunction(()=>window.ProtocoloGuidedWorkflow.view().step===2);
    assert.equal(await page.locator('#cb-query').inputValue(),'example.org');

    await page.setViewportSize({width:390,height:844});
    // Wait for the real sidebar transition before taking a mobile screenshot:
    // a mid-animation frame is not an honest representation of the design.
    await page.waitForTimeout(450);
    const mobileGeometry=await page.evaluate(()=>{
      const drawer=document.querySelector('#app-sidebar').getBoundingClientRect();
      return {drawerRight:drawer.right,width:innerWidth,
        documentWidth:document.documentElement.scrollWidth,
        open:document.querySelector('#app-sidebar').classList.contains('open')};
    });
    assert.equal(mobileGeometry.open,false,'Mobile drawer unexpectedly open');
    assert(mobileGeometry.drawerRight<=1,'Mobile drawer covers the page: '+JSON.stringify(mobileGeometry));
    assert(mobileGeometry.documentWidth<=mobileGeometry.width+4,
      'Page scrolls horizontally on mobile: '+JSON.stringify(mobileGeometry));
    await page.screenshot({path:'test-artifacts/workflow-guided-mobile.png',fullPage:false});
    assert.equal(thirdParty.length,0,'External network request: '+thirdParty.join(', '));
    assert.equal(pageErrors.length,0,'Browser errors: '+pageErrors.join('; '));
    console.log('Guided workflow PASS: four stages, advanced controls, real API payload, old plans, local case, mobile, zero external requests.');
  }finally{
    await context.close();await browser.close();
    await new Promise(done=>server.close(done));
  }
}
run().catch(error=>{console.error(error.stack||String(error));process.exitCode=1});
