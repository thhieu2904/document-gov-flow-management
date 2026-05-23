from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.constants import ROLES
from app.core.auth_provider import get_auth_provider
from app.core.database import get_db
from app.core.deps import ensure_valid_role, get_current_user, require_manager
from app.core.config import settings
from app.core.email import email_account_created, email_password_reset
from app.email_utils import generate_temporary_password, send_and_log_task
from app.models import Department, User, new_uuid
from app.schemas import PasswordResetResponse, UserCreate, UserOut, UserUpdate

router = APIRouter(tags=["users"])


@router.get("/roles")
def list_roles(current_user: User = Depends(get_current_user)):
    return ROLES


def require_active_department(db: Session, department_id: str | None) -> str:
    if not department_id:
        raise HTTPException(status_code=400, detail="Nhân viên phải thuộc một phòng ban đang sử dụng")
    dept = db.get(Department, department_id)
    if not dept or not dept.is_active:
        raise HTTPException(status_code=400, detail="Phòng ban không hợp lệ hoặc đã xóa")
    return dept.id


def normalize_department_for_role(db: Session, role: str, department_id: str | None) -> str | None:
    if role == "manager":
        return None
    return require_active_department(db, department_id)


@router.get("/users", response_model=list[UserOut])
def list_users(
    search: str | None = None,
    role: str | None = None,
    department_id: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(User).order_by(User.role.desc(), User.full_name)
    if current_user.role == "staff":
        query = query.where(User.is_active.is_(True))
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(or_(User.full_name.ilike(pattern), User.email.ilike(pattern)))
    if role:
        ensure_valid_role(role)
        query = query.where(User.role == role)
    if department_id:
        query = query.where(User.department_id == department_id)
    if status == "active":
        query = query.where(User.is_active.is_(True))
    elif status == "locked":
        query = query.where(User.is_active.is_(False))
    return db.scalars(query).all()


@router.post("/users", response_model=UserOut)
def create_user(
    payload: UserCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    ensure_valid_role(payload.role)
    email = payload.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Email đã tồn tại")
    department_id = normalize_department_for_role(db, payload.role, payload.department_id)
    supabase_user_id = get_auth_provider().create_user(db, email, payload.password)
    user = User(
        supabase_user_id=supabase_user_id,
        full_name=payload.full_name,
        email=email,
        role=payload.role,
        department_id=department_id,
        position_label=payload.position_label,
        is_active=payload.is_active,
        must_change_password=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    if settings.email_enabled:
        subject, html = email_account_created(user.full_name, user.email, payload.password, "quản lý" if user.role == "manager" else "nhân viên", settings.frontend_url)
        background_tasks.add_task(
            send_and_log_task,
            log_key=f"account_created:{user.id}",
            event_type="account_created",
            recipient_email=user.email,
            subject=subject,
            html=html,
            recipient_user_id=user.id,
        )
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: str, payload: UserUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_manager)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    changes = payload.model_dump(exclude_unset=True)
    if "role" in changes and changes["role"]:
        ensure_valid_role(changes["role"])
    if user.id == current_user.id:
        if changes.get("is_active") is False:
            raise HTTPException(status_code=400, detail="Không thể khóa tài khoản đang đăng nhập")
        if changes.get("role") and changes["role"] != "manager":
            raise HTTPException(status_code=400, detail="Không thể tự hạ vai trò quản lý")
    target_role = changes.get("role") or user.role
    if "role" in changes or "department_id" in changes:
        changes["department_id"] = normalize_department_for_role(db, target_role, changes.get("department_id", user.department_id))
    password = changes.pop("password", None)
    if password:
        get_auth_provider().update_password(db, user, password)
        user.must_change_password = True
    for key, value in changes.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


@router.post("/users/{user_id}/reset-password", response_model=PasswordResetResponse)
def reset_user_password(
    user_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    temporary_password = generate_temporary_password()
    get_auth_provider().update_password(db, user, temporary_password)
    user.must_change_password = True
    db.commit()
    if settings.email_enabled:
        subject, html = email_password_reset(user.full_name, user.email, temporary_password, settings.frontend_url)
        background_tasks.add_task(
            send_and_log_task,
            log_key=f"password_reset:{user.id}:{new_uuid()}",
            event_type="password_reset",
            recipient_email=user.email,
            subject=subject,
            html=html,
            recipient_user_id=user.id,
            skip_existing=False,
        )
    return PasswordResetResponse(temporary_password=temporary_password)
