from collections.abc import Iterable

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Document, DocumentAssignment, User, now_utc
from app.schemas import AssignmentForwardRequest, AssignmentReturnRequest
from app.services import (
    ensure_can_complete_assignment,
    ensure_can_forward_assignment,
    ensure_can_return_assignment,
    ensure_can_start_assignment,
    history,
    notify_assignment_receivers,
)
from app.workflow import assert_assignment_transition, assert_document_transition


def get_assignment_or_404(db: Session, assignment_id: str) -> DocumentAssignment:
    assignment = db.get(DocumentAssignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Khong tim thay phan cong")
    return assignment


def get_document_or_404(db: Session, document_id: str) -> Document:
    doc = db.get(Document, document_id)
    if not doc or doc.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Khong tim thay van ban")
    return doc


def create_assignment(
    db: Session,
    *,
    doc: Document,
    actor: User,
    parent_assignment_id: str | None,
    receiver_user_id: str | None,
    receiver_department_id: str | None,
    assignment_role: str,
    action_type: str,
    instruction: str | None,
    due_date,
    priority: str,
) -> DocumentAssignment:
    if not receiver_user_id and not receiver_department_id:
        raise HTTPException(status_code=400, detail="Can chon nguoi hoac phong ban nhan")
    assignment = DocumentAssignment(
        document_id=doc.id,
        parent_assignment_id=parent_assignment_id,
        sender_user_id=actor.id,
        sender_department_id=actor.department_id,
        receiver_user_id=receiver_user_id,
        receiver_department_id=receiver_department_id,
        assignment_role=assignment_role,
        status="pending",
        action_type=action_type,
        instruction=instruction,
        priority=priority,
        due_date=due_date,
        pending_at=now_utc(),
    )
    db.add(assignment)
    db.flush()
    history(db, actor, action_type, doc.id, instruction, assignment.id)
    notify_assignment_receivers(db, assignment, doc.title)
    return assignment


def start_assignment(db: Session, assignment_id: str, actor: User) -> DocumentAssignment:
    try:
        assignment = get_assignment_or_404(db, assignment_id)
        ensure_can_start_assignment(actor, assignment)
        if assignment.status == "pending":
            assert_assignment_transition(assignment, "in_progress")
            assignment.status = "in_progress"
            assignment.started_at = assignment.started_at or now_utc()
        doc = get_document_or_404(db, assignment.document_id)
        if doc.status == "received":
            doc.status = "in_progress"
        history(db, actor, "assignment.start", assignment.document_id, "Bat dau xu ly", assignment.id)
        db.commit()
        db.refresh(assignment)
        return assignment
    except Exception:
        db.rollback()
        raise


def complete_assignment(db: Session, assignment_id: str, actor: User, result_note: str | None = None) -> DocumentAssignment:
    try:
        assignment = get_assignment_or_404(db, assignment_id)
        ensure_can_complete_assignment(actor, assignment)
        if assignment.status != "completed":
            assert_assignment_transition(assignment, "completed")
            assignment.status = "completed"
            assignment.completed_at = now_utc()
            assignment.action_type = assignment.action_type or "complete"
        history(db, actor, "complete", assignment.document_id, result_note or "Ket thuc phan xu ly", assignment.id)
        maybe_update_document_completed(db, assignment.document_id)
        db.commit()
        db.refresh(assignment)
        return assignment
    except Exception:
        db.rollback()
        raise


def forward_assignment(db: Session, assignment_id: str, actor: User, payload: AssignmentForwardRequest) -> list[DocumentAssignment]:
    try:
        parent = get_assignment_or_404(db, assignment_id)
        ensure_can_forward_assignment(actor, parent)
        doc = get_document_or_404(db, parent.document_id)
        if parent.status == "pending":
            parent.status = "in_progress"
            parent.started_at = parent.started_at or now_utc()
        if doc.status == "received":
            doc.status = "in_progress"
        created: list[DocumentAssignment] = []
        for receiver in payload.receivers:
            created.append(
                create_assignment(
                    db,
                    doc=doc,
                    actor=actor,
                    parent_assignment_id=parent.id,
                    receiver_user_id=receiver.receiver_user_id,
                    receiver_department_id=receiver.receiver_department_id,
                    assignment_role=receiver.assignment_role,
                    action_type=payload.action_type,
                    instruction=payload.instruction,
                    due_date=receiver.due_date,
                    priority=receiver.priority,
                )
            )
        db.commit()
        for item in created:
            db.refresh(item)
        return created
    except Exception:
        db.rollback()
        raise


def return_assignment(db: Session, assignment_id: str, actor: User, payload: AssignmentReturnRequest) -> DocumentAssignment:
    try:
        current = get_assignment_or_404(db, assignment_id)
        ensure_can_return_assignment(actor, current)
        doc = get_document_or_404(db, current.document_id)
        if current.status != "returned":
            current.status = "returned"
            current.returned_at = now_utc()
        returned = create_assignment(
            db,
            doc=doc,
            actor=actor,
            parent_assignment_id=current.id,
            receiver_user_id=payload.receiver_user_id or current.sender_user_id,
            receiver_department_id=payload.receiver_department_id or current.sender_department_id,
            assignment_role=current.assignment_role,
            action_type="return",
            instruction=payload.instruction,
            due_date=payload.due_date,
            priority=payload.priority,
        )
        db.commit()
        db.refresh(returned)
        return returned
    except Exception:
        db.rollback()
        raise


def transition_document(db: Session, document_id: str, actor: User, new_status: str, action_type: str, description: str | None = None) -> Document:
    try:
        doc = get_document_or_404(db, document_id)
        assert_document_transition(actor, doc, new_status)
        doc.status = new_status
        if new_status == "completed":
            doc.completed_at = now_utc()
        if new_status == "archived":
            doc.archived_at = now_utc()
        history(db, actor, action_type, doc.id, description)
        db.commit()
        db.refresh(doc)
        return doc
    except Exception:
        db.rollback()
        raise


def maybe_update_document_completed(db: Session, document_id: str) -> None:
    doc = db.get(Document, document_id)
    if not doc or doc.status in {"completed", "archived", "issued", "voided"}:
        return
    assignments = db.scalars(select(DocumentAssignment).where(DocumentAssignment.document_id == document_id)).all()
    required = [item for item in assignments if item.assignment_role in {"primary", "collaborator"}]
    if required and all(item.status == "completed" for item in required):
        doc.status = "completed"
        doc.completed_at = now_utc()


def serialize_assignment(assignment: DocumentAssignment) -> dict:
    return {
        "id": assignment.id,
        "document_id": assignment.document_id,
        "parent_assignment_id": assignment.parent_assignment_id,
        "sender_user_id": assignment.sender_user_id,
        "sender_department_id": assignment.sender_department_id,
        "receiver_user_id": assignment.receiver_user_id,
        "receiver_department_id": assignment.receiver_department_id,
        "assignment_role": assignment.assignment_role,
        "status": assignment.status,
        "action_type": assignment.action_type,
        "instruction": assignment.instruction,
        "priority": assignment.priority,
        "due_date": assignment.due_date,
        "pending_at": assignment.pending_at,
        "started_at": assignment.started_at,
        "completed_at": assignment.completed_at,
        "returned_at": assignment.returned_at,
        "viewed_at": assignment.viewed_at,
        "created_at": assignment.created_at,
        "updated_at": assignment.updated_at,
    }


def serialize_assignments(assignments: Iterable[DocumentAssignment]) -> list[dict]:
    return [serialize_assignment(item) for item in assignments]
