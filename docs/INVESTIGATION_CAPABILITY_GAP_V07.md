# Cobertura de investigação digital — V0.7

O sistema não está completo para investigações ponta a ponta. Um motor no catálogo não significa um motor validado. Priorizar autenticação, workers, quotas e evidências antes de prometer consultas irrestritas.

| Nº | Prioridade | Melhoria | Critério de aceite |
|---|---|---|---|
| 01 | P0 | Sherlock | Worker autenticado e teste real |
| 02 | P0 | Maigret | Worker autenticado e teste real |
| 03 | P0 | subfinder | Execução passiva, versionada e testada |
| 04 | P0 | Amass | Worker assíncrono, cancelamento e fila |
| 05 | P0 | SpiderFoot | Serviço isolado, perfis e logs |
| 06 | P0 | Identidade | Login OIDC por operador |
| 07 | P0 | RBAC | Permissões por caso e ferramenta |
| 08 | P0 | Filas | Jobs idempotentes e retries |
| 09 | P0 | Quotas | Rate limit e orçamento por fonte |
| 10 | P0 | Segredos | Vault de tokens e rotação |
| 11 | P0 | MCP customizado | Cliente browser v0.7; gateway autenticado pendente |
| 12 | P1 | MCP presets | Endpoints oficiais e health checks |
| 13 | P1 | MCP servidor | Streamable HTTP com autenticação e escopos |
| 14 | P1 | Índice visual | Hashes e deduplicação persistentes |
| 15 | P1 | Busca reversa | Provedor real com consentimento e quotas |
| 16 | P1 | OCR | Português/inglês, PDFs e confiança |
| 17 | P1 | EXIF | Normalização e privacidade GPS |
| 18 | P1 | Identidades | Correlação com evidências e confiança |
| 19 | P1 | Grafos | Relações tipadas e procedência |
| 20 | P1 | Cronologia | Timeline com fuso e fonte |
| 21 | P1 | Custódia | Hashes, autoria e exportação |
| 22 | P1 | Relatórios | Citações, anexos e metodologia |
| 23 | P1 | Fontes | Health, termos e última verificação |
| 24 | P2 | Geoespacial | Mapas e validação de coordenadas |
| 25 | P2 | Observabilidade | Métricas, SBOM, backups e LGPD |

## Arquitetura

Frontend/API na Vercel; fila, worker isolado, armazenamento e segredos gerenciados. Uma URL não implica um processo único. A implantação depende de infraestrutura autorizada, recursos e credenciais reais; não usar tokens fictícios. O legado e as atribuições de terceiros devem ser preservados. Cada motor precisa de smoke test com alvo de laboratório e logs redigidos.
