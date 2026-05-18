from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.storage import get_storage_provider
from app.models import Document, DocumentAssignment, DocumentAttachment, User
from app.services import ensure_can_view, history

router = APIRouter(prefix="/attachments", tags=["attachments"])


@router.get("/{attachment_id}/download")
def download_attachment(
    attachment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    attachment = db.get(DocumentAttachment, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Khong tim thay file")
    doc = db.get(Document, attachment.document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Khong tim thay van ban")
    assignments = db.scalars(select(DocumentAssignment).where(DocumentAssignment.document_id == doc.id)).all()
    ensure_can_view(current_user, doc, assignments)
    stream = get_storage_provider(attachment.storage_provider).open_for_read(attachment.storage_key)
    history(db, current_user, "file_download", doc.id, attachment.original_name, attachment.assignment_id)
    db.commit()
    headers = {"Content-Disposition": f'attachment; filename="{attachment.original_name}"'}
    return StreamingResponse(stream, media_type=attachment.mime_type, headers=headers)
