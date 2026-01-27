import json
import time
import uuid
import threading
from datetime import datetime
from services.system.initialization import get_classifier
from common.base.base_service import BaseService
from backend.features.ai.service.classifier_history_service import ClassificationHistoryService
from services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

# In-memory registry of active classification jobs
ACTIVE_CLASSIFICATIONS = {}
ACTIVE_CLASSIFICATIONS_LOCK = threading.Lock()

class ClassifierService(BaseService):
    def __init__(self):
        self.history_service = ClassificationHistoryService()

    def validate_model_overrides(self, model_overrides):
        """Validate model overrides against allowed lists. Returns (is_valid, errors)."""
        from services.system.model_registry import get_allowed_models
        allowed_models = get_allowed_models()
        errors = {}
        if not isinstance(model_overrides, dict):
            return False, {"model_overrides": "Must be an object keyed by provider"}
        for provider, model in model_overrides.items():
            if provider not in allowed_models:
                errors[provider] = {
                    'error': 'Unknown provider',
                    'allowed_providers': list(allowed_models.keys())
                }
                continue
            allowed = allowed_models.get(provider, [])
            if model not in allowed:
                errors[provider] = {
                    'error': f'Invalid model: {model}',
                    'allowed_models': allowed
                }
        return (len(errors) == 0), errors

    def stop_job(self, job_id):
        with ACTIVE_CLASSIFICATIONS_LOCK:
            cancel_event = ACTIVE_CLASSIFICATIONS.get(job_id)
        if not cancel_event:
            logger.warning(f"Attempted to stop unknown or finished job: {job_id}")
            return False
        
        logger.info(f"Signaling stop for classification job: {job_id}")
        cancel_event.set()
        return True

    def batch_classify(self, products, model_overrides):
        classifier = get_classifier()
        if not classifier:
            raise Exception("Classifier is still loading")
            
        results = []
        for product in products:
            try:
                result = classifier.classify_product_ai_only(
                    product.get('product_name', ''),
                    product.get('price', ''),
                    product.get('image_url', ''),
                    model_overrides=model_overrides
                )
                result['status'] = 'success'
            except Exception as e:
                result = {
                    'product_type': 'AI_FAILED',
                    'brand_name': None,
                    'product_name': product.get('product_name', 'Unknown'),
                    'size': None,
                    'variety': None,
                    'price': product.get('price', ''),
                    'image_url': product.get('image_url', ''),
                    'original_name': product.get('product_name', ''),
                    'error': str(e),
                    'status': 'error'
                }
            results.append(result)
        return results

    def stream_classification(self, products, model_overrides, use_cache=True, store_in_cache=True):
        classifier = get_classifier()
        if not classifier:
            raise Exception("Classifier is still loading")

        job_id = str(uuid.uuid4())
        cancel_event = threading.Event()
        with ACTIVE_CLASSIFICATIONS_LOCK:
            ACTIVE_CLASSIFICATIONS[job_id] = cancel_event

        def cleanup_job():
            with ACTIVE_CLASSIFICATIONS_LOCK:
                ACTIVE_CLASSIFICATIONS.pop(job_id, None)

        def is_cancelled():
            return cancel_event.is_set()

        def generate():
            try:
                results = []
                total_products = len(products)
                start_time = time.time()
                start_timestamp = datetime.utcnow()
                
                # Stats
                stats = {
                    'groq_successes': 0, 'cerebras_successes': 0, 'gemini_successes': 0,
                    'openrouter_successes': 0, 'e2b_successes': 0, 'fallback_1b_uses': 0,
                    'cache_hits': 0
                }

                # Initial Event
                yield f"data: {json.dumps({'type': 'init', 'message': 'Starting AI classification...', 'total_products': total_products, 'cascade': 'Groq → OpenRouter → Gemini → Cerebras → E2B → 1B', 'job_id': job_id, 'selected_models': model_overrides})}\n\n"

                for i, product in enumerate(products):
                    if is_cancelled():
                        yield f"data: {json.dumps({'type': 'stopped', 'message': 'Classification stopped by user', 'current': i, 'total': total_products, 'results_so_far': results})}\n\n"
                        break
                    
                    product_name = product.get('product_name', product.get('name', 'Unknown'))
                    
                    # Product Start
                    yield f"data: {json.dumps({'type': 'product_start', 'current': i + 1, 'total': total_products, 'percentage': (i / total_products) * 100, 'current_product': product_name, 'message': f'Classifying: {product_name}', 'step': 'Model Cascade'})}\n\n"
                    yield f"data: {json.dumps({'type': 'model_trying', 'message': 'Starting model cascade...', 'current_model': 'Cascade', 'step': 'Groq → OpenRouter → Gemini → Cerebras → E2B → 1B'})}\n\n"

                    classification_start = time.time()
                    
                    # Callbck placeholder
                    def progress_callback(message, current_model): pass

                    if is_cancelled():
                        yield f"data: {json.dumps({'type': 'stopped', 'message': 'Classification stopped by user', 'current': i, 'total': total_products, 'results_so_far': results})}\n\n"
                        break

                    try:
                        result = classifier.classify_product_ai_only(
                            product_name,
                            product.get('price', ''),
                            product.get('image_url', ''),
                            progress_callback=progress_callback,
                            use_cache=use_cache,
                            store_in_cache=store_in_cache,
                            model_overrides=model_overrides,
                            cancel_event=cancel_event
                        )
                        result['status'] = 'success'
                        classification_time = time.time() - classification_start
                        model_used = result.get('model_used', 'E2B')

                        if model_used == 'CACHE':
                            stats['cache_hits'] += 1
                            cache_info = result.get('cache_info', {})
                            response_data = {
                                'type': 'cache_hit',
                                'message': f"Cache hit ({cache_info.get('match_type', 'exact')} match, {cache_info.get('confidence', 1.0):.1%} confidence)",
                                'model_used': 'CACHE',
                                'processing_time': f"{classification_time:.3f}s",
                                'cache_info': cache_info
                            }
                            yield f"data: {json.dumps(response_data)}\n\n"
                        else:
                            if 'GROQ' in model_used: stats['groq_successes'] += 1
                            elif 'CEREBRAS' in model_used: stats['cerebras_successes'] += 1
                            elif 'GEMINI' in model_used: stats['gemini_successes'] += 1
                            elif 'OPENROUTER' in model_used: stats['openrouter_successes'] += 1
                            elif model_used == 'E2B': stats['e2b_successes'] += 1
                            elif model_used == '1B': stats['fallback_1b_uses'] += 1
                            
                            response_data = {
                                'type': 'model_success', 
                                'message': f"{model_used} model successful.", 
                                'model_used': model_used, 
                                'processing_time': f"{classification_time:.1f}s", 
                                'selected_model': result.get('selected_model')
                            }
                            yield f"data: {json.dumps(response_data)}\n\n"

                        yield f"data: {json.dumps({'type': 'ai_response', 'response': result.get('complete_ai_response', ''), 'model_used': model_used, 'selected_model': result.get('selected_model')})}\n\n"
                        
                        
                        parsed_payload = {
                            'type': 'parsed_classification', 
                            'classification': {
                                'product_type': result.get('PRODUCT_TYPE') or result.get('product_type', 'Unknown'), 
                                'brand_name': result.get('BRAND_NAME') or result.get('brand_name', 'None'), 
                                'product_name': result.get('PRODUCT_NAME') or result.get('product_name', 'Unknown'), 
                                'size': result.get('SIZE') or result.get('size', 'None'), 
                                'variety': result.get('VARIETY') or result.get('variety', 'None')
                            }, 
                            'model_used': model_used, 
                            'selected_model': result.get('selected_model')
                        }
                        yield f"data: {json.dumps(parsed_payload)}\n\n"

                    except Exception as e:
                        if is_cancelled():
                                yield f"data: {json.dumps({'type': 'stopped', 'message': 'Classification stopped by user', 'current': i, 'total': total_products, 'results_so_far': results})}\n\n"
                             break
                        result = {
                            'product_type': 'AI_FAILED', 'brand_name': None, 'product_name': product_name, 'size': None, 'variety': None,
                            'price': product.get('price', ''), 'image_url': product.get('image_url', ''), 'original_name': product_name,
                            'error': str(e), 'status': 'error', 'model_used': 'FAILED'
                        }
                        yield f"data: {json.dumps({'type': 'classification_error', 'message': f'Classification failed: {str(e)}'})}\n\n"
                    
                    results.append(result)
                    
                    # Progress Update
                    progress_data = {
                        'type': 'progress', 'current': i + 1, 'total': total_products, 'percentage': ((i + 1) / total_products) * 100,
                        'current_product': product_name, 'completed_products': len(results),
                        **stats
                    }
                    yield f"data: {json.dumps(progress_data)}\n\n"
                    yield f"data: {json.dumps({'type': 'result', 'result': result})}\n\n"
                    
                    # Optimization Pause
                    if i < total_products - 1:
                        yield f"data: {json.dumps({'type': 'optimization_pause', 'message': 'Brief pause for CPU optimization.'})}\n\n"
                        remaining = 2.0
                        step = 0.1
                        while remaining > 0:
                            if is_cancelled(): break
                            time.sleep(step)
                            remaining -= step
                        if is_cancelled():
                                yield f"data: {json.dumps({'type': 'stopped', 'message': 'Classification stopped by user', 'current': i + 1, 'total': total_products, 'results_so_far': results})}\n\n"
                             break

                # Completion
                total_time = time.time() - start_time
                if is_cancelled():
                     msg = 'Classification stopped. Partial results returned.'
                     event_type = 'session_cancelled'
                else:
                     msg = f'Smart AI classification complete. {stats["cache_hits"]} cache hits recorded.'
                     event_type = 'session_completed'

                summary_data = {
                    'type': 'complete',
                    'results': results,
                    'stats': {
                        'total_time': f"{total_time:.1f}s",
                        'avg_time_per_product': f"{(total_time / len(results) if results else 0):.1f}s",
                        'successful': len([r for r in results if r.get('status') == 'success']),
                        'failed': len(results) - len([r for r in results if r.get('status') == 'success']),
                        **stats
                    },
                    'message': msg
                }
                yield f"data: {json.dumps(summary_data)}\n\n"

                self.history_service.record_event(event_type, msg, {
                     'job_id': job_id, 'started_at': start_timestamp.isoformat(), 'completed_at': datetime.utcnow().isoformat(),
                     'duration_seconds': total_time, 'total_products': total_products,
                     'successful': summary_data['stats']['successful'], 'failed': summary_data['stats']['failed'],
                     'model_counts': stats
                })

            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
            finally:
                cleanup_job()

        return generate
