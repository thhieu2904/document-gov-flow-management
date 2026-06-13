from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin
from app.kpi_utils import KPI_STATUS_LABELS, KPI_STATUS_ORDER, build_kpi_report_text, classify_kpi_status
from app.models import Department, KpiIndicator, KpiPeriod, KpiResult, User
from app.schemas import KpiIndicatorCreate, KpiIndicatorUpdate, KpiPeriodCreate, KpiPeriodUpdate, KpiResultBatch

router = APIRouter(prefix="/kpi", tags=["kpi"])


def require_department(db: Session, department_id: str | None) -> Department | None:
    if not department_id:
        return None
    dept = db.get(Department, department_id)
    if not dept or not dept.is_active:
        raise HTTPException(status_code=400, detail="Phòng ban không hợp lệ hoặc đã xóa")
    return dept


def indicator_dict(indicator: KpiIndicator) -> dict:
    return {
        "id": indicator.id,
        "number": indicator.number,
        "name": indicator.name,
        "description": indicator.description,
        "department_id": indicator.department_id,
        "department": {"id": indicator.department.id, "name": indicator.department.name} if indicator.department else None,
        "is_active": indicator.is_active,
    }


def period_dict(db: Session, period: KpiPeriod) -> dict:
    total = db.scalar(select(func.count(KpiIndicator.id)).where(KpiIndicator.is_active.is_(True))) or 0
    entered = db.scalar(
        select(func.count(KpiResult.id))
        .join(KpiIndicator, KpiIndicator.id == KpiResult.indicator_id)
        .where(KpiResult.period_id == period.id, KpiResult.percentage.is_not(None), KpiIndicator.is_active.is_(True))
    ) or 0
    return {
        "id": period.id,
        "month": period.month,
        "year": period.year,
        "name": period.name,
        "status": period.status,
        "total_count": total,
        "entered_count": entered,
        "created_by": period.created_by,
        "created_at": period.created_at,
        "updated_at": period.updated_at,
    }


def result_rows(db: Session, period_id: str, department_id: str | None = None, status: str | None = None) -> list[dict]:
    indicator_query = select(KpiIndicator).where(KpiIndicator.is_active.is_(True)).order_by(KpiIndicator.number)
    if department_id:
        indicator_query = indicator_query.where(KpiIndicator.department_id == department_id)
    indicators = db.scalars(indicator_query).all()
    results = db.scalars(select(KpiResult).where(KpiResult.period_id == period_id)).all()
    result_by_indicator = {item.indicator_id: item for item in results}

    rows: list[dict] = []
    for indicator in indicators:
        result = result_by_indicator.get(indicator.id)
        row_status = result.status if result else "not_entered"
        row = {
            "id": result.id if result else None,
            "indicator": {"id": indicator.id, "number": indicator.number, "name": indicator.name, "description": indicator.description},
            "department": {"id": indicator.department.id, "name": indicator.department.name} if indicator.department else None,
            "percentage": result.percentage if result else None,
            "status": row_status,
            "status_label": KPI_STATUS_LABELS[row_status],
            "note": result.note if result else None,
        }
        if not status or row["status"] == status:
            rows.append(row)
    return rows


def require_period(db: Session, period_id: str) -> KpiPeriod:
    period = db.get(KpiPeriod, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Không tìm thấy kỳ báo cáo")
    return period


@router.get("/indicators")
def list_indicators(
    department_id: str | None = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(KpiIndicator).order_by(KpiIndicator.number)
    if active_only:
        query = query.where(KpiIndicator.is_active.is_(True))
    if department_id:
        query = query.where(KpiIndicator.department_id == department_id)
    return [indicator_dict(item) for item in db.scalars(query).all()]


@router.post("/indicators", status_code=201)
def create_indicator(payload: KpiIndicatorCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    require_department(db, payload.department_id)
    indicator = KpiIndicator(
        number=payload.number,
        name=payload.name.strip(),
        description=payload.description,
        department_id=payload.department_id,
        is_active=True,
    )
    db.add(indicator)
    db.commit()
    db.refresh(indicator)
    return indicator_dict(indicator)


@router.patch("/indicators/{indicator_id}")
def update_indicator(
    indicator_id: str,
    payload: KpiIndicatorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    indicator = db.get(KpiIndicator, indicator_id)
    if not indicator:
        raise HTTPException(status_code=404, detail="Không tìm thấy chỉ tiêu")
    changes = payload.model_dump(exclude_unset=True)
    if "department_id" in changes:
        require_department(db, changes["department_id"])
    if "name" in changes and changes["name"] is not None:
        changes["name"] = changes["name"].strip()
    for key, value in changes.items():
        setattr(indicator, key, value)
    db.commit()
    db.refresh(indicator)
    return indicator_dict(indicator)


@router.delete("/indicators/{indicator_id}")
def delete_indicator(indicator_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    indicator = db.get(KpiIndicator, indicator_id)
    if not indicator:
        raise HTTPException(status_code=404, detail="Không tìm thấy chỉ tiêu")
    indicator.is_active = False
    db.commit()
    db.refresh(indicator)
    return indicator_dict(indicator)


@router.get("/periods")
def list_periods(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    periods = db.scalars(select(KpiPeriod).order_by(KpiPeriod.year.desc(), KpiPeriod.month.desc())).all()
    return [period_dict(db, item) for item in periods]


@router.post("/periods", status_code=201)
def create_period(payload: KpiPeriodCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    duplicate = db.scalar(select(KpiPeriod).where(KpiPeriod.month == payload.month, KpiPeriod.year == payload.year))
    if duplicate:
        raise HTTPException(status_code=409, detail="Kỳ báo cáo tháng/năm này đã tồn tại")
    period = KpiPeriod(
        month=payload.month,
        year=payload.year,
        name=f"Tháng {payload.month}/{payload.year}",
        status="open",
        created_by=current_user.id,
    )
    db.add(period)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Kỳ báo cáo tháng/năm này đã tồn tại") from exc
    db.refresh(period)
    return period_dict(db, period)


@router.patch("/periods/{period_id}")
def update_period(period_id: str, payload: KpiPeriodUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    period = require_period(db, period_id)
    period.status = payload.status
    db.commit()
    db.refresh(period)
    return period_dict(db, period)


@router.delete("/periods/{period_id}")
def delete_period(period_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    period = require_period(db, period_id)
    db.execute(delete(KpiResult).where(KpiResult.period_id == period.id))
    db.delete(period)
    db.commit()
    return {"deleted": True}


@router.get("/periods/{period_id}/results")
def get_results(
    period_id: str,
    department_id: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_period(db, period_id)
    if status and status not in KPI_STATUS_LABELS:
        raise HTTPException(status_code=400, detail="Trạng thái KPI không hợp lệ")
    return result_rows(db, period_id, department_id, status)


@router.put("/periods/{period_id}/results")
def upsert_results(period_id: str, payload: KpiResultBatch, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    period = require_period(db, period_id)
    if period.status != "open":
        raise HTTPException(status_code=400, detail="Kỳ đã đóng, không thể nhập liệu")
    updated = 0
    for item in payload.results:
        indicator = db.get(KpiIndicator, item.indicator_id)
        if not indicator or not indicator.is_active:
            raise HTTPException(status_code=400, detail="Chỉ tiêu không hợp lệ hoặc đã ẩn")
        if not indicator.department_id:
            raise HTTPException(status_code=400, detail=f"Chỉ tiêu số {indicator.number} chưa được gán phòng ban")
        if indicator.department_id != item.department_id:
            raise HTTPException(status_code=400, detail=f"Phòng ban không khớp với chỉ tiêu số {indicator.number}")
        require_department(db, item.department_id)

        result = db.scalar(
            select(KpiResult).where(
                KpiResult.period_id == period.id,
                KpiResult.indicator_id == item.indicator_id,
                KpiResult.department_id == item.department_id,
            )
        )
        status = classify_kpi_status(item.percentage)
        note = item.note.strip() if item.note else None
        if result:
            result.percentage = item.percentage
            result.status = status
            result.note = note
            result.updated_by = current_user.id
        else:
            db.add(
                KpiResult(
                    period_id=period.id,
                    indicator_id=item.indicator_id,
                    department_id=item.department_id,
                    percentage=item.percentage,
                    status=status,
                    note=note,
                    updated_by=current_user.id,
                )
            )
        updated += 1
    db.commit()
    return {"updated": updated}


@router.get("/periods/{period_id}/summary")
def get_summary(period_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    period = require_period(db, period_id)
    rows = result_rows(db, period_id)
    summary = {status: 0 for status in KPI_STATUS_ORDER}
    for row in rows:
        summary[row["status"]] += 1
    return {
        "period_name": period.name,
        "total": len(rows),
        **summary,
        "report_text": build_kpi_report_text(period.name, rows),
    }


@router.get("/periods/{period_id}/chart-data")
def get_chart_data(
    period_id: str,
    mode: str = "indicator",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_period(db, period_id)
    rows = result_rows(db, period_id)
    if mode == "department":
        grouped: dict[str, dict] = {}
        for row in rows:
            dept = row["department"]
            if not dept:
                continue
            item = grouped.setdefault(dept["id"], {"name": dept["name"], "values": []})
            if row["percentage"] is not None:
                item["values"].append(row["percentage"])
        data = []
        for item in grouped.values():
            percentage = round(sum(item["values"]) / len(item["values"]), 2) if item["values"] else None
            status = classify_kpi_status(percentage)
            data.append({"name": item["name"], "percentage": percentage, "status": status})
        data.sort(key=lambda item: item["name"])
        return {"labels": [item["name"] for item in data], "data": data}
    if mode != "indicator":
        raise HTTPException(status_code=400, detail="Kiểu biểu đồ không hợp lệ")
    data = [{"name": row["indicator"]["name"], "percentage": row["percentage"], "status": row["status"]} for row in rows]
    return {"labels": [item["name"] for item in data], "data": data}
