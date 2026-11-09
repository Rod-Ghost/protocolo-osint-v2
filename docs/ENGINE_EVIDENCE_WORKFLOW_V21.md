# V2.1 — Central de Resultados e Evidências (primeira etapa)

## Objetivo

Unir resultados efetivamente concluídos de Sherlock, Maigret, subfinder,
Amass e SpiderFoot aos casos do Protocolo OSINT, **sem** transformar a saída
de motores em afirmações verificadas.

Partes preservadas: 48 fontes, cinco motores, GitHub OAuth, Vercel Queue,
Private Blob, laboratório de imagem, construtor, dashboard, cofre AES-GCM
por navegador e backend SQLite local.

## Funcionamento

1. O operador autenticado solicita uma consulta explícita no painel Motores.
2. O worker publica resultado de job no Private Blob; a API de operador
   confirma o ID GitHub e entrega apenas os registros pertencentes a ele.
3. Quando o status é `completed`, o browser valida engine, job_id, formato,
   comprimento e tipo do alvo; linhas duplicadas no próprio job não são
   apresentadas mais de uma vez. `failed`/`pending` não geram evidências.
4. A interface mostra **Revisar e salvar achados no caso**. O investigador
   seleciona de 1 a 25 linhas, escolhe um caso local, registra nota e marca
   a confirmação de revisão. Nunca salva automaticamente.
5. O cofre exige desbloqueio. `saveEngineFindings` grava em lote atômico
   dentro do esquema AES-GCM/PBKDF2 existente e retorna referências ao
   caso; não envia dados de caso à Vercel.
6. Em Meus casos, o registro exibe procedência e saída original.
   O relatório Markdown incorpora origem, horários, SHA-256 da linha
   registrada e ressalva de não verificação.

## Modelo de evidência compatível

O objeto `evidence` conserva os campos originais `id`, `case_id`,
`kind: note`, `title`, `url: null`, `note`, `created_at`,
`sha256` e recebe o novo campo opcional `provenance`:

- `type: engine_observation`
- `engine`: ID allowlisted de um dos cinco executáveis.
- `job_id`: UUID hex de 32 caracteres do job autenticado.
- `target`, `target_kind`: alvo e classificação usados na consulta.
- `raw_record`: saída textual exata da linha do worker (máx. 400 chars).
- `raw_sha256`: hash dos bytes UTF-8 **dessa linha de saída**, NÃO
  hash de conteúdo original de páginas na internet.
- `tool_reference`: projeto de origem do programa; **não** representa
  URL original da descoberta ou comprovação de resultado.
- `observed_at`: data informada pelo worker quando válida.
- `saved_at`: horário local de salvamento no navegador.
- `capture_method: daemon-output`
- `verification_status: unverified`
- `review_status: manually_selected_not_verified`
- `review_note`: anotação do investigador.

Evidências legadas sem `provenance` permanecem intactas. Duplicatas
do mesmo `job_id + raw_sha256` são ignoradas na importação.
Mesmo texto em jobs distintos mantém proveniências separadas, sem
presumir confirmação independente ou titularidade.

## Segurança e limitações

- Não cria chave API, endpoint de escrita remoto, sincronização ou
  cloud database. Credenciais de login e Blob não vão para o navegador.
- O operador pode copiar a saída bruta anterior; nenhuma funcionalidade
  existente foi removida. O botão de importação é uma capacidade adicional.
- Linhas dos motores são tratadas como **texto não confiável**. Nunca
  são inseridas via `innerHTML` sem escape ou interpretadas como URLs
  executáveis. Limite de 120 linhas por job e 25 por lote.
- O cofre ainda tem limite de aproximadamente 1 MB criptografado
  e essa implementação limita a 250 registros por caso, evitando
  degradação silenciosa. Erro de validação ou persistência cancela o lote.
- O registro é documentação de observação. Não comprova o conteúdo
  original da fonte remota, um carimbo de tempo confiável ou identidade.
- Backend local SQLite não recebeu mudança de esquema; a integração
  inicial de salvamento é para o site hospedado e o cofre no navegador.
  A versão local continua funcional, mas terá integração de importação
  por API específica em incremento posterior.
- Não ativa execução de motores automaticamente nem reconsulta fontes.
- A licença/procedência da distribuição pública do projeto continua
  pendente nos arquivos `docs/IP_PROVENANCE.md` e `LICENSE-PENDING.md`.

## Validação

- `tests/test-engine-evidence.cjs`: saídas válidas e inválidas,
  deduplicação por job, hashes, cofre criptografado, rollback de lote,
  relatório Markdown, compatibilidade de evidência anterior.
- `tests/browser-evidence-flow.cjs`: Chromium com autenticação e
  jobs **simulados no navegador**, importação voluntária, caso, relatório,
  bloqueio do cofre e saída maliciosa inerte (sem rede externa).
- `tests/browser-production-flow.cjs`: smoke de produção existente
  com caso fictício e construtor, sem login.
- Smoke dos cinco executáveis na CI: comprova presença e inicialização,
  não execução de consultas em redes externas.

## Próximas fases

1. Captura de fonte original por URL, snapshot consentido, hash dos bytes
   originais e cadeia documental separada da saída do motor.
2. Normalização especializada por executável (JSON e formatos estruturados),
   sem descartar a saída bruta.
3. Painel de correlação com cada aresta ligada a uma evidência.
4. Backup criptografado versionado/importável e avaliações de acessibilidade.
5. Exercitar job real de laboratório autorizado, sob limites de custo,
   antes de declarar todos os motores homologados ponta a ponta.
