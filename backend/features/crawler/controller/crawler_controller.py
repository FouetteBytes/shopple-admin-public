from flask import request, jsonify, Response, send_file
from common.base.base_controller import BaseController
from backend.features.crawler.service.crawler_service import CrawlerService
from backend.features.crawler.service.scheduler_service import SchedulerService
from services.system.logger_service import get_logger, log_error
import os
import json
import time
from services.system.initialization import is_services_initializing

logger = get_logger(__name__)
FRONTEND_ORIGIN = os.environ.get('FRONTEND_ORIGIN', '*')
LIMIT_MODES = {"default", "custom", "all"}

class CrawlerController(BaseController):
    def __init__(self, crawler_service: CrawlerService, scheduler_service: SchedulerService):
        self.crawler_service = crawler_service
        self.scheduler_service = scheduler_service

    def _normalize_limit_mode(self, raw_mode, has_explicit_max: bool = False) -> str:
        if isinstance(raw_mode, str):
            candidate = raw_mode.strip().lower()
            if candidate in LIMIT_MODES:
                return candidate
        return "custom" if has_explicit_max else "default"

    # Crawler Management Endpoints

    def crawler_status(self):
        return jsonify(self.crawler_service.get_status())

    def get_available_crawlers(self):
        if is_services_initializing():
            return jsonify({'initializing': True, 'crawlers': []}), 200
        try:
            crawlers = self.crawler_service.get_available_crawlers()
            return jsonify({'crawlers': crawlers, 'initializing': False})
        except Exception as e:
             if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
             return jsonify({'error': str(e)}), 500

    def start_crawler(self):
        try:
            data = request.get_json()
            store = data.get('store')
            category = data.get('category') 
            max_items = data.get('max_items')
            headless_mode = data.get('headless_mode', False)
            limit_mode = self._normalize_limit_mode(data.get('limit_mode'), max_items is not None)
            if limit_mode == 'all':
                max_items = None
            
            if not store or not category:
                return jsonify({'error': 'Store and category are required'}), 400
            
            crawler_id = self.crawler_service.start_crawler(store, category, max_items, headless_mode, limit_mode)
            
            logger.info("Crawler started", extra={"crawler_id": crawler_id, "store": store, "category": category, "headless": headless_mode})
            
            return jsonify({
                'success': True,
                'crawler_id': crawler_id,
                'message': f'Started {store} {category} crawler{"(headless)" if headless_mode else ""}'
            })
        except Exception as e:
            log_error(logger, e, context={"route": "start_crawler", "store": data.get('store'), "category": data.get('category')})
            if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
            return jsonify({'error': str(e)}), 500

    def start_multiple_crawlers(self):
        try:
            data = request.get_json() or {}
            raw_specs = data.get('crawlers', [])
            
            if not raw_specs:
                return jsonify({'error': 'No crawler specifications provided'}), 400

            batch_mode = (data.get('mode') or data.get('batch_mode') or 'sequential').lower()
            wait_for_completion = bool(data.get('wait_for_completion', False))

            crawler_specs = []
            for raw_spec in raw_specs:
                spec = dict(raw_spec or {})
                if 'maxItems' in spec and 'max_items' not in spec:
                    spec['max_items'] = spec.pop('maxItems')
                has_explicit_max = spec.get('max_items') is not None
                limit_mode = self._normalize_limit_mode(spec.get('limit_mode') or spec.get('limitMode'), has_explicit_max)
                spec['limit_mode'] = limit_mode
                if limit_mode == 'all':
                    spec.pop('max_items', None)
                crawler_specs.append(spec)

            crawler_ids = self.crawler_service.start_crawlers_batch(
                crawler_specs,
                mode=batch_mode,
                wait_for_completion=wait_for_completion,
            )
            
            return jsonify({
                'success': True,
                'crawler_ids': crawler_ids,
                'count': len(crawler_ids),
                'mode': batch_mode,
                'message': f'Started {len(crawler_ids)} crawlers in {batch_mode} mode'
            })
        except Exception as e:
            if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
            return jsonify({'error': str(e)}), 500

    def start_crawler_group(self):
        data = request.get_json() or {}
        mode = (data.get('mode') or 'store').lower()
        batch_mode = (data.get('batch_mode') or 'parallel').lower()
        max_items_raw = data.get('max_items')
        try:
            max_items = int(max_items_raw) if max_items_raw is not None else None
        except (TypeError, ValueError):
            return jsonify({'error': 'max_items must be numeric'}), 400
        headless_mode_raw = data.get('headless_mode')
        if isinstance(headless_mode_raw, str):
            headless_mode = headless_mode_raw.strip().lower() in ('true', '1', 'yes', 'on')
        else:
            headless_mode = bool(headless_mode_raw) if headless_mode_raw is not None else None

        limit_mode_raw = data.get('limit_mode') or data.get('limitMode')
        limit_mode = self._normalize_limit_mode(limit_mode_raw, max_items is not None)
        if limit_mode == 'all':
            max_items = None

        try:
            if mode == 'store':
                store = data.get('store')
                if not store:
                    return jsonify({'error': 'Store is required for store mode'}), 400
                categories = data.get('categories')
                crawler_ids = self.crawler_service.start_store_group(
                    store,
                    categories=categories,
                    mode=batch_mode,
                    max_items=max_items,
                    headless_mode=headless_mode,
                    limit_mode=limit_mode,
                )
            elif mode == 'category':
                category = data.get('category')
                if not category:
                    return jsonify({'error': 'Category is required for category mode'}), 400
                stores = data.get('stores')
                crawler_ids = self.crawler_service.start_category_group(
                    category,
                    stores=stores,
                    mode=batch_mode,
                    max_items=max_items,
                    headless_mode=headless_mode,
                    limit_mode=limit_mode,
                )
            elif mode == 'all':
                crawler_ids = self.crawler_service.start_all_available_crawlers(
                    mode=batch_mode,
                    max_items=max_items,
                    headless_mode=headless_mode,
                    limit_mode=limit_mode,
                )
            elif mode == 'custom':
                 # Custom mode logic reused from wrapper because logic is heavy in route original
                raw_specs = data.get('crawlers') or []
                if not raw_specs:
                    return jsonify({'error': 'No crawler specifications provided for custom mode'}), 400
                prepared_specs = []
                for spec in raw_specs:
                    store = spec.get('store')
                    category = spec.get('category')
                    if not store or not category:
                        continue

                    entry = {'store': store, 'category': category}
                    spec_max = spec.get('max_items') or spec.get('maxItems')
                    entry_max = None
                    if limit_mode != 'all':
                        if max_items is not None:
                            entry_max = max_items
                        elif spec_max is not None:
                            try:
                                entry_max = int(spec_max)
                            except (TypeError, ValueError):
                                entry_max = None
                    if entry_max is not None:
                        entry['max_items'] = entry_max

                    spec_headless = spec.get('headless_mode') or spec.get('headlessMode')
                    if headless_mode is not None:
                        entry['headless_mode'] = headless_mode
                    elif isinstance(spec_headless, str):
                        entry['headless_mode'] = spec_headless.strip().lower() in ('true', '1', 'yes', 'on')
                    elif spec_headless is not None:
                        entry['headless_mode'] = bool(spec_headless)

                    entry_has_max = entry.get('max_items') is not None
                    spec_limit_mode = spec.get('limit_mode') or spec.get('limitMode')
                    if limit_mode_raw is not None:
                        entry_limit_mode = limit_mode
                    else:
                        entry_limit_mode = self._normalize_limit_mode(spec_limit_mode, entry_has_max)
                    if entry_limit_mode == 'all':
                        entry.pop('max_items', None)
                    entry['limit_mode'] = entry_limit_mode

                    prepared_specs.append(entry)

                if not prepared_specs:
                    return jsonify({'error': 'No valid crawler specifications provided'}), 400

                crawler_ids = self.crawler_service.start_crawlers_batch(
                    prepared_specs,
                    mode=batch_mode,
                    wait_for_completion=False # Explicitly False as per logic analysis
                )
            else:
                return jsonify({'error': f'Unsupported mode: {mode}'}), 400

            return jsonify({
                'success': True,
                'crawler_ids': crawler_ids,
                'count': len(crawler_ids),
                'mode': batch_mode,
                'selection_mode': mode,
                'message': f'Started {len(crawler_ids)} crawlers'
            })
        except Exception as exc:
             if 'unavailable' in str(exc): return jsonify({'error': str(exc)}), 503
             return jsonify({'error': str(exc)}), 500

    def stop_crawler(self, crawler_id):
        try:
            success = self.crawler_service.stop_crawler(crawler_id)
            if success:
                return jsonify({
                    'success': True,
                    'message': f'Stopped crawler {crawler_id}'
                })
            else:
                return jsonify({'error': 'Crawler not found or already stopped'}), 404
        except Exception as e:
            if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
            return jsonify({'error': str(e)}), 500

    def stop_all_crawlers(self):
        try:
            stopped_count = self.crawler_service.stop_all_crawlers()
            return jsonify({
                'success': True,
                'stopped_count': stopped_count,
                'message': f'Stopped {stopped_count} crawlers'
            })
        except Exception as e:
            if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
            return jsonify({'error': str(e)}), 500

    def get_crawler_status(self, crawler_id):
        try:
            status = self.crawler_service.get_crawler_status(crawler_id)
            return jsonify(status)
        except Exception as e:
            if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
            return jsonify({'error': str(e)}), 500

    def get_all_crawler_statuses(self):
        try:
            statuses = self.crawler_service.get_all_crawler_statuses()
            return jsonify({'crawlers': statuses})
        except Exception as e:
            if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
            return jsonify({'error': str(e)}), 500

    def get_crawler_results(self, crawler_id):
        try:
            results = self.crawler_service.get_crawler_results(crawler_id)
            
            if results and 'items' in results:
                return jsonify({
                    'success': True,
                    'items': results['items'],
                    'crawler_id': crawler_id,
                    'total_items': len(results['items']),
                    'timestamp': results.get('timestamp', '')
                })
            else:
                # Try to check if crawler is completed but results not yet available
                status = self.crawler_service.get_crawler_status(crawler_id)
                if status.get('status') == 'completed':
                    return jsonify({
                        'error': 'Results are being processed, please try again in a moment',
                        'status': 'processing'
                    }), 202
                else:
                    return jsonify({
                        'error': 'Results not found or crawler not completed',
                        'status': status.get('status', 'unknown')
                    }), 404
        except Exception as e:
            if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
            return jsonify({'error': str(e)}), 500

    def get_all_crawler_results(self):
        try:
            results = self.crawler_service.get_all_results()
            return jsonify({'results': results})
        except Exception as e:
            if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
            return jsonify({'error': str(e)}), 500

    def list_output_files(self):
        try:
            files = self.crawler_service.list_output_files()
            return jsonify({'files': files})
        except Exception as e:
            if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
            return jsonify({'error': str(e)}), 500

    def load_output_file(self, store, filename):
        try:
            data = self.crawler_service.load_output_file(store, filename)
            if data and 'error' not in data:
                return jsonify(data)
            else:
                return jsonify({'error': data.get('error', 'File not found')}), 404
        except Exception as e:
            if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
            return jsonify({'error': str(e)}), 500

    def delete_output_file(self, store, filename):
        try:
            result = self.crawler_service.delete_output_file(store, filename)
            if 'error' in result:
                return jsonify(result), 404
            else:
                return jsonify(result)
        except Exception as e:
            if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
            return jsonify({'error': str(e)}), 500

    def aggregate_crawler_results(self):
        try:
            data = request.get_json()
            crawler_ids = data.get('crawler_ids', [])
            
            if not crawler_ids:
                return jsonify({'error': 'No crawler IDs provided'}), 400
            
            aggregated = self.crawler_service.aggregate_results(crawler_ids)
            return jsonify(aggregated)
        except Exception as e:
            if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
            return jsonify({'error': str(e)}), 500

    def cleanup_crawlers(self):
        try:
            data = request.get_json()
            max_age_hours = data.get('max_age_hours', 24)
            cleaned_count = self.crawler_service.cleanup_completed_crawlers(max_age_hours)
            return jsonify({
                'success': True,
                'cleaned_count': cleaned_count,
                'message': f'Cleaned up {cleaned_count} old crawlers'
            })
        except Exception as e:
            if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
            return jsonify({'error': str(e)}), 500

    def load_crawler_results_to_classifier(self):
        try:
            data = request.get_json()
            crawler_ids = data.get('crawler_ids', [])
            
            if not crawler_ids:
                return jsonify({'error': 'No crawler IDs provided'}), 400
            
            aggregated = self.crawler_service.aggregate_results(crawler_ids)
            
            if not aggregated['items']:
                return jsonify({'error': 'No items found in specified crawlers'}), 404
            
            products_for_classification = []
            for item in aggregated['items']:
                products_for_classification.append({
                    'product_name': item.get('product_name', ''),
                    'price': item.get('price', ''),
                    'image_url': item.get('image_url', '')
                })
            
            return jsonify({
                'success': True,
                'products': products_for_classification,
                'source': 'crawler',
                'total_items': len(products_for_classification),
                'summary': aggregated.get('summary', {}),
                'message': f'Successfully loaded {len(products_for_classification)} products from crawlers'
            })
        except Exception as e:
            if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
            return jsonify({'error': str(e)}), 500

    def clear_crawler_results(self):
        try:
            data = request.get_json() or {}
            result_ids = data.get('result_ids', [])
            clear_all = data.get('clear_all', False)
            
            if clear_all:
                cleared_count = self.crawler_service.clear_all_results()
                return jsonify({
                    'success': True,
                    'message': f'Cleared all {cleared_count} results',
                    'cleared_count': cleared_count
                })
            elif result_ids:
                cleared_count = self.crawler_service.clear_results(result_ids)
                return jsonify({
                    'success': True,
                    'message': f'Cleared {cleared_count} results',
                    'cleared_count': cleared_count,
                    'cleared_ids': result_ids
                })
            else:
                return jsonify({'error': 'No result IDs provided and clear_all not set'}), 400
        except Exception as e:
            if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
            return jsonify({'error': str(e)}), 500
    
    def clear_crawler_activities(self):
        try:
            data = request.get_json() or {}
            activity_ids = data.get('activity_ids', [])
            clear_all = data.get('clear_all', False)
            
            if clear_all:
                cleared_count = self.crawler_service.clear_all_activities()
                return jsonify({
                    'success': True,
                    'message': f'Successfully cleared all activities',
                    'cleared_count': cleared_count
                })
            elif activity_ids:
                cleared_count = self.crawler_service.clear_specific_activities(activity_ids)
                return jsonify({
                    'success': True,
                    'message': f'Successfully cleared {cleared_count} activities',
                    'cleared_ids': activity_ids,
                    'cleared_count': cleared_count
                })
            else:
                return jsonify({'error': 'No activity IDs provided and clear_all not set'}), 400
        except Exception as e:
            if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
            return jsonify({'error': str(e)}), 500

    def delete_single_result(self, result_id):
        try:
            success = self.crawler_service.delete_result(result_id)
            if success:
                return jsonify({
                    'success': True,
                    'message': f'Result {result_id} deleted successfully'
                })
            else:
                return jsonify({'error': 'Result not found'}), 404
        except Exception as e:
            if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
            return jsonify({'error': str(e)}), 500

    # Scheduler Endpoints

    def list_crawler_schedules(self):
        try:
            schedules = self.scheduler_service.list_schedules()
            return jsonify({'schedules': schedules})
        except Exception as e:
            if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
            return jsonify({'error': str(e)}), 500

    def create_crawler_schedule(self):
        try:
            payload = request.get_json() or {}
            schedule = self.scheduler_service.create_schedule(payload)
            return jsonify({'success': True, 'schedule': schedule}), 201
        except Exception as e:
            if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
            return jsonify({'error': str(e)}), 500

    def update_crawler_schedule(self, schedule_id: str):
        try:
            payload = request.get_json() or {}
            schedule = self.scheduler_service.update_schedule(schedule_id, payload)
            if not schedule:
                return jsonify({'error': 'Schedule not found'}), 404
            return jsonify({'success': True, 'schedule': schedule})
        except Exception as e:
            if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
            return jsonify({'error': str(e)}), 500

    def delete_crawler_schedule(self, schedule_id: str):
        try:
            removed = self.scheduler_service.delete_schedule(schedule_id)
            if not removed:
                return jsonify({'error': 'Schedule not found'}), 404
            return jsonify({'success': True})
        except Exception as e:
            if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
            return jsonify({'error': str(e)}), 500

    def toggle_crawler_schedule(self, schedule_id: str):
        try:
            payload = request.get_json() or {}
            enabled = payload.get('enabled')
            if enabled is None:
                return jsonify({'error': 'enabled flag is required'}), 400
            
            schedule = self.scheduler_service.toggle_schedule(schedule_id, bool(enabled))
            if not schedule:
                return jsonify({'error': 'Schedule not found'}), 404
            return jsonify({'success': True, 'schedule': schedule})
        except Exception as e:
            if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
            return jsonify({'error': str(e)}), 500

    def run_crawler_schedule_now(self, schedule_id: str):
        try:
            schedule = self.scheduler_service.trigger_schedule_now(schedule_id)
            if not schedule:
                return jsonify({'error': 'Schedule not found'}), 404
            return jsonify({'success': True, 'schedule': schedule})
        except Exception as e:
            if 'unavailable' in str(e): return jsonify({'error': str(e)}), 503
            return jsonify({'error': str(e)}), 500

    def get_settings(self):
        """Get current crawler settings"""
        try:
            settings = self.crawler_service.get_crawler_settings()
            return jsonify({'success': True, 'settings': settings})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def update_settings(self):
        """Update crawler settings"""
        try:
            data = request.get_json()
            if not data:
                return jsonify({'error': 'No settings provided'}), 400
            
            updated = self.crawler_service.set_crawler_settings(data)
            return jsonify({'success': True, 'settings': updated, 'message': 'Settings updated successfully'})
        except Exception as e:
            return jsonify({'error': str(e)}), 500


