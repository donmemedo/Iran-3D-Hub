import os
from sqlmodel import SQLModel, Session, create_engine

from .config import settings

url = settings.database_url
if url.startswith("sqlite"):
    os.makedirs(os.path.dirname(url.split("///")[-1]) or ".", exist_ok=True)

engine = create_engine(
    url,
    echo=False,
    connect_args={"check_same_thread": False} if url.startswith("sqlite") else {},
)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session():
    # expire_on_commit=False keeps objects readable after a commit, so a
    # response can still serialise the rows it just wrote.
    with Session(engine, expire_on_commit=False) as session:
        yield session
