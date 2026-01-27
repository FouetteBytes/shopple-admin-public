from flask import Blueprint
from backend.features.users.controller.user_controller import UserController
from backend.features.users.service.user_service import UserService
from backend.features.users.repository.user_repository import UserRepository
from backend.features.users.repository.user_insights_repository import UserInsightsRepository
from backend.features.users.service.avatar_service import AvatarService
from backend.features.users.controller.avatar_controller import AvatarController

# Initialize Module Components
user_repository = UserRepository()
insights_repository = UserInsightsRepository()
user_service = UserService(user_repository, insights_repository)
avatar_service = AvatarService()

user_controller = UserController(user_service)
avatar_controller = AvatarController(avatar_service)

# Create Blueprint
user_bp = Blueprint("users_feature", __name__)

# Register Routes - User Management (CRUD)
@user_bp.route("/api/admin/users", methods=["GET"])
def list_users():
    return user_controller.list_users()

@user_bp.route("/api/admin/users", methods=["POST"])
def create_user():
    return user_controller.create_user()

@user_bp.route("/api/admin/users/<uid>", methods=["PUT"])
def update_user(uid: str):
    return user_controller.update_user(uid)

@user_bp.route("/api/admin/users/<uid>", methods=["DELETE"])
def delete_user(uid: str):
    return user_controller.delete_user(uid)

@user_bp.route("/api/admin/users/<uid>/ban", methods=["POST"])
def ban_user(uid: str):
    return user_controller.ban_user(uid)

@user_bp.route("/api/admin/users/<uid>/unban", methods=["POST"])
def unban_user(uid: str):
    return user_controller.unban_user(uid)

@user_bp.route("/api/admin/users/<uid>/force-logout", methods=["POST"])
def force_logout(uid: str):
    return user_controller.force_logout(uid)

# Register Routes - Avatar
@user_bp.route("/api/admin/avatar/memoji/<path:memoji_id>", methods=["GET"])
def serve_memoji(memoji_id: str):
    return avatar_controller.serve_memoji(memoji_id)

# Register Routes - User Insights
@user_bp.route("/api/admin/users/online", methods=["GET"])
def list_online_users():
    return user_controller.list_online_users()

@user_bp.route("/api/admin/users/<user_id>/insights", methods=["GET"])
def get_user_insights(user_id: str):
    return user_controller.get_user_insights(user_id)

@user_bp.route("/api/admin/users/<user_id>/timeline", methods=["GET"])
def get_user_timeline(user_id: str):
    return user_controller.get_user_timeline(user_id)

