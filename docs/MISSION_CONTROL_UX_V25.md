# Protocolo OSINT V2 — Mission Control UX v2.5 (Etapa 1)

**Estado:** implementação em branch, não publicada na produção. A aprovação do
investigador e os gates de publicação da PR #25 continuam obrigatórios.

## Problema observado

A navegação anterior usa uma sidebar permanente em desktop, sem mecanismo
de recolhimento. O mapa de conexões e os formulários ganham pouco espaço.
A interface também contém muitos módulos dispersos e não dispõe de
navegação rápida por teclado. Isso é uma limitação de UX, não uma falha
dos motores ou da metodologia do protocolo.

## Solução incremental

1. **Sidebar recolhível (desktop):** botão na barra superior e dentro
   da lateral; de 236 px para trilho de ícones de 74 px. Salva apenas
   preferência de apresentação em `localStorage`, no nome
   `protocolo-osint:sidebar-collapsed:v1`. Não lê nem altera dados do cofre.
2. **Menu mobile:** aproveita o botão original e o roteador existente;
   transforma a lateral em drawer, com fundo de bloqueio, fechamento ao
   tocar fora, pressionar Escape e navegar para um módulo. A preferência
   de desktop não transforma o menu mobile em trilho inacessível.
3. **Topbar de operações:** contexto da tela ativa, atalho para criar
   caso respeitando a proteção atual do cofre e status local derivado
   do estado real do cofre. Não inventa motores online ou resultados.
4. **Navegação rápida (Ctrl+K/Cmd+K):** filtra **somente os módulos
   existentes no DOM**. Suporta digitação, setas, Enter, Escape,
   diálogo com foco e retorno de foco. Não consulta motores, não envia
   alvos, não aciona busca ou integrações externas.
5. **Identidade visual:** paleta grafite/preto azulado, vermelho
   investigativo, indícios em âmbar/ciano, painéis com contraste,
   bordas e realce suave. Sem criar novos dados e sem 3D pesado.
6. **Acessibilidade:** título/aria-label das navegações em modo ícone,
   aria-expanded correto, foco visível, skip link, Escape e
   `prefers-reduced-motion`. Mantém a opção de tema claro anterior.

## Arquivos afetados

- `apps/web/index.html` + `public/index.html`: controles semânticos
  do shell e do diálogo de navegação.
- `apps/web/assets/mission-shell.js` + espelho em `public/`:
  controle responsivo, persistência opcional, atalho, roteamento existente.
- `apps/web/assets/mission-shell.css` + espelho em `public/`:
  visual adaptativo e prevenção de recortes no mapa.
- `tests/browser-mission-shell.cjs`: Chromium desktop (expandir,
  recolher, persistir, navegar e Ctrl+K), mobile (drawer, Escape,
  fundo e navegação) e screenshots de revisão.
- `.github/workflows/backend-ci.yml` e `browser-e2e.yml`:
  sintaxe, execução e artefatos de revisão visual.

**Não alterados:** lógica de motores, validação de alvo, execução de
fila, OAuth, banco SQLite, cofre AES-GCM, evidências, captura,
grafos, backup, construtor de buscas e suas fontes.

## Critérios de aceite (Etapa 1)

- Sidebar aberta e recolhida em desktop, sem sobrepor conteúdo.
- Ícones continuam navegáveis com rótulos acessíveis.
- Estado salvo resiste a recarga; negar localStorage não impede uso.
- Drawer mobile não fica parcialmente fora da tela; ao fechar não
  conserva bloqueio de scroll.
- Ctrl+K e pesquisa local abrem apenas módulos disponíveis; nunca
  fazem solicitações a fontes de terceiros.
- Botão Novo caso usa proteção de cofre já presente.
- Nenhum número/estado de resultado externo é fictício.
- Regressões backend/frontend e Chromium passam.
- Screenshot desktop/mobile revisada antes do merge.
- PR #25 de recursos documentais mantém seu gate: Preview Vercel
  READY do SHA final antes de qualquer merge da pilha à `main`.

## Etapas seguintes, **dependentes de OK do usuário**

### Etapa 2 — Redesenho do construtor de buscas
- Separar o fluxo atual em cinco etapas curtas: objetivo, alvo,
  fontes, preparação das consultas, vínculo ao caso.
- Modo simples padrão e avançado opcional, sem excluir filtros
  originais e sem executar automaticamente motores ou fontes.
- Progresso visual e resumo de URLs efetivamente preparadas,
  não quantidade de páginas encontradas no Google.

### Etapa 3 — Workspace de caso
- Reduzir ruído visual e dividir caso em abas para consultas,
  evidências, conexões, timeline e relatório, com estado local.
- Reusar componentes existentes e evitar duplicação de cadastro.

### Etapa 4 — Quadro de conexões
- Ampliar o espaço de visualização, filtros e navegação por
  evidência, sem afirmar correlação pessoal sem prova.

### Etapa 5 — Polimento
- Empty states, foco, loading, responsividade e revisão manual.
- Submeter toda a versão UX com os recursos #22–#24 para CI,
  Preview e revisão antes de uma única publicação.

## Riscos e compensações

- CSS de temas legados tem várias camadas. Por isso a personalização
  vive em um CSS adicional carregado por último, não substitui temas.
- A sidebar anterior tem largura responsiva distinta por tema. O
  novo shell explicita uma largura compartilhada de desktop e uma
  de trilho, com regressão visual em 1440 e 390 px.
- Alguns módulos são adicionados via JS. A navegação rápida
  só lista módulos quando o painel e uma ação navegável existem,
  não assume disponibilidade operacional a partir de um nome.
- Em modo estático ou hospedado, dados do cofre permanecem no
  navegador; o shell não coleta dados nem transforma uma UI em prova.
