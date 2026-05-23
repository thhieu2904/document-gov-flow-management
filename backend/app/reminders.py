from __future__ import annotations

from datetime import datetime, time, timedelta
from html import escape
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings as app_settings
from app.core.email import email_staff_reminder, build_email_html, link_button
from app.email_utils import log_exists, send_and_log
from app.models import Document, DocumentAssignment, EmailLog, SystemSetting, User, now_utc

VN_TZ = ZoneInfo("Asia/Saigon")

DEFAULT_REMINDER_SETTINGS: dict[str, str] = {
    "staff_reminder_enabled": "true",
    "staff_reminder_time": "08:00",
    "staff_due_soon_days": "3",
    "staff_urgent_enabled": "true",
    "staff_overdue_enabled": "true",
    "manager_digest_enabled": "true",
    "manager_digest_time": "16:30",
    "manager_report_mode": "weekly",
    "manager_report_time": "08:00",
}


def bool_value(value: str) -> bool:
    return value.lower() in {"1", "true", "yes", "on"}


def get_setting_map(db: Session) -> dict[str, str]:
    values = DEFAULT_REMINDER_SETTINGS.copy()
    for item in db.scalars(select(SystemSetting)).all():
        values[item.key] = item.value
    return values


def upsert_setting_map(db: Session, values: dict[str, object]) -> dict[str, str]:
    for key, value in values.items():
        if key not in DEFAULT_REMINDER_SETTINGS:
            continue
        item = db.get(SystemSetting, key)
        if item:
            item.value = str(value).lower() if isinstance(value, bool) else str(value)
        else:
            db.add(SystemSetting(key=key, value=str(value).lower() if isinstance(value, bool) else str(value)))
    db.commit()
    return get_setting_map(db)


def fmt_dt(value: datetime | None) -> str:
    if not value:
        return "Không có"
    return value.astimezone(VN_TZ).strftime("%H:%M:%S %d/%m/%Y")


def reminder_label(kind: str) -> str:
    return {"due_soon": "Sắp đến hạn", "urgent": "Rất gấp", "overdue": "Quá hạn"}[kind]


def staff_reminder_candidates(db: Session) -> list[dict]:
    setting = get_setting_map(db)
    if not bool_value(setting["staff_reminder_enabled"]):
        return []
    now = datetime.now(VN_TZ)
    due_soon_days = int(setting["staff_due_soon_days"])
    assignments = db.scalars(
        select(DocumentAssignment)
        .where(DocumentAssignment.status.in_(["pending", "in_progress"]), DocumentAssignment.due_at.is_not(None))
        .order_by(DocumentAssignment.due_at.asc())
    ).all()
    result: list[dict] = []
    for assignment in assignments:
        doc = assignment.document
        assignee = assignment.assignee
        if not doc or not assignee or not assignee.email or not assignee.is_active:
            continue
        due = assignment.due_at.astimezone(VN_TZ) if assignment.due_at else None
        if not due:
            continue
        kind: str | None = None
        if due < now and bool_value(setting["staff_overdue_enabled"]):
            kind = "overdue"
        elif due <= now + timedelta(days=1) and bool_value(setting["staff_urgent_enabled"]):
            kind = "urgent"
        elif due <= now + timedelta(days=due_soon_days):
            kind = "due_soon"
        if not kind:
            continue
        log_key = f"staff_reminder:{kind}:{assignment.id}:{assignee.id}:{assignment.due_at.isoformat()}"
        result.append(
            {
                "log_key": log_key,
                "already_sent": log_exists(db, log_key),
                "event_type": f"staff_{kind}",
                "reminder_type": kind,
                "reminder_label": reminder_label(kind),
                "document_id": doc.id,
                "assignment_id": assignment.id,
                "recipient_user_id": assignee.id,
                "recipient_email": assignee.email,
                "recipient_name": assignee.full_name,
                "document_code": doc.code,
                "document_title": doc.title,
                "due_at": assignment.due_at,
                "due_at_display": fmt_dt(assignment.due_at),
            }
        )
    return result


async def run_staff_reminders(db: Session, dry_run: bool = True) -> dict:
    candidates = staff_reminder_candidates(db)
    sendable = [item for item in candidates if not item["already_sent"]]
    sent = 0
    if not dry_run:
        for item in sendable:
            subject, html = email_staff_reminder(item["reminder_label"], item["document_title"], item["document_code"], item["recipient_name"], item["due_at_display"], app_settings.frontend_url)
            if await send_and_log(
                db,
                log_key=item["log_key"],
                event_type=item["event_type"],
                recipient_email=item["recipient_email"],
                subject=subject,
                html=html,
                document_id=item["document_id"],
                assignment_id=item["assignment_id"],
                recipient_user_id=item["recipient_user_id"],
                due_at_snapshot=item["due_at"],
            ):
                sent += 1
    return {"total": len(candidates), "sendable": len(sendable), "sent": sent, "settings": get_setting_map(db), "items": candidates}


def digest_items(db: Session) -> list[dict]:
    items = staff_reminder_candidates(db)
    return [item for item in items if item["reminder_type"] in {"overdue", "urgent", "due_soon"}]


def build_digest_html(items: list[dict], title: str) -> str:
    if not items:
        body = "<p>Không có văn bản cần chú ý tại thời điểm gửi.</p>"
    else:
        rows = "".join(
            f"""
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">{escape(item['document_code'] or '-')}</td>
              <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">{escape(item['document_title'])}</td>
              <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">{escape(item['recipient_name'])}</td>
              <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">{escape(item['due_at_display'])}</td>
              <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">{escape(item['reminder_label'])}</td>
            </tr>
            """
            for item in items
        )
        body = f"""
        <p>Có <strong>{len(items)}</strong> việc/văn bản cần chú ý.</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead><tr style="background: #eff6ff;"><th style="padding: 8px; text-align: left;">Số hiệu</th><th style="padding: 8px; text-align: left;">Trích yếu</th><th style="padding: 8px; text-align: left;">Nhân viên</th><th style="padding: 8px; text-align: left;">Hạn</th><th style="padding: 8px; text-align: left;">Trạng thái</th></tr></thead>
          <tbody>{rows}</tbody>
        </table>
        {link_button(app_settings.frontend_url)}
        """
    return build_email_html(title, body)


async def run_manager_digest(db: Session, manager: User, dry_run: bool = True) -> dict:
    items = digest_items(db)
    title = "Tổng hợp văn bản cần chú ý"
    subject, html = f"[Tổng hợp] {title}", build_digest_html(items, title)
    log_key = f"manager_digest:{manager.id}:{datetime.now(VN_TZ).strftime('%Y-%m-%d')}"
    sent = 0
    if not dry_run and manager.email:
        if await send_and_log(db, log_key=log_key, event_type="manager_digest", recipient_email=manager.email, subject=subject, html=html, recipient_user_id=manager.id, scheduled_for_date=datetime.now(VN_TZ).strftime("%Y-%m-%d")):
            sent = 1
    return {"total": len(items), "sent": sent, "subject": subject, "html": html, "items": items, "already_sent": log_exists(db, log_key)}


def report_bounds(kind: str, now: datetime | None = None) -> tuple[datetime, datetime, str]:
    current = now or datetime.now(VN_TZ)
    if kind == "weekly":
        this_monday = current.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=current.weekday())
        start = this_monday - timedelta(days=7)
        label = f"{start.strftime('%d/%m/%Y')} - {current.strftime('%d/%m/%Y %H:%M')}"
    else:
        first_this_month = current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if first_this_month.month == 1:
            start = first_this_month.replace(year=first_this_month.year - 1, month=12)
        else:
            start = first_this_month.replace(month=first_this_month.month - 1)
        label = f"{start.strftime('%d/%m/%Y')} - {current.strftime('%d/%m/%Y %H:%M')}"
    return start.astimezone(now_utc().tzinfo), current.astimezone(now_utc().tzinfo), label


async def run_manager_report(db: Session, manager: User, kind: str, dry_run: bool = True) -> dict:
    start, end, label = report_bounds(kind)
    docs = db.scalars(select(Document).where(Document.created_by == manager.id)).all()
    in_range = [doc for doc in docs if any(value and start <= value < end for value in [doc.issued_at, doc.due_at, doc.completed_at])]
    open_docs = [doc for doc in docs if doc.status != "completed"]
    late_completed = [doc for doc in in_range if doc.status == "completed" and doc.due_at and doc.completed_at and doc.completed_at > doc.due_at]
    title = "Báo cáo tuần gần nhất" if kind == "weekly" else "Báo cáo tháng gần nhất"
    rows = "".join(f"<li>{escape(doc.code or '-')} - {escape(doc.title)} ({escape(doc.status)})</li>" for doc in in_range[:20])
    body = f"""
    <p><strong>Kỳ báo cáo:</strong> {escape(label)}. Tính đến thời điểm gửi email.</p>
    <div style="background:#f8fafc;padding:12px;border-radius:6px;margin:12px 0;">
      <p><strong>Tổng văn bản trong kỳ:</strong> {len(in_range)}</p>
      <p><strong>Hoàn tất:</strong> {len([doc for doc in in_range if doc.status == 'completed'])}</p>
      <p><strong>Hoàn tất trễ hạn:</strong> {len(late_completed)}</p>
      <p><strong>Tồn đọng hiện tại:</strong> {len(open_docs)}</p>
    </div>
    <ul>{rows or '<li>Không có văn bản trong kỳ.</li>'}</ul>
    {link_button(app_settings.frontend_url)}
    """
    subject, html = f"[Tổng hợp] {title}", build_email_html(title, body)
    log_key = f"manager_{kind}_report:{manager.id}:{end.astimezone(VN_TZ).strftime('%Y-%m-%d')}"
    sent = 0
    if not dry_run and manager.email:
        if await send_and_log(db, log_key=log_key, event_type=f"manager_{kind}_report", recipient_email=manager.email, subject=subject, html=html, recipient_user_id=manager.id, scheduled_for_date=end.astimezone(VN_TZ).strftime("%Y-%m-%d")):
            sent = 1
    return {"period": label, "total": len(in_range), "sent": sent, "subject": subject, "html": html}


def email_log_dict(item: EmailLog) -> dict:
    return {
        "id": item.id,
        "event_type": item.event_type,
        "recipient_email": item.recipient_email,
        "subject": item.subject,
        "status": item.status,
        "sent_at": item.sent_at,
        "created_at": item.created_at,
        "document_id": item.document_id,
        "assignment_id": item.assignment_id,
    }
