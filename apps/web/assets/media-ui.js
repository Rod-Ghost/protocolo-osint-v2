/* Protocolo OSINT V2 / Image intelligence workbench.
   Local matches stay on-device. OCR runs in browser with a lazily loaded,
   licensed, third-party Tesseract.js worker. Web search requires a configured
   Google Cloud Vision provider and one explicit image upload per request. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tools=window.ProtocoloImageTools;
  const panel=$('#panel-images'),fileInput=$('#image-input');
  if(!panel||!fileInput||!tools)return;
  const node=document.createElement('section');
  node.className='image-intelligence';
  node.innerHTML=`
    <header class="image-intelligence-head"><div><div class="eyebrow">LABORATÓRIO / ANÁLISE AVANÇADA</div><h2>Comparar, ler, localizar.</h2><p>Três métodos com níveis diferentes de privacidade. Nenhuma busca externa acontece automaticamente.</p></div><span class="image-method-tag">CONTROLE POR CONSULTA</span></header>
    <div class="image-methods">
      <article class="image-method"><span class="image-step">01 / LOCAL</span><h3>Similaridade visual</h3><p>Compare o dHash com as imagens já documentadas em todos os casos do cofre desbloqueado.</p><button id="image-local-search" type="button" class="method-button">Comparar no cofre</button><div id="image-local-status" class="image-method-result" role="status">Aguardando imagem.</div></article>
      <article class="image-method"><span class="image-step">02 / OCR</span><h3>Reconhecimento de texto</h3><p>OCR em português e inglês no navegador. O motor e os idiomas são baixados somente após iniciar.</p><button id="image-ocr-run" type="button" class="method-button">Extrair texto</button><div id="image-ocr-status" class="image-method-result" role="status">Nenhum OCR executado.</div><button id="image-ocr-copy" class="text-action" type="button" hidden>Copiar texto extraído</button>
      <button id="image-ocr-save" class="text-action" type="button" hidden>Guardar OCR no caso selecionado</button></article>
      <article class="image-method"><span class="image-step">03 / WEB</span><h3>Busca reversa externa</h3><p>Localize páginas e imagens semelhantes via Google Cloud Vision, somente com credenciais configuradas.</p><div id="image-reverse-config" class="image-provider-status">Verificando serviço externo…</div><label class="image-consent"><input type="checkbox" id="image-reverse-consent" /> Autorizo transmitir esta imagem ao Google Cloud Vision.</label><label class="image-token-label" for="image-reverse-token">Chave administrativa temporária</label><input id="image-reverse-token" type="password" autocomplete="off" placeholder="Nunca armazenada no navegador" /><button id="image-reverse-run" type="button" class="method-button" disabled>Pesquisar na web</button><div id="image-reverse-status" class="image-method-result" role="status">Sem envio de dados.</div><div class="manual-reverse-links"><span>Alternativas manuais, sem integração automática:</span><a href="https://lens.google/" rel="noopener noreferrer" referrerpolicy="no-referrer" target="_blank">Google Lens</a><a href="https://tineye.com/" rel="noopener noreferrer" referrerpolicy="no-referrer" target="_blank">TinEye</a></div></article>
    </div>
    <p class="image-privacy-note">Comparação local: hashes e metadados do cofre criptografado. OCR: somente processamento local, mas o navegador busca componentes do Tesseract.js em um CDN na primeira execução. Busca web: upload explícito ao serviço externo, que pode cobrar pela consulta. Ausência de correspondência não comprova originalidade.</p>`;
  const output=$('#image-output');
  if(output)output.before(node);else panel.append(node);
  // Correct old labels without removing legacy functionality. External upload is opt-in.
  const privacy = panel.querySelector('.safety-note p');
  if(privacy) privacy.textContent='Análise local não envia sua foto. Somente a busca reversa externa, quando configurada, transmite a imagem mediante seu consentimento.';
  const privacyBadge=panel.querySelector('.page-heading .heading-badge');
  if(privacyBadge){const last=privacyBadge.lastChild;if(last&&last.nodeType===3)last.textContent=' PRIVACIDADE CONTROLADA';}
  const legacyFeatures=panel.querySelectorAll('.lab-side .analysis-feature small');
  if(legacyFeatures[1])legacyFeatures[1].textContent='OCR em português e inglês, iniciado por você';
  if(legacyFeatures[2])legacyFeatures[2].textContent='Dimensões e hashes; EXIF requer suporte específico';
  const status=(id,text)=>{$('#'+id).textContent=text;};
  const btn=id=>$('#'+id);
  let ocrText='',reverseEnabled=false,loadedOCR=null;
  const file=()=>tools.safeFileType((typeof state!=='undefined'&&state.imageFile)||fileInput.files?.[0]);
  fileInput.addEventListener('change',()=>{
    status('image-local-status','Imagem selecionada. Comparação disponível.');
    status('image-ocr-status','Pronto para OCR local.');
    status('image-reverse-status','Aguardando consentimento e consulta.');
  });

  btn('image-local-search').addEventListener('click',async()=>{
    const button=btn('image-local-search');button.disabled=true;
    try{
      const selected=file();
      if(typeof browserVault==='undefined'||!browserVault||!browserVault.status().unlocked)throw Error('Abra o cofre em “Meus casos” para pesquisar o acervo criptografado.');
      if(typeof previewAnalyze!=='function')throw Error('Analisador de imagem local indisponível.');
      const image=await previewAnalyze(selected);
      const list=await browserVault.listCases();
      const cases=await Promise.all(list.map(c=>browserVault.getCase(c.id)));
      const matches=tools.compareAcrossCases(image.sha256,image.dhash,cases);
      const target=btn('image-local-status');target.replaceChildren();
      if(!matches.length){target.textContent=`Sem correspondências próximas nos ${list.length} casos pesquisados (dHash, limite de 14 bits).`;return;}
      const table=document.createElement('div');table.className='image-matches';
      matches.forEach(match=>{
        const entry=document.createElement('div');
        entry.innerHTML=`<strong>${esc(match.title)}</strong><small>${esc(match.case_title)} · ${match.exact?'Arquivo idêntico (SHA-256)':'Similaridade dHash: '+match.distance+'/64 bits'}</small>`;
        table.append(entry);
      });
      target.append(table);
    }catch(error){status('image-local-status',error.message)}finally{button.disabled=false;}
  });

  function loadOCR(){
    if(window.Tesseract?.createWorker)return Promise.resolve(window.Tesseract);
    if(loadedOCR)return loadedOCR;
    loadedOCR=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
      script.referrerPolicy='no-referrer';
      script.crossOrigin='anonymous';
      script.onload=()=>window.Tesseract?.createWorker?resolve(window.Tesseract):reject(Error('Tesseract.js não inicializou.'));
      script.onerror=()=>reject(Error('Falha ao baixar o motor de OCR. Verifique rede ou bloqueio de CDN.'));
      document.head.append(script);
    }).catch(error=>{loadedOCR=null;throw error});
    return loadedOCR;
  }
  btn('image-ocr-run').addEventListener('click',async()=>{
    const button=btn('image-ocr-run');button.disabled=true;button.textContent='Processando…';
    let worker;
    try{
      const selected=file();
      status('image-ocr-status','Carregando motor OCR e idioma português + inglês…');
      const tess=await loadOCR();
      worker=await tess.createWorker('por+eng',1,{logger:m=>{
        if(m?.status){const pct=typeof m.progress==='number'?` ${Math.round(m.progress*100)}%`:'';status('image-ocr-status',m.status+pct);}
      }});
      const result=await worker.recognize(selected);
      ocrText=String(result?.data?.text||'').trim().slice(0,12000);
      status('image-ocr-status',ocrText||'OCR concluído, mas nenhum texto legível foi identificado.');
      btn('image-ocr-copy').hidden=!ocrText;
      btn('image-ocr-save').hidden=!ocrText;
    }catch(error){status('image-ocr-status',`OCR indisponível: ${error.message}`)}
    finally{if(worker)try{await worker.terminate()}catch{}button.disabled=false;button.textContent='Extrair texto';}
  });
  btn('image-ocr-save').addEventListener('click',async()=>{
    try{
      if(typeof browserVault==='undefined'||!browserVault||!browserVault.status().unlocked)throw Error('Desbloqueie o cofre em Meus casos.');
      const caseId=$('#image-case')?.value;
      if(!caseId)throw Error('Selecione um caso no formulário acima para registrar o OCR.');
      if(!ocrText)throw Error('Execute OCR primeiro.');
      await browserVault.addEvidence(caseId,{kind:'note',title:'OCR de imagem: '+String(file().name).slice(0,100),note:ocrText.slice(0,5000)});
      status('image-ocr-status',ocrText+'\n\nRegistro OCR salvo criptografado no caso selecionado.');
      if(typeof loadSummary==='function')await loadSummary();
    }catch(error){status('image-ocr-status',String(error.message));}
  });
  btn('image-ocr-copy').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(ocrText);status('image-ocr-status',ocrText+'\n\nTexto copiado para a área de transferência.');}
    catch{status('image-ocr-status',ocrText+'\n\nNão foi possível copiar automaticamente.');}
  });
  function updateReverseButton(){btn('image-reverse-run').disabled=!reverseEnabled||!btn('image-reverse-consent').checked;}
  btn('image-reverse-consent').addEventListener('change',updateReverseButton);
  async function getReverseConfig(){
    try{
      const response=await fetch('/api/v1/images/reverse/config',{cache:'no-store'});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      const data=await response.json();
      reverseEnabled=!!data.configured;
      btn('image-reverse-config').textContent=reverseEnabled?'PROVEDOR CONFIGURADO · REQUER CHAVE':'PROVEDOR NÃO CONFIGURADO · NECESSITA API KEY';
    }catch{reverseEnabled=false;btn('image-reverse-config').textContent='PROVEDOR INDISPONÍVEL';}
    updateReverseButton();
  }
  const encodeFile=selected=>new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onerror=()=>reject(Error('Não foi possível ler o arquivo.'));
    reader.onload=()=>resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(selected);
  });
  btn('image-reverse-run').addEventListener('click',async()=>{
    const button=btn('image-reverse-run');button.disabled=true;
    try{
      const selected=file();
      if(selected.size>2_000_000)throw Error('A busca na web aceita imagens de até 2 MB. Reduza o arquivo primeiro.');
      if(!btn('image-reverse-consent').checked||!reverseEnabled)throw Error('Provedor externo desativado ou consentimento ausente.');
      const token=btn('image-reverse-token').value;
      if(!token)throw Error('Informe a chave de execução administrativa.');
      status('image-reverse-status','Enviando imagem com seu consentimento. Consultando índice externo…');
      const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),25000);
      let response;
      try{response=await fetch('/api/v1/images/reverse',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({mime_type:selected.type,content_base64:await encodeFile(selected)})})}
      finally{clearTimeout(timeout)}
      const data=await response.json();
      if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:`HTTP ${response.status}`);
      const target=btn('image-reverse-status');target.replaceChildren();
      const grouped=[['Páginas com correspondência',data.pages_with_matching_images],['Imagens correspondentes',data.full_matching_images],['Correspondências parciais',data.partial_matching_images],['Imagens semelhantes',data.visually_similar_images]];
      let found=0;
      grouped.forEach(([label,links])=>{
        if(!Array.isArray(links)||!links.length)return;
        const heading=document.createElement('strong');heading.textContent=label;target.append(heading);
        links.slice(0,12).forEach(raw=>{
          try{const url=new URL(raw);if(url.protocol!=='https:')return;
            const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.referrerPolicy='no-referrer';link.textContent=url.hostname+' · '+url.pathname.slice(0,55);target.append(link);found++;
          }catch{}
        });
      });
      if(!found)target.textContent='Provedor consultado; nenhuma correspondência retornada. Ausência não confirma originalidade.';
      const small=document.createElement('small');small.textContent='Fonte: '+String(data.provider||'provedor externo')+' · '+String(data.observed_at||'');target.append(small);
    }catch(error){status('image-reverse-status',`Consulta não concluída: ${error.name==='AbortError'?'tempo esgotado':error.message}`);}
    finally{btn('image-reverse-token').value='';updateReverseButton();}
  });
  getReverseConfig();
})();
