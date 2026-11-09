# V1.9 — Central dinâmica de investigação (local-first e hospedada)

## Objetivo
Transformar a página inicial em um centro de acompanhamento de investigações
com navegação imediata entre **casos, planos de busca, registros e revisões**,
sem criar banco remoto, sincronização ou coleta externa automática.

A implementação é **aditiva**: não substitui os 48 destinos de consulta,
os cinco motores, o laboratório de imagens, o MCP, o cofre, a fila privada
Vercel nem o backend local.

## Funcionalidades

A nova Central de Investigação aparece em Visão geral e calcula em memória:
- Total de casos locais, registros documentados, planos de pesquisa.
- Quantidade de planos com ao menos uma revisão manual registrada.
- Quantidade de revisões **manuais** vencidas segundo os intervalos de
  7 ou 30 dias explicitamente escolhidos pelo investigador.
- Linha do tempo de criação de caso, evidência, atualização de plano e
  revisão manual, sempre derivada de metadados de casos salvos.
- Filtros de casos, pesquisa por título **somente na interface local**,
  atalhos para casos, planos, fontes, motores e laboratório de imagens.

**Não são métricas de resultados Google, novos achados na internet,
identidades verificadas ou alterações reais em pessoas.**

## Fluxo e segurança

- Site hospedado e modo estático: os dados vêm apenas do cofre AES-GCM já
  desbloqueado no próprio navegador. Nenhum conteúdo é sincronizado com
  GitHub/Vercel e nenhum título ou termo é exibido quando está bloqueado.
- A API local preserva o banco SQLite existente e fornece os casos ao
  painel, sem inventar planos que não existam no backend.
- O cofre publica apenas o evento interno `protocolo:vault-change`,
  **sem detalhes de casos**, após salvar, desbloquear e bloquear.
- As ações de navegação `protocolo:open-case` e
  `protocolo:open-plan` somente encaminham para telas já existentes.
- Ao abrir um plano, a interface do construtor pode chamar o
  **backend do próprio site** para preparar URLs. Nenhum provedor externo
  é consultado até que o investigador clique em Abrir fonte.
- O painel não tem polling de sites, monitoramento em segundo plano,
  notificações push nem execução automática de motores OSINT.
- As revisões vencidas são indicadas apenas ao abrir a página ou
  atualizar um caso no navegador. Fechar o navegador interrompe a sessão
  e não gera alertas.

## Arquitetura alterada

| Arquivos | Mudança |
|---|---|
| `apps/web/assets/case-dashboard-model.js` | Modelo puro para indicadores reais, revisões e linha do tempo |
| `apps/web/assets/dynamic-dashboard.js` | Painel interativo com filtros e atalhos |
| `apps/web/assets/dynamic-dashboard.css` | Layout responsivo integrado ao tema |
| `apps/web/assets/vault.js` | Notificação interna, sem dados sensíveis |
| `apps/web/assets/app.js` | Navegação para caso selecionado |
| `apps/web/assets/case-search-builder.js` | Navegação para plano salvo selecionado |
| `apps/web/index.html` | Carregamento do novo painel |
| `public/` | Cópias dos assets destinadas à Vercel |
| `tests/test-dynamic-dashboard.cjs` | Testes de contagem, datas, privacidade e espelhamento |

## Critérios de validação

- Node e GitHub Actions comprovam a sintaxe, cálculos de casos, revisões
  e o fato de o evento do cofre não transmitir conteúdo de casos.
- CI geral do backend e frontend deve permanecer verde.
- Preview Vercel READY antes de publicação na branch `main`.
- Verificação visual manual: abrir e fechar cofre, criar caso,
  registrar evidência, salvar plano, registrar revisão, filtrar caso
  e abrir um plano a partir da Central.
- Contagens e datas devem refletir dados salvos; ausência de casos ou
  cofre bloqueado nunca deve apresentar informação fictícia.

## Próximos passos após homologação

Uma evolução de maior alcance poderia trazer filtros cruzados entre tipos
de evidência, painel de qualidade das fontes, exportação gráfica de
cronologia, resultados de provedores autorizados com marcação de coleta,
e feeds RSS oficiais submetidos a orçamento e controle de frequência.
**Nenhuma dessas propostas é considerada funcional na versão 1.9.**
