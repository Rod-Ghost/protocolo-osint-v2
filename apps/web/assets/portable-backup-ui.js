/* Encrypted portable backups: explicit user-driven export/import, no upload.
 * This panel preserves the existing legacy JSON export button unchanged.
 */
(() => {
  'use strict';
  if(!['hosted','static'].includes(document.body?.dataset.runtime)||
     !window.ProtocoloPortableBackup)return;
  const gate=document.querySelector('#vault-gate');
  if(!gate)return;
  const api=window.ProtocoloPortableBackup;
  const vault=()=>typeof browserVault!=='undefined'?browserVault:null;
  const ready=()=>!!vault()&&vault().status().unlocked;
  const $=(selector,parent=document)=>parent.querySelector(selector);
  const panel=document.createElement('section');
  panel.className='portable-backup';
  panel.setAttribute('aria-label','Backup portátil criptografado dos casos');
  panel.innerHTML=[
    '<div class="eyebrow">CONTINUIDADE LOCAL · BACKUP PROTEGIDO</div>',
    '<h2>Backup criptografado e restauração segura</h2>',
    '<p>Salve casos, planos, evidências, capturas e vínculos em um arquivo ',
    '<strong>.osintbackup</strong> protegido por uma senha própria. ',
    'A operação ocorre no navegador: nada é enviado à Vercel, ao GitHub ou a serviços externos.</p>',
    '<p id="pb-locked-note" class="pb-note">Desbloqueie ou crie um cofre em Meus casos para usar o backup seguro.</p>',
    '<div class="pb-columns">',
    '<form id="pb-export-form" class="pb-card" autocomplete="off">',
    '<h3>1. Criar backup protegido</h3>',
    '<label>Senha de proteção do backup (mínimo 12 caracteres)',
    '<input type="password" id="pb-export-pass" minlength="12" maxlength="1024" autocomplete="new-password" required></label>',
    '<label>Confirmar a senha do backup',
    '<input type="password" id="pb-export-confirm" minlength="12" maxlength="1024" autocomplete="new-password" required></label>',
    '<button id="pb-export" type="submit" class="button primary-button">Exportar .osintbackup</button>',
    '<p class="pb-hint">Guarde a senha fora do arquivo. Sem ela, o backup não poderá ser recuperado.',
    ' A senha não é enviada nem armazenada.</p></form>',
    '<form id="pb-import-form" class="pb-card" autocomplete="off">',
    '<h3>2. Restaurar sem substituir casos</h3>',
    '<label>Selecionar backup criptografado',
    '<input type="file" id="pb-file" accept=".osintbackup,application/json" required></label>',
    '<label>Senha usada para proteger o arquivo',
    '<input type="password" id="pb-import-pass" minlength="12" maxlength="1024" autocomplete="off" required></label>',
    '<button id="pb-import" type="submit" class="button primary-button">Verificar e restaurar casos</button>',
    '<p class="pb-hint">Restauração somente por inclusão: casos iguais são ignorados;',
    ' IDs existentes com dados diferentes impedem a importação. ',
    'Nada será apagado automaticamente.</p></form></div>',
    '<p id="pb-feedback" role="status" aria-live="polite" class="pb-feedback"></p>',
    '<p class="pb-warning"><strong>Atenção:</strong> a exportação JSON antiga continua ',
    'disponível para compatibilidade, mas é <strong>sem criptografia</strong>. ',
    'Prefira o novo formato protegido. Backups não sincronizam dispositivos automaticamente.</p>'
  ].join('');
  gate.after(panel);
  const feedback=$('#pb-feedback',panel);
  const exportPass=$('#pb-export-pass',panel),exportConfirm=$('#pb-export-confirm',panel);
  const importPass=$('#pb-import-pass',panel),fileInput=$('#pb-file',panel);
  const exportButton=$('#pb-export',panel),importButton=$('#pb-import',panel);
  function update(){
    const unlocked=ready();
    exportButton.disabled=!unlocked;
    importButton.disabled=!unlocked;
    $('#pb-locked-note',panel).hidden=unlocked;
    if(!unlocked){
      exportPass.value='';exportConfirm.value='';importPass.value='';
      feedback.textContent='';
    }
  }
  function download(json){
    const blob=new Blob([json],{type:'application/octet-stream'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download='protocolo-osint-seguro-'+new Date().toISOString().slice(0,10)+'.osintbackup';
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
  }
  $('#pb-export-form',panel).addEventListener('submit',async event=>{
    event.preventDefault();
    if(!ready()){feedback.textContent='Desbloqueie o cofre para exportar.';return}
    if(exportPass.value!==exportConfirm.value){
      feedback.textContent='As senhas do backup não coincidem.';return;
    }
    const password=exportPass.value;
    exportButton.disabled=true;
    feedback.textContent='Criptografando os dados somente neste dispositivo…';
    try{
      const source=await vault().exportAll();
      const encrypted=await api.encrypt(source,password,crypto);
      if(!ready())throw Error('O cofre foi bloqueado antes da exportação.');
      download(encrypted.json);
      feedback.textContent='Backup protegido exportado: '+encrypted.summary.cases+
        ' casos, '+encrypted.summary.evidence+
        ' registros. Os nomes e bytes estão protegidos no arquivo.';
    }catch(error){
      feedback.textContent='Não foi possível exportar o backup: '+error.message;
    }finally{
      exportPass.value='';exportConfirm.value='';exportButton.disabled=!ready();
    }
  });
  $('#pb-import-form',panel).addEventListener('submit',async event=>{
    event.preventDefault();
    if(!ready()){feedback.textContent='Crie ou desbloqueie seu cofre de destino primeiro.';return}
    const file=fileInput.files?.[0];
    if(!file||file.size<100||file.size>api.MAX_FILE_BYTES){
      feedback.textContent='Selecione um arquivo .osintbackup válido, com tamanho permitido.';return;
    }
    importButton.disabled=true;
    const password=importPass.value;
    feedback.textContent='Verificando autenticação, integridade e colisões do backup…';
    try{
      const decrypted=await api.decrypt(await file.text(),password,crypto);
      if(!ready())throw Error('O cofre foi bloqueado durante a validação.');
      const preview=await vault().previewBackupRestore(decrypted.cases);
      if(preview.conflicts.length){
        feedback.textContent=preview.conflicts.length+
          ' caso(s) com ID igual e conteúdo diferente. Nada foi alterado. '+
          'Para recuperar essa versão, use um cofre vazio em outro navegador/perfil.';
        return;
      }
      if(preview.new_cases===0){
        feedback.textContent='Nenhum caso novo: '+preview.duplicates+
          ' caso(s) idêntico(s) já estão neste cofre. Nenhum dado foi alterado.';
        return;
      }
      const approved=confirm(
        'Backup validado: '+preview.cases_in_backup+' casos e '+
        preview.records_in_backup+' registros. Serão adicionados '+
        preview.new_cases+' casos; '+preview.duplicates+
        ' duplicatas idênticas serão ignoradas. Nenhum caso atual será substituído. Continuar?'
      );
      if(!approved){feedback.textContent='Restauração cancelada sem alterações.';return}
      const result=await vault().restoreBackupCases(decrypted.cases);
      feedback.textContent='Restauração concluída: '+result.restored+
        ' casos adicionados, '+result.duplicates+
        ' duplicata(s) ignorada(s). Total no cofre: '+result.total+'.';
    }catch(error){
      feedback.textContent='Restauração não realizada: '+error.message;
    }finally{
      importPass.value='';fileInput.value='';importButton.disabled=!ready();
    }
  });
  window.addEventListener('protocolo:vault-change',update);
  update();
})();
