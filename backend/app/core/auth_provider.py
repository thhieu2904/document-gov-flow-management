from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import User


@dataclass
class AuthResult:
    access_token: str
    refresh_token: str | None = None
    supabase_user_id: str | None = None


class AuthProvider:
    def login(self, db: Session, email: str, password: str) -> AuthResult:
        raise NotImplementedError

    def verify_token(self, db: Session, token: str) -> User | None:
        raise NotImplementedError

    def create_user(self, db: Session, email: str, password: str) -> str | None:
        raise NotImplementedError

    def update_password(self, db: Session, user: User, new_password: str) -> None:
        raise NotImplementedError


class SupabaseAuthProvider(AuthProvider):
    def __init__(self) -> None:
        from supabase import create_client

        if not settings.supabase_url or not settings.supabase_anon_key or not settings.supabase_service_role_key:
            raise RuntimeError("Supabase auth requires SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY")
        self.client = create_client(settings.supabase_url, settings.supabase_anon_key)
        self.admin = create_client(settings.supabase_url, settings.supabase_service_role_key)

    def login(self, db: Session, email: str, password: str) -> AuthResult:
        try:
            response = self.client.auth.sign_in_with_password({"email": email.lower(), "password": password})
        except Exception as exc:
            raise HTTPException(status_code=401, detail="Email hoac mat khau khong dung") from exc
        if not response.session or not response.user:
            raise HTTPException(status_code=401, detail="Email hoac mat khau khong dung")
        return AuthResult(
            access_token=response.session.access_token,
            refresh_token=response.session.refresh_token,
            supabase_user_id=response.user.id,
        )

    def verify_token(self, db: Session, token: str) -> User | None:
        try:
            response = self.admin.auth.get_user(token)
        except Exception:
            return None
        if not response.user:
            return None
        return db.scalar(select(User).where(User.supabase_user_id == response.user.id))

    def create_user(self, db: Session, email: str, password: str) -> str | None:
        response = self.admin.auth.admin.create_user(
            {"email": email.lower(), "password": password, "email_confirm": True}
        )
        return response.user.id if response.user else None

    def update_password(self, db: Session, user: User, new_password: str) -> None:
        if not user.supabase_user_id:
            raise HTTPException(status_code=400, detail="Nguoi dung chua co Supabase user id")
        self.admin.auth.admin.update_user_by_id(user.supabase_user_id, {"password": new_password})


def get_auth_provider() -> AuthProvider:
    if settings.auth_provider != "supabase":
        raise RuntimeError("AUTH_PROVIDER must be supabase for this project.")
    return SupabaseAuthProvider()
