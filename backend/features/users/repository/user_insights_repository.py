from typing import Any, Dict, List, Optional, Union, Tuple
from google.cloud import firestore
from services.firebase.firebase_service import firebase_service
from services.system.logger_service import get_logger

logger = get_logger(__name__)

try:
    from google.cloud.firestore_v1 import FieldPath  # type: ignore[attr-defined]
except ImportError:  # pragma: no cover - stable import path in newer versions
    try:
        from google.cloud.firestore_v1.field_path import FieldPath  # type: ignore[attr-defined]
    except ImportError:  # pragma: no cover - legacy fallback
        try:
            from google.cloud.firestore import FieldPath  # type: ignore[attr-defined]
        except ImportError:  # pragma: no cover - FieldPath unavailable
            FieldPath = None  # type: ignore[assignment]

class UserInsightsRepository:
    SHOPPING_LIST_LIMIT = 5
    SHOPPING_LIST_ITEM_LIMIT = 50
    SEARCH_HISTORY_LIMIT = 10
    FRIEND_LIMIT = 15
    AI_SESSION_LIMIT = 5

    def __init__(self):
        self.db = firebase_service.get_client()

    def stream_users(self, limit: Optional[int] = None) -> List[Any]:
        users_ref = self.db.collection("users")
        if limit is not None:
            limit = max(1, min(limit, 500))
            return list(users_ref.limit(limit).stream())
        return list(users_ref.stream())

    def fetch_status_documents(self, user_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        if not user_ids:
            return {}

        unique_ids = list(dict.fromkeys(user_ids))
        status_collection = self.db.collection("status")
        results: Dict[str, Dict[str, Any]] = {}

        def fetch_individual(doc_ids: List[str]) -> None:
            for doc_id in doc_ids:
                try:
                    doc = status_collection.document(doc_id).get()
                except Exception:
                    continue
                if doc.exists:
                    results[doc.id] = doc.to_dict() or {}

        if FieldPath is not None:
            chunk_size = 10
            for index in range(0, len(unique_ids), chunk_size):
                chunk = unique_ids[index : index + chunk_size]
                try:
                    query = status_collection.where(FieldPath.document_id(), "in", chunk)
                    for doc in query.stream():
                        results[doc.id] = doc.to_dict() or {}
                except Exception:
                    fetch_individual(chunk)
        else:
            fetch_individual(unique_ids)

        return results

    def fetch_rtdb_status_documents(self, user_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        # This uses firebase_service RTDB access, technically Service logic or Infrastructure logic,
        # but wrapping in Repository is fine for data access abstraction.
        if not user_ids:
            return {}

        ref = firebase_service.get_rtdb_reference("status")
        if ref is None:
            return {}

        try:
            snapshot = ref.get()
        except Exception as exc:
            logger.warning("Failed to fetch RTDB status map", extra={"error": str(exc)})
            return {}

        if not isinstance(snapshot, dict):
            return {}

        results: Dict[str, Dict[str, Any]] = {}
        for user_id in user_ids:
            payload = snapshot.get(user_id)
            if isinstance(payload, dict):
                results[user_id] = payload

        return results

    def fetch_shopping_lists(self, user_id: str) -> Any:
        try:
            query = (
                self.db.collection("shopping_lists")
                .where("memberIds", "array_contains", user_id)
                .order_by("updatedAt", direction=firestore.Query.DESCENDING)
                .limit(self.SHOPPING_LIST_LIMIT)
            )
        except Exception as exc:
            logger.warning("Failed to build shopping list query", extra={"user_id": user_id, "error": str(exc)})
            try:
                query = self.db.collection("shopping_lists").where("memberIds", "array_contains", user_id)
            except Exception as inner_exc:
                logger.warning("Failed to fetch shopping lists", extra={"user_id": user_id, "error": str(inner_exc)})
                return []
        
        try:
            return list(query.stream())
        except Exception as exc:
            logger.warning("Failed to stream shopping lists", extra={"user_id": user_id, "error": str(exc)})
            return []

    def fetch_shopping_list_items(self, list_ref: Any) -> List[Dict[str, Any]]:
        if list_ref is None:
            return []

        try:
            query = (
                list_ref.collection("items")
                .order_by("updatedAt", direction=firestore.Query.DESCENDING)
                .limit(self.SHOPPING_LIST_ITEM_LIMIT)
            )
        except Exception:
            query = list_ref.collection("items").limit(self.SHOPPING_LIST_ITEM_LIMIT)

        items: List[Dict[str, Any]] = []
        try:
            for item_doc in query.stream():
                data = item_doc.to_dict() or {}
                data['id'] = item_doc.id # Ensure ID is preserved if needed
                items.append(data)
        except Exception as exc:
             logger.warning("Failed to fetch items for shopping list", extra={"error": str(exc)})
        return items

    def fetch_friends(self, user_id: str) -> List[Any]:
        try:
            collection = self.db.collection("users").document(user_id).collection("friends")
            return list(collection.limit(self.FRIEND_LIMIT).stream())
        except Exception as exc:
            logger.warning("Failed to fetch friends", extra={"user_id": user_id, "error": str(exc)})
            return []

    def fetch_recent_searches(self, user_id: str) -> List[Any]:
        try:
            collection = (
                self.db.collection("users")
                .document(user_id)
                .collection("searchHistory")
                .order_by("ts", direction=firestore.Query.DESCENDING)
                .limit(self.SEARCH_HISTORY_LIMIT)
            )
            return list(collection.stream())
        except Exception as exc:
            logger.warning("Failed to fetch search history", extra={"user_id": user_id, "error": str(exc)})
            return []

    def fetch_ai_history_sessions(self, user_id: str) -> List[Any]:
        collection = (
            self.db.collection("users")
            .document(user_id)
            .collection("ai_history")
        )
        try:
            query = collection.order_by("ts", direction=firestore.Query.DESCENDING).limit(self.AI_SESSION_LIMIT)
        except Exception:
            try:
                query = collection.limit(self.AI_SESSION_LIMIT)
            except Exception as exc:
                logger.warning("Failed to fetch AI history", extra={"user_id": user_id, "error": str(exc)})
                return []
        
        try:
            return list(query.stream())
        except Exception as exc:
            logger.warning("Failed to stream AI history", extra={"user_id": user_id, "error": str(exc)})
            return []

    def fetch_ai_sessions_from_sources(self, user_id: str) -> List[Any]:
        # Logic from _fetch_ai_sessions that checks 2 sources
        sources = [
            self.db.collection("users").document(user_id).collection("aiSessions"),
            self.db.collection("ai_sessions").document(user_id).collection("sessions"),
        ]
        
        for source in sources:
            try:
                docs = (
                    source.order_by("createdAt", direction=firestore.Query.DESCENDING)
                    .limit(self.AI_SESSION_LIMIT)
                    .stream()
                )
                return list(docs) # Return first successful source
            except Exception:
                continue
        return []

    def get_user_document(self, user_id: str) -> Optional[Any]:
        try:
            return self.db.collection("users").document(user_id).get()
        except Exception:
            return None

    def get_status_document(self, user_id: str) -> Optional[Any]:
         try:
            return self.db.collection("status").document(user_id).get()
         except Exception:
            return None
    
    
    # helper for Shopping List Stats
    def count_shopping_lists(self, user_id: str) -> Tuple[int, int]:
        try:
            lists_query = (
                self.db.collection("shopping_lists")
                .where("memberIds", "array_contains", user_id)
                .limit(self.SHOPPING_LIST_LIMIT)
            )
            list_docs = list(lists_query.stream())
            total = len(list_docs)
            shared = sum(1 for doc in list_docs if (doc.to_dict() or {}).get("isShared"))
            return total, shared
        except Exception:
            return 0, 0
            
    def count_friends(self, user_id: str) -> int:
         try:
            friends_collection = (
                self.db.collection("users").document(user_id).collection("friends")
            )
            return len(list(friends_collection.limit(self.FRIEND_LIMIT).stream()))
         except Exception:
             return 0

    def count_recent_searches(self, user_id: str) -> int:
        try:
            search_docs = (
                self.db.collection("users")
                .document(user_id)
                .collection("searchHistory")
                .order_by("ts", direction=firestore.Query.DESCENDING)
                .limit(self.SEARCH_HISTORY_LIMIT)
                .stream()
            )
            return sum(1 for _ in search_docs)
        except Exception:
            return 0

    def count_ai_sessions(self, user_id: str) -> int:
        try:
            ai_docs = (
                self.db.collection("users")
                .document(user_id)
                .collection("aiSessions")
                .limit(self.AI_SESSION_LIMIT)
                .stream()
            )
            return sum(1 for _ in ai_docs)
        except Exception:
             # Legacy
            try:
                ai_docs = (
                    self.db.collection("ai_sessions")
                    .document(user_id)
                    .collection("sessions")
                    .limit(self.AI_SESSION_LIMIT)
                    .stream()
                )
                return sum(1 for _ in ai_docs)
            except Exception:
                return 0
