from __future__ import annotations

from pathlib import Path
import sys

from sqlalchemy import select

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.database import get_session_local
from app.core.security import hash_password
from app.models import User


DEMO_PASSWORD = "password123"
STAFF_EMAILS = [
    "nhanvien1@example.com",
    "nhanvien2@example.com",
    "nhanvien3@example.com",
]


def main() -> None:
    session_factory = get_session_local()

    with session_factory() as db:
        for email in STAFF_EMAILS:
            app_user = db.scalar(select(User).where(User.email == email))
            if not app_user:
                print(f"SKIP {email}: missing app user")
                continue

            app_user.supabase_user_id = None
            app_user.password_hash = hash_password(DEMO_PASSWORD)
            app_user.is_active = True
            app_user.must_change_password = False
            print(f"RESTORED {email}: app_user_id={app_user.id}")

        db.commit()


if __name__ == "__main__":
    main()
