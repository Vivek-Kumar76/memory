from sqlalchemy import Column, Integer, Text, Boolean, DateTime, func, Index
from database import Base


class Memory(Base):
    __tablename__ = "memories"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=False)
    relationship = Column(Text)
    memory = Column(Text, nullable=False)
    photo_path = Column(Text)
    photo_caption = Column(Text)
    featured = Column(Boolean, default=False, server_default="0")
    created_at = Column(DateTime, server_default=func.current_timestamp())

    __table_args__ = (Index("ix_memories_created", "created_at"),)
