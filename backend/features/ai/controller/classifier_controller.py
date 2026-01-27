from flask import request, jsonify, Response, make_response
import json
from common.base.base_controller import BaseController
from backend.features.ai.service.classifier_service import ClassifierService
from backend.features.ai.service.classifier_history_service import ClassificationHistoryService
from backend.features.ai.service.classifier_export_service import ClassifierExportService
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class ClassifierController(BaseController):
    def __init__(self, service: ClassifierService, 
                 history_service: ClassificationHistoryService,
                 export_service: ClassifierExportService):
        self.service = service
        self.history_service = history_service
        self.export_service = export_service

    def classify_products(self):
        # Auth check for streaming endpoint (not handled by global middleware)
        from flask import g
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            try:
                from services.system.auth_middleware import verify_firebase_token
                id_token = auth_header.split('Bearer ')[1]
                decoded_token = verify_firebase_token(id_token)
                g.user_id = decoded_token.get('uid')
                g.user_email = decoded_token.get('email')
            except Exception as e:
                logger.warning(f"Classifier stream auth failed: {e}")
                pass
        
        try:
            data = request.get_json()
            products = data.get('products', [])
            model_overrides = data.get('model_overrides', {})
            
            is_valid, model_errors = self.service.validate_model_overrides(model_overrides)
            if not is_valid: return jsonify({'error': 'Invalid model selection', 'details': model_errors}), 400
            
            if not products: return jsonify({'error': 'No products provided'}), 400

            use_cache = data.get('use_cache', True)
            store_in_cache = data.get('store_in_cache', True)

            logger.info("Classification started", extra={"product_count": len(products), "use_cache": use_cache})
            
            stream_gen = self.service.stream_classification(products, model_overrides, use_cache, store_in_cache)
            
            return Response(
                stream_gen(),
                mimetype='text/event-stream',
                headers={'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*'}
            )
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def stop_classification(self, job_id):
        try:
            success = self.service.stop_job(job_id)
            if not success: return jsonify({'error': 'Job not found'}), 404
            return jsonify({'success': True, 'message': f'Stopping job {job_id}'})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def classify_batch(self):
        try:
            data = request.get_json()
            products = data.get('products', [])
            model_overrides = data.get('model_overrides', {})
            
            is_valid, model_errors = self.service.validate_model_overrides(model_overrides)
            if not is_valid: return jsonify({'error': 'Invalid model selection', 'details': model_errors}), 400
            if not products: return jsonify({'error': 'No products provided'}), 400

            results = self.service.batch_classify(products, model_overrides)
            return jsonify({'results': results})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def download_results(self):
        try:
            data = request.get_json() or {}
            results = data.get('results', [])
            if not results: return jsonify({'error': 'No results'}), 400
            
            filename, payload, _ = self.export_service.build_export_payload(
                results, data.get('supermarket', 'unknown'), 
                data.get('classification_date', ''), data.get('custom_name', '')
            )
            
            response = make_response(
                json.dumps(payload, indent=2, ensure_ascii=False),
                mimetype='application/json',
                headers={
                    'Content-Disposition': f'attachment; filename="{filename}"',
                    'Content-Type': 'application/json; charset=utf-8'
                }
            )
            logger.info("Results downloaded", extra={"filename": filename})
            return response
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def upload_to_cloud(self):
        try:
            data = request.get_json() or {}
            if not data.get('results'): return jsonify({'error': 'No results'}), 400
            
            res, _, storage_meta, filename = self.export_service.upload_to_cloud(
                data.get('results'), data.get('supermarket'), 
                data.get('classification_date'), data.get('custom_name')
            )
            
            if not res.get('success'): return jsonify({'error': res.get('error')}), 500
            
            return jsonify({
                'success': True, 'filename': filename, 'cloud_path': res.get('cloud_path'),
                'metadata': res.get('metadata'), # This is confusing in original code but sticking to functionality
                'storage_metadata': storage_meta, 'file_size': res.get('file_size')
            })
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def manual_upload(self):
        try:
            data = request.get_json() or {}
            if not data.get('results'): return jsonify({'error': 'No results'}), 400
            
            res, filename, storage_meta = self.export_service.manual_upload(
                data.get('results'), data.get('supermarket'), data.get('classification_date'), 
                data.get('custom_name'), data.get('filename')
            )
            
            if not res.get('success'): return jsonify({'error': res.get('error')}), 500
            
            return jsonify({
                 'success': True, 'filename': filename, 'cloud_path': res.get('cloud_path'),
                 'metadata': storage_meta, 'file_size': res.get('file_size')
            })
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def list_cloud_files(self):
        try:
            result = self.export_service.list_files()
            return jsonify(result), (200 if result.get('success') else 500)
        except Exception as e: return jsonify({'error': str(e)}), 500

    def download_cloud_file(self):
        try:
            cloud_path = request.get_json().get('cloud_path')
            if not cloud_path: return jsonify({'error': 'path needed'}), 400
            
            result = self.export_service.download_file(cloud_path)
            if not result.get('success'): 
                return jsonify(result), (404 if result.get('error') == 'File not found' else 500)
                
            content = result.get('content', '')
            try: parsed = json.loads(content)
            except: parsed = None
            
            return jsonify({
                'success': True, 'cloud_path': cloud_path, 'filename': result.get('filename'),
                'metadata': result.get('metadata'), 'size': result.get('size'),
                'updated': result.get('updated'), 'data': parsed, 'raw': None if parsed else content
            })
        except Exception as e: return jsonify({'error': str(e)}), 500

    def delete_cloud_file(self):
        try:
            cloud_path = request.get_json().get('cloud_path')
            if not cloud_path: return jsonify({'error': 'path needed'}), 400
            result = self.export_service.delete_file(cloud_path)
            return jsonify(result), (200 if result.get('success') else 404 if 'found' in result.get('error', '') else 500)
        except Exception as e: return jsonify({'error': str(e)}), 500

    def update_cloud_metadata(self):
        try:
            d = request.get_json()
            result = self.export_service.update_metadata(d.get('cloud_path'), d.get('updates', {}))
            return jsonify(result), (200 if result.get('success') else 500)
        except Exception as e: return jsonify({'error': str(e)}), 500

    # History Methods
    def list_history(self):
        try:
            limit = int(request.args.get('limit', 100))
            result = self.history_service.list_events(limit)
            return jsonify(result), (200 if result.get('success') else 500)
        except Exception as e: return jsonify({'error': str(e)}), 500

    def create_event(self):
        try:
            d = request.get_json() or {}
            res = self.history_service.record_event(d.get('event_type'), d.get('summary', ''), d.get('details', {}))
            return jsonify(res), (201 if res.get('success') else 500)
        except Exception as e: return jsonify({'error': str(e)}), 500

    def mutate_event(self, event_id):
        try:
            if request.method == 'DELETE':
                res = self.history_service.delete_event(event_id)
                return jsonify(res), (200 if res.get('success') else 404)
            else:
                res = self.history_service.update_event(event_id, request.get_json() or {})
                return jsonify(res), (200 if res.get('success') else 500)
        except Exception as e: return jsonify({'error': str(e)}), 500

    def general_prompt(self):
        """Handle general AI prompts (for audit log analysis, etc.)"""
        try:
            data = request.get_json()
            prompt = data.get('prompt')
            provider = data.get('provider', 'groq')
            model = data.get('model', 'llama-3.3-70b-versatile')
            stream = data.get('stream', True)
            
            if not prompt:
                return jsonify({'error': 'No prompt provided'}), 400
            
            # Get the appropriate AI handler
            from services.ai_handlers.groq_handler import GroqHandler
            from services.ai_handlers.gemini_handler import GeminiHandler
            from services.ai_handlers.openrouter_handler import OpenRouterHandler
            from services.ai_handlers.cerebras_handler import CerebrasHandler
            
            handler = None
            if provider.lower() == 'groq':
                handler = GroqHandler()
            elif provider.lower() == 'gemini':
                handler = GeminiHandler()
            elif provider.lower() == 'openrouter':
                handler = OpenRouterHandler()
            elif provider.lower() == 'cerebras':
                handler = CerebrasHandler()
            else:
                return jsonify({'error': f'Unknown provider: {provider}'}), 400
            
            if not handler.is_available():
                return jsonify({'error': f'{provider} is not available'}), 503
            
            # System prompt for analysis
            system_prompt = "You are a helpful assistant that provides clear, concise analysis. Format your response in a readable way with sections if needed."
            
            if stream:
                def generate():
                    try:
                        # Use streaming if available
                        if hasattr(handler, 'stream_response'):
                            for chunk in handler.stream_response(prompt, system_prompt=system_prompt, model_override=model):
                                yield f"data: {json.dumps({'content': chunk})}\n\n"
                        else:
                            # Fall back to non-streaming
                            response, status = handler.classify_product(
                                prompt, 
                                use_memory=False, 
                                model_override=model,
                                system_prompt=system_prompt
                            )
                            if status == "SUCCESS" or response:
                                yield f"data: {json.dumps({'content': response})}\n\n"
                            else:
                                yield f"data: {json.dumps({'error': f'AI request failed: {status}'})}\n\n"
                        yield "data: [DONE]\n\n"
                    except Exception as e:
                        logger.error(f"Stream error: {e}")
                        yield f"data: {json.dumps({'error': str(e)})}\n\n"
                
                return Response(
                    generate(),
                    mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'Connection': 'keep-alive'}
                )
            else:
                response, status = handler.classify_product(
                    prompt, 
                    use_memory=False, 
                    model_override=model,
                    system_prompt=system_prompt
                )
                if status == "SUCCESS" or response:
                    return jsonify({'content': response, 'status': 'success'})
                else:
                    return jsonify({'error': f'AI request failed: {status}'}), 500
                    
        except Exception as e:
            logger.error(f"General prompt error: {e}")
            return jsonify({'error': str(e)}), 500
