# Auditoria estrutural V3.2 — Cobertura real por fonte e execução verificada

## 1. Evidência da falha original
- Captura do usuário: pesquisa por nome retornou **10 candidatos de perfil do GitHub**.
- Na V3.1, `POST /api/v1/lookup` era invocado para provedor baseado no *tipo de alvo*, independentemente da lista de fontes escolhidas pelo operador.
- O construtor permitia escolher 48 fontes do catálogo. O número mostrava **destinos disponíveis para abrir**, não coletas concluídas.
- O PDF mostrava JSON bruto de uma API e não evidenciava as demais fontes **não consultadas**.
- O cofre armazenava no máximo 10 fontes por relatório; uma auditoria completa de catálogo não cabia.
- O ZIP original tem 23 páginas HTML e **48 comandos de abertura de links em `Name.html`**, não 48 conectores HTTP automatizados. Suas fontes continuam referência metodológica; não se deve descrevê-las como extração de dados comprovada.

## 2. Arquitetura nova — preservar sem prometer cobertura fictícia

```text
Seleção de fontes / termo / filtros
        |
        v
POST /api/v1/investigations/execute
        |
        v
source_execution.py
    | valida seleção com construtor existente
    | classifica por tipo de alvo e capacidade do adaptador
    | lista TODAS as fontes selecionadas, inclusive sem API
    |
    +-- adaptador oficial com API -- limitado + consentido
    |       |
    |       +-- live_lookup.lookup() -- host HTTPS fixo
    |               |
    |               +-- GitHub Users / Search
    |               +-- Wikidata Action API
    |               +-- OpenAlex Authors
    |               +-- Cloudflare DNS (A/MX/NS)
    |               +-- crt.sh CT
    |
    +-- sem API = not_queried, URL manual, quantidade desconhecida
    +-- incompatível = incompatible, nenhuma requisição enviada
        |
        v
JSON v2 com count, executed, provider, source_url, query_url, observed_at
        |
        +-- UI: resultados reais primeiro; links manuais colapsados
        +-- PDF local: consulta x seleção, fontes e evidências clicáveis
        +-- Cofre: cópia AES-GCM opcional com manifest de cobertura
        +-- Motores autenticados: caminho antigo preservado; status pendente
```

## 3. Contrato e semântica obrigatória

| Estado | Significado operacional | Quantidade |
| --- | --- | --- |
| `observed` | API respondeu com registros | `len(items)` |
| `no_result` | API respondeu validamente sem registros | 0, **somente nesse provedor** |
| `failed` | Provedor indisponível, erro HTTP, timeout ou falha de formato | desconhecida (`null`) |
| `not_queried` | Fonte selecionada sem conector API homologado, ou limite de execução | desconhecida (`null`) |
| `incompatible` | Fonte não aceita o tipo informado | desconhecida (`null`) |
| `pending` | Motor em fila, sem resultado final confirmado | desconhecida (`null`) |
| `completed` | Motor devolveu saída técnica; verificar atribuição à origem | somente registros devolvidos |

O endpoint **GET** de capacidades informa o catálogo e os conectores aptos por critério, sem prometer que funcionarão fora de laboratório. O endpoint **POST** de execução só consulta após ação explícita.

## 4. Cobertura verificada no código

A base `catalog.py` tem 48 fontes de links. Acrescentou-se `dns-public` como fonte oficial no catálogo (49 no total), para que uma pesquisa de domínio possa selecioná-la conscientemente.

Conectores revisados em `source_execution.ADAPTERS`:
- `github-users`: API de usuário por identificador ou candidatos por nome.
- `wikidata`: API oficial de entidades candidatas, até 10 por consulta.
- `openalex`: API pública de autores candidatos, até 10 por consulta.
- `crt`: transparência de certificados do domínio, até 25 registros.
- `dns-public`: DNS público A/MX/NS, até 40 registros.

**Outras 44 fontes são manuais**; não fazemos scraping não autorizado, bypass de plataformas, consultas arbitrárias ou contagens inventadas. Os motores Sherlock/Maigret/subfinder/Amass/SpiderFoot continuam integrados por execução autenticada e fila, mas são contabilizados separadamente do catálogo.

Para nomes próprios, as entidades de Wikidata, autores OpenAlex e perfis do GitHub são **candidatos de fontes diferentes**, não provas de que pertencem à mesma pessoa. Contagens não são somadas como “pessoas únicas”.

## 5. Segurança e desempenho
- Conectores só consultam hosts HTTPS de allowlist definida em `live_lookup.py`, sem seguir redirects. Resposta limitada a 260 kB e timeout de 4 segundos por requisição externa.
- No máximo **5 fontes remotas**, 3 tarefas em paralelo por solicitação explícita; todas as demais aparecem como não consultadas.
- Cada registro é limitado a no máximo 40 itens no contrato. Nenhuma execução sobre login ou palavra digitada automaticamente; confirmação ocorre no navegador.
- Nenhuma coleta genérica de páginas de sites selecionados: a ausência de API oficial/permitida permanece visível.
- O cofre admite agora até 65 entradas de fonte por relatório (inclui workers), snapshots até 150 kB; criptografia e esquema originais preservados. O PDF local também admite 65.
- Verificação de propriedade de contas, homônimos e correlação de identidades permanece **não implementada**.

## 6. Testes e critérios de aceite
- `backend/tests/test_source_execution.py`: selecionadas vs executadas, status negativos, falhas, seleção duplicada, sem rede, API de cobertura.
- `backend/tests/test_live_lookup.py`: normalização de Wikidata/OpenAlex e rejeição de IDs externos.
- `tests/test-investigation-report.cjs`: PDF com 49 fontes (inclusive não executadas), links e xref válidos.
- `tests/browser-observed-results.cjs`: Chromium com mocks e cofre local isolado, alvos domínio/nome, motores e PDF.
- Regressões existentes `backend-ci` e `browser-e2e`, Preview READY no commit de homologação.
- Para declarar fontes **operacionais reais**, ainda é preciso uma bateria de consultas permitidas com alvos sintéticos/autorizados no ambiente publicado, registrando resposta, cota/erro, DNS e resultados do daemon (e não apenas mocks).

## 7. Limites e prioridades depois dessa mudança
1. Homologar cada conector em produção sem depender apenas de testes com mocks.
2. Avaliar legalidade/termos e viabilidade de APIs paginadas para os demais destinos; conectar somente após aprovação e custos conhecidos.
3. Agregar deduplicação **entre fontes** mantendo cada proveniência e identidade como hipótese (sem inferir homônimos).
4. PDF pericial mais completo, evidências verificadas e exportação versionada; a versão atual permanece preliminar.
5. Rever autenticação, cotas compartilhadas, orçamento, logs e saúde do daemon antes de ampliar requisições públicas.

### Documentação da mudança
Arquivos novos: `source_execution.py`, `test_source_execution.py`, este documento.
Alterados (aditivos): `catalog.py`, `live_lookup.py`, `hosted_api.py`, UI de resultados, gerador PDF, cofre, workspace e testes. Não excluir módulos originais nem tocar dados existentes.
