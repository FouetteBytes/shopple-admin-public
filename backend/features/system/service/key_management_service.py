from typing import Dict, Any, List, Optional
import os
import threading
from datetime import datetime, timezone
from common.base.base_service import BaseService
from services.system.keystore import load_keys_from_disk, get_masked_status, set_keys, record_verification
from services.system.model_registry import get_allowed_models, set_allowed_models, get_default_models
from services.system.initialization import get_classifier, reload_classifier_keys
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class KeyManagementService(BaseService):
    def get_status(self) -> Dict[str, Any]:
        load_keys_from_disk()
        return get_masked_status()

    def get_allowed_models(self) -> Dict[str, List[str]]:
        return get_allowed_models()

    def get_model_defaults(self) -> Dict[str, Optional[str]]:
        return get_default_models()

    def update_allowed_models(self, payload: Dict[str, Any]) -> Dict[str, Any]:
         return set_allowed_models(payload)

    def set_keys(self, keys: Dict[str, str]) -> Dict[str, Any]:
        logger.info("Setting API keys", extra={"providers": list(keys.keys())})
        if not keys:
             return {"ok": True, "status": get_masked_status(), "note": "no changes"}
        
        status = set_keys(keys)
        # Update process env vars
        for provider, key in keys.items():
            if key:
                env_var = f"{provider.upper()}_API_KEY"
                os.environ[env_var] = key

        logger.info("API keys updated", extra={"providers_updated": list(keys.keys())})

        # Immediately reload handlers so this worker picks up the new keys
        try:
            self.reload_keys()
        except Exception as e:
            logger.warning("Auto-reload after set_keys failed", extra={"error": str(e)})

        return {"ok": True, "status": status}

    def reload_keys(self) -> bool:
        return reload_classifier_keys()

    def test_provider(self, provider: str, model: Optional[str]) -> Dict[str, Any]:
        logger.info("Testing API key", extra={"provider": provider, "model": model})
        provider = provider.lower()
        if provider not in ['groq', 'openrouter', 'gemini', 'cerebras']:
             raise ValueError("Unsupported provider")

        classifier = get_classifier()
        if not classifier:
            return {"ok": False, "error": "Classifier is still loading", "loading": True}

        # Lazy reload: if the handler for the requested provider is not available,
        # attempt a reload from keystore in case another Gunicorn worker saved the key.
        _handler_map = {
            'groq': lambda: classifier.groq_handler,
            'openrouter': lambda: classifier.openrouter_handler,
            'gemini': lambda: classifier.gemini_handler,
            'cerebras': lambda: classifier.cerebras_handler,
        }
        handler_fn = _handler_map.get(provider)
        handler = handler_fn() if handler_fn else None
        if not handler or not handler.is_available():
            logger.info("Handler not available, reloading from keystore",
                        extra={"provider": provider})
            self.reload_keys()
            # Re-fetch classifier in case it was updated
            classifier = get_classifier()

        tiny_prompt = (
            "Return EXACTLY these 5 lines, nothing else, no extra text or formatting.\n"
            "PRODUCT_TYPE: Dairy\n"
            "BRAND_NAME: None\n"
            "PRODUCT_NAME: Test\n"
            "SIZE: 100g\n"
            "VARIETY: Test"
        )

        if not model:
            try:
                # Use configured default if available, otherwise first in list, otherwise None
                defaults = get_default_models()
                if defaults.get(provider):
                    model = defaults.get(provider)
                else:
                    models_map = get_allowed_models()
                    model = (models_map.get(provider) or [None])[0]
            except Exception:
                model = None

        response = None
        status = None
        timeout_seconds = {
            'groq': 12,
            'openrouter': 12,
            'gemini': int(os.getenv('KEY_TEST_TIMEOUT_SECONDS', '10')),
            'cerebras': int(os.getenv('KEY_TEST_TIMEOUT_SECONDS', '10')),
        }.get(provider, 12)

        def _run():
            nonlocal response, status
            try:
                if provider == 'groq' and classifier.groq_handler and classifier.groq_handler.is_available():
                    response, status = classifier.groq_handler.classify_product(
                        tiny_prompt, use_memory=False, model_override=model, system_prompt="Return only the 5 lines."
                    )
                elif provider == 'openrouter' and classifier.openrouter_handler and classifier.openrouter_handler.is_available():
                    response, status = classifier.openrouter_handler.classify_product(
                        tiny_prompt, use_memory=False, model_override=model, system_prompt="Return only the 5 lines.", request_timeout=timeout_seconds
                    )
                elif provider == 'gemini' and classifier.gemini_handler and classifier.gemini_handler.is_available():
                    response, status = classifier.gemini_handler.classify_product(
                        tiny_prompt, use_memory=False, system_prompt="Return only the 5 lines.", model_override=model, request_timeout=timeout_seconds, disable_streaming=True
                    )
                elif provider == 'cerebras' and classifier.cerebras_handler and classifier.cerebras_handler.is_available():
                    response, status = classifier.cerebras_handler.classify_product(
                        tiny_prompt, use_memory=False, system_prompt="Return only the 5 lines.", model_override=model, disable_streaming=True, request_timeout=timeout_seconds
                    )
                else:
                    raise RuntimeError(f"{provider} not available (missing key?)")
            except Exception as e:
                response = f"Error: {e}"
        
        t = threading.Thread(target=_run, daemon=True)
        t.start()
        t.join(timeout_seconds)
        
        if t.is_alive():
             return {"ok": False, "provider": provider, "error": f"Timeout after {timeout_seconds}s"}

        if response:
            # Clean up artifacts like triple quotes from some models
            response = str(response).strip().strip('"')
            if response.endswith('"""'): response = response[:-3]
            if response.startswith('"""'): response = response[3:]
            response = response.strip()

            preview = str(response)
            if len(preview) > 800: preview = preview[:800] + "..."
            logger.debug("API test response", extra={"provider": provider, "model": model, "response_preview": preview})

        ok = bool((response and len(str(response).strip()) > 0) and "Error: " not in str(response))
        # Status check from handler result is also valid but simplistic bool check is usually safer for generic handlers
        if not ok and status in ("GROQ", "OPENROUTER", "GEMINI", "CEREBRAS") and not str(response).startswith("Error:"):
            ok = True

        ts = datetime.now(timezone.utc).isoformat()
        if ok:
            record_verification(provider, ts)
            
        return {
            "ok": ok, 
            "provider": provider, 
            "model": model, 
            "verified_at": ts, 
            "status": status,
            "details": response
        }
