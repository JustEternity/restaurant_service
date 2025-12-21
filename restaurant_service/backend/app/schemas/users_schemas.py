from pydantic import BaseModel
from typing import Optional

class UserCreate(BaseModel):
    name: str
    login: str
    password: str
    role: str = "waiter"
    is_available: bool = True

class UserUpdate(BaseModel):
    name: Optional[str] = None
    login: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    name: str
    login: str
    role: str
    is_available: bool

    class Config:
        from_attributes = True

class UserUpdateFull(BaseModel):
    name: str
    login: str
    password: str
    role: str
    is_available: bool
