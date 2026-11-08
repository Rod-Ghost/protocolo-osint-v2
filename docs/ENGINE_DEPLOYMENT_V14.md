# Operação piloto integrada — Vercel Daemon (2026-11-08)

## Arquitetura

O projeto `protocolo-osint-v2` usa **um repositório e um projeto Vercel**:
- `app.py` e FastAPI mantêm a API e o site atuais, sem mudança de rotas.
- `deploy/engines/Dockerfile.daemon` instala, na própria imagem,
  Sherlock 0.16.2, Maigret 0.6.6, subfinder 2.9.0,
  Amass 5.0.1 e SpiderFoot 4.0, preservando seus avisos.
- `vercel.json` declara um Daemon de 1 GiB em `gru1`.
- A Vercel Queue é o único canal de entrada do Daemon, sem HTTP público.
- Os resultados e heartbeat ficam no Blob privado do mesmo projeto.

## Política de segurança

`OSINT_ENGINE_TOKEN`, `OSINT_ENGINE_QUEUE_ENABLED`,
`OSINT_WORKER_AUTHORIZED` e `BLOB_READ_WRITE_TOKEN` são variáveis
**da Vercel**, não strings do código. A implantação inicial deve usar
produção apenas nas três primeiras variáveis. Jamais copiar seus
valores para repositório, logs ou interface. O token administrativo
é informado pelo operador, no painel, a cada consulta.

A execução da CLI síncrona via HTTP permanece bloqueada
(`OSINT_ENGINE_EXECUTION_ENABLED` ausente/0). O motor precisa de
autorização por requisição, sem acesso anônimo à fila.
Antes de cada pedido deve existir consentimento e uso legítimo
de fontes públicas, respeitando privacidade e termos dos provedores.

## Custo e limites do Hobby

- 1 GiB de Daemon continuamente ligado consome 420 GB-h em
  aproximadamente **17,5 dias**. A Vercel pausa Daemons ao
  esgotar a franquia Hobby; não há cobrança adicional no Hobby.
- Heartbeat a cada 30 min consome ~1.440 escritas Blob/mês;
  2.000 operações avançadas mensais são incluídas no Hobby,
  deixando ~560 para resultados e outras gravações.
- Poll a cada 30s consome ~86.400 recebimentos/mês, dentro
  de 1.000.000 operações Queue mensais incluídas.
- Esses cálculos são estimativas; eventos de reinício e uso
  de outros recursos consomem a mesma franquia. Monitorar
  **Usage** e **Runtime Logs**. Para uso contínuo, estudar
  execução sob demanda ou outro worker econômico.
- Se falhar, escalar `osint-engines` para zero antes de
  investigar e manter as credenciais privadas.

## Critérios para considerar operacional

1. PR e builds Python/Docker aprovados; publicação Vercel `READY`.
2. Daemon em estado Running e publicação de heartbeat privado.
3. `GET /api/v1/system/readiness` retornando quatro
   indicadores detectados. Essa rota não prova uma consulta real.
4. Uma tarefa autenticada em `/api/v1/engines/jobs` com alvo
   de laboratório e resultado privado em `/api/v1/engines/jobs/{id}`.
5. Revisão do resultado, falsos positivos, tempo, cota
   e condições de licença de cada ferramenta.
6. Retenção/exclusão de dados, quotas por usuário, RBAC e
   idempotência distribuída antes da abertura multiusuário.

Não confundir passo 1/2/3 com passo 4.
