# V1.7 — Tipos de pesquisa, compatibilidade e correções dos motores

## Problemas reproduzidos pelo operador

- `subfinder v2.9.0`: flag inexistente `-max-results` provocava falha antes
  de gerar resultados. Foi substituída por `-rl 5` (limite de requisições/seg),
  mantendo timeout e limite de tamanho de resultado do worker.
- `rod.roldan`: um identificador com ponto era classificado como domínio,
  iniciando subfinder, Amass e SpiderFoot como `INTERNET_NAME`.
  A classificação automática agora distingue nomes de usuário com pontos;
  o seletor explícito do tipo permanece disponível para ambiguidades.
- `Amass pending`: resultado ainda não persistido no Private Blob. É
  compatível com fila/worker serial e prazo do motor, **não comprova**
  execução bem-sucedida nem falha. O estado pendente não é tratado como
  conclusão; resultados reais precisam ser validados.
- Caixa de inclusão do SpiderFoot estava oversized em alguns navegadores.

## Matriz de compatibilidade hospedada

| Motor | Alvos aceitos pela integração | Modo |
|---|---|---|
| Sherlock | Username público | CLI com três fontes e timeout |
| Maigret | Username público | CLI com fontes/conexões limitadas |
| subfinder 2.9.0 | Domínio público (ou hostname extraído de URL) | Passivo, timeout e rate limit |
| OWASP Amass 5.0.1 | Domínio público (ou hostname extraído de URL) | Passivo, execução durável |
| SpiderFoot 4.0 | Username, domínio, e-mail, IP público, CIDR IPv4 pequeno, ASN, telefone internacional, nome, endereço Bitcoin | `-u passive`, saída JSON, 2 threads, execução durável |

A versão oficial do SpiderFoot oferece outros modos e módulos, mas **não**
ativamos varredura ativa, todos os módulos nem acesso a APIs pagas por padrão.
O sistema não encaminha comandos livres do usuário a nenhum subprocesso.

### Detecção e controle

O operador pode deixar o tipo em Automático ou escolher explicitamente.
A entrada `rod.roldan` é tratada como username no modo automático, mas
a extensão de domínio desconhecida pode exigir seleção manual. Uma URL
HTTPS/HTTP é validada e **somente o domínio** é entregue aos motores; não
é uma varredura do caminho nem download de páginas.

Um username com pontos é passado ao SpiderFoot como argumento
literalmente entre aspas, para que `sf.py` o classifique como USERNAME em
vez de INTERNET_NAME; nome de pessoa com espaço recebe tratamento igual.
Dados de e-mail, telefone ou nome só são enviados a fontes externas quando
o operador inicia conscientemente uma consulta.

IP e CIDR devem ser públicos; endereços locais e redes IPv4 com mais
de 64 endereços são bloqueados. Telefones seguem E.164. Busca de
imagens é feita no Laboratório de imagens: hashes/OCR local e busca
reversa externa apenas se o provedor estiver configurado e o usuário
consentir com o upload.

## Validação

Testes automatizados em `backend/tests/test_target_routing_v17.py` usam
subprocessos e filas simulados, sem consultar terceiros. CI Python/JS,
smoke de inicialização dos cinco CLIs e Preview devem passar antes
do merge. Homologação online requer consultas manuais permitidas.

## Limitações conhecidas

- Os resultados OSINT são registros brutos, não prova de identidade.
- Alguns módulos do SpiderFoot dependem de chaves ou serviços de terceiros.
- A fila e o Private Blob são hospedados na Vercel, protegidos por GitHub
  OAuth e autorização vinculada ao operador.
- A versão local/PR #15 e o cofre por navegador não são substituídos.
- O estado `pending` não distingue processamento, espera na fila e
  ausência/expiração de resultado: telemetria de etapas é melhoria futura.
