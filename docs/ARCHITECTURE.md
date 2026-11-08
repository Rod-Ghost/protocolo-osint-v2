# Arquitetura v0.2.0

## Princípios

- **Local-first e sem dependências JavaScript externas** para permitir teste imediato.
- API FastAPI acessível por padrão somente a `127.0.0.1`, sem recursos administrativos remotos.
- Catálogo de fontes declarativo e versionado: URLs de consulta construídas offline, com abertura externa iniciada pelo operador.
- Armazenamento SQLite local com chaves estrangeiras e índice de imagem delimitado ao mesmo caso.
- Nenhum componente de terceiros é copiado dentro do repositório original; bibliotecas Python e pacotes são dependências gerenciadas por licença própria.

## Componentes

| Camada | Responsabilidade | Arquivos |
|---|---|---|
| UI | Painel responsivo, pesquisa, casos, imagens, grafos e status | `apps/web/index.html`, `apps/web/assets/*` |
| API | Validação de entrada, endpoints e políticas de resposta | `backend/src/protocolo_osint/main.py` |
| Catálogo | 41 fontes, 12 categorias, preparação de links HTTPS | `catalog.py` |
| Tipagem | Detecta entrada fornecida pelo usuário | `detection.py` |
| Persistência | Casos, anotações, hashes e relações | `store.py` |
| Imagens | MIME pelo conteúdo, limite de tamanho e pixels, SHA-256, dHash e OCR | `media.py` |
| MCP | Adapter JSON-RPC stdio (somente leitura) | `mcp_stdio.py` |

## Fluxos de dados

1. UI envia termo ao endpoint `/api/v1/search/plan`.
2. Backend classifica sem rede e devolve fontes com URLs geradas.
3. Operador pode optar por abrir provedores externos no seu navegador.
4. Registro de fonte em caso armazena somente o metadado inserido e hash do registro.
5. Upload de imagem é lido somente na memória e descartado; se houver `case_id`, hashes/metadados são indexados.
6. Mapa de vínculos somente liga referências ao seu caso de origem.

## Limites

O sistema **não é** multiusuário, não garante cadeia de custódia judicial e não faz reconhecimento facial, coleta automática da web nem busca reversa global. Para produção multiusuário serão necessários autenticação, autorização, migrations, API limits, observabilidade e tratamento adicional de dados pessoais.

## Complemento v1.1

backend/src/protocolo_osint/custody.py mantém diário de metadados por caso em SQLite sem alterar o esquema original. case_reports.py cria relatórios PDF/DOCX/Markdown em memória usando extras opcionais. main.py limita rotas de casos ao loopback. hosted_api.py continua sem SQLite. A interface gera relatórios Markdown diretamente do cofre AES-GCM já existente, sem enviar os dados. Criptografia de banco, ancoragem externa e autenticação por operador permanecem pendentes.
