"""Environment-driven settings. Every variable mirrors .env.example.

Secrets are read from the environment (via a git-ignored .env) and are never
logged or returned by the API.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()


def _get(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


class Settings:
    # Mistral (all AI in the product is Mistral; IDs come from env, never hard-coded)
    mistral_api_key: str = _get("MISTRAL_API_KEY")
    mistral_model_main: str = _get("MISTRAL_MODEL_MAIN", "mistral-large-4")
    mistral_model_fallback: str = _get("MISTRAL_MODEL_FALLBACK", "mistral-small-2603")
    mistral_moderation_model: str = _get("MISTRAL_MODERATION_MODEL", "mistral-moderation-2603")
    mistral_embed_model: str = _get("MISTRAL_EMBED_MODEL", "mistral-embed")
    voxtral_stt_realtime_model: str = _get("VOXTRAL_STT_REALTIME_MODEL", "voxtral-mini-transcribe-realtime-3-0")
    voxtral_stt_batch_model: str = _get("VOXTRAL_STT_BATCH_MODEL", "voxtral-mini-transcribe-3-0")
    voxtral_tts_model: str = _get("VOXTRAL_TTS_MODEL", "voxtral-mini-tts-3-0")
    voxtral_voice_ava: str = _get("VOXTRAL_VOICE_AVA")
    voxtral_voice_max: str = _get("VOXTRAL_VOICE_MAX")
    voxtral_voice_pip: str = _get("VOXTRAL_VOICE_PIP")

    # Database (V4-3): SQLite by default; the backend is the only writer
    database_url: str = _get("DATABASE_URL", "sqlite:///./redroom.db")

    # Supabase
    supabase_url: str = _get("SUPABASE_URL")
    supabase_service_role_key: str = _get("SUPABASE_SERVICE_ROLE_KEY")
    next_public_supabase_url: str = _get("NEXT_PUBLIC_SUPABASE_URL")
    next_public_supabase_anon_key: str = _get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

    # Run limits (v4)
    run_voice_s: float = float(_get("RUN_VOICE_S", "300"))
    run_text_s: float = float(_get("RUN_TEXT_S", "600"))
    run_text_messages: int = int(_get("RUN_TEXT_MESSAGES", "20"))
    run_idle_s: float = float(_get("RUN_IDLE_S", "60"))

    # App wiring
    backend_url: str = _get("BACKEND_URL", "http://localhost:8000")
    next_public_backend_url: str = _get("NEXT_PUBLIC_BACKEND_URL", "http://localhost:8000")
    admin_player_ids: list[str] = [p for p in _get("ADMIN_PLAYER_IDS").split(",") if p]

    # Chain (Base Sepolia testnet only)
    chain_rpc_url: str = _get("CHAIN_RPC_URL", "https://sepolia.base.org")
    chain_id: int = int(_get("CHAIN_ID", "84532"))
    bounty_owner_private_key: str = _get("BOUNTY_OWNER_PRIVATE_KEY")
    chonk_token_address: str = _get("CHONK_TOKEN_ADDRESS")
    bounty_vault_address: str = _get("BOUNTY_VAULT_ADDRESS")


settings = Settings()
