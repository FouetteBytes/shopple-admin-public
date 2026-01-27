from flask import request, jsonify, send_file
import io
import os
from common.base.base_controller import BaseController
from backend.features.system.service.storage_service import StorageService
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class StorageController(BaseController):
    def __init__(self, service: StorageService):
        self.service = service

    def handle_files(self):
        if not self.service.is_available():
            return jsonify({'error': 'File storage system not available'}), 503
        
        try:
            if request.method == 'GET':
                files = self.service.list_files()
                return jsonify(files)
            
            elif request.method == 'POST':
                data = request.get_json()
                operation = data.get('operation')
                
                if operation == 'upload_to_cloud':
                    return jsonify(self.service.upload_to_cloud(data.get('store'), data.get('category'), data.get('filename')))
                elif operation == 'download_to_local':
                    return jsonify(self.service.download_to_local(data.get('store'), data.get('category'), data.get('filename')))
                elif operation == 'download_to_browser':
                    path = data.get('cloud_path')
                    result = self.service.download_content(path)
                    if result.get('success'):
                         return send_file(
                            io.BytesIO(result['content'].encode()),
                            mimetype='application/json',
                            as_attachment=True,
                            download_name=os.path.basename(path)
                        )
                    else:
                        return jsonify(result), 404
                elif operation == 'make_cloud_only':
                     return jsonify(self.service.make_cloud_only(data.get('store'), data.get('category'), data.get('filename')))
                elif operation == 'view_file':
                     res = self.service.get_file_content(data.get('store'), data.get('category'), data.get('filename'))
                     if res.get('success'):
                         return jsonify({
                            "success": True,
                            "items": res.get('data', []),
                            "count": res.get('total_items', len(res.get('data', []))),
                            "source": res.get('source', 'unknown'),
                            "filename": data.get('filename'),
                            "store": data.get('store'),
                            "category": data.get('category')
                        })
                     else:
                        return jsonify(res)
                elif operation == 'auto_upload':
                     return jsonify(self.service.auto_upload(data.get('store', ''), data.get('category', '')))
                else:
                    return jsonify({'error': 'Invalid operation'}), 400

            elif request.method == 'DELETE':
                if request.args.get('clearAll', 'false').lower() == 'true':
                    return jsonify(self.service.clear_all())
                
                data = request.get_json()
                if not data: return jsonify({'error': 'No data provided'}), 400
                
                if data.get('action') == 'smart_delete':
                    return jsonify(self.service.smart_delete(
                        data.get('store'), data.get('category'), data.get('filename'),
                        data.get('delete_local', True), data.get('delete_cloud', True)
                    ))
                else:
                     return jsonify({'error': 'Invalid delete action'}), 400

        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def handle_config(self):
        if not self.service.is_available(): return jsonify({'error': 'File storage system not available'}), 503
        try:
            if request.method == 'GET':
                return jsonify(self.service.get_config())
            elif request.method == 'POST':
                return jsonify(self.service.save_config(request.get_json()))
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def get_file_status(self, store, category, filename):
         if not self.service.is_available(): return jsonify({'error': 'File storage system not available'}), 503
         try:
             return jsonify(self.service.get_file_status(store, category, filename))
         except Exception as e:
             return jsonify({'error': str(e)}), 500

    def get_progress(self):
        if not self.service.is_available(): return jsonify({'error': 'File storage system not available'}), 503
        try:
             return jsonify(self.service.get_progress())
        except Exception as e:
             return jsonify({'error': str(e)}), 500

    def download_inspect(self, store, category, filename):
        if not self.service.is_available(): return jsonify({'error': 'File storage system not available'}), 503
        try:
            result = self.service.download_and_inspect(store, category, filename)
            if not result.get('success'):
                return jsonify(result), 404
            
            response = send_file(
                io.BytesIO(result['content'].encode()),
                mimetype='application/json',
                as_attachment=True,
                download_name=filename
            )
            response.headers['X-Shopple-Storage-Status'] = result.get('cleanup_status', 'cloud_only')
            response.headers['X-Shopple-Inspect'] = '1'
            return response
        except Exception as e:
            return jsonify({'error': str(e)}), 500
