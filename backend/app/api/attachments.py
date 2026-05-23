from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.storage import get_storage_provider
from app.models import Document, DocumentAttachment, User
from app.services import document_assignments, ensure_can_view

router = APIRouter(prefix="/attachments", tags=["attachments"])


@router.get("/{attachment_id}/download")
def download_attachment(attachment_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    attachment = db.get(DocumentAttachment, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Không tìm thấy file")
    doc = db.get(Document, attachment.document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy văn bản")
    assignments = document_assignments(db, attachment.document_id)
    ensure_can_view(current_user, doc, assignments)
    body = get_storage_provider(attachment.storage_provider).open_for_read(attachment.storage_key)
    return StreamingResponse(
        body,
        media_type=attachment.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{attachment.original_name}"'},
    )
