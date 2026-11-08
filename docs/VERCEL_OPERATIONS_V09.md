# Operação Vercel — revisão 0.9

## Estado da integração

A versão 0.8.1 foi publicada em produção, porém a integração da Vercel acessível ao ChatGPT apresenta erro 403 ao operar no workspace rodrigo11. O pedido de autorização automática desse workspace devolveu 404. O repositório GitHub continua acessível e CI/CD Vercel automatizado via GitHub está operacional. Não criar projetos adicionais fora do workspace certo.

## Mudanças desta revisão

1. Publicador e consumidor da Vercel Queue usam explicitamente região gru1 e namespace ALL_DEPLOYMENTS.
2. A API /api/v1/system/readiness apresenta apenas estados booleanos e textos não sensíveis; nenhum segredo é retornado.
3. Engine Studio mostra um painel com quatro indicadores reais, inclusive o último heartbeat.
4. O envio de tarefas só é habilitado quando existe flag de fila, autenticação configurada, vínculo Blob e heartbeat recente.
5. Testes CI executam também o contrato dos pacotes vercel-queue 0.10.0 e vercel-blob 0.5.1.

## Pendências operacionais

- Conta Vercel rodrigo11 autorizada para o app do ChatGPT.
- Blob Private criado e conectado nesse projeto.
- Daemon Vercel iniciado no projeto correto e conectado ao Queue/Blob.
- Identidade de usuários e RBAC, quota de consultas, rate limiting e custos aprovados.
- Execução real dos cinco motores com domínios e identificadores de laboratório autorizados.
- Observabilidade, idempotência robusta para reentrega de filas, retenção e rastreabilidade dos resultados.
- Revisão das licenças e direitos do sistema legado.

O build da Vercel e o reconhecimento dos cinco executáveis no Docker CI não constituem demonstração de consultas investigativas em produção. Evitar habilitar flags antes de verificar identidade, custo e testes de rede.

## Referências oficiais

https://vercel.com/docs/queues
https://vercel.com/docs/queues/poll-mode
https://vercel.com/docs/vercel-blob/private-storage
https://vercel.com/changelog/vercel-daemons-is-now-in-public-beta
