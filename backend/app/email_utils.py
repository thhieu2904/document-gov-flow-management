from __future__ import annotations

import secrets
import string
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.email import send_email
from app.core.database import get_session_local
from app.models import EmailLog, now_utc


def generate_temporary_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    raw = "".join(secrets.choice(alphabet) for _ in range(length - 2))
    return f"{raw}9A"


def log_exists(db: Session, log_key: str) -> bool:
    return db.query(EmailLog.id).filter(EmailLog.log_key == log_key, EmailLog.status == "sent").first() is not None


def create_email_log(
    db: Session,
    *,
    log_key: str,
    event_type: str,
    recipient_email: str,
    subject: str,
    status: str,
    document_id: str | None = None,
    assignment_id: str | None = None,
    recipient_user_id: str | None = None,
    due_at_snapshot: datetime | None = None,
    scheduled_for_date: str | None = None,
    provider_response: str | None = None,
) -> EmailLog | None:
    item = db.query(EmailLog).filter(EmailLog.log_key == log_key).first()
    if item:
        item.event_type = event_type
        item.document_id = document_id
        item.assignment_id = assignment_id
        item.recipient_user_id = recipient_user_id
        item.recipient_email = recipient_email
        item.subject = subject
        item.status = status
        item.provider_response = provider_response
        item.due_at_snapshot = due_at_snapshot
        item.scheduled_for_date = scheduled_for_date
        item.sent_at = now_utc() if status == "sent" else None
    else:
        item = EmailLog(
            log_key=log_key,
            event_type=event_type,
            document_id=document_id,
            assignment_id=assignment_id,
            recipient_user_id=recipient_user_id,
            recipient_email=recipient_email,
            subject=subject,
            status=status,
            provider_response=provider_response,
            due_at_snapshot=due_at_snapshot,
            scheduled_for_date=scheduled_for_date,
            sent_at=now_utc() if status == "sent" else None,
        )
        db.add(item)
    db.commit()
    db.refresh(item)
    return item


async def send_and_log(
    db: Session,
    *,
    log_key: str,
    event_type: str,
    recipient_email: str,
    subject: str,
    html: str,
    document_id: str | None = None,
    assignment_id: str | None = None,
    recipient_user_id: str | None = None,
    due_at_snapshot: datetime | None = None,
    scheduled_for_date: str | None = None,
    skip_existing: bool = True,
) -> bool:
    if skip_existing and log_exists(db, log_key):
        return False
    success = await send_email(recipient_email, subject, html)
    create_email_log(
        db,
        log_key=log_key,
        event_type=event_type,
        recipient_email=recipient_email,
        subject=subject,
        status="sent" if success else "failed",
        document_id=document_id,
        assignment_id=assignment_id,
        recipient_user_id=recipient_user_id,
        due_at_snapshot=due_at_snapshot,
        scheduled_for_date=scheduled_for_date,
    )
    return success


async def send_and_log_task(
    *,
    log_key: str,
    event_type: str,
    recipient_email: str,
    subject: str,
    html: str,
    document_id: str | None = None,
    assignment_id: str | None = None,
    recipient_user_id: str | None = None,
    due_at_snapshot: datetime | None = None,
    scheduled_for_date: str | None = None,
    skip_existing: bool = True,
) -> bool:
    session_factory = get_session_local()
    with session_factory() as db:
        return await send_and_log(
            db,
            log_key=log_key,
            event_type=event_type,
            recipient_email=recipient_email,
            subject=subject,
            html=html,
            document_id=document_id,
            assignment_id=assignment_id,
            recipient_user_id=recipient_user_id,
            due_at_snapshot=due_at_snapshot,
            scheduled_for_date=scheduled_for_date,
            skip_existing=skip_existing,
        )
