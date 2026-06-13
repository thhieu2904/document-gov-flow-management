from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_superadmin
from app.models import Department, Document, User
from app.schemas import DepartmentCreate, DepartmentTransferRequest, DepartmentUpdate

router = APIRouter(prefix="/departments", tags=["departments"])


def validate_department_manager(db: Session, manager_id: str | None, department_id: str) -> User | None:
    if not manager_id:
        return None
    manager = db.get(User, manager_id)
    if not manager or not manager.is_active:
        raise HTTPException(status_code=400, detail="Người quản lý được chọn không hợp lệ hoặc đã bị khóa")
    if manager.role == "superadmin":
        raise HTTPException(status_code=400, detail="Không thể gán superadmin làm trưởng phòng")
    if manager.department_id and manager.department_id != department_id:
        raise HTTPException(status_code=400, detail="Người quản lý phải đang thuộc phòng ban này. Vui lòng chuyển nhân viên trước khi gán trưởng phòng.")
    return manager


def set_department_manager(db: Session, department_id: str, manager: User | None) -> None:
    old_managers = db.scalars(
        select(User).where(User.department_id == department_id, User.role == "manager")
    ).all()
    for old_manager in old_managers:
        if not manager or old_manager.id != manager.id:
            old_manager.role = "staff"
    if manager:
        manager.role = "manager"
        manager.department_id = department_id


def department_dict(db: Session, dept: Department) -> dict:
    member_count = db.scalar(select(func.count(User.id)).where(User.department_id == dept.id, User.role != "superadmin")) or 0
    active_member_count = db.scalar(select(func.count(User.id)).where(User.department_id == dept.id, User.role != "superadmin", User.is_active.is_(True))) or 0
    document_count = db.scalar(select(func.count(Document.id)).where(Document.department_id == dept.id)) or 0
    
    manager = db.scalar(
        select(User).where(
            User.department_id == dept.id,
            User.role == "manager",
            User.is_active.is_(True)
        )
    )
    manager_info = {
        "id": manager.id,
        "full_name": manager.full_name,
        "email": manager.email
    } if manager else None

    return {
        "id": dept.id,
        "name": dept.name,
        "description": dept.description,
        "is_active": dept.is_active,
        "member_count": member_count,
        "active_member_count": active_member_count,
        "document_count": document_count,
        "manager": manager_info,
        "created_at": dept.created_at,
        "updated_at": dept.updated_at,
    }


@router.get("")
def list_departments(
    search: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Department).order_by(Department.name)
    if current_user.role in {"manager", "staff"}:
        if not current_user.department_id:
            return []
        query = query.where(Department.id == current_user.department_id)
    if search:
        query = query.where(Department.name.ilike(f"%{search.strip()}%"))
    if status == "active":
        query = query.where(Department.is_active.is_(True))
    elif status == "deleted":
        query = query.where(Department.is_active.is_(False))
    return [department_dict(db, item) for item in db.scalars(query).all()]


@router.post("")
def create_department(payload: DepartmentCreate, db: Session = Depends(get_db), current_user: User = Depends(require_superadmin)):
    dept = Department(name=payload.name.strip(), description=payload.description, is_active=True)
    db.add(dept)
    db.flush()
    manager = validate_department_manager(db, payload.manager_id, dept.id)
    set_department_manager(db, dept.id, manager)
    db.commit()
    db.refresh(dept)
    return department_dict(db, dept)


@router.patch("/{department_id}")
def update_department(
    department_id: str,
    payload: DepartmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    dept = db.get(Department, department_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Không tìm thấy phòng ban")
    for key, value in payload.model_dump(exclude_unset=True).items():
        if key in ("is_active", "manager_id"):
            continue
        setattr(dept, key, value)
        
    changes = payload.model_dump(exclude_unset=True)
    if "manager_id" in changes:
        manager = validate_department_manager(db, changes["manager_id"], dept.id)
        set_department_manager(db, dept.id, manager)
                
    db.commit()
    db.refresh(dept)
    return department_dict(db, dept)


@router.delete("/{department_id}")
def soft_delete_department(department_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_superadmin)):
    dept = db.get(Department, department_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Không tìm thấy phòng ban")
    active_members = db.scalar(select(func.count(User.id)).where(User.department_id == dept.id, User.role != "superadmin", User.is_active.is_(True))) or 0
    if active_members:
        raise HTTPException(status_code=400, detail=f"Phòng ban này còn {active_members} nhân viên đang hoạt động. Vui lòng chuyển nhân viên sang phòng ban khác trước khi xóa.")
    dept.is_active = False
    db.commit()
    db.refresh(dept)
    return department_dict(db, dept)


@router.post("/{department_id}/restore")
def restore_department(department_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_superadmin)):
    dept = db.get(Department, department_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Không tìm thấy phòng ban")
    dept.is_active = True
    db.commit()
    db.refresh(dept)
    return department_dict(db, dept)


@router.post("/{department_id}/transfer-users")
def transfer_department_users(department_id: str, payload: DepartmentTransferRequest, db: Session = Depends(get_db), current_user: User = Depends(require_superadmin)):
    source = db.get(Department, department_id)
    target = db.get(Department, payload.target_department_id)
    if not source:
        raise HTTPException(status_code=404, detail="Không tìm thấy phòng ban nguồn")
    if not target or not target.is_active:
        raise HTTPException(status_code=400, detail="Phòng ban đích không hợp lệ hoặc đã xóa")
    if source.id == target.id:
        raise HTTPException(status_code=400, detail="Phòng ban nguồn và đích phải khác nhau")
    users = db.scalars(select(User).where(User.department_id == source.id, User.role != "superadmin", User.is_active.is_(True))).all()
    for user in users:
        if user.role == "manager":
            user.role = "staff"
        user.department_id = target.id
    db.commit()
    return {"transferred": len(users), "source": department_dict(db, source), "target": department_dict(db, target)}
