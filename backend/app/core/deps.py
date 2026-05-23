from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.constants import ROLES
from app.core.auth_provider import get_auth_provider
from app.core.database import get_db
from app.models import User

bearer = HTTPBearer(auto_error=False)
VALID_ROLES = {item["key"] for item in ROLES}


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Chưa đăng nhập")
    user = get_auth_provider().verify_token(db, credentials.credentials)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Tài khoản không khả dụng")
    return user


def require_manager(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "manager":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ quản lý được thao tác")
    return current_user


def ensure_valid_role(role: str) -> None:
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Vai trò không hợp lệ")
