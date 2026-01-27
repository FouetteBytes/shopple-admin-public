from typing import Optional
from pydantic import BaseModel, Field

class BanUserRequest(BaseModel):
    reason: str = Field(..., description="Reason for banning the user")
    expiresAt: Optional[str] = Field(None, description="ISO format expiration date")

class UserResponse(BaseModel):
    id: str
    isBanned: Optional[bool] = None
