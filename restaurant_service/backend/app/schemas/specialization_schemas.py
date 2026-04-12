from pydantic import BaseModel
from typing import Optional

class SpecializationCreate(BaseModel):
    name: str

class SpecializationUpdate(BaseModel):
    name: Optional[str] = None

class SpecializationResponse(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True