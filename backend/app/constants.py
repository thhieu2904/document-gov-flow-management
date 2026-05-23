ROLES = [
    {"key": "manager", "label": "Quản lý"},
    {"key": "staff", "label": "Nhân viên"},
]

ROLE_LABELS = {item["key"]: item["label"] for item in ROLES}

DOCUMENT_STATUSES = {
    "draft": "Chưa giao",
    "in_progress": "Đang thực hiện",
    "completed": "Hoàn tất",
}

ASSIGNMENT_STATUSES = {
    "pending": "Chưa nhận",
    "in_progress": "Đang làm",
    "completed": "Hoàn tất",
}

PRIORITY_LABELS = {
    "normal": "Thường",
    "high": "Khẩn",
    "urgent": "Gấp",
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
