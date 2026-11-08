# Aurum UI v0.4 — Design System Protocolo OSINT

## Referências de design consultadas

- [Sherlocker Brand Book, v1.0, março de 2026](https://brand.sherlocker.com.br/brandbook) — dark surfaces, gold accents, Geist, hierarquia, iconografia e contraste.
- [Sherlocker Style Guide](https://brand.sherlocker.com.br/styleguide) — espaçamento, componentes, tokens de UI e breakpoints mobile-first.
- Minimalismo de produtos Apple como diretriz geral de organização: informação hierárquica, reduzido ruído visual, conteúdo arejado mesmo em interface densa.

**A interface não inclui logotipos, imagens, slogans, ilustrações ou arquivos proprietários do Sherlocker ou Apple.** Design e código CSS escritos para Protocolo OSINT, com marca e wordmark próprios. Referências aqui descrevem inspiração e não implicam afiliação.

## Tokens

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#0a0a0f` | fundo | 
| `--surface` | `#151519` | superfícies | 
| `--surface2` | `#1d1d22` | níveis secundários |
| `--line` | `#303038` | divisores |
| `--accent` | `#f0a121` | ação e foco, uso moderado |
| `--text` | `#f7f6f4` | texto principal |
| `--muted` | `#a8a8b2` | texto de apoio |

- Layout compacto: barra lateral 226 px, topo 60 px, cartão hero ~332 px, grid com cinco atalhos.
- Tipografia de sistema moderna, preferindo Geist se instalada no dispositivo; não inclui arquivos de fontes de terceiros.
- Controles acessíveis: foco visível dourado, breakpoints de 760/440 px, animações desativadas via `prefers-reduced-motion`.
- Tema claro preservado.

## Diretrizes de UX

- Diferenciar consultas preparadas de dados realmente observados.
- Exigir clique para enviar identificadores aos provedores.
- Identificar fonte e momento da resposta e não inferir identidade de pessoa a partir de username.
- Casos, evidências privadas e MCP ficam indisponíveis em hospedagem pública sem autenticação.

## Implementação

- `apps/web/assets/app.css`: estilos anteriores mantidos para compatibilidade.
- `apps/web/assets/aurum.css`: camada independente, não destrutiva, que moderniza tokens e densidade.
- `apps/web/index.html`: nova navegação e tela de consulta.
- `apps/web/assets/app.js`: comandos e estado da nova tela, sem framework novo ou dependência externa.
