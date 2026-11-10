# Recuperação do salvamento de planos — V2.9

## Relato e reprodução
Captura do operador em 10/11/2026: etapa 4 **Vincular ao caso** exibe apenas “Somente preparar links” e o botão **Salvar plano no caso** permanece desativado, mesmo após preencher os demais campos. O comportamento é compatível com nenhum caso disponível no cofre associado à origem do navegador ou uma lista ainda não atualizada. A captura isolada **não prova** que o cofre estava realmente desbloqueado naquele domínio.

## Limitação confirmada no código
O construtor anterior exigia selecionar um caso já presente em `browserVault.listCases()`. Não permitia criar o caso na etapa de salvar; se não havia registros, o único `option` era o modo sem salvamento. Havia também dependência da atualização da lista via evento de cofre/seleção, de difícil compreensão no fluxo visual.

## Correção implementada
- Lista de destinos atualizada ao entrar na etapa 4 e em alterações do cofre; resultados assíncronos obsoletos são ignorados.
- Caso existente: seleção explícita, com preenchimento automático **apenas se houver exatamente um** caso.
- Sem caso: opção `+ Criar novo caso e salvar plano` selecionada, formulário de nome acessível na própria etapa e CTA `Criar caso e salvar plano`.
- Se cofre estiver bloqueado: aviso e botão `Abrir cofre`, preservando o plano preparado ao navegar para `Meus casos`.
- Ao salvar: verificar que os filtros/fontes/alvo ainda correspondem ao plano preparado; criar caso criptografado mediante clique; registrar plano e confirmar em texto.
- Em falha parcial (caso criado mas plano falhou), informar explicitamente sem declarar sucesso incorreto.
- O título do novo caso é sugerido pelo alvo apenas no dispositivo, e pode ser alterado antes de salvar.
- Nenhum resultado remoto é fabricado ou monitorado; executores continuam separados e autorizados.
- Cópias sincronizadas em `apps/web/assets` e `public/assets`; funcionalidades anteriores preservadas.

## Validação
- `tests/browser-save-plan-no-case.cjs` reproduz **cofre sem casos**, cria caso diretamente na etapa 4, salva plano, cria segundo caso, testa modo bloqueado, recuperação após recarregar e comportamento com múltiplos casos, em desktop e mobile.
- Regressões `browser-guided-workflow`, `browser-quick-investigation`, `browser-case-workspace` e `backend-ci`.
- Antes do merge: exigir CI bem-sucedido, verificar artefatos visuais, Preview READY da versão exata e validar a seleção sem cofre.
- Depois do merge: confirmar SHA/READY do domínio principal.

## Risco residual
O cofre é **por origem de navegador e dispositivo**, não uma base sincronizada. Abrir um domínio diferente (alias de Preview vs domínio principal), outro perfil ou outro aparelho usa armazenamento distinto; a aplicação não pode prometer recuperar ali casos que estão em outra origem. A mensagem de bloqueio ajuda a identificar o estado real sem expor informações privadas.
