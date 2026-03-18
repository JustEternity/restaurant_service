from pydantic import BaseModel
from typing import Optional, List

class CookGroupBase(BaseModel):
    name: str
    description: Optional[str] = None

class CookGroupCreate(CookGroupBase):
    pass

class CookGroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class CookGroupResponse(CookGroupBase):
    id: int

    class Config:
        from_attributes = True