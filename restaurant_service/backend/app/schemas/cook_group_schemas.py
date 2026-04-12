from pydantic import BaseModel
from typing import Optional

class CookGroupBase(BaseModel):
    name: str

class CookGroupCreate(CookGroupBase):
    pass

class CookGroupUpdate(BaseModel):
    name: Optional[str] = None

class CookGroupResponse(CookGroupBase):
    id: int

    class Config:
        from_attributes = True

class CookToGroup(BaseModel):
    user_id: int
