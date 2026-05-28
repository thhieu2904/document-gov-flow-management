from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Document, DocumentAssignment, DocumentAttachment, Notification, User, now_utc


def notify(db: Session, user_id: str | None, document_id: str | None, title: str, message: str, assignment_id: str | None = None) -> None:
    if user_id:
        db.add(Notification(user_id=user_id, document_id=document_id, assignment_id=assignment_id, title=title, message=message))


def document_assignments(db: Session, document_id: str) -> list[DocumentAssignment]:
    return db.scalars(select(DocumentAssignment).where(DocumentAssignment.document_id == document_id)).all()


def can_view_document(user: User, doc: Document, assignments: list[DocumentAssignment]) -> bool:
    if user.role == "manager":
        return True
    return any(item.assignee_id == user.id for item in assignments)


def ensure_can_view(user: User, doc: Document, assignments: list[DocumentAssignment]) -> None:
    if not can_view_document(user, doc, assignments):
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem văn bản này")


def ensure_manager_owner(user: User, doc: Document) -> None:
    if user.role != "manager":
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
    if all(item.status == "completed" for item in assignments):
        doc.status = "completed"
        doc.completed_at = doc.completed_at or now_utc()
        return
    doc.status = "in_progress"
    doc.completed_at = None


def complete_document(db: Session, doc: Document) -> None:
    assignments = document_assignments(db, doc.id)
    for item in assignments:
        if item.status != "completed":
            item.status = "completed"
            item.completed_at = item.completed_at or now_utc()
    doc.status = "completed"
    doc.completed_at = now_utc()


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
