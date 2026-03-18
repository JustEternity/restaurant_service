from pydantic import BaseModel
from typing import Optional, List
from app.schemas.cook_group_schemas import CookGroupResponse

class UserCreate(BaseModel):
    name: str
    login: str
    password: str
    role: str = "waiter"
    is_available: bool = True
    cook_group_ids: List[int] = []

class UserUpdate(BaseModel):
    name: Optional[str] = None
    login: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    is_available: Optional[bool] = True
    cook_group_ids: Optional[List[int]] = None

class UserResponse(BaseModel):
    id: int
    name: str
    login: str
    role: str
    is_available: bool
    cook_groups: List[CookGroupResponse] = []

    class Config:
        from_attributes = True

class UserUpdateFull(BaseModel):
    name: str
    login: str
    password: str
    role: str
    is_available: bool
    cook_group_ids: List[int] = []