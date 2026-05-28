from sqlalchemy import Column, Integer, ForeignKey
from .base import BaseModel
from sqlalchemy.orm import relationship

class CooksInGroup(BaseModel):
    __tablename__ = "cooks_in_groups"

    id = Column(Integer, primary_key=True)
    cook = Column(Integer, ForeignKey("users.id"))
    group = Column(Integer, ForeignKey("cook_groups.id", ondelete="CASCADE"))

    cooks_in_group = relationship("User", back_populates="user_in_group")
    group_of_cooks = relationship("CookGroup", back_populates="members")