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

## Ciclo v0.4.0 — 2026-11-08 (testado nesta execução)

- `python -m pytest -q backend/tests`: **28 passed**, incluindo validação do catálogo, endpoints locais, rotas públicas que não expõem casos, mocks de consultas DNS/crt.sh/GitHub, limites de resposta e cofre browser com AES-GCM real em Node Web Crypto.
- `node --check apps/web/assets/app.js` e `node --check apps/web/assets/vault.js`: **passaram**.
- `python scripts/build_vercel.py --output public`: **passou**, gerando HTML+CSS+JS+catálogo de 41 fontes para o Vercel.
- Chromium offline via `render_aurum.py`, com respostas da API **simuladas**: dashboard e aba de consulta renderizaram sem exceções JavaScript; consulta simulada exibiu 1 registro; viewport móvel 390px com `scrollWidth=390`.
- Criptografia browser roundtrip: criar cofre, criptografar dados, validar que texto sensível não aparece no storage, recusar senha errada, desbloquear, exportar e comparar dHashes (via Node Web Crypto). **A persistência em navegador real por HTTPS ainda não foi testada ponta a ponta**.
- Executáveis Sherlock, Maigret, subfinder e Amass **não foram instalados/executados**; somente a construção segura da linha de comando e flags foi testada com runner simulado. SpiderFoot ainda não foi integrado como serviço.
- Redes externas (Cloudflare DNS, crt.sh e API GitHub): **nenhuma requisição upstream realizada** durante os testes; disponibilidade de provedores não verificada ao vivo. Endpoints HTTP hospedados na Vercel precisam ser validados após deployment da branch `main`.
- A Vercel da conta vinculada pelo proprietário foi criada externamente. O assistente não tem acesso confirmado à leitura desse workspace no conector; não confundir commit publicado no GitHub com site online em produção.

**Pendências:** autenticação multiusuário, sincronização segura, rate limiting distribuído, análise real de OCR em hospedagem, integração CLI em workers isolados, MCP remoto autenticado, observabilidade e auditoria de licenças.


## V0.5 — verificações adicionais e limites

- Testes unitários de `engine_hub` realizados localmente: seis aprovados, usando runner controlado.
- `test_hosted_engines.py` cobre inventário real, bloqueio por padrão, chave ausente/incorreta, autorização controlada e ID inválido. Execução efetiva de Sherlock/Maigret em produção não foi verificada por esses testes.
- A suíte histórica foi atualizada: `GET /api/v1/engines` agora deve retornar inventário de leitura e `POST /api/v1/engines/run` deve negar execução não habilitada.
- Estáticos e CSS não substituem os fluxos legados; o Engine Studio usa CSS `obsidian.css` e JS `engine-ui.js` com verificação de sintaxe no CI.
- O contêiner experimental é especificação, não execução validada. Antes de habilitar um Worker, revisar licença e dependências transitivas, isolamento de processos, limites/custos e autenticação.


## V0.6 — validação de imagem e CSS

- `node tests/test-image-core.cjs`: validação de Hamming, ordenação, correspondência exata e formatos.
- `pytest backend/tests/test_reverse_image.py`: testes com provedor simulado, destino fixo, autenticação e erros. Teste de envio externo real não executado.
- `pytest backend/tests/test_hosted_reverse.py`: rota do FastAPI hospedado, funcionalidade bloqueada por padrão e preservação de isolamento do SQLite.
- `node --check apps/web/assets/{image-core,media-ui}.js` + cópias em `public/`.
- Chromium: renderização isolada com HTML legado e estilos; o teste completo HTTPS/Google/Tesseract em produção ainda é necessário.
