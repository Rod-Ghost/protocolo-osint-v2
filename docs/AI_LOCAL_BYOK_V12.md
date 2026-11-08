# Assistente opcional: Ollama local + API própria (v1.2)

## Princípio: nenhuma assinatura ou API paga obrigatória

O sistema de investigação, cofre AES-GCM, catálogo, hash, grafo, análise de arquivos e relatórios não dependem da contratação de um provedor de IA. O painel **IA opcional** inicia em **Roteiro metodológico offline**: checklist determinístico sem LLM, requisição de rede ou custo. Não confundir o checklist com uma resposta gerada por IA.

## Modos disponíveis

| Modo | Requisito | O que acontece |
|---|---|---|
| Offline | Nenhum | Gera checklist fixo e prompt reutilizável; 0 chamadas externas |
| Ollama local | Ollama OSS + modelo escolhido, instalados e executando no computador | Requisição direta do navegador a http://127.0.0.1:11434/v1/chat/completions |
| API compatível (BYOK) | Endpoint HTTPS /chat/completions, modelo e chave própria se exigida | Requisição direta do navegador ao provedor configurado, **não à Vercel** |

Ollama fornece API compatível com Chat Completions no endpoint local /v1/chat/completions; modelos têm licenças distintas e o usuário deve conferir as licenças de cada modelo. Um servidor local precisa ter o modelo previamente baixado. A plataforma **não instala modelos** nem hospeda modelos na Vercel.

## Segurança de credenciais e dados

1. Não existe chave de IA padrão, variável Vercel de chave de IA ou proxy público para inferência.
2. A chave digitada só permanece em memória do formulário durante uma requisição explicitamente autorizada; o campo é limpo após confirmar. Nunca persiste em localStorage, cookies, banco SQLite, cofre, servidor, telemetria ou GitHub.
3. Nenhum caso do cofre criptografado ou documento é coletado pelo painel. **Somente o texto manualmente digitado** é enviado ao endpoint escolhido, após uma confirmação mostrando o domínio de destino.
4. Não inserir dados sigilosos, tokens ou informações pessoais identificáveis no texto, especialmente ao utilizar provedores externos.
5. A segurança da chave depende também do navegador, extensões, scripts presentes na página e do provedor. Evitar credenciais administrativas, preferir chaves de escopo limitado e uso descartável. Uma API no navegador pode ser incompatível com a política de CORS do provedor.
6. O adaptador proíbe HTTP remoto, URL com usuário/senha/query/fragmento e redirecionamentos; só aceita HTTPS terminado em /chat/completions. HTTP local só é permitido com o endereço fixo do Ollama.
7. Nenhuma ferramenta, shell, busca ou motor externo é executado automaticamente por respostas do modelo. Saídas renderizadas apenas como texto (textContent) e limitadas a 20.000 caracteres.
8. Limite de entrada: 6.000 caracteres; resposta HTTP: 100 KiB; tempo limite: 45 s na UI. Não há histórico persistente da conversa.

## Privacidade, CORS e navegadores

Por ser um cliente direto de navegador, **não é garantido** que a API do provedor aceite CORS ou conexões de um site HTTPS. Acesso de uma página hospedada a um Ollama local também pode exigir permissão do navegador e configuração de CORS no serviço local. O CSP do projeto permite somente as origens de loopback da porta 11434 e destinos HTTPS; não abre HTTP genérico.

Se a requisição falhar por CORS, o modo offline continua disponível. Em instalações locais pode-se configurar o Ollama para permitir apenas a origem confiável do projeto; **não usar origens curinga de forma indiscriminada**. Não abrir serviços Ollama para a internet pública sem autenticação.

## Limitações funcionais

- Somente a API compatível `POST /v1/chat/completions` sem streaming; não há suporte direto a Anthropic Messages, Google Gemini ou outros protocolos distintos nesta versão.
- Requisições externas podem ter custos definidos pelo próprio fornecedor e ficam sob controle do usuário.
- O checklist offline é um método estruturado, NÃO inferência por LLM.
- Nenhuma comparação semântica, validação de fatos, consulta a fontes ou detecção de erros da IA é automática.
- Não há execução de agentes ou prompt com leitura automática de evidências; integração de IA com casos exige autenticação, revisão e limites específicos.
- O mecanismo local pode usar CPU/GPU e disco do dispositivo do usuário, mesmo sem custos de API.

## Referências

- Ollama documentação oficial: https://github.com/ollama/ollama/blob/main/docs/api/openai-compatibility.mdx
- Ollama API local: https://github.com/ollama/ollama/blob/main/docs/api/introduction.mdx
- MDN local network access: https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access

## Validação

`node tests/test-ai-bridge.cjs` verifica modo offline sem rede, endpoint HTTPS, URL inválida, corpo de requisição sem ferramenta, auth por sessão, resposta incompatível e retorno de erros sem refletir tokens. GitHub CI também verifica sintaxe JS de origem e cópia publicada e política CSP da API FastAPI. Não foram executadas consultas reais a modelos ou provedores externos.

Próximas evoluções sem custo de API: análise de casos no cofre sem transmissão, seleção de fontes e evidências locais por usuário, busca lexical local, grafo persistente no vault, exportação melhorada, alertas locais opt-in. Agentes remotos e provedores pagos permanecem opcionais.
