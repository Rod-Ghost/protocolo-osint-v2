# Image Intelligence v0.6 — comparação, OCR e busca reversa

## O que está implementado

| Recurso | Localização | Privacidade | Estado de teste |
|---|---|---|---|
| SHA-256 e dHash do arquivo | Navegador | Arquivo não sai do dispositivo | Já implementado na V0.4; testes sintéticos |
| Comparação de dHash entre casos | `image-core.js` + `media-ui.js` | Lê registros do cofre AES-GCM **desbloqueado**, não envia fotos | Unitários Node, sem navegação real de fornecedor |
| OCR português+inglês | Tesseract.js 6.0.1, carregado somente após clique | Imagem tratada no navegador; **worker, biblioteca e idiomas são baixados de provedores CDN** | Interface implementada; processamento do provedor não testado em produção |
| Reverse Web Detection | Google Cloud Vision `WEB_DETECTION` | **A imagem é enviada ao provedor somente com consentimento**, chave admin e recurso ativado | Testes HTTP com `httpx.MockTransport` e API sem credenciais |
| OCR totalmente offline | Não | N/A | Futuro: distribuir `tesseract.js-core` e `tessdata` localmente com checksum e licença |
| Busca reversa em todo o Google sem API | Não | N/A | Não anunciada: não há índice público equivalente incorporado ao projeto |

O OCR também pode ser registrado como nota no cofre AES-GCM do caso escolhido. Se o provedor web não estiver configurado, a interface oferece links manuais para Google Lens e TinEye, sem upload automático da foto.

## Pesquisa de componentes livres

- **Tesseract.js** — https://github.com/naptha/tesseract.js , Apache 2.0; funciona no navegador via WebAssembly. Dependência carregada sob demanda em vez de incorporar código de terceiros manualmente. Modelo de idioma pode demandar download de vários MB. Padrão OCR `por+eng`.
- **imagededup** — https://github.com/idealo/imagededup , Apache 2.0. Avaliado para um futuro índice em worker Python, mas não instalado: o navegador já faz busca de hashes sem serviços pesados; adicionar outro projeto agora seria redundante.
- **pgvector** — https://github.com/pgvector/pgvector , licença PostgreSQL. Alternativa futura para vetores de imagens de grande escala, com hospedagem PostgreSQL; não implantado nesta revisão.
- **Google Cloud Vision** — serviço externo comercial, não código aberto. Justifica-se para encontrar ocorrências na web além do índice local. Autoria e termos do fornecedor preservados.

## Configuração opcional para busca na Internet

Na Vercel, configurar **somente no backend**, jamais no frontend, repositório ou logs:

| Variável | Uso |
|---|---|
| `GOOGLE_CLOUD_VISION_API_KEY` | Chave de projeto com API Vision habilitada, limitada por API, quota e faturamento |
| `OSINT_REVERSE_ENABLED=1` | Liberação explícita do provedor de upload externo |
| `OSINT_REVERSE_TOKEN` | Segredo de operador aleatório com mínimo de 32 caracteres; **não corresponde a uma senha de usuário** |

Até configurar as três, `GET /api/v1/images/reverse/config` responde `configured=false` e o botão de web reverse continua desabilitado. O endpoint de upload retorna `503`, e não faz contato com Google. Quando autorizado, a imagem é limitada a 2 MB, magic bytes validados (PNG/JPEG/WebP), uma única requisição ao destino HTTPS fixo e timeout de 9 segundos. O resultado é um conjunto limitado de links HTTPS, data e origem, nunca uma conclusão automática sobre identidade. Imagens não são gravadas no servidor nem em logs de aplicação.

**Segurança para público:** o token administrativo não substitui login, quota por usuário ou limites antiabuso. Não habilitar o serviço em site público com uma chave compartilhada em frontend. Antes de liberar: autenticação real, limitador distribuído, orçamento de API, consentimento e política de retenção de dados compatível com LGPD e ToS do Google. A rota existe como integração pronta para ativação, não como ferramenta pública liberada.

## Dependências e CSP

O OCR solicita de `cdn.jsdelivr.net` o script e o worker fixados em `tesseract.js@6.0.1`, mais bibliotecas WASM e idiomas fornecidos pelos hosts oficiais do ecossistema Tesseract.js. `script-src`, `worker-src` e `connect-src` precisam permitir esses hosts **somente para esse recurso**. Se CSP, extensão de navegador ou rede bloquear downloads, a interface explica o problema sem alegar resultado fictício. A inclusão futura de assets vendorizados deve preservar a licença Apache-2.0, notices e checksums.

## Critérios de verificação

1. `node tests/test-image-core.cjs` testa hamming, ordenação e validação de formatos.
2. `pytest` executa testes de segurança e mock do Vision, inclusive teste de endpoint sem credenciais.
3. Teste de navegador com OCR simulado verifica interação **sem chamar CDN**; teste real do WebAssembly/idioma demanda rede e não foi comprovado.
4. Em produção, verificar `GET /api/v1/images/reverse/config`, OCR real com uma imagem contendo texto de teste e, apenas após configurar credenciais, um pedido reverso com imagem sintética e cobrança monitorada.
5. Não salvar imagem, chave de API ou token em armazenamento local; cofre existente guarda apenas hashes e metadados explicitamente registrados.
