from sqlalchemy import Column, Integer, ForeignKey, VARCHAR
from sqlalchemy.orm import relationship
from .base import BaseModel

class PlatesForSpecialization(BaseModel):
    __tablename__ = "plates_for_specialization"

    id = Column(Integer, primary_key=True)
    specialization = Column(Integer, ForeignKey("specialization.id"))
    plate = Column(Integer, ForeignKey("menu.id"))

    spec_plates = relationship("Menu", back_populates="plate_for_specialization")
    spec_of_plates = relationship("Specialization", back_populates="plates_for_spec")