# Changelog

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
