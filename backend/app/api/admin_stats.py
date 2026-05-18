from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role
from app.models import Department, Document, DocumentAssignment, DocumentAttachment, DocumentHistoryLog, User

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats")
def admin_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    total_users = db.scalar(select(func.count(User.id))) or 0
    active_users = db.scalar(select(func.count(User.id)).where(User.is_active.is_(True))) or 0
    total_departments = db.scalar(select(func.count(Department.id))) or 0
    active_departments = db.scalar(select(func.count(Department.id)).where(Department.is_active.is_(True))) or 0
    total_documents = db.scalar(select(func.count(Document.id)).where(Document.deleted_at.is_(None))) or 0
    open_documents = (
        db.scalar(
            select(func.count(Document.id)).where(
                Document.deleted_at.is_(None),
                Document.status.in_(["received", "in_progress", "pending_signature", "approved"]),
            )
        )
        or 0
    )
    total_assignments = db.scalar(select(func.count(DocumentAssignment.id))) or 0
    open_assignments = db.scalar(select(func.count(DocumentAssignment.id)).where(DocumentAssignment.status != "completed")) or 0
    total_attachments = db.scalar(select(func.count(DocumentAttachment.id))) or 0
    recent_logs = db.scalars(select(DocumentHistoryLog).order_by(DocumentHistoryLog.created_at.desc()).limit(10)).all()

    return {
        "total_users": total_users,
        "active_users": active_users,
        "inactive_users": total_users - active_users,
        "total_departments": total_departments,
        "active_departments": active_departments,
        "inactive_departments": total_departments - active_departments,
        "total_documents": total_documents,
        "open_documents": open_documents,
        "total_assignments": total_assignments,
        "open_assignments": open_assignments,
        "total_attachments": total_attachments,
        "recent_logs": [
            {
                "id": log.id,
                "action_type": log.action_type,
                "description": log.description,
                "user_id": log.user_id,
                "document_id": log.document_id,
                "created_at": log.created_at,
            }
            for log in recent_logs
        ],
    }
