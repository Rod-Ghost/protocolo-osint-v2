# Decisões técnicas — 2026-11-07

1. Manter frontend e backend separados, em monorepo.
2. Escolher FastAPI com TypeScript/React para a primeira fundação.
3. Iniciar pela classificação *offline*, sem coleta nem compartilhamento de termos.
4. Preservar o ZIP legado intacto até revisão de procedência.
5. Publicação e licenciamento público bloqueados até auditoria de direitos.
6. Novos módulos entram apenas com testes de comportamento reais, status explícito e avaliação de segurança.


## ADR 2026-11-10 — Um catálogo não é um executor

**Problema:** uma interface com 48 links foi interpretada como 48 fontes coletadas. O relatório V3.1 mostrava só GitHub para nomes e não indicava as demais fontes não consultadas.

**Decisão:** manter catálogo legado e integrações existentes. Introduzir registro allowlisted de adaptadores por fonte e tipo de alvo, retornar estados explícitos por seleção; proibir contagem de fonte manual como resultado negativo. Limitar a cinco consultas API em um clique, sem redes abertas arbitrárias, sem crawling de sites ou bypass. Separar execução autenticada de motores, API pública de consulta limitada, relatórios e armazenamento local.

**Consequências:** amplia cobertura metodológica, evita erro semântico, permite integrações oficiais evolutivas. Não promete 49 fontes automatizadas, nem validação independente de candidatos; custos, autenticação por usuário, limites distribuídos e execução real dos workers precisam de gates futuros. Ver `docs/SOURCE_EXECUTION_AUDIT_V32.md`.

