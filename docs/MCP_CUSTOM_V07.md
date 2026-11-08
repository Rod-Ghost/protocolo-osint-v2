# MCP customizado — V0.7

Implementado: cliente browser Streamable HTTP por HTTPS, handshake initialize, initialized, tools/list, tools/call com confirmação, timeout 15s, limites de resposta e token apenas em memória. Templates de presets não são endpoints configurados. Servidor remoto deve aceitar CORS e expor o transporte MCP. Não oferece gateway, stdio, OAuth nem SSE contínuo. Não afirmar compatibilidade universal. URL pública DNS sem IP literal, sem credenciais embutidas; browser faz a requisição diretamente, sem SSRF do backend. A CSP foi ampliada para connect-src HTTPS, risco documentado. Não usar servidores desconhecidos com tokens privilegiados. Testes Node usam servidor simulado; falta teste com servidor real.


## Preset próprio do Protocolo OSINT (v0.8)

A interface agora contém um preset HTTPS de leitura para `https://protocolo-osint-v2-nine.vercel.app/mcp/`. Compatibilidade de handshake 2025-06-18 com o SDK oficial v2 foi verificada em testes controlados via TestClient. O serviço oferece `osint_classify`, `osint_plan_sources` e `osint_list_sources`; não expõe casos, motores ou senhas. A disponibilidade externa depende do deployment HTTP de produção e da política de hosts/CORS do SDK. Nenhuma credencial de terceiros é incluída.
