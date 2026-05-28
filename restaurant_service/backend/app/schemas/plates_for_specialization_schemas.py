from pydantic import BaseModel
from typing import Optional, List

class PlateSpecializationCreate(BaseModel):
    plate_id: int
    specialization_id: int

class PlateSpecializationResponse(BaseModel):
    id: int
    plate_id: int
    specialization_id: int
    plate_name: Optional[str] = None
    specialization_name: Optional[str] = None

    class Config:
        from_attributes = True

class BatchUpdatePlates(BaseModel):
    plate_ids: List[int]