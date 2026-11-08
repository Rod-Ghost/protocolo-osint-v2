# Roadmap orientado a testes — Protocolo OSINT V2

## v0.2.0 — Entregue nesta branch

- Painel responsivo em HTML/CSS/JS sem build.
- 41 fontes de destino e consulta local por tipo.
- API FastAPI e documentação OpenAPI.
- Gestão de casos, referências e registros com hashes em SQLite.
- Upload de imagens, SHA-256, dHash, EXIF mínimo, OCR opcional e similaridade local por caso.
- Mapa SVG de registros documentados.
- MCP JSON-RPC stdio experimental com duas ferramentas locais somente leitura.
- Suite Python 13 testes incluindo os testes da fundação anterior.

## v0.3 — Próximos passos, não entregues

- Auditar original para migração preservando funções e respeitando direitos e licenças.
- Catálogo de fontes por YAML com testes de templates por provedor, status operacional e versionamento.
- CLI opcional de Sherlock e Maigret com isolamento, licença e permissões explícitas.
- Testes de interface HTTP reais em CI com Playwright; navegador de execução atual está sob política restritiva.
- Comparação de resultados de fontes com proveniência e false-positive scoring.
- OCR multilíngue, busca semelhante por embeddings locais e indexação local de acervo de imagens.

## v0.4+

- Captura verificável de páginas, metadados de coleta e cadeia de custódia reprodutível.
- Conectores adicionais de infraestrutura: RDAP, CT, DNS e serviços públicos com autorização e limites.
- SDK de plugins e MCP com SDK oficial e testes de conformidade.
- Autenticação por perfis para operação compartilhada, separação por organizações, auditoria forte e PostgreSQL opcional.
- Correlação fundamentada em evidências, IA local opcional e ferramentas de relatório.
- Conectores governamentais e geoespaciais por país, observando LGPD e outros regimes aplicáveis.

## Publicação

A visibilidade permanece **privada** até saneamento de procedência, aprovação da licença definitiva e auditoria de segurança. Consulte `RELEASE_GATE.md`.

## v0.4 — progresso de execução (08/11/2026)

**Concluído em código e teste controlado:** Aurum UI, prévia web com fontes e hashes, cofre AES-GCM local browser, camada Vercel FastAPI pública, integrações explícitas DNS/CT/GitHub (mocks), inventário + adaptadores locais Sherlock/Maigret/subfinder/Amass. Os programas de terceiros **não estão instalados** na Vercel e a integração live ainda precisa de teste remoto. Veja `docs/INTEGRATIONS_V04.md` e `docs/VALIDATION.md`.

**Próximos gates técnicos para experiência completa na nuvem:**
1. Confirmar publicação HTTP na Vercel do proprietário com branch main correta.
2. Limitar uso de `/api/v1/lookup` por identidade/IP utilizando solução distribuída; telemetria sem logs de consultas sensíveis.
3. Autenticação e autorização multiusuário; banco PostgreSQL com regras de acesso e backups; consentimento de retenção e LGPD.
4. Workers persistentes/filas para Sherlock/Maigret/SpiderFoot/subfinder/Amass; sandbox, quota, cooldown, cancelamento, limpeza e direitos de uso.
5. OCR, extração de documentos, EXIF técnico, APIs oficiais de busca reversa com opt-in, armazenamento opcional privado.
6. MCP remoto com autenticação por usuário e escopos mínimos, trilha de auditoria, ferramentas read-only primeiro.
7. Evidência versionada, captura contextual, hashes de conteúdo original, exportação forense e cadeia de custódia.
8. CI navegadores reais, testes de provedores com fixture contratual, auditoria de dependências/licenças e publicação sob licença OSS aprovada.
