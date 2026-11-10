# V2.10 — Conclusão garantida do construtor (Etapa 4)

## Falha relatada
Captura de 10/11/2026: caso existente selecionado, botão **Salvar plano no caso** desabilitado e rodapé **Etapa 4 de 4 — Ainda não preparado**. Não havia botão de avanço.

## Causa confirmada
O wizard original permitia navegar da Etapa 3 para a Etapa 4 **sem executar** o construtor de consultas. O salvamento dependia de `state.planned`, preenchido exclusivamente por `generate()`. Portanto, mesmo com cofre desbloqueado e caso corretamente selecionado, `!state.planned` desabilitava o salvamento. A correção anterior de seleção/criação de casos não solucionava esta dependência.

## Implementação
- O botão **Continuar para o caso** (Etapa 3) prepara os links automaticamente antes de avançar, usando `generate()` do construtor existente.
- Se o usuário chegar à Etapa 4 por navegação direta sem plano preparado, um botão primário **Preparar e salvar plano no caso** executa, sob um único clique explícito, `generate()` seguido de `savePlan()`.
- Falhas do construtor ou do cofre deixam mensagens no próprio formulário, sem afirmar sucesso.
- Ao concluir, botão **Abrir Meus casos** e confirmação de armazenamento.
- Preservado o salvamento manual original quando o plano já está pronto, inclusive o prompt de título; o novo percurso de um clique usa título derivado do alvo.
- O modelo mantém verificação de filtros/fontes/termo contra plano desatualizado. Nenhuma visita a provedores, coleta automática ou execução de motores é iniciada.

## Testes
- Ampliado `tests/browser-save-plan-no-case.cjs` com cenário exato: caso existente, plano não preparado na etapa final, CTA visível, clique único, geração uma vez, persistência em caso certo e navegação final.
- Preservadas regressões de no-case, pesquisa guiada, imagem, cofre e Mission Control.
- Screenshot `save-step4-unprepared-desktop.png`.
- Antes de produção, exigir CI principal e Chromium, SHA final READY no Preview e confirmação do deploy de produção.

## Riscos e limites
- Persistência continua no cofre AES-GCM local do domínio/navegador.
- Os links preparados **não equivalem a resultados de investigação**. Não há promessa de consultar automaticamente todas as fontes.
- Nenhuma exclusão, alteração de banco, migração ou permissão nova.
