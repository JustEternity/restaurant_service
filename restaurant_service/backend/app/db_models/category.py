from sqlalchemy import Column, Text, Boolean, Integer, ForeignKey, VARCHAR, NUMERIC
from sqlalchemy.orm import relationship
from .base import BaseModel

class Category(BaseModel):
    __tablename__ = "category"

    id = Column(Integer, primary_key=True)
    name = Column(VARCHAR(100))

    items_of_category = relationship(
        "Menu",
        back_populates="category_of_item"
    )