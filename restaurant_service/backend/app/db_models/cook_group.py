from sqlalchemy import Column, Integer, String, Text
from sqlalchemy.orm import relationship
from .base import BaseModel

class CookGroup(BaseModel):
    __tablename__ = "cook_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)

    # Связь с пользователями
    members = relationship("CooksInGroup", back_populates="group_of_cooks")

    # Связь с категориями
    categories_of_group = relationship("CategoriesForGroup", back_populates="group_for_category")

    # Связь с тегами
    tags_of_group = relationship("TagsForGroup", back_populates="group_for_tag")