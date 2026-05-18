ROLES = [
    {"key": "admin", "label": "Quan tri he thong"},
    {"key": "clerk", "label": "Van thu"},
    {"key": "manager", "label": "Quan ly"},
    {"key": "staff", "label": "Nhan vien"},
]

ROLE_LABELS = {item["key"]: item["label"] for item in ROLES}

UNIT_TYPES = {
    "parent_unit": "Cap cha",
    "department": "Phong ban",
}

DOCUMENT_TYPES = [
    {"key": "incoming", "label": "Van ban den"},
    {"key": "outgoing", "label": "Van ban di"},
]

DOCUMENT_STATUS_LABELS = {
    "received": "Da tiep nhan",
    "in_progress": "Dang xu ly",
    "completed": "Da xu ly",
    "archived": "Luu tru",
    "voided": "Da huy",
    "draft": "Du thao",
    "pending_signature": "Cho ky duyet",
    "approved": "Da ky duyet",
    "issued": "Da phat hanh",
}

ASSIGNMENT_ROLE_LABELS = {
    "primary": "Xu ly chinh",
    "collaborator": "Phoi hop",
    "informed": "Xem de biet",
}

ASSIGNMENT_STATUS_LABELS = {
    "pending": "Chua xu ly",
    "in_progress": "Dang xu ly",
    "completed": "Da xu ly",
    "returned": "Tra lai",
}

ACTION_TYPE_LABELS = {
    "incoming_register": "Vao so van ban den",
    "advise": "Tham muu",
    "direct": "Chi dao",
    "forward": "Chuyen xu ly",
    "assign": "Phan cong",
    "complete": "Ket thuc phan xu ly",
    "return": "Tra lai / yeu cau chinh sua",
    "outgoing_draft": "Tao du thao van ban di",
    "submit_signature": "Trinh ky",
    "approve_signature": "Ky duyet",
    "issue": "Phat hanh",
    "archive": "Luu ho so",
    "void": "Huy van ban nhap nham",
    "comment": "Binh luan",
    "file_upload": "Tai file len",
    "file_download": "Tai file xuong",
    "view": "Xem van ban",
}

PRIORITY_LABELS = {
    "normal": "Thuong",
    "high": "Khan",
    "urgent": "Hoa toc",
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
