from __future__ import annotations
import re
from typing import Any, Dict, Optional
from datetime import datetime, timezone
from backend.features.users.domain.user_entity import User
from backend.features.users.dto.user_request import UserResponse
from services.system.logger_service import get_logger

logger = get_logger(__name__)

MEMOJI_ROUTE_PREFIX = "/api/admin/avatar/memoji"

# ------------------------------------------------------------------
# Response Mappers
# ------------------------------------------------------------------

def to_user_response(user: User) -> UserResponse:
    # Example mapper usage
    return UserResponse(
        id=user.id,
        isBanned=user.is_banned
    )

# ------------------------------------------------------------------
# Profile Normalization Implementation
# ------------------------------------------------------------------

def _timestamp_to_iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if hasattr(value, "to_datetime"):
        try:
            return value.to_datetime().isoformat()  # type: ignore[attr-defined]
        except Exception:
            return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            return None
    return None


def _normalise_enum_value(value: Any) -> Optional[str]:
    if isinstance(value, str):
        return value.split(".")[-1]
    return None


def _int_to_hex_colour(value: Any) -> Optional[str]:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    rgb = number & 0xFFFFFF
    return f"#{rgb:06X}"


def _normalise_profile_background(raw: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None

    colours = raw.get("colors")
    colour_list = []
    if isinstance(colours, list):
        for entry in colours:
            hex_colour = _int_to_hex_colour(entry)
            if hex_colour:
                colour_list.append(hex_colour)

    pattern_config = raw.get("patternConfig")
    if isinstance(pattern_config, dict):
        normalised_pattern = dict(pattern_config)
    else:
        normalised_pattern = None

    background = {
        "id": raw.get("id"),
        "name": raw.get("name"),
        "type": _normalise_enum_value(raw.get("type")) or raw.get("type"),
        "patternType": _normalise_enum_value(raw.get("patternType")) or raw.get("patternType"),
        "colors": colour_list,
        "description": raw.get("description"),
        "isPremium": bool(raw.get("isPremium", False)),
        "patternConfig": normalised_pattern,
    }

    updated_at = _timestamp_to_iso(raw.get("updatedAt"))
    if updated_at:
        background["updatedAt"] = updated_at

    return background


def _extract_memoji_id(default_image_id: Optional[str], effective_avatar: Optional[str]) -> Optional[str]:
    candidate = None
    if effective_avatar and effective_avatar.startswith("memoji://"):
        candidate = effective_avatar.replace("memoji://", "")
    elif default_image_id:
        candidate = default_image_id

    if not candidate:
        return None

    try:
        path = str(candidate).replace("\\", "/").strip()
        if not path:
            return None
        path = path.lstrip("/")
        parts = [part for part in path.split("/") if part and part not in {".", ".."}]
        if not parts:
            return None
        # Preserve known folder structure when coming from assets/memoji/* to aid traceability
        sanitized = "/".join(parts)
        return sanitized
    except Exception:
        return None


def _build_memoji_url(memoji_id: Optional[str]) -> Optional[str]:
    if not memoji_id:
        return None
    candidate = str(memoji_id).replace("\\", "/").strip()
    if not candidate:
        return None
    candidate = candidate.lstrip("/")
    parts = [part for part in candidate.split("/") if part and part not in {".", ".."}]
    if not parts:
        return None
    filename = parts[-1]
    if "." not in filename:
        filename = f"{filename}.png"
        parts[-1] = filename
    safe_path = "/".join(parts)
    return f"{MEMOJI_ROUTE_PREFIX}/{safe_path}"


def compute_initials(source: Optional[str]) -> Optional[str]:
    if not source:
        return None
    tokens = [part[:1].upper() for part in re.split(r"\s+", source.strip()) if part]
    if not tokens:
        return source[:2].upper()
    return "".join(tokens[:2])


def resolve_effective_avatar(
    *,
    profile_image_type: Optional[str],
    custom_photo_url: Optional[str],
    default_image_id: Optional[str],
    photo_url: Optional[str],
) -> Optional[str]:
    if profile_image_type == "custom" and custom_photo_url:
        return custom_photo_url
    if profile_image_type in (None, "google") and photo_url:
        return photo_url
    if profile_image_type in {"default", "memoji"} and default_image_id:
        return f"memoji://{default_image_id}"
    if custom_photo_url:
        return custom_photo_url
    if photo_url:
        return photo_url
    return None


def normalise_user_profile(user_id: str, raw: Dict[str, Any]) -> Dict[str, Any]:
    first_name = raw.get("firstName")
    last_name = raw.get("lastName")
    full_name = raw.get("fullName") or (
        f"{first_name} {last_name}".strip() if first_name or last_name else raw.get("displayName")
    )
    email = raw.get("email")
    profile_image_type = raw.get("profileImageType")
    custom_photo_url = raw.get("customPhotoURL")
    default_image_id = raw.get("defaultImageId") or raw.get("profilePicture")
    photo_url = raw.get("photoURL")
    profile_background = _normalise_profile_background(raw.get("profileBackground"))
    background_updated_at = _timestamp_to_iso(raw.get("backgroundUpdatedAt"))
    avatar_updated_at = _timestamp_to_iso(raw.get("photoUpdatedAt"))

    effective_avatar = resolve_effective_avatar(
        profile_image_type=profile_image_type,
        custom_photo_url=custom_photo_url,
        default_image_id=default_image_id,
        photo_url=photo_url,
    )

    memoji_id = _extract_memoji_id(default_image_id, effective_avatar)
    memoji_url = _build_memoji_url(memoji_id)
    resolved_avatar_url = effective_avatar
    if effective_avatar and effective_avatar.startswith("memoji://"):
        resolved_avatar_url = memoji_url

    profile: Dict[str, Any] = {
        "uid": user_id,
        "email": email,
        "displayName": raw.get("displayName"),
        "fullName": full_name,
        "firstName": first_name,
        "lastName": last_name,
        "effectivePhotoUrl": effective_avatar,
        "photoURL": photo_url,
        "profileImageType": profile_image_type,
        "customPhotoURL": custom_photo_url,
        "defaultImageId": default_image_id,
        "initials": compute_initials(full_name or email or user_id),
    }

    if avatar_updated_at:
        profile["photoUpdatedAt"] = avatar_updated_at

    if profile_background is not None:
        profile["profileBackground"] = profile_background

    if background_updated_at:
        profile["backgroundUpdatedAt"] = background_updated_at

    if resolved_avatar_url:
        profile["resolvedPhotoUrl"] = resolved_avatar_url

    # Carry over onboarding/progress hints when available
    for flag in (
        "signInMethod",
        "emailVerified",
        "phoneVerified",
        "profileCompleted",
        "onboardingCompleted",
        "workspaceCompleted",
        "shoppingListCompleted",
        "isBanned",
    ):
        if flag in raw:
            profile[flag] = raw.get(flag)

    profile["avatar"] = {
        "type": profile_image_type,
        "effectiveUrl": effective_avatar,
        "resolvedUrl": resolved_avatar_url,
        "customPhotoURL": custom_photo_url,
        "googlePhotoURL": photo_url,
        "defaultImageId": default_image_id,
        "memojiId": memoji_id,
        "memojiUrl": memoji_url,
        "background": profile_background,
        "backgroundUpdatedAt": background_updated_at,
        "fallbackInitials": profile.get("initials"),
        "updatedAt": avatar_updated_at,
    }

    return profile

