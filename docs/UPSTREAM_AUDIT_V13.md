# Auditoria dos cinco projetos OSINT enviados — 2026-11-08

## Escopo e limitações

Os cinco arquivos ZIP originais foram abertos e conferidos quanto à estrutura,
README, licença, dependências e documentação de uso. Os hashes abaixo são dos
arquivos **recebidos** (não equivalem a um commit Git confirmado).
Nenhuma investigação remota foi executada a partir desses arquivos.
Não foram copiadas árvores inteiras dos cinco projetos ao repositório da V2.

| ZIP recebido | SHA-256 do ZIP | Manifesto na captura | Instalação usada pelo worker |
|---|---|---|---|
| sherlock-master.zip | `2097bbbc178d28984b6821431bf53f4dc5477042fa28f99ce70f0c125077e47d` | Poetry 0.16.2, Python >=3.9, MIT | `sherlock-project==0.16.2` |
| maigret-main.zip | `1bff312a77ffe2463305e814709f7ea4fc02b17b4b82fd9751624c45ebfb8ddd` | Poetry 0.6.6, Python >=3.10, MIT | `maigret==0.6.6` |
| subfinder-dev.zip | `85c73d07197ffd22b910dcbdbb350f7e6d34d2002b84dea3d5c103ac31bed99a` | Go 1.26.10; branch dev; MIT | `github.com/projectdiscovery/subfinder/v2/cmd/subfinder@v2.9.0` |
| amass-main.zip | `a8a81c9043bb40aeeb96f926467306baa17aad7aa7b11476e5e66e450f9abeeb` | Go 1.27.3; branch main; Apache-2.0 | `github.com/owasp-amass/amass/v5/cmd/amass@v5.0.1` |
| spiderfoot-master.zip | `c6ee64895c9f52da25fb8ebbbd208baf1762a870b22678d09354045a9dadfbbf` | README 4.0, Python 3.7+, MIT | SpiderFoot tag `v4.0`, commit verificado no Dockerfile |

## Compatibilidade de execução

- **Sherlock:** o README de pacote documenta o comando `sherlock`,
  `--site`, `--timeout`, `--print-found` e `--no-color`. A V2
  usa três sites delimitados e username único.
- **Maigret:** README recomenda `pip install maigret`, Python >=3.10,
  e modo CLI ou biblioteca. O worker limita conexões, sites e recursão.
  Recursos como IA, proxies, bypass de bloqueios e web UI não foram
  habilitados automaticamente.
- **subfinder:** README de dev documenta `-d`, `-silent`,
  `-timeout`, `-max-time` e `-max-results`. Parte dos provedores
  requer API key; sem credenciais algumas fontes não retornam dados.
  A captura dev pode diferir do release `v2.9.0` fixado, que foi
  construído na CI anterior.
- **OWASP Amass:** ZIP main exige Go 1.27.3, diferente do release
  `v5.0.1` instalado com Go 1.26 no contêiner de referência.
  Não trocar automaticamente de branch: preservar versão verificada
  em CI até compatibilização e teste. Usar modo passivo.
- **SpiderFoot:** README documenta modo CLI; em `sf.py` foi verificado
  que `-u passive`, `-o json` e `-max-threads` existem.
  O upstream `requirements.txt` apresenta faixas legadas incompatíveis
  com outras bibliotecas do worker, já tratadas na cópia de instalação
  do Dockerfile.daemon. A versão real instalada requer testes integrados.

## Arquitetura de projeto único

O site publica sua API FastAPI e interface; o Daemon usa a **mesma aplicação
Vercel** e uma imagem isolada que instala os cinco pacotes de upstream como
dependências. A camada comum de comandos fica em
`backend/src/protocolo_osint/engine_worker_runtime.py`; a fila e o Blob
privado ficam em `engine_queue.py`. A interface não precisa carregar
cinco aplicações web distintas.

**Distribuição:** MIT exige preservar copyright e licença; Apache-2.0
exige os avisos aplicáveis, inclusive de componentes transitivos. Não
retirar `THIRD_PARTY_NOTICES.md` nem os avisos incluídos nas dependências.

## Orçamento Hobby e segurança

Consulta à documentação oficial em 2026-11-08:

- Vercel Blob Hobby inclui **2.000 operações avançadas/mês**.
  Heartbeat antigo a cada 60 segundos consumiria ~43.200 operações/mês,
  excedendo a franquia em aproximadamente 33 horas; foi alterado para
  30 minutos (~1.440 operações/mês, antes dos resultados e demais writes).
- Fila consulta a cada 30 segundos, em vez de 2, reduz consumo de
  ~1.296.000 para ~86.400 operações de polling/mês;
  o plano Hobby inclui 1.000.000 operações/mês (sujeito a outros usos).
- A tolerância a heartbeat é **50 minutos**. Isso indica presença
  aproximada, não prova serviço ativo nesse segundo e não autoriza
  consultas sem credencial.
- Daemons em Hobby têm cota de **420 GB-horas de memória provisionada/mês**
  e **5 horas de CPU ativa** no beta. Uma instância contínua de 1 GiB
  chega ao limite após ~17,5 dias; não é operação 24/7 sustentável no
  plano gratuito. Não ligar instâncias permanentes por padrão.
- A reentrega at-least-once agora verifica se o resultado já está no
  Blob antes de iniciar o CLI novamente. Continua existindo risco de
  corrida entre duas entregas simultâneas, exigindo lock/lease e
  quota por operador antes de tornar o serviço multiusuário.

## Validação e passos pendentes

A leitura de ZIPs é uma **validação documental e estática**. Smoke tests
do Docker verificam instalação/CLI sem consulta investigativa real.
Antes da ativação permanente: controle de acesso, cotas e isolamento,
configuração de daemon e Queue, teste de fim-a-fim com alvos próprios de
laboratório, logs, retenção do Blob e monitoramento das quotas.
As flags continuam desligadas até isso ser cumprido.

Fontes oficiais:
- https://vercel.com/docs/queues/pricing
- https://vercel.com/docs/vercel-blob/usage-and-pricing
- https://vercel.com/docs/daemons/limits
- https://vercel.com/docs/daemons
