# Protocolo OSINT V2 — preparação do backend online

Status: **código preparado, não implantado**. A publicação direta na Cloudflare não foi autorizada na sessão; não foi contornada.

## Objetivo

Este Worker Python experimental expõe **somente**:
- `GET /api/v1/health`
- `GET /api/v1/summary`
- `GET /api/v1/sources`
- `GET /api/v1/integrations`
- `POST /api/v1/detect`
- `POST /api/v1/search/plan`

Consultas são **planejadas**, não executadas em sites externos. Nenhuma consulta fica armazenada. CORS permite exclusivamente a origem `https://rod-ghost.github.io`. Os endpoints de casos e imagens do servidor local são desabilitados neste Worker porque a V2 ainda não oferece autenticação, RLS, persistência gerenciada e isolamento entre usuários. **O MCP stdio local não é um servidor MCP HTTP público.**

## Preparação de código (sem publicação)

```bash
python scripts/prepare_cloudflare_bundle.py --output .build/cloudflare
```

O pacote contém `worker.py`, `catalog.py` e `detection.py`. O catálogo original de fontes continua em `backend/src/protocolo_osint/catalog.py`, evitando duas fontes independentes de verdade.

## Próximos requisitos antes da implantação completa

1. Autorizar a publicação do Worker no provedor escolhido, com revisão dos recursos criados.
2. Adicionar automatização GitHub → Cloudflare no projeto efetivamente conectado, protegendo os segredos.
3. Fazer testes HTTP reais de saúde, CORS, tipagem e links; conferir os limites do plano e da plataforma.
4. Para casos, evidências, uploads e MCP remoto: autenticação, autorização por usuário, banco gerenciado com políticas, armazenamento seguro e rate limiting. O banco SQLite de um usuário único não pode ser exposto em produção.
5. Resolver titularidade e licença antes de publicar código derivado de terceiros.

A versão estática do GitHub Pages pode continuar independente. **Nenhum deploy de produção foi feito aqui.**
