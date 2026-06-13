from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.models import User
import jwt
from datetime import datetime, timedelta, timezone


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


class LocalAuthProvider(AuthProvider):
    def login(self, db: Session, email: str, password: str) -> AuthResult:
        user = db.scalar(select(User).where(User.email == email.lower()))
        if not user or not user.is_active or not verify_password(password, user.password_hash):
            raise HTTPException(status_code=401, detail="Email hoac mat khau khong dung")
        
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expires_minutes)
        to_encode = {"sub": user.id, "exp": expire}
        encoded_jwt = jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
        
        return AuthResult(access_token=encoded_jwt)

    def verify_token(self, db: Session, token: str) -> User | None:
        try:
            payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
            user_id = payload.get("sub")
            if not user_id:
                return None
            return db.get(User, user_id)
        except jwt.PyJWTError:
            return None

    def create_user(self, db: Session, email: str, password: str) -> str | None:
        return None

    def update_password(self, db: Session, user: User, new_password: str) -> None:
        user.password_hash = hash_password(new_password)


def get_auth_provider() -> AuthProvider:
    return LocalAuthProvider()
