from typing import Any, Dict, List, Union
from datetime import datetime
from common.base.base_service import BaseService
from services.system.audit_log_service import get_audit_service
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class AuditService(BaseService):
    def ingest_logs(self, payload: Union[Dict[str, Any], List[Dict[str, Any]]]) -> int:
        entries = payload if isinstance(payload, list) else [payload]
        ingested = 0

        for entry in entries:
            if not isinstance(entry, dict): continue
            normalized = self._normalize_entry(entry)
            
            logger.info(
                "AUDIT_EVENT",
                extra={
                    **normalized,
                    "raw_audit_event": entry,
                },
            )
            ingested += 1
            
        return ingested

    def list_logs(self, user_email=None, action=None, start_date=None, end_date=None, search=None, limit=100, offset=0):
        svc = get_audit_service()
        if not svc.is_available():
            raise Exception('Audit service unavailable (OpenSearch not connected)')
            
        return svc.list_logs(
            user_email=user_email,
            action=action,
            start_date=start_date,
            end_date=end_date,
            search_term=search,
            limit=limit,
            offset=offset
        )

    def get_stats(self):
        svc = get_audit_service()
        return svc.get_stats()

    def enforce_retention(self, days: int):
        svc = get_audit_service()
        return svc.enforce_retention(days)

    def _as_dict(self, value: Any) -> Dict[str, Any]:
        if isinstance(value, dict): return value
        return {"value": value}

    def _normalize_entry(self, entry: Dict[str, Any]) -> Dict[str, Any]:
        details = self._as_dict(entry.get("details", {}))
        ts = entry.get("timestamp") or entry.get("time") or datetime.utcnow().isoformat()
        resource = entry.get("resource") or details.get("resource") or "admin_console"
        action = entry.get("action") or entry.get("event") or "UNKNOWN"
        
        return {
            "audit_action": action,
            "audit_resource": resource,
            "audit_user_id": entry.get("userId") or entry.get("adminId") or details.get("userId"),
            "audit_user_email": entry.get("userEmail") or entry.get("adminEmail") or details.get("userEmail"),
            "audit_session_id": entry.get("sessionId") or details.get("sessionId"),
            "audit_client_ip": entry.get("ipAddress") or details.get("clientIP") or entry.get("clientIP"),
            "audit_user_agent": entry.get("userAgent") or details.get("userAgent"),
            "audit_success": bool(entry.get("success", True)),
            "audit_risk_level": entry.get("riskLevel", "unknown"),
            "audit_timestamp": str(ts),
            "audit_source": entry.get("source", "frontend"),
            "audit_notes": details,
        }
