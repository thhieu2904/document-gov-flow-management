from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_superadmin
from app.core.storage import LocalStorageProvider, get_storage_provider
from app.core.storage_admin import StorageReference, StorageScan, cleanup_orphan_files, scan_local_storage
from app.models import DocumentAttachment, User

router = APIRouter(prefix="/storage", tags=["storage"])


class StorageCleanupRequest(BaseModel):
    confirm: bool = False


def storage_references(db: Session) -> list[StorageReference]:
    rows = db.execute(
        select(DocumentAttachment.storage_key, DocumentAttachment.size).where(
            DocumentAttachment.storage_provider == "local"
        )
    ).all()
    return [StorageReference(key=row.storage_key, expected_size=row.size or 0) for row in rows]


def current_scan(db: Session) -> StorageScan:
    provider = get_storage_provider("local")
    if not isinstance(provider, LocalStorageProvider):
        raise RuntimeError("Local storage provider is not available")
    return scan_local_storage(provider.base_path, storage_references(db))


@router.get("/stats")
def get_storage_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    return current_scan(db).to_dict()


@router.post("/cleanup")
def cleanup_storage(
    payload: StorageCleanupRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    if not payload.confirm:
        raise HTTPException(status_code=400, detail="Cần xác nhận trước khi dọn file")

    scan = current_scan(db)
    if scan.scan_errors:
        raise HTTPException(status_code=409, detail="Không thể dọn file vì quá trình quét chưa hoàn tất")
    result = cleanup_orphan_files(scan)
    result["stats"] = current_scan(db).to_dict()
    return result