from sqlalchemy import or_, func
from sqlalchemy.orm import Session
from models import Memory

SORTS = {
    "newest": (Memory.created_at.desc(), Memory.id.desc()),
    "oldest": (Memory.created_at.asc(), Memory.id.asc()),
    "name": (func.lower(Memory.name).asc(), Memory.id.desc()),
}


def create_memory(db: Session, **data) -> Memory:
    m = Memory(**data)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


def list_memories(db: Session, q: str = "", sort: str = "newest", skip: int = 0, limit: int = 12):
    query = db.query(Memory)
    if q:
        query = query.filter(or_(
            Memory.name.icontains(q, autoescape=True),
            Memory.memory.icontains(q, autoescape=True),
            Memory.relationship.icontains(q, autoescape=True),
        ))
    total = query.count()
    rows = query.order_by(*SORTS.get(sort, SORTS["newest"])).offset(skip).limit(limit).all()
    return rows, total


def list_featured(db: Session):
    return (db.query(Memory).filter(Memory.featured.is_(True))
            .order_by(Memory.created_at.desc()).limit(5).all())


def list_photos(db: Session, skip: int = 0, limit: int = 8):
    query = db.query(Memory).filter(Memory.photo_path.isnot(None))
    total = query.count()
    rows = query.order_by(Memory.created_at.desc(), Memory.id.desc()).offset(skip).limit(limit).all()
    return rows, total


def stats(db: Session):
    return {
        "memory_count": db.query(func.count(Memory.id)).scalar(),
        "photo_count": db.query(func.count(Memory.id)).filter(Memory.photo_path.isnot(None)).scalar(),
    }
