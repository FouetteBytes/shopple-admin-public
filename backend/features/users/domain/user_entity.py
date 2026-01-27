from dataclasses import dataclass
from typing import Optional
from datetime import datetime

@dataclass
class User:
    id: str
    email: Optional[str] = None
    is_banned: bool = False
    ban_reason: Optional[str] = None
    ban_updated_at: Optional[datetime] = None
    ban_expires_at: Optional[datetime] = None
    force_logout_at: Optional[datetime] = None
