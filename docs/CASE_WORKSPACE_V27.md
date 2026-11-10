# Case Workspace V2.7 — Etapa 3 (prévia para homologação)

## Intenção
Complementar **Meus casos** com quatro visualizações de uma investigação selecionada:
Resumo, Linha do tempo, Evidências e Planos.

## Integração técnica
- Nova camada `case-workspace.js/css` em ambas as árvores de assets, carregada nos dois HTMLs.
- Leitura exclusiva do `browserVault.getCase(id)` quando o cofre criptografado está desbloqueado.
- Usa o ID do caso que a implementação existente marca em `.case-item.active`.
- Mantém as ações originais de criar caso, adicionar registro, exportar, capturar, gerar relatórios e backup.
- O backend/SQLite existente não foi modificado. Em ambientes sem cofre de navegador, a visão complementar permanece bloqueada; o gerenciamento legado continua disponível.
- A linha do tempo mostra **somente eventos armazenados**: criação, registro, plano e revisão manual. Nunca afirma mudanças externas ou prova de autoria.

## Segurança e limites
- Nenhum novo endpoint, credencial, integração, armazenamento, telemetria ou varredura externa.
- Títulos, descrições e notas renderizados apenas via `textContent`, sem HTML dinâmico de usuário.
- Fechar o cofre deve limpar todos os detalhes e invalidar leituras pendentes.
- Datas ausentes não são fabricadas; planos e resultados de motores são rotulados como registros/revisões, não como fatos externos.
- Tablist com teclado ArrowLeft/ArrowRight/Home/End, roving tabindex; responsivo e movimento reduzido.

## Validação pendente
1. `node --test tests/test-case-workspace.cjs` e `node --check apps/web/assets/case-workspace.js`.
2. CI geral e teste Chromium com cofre temporário: criar dois casos, alternar abas, adicionar evidência/plano, bloquear cofre (dados ocultos), mobile 390px.
3. Revisão visual dos screenshots desktop/mobile.
4. Prévia Vercel READY do SHA final, **quando a quota permitir**.
5. Aprovação explícita antes de qualquer merge ou deploy.

## Dependência
Mudanças empilhadas sobre PR #27, que depende da PR #26 e do release PR #25. Sem merge automático.
