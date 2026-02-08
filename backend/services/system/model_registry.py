"""Registry for configurable allowed AI models per provider.

Persists provider model lists to disk so the admin UI can add/remove models
without modifying source code. The data is stored as JSON under the secure
folder to keep it alongside other server-managed secrets (keys.json.enc, etc.).
"""
from __future__ import annotations

import json
import os
import threading
from typing import Dict, Iterable, List

from services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)



# Default fallback set that ships with the application. Used if no custom list
# has been saved yet or if the persisted file becomes unreadable.
DEFAULT_ALLOWED_MODELS: Dict[str, List[str]] = {
    "groq": [
        "llama-3.3-70b-versatile",
    ],
    "openrouter": [
        "meta-llama/llama-3.3-70b-instruct",
        "nvidia/llama-3.1-nemotron-70b-instruct",
    ],
    "gemini": [
        "gemini-1.5-flash",
        "gemini-1.5-pro",
    ],
    "cerebras": [
        "llama3.1-70b",
    ],
}

_LOCK = threading.Lock()
_ALLOWED_MODELS: Dict[str, List[str]] | None = None
_DEFAULT_MODELS: Dict[str, str | None] = {}


def _storage_path() -> str:
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    # Use 'data' directory which is persisted via volume mounts, instead of 'secure'
    data_dir = os.path.join(root, "data")
    os.makedirs(data_dir, exist_ok=True)
    return os.path.join(data_dir, "allowed_models.json")


def _clean_list(values: Iterable[str] | None) -> List[str]:
    if not values:
        return []
    cleaned: List[str] = []
    seen = set()
    for value in values:
        if not isinstance(value, str):
            continue
        candidate = value.strip()
        if not candidate:
            continue
        if candidate.lower() in seen:
            continue
        seen.add(candidate.lower())
        cleaned.append(candidate)
    cleaned.sort()
    return cleaned


def _load_locked() -> None:
    global _ALLOWED_MODELS, _DEFAULT_MODELS
    if _ALLOWED_MODELS is not None:
        return
    path = _storage_path()
    
    # Initialize implementation defaults.
    impl_defaults = {k: list(v) for k, v in DEFAULT_ALLOWED_MODELS.items()}
    impl_selections = {
        k: (v[0] if v else None) for k, v in DEFAULT_ALLOWED_MODELS.items()
    }

    if not os.path.exists(path):
        _ALLOWED_MODELS = impl_defaults
        _DEFAULT_MODELS = impl_selections
        return

    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        
        # Handle migration from a legacy dict to {"models": ..., "defaults": ...}.
        if isinstance(data, dict):
            if "models" in data:
                raw_models = data.get("models", {})
                raw_defaults = data.get("defaults", {})
            else:
                # Legacy format: data is the models dict.
                raw_models = data
                raw_defaults = {}
        else:
            raw_models = {}
            raw_defaults = {}

    except Exception as exc:
        logger.warning("Failed to load allowed models registry", extra={"error": str(exc)})
        _ALLOWED_MODELS = impl_defaults
        _DEFAULT_MODELS = impl_selections
        return

    merged_models: Dict[str, List[str]] = {}
    merged_defaults: Dict[str, str | None] = {}

    for provider, fallback_list in DEFAULT_ALLOWED_MODELS.items():
        # Models
        raw_list = raw_models.get(provider)
        cleaned = _clean_list(raw_list if isinstance(raw_list, list) else None)
        merged_models[provider] = cleaned if cleaned else list(fallback_list)
        
        # Default Selection
        # If saved default is in the new list, keep it. Else invoke fallback.
        saved_def = raw_defaults.get(provider)
        final_list = merged_models[provider]
        
        if saved_def and saved_def in final_list:
            merged_defaults[provider] = saved_def
        elif final_list:
            merged_defaults[provider] = final_list[0]
        else:
            merged_defaults[provider] = None

    _ALLOWED_MODELS = merged_models
    _DEFAULT_MODELS = merged_defaults
    # Persist migrated/merged structure immediately
    _persist_locked()


def _persist_locked() -> None:
    if _ALLOWED_MODELS is None:
        return
    path = _storage_path()
    payload = {
        "models": _ALLOWED_MODELS,
        "defaults": _DEFAULT_MODELS
    }
    try:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, sort_keys=True)
    except Exception as exc:
        logger.error("Failed to persist allowed models registry", extra={"error": str(exc)})
        return False


def get_allowed_models() -> Dict[str, List[str]]:
    """Return a copy of the currently allowed models per provider."""
    with _LOCK:
        _load_locked()
        assert _ALLOWED_MODELS is not None
        return {prov: list(models) for prov, models in _ALLOWED_MODELS.items()}


def get_default_models() -> Dict[str, str | None]:
    """Return a copy of the currently configured default models."""
    with _LOCK:
        _load_locked()
        return dict(_DEFAULT_MODELS)


def set_allowed_models(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Replace allowed models and optionally update defaults.
    
    Payload can be:
    - Dict[str, List[str]] (legacy): just updates lists, resets defaults if invalid
    - {"models": {...}, "defaults": {...}} (new): updates both
    """
    if not isinstance(payload, dict):
        raise ValueError("Payload must be an object")

    global _ALLOWED_MODELS, _DEFAULT_MODELS
    with _LOCK:
        _load_locked()
        assert _ALLOWED_MODELS is not None

        # Determine payload type
        if "models" in payload and isinstance(payload["models"], dict):
            new_models = payload["models"]
            new_defaults = payload.get("defaults", {})
        else:
            new_models = payload
            new_defaults = {}

        updated_models: Dict[str, List[str]] = {}
        updated_defaults: Dict[str, str | None] = {}
        
        unknown_keys = [k for k in new_models.keys() if k not in DEFAULT_ALLOWED_MODELS]
        if unknown_keys:
            raise ValueError(f"Unknown provider(s): {', '.join(sorted(unknown_keys))}")

        for provider, fallback_list in DEFAULT_ALLOWED_MODELS.items():
            # Update Models
            if provider in new_models:
                cleaned = _clean_list(new_models[provider] if isinstance(new_models[provider], list) else None)
                updated_models[provider] = cleaned
            else:
                updated_models[provider] = list(_ALLOWED_MODELS.get(provider, fallback_list))
            
            # Update Defaults
            final_list = updated_models[provider]
            requested_def = new_defaults.get(provider)
            current_def = _DEFAULT_MODELS.get(provider)

            if requested_def and requested_def in final_list:
                updated_defaults[provider] = requested_def
            elif current_def and current_def in final_list:
                updated_defaults[provider] = current_def
            elif final_list:
                updated_defaults[provider] = final_list[0]
            else:
                updated_defaults[provider] = None

        if all(len(models) == 0 for models in updated_models.values()):
            raise ValueError("At least one provider must have a model configured")

        _ALLOWED_MODELS = updated_models
        _DEFAULT_MODELS = updated_defaults
        _persist_locked()
        
        return {
            "models": {prov: list(models) for prov, models in _ALLOWED_MODELS.items()},
            "defaults": dict(_DEFAULT_MODELS)
        }


def reset_allowed_models() -> Dict[str, Any]:
    """Reset registry to the shipped defaults."""
    with _LOCK:
        global _ALLOWED_MODELS, _DEFAULT_MODELS
        _ALLOWED_MODELS = {k: list(v) for k, v in DEFAULT_ALLOWED_MODELS.items()}
        _DEFAULT_MODELS = {k: (v[0] if v else None) for k, v in DEFAULT_ALLOWED_MODELS.items()}
        _persist_locked()
        return {
            "models": get_allowed_models(),
            "defaults": get_default_models()
        }
