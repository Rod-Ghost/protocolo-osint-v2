# Contêiner com motores externos (experimental)

O `Dockerfile` documenta o empacotamento de **Sherlock, Maigret, subfinder, OWASP Amass e SpiderFoot** no mesmo ambiente Python/Go. Ele baixa componentes oficiais durante o build, mantendo os notices e sem reatribuição de autoria.

**Este contêiner não está automaticamente publicado.** Para migrar a hospedagem FastAPI atual para Vercel Container Functions, será preciso configurar o framework `container`/`Dockerfile.vercel` ou serviço específico, analisar os custos e o tempo de build, realizar teste no preview e proteger a execução com identidade e cotas. A presença do Dockerfile não prova que o build foi executado com sucesso.

Para Amass e SpiderFoot, **o pacote instalado não equivale a um worker funcionando**: exigem backend de tarefas e banco persistente; suas chamadas síncronas permanecem desabilitadas. Antes de hospedar multiusuário, criar fila autorizada, credenciais server-side, rate limiting distribuído e retenção/eliminação de resultados. O contêiner não salva investigações duravelmente.

O arquivo acima é parte do plano de integração progressiva, não um convite para expor o serviço isolado na internet sem controles de autorização.
