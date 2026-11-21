# Red Room backend image (for later hosting; the hackathon demo runs the
# backend on the laptop via scripts/start_tunnel.ps1 — see docs/DEPLOY.md).
#
# Build from the REPO ROOT (the app reads ../targets and ../data at runtime):
#   docker build -f backend/Dockerfile -t redroom-backend .
# Run with the repo-root .env mounted as environment (never baked into the image):
#   docker run --rm -p 8000:8000 --env-file .env -t redroom-backend
#
# Secrets are never copied into the image: .env is git-ignored and excluded
# by backend/.dockerignore; pass values via --env-file / -e at runtime.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv

# uv (pinned via the image layer) to install the locked dependencies
RUN pip install --no-cache-dir uv

WORKDIR /srv/redroom

# Dependency layer first for caching: backend project files only
COPY backend/pyproject.toml backend/uv.lock ./backend/
RUN uv sync --frozen --no-install-project --directory backend

# Runtime code and the prepared inputs the app reads at runtime
# (app/db.py resolves ../targets, app/engine/wins.py resolves ../data)
COPY backend/app ./backend/app
COPY backend/scripts ./backend/scripts
COPY targets ./targets
COPY data ./data

ENV PATH="/opt/venv/bin:$PATH"
WORKDIR /srv/redroom/backend

EXPOSE 8000

# DATABASE_URL and every other secret come from the environment at runtime.
#   uvicorn app.main:app --host 0.0.0.0 --port 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
