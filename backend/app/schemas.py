from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    captcha_token: str | None = None
    captcha_answer: str | None = None


class CaptchaChallenge(BaseModel):
    captcha_id: str
    captcha_code: str
    captcha_token: str
    expires_in_seconds: int


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class UserCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str = Field(min_length=8)
    role: str = "staff"
    department_id: str | None = None
    position_label: str | None = None
    is_active: bool = True


class UserUpdate(BaseModel):
    full_name: str | None = None
    password: str | None = Field(default=None, min_length=8)
    role: str | None = None
    department_id: str | None = None
    position_label: str | None = None
    is_active: bool | None = None


class PasswordResetResponse(BaseModel):
    temporary_password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    full_name: str
    email: EmailStr
    role: str
    department_id: str | None
    position_label: str | None
    is_active: bool
    must_change_password: bool


class DepartmentCreate(BaseModel):
    name: str
    description: str | None = None
    is_active: bool = True
    manager_id: str | None = None


class DepartmentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None
    manager_id: str | None = None


class DepartmentTransferRequest(BaseModel):
    target_department_id: str


class ReminderSettings(BaseModel):
    staff_reminder_enabled: bool = True
    staff_reminder_time: str = "08:00"
    staff_due_soon_days: int = Field(default=3, ge=1, le=30)
    staff_urgent_enabled: bool = True
    staff_overdue_enabled: bool = True
    manager_digest_enabled: bool = True
    manager_digest_time: str = "16:30"
    manager_report_mode: str = "weekly"
    manager_report_time: str = "08:00"


class EmailTestRequest(BaseModel):
    to_email: EmailStr | None = None


class DocumentCreate(BaseModel):
    title: str
    code: str | None = None
    summary: str | None = None
    issued_at: datetime | None = None
    due_at: datetime | None = None
    priority: str = "normal"
    department_id: str | None = None


class DocumentUpdate(BaseModel):
    title: str | None = None
    code: str | None = None
    summary: str | None = None
    issued_at: datetime | None = None
    due_at: datetime | None = None
    priority: str | None = None
    department_id: str | None = None


class AssignmentCreate(BaseModel):
    assignee_ids: list[str] = Field(min_length=1)
    instruction: str | None = None
    due_at: datetime | None = None
    priority: str = "normal"


class AssignmentSubmit(BaseModel):
    result_note: str | None = None


class AssignmentReviewRequest(BaseModel):
    note: str | None = None


class CommentCreate(BaseModel):
    content: str
    assignment_id: str | None = None


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    document_id: str | None
    assignment_id: str | None
    title: str
    message: str
    is_read: bool
    created_at: datetime
    read_at: datetime | None


class Page(BaseModel):
    items: list[dict]
    page: int
    size: int
    total: int


class KpiIndicatorCreate(BaseModel):
    number: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=500)
    description: str | None = None
    department_id: str | None = None


class KpiIndicatorUpdate(BaseModel):
    number: int | None = Field(default=None, ge=1)
    name: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None
    department_id: str | None = None
    is_active: bool | None = None


class KpiPeriodCreate(BaseModel):
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=2020, le=2100)


class KpiPeriodUpdate(BaseModel):
    status: str = Field(pattern="^(open|closed)$")


class KpiResultBatchItem(BaseModel):
    indicator_id: str
    department_id: str
    percentage: float | None = Field(default=None, ge=0)
    note: str | None = None


class KpiResultBatch(BaseModel):
    results: list[KpiResultBatchItem]
