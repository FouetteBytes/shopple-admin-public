from typing import Any, Dict, List, Tuple
from flask import request, jsonify
import json

from common.base.base_controller import BaseController
from backend.features.products.request.service.request_service import (
    ProductRequestService,
    AttachmentInput,
)
from services.slack.product_request_notifier import get_product_request_notifier
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class RequestController(BaseController):
    def __init__(self, request_service: ProductRequestService):
        self.request_service = request_service

    def _extract_actor(self) -> Dict[str, str]:
        """Build an actor dictionary from request headers (placeholder for auth)."""
        actor = {
            "id": request.headers.get("X-Admin-Id", "admin"),
            "name": request.headers.get("X-Admin-Name", "Admin User"),
            "email": request.headers.get("X-Admin-Email", "admin@shopple.local"),
        }
        logger.debug("Actor extracted", extra={"actor_id": actor["id"]})
        return actor

    def _parse_request_payload(self) -> Tuple[Dict[str, Any], List[AttachmentInput]]:
        """Parse payload + attachments supporting JSON and multipart uploads."""
        content_type = request.content_type or ""

        if "multipart/form-data" in content_type:
            form = request.form
            payload = {
                "productName": form.get("productName"),
                "brand": form.get("brand"),
                "size": form.get("size"),
                "categoryHint": form.get("categoryHint"),
                "store": form.get("store"),
                "description": form.get("description"),
                "priority": form.get("priority"),
                "submissionSource": form.get("submissionSource", "mobile"),
            }

            store_location = form.get("storeLocation")
            if store_location:
                try:
                    payload["storeLocation"] = json.loads(store_location)
                except json.JSONDecodeError:
                    payload["storeLocation"] = {"raw": store_location}

            labels = form.get("labels")
            if labels:
                try:
                    payload["labels"] = json.loads(labels)
                except json.JSONDecodeError:
                    payload["labels"] = [label.strip() for label in labels.split(",") if label.strip()]

            submitted_by = form.get("submittedBy")
            if submitted_by:
                try:
                    payload["submittedBy"] = json.loads(submitted_by)
                except json.JSONDecodeError:
                    payload["submittedBy"] = {"raw": submitted_by}

            attachments: List[AttachmentInput] = []
            for file in request.files.getlist("attachments"):
                if not file:
                    continue
                data = file.read()
                attachments.append(
                    AttachmentInput(
                        filename=file.filename or "attachment.jpg",
                        content_type=file.mimetype or "image/jpeg",
                        data=data,
                    )
                )
            return payload, attachments

        # Default: JSON body with optional base64 attachments
        payload = request.get_json() or {}
        attachments: List[AttachmentInput] = []
        raw_attachments = payload.pop("attachments", []) or []
        for item in raw_attachments:
            try:
                attachments.append(self.request_service.from_base64_attachment(item))
            except Exception as exc:
                raise ValueError(f"Invalid attachment payload: {exc}") from exc

        return payload, attachments

    def create_product_request(self):
        try:
            payload, attachments = self._parse_request_payload()
            created = self.request_service.create_request(payload, attachments)
            return jsonify({"success": True, "request": created}), 201
        except ValueError as exc:
            return jsonify({"success": False, "error": str(exc)}), 400
        except Exception as exc: 
            return jsonify({"success": False, "error": str(exc)}), 500

    def list_product_requests(self):
        try:
            status = request.args.get("status")
            request_type = request.args.get("requestType")
            priority = request.args.get("priority")
            recommendation = request.args.get("recommendation")
            store = request.args.get("store")
            search = request.args.get("search")
            page = int(request.args.get("page", "1"))
            page_size = int(request.args.get("pageSize", "20"))

            result = self.request_service.list_requests(
                status=status,
                request_type=request_type,
                priority=priority,
                recommendation=recommendation,
                store=store,
                search=search,
                page=page,
                page_size=page_size,
            )
            return jsonify({"success": True, **result})
        except ValueError as exc:
            return jsonify({"success": False, "error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 500

    def get_product_request(self, request_id: str):
        try:
            result = self.request_service.get_request(request_id)
            if not result:
                return jsonify({"success": False, "error": "Request not found"}), 404
            return jsonify({"success": True, "request": result})
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 500

    def update_product_request(self, request_id: str):
        try:
            payload = request.get_json() or {}
            actor = self._extract_actor()
            updated = self.request_service.update_request(request_id, payload, actor)
            if not updated:
                return jsonify({"success": False, "error": "Request not found"}), 404
            return jsonify({"success": True, "request": updated})
        except ValueError as exc:
            return jsonify({"success": False, "error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 500

    def add_product_request_note(self, request_id: str):
        try:
            body = request.get_json() or {}
            note = body.get("note")
            if not note:
                return jsonify({"success": False, "error": "note is required"}), 400
            is_private = bool(body.get("isPrivate", False))
            actor = self._extract_actor()
            updated = self.request_service.add_note(request_id, note, actor, is_private=is_private)
            if not updated:
                return jsonify({"success": False, "error": "Request not found"}), 404
            return jsonify({"success": True, "request": updated})
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 500

    def acknowledge_product_request(self, request_id: str):
        try:
            payload = request.get_json() or {}
            actor = self._extract_actor()
            updates = {"status": "inReview"}
            if payload.get("assignTo"):
                updates["assignedTo"] = payload["assignTo"]
            updated = self.request_service.update_request(request_id, updates, actor)
            if not updated:
                return jsonify({"success": False, "error": "Request not found"}), 404
            return jsonify({"success": True, "request": updated})
        except ValueError as exc:
            return jsonify({"success": False, "error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 500

    def bulk_acknowledge_product_requests(self):
        try:
            body = request.get_json() or {}
            request_ids = body.get("requestIds") or []
            if not isinstance(request_ids, list) or not request_ids:
                return jsonify({"success": False, "error": "requestIds must be a non-empty array"}), 400

            assign_to = body.get("assignTo") if isinstance(body.get("assignTo"), dict) else None
            actor = self._extract_actor()
            result = self.request_service.bulk_acknowledge(request_ids, actor, assign_to=assign_to)
            return jsonify({"success": True, **result})
        except ValueError as exc:
            return jsonify({"success": False, "error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 500

    def rerun_product_request_ai(self, request_id: str):
        try:
            payload = request.get_json() or {}
            force_refresh = bool(payload.get("forceRefresh"))
            actor = self._extract_actor()
            updated = self.request_service.rerun_ai(request_id, actor, force_refresh=force_refresh)
            if not updated:
                return jsonify({"success": False, "error": "Request not found"}), 404
            return jsonify({"success": True, "request": updated})
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 500

    def get_product_request_stats(self):
        try:
            stats = self.request_service.get_stats()
            return jsonify({"success": True, "stats": stats})
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 500

    def refresh_product_request_cache(self):
        try:
            result = self.request_service.refresh_matcher_cache()
            return jsonify({"success": True, "result": result})
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 500

    def dispatch_product_request_digest(self):
        try:
            body = request.get_json() or {}
            since_minutes = int(body.get("sinceMinutes", 60))
            min_priority = body.get("minPriority", "high")
            max_items = int(body.get("maxItems", 6))

            digest = self.request_service.build_priority_digest(
                since_minutes=since_minutes,
                min_priority=min_priority,
                max_items=max_items,
                include_completed=bool(body.get("includeCompleted", False)),
            )

            if not digest.get("items"):
                return jsonify({
                    "success": True,
                    "sent": False,
                    "message": "No requests matched the digest filters",
                    "digest": digest,
                })

            notifier = get_product_request_notifier()
            if not notifier.enabled:
                return jsonify({
                    "success": False,
                    "error": "Slack webhook is not configured",
                    "digest": digest,
                }), 400

            notifier.send_product_request_digest(digest)
            return jsonify({"success": True, "sent": True, "digest": digest})
        except ValueError as exc:
            return jsonify({"success": False, "error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 500
