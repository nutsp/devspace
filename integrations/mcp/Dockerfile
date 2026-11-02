FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY *.py ./
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
ENV XDG_DATA_HOME=/tmp/xdg-data XDG_CACHE_HOME=/tmp/xdg-cache XDG_CONFIG_HOME=/tmp/xdg-config XDG_STATE_HOME=/tmp/xdg-state
USER 65532:65532
ENTRYPOINT ["python", "/app/server.py"]
