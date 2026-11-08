# V1.6 — Plataforma Vercel com pesquisa assíncrona, sem token digitado

## Objetivo
O site continua aberto para catálogo de fontes, consultas públicas existentes,
OCR, análise de imagens, cofre criptografado e documentação de casos.
Para o processamento hospedado de motores, o operador usa Entrar com GitHub
uma vez e não vê nem digita chaves de execução.

Não foram adicionados Cloudflare, Supabase nem sincronização de casos.
O cofre de evidências continua criptografado no navegador de cada dispositivo.
O backend local FastAPI continua independente.

## Busca integrada
- Username: Sherlock e Maigret.
- Domínio: subfinder, Amass e SpiderFoot; SpiderFoot pode ser desmarcado.
- Seleção individual permite qualquer um dos cinco motores.
- A ação de pesquisar é explícita; digitação não gera tráfego externo.
- POST /api/v1/operator/search valida CSRF, usuário e alvos, e envia até três
  tarefas com vinculação ao ID do operador na Vercel Queue.
- GET /api/v1/operator/jobs/{job_id} só devolve resultado do mesmo operador
  lido do Private Blob. Tarefas legadas sem dono não são expostas nessa rota.
- O navegador acompanha os estados a cada 15 segundos, quando visível, sem
  inventar resultados nem realizar downloads automáticos.
- Os resultados dos motores ficam temporariamente no Private Blob; casos e
  anotações permanecem somente no cofre local do navegador.

## Login GitHub — configuração única necessária
O público pode usar catálogo, imagens locais e pesquisa manual sem login.
A execução hospedada exige uma conta autorizada, para não permitir abuso do
Daemon compartilhado e consumo ilimitado da conta Vercel.

O servidor implementa OAuth 2.0 Authorization Code com PKCE S256, state e
cookies assinados Secure/HttpOnly/SameSite Lax. Uma sessão dura até 8 horas.
Não salva token de acesso GitHub. Os POSTs usam verificação de Origin e CSRF.
A autorização usa uma lista de IDs numéricos GitHub explícita.

Configuração de produção que ainda precisa ser realizada:
1. Em https://github.com/settings/developers cadastrar uma OAuth App.
   Homepage: https://protocolo-osint-v2-nine.vercel.app
   Callback: https://protocolo-osint-v2-nine.vercel.app/api/v1/auth/github/callback
   A aplicação não solicita escopos de acesso a repositórios.
2. Na Vercel, configurar Environment Variables apenas em Production:
   OSINT_GITHUB_CLIENT_ID = Client ID fornecido pelo GitHub
   OSINT_GITHUB_CLIENT_SECRET = segredo do GitHub (encrypted)
   OSINT_SESSION_KEY = segredo aleatório de pelo menos 32 caracteres (encrypted)
   OSINT_ALLOWED_GITHUB_IDS = IDs numéricos dos operadores (separados por vírgula)
   OSINT_PUBLIC_ORIGIN = https://protocolo-osint-v2-nine.vercel.app
3. Revisar Preview e CI e realizar redeploy de produção.
4. Abrir Motores de Pesquisa > Entrar com GitHub.

Sem essas variáveis, o backend falha fechado: ninguém pode executar motores
pela nova interface. As conexões GitHub do ChatGPT e OIDC da Queue são
diferentes da autenticação da aplicação; não fornecem uma sessão web.

## Imagens
Hash SHA-256, dHash, OCR e comparação entre imagens continuam no navegador.
Há links para Lens e TinEye, com upload manual e consentimento. Busca
automática de imagens por Google Vision Web Detection depende de uma API
externa já configurada com GOOGLE_CLOUD_VISION_API_KEY e
OSINT_REVERSE_ENABLED=1. Não ligar sem aprovação de custos, quota e privacidade.
Na ausência desses serviços, a interface informa que a busca externa não
está disponível e não simula resultados.

## Segurança e custos
- Rotas legadas com token continuam protegidas para compatibilidade, mas
  a nova interface nunca solicita OSINT_ENGINE_TOKEN ao usuário.
- Daemon executa consultas passivas e limitadas por tempo, sem shell; os
  resultados não confirmam automaticamente titularidade ou identidade.
- Não permitir uso anônimo ilimitado da fila pública. Para operação
  multiusuário, acrescentar limite distribuído por usuário e configurar
  política de rate limiting no Firewall da Vercel.
- Plano Hobby pode ter limite mensal de instância e operações Queue/Blob;
  o heartbeat e o status Ready não são comprovação de pesquisas reais.

## Testes e homologação
Testes simulados: backend/tests/test_hosted_operator_v16.py, pytest geral,
Node syntax, checks de procedência e imagem Docker.
Homologação externa ainda necessária: configurar OAuth, login autorizado,
submissão de um username/domínio de laboratório, recebimento de job IDs,
gravação de resultados reais no Blob privado, consulta com mesma sessão,
recusa para outras contas e validação de cotas.
