from datetime import datetime, timedelta, timezone
import os
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import storage
from app.core.config import settings
from app.core.database import get_db
from app.core.deps import require_superadmin


class EmptyResult:
    def all(self):
        return []


class EmptySession:
    def execute(self, statement):
        return EmptyResult()


def build_test_client() -> TestClient:
    app = FastAPI()
    app.include_router(storage.router, prefix="/api")
    app.dependency_overrides[get_db] = lambda: EmptySession()
    app.dependency_overrides[require_superadmin] = lambda: SimpleNamespace(role="superadmin")
    return TestClient(app)


def test_storage_endpoints_report_and_cleanup_old_orphans(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "local_storage_path", str(tmp_path))
    orphan = tmp_path / "documents" / "old-orphan.txt"
    orphan.parent.mkdir(parents=True)
    orphan.write_bytes(b"orphan")
    old_time = (datetime.now(timezone.utc) - timedelta(hours=25)).timestamp()
    os.utime(orphan, (old_time, old_time))

    with build_test_client() as client:
        stats_response = client.get("/api/storage/stats")
        assert stats_response.status_code == 200
        assert stats_response.json()["cleanup_eligible_files"] == 1

        confirmation_response = client.post("/api/storage/cleanup", json={"confirm": False})
        assert confirmation_response.status_code == 400

        cleanup_response = client.post("/api/storage/cleanup", json={"confirm": True})
        assert cleanup_response.status_code == 200
        assert cleanup_response.json()["deleted_files"] == 1
        assert cleanup_response.json()["stats"]["total_files"] == 0
        assert not orphan.exists()