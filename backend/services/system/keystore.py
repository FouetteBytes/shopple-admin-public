"""
Secure keystore for provider API keys.
Stores keys encrypted-at-rest using Fernet with a key derived from an app secret in env.

Env:
- KEYSTORE_SECRET: application secret used to derive encryption key (required for persistence)

File:
- backend/secure/keys.json.enc

Security notes:
- Never log raw keys
- Only mask when displaying
- In-memory cache mirrors decrypted values while process is running
"""
import base64
import hashlib
import json
import os
import threading
from typing import Dict, Optional

from cryptography.fernet import Fernet, InvalidToken
from services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)


_LOCK = threading.Lock()
_MEM_CACHE: Dict[str, Optional[str]] = {
    "groq": None,
    "openrouter": None,
    "gemini": None,
    "cerebras": None,
}
_META: Dict[str, Optional[str]] = {
    "last_verified": {
        "groq": None,
        "openrouter": None,
        "gemini": None,
        "cerebras": None,
    }
}


def _storage_path() -> str:

    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    # Use 'data' directory which is persisted via volume mounts, instead of 'secure'
    data_dir = os.path.join(root, "data")
    os.makedirs(data_dir, exist_ok=True)
    return os.path.join(data_dir, "keys.json.enc")


def _get_fernet() -> Optional[Fernet]:
    secret = os.getenv("KEYSTORE_SECRET")
    if not secret:
        # Persistence disabled; operate in-memory only
        return None
    # Derive 32-byte key from secret using SHA-256 and base64-url encode
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def _mask(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    v = value.strip()
    if len(v) <= 8:
        return "***"
    return f"{v[:6]}...{v[-4:]}"


def load_keys_from_disk() -> None:
    """Load encrypted keys from disk into memory cache if possible."""
    f = _get_fernet()
    if not f:
        logger.info("Keystore persistence disabled", extra={"reason": "No KEYSTORE_SECRET configured"})
        return  # no persistence configured
    path = _storage_path()
    if not os.path.exists(path):
        logger.info("No keystore file found", extra={"path": path})
        return
    try:
        with open(path, "rb") as fh:
            token = fh.read()
        raw = f.decrypt(token)
        data = json.loads(raw.decode("utf-8"))
        with _LOCK:
            loaded_providers = []
            for k in _MEM_CACHE.keys():
                _MEM_CACHE[k] = data.get(k) or None
                if _MEM_CACHE[k]:
                    loaded_providers.append(k)
            _META["last_verified"] = data.get("last_verified", _META["last_verified"]) or _META["last_verified"]
        logger.info("Keys loaded from disk", extra={"providers_with_keys": loaded_providers, "path": path})
    except (InvalidToken, json.JSONDecodeError) as e:
        log_error(logger, e, context={"operation": "load_keys", "reason": "decrypt_or_parse_error"})
    except Exception as e:
        log_error(logger, e, context={"operation": "load_keys"})


def _persist_locked():
    f = _get_fernet()
    if not f:
        logger.debug("Keystore persistence skipped", extra={"reason": "No KEYSTORE_SECRET"})
        return
    try:
        data = {**_MEM_CACHE, "last_verified": _META.get("last_verified", {})}
        payload = json.dumps(data).encode("utf-8")
        token = f.encrypt(payload)
        path = _storage_path()
        with open(path, "wb") as fh:
            fh.write(token)
        providers_saved = [k for k, v in _MEM_CACHE.items() if v]
        logger.info("Keys persisted to disk", extra={"providers_with_keys": providers_saved})
    except Exception as e:
        log_error(logger, e, context={"operation": "persist_keys"})


def set_keys(updates: Dict[str, Optional[str]]) -> Dict[str, str]:
    """Set one or more provider keys. Pass empty string or None to clear a key.

    Returns masked status snapshot.
    """
    # Load keys from disk before updating to avoid overwriting other providers with empty values.
    load_keys_from_disk()

    with _LOCK:
        updated_providers = []
        cleared_providers = []
        for provider in ("groq", "openrouter", "gemini", "cerebras"):
            if provider in updates:
                val = (updates.get(provider) or "").strip()
                cleared = not bool(val)
                _MEM_CACHE[provider] = val or None
                if cleared:
                    cleared_providers.append(provider)
                    try:
                        _META["last_verified"][provider] = None
                    except Exception:
                        pass
                else:
                    updated_providers.append(provider)
        
        logger.info("Keys updated", extra={
            "updated_providers": updated_providers,
            "cleared_providers": cleared_providers
        })
        _persist_locked()
        return _get_masked_status_locked()


def get_keys() -> Dict[str, Optional[str]]:
    logger.debug("Retrieving keys from keystore")
    with _LOCK:
        return dict(_MEM_CACHE)


def _get_masked_status_locked() -> Dict[str, Dict[str, Optional[str]]]:
    return {
        "groq": {"has_key": bool(_MEM_CACHE["groq"]), "masked": _mask(_MEM_CACHE["groq"]), "last_verified": _META["last_verified"].get("groq")},
        "openrouter": {"has_key": bool(_MEM_CACHE["openrouter"]), "masked": _mask(_MEM_CACHE["openrouter"]), "last_verified": _META["last_verified"].get("openrouter")},
        "gemini": {"has_key": bool(_MEM_CACHE["gemini"]), "masked": _mask(_MEM_CACHE["gemini"]), "last_verified": _META["last_verified"].get("gemini")},
        "cerebras": {"has_key": bool(_MEM_CACHE["cerebras"]), "masked": _mask(_MEM_CACHE["cerebras"]), "last_verified": _META["last_verified"].get("cerebras")},
        "persistence": {"enabled": bool(_get_fernet())}
    }


def get_masked_status() -> Dict[str, Dict[str, Optional[str]]]:
    with _LOCK:
        return _get_masked_status_locked()


def record_verification(provider: str, iso_timestamp: str):
    with _LOCK:
        _META["last_verified"][provider] = iso_timestamp
        logger.info("Key verification recorded", extra={"provider": provider, "timestamp": iso_timestamp})
        _persist_locked()
