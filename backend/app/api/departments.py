from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models import Department, User
from app.schemas import DepartmentCreate, DepartmentUpdate
from app.services import audit

router = APIRouter(prefix="/departments", tags=["departments"])


def department_dict(dept: Department) -> dict:
    return {
        "id": dept.id,
        "name": dept.name,
        "description": dept.description,
        "unit_type": dept.unit_type,
        "is_active": dept.is_active,
        "created_at": dept.created_at,
        "updated_at": dept.updated_at,
    }


@router.get("")
def list_departments(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return [department_dict(item) for item in db.scalars(select(Department).order_by(Department.name)).all()]


@router.post("")
def create_department(
    payload: DepartmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    dept = Department(**payload.model_dump())
    db.add(dept)
    db.flush()
    audit(db, current_user, "department.create", "department", dept.id, dept.name)
    db.commit()
    db.refresh(dept)
    return department_dict(dept)


@router.patch("/{department_id}")
def update_department(
    department_id: str,
    payload: DepartmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    dept = db.get(Department, department_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Khong tim thay phong ban")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(dept, key, value)
    audit(db, current_user, "department.update", "department", dept.id, dept.name)
    db.commit()
    db.refresh(dept)
    return department_dict(dept)
