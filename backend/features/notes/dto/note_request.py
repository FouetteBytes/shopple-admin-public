"""
Note Request DTOs.
"""
from dataclasses import dataclass
from typing import Optional, Any
from datetime import datetime

@dataclass
class CreateNoteRequest:
    title: str
    id: Optional[str] = None
    content: str = ""
    completed: bool = False
    category: str = "personal"
    priority: str = "medium"
    dueDate: Optional[str] = None
    createdAt: Optional[Any] = None # can be passed from client?

@dataclass
class UpdateNoteRequest:
    title: Optional[str] = None
    content: Optional[str] = None
    completed: Optional[bool] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    dueDate: Optional[str] = None
