# Matriz de preservação da versão original

O ZIP legado enviado foi auditado separadamente. A versão V2 **não copia nem redistribui o código legado** enquanto não forem resolvidas as dúvidas de origem e distribuição. Seu escopo funcional foi documentado para migração por comportamento, sem cópia direta.

| Área no legado | Estado V2 | Próximo passo |
|---|---|---|
| Search, Domain, IP | Links equivalentes em catálogo próprio | Revisar funcionalidade consulta por consulta |
| Email, Username, Name | Classificação e links de pesquisa básicos | Conectores e validação de formatos avançados |
| Facebook, Instagram, Twitter, LinkedIn | Pesquisa pública indexada e catálogo | Checar restrições e disponibilidade de cada destino |
| Images | SHA-256, dHash, EXIF e OCR local | Busca reversa externa via APIs autorizadas, sem prometer identificação |
| Videos, Documents | Fontes de busca geral no catálogo | Metadados e processamento local de arquivos |
| Telephone, TelefoneNacional | Não migrado | Validar legislação, dados, fontes e formatos nacionais |
| Location, Business, Communities | Fontes gerais de mapa, registros e comunidades | Adicionar fontes específicas por país/região |
| Breaches, Pastes, Currencies | Não migrado | Revisar finalidade, acesso legal, fontes e limitações |

**Regra de evolução:** não remover funções válidas sem um substituto testado e uma decisão documentada. Ferramentas obsoletas devem ficar identificadas como indisponíveis/descontinuadas, não desaparecer silenciosamente.
