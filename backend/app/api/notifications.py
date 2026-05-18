from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Notification, User
from app.schemas import NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
def list_notifications(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.scalars(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    ).all()


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(notification_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.get(Notification, notification_id)
    if not item or item.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Khong tim thay thong bao")
    item.is_read = True
    item.read_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return item

