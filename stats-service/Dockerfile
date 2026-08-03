# syntax=docker/dockerfile:1

# --- Étape 1 : build des dépendances dans un venv isolé ---------------------
FROM python:3.13.11-slim AS builder
WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- Étape 2 : image d'exécution minimale ------------------------------------
FROM python:3.13.11-slim AS runtime
WORKDIR /app
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Utilisateur non-root dédié (l'image python officielle n'en fournit pas).
RUN addgroup --system app && adduser --system --ingroup app app

COPY --from=builder /opt/venv /opt/venv
COPY --chown=app:app app.py ./

USER app

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:5000/health', timeout=2).status == 200 else 1)"

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "app:app"]
