from fastapi import HTTPException
from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session

from app.models import Document, DocumentAssignment, DocumentAttachment, DocumentHistoryLog, Notification, User


def history(
    db: Session,
    user: User | None,
    action_type: str,
    document_id: str,
    description: str | None = None,
    assignment_id: str | None = None,
    extra: dict | None = None,
) -> None:
    db.add(
        DocumentHistoryLog(
            document_id=document_id,
            assignment_id=assignment_id,
            user_id=user.id if user else None,
            action_type=action_type,
            description=description,
            extra=extra,
        )
    )


def audit(db: Session, actor: User | None, action: str, entity_type: str, entity_id: str | None, description: str | None = None) -> None:
    document_id = entity_id if entity_type == "document" and entity_id else None
    if document_id:
        history(db, actor, action, document_id, description)


def notify(db: Session, user_id: str | None, document_id: str | None, title: str, message: str, assignment_id: str | None = None) -> None:
    if not user_id:
        return
    db.add(Notification(user_id=user_id, document_id=document_id, assignment_id=assignment_id, title=title, message=message))


def assignment_target_filter(user: User):
    department_target = (
        DocumentAssignment.receiver_department_id == user.department_id if user.department_id and user.role == "clerk" else False
    )
    return or_(DocumentAssignment.receiver_user_id == user.id, department_target)


def assignment_visible_filter(user: User):
    return or_(DocumentAssignment.sender_user_id == user.id, assignment_target_filter(user))


def assignment_targets_user(user: User, assignment: DocumentAssignment) -> bool:
    return assignment.receiver_user_id == user.id or (
        user.role == "clerk" and assignment.receiver_department_id is not None and assignment.receiver_department_id == user.department_id
    )


def notify_assignment_receivers(db: Session, assignment: DocumentAssignment, document_title: str) -> None:
    if assignment.receiver_user_id:
        notify(db, assignment.receiver_user_id, assignment.document_id, "Bạn có văn bản cần xử lý", document_title, assignment.id)
        return
    if not assignment.receiver_department_id:
        return
    receivers = db.scalars(
        select(User).where(
            User.department_id == assignment.receiver_department_id,
            User.is_active.is_(True),
            User.role == "clerk",
        )
    ).all()
    for receiver in receivers:
        notify(db, receiver.id, assignment.document_id, "Phòng ban có văn bản cần xử lý", document_title, assignment.id)


def can_view_document(db: Session, user: User, doc: Document) -> bool:
    if user.role == "admin":
        return True
    if user.id == doc.created_by:
        return True
    if doc.deleted_at is not None and user.role != "admin":
        return False
    query = select(
        exists().where(
            DocumentAssignment.document_id == doc.id,
            assignment_visible_filter(user),
        )
    )
    return bool(db.scalar(query))


def can_view_document_with_assignments(user: User, doc: Document, assignments: list[DocumentAssignment]) -> bool:
    if user.role == "admin" or user.id == doc.created_by:
        return True
    if doc.deleted_at is not None:
        return False
    return any(assignment_targets_user(user, item) or item.sender_user_id == user.id for item in assignments)


def can_act_on_assignment(user: User, assignment: DocumentAssignment) -> bool:
    if user.role == "admin":
        return True
    if assignment.receiver_user_id == user.id:
        return True
    if assignment.receiver_department_id and assignment.receiver_department_id == user.department_id:
        return user.role == "clerk"
    return False


def can_forward_assignment(user: User, assignment: DocumentAssignment) -> bool:
    if assignment.status == "completed":
        return False
    if user.role == "admin":
        return True
    return can_act_on_assignment(user, assignment) and assignment.assignment_role in {"primary", "collaborator"}


def can_start_assignment(user: User, assignment: DocumentAssignment) -> bool:
    if assignment.status != "pending":
        return False
    if user.role == "admin":
        return True
    return can_act_on_assignment(user, assignment) and assignment.assignment_role in {"primary", "collaborator"}


def can_complete_assignment(user: User, assignment: DocumentAssignment) -> bool:
    if assignment.status == "completed":
        return False
    if user.role == "admin":
        return True
    return can_act_on_assignment(user, assignment) and assignment.assignment_role in {"primary", "collaborator"}


def can_return_assignment(user: User, assignment: DocumentAssignment) -> bool:
    if assignment.status == "completed":
        return False
    if user.role == "admin":
        return True
    return can_act_on_assignment(user, assignment) and assignment.assignment_role in {"primary", "collaborator"}


def can_mutate_document(user: User, doc: Document, assignments: list[DocumentAssignment] | None = None) -> bool:
    if user.role == "admin":
        return True
    if user.id == doc.created_by and user.role in {"clerk", "manager"}:
        return True
    return any(can_act_on_assignment(user, item) and item.assignment_role == "primary" for item in assignments or [])


def ensure_can_view(user: User, doc: Document, assignments: list[DocumentAssignment] | None = None, db: Session | None = None) -> None:
    if assignments is not None:
        allowed = can_view_document_with_assignments(user, doc, assignments)
    elif db is not None:
        allowed = can_view_document(db, user, doc)
    else:
        allowed = user.role == "admin" or user.id == doc.created_by
    if not allowed:
        raise HTTPException(status_code=403, detail="Ban khong co quyen xem van ban nay")


def ensure_can_mutate(user: User, doc: Document, assignments: list[DocumentAssignment] | None = None) -> None:
    if not can_mutate_document(user, doc, assignments):
        raise HTTPException(status_code=403, detail="Ban khong co quyen cap nhat van ban nay")


def ensure_can_act_on_assignment(user: User, assignment: DocumentAssignment) -> None:
    if not can_act_on_assignment(user, assignment):
        raise HTTPException(status_code=403, detail="Ban khong co quyen xu ly phan cong nay")


def ensure_can_forward_assignment(user: User, assignment: DocumentAssignment) -> None:
    if not can_forward_assignment(user, assignment):
        raise HTTPException(status_code=403, detail="Ban khong co quyen chuyen tiep phan cong nay")


def ensure_can_start_assignment(user: User, assignment: DocumentAssignment) -> None:
    if not can_start_assignment(user, assignment):
        raise HTTPException(status_code=403, detail="Ban khong co quyen bat dau phan cong nay")


def ensure_can_complete_assignment(user: User, assignment: DocumentAssignment) -> None:
    if not can_complete_assignment(user, assignment):
        raise HTTPException(status_code=403, detail="Ban khong co quyen ket thuc phan cong nay")


def ensure_can_return_assignment(user: User, assignment: DocumentAssignment) -> None:
    if not can_return_assignment(user, assignment):
        raise HTTPException(status_code=403, detail="Ban khong co quyen tra lai phan cong nay")


def attachment_to_dict(att: DocumentAttachment) -> dict:
    return {
        "id": att.id,
        "document_id": att.document_id,
        "assignment_id": att.assignment_id,
        "original_name": att.original_name,
        "mime_type": att.mime_type,
        "size": att.size,
        "created_at": att.created_at,
        "download_url": f"/api/attachments/{att.id}/download",
    }


def user_label(user: User | None) -> str:
    if not user:
        return "Khong ro"
    return f"{user.full_name} ({user.email})"
