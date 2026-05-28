from __future__ import annotations

from pathlib import Path
import sys

from sqlalchemy import select

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.auth_provider import get_auth_provider
from app.core.database import get_session_local
from app.models import User


DEMO_PASSWORD = "password123"
STAFF_EMAILS = [
    "nhanvien1@example.com",
    "nhanvien2@example.com",
    "nhanvien3@example.com",
]


def user_email(auth_user) -> str:
    return (getattr(auth_user, "email", "") or "").lower()


def user_id(auth_user) -> str | None:
    value = getattr(auth_user, "id", None)
    return str(value) if value else None


def main() -> None:
    provider = get_auth_provider()
    session_factory = get_session_local()

    existing_auth = {
        user_email(item): item
        for item in provider.admin.auth.admin.list_users()
        if user_email(item) in STAFF_EMAILS
    }

    with session_factory() as db:
        for email in STAFF_EMAILS:
            app_user = db.scalar(select(User).where(User.email == email))
            if not app_user:
                print(f"SKIP {email}: missing app user")
                continue

            auth_user = existing_auth.get(email)
            action = "existing"
            if not auth_user:
                response = provider.admin.auth.admin.create_user(
                    {"email": email, "password": DEMO_PASSWORD, "email_confirm": True}
                )
                auth_user = response.user
                action = "created"
            else:
                provider.admin.auth.admin.update_user_by_id(
                    user_id(auth_user),
                    {"password": DEMO_PASSWORD, "email_confirm": True},
                )
                action = "updated"

            auth_id = user_id(auth_user)
            if not auth_id:
                print(f"ERROR {email}: auth user has no id")
                continue

            app_user.supabase_user_id = auth_id
            app_user.is_active = True
            app_user.must_change_password = False
            print(f"{action.upper()} {email}: auth_id={auth_id} app_user_id={app_user.id}")

        db.commit()


if __name__ == "__main__":
    main()
