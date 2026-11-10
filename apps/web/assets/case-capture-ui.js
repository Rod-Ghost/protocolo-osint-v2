/* Case-scoped public source capture. Only explicit operator actions cause
 * file reads or HTTPS requests. No credentials, server upload, or scraping.
 */
(() => {
  'use strict';
  const runtime=document.body?.dataset.runtime;
  if(!['hosted','static'].includes(runtime)||!window.ProtocoloSourceCapture)return;
  const host=document.querySelector('#panel-cases');
  if(!host)return;
  const core=window.ProtocoloSourceCapture;
  const vault=()=>typeof browserVault!=='undefined'?browserVault:null;
  const ready=()=>!!vault()&&vault().status().unlocked;
  const $=(selector,parent=document)=>parent.querySelector(selector);
  const elem=(tag,css,value)=>{
    const x=document.createElement(tag);
    if(css)x.className=css;
    if(value!==undefined)x.textContent=String(value);
    return x;
  };
  const section=elem('section','case-capture');
  section.innerHTML=[
    '<div class="eyebrow">PRESERVAÇÃO LOCAL · SHA-256 DOS BYTES ORIGINAIS</div>',
    '<h2>Capturar e verificar documentos</h2>',
    '<p>Anexe um arquivo autorizado ou consulte um endereço público HTTPS que permita CORS.',
    ' O conteúdo fica criptografado neste navegador; nenhum arquivo é enviado ao nosso servidor.</p>',
    '<form id="cap-form" autocomplete="off">',
    '<div class="cap-grid">',
    '<label>Investigação <select id="cap-case"><option value="">Desbloqueie o cofre</option></select></label>',
    '<label>Método <select id="cap-mode"><option value="file">Anexar arquivo local</option>',
    '<option value="url">Capturar URL HTTPS (somente CORS público)</option></select></label>',
    '<label id="cap-file-label">Arquivo (até 192 KiB)<input type="file" id="cap-file"',
    ' accept=".txt,.csv,.json,.xml,.html,.htm,.pdf,.png,.jpg,.jpeg,.webp,text/plain,text/html,application/pdf,image/png,image/jpeg,image/webp"></label>',
    '<label id="cap-url-label" hidden>URL da fonte pública<input id="cap-url" type="url" maxlength="1800" ',
    'placeholder="https://example.org/publico/documento" /></label>',
    '<label id="cap-declared-label">URL de origem declarada (opcional)',
    '<input id="cap-declared" type="url" maxlength="1800" placeholder="https://example.org/arquivo" /></label>',
    '<label class="cap-note">Descrição/contexto <textarea id="cap-note" maxlength="1200" rows="2"',
    'placeholder="Autorização, motivo da captura e limites de interpretação"></textarea></label>',
    '</div>',
    '<label class="cap-consent"><input id="cap-consent" type="checkbox">',
    '<span>Confirmo acesso legítimo à fonte. Entendo que o SHA-256 comprova apenas os bytes guardados,',
    ' não a autoria, a autenticidade do site ou a validade jurídica.</span></label>',
    '<div class="cap-actions"><button type="button" id="cap-refresh" class="button ghost-button">',
    'Atualizar casos</button><button type="submit" id="cap-submit" class="button primary-button">',
    'Registrar captura no cofre</button></div>',
    '</form>',
    '<p class="cap-message" id="cap-message" role="status" aria-live="polite"></p>',
    '<h3>Capturas do caso selecionado</h3>',
    '<div id="cap-items"></div>',
    '<p class="cap-disclaimer">Cópias preservadas podem conter dados pessoais ou conteúdo ativo.',
    ' Exportar ou abrir um arquivo é uma decisão consciente do investigador.',
    ' O histórico está sujeito ao limite total de 1 MB do cofre.</p>'
  ].join('');
  const layout=host.querySelector('.case-layout');
  if(layout)layout.after(section);else host.append(section);
  const message=$('#cap-message',section),select=$('#cap-case',section),
    mode=$('#cap-mode',section),items=$('#cap-items',section);
  let currentCaseId='';
  function switchMode(){
    const url=mode.value==='url';
    $('#cap-file-label',section).hidden=url;
    $('#cap-url-label',section).hidden=!url;
    $('#cap-declared-label',section).hidden=url;
  }
  mode.addEventListener('change',switchMode);
  switchMode();
  const download=(name,bytes,type)=>{
    const blob=new Blob([bytes],{type:type||'application/octet-stream'});
    const href=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=href;a.download=name.replace(/[\/\\\x00-\x1f\x7f]/g,'_').slice(0,130)||'captura.bin';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(href),2500);
  };
  async function updateCases(){
    select.replaceChildren();
    if(!ready()){
      const empty=elem('option','','Desbloqueie o cofre em Meus casos');empty.value='';
      select.append(empty);select.disabled=true;items.replaceChildren();
      message.textContent='O cofre está bloqueado. Os arquivos originais permanecem inacessíveis.';
      currentCaseId='';return;
    }
    const cases=await vault().listCases();
    if(!cases.length){
      const empty=elem('option','','Crie um caso antes da captura');empty.value='';
      select.append(empty);select.disabled=true;
      message.textContent='Nenhum caso local disponível neste navegador.';
      items.replaceChildren();return;
    }
    select.disabled=false;
    for(const c of cases){
      const opt=elem('option','',c.title);opt.value=c.id;select.append(opt);
    }
    const active=document.querySelector('#case-list .case-item.active')?.dataset.case;
    const chosen=[currentCaseId,active].find(id=>cases.some(c=>c.id===id))||cases[0].id;
    select.value=chosen;currentCaseId=chosen;
    await renderCaptures();
  }
  async function renderCaptures(){
    items.replaceChildren();
    const caseId=select.value;
    if(!ready()||!caseId)return;
    const c=await vault().getCase(caseId);
    if(!c)return;
    const records=(c.evidence||[]).filter(e=>e.kind==='capture'&&e.capture?.format==='protocolo-osint/capture-v1');
    if(!records.length){
      items.append(elem('p','cap-empty','Ainda não existem capturas verificáveis neste caso.'));
      return;
    }
    for(const record of records.slice(-30).reverse()){
      const data=record.capture,row=elem('article','cap-item');
      row.append(elem('strong','',data.filename));
      const info=elem('p','cap-summary',data.mime_type+' · '+data.byte_count+' bytes · '+data.method+
        (data.source_url_declared?' · URL informada pelo investigador':'')+
        (data.http_status?' · HTTP '+data.http_status:''));
      row.append(info,elem('code','cap-hash','SHA-256 bytes: '+data.sha256_bytes));
      if(data.source_url){
        const link=elem('a','cap-link','Fonte declarada / consultada');
        link.href=data.source_url;link.target='_blank';link.rel='noopener noreferrer';
        row.append(link);
      }
      const controls=elem('div','cap-actions');
      const verify=elem('button','button ghost-button','Verificar integridade');
      verify.type='button';
      verify.addEventListener('click',async()=>{
        try{
          const result=await vault().verifyCapture(caseId,record.id);
          message.textContent=result.valid
            ?'Integridade confirmada: SHA-256 dos bytes armazenados corresponde ao manifesto local.'
            :'Falha de integridade: '+result.reason;
        }catch(error){message.textContent=error.message}
      });
      const exportFile=elem('button','button ghost-button','Recuperar arquivo');
      exportFile.type='button';
      exportFile.addEventListener('click',async()=>{
        if(!confirm('Exportar cópia NÃO criptografada de um arquivo que pode conter conteúdo ativo?'))return;
        try{
          const result=await vault().getCaptureBytes(caseId,record.id);
          download(result.filename,result.bytes,'application/octet-stream');
          message.textContent='Arquivo recuperado após SHA-256 válido. Guarde a cópia com segurança.';
        }catch(error){message.textContent=error.message}
      });
      const manifest=elem('button','button ghost-button','Exportar manifesto');
      manifest.type='button';
      manifest.addEventListener('click',async()=>{
        if(!confirm('Exportar manifesto JSON sem criptografia e sem os bytes originais?'))return;
        try{
          const result=await vault().verifyCapture(caseId,record.id);
          const {bytes_base64,...metadata}=data;
          const json=JSON.stringify({format:'protocolo-osint/capture-manifest-v1',
            case_id:caseId,evidence_id:record.id,evidence_metadata_sha256:record.sha256,
            capture:metadata,verification_result:result},null,2);
          download('manifesto-'+record.id+'.json',new TextEncoder().encode(json),'application/json');
          message.textContent='Manifesto exportado. O arquivo separado é necessário para conferir o SHA-256.';
        }catch(error){message.textContent=error.message}
      });
      controls.append(verify,exportFile,manifest);row.append(controls);items.append(row);
    }
  }
  select.addEventListener('change',()=>{
    currentCaseId=select.value;
    renderCaptures().catch(error=>message.textContent=error.message);
  });
  $('#cap-refresh',section).addEventListener('click',()=>updateCases().catch(e=>message.textContent=e.message));
  $('#cap-form',section).addEventListener('submit',async event=>{
    event.preventDefault();
    if(!ready()){message.textContent='Desbloqueie o cofre primeiro.';return}
    if(!$('#cap-consent',section).checked){
      message.textContent='Confirme a legitimidade e os limites da captura.';return;
    }
    const caseId=select.value;
    if(!caseId){message.textContent='Selecione um caso.';return}
    const submit=$('#cap-submit',section);submit.disabled=true;
    message.textContent='Preparando bytes com limites de tamanho e origem…';
    try{
      let capture;
      if(mode.value==='file'){
        const file=$('#cap-file',section).files[0];
        capture=await core.readFile(file);
        const declared=$('#cap-declared',section).value.trim();
        if(declared){capture.source_url=core.validatePublicUrl(declared);capture.source_declared=true}
      }else{
        capture=await core.readUrl($('#cap-url',section).value.trim());
      }
      const result=await vault().addCapture(caseId,{
        ...capture,note:$('#cap-note',section).value
      });
      if(result.saved){
        message.textContent='Bytes originais salvos no cofre. SHA-256: '+result.sha256_bytes+
          ' · '+result.byte_count+' bytes. Fonte/autenticidade exigem análise separada.';
      }else{
        message.textContent='Os mesmos bytes já estão preservados neste caso. Registro: '+result.duplicate_id;
      }
      $('#cap-file',section).value='';$('#cap-consent',section).checked=false;
      await renderCaptures();
      document.dispatchEvent(new CustomEvent('protocolo:open-case',{detail:{caseId}}));
    }catch(error){message.textContent='Captura não registrada: '+error.message}
    finally{submit.disabled=false}
  });
  // In-tab updates only; never poll public sites or upload decrypted case data.
  window.addEventListener('protocolo:vault-change',()=>{
    updateCases().catch(error=>message.textContent=error.message);
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest('#case-list .case-item');
    if(button){
      currentCaseId=button.dataset.case;
      updateCases().catch(error=>message.textContent=error.message);
    }
  });
  updateCases().catch(error=>message.textContent=error.message);
})();
