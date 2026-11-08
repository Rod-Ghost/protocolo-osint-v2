# Engine Studio — auditoria técnica de integração v0.5

Status: integração API/UI criada; a disponibilidade de execução deve ser determinada **em produção** via `GET /api/v1/engines`. Não declarar motores operacionais apenas porque o pacote consta no manifesto.

## Arquitetura

- O catálogo de cinco motores e a execução controlada ficam em `backend/src/protocolo_osint/engine_hub.py`.
- No frontend, `apps/web/assets/engine-ui.js` apresenta um console real e rotula cada dependência segundo seu estado. Sem conexão à API, usa um catálogo estático explicitamente marcado **não conectado**, sem resultados inventados.
- Endpoint `GET /api/v1/engines` apenas verifica **presença de executáveis**, flag de habilitação e necessidade de worker; não dispara varreduras.
- `POST /api/v1/engines/run` é opt-in e **bloqueado por padrão**. São necessários `OSINT_ENGINE_EXECUTION_ENABLED=1` e `OSINT_ENGINE_TOKEN` aleatório com pelo menos 32 caracteres. A chave não fica no código, no HTML ou no JavaScript; o operador informa na sessão e o frontend limpa o campo depois da chamada. A autenticação simples é um estágio transitório, **não substitui** login, RBAC, limitações distribuídas, WAF ou auditoria.
- Nenhum provedor tem acesso a URLs arbitrárias da solicitação. Comandos usam listas de argumentos (`shell=False`), um único username ou domínio, timeout 24 s, saída e quantidade de registros limitadas. Não há execução de modos ativos, massivos ou brute-force.
- O processamento que exceder uma requisição HTTP (Amass e SpiderFoot) exige fila e worker dedicado antes de ser exposto, inclusive nos serviços Vercel Container/Daemons. Atualmente o botão fica indisponível para tais motores.

## Como chegam os projetos open source

| Projeto | Origem oficial | Modo de integração | Escopo testável |
|---|---|---|---|
| Sherlock | `sherlock-project/sherlock` | pacote Python `sherlock-project==0.16.2` no manifesto opcional | poucos sites públicos para um username por vez |
| Maigret | `soxoj/maigret` | pacote Python `maigret==0.6.6` no manifesto opcional | até 15 sites/top-sites, sem recursão |
| subfinder | `projectdiscovery/subfinder` | CLI Go no contêiner de motores, com versão fixada | subdomínios passivos, lista limitada |
| OWASP Amass | `owasp-amass/amass` | CLI Go no contêiner de motores; integração HTTP proibida até worker | passivo e assíncrono, saída bruta precisa triagem |
| SpiderFoot | `smicallef/spiderfoot` | código independente clonado por tag v4.0 no contêiner opcional | worker isolado, módulos avaliados antes de ativação |

**Não incluímos uma cópia sem avisos de licença dos repositórios no código do produto**. Imagens de build baixam os componentes da origem declarada; todos continuam regidos pelas respectivas licenças e documentação. Apache 2.0 no Amass tem subcomponentes que exigem verificação. Licenças MIT preservam seus copyrights. O software Protocolo OSINT conserva sua interface, orquestração e metodologia próprias.

## Gatilhos de teste e ativação

1. `pytest backend/tests/test_engine_hub.py backend/tests/test_hosted_engines.py`: testes controlados e de autorização; **não** confirmam consultas externas.
2. `GET /api/v1/engines`: confirma apenas disponibilidade local e flags; não confirma sucesso de resultado.
3. Executar um ensaio autorizado em uma conta de teste e domínio sob controle do operador; confirmar timeout, saída, licença e ausência de dados sensíveis nos logs.
4. Incluir autenticação de usuário e limites por identidade/IP distribuídos antes de disponibilizar execução pública. Nunca publicar a chave administrativa.
5. Para SpiderFoot/Amass: preparar worker, broker e persistência seguros; medir recursos e custos antes de ativar.

## Limites expressos

- Pip instala código de terceiros, não implica autoria própria.
- URLs e resultados da rede podem falhar, sofrer bloqueios ou produzir falsos positivos.
- Não há descoberta reversa global de imagens, nem inferência garantida de identidade.
- Container Functions não oferecem armazenamento de arquivos persistente; usar storage gerenciado autenticado quando necessário.
- A existência do `deploy/engines/Dockerfile` não significa que a imagem já foi construída ou implantada.
