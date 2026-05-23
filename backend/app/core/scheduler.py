import logging

from sqlalchemy import select

from app.core.database import get_session_local
from app.models import User
from app.reminders import get_setting_map, run_manager_digest, run_manager_report, run_staff_reminders

logger = logging.getLogger(__name__)

try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
except ModuleNotFoundError:  # pragma: no cover - optional runtime dependency
    AsyncIOScheduler = None


def parse_time(value: str) -> tuple[int, int]:
    try:
        hour, minute = value.split(":", 1)
        return int(hour), int(minute)
    except Exception:
        return 8, 0


async def _run_staff_job() -> None:
    session_factory = get_session_local()
    with session_factory() as db:
        await run_staff_reminders(db, dry_run=False)


async def _run_digest_job() -> None:
    session_factory = get_session_local()
    with session_factory() as db:
        manager = db.scalar(select(User).where(User.role == "manager", User.is_active.is_(True)).order_by(User.created_at))
        if manager:
            await run_manager_digest(db, manager, dry_run=False)


async def _run_report_job(kind: str) -> None:
    session_factory = get_session_local()
    with session_factory() as db:
        manager = db.scalar(select(User).where(User.role == "manager", User.is_active.is_(True)).order_by(User.created_at))
        if manager:
            await run_manager_report(db, manager, kind, dry_run=False)


def configure_scheduler(app) -> None:
    if AsyncIOScheduler is None:
        logger.warning("APScheduler is not installed; email reminder cron jobs are disabled")
        return
    scheduler = getattr(app.state, "scheduler", None)
    if scheduler:
        scheduler.shutdown(wait=False)
    scheduler = AsyncIOScheduler(timezone="Asia/Saigon")
    session_factory = get_session_local()
    with session_factory() as db:
        values = get_setting_map(db)

    staff_hour, staff_minute = parse_time(values["staff_reminder_time"])
    digest_hour, digest_minute = parse_time(values["manager_digest_time"])
    report_hour, report_minute = parse_time(values["manager_report_time"])

    if values["staff_reminder_enabled"].lower() == "true":
        scheduler.add_job(_run_staff_job, "cron", hour=staff_hour, minute=staff_minute, id="staff_reminder_job", replace_existing=True)
    if values["manager_digest_enabled"].lower() == "true":
        scheduler.add_job(_run_digest_job, "cron", hour=digest_hour, minute=digest_minute, id="manager_digest_job", replace_existing=True)
    if values["manager_report_mode"] in {"weekly", "both"}:
        scheduler.add_job(_run_report_job, "cron", day_of_week="mon", hour=report_hour, minute=report_minute, args=["weekly"], id="manager_weekly_report_job", replace_existing=True)
    if values["manager_report_mode"] in {"monthly", "both"}:
        scheduler.add_job(_run_report_job, "cron", day=1, hour=report_hour, minute=report_minute, args=["monthly"], id="manager_monthly_report_job", replace_existing=True)

    scheduler.start()
    app.state.scheduler = scheduler


def shutdown_scheduler(app) -> None:
    scheduler = getattr(app.state, "scheduler", None)
    if scheduler:
        scheduler.shutdown(wait=False)
