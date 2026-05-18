import asyncio
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import sys

from fastapi import HTTPException
from sqlalchemy import delete, select

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.auth_provider import get_auth_provider
from app.core.config import settings
from app.core.database import get_session_local
from app.core.schema import ensure_runtime_schema
from app.core.storage import get_storage_provider
from app.models import (
    Department,
    Document,
    DocumentAssignment,
    DocumentAttachment,
    DocumentComment,
    DocumentHistoryLog,
    Notification,
    User,
)


DEMO_PASSWORD = "password123"
LEGACY_DEMO_EMAILS = {"thhieu2904@gmail.com"}


@dataclass
class DemoFile:
    filename: str
    content_type: str
    content: bytes

    async def read(self) -> bytes:
        return self.content


def now(days: int = 0, hours: int = 0, minutes: int = 0) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days, hours=hours, minutes=minutes)


def ensure_department(db, *, name: str, unit_type: str, description: str | None = None) -> Department:
    dept = db.scalar(select(Department).where(Department.name == name))
    if dept:
        dept.unit_type = unit_type
        dept.description = description
        dept.is_active = True
        return dept
    dept = Department(name=name, unit_type=unit_type, description=description, is_active=True)
    db.add(dept)
    db.flush()
    return dept


def ensure_user(
    db,
    auth_provider,
    *,
    email: str,
    full_name: str,
    role: str,
    department_id: str | None,
    position_label: str,
) -> User:
    email = email.lower()
    user = db.scalar(select(User).where(User.email == email))
    supabase_user_id = user.supabase_user_id if user else None

    if not supabase_user_id:
        try:
            supabase_user_id = auth_provider.create_user(db, email, DEMO_PASSWORD)
        except Exception:
            try:
                supabase_user_id = auth_provider.login(db, email, DEMO_PASSWORD).supabase_user_id
            except HTTPException:
                supabase_user_id = None

    if user:
        user.supabase_user_id = supabase_user_id or user.supabase_user_id
        user.full_name = full_name
        user.role = role
        user.department_id = department_id
        user.position_label = position_label
        user.is_active = True
        user.must_change_password = False
        return user

    user = User(
        supabase_user_id=supabase_user_id,
        full_name=full_name,
        email=email,
        password_hash=None,
        role=role,
        department_id=department_id,
        position_label=position_label,
        is_active=True,
        must_change_password=False,
    )
    db.add(user)
    db.flush()
    return user


def add_history(
    db,
    *,
    document_id: str,
    user_id: str,
    action_type: str,
    description: str,
    assignment_id: str | None = None,
    created_at: datetime | None = None,
) -> None:
    db.add(
        DocumentHistoryLog(
            document_id=document_id,
            assignment_id=assignment_id,
            user_id=user_id,
            action_type=action_type,
            description=description,
            extra=None,
            created_at=created_at or now(),
        )
    )


def add_assignment(
    db,
    *,
    document_id: str,
    sender: User,
    receiver_user: User | None = None,
    receiver_department: Department | None = None,
    parent_id: str | None = None,
    role: str = "primary",
    status: str = "pending",
    action_type: str = "forward",
    instruction: str | None = None,
    due_date: date | None = None,
    priority: str = "normal",
    pending_at: datetime | None = None,
    started_at: datetime | None = None,
    completed_at: datetime | None = None,
    returned_at: datetime | None = None,
    viewed_at: datetime | None = None,
) -> DocumentAssignment:
    assignment = DocumentAssignment(
        document_id=document_id,
        parent_assignment_id=parent_id,
        sender_user_id=sender.id,
        sender_department_id=sender.department_id,
        receiver_user_id=receiver_user.id if receiver_user else None,
        receiver_department_id=receiver_department.id if receiver_department else None,
        assignment_role=role,
        status=status,
        action_type=action_type,
        instruction=instruction,
        priority=priority,
        due_date=due_date,
        pending_at=pending_at,
        started_at=started_at,
        completed_at=completed_at,
        returned_at=returned_at,
        viewed_at=viewed_at,
    )
    db.add(assignment)
    db.flush()
    add_history(
        db,
        document_id=document_id,
        assignment_id=assignment.id,
        user_id=sender.id,
        action_type=action_type,
        description=instruction or action_type,
        created_at=pending_at or started_at or completed_at,
    )
    return assignment


def add_document(
    db,
    *,
    document_type: str,
    title: str,
    code: str | None,
    arrival_number: str | None,
    issuing_agency: str | None,
    content: str,
    document_date: date,
    received_date: date | None = None,
    issued_date: date | None = None,
    due_date: date | None = None,
    priority: str = "normal",
    status: str,
    created_by: User,
    owner_department: Department,
    completed_at: datetime | None = None,
    archived_at: datetime | None = None,
) -> Document:
    doc = Document(
        document_type=document_type,
        title=title,
        code=code,
        arrival_number=arrival_number,
        issuing_agency=issuing_agency,
        content=content,
        document_date=document_date,
        received_date=received_date,
        issued_date=issued_date,
        due_date=due_date,
        priority=priority,
        status=status,
        created_by=created_by.id,
        owner_department_id=owner_department.id,
        completed_at=completed_at,
        archived_at=archived_at,
    )
    db.add(doc)
    db.flush()
    add_history(
        db,
        document_id=doc.id,
        user_id=created_by.id,
        action_type="outgoing_draft" if document_type == "outgoing" else "incoming_register",
        description="Tạo dữ liệu demo" if document_type == "outgoing" else "Vào sổ văn bản đến demo",
    )
    return doc


async def save_demo_file(filename: str, text: str, prefix: str) -> tuple[str, int, str]:
    provider = get_storage_provider()
    suffix = Path(filename).suffix.lower()
    mime_type = {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".md": "text/markdown",
        ".txt": "text/plain",
    }.get(suffix, "application/octet-stream")
    storage_key, size = await provider.save(DemoFile(filename=filename, content_type=mime_type, content=text.encode("utf-8")), prefix)
    return storage_key, size, mime_type


def add_attachment(
    db,
    *,
    document_id: str,
    uploaded_by: User,
    filename: str,
    storage_key: str,
    size: int,
    mime_type: str,
    assignment_id: str | None = None,
) -> DocumentAttachment:
    attachment = DocumentAttachment(
        document_id=document_id,
        assignment_id=assignment_id,
        storage_provider=settings.storage_provider,
        storage_key=storage_key,
        original_name=filename,
        mime_type=mime_type,
        size=size,
        uploaded_by=uploaded_by.id,
    )
    db.add(attachment)
    db.flush()
    add_history(
        db,
        document_id=document_id,
        assignment_id=assignment_id,
        user_id=uploaded_by.id,
        action_type="file_upload",
        description=f"Tai file mau: {filename}",
    )
    return attachment


def clear_demo_documents(db) -> None:
    for model in [Notification, DocumentHistoryLog, DocumentAttachment, DocumentComment, DocumentAssignment, Document]:
        db.execute(delete(model))
    db.commit()


def clear_legacy_demo_users(db) -> None:
    db.execute(delete(User).where(User.email.in_(LEGACY_DEMO_EMAILS)))
    db.commit()


async def main_async() -> None:
    settings.validate_runtime()
    ensure_runtime_schema()
    session_factory = get_session_local()
    auth_provider = get_auth_provider()

    with session_factory() as db:
        clear_demo_documents(db)
        clear_legacy_demo_users(db)

        ubnd = ensure_department(db, name="UBND Xã Long Phú", unit_type="parent_unit", description="Cấp lãnh đạo Ủy ban")
        hcc = ensure_department(
            db,
            name="Trung tâm phục vụ hành chính công - UBND X.Long Phú",
            unit_type="parent_unit",
            description="Nơi văn thư tiếp nhận, vào sổ và phát hành văn bản",
        )
        office = ensure_department(db, name="Văn phòng HĐND và UBND", unit_type="department")
        economy = ensure_department(db, name="Phòng Kinh tế - UBND X.Long Phú", unit_type="department")
        culture = ensure_department(db, name="Phòng Văn hóa - Xã hội - UBND X.Long Phú", unit_type="department")
        health = ensure_department(db, name="Trạm y tế xã Long Phú", unit_type="department")
        service = ensure_department(db, name="Trung tâm Dịch vụ tổng hợp xã Long Phú", unit_type="department")

        users = {
            "admin": ensure_user(
                db,
                auth_provider,
                email="admin@example.com",
                full_name="Demo Admin",
                role="admin",
                department_id=hcc.id,
                position_label="Quản trị",
            ),
            "vanthu": ensure_user(
                db,
                auth_provider,
                email="vanthu@example.com",
                full_name="Demo Văn thư",
                role="clerk",
                department_id=hcc.id,
                position_label="Văn thư",
            ),
            "chanhvp": ensure_user(
                db,
                auth_provider,
                email="chanhvp@example.com",
                full_name="Demo Chánh Văn phòng",
                role="manager",
                department_id=office.id,
                position_label="Chánh Văn phòng",
            ),
            "lanhdao": ensure_user(
                db,
                auth_provider,
                email="lanhdao@example.com",
                full_name="Demo Lãnh đạo",
                role="manager",
                department_id=ubnd.id,
                position_label="Phó Chủ tịch",
            ),
            "vanthu_phong": ensure_user(
                db,
                auth_provider,
                email="vanthu.phong@example.com",
                full_name="Demo Văn thư phòng",
                role="clerk",
                department_id=economy.id,
                position_label="Văn thư phòng",
            ),
            "truongphong": ensure_user(
                db,
                auth_provider,
                email="truongphong@example.com",
                full_name="Demo Trưởng phòng",
                role="manager",
                department_id=economy.id,
                position_label="Lãnh đạo phòng",
            ),
            "chuyenvien": ensure_user(
                db,
                auth_provider,
                email="chuyenvien@example.com",
                full_name="Demo Chuyên viên",
                role="staff",
                department_id=economy.id,
                position_label="Chuyên viên",
            ),
            "phoihop": ensure_user(
                db,
                auth_provider,
                email="phoihop@example.com",
                full_name="Demo Phối hợp",
                role="staff",
                department_id=culture.id,
                position_label="Chuyên viên phối hợp",
            ),
            "xemdebiet": ensure_user(
                db,
                auth_provider,
                email="xemdebiet@example.com",
                full_name="Demo Xem để biết",
                role="staff",
                department_id=health.id,
                position_label="Người xem để biết",
            ),
            "vanthu_vanhoa": ensure_user(
                db,
                auth_provider,
                email="vanthu.vanhoa@example.com",
                full_name="Demo Văn thư Văn hóa",
                role="clerk",
                department_id=culture.id,
                position_label="Văn thư phòng",
            ),
            "truong_vanhoa": ensure_user(
                db,
                auth_provider,
                email="truong.vanhoa@example.com",
                full_name="Demo Trưởng phòng Văn hóa",
                role="manager",
                department_id=culture.id,
                position_label="Lãnh đạo phòng",
            ),
            "vanthu_yte": ensure_user(
                db,
                auth_provider,
                email="vanthu.yte@example.com",
                full_name="Demo Văn thư Y tế",
                role="clerk",
                department_id=health.id,
                position_label="Văn thư đơn vị",
            ),
            "vanthu_dichvu": ensure_user(
                db,
                auth_provider,
                email="vanthu.dichvu@example.com",
                full_name="Demo Văn thư Dịch vụ",
                role="clerk",
                department_id=service.id,
                position_label="Văn thư đơn vị",
            ),
        }

        incoming = Document(
            document_type="incoming",
            title="Kế hoạch triển khai tham gia các lớp bồi dưỡng chuyển đổi số cho cán bộ, công chức, viên chức năm 2026",
            code="75/KH/ĐU",
            arrival_number="2058",
            issuing_agency="Đảng uỷ xã Long Phú",
            content="Văn bản yêu cầu rà soát và cử cán bộ tham gia các lớp bồi dưỡng chuyển đổi số.",
            document_date=date(2026, 5, 12),
            received_date=date(2026, 5, 13),
            due_date=date(2026, 5, 20),
            priority="normal",
            status="in_progress",
            created_by=users["vanthu"].id,
            owner_department_id=hcc.id,
        )
        db.add(incoming)
        db.flush()
        add_history(db, document_id=incoming.id, user_id=users["vanthu"].id, action_type="incoming_register", description="Vào sổ văn bản đến")

        a1 = add_assignment(
            db,
            document_id=incoming.id,
            sender=users["vanthu"],
            receiver_user=users["chanhvp"],
            role="primary",
            status="completed",
            action_type="incoming_register",
            instruction="Thao tác: Vào sổ, trình Chánh Văn phòng kiểm tra.",
            due_date=date(2026, 5, 14),
            pending_at=now(-2),
            started_at=now(-2, minutes=2),
            completed_at=now(-2, minutes=5),
        )
        a2 = add_assignment(
            db,
            document_id=incoming.id,
            parent_id=a1.id,
            sender=users["chanhvp"],
            receiver_user=users["lanhdao"],
            role="primary",
            status="completed",
            action_type="advise",
            instruction="- TRÌNH CT, PCT. Tham mưu lãnh đạo xem xét giao phòng chuyên môn.",
            due_date=date(2026, 5, 14),
            pending_at=now(-2, hours=1),
            started_at=now(-2, hours=1, minutes=5),
            completed_at=now(-2, hours=1, minutes=12),
        )
        a3 = add_assignment(
            db,
            document_id=incoming.id,
            parent_id=a2.id,
            sender=users["lanhdao"],
            receiver_department=economy,
            role="primary",
            status="in_progress",
            action_type="direct",
            instruction="Giao Phòng Kinh tế chủ trì tham mưu xử lý, phối hợp các đơn vị liên quan.",
            due_date=date(2026, 5, 20),
            pending_at=now(-1, hours=-8),
            started_at=now(-1, hours=-7),
        )
        a4 = add_assignment(
            db,
            document_id=incoming.id,
            parent_id=a3.id,
            sender=users["vanthu_phong"],
            receiver_user=users["truongphong"],
            role="primary",
            status="in_progress",
            action_type="forward",
            instruction="Văn thư phòng tiếp nhận và chuyển lãnh đạo phòng phân công xử lý.",
            due_date=date(2026, 5, 19),
            pending_at=now(-1, hours=-6),
            started_at=now(-1, hours=-5),
        )
        a5 = add_assignment(
            db,
            document_id=incoming.id,
            parent_id=a4.id,
            sender=users["truongphong"],
            receiver_user=users["chuyenvien"],
            role="primary",
            status="in_progress",
            action_type="assign",
            instruction="Chủ trì tổng hợp danh sách, tham mưu báo cáo kết quả trước hạn.",
            due_date=date(2026, 5, 18),
            pending_at=now(-1, hours=-4),
            started_at=now(-1, hours=-3),
        )
        add_assignment(
            db,
            document_id=incoming.id,
            parent_id=a4.id,
            sender=users["truongphong"],
            receiver_user=users["phoihop"],
            receiver_department=culture,
            role="collaborator",
            status="pending",
            action_type="assign",
            instruction="Phối hợp cung cấp thông tin liên quan hoạt động chuyển đổi số.",
            due_date=date(2026, 5, 18),
            priority="normal",
            pending_at=now(-1, hours=-4),
        )
        add_assignment(
            db,
            document_id=incoming.id,
            parent_id=a4.id,
            sender=users["truongphong"],
            receiver_department=service,
            role="collaborator",
            status="pending",
            action_type="assign",
            instruction="Phối hợp rà soát thông tin phục vụ hành chính công.",
            due_date=date(2026, 5, 18),
            pending_at=now(-1, hours=-4),
        )
        add_assignment(
            db,
            document_id=incoming.id,
            parent_id=a4.id,
            sender=users["truongphong"],
            receiver_user=users["xemdebiet"],
            receiver_department=health,
            role="informed",
            status="completed",
            action_type="forward",
            instruction="Xem để biết và phối hợp khi có yêu cầu.",
            pending_at=now(-1, hours=-4),
            started_at=now(-1, hours=-4, minutes=20),
            completed_at=now(-1, hours=-4, minutes=22),
        )

        db.add(
            DocumentComment(
                document_id=incoming.id,
                assignment_id=a5.id,
                user_id=users["chuyenvien"].id,
                content="Đã tiếp nhận, đang tổng hợp danh sách cán bộ và kiểm tra hạn phản hồi.",
            )
        )

        outgoing = Document(
            document_type="outgoing",
            title="Báo cáo công tác thực hành tiết kiệm, chống lãng phí 6 tháng đầu năm 2026",
            code="09/BC-TTHC",
            arrival_number="PH-09",
            issuing_agency="Trung tâm phục vụ hành chính công",
            content="Báo cáo tổng hợp kết quả thực hành tiết kiệm, chống lãng phí trong 6 tháng đầu năm.",
            document_date=date(2026, 5, 11),
            issued_date=date(2026, 5, 11),
            due_date=date(2026, 5, 11),
            priority="normal",
            status="issued",
            created_by=users["vanthu"].id,
            owner_department_id=hcc.id,
            completed_at=now(-4),
        )
        db.add(outgoing)
        db.flush()
        add_history(db, document_id=outgoing.id, user_id=users["vanthu"].id, action_type="outgoing_draft", description="Tạo dự thảo văn bản đi")
        o1 = add_assignment(
            db,
            document_id=outgoing.id,
            sender=users["vanthu"],
            receiver_user=users["lanhdao"],
            role="primary",
            status="completed",
            action_type="submit_signature",
            instruction="Kính trình lãnh đạo ký duyệt ban hành văn bản.",
            due_date=date(2026, 5, 4),
            pending_at=now(-12),
            started_at=now(-12, minutes=10),
            completed_at=now(-12, minutes=15),
        )
        o2 = add_assignment(
            db,
            document_id=outgoing.id,
            parent_id=o1.id,
            sender=users["lanhdao"],
            receiver_user=users["vanthu"],
            role="primary",
            status="completed",
            action_type="approve_signature",
            instruction="Đã ký duyệt, chuyển văn thư phát hành.",
            due_date=date(2026, 5, 11),
            pending_at=now(-5),
            started_at=now(-5, minutes=8),
            completed_at=now(-5, minutes=10),
        )
        add_assignment(
            db,
            document_id=outgoing.id,
            parent_id=o2.id,
            sender=users["vanthu"],
            receiver_department=economy,
            role="informed",
            status="completed",
            action_type="issue",
            instruction="Đã phát hành văn bản đến các đơn vị liên quan.",
            pending_at=now(-5, minutes=20),
            started_at=now(-5, minutes=25),
            completed_at=now(-5, minutes=30),
        )

        overdue = Document(
            document_type="incoming",
            title="V/v khẩn trương báo cáo thực trạng hoạt động của Trạm Y tế xã, phường",
            code="157/GM-SNV",
            arrival_number="2042",
            issuing_agency="Sở Nội vụ Tp. Cần Thơ",
            content="Văn bản cần phản hồi gấp, dùng để demo trạng thái quá hạn ở màn hình tiến độ.",
            document_date=date(2026, 5, 12),
            received_date=date(2026, 5, 12),
            due_date=date(2026, 5, 14),
            priority="high",
            status="in_progress",
            created_by=users["vanthu"].id,
            owner_department_id=hcc.id,
        )
        db.add(overdue)
        db.flush()
        add_history(db, document_id=overdue.id, user_id=users["vanthu"].id, action_type="incoming_register", description="Vào sổ văn bản quá hạn mẫu")
        add_assignment(
            db,
            document_id=overdue.id,
            sender=users["lanhdao"],
            receiver_user=users["chuyenvien"],
            receiver_department=economy,
            role="primary",
            status="in_progress",
            action_type="direct",
            instruction="Khẩn trương tổng hợp báo cáo thực trạng, đã quá hạn cần xử lý ngay.",
            due_date=date(2026, 5, 14),
            priority="high",
            pending_at=now(-3),
            started_at=now(-2),
        )

        paper_waiting = add_document(
            db,
            document_type="incoming",
            title="Giấy mời họp giao ban công tác cải cách hành chính tuần 21",
            code="42/GM-UBND",
            arrival_number="2061",
            issuing_agency="UBND xã Long Phú",
            content="Văn bản giấy vừa nhập, chưa giao xử lý để demo mục Chờ giao.",
            document_date=date(2026, 5, 16),
            received_date=date(2026, 5, 16),
            due_date=date(2026, 5, 17),
            priority="normal",
            status="received",
            created_by=users["vanthu"],
            owner_department=hcc,
        )
        paper_urgent = add_document(
            db,
            document_type="incoming",
            title="Hỏa tốc: rà soát danh sách hộ dân cần hỗ trợ khẩn cấp trước mùa mưa",
            code="18/HT-PCTT",
            arrival_number="2062",
            issuing_agency="Ban Chỉ huy PCTT xã Long Phú",
            content="Văn bản giấy hỏa tốc mới vào sổ, chưa giao người xử lý.",
            document_date=date(2026, 5, 16),
            received_date=date(2026, 5, 16),
            due_date=date(2026, 5, 16),
            priority="urgent",
            status="received",
            created_by=users["vanthu"],
            owner_department=hcc,
        )
        dept_unread = add_document(
            db,
            document_type="incoming",
            title="V/v đề nghị Phòng Kinh tế rà soát hồ sơ cấp phép kinh doanh tháng 5",
            code="88/VP-KT",
            arrival_number="2063",
            issuing_agency="Văn phòng HĐND và UBND",
            content="Demo văn bản gửi cho phòng ban: chỉ văn thư Phòng Kinh tế nhìn thấy trước.",
            document_date=date(2026, 5, 15),
            received_date=date(2026, 5, 15),
            due_date=date(2026, 5, 22),
            priority="normal",
            status="in_progress",
            created_by=users["vanthu"],
            owner_department=hcc,
        )
        add_assignment(
            db,
            document_id=dept_unread.id,
            sender=users["chanhvp"],
            receiver_department=economy,
            role="primary",
            status="pending",
            action_type="direct",
            instruction="Gửi Phòng Kinh tế tiếp nhận, phân công chuyên viên rà soát hồ sơ.",
            due_date=date(2026, 5, 22),
            pending_at=now(-1),
        )
        dept_viewed = add_document(
            db,
            document_type="incoming",
            title="V/v phối hợp chuẩn bị hoạt động tuyên truyền Ngày Gia đình Việt Nam",
            code="31/VH-XH",
            arrival_number="2064",
            issuing_agency="UBND xã Long Phú",
            content="Demo assignment phòng ban đã được văn thư phòng mở xem.",
            document_date=date(2026, 5, 14),
            received_date=date(2026, 5, 14),
            due_date=date(2026, 5, 25),
            priority="normal",
            status="in_progress",
            created_by=users["vanthu"],
            owner_department=hcc,
        )
        add_assignment(
            db,
            document_id=dept_viewed.id,
            sender=users["chanhvp"],
            receiver_department=culture,
            role="collaborator",
            status="in_progress",
            action_type="assign",
            instruction="Phòng Văn hóa phối hợp chuẩn bị nội dung tuyên truyền.",
            due_date=date(2026, 5, 25),
            pending_at=now(-2),
            started_at=now(-1),
            viewed_at=now(-1),
        )
        completed_doc = add_document(
            db,
            document_type="incoming",
            title="Báo cáo kết quả rà soát thủ tục hành chính lĩnh vực đất đai",
            code="67/BC-KT",
            arrival_number="2038",
            issuing_agency="Phòng Kinh tế - UBND X.Long Phú",
            content="Demo văn bản đến đã xử lý xong.",
            document_date=date(2026, 5, 8),
            received_date=date(2026, 5, 8),
            due_date=date(2026, 5, 13),
            priority="normal",
            status="completed",
            created_by=users["vanthu"],
            owner_department=hcc,
            completed_at=now(-2),
        )
        add_assignment(
            db,
            document_id=completed_doc.id,
            sender=users["lanhdao"],
            receiver_user=users["truongphong"],
            role="primary",
            status="completed",
            action_type="direct",
            instruction="Đã tổng hợp và báo cáo kết quả rà soát.",
            due_date=date(2026, 5, 13),
            pending_at=now(-7),
            started_at=now(-6),
            completed_at=now(-2),
            viewed_at=now(-7),
        )
        returned_doc = add_document(
            db,
            document_type="incoming",
            title="Dự thảo phương án chỉnh trang tuyến đường nội bộ khu hành chính",
            code="22/PA-KT",
            arrival_number="2047",
            issuing_agency="Trung tâm Dịch vụ tổng hợp xã Long Phú",
            content="Demo luồng trả lại để thấy assignment returned trong sơ đồ.",
            document_date=date(2026, 5, 10),
            received_date=date(2026, 5, 10),
            due_date=date(2026, 5, 21),
            priority="normal",
            status="in_progress",
            created_by=users["vanthu"],
            owner_department=hcc,
        )
        returned_a = add_assignment(
            db,
            document_id=returned_doc.id,
            sender=users["truongphong"],
            receiver_user=users["chuyenvien"],
            role="primary",
            status="returned",
            action_type="assign",
            instruction="Bổ sung bản đồ vị trí và dự toán sơ bộ.",
            due_date=date(2026, 5, 17),
            pending_at=now(-4),
            started_at=now(-4, hours=2),
            returned_at=now(-2),
            viewed_at=now(-4),
        )
        add_assignment(
            db,
            document_id=returned_doc.id,
            parent_id=returned_a.id,
            sender=users["chuyenvien"],
            receiver_user=users["truongphong"],
            role="primary",
            status="pending",
            action_type="return",
            instruction="Đã bổ sung tài liệu, kính chuyển lãnh đạo phòng xem lại.",
            due_date=date(2026, 5, 21),
            pending_at=now(-1),
        )
        direct_staff = add_document(
            db,
            document_type="incoming",
            title="Thông báo kiểm tra tiến độ giải quyết hồ sơ trực tuyến mức độ 3, 4",
            code="51/TB-HCC",
            arrival_number="2065",
            issuing_agency="Trung tâm phục vụ hành chính công",
            content="Demo văn bản giao trực tiếp cho chuyên viên, có badge chưa xem.",
            document_date=date(2026, 5, 15),
            received_date=date(2026, 5, 15),
            due_date=date(2026, 5, 19),
            priority="high",
            status="in_progress",
            created_by=users["vanthu"],
            owner_department=hcc,
        )
        add_assignment(
            db,
            document_id=direct_staff.id,
            sender=users["truongphong"],
            receiver_user=users["chuyenvien"],
            role="primary",
            status="pending",
            action_type="assign",
            instruction="Kiểm tra danh sách hồ sơ trực tuyến và báo cáo nhanh.",
            due_date=date(2026, 5, 19),
            priority="high",
            pending_at=now(-1, hours=-2),
        )
        collab_doc = add_document(
            db,
            document_type="incoming",
            title="Kế hoạch tổ chức ngày hội chuyển đổi số cộng đồng năm 2026",
            code="12/KH-CĐS",
            arrival_number="2066",
            issuing_agency="UBND xã Long Phú",
            content="Demo văn bản có cả xử lý chính và phối hợp.",
            document_date=date(2026, 5, 13),
            received_date=date(2026, 5, 13),
            due_date=date(2026, 5, 24),
            priority="normal",
            status="in_progress",
            created_by=users["vanthu"],
            owner_department=hcc,
        )
        root_collab = add_assignment(
            db,
            document_id=collab_doc.id,
            sender=users["lanhdao"],
            receiver_user=users["truongphong"],
            role="primary",
            status="in_progress",
            action_type="direct",
            instruction="Phòng Kinh tế chủ trì kế hoạch ngày hội chuyển đổi số.",
            due_date=date(2026, 5, 24),
            pending_at=now(-3),
            started_at=now(-2),
            viewed_at=now(-2),
        )
        add_assignment(
            db,
            document_id=collab_doc.id,
            parent_id=root_collab.id,
            sender=users["truongphong"],
            receiver_user=users["phoihop"],
            role="collaborator",
            status="pending",
            action_type="assign",
            instruction="Phối hợp chuẩn bị nội dung truyền thông và danh sách đại biểu.",
            due_date=date(2026, 5, 22),
            pending_at=now(-1),
        )
        archive_incoming = add_document(
            db,
            document_type="incoming",
            title="Thông báo kết luận cuộc họp giao ban tháng 4 năm 2026",
            code="19/TB-UBND",
            arrival_number="2011",
            issuing_agency="UBND xã Long Phú",
            content="Demo hồ sơ đã lưu trữ.",
            document_date=date(2026, 4, 30),
            received_date=date(2026, 5, 1),
            due_date=date(2026, 5, 3),
            priority="normal",
            status="archived",
            created_by=users["vanthu"],
            owner_department=hcc,
            completed_at=now(-12),
            archived_at=now(-8),
        )
        add_assignment(
            db,
            document_id=archive_incoming.id,
            sender=users["chanhvp"],
            receiver_user=users["vanthu"],
            role="primary",
            status="completed",
            action_type="archive",
            instruction="Đã lưu hồ sơ theo dõi sau cuộc họp giao ban.",
            due_date=date(2026, 5, 3),
            pending_at=now(-14),
            started_at=now(-13),
            completed_at=now(-12),
            viewed_at=now(-14),
        )

        draft_outgoing = add_document(
            db,
            document_type="outgoing",
            title="Dự thảo thông báo lịch trực Bộ phận Một cửa tuần 22",
            code="DRAFT-01/TB-HCC",
            arrival_number=None,
            issuing_agency="Trung tâm phục vụ hành chính công",
            content="Demo văn bản đi đang dự thảo.",
            document_date=date(2026, 5, 16),
            due_date=date(2026, 5, 18),
            priority="normal",
            status="draft",
            created_by=users["vanthu"],
            owner_department=hcc,
        )
        pending_signature = add_document(
            db,
            document_type="outgoing",
            title="Tờ trình xin chủ trương nâng cấp trang thiết bị tiếp nhận hồ sơ",
            code="04/TTr-HCC",
            arrival_number=None,
            issuing_agency="Trung tâm phục vụ hành chính công",
            content="Demo văn bản đi đã trình ký, lãnh đạo có việc cần xử lý.",
            document_date=date(2026, 5, 15),
            due_date=date(2026, 5, 18),
            priority="high",
            status="pending_signature",
            created_by=users["vanthu"],
            owner_department=hcc,
        )
        add_assignment(
            db,
            document_id=pending_signature.id,
            sender=users["vanthu"],
            receiver_user=users["lanhdao"],
            role="primary",
            status="pending",
            action_type="submit_signature",
            instruction="Kính trình lãnh đạo ký duyệt tờ trình nâng cấp trang thiết bị.",
            due_date=date(2026, 5, 18),
            priority="high",
            pending_at=now(-1),
        )
        approved_outgoing = add_document(
            db,
            document_type="outgoing",
            title="Công văn mời họp triển khai phần mềm quản lý văn bản nội bộ",
            code="33/CV-HCC",
            arrival_number="PH-33",
            issuing_agency="Trung tâm phục vụ hành chính công",
            content="Demo văn bản đã ký duyệt, văn thư cần phát hành.",
            document_date=date(2026, 5, 14),
            due_date=date(2026, 5, 17),
            priority="normal",
            status="approved",
            created_by=users["vanthu"],
            owner_department=hcc,
        )
        add_assignment(
            db,
            document_id=approved_outgoing.id,
            sender=users["lanhdao"],
            receiver_user=users["vanthu"],
            role="primary",
            status="pending",
            action_type="approve_signature",
            instruction="Đã ký duyệt, văn thư kiểm tra số phát hành và ban hành.",
            due_date=date(2026, 5, 17),
            pending_at=now(-1),
        )
        outgoing_todo = add_document(
            db,
            document_type="outgoing",
            title="Dự thảo kế hoạch kiểm tra công tác tiếp nhận hồ sơ quý II",
            code="05/KH-HCC",
            arrival_number=None,
            issuing_agency="Trung tâm phục vụ hành chính công",
            content="Demo văn bản đi đang lấy ý kiến Chánh Văn phòng.",
            document_date=date(2026, 5, 13),
            due_date=date(2026, 5, 20),
            priority="normal",
            status="in_progress",
            created_by=users["vanthu"],
            owner_department=hcc,
        )
        add_assignment(
            db,
            document_id=outgoing_todo.id,
            sender=users["vanthu"],
            receiver_user=users["chanhvp"],
            role="primary",
            status="in_progress",
            action_type="advise",
            instruction="Xin ý kiến Chánh Văn phòng trước khi trình lãnh đạo.",
            due_date=date(2026, 5, 20),
            pending_at=now(-2),
            started_at=now(-1),
            viewed_at=now(-1),
        )
        outgoing_done = add_document(
            db,
            document_type="outgoing",
            title="Phiếu chuyển xử lý phản ánh của công dân về thủ tục hộ tịch",
            code="17/PC-HCC",
            arrival_number="PH-17",
            issuing_agency="Trung tâm phục vụ hành chính công",
            content="Demo văn bản đi đã hoàn thành xử lý nhưng chưa lưu hồ sơ.",
            document_date=date(2026, 5, 9),
            issued_date=date(2026, 5, 10),
            due_date=date(2026, 5, 10),
            priority="normal",
            status="completed",
            created_by=users["vanthu"],
            owner_department=hcc,
            completed_at=now(-6),
        )
        add_assignment(
            db,
            document_id=outgoing_done.id,
            sender=users["vanthu"],
            receiver_user=users["chanhvp"],
            role="primary",
            status="completed",
            action_type="complete",
            instruction="Đã rà soát nội dung phiếu chuyển xử lý.",
            due_date=date(2026, 5, 10),
            pending_at=now(-8),
            started_at=now(-7),
            completed_at=now(-6),
            viewed_at=now(-8),
        )
        archived_outgoing = add_document(
            db,
            document_type="outgoing",
            title="Thông báo phân công nhiệm vụ trực lễ 30/4 và 1/5",
            code="26/TB-HCC",
            arrival_number="PH-26",
            issuing_agency="Trung tâm phục vụ hành chính công",
            content="Demo văn bản đi đã lưu trữ.",
            document_date=date(2026, 4, 25),
            issued_date=date(2026, 4, 26),
            due_date=date(2026, 4, 26),
            priority="normal",
            status="archived",
            created_by=users["vanthu"],
            owner_department=hcc,
            completed_at=now(-18),
            archived_at=now(-15),
        )
        add_assignment(
            db,
            document_id=archived_outgoing.id,
            sender=users["vanthu"],
            receiver_user=users["xemdebiet"],
            role="informed",
            status="completed",
            action_type="issue",
            instruction="Xem để biết lịch trực lễ đã ban hành.",
            pending_at=now(-18),
            started_at=now(-18, minutes=10),
            completed_at=now(-18, minutes=12),
            viewed_at=now(-18),
        )

        db.add_all(
            [
                DocumentComment(document_id=dept_unread.id, user_id=users["vanthu"].id, content="Văn bản gửi phòng ban, văn thư phòng sẽ tiếp nhận trước."),
                DocumentComment(document_id=returned_doc.id, user_id=users["truongphong"].id, content="Cần bổ sung minh chứng trước khi trình lại."),
                DocumentComment(document_id=pending_signature.id, user_id=users["vanthu"].id, content="Đã rà soát thể thức, chờ lãnh đạo ký duyệt."),
                DocumentComment(document_id=approved_outgoing.id, user_id=users["lanhdao"].id, content="Đồng ý phát hành, lưu ý kiểm tra số văn bản trước khi ban hành."),
            ]
        )

        for doc, uploader, files in [
            (
                incoming,
                users["vanthu"],
                [
                    ("A13.148-DU-KH-0075-2026.pdf", "PDF mẫu: Kế hoạch bồi dưỡng chuyển đổi số.\n\nLorem ipsum dolor sit amet."),
                    ("Phieu-chuyen-xu-ly-2058.docx", "DOCX mẫu: Phiếu chuyển xử lý văn bản đến 2058.\n\nLorem ipsum dolor sit amet."),
                ],
            ),
            (
                outgoing,
                users["vanthu"],
                [
                    ("bao-cao-09-hcc-TK-lang-phi.signed.pdf", "PDF ký số mẫu: Báo cáo tiết kiệm chống lãng phí.\n\nLorem ipsum dolor sit amet."),
                    ("bao-cao-09-hcc-TK-lang-phi.docx", "DOCX mẫu: Bản soạn thảo báo cáo 09/BC-TTHC.\n\nLorem ipsum dolor sit amet."),
                ],
            ),
            (
                overdue,
                users["vanthu"],
                [("157-GM-SNV-bao-cao-tram-y-te.pdf", "PDF mẫu: Công văn khẩn trương báo cáo trạm y tế.\n\nLorem ipsum dolor sit amet.")],
            ),
            (
                paper_waiting,
                users["vanthu"],
                [("giay-moi-giao-ban-tuan-21.pdf", "PDF scan mẫu: Giấy mời họp giao ban tuần 21.\n\nLorem ipsum dolor sit amet.")],
            ),
            (
                paper_urgent,
                users["vanthu"],
                [("hoa-toc-ho-tro-mua-mua.pdf", "PDF scan mẫu: Hỏa tốc hỗ trợ khẩn cấp mùa mưa.\n\nLorem ipsum dolor sit amet.")],
            ),
            (
                dept_unread,
                users["vanthu"],
                [("88-vp-kt-ra-soat-cap-phep.pdf", "PDF mẫu: Rà soát hồ sơ cấp phép kinh doanh.\n\nLorem ipsum dolor sit amet.")],
            ),
            (
                returned_doc,
                users["chuyenvien"],
                [("bo-sung-phuong-an-chinh-trang.docx", "DOCX mẫu: Bổ sung phương án chỉnh trang tuyến đường.\n\nLorem ipsum dolor sit amet.")],
            ),
            (
                pending_signature,
                users["vanthu"],
                [("to-trinh-nang-cap-thiet-bi.docx", "DOCX mẫu: Tờ trình nâng cấp trang thiết bị tiếp nhận hồ sơ.\n\nLorem ipsum dolor sit amet.")],
            ),
            (
                approved_outgoing,
                users["lanhdao"],
                [("33-cv-hcc-da-ky.pdf", "PDF ký số mẫu: Công văn mời họp triển khai phần mềm quản lý văn bản.\n\nLorem ipsum dolor sit amet.")],
            ),
            (
                archived_outgoing,
                users["vanthu"],
                [("26-tb-hcc-lich-truc-le.pdf", "PDF mẫu: Thông báo phân công lịch trực lễ đã lưu trữ.\n\nLorem ipsum dolor sit amet.")],
            ),
        ]:
            for filename, text in files:
                key, size, mime_type = await save_demo_file(filename, text, f"documents/{doc.id}")
                add_attachment(db, document_id=doc.id, uploaded_by=uploader, filename=filename, storage_key=key, size=size, mime_type=mime_type)

        for assignment in db.scalars(select(DocumentAssignment)).all():
            if assignment.status == "completed":
                continue
            if assignment.receiver_user_id:
                db.add(
                    Notification(
                        user_id=assignment.receiver_user_id,
                        document_id=assignment.document_id,
                        assignment_id=assignment.id,
                        title="Bạn có văn bản cần xử lý",
                        message=assignment.instruction or "Văn bản mới được chuyển đến bạn.",
                    )
                )
                continue
            if assignment.receiver_department_id:
                clerks = db.scalars(
                    select(User).where(
                        User.department_id == assignment.receiver_department_id,
                        User.role == "clerk",
                        User.is_active.is_(True),
                    )
                ).all()
                for clerk in clerks:
                    db.add(
                        Notification(
                            user_id=clerk.id,
                            document_id=assignment.document_id,
                            assignment_id=assignment.id,
                            title="Phòng ban có văn bản cần xử lý",
                            message=assignment.instruction or "Văn bản mới được chuyển đến phòng ban.",
                        )
                    )

        db.commit()

    print("Seeded demo workflow data.")
    print(f"Demo password for created users: {DEMO_PASSWORD}")
    print("Demo accounts: vanthu@example.com, chanhvp@example.com, lanhdao@example.com, truongphong@example.com, chuyenvien@example.com")


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
