"""Deploy the Red Room backend to the Hugging Face Space `Ibad-10/red-room-api`.

Idempotent. Never prints or uploads secret values — only key names.

Steps:
  1. Create the Space (repo_type="space", space_sdk="docker", public,
     cpu-basic). If the Hub answers 402 (free accounts cannot *create*
     compute Spaces on cpu-basic), fall back to creating a plain repo and
     let the README front matter set `sdk: docker` — the SDK is read from the
     README, so the Space still becomes a Docker Space.
  2. Add every backend-read env var from the repo-root ../.env as a Space
     secret (plus CLERK_AUTHORIZED_PARTIES / CORS_ORIGINS for the Vercel
     frontend and the documented defaults for tunables absent from .env).
     HF_TOKEN itself is never uploaded. There is no Guardian setting.
  3. Build the upload set in a temp folder — README front matter (sdk: docker,
     app_port: 7860, title "Red Room API"), Dockerfile at the root running
     uvicorn on 0.0.0.0:7860, backend/ + targets/ + data/ (the app resolves
     ../targets and ../data relative to backend/app), plus app.py /
     requirements.txt as a ZeroGPU (gradio-SDK) fallback entrypoint — and
     upload it. .env, .venv, caches and *.db are excluded.
  4. Request cpu-basic hardware, poll get_space_runtime until RUNNING.
     NOTE: on a free account the Hub gates compute Spaces (HTTP 402 on
     create; runtime error "Quota exceeded for flavor cpu-basic ... limit=0").
     In that case this script prints the exact blocker and exits 1; the
     Space is fully staged and starts building as soon as the account has
     a PRO subscription / prepaid credits (huggingface.co/pro), then re-run
     this script or `hf spaces restart Ibad-10/red-room-api`.

Run from backend/:  uv run --with huggingface_hub python scripts/deploy_hf.py
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from dotenv import load_dotenv
from huggingface_hub import HfApi

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent

SPACE_ID = "Ibad-10/red-room-api"
SPACE_URL = "https://ibad-10-red-room-api.hf.space"
APP_PORT = 7860

# repo-root .env (../.env when run from backend/) — values stay in memory only.
load_dotenv(REPO_ROOT / ".env")
HF_TOKEN = os.environ.get("HF_TOKEN", "")

# Every env var the backend reads (app/config.py, app/db.py, app/mcp_server.py).
# Values come from ../.env when present; the rest get the documented defaults
# from app/config.py so the Space matches local behaviour. VOICE_AGENT_MODEL is
# only set when present in .env ("if set").
ENV_NAMES = [
    "MISTRAL_API_KEY",
    "MISTRAL_MODEL_MAIN",
    "MISTRAL_MODEL_FALLBACK",
    "MISTRAL_MODERATION_MODEL",
    "MISTRAL_EMBED_MODEL",
    "VOICE_AGENT_MODEL",
    "VOXTRAL_STT_REALTIME_MODEL",
    "VOXTRAL_STT_BATCH_MODEL",
    "VOXTRAL_TTS_MODEL",
    "VOXTRAL_TTS_SAMPLE_RATE",
    "VOXTRAL_VOICE_AVA",
    "VOXTRAL_VOICE_MAX",
    "VOXTRAL_VOICE_PIP",
    "DATABASE_URL",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
    "CLERK_AUTHORIZED_PARTIES",
    "ADMIN_PLAYER_IDS",
    "GENUINE_RATE",
    "ARENA_COOLDOWN_S",
    "RUN_VOICE_S",
    "RUN_TEXT_S",
    "RUN_TEXT_MESSAGES",
    "RUN_IDLE_S",
    "BACKEND_URL",
    "NEXT_PUBLIC_BACKEND_URL",
    "CHAIN_RPC_URL",
    "CHAIN_ID",
    "BOUNTY_OWNER_PRIVATE_KEY",
    "CHONK_TOKEN_ADDRESS",
    "BOUNTY_VAULT_ADDRESS",
    "CORS_ORIGINS",
]

# Defaults matching app/config.py for vars that may be absent from .env.
DEFAULTS = {
    "VOXTRAL_TTS_SAMPLE_RATE": "24000",
    "GENUINE_RATE": "0.2",
    "ARENA_COOLDOWN_S": "600",
    "RUN_VOICE_S": "300",
    "RUN_TEXT_S": "600",
    "RUN_TEXT_MESSAGES": "20",
    "RUN_IDLE_S": "60",
}

# Values the Space must have regardless of the local .env (public URLs only).
OVERRIDES = {
    "CLERK_AUTHORIZED_PARTIES": "http://localhost:3000,https://red-room-steel.vercel.app",
    "CORS_ORIGINS": "http://localhost:3000,https://red-room-steel.vercel.app",
    "BACKEND_URL": SPACE_URL,
    "NEXT_PUBLIC_BACKEND_URL": SPACE_URL,
}

IGNORE = shutil.ignore_patterns(
    ".env", ".env.*", ".venv", "__pycache__", ".pytest_cache", ".ruff_cache",
    "*.pyc", "*.db", "*.db-journal", "voice_live_smoke_out", ".DS_Store",
)

README = f"""---
sdk: docker
app_port: {APP_PORT}
title: Red Room API
tags:
  - docker
  - Le_chonk
---

# Red Room API

FastAPI backend for Red Room (Mistral "Le Chonk in London" hackathon). The
root `Dockerfile` runs `uvicorn app.main:app --host 0.0.0.0 --port {APP_PORT}`;
`app.py` is an equivalent entrypoint for the ZeroGPU/gradio flavor. Secrets
are Hugging Face Space secrets, never baked into the image. Layout mirrors
the repo root: `backend/`, `targets/`, `data/` (the app resolves `../targets`
and `../data` relative to `backend/app`).
"""

# Same layout as the repo-root build in backend/Dockerfile (build context =
# Space root), with the HF Spaces port.
SPACE_DOCKERFILE = f"""# Red Room API - Hugging Face Space (build context = Space root).
# Mirrors backend/Dockerfile, listening on the Spaces port {APP_PORT}.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \\
    PYTHONUNBUFFERED=1 \\
    UV_LINK_MODE=copy \\
    UV_PROJECT_ENVIRONMENT=/opt/venv

RUN pip install --no-cache-dir uv

WORKDIR /srv/redroom

COPY backend/pyproject.toml backend/uv.lock ./backend/
RUN uv sync --frozen --no-install-project --directory backend

COPY backend/app ./backend/app
COPY backend/scripts ./backend/scripts
COPY targets ./targets
COPY data ./data

ENV PATH="/opt/venv/bin:$PATH"
WORKDIR /srv/redroom/backend

EXPOSE {APP_PORT}

# All secrets come from Space secrets (environment), never baked in.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "{APP_PORT}"]
"""

# Fallback entrypoint for the free ZeroGPU flavor (gradio SDK on zero-a10g):
# runs the same FastAPI app with uvicorn on the Spaces port.
APP_PY = f'''"""Red Room API - HF Space entrypoint: run the FastAPI app with uvicorn on 0.0.0.0:{APP_PORT}."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "backend"))

import uvicorn  # noqa: E402
from app.main import app  # noqa: E402

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port={APP_PORT})
'''


def requirements_txt() -> str:
    """Pinned requirements for the gradio-SDK fallback image (no pytest)."""
    try:
        out = subprocess.run(
            ["uv", "export", "--frozen", "--format", "requirements-txt", "--no-hashes"],
            cwd=BACKEND_DIR, capture_output=True, text=True, timeout=120,
        )
        if out.returncode == 0:
            return "\n".join(
                l for l in out.stdout.splitlines() if "pytest" not in l.lower()
            ) + "\n"
    except Exception:
        pass
    return "\n".join([
        "fastapi", "uvicorn", "pydantic>=2", "mistralai", "mistralai-agents",
        "supabase", "networkx", "httpx", "websockets>=15", "python-dotenv",
        "sqlmodel", "psycopg[binary]>=3.3.9", "mcp>=2", "python-multipart>=0.0.34",
    ]) + "\n"


def build_upload_set(tmp: Path) -> Path:
    root = tmp / "space"
    root.mkdir(parents=True)
    (root / "README.md").write_text(README, encoding="utf-8")
    (root / "Dockerfile").write_text(SPACE_DOCKERFILE, encoding="utf-8")
    (root / "app.py").write_text(APP_PY, encoding="utf-8")
    (root / "requirements.txt").write_text(requirements_txt(), encoding="utf-8")
    (root / "backend").mkdir(parents=True, exist_ok=True)
    for name in ("pyproject.toml", "uv.lock"):
        shutil.copy2(REPO_ROOT / "backend" / name, root / "backend" / name)
    shutil.copytree(REPO_ROOT / "backend" / "app", root / "backend" / "app", ignore=IGNORE)
    shutil.copytree(REPO_ROOT / "backend" / "scripts", root / "backend" / "scripts", ignore=IGNORE)
    shutil.copytree(REPO_ROOT / "targets", root / "targets", ignore=IGNORE)
    shutil.copytree(REPO_ROOT / "data", root / "data", ignore=IGNORE)
    return root


def create_space(api: HfApi) -> None:
    try:
        api.create_repo(
            SPACE_ID,
            repo_type="space",
            space_sdk="docker",
            space_hardware="cpu-basic",
            private=False,
            exist_ok=True,
        )
        print(f"  created (or already exists) with sdk=docker, hardware=cpu-basic")
        return
    except Exception as e:
        msg = str(e)
        if "402" not in msg:
            raise
        print("  create_repo(sdk=docker, cpu-basic) -> 402 (free accounts cannot create compute Spaces);")
        print("  falling back to a plain Space repo — the README front matter sets sdk: docker.")
    api.create_repo(SPACE_ID, repo_type="space", space_sdk="static", private=False, exist_ok=True)
    print("  created plain Space; README front matter will switch it to the docker SDK")


def set_secrets(api: HfApi) -> int:
    n = 0
    for name in ENV_NAMES:
        value = OVERRIDES.get(name) or os.environ.get(name) or DEFAULTS.get(name, "")
        if not value:
            continue  # e.g. VOICE_AGENT_MODEL only when set
        api.add_space_secret(SPACE_ID, name, value)
        n += 1
        print(f"  secret set: {name}")
    return n


def wait_running(api: HfApi, timeout_s: float = 1500.0) -> str:
    deadline = time.time() + timeout_s
    last = ""
    while time.time() < deadline:
        rt = api.get_space_runtime(SPACE_ID)
        stage = getattr(rt, "stage", None) or "UNKNOWN"
        raw = getattr(rt, "raw", {}) or {}
        if stage != last:
            print(f"  stage: {stage}" + (f" — {raw.get('errorMessage')}" if raw.get("errorMessage") else ""))
            last = stage
        if stage == "RUNNING":
            return stage
        if stage in ("BUILD_ERROR", "RUNTIME_ERROR", "ERROR"):
            print(f"Space failed with stage={stage}; build logs:")
            try:
                for line in list(api.fetch_space_logs(SPACE_ID, build=True))[-80:]:
                    print("  | " + line.rstrip())
            except Exception as e:  # noqa: BLE001
                print(f"  (could not fetch logs: {e})")
            return stage
        if stage == "PAUSED" and raw.get("errorMessage"):
            print(f"  blocker: {raw['errorMessage']}")
            print("  -> the account needs a PRO subscription or prepaid credits to run compute Spaces")
            print("     (https://huggingface.co/pro). The Space is fully staged; re-run this script after upgrading.")
            return stage
        time.sleep(20)
    return last


def main() -> int:
    if not HF_TOKEN:
        print("HF_TOKEN missing in ../.env", file=sys.stderr)
        return 2
    api = HfApi(token=HF_TOKEN)

    print(f"1. create Space {SPACE_ID} (docker SDK, public, cpu-basic)")
    create_space(api)

    print("2. add Space secrets (names only — values never printed)")
    set_secrets(api)

    print("3. build upload set in a temp folder and upload")
    tmp = Path(tempfile.mkdtemp(prefix="redroom-space-"))
    root = build_upload_set(tmp)
    print(f"   upload set: {root} ({sum(1 for _ in root.rglob('*') if _.is_file())} files)")
    api.upload_folder(
        repo_id=SPACE_ID,
        folder_path=str(root),
        repo_type="space",
        commit_message="Deploy Red Room backend (uvicorn on 0.0.0.0:7860, docker SDK at Space root)",
    )
    shutil.rmtree(tmp, ignore_errors=True)

    print("4. request cpu-basic hardware and wait for the Space to build and run")
    try:
        api.request_space_hardware(SPACE_ID, "cpu-basic")
    except Exception as e:  # noqa: BLE001
        print(f"  hardware request: {str(e).splitlines()[0]}")
    stage = wait_running(api)
    print(f"   final stage: {stage}")
    print(f"Space URL: {SPACE_URL}")
    return 0 if stage == "RUNNING" else 1


if __name__ == "__main__":
    raise SystemExit(main())
