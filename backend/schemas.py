from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class MemoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    relationship: Optional[str] = None
    memory: str
    photo_path: Optional[str] = None
    photo_caption: Optional[str] = None
    featured: bool = False
    created_at: datetime


class Stats(BaseModel):
    memory_count: int
    photo_count: int
