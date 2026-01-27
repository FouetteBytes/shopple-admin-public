from typing import Optional
from pydantic import BaseModel, Field, field_validator

class ProductListRequest(BaseModel):
    page: int = Field(default=1, ge=1, description="Page number")
    per_page: int = Field(default=20, ge=1, le=100, description="Items per page")
    search: Optional[str] = Field(default=None, description="Search query")
    category: Optional[str] = Field(default=None, description="Filter by category")
    brand: Optional[str] = Field(default=None, description="Filter by brand")

    @field_validator('search', 'category', 'brand')
    def empty_string_to_none(cls, v):
        if v == '':
            return None
        return v
