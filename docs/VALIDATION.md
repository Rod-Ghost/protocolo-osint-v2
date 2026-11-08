# Validação — 08/11/2026

## Testes efetivamente executados

- `PYTHONPATH=src pytest -q` em `backend/`: **13 passed**, incluindo cinco testes originais do starter e oito novos.
- `node --check apps/web/assets/app.js`: sintaxe JS sem erros.
- `python -m compileall` sobre o backend: sem falhas.
- API local iniciada com Uvicorn em `127.0.0.1:8000`; `curl /` retornou HTTP 200.
- Frontend renderizado em Chromium via `page.set_content()` + CSS/JS reais e respostas de API obtidas previamente via TestClient: sem erros de JavaScript. Renderização feita sem navegação HTTP.
- Com visualização isolada do frontend, ações testadas: abrir busca de domínio, exibir fontes preparadas, selecionar caso, exibir evidências, abrir laboratório, visualizar grafo, mudar para viewport móvel 390px (sem overflow horizontal).

## Limitação do ambiente

O Chromium deste ambiente bloqueou com `ERR_BLOCKED_BY_ADMINISTRATOR` tanto `file://` quanto `http://127.0.0.1:8000/`. Por isso, **não foi possível executar testes E2E HTTP reais com navegador**. A visualização com respostas simuladas e os testes de API separados não equivalem à validação integrada completa em navegação normal.

## O que NÃO foi testado ou confirmado

- A operação real de qualquer um dos 41 destinos externos.
- Reconhecimento OCR com diferentes idiomas e imagens complexas (o teste de imagem desativou OCR).
- Compatibilidade do MCP com clientes MCP de terceiros, além dos testes JSON-RPC diretos.
- Integradores Sherlock, Maigret, SpiderFoot, IA e busca reversa externa — ainda não implementados.
- Processo de instalação via Docker no ambiente atual.
- Requisitos de evidência jurídica, preservação de conteúdo externo, identidades inferidas e correlação de entidades.

## Regressão e uso seguro

Usar dados sintéticos durante testes. Nunca expor o servidor sem autenticação e TLS; no modo atual use somente loopback. Os testes de hash se aplicam a bytes locais e metadados, não certificam autenticidade do conteúdo.

### Publicação de prévia via GitHub Pages (2026-11-08)
- Workflow de Pages preparado na branch `develop`; executa apenas após inclusão e commit em `main` e habilitação pelo proprietário.
- Frontend com suporte a caminhos relativos, catálogo estático e análise de hash de imagens via Web Crypto/Canvas, explicitamente sem backend.
- Build estático validado localmente com 41 fontes. `pytest -q`: 14 testes passaram; `node --check`: passou.
- Navegação HTTP com Chromium automatizado foi bloqueada pelo ambiente; interface publicada ainda não testada em browser real neste turno.
- Gestão de casos, OCR, MCP e API continuam restritos ao backend local, não disponíveis no Pages.
