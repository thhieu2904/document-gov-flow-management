import asyncio
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
import sys

from fastapi import HTTPException
from sqlalchemy import inspect, select, text

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.auth_provider import get_auth_provider
from app.core.config import settings
from app.core.database import Base, get_engine, get_session_local
from app.core.storage import get_storage_provider
from app.models import Department, Document, DocumentAssignment, DocumentAttachment, SystemSetting, User, now_utc


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


def ensure_auth_user(auth_provider, db, email: str) -> str | None:
    try:
        return auth_provider.create_user(db, email, DEMO_PASSWORD)
    except Exception:
        try:
            return auth_provider.login(db, email, DEMO_PASSWORD).supabase_user_id
        except HTTPException:
            return None


def add_user(db, auth_provider, *, email: str, full_name: str, role: str, department: Department | None, position: str) -> User:
    user = User(
        supabase_user_id=ensure_auth_user(auth_provider, db, email),
        email=email,
        full_name=full_name,
        role=role,
        department_id=department.id if department and role == "staff" else None,
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
        return
    if all(item.status == "completed" for item in assignments):
        doc.status = "completed"
        doc.completed_at = max((item.completed_at for item in assignments if item.completed_at), default=now_utc())
        return
    doc.status = "in_progress"


async def main_async() -> None:
    settings.validate_runtime()
    reset_schema()
    auth_provider = get_auth_provider()
    session_factory = get_session_local()
    now = now_utc()

    with session_factory() as db:
        dept_ops = Department(name="Phòng Vận hành", description="Nhóm nhân viên xử lý văn bản", is_active=True)
        dept_finance = Department(name="Phòng Tài chính", description="Nhóm xử lý số liệu và báo cáo", is_active=True)
        dept_archive = Department(name="Phòng Lưu trữ", description="Phòng ban đã xóa mềm để kiểm tra filter", is_active=False)
        db.add_all([dept_ops, dept_finance, dept_archive])
        db.flush()

        manager = add_user(db, auth_provider, email="manager@example.com", full_name="Demo Quản lý", role="manager", department=None, position="Quản lý")
        staff_a = add_user(db, auth_provider, email="nhanvien1@example.com", full_name="Demo Nhân viên 1", role="staff", department=dept_ops, position="Nhân viên xử lý")
        staff_b = add_user(db, auth_provider, email="nhanvien2@example.com", full_name="Demo Nhân viên 2", role="staff", department=dept_finance, position="Nhân viên tổng hợp")
        staff_c = add_user(db, auth_provider, email="nhanvien3@example.com", full_name="Demo Nhân viên 3", role="staff", department=dept_ops, position="Nhân viên kiểm tra")

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

        def create_doc(code: str, title: str, department: Department, issued_offset: int, due_offset: int, priority: str) -> Document:
            doc = Document(
                code=code,
                title=title,
                summary=f"Nội dung giao xử lý: {title}",
                issued_at=now + timedelta(days=issued_offset, hours=8),
                due_at=now + timedelta(days=due_offset, hours=17, minutes=30),
                priority=priority,
                status="draft",
                created_by=manager.id,
                department_id=department.id,
            )
            db.add(doc)
            db.flush()
            return doc

        docs: list[tuple[Document, list[DocumentAssignment]]] = []

        draft = create_doc("VB-001/QLVB", "Rà soát danh sách hồ sơ cần bổ sung", dept_ops, -1, 7, "normal")
        docs.append((draft, []))

        active = create_doc("VB-002/QLVB", "Tổng hợp báo cáo tiến độ xử lý hồ sơ tuần này", dept_finance, -2, 4, "high")
        active_assignments = [
            DocumentAssignment(document_id=active.id, assigned_by=manager.id, assignee_id=staff_a.id, instruction="Tổng hợp phần hồ sơ vận hành.", due_at=active.due_at, priority="high", status="pending"),
            DocumentAssignment(document_id=active.id, assigned_by=manager.id, assignee_id=staff_b.id, instruction="Tổng hợp phần số liệu tài chính.", due_at=active.due_at, priority="high", status="in_progress", started_at=now - timedelta(hours=3)),
        ]
        db.add_all(active_assignments)
        db.flush()
        sync_doc_completion(active, active_assignments)
        docs.append((active, active_assignments))

        partial = create_doc("VB-003/QLVB", "Kiểm tra file đính kèm của nhóm khách hàng A", dept_ops, -4, 2, "normal")
        partial_assignments = [
            DocumentAssignment(document_id=partial.id, assigned_by=manager.id, assignee_id=staff_a.id, instruction="Kiểm tra file hợp đồng.", result_note="Đã kiểm tra xong file hợp đồng.", due_at=partial.due_at, priority="normal", status="completed", started_at=now - timedelta(days=1), submitted_at=now - timedelta(hours=2), completed_at=now - timedelta(hours=2)),
            DocumentAssignment(document_id=partial.id, assigned_by=manager.id, assignee_id=staff_c.id, instruction="Kiểm tra file biên bản nghiệm thu.", due_at=partial.due_at, priority="normal", status="in_progress", started_at=now - timedelta(hours=4)),
        ]
        db.add_all(partial_assignments)
        db.flush()
        sync_doc_completion(partial, partial_assignments)
        docs.append((partial, partial_assignments))

        due_soon = create_doc("VB-004/QLVB", "Chuẩn bị tài liệu họp nội bộ tháng này", dept_ops, -3, 1, "high")
        due_assignment = DocumentAssignment(document_id=due_soon.id, assigned_by=manager.id, assignee_id=staff_c.id, instruction="Chuẩn bị tài liệu và danh sách tham dự.", due_at=due_soon.due_at, priority="high", status="pending")
        db.add(due_assignment)
        db.flush()
        sync_doc_completion(due_soon, [due_assignment])
        docs.append((due_soon, [due_assignment]))

        overdue = create_doc("VB-005/QLVB", "Hoàn thiện bảng đối chiếu số liệu còn thiếu", dept_finance, -7, -1, "urgent")
        overdue_assignment = DocumentAssignment(document_id=overdue.id, assigned_by=manager.id, assignee_id=staff_b.id, instruction="Bổ sung số liệu đối chiếu còn thiếu.", due_at=overdue.due_at, priority="urgent", status="in_progress", started_at=now - timedelta(days=2))
        db.add(overdue_assignment)
        db.flush()
        sync_doc_completion(overdue, [overdue_assignment])
        docs.append((overdue, [overdue_assignment]))

        completed = create_doc("VB-006/QLVB", "Cập nhật biểu mẫu tiếp nhận văn bản", dept_ops, -10, -3, "normal")
        completed_assignment = DocumentAssignment(document_id=completed.id, assigned_by=manager.id, assignee_id=staff_a.id, instruction="Cập nhật biểu mẫu theo mẫu mới.", result_note="Đã cập nhật và gửi file kết quả.", due_at=completed.due_at, priority="normal", status="completed", started_at=now - timedelta(days=5), submitted_at=now - timedelta(days=2), completed_at=now - timedelta(days=2))
        db.add(completed_assignment)
        db.flush()
        sync_doc_completion(completed, [completed_assignment])
        docs.append((completed, [completed_assignment]))

        for doc, assignments in docs:
            await attach_text_file(db, doc, manager, f"{doc.code.replace('/', '-')}_goc.txt", f"File gốc cho văn bản {doc.code}: {doc.title}")
            for assignment in assignments:
                if assignment.status == "completed":
                    assignee = db.get(User, assignment.assignee_id)
                    await attach_text_file(db, doc, assignee or manager, f"{doc.code.replace('/', '-')}_ket_qua_{assignee.full_name if assignee else 'nhan_vien'}.txt", assignment.result_note or "File kết quả xử lý.", assignment)

        db.commit()

    print("Seeded simplified manager/nhan vien demo data.")
    print(f"Password: {DEMO_PASSWORD}")
    print("Accounts: manager@example.com, nhanvien1@example.com, nhanvien2@example.com, nhanvien3@example.com")


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
