# Deploy Vercel — Protocolo OSINT V2

## Objetivo

Um único site HTTPS, hospedado na Vercel, sem instalações no computador do visitante. A interface sai de `public/`, enquanto o FastAPI público executa em Vercel Functions (`app.py`). **Não** utiliza Cloudflare, SQLite em nuvem, nem exige um servidor Python local.

## Passos no painel Vercel

1. Confira que o projeto selecionado está conectado ao GitHub `Rod-Ghost/protocolo-osint-v2`, com **Production Branch = main**.
2. **Root Directory:** repositório raiz (`.`), não `backend/` ou `apps/web/`.
3. **Framework Preset:** FastAPI. O entrypoint é `app.py` na raiz; `requirements.txt` instala `fastapi` e `httpx`.
4. O diretório `public/` já contém o painel preparado, com `data-runtime=hosted`. Arquivos estáticos vão para a CDN. A API Python fica sob `/api/v1/` e `/api/docs`.
5. Toda atualização revisada mesclada em `main` pode gerar deploy automático se o Git Integration estiver ativo. Commits em `develop` devem ser tratados como prévias para revisão.
6. **Confirme** domínio, logs e `GET /api/v1/health` no projeto conectado. Uma tela "Deployed to Production" com 404 ainda não comprova que a aplicação funcione.

**Importante:** o proprietário criou uma conexão Git com Vercel em outro contexto da conta; a integração acessível ao assistente não teve autorização sobre esse workspace. Portanto, o código é preparado e enviado ao GitHub, mas o deploy da conta vinculada pelo proprietário precisa de verificação do painel da Vercel.

## Rotas hospedadas

| Rota | Proteção | Finalidade |
|---|---|---|
| `/` | pública | dashboard |
| `/api/v1/health` | pública, leitura | saúde |
| `/api/v1/sources`, `/api/v1/search/plan` | públicas, leitura | 41 fontes e planejamento |
| `/api/v1/lookup/providers` | pública, leitura | serviços suportados |
| `/api/v1/lookup` | pública, POST validado | consulta voluntária a DNS/CT/GitHub |
| `/api/v1/cases`, `/api/v1/engines`, `/api/v1/images/analyze`, `/api/v1/mcp` | **não expostas** | funcionam localmente ou exigem proteção adicional |

Casos e hashes da versão online são persistidos exclusivamente no cofre AES-GCM no navegador (mesma origem), sem upload ao servidor. O usuário deve usar HTTPS e fazer backup. Antes de tornar a API pública para público em escala, implantar rate limiting distribuído e limites de custo; o código atual apenas restringe destinos, formatos, tempo e tamanho de respostas.

## Diagnóstico

- **404 na home**: branch `main` sem `app.py` e `public/`, root directory incorreto, ou deploy não atualizado.
- **404 na API**: conferir framework FastAPI e roteamento `/api/v1/health`.
- **500 no backend**: verificar Build/Runtime Logs, imports do pacote `backend/src` e dependências `requirements.txt`.
- **Consultas de terceiros falham**: upstream pode bloquear requisições; status de HTTP e limite devem ser exibidos, sem fabricar registros.
- **Cofre indisponível**: exigir HTTPS, Web Crypto e armazenamento local permitido pelo navegador.

Nunca habilitar o backend local single-user em produção para "resolver" um erro de 404. Não adicionar chaves privadas ao frontend ou ao GitHub. Não publicar imagens, evidências, tokens ou dados investigativos nos logs.


## Imagens e OCR — V0.6

O frontend pode executar comparação local de hashes e iniciar OCR via WebAssembly sem instalar Python no dispositivo do usuário. O OCR usa CDN de terceiros para carregar runtime e idiomas, com controle de CSP explícito. `GET /api/v1/images/reverse/config` expõe apenas o **estado** do provedor (nunca credenciais); `POST /api/v1/images/reverse` exige `OSINT_REVERSE_ENABLED=1`, `GOOGLE_CLOUD_VISION_API_KEY` e `OSINT_REVERSE_TOKEN` (32+ caracteres) no backend. A foto só sai do navegador após consentimento e chave administrativa. Limite de 2 MB e timeout de fornecedor. **Não ativar essa rota para visitantes anônimos sem autenticação, quota, WAF e controle de gastos.** Documentação: `docs/IMAGE_INTELLIGENCE_V06.md`.
