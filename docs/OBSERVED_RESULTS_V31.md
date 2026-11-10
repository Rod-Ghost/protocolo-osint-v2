# V3.1 — Resultados observados no próprio Protocolo OSINT

## Necessidade
O fluxo anterior gravava apenas **consultas planejadas**. Links preparados não mediam fontes, retornos, falhas, autenticidade ou descobertas. O operador precisava clicar nas fontes uma por uma e não dispunha de PDF com registros reais.

## Solução incremental
Na Etapa 4 do construtor, a área **Resultados no próprio sistema** permite:
1. **Consultar fontes públicas**: uma autorização explícita executa até 2 consultas ao backend existente `POST /api/v1/lookup`, diretamente na interface, em paralelo. O backend, e não o navegador, fala com hosts externos allowlisted.
2. **Ampliar com motores autorizados**: após login GitHub e consentimento explícito, reutiliza `POST /api/v1/operator/search` e `GET /api/v1/operator/jobs/{job_id}` com sessão/CSRF existente. Somente 1–3 trabalhos limitados segundo o roteamento do backend; resultados podem ficar pendentes se o daemon não processar. Consulta de status é limitada e pode ser atualizada manualmente.
3. **Resultados por fonte**: exibe quantidade **de registros devolvidos** (não o total da Internet), listagem, origem, status e links HTTPS clicáveis para verificação pelo operador. Falhas são diferentes de retorno vazio e pendência.
4. **Baixar PDF**: arquivo local de verdade, sem enviar o conteúdo a nenhum serviço de geração de PDF. Inclui alvo, horário, estados, contagens observadas, registros retornados, advertências e anotações clicáveis de links HTTPS.
5. **Salvar resultados no cofre (opcional)**: grava um snapshot AES-GCM no campo adicional `investigation_runs` do caso (mesmo esquema 1; campos originais preservados). Relatórios podem ser reabertos e exportados novamente em **Meus casos → Resultados**. O salvamento continua exclusivamente local e explicitamente iniciado.

## Cobertura factual por critério
| Critério | Consulta pública suportada | Semântica |
| --- | --- | --- |
| Domínio | DNS A/MX/NS da Cloudflare, CT via crt.sh | Máximo 40 registros DNS e 25 registros CT; não exaustivo |
| Username | API pública GitHub, se username for compatível | Presença do perfil naquele provedor, sem provar identidade |
| URL HTTPS | Apenas domínio extraído para DNS e CT | Não acessa o URL completo e não examina conteúdo da página |
| Nome completo, digitado em texto livre | Busca pública de usuários por nome exibido via GitHub Search (até 10 candidatos) | São perfis candidatos; não comprova que pertencem à pessoa investigada; API sem autenticação pode limitar 10 requisições/minuto |
| E-mail, IP ou texto que não seja nome | Sem provedor fixo automático nesta etapa | Não exibe zero fictício; motores opcionais conforme autorização e capacidade real |
| Motores | Sherlock, Maigret, subfinder, Amass, SpiderFoot conforme roteamento | Saída técnica do worker não verificada; pode falhar ou ficar pendente |

DNS, CT e busca por username já existiam no backend. Para nomes completos, foi adicionada uma consulta restrita e documentada à API oficial de pesquisa de usuários do GitHub, sem token, sem scraping e com limite de 10 retornos. Nenhum motor novo nem conta paga foi introduzido. O backend continua com destinos HTTPS fixos e sem URL arbitrária. A pesquisa de nomes está sujeita aos limites oficiais do GitHub e pode retornar 403/429, reportados como falha, não ausência de perfis. A busca por nome próprio no GitHub é limitada a candidatos públicos desse provedor; investigações mais amplas de pessoas exigem outros provedores homologados ou motor autorizado e operacional.

## Proveniência, segurança e privacidade
- O PDF não significa laudo ou prova de autoria. Preserva o status, fonte, horário devolvido pelo provedor e os registros da API, dentro do limite.
- Respostas retornadas `no_result` significam **zero registros devolvidos naquela requisição**, não inexistência da pessoa/ativo; respostas falhadas têm contagem desconhecida.
- Dados de investigação e arquivos PDF podem ser sensíveis. O PDF não é criptografado e deve ser compartilhado com cuidado.
- O operador determina quando consultar fontes externas, acionar Daemon e salvar no cofre; nenhuma pesquisa acontece só por digitar.
- O cofre criptografa o snapshot por caso; máximo 20 relatórios por caso, 10 fontes por relatório e 95 KB de texto por snapshot; falha de gravação restaura o estado anterior.
- Relatórios não armazenam tokens, sessão GitHub ou credenciais; a autenticação de motores continua exclusivamente na infraestrutura existente.

## Validação
- Node: `tests/test-investigation-report.cjs` comprova contagens reais, estados distintos, normalização, integridade estrutural do PDF e link PDF.
- Chromium: `tests/browser-observed-results.cjs`, com endpoints artificiais (sem tráfego de OSINT real), percorre investigação guiada, consulta DNS/CT, motor autenticado fictício, PDF baixado, persistência no cofre, modo mobile, reload e reabertura dos registros.
- Reexecutar CI backend, frontend, regressões Chromium preexistentes, Preview Vercel e produção **somente após CI e revisão**.
- Não declarar motores ou provedores externos reais “funcionais e validados” com base em mocks. Isso requer um teste operacional autorizado e observado em ambiente real.

## Próxima expansão
- Corrigir e verificar operacionalmente daemon/queue heartbeat e executar um job real consentido (sem depender do simples status READY).
- Adicionar provedores oficiais para tipos não cobertos, com consentimento, limites, autenticação, licença, custódia e testes de integração reais.
- Ampliar os modelos de dados e grafo para correlação de resultados revisados antes de concluir alegações sobre pessoas.
