from sqlalchemy import Column, Integer, ForeignKey
from sqlalchemy.orm import relationship
from .base import BaseModel

class TagsOfPlate(BaseModel):
    __tablename__ = "tags_of_plates"

    id = Column(Integer, primary_key=True)
    plate = Column(Integer, ForeignKey("menu.id"))
    tag = Column(Integer, ForeignKey("tags.id"))

    menu_item_for_tag = relationship("Menu", back_populates="tags_for_plate")
    tag_for_menu_item = relationship("Tag", back_populates="menu_items_for_tag")