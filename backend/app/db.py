import logging
import os

from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine

from .config import settings

log = logging.getLogger("app.db")
url = settings.database_url
is_sqlite = url.startswith("sqlite")
if is_sqlite:
    os.makedirs(os.path.dirname(url.split("///")[-1]) or ".", exist_ok=True)

engine = create_engine(
    url,
    echo=False,
    connect_args={"check_same_thread": False, "timeout": 10} if is_sqlite else {},
    pool_pre_ping=not is_sqlite,
)

if is_sqlite:
    @event.listens_for(engine, "connect")
    def _pragmas(dbapi_conn, _rec):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")      # readers do not block the writer
        cur.execute("PRAGMA synchronous=NORMAL")    # safe with WAL, far fewer fsyncs
        cur.execute("PRAGMA busy_timeout=5000")     # wait instead of 'database is locked'
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

# Idempotent upgrades for databases created before the audit. create_all() never alters
# existing tables, so indexes and the review.order_id column are applied here.
# ponytail: hand-rolled for 1 column + 4 indexes, switch to Alembic when moving to Postgres.
_UPGRADES = [
    'CREATE UNIQUE INDEX IF NOT EXISTS ux_quote_public_id ON quote (public_id)',
    'CREATE UNIQUE INDEX IF NOT EXISTS ux_order_public_id ON "order" (public_id)',
    'CREATE INDEX IF NOT EXISTS ix_order_user_id ON "order" (user_id)',
    'CREATE UNIQUE INDEX IF NOT EXISTS ux_review_order_id ON review (order_id)',
]


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    with engine.begin() as conn:
        if is_sqlite:
            cols = {r[1] for r in conn.exec_driver_sql("PRAGMA table_info(review)")}
            if "order_id" not in cols:
                conn.exec_driver_sql("ALTER TABLE review ADD COLUMN order_id INTEGER REFERENCES \"order\"(id)")
        for stmt in _UPGRADES:
            try:
                conn.exec_driver_sql(stmt)
            except Exception:  # duplicates in legacy data: keep booting, surface in logs
                log.exception("index upgrade skipped: %s", stmt)


def get_session():
    # expire_on_commit=False keeps objects readable after a commit, so a
    # response can still serialise the rows it just wrote.
    with Session(engine, expire_on_commit=False) as session:
        yield session
