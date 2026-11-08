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
- SpiderFoot: integrado ao runtime de Daemon isolado; ainda **não possui
  adaptador de execução direta** pelo endpoint local. O painel indica isso
  em vez de anunciar funcionamento inexistente.
- O operador precisa optar pela execução usando
  `OSINT_ENABLE_LOCAL_ENGINES=1`. **Isto não é uma chave nem uma conta**,
  apenas a ativação explícita de uma funcionalidade local.
- Apenas o comando escolhido e o alvo autorizado são transmitidos às
  fontes consultadas pelo motor, conforme a política e dependências da
  ferramenta. Dados de casos ficam no SQLite local ou no cofre criptografado
  do navegador; não são sincronizados com a Vercel.

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

Testes de regressão: `backend/tests/test_local_first_no_token.py`.
Testes unitários não atestam que upstreams de terceiros realmente responderam.
Teste de execução real exige ferramenta instalada, rede, consentimento e alvo
de laboratório autorizado.
