from datetime import date, datetime, timezone
import uuid

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    unit_type: Mapped[str] = mapped_column(String(30), default="department", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    members: Mapped[list["User"]] = relationship(back_populates="department", foreign_keys="User.department_id")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    supabase_user_id: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(30), default="staff", index=True)
    department_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("departments.id"), index=True)
    position_label: Mapped[str | None] = mapped_column(String(160))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    department: Mapped[Department | None] = relationship(back_populates="members", foreign_keys=[department_id])

    @property
    def position(self) -> str | None:
        return self.position_label

    @position.setter
    def position(self, value: str | None) -> None:
        self.position_label = value


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    document_type: Mapped[str] = mapped_column(String(40), default="incoming", index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    code: Mapped[str | None] = mapped_column(String(120), index=True)
    arrival_number: Mapped[str | None] = mapped_column(String(80), index=True)
    issuing_agency: Mapped[str | None] = mapped_column(String(255), index=True)
    content: Mapped[str | None] = mapped_column(Text)
    document_date: Mapped[date | None] = mapped_column(Date)
    received_date: Mapped[date | None] = mapped_column(Date)
    issued_date: Mapped[date | None] = mapped_column(Date)
    due_date: Mapped[date | None] = mapped_column(Date, index=True)
    priority: Mapped[str] = mapped_column(String(20), default="normal", index=True)
    status: Mapped[str] = mapped_column(String(40), default="received", index=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    owner_department_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("departments.id"), index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    deleted_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    delete_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    creator: Mapped[User] = relationship(foreign_keys=[created_by])
    owner_department: Mapped[Department | None] = relationship(foreign_keys=[owner_department_id])

    @property
    def current_department_id(self) -> str | None:
        return self.owner_department_id

    @current_department_id.setter
    def current_department_id(self, value: str | None) -> None:
        self.owner_department_id = value


class DocumentAssignment(Base):
    __tablename__ = "document_assignments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("documents.id"), nullable=False, index=True)
    parent_assignment_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("document_assignments.id"), index=True)
    sender_user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    sender_department_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("departments.id"), index=True)
    receiver_user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    receiver_department_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("departments.id"), index=True)
    assignment_role: Mapped[str] = mapped_column(String(30), default="primary", index=True)
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    action_type: Mapped[str] = mapped_column(String(60), default="forward", index=True)
    instruction: Mapped[str | None] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(String(20), default="normal", index=True)
    due_date: Mapped[date | None] = mapped_column(Date, index=True)
    pending_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    @property
    def from_user_id(self) -> str | None:
        return self.sender_user_id

    @from_user_id.setter
    def from_user_id(self, value: str | None) -> None:
        self.sender_user_id = value

    @property
    def to_user_id(self) -> str | None:
        return self.receiver_user_id

    @to_user_id.setter
    def to_user_id(self, value: str | None) -> None:
        self.receiver_user_id = value

    @property
    def to_department_id(self) -> str | None:
        return self.receiver_department_id

    @to_department_id.setter
    def to_department_id(self, value: str | None) -> None:
        self.receiver_department_id = value

    @property
    def note(self) -> str | None:
        return self.instruction

    @note.setter
    def note(self, value: str | None) -> None:
        self.instruction = value


class DocumentComment(Base):
    __tablename__ = "document_comments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("documents.id"), nullable=False, index=True)
    assignment_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("document_assignments.id"), index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


class DocumentAttachment(Base):
    __tablename__ = "document_attachments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("documents.id"), nullable=False, index=True)
    assignment_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("document_assignments.id"), index=True)
    storage_provider: Mapped[str] = mapped_column(String(30), default="r2")
    storage_key: Mapped[str] = mapped_column(String(1000), nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(255), default="application/octet-stream")
    size: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class DocumentHistoryLog(Base):
    __tablename__ = "document_history_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("documents.id"), nullable=False, index=True)
    assignment_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("document_assignments.id"), index=True)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    action_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    extra: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    document_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("documents.id"), index=True)
    assignment_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("document_assignments.id"), index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
