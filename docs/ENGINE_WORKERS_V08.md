# Protocolo OSINT V2 — integração isolada de cinco motores (v0.8)

## Inventário de código, proveniência e testes

O runtime de Daemon é **um componente separado** do backend HTTP do Protocolo OSINT, mas pertence ao mesmo repositório e pode fazer deploy no mesmo projeto Vercel quando a configuração for explicitamente ativada. As ferramentas de terceiros são instaladas no **build** da imagem oficial com versões fixadas; seus autores, direitos e licenças são preservados. Não há cópia de repositórios inteiros para dentro da árvore de fontes da V2.

| Projeto | Fonte | Versão no build | Licença | Política de execução |
|---|---|---|---|---|
| Sherlock | https://github.com/sherlock-project/sherlock | 0.16.2 | MIT | Três fontes por consulta, sem autenticação automatizada |
| Maigret | https://github.com/soxoj/maigret | 0.6.6 | MIT | 20 fontes, limite de conexões, sem recursão |
| subfinder | https://github.com/projectdiscovery/subfinder | v2.9.0 | MIT | Fontes passivas, domínio único |
| OWASP Amass | https://github.com/owasp-amass/amass | v5.0.1 | Apache-2.0* | Enumeração **-passive**, uma tarefa isolada |
| SpiderFoot | https://github.com/smicallef/spiderfoot | v4.0 | MIT | Perfil **-u passive**, poucos workers |

*Amass possui componentes com licenças próprias. Revisar distribuição e inventário SBOM antes de publicar imagens para terceiros.*

## Componentes implementados

- `backend/src/protocolo_osint/engine_worker_runtime.py`: comandos predefinidos, validados, sem `shell=True`, limites de duração e saída, contexto temporário; resultados sem confirmação automática de identidade.
- `backend/src/protocolo_osint/engine_queue.py`: envio autenticado de tarefas à Vercel Queue, idempotência por UUID, recebimento em loop em um daemon e gravação de resultados em Private Vercel Blob.
- `deploy/engines/Dockerfile.daemon`: instalação automática das cinco ferramentas a partir dos upstreams; não expõe portas públicas.
- `deploy/engines/vercel-daemons.example.json`: exemplo para Daemons beta, deliberadamente não aplicado ao `vercel.json` de produção sem broker, storage e autenticação configurados.
- `.github/workflows/engine-supply-chain.yml`: build Docker e smoke test das cinco ferramentas, sem varredura.

## Segurança e pré-requisitos operacionais

A fila é habilitada somente depois de existir um **usuário administrador autenticado por requisição**; jamais usar flag global como substituto da autenticação. Os workers não recebem credenciais de terceiros automaticamente, e os termos/limites de sites devem ser respeitados. O consumidor precisa de Vercel OIDC com permissões de Queue, Private Blob com autenticação e políticas de retenção/limpeza. Criar a Private Blob store no projeto correto e testar os identificadores antes de alterar produção. Daemons é uma funcionalidade beta **com instâncias contínuas e potencial de cobrança**.

`OSINT_ENGINE_QUEUE_ENABLED` é zero por padrão. `OSINT_WORKER_AUTHORIZED=1` apenas na imagem privada dedicada. Não publicar `BLOB_READ_WRITE_TOKEN`, sessão do usuário ou tokens de fontes. Os resultados são sensíveis e só podem ser lidos depois de verificar o proprietário/escopo do job.

**Estado de validação:** os testes locais com runner simulado cobrem cinco comandos e gravação privada; ainda não são um build Docker completo nem prova de varredura real. O job de CI de supply chain executa o build quando acionado pelo GitHub. Manter a atualização em branch de preview até o build confirmar que as cinco ferramentas iniciam.


## Compatibilidade verificada durante builds reais em CI

- SpiderFoot 4.0 possui pinagens antigas incompatíveis com PyYAML moderno em Python >=3.11. A imagem usa Python 3.11 e cria `requirements-upstream.txt` **inalterado**, aplicando alterações apenas à cópia de instalação: PyYAML 6, cryptography 41–45, pyOpenSSL 24–25, NetworkX 2.8–3.2 e lxml 6 para compatibilidade com Maigret. São **adaptações que exigem teste de regressão**: uma instalação bem-sucedida não garante execução do SpiderFoot.
- OWASP Amass v5.0.1 e subfinder v2.9.0 são compilados com Go 1.26. Go 1.27 ativou mudanças em JSON v2 que quebram módulos antigos, identificadas pelo check de imagem. As versões devem permanecer fixadas até atualização auditada.
- Imagem de CI é construída e os cinco comandos são verificados com `--help`/`--version`, **sem consulta real**; os cinco motores só estarão operacionais após autorização, conexão de fila e storage privado, lançamento de daemon e teste de coleta com alvos de laboratório.
- Erros de instalação foram observados na CI e corrigidos iterativamente; não definir `daemons` no arquivo de produção antes da validação do contêiner e do custo/identidade.
