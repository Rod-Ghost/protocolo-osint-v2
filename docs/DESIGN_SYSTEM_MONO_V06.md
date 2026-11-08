# Design system — Monochrome Signal v0.6

Paleta: `#090A0C` (fundo), `#111215` (superfície), `#F5F5F6` (texto) e **um único sinal** `#E52A43` (ação/seleção). Cinzas são escala neutra; sem vinho, dourado, roxo, verde ou amarelo como acentos de navegação. Status usam forma, texto e contorno, não apenas cor.

Layout: navegação lateral 212 px, barra superior 57 px, cartões com raio 8–13 px, bordas neutras, fonte de sistema da plataforma, caixas compactas sem sombras pesadas. Interações: entrada curta de painel, hover de 1–3 px, transições de 0,2–0,3 s; respeitar `prefers-reduced-motion`. O overlay `monochrome.css` é aditivo para preservar os módulos legados enquanto os componentes forem consolidados e auditados.

Laboratório de imagens: três caminhos claramente distintos **local**, **OCR local com download do motor** e **busca web consentida**. Sem ícones emoji, animações decorativas persistentes ou gradientes multicoloridos.

Próxima modernização opcional: migrar gradualmente CSS acumulado em componentes com tokens centralizados, após snapshots de regressão desktop/móvel e revisão de contraste WCAG AA. Não remover módulos existentes.
