from pydantic import BaseModel
from typing import Optional, List
from app.schemas.cook_group_schemas import CookGroupResponse
from app.schemas.specialization_schemas import SpecializationResponse

class UserCreate(BaseModel):
    name: str
    login: str
    password: str
    role: str = "waiter"
    is_available: bool = True
    specialization_id: Optional[int] = None
    cook_group_ids: List[int] = []

class UserUpdate(BaseModel):
    name: Optional[str] = None
    login: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    is_available: Optional[bool] = None
    specialization_id: Optional[int] = None
    cook_group_ids: Optional[List[int]] = None

class UserResponse(BaseModel):
    id: int
    name: str
    login: str
    role: str
    is_available: bool
    specialization: Optional[SpecializationResponse] = None
    cook_groups: List[CookGroupResponse] = []

    class Config:
        from_attributes = True

class UserUpdateFull(BaseModel):
    name: str
    login: str
    password: str
    role: str
    is_available: bool
    specialization_id: Optional[int] = None
    cook_group_ids: List[int] = []