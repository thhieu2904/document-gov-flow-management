from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Department, Document, DocumentAssignment, User
from app.services import assignment_target_filter

router = APIRouter(prefix="/progress", tags=["progress"])


def progress_row(assignment: DocumentAssignment, doc: Document, receiver_user: User | None, receiver_dept: Department | None) -> dict:
    today = date.today()
    status = assignment.status
    if status != "completed" and assignment.due_date and assignment.due_date < today:
        status = "overdue"
    receiver_label = receiver_user.full_name if receiver_user else receiver_dept.name if receiver_dept else "Chua ro"
    return {
        "document_id": doc.id,
        "document_code": doc.code,
        "document_number": doc.arrival_number,
        "document_received_date": doc.received_date or doc.issued_date or doc.document_date,
        "received_at": assignment.pending_at,
        "document_title": doc.title,
        "assignment_id": assignment.id,
        "receiver_label": receiver_label,
        "assignment_role": assignment.assignment_role,
        "instruction": assignment.instruction,
        "due_date": assignment.due_date,
        "completed_at": assignment.completed_at,
        "priority": assignment.priority,
        "status": status,
    }


@router.get("")
def list_progress(
    search: str | None = None,
    status: str | None = None,
    department_id: str | None = None,
    receiver_user_id: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    priority: str | None = None,
    sort_by: str = "received_at",
    sort_dir: str = "desc",
    page: int = 1,
    size: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    safe_page = max(page, 1)
    safe_size = min(max(size, 1), 100)
    query = (
        select(DocumentAssignment, Document, User, Department)
        .join(Document, Document.id == DocumentAssignment.document_id)
        .outerjoin(User, User.id == DocumentAssignment.receiver_user_id)
        .outerjoin(Department, Department.id == DocumentAssignment.receiver_department_id)
        .where(Document.deleted_at.is_(None))
    )
    if current_user.role != "admin":
        query = query.where(
            or_(
                Document.created_by == current_user.id,
                DocumentAssignment.sender_user_id == current_user.id,
                assignment_target_filter(current_user),
            )
        )
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(
            or_(
                Document.title.ilike(pattern),
                Document.code.ilike(pattern),
                Document.arrival_number.ilike(pattern),
                DocumentAssignment.instruction.ilike(pattern),
                User.full_name.ilike(pattern),
                Department.name.ilike(pattern),
            )
        )
    if status:
        if status == "overdue":
            query = query.where(DocumentAssignment.status != "completed", DocumentAssignment.due_date < date.today())
        else:
            query = query.where(DocumentAssignment.status == status)
    if department_id:
        query = query.where(DocumentAssignment.receiver_department_id == department_id)
    if receiver_user_id:
        query = query.where(DocumentAssignment.receiver_user_id == receiver_user_id)
    if from_date:
        query = query.where(DocumentAssignment.due_date >= from_date)
    if to_date:
        query = query.where(DocumentAssignment.due_date <= to_date)
    if priority:
        query = query.where(DocumentAssignment.priority == priority)
    sort_map = {
        "received_at": DocumentAssignment.pending_at,
        "document_number": Document.arrival_number,
        "document_received_date": func.coalesce(Document.received_date, Document.issued_date, Document.document_date),
        "document_title": Document.title,
        "receiver_label": func.coalesce(User.full_name, Department.name),
        "due_date": DocumentAssignment.due_date,
        "status": DocumentAssignment.status,
        "priority": DocumentAssignment.priority,
    }
    sort_column = sort_map.get(sort_by, DocumentAssignment.due_date)
    sort_expr = sort_column.desc() if sort_dir == "desc" else sort_column.asc()
    if sort_by in {"due_date", "received_at", "document_received_date"}:
        sort_expr = sort_expr.nulls_last()
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.execute(
        query.order_by(sort_expr, DocumentAssignment.updated_at.desc())
        .offset((safe_page - 1) * safe_size)
        .limit(safe_size)
    ).all()
    return {
        "items": [progress_row(assignment, doc, user, dept) for assignment, doc, user, dept in rows],
        "page": safe_page,
        "size": safe_size,
        "total": total,
    }
