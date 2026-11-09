# Roadmap de investigação avançada — V2.0 (proposta)

Estado: recomendações técnicas, não funcionalidades entregues.
Base verificada: 48 fontes, cinco motores, OAuth GitHub, cofre local, casos,
construtor de buscas, laboratório visual e central dinâmica.

## P0 — Validar o fluxo de ponta a ponta
- Navegador Chromium em CI: abrir site público, criar cofre temporário,
  caso, plano, navegar por telas e confirmar bloqueio do cofre.
- Testes separados de OAuth, fila, Blob privado e negação de acesso.
- Não utilizar conta pessoal, dados reais ou varreduras não autorizadas.

## P1 — Caixa de resultados ligada aos casos (prioridade máxima)
- Cada motor devolve registro normalizado com job_id, alvo, hora, fonte,
  status, conteúdo bruto, avisos e marcador de não verificado.
- Botão Salvar no caso, com revisão humana, observação e prevenção de
  duplicatas; armazenamento no cofre já criptografado.
- Nunca inferir que duas contas pertencem à mesma pessoa só pelo nome.
Aceite: resposta controlada de cada motor -> cartão -> evidência -> relatório.

## P2 — Preservação verificável
- Captura consentida de páginas/arquivos públicos, se termos permitirem;
  registrar URL, horário, HTTP, hash SHA-256 de bytes e método.
- Exportação/importação criptografada versionada e verificação de integridade.
- Diferenciar hash de bytes, metadados, prova declarada e testemunho humano.
- Formato WARC opcional em capturas web; não declarar perícia concluída.

## P3 — Grafo explicável de entidades
- Domínio, IP, e-mail, username, URL, empresa, arquivo, documento e pessoa
  somente quando houver evidência suficiente.
- Vínculos com origem, ID da evidência e status observado ou hipótese.
- Desduplicação, filtros, linha do tempo, detecção de contradições.
- STIX 2.1 opcional para observáveis e indicadores de cibersegurança.

## P4 — Pesquisador assistido
- Objetivo -> hipóteses -> tipos de alvos -> motores/fontes compatíveis ->
  coleta autorizada -> revisão -> conclusões e limites.
- Templates derivados do protocolo original sem alterar sua metodologia.
- Mostrar custos, limites, status e falhas reais; sem contagens fictícias.

## P5 — Monitoramento opt-in de feeds públicos
- RSS/Atom oficiais e ativos próprios/autorizados, frequência e limites.
- Comparar snapshots por ID/hash, registrar alterações verificadas.
- Não monitorar pessoas de modo encoberto nem contornar login/CAPTCHA.
- Sem servidor agendado, lembretes locais só aparecem ao abrir o navegador.

## P6 — IA opcional, vinculada às provas
- Resumir achados citando IDs e URLs existentes no caso.
- Diferenciar fatos, hipóteses e lacunas; revisão humana obrigatória.
- Ollama local ou BYOK com opt-in explícito e redaction de dados pessoais.

## Segurança e governança
- Job quotas por operador, cancelamento e expiração, proteção contra
  execuções duplicadas, retenção e redaction em logs.
- Resolver licença/procedência ainda pendentes antes de declarar projeto
  livre para redistribuição. Preservar as licenças dos motores.
- Harmonizar versão exibida em interface/backend/README, manter docs,
  testes e contratos, sem remover componentes funcionando.
- TLP 2.0 pode classificar compartilhamento quando adequado.

## Ordem
P0 concluído parcialmente com Chromium real sem login; P1 é o próximo
incremento recomendado. P2/P3 tornam correlação auditável; depois P4,
P5 e P6. Homologação de produção de cada motor permanece separada do CI.
