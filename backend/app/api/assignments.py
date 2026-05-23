from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.email import email_assignment_submitted
from app.email_utils import send_and_log_task
from app.models import DocumentAssignment, User, now_utc
from app.schemas import AssignmentSubmit
from app.services import document_assignments, ensure_assignment_assignee, notify, sync_document_status

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


@router.post("/{assignment_id}/start")
def start_assignment(assignment_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    assignment = db.get(DocumentAssignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Không tìm thấy việc được giao")
    ensure_assignment_assignee(current_user, assignment)
    if assignment.status == "pending":
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
    assignment = db.get(DocumentAssignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Không tìm thấy việc được giao")
    ensure_assignment_assignee(current_user, assignment)
    if assignment.status == "completed":
        raise HTTPException(status_code=400, detail="Việc này đã hoàn tất")
    assignment.status = "completed"
    assignment.result_note = payload.result_note
    assignment.started_at = assignment.started_at or now_utc()
    assignment.submitted_at = now_utc()
    assignment.completed_at = assignment.submitted_at
    sync_document_status(db, assignment.document)
    notify(db, assignment.assigned_by, assignment.document_id, "Nhân viên đã hoàn thành văn bản", assignment.document.title, assignment.id)
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
