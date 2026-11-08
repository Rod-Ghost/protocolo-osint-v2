# Operação local-first, sem login nem chave administrativa

## Objetivo

O Protocolo OSINT V2 é um projeto orientado à execução no computador do
operador. O aplicativo local não depende de conta OAuth 2.0/OIDC nem de
`OSINT_ENGINE_TOKEN`. A Vercel é uma implantação **separada** para demonstração
e testes, não um serviço público de execução ilimitada de ferramentas OSINT.

## Rodar no próprio computador

Requisitos: Python 3.11+, ferramentas opcionais instaladas pelo operador e
permissão para executar consultas somente em fontes públicas autorizadas.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[test,engines]'
OSINT_ENABLE_LOCAL_ENGINES=1 uvicorn protocolo_osint.main:app --host 127.0.0.1 --port 8000
```

No Windows PowerShell, ative `.venv\Scripts\Activate.ps1` e use:

```powershell
$env:OSINT_ENABLE_LOCAL_ENGINES = "1"
uvicorn protocolo_osint.main:app --host 127.0.0.1 --port 8000
```

Abra **http://127.0.0.1:8000** e selecione **Motores de pesquisa**.

- Sherlock e Maigret: a instalação extra `[engines]` declara as respectivas
  dependências; confira a presença dos comandos antes do uso.
- subfinder e Amass: instale os executáveis oficiais separadamente. Sua
  presença é verificada pelo painel local, não simulada.
- SpiderFoot v4.0: utiliza o mesmo comando passivo validado no runtime
  isolado. Para executar a partir do checkout oficial `sf.py`, instale
  dependências em um **ambiente Python separado**, informe a pasta em
  `OSINT_SPIDERFOOT_DIR` e, opcionalmente, o Python dessa venv em
  `OSINT_SPIDERFOOT_PYTHON`. Também aceita um executável `spiderfoot`
  existente no PATH. A tag v4.0 é GPLv2; preserve os avisos. A instalação
  real de dependências pode exigir ajustes de compatibilidade por sistema.
- O operador precisa optar pela execução usando
  `OSINT_ENABLE_LOCAL_ENGINES=1`. **Isto não é uma chave nem uma conta**,
  apenas a ativação explícita de uma funcionalidade local.
- Apenas o comando escolhido e o alvo autorizado são transmitidos às
  fontes consultadas pelo motor, conforme a política e dependências da
  ferramenta. Dados de casos ficam no SQLite local ou no cofre criptografado
  do navegador; não são sincronizados com a Vercel.

## Fila local dos cinco motores

A estação local disponibiliza **todos os cinco motores** por uma fila de
processamento do próprio computador, sem conta ou chave administrativa:

- `POST /api/v1/local-engines/jobs`: recebe **um** username público ou domínio;
  aceita `sherlock`, `maigret`, `subfinder`, `amass`, `spiderfoot`.
  Retorna HTTP 202 com `job_id` e estado inicial. Só enfileira quando a
  funcionalidade estiver ativada e o motor instalado.
- `GET /api/v1/local-engines/jobs/{job_id}`: devolve `queued`,
  `running`, `completed` ou `failed`, com resultado somente após a
  conclusão. O Engine Studio consulta essa rota automaticamente.
- Um subprocesso por vez e até três tarefas ativas (uma em execução,
  duas em espera); limite máximo de **220 segundos** para SpiderFoot,
  **200 segundos** para Amass e limites menores nos outros motores.
- Resultados ficam apenas na **memória do processo local** por até uma
  hora, sem Vercel Blob, SQLite, exportação automática ou sincronização.
  Reiniciar o servidor perde tarefas e resultados não salvos.
- Chamadas localhost são protegidas contra origem remota e DNS rebinding.
  Não há endpoint equivalente aberto na API hospedada.

### Preparar SpiderFoot v4.0 separadamente

Baixe o release oficial `v4.0` do projeto SpiderFoot. Aponte
`OSINT_SPIDERFOOT_DIR` para a pasta que contém `sf.py` e
`OSINT_SPIDERFOOT_PYTHON` para o interpretador Python de um ambiente
virtual onde as dependências oficiais tenham sido instaladas e testadas.
Exemplo em shell Unix, adaptando os caminhos:

```bash
export OSINT_SPIDERFOOT_DIR="$HOME/tools/spiderfoot"
export OSINT_SPIDERFOOT_PYTHON="$HOME/tools/spiderfoot-venv/bin/python"
export OSINT_ENABLE_LOCAL_ENGINES=1
uvicorn protocolo_osint.main:app --host 127.0.0.1 --port 8000
```

O Dockerfile `deploy/engines/Dockerfile.daemon` registra ajustes de
compatibilidade testados no **contêiner CI**, não necessariamente em
macOS/Windows. Não se instala SpiderFoot automaticamente na máquina do
usuário. A documentação oficial da tag usa `-s TARGET -u passive -o json
-max-threads 2`; as chamadas permanecem manuais e limitadas.

## Limites de segurança e hospedagem

A API local deve escutar **somente em 127.0.0.1**, nunca em 0.0.0.0 nem em
um servidor público. Rotas de casos, imagens e execução local exigem origem
e conexão do próprio dispositivo; a validação também recusa hosts externos
e solicitações cross-site de navegadores.

A Vercel mantém `OSINT_ENGINE_TOKEN` para acesso administrativo à fila
compartilhada; esse segredo **não é necessário nem distribuído** para quem
usa a aplicação local. Não removê-lo da API hospedada: isso permitiria
que visitantes anônimos acionassem motores, consumissem cotas e acessassem
resultados. A política da Vercel pode evoluir para uso exclusivamente
demonstrativo/read-only, mas o código atual conserva a fila para testes
do mantenedor.

Não foi implementado OAuth 2.0/OIDC: não é necessário para este modo local
e adicionaria dependências, gestão de contas e dados de usuários. Se um dia
houver plataforma compartilhada, criar projeto separado de identidade,
autorização e quotas, sem alterar os dados locais existentes.

## Validação

```bash
python -m pytest -q backend/tests
node --check apps/web/assets/engine-ui.js
node --check public/assets/engine-ui.js
node --check apps/web/assets/engine-queue-ui.js
node --check apps/web/assets/ops-readiness.js
```

Testes de regressão: `backend/tests/test_local_first_no_token.py` e `backend/tests/test_local_engine_jobs_v15.py`.
Testes unitários não atestam que upstreams de terceiros realmente responderam.
Teste de execução real exige ferramenta instalada, rede, consentimento e alvo
de laboratório autorizado.
