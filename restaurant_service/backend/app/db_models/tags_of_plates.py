from sqlalchemy import Column, Integer, ForeignKey
from .base import BaseModel

class TagsOfPlate(BaseModel):
    __tablename__ = "tags_of_plates"

    menu_id = Column(Integer, ForeignKey("menu.id", ondelete="CASCADE"), primary_key=True)
    tag_id = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)