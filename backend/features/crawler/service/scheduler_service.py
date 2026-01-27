from typing import Any, Dict, List, Optional
from services.system.initialization import (
    get_crawler_scheduler,
    get_crawler_manager,
    is_crawler_available,
    is_crawler_scheduler_available,
    is_services_initializing
)
from common.base.base_service import BaseService
from services.system.logger_service import get_logger

logger = get_logger(__name__)

# Cache for lazy initialization retry
_scheduler_initialization_retried = False


class SchedulerService(BaseService):
    def _require_scheduler(self):
        """Get scheduler with lazy initialization support"""
        global _scheduler_initialization_retried
        
        # Check actual instances rather than global flags.
        crawler_manager = get_crawler_manager()
        if not crawler_manager:
            raise Exception('Crawler system not available')
        
        scheduler = get_crawler_scheduler()
        
        # Retry initialization once when the scheduler is unavailable.
        if not scheduler and not _scheduler_initialization_retried and not is_services_initializing():
            _scheduler_initialization_retried = True
            logger.info("Attempting lazy initialization of crawler scheduler")
            try:
                from services.system.initialization import initialize_crawler_scheduler
                initialize_crawler_scheduler()
                scheduler = get_crawler_scheduler()
            except Exception as e:
                logger.warning(f"Lazy initialization of scheduler failed: {e}")
        
        if not scheduler:
            raise Exception('Crawler scheduler not available')
        return scheduler
    
    def list_schedules(self) -> List[Dict[str, Any]]:
        scheduler = self._require_scheduler()
        return scheduler.list_schedules() if scheduler else []

    def create_schedule(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        scheduler = self._require_scheduler()
        logger.info(f"Creating crawler schedule: {payload.get('label', 'unnamed')}")
        return scheduler.create_schedule(payload)

    def update_schedule(self, schedule_id: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        scheduler = self._require_scheduler()
        logger.info(f"Updating crawler schedule: {schedule_id}")
        return scheduler.update_schedule(schedule_id, payload)

    def delete_schedule(self, schedule_id: str) -> bool:
        scheduler = self._require_scheduler()
        logger.info(f"Deleting crawler schedule: {schedule_id}")
        return scheduler.delete_schedule(schedule_id)
        
    def toggle_schedule(self, schedule_id: str, enabled: bool) -> Optional[Dict[str, Any]]:
        scheduler = self._require_scheduler()
        logger.info(f"Toggling crawler schedule {schedule_id}: {'enabled' if enabled else 'disabled'}")
        return scheduler.toggle_schedule(schedule_id, enabled)

    def trigger_schedule_now(self, schedule_id: str) -> Optional[Dict[str, Any]]:
        scheduler = self._require_scheduler()
        logger.info(f"Manually triggering crawler schedule: {schedule_id}")
        return scheduler.trigger_schedule_now(schedule_id)
