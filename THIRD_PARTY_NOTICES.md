# Dependências, ferramentas opcionais, marcas e licenças

O código-fonte novo da aplicação Protocolo OSINT V2 pertence à implementação deste projeto, com licença pública ainda em análise (`LICENSE-PENDING.md`). Nenhum código de terceiros deve ser apresentado como autoria original do projeto. Esta lista não substitui os avisos exigidos pelos respectivos pacotes, quando distribuídos.

## Dependências Python

FastAPI, Starlette, Pydantic, httpx, Uvicorn, Pillow, pytest e pytesseract (opcional). As dependências são instaladas por seus gerenciadores e continuam sujeitas às licenças de seus titulares; versões/manifesto em `backend/pyproject.toml` e `requirements.txt`. Antes da distribuição open source definitiva, validar licenças transitivas e gerar inventário de componentes (SBOM).

## Projetos de ferramentas opcionais — integração por comando, sem código incorporado

| Projeto | Repositório | Licença indicada pelo projeto |
|---|---|---|
| Sherlock | https://github.com/sherlock-project/sherlock | MIT |
| Maigret | https://github.com/soxoj/maigret | MIT |
| subfinder | https://github.com/projectdiscovery/subfinder | MIT |
| OWASP Amass | https://github.com/owasp-amass/amass | Apache 2.0 (componentes exigem verificação) |
| SpiderFoot | https://github.com/smicallef/spiderfoot | MIT |

**Não há cópias desses repositórios dentro da V2.** Os adaptadores somente constroem comandos para executáveis instalados pelo operador, com execução desativada por padrão e proibida na API hospedada. SpiderFoot consta no inventário, mas ainda precisa de serviço dedicado antes de funcionar. A obrigação de manter copyright e avisos permanece válida se bibliotecas ou partes desses projetos forem incorporadas no futuro.

## Referências visuais

- Sherlocker: https://brand.sherlocker.com.br/brandbook e https://brand.sherlocker.com.br/styleguide — consultados como referências de paleta, hierarquia visual e densidade. Não houve inclusão de marca, logo ou arquivos do Sherlocker.
- Apple: referência genérica a princípios de interface minimalista; não houve inclusão de marcas, assets ou textos proprietários.

O catálogo de 41 fontes é uma lista de **destinos externos** (links), sem parceria institucional e sem incorporação de software de fornecedores. A versão HTML original não foi importada devido à revisão pendente de procedência em `docs/IP_PROVENANCE.md`.


## Atualização da integração V0.5

A V2 referencia e pode instalar **Sherlock Project 0.16.2** (licença MIT, [licença e código oficial](https://github.com/sherlock-project/sherlock)) e **Maigret 0.6.6** (licença MIT, [licença e código oficial](https://github.com/soxoj/maigret)) via gerenciador pip. Isso não altera a titularidade dos projetos nem as obrigações de preservar os avisos de copyright/licença distribuídos nos respectivos pacotes e dependências transitivas.

O contêiner de referência `deploy/engines/Dockerfile` descreve a instalação de **subfinder** (MIT, https://github.com/projectdiscovery/subfinder), **OWASP Amass** (Apache-2.0; componentes podem ter licenças próprias, https://github.com/owasp-amass/amass) e **SpiderFoot** (MIT, https://github.com/smicallef/spiderfoot). Este contêiner ainda não foi construído, auditado ou hospedado em produção. A licença definitiva de **código original** da V2 permanece pendente.

**Retificação do texto anterior:** os adaptadores continuam independentes, mas a API pública agora apresenta inventário e possui uma rota de execução **bloqueada por padrão e protegida por chave no servidor**. A API não permite executar motores sem opt-in explícito. Não devem ser interpretados resultados de terceiros como confirmação de identidade.


## Módulos de imagens — V0.6

- **Tesseract.js v6.0.1** — Apache-2.0, https://github.com/naptha/tesseract.js, carregado sob demanda via CDN. Biblioteca, worker, runtime WASM e idiomas têm direitos e avisos próprios que precisam ser preservados na distribuição local futura.
- **Tesseract OCR** — https://github.com/tesseract-ocr/tesseract, Apache-2.0; motor subjacente usado pelo Tesseract.js.
- **imagededup** — https://github.com/idealo/imagededup, Apache-2.0; avaliado para serviço futuro, não instalado nesta revisão.
- **Google Cloud Vision** — serviço externo licenciado, sujeito aos termos e cobrança do Google; integrações usam a API oficial de Web Detection, não código copiado ou scraping.

Não se atribui autoria de dependências externas ao Protocolo OSINT. Os avisos legados e a auditoria de procedência continuam pendentes.


## v0.8 — SDKs e Daemon

- `mcp==2.3.0`, SDK oficial da Model Context Protocol (MIT), https://github.com/modelcontextprotocol/python-sdk.
- `vercel-queue==0.10.0` e `vercel-blob==0.5.1`, SDKs Vercel publicados separadamente, sujeitos aos respectivos avisos/licenças e termos de plataforma.
- O contêiner `deploy/engines/Dockerfile.daemon` obtém versões oficiais fixadas de Sherlock, Maigret, subfinder, Amass e SpiderFoot no build, sem apagar autores. Compilações e caches externos não são autoria original do Protocolo OSINT. Gerar SBOM/avisos completos antes de distribuir imagens.
