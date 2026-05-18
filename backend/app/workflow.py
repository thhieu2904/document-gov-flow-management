from fastapi import HTTPException

from app.models import Document, DocumentAssignment, User


DOCUMENT_TRANSITIONS = {
    "received": {"in_progress", "completed", "archived", "voided"},
    "in_progress": {"completed", "archived", "voided"},
    "completed": {"archived"},
    "archived": set(),
    "voided": set(),
    "draft": {"pending_signature", "issued", "archived", "voided"},
    "pending_signature": {"approved", "draft", "voided"},
    "approved": {"issued", "archived"},
    "issued": {"archived"},
}

ASSIGNMENT_TRANSITIONS = {
    "pending": {"in_progress", "completed", "returned"},
    "in_progress": {"completed", "returned"},
    "returned": {"pending", "in_progress"},
    "completed": set(),
}


def initial_document_status(document_type: str) -> str:
    return "draft" if document_type == "outgoing" else "received"


def allowed_document_statuses(doc: Document) -> set[str]:
    return DOCUMENT_TRANSITIONS.get(doc.status, set())


def assert_document_transition(user: User, doc: Document, new_status: str) -> None:
    if user.role == "admin" or new_status in allowed_document_statuses(doc):
        return
    raise HTTPException(status_code=400, detail="Chuyen trang thai van ban khong hop le")


def assert_assignment_transition(assignment: DocumentAssignment, new_status: str) -> None:
    if new_status in ASSIGNMENT_TRANSITIONS.get(assignment.status, set()):
        return
    raise HTTPException(status_code=400, detail="Chuyen trang thai phan cong khong hop le")
