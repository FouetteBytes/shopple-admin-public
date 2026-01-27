"""
Centralized Audit Service interacting with OpenSearch.
Handles querying logs, enforcing retention policies, and management stats.
"""
from typing import Dict, Any, List, Optional
import os
import time
import threading
from datetime import datetime, timedelta
from opensearchpy import OpenSearch
from services.system.logger_service import get_logger

logger = get_logger(__name__)

# Storage optimization settings
STORAGE_HIGH_THRESHOLD = 0.95  # 95% - trigger cleanup
STORAGE_TARGET_AFTER_CLEANUP = 0.65  # 65% - target after cleanup (remove ~30%)
STORAGE_CHECK_INTERVAL = 300  # Check every 5 minutes


class AuditLogService:
    def __init__(self):
        self.host = os.getenv('OPENSEARCH_HOST', 'opensearch')
        
        # Handle Kubernetes environment variable collision for OPENSEARCH_PORT
        port_env = os.getenv('OPENSEARCH_PORT', '9200')
        try:
            if port_env.startswith('tcp://'):
                # Format: tcp://10.x.x.x:9200
                self.port = int(port_env.split(':')[-1])
            else:
                self.port = int(port_env)
        except (ValueError, TypeError):
            self.port = 9200 # Fallback default

        self.username = os.getenv('OPENSEARCH_USERNAME', 'admin')
        self.password = os.getenv('OPENSEARCH_PASSWORD', 'admin')
        self.index_name = 'shopple-logs' # Matches FluentBit output

        # Initialize Client
        # Note: In a real cluster we use HTTPS and verify certs
        self.client = OpenSearch(
            hosts=[{'host': self.host, 'port': self.port}],
            http_auth=(self.username, self.password) if self.username else None,
            use_ssl=False,
            verify_certs=False,
            ssl_show_warn=False
        )
    
    def is_available(self) -> bool:
        try:
            return self.client.ping()
        except Exception:
            return False

    def list_logs(
        self, 
        user_email: Optional[str] = None, 
        action: Optional[str] = None,
        start_date: Optional[str] = None, 
        end_date: Optional[str] = None, 
        search_term: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Query OpenSearch for audit logs.
        """
        if not self.is_available():
            logger.warning("Audit Service: OpenSearch is not available")
            return {"logs": [], "total": 0, "available": False}
        
        # Build Bool Query
        # Removed the mandatory "AUDIT_EVENT" match to show ALL logs by default if no filters are applied.
        # This helps the admin see everything when the page loads.
        must_clauses = [
             {"exists": {"field": "timestamp"}} # Basic sanity check, ensuring it's a log entry
        ]
        
        # If user explicitly wants "AUDIT_EVENT" types only, we could add a toggle,
        # but the request is to "show available all the logs".
        # However, to keep it somewhat clean, we might want to filter out very noisy debug logs if successful,
        # but let's default to showing everything that looks like a structured log.
        
        if user_email:
            must_clauses.append({"match_phrase": {"user_email": user_email}}) # Changed from audit_user_email to generic user_email field often used in logs
            
        if action:
            must_clauses.append({"match": {"action": action}}) # Changed from audit_action to generic action

        # Date Range
        range_filter = {}
        if start_date:
            range_filter["gte"] = start_date
        if end_date:
            range_filter["lte"] = end_date
            
        if range_filter:
            must_clauses.append({"range": {"timestamp": range_filter}})

        # Free text search across specific fields
        if search_term:
            must_clauses.append({
                "multi_match": {
                    "query": search_term,
                    "fields": ["message", "level", "logger_name", "user_email", "action", "resource"], # Broadened fields
                    "fuzziness": "AUTO"
                }
            })

        body = {
            "from": offset,
            "size": limit,
            "sort": [{"timestamp": "desc"}],
            "query": {
                "bool": {
                    "must": must_clauses
                }
            }
        }
        
        try:
            response = self.client.search(body=body, index=self.index_name)
            hits = response['hits']['hits']
            total = response['hits']['total']['value']
            
            logs = []
            for hit in hits:
                source = hit['_source']
                
                # Robust email extraction
                email = source.get('audit_user_email')
                if not email or email == 'unknown':
                    # Try alternate fields including raw event
                    raw = source.get('raw_audit_event', {})
                    email = source.get('userEmail') or raw.get('userEmail') or raw.get('adminEmail')
                    
                    # Try extracting from details/notes if still missing
                    if not email:
                        notes = source.get('audit_notes', {})
                        if isinstance(notes, dict):
                            email = notes.get('userEmail') or notes.get('adminEmail')

                # Determine Status based on level if audit_success is missing
                status = "Successful"
                if 'audit_success' in source:
                    status = "Successful" if source.get('audit_success') else "Failed"
                else:
                    level = source.get('level', 'INFO').upper()
                    if level in ['ERROR', 'CRITICAL', 'FATAL']:
                        status = "Failed"
                    elif level == 'WARNING':
                        status = "Warning"

                # Construct Notes/Details
                notes = source.get('audit_notes', {})
                if not notes and 'message' in source:
                     notes = {"message": source['message']}
                     # Add extra context if available
                     if 'function' in source:
                         notes['function'] = source['function']
                     if 'line' in source:
                         notes['line'] = source['line']

                # Map OpenSearch fields to frontend expected fields
                logs.append({
                    "id": hit['_id'],
                    "audit_timestamp": source.get('timestamp'),
                    "audit_user_email": email or 'system', # Default to system for app logs
                    "audit_action": source.get('audit_action') or source.get('level', 'UNKNOWN'),
                    "audit_resource": source.get('audit_resource') or source.get('module', 'backend'),
                    "audit_notes": notes,
                    "audit_status": status
                })
                
            return {"logs": logs, "total": total, "available": True}
        except Exception as e:
            logger.error(f"OpenSearch Query Failed: {str(e)}")
            return {"logs": [], "total": 0, "error": str(e)}

    def get_stats(self):
        """Get index statistics for Admin Dashboard"""
        try:
            stats = self.client.indices.stats(index=self.index_name)
            idx_stats = stats['indices'][self.index_name]['total']
            
            return {
                "doc_count": idx_stats['docs']['count'],
                "store_size_in_bytes": idx_stats['store']['size_in_bytes'],
                "deleted_docs": idx_stats['docs']['deleted']
            }
        except Exception:
            return None

    def get_storage_usage(self) -> Dict[str, Any]:
        """
        Get detailed storage usage including memory percentage.
        """
        try:
            # Get cluster health and stats
            cluster_stats = self.client.cluster.stats()
            nodes_stats = self.client.nodes.stats(metric=['jvm', 'os'])
            
            # Get JVM heap usage (this is what's constrained by memory limit)
            jvm_stats = list(nodes_stats['nodes'].values())[0]['jvm'] if nodes_stats.get('nodes') else {}
            heap_used = jvm_stats.get('mem', {}).get('heap_used_in_bytes', 0)
            heap_max = jvm_stats.get('mem', {}).get('heap_max_in_bytes', 1)
            heap_percent = (heap_used / heap_max) if heap_max > 0 else 0
            
            # Get index stats
            idx_stats = self.client.indices.stats(index=self.index_name)
            index_info = idx_stats['indices'].get(self.index_name, {}).get('total', {})
            
            doc_count = index_info.get('docs', {}).get('count', 0)
            store_size = index_info.get('store', {}).get('size_in_bytes', 0)
            
            return {
                "success": True,
                "heap_used_bytes": heap_used,
                "heap_max_bytes": heap_max,
                "heap_percent": round(heap_percent * 100, 2),
                "doc_count": doc_count,
                "store_size_bytes": store_size,
                "store_size_mb": round(store_size / (1024 * 1024), 2),
                "threshold_percent": STORAGE_HIGH_THRESHOLD * 100,
                "needs_cleanup": heap_percent >= STORAGE_HIGH_THRESHOLD
            }
        except Exception as e:
            logger.error(f"Failed to get storage usage: {e}")
            return {"success": False, "error": str(e)}

    def auto_optimize_storage(self) -> Dict[str, Any]:
        """
        Automatically optimize storage when capacity exceeds threshold.
        Deletes oldest 30% of records to bring usage below target.
        """
        try:
            usage = self.get_storage_usage()
            if not usage.get('success'):
                return {"success": False, "error": "Could not get storage usage"}
            
            heap_percent = usage['heap_percent'] / 100
            doc_count = usage['doc_count']
            
            if heap_percent < STORAGE_HIGH_THRESHOLD:
                return {
                    "success": True,
                    "action": "none",
                    "message": f"Storage at {usage['heap_percent']}%, below {STORAGE_HIGH_THRESHOLD * 100}% threshold",
                    "current_docs": doc_count
                }
            
            # Calculate how many docs to delete to reach target
            # If at 95% and target is 65%, we need to free ~30%
            docs_to_delete = int(doc_count * (heap_percent - STORAGE_TARGET_AFTER_CLEANUP) / heap_percent)
            docs_to_delete = max(docs_to_delete, int(doc_count * 0.30))  # At least 30%
            
            logger.warning(f"OpenSearch at {usage['heap_percent']}% capacity. Starting cleanup of {docs_to_delete} oldest documents...")
            
            # Delete oldest documents
            response = self.client.delete_by_query(
                index=self.index_name,
                body={
                    "query": {"match_all": {}},
                    "sort": [{"timestamp": "asc"}],  # Oldest first
                    "size": docs_to_delete
                },
                wait_for_completion=False,  # Async for large deletions
                conflicts="proceed"  # Continue even if some docs changed
            )
            
            # Force merge to reclaim disk space
            try:
                self.client.indices.forcemerge(index=self.index_name, max_num_segments=1)
            except Exception as merge_err:
                logger.warning(f"Force merge failed (non-critical): {merge_err}")
            
            return {
                "success": True,
                "action": "cleanup_started",
                "message": f"Deleting ~{docs_to_delete} oldest documents ({round(docs_to_delete/doc_count*100, 1)}%)",
                "task_id": response.get('task'),
                "before_docs": doc_count,
                "target_delete": docs_to_delete,
                "heap_before_percent": usage['heap_percent']
            }
            
        except Exception as e:
            logger.error(f"Auto-optimize storage failed: {e}")
            return {"success": False, "error": str(e)}

    def delete_oldest_records(self, percentage: int = 30) -> Dict[str, Any]:
        """
        Delete oldest X% of records regardless of current storage.
        Useful for manual cleanup.
        """
        try:
            stats = self.get_stats()
            if not stats:
                return {"success": False, "error": "Could not get index stats"}
            
            doc_count = stats['doc_count']
            docs_to_delete = int(doc_count * (percentage / 100))
            
            if docs_to_delete == 0:
                return {"success": True, "message": "No documents to delete", "deleted": 0}
            
            # Get timestamp of the Nth oldest document
            response = self.client.search(
                index=self.index_name,
                body={
                    "size": 1,
                    "sort": [{"timestamp": "asc"}],
                    "_source": ["timestamp"],
                    "from": docs_to_delete - 1  # Get the cutoff timestamp
                }
            )
            
            if not response['hits']['hits']:
                return {"success": False, "error": "No documents found"}
            
            cutoff_timestamp = response['hits']['hits'][0]['_source']['timestamp']
            
            # Delete all documents older than cutoff
            delete_response = self.client.delete_by_query(
                index=self.index_name,
                body={
                    "query": {
                        "range": {
                            "timestamp": {"lte": cutoff_timestamp}
                        }
                    }
                },
                wait_for_completion=False,
                conflicts="proceed"
            )
            
            logger.info(f"Cleanup started: deleting {docs_to_delete} oldest documents (cutoff: {cutoff_timestamp})")
            
            return {
                "success": True,
                "message": f"Deleting documents older than {cutoff_timestamp}",
                "task_id": delete_response.get('task'),
                "target_delete": docs_to_delete,
                "total_before": doc_count
            }
            
        except Exception as e:
            logger.error(f"Delete oldest records failed: {e}")
            return {"success": False, "error": str(e)}

    def enforce_retention(self, days_to_keep: int) -> int:
        """
        Delete logs older than X days.
        Returns number of deleted documents.
        """
        cutoff_date = (datetime.utcnow() - timedelta(days=days_to_keep)).isoformat()
        
        query = {
            "query": {
                "range": {
                    "timestamp": {
                        "lt": cutoff_date
                    }
                }
            }
        }
        
        try:
            response = self.client.delete_by_query(
                index=self.index_name,
                body=query,
                wait_for_completion=False # Async deletion for large datasets
            )
            return response.get('task') # Returns task ID
        except Exception as e:
            logger.error(f"Retention enforcement failed: {str(e)}")
            raise e


# Background storage monitor
_storage_monitor_running = False
_storage_monitor_thread = None

def _storage_monitor_loop(service: AuditLogService):
    """Background thread that monitors storage and triggers cleanup when needed."""
    global _storage_monitor_running
    logger.info("OpenSearch storage monitor started")
    
    while _storage_monitor_running:
        try:
            if service.is_available():
                usage = service.get_storage_usage()
                if usage.get('success') and usage.get('needs_cleanup'):
                    logger.warning(f"OpenSearch storage at {usage['heap_percent']}% - triggering auto-cleanup")
                    result = service.auto_optimize_storage()
                    logger.info(f"Auto-cleanup result: {result}")
        except Exception as e:
            logger.error(f"Storage monitor error: {e}")
        
        # Sleep in small increments to allow clean shutdown
        for _ in range(STORAGE_CHECK_INTERVAL):
            if not _storage_monitor_running:
                break
            time.sleep(1)
    
    logger.info("OpenSearch storage monitor stopped")


def start_storage_monitor(service: AuditLogService):
    """Start the background storage monitor thread."""
    global _storage_monitor_running, _storage_monitor_thread
    
    if _storage_monitor_running:
        return  # Already running
    
    _storage_monitor_running = True
    _storage_monitor_thread = threading.Thread(target=_storage_monitor_loop, args=(service,), daemon=True)
    _storage_monitor_thread.start()
    logger.info("Storage monitor thread started")


def stop_storage_monitor():
    """Stop the background storage monitor thread."""
    global _storage_monitor_running
    _storage_monitor_running = False


_audit_service_instance = None
def get_audit_service(start_monitor: bool = True):
    """
    Get or create the audit service singleton.
    Optionally starts the storage monitor on first creation.
    """
    global _audit_service_instance
    if not _audit_service_instance:
        _audit_service_instance = AuditLogService()
        if start_monitor:
            start_storage_monitor(_audit_service_instance)
    return _audit_service_instance
