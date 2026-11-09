/* Real Chromium: import a controlled local file into encrypted case, verify SHA,
 * download exact bytes, validate Markdown, lock and hide. No external requests.
 */
'use strict';
const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {readFileSync}=require('node:fs');
const {createHash}=require('node:crypto');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../public');
const sample=Buffer.from('Arquivo de laboratório Protocolo OSINT \u2014 bytes originais\n');
const hash=createHash('sha256').update(sample).digest('hex');
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html'};
async function server(){
  return new Promise(resolve=>{
    const srv=createServer((req,res)=>{
      try{
        const url=new URL(req.url,'http://localhost');
        const filename=path.resolve(root,url.pathname==='/'?'index.html':url.pathname.replace(/^\/+/,''));
        if(!filename.startsWith(root+path.sep)&&filename!==path.resolve(root,'index.html')){
          res.writeHead(403).end();return;
        }
        res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'text/plain'});
        res.end(readFileSync(filename));
      }catch{res.writeHead(404).end()}
    });
    srv.listen(0,'127.0.0.1',()=>resolve({srv,url:'http://127.0.0.1:'+srv.address().port}));
  });
}
async function main(){
  const local=await server(),browser=await chromium.launch({headless:true});
  const ctx=await browser.newContext({locale:'pt-BR',acceptDownloads:true});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  await page.route('**/api/v1/**',route=>{
    const u=new URL(route.request().url()),p=u.pathname;
    const data=p==='/api/v1/summary'?{sources:48,cases:0,evidence:0}:
      p==='/api/v1/sources'?{sources:[],total:0}:
      p==='/api/v1/auth/status'?{configured:true,authenticated:false}:
      p==='/api/v1/system/readiness'?{queue:{configured:false}}:{};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  try{
    await page.goto(local.url,{waitUntil:'domcontentloaded'});
    await page.locator('#primary-nav [data-view="cases"]').click();
    await page.locator('#vault-pass').fill('Local E2E password and 192 KB limit');
    await page.locator('#vault-submit').click();
    await page.locator('#vault-gate.unlocked').waitFor({timeout:20000});
    await page.locator('#new-case-toggle').click();
    await page.locator('#case-title').fill('Caso E2E de captura de arquivo');
    await page.locator('#case-description').fill('Somente arquivo fictício');
    await page.locator('#case-form button[type=submit]').click();
    await page.locator('#case-list').getByText('Caso E2E de captura de arquivo').waitFor();

    await page.locator('#cap-refresh').click();
    await page.locator('#cap-case').selectOption({label:'Caso E2E de captura de arquivo'});
    await page.locator('#cap-file').setInputFiles({
      name:'laboratorio.txt',mimeType:'text/plain',buffer:sample
    });
    await page.locator('#cap-note').fill('Arquivo fictício autorizado');
    await page.locator('#cap-consent').check();
    await page.locator('#cap-submit').click();
    await page.locator('#cap-message').getByText('Bytes originais salvos no cofre.',{exact:false}).waitFor();
    await page.locator('#cap-items .cap-item').first().waitFor();
    assert((await page.locator('#cap-items .cap-hash').first().innerText()).includes(hash));

    await page.locator('#cap-items .cap-item').first().getByRole('button',{name:'Verificar integridade'}).click();
    await page.locator('#cap-message').getByText('Integridade confirmada',{exact:false}).waitFor();

    const downloadPromise=page.waitForEvent('download');
    await page.locator('#cap-items .cap-item').first().getByRole('button',{name:'Recuperar arquivo'}).click();
    const download=await downloadPromise;
    const original=readFileSync(await download.path());
    assert.deepEqual(original,sample,'Downloaded bytes diverged from original');
    assert.equal(download.suggestedFilename(),'laboratorio.txt');

    const current=await page.evaluate(async()=>{
      const list=await browserVault.listCases();
      return browserVault.getCase(list[0].id);
    });
    assert.equal(current.evidence[0].capture.sha256_bytes,hash);
    assert.equal(current.evidence[0].capture.mime_type,'text/plain');
    const markdown=await page.evaluate(async()=>{
      const list=await browserVault.listCases();
      return ProtocoloCaseReport.markdown(await browserVault.getCase(list[0].id));
    });
    assert(markdown.includes('**SHA-256 dos BYTES originais:** '+hash));
    assert(!markdown.includes(sample.toString('base64')));

    // Never leak encrypted payload to the public server or view it after lock.
    const cipher=await page.evaluate(()=>localStorage.getItem('protocolo-osint:vault:1'));
    assert(cipher&&!cipher.includes('laboratorio.txt')&&!cipher.includes('Arquivo de laboratório'));
    await page.locator('#vault-lock').click();
    await page.locator('#cap-message').getByText('cofre está bloqueado',{exact:false}).waitFor();
    assert.equal(await page.locator('#cap-items .cap-item').count(),0);
    assert.equal(errors.length,0,errors.join('; '));
    console.log('Capture E2E PASS: local file, real SHA, encrypted case, original download, report and lock.');
  }finally{
    await ctx.close();await browser.close();
    await new Promise(resolve=>local.srv.close(resolve));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
