/* Real browser smoke against the PUBLIC PRODUCTION URL.
 * Uses a brand-new Chromium context, an ephemeral LOCAL AES-GCM vault,
 * only example.org fixtures, and no GitHub OAuth, engine jobs, or outside scans.
 * Never writes cases to Vercel, Cloudflare or Supabase.
 */
'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const URL = process.env.OSINT_E2E_URL || 'https://protocolo-osint-v2-nine.vercel.app';
const timeout = 25000;

async function flow(page) {
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error.message).slice(0,500)));
  page.on('dialog',dialog=>dialog.accept('Plano de exemplo · E2E'));
  const response=await page.goto(URL,{waitUntil:'domcontentloaded',timeout:45000});
  assert(response&&response.ok(), 'Production homepage failed: '+response?.status());
  await page.locator('#panel-dashboard .dynamic-center').waitFor({timeout});
  assert.equal(await page.locator('#panel-dashboard').isVisible(),true);
  const pageTitle=await page.title();
  assert(pageTitle.includes('Protocolo OSINT'),pageTitle);

  // The anonymous operator may create local cases, but may NOT submit Daemon jobs.
  await page.locator('#primary-nav [data-view="cases"]').click();
  await page.locator('#vault-pass').waitFor({timeout});
  await page.locator('#vault-pass').fill('E2E-local-vault-only-strong-password');
  await page.locator('#vault-submit').click();
  await page.locator('#vault-gate.unlocked').waitFor({timeout});

  // All case data belongs only to this isolated browser context.
  await page.locator('#new-case-toggle').click();
  await page.locator('#case-title').fill('Caso E2E público example.org');
  await page.locator('#case-description').fill('Teste automatizado somente de interface; nenhuma consulta externa autorizada.');
  await page.locator('#case-form button[type="submit"]').click();
  await page.locator('#case-list').getByText('Caso E2E público example.org').waitFor({timeout});

  await page.locator('#primary-nav [data-view="sources"]').click();
  await page.locator('#cb-query').fill('example.org');
  await page.locator('#cb-kind').selectOption('domain');
  // The guided UI hides stage 2 until the operator advances explicitly.
  // The original catalog remains available in advanced mode.
  if(await page.locator('#wf-next').isVisible())
    await page.locator('#wf-next').click();
  await page.locator('#cb-source-list input[value="google"]').waitFor({timeout});
  await page.locator('#cb-source-list input[value="google"]').check();
  if(await page.locator('#wf-next').isVisible())
    await page.locator('#wf-next').click();
  await page.locator('#cb-generate').click();
  await page.locator('#cb-results .cb-count').waitFor({timeout});
  const countText=await page.locator('#cb-results .cb-count').textContent();
  assert(/links preparados/.test(countText),countText);
  assert(/NÃO MEDIDOS/.test(countText), 'Misleading external search result count');

  if(await page.locator('#wf-next').isVisible())
    await page.locator('#wf-next').click();
  await page.locator('#cb-refresh-cases').click();
  await page.locator('#cb-case').selectOption({label:'Caso E2E público example.org'});
  await page.locator('#cb-save').click();
  await page.getByText('Plano salvo no cofre criptografado, vinculado ao caso.').waitFor({timeout});

  await page.locator('#primary-nav [data-view="dashboard"]').click();
  await page.locator('#dc-metrics .dc-metric').first().waitFor({timeout});
  const dashboard=await page.locator('#dc-metrics').innerText();
  assert(dashboard.includes('Casos locais'),dashboard);
  assert(dashboard.includes('Planos de busca'),dashboard);
  await page.locator('#dc-cases .dc-case').first().click();
  await page.locator('#panel-cases').waitFor({state:'visible',timeout});
  await page.locator('#case-detail').getByText('Caso E2E público example.org').first().waitFor({timeout});

  // Case-saved plan can be recalled from dashboard activity.
  await page.locator('#primary-nav [data-view="dashboard"]').click();
  await page.locator('#dc-timeline .dc-event').first().click();
  // Activity may be a case event: either its case or plan must open.
  await page.locator('#panel-cases:visible, #panel-sources:visible').first().waitFor({timeout});

  await page.locator('#primary-nav [data-view="cases"]').click();
  await page.locator('#vault-lock').click();
  await page.locator('#primary-nav [data-view="dashboard"]').click();
  await page.locator('#dc-locked').waitFor({state:'visible',timeout});
  assert.equal(await page.locator('#dc-content').isVisible(),false,
    'Sensitive case data visible after vault lock');

  const payload=await page.evaluate(()=>localStorage.getItem('protocolo-osint:vault:1'));
  assert(payload&&!payload.includes('Caso E2E público'),
    'Cleartext investigation leaked in browser-local encrypted storage');
  assert.equal(errors.length,0,'Unexpected browser JS errors: '+errors.join('; '));
  return {url:URL,rendered:true,vault:true,caseCreated:true,planSaved:true,
    dashboard:true,privacyLock:true,externalScans:0};
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({locale:'pt-BR',timezoneId:'America/Sao_Paulo',
    viewport:{width:1440,height:900},acceptDownloads:false});
  const page=await context.newPage();
  try{
    const result=await flow(page);
    console.log('Production browser smoke PASS:',JSON.stringify(result));
  }catch(error){
    fs.mkdirSync('test-artifacts',{recursive:true});
    await page.screenshot({path:'test-artifacts/browser-smoke-failure.png',
      fullPage:true}).catch(()=>{});
    console.error('Production browser smoke FAIL:',error.stack||String(error));
    process.exitCode=1;
  }finally{
    await context.close();
    await browser.close();
  }
})();
