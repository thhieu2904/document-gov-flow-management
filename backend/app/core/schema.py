from sqlalchemy import inspect, text

from app.core.database import get_engine


def ensure_runtime_schema() -> None:
    engine = get_engine()
    columns = {column["name"] for column in inspect(engine).get_columns("document_assignments")}
    if "viewed_at" in columns:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE document_assignments ADD COLUMN viewed_at TIMESTAMPTZ"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_document_assignments_viewed_at ON document_assignments (viewed_at)"))
