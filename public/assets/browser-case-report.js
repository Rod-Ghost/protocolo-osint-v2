/* Plaintext, on-device Markdown case report. Never sends vault data to a server. */
(function(root) {
  'use strict';
  const norm=value=>String(value==null?'':value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'');
  const escapeMD=value=>norm(value).replace(/([\\*_{}\[\]()#+.!|<>])/g,'\\$1');
  function markdown(caseData, now) {
    if(!caseData || typeof caseData!=='object' || !Array.isArray(caseData.evidence)) {
      throw Error('Dados do caso inválidos.');
    }
    if(caseData.evidence.length>200)throw Error('Relatório limitado a 200 registros.');
    const lines=[
      '# PROTOCOLO OSINT V2 — Relatório investigativo',
      '',
      '**DOCUMENTO PRELIMINAR. FONTES EXTERNAS NÃO VERIFICADAS.**',
      '',
      '## Identificação',
      '',
      '**Caso:** '+escapeMD(caseData.title),
      '',
      '**ID:** '+escapeMD(caseData.id),
      '',
      '**Criado em:** '+escapeMD(caseData.created_at),
      '',
      '**Relatório gerado em:** '+escapeMD(now || new Date().toISOString()),
      '',
      '## Objetivo e escopo',
      '',
      escapeMD(caseData.description||'Não informado'),
      '',
      '## Evidências e fontes declaradas',
      ''
    ];
    caseData.evidence.forEach((e,i)=>{
      lines.push('### '+(i+1)+'. '+escapeMD(e.title),
        '',
        '**Tipo:** '+escapeMD(e.kind),
        '',
        '**Identificador:** '+escapeMD(e.id),
        '',
        '**Fonte informada:** '+escapeMD(e.url||'Sem URL'),
        '',
        '**Cadastrado em:** '+escapeMD(e.created_at),
        '',
        '**SHA-256 dos metadados:** '+escapeMD(e.sha256||'Não fornecido'),
        '',
        escapeMD(e.note||'Sem anotação'),
        '');
    });
    lines.push('## Limitações metodológicas','',
      'Os metadados foram fornecidos pelo investigador. O hash de registro não comprova os bytes da fonte externa.',
      '',
      'Esta exportação é texto não criptografado. Guarde em local seguro.',
      '',
      'O relatório não contém assinatura de custódia independente e não é laudo pericial.',
      '');
    return lines.join('\n');
  }
  const api={markdown};
  root.ProtocoloCaseReport=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
