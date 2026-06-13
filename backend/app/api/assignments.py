from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.email import email_assignment_approved, email_assignment_returned, email_assignment_submitted
from app.email_utils import send_and_log_task
from app.models import AssignmentReview, DocumentAssignment, User, now_utc
from app.schemas import AssignmentReviewRequest, AssignmentSubmit
from app.services import can_manage_document, ensure_assignment_assignee, notify, sync_document_status

router = APIRouter(prefix="/assignments", tags=["assignments"])


def assignment_payload(assignment: DocumentAssignment) -> dict:
    return {
        "id": assignment.id,
        "document_id": assignment.document_id,
        "assignee_id": assignment.assignee_id,
        "assigned_by": assignment.assigned_by,
        "instruction": assignment.instruction,
        "result_note": assignment.result_note,
        "priority": assignment.priority,
        "status": assignment.status,
        "due_at": assignment.due_at,
        "started_at": assignment.started_at,
        "submitted_at": assignment.submitted_at,
        "completed_at": assignment.completed_at,
        "created_at": assignment.created_at,
        "updated_at": assignment.updated_at,
    }


def require_assignment(db: Session, assignment_id: str) -> DocumentAssignment:
    assignment = db.get(DocumentAssignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Không tìm thấy việc được giao")
    return assignment


def ensure_reviewer(current_user: User, assignment: DocumentAssignment) -> None:
    if not assignment.document or not can_manage_document(current_user, assignment.document):
        raise HTTPException(status_code=403, detail="Bạn không có quyền duyệt việc này")


@router.post("/{assignment_id}/start")
def start_assignment(assignment_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    assignment = require_assignment(db, assignment_id)
    ensure_assignment_assignee(current_user, assignment)
    if assignment.status == "submitted":
        raise HTTPException(status_code=400, detail="Việc này đang chờ quản lý duyệt")
    if assignment.status == "approved":
        raise HTTPException(status_code=400, detail="Việc này đã được duyệt")
    if assignment.status in {"pending", "returned"}:
        assignment.status = "in_progress"
        assignment.started_at = now_utc()
        sync_document_status(db, assignment.document)
    db.commit()
    db.refresh(assignment)
    return assignment_payload(assignment)


@router.post("/{assignment_id}/submit")
def submit_assignment(
    assignment_id: str,
    background_tasks: BackgroundTasks,
    payload: AssignmentSubmit | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = payload or AssignmentSubmit()
    assignment = require_assignment(db, assignment_id)
    ensure_assignment_assignee(current_user, assignment)
    if assignment.status == "approved":
        raise HTTPException(status_code=400, detail="Việc này đã được duyệt")
    if assignment.status == "submitted":
        raise HTTPException(status_code=400, detail="Việc này đang chờ quản lý duyệt")
    assignment.status = "submitted"
    assignment.result_note = payload.result_note
    assignment.started_at = assignment.started_at or now_utc()
    assignment.submitted_at = now_utc()
    assignment.completed_at = None
    sync_document_status(db, assignment.document)
    notify(db, assignment.assigned_by, assignment.document_id, "Nhân viên đã gửi văn bản chờ duyệt", assignment.document.title, assignment.id)
    db.commit()
    if settings.email_enabled:
        manager = db.get(User, assignment.assigned_by)
        if manager and manager.email:
            subject, html = email_assignment_submitted(
                assignment.document.title,
                assignment.document.code,
                current_user.full_name,
                payload.result_note,
                settings.frontend_url,
            )
            background_tasks.add_task(
                send_and_log_task,
                log_key=f"assignment_submitted:{assignment.id}:{manager.id}:{assignment.submitted_at.isoformat() if assignment.submitted_at else ''}",
                event_type="assignment_submitted",
                recipient_email=manager.email,
                subject=subject,
                html=html,
                document_id=assignment.document_id,
                assignment_id=assignment.id,
                recipient_user_id=manager.id,
                skip_existing=False,
            )
    db.refresh(assignment)
    return assignment_payload(assignment)


@router.post("/{assignment_id}/approve")
def approve_assignment(
    assignment_id: str,
    background_tasks: BackgroundTasks,
    payload: AssignmentReviewRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = payload or AssignmentReviewRequest()
    assignment = require_assignment(db, assignment_id)
    ensure_reviewer(current_user, assignment)
    if assignment.status != "submitted":
        raise HTTPException(status_code=400, detail="Chỉ duyệt việc đang chờ duyệt")
    now = now_utc()
    note = payload.note.strip() if payload.note else None
    assignment.status = "approved"
    assignment.completed_at = now
    review = AssignmentReview(assignment_id=assignment.id, reviewer_id=current_user.id, action="approved", note=note)
    db.add(review)
    db.flush()
    sync_document_status(db, assignment.document)
    notify(db, assignment.assignee_id, assignment.document_id, "Kết quả xử lý đã được duyệt", assignment.document.title, assignment.id)
    db.commit()
    if settings.email_enabled and assignment.assignee and assignment.assignee.email:
        subject, html = email_assignment_approved(
            assignment.document.title,
            assignment.document.code,
            current_user.full_name,
            note,
            settings.frontend_url,
        )
        background_tasks.add_task(
            send_and_log_task,
            log_key=f"assignment_approved:{assignment.id}:{review.id}",
            event_type="assignment_approved",
            recipient_email=assignment.assignee.email,
            subject=subject,
            html=html,
            document_id=assignment.document_id,
            assignment_id=assignment.id,
            recipient_user_id=assignment.assignee_id,
            skip_existing=False,
        )
    db.refresh(assignment)
    return assignment_payload(assignment)


@router.post("/{assignment_id}/return")
def return_assignment(
    assignment_id: str,
    background_tasks: BackgroundTasks,
    payload: AssignmentReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    assignment = require_assignment(db, assignment_id)
    ensure_reviewer(current_user, assignment)
    note = payload.note.strip() if payload.note else ""
    if not note:
        raise HTTPException(status_code=400, detail="Cần nhập lý do trả về")
    if assignment.status != "submitted":
        raise HTTPException(status_code=400, detail="Chỉ trả về việc đang chờ duyệt")
    assignment.status = "returned"
    assignment.completed_at = None
    review = AssignmentReview(assignment_id=assignment.id, reviewer_id=current_user.id, action="returned", note=note)
    db.add(review)
    db.flush()
    sync_document_status(db, assignment.document)
    notify(db, assignment.assignee_id, assignment.document_id, "Kết quả xử lý bị trả về", note, assignment.id)
    db.commit()
    if settings.email_enabled and assignment.assignee and assignment.assignee.email:
        subject, html = email_assignment_returned(
            assignment.document.title,
            assignment.document.code,
            current_user.full_name,
            note,
            settings.frontend_url,
        )
        background_tasks.add_task(
            send_and_log_task,
            log_key=f"assignment_returned:{assignment.id}:{review.id}",
            event_type="assignment_returned",
            recipient_email=assignment.assignee.email,
            subject=subject,
            html=html,
            document_id=assignment.document_id,
            assignment_id=assignment.id,
            recipient_user_id=assignment.assignee_id,
            skip_existing=False,
        )
    db.refresh(assignment)
    return assignment_payload(assignment)
