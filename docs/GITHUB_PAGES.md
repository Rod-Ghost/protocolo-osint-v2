# Prévia pública via GitHub Pages

A publicação em Pages hospeda **somente** `apps/web` compilado por `scripts/build_pages.py`. Python, SQLite, MCP, OCR e API de casos **não** são publicados, não recebem tráfego e não executam no GitHub Pages.

## Preparar a publicação (após aprovação jurídica e técnica)

1. Verificar `docs/RELEASE_GATE.md` e definir licença do código próprio, mantendo notices aplicáveis.
2. Tornar o repositório público **somente quando autorizado pelo proprietário**.
3. Em **Settings → Pages → Build and deployment → Source**, selecionar **GitHub Actions**.
4. Criar PR `develop` → `main`, revisar, aprovar e mesclar.
5. Após o workflow `Publish static frontend to GitHub Pages` terminar com sucesso, conferir o endereço exibido em **Settings → Pages**. URL esperada: `https://rod-ghost.github.io/protocolo-osint-v2/` — não presumir ativa.

Atualização: qualquer push relevante para `main` dispara publicação automática. Commits em `develop` **não** atualizam o site.

## Funções da prévia

- Barra de busca, detecção local de termos e catálogo de fontes HTTPS para abrir manualmente. Os destinos externos não foram validados.
- Hash SHA-256 e dHash no navegador sem upload de imagem.
- Sem autenticação, persistência, OCR, EXIF avançado, gestão de casos ou servidor MCP. A interface deve comunicar essas limitações.

## Teste local da versão Pages

```bash
python scripts/build_pages.py --output _site
python -m http.server 8080 --directory _site
```

Acesse `http://localhost:8080`. Os links de CSS/JS são relativos para suportar subcaminhos do GitHub Pages.

Para a plataforma completa, usar a API FastAPI em servidor isolado com autenticação, HTTPS, armazenamento e limites antes de disponibilizar acesso público. **Não expor diretamente o SQLite e a API single-user atuais.**
