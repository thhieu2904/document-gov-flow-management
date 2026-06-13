ROLES = [
    {"key": "superadmin", "label": "Quản trị toàn hệ thống"},
    {"key": "manager", "label": "Quản lý"},
    {"key": "staff", "label": "Nhân viên"},
]

ROLE_LABELS = {item["key"]: item["label"] for item in ROLES}

DOCUMENT_STATUSES = {
    "draft": "Chưa giao",
    "in_progress": "Đang thực hiện",
    "submitted": "Chờ duyệt",
    "completed": "Hoàn tất",
}

ASSIGNMENT_STATUSES = {
    "pending": "Chưa nhận",
    "in_progress": "Đang làm",
    "submitted": "Chờ duyệt",
    "returned": "Bị trả về",
    "approved": "Đã duyệt",
}

PRIORITY_LABELS = {
    "normal": "Thường",
    "high": "Khẩn",
    "urgent": "Hỏa tốc",
}

ALLOWED_UPLOAD_EXTENSIONS = {
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".png",
    ".jpg",
    ".jpeg",
    ".zip",
    ".rar",
    ".txt",
    ".md",
}
