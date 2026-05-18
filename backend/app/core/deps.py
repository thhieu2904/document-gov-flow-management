from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.constants import ROLES
from app.core.auth_provider import get_auth_provider
from app.core.database import get_db
from app.models import User

bearer = HTTPBearer(auto_error=False)

ROLE_ORDER = {
    "staff": 1,
    "clerk": 2,
    "manager": 3,
    "admin": 4,
}
VALID_ROLES = {item["key"] for item in ROLES}


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Chua dang nhap")
    user = get_auth_provider().verify_token(db, credentials.credentials)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Tai khoan khong kha dung")
    return user


def require_role(*roles: str):
    def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Khong du quyen")
        return current_user

    return checker


def has_at_least(user: User, role: str) -> bool:
    return ROLE_ORDER.get(user.role, 0) >= ROLE_ORDER.get(role, 999)


def ensure_valid_role(role: str) -> None:
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Vai tro khong hop le")
