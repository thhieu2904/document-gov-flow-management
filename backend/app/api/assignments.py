from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import User
from app.schemas import AssignmentCompleteRequest, AssignmentForwardRequest, AssignmentReturnRequest
from app.workflow_service import (
    complete_assignment,
    forward_assignment,
    return_assignment,
    serialize_assignment,
    serialize_assignments,
    start_assignment,
)

router = APIRouter(prefix="/assignments", tags=["assignments"])


@router.post("/{assignment_id}/start")
def start(
    assignment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return serialize_assignment(start_assignment(db, assignment_id, current_user))


@router.post("/{assignment_id}/complete")
def complete(
    assignment_id: str,
    payload: AssignmentCompleteRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = payload or AssignmentCompleteRequest()
    return serialize_assignment(complete_assignment(db, assignment_id, current_user, payload.result_note))


@router.post("/{assignment_id}/forward")
def forward(
    assignment_id: str,
    payload: AssignmentForwardRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return serialize_assignments(forward_assignment(db, assignment_id, current_user, payload))


@router.post("/{assignment_id}/return")
def return_to_sender(
    assignment_id: str,
    payload: AssignmentReturnRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return serialize_assignment(return_assignment(db, assignment_id, current_user, payload))
