import argparse
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.auth_provider import get_auth_provider
from app.core.database import get_session_local
from app.models import User, now_utc


def main() -> None:
    parser = argparse.ArgumentParser(description="Create the first admin account.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--full-name", default="Quan tri he thong")
    args = parser.parse_args()

    session_factory = get_session_local()
    auth_provider = get_auth_provider()

    with session_factory() as db:
        user = db.query(User).filter(User.email == args.email.lower()).one_or_none()
        if user:
            user.role = "admin"
            user.is_active = True
            user.must_change_password = True
            user.updated_at = now_utc()
            auth_provider.update_password(db, user, args.password)
            db.commit()
            print(f"Updated admin: {user.email}")
            return

        try:
            supabase_user_id = auth_provider.create_user(db, args.email.lower(), args.password)
        except Exception:
            result = auth_provider.login(db, args.email.lower(), args.password)
            supabase_user_id = result.supabase_user_id
        user = User(
            supabase_user_id=supabase_user_id,
            full_name=args.full_name,
            email=args.email.lower(),
            password_hash=None,
            role="admin",
            department_id=None,
            position_label="Admin",
            is_active=True,
            must_change_password=True,
        )
        db.add(user)
        db.commit()
        print(f"Created admin: {user.email}")


if __name__ == "__main__":
    main()
