from sqlalchemy import Column, Integer, ForeignKey, VARCHAR
from sqlalchemy.orm import relationship
from .base import BaseModel

class Category(BaseModel):
    __tablename__ = "category"

    id = Column(Integer, primary_key=True)
    name = Column(VARCHAR(100))
    parent_category = Column(Integer, ForeignKey("category.id"))

    items_of_category = relationship("Menu", back_populates="category_of_item")
    parent = relationship(
        "Category",
        remote_side=[id],
        back_populates="children"
    )
    children = relationship(
        "Category",
        back_populates="parent"
    )
