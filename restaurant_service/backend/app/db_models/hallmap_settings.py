from .base import BaseModel
from sqlalchemy import Column, Integer, Text, Numeric

class HallMapSettings(BaseModel):
    __tablename__ = "hallmap_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    hallmap_image = Column(Text)
    table_size = Column(Numeric)