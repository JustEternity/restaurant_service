from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from .base import BaseModel

class Tag(BaseModel):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)

    # Связь с блюдами
    menu_items_for_tag = relationship("TagsOfPlate", back_populates="tag_for_menu_item")

    # группы поваров, которым назначен тег
    groups_for_tag = relationship("TagsForGroup", back_populates="tag_for_group")