import os
import threading
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from services.system.schedule_storage import FirebaseScheduleStorage, LocalJSONScheduleStorage
from services.slack.crawler_notifier import CrawlerSlackNotifier
from services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

try:  # Python 3.9+
    from zoneinfo import ZoneInfo  # type: ignore
except ImportError:  # pragma: no cover - fallback for environments without zoneinfo
    ZoneInfo = None  # type: ignore


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_time_component(value: str) -> Dict[str, int]:
    hours, minutes = value.split(":", 1)
    return {"hour": int(hours), "minute": int(minutes)}


def _safe_zoneinfo(name: str) -> timezone:
    if ZoneInfo is None:
        return timezone.utc
    try:
        return ZoneInfo(name)
    except Exception:  # noqa: BLE001
        return timezone.utc


class CrawlerScheduler:
    """Persistent scheduler that can trigger crawler groups on a timetable."""

    def __init__(self, crawler_manager: Any, storage_dir: str) -> None:
        self.crawler_manager = crawler_manager
        self.storage_path = os.path.join(storage_dir, "crawler_schedules.json")
        os.makedirs(storage_dir, exist_ok=True)

        self._local_store = LocalJSONScheduleStorage(self.storage_path)
        self._remote_store: Optional[FirebaseScheduleStorage] = None
        self._notifier: Optional[CrawlerSlackNotifier] = None
        remote_disabled = os.getenv("CRAWLER_SCHEDULE_DISABLE_FIREBASE", "0").lower() in {"1", "true", "yes"}
        if not remote_disabled:
            collection_name = os.getenv("CRAWLER_SCHEDULES_COLLECTION", "crawler_schedules")
            self._remote_store = FirebaseScheduleStorage(collection_name)
            logger.info("Firebase schedule storage enabled", extra={"collection": collection_name})
        else:
            logger.info("Firebase schedule storage disabled by env")

        try:
            self._notifier = CrawlerSlackNotifier()
        except Exception as exc:  # noqa: BLE001
            self._notifier = None
            logger.warning("Slack notifier unavailable", extra={"error": str(exc)})

        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._schedules: Dict[str, Dict[str, Any]] = {}
        self._poll_seconds = max(1, int(os.getenv("CRAWLER_SCHEDULER_POLL_SECONDS", "5")))
        self._min_interval_minutes = max(1, int(os.getenv("CRAWLER_SCHEDULE_MIN_INTERVAL_MINUTES", "240")))
        self._min_interval_delta = timedelta(minutes=self._min_interval_minutes)
        self._last_load_time: float = 0.0
        self._sync_interval_seconds = max(1, int(os.getenv("CRAWLER_SCHEDULER_SYNC_SECONDS", "10")))

        self._load()

        self._thread = threading.Thread(target=self._run_loop, name="CrawlerScheduler", daemon=True)
        self._thread.start()

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------
    def _load(self) -> None:
        loaded_from_remote = False
        data: Optional[Dict[str, Dict[str, Any]]] = None

        if self._remote_store:
            remote_data = self._remote_store.load()
            if remote_data is not None:
                data = remote_data
                loaded_from_remote = True

        if data is None:
            data = self._local_store.load()

        if data is None:
            data = {}

        self._schedules = data
        for schedule in self._schedules.values():
            if "limit_mode" not in schedule:
                limit_mode = self._resolve_limit_mode(None, schedule.get("max_items") is not None)
                schedule["limit_mode"] = limit_mode
                if limit_mode != "custom":
                    schedule["max_items"] = None
        logger.info("Loaded crawler schedules", extra={
            "count": len(self._schedules),
            "source": "Firebase" if loaded_from_remote else "local storage"
        })

        if loaded_from_remote:
            self._local_store.save_all(self._schedules)
        elif self._remote_store and self._schedules:
            # Attempt to prime Firebase with existing local schedules
            self._remote_store.save_all(self._schedules)

    def _persist(self, deleted_ids: Optional[List[str]] = None) -> None:
        self._local_store.save_all(self._schedules)
        if self._remote_store:
            self._remote_store.save_all(self._schedules, deleted_ids)
        self._last_load_time = _utc_now().timestamp()

    def _sync_if_stale(self) -> None:
        """Reload schedules from storage if data may be out-of-date.

        In a multi-worker setup (e.g. gunicorn), another worker may have
        modified the persistent store.  Re-read periodically so that every
        worker converges on the same state.
        """
        now = _utc_now().timestamp()
        if now - self._last_load_time >= self._sync_interval_seconds:
            self._load()
            self._last_load_time = now

    def _resolve_limit_mode(self, requested: Optional[str], has_explicit_max: bool) -> str:
        allowed = {"default", "custom", "all"}
        if isinstance(requested, str):
            candidate = requested.strip().lower()
            if candidate in allowed:
                return candidate
        return "custom" if has_explicit_max else "default"

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def list_schedules(self) -> List[Dict[str, Any]]:
        with self._lock:
            self._sync_if_stale()
            return [schedule.copy() for schedule in self._schedules.values()]

    def get_schedule(self, schedule_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            self._sync_if_stale()
            schedule = self._schedules.get(schedule_id)
            return schedule.copy() if schedule else None

    def create_schedule(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        schedule_id = str(uuid.uuid4())
        now = _utc_now().isoformat()

        requested_max = payload.get("max_items")
        limit_mode = self._resolve_limit_mode(payload.get("limit_mode"), requested_max is not None)

        schedule = {
            "id": schedule_id,
            "label": payload.get("label", "Scheduled crawler run"),
            "description": payload.get("description"),
            "enabled": payload.get("enabled", True),
            "batch_mode": (payload.get("batch_mode") or "parallel").lower(),
            "max_items": requested_max if limit_mode == "custom" else None,
            "limit_mode": limit_mode,
            "headless_mode": payload.get("headless_mode"),
            "selection": payload.get("selection", {}),
            "schedule": payload.get("schedule", {}),
            "created_at": now,
            "updated_at": now,
            "next_run": None,
            "last_run": None,
            "last_status": None,
            "last_error": None,
        }

        schedule["next_run"] = self._compute_next_run(schedule, initializing=True)
        schedule_copy = schedule.copy()

        with self._lock:
            self._schedules[schedule_id] = schedule
            self._persist()
        if self._notifier:
            try:
                self._notifier.notify_schedule_created(schedule_copy)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Slack notification failed", extra={"operation": "schedule_created", "error": str(exc)})

        return schedule_copy

    def update_schedule(self, schedule_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        with self._lock:
            self._sync_if_stale()
            schedule = self._schedules.get(schedule_id)
            if not schedule:
                return None

            allowed_fields = {
                "label",
                "description",
                "enabled",
                "batch_mode",
                "max_items",
                "headless_mode",
                "selection",
                "schedule",
                "limit_mode",
            }
            schedule.update({k: v for k, v in updates.items() if k in allowed_fields})

            if "max_items" in updates or "limit_mode" in updates:
                pending_max = updates.get("max_items", schedule.get("max_items"))
                limit_mode = self._resolve_limit_mode(
                    updates.get("limit_mode", schedule.get("limit_mode")),
                    pending_max is not None,
                )
                schedule["limit_mode"] = limit_mode
                schedule["max_items"] = pending_max if limit_mode == "custom" else None
            schedule["updated_at"] = _utc_now().isoformat()
            schedule["next_run"] = self._compute_next_run(schedule, initializing=True)
            schedule_copy = schedule.copy()
            self._persist()

        if self._notifier:
            try:
                self._notifier.notify_schedule_updated(schedule_copy, changes=updates)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Slack notification failed", extra={"operation": "schedule_updated", "error": str(exc)})

        return schedule_copy

    def delete_schedule(self, schedule_id: str) -> bool:
        schedule_snapshot: Optional[Dict[str, Any]] = None
        with self._lock:
            self._sync_if_stale()
            if schedule_id in self._schedules:
                schedule_snapshot = self._schedules[schedule_id].copy()
                del self._schedules[schedule_id]
                self._persist(deleted_ids=[schedule_id])
        if not schedule_snapshot:
            return False
        if self._notifier:
            try:
                self._notifier.notify_schedule_deleted(schedule_snapshot)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Slack notification failed", extra={"operation": "schedule_deleted", "error": str(exc)})
        return True

    def toggle_schedule(self, schedule_id: str, enabled: bool) -> Optional[Dict[str, Any]]:
        with self._lock:
            self._sync_if_stale()
            schedule = self._schedules.get(schedule_id)
            if not schedule:
                return None
            schedule["enabled"] = bool(enabled)
            schedule["updated_at"] = _utc_now().isoformat()
            if enabled and not schedule.get("next_run"):
                schedule["next_run"] = self._compute_next_run(schedule, initializing=True)
            self._persist()
            return schedule.copy()

    def trigger_schedule_now(self, schedule_id: str) -> Optional[Dict[str, Any]]:
        schedule = self.get_schedule(schedule_id)
        if not schedule:
            return None
        self._execute_schedule(schedule_id, schedule, manual=True)
        return self.get_schedule(schedule_id)

    def shutdown(self, timeout: float = 5.0) -> None:
        self._stop_event.set()
        self._thread.join(timeout=timeout)

    # ------------------------------------------------------------------
    # Background loop
    # ------------------------------------------------------------------
    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                due_ids: List[str] = []
                with self._lock:
                    now = _utc_now()
                    for schedule_id, schedule in self._schedules.items():
                        if not schedule.get("enabled"):
                            continue
                        next_run = schedule.get("next_run")
                        if not next_run:
                            continue
                        try:
                            next_run_dt = datetime.fromisoformat(next_run)
                        except Exception:  # noqa: BLE001
                            next_run_dt = None
                        if not next_run_dt:
                            continue
                        if next_run_dt.tzinfo is None:
                            next_run_dt = next_run_dt.replace(tzinfo=timezone.utc)
                        if next_run_dt <= now:
                            due_ids.append(schedule_id)
                for schedule_id in due_ids:
                    schedule = self.get_schedule(schedule_id)
                    if schedule:
                        self._execute_schedule(schedule_id, schedule)
            except Exception as exc:  # noqa: BLE001
                log_error(logger, exc, context={"service": "crawler_scheduler", "operation": "run_loop"})
            finally:
                self._stop_event.wait(self._poll_seconds)

    # ------------------------------------------------------------------
    # Execution helpers
    # ------------------------------------------------------------------
    def _execute_schedule(self, schedule_id: str, schedule: Dict[str, Any], manual: bool = False) -> None:
        specs = self._selection_to_specs(schedule.get("selection", {}))
        if not specs:
            logger.warning("No crawler specs resolved for schedule", extra={"schedule_id": schedule_id})
            self._mark_run(schedule_id, success=False, error_message="No crawler targets resolved", triggered_specs=[])
            return

        overrides: Dict[str, Any] = {}
        if schedule.get("max_items") is not None:
            overrides["max_items"] = schedule["max_items"]
        if schedule.get("headless_mode") is not None:
            overrides["headless_mode"] = schedule["headless_mode"]

        merged_specs: List[Dict[str, Any]] = []
        for spec in specs:
            merged = {"store": spec["store"], "category": spec["category"]}
            merged.update(overrides)
            merged_specs.append(merged)

        if self._notifier:
            try:
                self._notifier.notify_schedule_start(schedule.copy(), manual=manual, triggered_specs=merged_specs)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Slack notification failed", extra={"operation": "schedule_start", "error": str(exc)})

        try:
            mode = (schedule.get("batch_mode") or "parallel").lower()
            self.crawler_manager.start_crawlers_batch(merged_specs, mode=mode)
            self._mark_run(schedule_id, success=True, manual=manual, triggered_specs=merged_specs)
        except Exception as exc:  # noqa: BLE001
            log_error(logger, exc, context={"service": "crawler_scheduler", "operation": "execute_schedule", "schedule_id": schedule_id})
            self._mark_run(schedule_id, success=False, error_message=str(exc), triggered_specs=merged_specs)

    def _mark_run(
        self,
        schedule_id: str,
        *,
        success: bool,
        error_message: Optional[str] = None,
        manual: bool = False,
        triggered_specs: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        with self._lock:
            schedule = self._schedules.get(schedule_id)
            if not schedule:
                return
            now_iso = _utc_now().isoformat()
            schedule["last_run"] = now_iso
            schedule["last_status"] = "success" if success else "error"
            schedule["last_error"] = error_message
            if schedule.get("schedule", {}).get("type") == "one_time" and not manual:
                # Disable one-time schedules after execution
                schedule["enabled"] = False
                schedule["next_run"] = None
            else:
                schedule["next_run"] = self._compute_next_run(schedule)
                self._enforce_minimum_gap(schedule)
            schedule["updated_at"] = now_iso
            schedule_snapshot = schedule.copy()
            self._persist()

        if self._notifier:
            try:
                self._notifier.notify_schedule_run(
                    schedule_snapshot,
                    success=success,
                    manual=manual,
                    triggered_specs=triggered_specs,
                    error_message=error_message,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Slack notification failed", extra={"operation": "schedule_run", "error": str(exc)})

    # ------------------------------------------------------------------
    # Selection resolution
    # ------------------------------------------------------------------
    def _selection_to_specs(self, selection: Dict[str, Any]) -> List[Dict[str, str]]:
        if not selection:
            return self._all_specs()

        mode = (selection.get("mode") or "all").lower()
        if mode == "all":
            return self._all_specs()
        if mode == "store":
            stores = selection.get("stores") or []
            categories = selection.get("categories")
            return self._store_specs(stores, categories)
        if mode == "category":
            categories = selection.get("categories")
            stores = selection.get("stores")
            return self._category_specs(categories, stores)
        if mode == "explicit":
            explicit = selection.get("crawlers") or []
            return [spec for spec in explicit if spec.get("store") and spec.get("category")]
        return []

    def _all_specs(self) -> List[Dict[str, str]]:
        specs: List[Dict[str, str]] = []
        for store, categories in self.crawler_manager.available_crawlers.items():
            for category in categories.keys():
                specs.append({"store": store, "category": category})
        return specs

    def _store_specs(self, stores: List[str], categories: Optional[List[str]]) -> List[Dict[str, str]]:
        specs: List[Dict[str, str]] = []
        target_stores = stores or list(self.crawler_manager.available_crawlers.keys())
        for store in target_stores:
            if store not in self.crawler_manager.available_crawlers:
                continue
            available_categories = list(self.crawler_manager.available_crawlers[store].keys())
            candidate_list: List[str] = []
            if categories:
                for category in categories:
                    if category == "all":
                        candidate_list.extend(available_categories)
                    elif category in available_categories:
                        candidate_list.append(category)
            else:
                candidate_list = available_categories[:]

            for category in candidate_list:
                specs.append({"store": store, "category": category})

        # Deduplicate entries
        unique: Dict[str, Dict[str, str]] = {}
        for spec in specs:
            key = f"{spec['store']}::{spec['category']}"
            unique[key] = spec
        return list(unique.values())

    def _category_specs(self, categories: Optional[List[str]], stores: Optional[List[str]]) -> List[Dict[str, str]]:
        specs: List[Dict[str, str]] = []
        target_stores = stores or list(self.crawler_manager.available_crawlers.keys())

        if not categories:
            for store in target_stores:
                store_categories = self.crawler_manager.available_crawlers.get(store)
                if not store_categories:
                    continue
                for category in store_categories.keys():
                    specs.append({"store": store, "category": category})
            return specs

        for category in categories:
            for store in target_stores:
                store_categories = self.crawler_manager.available_crawlers.get(store)
                if not store_categories:
                    continue
                if category == "all":
                    specs.extend({"store": store, "category": cat} for cat in store_categories.keys())
                elif category in store_categories:
                    specs.append({"store": store, "category": category})
        return specs

    # ------------------------------------------------------------------
    # Scheduling helpers
    # ------------------------------------------------------------------
    def _compute_next_run(self, schedule: Dict[str, Any], initializing: bool = False) -> Optional[str]:
        config = schedule.get("schedule", {})
        schedule_type = (config.get("type") or "one_time").lower()

        if schedule_type == "one_time":
            run_at = config.get("run_at")
            if not run_at:
                return None
            try:
                run_dt = datetime.fromisoformat(run_at)
            except Exception:  # noqa: BLE001
                return None
            if run_dt.tzinfo is None:
                run_dt = run_dt.replace(tzinfo=timezone.utc)
            if initializing or run_dt >= _utc_now():
                return run_dt.astimezone(timezone.utc).isoformat()
            return None

        timezone_name = config.get("timezone") or "UTC"
        tz = _safe_zoneinfo(timezone_name)
        now_local = _utc_now().astimezone(tz)

        time_of_day = config.get("time_of_day") or "00:00"
        try:
            time_parts = _parse_time_component(time_of_day)
        except Exception:  # noqa: BLE001
            time_parts = {"hour": 0, "minute": 0}

        if schedule_type == "daily":
            candidate = now_local.replace(hour=time_parts["hour"], minute=time_parts["minute"], second=0, microsecond=0)
            if candidate <= now_local:
                candidate += timedelta(days=1)
            return candidate.astimezone(timezone.utc).isoformat()

        if schedule_type == "weekly":
            days = config.get("days_of_week") or [now_local.weekday()]
            days_sorted = sorted(int(day) % 7 for day in days)
            current_weekday = now_local.weekday()
            candidate: Optional[datetime] = None
            for day in days_sorted:
                delta = (day - current_weekday) % 7
                candidate_day = now_local + timedelta(days=delta)
                possible = candidate_day.replace(hour=time_parts["hour"], minute=time_parts["minute"], second=0, microsecond=0)
                if possible <= now_local:
                    possible += timedelta(days=7)
                if not candidate or possible < candidate:
                    candidate = possible
            if candidate is None:
                candidate = now_local + timedelta(days=7)
            return candidate.astimezone(timezone.utc).isoformat()

        if schedule_type == "interval":
            requested_interval = int(config.get("interval_minutes") or 60)
            interval_minutes = max(requested_interval, self._min_interval_minutes)
            anchor = schedule.get("last_run")
            if anchor:
                try:
                    anchor_dt = datetime.fromisoformat(anchor)
                    if anchor_dt.tzinfo is None:
                        anchor_dt = anchor_dt.replace(tzinfo=timezone.utc)
                except Exception:  # noqa: BLE001
                    anchor_dt = _utc_now()
            else:
                anchor_dt = _utc_now()
                if initializing:
                    anchor_dt = anchor_dt + timedelta(seconds=5)
            return (anchor_dt + timedelta(minutes=interval_minutes)).astimezone(timezone.utc).isoformat()

        return None

    def _enforce_minimum_gap(self, schedule: Dict[str, Any]) -> None:
        if not schedule.get("next_run"):
            return

        try:
            next_run_dt = datetime.fromisoformat(schedule["next_run"])
        except Exception:  # noqa: BLE001
            next_run_dt = None

        if not next_run_dt:
            schedule["next_run"] = (_utc_now() + self._min_interval_delta).isoformat()
            return

        if next_run_dt.tzinfo is None:
            next_run_dt = next_run_dt.replace(tzinfo=timezone.utc)

        earliest = _utc_now() + self._min_interval_delta
        if next_run_dt < earliest:
            schedule["next_run"] = earliest.isoformat()
