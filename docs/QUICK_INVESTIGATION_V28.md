# Investigação rápida V2.8 — correção de salvamento e UX compacta

## Problema observado
Na versão anterior, criar um caso no cofre AES-GCM já persistia o registro, mas a interface não explicava isso. Ao preparar um plano no construtor, `#cb-case` podia permanecer vazio enquanto o cofre estava desbloqueado; `#cb-save` ficava desabilitado até abrir manualmente o seletor e vincular um caso. Muitas etapas e cartões visuais causavam sobrecarga cognitiva.

## Mudanças aditivas
- A tela de casos confirma explicitamente a criação/salvamento criptografado e oferece **Investigar neste caso**.
- O construtor atualiza casos ao desbloquear, criar caso e preparar consultas; mantém a seleção ou escolhe automaticamente **apenas quando há um caso único**. Havendo vários, exige seleção explícita, prevenindo gravação no caso errado.
- O botão **Investigar** reutiliza o campo principal da home, permite tipo de alvo e encaminha para o construtor existente; preserva **Explorar** para navegação pelo catálogo original.
- **Todas compatíveis** seleciona fontes de acordo com o tipo escolhido, no máximo 60, sem fazer coleta. As validações de planos obsoletos e os endpoints originais permanecem.
- Após preparar links, o operador pode abrir manualmente a fonte, salvar o plano no caso ou encaminhar o alvo ao **console de motores autorizados**. Encaminhar não inicia execução nem usa credenciais.
- CSS de alta densidade reduz hero, cartões, espaçamentos e altura de grade de fontes com responsividade e foco de teclado.
- Cópias espelhadas entre `apps/web/assets` e `public/assets`.

## Segurança e limites
- Nenhuma integração nova, credencial, varredura automática, scrape ou serviço pago.
- Links preparados são **consultas**, não achados. Resultados externos não são medidos.
- Os motores exigem autenticação e clique separado. Não afirmar que todos os motores funcionam sem um teste real de produção.
- Dados do caso permanecem criptografados no navegador, sem sincronização automática.
- Nenhuma funcionalidade anterior removida.

## Validação
- Teste Chromium `tests/browser-quick-investigation.cjs`: criar cofre e caso, confirmar gravação, investigação via um campo e critério, selecionar fontes sem contato externo, preparar links, salvar plano sem reabrir seletor, conferir dados persistidos após recarregar/desbloquear, screenshots desktop/mobile e ausência de overflow.
- Reexecutar CI de backend, frontend e provas e E2E histórico em PR.
- Validar visualmente em dispositivos e, depois da aprovação, realizar preview/produção com confirmação de SHA e `READY`.
