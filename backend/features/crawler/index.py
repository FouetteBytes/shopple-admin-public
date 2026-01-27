from flask import Blueprint, Response
from backend.features.crawler.controller.crawler_controller import CrawlerController
from backend.features.crawler.service.crawler_service import CrawlerService
from backend.features.crawler.service.scheduler_service import SchedulerService
from services.system.initialization import get_crawler_manager
from services.system.logger_service import get_logger
import json
import time
import os

logger = get_logger(__name__)
FRONTEND_ORIGIN = os.environ.get('FRONTEND_ORIGIN', '*')

# Dependency Injection
crawler_service = CrawlerService()
scheduler_service = SchedulerService()
crawler_controller = CrawlerController(crawler_service, scheduler_service)

# Blueprint
crawler_bp = Blueprint('crawler_feature', __name__)

# Routes - Crawler Management (all routes prefixed with /api for consistent Ingress routing)
crawler_bp.add_url_rule('/api/crawler/status', view_func=crawler_controller.crawler_status, methods=['GET'])
crawler_bp.add_url_rule('/api/crawler/available', view_func=crawler_controller.get_available_crawlers, methods=['GET'])
crawler_bp.add_url_rule('/api/crawler/start', view_func=crawler_controller.start_crawler, methods=['POST'])
crawler_bp.add_url_rule('/api/crawler/start-multiple', view_func=crawler_controller.start_multiple_crawlers, methods=['POST'])
crawler_bp.add_url_rule('/api/crawler/start-group', view_func=crawler_controller.start_crawler_group, methods=['POST'])
crawler_bp.add_url_rule('/api/crawler/stop/<crawler_id>', view_func=crawler_controller.stop_crawler, methods=['POST'])
crawler_bp.add_url_rule('/api/crawler/stop-all', view_func=crawler_controller.stop_all_crawlers, methods=['POST'])
crawler_bp.add_url_rule('/api/crawler/status/<crawler_id>', view_func=crawler_controller.get_crawler_status, methods=['GET'])
crawler_bp.add_url_rule('/api/crawler/status-all', view_func=crawler_controller.get_all_crawler_statuses, methods=['GET'])
crawler_bp.add_url_rule('/api/crawler/results/<crawler_id>', view_func=crawler_controller.get_crawler_results, methods=['GET'])
crawler_bp.add_url_rule('/api/crawler/results', view_func=crawler_controller.get_all_crawler_results, methods=['GET'])
crawler_bp.add_url_rule('/api/crawler/output-files', view_func=crawler_controller.list_output_files, methods=['GET'])
crawler_bp.add_url_rule('/api/crawler/load-file/<store>/<filename>', view_func=crawler_controller.load_output_file, methods=['GET'])
crawler_bp.add_url_rule('/api/crawler/delete-file/<store>/<filename>', view_func=crawler_controller.delete_output_file, methods=['DELETE'])
crawler_bp.add_url_rule('/api/crawler/aggregate', view_func=crawler_controller.aggregate_crawler_results, methods=['POST'])
crawler_bp.add_url_rule('/api/crawler/cleanup', view_func=crawler_controller.cleanup_crawlers, methods=['POST'])
crawler_bp.add_url_rule('/api/crawler/load-to-classifier', view_func=crawler_controller.load_crawler_results_to_classifier, methods=['POST'])
crawler_bp.add_url_rule('/api/crawler/clear-results', view_func=crawler_controller.clear_crawler_results, methods=['POST'])
crawler_bp.add_url_rule('/api/crawler/clear-activities', view_func=crawler_controller.clear_crawler_activities, methods=['POST'])
crawler_bp.add_url_rule('/api/crawler/result/<result_id>', view_func=crawler_controller.delete_single_result, methods=['DELETE'])

# Routes - Settings
crawler_bp.add_url_rule('/api/crawler/settings', view_func=crawler_controller.get_settings, methods=['GET'])
crawler_bp.add_url_rule('/api/crawler/settings', view_func=crawler_controller.update_settings, methods=['PUT', 'POST'])

# Routes - Scheduler
crawler_bp.add_url_rule('/api/crawler/schedules', view_func=crawler_controller.list_crawler_schedules, methods=['GET'])
crawler_bp.add_url_rule('/api/crawler/schedules', view_func=crawler_controller.create_crawler_schedule, methods=['POST'])
crawler_bp.add_url_rule('/api/crawler/schedules/<schedule_id>', view_func=crawler_controller.update_crawler_schedule, methods=['PUT'])
crawler_bp.add_url_rule('/api/crawler/schedules/<schedule_id>', view_func=crawler_controller.delete_crawler_schedule, methods=['DELETE'])
crawler_bp.add_url_rule('/api/crawler/schedules/<schedule_id>/toggle', view_func=crawler_controller.toggle_crawler_schedule, methods=['POST'])
crawler_bp.add_url_rule('/api/crawler/schedules/<schedule_id>/run', view_func=crawler_controller.run_crawler_schedule_now, methods=['POST'])

# Streams (Implemented inline to preserve generator logic cleanly)
# Ideally this logic moves to service/controller but generator response is Flask-specific.
@crawler_bp.route('/api/crawler/progress/<crawler_id>', methods=['GET'])
def stream_crawler_progress(crawler_id):
    """Stream real-time progress updates for a specific crawler"""
    # Auth check for streaming endpoint (not handled by global middleware)
    from flask import request, g
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        try:
            from services.system.auth_middleware import verify_firebase_token
            id_token = auth_header.split('Bearer ')[1]
            decoded_token = verify_firebase_token(id_token)
            g.user_id = decoded_token.get('uid')
            g.user_email = decoded_token.get('email')
        except Exception as e:
            logger.warning(f"Stream auth failed: {e}")
            # Continue without auth for backward compatibility
            pass
    
    # Checking availability directly or via service? Service preferred but for generator loop...
    # We will use get_crawler_manager() inside generator to minimize latency logic in controller
    from services.system.initialization import is_crawler_available
    if not is_crawler_available():
         return Response(json.dumps({'error': 'Crawler system not available'}), mimetype='application/json', status=503)

    def generate_progress():
        try:
            crawler_manager = get_crawler_manager()
            initial_status = crawler_manager.get_crawler_status(crawler_id)
            if initial_status.get('status') == 'not_running':
                yield f"data: {json.dumps({'type': 'error', 'message': 'Crawler not running'})}\n\n"
                return
            yield f"data: {json.dumps({'type': 'status', 'status': initial_status})}\n\n"
            
            while True:
                try:
                    status = crawler_manager.get_crawler_status(crawler_id)
                    yield f"data: {json.dumps({'type': 'status', 'status': status})}\n\n"
                    if status.get('status') in ['completed', 'failed']:
                        break
                    time.sleep(2)
                except Exception as e:
                    yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
                    break
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
    
    return Response(
        generate_progress(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': FRONTEND_ORIGIN
        }
    )

@crawler_bp.route('/api/crawler/progress-all', methods=['GET'])
def stream_all_crawler_progress():
    # Auth check for streaming endpoint
    from flask import request, g
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        try:
            from services.system.auth_middleware import verify_firebase_token
            id_token = auth_header.split('Bearer ')[1]
            decoded_token = verify_firebase_token(id_token)
            g.user_id = decoded_token.get('uid')
            g.user_email = decoded_token.get('email')
        except Exception as e:
            logger.warning(f"Stream auth failed: {e}")
            pass
    
    from services.system.initialization import is_crawler_available
    if not is_crawler_available():
         return Response(json.dumps({'error': 'Crawler system not available'}), mimetype='application/json', status=503)
    
    def generate_all_progress():
        try:
            crawler_manager = get_crawler_manager()
            while True:
                try:
                    statuses = crawler_manager.get_all_crawler_statuses()
                    yield f"data: {json.dumps({'type': 'statuses', 'statuses': statuses})}\n\n"
                    active_crawlers = [s for s in statuses if s.get('status') not in ['completed', 'failed']]
                    if not active_crawlers:
                        break
                    time.sleep(3)
                except Exception as e:
                    yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
                    break
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
            
    return Response(
        generate_all_progress(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': FRONTEND_ORIGIN
        }
    )
