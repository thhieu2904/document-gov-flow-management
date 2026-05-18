from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth_provider import get_auth_provider
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import User
from app.schemas import LoginRequest, PasswordChangeRequest, UserOut
from app.services import audit

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    provider = get_auth_provider()
    result = provider.login(db, payload.email.lower(), payload.password)
    user = None
    if result.supabase_user_id:
        user = db.scalar(select(User).where(User.supabase_user_id == result.supabase_user_id))
    else:
        user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Tai khoan khong kha dung")
    return {
        "access_token": result.access_token,
        "refresh_token": result.refresh_token,
        "token_type": "bearer",
        "user": UserOut.model_validate(user),
    }


@router.post("/change-password")
def change_password(
    payload: PasswordChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    provider = get_auth_provider()
    provider.login(db, current_user.email, payload.current_password)
    provider.update_password(db, current_user, payload.new_password)
    current_user.must_change_password = False
    audit(db, current_user, "auth.change_password", "user", current_user.id, "Nguoi dung doi mat khau")
    db.commit()
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user
