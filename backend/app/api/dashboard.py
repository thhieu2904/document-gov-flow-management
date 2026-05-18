from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Document, DocumentAssignment, User
from app.services import assignment_visible_filter

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def visible_documents(db: Session, user: User) -> list[Document]:
    query = select(Document).where(Document.deleted_at.is_(None))
    if user.role == "admin":
        return db.scalars(query).all()
    doc_ids = select(DocumentAssignment.document_id).where(assignment_visible_filter(user))
    return db.scalars(query.where(or_(Document.created_by == user.id, Document.id.in_(doc_ids)))).all()


@router.get("")
def dashboard(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    docs = visible_documents(db, current_user)
    today = date.today()
    soon = today + timedelta(days=7)
    doc_ids = [doc.id for doc in docs]
    assignments = db.scalars(select(DocumentAssignment).where(DocumentAssignment.document_id.in_(doc_ids))).all() if doc_ids else []
    open_assignments = [item for item in assignments if item.status != "completed"]
    return {
        "total_documents": len(docs),
        "incoming_documents": len([doc for doc in docs if doc.document_type == "incoming"]),
        "outgoing_documents": len([doc for doc in docs if doc.document_type == "outgoing"]),
        "in_progress": len([doc for doc in docs if doc.status in {"received", "in_progress", "pending_signature", "approved"}]),
        "completed": len([doc for doc in docs if doc.status in {"completed", "issued", "archived"}]),
        "overdue": len([item for item in open_assignments if item.due_date and item.due_date < today]),
        "open_tasks": len(open_assignments),
        "due_soon": [
            {
                "id": doc.id,
                "title": doc.title,
                "code": doc.code,
                "due_date": doc.due_date,
                "status": doc.status,
                "priority": doc.priority,
            }
            for doc in docs
            if doc.status not in {"completed", "archived", "issued"} and doc.due_date and today <= doc.due_date <= soon
        ][:10],
    }
