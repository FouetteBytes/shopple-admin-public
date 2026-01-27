"""
Note Domain Entity.
"""
from dataclasses import dataclass, field
from typing import Optional, Any
from datetime import datetime

@dataclass
class Note:
    id: str
    user_id: str
    title: str
    content: str
    completed: bool
    category: str
    priority: str
    created_at: Any
    updated_at: Any
    due_date: Optional[str] = None
