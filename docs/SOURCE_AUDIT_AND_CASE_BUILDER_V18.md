# Auditoria do catálogo e Construtor de Busca V1.8

## Fontes de evidência e escopo

- Livro fornecido: `protocolo osint.pdf`, **689 páginas** (capítulos 8,
  10–24, 27 e 33 pertinentes para planejamento, fontes, documentação e dorks).
- Arquivo fornecido: `Protocolo-OSINT.zip`, **23 páginas HTML** no diretório
  raiz, com formulários e scripts `window.open` que preparam URLs de terceiros.
- Repositório em `main` antes da V1.8: **41 fontes** curadas em
  `backend/src/protocolo_osint/catalog.py`.
- Inventário estático dos HTML do ZIP: cerca de **231 hosts distintos**
  mencionados em literais `http(s)`, incluindo a dependência CDN, links
  duplicados, sites retirados de operação e destinos não relacionados a
  um buscador de verdade. **NÃO** são 231 integrações válidas, disponíveis
  ou operacionalmente testadas.

A conclusão é que as 41 fontes eram um **catálogo seletivo**, não a
transcrição integral dos links da primeira interface. Há serviços do
protocolo antigo e novos destinos modernos incluídos pela equipe V2.

### Categorias originais com lacunas ainda não migradas em profundidade

| HTML original | Estado relativo ao catálogo anterior |
|---|---|
| Search, Username, Domain, IP, Email | Muitas fontes aproveitadas; serviços de nicho ainda de fora |
| Images, Videos, Documents | Google Imagens, Flickr, Crossref e outras presentes; faltam vários acervos e ferramentas especializadas |
| Name, Telephone, TelefoneNacional | Bases de busca de pessoas e números não importadas em massa; há riscos de privacidade, disponibilidade e condições de uso |
| Business, Location | Diretórios corporativos, registros públicos e mapas especializados parcialmente ausentes |
| Communities, Facebook, Instagram, LinkedIn, Twitter | Links gerais presentes; buscadores de comunidade e análises específicas precisam de revisão |
| Currencies, Breaches, Pastes | Pesquisa de ativos digitais e vazamentos tem cobertura limitada; não importar fontes de dados vazados sem revisão legal |
| Search (arquivo original) | Google Scholar, Patents, Startpage, Qwant e outros fora das 41 anteriores |

## Sete destinos recuperados no primeiro lote

Não são integrações API nem comprovam que uma consulta foi executada.
São **links HTTPS preparados a partir de templates fixos**, com navegação
somente por ação explícita do usuário:

| ID | Fonte do ZIP original | Consulta |
|---|---|---|
| startpage | Search.html | Buscador web Startpage |
| qwant | Search.html | Buscador web Qwant |
| google-scholar | Search.html | Google Acadêmico |
| google-patents | Search.html | Google Patentes |
| internet-archive | Documents.html | Internet Archive |
| hn-search | Communities.html | Busca Hacker News/Algolia |
| viewdns-whois | Domain.html, IP.html | WHOIS público ViewDNS |

Total do catálogo após esse lote: **48 fontes**. As 41 entradas anteriores
permanecem preservadas. O catálogo não é um serviço que entrega 48
resultados, mas uma lista de destinos de consulta.

### Candidatos para análise futura (não anunciados como operacionais)

- KnowEm, ViewDNS reverso, WHOIS históricos e diretórios corporativos.
- Bases de registros judiciais/comerciais por jurisdição, inclusive
  OpenCorporates e CourtListener, onde escopo e termos permitirem.
- Metadados de vídeo, mapas colaborativos, histórico de ruas.
- Exploradores públicos de blockchain com perfis diferentes.
- Fontes de notícias/feeds RSS oficiais.
- Serviços de e-mail e vazamentos apenas para verificação legítima dos
  próprios dados ou de sistemas autorizados.

Cada item necessita revisão individual de URL, licença, regionalidade,
termos, disponibilidade, login e proteção de dados. Não transplantar
URLs HTTP, APIs sem credencial, scraping de plataformas ou sites de
vazamentos do ZIP automaticamente.

## Construtor de Busca (V1.8)

### Planejamento por caso, sem custo de API

O módulo `backend/src/protocolo_osint/search_builder.py` aplica
validação e gera URLs exclusivamente a partir de fontes cadastradas.
O usuário pode selecionar **até 60 fontes**, definir tipo de pesquisa
e adicionar operadores controlados: expressão exata, `site:`,
`filetype:` e exclusão de palavras. Operadores avançados são enviados
apenas para templates da família Google em que o módulo declara
suporte; outros destinos recebem o termo simples.

A resposta distingue:
- `total`: links que o Protocolo OSINT conseguiu **preparar**;
- `skipped`: fontes incompatíveis;
- `actual_results: null`: nenhuma contagem de resultados externos;
- `external_requests: 0`: nenhuma consulta externa executada pelo builder.

O navegador apenas abre um resultado por vez, após clique. Não utiliza
APIs pagas, não burla CAPTCHA, nem extrai resultados dos buscadores.

### Dentro de casos

Em `apps/web/assets/vault.js`, adicionam-se campos opcionais
`search_plans` aos casos sob o mesmo esquema criptográfico AES-GCM
e a mesma chave PBKDF2 existente. O cofre legado é compatível, e não
há migração destrutiva. Cada plano contém termo, fontes selecionadas,
filtros, data de criação e revisões manuais. A exportação JSON e os
relatórios Markdown passam a incluir esses planos.

O investigador pode registrar uma revisão manual a qualquer momento
e anotar uma **contagem estimada informada por ele**, mais observações.
O sistema calcula somente a diferença entre duas anotações,
rotulando-a como `count_origin: manual_unverified`. Uma variação
**não comprova novo conteúdo, nova identidade ou novas fontes**.

Os lembretes de 7/30 dias aparecem apenas ao consultar o caso
desbloqueado. **Não existe monitoramento automático**, notificações
quando o navegador está fechado, nem coleta invisível de dados pessoais.

### Evolução posterior de monitoramento

Primeiro integrar feeds públicos oficiais (RSS/Atom, diários oficiais,
repositórios/segurança de domínios próprios) que autorizem consultas
automatizadas e aceitem comparação de identificadores de publicação.
Usar consentimento explícito por caso, frequência e retenção limitadas,
orçamento de Vercel e revisão de privacidade. Notificações
multidispositivo exigiriam algum serviço persistente/consentimento,
o que não faz parte da versão atual.

### Por que não fornecer uma contagem automática de resultados Google?

O catálogo não chama Google. O número exibido pelo buscador é uma
estimativa variável, não uma prova de resultados distintos. A
Custom Search JSON API de Google passou a estar **fechada para novos
clientes** e os usuários legados deverão migrar até 2027. Não
introduzir nova API key ou custos sem avaliar alternativas oficiais
e seu licenciamento.

## Segurança e validação

- Entradas validadas, apenas templates HTTPS fixos do catálogo,
  sem URL de fonte arbitrária, sem SSRF nem requisição externa no servidor.
- Nenhum caso ou plano é persistido na Vercel; a interface guarda
  conteúdo somente no cofre criptografado do navegador.
- Testes `backend/tests/test_search_builder_v18.py` e
  `tests/test-case-search-builder.cjs` cobrem tipos, URLs, contagens,
  persistência criptografada, revisões, e compatibilidade.
- Não confundir build/CI com disponibilidade dos sites externos.
- A PR #17 de correções de motores continua pré-requisito;
  publicar em produção somente após rate limit da Vercel liberar
  Preview do conjunto e testes de regressão concluídos.
