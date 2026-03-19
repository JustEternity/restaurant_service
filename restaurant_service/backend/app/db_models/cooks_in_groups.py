from sqlalchemy import Column, Integer, ForeignKey
from .base import BaseModel

class CooksInGroup(BaseModel):
    __tablename__ = "cooks_in_groups"

    id = Column(Integer, primary_key=True)
    cook = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    group = Column(Integer, ForeignKey("cook_groups.id", ondelete="CASCADE"), primary_key=True)