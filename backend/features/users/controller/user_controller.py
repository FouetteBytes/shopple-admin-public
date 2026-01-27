from datetime import datetime
from typing import Optional
from flask import request, jsonify
from firebase_admin import auth
from common.base.base_controller import BaseController
from backend.features.users.service.user_service import UserService
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class UserController(BaseController):
    def __init__(self, user_service: UserService):
        self.user_service = user_service

    def list_users(self):
        """List all Firebase Auth users"""
        try:
            users = []
            # Iterate through all users in Firebase Auth
            page = auth.list_users()
            while page:
                for user in page.users:
                    users.append({
                        "uid": user.uid,
                        "email": user.email or "",
                        "displayName": user.display_name or "",
                        "disabled": user.disabled,
                        "emailVerified": user.email_verified,
                        "creationTime": user.user_metadata.creation_timestamp if user.user_metadata else None,
                        "lastSignInTime": user.user_metadata.last_sign_in_timestamp if user.user_metadata else None,
                        "customClaims": user.custom_claims or {},
                    })
                page = page.get_next_page()
            
            logger.info(f"Listed {len(users)} users")
            return jsonify({"success": True, "users": users})
        except Exception as exc:
            logger.error(f"Failed to list users: {exc}")
            return self.handle_error(str(exc), 500)

    def create_user(self):
        """Create a new Firebase Auth user"""
        try:
            data = request.get_json() or {}
            email = data.get("email")
            password = data.get("password")
            display_name = data.get("displayName")
            is_admin = data.get("isAdmin", False)
            is_super_admin = data.get("isSuperAdmin", False)
            
            if not email or not password:
                return self.handle_error("Email and password are required", 400)
            
            # Create the user in Firebase Auth
            user = auth.create_user(
                email=email,
                password=password,
                display_name=display_name,
                email_verified=False,
                disabled=False,
            )
            
            # Set custom claims if admin
            if is_admin or is_super_admin:
                claims = {}
                if is_admin:
                    claims["admin"] = True
                if is_super_admin:
                    claims["superAdmin"] = True
                auth.set_custom_user_claims(user.uid, claims)
            
            logger.info(f"Created user {user.uid} ({email})")
            return jsonify({
                "success": True,
                "message": "User created successfully",
                "user": {
                    "uid": user.uid,
                    "email": user.email,
                    "displayName": user.display_name,
                }
            })
        except auth.EmailAlreadyExistsError:
            return self.handle_error("Email already exists", 400)
        except Exception as exc:
            logger.error(f"Failed to create user: {exc}")
            return self.handle_error(str(exc), 500)

    def update_user(self, uid: str):
        """Update a Firebase Auth user"""
        try:
            data = request.get_json() or {}
            
            update_kwargs = {}
            if "displayName" in data:
                update_kwargs["display_name"] = data["displayName"]
            if "disabled" in data:
                update_kwargs["disabled"] = data["disabled"]
            
            if update_kwargs:
                auth.update_user(uid, **update_kwargs)
            
            # Update custom claims if provided
            if "isAdmin" in data or "isSuperAdmin" in data:
                # Get existing claims first
                user = auth.get_user(uid)
                existing_claims = user.custom_claims or {}
                
                if "isAdmin" in data:
                    existing_claims["admin"] = data["isAdmin"]
                if "isSuperAdmin" in data:
                    existing_claims["superAdmin"] = data["isSuperAdmin"]
                
                auth.set_custom_user_claims(uid, existing_claims)
            
            logger.info(f"Updated user {uid}")
            return jsonify({"success": True, "message": "User updated successfully"})
        except auth.UserNotFoundError:
            return self.handle_error("User not found", 404)
        except Exception as exc:
            logger.error(f"Failed to update user {uid}: {exc}")
            return self.handle_error(str(exc), 500)

    def delete_user(self, uid: str):
        """Delete a Firebase Auth user"""
        try:
            auth.delete_user(uid)
            logger.info(f"Deleted user {uid}")
            return jsonify({"success": True, "message": "User deleted successfully"})
        except auth.UserNotFoundError:
            return self.handle_error("User not found", 404)
        except Exception as exc:
            logger.error(f"Failed to delete user {uid}: {exc}")
            return self.handle_error(str(exc), 500)

    def ban_user(self, uid: str):
        try:
            data = request.get_json() or {}
            reason = data.get("reason", "Violation of terms")
            expires_at_str = data.get("expiresAt")
            expires_at = None
            if expires_at_str:
                try:
                    expires_at = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00'))
                except ValueError:
                    pass

            logger.info(f"Request to ban user {uid}: {reason}")
            success = self.user_service.ban_user(uid, reason, expires_at)
            if success:
                logger.info(f"Successfully banned user {uid}")
                return self.handle_response({"success": True})
            
            logger.warning(f"Failed to ban user {uid}")
            return self.handle_error("Failed to ban user", 500)
        except Exception as exc:
            logger.error(f"Exception banning user {uid}: {exc}")
            return self.handle_error(str(exc), 500)

    def unban_user(self, uid: str):
        try:
            logger.info(f"Request to unban user {uid}")
            success = self.user_service.unban_user(uid)
            if success:
                logger.info(f"Successfully unbanned user {uid}")
                return self.handle_response({"success": True})
            logger.warning(f"Failed to unban user {uid}")
            return self.handle_error("Failed to unban user", 500)
        except Exception as exc:
            logger.error(f"Exception unbanning user {uid}: {exc}")
            return self.handle_error(str(exc), 500)

    def force_logout(self, uid: str):
        try:
            logger.info(f"Request to force logout user {uid}")
            success = self.user_service.force_logout(uid)
            if success:
                logger.info(f"Successfully logged out user {uid}")
                return self.handle_response({"success": True})
            logger.warning(f"Failed to force logout user {uid}")
            return self.handle_error("Failed to force logout user", 500)
        except Exception as exc:
            logger.error(f"Exception logging out user {uid}: {exc}")
            return self.handle_error(str(exc), 500)

    def list_online_users(self):
        try:
            limit_param = request.args.get("limit")
            limit_value: Optional[int] = None
            if limit_param not in (None, ""):
                try:
                    parsed = int(limit_param)
                    if parsed > 0:
                        limit_value = max(1, min(parsed, 500))
                except ValueError:
                    pass

            payload = self.user_service.list_online_users(limit=limit_value)
            
            return jsonify({"success": True, **payload})
        except Exception as exc:
            return self.handle_error(str(exc), 500)

    def get_user_insights(self, user_id: str):
        try:
            detail = self.user_service.get_user_detail(user_id)
            if not detail:
                return self.handle_error("user_not_found", 404)
            # Existing API: {success: True, user: detail}
            return jsonify({"success": True, "user": detail})
        except Exception as exc:
            return self.handle_error(str(exc), 500)

    def get_user_timeline(self, user_id: str):
        try:
            limit_param = request.args.get("limit")
            limit = 50 
            if limit_param:
                try:
                    limit = int(limit_param)
                except ValueError:
                    pass
            
            timeline = self.user_service.get_user_timeline(user_id, limit)
            if timeline is None:
                 return self.handle_error("user_not_found", 404)
                 
            return jsonify({"success": True, "timeline": timeline})
        except Exception as exc:
            return self.handle_error(str(exc), 500)

