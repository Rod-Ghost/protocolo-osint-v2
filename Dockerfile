FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/ /app/backend/
RUN pip install --no-cache-dir -e /app/backend && \
    useradd --uid 10001 --create-home osint && mkdir -p /data && chown -R osint:osint /data
COPY apps/web/ /app/apps/web/
USER osint
ENV OSINT_DATA_DIR=/data OSINT_OCR_ENABLED=0
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "from urllib.request import urlopen;urlopen('http://127.0.0.1:8000/api/v1/health',timeout=2)" || exit 1
CMD ["uvicorn", "protocolo_osint.main:app", "--host", "0.0.0.0", "--port", "8000"]
