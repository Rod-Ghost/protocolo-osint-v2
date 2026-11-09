/* Plaintext, on-device Markdown case report. Never sends vault data to a server. */
(function(root) {
  'use strict';
  const norm=value=>String(value==null?'':value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'');
  const escapeMD=value=>norm(value).replace(/([\\*_{}\[\]()#+!|<>])/g,'\\$1');
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
      const p=e.provenance;
      if(p?.type==='engine_observation'){
        lines.push('**Procedência:** saída bruta de motor OSINT, revisada e registrada manualmente.',
          '',
          '**Verificação:** NÃO VERIFICADO — não confirma identidade ou autenticidade.',
          '',
          '**Motor:** '+escapeMD(p.engine),
          '',
          '**Job ID:** '+escapeMD(p.job_id),
          '',
          '**Alvo consultado:** '+escapeMD(p.target),
          '',
          '**Tipo de alvo:** '+escapeMD(p.target_kind),
          '',
          '**Data informada pelo motor:** '+escapeMD(p.observed_at||'não informada'),
          '',
          '**SHA-256 da linha registrada:** '+escapeMD(p.raw_sha256),
          '',
          '**Referência do software (não da fonte verificada):** '+
            escapeMD(p.tool_reference||'não informada'),
          '',
          '**Saída bruta, sem validação independente:**',
          '',
          '\`\`\`text',
          norm(p.raw_record).replace(/\`\`\`/g,'[delimitador omitido]'),
          '\`\`\`',
          '');
      }
    });
    if(Array.isArray(caseData.search_plans)&&caseData.search_plans.length){
      lines.push('## Planos de busca e revisões manuais','',
        'Consultas planejadas não representam fontes efetivamente consultadas ou resultados obtidos.','');
      for(const p of caseData.search_plans.slice(0,30)){
        lines.push('### '+escapeMD(p.title),'',
          '**Consulta:** '+escapeMD(p.query),'',
          '**Fontes selecionadas:** '+escapeMD((p.source_ids||[]).join(', ')),'',
          '**Periodicidade de revisão:** '+escapeMD(p.interval_days||0)+' dias (manual)','');
        for(const r of (p.reviews||[]).slice(-20)){
          lines.push('- '+escapeMD(r.observed_at)+
            ' | Contagem anotada (não verificada): '+escapeMD(r.count??'não informada')+
            ' | Variação declarada: '+escapeMD(r.delta??'não calculada')+
            ' | Observação: '+escapeMD(r.note||''));}
        lines.push('');
      }
    }
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
