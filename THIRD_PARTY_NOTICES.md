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
