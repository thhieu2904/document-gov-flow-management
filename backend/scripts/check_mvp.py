from pathlib import Path
import sys
import uuid

from fastapi.testclient import TestClient
from sqlalchemy import delete

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.database import get_session_local
from app.core.schema import ensure_runtime_schema
from app.main import app
from app.models import Notification


DEMO_PASSWORD = "password123"
DEMO_ACCOUNTS = [
    "admin@example.com",
    "vanthu@example.com",
    "chanhvp@example.com",
    "lanhdao@example.com",
    "vanthu.phong@example.com",
    "truongphong@example.com",
    "chuyenvien@example.com",
    "phoihop@example.com",
    "xemdebiet@example.com",
]
LEGACY_PERSONAL_VALUES = {
    "thhieu2904@gmail.com",
    "Quản trị hệ thống",
    "Lý Thị Kim Hoa",
    "Huỳnh Thị Thuỳ Trang",
    "Nguyễn Văn Quang",
    "Sơn Thị Ngọc Loan",
    "Huỳnh Tấn Thanh",
    "Lâm Văn Vũ",
    "Lê Thành Tài",
    "Vương Khánh Quy",
}


def cleanup_mvp_check_notifications() -> None:
    db = get_session_local()()
    try:
        db.execute(delete(Notification).where(Notification.message.ilike("%MVP check - văn bản tạm%")))
        db.execute(delete(Notification).where(Notification.message.ilike("%MVP check - phòng ban tạm%")))
        db.commit()
    finally:
        db.close()


def assert_ok(response, label: str):
    if response.status_code >= 400:
        raise AssertionError(f"{label} failed: {response.status_code} {response.text}")
    return response.json()


def assert_status(response, status_code: int, label: str) -> None:
    if response.status_code != status_code:
        raise AssertionError(f"{label} expected {status_code}, got {response.status_code}: {response.text}")


def login(client: TestClient, email: str) -> tuple[dict, dict[str, str]]:
    data = assert_ok(client.post("/api/auth/login", json={"email": email, "password": DEMO_PASSWORD}), f"login {email}")
    return data, {"Authorization": f"Bearer {data['access_token']}"}


def assert_page_shape(page: dict, label: str) -> None:
    for key in ["items", "page", "size", "total"]:
        if key not in page:
            raise AssertionError(f"{label} missing page key: {key}")


def assert_detail_shape(detail: dict) -> None:
    required = ["assignments", "my_assignments", "attachments", "comments", "history_logs", "my_permissions"]
    missing = [key for key in required if key not in detail]
    if missing:
        raise AssertionError(f"document detail missing keys: {missing}")


def check_demo_logins(client: TestClient) -> dict[str, dict[str, str]]:
    headers_by_email = {}
    for email in DEMO_ACCOUNTS:
        _, headers = login(client, email)
        headers_by_email[email] = headers
    return headers_by_email


def check_seed_data(client: TestClient, admin_headers: dict[str, str]) -> None:
    users = assert_ok(client.get("/api/users", headers=admin_headers), "list users")
    flat_values = {str(value) for user in users for value in [user.get("email"), user.get("full_name")] if value}
    leaked = sorted(flat_values & LEGACY_PERSONAL_VALUES)
    if leaked:
        raise AssertionError(f"seed still contains personal/legacy values: {leaked}")
    admin_user = next((user for user in users if user["email"] == "admin@example.com"), None)
    if not admin_user:
        raise AssertionError("demo admin user is missing")
    assert_status(
        client.patch(f"/api/users/{admin_user['id']}", headers=admin_headers, json={"is_active": False}),
        400,
        "self deactivate blocked",
    )
    assert_status(
        client.patch(f"/api/users/{admin_user['id']}", headers=admin_headers, json={"role": "staff"}),
        400,
        "self demote blocked",
    )
    assert_status(
        client.patch(f"/api/users/{admin_user['id']}", headers=admin_headers, json={"password": DEMO_PASSWORD}),
        400,
        "self admin password reset blocked",
    )

    stats = assert_ok(client.get("/api/admin/stats", headers=admin_headers), "admin stats")
    for key in ["total_users", "active_users", "total_documents", "open_assignments", "recent_logs"]:
        if key not in stats:
            raise AssertionError(f"admin stats missing key: {key}")

    docs = assert_ok(client.get("/api/documents?size=10", headers=admin_headers), "list all documents")
    assert_page_shape(docs, "documents")
    if docs["total"] < 3:
        raise AssertionError(f"expected at least 3 demo documents, got {docs['total']}")


def check_lists_and_detail(client: TestClient, headers: dict[str, str]) -> dict:
    dashboard = assert_ok(client.get("/api/dashboard", headers=headers), "dashboard")
    if "total_documents" not in dashboard:
        raise AssertionError("dashboard missing total_documents")

    for label, path in [
        ("documents", "/api/documents?size=5"),
        ("outgoing issued", "/api/documents/outgoing?queue=issued&size=5"),
        ("progress", "/api/progress?size=5"),
        ("filter", "/api/documents/outgoing?queue=issued&search=09&due_before=2026-05-31&size=5"),
    ]:
        page = assert_ok(client.get(path, headers=headers), label)
        assert_page_shape(page, label)

    issued = assert_ok(client.get("/api/documents/outgoing?queue=issued&size=5", headers=headers), "issued documents")
    if issued["items"]:
        issued_doc_id = issued["items"][0]["id"]
        assert_status(
            client.patch(issued_doc_id and f"/api/documents/{issued_doc_id}", headers=headers, json={"title": "Không được sửa văn bản đã phát hành"}),
            400,
            "issued document edit blocked",
        )
        assert_status(
            client.post(f"/api/documents/{issued_doc_id}/assign", headers=headers, json={"receiver_user_id": None, "assignment_role": "primary"}),
            400,
            "issued document assign blocked",
        )
        assert_status(
            client.post(f"/api/documents/{issued_doc_id}/void", headers=headers, json={"reason": "Không được hủy văn bản đã phát hành"}),
            400,
            "issued document void blocked",
        )

    docs = assert_ok(client.get("/api/documents?size=10", headers=headers), "documents for detail")
    if not docs["items"]:
        raise AssertionError("visible document list is empty")

    first_detail = assert_ok(client.get(f"/api/documents/{docs['items'][0]['id']}", headers=headers), "document detail")
    assert_detail_shape(first_detail)

    detail_with_file = first_detail
    for item in docs["items"]:
        detail = assert_ok(client.get(f"/api/documents/{item['id']}", headers=headers), "document detail for attachment")
        if detail["attachments"]:
            detail_with_file = detail
            break
    if detail_with_file["attachments"]:
        attachment_id = detail_with_file["attachments"][0]["id"]
        download = client.get(f"/api/attachments/{attachment_id}/download", headers=headers)
        assert_status(download, 200, "download attachment")
    return first_detail


def check_informed_permissions(client: TestClient, headers: dict[str, str]) -> None:
    docs = assert_ok(client.get("/api/documents?size=10", headers=headers), "viewer documents")
    target_assignment_id = None
    for item in docs["items"]:
        detail = assert_ok(client.get(f"/api/documents/{item['id']}", headers=headers), "viewer detail")
        assert_detail_shape(detail)
        if detail["my_permissions"]["can_forward"] or detail["my_permissions"]["can_complete"]:
            raise AssertionError("informed viewer unexpectedly has forward/complete permission")
        for assignment in detail["my_assignments"]:
            if assignment["assignment_role"] == "informed":
                target_assignment_id = assignment["id"]
                break
        if target_assignment_id:
            break
    if not target_assignment_id:
        raise AssertionError("viewer has no informed assignment in seed data")
    assert_status(client.post(f"/api/assignments/{target_assignment_id}/complete", headers=headers, json={}), 403, "informed complete blocked")


def check_temp_workflow(client: TestClient, headers_by_email: dict[str, dict[str, str]]) -> None:
    vanthu_login, vanthu_headers = login(client, "vanthu@example.com")
    vanthu_id = vanthu_login["user"]["id"]

    # --- Create document ---
    created = assert_ok(
        client.post(
            "/api/documents/incoming/receive",
            headers=vanthu_headers,
            json={
                "title": "MVP check - văn bản tạm",
                "code": "MVP-CHECK",
                "arrival_number": "MVP-CHECK",
                "issuing_agency": "Hệ thống kiểm thử",
                "priority": "normal",
            },
        ),
        "create temp document",
    )
    doc_id = created["id"]
    received_page = assert_ok(
        client.get("/api/documents/incoming?queue=received&search=MVP-CHECK&size=5", headers=vanthu_headers),
        "new incoming appears in received queue",
    )
    assert_page_shape(received_page, "received queue")
    if not any(item["id"] == doc_id for item in received_page["items"]):
        raise AssertionError("newly received incoming document is not visible in received queue")

    # --- Assign to self ---
    assignment = assert_ok(
        client.post(
            f"/api/documents/{doc_id}/assign",
            headers=vanthu_headers,
            json={
                "receiver_user_id": vanthu_id,
                "assignment_role": "primary",
                "action_type": "assign",
                "instruction": "Kiểm tra luồng xử lý tạm.",
                "priority": "normal",
            },
        ),
        "assign temp document",
    )
    notifications = assert_ok(client.get("/api/notifications", headers=vanthu_headers), "list notifications after assign")
    if not any(item["document_id"] == doc_id and item["assignment_id"] == assignment["id"] for item in notifications):
        raise AssertionError("direct assignment did not create notification")

    # --- Verify per-assignment permissions in detail ---
    detail = assert_ok(client.get(f"/api/documents/{doc_id}", headers=vanthu_headers), "detail for permission check")
    my_a = detail["my_assignments"]
    if not my_a:
        raise AssertionError("my_assignments is empty after assign")
    first = my_a[0]
    for perm in ["can_start", "can_complete", "can_forward", "can_return"]:
        if perm not in first:
            raise AssertionError(f"my_assignments[0] missing per-assignment permission: {perm}")
    if not first["can_start"]:
        raise AssertionError("can_start should be True for pending primary assignment")

    # --- Start ---
    assert_ok(client.post(f"/api/assignments/{assignment['id']}/start", headers=vanthu_headers), "start temp assignment")

    # --- Forward to chuyenvien ---
    cv_login, cv_headers = login(client, "chuyenvien@example.com")
    cv_id = cv_login["user"]["id"]
    forwarded = assert_ok(
        client.post(
            f"/api/assignments/{assignment['id']}/forward",
            headers=vanthu_headers,
            json={
                "action_type": "forward",
                "instruction": "Chuyển tiếp kiểm thử",
                "receivers": [
                    {"receiver_user_id": cv_id, "assignment_role": "primary", "priority": "normal"},
                ],
            },
        ),
        "forward temp assignment",
    )
    if not forwarded or len(forwarded) < 1:
        raise AssertionError("forward did not return created assignments")
    child_assignment_id = forwarded[0]["id"]

    # --- Start + Complete forwarded assignment ---
    assert_ok(client.post(f"/api/assignments/{child_assignment_id}/start", headers=cv_headers), "start forwarded assignment")

    # --- Return ---
    returned = assert_ok(
        client.post(
            f"/api/assignments/{child_assignment_id}/return",
            headers=cv_headers,
            json={
                "instruction": "Trả lại kiểm thử",
            },
        ),
        "return forwarded assignment",
    )
    if returned["action_type"] != "return":
        raise AssertionError(f"return action_type expected 'return', got '{returned['action_type']}'")

    # --- Complete original assignment ---
    assert_ok(
        client.post(
            f"/api/assignments/{assignment['id']}/complete",
            headers=vanthu_headers,
            json={"result_note": "Hoàn thành kiểm tra tự động."},
        ),
        "complete temp assignment",
    )

    # --- Comment ---
    assert_ok(
        client.post(
            f"/api/documents/{doc_id}/comments",
            headers=vanthu_headers,
            json={"content": "Bình luận kiểm tra tự động."},
        ),
        "comment temp document",
    )

    # --- Verify document auto-completed ---
    detail_after = assert_ok(client.get(f"/api/documents/{doc_id}", headers=vanthu_headers), "detail after complete")
    if detail_after["status"] not in {"completed", "in_progress"}:
        raise AssertionError(f"document status after complete: {detail_after['status']}")

    # --- Archive ---
    if detail_after["status"] == "completed":
        assert_ok(
            client.post(f"/api/documents/{doc_id}/archive", headers=vanthu_headers),
            "archive temp document",
        )
        detail_archived = assert_ok(client.get(f"/api/documents/{doc_id}", headers=vanthu_headers), "detail after archive")
        if detail_archived["status"] != "archived":
            raise AssertionError(f"expected archived status, got {detail_archived['status']}")

    # --- Void (cleanup) ---
    assert_ok(
        client.post(
            f"/api/documents/{doc_id}/void",
            headers=vanthu_headers,
            json={"reason": "Dọn dữ liệu check tự động"},
        ),
        "void temp document",
    )


def check_department_intake_and_unread(client: TestClient, headers_by_email: dict[str, dict[str, str]]) -> None:
    vanthu_login, vanthu_headers = login(client, "vanthu@example.com")
    dept_clerk_login, dept_clerk_headers = login(client, "vanthu.phong@example.com")
    manager_headers = headers_by_email["truongphong@example.com"]
    staff_headers = headers_by_email["chuyenvien@example.com"]
    target_department_id = dept_clerk_login["user"]["department_id"]
    if not target_department_id:
        raise AssertionError("department clerk has no department_id")

    suffix = uuid.uuid4().hex[:8].upper()
    title = f"MVP check - phòng ban tạm {suffix}"
    code = f"MVP-DEPT-{suffix}"
    created = assert_ok(
        client.post(
            "/api/documents/incoming/receive",
            headers=vanthu_headers,
            json={
                "title": title,
                "code": code,
                "arrival_number": code,
                "issuing_agency": "Hệ thống kiểm thử",
                "priority": "normal",
            },
        ),
        "create department intake document",
    )
    doc_id = created["id"]
    assignment = assert_ok(
        client.post(
            f"/api/documents/{doc_id}/assign",
            headers=vanthu_headers,
            json={
                "receiver_department_id": target_department_id,
                "assignment_role": "primary",
                "action_type": "assign",
                "instruction": title,
                "priority": "normal",
            },
        ),
        "assign document to department",
    )

    clerk_notifications = assert_ok(client.get("/api/notifications", headers=dept_clerk_headers), "department clerk notifications")
    if not any(item["document_id"] == doc_id and item["assignment_id"] == assignment["id"] for item in clerk_notifications):
        raise AssertionError("department assignment did not notify department clerk")
    for label, headers in [("manager", manager_headers), ("staff", staff_headers)]:
        notifications = assert_ok(client.get("/api/notifications", headers=headers), f"{label} notifications")
        if any(item["document_id"] == doc_id and item["assignment_id"] == assignment["id"] for item in notifications):
            raise AssertionError(f"department assignment unexpectedly notified {label}")

    clerk_primary = assert_ok(
        client.get(f"/api/documents/incoming?queue=primary&search={code}&size=5", headers=dept_clerk_headers),
        "department clerk primary queue",
    )
    if not clerk_primary["items"] or not any(item["id"] == doc_id and item.get("is_unread") for item in clerk_primary["items"]):
        raise AssertionError("department clerk primary queue missing unread department document")

    for label, headers in [("manager", manager_headers), ("staff", staff_headers)]:
        page = assert_ok(client.get(f"/api/documents/incoming?queue=primary&search={code}&size=5", headers=headers), f"{label} primary queue")
        if any(item["id"] == doc_id for item in page["items"]):
            raise AssertionError(f"{label} can see department assignment without direct receiver")
        assert_status(client.get(f"/api/documents/{doc_id}", headers=headers), 403, f"{label} detail blocked")

    detail = assert_ok(client.get(f"/api/documents/{doc_id}", headers=dept_clerk_headers), "department clerk detail marks viewed")
    my_assignments = detail["my_assignments"]
    if not my_assignments:
        raise AssertionError("department clerk has no my_assignments for department assignment")
    if not my_assignments[0].get("viewed_at"):
        raise AssertionError("department assignment was not marked viewed")
    if my_assignments[0].get("is_unread"):
        raise AssertionError("department assignment still unread after detail open")

    clerk_primary_after = assert_ok(
        client.get(f"/api/documents/incoming?queue=primary&search={code}&size=5", headers=dept_clerk_headers),
        "department clerk primary queue after viewed",
    )
    if any(item["id"] == doc_id and item.get("is_unread") for item in clerk_primary_after["items"]):
        raise AssertionError("document list still shows unread after detail open")

    assert_ok(
        client.post(
            f"/api/documents/{doc_id}/void",
            headers=vanthu_headers,
            json={"reason": "Dọn dữ liệu check phòng ban"},
        ),
        "void department intake document",
    )


def main() -> None:
    ensure_runtime_schema()
    cleanup_mvp_check_notifications()
    client = TestClient(app)
    headers_by_email = check_demo_logins(client)
    admin_headers = headers_by_email["admin@example.com"]
    _, vanthu_headers = login(client, "vanthu@example.com")

    check_seed_data(client, admin_headers)
    assert_status(client.get("/api/admin/stats", headers=vanthu_headers), 403, "admin stats blocked for non-admin")
    check_lists_and_detail(client, vanthu_headers)
    check_informed_permissions(client, headers_by_email["xemdebiet@example.com"])
    check_department_intake_and_unread(client, headers_by_email)
    check_temp_workflow(client, headers_by_email)
    cleanup_mvp_check_notifications()

    print("MVP regression check OK")
    print(f"Checked demo accounts: {len(DEMO_ACCOUNTS)}")
    print("Checked: auth, seed, admin stats, admin self-protection, received queue, unread state, department intake, notifications, issued guards, lists, detail, search, download, permissions, forward, return, archive, void")


if __name__ == "__main__":
    main()
