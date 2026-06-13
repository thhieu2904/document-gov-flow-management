from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AssignmentReview, Document, DocumentAssignment, DocumentAttachment, Notification, User, now_utc


def notify(db: Session, user_id: str | None, document_id: str | None, title: str, message: str, assignment_id: str | None = None) -> None:
    if user_id:
        db.add(Notification(user_id=user_id, document_id=document_id, assignment_id=assignment_id, title=title, message=message))


def document_assignments(db: Session, document_id: str) -> list[DocumentAssignment]:
    return db.scalars(select(DocumentAssignment).where(DocumentAssignment.document_id == document_id)).all()


def is_superadmin(user: User) -> bool:
    return user.role == "superadmin"


def is_admin(user: User) -> bool:
    return user.role in {"superadmin", "manager"}


def can_manage_department(user: User, department_id: str | None) -> bool:
    if is_superadmin(user):
        return True
    return user.role == "manager" and bool(user.department_id) and user.department_id == department_id


def can_manage_document(user: User, doc: Document) -> bool:
    return can_manage_department(user, doc.department_id)


def can_view_document(user: User, doc: Document, assignments: list[DocumentAssignment]) -> bool:
    if is_superadmin(user):
        return True
    if user.role == "manager":
        return bool(user.department_id) and user.department_id == doc.department_id
    return any(item.assignee_id == user.id for item in assignments)


def ensure_can_view(user: User, doc: Document, assignments: list[DocumentAssignment]) -> None:
    if not can_view_document(user, doc, assignments):
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem văn bản này")


def ensure_manager_owner(user: User, doc: Document) -> None:
    if not can_manage_document(user, doc):
        raise HTTPException(status_code=403, detail="Bạn không có quyền thao tác văn bản này")


def ensure_assignment_assignee(user: User, assignment: DocumentAssignment) -> None:
    if assignment.assignee_id != user.id:
        raise HTTPException(status_code=403, detail="Bạn không phải người nhận việc này")


def sync_document_status(db: Session, doc: Document) -> None:
    assignments = document_assignments(db, doc.id)
    if not assignments:
        doc.status = "draft"
        doc.completed_at = None
        return
    if all(item.status == "approved" for item in assignments):
        doc.status = "completed"
        doc.completed_at = doc.completed_at or now_utc()
        return
    if all(item.status in {"submitted", "approved"} for item in assignments) and any(item.status == "submitted" for item in assignments):
        doc.status = "submitted"
        doc.completed_at = None
        return
    doc.status = "in_progress"
    doc.completed_at = None


def complete_document(db: Session, doc: Document) -> None:
    assignments = document_assignments(db, doc.id)
    for item in assignments:
        if item.status != "approved":
            item.status = "approved"
            item.completed_at = item.completed_at or now_utc()
    doc.status = "completed"
    doc.completed_at = now_utc()


def assignment_reviews(db: Session, assignment_id: str) -> list[AssignmentReview]:
    return db.scalars(select(AssignmentReview).where(AssignmentReview.assignment_id == assignment_id).order_by(AssignmentReview.created_at.desc())).all()


def latest_return_note(db: Session, assignment_id: str) -> str | None:
    review = db.scalar(
        select(AssignmentReview)
        .where(AssignmentReview.assignment_id == assignment_id, AssignmentReview.action == "returned")
        .order_by(AssignmentReview.created_at.desc())
    )
    return review.note if review else None


def attachment_to_dict(att: DocumentAttachment, uploader: User | None = None) -> dict:
    return {
        "id": att.id,
        "document_id": att.document_id,
        "assignment_id": att.assignment_id,
        "original_name": att.original_name,
        "mime_type": att.mime_type,
        "size": att.size,
        "uploaded_by": att.uploaded_by,
        "uploaded_by_name": uploader.full_name if uploader else None,
        "created_at": att.created_at,
        "download_url": f"/api/attachments/{att.id}/download",
    }
