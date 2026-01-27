from flask import request, jsonify
from common.base.base_controller import BaseController
from backend.features.system.service.audit_service import AuditService
from services.system.logger_service import get_logger
from services.system.audit_log_service import get_audit_service

logger = get_logger(__name__)

class AuditController(BaseController):
    def __init__(self, service: AuditService):
        self.service = service

    def ingest_audit_log(self):
        try:
            payload = request.get_json(silent=True)
            if payload is None: return jsonify({"error": "Invalid or missing JSON payload"}), 400
            
            ingested = self.service.ingest_logs(payload)
            if not ingested: return jsonify({"error": "No valid audit entries provided"}), 400
            
            return jsonify({"status": "ok", "ingested": ingested}), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def ingest_frontend_log(self):
        """
        Ingest general frontend logs (console errors, network issues, etc.)
        Allows frontend to send logs when hosted separately from backend.
        """
        try:
            payload = request.get_json(silent=True)
            if payload is None: 
                return jsonify({"error": "Invalid or missing JSON payload"}), 400
            
            entries = payload if isinstance(payload, list) else [payload]
            ingested = 0
            
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                    
                # Normalize frontend log entry
                level = str(entry.get('level', 'INFO')).upper()
                if level not in ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'):
                    level = 'INFO'
                
                log_method = getattr(logger, level.lower(), logger.info)
                log_method(
                    entry.get('message', 'Frontend log'),
                    extra={
                        'component': 'frontend',
                        'frontend_source': entry.get('source', 'client'),
                        'frontend_url': entry.get('url'),
                        'frontend_user_agent': entry.get('userAgent'),
                        'frontend_session_id': entry.get('sessionId'),
                        'frontend_user_id': entry.get('userId'),
                        'frontend_user_email': entry.get('userEmail'),
                        'frontend_error_stack': entry.get('stack'),
                        'frontend_error_name': entry.get('errorName'),
                        'frontend_details': entry.get('details', {}),
                        'frontend_timestamp': entry.get('timestamp'),
                    }
                )
                ingested += 1
            
            return jsonify({"status": "ok", "ingested": ingested}), 200
        except Exception as e:
            logger.error(f"Failed to ingest frontend logs: {e}")
            return jsonify({'error': str(e)}), 500

    def list_audit_logs(self):
        try:
            result = self.service.list_logs(
                user_email=request.args.get('user_email'),
                action=request.args.get('action'),
                start_date=request.args.get('start_date'),
                end_date=request.args.get('end_date'),
                search=request.args.get('search'),
                limit=int(request.args.get('limit', 100)),
                offset=(int(request.args.get('page', 1)) - 1) * int(request.args.get('limit', 100))
            )
            return jsonify({'success': True, 'logs': result['logs'], 'total': result['total'], 'source': 'opensearch'})
        except Exception as e:
            logger.error(f"Failed to fetch audit logs: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500

    def get_audit_stats(self):
        try:
            stats = self.service.get_stats()
            if stats: return jsonify({'success': True, 'stats': stats})
            return jsonify({'success': False, 'error': 'Stats unavailable'}), 503
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

    def enforce_retention(self):
        try:
             days = int(request.json.get('days', 30))
             task_id = self.service.enforce_retention(days)
             return jsonify({'success': True, 'message': f'Cleanup started for logs older than {days} days', 'task_id': task_id})
        except Exception as e:
             return jsonify({'success': False, 'error': str(e)}), 500

    def get_storage_usage(self):
        """Get OpenSearch storage usage and capacity information."""
        try:
            audit_service = get_audit_service(start_monitor=False)
            usage = audit_service.get_storage_usage()
            return jsonify(usage)
        except Exception as e:
            logger.error(f"Failed to get storage usage: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500

    def optimize_storage(self):
        """Manually trigger storage optimization (delete oldest 30% if over threshold)."""
        try:
            audit_service = get_audit_service(start_monitor=False)
            result = audit_service.auto_optimize_storage()
            return jsonify(result)
        except Exception as e:
            logger.error(f"Failed to optimize storage: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500

    def delete_oldest_records(self):
        """Delete oldest X% of records (default 30%)."""
        try:
            percentage = int(request.json.get('percentage', 30))
            if percentage < 1 or percentage > 90:
                return jsonify({'success': False, 'error': 'Percentage must be between 1 and 90'}), 400
            
            audit_service = get_audit_service(start_monitor=False)
            result = audit_service.delete_oldest_records(percentage)
            return jsonify(result)
        except Exception as e:
            logger.error(f"Failed to delete oldest records: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500
