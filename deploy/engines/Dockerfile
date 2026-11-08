# Optional engine runtime candidate for Vercel Container Functions / Daemons.
# NOT selected automatically by the root FastAPI deployment.
# Each tool is separately licensed; retain notices in THIRD_PARTY_NOTICES.md.
# Check image resource use and dependency licenses before enabling production.
FROM golang:1.27-bookworm AS go-tools
ENV CGO_ENABLED=0
RUN GOBIN=/tools go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@v2.9.0
RUN GOBIN=/tools go install github.com/owasp-amass/amass/v5/cmd/amass@v5.0.1

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    OSINT_ENGINE_EXECUTION_ENABLED=0 \
    PYTHONPATH=/workspace/backend/src \
    HOME=/tmp
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git libxml2 libxslt1.1 libjpeg62-turbo \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY requirements.txt /workspace/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt \
    'sherlock-project==0.16.2' 'maigret==0.6.6' 'uvicorn==0.32.1'
# SpiderFoot is isolated at its upstream release; it requires a durable worker
# and will NOT be callable from the public HTTP engine endpoint.
RUN git clone --depth 1 --branch v4.0 https://github.com/smicallef/spiderfoot.git /opt/spiderfoot \
    && cp /opt/spiderfoot/LICENSE /opt/spiderfoot/SPIDERFOOT-LICENSE
RUN pip install --no-cache-dir -r /opt/spiderfoot/requirements.txt
RUN printf '#!/bin/sh\nexec python /opt/spiderfoot/sf.py "$@"\n' > /usr/local/bin/spiderfoot \
    && chmod 0755 /usr/local/bin/spiderfoot
COPY --from=go-tools /tools/subfinder /usr/local/bin/subfinder
COPY --from=go-tools /tools/amass /usr/local/bin/amass
COPY backend /workspace/backend
COPY public /workspace/public
COPY app.py /workspace/app.py
COPY THIRD_PARTY_NOTICES.md /workspace/THIRD_PARTY_NOTICES.md
EXPOSE 8000
# PORT is assigned by the hosting platform; do not bind to host interfaces
# other than 0.0.0.0 inside an isolated container.
CMD ["sh","-c","exec uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]
