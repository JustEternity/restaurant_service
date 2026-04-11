from sqlalchemy import Column, Integer, VARCHAR
from sqlalchemy.orm import relationship
from .base import BaseModel

class Specialization(BaseModel):
    __tablename__ = "specialization"

    id = Column(Integer, primary_key=True)
    name = Column(VARCHAR(100))

    users_with_specialization = relationship("User", back_populates="specialization_of_user")
    plates_for_spec = relationship("PlatesForSpecialization", back_populates="spec_of_plates")