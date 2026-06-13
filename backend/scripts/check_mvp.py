from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

from fastapi.testclient import TestClient

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.main import app


PASSWORD = "password123"


def ok(response, label: str):
    if response.status_code >= 400:
        raise AssertionError(f"{label} failed: {response.status_code} {response.text}")
    return response.json()


def status(response, expected: int, label: str) -> None:
    if response.status_code != expected:
        raise AssertionError(f"{label} expected {expected}, got {response.status_code}: {response.text}")


def login(client: TestClient, email: str) -> dict[str, str]:
    captcha = ok(client.get("/api/auth/captcha"), f"captcha {email}")
    data = ok(
        client.post(
            "/api/auth/login",
            json={
                "email": email,
                "password": PASSWORD,
                "captcha_token": captcha["captcha_token"],
                "captcha_answer": captcha["captcha_code"],
            },
        ),
        f"login {email}",
    )
    return {"Authorization": f"Bearer {data['access_token']}"}


def main() -> None:
    client = TestClient(app)
    manager = login(client, "quanly.vanhanh@example.com")
    staff = login(client, "nhanvien1@example.com")

    dashboard = ok(client.get("/api/dashboard", headers=manager), "manager dashboard")
    if dashboard["total_documents"] < 3:
        raise AssertionError("seed has too few documents")

    users = ok(client.get("/api/users", headers=manager), "users")
    staff_user = next((item for item in users if item["email"] == "nhanvien1@example.com"), None)
    if not staff_user:
        raise AssertionError("staff user missing")

    created = ok(
        client.post(
            "/api/documents",
            headers=manager,
            json={
                "title": "MVP check simple document",
                "code": "CHECK-001",
                "summary": "Regression check",
                "priority": "normal",
                "issued_at": datetime.now(timezone.utc).isoformat(),
                "due_at": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
            },
        ),
        "create document",
    )
    doc_id = created["id"]
    assigned = ok(
        client.post(
            f"/api/documents/{doc_id}/assign",
            headers=manager,
            json={"assignee_ids": [staff_user["id"]], "instruction": "Làm và gửi lại manager", "priority": "normal", "due_at": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()},
        ),
        "assign document",
    )
    assignment_id = assigned[0]["id"]

    staff_docs = ok(client.get("/api/documents?scope=my_tasks&search=CHECK-001", headers=staff), "staff docs")
    if not staff_docs["items"]:
        raise AssertionError("staff cannot see assigned document")
    ok(client.post(f"/api/assignments/{assignment_id}/start", headers=staff), "start assignment")
    uploaded = ok(
        client.post(
            f"/api/documents/{doc_id}/attachments",
            headers=staff,
            data={"assignment_id": assignment_id},
            files={"file": ("ket_qua_xu_ly.txt", b"Ket qua xu ly", "text/plain")},
        ),
        "upload assignment result file",
    )
    if uploaded["assignment_id"] != assignment_id:
        raise AssertionError("result file was not linked to assignment")
    ok(client.post(f"/api/assignments/{assignment_id}/submit", headers=staff, json={"result_note": "Đã xử lý xong"}), "submit assignment")
    detail = ok(client.get(f"/api/documents/{doc_id}", headers=manager), "manager detail")
    if detail["status"] != "submitted":
        raise AssertionError("document was not moved to submitted status")
    result_files = [item for item in detail["attachments"] if item["assignment_id"] == assignment_id]
    if not result_files:
        raise AssertionError("manager cannot see assignment result file")
    ok(client.post(f"/api/assignments/{assignment_id}/approve", headers=manager, json={"note": "Đạt yêu cầu"}), "approve assignment")
    detail = ok(client.get(f"/api/documents/{doc_id}", headers=manager), "manager detail after approve")
    if detail["status"] != "completed":
        raise AssertionError("document not completed after manager approval")

    status(client.post("/api/documents", headers=staff, json={"title": "Staff cannot create"}), 403, "staff create blocked")

    status(client.delete(f"/api/documents/{doc_id}", headers=manager), 204, "delete document")

    print("Simple manager/staff regression OK")


if __name__ == "__main__":
    main()
