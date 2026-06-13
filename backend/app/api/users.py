from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.constants import ROLES
from app.core.auth_provider import get_auth_provider
from app.core.database import get_db
from app.core.deps import ensure_valid_role, get_current_user, require_admin
from app.core.config import settings
from app.core.email import email_account_created, email_password_reset
from app.email_utils import generate_temporary_password, send_and_log_task
from app.models import Department, User, new_uuid
from app.schemas import PasswordResetResponse, UserCreate, UserOut, UserUpdate
from app.core.security import hash_password

router = APIRouter(tags=["users"])


@router.get("/roles")
def list_roles(current_user: User = Depends(get_current_user)):
    return ROLES


def require_active_department(db: Session, department_id: str | None) -> str:
    if not department_id:
        raise HTTPException(status_code=400, detail="Người dùng phải thuộc một phòng ban đang sử dụng")
    dept = db.get(Department, department_id)
    if not dept or not dept.is_active:
        raise HTTPException(status_code=400, detail="Phòng ban không hợp lệ hoặc đã xóa")
    return dept.id


def normalize_department_for_role(db: Session, role: str, department_id: str | None) -> str | None:
    if role == "superadmin":
        return None
    return require_active_department(db, department_id)


def can_manage_user(current_user: User, target: User) -> bool:
    if current_user.role == "superadmin":
        return True
    if current_user.role == "manager":
        if target.id == current_user.id:
            return True
        return target.role == "staff" and bool(current_user.department_id) and target.department_id == current_user.department_id
    return False


def ensure_can_manage_user(current_user: User, target: User) -> None:
    if not can_manage_user(current_user, target):
        raise HTTPException(status_code=403, detail="Bạn không có quyền quản lý người dùng này")


def normalize_payload_for_actor(db: Session, current_user: User, role: str, department_id: str | None) -> tuple[str, str | None]:
    if current_user.role == "manager":
        if role != "staff":
            raise HTTPException(status_code=403, detail="Quản lý chỉ được tạo hoặc sửa nhân viên")
        if not current_user.department_id:
            raise HTTPException(status_code=403, detail="Tài khoản quản lý chưa được gắn phòng ban")
        return "staff", require_active_department(db, current_user.department_id)
    return role, normalize_department_for_role(db, role, department_id)


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
    elif current_user.role == "manager":
        if current_user.department_id:
            query = query.where(User.role != "superadmin", User.department_id == current_user.department_id)
        else:
            query = query.where(User.id == current_user.id)
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
    current_user: User = Depends(require_admin),
):
    ensure_valid_role(payload.role)
    email = payload.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Email đã tồn tại")
    role, department_id = normalize_payload_for_actor(db, current_user, payload.role, payload.department_id)
    password_hash = hash_password(payload.password) if settings.auth_provider == "local" else None
    user = User(
        supabase_user_id=None,
        password_hash=password_hash,
        full_name=payload.full_name,
        email=email,
        role=role,
        department_id=department_id,
        position_label=payload.position_label,
        is_active=payload.is_active,
        must_change_password=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    if settings.email_enabled:
        role_label = {"superadmin": "quản trị toàn hệ thống", "manager": "quản lý", "staff": "nhân viên"}.get(user.role, user.role)
        subject, html = email_account_created(user.full_name, user.email, payload.password, role_label, settings.frontend_url)
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
def update_user(user_id: str, payload: UserUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    ensure_can_manage_user(current_user, user)
    changes = payload.model_dump(exclude_unset=True)
    if "role" in changes and changes["role"]:
        ensure_valid_role(changes["role"])
    if user.id == current_user.id:
        if changes.get("is_active") is False:
            raise HTTPException(status_code=400, detail="Không thể khóa tài khoản đang đăng nhập")
        if changes.get("role") and changes["role"] != user.role:
            raise HTTPException(status_code=400, detail="Không thể tự đổi vai trò tài khoản đang đăng nhập")
    if current_user.role == "manager":
        if "role" in changes and changes["role"] != "staff":
            raise HTTPException(status_code=403, detail="Quản lý không được đổi vai trò người dùng")
        if "department_id" in changes and changes["department_id"] != current_user.department_id:
            raise HTTPException(status_code=403, detail="Quản lý chỉ được thao tác trong phòng ban của mình")
    target_role = changes.get("role") or user.role
    if "role" in changes or "department_id" in changes:
        target_role, changes["department_id"] = normalize_payload_for_actor(db, current_user, target_role, changes.get("department_id", user.department_id))
        changes["role"] = target_role
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
    current_user: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    ensure_can_manage_user(current_user, user)
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
