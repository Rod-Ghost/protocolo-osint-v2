# V2.4 — Backup criptografado portátil e restauração não destrutiva

## Objetivo e base preservada

Proteger contra perda dos dados locais da interface web, incluindo
**casos, evidências, resultados dos motores, capturas binárias, planos,
revisões e vínculos derivados**. Esses itens estavam disponíveis apenas
no cofre AES-GCM armazenado no navegador; o backup JSON legado é
exportado em texto claro e não possui função de reimportação.

A solução é **aditiva**. Não muda o schema `1` do cofre, a URL de
armazenamento `protocolo-osint:vault:1`, os dados originais, o SQLite
local, a autenticação GitHub, os cinco motores, os 48 destinos, a fila,
o laboratório de imagem ou as integrações MCP.

Base de desenvolvimento: PR #22 (captura de bytes) e PR #23 (grafo com
procedência), ainda pendentes de Preview na Vercel.

## Arquivo portátil `.osintbackup`

- Formato externo: `protocolo-osint/encrypted-portable-backup-v1`.
- Criptografia: **AES-256-GCM**, nonce aleatório de 12 bytes,
  autenticação de 128 bits e AAD que vincula o formato à operação.
- Derivação: **PBKDF2-HMAC-SHA256**, 310.000 iterações, salt
  aleatório independente de 16 bytes, chave de 256 bits.
- **Senha própria do backup**, escolhida pelo investigador (mínimo 12
  caracteres), não é a mesma chave/nonce/salt do cofre.
- Apenas identificador do formato, versão e parâmetros de criptografia
  ficam legíveis. Nomes de caso, títulos, URLs, alvos, registros e
  arquivos permanecem dentro do conteúdo autenticado e criptografado.
- O payload autenticado contém `schema:1`, cópia dos casos,
  data do dispositivo e SHA-256 do JSON dos casos. O hash adicional
  é uma checagem interna, **não uma assinatura ou prova temporal**.
- Novo salt e nonce em cada exportação: dois backups do mesmo caso
  geram arquivos cifrados diferentes.
- Limite de 1 MB de dados internos do cofre mantido; arquivo
  criptografado limitado a 2,25 MB.

## Restauração em outro navegador/computador

1. Abrir o mesmo site em contexto seguro HTTPS e criar **um cofre novo**
   ou desbloquear um cofre já existente. A senha do cofre de destino pode
   ser diferente da senha de backup.
2. Em **Meus casos → Backup criptografado**, selecionar o arquivo
   `.osintbackup` e informar a senha usada na exportação.
3. O navegador autentica o envelope AES-GCM, valida schema, estrutura,
   IDs, referências, formatos e hashes das **capturas de arquivos**
   antes de oferecer a restauração.
4. A interface mostra quantidade de casos novos, repetidos e conflitos.
   É obrigatória a **confirmação explícita** para adicionar casos.
5. A operação é **somente por inclusão**, em uma gravação do cofre.
   Nenhum caso existente é modificado, apagado ou substituído.
6. Casos com ID idêntico e conteúdo idêntico são ignorados
   (restauração idempotente). Um ID existente com conteúdo divergente
   **bloqueia a restauração inteira**, com orientação para recuperar
   em um cofre vazio separado. Não há mesclagem arriscada de evidências.
7. Falta de espaço, mudança concorrente ou falha de armazenamento
   cancela a operação e restaura o estado em memória.

Não há envio de arquivos à Vercel, Cloudflare, Supabase ou serviços de
IA. O arquivo portátil continua sendo um **backup manual**, não
sincronização automática entre dispositivos.

## Segurança e compatibilidade

- Criptografia autenticada protege contra leitura e adulteração sem a
  senha; **não protege contra senha fraca** ou dispositivo comprometido.
- A senha não é persistida no navegador; os controles limpam os campos
  após operações. Conteúdo descriptografado é temporário em memória.
- A validação rejeita arquivos acima do limite, payloads com chaves
  especiais de protótipo, estrutura excessivamente profunda, IDs
  duplicados, evidências incompatíveis e alterações de hashes das
  capturas preservadas.
- Ao importar, mantém evidências originais, datas e IDs; nenhum vínculo
  investigativo é promovido de hipótese a fato.
- A exportação antiga `Exportar backup JSON` permanece **compatível**,
  mas deve continuar identificada como **não criptografada**.
  É recomendado usar o formato protegido para arquivos com dados pessoais.
- O backup não substitui revisão de integridade do arquivo externo,
  proteção física do dispositivo ou guarda separada da senha.
- Se a senha do backup for perdida, não existe chave mestra ou
  recuperação pelo servidor. Isso é uma escolha deliberada de
  privacidade e de desenho local-first.
- A versão local SQLite mantém sua própria persistência e fluxo de
  exportação; o módulo portátil é da interface hospedada/estática com
  cofre AES-GCM. Não finge restaurar um banco SQLite inteiro.

## Arquivos e testes

| Caminho | Finalidade |
|---|---|
| `apps/web/assets/portable-backup-core.js` | Criptografia, descriptografia, validação de schema e integridade |
| `apps/web/assets/portable-backup-ui.js` | Exportação, seleção, confirmação, importação local |
| `apps/web/assets/portable-backup-ui.css` | Painel responsivo |
| `apps/web/assets/vault.js` | Preview de conflitos, restauração aditiva atômica e checagem de concorrência |
| `apps/web/index.html` e `public/` | Assets servidos no site e cópias espelhadas |
| `tests/test-portable-backup.cjs` | Roundtrip, senha errada, adulteração, anexos, duplicatas, IDs conflitantes, rollback por quota |
| `tests/browser-capture-flow.cjs` | Dois Chromium isolados: exportação, falha de senha, restauração e hash preservado |
| `.github/workflows/backend-ci.yml` | Testes Node e checks de sintaxe integrados |

## Critérios antes de publicar

- [ ] GitHub CI backend/frontend/proveniência do HEAD aprovado.
- [ ] Chromium com dois contextos e restauração real aprovado.
- [ ] Histórico de grafos, evidências e capturas permanece compatível.
- [ ] Preview Vercel READY para o SHA consolidado de PRs #22–#24.
- [ ] Validação manual de importação/exportação de um caso fictício em
      navegadores distintos, sem chaves de usuário ou alvos reais.

**Pendente de licença/procedência:** `LICENSE-PENDING.md` e
`docs/IP_PROVENANCE.md` continuam relevantes para distribuição pública.

## Evolução futura

Backup seletivo por caso, inspeção offline de manifests, armazenamento
local de arquivos maiores via IndexedDB/OPFS após estudo de quotas,
exportação WARC consentida, assinatura ou carimbo temporal opcional
quando houver justificativa metodológica. Nenhuma dessas funções é
declarada operacional nesta versão.
