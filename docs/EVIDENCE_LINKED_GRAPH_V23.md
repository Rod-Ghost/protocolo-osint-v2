# V2.3 — Mapa de conexões fundamentado nas evidências

## Motivação e continuidade

O mapa original liga **caso → registro** de evidência. A nova camada é
**aditiva**, colocada abaixo do mapa original, e permite navegar
**caso → evidência → observável**, sem criar vínculos falsos de
identidade e sem consultas externas.

Esta versão está construída sobre a branch da PR #22:
`feat/verifiable-capture-v22`. A versão de produção deve permanecer
inalterada até CI, navegador e Preview Vercel do commit combinado
aprovarem. Não acrescenta serviços remotos, faturamento ou credenciais.

## Observáveis aceitos, regras de inferência e origem

O modelo `apps/web/assets/evidence-graph-model.js` lê **somente campos
estruturados do caso desbloqueado**. Não faz OCR ou busca em texto livre:

| Registro de origem | Observável | Relação explícita | Estado |
|---|---|---|---|
| `reference.url` | hostname da URL HTTPS/HTTP | domínio citado na referência | Não verificado |
| Captura `cors-https` da PR #22 | hostname de `capture.source_url` | domínio da URL consultada | Origem/autoria não certificadas |
| Captura de arquivo com URL declarada | hostname de `capture.source_url` | domínio informado pelo investigador | Fonte não validada |
| Captura de arquivo | `capture.sha256_bytes` | SHA-256 de bytes guardados | Verificação local sob demanda |
| Observação de motor | `provenance.target`, tipo | **alvo fornecido à pesquisa** | Contexto de consulta, não descoberta |
| Observação de motor com saída integral em formato URL/domínio | hostname | domínio textual da saída | Conteúdo do motor não verificado |

Cada aresta ao observável possui `evidence_id`. A ligação
organizacional `caso → evidência` mantém o mesmo identificador.

Um domínio mencionado em dois documentos aparece como **um mesmo
observável textual, suportado por duas evidências**. Isso não prova:
independência das fontes; titularidade de domínio/conta; existência
atual de URL; identidade pessoal; autenticidade da captura; nem
veracidade da saída de um motor.

A entrada de um motor continua diferenciada da sua saída. Um
username pesquisado jamais é anunciado como conta encontrada pelo
simples fato de figurar na consulta. Notas de texto livre, telefones,
pessoas e e-mails não geram correlações automáticas nesta versão.
Os hashes dos metadados são distintos dos hashes dos bytes de captura.

## Experiência

- Preserva SVG original `caso → registros`.
- Acrescenta visualização interativa, com domínios, alvos consultados,
  hashes, linha documental e clique para inspecionar registros de
  origem (ID, título, motor ou SHA, quando presentes).
- Filtros por tipo e opção para destacar observáveis citados por 2+
  registros, marcados como **coincidência textual**.
- Botão de exportação **explícita** de JSON com nós, arestas,
  evidências citadas e avisos. O arquivo não contém bytes originais,
  mas é texto claro e pode conter dados sensíveis; exige confirmação.
- Limites de representação: até 28 evidências e 22 observáveis por
  visualização, preservando os registros que não estão visíveis.
- Os dados são calculados em memória local, com evento do cofre
  para atualização e limpeza ao bloquear; nenhum dado investigativo
  é transmitido para a Vercel.

## Componentes e compatibilidade

| Componente | Mudança |
|---|---|
| `evidence-graph-model.js` | Modelo puro, tipado, determinístico, sem rede |
| `evidence-graph-ui.js` | Nova camada visual, filtros e exportação opt-in |
| `evidence-graph-ui.css` | Interface responsiva e acessível |
| `index.html` | Carregamento aditivo, com cópias sob `public/` |
| `tests/test-evidence-graph.cjs` | Testes de procedência, colisão textual, privacidade, limites |
| `tests/browser-capture-flow.cjs` | Chromium com duas evidências e domínio comum, exportação e bloqueio |
| `backend-ci.yml` | Regressão Node e syntax checks |

A versão local com SQLite conserva o gráfico anterior. O grafo
enriquecido usa o cofre hospedado/estático já disponível; integração
SQLite equivalente é uma evolução futura com validação específica,
sem quebrar o contrato `/api/v1/cases/{id}/graph`.

## Critérios de aceitação

1. Todos os casos e observações anteriores continuam abrindo.
2. Um hostname citado por 2 fontes mostra 2 evidências, sem vínculo
   de identidade e sem rotular como confirmação independente.
3. Linha de saída com HTML malicioso não é executada nem vira entidade.
4. Cada aresta ao observável traz o ID real do registro de suporte.
5. Um hash de captura está ligado aos bytes originais do registro,
   não ao hash de metadados.
6. Após bloquear o cofre, nenhuma anotação, alvo ou linha da
   visualização anterior permanece visível.
7. Exportação só após clique e confirmação, com aviso de dados sensíveis.
8. Teste Chromium e CI verde; Preview Vercel `READY` do commit
   exato antes de publicar, respeitando o rate limit do plano.

## Próximas etapas

- Associações **manualmente revisadas** entre observáveis, sempre com
  `evidence_id`, hipótese, autor e limitações.
- Comparação temporal de capturas de fontes permitidas.
- Busca interna por evidências e contradições documentais.
- Backup criptografado, versionado e recuperável antes de ampliar
  capacidade de armazenamento.
- Grafo de investigação no SQLite local com contrato convergente.
