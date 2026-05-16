from pydantic import BaseModel
from typing import Optional
from pydantic import ConfigDict

class HallMapSettingsResponse(BaseModel):
    id: int
    hallmap_image: Optional[str] = None
    table_size: float

    model_config = ConfigDict(from_attributes=True)

class HallMapSettingsUpdate(BaseModel):
    hallmap_image: Optional[str] = None
    table_size: Optional[float] = None