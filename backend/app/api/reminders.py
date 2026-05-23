from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import require_manager
from app.core.email import build_email_html, link_button
from app.core.scheduler import configure_scheduler
from app.email_utils import send_and_log
from app.models import EmailLog, User, new_uuid
from app.reminders import (
    email_log_dict,
    get_setting_map,
    run_manager_digest,
    run_manager_report,
    run_staff_reminders,
    upsert_setting_map,
)
from app.schemas import EmailTestRequest, ReminderSettings

router = APIRouter(prefix="/reminders", tags=["reminders"])


@router.get("/settings")
def get_reminder_settings(db: Session = Depends(get_db), current_user: User = Depends(require_manager)):
    values = get_setting_map(db)
    return {
        **values,
        "email_enabled": settings.email_enabled,
        "smtp_host": settings.smtp_host,
        "smtp_port": settings.smtp_port,
        "smtp_username": settings.smtp_username,
        "smtp_from_email": settings.smtp_from_email,
        "smtp_from_name": settings.smtp_from_name,
        "smtp_use_tls": settings.smtp_use_tls,
        "resend_configured": bool(settings.resend_api_key),
    }


@router.put("/settings")
def update_reminder_settings(payload: ReminderSettings, request: Request, db: Session = Depends(get_db), current_user: User = Depends(require_manager)):
    values = upsert_setting_map(db, payload.model_dump())
    configure_scheduler(request.app)
    return values


@router.post("/email-test")
async def send_test_email(payload: EmailTestRequest | None = None, db: Session = Depends(get_db), current_user: User = Depends(require_manager)):
    to_email = (payload.to_email if payload else None) or current_user.email
    subject = "[Kiểm tra] Email hệ thống quản lý văn bản"
    html = build_email_html(
        "Kiểm tra email hệ thống",
        f"<p>Email SMTP/Resend đang được kiểm tra bởi <strong>{current_user.full_name}</strong>.</p>{link_button(settings.frontend_url)}",
    )
    sent = await send_and_log(
        db,
        log_key=f"smtp_test:{current_user.id}:{new_uuid()}",
        event_type="smtp_test",
        recipient_email=to_email,
        subject=subject,
        html=html,
        recipient_user_id=current_user.id,
        skip_existing=False,
    )
    return {"sent": sent, "to_email": to_email}


@router.post("/preview/staff")
async def preview_staff_reminders(db: Session = Depends(get_db), current_user: User = Depends(require_manager)):
    return await run_staff_reminders(db, dry_run=True)


@router.post("/run/staff")
async def run_staff_reminders_now(db: Session = Depends(get_db), current_user: User = Depends(require_manager)):
    return await run_staff_reminders(db, dry_run=False)


@router.post("/preview/manager-digest")
async def preview_manager_digest(db: Session = Depends(get_db), current_user: User = Depends(require_manager)):
    return await run_manager_digest(db, current_user, dry_run=True)


@router.post("/run/manager-digest")
async def run_manager_digest_now(db: Session = Depends(get_db), current_user: User = Depends(require_manager)):
    return await run_manager_digest(db, current_user, dry_run=False)


@router.post("/preview/weekly-report")
async def preview_weekly_report(db: Session = Depends(get_db), current_user: User = Depends(require_manager)):
    return await run_manager_report(db, current_user, "weekly", dry_run=True)


@router.post("/run/weekly-report")
async def run_weekly_report(db: Session = Depends(get_db), current_user: User = Depends(require_manager)):
    return await run_manager_report(db, current_user, "weekly", dry_run=False)


@router.post("/preview/monthly-report")
async def preview_monthly_report(db: Session = Depends(get_db), current_user: User = Depends(require_manager)):
    return await run_manager_report(db, current_user, "monthly", dry_run=True)


@router.post("/run/monthly-report")
async def run_monthly_report(db: Session = Depends(get_db), current_user: User = Depends(require_manager)):
    return await run_manager_report(db, current_user, "monthly", dry_run=False)


@router.get("/email-logs")
def list_email_logs(event_type: str | None = None, status: str | None = None, limit: int = 100, db: Session = Depends(get_db), current_user: User = Depends(require_manager)):
    query = select(EmailLog).order_by(EmailLog.created_at.desc()).limit(min(max(limit, 1), 200))
    if event_type:
        query = query.where(EmailLog.event_type == event_type)
    if status:
        query = query.where(EmailLog.status == status)
    return [email_log_dict(item) for item in db.scalars(query).all()]
