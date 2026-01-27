"""Service layer for managing product requests, attachments, and AI analysis."""

from __future__ import annotations

import base64
import io
import os
import re
import sys
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Iterable, List, Optional, Tuple

from google.cloud.firestore_v1 import CollectionReference, DocumentReference, DocumentSnapshot
from PIL import Image
from werkzeug.utils import secure_filename

from firebase_admin import firestore

from services.firebase.firebase_service import firebase_service
from backend.features.users.mapper.user_mapper import normalise_user_profile
from services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

# Import Slack notifier for product requests
try:
    from services.slack.product_request_notifier import ProductRequestSlackNotifier
    _slack_notifier = ProductRequestSlackNotifier()
    _slack_enabled = _slack_notifier.enabled
except Exception as e:
    logger.warning("Slack notifications unavailable for product requests", extra={"error": str(e)})
    _slack_notifier = None
    _slack_enabled = False

from backend.features.products.service.matcher import IntelligentProductMatcher
from backend.utils.product_utils import generate_product_id


@dataclass
class AttachmentInput:
    filename: str
    content_type: str
    data: bytes


class ProductRequestService:
    """Encapsulates Firestore CRUD, storage handling, and AI analysis for product requests."""

    STATUS_CANONICAL = ("pending", "inReview", "approved", "completed", "rejected")
    STATUS_LEGACY_MAPPING = {
        "submitted": "pending",
        "in_review": "inReview",
        "acknowledged": "inReview",
        "resolved": "completed",
    }
    VALID_STATUS = set(STATUS_CANONICAL) | set(STATUS_LEGACY_MAPPING.keys())
    VALID_REQUEST_TYPES = {"newProduct", "updateProduct", "reportError", "priceUpdate"}
    VALID_PRIORITY = {"low", "normal", "high"}
    PRIORITY_ORDER = {"low": 0, "normal": 1, "high": 2}
    DEFAULT_PRIORITY = "normal"
    DEFAULT_STATUS = "pending"
    DEFAULT_REQUEST_TYPE = "newProduct"
    AI_RECOMMENDATIONS = {
        "already_exists",
        "likely_duplicate",
        "create_new",
        "needs_manual_review",
    }

    CACHE_TTL_SECONDS = 15 * 60

    def __init__(self) -> None:
        self.db = firebase_service.get_client()
        self.bucket = firebase_service.get_bucket()
        self._matcher: Optional[IntelligentProductMatcher] = None
        self._matcher_lock = threading.Lock()
        self._last_cache_refresh: Optional[datetime] = None
        self._user_profile_cache: Dict[str, Dict[str, Any]] = {}
        self._user_cache_lock = threading.Lock()
        self.USER_CACHE_TTL_SECONDS = 5 * 60

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def create_request(
        self,
        payload: Dict[str, Any],
        attachments: Optional[List[AttachmentInput]] = None,
    ) -> Dict[str, Any]:
        """Create a new product request document and trigger AI analysis."""
        logger.info("Creating product request", extra={
            "product_name": payload.get("productName"),
            "request_type": payload.get("requestType"),
            "attachment_count": len(attachments) if attachments else 0
        })

        validated = self._validate_payload(payload)
        request_id = self._generate_request_id()
        doc_ref = self.db.collection("product_requests").document(request_id)

        attachment_docs = self._store_attachments(request_id, attachments or [])
        timestamp = firestore.SERVER_TIMESTAMP

        doc_body = {
            "requestType": validated["requestType"],
            "productName": validated["productName"],
            "brand": validated.get("brand", ""),
            "size": validated.get("size", ""),
            "categoryHint": validated.get("categoryHint", ""),
            "store": validated.get("store", ""),
            "storeLocation": validated.get("storeLocation", {}),
            "description": validated.get("description", ""),
            "taggedProductId": validated.get("taggedProductId") or None,
            "priority": validated.get("priority", self.DEFAULT_PRIORITY),
            "status": self.DEFAULT_STATUS,
            "submittedBy": validated.get("submittedBy", {}),
            "submissionSource": validated.get("submissionSource", "mobile"),
            "attachments": attachment_docs,
            "photoUrls": validated.get("photoUrls") or [],
            "issue": validated.get("issue", {}),
            "labels": validated.get("labels", []),
            "assignedTo": None,
            "aiAnalysis": {
                "status": "pending",
                "lastRun": None,
                "matcherVersion": None,
                "summary": "Analysis pending",
                "recommendation": "needs_manual_review",
                "confidence": 0.0,
                "matchedProductId": None,
                "matches": [],
                "signals": {},
            },
            "searchTokens": self._build_search_tokens(validated),
            "createdAt": timestamp,
            "updatedAt": timestamp,
            "latestActivity": {
                "timestamp": timestamp,
                "action": "created",
                "actor": "system",
                "actorName": "System",
                "summary": "Request created",
            },
        }

        doc_ref.set(doc_body)

        # Persist activity entry
        self._append_activity(
            doc_ref,
            action="created",
            actor_id="system",
            actor_name="System",
            summary="Product request submitted",
            metadata={
                "priority": doc_body["priority"],
                "store": doc_body["store"],
            },
        )

        # Run initial AI analysis synchronously
        ai_result = self._run_ai_analysis(doc_ref, doc_body)
        if ai_result:
            doc_ref.update({
                "aiAnalysis": ai_result,
                "updatedAt": firestore.SERVER_TIMESTAMP,
                "latestActivity": {
                    "timestamp": firestore.SERVER_TIMESTAMP,
                    "action": "ai_analysis",
                    "actor": "system",
                    "actorName": "AI Automations",
                    "summary": ai_result.get("summary", "AI analysis completed"),
                },
            })
            self._append_activity(
                doc_ref,
                action="ai_analysis",
                actor_id="system",
                actor_name="AI Automations",
                summary=ai_result.get("summary", "AI analysis completed"),
                metadata={
                    "recommendation": ai_result.get("recommendation"),
                    "confidence": ai_result.get("confidence"),
                },
            )

        snapshot = doc_ref.get()
        logger.info("Product request created", extra={
            "request_id": request_id,
            "status": validated.get("status", self.DEFAULT_STATUS),
            "ai_recommendation": ai_result.get("recommendation") if ai_result else None,
            "ai_confidence": ai_result.get("confidence") if ai_result else 0.0
        })
        
        # Send Slack notification for new high-priority or urgent requests
        if _slack_enabled and _slack_notifier:
            priority = validated.get("priority", self.DEFAULT_PRIORITY)
            # Send notification for high priority or error reports
            if priority == "high" or validated.get("requestType") == "reportError":
                try:
                    # Build a simple digest for this single request
                    digest = {
                        "items": [{
                            "id": request_id,
                            "productName": validated["productName"],
                            "store": validated.get("store", "Unknown"),
                            "priority": priority,
                            "status": self.DEFAULT_STATUS,
                            "requestType": validated.get("requestType", self.DEFAULT_REQUEST_TYPE),
                            "description": validated.get("description", ""),
                            "submittedBy": validated.get("submittedBy", {}).get("displayName") or "Unknown",
                            "aiRecommendation": ai_result.get("recommendation") if ai_result else None,
                            "aiSummary": ai_result.get("summary") if ai_result else None,
                        }],
                        "windowMinutes": 1,
                        "minPriority": priority,
                        "generatedAt": datetime.now(timezone.utc).isoformat(),
                        "counts": {
                            "priority": {priority: 1},
                            "status": {self.DEFAULT_STATUS: 1},
                            "requestType": {validated.get("requestType", self.DEFAULT_REQUEST_TYPE): 1}
                        }
                    }
                    _slack_notifier.send_product_request_digest(digest)
                    logger.info("Slack notification sent for new product request", extra={"request_id": request_id})
                except Exception as e:
                    logger.warning("Failed to send Slack notification", extra={"request_id": request_id, "error": str(e)})
        
        return self._serialize_request(snapshot, include_activity_preview=True)

    def list_requests(
        self,
        *,
        status: Optional[str] = None,
        request_type: Optional[str] = None,
        priority: Optional[str] = None,
        recommendation: Optional[str] = None,
        store: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """Return paginated product requests with optional filters."""
        logger.debug("Listing product requests", extra={
            "status": status,
            "request_type": request_type,
            "priority": priority,
            "page": page,
            "page_size": page_size
        })

        page = max(page, 1)
        page_size = max(1, min(page_size, 100))

        collection = self.db.collection("product_requests")
        base_query: CollectionReference | Any = collection.order_by(
            "createdAt", direction=firestore.Query.DESCENDING
        )

        if status and status in self.VALID_STATUS:
            base_query = base_query.where("status", "==", status)
        if request_type and request_type in self.VALID_REQUEST_TYPES:
            base_query = base_query.where("requestType", "==", request_type)
        if priority and priority in self.VALID_PRIORITY:
            base_query = base_query.where("priority", "==", priority)
        if recommendation and recommendation in self.AI_RECOMMENDATIONS:
            base_query = base_query.where("aiAnalysis.recommendation", "==", recommendation)
        if store:
            base_query = base_query.where("store", "==", store)

        search_tokens = self._normalize_search(search)
        if search_tokens:
            # Firestore supports up to 10 values for array_contains_any
            base_query = base_query.where(
                "searchTokens",
                "array_contains_any",
                search_tokens[:10],
            )

        offset = (page - 1) * page_size
        query = base_query.limit(page_size).offset(offset)
        documents = query.stream()
        items = [self._serialize_request(doc, include_activity_preview=True) for doc in documents]

        # Basic total count (iterate query without limit) – acceptable for current scale
        total = len(list(base_query.stream())) if offset == 0 else None

        return {
            "items": items,
            "page": page,
            "pageSize": page_size,
            "total": total,
            "hasMore": len(items) == page_size,
        }

    def get_request(self, request_id: str, *, activity_limit: int = 20) -> Optional[Dict[str, Any]]:
        logger.debug("Fetching product request", extra={"request_id": request_id})
        doc_ref = self.db.collection("product_requests").document(request_id)
        snapshot = doc_ref.get()
        if not snapshot.exists:
            logger.warning("Product request not found", extra={"request_id": request_id})
            return None
        result = self._serialize_request(snapshot, include_activity_preview=True, signed_urls=True)
        activities = (
            doc_ref.collection("activity")
            .order_by("timestamp", direction=firestore.Query.DESCENDING)
            .limit(activity_limit)
            .stream()
        )
        result["activity"] = [self._serialize_activity(act) for act in activities]
        return result

    def update_request(self, request_id: str, updates: Dict[str, Any], actor: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        logger.info("Updating product request", extra={"request_id": request_id, "fields": list(updates.keys())})
        doc_ref = self.db.collection("product_requests").document(request_id)
        snapshot = doc_ref.get()
        if not snapshot.exists:
            logger.warning("Product request not found for update", extra={"request_id": request_id})
            return None

        allowed_fields = {"status", "priority", "labels", "assignedTo", "storeLocation"}
        payload = {k: v for k, v in updates.items() if k in allowed_fields}

        changes: Dict[str, Any] = {}
        summary_parts: List[str] = []

        if "status" in payload:
            new_status = payload["status"]
            if new_status not in self.VALID_STATUS:
                raise ValueError("Invalid status value")
            changes["status"] = new_status
            summary_parts.append(f"Status → {new_status}")
        if "priority" in payload:
            new_priority = payload["priority"].lower()
            if new_priority not in self.VALID_PRIORITY:
                raise ValueError("Invalid priority value")
            changes["priority"] = new_priority
            summary_parts.append(f"Priority → {new_priority}")
        if "labels" in payload and isinstance(payload["labels"], list):
            deduped = sorted({str(label).strip() for label in payload["labels"] if str(label).strip()})
            changes["labels"] = deduped
            summary_parts.append("Labels updated")
        if "assignedTo" in payload:
            assigned = payload["assignedTo"]
            if isinstance(assigned, dict) and assigned:
                assigned = dict(assigned)
                assigned.setdefault("assignedAt", firestore.SERVER_TIMESTAMP)
            changes["assignedTo"] = assigned
            summary_parts.append("Assignment updated")
        if "storeLocation" in payload:
            changes["storeLocation"] = payload["storeLocation"]
            summary_parts.append("Store location updated")

        if not changes:
            return self._serialize_request(snapshot)

        changes["updatedAt"] = firestore.SERVER_TIMESTAMP
        doc_ref.update(changes)

        summary = ", ".join(summary_parts) if summary_parts else "Request updated"
        self._append_activity(
            doc_ref,
            action="update",
            actor_id=actor.get("id", "unknown"),
            actor_name=actor.get("name", "Unknown"),
            summary=summary,
            metadata=changes,
        )
        doc_ref.update(
            {
                "latestActivity": {
                    "timestamp": firestore.SERVER_TIMESTAMP,
                    "action": "update",
                    "actor": actor.get("id", "unknown"),
                    "actorName": actor.get("name", "Unknown"),
                    "summary": summary,
                }
            }
        )

        updated_snapshot = doc_ref.get()
        return self._serialize_request(updated_snapshot, include_activity_preview=True)

    def add_note(self, request_id: str, note: str, actor: Dict[str, Any], *, is_private: bool = False) -> Optional[Dict[str, Any]]:
        doc_ref = self.db.collection("product_requests").document(request_id)
        if not doc_ref.get().exists:
            return None

        note_entry = {
            "id": str(uuid.uuid4()),
            "authorId": actor.get("id", "unknown"),
            "authorName": actor.get("name", "Unknown"),
            "note": note,
            "visibility": "internal",
            "isPrivate": bool(is_private),
            "createdAt": datetime.now(timezone.utc),
        }

        doc_ref.update(
            {
                "adminNotes": firestore.ArrayUnion([note_entry]),
                "updatedAt": firestore.SERVER_TIMESTAMP,
                "latestActivity": {
                    "timestamp": firestore.SERVER_TIMESTAMP,
                    "action": "note",
                    "actor": actor.get("id", "unknown"),
                    "actorName": actor.get("name", "Unknown"),
                    "summary": note[:120],
                },
            }
        )
        self._append_activity(
            doc_ref,
            action="note",
            actor_id=actor.get("id", "unknown"),
            actor_name=actor.get("name", "Unknown"),
            summary="Admin note added",
            metadata={"note": note},
        )
        return self._serialize_request(doc_ref.get(), include_activity_preview=True)

    def bulk_acknowledge(
        self,
        request_ids: Iterable[str],
        actor: Dict[str, Any],
        *,
        assign_to: Optional[Dict[str, Any]] = None,
        limit: int = 50,
    ) -> Dict[str, Any]:
        ids: List[str] = []
        for request_id in request_ids:
            if not request_id:
                continue
            normalized = str(request_id).strip()
            if normalized and normalized not in ids:
                ids.append(normalized)
            if len(ids) >= limit:
                break

        if not ids:
            return {"updated": 0, "failed": [], "items": []}

        assignment = dict(assign_to) if isinstance(assign_to, dict) and assign_to else None
        payload: Dict[str, Any] = {"status": "inReview"}
        if assignment:
            payload["assignedTo"] = assignment

        updated_items: List[Dict[str, Any]] = []
        failures: List[Dict[str, Any]] = []

        for request_id in ids:
            try:
                updated = self.update_request(request_id, payload, actor)
                if not updated:
                    failures.append({"id": request_id, "reason": "not_found"})
                    continue
                updated_items.append(updated)
            except ValueError as exc:
                failures.append({"id": request_id, "reason": str(exc)})
            except Exception as exc:  # noqa: BLE001
                failures.append({"id": request_id, "reason": f"unexpected_error: {exc}"})

        return {
            "updated": len(updated_items),
            "failed": failures,
            "items": updated_items,
            "limit": limit,
        }

    def rerun_ai(self, request_id: str, actor: Dict[str, Any], force_refresh: bool = False) -> Optional[Dict[str, Any]]:
        doc_ref = self.db.collection("product_requests").document(request_id)
        snapshot = doc_ref.get()
        if not snapshot.exists:
            return None

        doc_data = snapshot.to_dict() or {}
        ai_result = self._run_ai_analysis(doc_ref, doc_data, force_refresh=force_refresh)
        if ai_result:
            doc_ref.update(
                {
                    "aiAnalysis": ai_result,
                    "updatedAt": firestore.SERVER_TIMESTAMP,
                    "latestActivity": {
                        "timestamp": firestore.SERVER_TIMESTAMP,
                        "action": "ai_analysis",
                        "actor": actor.get("id", "system"),
                        "actorName": actor.get("name", "AI Automations"),
                        "summary": ai_result.get("summary", "AI analysis updated"),
                    },
                }
            )
            self._append_activity(
                doc_ref,
                action="ai_analysis",
                actor_id=actor.get("id", "system"),
                actor_name=actor.get("name", "AI Automations"),
                summary=ai_result.get("summary", "AI analysis updated"),
                metadata={
                    "recommendation": ai_result.get("recommendation"),
                    "confidence": ai_result.get("confidence"),
                },
            )
        return self._serialize_request(doc_ref.get(), include_activity_preview=True)

    def get_stats(self) -> Dict[str, Any]:
        collection = self.db.collection("product_requests")
        results = {
            "status": {status: 0 for status in self.STATUS_CANONICAL},
            "requestType": {rtype: 0 for rtype in self.VALID_REQUEST_TYPES},
            "priority": {priority: 0 for priority in self.VALID_PRIORITY},
            "recommendation": {rec: 0 for rec in self.AI_RECOMMENDATIONS},
            "totals": {
                "totalRequests": 0,
                "requestsToday": 0,
                "requestsThisWeek": 0,
                "requestsThisMonth": 0,
                "highPriority": 0,
            },
            "recentRequests": [],
            "total": 0,
        }

        documents = list(collection.stream())
        results["totals"]["totalRequests"] = len(documents)
        results["total"] = len(documents)

        now = datetime.now(timezone.utc)
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)

        dated_documents: List[Tuple[Optional[datetime], DocumentSnapshot]] = []

        for doc in documents:
            data = doc.to_dict() or {}

            status = self._normalise_status(data.get("status"))
            if status in results["status"]:
                results["status"][status] += 1

            request_type = self._normalise_request_type(data.get("requestType"))
            if request_type in results["requestType"]:
                results["requestType"][request_type] += 1

            priority = str(data.get("priority") or self.DEFAULT_PRIORITY).lower()
            if priority in results["priority"]:
                results["priority"][priority] += 1
                if priority == "high":
                    results["totals"]["highPriority"] += 1

            recommendation = (data.get("aiAnalysis") or {}).get("recommendation")
            if recommendation in results["recommendation"]:
                results["recommendation"][recommendation] += 1

            created_at = self._timestamp_to_datetime(data.get("createdAt"))
            if created_at:
                if created_at >= start_of_day:
                    results["totals"]["requestsToday"] += 1
                if created_at >= week_ago:
                    results["totals"]["requestsThisWeek"] += 1
                if created_at >= month_ago:
                    results["totals"]["requestsThisMonth"] += 1
            dated_documents.append((created_at, doc))

        dated_documents.sort(key=lambda item: item[0] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
        results["recentRequests"] = [
            self._serialize_request(doc, include_activity_preview=False)
            for _, doc in dated_documents[:10]
        ]

        return results

    def build_priority_digest(
        self,
        *,
        since_minutes: int = 60,
        min_priority: str = "high",
        max_items: int = 6,
        include_completed: bool = False,
        _documents: Optional[Iterable[DocumentSnapshot]] = None,
    ) -> Dict[str, Any]:
        """Collect a normalized view of urgent requests for Slack digests.

        `_documents` is reserved for tests, allowing us to bypass Firestore queries.
        """

        since_minutes = max(5, min(12 * 60, since_minutes))
        max_items = max(1, min(15, max_items))
        priority_threshold = self._priority_rank(min_priority)

        cutoff = datetime.now(timezone.utc) - timedelta(minutes=since_minutes)
        if _documents is None:
            collection = self.db.collection("product_requests")
            query = (
                collection.where("createdAt", ">=", cutoff)
                .order_by("createdAt", direction=firestore.Query.DESCENDING)
                .limit(max_items * 4)
            )
            documents = query.stream()
        else:
            documents = _documents
        digest_payload = self._collect_digest_entries(
            documents,
            priority_threshold=priority_threshold,
            include_completed=include_completed,
            max_items=max_items,
        )

        return {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "windowMinutes": since_minutes,
            "minPriority": min_priority,
            **digest_payload,
        }

    def refresh_matcher_cache(self) -> Dict[str, Any]:
        matcher = self._get_matcher(force_refresh=True)
        return {
            "refreshed": matcher is not None,
            "cachedProducts": len(matcher.product_cache) if matcher else 0,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _validate_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not payload:
            raise ValueError("Request payload is empty")

        product_name = (payload.get("productName") or "").strip()
        if not product_name:
            raise ValueError("productName is required")

        validated: Dict[str, Any] = {
            "productName": product_name,
            "brand": (payload.get("brand") or "").strip(),
            "size": (payload.get("size") or "").strip(),
            "categoryHint": (payload.get("categoryHint") or "").strip(),
            "store": (payload.get("store") or "").strip(),
            "storeLocation": payload.get("storeLocation", {}),
            "description": (payload.get("description") or "").strip(),
            "priority": (payload.get("priority") or self.DEFAULT_PRIORITY).lower(),
            "requestType": payload.get("requestType") or payload.get("type") or self.DEFAULT_REQUEST_TYPE,
            "taggedProductId": (payload.get("taggedProductId") or "").strip(),
            "issue": payload.get("issue") or {},
            "photoUrls": payload.get("photoUrls") or [],
            "submittedBy": payload.get("submittedBy", {}),
            "submissionSource": payload.get("submissionSource", "mobile"),
            "labels": payload.get("labels", []),
        }

        if validated["priority"] not in self.VALID_PRIORITY:
            validated["priority"] = self.DEFAULT_PRIORITY
        request_type = self._normalise_request_type(validated["requestType"])
        validated["requestType"] = request_type if request_type in self.VALID_REQUEST_TYPES else self.DEFAULT_REQUEST_TYPE
        return validated

    def _generate_request_id(self) -> str:
        return f"req_{int(time.time())}_{uuid.uuid4().hex[:6]}"

    def _store_attachments(
        self, request_id: str, attachments: List[AttachmentInput]
    ) -> List[Dict[str, Any]]:
        stored: List[Dict[str, Any]] = []
        if not attachments:
            return stored

        for idx, attachment in enumerate(attachments[:5]):
            safe_filename = secure_filename(attachment.filename or f"attachment_{idx}")
            storage_path = f"product-requests/{request_id}/{uuid.uuid4().hex}_{safe_filename}"
            processed = self._optimise_image(attachment.data, attachment.content_type)
            upload_meta = firebase_service.upload_bytes(
                storage_path,
                processed["data"],
                processed["content_type"],
                metadata={"width": processed.get("width"), "height": processed.get("height")},
            )
            if not upload_meta:
                continue
            stored.append(
                {
                    "filename": safe_filename,
                    "storagePath": upload_meta["storagePath"],
                    "contentType": upload_meta["contentType"],
                    "size": upload_meta["size"],
                    "width": processed.get("width"),
                    "height": processed.get("height"),
                    "uploadedAt": firestore.SERVER_TIMESTAMP,
                }
            )

        return stored

    def _optimise_image(self, data: bytes, content_type: str) -> Dict[str, Any]:
        """Downscale oversized images and recompress if necessary."""
        content_type = content_type or "image/jpeg"
        try:
            with Image.open(io.BytesIO(data)) as img:
                img_format = (img.format or "JPEG").upper()
                width, height = img.size
                max_edge = max(width, height)
                if max_edge > 1280:
                    ratio = 1280 / max_edge
                    new_size = (int(width * ratio), int(height * ratio))
                    img = img.resize(new_size, Image.LANCZOS)
                    width, height = img.size

                output = io.BytesIO()
                save_format = "JPEG" if img_format not in {"JPEG", "PNG", "WEBP"} else img_format
                img.save(output, format=save_format, quality=85, optimize=True)
                optimised_data = output.getvalue()
                output.close()
                mapped_content_type = {
                    "JPEG": "image/jpeg",
                    "PNG": "image/png",
                    "WEBP": "image/webp",
                }.get(save_format, content_type)
                return {
                    "data": optimised_data,
                    "content_type": mapped_content_type,
                    "width": width,
                    "height": height,
                }
        except Exception:
            # Fallback to original data
            return {
                "data": data,
                "content_type": content_type,
                "width": None,
                "height": None,
            }

    def _append_activity(
        self,
        doc_ref: DocumentReference,
        *,
        action: str,
        actor_id: str,
        actor_name: str,
        summary: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        doc_ref.collection("activity").add(
            {
                "timestamp": firestore.SERVER_TIMESTAMP,
                "action": action,
                "actorId": actor_id,
                "actorName": actor_name,
                "summary": summary,
                "metadata": metadata or {},
            }
        )

    def _run_ai_analysis(
        self,
        doc_ref: DocumentReference,
        doc_data: Dict[str, Any],
        *,
        force_refresh: bool = False,
    ) -> Optional[Dict[str, Any]]:
        matcher = self._get_matcher(force_refresh=force_refresh)
        if not matcher:
            return None

        candidate = {
            "name": doc_data.get("productName", ""),
            "brand_name": doc_data.get("brand", ""),
            "sizeRaw": doc_data.get("size", ""),
            "variety": doc_data.get("categoryHint", ""),
        }

        matches = matcher.find_similar_products(candidate, limit=5)
        best_match = matches[0] if matches else None
        best_score = best_match.similarity_score if best_match else 0.0

        recommendation = self._derive_recommendation(best_score, bool(best_match))
        matched_product_id = best_match.product_id if best_match else None

        generated_id = None
        if candidate["name"]:
            generated_id = generate_product_id(
                doc_data.get("brand", ""),
                candidate["name"],
                doc_data.get("size", ""),
            )

        summary = self._compose_summary(recommendation, best_score, best_match)

        return {
            "status": "complete",
            "lastRun": datetime.now(timezone.utc).isoformat(),
            "matcherVersion": getattr(matcher, "__class__", type(matcher)).__name__,
            "summary": summary,
            "recommendation": recommendation,
            "confidence": round(best_score, 3),
            "matchedProductId": matched_product_id,
            "generatedProductId": generated_id,
            "matches": [
                {
                    "productId": match.product_id,
                    "name": match.matched_product.get("name"),
                    "brand": match.matched_product.get("brand_name"),
                    "size": match.matched_product.get("size"),
                    "category": match.matched_product.get("category"),
                    "similarity": round(match.similarity_score, 3),
                    "reasons": match.match_reasons,
                    "imageUrl": match.matched_product.get("image_url"),
                    "isDuplicate": match.is_duplicate,
                }
                for match in matches
            ],
            "signals": {
                "bestScore": round(best_score, 3),
                "hasMatches": bool(matches),
                "generatedProductId": generated_id,
            },
        }

    def _derive_recommendation(self, best_score: float, has_match: bool) -> str:
        if has_match and best_score >= 0.95:
            return "already_exists"
        if has_match and best_score >= 0.88:
            return "likely_duplicate"
        if has_match and best_score >= 0.75:
            return "needs_manual_review"
        return "create_new"

    def _compose_summary(self, recommendation: str, score: float, match) -> str:
        labels = {
            "already_exists": "Catalogue match found",
            "likely_duplicate": "Possible duplicate detected",
            "needs_manual_review": "Review recommended",
            "create_new": "No similar products detected",
        }
        summary = labels.get(recommendation, "AI analysis completed")
        if score:
            summary = f"{summary} (confidence {round(score * 100)}%)"
        if recommendation in {"already_exists", "likely_duplicate"} and match:
            summary += f" → {match.matched_product.get('name')}"
        return summary

    def _get_matcher(self, *, force_refresh: bool = False) -> Optional[IntelligentProductMatcher]:
        with self._matcher_lock:
            if not self._matcher:
                cache_path = os.path.join(os.path.dirname(__file__), '..', '..', 'cache', 'product_cache.pkl')
                self._matcher = IntelligentProductMatcher(cache_file=cache_path)
                force_refresh = True

            if force_refresh or self._cache_stale():
                db_client = firebase_service.get_client()
                try:
                    self._matcher.refresh_cache_from_db(db_client)
                    self._last_cache_refresh = datetime.now(timezone.utc)
                except Exception as exc:
                    logger.warning("Failed to refresh product matcher cache", extra={"error": str(exc)})
        return self._matcher

    def _cache_stale(self) -> bool:
        if not self._last_cache_refresh:
            return True
        delta = datetime.now(timezone.utc) - self._last_cache_refresh
        return delta.total_seconds() > self.CACHE_TTL_SECONDS

    def _build_search_tokens(self, payload: Dict[str, Any]) -> List[str]:
        tokens: set[str] = set()
        for key in ("productName", "brand", "store", "categoryHint", "taggedProductId", "requestType"):
            value = payload.get(key)
            if not value:
                continue
            for token in re.split(r"[^a-zA-Z0-9]+", value.lower()):
                if len(token) >= 2:
                    tokens.add(token)
        return sorted(tokens)

    def _collect_digest_entries(
        self,
        documents: Iterable[DocumentSnapshot],
        *,
        priority_threshold: int,
        include_completed: bool,
        max_items: int,
    ) -> Dict[str, Any]:
        counts = {
            "priority": {priority: 0 for priority in self.VALID_PRIORITY},
            "status": {status: 0 for status in self.STATUS_CANONICAL},
            "requestType": {rtype: 0 for rtype in self.VALID_REQUEST_TYPES},
            "stores": {},
        }
        items: List[Dict[str, Any]] = []
        seen_ids: set[str] = set()
        evaluated = 0

        for doc in documents:
            evaluated += 1
            data = doc.to_dict() or {}
            priority = str(data.get("priority") or self.DEFAULT_PRIORITY).lower()
            if self._priority_rank(priority) < priority_threshold:
                continue
            status = self._normalise_status(data.get("status"))
            if not include_completed and status in {"completed", "rejected"}:
                continue
            serialized = self._serialize_request(doc, include_activity_preview=False)
            if serialized["id"] in seen_ids:
                continue

            counts["priority"][priority] = counts["priority"].get(priority, 0) + 1
            counts["status"][status] = counts["status"].get(status, 0) + 1
            request_type = serialized.get("requestType", self.DEFAULT_REQUEST_TYPE)
            counts["requestType"][request_type] = counts["requestType"].get(request_type, 0) + 1
            store_label = (serialized.get("store") or "Unknown store").strip() or "Unknown store"
            counts["stores"][store_label] = counts["stores"].get(store_label, 0) + 1

            item = {
                "id": serialized["id"],
                "productName": serialized.get("productName", "Unnamed product"),
                "store": store_label,
                "priority": priority,
                "status": status,
                "requestType": request_type,
                "description": serialized.get("description", ""),
                "createdAt": serialized.get("createdAt"),
                "updatedAt": serialized.get("updatedAt"),
                "submittedBy": (serialized.get("submittedBy") or {}).get("name")
                or (serialized.get("submittedBy") or {}).get("displayName")
                or "Unknown submitter",
                "assignedTo": (serialized.get("assignedTo") or {}).get("name"),
                "aiSummary": (serialized.get("aiAnalysis") or {}).get("summary"),
                "aiRecommendation": (serialized.get("aiAnalysis") or {}).get("recommendation"),
                "photoUrls": serialized.get("photoUrls", []),
            }
            items.append(item)
            seen_ids.add(serialized["id"])
            if len(items) >= max_items:
                break

        return {
            "items": items,
            "counts": counts,
            "totalCandidates": evaluated,
        }

    def _normalize_search(self, search: Optional[str]) -> List[str]:
        if not search:
            return []
        tokens = re.split(r"[^a-zA-Z0-9]+", search.lower())
        return [token for token in tokens if len(token) >= 2]

    def _normalise_status(self, status: Optional[str]) -> str:
        if not status:
            return self.DEFAULT_STATUS
        if status in self.STATUS_CANONICAL:
            return status
        return self.STATUS_LEGACY_MAPPING.get(status, status)

    def _normalise_request_type(self, request_type: Optional[str]) -> str:
        if not request_type:
            return self.DEFAULT_REQUEST_TYPE
        request_type = str(request_type)
        if request_type in self.VALID_REQUEST_TYPES:
            return request_type
        return self.DEFAULT_REQUEST_TYPE

    def _priority_rank(self, priority: Optional[str]) -> int:
        if not priority:
            return self.PRIORITY_ORDER[self.DEFAULT_PRIORITY]
        priority = str(priority).lower()
        return self.PRIORITY_ORDER.get(priority, self.PRIORITY_ORDER[self.DEFAULT_PRIORITY])

    def _enrich_submitted_by(self, submitted_by: Any) -> Any:
        if not isinstance(submitted_by, dict):
            return submitted_by

        user_id = (
            submitted_by.get("uid")
            or submitted_by.get("userId")
            or submitted_by.get("id")
            or submitted_by.get("user_id")
        )

        profile = self._get_user_profile(str(user_id)) if user_id else None
        if profile:
            enriched = dict(submitted_by)
            enriched.setdefault("uid", profile.get("uid"))
            enriched["profile"] = profile
            return enriched
        return submitted_by

    def _get_user_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        if not user_id:
            logger.debug("_get_user_profile called with empty user_id")
            return None

        logger.debug("Fetching user profile", extra={"user_id": user_id})

        now = datetime.now(timezone.utc)
        with self._user_cache_lock:
            cached = self._user_profile_cache.get(user_id)
            if cached:
                fetched_at = cached.get("_cached_at")
                if isinstance(fetched_at, datetime) and (now - fetched_at).total_seconds() < self.USER_CACHE_TTL_SECONDS:
                    logger.debug("Returning cached profile", extra={"user_id": user_id})
                    return dict(cached)

        try:
            doc = self.db.collection("users").document(user_id).get()
            if not doc.exists:
                logger.debug("No user document found", extra={"user_id": user_id})
                return None
            raw = doc.to_dict() or {}
            logger.debug("Raw user data fetched", extra={"user_id": user_id, "has_data": bool(raw)})
            profile = normalise_user_profile(user_id, raw)
            logger.debug("Normalized profile", extra={"user_id": user_id, "has_profile": bool(profile)})
        except Exception as exc:  # pragma: no cover - telemetry only
            logger.warning("Failed to load user profile", extra={"user_id": user_id, "error": str(exc)})
            return None

        profile_with_meta = dict(profile)
        profile_with_meta["_cached_at"] = now
        with self._user_cache_lock:
            if len(self._user_profile_cache) >= 500:
                # Remove an arbitrary element to cap memory usage
                try:
                    self._user_profile_cache.pop(next(iter(self._user_profile_cache)))
                except StopIteration:
                    pass
            self._user_profile_cache[user_id] = profile_with_meta
        return dict(profile)

    def _serialize_request(
        self,
        snapshot: DocumentSnapshot,
        *,
        include_activity_preview: bool = False,
        signed_urls: bool = False,
    ) -> Dict[str, Any]:
        data = snapshot.to_dict() or {}
        data["id"] = snapshot.id
        data["createdAt"] = self._timestamp_to_iso(data.get("createdAt"))
        data["updatedAt"] = self._timestamp_to_iso(data.get("updatedAt"))
        data["status"] = self._normalise_status(data.get("status"))
        data["requestType"] = self._normalise_request_type(data.get("requestType"))
        if data.get("priority"):
            data["priority"] = str(data.get("priority")).lower()
        data["latestActivity"] = self._normalise_activity(data.get("latestActivity"))
        if data.get("submittedBy"):
            data["submittedBy"] = self._enrich_submitted_by(data.get("submittedBy"))
        photo_urls = data.get("photoUrls") or []
        if isinstance(photo_urls, list):
            data["photoUrls"] = [url for url in photo_urls if isinstance(url, str)]
        attachments = data.get("attachments", [])
        if attachments:
            data["attachments"] = [
                self._serialize_attachment(att, signed_urls=signed_urls) for att in attachments
            ]
        notes = data.get("adminNotes", [])
        if notes:
            data["adminNotes"] = [self._serialize_note(note) for note in notes]
        if include_activity_preview:
            preview = (
                snapshot.reference.collection("activity")
                .order_by("timestamp", direction=firestore.Query.DESCENDING)
                .limit(1)
                .stream()
            )
            data["activityPreview"] = [self._serialize_activity(doc) for doc in preview]
        return data

    def _serialize_note(self, note: Dict[str, Any]) -> Dict[str, Any]:
        result = dict(note)
        result["createdAt"] = self._timestamp_to_iso(note.get("createdAt"))
        return result

    def _serialize_attachment(self, attachment: Dict[str, Any], *, signed_urls: bool = False) -> Dict[str, Any]:
        result = dict(attachment)
        if signed_urls and attachment.get("storagePath"):
            result["signedUrl"] = firebase_service.generate_signed_url(attachment["storagePath"])
        result["uploadedAt"] = self._timestamp_to_iso(attachment.get("uploadedAt"))
        return result

    def _serialize_activity(self, snapshot: DocumentSnapshot) -> Dict[str, Any]:
        data = snapshot.to_dict() or {}
        data["id"] = snapshot.id
        data["timestamp"] = self._timestamp_to_iso(data.get("timestamp"))
        return data

    def _normalise_activity(self, activity: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not activity:
            return None
        result = dict(activity)
        result["timestamp"] = self._timestamp_to_iso(activity.get("timestamp"))
        return result

    def _timestamp_to_iso(self, ts: Any) -> Optional[str]:
        dt = self._timestamp_to_datetime(ts)
        return dt.isoformat() if dt else None

    def _timestamp_to_datetime(self, ts: Any) -> Optional[datetime]:
        if hasattr(ts, "to_datetime"):
            try:
                return ts.to_datetime(timezone.utc)
            except Exception:
                return None
        if isinstance(ts, datetime):
            return ts
        if hasattr(ts, "isoformat"):
            try:
                value = ts.isoformat()
                return datetime.fromisoformat(value)
            except Exception:
                return None
        return None

    # ------------------------------------------------------------------
    # Static helpers
    # ------------------------------------------------------------------

    @staticmethod
    def from_base64_attachment(payload: Dict[str, Any]) -> AttachmentInput:
        data_str = payload.get("data")
        if not data_str:
            raise ValueError("Attachment missing data")
        if "," in data_str:
            data_str = data_str.split(",", 1)[1]
        binary = base64.b64decode(data_str)
        filename = payload.get("filename", f"attachment_{uuid.uuid4().hex}.jpg")
        content_type = payload.get("contentType", "image/jpeg")
        return AttachmentInput(filename=filename, content_type=content_type, data=binary)


product_request_service = ProductRequestService()
