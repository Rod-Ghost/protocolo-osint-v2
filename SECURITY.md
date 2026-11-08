# Segurança

Esta versão é uma **prévia para operador único, em loopback**. Ainda não possui autenticação ou separação de usuários. Não a publique em servidores acessíveis pela internet.

- Entrada validada em endpoints Python e templates HTTPS controlados pelo código.
- Arquivos de imagem: 10 MB, formatos PNG/JPEG/WebP por conteúdo e limite de 24 megapixels.
- Imagens não são enviadas para terceiros nem mantidas em disco; hashes e metadados persistem somente quando anexados a um caso.
- SQLite com diretório local e permissões restritas quando suportado pelo sistema.
- MCP experimenta somente detecção e listagem de fontes, sem shell, escrita nem conectores remotos.
- Frontend não inclui scripts externos ou analytics e aplica política CSP restritiva pelo backend.
- Não hospede em rede compartilhada sem autenticação, rate limit, proteção contra CSRF, TLS e isolamento por perfil.

Reporte vulnerabilidades por comunicação privada com o mantenedor do repositório. Não abra issues públicas com tokens, dados pessoais ou provas de exploração.
