from __future__ import annotations
import threading
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple, Union

from firebase_admin import firestore
from common.base.base_service import BaseService
from backend.features.users.repository.user_repository import UserRepository
from backend.features.users.repository.user_insights_repository import UserInsightsRepository
from backend.features.users.mapper.user_mapper import normalise_user_profile
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class UserService(BaseService):
    ONLINE_GRACE_SECONDS = 90
    PROFILE_CACHE_TTL_SECONDS = 300
    TIMELINE_DEFAULT_LIMIT = 50

    def __init__(self, user_repository: UserRepository, insights_repository: UserInsightsRepository):
        self.user_repository = user_repository
        self.insights_repository = insights_repository
        self._profile_cache: Dict[str, Dict[str, Any]] = {}
        self._profile_cache_lock = threading.Lock()

    # ------------------------------------------------------------------
    # User Management (Ban, Unban, Logout)
    # ------------------------------------------------------------------

    def ban_user(self, uid: str, reason: str, expires_at: Optional[datetime] = None) -> bool:
        """Bans a user by updating their Firestore document."""
        try:
            logger.info(f"Banning user {uid}", extra={"reason": reason})
            data = {
                "isBanned": True,
                "banReason": reason,
                "banUpdatedAt": firestore.SERVER_TIMESTAMP
            }
            if expires_at:
                data["banExpiresAt"] = expires_at
            
            self.user_repository.update_fields(uid, data)
            return True
        except Exception as e:
            logger.error(f"Failed to ban user {uid}: {e}")
            return False

    def unban_user(self, uid: str) -> bool:
        """Unbans a user by clearing ban fields."""
        try:
            logger.info(f"Unbanning user {uid}")
            data = {
                "isBanned": False,
                "banReason": firestore.DELETE_FIELD,
                "banExpiresAt": firestore.DELETE_FIELD,
                "banUpdatedAt": firestore.SERVER_TIMESTAMP
            }
            self.user_repository.update_fields(uid, data)
            return True
        except Exception as e:
            logger.error(f"Failed to unban user {uid}: {e}")
            return False

    def force_logout(self, uid: str) -> bool:
        """Forces a user logout by updating the forceLogoutAt timestamp."""
        try:
            logger.info(f"Forcing logout for user {uid}")
            data = {
                "forceLogoutAt": firestore.SERVER_TIMESTAMP
            }
            self.user_repository.update_fields(uid, data)
            return True
        except Exception as e:
            logger.error(f"Failed to force logout user {uid}: {e}")
            return False

    # ------------------------------------------------------------------
    # User Insights (List Online, Details, Timeline)
    # ------------------------------------------------------------------

    def list_online_users(self, *, limit: Optional[int] = None) -> Dict[str, Any]:
        logger.info("Fetching online users", extra={"limit": limit})
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(seconds=self.ONLINE_GRACE_SECONDS)
        
        # Access Repository
        user_docs = self.insights_repository.stream_users(limit)

        user_ids = [doc.id for doc in user_docs]
        logger.debug("Fetched user documents", extra={"user_count": len(user_ids)})
        
        status_map = self.insights_repository.fetch_status_documents(user_ids)
        rtdb_status_map = self.insights_repository.fetch_rtdb_status_documents(user_ids)

        summaries: List[Dict[str, Any]] = []
        online_count = 0

        for doc in user_docs:
            uid = doc.id
            raw = doc.to_dict() or {}
            profile = normalise_user_profile(uid, raw)
            status_data = status_map.get(uid)
            rtdb_status_data = rtdb_status_map.get(uid)
            presence = self._compose_presence(uid, raw, status_data, rtdb_status_data, cutoff)

            if presence.get("state") == "online":
                online_count += 1

            summaries.append(
                {
                    "uid": uid,
                    "profile": profile,
                    "presence": presence,
                    "stats": self._collect_quick_stats(uid),
                }
            )

        logger.info("Online users processed", extra={"total_users": len(summaries), "online_count": online_count})
        return self._finalise_user_summaries(summaries, now, online_count)

    def get_user_detail(self, user_id: str) -> Optional[Dict[str, Any]]:
        logger.info("Fetching user detail", extra={"user_id": user_id})
        profile = self._get_profile(user_id)
        if not profile:
            logger.warning("User profile not found", extra={"user_id": user_id})
            profile = {"uid": user_id, "fullName": None}

        presence = self._get_presence_snapshot(user_id)
        
        shopping = []
        for doc in self.insights_repository.fetch_shopping_lists(user_id):
             summary = self._build_shopping_list_summary(doc, viewer_id=user_id)
             if summary:
                 shopping.append(summary)
        
        friends_data = self.insights_repository.fetch_friends(user_id)
        friends = self._build_friends_view(user_id, friends_data)

        search_history_data = self.insights_repository.fetch_recent_searches(user_id)
        search_history = []
        for doc in search_history_data:
            data = doc.to_dict() or {}
            search_history.append({
                "query": data.get("q"),
                "timestamp": self._millis_to_iso(data.get("ts")),
            })
            
        ai_sessions = self._fetch_ai_sessions(user_id)
        
        logger.info("User detail fetched", extra={
            "user_id": user_id,
            "shopping_lists": len(shopping),
            "friends": friends.get("count", 0),
            "search_history_count": len(search_history),
            "ai_sessions": len(ai_sessions)
        })

        return {
            "uid": user_id,
            "profile": profile,
            "presence": presence,
            "shoppingLists": shopping,
            "friends": friends,
            "searchHistory": search_history,
            "aiSessions": ai_sessions,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        }

    # ------------------------------------------------------------------
    # Internal Logic
    # ------------------------------------------------------------------

    def _collect_quick_stats(self, user_id: str) -> Dict[str, Any]:
        stats = {
            "shoppingLists": 0,
            "sharedLists": 0,
            "friends": 0,
            "recentSearches": 0,
            "aiSessions": 0,
        }
        total_lists, shared_lists = self.insights_repository.count_shopping_lists(user_id)
        stats["shoppingLists"] = total_lists
        stats["sharedLists"] = shared_lists
        stats["friends"] = self.insights_repository.count_friends(user_id)
        stats["recentSearches"] = self.insights_repository.count_recent_searches(user_id)
        stats["aiSessions"] = self.insights_repository.count_ai_sessions(user_id)
        return stats

    def _compose_presence(
        self,
        user_id: str,
        user_raw: Dict[str, Any],
        status_raw: Optional[Dict[str, Any]],
        rtdb_raw: Optional[Dict[str, Any]],
        cutoff: datetime,
    ) -> Dict[str, Any]:
        presence: Dict[str, Any] = {
            "state": "offline",
            "lastChanged": None,
            "lastChangedMs": None,
            "source": "derived",
        }

        def _apply_extras(source: Dict[str, Any], *, allow_override: bool = True) -> None:
            for key in ("customStatus", "statusEmoji", "statusMessage", "statusText"):
                if key in source and source[key] is not None:
                    if allow_override or presence.get(key) in (None, ""):
                        presence[key] = source[key]

        if status_raw is not None:
            last_changed_iso = self._timestamp_to_iso(status_raw.get("last_changed"))
            last_changed_ms = status_raw.get("last_changed_ms") or status_raw.get("lastChangedMs")
            state = status_raw.get("state", "offline")
            if last_changed_iso:
                try:
                    if self._iso_to_datetime(last_changed_iso) < cutoff:
                        state = "offline"
                except Exception:
                    pass
            presence.update(
                {
                    "state": state,
                    "lastChanged": last_changed_iso,
                    "source": "status_collection",
                }
            )
            if last_changed_ms is not None:
                try:
                    presence["lastChangedMs"] = int(last_changed_ms)
                except Exception:
                    pass
            _apply_extras(status_raw)

        user_presence = user_raw.get("presence")
        if isinstance(user_presence, dict):
            user_state = user_presence.get("state")
            if user_state and presence.get("state") == "offline":
                presence["state"] = user_state

            if not presence.get("lastChanged"):
                last_changed_value = user_presence.get("last_changed") or user_presence.get("lastChanged")
                presence["lastChanged"] = self._timestamp_to_iso(last_changed_value)

            if not presence.get("lastChangedMs"):
                last_ms = user_presence.get("last_changed_ms") or user_presence.get("lastChangedMs")
                try:
                    if last_ms is not None:
                        presence["lastChangedMs"] = int(last_ms)
                except Exception:
                    pass

            if presence.get("source") in {None, "derived"}:
                presence["source"] = "user_document"

            _apply_extras(user_presence, allow_override=False)

        if isinstance(rtdb_raw, dict):
            last_changed_raw = rtdb_raw.get("last_changed") or rtdb_raw.get("lastChanged")
            rtdb_iso = self._millis_to_iso(last_changed_raw)
            state = rtdb_raw.get("state")
            if rtdb_iso:
                try:
                    if self._iso_to_datetime(rtdb_iso) < cutoff:
                        state = "offline"
                except Exception:
                    pass
            if state:
                presence["state"] = state
                presence["source"] = "realtime_db"
            if rtdb_iso:
                presence["lastChanged"] = rtdb_iso
            if last_changed_raw is not None:
                try:
                    presence["lastChangedMs"] = int(last_changed_raw)
                except Exception:
                    pass
            _apply_extras(rtdb_raw)

        if presence.get("source") is None:
            presence["source"] = "derived"

        if presence.get("lastChanged") is None and isinstance(presence.get("lastChangedMs"), (int, float)):
            presence["lastChanged"] = self._millis_to_iso(presence["lastChangedMs"])

        return presence

    def _finalise_user_summaries(
        self,
        summaries: List[Dict[str, Any]],
        generated_at: datetime,
        online_count: int,
    ) -> Dict[str, Any]:
        for item in summaries:
            profile = item.get("profile") or {}
            uid = profile.get("uid") or item.get("uid")
            if uid and isinstance(profile, dict):
                self._store_profile_in_cache(uid, profile)

        summaries.sort(
            key=lambda item: (
                0 if (item.get("presence") or {}).get("state") == "online" else 1,
                self._profile_sort_key(item.get("profile")),
            )
        )

        return {
            "users": summaries,
            "updatedAt": generated_at.isoformat(),
            "onlineCount": online_count,
            "totalCount": len(summaries),
        }

    def _get_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        now = datetime.now(timezone.utc)
        with self._profile_cache_lock:
            cached = self._profile_cache.get(user_id)
            if cached:
                cached_at = cached.get("_cached_at")
                if isinstance(cached_at, datetime) and (now - cached_at).total_seconds() < self.PROFILE_CACHE_TTL_SECONDS:
                    return {k: v for k, v in cached.items() if k != "_cached_at"}

        try:
            doc = self.insights_repository.get_user_document(user_id)
            if not doc or not doc.exists:
                return None
            raw = doc.to_dict() or {}
            profile = normalise_user_profile(user_id, raw)
        except Exception as exc:
            logger.warning("Failed to load user profile", extra={"user_id": user_id, "error": str(exc)})
            return None

        profile_with_meta = dict(profile)
        profile_with_meta["_cached_at"] = now
        with self._profile_cache_lock:
            if len(self._profile_cache) >= 500:
                try:
                    self._profile_cache.pop(next(iter(self._profile_cache)))
                except StopIteration:
                    pass
            self._profile_cache[user_id] = profile_with_meta
        return profile

    def _store_profile_in_cache(self, user_id: str, profile: Dict[str, Any]) -> None:
        snapshot = dict(profile)
        snapshot["uid"] = snapshot.get("uid") or user_id
        snapshot["_cached_at"] = datetime.now(timezone.utc)

        with self._profile_cache_lock:
            if len(self._profile_cache) >= 500:
                try:
                    self._profile_cache.pop(next(iter(self._profile_cache)))
                except StopIteration:
                    pass
            self._profile_cache[user_id] = snapshot

    def _profile_sort_key(self, profile: Optional[Dict[str, Any]]) -> str:
        if not isinstance(profile, dict):
            return ""
        for key in ("fullName", "displayName"):
            value = profile.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip().lower()
        email = profile.get("email")
        if isinstance(email, str) and email.strip():
            return email.strip().lower()
        uid = profile.get("uid")
        if isinstance(uid, str) and uid.strip():
            return uid.strip().lower()
        return ""

    def _get_presence_snapshot(self, user_id: str) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(seconds=self.ONLINE_GRACE_SECONDS)
        status_raw: Optional[Dict[str, Any]] = None
        user_raw: Dict[str, Any] = {}
        try:
            status_doc = self.insights_repository.get_status_document(user_id)
            if status_doc and status_doc.exists:
                status_raw = status_doc.to_dict() or {}
        except Exception:
            pass
        try:
            user_doc = self.insights_repository.get_user_document(user_id)
            if user_doc and user_doc.exists:
                user_raw = user_doc.to_dict() or {}
        except Exception:
            pass
        rtdb_map = self.insights_repository.fetch_rtdb_status_documents([user_id])
        rtdb_raw = rtdb_map.get(user_id)
        return self._compose_presence(user_id, user_raw, status_raw, rtdb_raw, cutoff)

    def _build_friends_view(self, user_id: str, friends_raw: List[Any]) -> Dict[str, Any]:
        friends = []
        for doc in friends_raw:
            data = doc.to_dict() or {}
            # Robust timestamp handling for 'since'
            since_val = data.get("createdAt") or data.get("timestamp") or data.get("since")
            friends.append({
                 "uid": doc.id,
                 "displayName": data.get("displayName") or "Unknown",
                 "since": self._timestamp_to_iso(since_val),
                 "photoURL": data.get("photoURL")
            })
        online_ids = []
        friend_ids = [f["uid"] for f in friends]
        if friend_ids:
            # Limit the online-status lookup to the first 10 IDs.
            check_ids = friend_ids[:10]
            status_map = self.insights_repository.fetch_status_documents(check_ids)
            for fid, st in status_map.items():
                if st.get("state") == "online":
                    online_ids.append(fid)
        return {
            "items": friends,
            "onlineNow": online_ids,
            "count": len(friends),
        }

    def _fetch_ai_sessions(self, user_id: str) -> List[Dict[str, Any]]:
        # Use repository methods to retrieve session documents.
        docs = self.insights_repository.fetch_ai_sessions_from_sources(user_id)
        # Prefer AI history sessions when available.
        history = self.insights_repository.fetch_ai_history_sessions(user_id)
        if history:
            sessions = []
            for doc in history:
                data = doc.to_dict() or {}
                # Apply a generic transformation for AI history sessions.
                sessions.append({
                    "id": doc.id,
                    "summary": data.get("summary") or "AI Session",
                    "createdAt": self._coerce_to_iso(data.get("ts")),
                    # ... other fields
                })
            return sessions

        sessions = []
        for doc in docs:
            data = doc.to_dict() or {}
            sessions.append({
                "id": doc.id,
                "summary": data.get("summary") or data.get("title"),
                "createdAt": self._timestamp_to_iso(data.get("createdAt")),
                "rating": data.get("rating"),
                "status": data.get("status"),
                "details": {k: v for k, v in data.items() if k not in {"summary", "title", "createdAt", "rating"}}
            })
        return sessions

    def _build_shopping_list_summary(self, doc: Any, *, viewer_id: str) -> Optional[Dict[str, Any]]:
         try:
            data = doc.to_dict() or {}
            items = self.insights_repository.fetch_shopping_list_items(getattr(doc, "reference", None))
            
            # Calculate item stats
            total_items = len(items)
            completed_items = sum(1 for i in items if i.get("isCompleted"))
            
            # Budget handling
            budget_data = data.get("budget", {})
            budget_summary = None
            if budget_data:
                budget_summary = {
                    "limit": self._to_number(budget_data.get("limit")),
                    "planned": self._to_number(budget_data.get("planned")),
                    "remaining": self._to_number(budget_data.get("remaining"))
                }

            # Dates
            updated_at = self._coerce_to_iso(data.get("updatedAt"))
            created_at = self._coerce_to_iso(data.get("createdAt"))
            
            return {
                "id": doc.id,
                "name": data.get("name", "Untitled List"),
                "description": data.get("description"),
                "updatedAt": updated_at,
                "createdAt": created_at,
                "totalItems": total_items,
                "completedItems": completed_items,
                "budget": budget_summary,
                "isShared": bool(data.get("memberIds") and len(data.get("memberIds")) > 1),
                "memberCount": len(data.get("memberIds", [])),
                "items": items[:5], # Preview only
                "role": data.get("roles", {}).get(viewer_id, "viewer"),
                "ownerId": data.get("ownerId")
            }
         except Exception as e:
             logger.warning(f"Failed to build list summary: {e}")
             return None

    def get_user_timeline(self, user_id: str, limit: int = 50) -> Optional[Dict[str, Any]]:
        # Check user profile
        profile = self._get_profile(user_id)
        if not profile:
             return None

        events: List[Dict[str, Any]] = []

        # 1. Shopping Lists
        lists = self.insights_repository.fetch_shopping_lists(user_id)
        for doc in lists:
            data = doc.to_dict() or {}
            updated_at = data.get("updatedAt")
            iso = self._timestamp_to_iso(updated_at)
            if not iso and isinstance(updated_at, str):
                iso = updated_at

            ts_val = 0.0
            if hasattr(updated_at, "timestamp"):
                ts_val = updated_at.timestamp()
            elif isinstance(updated_at, (int, float)):
                 ts_val = float(updated_at) / 1000.0 if updated_at > 1e11 else float(updated_at)
            elif iso:
                try:
                    ts_val = self._iso_to_datetime(iso).timestamp()
                except: pass
            
            if iso:
                events.append({
                    "type": "shopping_list",
                    "timestamp": iso,
                    "title": f"Updated list '{data.get('name', 'Untitled')}'",
                    "source": "shopping_list",
                    "data": {"listId": doc.id, "name": data.get("name")},
                    "_sort": ts_val
                })

        # 2. Searches
        searches = self.insights_repository.fetch_recent_searches(user_id)
        for doc in searches:
            data = doc.to_dict() or {}
            ts = data.get("ts")
            iso = self._millis_to_iso(ts)
            ts_val = float(ts) / 1000.0 if ts else 0.0
            
            if iso:
                events.append({
                    "type": "search",
                    "timestamp": iso,
                    "title": f"Searched: {data.get('q')}",
                    "source": "search_history",
                    "data": {"query": data.get("q")},
                    "_sort": ts_val
                })

        # 3. AI Sessions
        ai_sessions = self.insights_repository.fetch_ai_sessions_from_sources(user_id)
        for doc in ai_sessions:
            data = doc.to_dict() or {}
            created_at = data.get("createdAt")
            iso = self._timestamp_to_iso(created_at)
            ts_val = 0.0
            if hasattr(created_at, "timestamp"):
                ts_val = created_at.timestamp()
                
            if iso:
                events.append({
                    "type": "ai_session",
                    "timestamp": iso,
                    "title": f"AI Chat: {data.get('summary', 'Session')}",
                    "source": "ai_session",
                    "data": {"id": doc.id},
                    "_sort": ts_val
                })
        
        # Sort and Slice
        events.sort(key=lambda x: x["_sort"], reverse=True)
        final_events = []
        for e in events[:limit]:
            e.pop("_sort", None)
            final_events.append(e)

        return {
            "userId": user_id,
            "events": final_events,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "presence": self._get_presence_snapshot(user_id)
        }

    # Helpers
    @staticmethod
    def _timestamp_to_iso(value: Any) -> Optional[str]:
        if hasattr(value, "to_datetime"):
            try:
                return value.to_datetime().isoformat()
            except Exception:
                pass
        if hasattr(value, "isoformat"):
            try:
                return value.isoformat()
            except Exception:
                pass
        return None

    @staticmethod
    def _millis_to_iso(value: Any) -> Optional[str]:
        try:
            millis = int(value)
            dt = datetime.fromtimestamp(millis / 1000, tz=timezone.utc)
            return dt.isoformat()
        except Exception:
            return None

    @staticmethod
    def _iso_to_datetime(value: str) -> datetime:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return datetime.now(timezone.utc)

    def _coerce_to_iso(self, value: Any) -> Optional[str]:
        if value is None: return None
        iso = self._timestamp_to_iso(value)
        if iso: return iso
        iso = self._millis_to_iso(value)
        if iso: return iso
        return None
    
    @staticmethod
    def _to_number(value: Any) -> Optional[float]:
        try:
            return float(value)
        except Exception:
            return None

