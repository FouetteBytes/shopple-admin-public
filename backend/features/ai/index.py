from flask import Blueprint
from backend.features.ai.service.classifier_service import ClassifierService
from backend.features.ai.service.classifier_history_service import ClassificationHistoryService
from backend.features.ai.service.classifier_export_service import ClassifierExportService
from backend.features.ai.controller.classifier_controller import ClassifierController
from services.system.security import limiter

# Instantiate Services
classifier_service = ClassifierService()
history_service = ClassificationHistoryService()
export_service = ClassifierExportService()

# Instantiate Controller
classifier_controller = ClassifierController(classifier_service, history_service, export_service)

# Blueprint
classifier_bp = Blueprint('classifier', __name__)

# Routes
# Stream classify
classifier_bp.add_url_rule('/api/classify', view_func=limiter.limit("5/minute;20/hour")(classifier_controller.classify_products), methods=['POST'])

# Batch classify
classifier_bp.add_url_rule('/api/classify-batch', view_func=limiter.limit("2/minute;10/hour")(classifier_controller.classify_batch), methods=['POST'])

# Stop
classifier_bp.add_url_rule('/api/classify/stop/<job_id>', view_func=classifier_controller.stop_classification, methods=['POST'])

# Download Results
classifier_bp.add_url_rule('/api/download-results', view_func=classifier_controller.download_results, methods=['POST'])

# Storage (Cloud)
classifier_bp.add_url_rule('/api/classification/storage/upload', view_func=classifier_controller.upload_to_cloud, methods=['POST'])
classifier_bp.add_url_rule('/api/classification/storage/upload/manual', view_func=classifier_controller.manual_upload, methods=['POST'])
classifier_bp.add_url_rule('/api/classification/storage/list', view_func=classifier_controller.list_cloud_files, methods=['GET'])
classifier_bp.add_url_rule('/api/classification/storage/download', view_func=classifier_controller.download_cloud_file, methods=['POST'])
classifier_bp.add_url_rule('/api/classification/storage/delete', view_func=classifier_controller.delete_cloud_file, methods=['POST'])
classifier_bp.add_url_rule('/api/classification/storage/update', view_func=classifier_controller.update_cloud_metadata, methods=['POST'])

# History
classifier_bp.add_url_rule('/api/classification/history', view_func=classifier_controller.list_history, methods=['GET'])
classifier_bp.add_url_rule('/api/classification/history/event', view_func=classifier_controller.create_event, methods=['POST'])
classifier_bp.add_url_rule('/api/classification/history/<event_id>', view_func=classifier_controller.mutate_event, methods=['DELETE', 'PUT'])

# General AI Prompt (for audit analysis, etc.)
classifier_bp.add_url_rule('/api/ai/prompt', view_func=limiter.limit("10/minute;50/hour")(classifier_controller.general_prompt), methods=['POST'])
