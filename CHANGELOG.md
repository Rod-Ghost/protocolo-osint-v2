# Changelog


## [UI V3.2] — 2026-11-10 (source execution audit)

- Mapa de capacidades distingue catálogo de links de APIs realmente executáveis.
- `POST /api/v1/investigations/execute` contabiliza cada fonte selecionada e retorna `observed`, `no_result`, `failed`, `not_queried` ou `incompatible`, com origem e contagem verificáveis por contrato.
- Conectores limitados de candidatos Wikidata/OpenAlex acrescentados a GitHub, DNS e CT; nenhum resultado de pessoas é tratado como identidade verificada.
- Um DNS público foi acrescentado ao catálogo sem remover os 48 destinos anteriores.
- Relatórios PDF e cópias locais AES-GCM preservam resultados, links manuais não consultados e até 65 entradas por execução.
- Corrigida a perda do campo de dados DNS e o excesso de JSON bruto no relatório.
- Testes contratados sem tráfego externo; consulta real em produção e heartbeat dos motores permanecem pendências operacionais.


## [1.2.0] — 2026-11-08

- Menu IA opcional: checklist metodológico offline como padrão, sem LLM, API ou cobrança.
- Integração experimental com Ollama local e servidores HTTPS compatíveis com Chat Completions, usando credenciais fornecidas pelo operador por operação.
- Nenhum token persistido ou entregue à API Vercel. Confirmação explícita antes de transmitir texto; não exporta conteúdo do cofre automaticamente.
- Limites de prompt, timeout, resposta e políticas de endpoint/CSP; testes de requisição, segurança e regressão.
- Funcionalidades investigativas existentes preservadas sem dependência de IA paga.


## [1.1.0] - 2026-11-08

- Migração SQLite local aditiva, diário encadeado de integridade de metadados SHA-256 e verificação de divergências.
- Preservados os casos anteriores, marcados legacy_unsealed sem inventar histórico.
- Endpoints locais de auditoria e relatórios PDF/DOCX/Markdown em memória; não consultam fontes externas.
- Relatório Markdown privado gerado no próprio cofre do navegador, sem upload de dados ao servidor.
- Endpoints locais de casos e análise de imagens com proteção loopback e validação de origem.
- Suite de testes ampliada. Nenhum banco ou recurso pago ativado na API pública.


## [0.4.0] — 2026-11-08

- Implementado design **Aurum UI** (grafite/dourado, componentes compactos, dashboard responsivo, tema claro preservado) como camada sobre CSS original.
- Nova página de consultas públicas com registro de fonte, instante da consulta e exportação JSON da resposta.
- Implementados conectores HTTP fixos e voluntários para DNS-over-HTTPS, crt.sh e GitHub REST; **upstreams não testados ao vivo**.
- Criado backend **FastAPI público e sem persistência**, separado da API local não autenticada, preparado para Vercel Functions.
- Adicionado cofre pessoal **AES-256-GCM** em armazenamento de navegador: casos, notas, referências, hashes de imagens, grafo e exportação JSON; sem sincronização multiusuário.
- Adicionada camada de adaptadores de CLI para Sherlock, Maigret, subfinder e OWASP Amass; SpiderFoot inventariado. Execução desativada por padrão e não disponível na Vercel.
- Incluídos testes de limites de consulta, proteção de endpoints, criptografia com Node Web Crypto e compilação do site para Vercel.
- Documentadas atribuições, referências visuais, limitações públicas e riscos de publicar sem revisão de licença e controles operacionais.

## [0.3.0] — 2026-11-08

- Criada preparação de deploy estático no GitHub Pages e prévia separada da API Python.
- Adaptados caminhos relativos e hashes no navegador para modo demonstrativo.

## [0.2.0] — 2026-11-08

- Dashboard local-first responsivo sem build JavaScript, 41 fontes HTTPS, casos SQLite, laboratório SHA-256/dHash/EXIF/OCR opcional, grafo, MCP stdio experimental, Docker e testes.

## [0.1.0] — 2026-11-08

- Fundação inicial com classificação offline e protótipo React/TypeScript preservado.


## 0.6.0 — Monochrome Signal / Image Intelligence

- Novo tema minimalista independente em preto/branco/cinza + um vermelho, camada CSS aditiva.
- Comparação visual local entre casos desbloqueados com SHA-256 e dHash; sem upload de imagens.
- OCR português/inglês em Tesseract.js carregado após ação explícita.
- Integração opcional com Google Cloud Vision Web Detection, condicionada a credenciais no servidor e consentimento de envio de imagem.
- Testes unitários de hash, checagem de bytes MIME, proteção administrativa e provedor HTTP simulado.
- API pública não armazena fotos nem casos, e não habilita custos externos sem configuração.
