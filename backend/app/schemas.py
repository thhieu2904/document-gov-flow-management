from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class UserCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str = Field(min_length=8)
    role: str
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
    must_change_password: bool | None = None


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
    unit_type: str = "department"
    is_active: bool = True


class DepartmentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    unit_type: str | None = None
    is_active: bool | None = None


class DocumentCreate(BaseModel):
    document_type: str = "incoming"
    title: str
    code: str | None = None
    arrival_number: str | None = None
    issuing_agency: str | None = None
    content: str | None = None
    document_date: date | None = None
    received_date: date | None = None
    issued_date: date | None = None
    due_date: date | None = None
    priority: str = "normal"
    owner_department_id: str | None = None


class DocumentUpdate(BaseModel):
    title: str | None = None
    code: str | None = None
    arrival_number: str | None = None
    issuing_agency: str | None = None
    content: str | None = None
    document_date: date | None = None
    received_date: date | None = None
    issued_date: date | None = None
    due_date: date | None = None
    priority: str | None = None
    owner_department_id: str | None = None


class AssignmentReceiver(BaseModel):
    receiver_user_id: str | None = None
    receiver_department_id: str | None = None
    assignment_role: str = "primary"
    due_date: date | None = None
    priority: str = "normal"


class AssignmentCreate(BaseModel):
    parent_assignment_id: str | None = None
    receiver_user_id: str | None = None
    receiver_department_id: str | None = None
    assignment_role: str = "primary"
    action_type: str = "forward"
    instruction: str | None = None
    due_date: date | None = None
    priority: str = "normal"


class AssignmentForwardRequest(BaseModel):
    action_type: str = "forward"
    instruction: str | None = None
    receivers: list[AssignmentReceiver]


class AssignmentCompleteRequest(BaseModel):
    result_note: str | None = None
    attachment_ids: list[str] = []


class AssignmentReturnRequest(BaseModel):
    receiver_user_id: str | None = None
    receiver_department_id: str | None = None
    instruction: str
    due_date: date | None = None
    priority: str = "normal"


class StatusChange(BaseModel):
    status: str
    note: str | None = None


class DocumentVoidRequest(BaseModel):
    reason: str


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
