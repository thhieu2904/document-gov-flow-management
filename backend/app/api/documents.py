from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.constants import (
    ACTION_TYPE_LABELS,
    ASSIGNMENT_ROLE_LABELS,
    ASSIGNMENT_STATUS_LABELS,
    DOCUMENT_STATUS_LABELS,
    DOCUMENT_TYPES,
    PRIORITY_LABELS,
)
from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.storage import get_storage_provider
from app.models import (
    Document,
    DocumentAssignment,
    DocumentAttachment,
    DocumentComment,
    DocumentHistoryLog,
    User,
    now_utc,
)
from app.schemas import AssignmentCreate, CommentCreate, DocumentCreate, DocumentUpdate, DocumentVoidRequest
from app.services import (
    assignment_target_filter,
    assignment_targets_user,
    assignment_visible_filter,
    attachment_to_dict,
    can_complete_assignment,
    can_forward_assignment,
    can_mutate_document,
    can_return_assignment,
    can_start_assignment,
    ensure_can_mutate,
    ensure_can_view,
    history,
    notify_assignment_receivers,
)
from app.workflow_service import transition_document

router = APIRouter(prefix="/documents", tags=["documents"])

LOCKED_FOR_MUTATION_STATUSES = {"issued", "archived", "voided"}


def document_assignments(db: Session, document_id: str) -> list[DocumentAssignment]:
    return db.scalars(select(DocumentAssignment).where(DocumentAssignment.document_id == document_id)).all()


def document_dict(doc: Document, *, is_unread: bool = False) -> dict:
    return {
        "id": doc.id,
        "document_type": doc.document_type,
        "title": doc.title,
        "code": doc.code,
        "arrival_number": doc.arrival_number,
        "issuing_agency": doc.issuing_agency,
        "content": doc.content,
        "document_date": doc.document_date,
        "received_date": doc.received_date,
        "issued_date": doc.issued_date,
        "due_date": doc.due_date,
        "priority": doc.priority,
        "status": doc.status,
        "created_by": doc.created_by,
        "owner_department_id": doc.owner_department_id,
        "current_department_id": doc.owner_department_id,
        "completed_at": doc.completed_at,
        "archived_at": doc.archived_at,
        "deleted_at": doc.deleted_at,
        "created_at": doc.created_at,
        "updated_at": doc.updated_at,
        "is_unread": is_unread,
    }


def assignment_dict(item: DocumentAssignment) -> dict:
    return {
        "id": item.id,
        "document_id": item.document_id,
        "parent_assignment_id": item.parent_assignment_id,
        "sender_user_id": item.sender_user_id,
        "sender_department_id": item.sender_department_id,
        "receiver_user_id": item.receiver_user_id,
        "receiver_department_id": item.receiver_department_id,
        "assignment_role": item.assignment_role,
        "status": item.status,
        "action_type": item.action_type,
        "instruction": item.instruction,
        "priority": item.priority,
        "due_date": item.due_date,
        "pending_at": item.pending_at,
        "started_at": item.started_at,
        "completed_at": item.completed_at,
        "returned_at": item.returned_at,
        "viewed_at": item.viewed_at,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def comment_dict(item: DocumentComment) -> dict:
    return {
        "id": item.id,
        "document_id": item.document_id,
        "assignment_id": item.assignment_id,
        "user_id": item.user_id,
        "content": item.content,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def history_dict(item: DocumentHistoryLog) -> dict:
    return {
        "id": item.id,
        "document_id": item.document_id,
        "assignment_id": item.assignment_id,
        "user_id": item.user_id,
        "action_type": item.action_type,
        "description": item.description,
        "extra": item.extra,
        "created_at": item.created_at,
    }


def visible_document_query(user: User):
    query = select(Document).where(Document.deleted_at.is_(None))
    if user.role == "admin":
        return query
    assignment_doc_ids = select(DocumentAssignment.document_id).where(assignment_visible_filter(user))
    return query.where(or_(Document.created_by == user.id, Document.id.in_(assignment_doc_ids)))


def apply_document_filters(query, search: str | None = None, due_from: date | None = None, due_before: date | None = None):
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(
            or_(
                Document.title.ilike(pattern),
                Document.code.ilike(pattern),
                Document.arrival_number.ilike(pattern),
                Document.issuing_agency.ilike(pattern),
            )
        )
    if due_from:
        query = query.where(Document.due_date >= due_from)
    if due_before:
        query = query.where(Document.due_date <= due_before)
    return query


def unread_document_ids(db: Session, user: User, document_ids: list[str]) -> set[str]:
    if user.role == "admin" or not document_ids:
        return set()
    rows = db.scalars(
        select(DocumentAssignment.document_id).where(
            DocumentAssignment.document_id.in_(document_ids),
            assignment_target_filter(user),
            DocumentAssignment.viewed_at.is_(None),
        )
    ).all()
    return set(rows)


def paginate(db: Session, query, page: int, size: int, current_user: User | None = None) -> dict:
    safe_page = max(page, 1)
    safe_size = min(max(size, 1), 100)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = db.scalars(query.offset((safe_page - 1) * safe_size).limit(safe_size)).all()
    unread_ids = unread_document_ids(db, current_user, [item.id for item in items]) if current_user else set()
    return {"items": [document_dict(item, is_unread=item.id in unread_ids) for item in items], "page": safe_page, "size": safe_size, "total": total}


@router.get("/metadata")
def metadata(current_user: User = Depends(get_current_user)):
    return {
        "document_types": DOCUMENT_TYPES,
        "document_statuses": DOCUMENT_STATUS_LABELS,
        "assignment_roles": ASSIGNMENT_ROLE_LABELS,
        "assignment_statuses": ASSIGNMENT_STATUS_LABELS,
        "action_types": ACTION_TYPE_LABELS,
        "priorities": PRIORITY_LABELS,
    }


@router.get("")
def list_documents(
    search: str | None = None,
    status: str | None = None,
    document_type: str | None = None,
    department_id: str | None = None,
    due_from: date | None = None,
    due_before: date | None = None,
    page: int = 1,
    size: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = visible_document_query(current_user)
    query = apply_document_filters(query, search, due_from, due_before)
    if status:
        query = query.where(Document.status == status)
    if document_type:
        query = query.where(Document.document_type == document_type)
    if department_id:
        query = query.where(Document.owner_department_id == department_id)
    return paginate(db, query.order_by(Document.updated_at.desc()), page, size, current_user)


@router.get("/incoming")
def list_incoming(
    queue: str | None = None,
    search: str | None = None,
    due_from: date | None = None,
    due_before: date | None = None,
    page: int = 1,
    size: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = visible_document_query(current_user).where(Document.document_type == "incoming")
    query = apply_document_filters(query, search, due_from, due_before)
    if queue == "received":
        query = query.where(Document.status == "received")
    elif queue in {"primary", "collaborator", "informed"}:
        query = query.where(
            Document.id.in_(
                select(DocumentAssignment.document_id).where(
                    DocumentAssignment.assignment_role == queue,
                    DocumentAssignment.status != "completed",
                    assignment_target_filter(current_user),
                )
            )
        )
    elif queue == "completed":
        query = query.where(
            Document.id.in_(
                select(DocumentAssignment.document_id).where(
                    DocumentAssignment.status == "completed",
                    assignment_target_filter(current_user),
                )
            )
        )
    return paginate(db, query.order_by(Document.updated_at.desc()), page, size, current_user)


@router.get("/outgoing")
def list_outgoing(
    queue: str | None = None,
    search: str | None = None,
    due_from: date | None = None,
    due_before: date | None = None,
    page: int = 1,
    size: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = visible_document_query(current_user).where(Document.document_type == "outgoing")
    query = apply_document_filters(query, search, due_from, due_before)
    if queue == "issued":
        query = query.where(Document.status == "issued")
    elif queue == "draft":
        query = query.where(Document.status == "draft")
    elif queue == "todo":
        query = query.where(
            Document.id.in_(
                select(DocumentAssignment.document_id).where(
                    DocumentAssignment.status != "completed",
                    assignment_target_filter(current_user),
                )
            )
        )
    elif queue == "done":
        query = query.where(
            Document.id.in_(
                select(DocumentAssignment.document_id).where(
                    DocumentAssignment.status == "completed",
                    assignment_target_filter(current_user),
                )
            )
        )
    return paginate(db, query.order_by(Document.updated_at.desc()), page, size, current_user)


@router.post("")
def create_document(
    payload: DocumentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {"admin", "clerk", "manager"}:
        raise HTTPException(status_code=403, detail="Ban khong co quyen tiep nhan/tao van ban")
    status = "draft" if payload.document_type == "outgoing" else "received"
    doc = Document(**payload.model_dump(), status=status, created_by=current_user.id)
    db.add(doc)
    db.flush()
    history(db, current_user, "outgoing_draft" if payload.document_type == "outgoing" else "incoming_register", doc.id, doc.title)
    db.commit()
    db.refresh(doc)
    return document_dict(doc)


@router.post("/incoming/receive")
def receive_incoming_document(
    payload: DocumentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload.document_type = "incoming"
    return create_document(payload, db, current_user)


@router.post("/outgoing")
def create_outgoing_document(
    payload: DocumentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload.document_type = "outgoing"
    return create_document(payload, db, current_user)


@router.get("/{document_id}")
def get_document(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.get(Document, document_id)
    if not doc or doc.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Khong tim thay van ban")
    assignments = document_assignments(db, doc.id)
    ensure_can_view(current_user, doc, assignments)
    comments = db.scalars(select(DocumentComment).where(DocumentComment.document_id == doc.id).order_by(DocumentComment.created_at)).all()
    attachments = db.scalars(select(DocumentAttachment).where(DocumentAttachment.document_id == doc.id).order_by(DocumentAttachment.created_at.desc())).all()
    logs = db.scalars(select(DocumentHistoryLog).where(DocumentHistoryLog.document_id == doc.id).order_by(DocumentHistoryLog.created_at.desc())).all()
    my_assignments = [
        item
        for item in assignments
        if assignment_targets_user(current_user, item)
    ]
    marked_viewed = False
    if current_user.role != "admin":
        for item in my_assignments:
            if item.viewed_at is None:
                item.viewed_at = now_utc()
                marked_viewed = True
        if marked_viewed:
            db.commit()
    actionable_assignments = assignments if current_user.role == "admin" else my_assignments

    def my_assignment_dict(item: DocumentAssignment) -> dict:
        d = assignment_dict(item)
        d["is_unread"] = item.viewed_at is None
        d["can_start"] = can_start_assignment(current_user, item)
        d["can_complete"] = can_complete_assignment(current_user, item)
        d["can_forward"] = can_forward_assignment(current_user, item)
        d["can_return"] = can_return_assignment(current_user, item)
        return d

    return {
        **document_dict(doc, is_unread=any(item.viewed_at is None for item in my_assignments)),
        "assignments": [assignment_dict(item) | {"is_unread": item.viewed_at is None} for item in assignments],
        "my_assignments": [my_assignment_dict(item) for item in my_assignments],
        "comments": [comment_dict(item) for item in comments],
        "attachments": [attachment_to_dict(item) for item in attachments],
        "history_logs": [history_dict(item) for item in logs],
        "my_permissions": {
            "can_view": True,
            "can_update": can_mutate_document(current_user, doc, assignments),
            "can_forward": any(can_forward_assignment(current_user, item) for item in actionable_assignments),
            "can_complete": any(can_complete_assignment(current_user, item) for item in actionable_assignments),
            "can_void": current_user.role in {"admin", "clerk"} or current_user.id == doc.created_by,
        },
    }


@router.patch("/{document_id}")
def update_document(
    document_id: str,
    payload: DocumentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.get(Document, document_id)
    if not doc or doc.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Khong tim thay van ban")
    assignments = document_assignments(db, doc.id)
    ensure_can_mutate(current_user, doc, assignments)
    if doc.status in LOCKED_FOR_MUTATION_STATUSES:
        raise HTTPException(status_code=400, detail="Van ban da phat hanh/luu tru, khong the sua")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(doc, key, value)
    history(db, current_user, "document.update", doc.id, doc.title)
    db.commit()
    db.refresh(doc)
    return document_dict(doc)


@router.post("/{document_id}/assign")
def assign_document(
    document_id: str,
    payload: AssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.get(Document, document_id)
    if not doc or doc.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Khong tim thay van ban")
    assignments = document_assignments(db, doc.id)
    ensure_can_mutate(current_user, doc, assignments)
    if doc.status in LOCKED_FOR_MUTATION_STATUSES:
        raise HTTPException(status_code=400, detail="Van ban da phat hanh/luu tru, khong the giao xu ly")
    if not payload.receiver_user_id and not payload.receiver_department_id:
        raise HTTPException(status_code=400, detail="Can chon nguoi hoac phong ban nhan")
    assignment = DocumentAssignment(
        document_id=doc.id,
        parent_assignment_id=payload.parent_assignment_id,
        sender_user_id=current_user.id,
        sender_department_id=current_user.department_id,
        receiver_user_id=payload.receiver_user_id,
        receiver_department_id=payload.receiver_department_id,
        assignment_role=payload.assignment_role,
        status="pending",
        action_type=payload.action_type,
        instruction=payload.instruction,
        priority=payload.priority,
        due_date=payload.due_date,
        pending_at=now_utc(),
    )
    db.add(assignment)
    if doc.status in {"received", "draft"}:
        doc.status = "in_progress"
    db.flush()
    history(db, current_user, assignment.action_type, doc.id, assignment.instruction, assignment.id)
    notify_assignment_receivers(db, assignment, doc.title)
    db.commit()
    return assignment_dict(assignment)


@router.post("/{document_id}/archive")
def archive_document(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.get(Document, document_id)
    if not doc or doc.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Khong tim thay van ban")
    assignments = document_assignments(db, doc.id)
    ensure_can_mutate(current_user, doc, assignments)
    doc.status = "archived"
    doc.archived_at = now_utc()
    history(db, current_user, "archive", doc.id, "Luu ho so / luu tru")
    db.commit()
    return document_dict(doc)


@router.post("/{document_id}/submit-signature")
def submit_signature(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return document_dict(transition_document(db, document_id, current_user, "pending_signature", "submit_signature", "Trinh ky"))


@router.post("/{document_id}/approve-signature")
def approve_signature(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return document_dict(transition_document(db, document_id, current_user, "approved", "approve_signature", "Ky duyet"))


@router.post("/{document_id}/issue")
def issue_document(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return document_dict(transition_document(db, document_id, current_user, "issued", "issue", "Phat hanh"))


@router.post("/{document_id}/void")
def void_document(
    document_id: str,
    payload: DocumentVoidRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.get(Document, document_id)
    if not doc or doc.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Khong tim thay van ban")
    if doc.status == "issued":
        raise HTTPException(status_code=400, detail="Van ban da phat hanh, khong the huy")
    if current_user.role not in {"admin", "clerk"} and current_user.id != doc.created_by:
        raise HTTPException(status_code=403, detail="Ban khong co quyen huy van ban")
    doc.status = "voided"
    doc.deleted_at = now_utc()
    doc.deleted_by = current_user.id
    doc.delete_reason = payload.reason
    history(db, current_user, "void", doc.id, payload.reason)
    db.commit()
    return document_dict(doc)


@router.post("/{document_id}/comments")
def add_comment(
    document_id: str,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.get(Document, document_id)
    if not doc or doc.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Khong tim thay van ban")
    assignments = document_assignments(db, doc.id)
    ensure_can_view(current_user, doc, assignments)
    comment = DocumentComment(document_id=doc.id, assignment_id=payload.assignment_id, user_id=current_user.id, content=payload.content)
    db.add(comment)
    history(db, current_user, "comment", doc.id, payload.content[:200], payload.assignment_id)
    db.commit()
    db.refresh(comment)
    return comment_dict(comment)


@router.get("/{document_id}/timeline")
def timeline(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.get(Document, document_id)
    if not doc or doc.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Khong tim thay van ban")
    assignments = document_assignments(db, doc.id)
    ensure_can_view(current_user, doc, assignments)
    logs = db.scalars(select(DocumentHistoryLog).where(DocumentHistoryLog.document_id == doc.id).order_by(DocumentHistoryLog.created_at)).all()
    return {"history_logs": [history_dict(item) for item in logs], "assignments": [assignment_dict(item) for item in assignments]}


@router.post("/{document_id}/attachments")
async def upload_document_attachment(
    document_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.get(Document, document_id)
    if not doc or doc.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Khong tim thay van ban")
    assignments = document_assignments(db, doc.id)
    ensure_can_mutate(current_user, doc, assignments)
    if doc.status in LOCKED_FOR_MUTATION_STATUSES:
        raise HTTPException(status_code=400, detail="Van ban da phat hanh/luu tru, khong the upload file")
    provider = get_storage_provider()
    storage_key, size = await provider.save(file, f"documents/{doc.id}")
    attachment = DocumentAttachment(
        document_id=doc.id,
        assignment_id=None,
        storage_provider=settings.storage_provider,
        storage_key=storage_key,
        original_name=file.filename or "file",
        mime_type=file.content_type or "application/octet-stream",
        size=size,
        uploaded_by=current_user.id,
    )
    db.add(attachment)
    history(db, current_user, "file_upload", doc.id, attachment.original_name)
    db.commit()
    db.refresh(attachment)
    return attachment_to_dict(attachment)
