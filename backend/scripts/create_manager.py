from pathlib import Path
import argparse
import sys

from sqlalchemy import select

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.auth_provider import get_auth_provider
from app.core.database import get_session_local
from app.core.security import hash_password
from app.models import Department, User


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or update a manager account.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--name", default="Manager")
    args = parser.parse_args()

    db = get_session_local()()
    try:
        dept = db.scalar(select(Department).where(Department.name == "Quản lý"))
        if not dept:
            dept = Department(name="Quản lý", description="Nhóm quản lý", is_active=True)
            db.add(dept)
            db.flush()
        email = args.email.lower()
        user = db.scalar(select(User).where(User.email == email))
        provider = get_auth_provider()
        if user:
            provider.update_password(db, user, args.password)
            user.full_name = args.name
            user.role = "manager"
            user.department_id = dept.id
            user.is_active = True
        else:
            user = User(
                supabase_user_id=None,
                password_hash=hash_password(args.password),
                email=email,
                full_name=args.name,
                role="manager",
                department_id=dept.id,
                is_active=True,
                must_change_password=False,
            )
            db.add(user)
        db.commit()
        print(f"Manager ready: {email}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
