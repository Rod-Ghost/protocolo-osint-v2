# Auditoria funcional — 20 melhorias OSINT (v1.0)

Esta versão entrega dez operações determinísticas sem rede. Não equivale à conclusão das vinte melhorias. O sistema legado permanece preservado.

| Nº | Melhoria | Estado comprovável |
|---|---|---|
1 | Correlação de identidades | Parcial: indicadores lexicais, sem confirmar identidades |
2 | Grafo investigativo | Parcial: relações fornecidas, não persistentes |
3 | Linha do tempo | Parcial: ordenação de eventos informados |
4 | IA para hipóteses | Parcial v1.2: prompt metodológico offline + modelo Ollama local/API própria, sem verificação automatizada de fatos |
5 | Confiabilidade das fontes | Parcial: checklist documental, não veracidade |
6 | Domínios históricos | Parcial anterior: DNS/CT, histórico pendente |
7 | E-mails | Parcial: cabeçalhos, sem autenticação criptográfica |
8 | URLs e redirecionamentos | Parcial: sintaxe, sem navegação |
9 | Monitoramento contínuo | Pendente: agendamento e identidade |
10 | Investigação corporativa | Pendente: fontes e regras jurídicas |
11 | Imagens | Parcial anterior: SHA/dHash/OCR; EXIF pendente |
12 | Vídeos | Pendente: extração e isolamento |
13 | Documentos | Parcial: extração lexical; PDF/DOCX pendentes |
14 | Geolocalização | Pendente: fontes geográficas |
15 | Busca semântica | Pendente: índice vetorial e permissões |
16 | Cadeia de custódia | Parcial v1.1: eventos de metadados SQLite locais encadeados; não comprova bytes originais |
17 | Metodologia | Parcial: checklist de seis etapas |
18 | Relatórios | Parcial v1.1: Markdown no cofre browser e PDF/DOCX do backend local; não autenticam fontes |
19 | MCP | Parcial anterior: cliente/servidor de leitura |
20 | Multiagentes | Pendente: orquestração, custos e revisão |

## API e interface

GET /api/v1/lab/capabilities e POST /api/v1/lab/analyze implementam timeline, entities, source-quality, graph, manifest, report, email-headers, url-inspect, text-compare e methodology. O formulário fica no painel Mapa de conexões.

## Segurança e limites

- Sem coleta externa, scraping, persistência, tokens ou navegação automática.
- A entrada passa pela API pública: NÃO enviar dados sigilosos.
- Máximo de 100 itens por operação, 12.000 caracteres por texto e 50.000 caracteres de entrada.
- Hash do manifesto é derivado de dados declarados, não dos bytes de arquivo.
- Vínculos e fontes são informados pelo operador, sem validação externa.
- Relatório é rascunho, não laudo pericial.

## Próximas implementações

Autenticação por usuário, isolamento de casos, quotas e banco persistente são pré-requisitos para ingestão de arquivos, agentes, indexação semântica e monitoramento.

## V1.1 - Limitações dos novos módulos

Custódia e relatórios locais implementados e documentados. A auditoria do banco não corresponde a prova judicial e o cofre browser continua separado do SQLite. Ver docs/CUSTODY_AND_REPORTS_V11.md.

## v1.2 — IA opcional

Roteiro offline (não IA) e conector experimental Ollama/BYOK adicionados sem credenciais ou custos obrigatórios. A API HTTPS depende de CORS e da conta do operador; nenhum teste com modelo remoto foi realizado. O sistema não atribui autoridade a conclusões geradas por modelo. Detalhes em `docs/AI_LOCAL_BYOK_V12.md`.
