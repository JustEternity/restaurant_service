from sqlalchemy import Column, Integer, ForeignKey
from app.database import Base
from sqlalchemy.orm import relationship

class TagsForGroup(Base):
    __tablename__ = "tags_for_group"

    id = Column(Integer, primary_key=True, index=True)
    group = Column(Integer, ForeignKey("cook_groups.id"))
    tag = Column(Integer, ForeignKey("tags.id"))

    group_for_tag = relationship("CookGroup", back_populates="tags_of_group")
    tag_for_group = relationship("Tag", back_populates="groups_for_tag")