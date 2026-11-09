# Etapa 2 — Construtor guiado de investigação (UX v2.6)

## Contexto da aprovação

O usuário aprovou a Etapa 1 (Mission Control, PR #26) e solicitou
continuidade incremental até a janela de publicação da noite.
Este componente é **empilhado sobre a PR #26**, sem incorporar na
produção o pacote das PRs #22–#25. A Vercel ainda estava sujeita a
rate limit, portanto nenhum deployment de produção é pressuposto.

## Problema identificado

O `case-search-builder.js` já tinha os recursos necessários,
mas apresentava simultaneamente termo, classificação, quatro
operadores avançados, categoria, catálogo de fontes, vínculo ao
caso, revisão e ações. A tela impõe carga cognitiva alta e dificulta
distinguir **planejamento**, **consulta externa** e **registro
documental**.

## Solução adotada — sem reescrever APIs

O `guided-search-workflow.js` organiza **os elementos DOM existentes**
do construtor original em quatro etapas. Nenhum campo, botão
ou listener é duplicado; todas as ações continuam executadas
por `case-search-builder.js`.

1. **Definir o alvo:** seis atalhos de tipo que preenchem
   `#cb-kind` (Auto, domínio, usuário, e-mail, IP e texto livre)
   e o campo `#cb-query`.
2. **Selecionar fontes:** catálogo original com categorias,
   checkboxes, selecionar visíveis e limpar; painel com
   quantidade de **fontes selecionadas**, não resultados coletados.
3. **Preparar consultas:** operadores Google recolhidos em
   `<details>` opcional, botão original `#cb-generate`,
   respostas da API `POST /api/v1/search/builder` e
   **links preparados / resultados externos NÃO MEDIDOS**.
4. **Vincular ao caso:** select e revisão manual originais,
   ação `#cb-save` para o cofre AES-GCM local. Nenhum caso
   precisa ser escolhido para apenas preparar links.

### Modo avançado preservado

O botão **Tudo à vista** exibe todas as quatro áreas e abre
os operadores avançados. Isso preserva a experiência da UI anterior
para quem já conhece o sistema ou quer usar várias configurações.

### Navegação e continuidade

- Progresso de 1 a 4, botões Voltar/Continuar, seleção direta de
  etapas com validação local de termo e fontes.
- Se um plano for recuperado da timeline ou do caso, a interface
  apresenta automaticamente a etapa com links preparados.
- Mudança manual em tipo/termo/filtros/fontes invalida a
  visualização anterior e desabilita o botão de salvar até
  gerar novamente. O backend continua sendo o único que
  valida e constrói URLs.
- A UI não persiste o termo ou o alvo em preferências de tema
  e não faz coleta/varredura em segundo plano.

## Arquivos

- `apps/web/assets/guided-search-workflow.js` — organização
  progressiva do DOM (sem criar nova lógica de coleta).
- `apps/web/assets/guided-search-workflow.css` — aparência
  Mission Control, estrutura responsiva e modo avançado.
- `apps/web/index.html`, `public/index.html`, espelhos
  `public/assets/` — carregamento aditivo.
- `tests/browser-guided-workflow.cjs` — teste Chromium:
  caso de laboratório, alvo, categoria/fontes, operações,
  links via API simulada, salvar, alternar modo avançado,
  reabrir plano e mobile, zero requisições externas.
- CI geral e Chromium ampliados com artefatos de revisão visual.

## Restrições metodológicas e segurança

- **48 destinos do catálogo**, cinco motores e seus comandos
  anteriores permanecem inalterados.
- O modo guiado prepara **somente links**; nenhum número
  preparado representa páginas consultadas.
- Motores reais requerem login/autorização no módulo apropriado;
  esta UI não inicia jobs ou bypass de acesso.
- Planos continuam locais e cifrados pelo cofre existente.
- Nenhuma nova fonte, endpoint, credencial, licença ou
  serviço pago foi adicionado.
- Abas de casos, biblioteca de planos, grafo, backup e
  relatórios permanecem independentes do wizard.

## Critérios de aceitação

1. Abrir o construtor com a Etapa 1 ativa e os demais campos
   recolhidos no modo guiado.
2. Não avançar com termo vazio nem sem fontes selecionadas.
3. Reusar os mesmos campos e URLs no modo **Tudo à vista**.
4. Preservar filtro de site, formato, exclusões e aspas.
5. Preparar URLs de teste sem abrir terceiros automaticamente.
6. Vincular e reabrir plano real em caso de laboratório
   com cofre AES-GCM desbloqueado.
7. Ao editar configurações, exigir nova preparação antes
   de permitir salvar.
8. Validar layout 1440 e 390 px, atalhos de navegação,
   reponsividade e captura de screenshots de Chromium.
9. Testes gerais + frontend + navegador verdes.
10. Aguardar aprovação do usuário e Preview Vercel READY
    do SHA combinado antes de qualquer merge na produção.

## Próxima etapa sob aprovação

A terceira etapa será um **workspace de caso com navegação
contextual** (Visão geral, Consultas, Evidências, Conexões,
Timeline e Relatórios), preservando o cofre e as ações
originais, sem criar um segundo banco de dados ou uma
implementação paralela de evidências.
