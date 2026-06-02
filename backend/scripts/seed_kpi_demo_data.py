from pathlib import Path
import sys

from sqlalchemy import select

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.kpi_utils import classify_kpi_status
from app.core.database import get_session_local
from app.models import Department, KpiIndicator, KpiPeriod, KpiResult, User
from scripts.seed_kpi_indicators import SEED_INDICATORS


DEMO_DEPARTMENTS = [
    ("Văn phòng UBND", "Theo dõi tổng hợp và hành chính"),
    ("Phòng Kinh tế", "Theo dõi nông nghiệp, kinh tế và ngân sách"),
    ("Phòng Văn hóa - Xã hội", "Theo dõi giáo dục, y tế, lao động và an sinh"),
]


def ensure_manager(db) -> User:
    manager = db.scalar(select(User).where(User.role == "manager", User.is_active.is_(True)).order_by(User.created_at))
    if not manager:
        raise RuntimeError("Không tìm thấy tài khoản manager đang hoạt động để gán created_by cho kỳ KPI.")
    return manager


def ensure_departments(db) -> list[Department]:
    departments = db.scalars(select(Department).where(Department.is_active.is_(True), Department.name != "Quản lý").order_by(Department.name)).all()
    if departments:
        return departments
    created = []
    for name, description in DEMO_DEPARTMENTS:
        dept = Department(name=name, description=description, is_active=True)
        db.add(dept)
        created.append(dept)
    db.flush()
    return created


def ensure_indicators(db, departments: list[Department]) -> list[KpiIndicator]:
    existing = {item.number: item for item in db.scalars(select(KpiIndicator)).all()}
    for number, name, description in SEED_INDICATORS:
        indicator = existing.get(number)
        if not indicator:
            indicator = KpiIndicator(number=number, name=name, description=description, is_active=True)
            db.add(indicator)
            db.flush()
            existing[number] = indicator
        indicator.name = name
        indicator.description = description
        indicator.is_active = True
        if not indicator.department_id:
            indicator.department_id = departments[(number - 1) % len(departments)].id
    db.flush()
    return [existing[number] for number, _, _ in SEED_INDICATORS]


def ensure_period(db, month: int, year: int, manager: User) -> KpiPeriod:
    period = db.scalar(select(KpiPeriod).where(KpiPeriod.month == month, KpiPeriod.year == year))
    if period:
        return period
    period = KpiPeriod(month=month, year=year, name=f"Tháng {month}/{year}", status="open", created_by=manager.id)
    db.add(period)
    db.flush()
    return period


MAY_2026_RESULTS: dict[int, tuple[float | None, str | None]] = {
    1: (88.70, "Tổng sản lượng lúa cả năm, đạt 88,70%; tỷ lệ sản lượng lúa đặc sản, lúa chất lượng cao, đạt 68,11%; diện tích cây màu lương thực, thực phẩm và cây công nghiệp ngắn ngày, đạt 69,29%"),
    2: (100.44, "Tổng đàn gia súc, đạt 100,44% chỉ tiêu Nghị quyết; tổng đàn gia cầm, đạt 147,70% chỉ tiêu Nghị quyết"),
    3: (53.46, "Tổng sản lượng khai thác và nuôi trồng thủy sản, hải sản, đạt 53,46%"),
    4: (40.23, "Tổng thu ngân sách nhà nước, đạt 40,23%"),
    5: (None, None),
    6: (98.72, "Tỷ lệ người dân được sử dụng nước sạch theo quy chuẩn, đạt 98,72%; tỷ lệ rác thải sinh hoạt được thu gom và xử lý đúng quy định, đạt 104,66%"),
    7: (None, None),
    8: (None, None),
    9: (None, None),
    10: (None, None),
    11: (74.15, "Tỷ lệ lao động qua đào tạo có bằng cấp, chứng chỉ chưa đánh giá; giải quyết việc làm mới, đạt 74,15%"),
    12: (None, None),
    13: (40.00, "Trường đạt chuẩn quốc gia, đạt 40%"),
    14: (40.00, "Phấn đấu xóa nhà tạm, nhà dột nát, đạt 40%"),
    15: (81.36, "Tỷ lệ vận động người dân tham gia bảo hiểm y tế, đạt 100%; số lao động tham gia bảo hiểm xã hội, đạt 81,36%; tỷ lệ dân số được quản lý hồ sơ sức khoẻ và khám sức khoẻ định kỳ, đạt 71,53%"),
    16: (100.00, "Công tác tuyển chọn và gọi công dân nhập ngũ, đạt 100% chỉ tiêu trên giao"),
    17: (None, None),
    18: (None, None),
    19: (26.32, "Kết nạp đảng viên, đạt 26,32%"),
    20: (None, None),
    21: (None, None),
}


def upsert_results(db, period: KpiPeriod, indicators: list[KpiIndicator], manager: User) -> tuple[int, int]:
    created = 0
    updated = 0
    for indicator in indicators:
        if not indicator.department_id:
            continue
        percentage, note = MAY_2026_RESULTS.get(indicator.number, (None, None))
        status = classify_kpi_status(percentage)
        result = db.scalar(
            select(KpiResult).where(
                KpiResult.period_id == period.id,
                KpiResult.indicator_id == indicator.id,
                KpiResult.department_id == indicator.department_id,
            )
        )
        if result:
            result.percentage = percentage
            result.status = status
            result.note = note
            result.updated_by = manager.id
            updated += 1
        else:
            db.add(
                KpiResult(
                    period_id=period.id,
                    indicator_id=indicator.id,
                    department_id=indicator.department_id,
                    percentage=percentage,
                    status=status,
                    note=note,
                    updated_by=manager.id,
                )
            )
            created += 1
    return created, updated


def main() -> None:
    db = get_session_local()()
    try:
        manager = ensure_manager(db)
        departments = ensure_departments(db)
        indicators = ensure_indicators(db, departments)
        period = ensure_period(db, 5, 2026, manager)
        created_total = 0
        updated_total = 0
        created, updated = upsert_results(db, period, indicators, manager)
        created_total += created
        updated_total += updated
        db.commit()
        print(
            "KPI monthly demo data ready: "
            f"period={period.name}, "
            f"indicators={len(indicators)}, results_created={created_total}, results_updated={updated_total}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
