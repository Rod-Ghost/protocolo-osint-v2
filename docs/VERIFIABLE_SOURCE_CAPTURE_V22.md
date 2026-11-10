# V2.2 — Captura verificável de conteúdo original (local-first)

## Objetivo e base

Preservar os **bytes** de arquivos e páginas públicas autorizadas dentro
do mesmo cofre AES-GCM/PBKDF2 por navegador, com hash SHA-256 reproduzível,
manifesto de captura, recuperação de bytes originais e relatório.

A melhoria complementa as observações brutas dos motores (V2.1).
Nenhum motor, URL planejada ou referência documental gera captura
automática; o investigador escolhe um caso, uma fonte e confirma a ação.

## Escopo entregue

- **Arquivo local autorizado:** o usuário escolhe um PDF, texto,
  HTML, JSON, XML, CSV ou imagem PNG/JPEG/WebP de até **192 KiB**.
  O aplicativo não tenta abrir/executar o documento.
- **URL HTTPS pública:** o navegador faz um `GET` somente após confirmação
  do usuário, com `credentials: omit`, `redirect: error`,
  `mode: cors`, `referrerPolicy: no-referrer`, sem cookies,
  sem referrer, timeout e limite de bytes **durante o streaming**.
  Só conteúdo que o provedor realmente disponibiliza via CORS.
  Não há proxy, crawler, bypass de CAPTCHA, uso de credenciais nem
  tentativa de acessar IPs/hosts locais.
- **Armazenamento:** um registro `kind: capture` aditivo dentro do
  `case.evidence` já existente, com `capture.bytes_base64`
  criptografado dentro do mesmo envelope AES-GCM. Não salva bytes no
  GitHub, Vercel Blob, Supabase ou Cloudflare.
- **Integridade:** `SHA-256` dos **bytes exatos** recuperáveis,
  `byte_count` e hash de metadados independente. O botão
  "Verificar integridade" recalcula o SHA-256 antes da exportação.
  Arquivos recuperados preservam seus bytes originais.
- **Manifesto:** exportação JSON opcional de metadados, hash,
  identificadores e resultado de conferência — **sem bytes**.
  O relatório Markdown incorpora procedência, tamanho e hash.
- **Duplicação:** mesmo SHA-256 de arquivo no mesmo caso não cria novo
  registro, mas outros casos podem guardar a mesma captura.
- **Compatibilidade:** evidências antigas não mudam; novas capturas não
  alteram as rotas de motor, contratos da API, login OAuth nem banco
  SQLite local. A interface hospedada/estática usa o cofre browser.
  O backend SQLite local ainda não tem armazenamento binário equivalente.

## Modelo aditivo

Cada evidência capturada tem os campos legados `id`, `case_id`,
`title`, `url`, `note`, `created_at`, `sha256` e:
- `kind: capture`.
- `capture.format: protocolo-osint/capture-v1`.
- `capture.filename`, `mime_type`, `byte_count`.
- `capture.sha256_bytes`: SHA dos bytes originais **guardados**.
- `capture.bytes_base64`: conteúdo preservado **dentro do cofre criptografado**.
- `capture.method`: `user-file` ou `cors-https`.
- `capture.source_url`: HTTPS opcional; para arquivos locais,
  qualquer URL adicionada é **declarada pelo operador**.
- `capture.source_url_declared`, `http_status`, `acquired_at_device`.
- `capture.integrity_status: not_independently_verified`.

A verificação `verifyCapture` confirma correspondência com o
**manifesto armazenado**; não comprova que o documento foi publicado
pela fonte alegada, que o servidor não alterou o conteúdo no momento
da coleta, ou que a data do dispositivo é certificada.

## Segurança e limites

- A captura é sempre explícita e opt-in; o site não envia dados
  pessoais para provedores sem uma ação de coleta.
- O navegador pode negar CORS. Nesse caso, o usuário salva manualmente
  uma cópia autorizada e a anexa. Não há contorno de proteção.
- Limite inicial **192 KiB por captura**, de acordo com o limite
  total existente de **1 MB do cofre local**. Esses limites não foram
  aumentados sem estudo de consumo e migração.
- O armazenamento de dados binários em base64 consome memória.
  Não abrir documentos potencialmente ativos sem precauções.
- Não há carimbo do tempo independente RFC 3161, assinatura digital,
  WARC completo nem laudo de perícia. Um indivíduo que conhece a senha
  pode alterar conteúdo e recalcular hashes; hash não é atestado de autoria.
- Os atuais backups JSON são **não criptografados** e agora podem
  conter arquivos completos em base64. Evitar compartilhar, armazenar
  em nuvem pública ou enviar arquivos de casos por engano.
- Sem consultas automatizadas a páginas que exijam autenticação,
  sem mecanismos para acesso não autorizado, sem coleta em massa.
- O projeto continua com pendências de licenciamento e proveniência
  registradas em `LICENSE-PENDING.md`.

## Arquivos envolvidos

- `apps/web/assets/source-capture-core.js`: validação de domínios,
  tipos MIME, limites e leitura CORS/arquivo.
- `apps/web/assets/vault.js`: `addCapture`, `verifyCapture`,
  `getCaptureBytes`; criptografia AES-GCM e compatibilidade do esquema.
- `apps/web/assets/case-capture-ui.js`, `case-capture-ui.css`:
  importação, verificação, download e manifesto.
- `apps/web/assets/app.js`: procedência na lista do caso.
- `apps/web/assets/browser-case-report.js`: relatório com SHA de bytes.
- `apps/web/index.html` + espelhos em `public/`.
- `tests/test-source-capture.cjs`: casos controlados Node, CORS simulado,
  bloqueio de origens locais, bytes originais, recuperação e corrupção.
- `tests/browser-capture-flow.cjs`: Chromium arquivo fictício
  -> caso -> hash -> recuperação -> relatório -> bloqueio.

## Como homologar depois do merge

1. Em **Meus casos**, desbloquear o cofre e escolher um caso.
2. Em **Capturar e verificar documentos**, anexar arquivo de laboratório
   em formato permitido, menor que 192 KiB.
3. Conferir hash, tentar duplicar mesmo arquivo (não deve duplicar).
4. Recuperar arquivo, conferir hash localmente, exportar manifesto.
5. Recarregar página, abrir cofre e recalcular o SHA.
6. Testar URL HTTPS pública que permita CORS; se negar, verificar mensagem
   de alternativa manual, sem substituir por proxy de acesso.
7. Gerar relatório Markdown e conferir que contém SHA do arquivo, mas
   **não** o binário original em texto claro.
8. Confirmar que nada aparece após bloquear cofre.
9. Testar sem browser vault: o backend SQLite local continua inalterado.

## Evolução futura

- Backup criptografado e importação segura de casos (prioridade).
- Armazenamento de arquivos grandes local (OPFS ou IndexedDB com
  streaming e migração explícita), sem alterar schema AES-GCM original
  até testes de compatibilidade.
- Capturas WARC permitidas, comparação entre snapshots legítimos,
  prova temporal opcional e grafo por evidência referenciada.
- Não ampliar volume de coleta sem parâmetros de retenção, privacidade
  e revisão da metodologia.
