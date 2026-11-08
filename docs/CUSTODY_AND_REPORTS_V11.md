# Auditoria de custódia e relatórios - v1.1

## Escopo e relação com o livro

Implementação limitada ao backend LOCAL e ao cofre criptografado do navegador. A API pública hospedada continua sem casos persistentes e não oferece exportação de dados SQLite. Nenhuma instância paga foi ativada.

O livro Protocolo OSINT (páginas impressas 556 e 572) aborda armazenamento seguro, documentação de coleta, cadeia de custódia, validação independente e limitações nos relatórios. Esta entrega aplica parte desses princípios com controles técnicos verificáveis, mas não substitui metodologia pericial ou avaliação jurídica.

## Migração SQLite aditiva

- Tabelas originais cases, evidence e image_index mantidas.
- Nova tabela custody_events com sequência por caso, tipo de operação, identificador, data, hash anterior e hash do evento.
- O evento é escrito na mesma transação que o registro de caso, evidência ou imagem.
- Triggers bloqueiam UPDATE e DELETE diretos na tabela de eventos.
- Casos anteriores não recebem histórico fabricado: a auditoria informa legacy_unsealed.
- A verificação compara hashes encadeados, sequência, cópias de metadados e SHA-256 original dos registros de evidência.
- Status de saída: verified_metadata_chain, legacy_unsealed ou tampered.

## Rotas exclusivas do backend local

| Rota | Função |
|---|---|
| GET /api/v1/cases/{id}/custody | Retorna resultado e manifesto da verificação, incluindo eventos |
| GET /api/v1/cases/{id}/export | JSON legado enriquecido com custódia, preservando estrutura anterior |
| GET /api/v1/cases/{id}/report?format=md | Download Markdown |
| GET /api/v1/cases/{id}/report?format=pdf | Download PDF em memória |
| GET /api/v1/cases/{id}/report?format=docx | Download DOCX em memória |

Extras opcionais locais: python -m pip install -e './backend[reports]' a partir da raiz.

## Na interface web

Ao abrir um caso com o cofre do navegador desbloqueado, o botão Relatório (.md) cria o arquivo diretamente no browser, sem upload dos dados de caso. O arquivo resultante NÃO é criptografado; exige confirmação. No backend local também aparecem botões Relatório PDF, Relatório DOCX e Verificar custódia. O cofre AES-GCM e o banco SQLite são armazenamentos distintos, sem sincronização.

## Ameaças e limitações

- A cadeia protege registros de METADADOS, não bytes originais dos arquivos e páginas externas.
- SQLite não tem assinatura independente nem carimbo de tempo confiável. Administrador do disco/banco pode reescrever todo o histórico.
- A pasta local usa permissões restritas, mas NÃO criptografia em repouso; depende de sistema e criptografia do dispositivo.
- API local restringe casos e análise de imagens ao loopback e bloqueia origens cross-site suspeitas. Não substitui autenticação de usuário.
- PDF/DOCX são relatórios preliminares, sem atestar autenticidade, integridade de originais ou validade judicial.
- O novo código não é habilitado na API pública sem identidade, RBAC e política de dados.

## Testes

Testes cobrem migração aditiva, cadeia consistente, alteração de metadados, remoção e edição de eventos via SQLite, exportação em três formatos e bloqueio de Origin. CI inspeciona os SDKs Vercel e os pacotes de relatório reais. Provas de execução estão no GitHub Actions do PR.

## Próximas etapas

Identidade multiusuário e isolamento por caso; quotas e auditoria de operações; assinatura externa de checkpoints; retenção e backup; ingestão segura de bytes originais com consentimento.
