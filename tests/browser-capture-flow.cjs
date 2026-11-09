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
    await page.locator('#cap-declared').fill('https://example.org/documento-laboratorio');
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

    // Evidence-backed graph E2E: two records share only a documented
    // hostname, never an inferred identity or user account.
    await page.evaluate(async()=>{
      const list=await browserVault.listCases();
      await browserVault.addEvidence(list[0].id,{
        kind:'reference',title:'Segunda referência pública fictícia',
        url:'https://example.org/outro-documento',
        note:'Somente observável textual do hostname'
      });
    });
    await page.locator('#primary-nav [data-view="graph"]').click();
    await page.locator('#graph-case').selectOption({label:'Caso E2E de captura de arquivo'});
    await page.locator('#eg-visual svg').waitFor({timeout:15000});
    assert((await page.locator('#eg-stats').innerText()).includes('2 registros'));
    await page.locator('#eg-type').selectOption('domain');
    await page.locator('#eg-shared-only').check();
    await page.locator('#eg-visual .eg-repeated-button').first().waitFor();
    assert((await page.locator('#eg-visual .eg-repeated-button').first().innerText())
      .includes('2 registros'));
    await page.locator('#eg-visual .eg-repeated-button').first().click();
    assert((await page.locator('#eg-detail').innerText()).includes('Segunda referência pública fictícia'));
    assert((await page.locator('#eg-detail').innerText()).includes('Captura de arquivo'));
    // Explicit plaintext export is user-confirmed; it must not leak binary payloads.
    const graphExport=page.waitForEvent('download');
    await page.locator('#eg-export').click();
    const jsonDownload=await graphExport;
    const exported=JSON.parse(readFileSync(await jsonDownload.path(),'utf8'));
    assert.equal(exported.format,'protocolo-osint/evidence-graph-v1');
    assert.equal(exported.stats.shared,1);
    assert(exported.edges.every(e=>e.evidence_id));
    assert(!JSON.stringify(exported).includes('bytes_base64'));
    await page.locator('#primary-nav [data-view="cases"]').click();

    // Portable encrypted backup: export on profile A, reject a wrong password,
    // restore into profile B with its own new vault password and verify the
    // original archived bytes and evidence-linked graph survive.
    await page.locator('#pb-export-pass').fill('Isolated backup passphrase #2026 TEST');
    await page.locator('#pb-export-confirm').fill('Isolated backup passphrase #2026 TEST');
    const encryptedDownload=page.waitForEvent('download');
    await page.locator('#pb-export').click();
    const archiveDownload=await encryptedDownload;
    assert(archiveDownload.suggestedFilename().endsWith('.osintbackup'));
    const archived=readFileSync(await archiveDownload.path(),'utf8');
    assert.equal(JSON.parse(archived).format,'protocolo-osint/encrypted-portable-backup-v1');
    assert(!archived.includes('laboratorio.txt')&&!archived.includes('example.org'));
    const second=await browser.newContext({locale:'pt-BR',acceptDownloads:false});
    const page2=await second.newPage();
    page2.on('dialog',d=>d.accept());
    page2.on('pageerror',e=>errors.push('restore browser: '+e.message));
    await page2.route('**/api/v1/**',route=>route.fulfill({
      status:200,contentType:'application/json',body:JSON.stringify({})
    }));
    try{
      await page2.goto(local.url,{waitUntil:'domcontentloaded'});
      await page2.locator('#primary-nav [data-view="cases"]').click();
      await page2.locator('#vault-pass').fill('Another browser-local vault password 2026!');
      await page2.locator('#vault-submit').click();
      await page2.locator('#vault-gate.unlocked').waitFor();
      const chooseFile=()=>page2.locator('#pb-file').setInputFiles({
        name:'portable.osintbackup',mimeType:'application/octet-stream',
        buffer:Buffer.from(archived,'utf8')
      });
      await chooseFile();
      await page2.locator('#pb-import-pass').fill('incorrect backup passphrase 2026');
      await page2.locator('#pb-import').click();
      await page2.locator('#pb-feedback').getByText('Senha do backup incorreta',{exact:false}).waitFor();
      assert.equal((await page2.evaluate(()=>browserVault.listCases())).length,0,
        'Wrong passphrase changed destination vault');
      await chooseFile();
      await page2.locator('#pb-import-pass').fill('Isolated backup passphrase #2026 TEST');
      await page2.locator('#pb-import').click();
      await page2.locator('#pb-feedback').getByText('Restauração concluída',{exact:false}).waitFor();
      const restored=await page2.evaluate(async()=>{
        const items=await browserVault.listCases();
        const entry=await browserVault.getCase(items[0].id);
        const cap=entry.evidence.find(e=>e.capture);
        const verified=await browserVault.verifyCapture(entry.id,cap.id);
        return {count:items.length,sha:cap.capture.sha256_bytes,
          verified:verified.valid,title:entry.title};
      });
      assert.equal(restored.count,1);
      assert.equal(restored.sha,hash);
      assert.equal(restored.verified,true);
      assert.equal(restored.title,'Caso E2E de captura de arquivo');
      await chooseFile();
      await page2.locator('#pb-import-pass').fill('Isolated backup passphrase #2026 TEST');
      await page2.locator('#pb-import').click();
      await page2.locator('#pb-feedback').getByText('Nenhum caso novo',{exact:false}).waitFor();
      assert.equal((await page2.evaluate(()=>browserVault.listCases())).length,1);
      await page2.locator('#vault-lock').click();
      await page2.locator('#pb-export-pass').waitFor();
      assert.equal(await page2.locator('#pb-export').isEnabled(),false);
    }finally{
      await second.close();
    }

    // Never leak encrypted payload to the public server or view it after lock.
    const cipher=await page.evaluate(()=>localStorage.getItem('protocolo-osint:vault:1'));
    assert(cipher&&!cipher.includes('laboratorio.txt')&&!cipher.includes('Arquivo de laboratório'));
    await page.locator('#vault-lock').click();
    await page.locator('#cap-message').getByText('cofre está bloqueado',{exact:false}).waitFor();
    assert.equal(await page.locator('#cap-items .cap-item').count(),0);
    await page.locator('#primary-nav [data-view="graph"]').click();
    await page.locator('#eg-visual').getByText('Desbloqueie o cofre',{exact:false}).waitFor();
    assert(!(await page.locator('#eg-detail').innerText()).includes('example.org'),
      'Graph retained sensitive case detail after vault lock');
    assert.equal(await page.locator('#graph-canvas svg').count(),0,
      'Legacy graph must clear sensitive SVG labels on vault lock');
    assert.equal(errors.length,0,errors.join('; '));
    console.log('Capture E2E PASS: local file, real SHA, encrypted case, original download, report and lock.');
  }finally{
    await ctx.close();await browser.close();
    await new Promise(resolve=>local.srv.close(resolve));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
