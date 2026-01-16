from pydantic import BaseModel, EmailStr, Field
from typing import Optional

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    role: str
    name: str

class TokenData(BaseModel):
    user_id: Optional[int] = None
    role: Optional[str] = None

class UserLogin(BaseModel):
    login: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)

class UserRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    login: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=5)
    role: str = Field(default="admin")

class ChangePassword(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=6)