/* Engine results -> reviewed, encrypted, local case evidence.
 * Does not call provider APIs, run engines, save to cloud, or claim identity.
 */
(function(root){
  'use strict';
  const $=(selector,parent=document)=>parent.querySelector(selector);
  const el=(tag,css,text)=>{
    const node=document.createElement(tag);
    if(css)node.className=css;
    if(text!==undefined)node.textContent=String(text);
    return node;
  };
  const vault=()=>typeof browserVault!=='undefined'?browserVault:null;
  const unlocked=()=>!!vault()&&vault().status().unlocked;
  function attach(container,records){
    if(!container||!Array.isArray(records)||!records.length)return;
    const panel=el('details','engine-review');
    const summary=el('summary','','Revisar e salvar achados no caso ('+records.length+')');
    panel.append(summary);
    panel.append(el('p','engine-review-warning',
      'Saída bruta e não verificada. Selecione apenas os registros relevantes; dados e hash serão salvos no cofre deste navegador.'));
    const selection=el('div','engine-review-list');
    for(const [index,item] of records.entries()){
      const label=el('label','engine-review-row');
      const checkbox=el('input');checkbox.type='checkbox';
      checkbox.value=String(index);checkbox.setAttribute('aria-label','Selecionar achado '+(index+1));
      const text=el('span','engine-review-raw',item.raw_record);
      label.append(checkbox,text);
      selection.append(label);
    }
    panel.append(selection);
    const controls=el('div','engine-review-controls');
    const actions=el('div','engine-review-actions');
    const chooseAll=el('button','button ghost-button','Selecionar primeiros 25');
    chooseAll.type='button';
    chooseAll.addEventListener('click',()=>{
      for(const [i,checkbox] of [...selection.querySelectorAll('input[type=checkbox]')].entries())
        checkbox.checked=i<25;
    });
    const clear=el('button','button ghost-button','Limpar seleção');
    clear.type='button';
    clear.addEventListener('click',()=>{
      for(const checkbox of selection.querySelectorAll('input[type=checkbox]'))checkbox.checked=false;
    });
    actions.append(chooseAll,clear);
    controls.append(actions);
    const caseLabel=el('label','','Salvar no caso local');
    const select=el('select','engine-review-case');
    select.id='engine-review-case-'+records[0].job_id;
    const initial=el('option','','Abra o cofre para carregar casos');initial.value='';
    select.append(initial);
    caseLabel.append(select);
    const load=el('button','button ghost-button','Atualizar casos');
    load.type='button';
    const noteLabel=el('label','','Anotação do investigador (opcional)');
    const note=el('textarea','engine-review-note');
    note.rows=2;note.maxLength=1000;note.placeholder='Por que este registro é relevante? Quais limitações devem ser observadas?';
    noteLabel.append(note);
    const confirmLabel=el('label','engine-review-consent');
    const confirm=el('input');confirm.type='checkbox';
    confirmLabel.append(confirm,el('span','',
      'Revisei os registros selecionados e compreendo que não comprovam identidade nem autenticidade.'));
    const save=el('button','button primary-button','Registrar observações no caso');
    save.type='button';
    const feedback=el('p','engine-review-feedback');
    feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');

    async function loadCases(){
      const previous=select.value;
      select.replaceChildren();
      if(!unlocked()){
        const opt=el('option','','Desbloqueie o cofre em Meus casos');opt.value='';
        select.append(opt);select.disabled=true;
        feedback.textContent='O cofre está bloqueado. Abra Meus casos para desbloquear ou criar um caso.';
        return;
      }
      const cases=await vault().listCases();
      if(!cases.length){
        const opt=el('option','','Crie um caso em Meus casos');opt.value='';
        select.append(opt);select.disabled=true;
        feedback.textContent='Nenhum caso disponível neste dispositivo.';
        return;
      }
      select.disabled=false;
      for(const c of cases){
        const option=el('option','',c.title);option.value=c.id;select.append(option);
      }
      if(cases.some(c=>c.id===previous))select.value=previous;
      feedback.textContent='Registros permanecem somente no cofre criptografado deste navegador.';
    }
    load.addEventListener('click',()=>loadCases().catch(e=>feedback.textContent=e.message));
    save.addEventListener('click',async()=>{
      if(!unlocked()){feedback.textContent='Desbloqueie o cofre primeiro.';return;}
      const indexes=[...selection.querySelectorAll('input[type=checkbox]:checked')]
        .map(input=>Number(input.value));
      if(!indexes.length || indexes.length>25){
        feedback.textContent='Selecione de 1 a 25 registros por vez.';return;
      }
      if(!confirm.checked){
        feedback.textContent='Confirme a revisão e a limitação dos registros.';return;
      }
      const caseId=select.value;
      if(!caseId){feedback.textContent='Selecione um caso.';return;}
      save.disabled=true;feedback.textContent='Protegendo os registros no cofre local…';
      try{
        const data=await vault().saveEngineFindings(caseId,
          indexes.map(index=>records[index]),{reviewNote:note.value});
        feedback.textContent=data.saved.length+' registro(s) salvo(s) no caso. '+
          (data.duplicates?data.duplicates+' duplicata(s) da mesma tarefa ignorada. ':'')+
          'Nenhuma fonte foi validada automaticamente.';
        const link=el('button','button ghost-button','Abrir caso');
        link.type='button';
        link.addEventListener('click',()=>document.dispatchEvent(new CustomEvent(
          'protocolo:open-case',{detail:{caseId}})));
        feedback.after(link);
        // Avoid accidental duplicate import on repeated clicks.
        for(const checkbox of selection.querySelectorAll('input[type=checkbox]:checked'))
          checkbox.checked=false;
      }catch(error){feedback.textContent='Não foi possível salvar: '+error.message}
      finally{save.disabled=false;}
    });
    controls.append(caseLabel,load,noteLabel,confirmLabel,save,feedback);
    panel.append(controls);container.append(panel);
    panel.addEventListener('toggle',()=>{
      if(panel.open)loadCases().catch(error=>feedback.textContent=error.message);
    });
  }
  const api=Object.freeze({attach});
  root.ProtocoloEvidenceUI=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
