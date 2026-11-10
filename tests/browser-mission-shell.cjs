/* Chromium UX smoke for the public/static app shell.
 * Local-only modules; no GitHub login, external searches or engine execution.
 */
'use strict';
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFileSync, mkdirSync } = require('node:fs');
const { join, resolve, extname, sep } = require('node:path');
const assert=require('node:assert/strict');
const root=resolve(__dirname,'../public');
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml'};
async function server(){
  return new Promise(resolveServer=>{
    const srv=createServer((req,res)=>{
      try{
        const url=new URL(req.url,'http://localhost');
        const file=resolve(root,url.pathname==='/'?'index.html':url.pathname.slice(1));
        if(file!==resolve(root,'index.html')&&!file.startsWith(root+sep)){
          res.writeHead(403).end();return;
        }
        res.writeHead(200,{'Content-Type':types[extname(file)]||'text/plain'});
        res.end(readFileSync(file));
      }catch(error){res.writeHead(404).end();}
    });
    srv.listen(0,'127.0.0.1',()=>resolveServer({srv,url:'http://127.0.0.1:'+srv.address().port}));
  });
}
async function run(){
  const {srv,url}=await server();
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:900},locale:'pt-BR'});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error.message)));
  page.on('dialog',dialog=>dialog.accept());
  await page.route('**/api/v1/**',route=>{
    const path=new URL(route.request().url()).pathname;
    const obj=path==='/api/v1/summary'?{sources:48,cases:0,evidence:0}:
      path==='/api/v1/sources'?{sources:[],total:0}:
      path==='/api/v1/auth/status'?{configured:true,authenticated:false}:
      path==='/api/v1/system/readiness'?{queue:{configured:false}}:{};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(obj)});
  });
  mkdirSync('test-artifacts',{recursive:true});
  try{
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.locator('#panel-dashboard .dynamic-center').waitFor({timeout:20000});
    assert.equal(await page.locator('#shell-vault-state').textContent(),'Cofre protegido');
    assert.equal(await page.locator('#shell-sidebar-toggle').isVisible(),true);
    const openWidth=(await page.locator('#app-sidebar').boundingBox()).width;
    assert(openWidth>=210&&openWidth<=260,'Unexpected sidebar initial width '+openWidth);
    await page.screenshot({path:'test-artifacts/mission-shell-desktop.png',fullPage:false});
    await page.locator('#shell-sidebar-toggle').click();
    const closedWidth=(await page.locator('#app-sidebar').boundingBox()).width;
    // Transitions can still be in progress immediately after the click.
    await page.waitForTimeout(370);
    const settledWidth=(await page.locator('#app-sidebar').boundingBox()).width;
    assert(settledWidth>=68&&settledWidth<=81,'Collapsed rail width is wrong '+settledWidth);
    assert.equal(await page.locator('#shell-sidebar-toggle').getAttribute('aria-expanded'),'false');
    assert.equal(await page.locator('#app-sidebar').getAttribute('aria-label'),'Menu principal');
    assert.equal(await page.locator('#primary-nav [data-view=sources]').getAttribute('title'),'Explorar fontes');
    await page.screenshot({path:'test-artifacts/mission-shell-collapsed.png',fullPage:false});
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#shell-sidebar-toggle').waitFor();
    assert.equal(await page.locator('#shell-sidebar-toggle').getAttribute('aria-expanded'),'false',
      'Desktop preference was not persisted');
    await page.locator('#primary-nav [data-view=sources]').click();
    assert.equal(await page.locator('#panel-sources').isVisible(),true);

    await page.keyboard.press('Control+k');
    await page.locator('#ops-command-query').waitFor({state:'visible'});
    assert.equal(await page.locator('#ops-command-query').evaluate(el=>document.activeElement===el),true);
    await page.locator('#ops-command-query').fill('conexoes');
    await page.getByRole('option',{name:/Mapa de conexões/}).click();
    assert.equal(await page.locator('#panel-graph').isVisible(),true);
    assert.equal(await page.locator('#ops-command-dialog').isVisible(),false);
    await page.keyboard.press('Control+k');
    assert.equal(await page.locator('#ops-command-dialog').isVisible(),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#ops-command-dialog').isVisible(),false);

    // A command menu is a navigation index, not an unverified engine status
    // or a channel transmitting private case text.
    const palette=await page.locator('#ops-command-dialog').innerText();
    assert(!palette.includes('Caso E2E privado'));
    await page.locator('#sidebar-collapse-toggle').click();
    await page.waitForTimeout(370);
    assert((await page.locator('#app-sidebar').boundingBox()).width>210);

    await page.setViewportSize({width:390,height:844});
    await page.locator('#mobile-menu').waitFor({state:'visible'});
    assert.equal(await page.locator('#mobile-menu').getAttribute('aria-expanded'),'false');
    await page.locator('#mobile-menu').click();
    await page.waitForTimeout(350);
    assert.equal(await page.locator('#mobile-menu').getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('#ops-nav-backdrop').isVisible(),true);
    assert.equal(await page.locator('#app-sidebar').getAttribute('id'),'app-sidebar');
    await page.screenshot({path:'test-artifacts/mission-shell-mobile.png',fullPage:false});
    await page.locator('#ops-nav-backdrop').click({position:{x:385,y:200}});
    assert.equal(await page.locator('#mobile-menu').getAttribute('aria-expanded'),'false');
    assert.equal(await page.locator('#ops-nav-backdrop').isVisible(),false);
    await page.locator('#mobile-menu').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#ops-nav-backdrop').isVisible(),false);
    await page.locator('#mobile-menu').click();
    await page.locator('#primary-nav [data-view=cases]').click();
    assert.equal(await page.locator('#panel-cases').isVisible(),true);
    assert.equal(await page.locator('#ops-nav-backdrop').isVisible(),false);
    assert.equal(errors.length,0,'Page errors: '+errors.join('; '));
    console.log('Mission shell E2E PASS: desktop width/persistence, sidebar routes, Ctrl+K, mobile backdrop/Escape and existing modules.');
  }finally{
    await context.close();await browser.close();
    await new Promise(resolveClose=>srv.close(resolveClose));
  }
}
run().catch(error=>{console.error(error.stack||String(error));process.exitCode=1});
