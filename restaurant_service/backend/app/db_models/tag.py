from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from .base import BaseModel

class Tag(BaseModel):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)

    # Связь с блюдами
    menu_items = relationship("Menu", secondary="tags_of_plates", back_populates="tags")