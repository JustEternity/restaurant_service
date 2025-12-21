from pydantic import BaseModel
from typing import Optional

class TableCreate(BaseModel):
    number: int
    pos_x: float
    pos_y: float
    status: str = "free"
    is_available: bool = True

class TableUpdate(BaseModel):
    number: Optional[int] = None
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None
    status: Optional[str] = None
    is_available: Optional[bool] = None

class TableResponse(BaseModel):
    id: int
    number: int
    pos_x: float
    pos_y: float
    status: str
    is_available: bool

    class Config:
        from_attributes = True

class TableUpdateFull(BaseModel):
    number: int
    pos_x: float
    pos_y: float
    status: str
    is_available: bool

class TableUpdateFull(BaseModel):
    number: int
    pos_x: float
    pos_y: float
    status: str
    is_available: bool
