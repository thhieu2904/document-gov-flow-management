import asyncio
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
import sys

from fastapi import HTTPException
from sqlalchemy import inspect, select, text

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.database import Base, get_engine, get_session_local
from app.core.storage import get_storage_provider
from app.core.security import hash_password
from app.kpi_utils import classify_kpi_status
from scripts.seed_kpi_indicators import SEED_INDICATORS
from scripts.seed_kpi_demo_data import MAY_2026_RESULTS
from app.models import (
    AssignmentReview,
    Department,
    Document,
    DocumentAssignment,
    DocumentAttachment,
    DocumentComment,
    KpiIndicator,
    KpiPeriod,
    KpiResult,
    Notification,
    SystemSetting,
    User,
    now_utc,
)

DEMO_PASSWORD = "password123"

@dataclass
class DemoFile:
    filename: str
    content_type: str
    content: bytes

    async def read(self) -> bytes:
        return self.content


def delete_existing_storage_files() -> None:
    engine = get_engine()
    inspector = inspect(engine)
    if "document_attachments" not in inspector.get_table_names():
        return
    with engine.begin() as conn:
        rows = conn.execute(text("SELECT storage_provider, storage_key FROM document_attachments")).all()
    for provider, key in rows:
        try:
            get_storage_provider(provider).delete(key)
        except Exception:
            pass


def reset_schema() -> None:
    delete_existing_storage_files()
    engine = get_engine()
    old_tables = [
        "kpi_results",
        "kpi_periods",
        "kpi_indicators",
        "assignment_reviews",
        "notifications",
        "email_logs",
        "system_settings",
        "document_history_logs",
        "document_attachments",
        "document_comments",
        "document_assignments",
        "documents",
        "users",
        "departments",
        "alembic_version",
    ]
    with engine.begin() as conn:
        for table in old_tables:
            conn.execute(text(f'DROP TABLE IF EXISTS "{table}" CASCADE'))
    Base.metadata.create_all(engine)


def add_user(db, *, email: str, full_name: str, role: str, department: Department | None, position: str) -> User:
    password_hash = hash_password(DEMO_PASSWORD) if settings.auth_provider == "local" else None
    user = User(
        supabase_user_id=None,
        password_hash=password_hash,
        email=email,
        full_name=full_name,
        role=role,
        department_id=department.id if department and role != "superadmin" else None,
        position_label=position,
        is_active=True,
        must_change_password=False,
    )
    db.add(user)
    db.flush()
    return user


async def save_file(filename: str, content: str, prefix: str) -> tuple[str, int, str]:
    mime_type = "text/plain"
    key, size = await get_storage_provider().save(DemoFile(filename, mime_type, content.encode("utf-8")), prefix)
    return key, size, mime_type


async def attach_text_file(db, doc: Document, uploader: User, filename: str, content: str, assignment: DocumentAssignment | None = None) -> None:
    key, size, mime = await save_file(filename, content, f"documents/{doc.id}")
    db.add(
        DocumentAttachment(
            document_id=doc.id,
            assignment_id=assignment.id if assignment else None,
            storage_provider=settings.storage_provider,
            storage_key=key,
            original_name=filename,
            mime_type=mime,
            size=size,
            uploaded_by=uploader.id,
        )
    )


def sync_doc_completion(doc: Document, assignments: list[DocumentAssignment]) -> None:
    if not assignments:
        doc.status = "draft"
        doc.completed_at = None
        return
    if all(item.status == "approved" for item in assignments):
        doc.status = "completed"
        doc.completed_at = max((item.completed_at for item in assignments if item.completed_at), default=now_utc())
        return
    if all(item.status in {"submitted", "approved"} for item in assignments) and any(item.status == "submitted" for item in assignments):
        doc.status = "submitted"
        doc.completed_at = None
        return
    doc.status = "in_progress"
    doc.completed_at = None


async def main_async() -> None:
    settings.validate_runtime()
    reset_schema()
    session_factory = get_session_local()
    now = now_utc()

    with session_factory() as db:
        # Departments
        dept_ops = Department(name="Phòng Vận hành", description="Nhóm xử lý văn bản", is_active=True)
        dept_finance = Department(name="Phòng Tài chính", description="Nhóm xử lý số liệu và báo cáo", is_active=True)
        dept_archive = Department(name="Phòng Lưu trữ", description="Phòng ban đã xóa mềm để kiểm tra filter", is_active=False)
        db.add_all([dept_ops, dept_finance, dept_archive])
        db.flush()

        # Users
        super_a = add_user(db, email="thhieu2904@gmail.com", full_name="Superadmin Thiệu", role="superadmin", department=None, position="Quản trị toàn hệ thống")
        super_b = add_user(db, email="nguyenvanquang.vms@gmail.com", full_name="Superadmin Quang", role="superadmin", department=None, position="Quản trị toàn hệ thống")
        manager_ops = add_user(db, email="quanly.vanhanh@example.com", full_name="Quản lý Vận hành", role="manager", department=dept_ops, position="Quản lý phòng")
        manager_finance = add_user(db, email="quanly.taichinh@example.com", full_name="Quản lý Tài chính", role="manager", department=dept_finance, position="Quản lý phòng")
        staff_a = add_user(db, email="nhanvien1@example.com", full_name="Demo Nhân viên 1", role="staff", department=dept_ops, position="Nhân viên xử lý")
        staff_b = add_user(db, email="nhanvien2@example.com", full_name="Demo Nhân viên 2", role="staff", department=dept_finance, position="Nhân viên tổng hợp")
        staff_c = add_user(db, email="nhanvien3@example.com", full_name="Demo Nhân viên 3", role="staff", department=dept_ops, position="Nhân viên kiểm tra")

        # System Settings
        db.add_all(
            [
                SystemSetting(key="staff_reminder_enabled", value="true"),
                SystemSetting(key="staff_reminder_time", value="08:00"),
                SystemSetting(key="staff_due_soon_days", value="3"),
                SystemSetting(key="staff_urgent_enabled", value="true"),
                SystemSetting(key="staff_overdue_enabled", value="true"),
                SystemSetting(key="manager_digest_enabled", value="true"),
                SystemSetting(key="manager_digest_time", value="16:30"),
                SystemSetting(key="manager_report_mode", value="weekly"),
                SystemSetting(key="manager_report_time", value="08:00"),
            ]
        )

        # KPI Setup
        indicators = []
        for number, name, description in SEED_INDICATORS:
            dept = dept_ops if number % 2 == 1 else dept_finance
            indicator = KpiIndicator(
                number=number,
                name=name,
                description=description,
                department_id=dept.id,
                is_active=True
            )
            db.add(indicator)
            indicators.append(indicator)
        db.flush()

        period_prev = KpiPeriod(month=(now.month - 1) or 12, year=now.year if now.month > 1 else now.year - 1, name=f"Tháng {(now.month - 1) or 12}/{now.year if now.month > 1 else now.year - 1}", status="closed", created_by=manager_ops.id)
        period_curr = KpiPeriod(month=now.month, year=now.year, name=f"Tháng {now.month}/{now.year}", status="open", created_by=manager_ops.id)
        db.add_all([period_prev, period_curr])
        db.flush()

        JUNE_2026_RESULTS = {
            1: (88.70, "Tổng sản lượng lúa cả năm, đạt 88,70%; tỷ lệ sản lượng lúa đặc sản, lúa chất lượng cao, đạt 68,11%; diện tích cây màu lương thực, thực phẩm và cây công nghiệp ngắn ngày, đạt 69,29%"),
            2: (100.44, "Tổng đàn gia súc, đạt 100,44% chỉ tiêu Nghị quyết; tổng đàn gia cầm, đạt 147,70% chỉ tiêu Nghị quyết"),
            3: (53.46, "Tổng sản lượng khai thác và nuôi trồng thủy sản, hải sản, đạt 53,46%"),
            4: (40.23, "Tổng thu ngân sách nhà nước, đạt 40,23%"),
            5: (0.0, None),
            6: (98.00, "Tỷ lệ người dân được sử dụng nước sạch theo quy chuẩn, đạt 98,72%; tỷ lệ rác thải sinh hoạt được thu gom và xử lý đúng quy định, đạt 104,66%"),
            7: (0.0, None),
            8: (0.0, None),
            9: (0.0, None),
            10: (0.0, None),
            11: (74.15, "Tỷ lệ lao động qua đào tạo có bằng cấp, chứng chỉ chưa đánh giá; giải quyết việc làm mới, đạt 74,15%"),
            12: (0.0, None),
            13: (40.00, "Trường đạt chuẩn quốc gia, đạt 40%"),
            14: (40.00, "Phấn đấu xóa nhà tạm, nhà dột nát, đạt 40%"),
            15: (81.36, "Tỷ lệ vận động người dân tham gia bảo hiểm y tế, đạt 100%; số lao động tham gia bảo hiểm xã hội, đạt 81,36%; tỷ lệ dân số được quản lý hồ sơ sức khoẻ và khám sức khoẻ định kỳ, đạt 71,53%"),
            16: (100.00, "Công tác tuyển chọn và gọi công dân nhập ngũ, đạt 100% chỉ tiêu trên giao"),
            17: (0.0, None),
            18: (None, None),
            19: (26.32, "Kết nạp đảng viên, đạt 26,32%"),
            20: (0.0, None),
            21: (None, None),
        }

        kpi_results_prev = []
        kpi_results_curr = []
        for indicator in indicators:
            percentage, note = MAY_2026_RESULTS.get(indicator.number, (None, None))
            updater_id = manager_ops.id if indicator.department_id == dept_ops.id else manager_finance.id
            kpi_results_prev.append(
                KpiResult(
                    period_id=period_prev.id,
                    indicator_id=indicator.id,
                    department_id=indicator.department_id,
                    percentage=percentage,
                    status=classify_kpi_status(percentage),
                    note=note,
                    updated_by=updater_id if percentage is not None else None
                )
            )

            curr_pct, curr_note = JUNE_2026_RESULTS.get(indicator.number, (None, None))
            kpi_results_curr.append(
                KpiResult(
                    period_id=period_curr.id,
                    indicator_id=indicator.id,
                    department_id=indicator.department_id,
                    percentage=curr_pct,
                    status=classify_kpi_status(curr_pct),
                    note=curr_note,
                    updated_by=updater_id if curr_pct is not None else None
                )
            )

        db.add_all(kpi_results_prev + kpi_results_curr)

        # Documents & Assignments
        def create_doc(code: str, title: str, department: Department, creator: User, issued_offset: int, due_offset: int, priority: str) -> Document:
            doc = Document(
                code=code,
                title=title,
                summary=f"Nội dung giao xử lý: {title}",
                issued_at=now + timedelta(days=issued_offset, hours=8),
                due_at=now + timedelta(days=due_offset, hours=17, minutes=30),
                priority=priority,
                status="draft",
                created_by=creator.id,
                department_id=department.id,
            )
            db.add(doc)
            db.flush()
            return doc

        docs: list[tuple[Document, list[DocumentAssignment]]] = []

        draft = create_doc("VB-001/QLVB", "Rà soát danh sách hồ sơ cần bổ sung", dept_ops, manager_ops, -1, 7, "normal")
        docs.append((draft, []))

        active = create_doc("VB-002/QLVB", "Tổng hợp báo cáo tiến độ xử lý hồ sơ tuần này", dept_ops, manager_ops, -2, 4, "high")
        active_assignments = [
            DocumentAssignment(document_id=active.id, assigned_by=manager_ops.id, assignee_id=staff_a.id, instruction="Tổng hợp phần hồ sơ vận hành.", due_at=active.due_at, priority="high", status="pending"),
            DocumentAssignment(document_id=active.id, assigned_by=manager_ops.id, assignee_id=staff_c.id, instruction="Kiểm tra lại file đính kèm.", due_at=active.due_at, priority="high", status="in_progress", started_at=now - timedelta(hours=3)),
        ]
        db.add_all(active_assignments)
        db.flush()
        sync_doc_completion(active, active_assignments)
        docs.append((active, active_assignments))

        partial = create_doc("VB-003/QLVB", "Kiểm tra file đính kèm của nhóm khách hàng A", dept_ops, manager_ops, -4, 2, "normal")
        partial_assignments = [
            DocumentAssignment(document_id=partial.id, assigned_by=manager_ops.id, assignee_id=staff_a.id, instruction="Kiểm tra file hợp đồng.", result_note="Đã kiểm tra xong file hợp đồng.", due_at=partial.due_at, priority="normal", status="submitted", started_at=now - timedelta(days=1), submitted_at=now - timedelta(hours=2)),
            DocumentAssignment(document_id=partial.id, assigned_by=manager_ops.id, assignee_id=staff_c.id, instruction="Kiểm tra file biên bản nghiệm thu.", due_at=partial.due_at, priority="normal", status="approved", started_at=now - timedelta(hours=4), submitted_at=now - timedelta(hours=2), completed_at=now - timedelta(hours=1)),
        ]
        db.add_all(partial_assignments)
        db.flush()
        sync_doc_completion(partial, partial_assignments)
        docs.append((partial, partial_assignments))

        due_soon = create_doc("VB-004/QLVB", "Chuẩn bị tài liệu họp nội bộ tháng này", dept_ops, manager_ops, -3, 1, "high")
        due_assignment = DocumentAssignment(document_id=due_soon.id, assigned_by=manager_ops.id, assignee_id=staff_c.id, instruction="Chuẩn bị tài liệu và danh sách tham dự.", due_at=due_soon.due_at, priority="high", status="pending")
        db.add(due_assignment)
        db.flush()
        sync_doc_completion(due_soon, [due_assignment])
        docs.append((due_soon, [due_assignment]))

        overdue = create_doc("VB-005/QLVB", "Hoàn thiện bảng đối chiếu số liệu còn thiếu", dept_finance, manager_finance, -7, -1, "urgent")
        overdue_assignment = DocumentAssignment(document_id=overdue.id, assigned_by=manager_finance.id, assignee_id=staff_b.id, instruction="Bổ sung số liệu đối chiếu còn thiếu.", due_at=overdue.due_at, priority="urgent", status="in_progress", started_at=now - timedelta(days=2))
        db.add(overdue_assignment)
        db.flush()
        sync_doc_completion(overdue, [overdue_assignment])
        docs.append((overdue, [overdue_assignment]))

        completed = create_doc("VB-006/QLVB", "Cập nhật biểu mẫu tiếp nhận văn bản", dept_ops, manager_ops, -10, -3, "normal")
        completed_assignment = DocumentAssignment(document_id=completed.id, assigned_by=manager_ops.id, assignee_id=staff_a.id, instruction="Cập nhật biểu mẫu theo mẫu mới.", result_note="Đã cập nhật và gửi file kết quả.", due_at=completed.due_at, priority="normal", status="approved", started_at=now - timedelta(days=5), submitted_at=now - timedelta(days=2), completed_at=now - timedelta(days=2))
        db.add(completed_assignment)
        db.flush()
        db.add(AssignmentReview(assignment_id=completed_assignment.id, reviewer_id=manager_ops.id, action="approved", note="Đã kiểm tra, đạt yêu cầu.", created_at=completed_assignment.completed_at))
        sync_doc_completion(completed, [completed_assignment])
        docs.append((completed, [completed_assignment]))

        # Comments and Notifications
        db.add_all([
            DocumentComment(document_id=active.id, assignment_id=active_assignments[1].id, user_id=staff_c.id, content="Đang rà soát file, sẽ nộp sớm."),
            DocumentComment(document_id=overdue.id, assignment_id=overdue_assignment.id, user_id=manager_finance.id, content="Nhắc nhở: Hạn chót đã qua, vui lòng nộp gấp!"),
        ])

        db.add_all([
            Notification(user_id=staff_a.id, document_id=active.id, assignment_id=active_assignments[0].id, title="Giao việc mới", message="Quản lý đã giao việc mới cho bạn.", is_read=False),
            Notification(user_id=staff_b.id, document_id=overdue.id, assignment_id=overdue_assignment.id, title="Công việc quá hạn", message="Văn bản đã quá hạn xử lý.", is_read=True),
        ])

        for doc, assignments in docs:
            uploader = manager_finance if doc.department_id == dept_finance.id else manager_ops
            await attach_text_file(db, doc, uploader, f"{doc.code.replace('/', '-')}_goc.txt", f"File gốc cho văn bản {doc.code}: {doc.title}")
            for assignment in assignments:
                if assignment.status in {"submitted", "approved"}:
                    assignee = db.get(User, assignment.assignee_id)
                    await attach_text_file(db, doc, assignee or uploader, f"{doc.code.replace('/', '-')}_ket_qua_{assignee.full_name if assignee else 'nhan_vien'}.txt", assignment.result_note or "File kết quả xử lý.", assignment)

        db.commit()

    print("Seeded superadmin/manager/staff demo data.")
    print("Included full KPI metrics, Documents, Assignments, Attachments, Comments and Notifications.")
    print(f"Password: {DEMO_PASSWORD}")
    print("Accounts: thhieu2904@gmail.com, nguyenvanquang.vms@gmail.com, quanly.vanhanh@example.com, quanly.taichinh@example.com, nhanvien1@example.com, nhanvien2@example.com, nhanvien3@example.com")


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
