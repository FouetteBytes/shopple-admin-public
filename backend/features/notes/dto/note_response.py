"""
Note Response DTOs.
"""
from dataclasses import dataclass, asdict
from typing import Optional, Any

@dataclass
class NoteResponse:
    id: str
    title: str
    content: str
    completed: bool
    category: str
    priority: str
    createdAt: Any
    updatedAt: Any
    dueDate: Optional[str] = None
    
    def to_dict(self):
        return asdict(self)
