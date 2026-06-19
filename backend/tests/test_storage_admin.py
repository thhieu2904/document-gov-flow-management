from datetime import datetime, timedelta, timezone
import os

from app.core.storage_admin import (
    StorageReference,
    cleanup_orphan_files,
    resolve_storage_key,
    scan_local_storage,
)


def test_storage_scan_classifies_referenced_orphan_and_missing_files(tmp_path):
    now = datetime(2026, 6, 20, 12, 0, tzinfo=timezone.utc)
    valid = tmp_path / "documents" / "valid.txt"
    old_orphan = tmp_path / "documents" / "old-orphan.txt"
    new_orphan = tmp_path / "documents" / "new-orphan.txt"
    valid.parent.mkdir(parents=True)
    valid.write_bytes(b"valid")
    old_orphan.write_bytes(b"old")
    new_orphan.write_bytes(b"new")
    old_time = (now - timedelta(hours=25)).timestamp()
    new_time = (now - timedelta(hours=1)).timestamp()
    os.utime(old_orphan, (old_time, old_time))
    os.utime(new_orphan, (new_time, new_time))

    scan = scan_local_storage(
        tmp_path,
        [
            StorageReference("documents/valid.txt", 5),
            StorageReference("documents/missing.txt", 12),
        ],
        now=now,
    )

    stats = scan.to_dict()
    assert stats["total_files"] == 3
    assert stats["total_size_bytes"] == 11
    assert stats["referenced_files"] == 1
    assert stats["referenced_size_bytes"] == 5
    assert stats["orphan_files"] == 2
    assert stats["cleanup_eligible_files"] == 1
    assert stats["missing_files"] == 1
    assert stats["missing_expected_size_bytes"] == 12


def test_cleanup_only_removes_old_orphan_files(tmp_path):
    now = datetime(2026, 6, 20, 12, 0, tzinfo=timezone.utc)
    old_orphan = tmp_path / "old.txt"
    new_orphan = tmp_path / "new.txt"
    old_orphan.write_bytes(b"old")
    new_orphan.write_bytes(b"new")
    old_time = (now - timedelta(hours=25)).timestamp()
    new_time = (now - timedelta(hours=1)).timestamp()
    os.utime(old_orphan, (old_time, old_time))
    os.utime(new_orphan, (new_time, new_time))

    result = cleanup_orphan_files(scan_local_storage(tmp_path, [], now=now))

    assert result["deleted_files"] == 1
    assert result["deleted_size_bytes"] == 3
    assert not old_orphan.exists()
    assert new_orphan.exists()


def test_storage_key_cannot_escape_upload_directory(tmp_path):
    assert resolve_storage_key(tmp_path, "../secret.txt") is None
    assert resolve_storage_key(tmp_path, "/absolute.txt") is None
    assert resolve_storage_key(tmp_path, "documents/safe.txt") == (tmp_path / "documents" / "safe.txt").resolve()