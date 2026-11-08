# Integrações — v0.4

## Conectores HTTP do backend hospedado

| Fonte | Método | Status | Dados | Credenciais |
|---|---|---|---|---|
| Cloudflare DNS-over-HTTPS | GET fixo `/dns-query`, tipos A, MX e NS | Implementado; upstream não comprovado live | registros públicos | não |
| crt.sh | GET fixo `/?q=%.<domain>&output=json` | Implementado; upstream não comprovado live | nomes presentes em certificados públicos | não |
| GitHub REST | GET fixo `/users/{name}` | Implementado; upstream não comprovado live | perfil público resumido | não |

O endpoint `POST /api/v1/lookup` só aceita `dns`, `certificates`, `github` com entradas validadas. Nenhuma URL externa arbitrária é requisitável. `follow_redirects=False`, HTTPS obrigatório, tempo máximo de 4 s por upstream e resposta limitada a 260 KB; no máximo 3 consultas sequenciais por pedido (DNS). É preciso distinguir **implementado e testado com mocks** de **validado ao vivo**. Respostas de terceiros são não confiáveis e possuem falsos positivos/ausência de informação.

Antes de escalar o uso público: monitoramento, rate limiting distribuído, limites do provedor, termos de uso e controles antiabuso. Não foi configurado armazenamento de resultados.

## Motores de projetos de código aberto opcionais — apenas local/worker dedicado

| Projeto | Licença declarada | Modo de integração | Estado |
|---|---|---|---|
| [Sherlock](https://github.com/sherlock-project/sherlock) | MIT | processo local, query username | adaptador implementado, CLI não instalado/testado live |
| [Maigret](https://github.com/soxoj/maigret) | MIT | processo local, query username | adaptador implementado, CLI não instalado/testado live |
| [subfinder](https://github.com/projectdiscovery/subfinder) | MIT | processo local, descoberta passiva DNS | adaptador implementado, CLI não instalado/testado live |
| [OWASP Amass](https://github.com/owasp-amass/amass) | Apache 2.0 (ver componentes) | processo local com `-passive` | adaptador implementado, CLI não instalado/testado live |
| [SpiderFoot](https://github.com/smicallef/spiderfoot) | MIT | necessita serviço isolado | referenciado em inventário, execução não implementada |

Os adaptadores encontram-se em `backend/src/protocolo_osint/local_engines.py`. Somente são executados quando `OSINT_ENABLE_LOCAL_ENGINES=1` e o executável existe, em modo de usuário único e fora da API pública. Processo chamado com lista de argumentos, sem shell, timeout, tamanho da saída limitado; a execução das ferramentas externas real ainda não foi testada. Dados coletados exigem verificação por fonte, finalidade legítima e cumprimento de licença e ToS.

**Não há código de terceiros incorporado e os projetos não são apresentados como de autoria do Protocolo OSINT.** O registro de atribuições permanece em `THIRD_PARTY_NOTICES.md`.

## Bloqueios intencionais na versão pública

- Casos e evidências: sem multiusuário, autenticação e banco seguro, não expor SQLite.
- Upload de imagens: navegador calcula SHA-256/dHash sem enviá-las a terceiros.
- OCR de servidor: requer Tesseract/worker adequado e quotas.
- MCP remoto: exige autenticação e autorização de ferramentas.
- SpiderFoot completo, Sherlock/Maigret em escala e Amass: worker/container de longa duração, fila e controle de custos.
