from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Document, DocumentAssignment, User, now_utc, VN_TZ

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def period_bounds(period: str, anchor_date: date | None = None) -> tuple[datetime | None, datetime | None]:
    today = anchor_date or datetime.now(VN_TZ).date()
    if period == "week":
        start = today - timedelta(days=today.weekday())
        end = start + timedelta(days=7)
    elif period == "month":
        start = today.replace(day=1)
        end = today.replace(year=today.year + 1, month=1, day=1) if today.month == 12 else today.replace(month=today.month + 1, day=1)
    else:
        return None, None
    return datetime.combine(start, time.min).replace(tzinfo=VN_TZ), datetime.combine(end, time.min).replace(tzinfo=VN_TZ)


def document_assignments_map(db: Session, document_ids: list[str]) -> dict[str, list[DocumentAssignment]]:
    if not document_ids:
        return {}
    rows = db.scalars(select(DocumentAssignment).where(DocumentAssignment.document_id.in_(document_ids))).all()
    grouped: dict[str, list[DocumentAssignment]] = {}
    for item in rows:
        grouped.setdefault(item.document_id, []).append(item)
    return grouped


def derived_status(doc: Document) -> str:
    if doc.status == "completed":
        if doc.due_at and doc.completed_at and doc.completed_at > doc.due_at:
            return "completed_late"
        return "completed"
    if doc.due_at and doc.due_at < now_utc():
        return "overdue"
    if doc.due_at and doc.due_at <= now_utc() + timedelta(days=3):
        return "due_soon"
    if doc.status == "draft":
        return "draft"
    return "in_progress"


def doc_item(doc: Document, assignments: list[DocumentAssignment]) -> dict:
    completed_count = len([item for item in assignments if item.status == "completed"])
    return {
        "id": doc.id,
        "code": doc.code,
        "title": doc.title,
        "status": doc.status,
        "display_status": derived_status(doc),
        "priority": doc.priority,
        "issued_at": doc.issued_at,
        "due_at": doc.due_at,
        "completed_at": doc.completed_at,
        "created_at": doc.created_at,
        "assignment_count": len(assignments),
        "completed_count": completed_count,
        "assignees": [{"name": item.assignee.full_name if item.assignee else "Không rõ", "status": item.status} for item in assignments],
    }


def in_period(doc: Document, start: datetime | None, end: datetime | None) -> bool:
    if not start or not end:
        return True
    values = [doc.due_at, doc.issued_at, doc.completed_at]
    return any(value is not None and start <= value < end for value in values)


def sort_work_items(items: list[dict], sort_by: str, sort_dir: str) -> list[dict]:
    reverse = sort_dir == "desc"
    date_floor = datetime.min.replace(tzinfo=now_utc().tzinfo)

    def progress(item: dict) -> float:
        total = item["assignment_count"] or 0
        return item["completed_count"] / total if total else 0

    def value(item: dict):
        if sort_by == "status":
            return item["display_status"]
        if sort_by == "progress":
            return progress(item)
        if sort_by == "priority":
            return {"urgent": 3, "high": 2, "normal": 1}.get(item["priority"], 0)
        if sort_by in {"created_at", "issued_at", "due_at"}:
            return item.get(sort_by) or date_floor
        if sort_by in {"code", "title"}:
            return (item.get(sort_by) or "").lower()
        return item.get("due_at") or date_floor

    return sorted(items, key=value, reverse=reverse)


@router.get("")
def dashboard(
    period: str = "week",
    anchor_date: date | None = None,
    sort_by: str = "due_at",
    sort_dir: str = "asc",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start, end = period_bounds(period, anchor_date)
    query = select(Document).order_by(Document.due_at.asc().nulls_last(), Document.updated_at.desc())
    if current_user.role != "manager":
        query = query.where(Document.id.in_(select(DocumentAssignment.document_id).where(DocumentAssignment.assignee_id == current_user.id)))
    all_docs = db.scalars(query).all()
    docs = [doc for doc in all_docs if in_period(doc, start, end)]
    by_doc = document_assignments_map(db, [doc.id for doc in docs])
    
    if current_user.role == "manager":
        work_items = [doc_item(doc, by_doc.get(doc.id, [])) for doc in docs if doc.status != "completed"]
    else:
        work_items = []
        for doc in docs:
            assignments = by_doc.get(doc.id, [])
            my_assignment = next((a for a in assignments if a.assignee_id == current_user.id), None)
            if my_assignment and my_assignment.status != "completed":
                work_items.append(doc_item(doc, assignments))
    work_items = sort_work_items(work_items, sort_by, sort_dir)

    due_soon_count = len([item for item in work_items if item["display_status"] == "due_soon"])
    overdue_count = len([item for item in work_items if item["display_status"] == "overdue"])
    in_progress_count = len([item for item in work_items if item["display_status"] == "in_progress"])
    draft_count = len([item for item in work_items if item["display_status"] == "draft"])
    period_assignments = [item for items in by_doc.values() for item in items]
    if current_user.role == "manager":
        completed_count = len([doc for doc in docs if doc.status == "completed"])
    else:
        period_assignments = [item for item in period_assignments if item.assignee_id == current_user.id]
        completed_count = len([item for item in period_assignments if item.status == "completed"])

    return {
        "total_documents": len(docs),
        "open_documents": len(work_items),
        "draft_documents": draft_count,
        "in_progress_documents": in_progress_count,
        "due_soon_documents": due_soon_count,
        "overdue_documents": overdue_count,
        "completed_documents": completed_count,
        "open_tasks": len([item for item in period_assignments if item.status in ["pending", "in_progress"]]),
        "overdue_tasks": len([item for item in period_assignments if item.status in ["pending", "in_progress"] and item.due_at and item.due_at < now_utc()]),
        "work_items": work_items,
    }
