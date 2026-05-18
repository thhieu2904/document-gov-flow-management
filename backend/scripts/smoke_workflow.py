from pathlib import Path
import sys

from fastapi.testclient import TestClient

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.main import app


def assert_ok(response, label: str):
    if response.status_code >= 400:
        raise AssertionError(f"{label} failed: {response.status_code} {response.text}")
    return response.json()


def main() -> None:
    client = TestClient(app)

    login = assert_ok(
        client.post("/api/auth/login", json={"email": "vanthu@example.com", "password": "password123"}),
        "login",
    )
    headers = {"Authorization": f"Bearer {login['access_token']}"}

    dashboard = assert_ok(client.get("/api/dashboard", headers=headers), "dashboard")
    incoming = assert_ok(client.get("/api/documents/incoming?size=5", headers=headers), "incoming")
    outgoing = assert_ok(client.get("/api/documents/outgoing?queue=issued&size=5", headers=headers), "outgoing")
    progress = assert_ok(client.get("/api/progress?size=5", headers=headers), "progress")

    if not incoming["items"]:
        raise AssertionError("incoming list is empty")
    detail = assert_ok(client.get(f"/api/documents/{incoming['items'][0]['id']}", headers=headers), "detail")
    if detail["attachments"]:
        response = client.get(f"/api/attachments/{detail['attachments'][0]['id']}/download", headers=headers)
        if response.status_code >= 400:
            raise AssertionError(f"download failed: {response.status_code} {response.text}")

    created = assert_ok(
        client.post(
            "/api/documents/incoming/receive",
            headers=headers,
            json={
                "title": "Smoke test - văn bản tạm",
                "code": "SMOKE/TEST",
                "arrival_number": "SMOKE",
                "issuing_agency": "Hệ thống kiểm thử",
                "priority": "normal",
            },
        ),
        "create smoke document",
    )
    assignment = assert_ok(
        client.post(
            f"/api/documents/{created['id']}/assign",
            headers=headers,
            json={
                "receiver_user_id": login["user"]["id"],
                "assignment_role": "primary",
                "action_type": "assign",
                "instruction": "Assignment smoke test.",
                "priority": "normal",
            },
        ),
        "assign smoke document",
    )
    assert_ok(client.post(f"/api/assignments/{assignment['id']}/start", headers=headers), "start assignment")
    assert_ok(
        client.post(
            f"/api/assignments/{assignment['id']}/complete",
            headers=headers,
            json={"result_note": "Smoke test completed."},
        ),
        "complete assignment",
    )
    assert_ok(
        client.post(
            f"/api/documents/{created['id']}/void",
            headers=headers,
            json={"reason": "Dọn dữ liệu smoke test"},
        ),
        "void smoke document",
    )

    print("Smoke workflow OK")
    print(f"Dashboard documents: {dashboard['total_documents']}")
    print(f"Incoming sample: {incoming['items'][0]['code']}")
    print(f"Outgoing issued: {outgoing['total']}")
    print(f"Progress rows: {progress['total']}")


if __name__ == "__main__":
    main()
