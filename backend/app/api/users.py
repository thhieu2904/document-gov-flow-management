from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants import ROLES
from app.core.auth_provider import get_auth_provider
from app.core.database import get_db
from app.core.deps import ensure_valid_role, get_current_user, require_role
from app.models import User
from app.schemas import UserCreate, UserOut, UserUpdate
from app.services import audit

router = APIRouter(tags=["users"])


def has_another_active_admin(db: Session, user_id: str) -> bool:
    return bool(
        db.scalar(
            select(User.id).where(
                User.id != user_id,
                User.role == "admin",
                User.is_active.is_(True),
            )
        )
    )


@router.get("/roles")
def list_roles(current_user: User = Depends(get_current_user)):
    return ROLES


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(User).order_by(User.full_name)
    if current_user.role != "admin":
        query = query.where(User.is_active.is_(True))
    return db.scalars(query).all()


@router.post("/users", response_model=UserOut)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    ensure_valid_role(payload.role)
    email = payload.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Email da ton tai")
    supabase_user_id = get_auth_provider().create_user(db, email, payload.password)
    user = User(
        supabase_user_id=supabase_user_id,
        full_name=payload.full_name,
        email=email,
        password_hash=None,
        role=payload.role,
        department_id=payload.department_id,
        position_label=payload.position_label,
        is_active=payload.is_active,
        must_change_password=True,
    )
    db.add(user)
    db.flush()
    audit(db, current_user, "user.create", "user", user.id, user.email)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: str,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Khong tim thay nguoi dung")
    changes = payload.model_dump(exclude_unset=True)
    if "role" in changes and changes["role"]:
        ensure_valid_role(changes["role"])
    password = changes.pop("password", None)
    is_self = user.id == current_user.id
    next_role = changes.get("role", user.role)
    next_active = changes.get("is_active", user.is_active)

    if is_self:
        if next_active is False:
            raise HTTPException(status_code=400, detail="Khong the khoa tai khoan dang dang nhap")
        if next_role != "admin":
            raise HTTPException(status_code=400, detail="Khong the ha vai tro admin cua chinh minh")
        if password:
            raise HTTPException(status_code=400, detail="Hay dung chuc nang doi mat khau ca nhan")

    if user.role == "admin" and user.is_active and (next_role != "admin" or next_active is False):
        if not has_another_active_admin(db, user.id):
            raise HTTPException(status_code=400, detail="He thong phai con it nhat mot admin dang hoat dong")

    if password:
        get_auth_provider().update_password(db, user, password)
        user.must_change_password = True
    for key, value in changes.items():
        setattr(user, key, value)
    audit(db, current_user, "user.update", "user", user.id, user.email)
    db.commit()
    db.refresh(user)
    return user
