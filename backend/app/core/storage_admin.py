from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path, PurePosixPath
from typing import Iterable


MINIMUM_ORPHAN_AGE_HOURS = 24


@dataclass(frozen=True)
class StorageReference:
    key: str
    expected_size: int


@dataclass(frozen=True)
class StorageFile:
    key: str
    path: Path
    size: int
    modified_at: datetime
    cleanup_eligible: bool


@dataclass(frozen=True)
class StorageScan:
    base_path: Path
    scanned_at: datetime
    writable: bool
    total_files: int
    total_size_bytes: int
    referenced_files: int
    referenced_size_bytes: int
    orphan_files: tuple[StorageFile, ...]
    missing_files: int
    missing_expected_size_bytes: int
    scan_errors: tuple[str, ...]

    @property
    def cleanup_candidates(self) -> tuple[StorageFile, ...]:
        return tuple(item for item in self.orphan_files if item.cleanup_eligible)

    def to_dict(self) -> dict:
        candidates = self.cleanup_candidates
        return {
            "scanned_at": self.scanned_at.isoformat(),
            "writable": self.writable,
            "minimum_orphan_age_hours": MINIMUM_ORPHAN_AGE_HOURS,
            "total_files": self.total_files,
            "total_size_bytes": self.total_size_bytes,
            "referenced_files": self.referenced_files,
            "referenced_size_bytes": self.referenced_size_bytes,
            "orphan_files": len(self.orphan_files),
            "orphan_size_bytes": sum(item.size for item in self.orphan_files),
            "cleanup_eligible_files": len(candidates),
            "cleanup_eligible_size_bytes": sum(item.size for item in candidates),
            "missing_files": self.missing_files,
            "missing_expected_size_bytes": self.missing_expected_size_bytes,
            "scan_errors": list(self.scan_errors),
        }


def normalize_storage_key(storage_key: str) -> str | None:
    normalized = storage_key.replace("\\", "/").strip()
    path = PurePosixPath(normalized)
    if not normalized or path.is_absolute() or ".." in path.parts:
        return None
    return path.as_posix()


def resolve_storage_key(base_path: Path, storage_key: str) -> Path | None:
    normalized = normalize_storage_key(storage_key)
    if normalized is None:
        return None
    target = (base_path / normalized).resolve()
    try:
        target.relative_to(base_path)
    except ValueError:
        return None
    return target


def scan_local_storage(
    base_path: Path,
    references: Iterable[StorageReference],
    *,
    now: datetime | None = None,
) -> StorageScan:
    base_path = base_path.resolve()
    base_path.mkdir(parents=True, exist_ok=True)
    scanned_at = now or datetime.now(timezone.utc)
    cleanup_cutoff = scanned_at - timedelta(hours=MINIMUM_ORPHAN_AGE_HOURS)
    errors: list[str] = []
    physical_files: dict[str, StorageFile] = {}

    def record_walk_error(exc: OSError) -> None:
        errors.append(str(exc))

    for root, directories, filenames in os.walk(base_path, topdown=True, followlinks=False, onerror=record_walk_error):
        root_path = Path(root)
        directories[:] = [name for name in directories if not (root_path / name).is_symlink()]
        for filename in filenames:
            path = root_path / filename
            try:
                if path.is_symlink() or not path.is_file():
                    continue
                stat = path.stat()
                key = path.relative_to(base_path).as_posix()
                modified_at = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
                physical_files[key] = StorageFile(
                    key=key,
                    path=path,
                    size=stat.st_size,
                    modified_at=modified_at,
                    cleanup_eligible=modified_at <= cleanup_cutoff,
                )
            except OSError as exc:
                errors.append(f"{path}: {exc}")

    reference_sizes: dict[str, int] = {}
    invalid_references: list[StorageReference] = []
    for reference in references:
        normalized = normalize_storage_key(reference.key)
        target = resolve_storage_key(base_path, reference.key)
        if normalized is None or target is None:
            invalid_references.append(reference)
            continue
        reference_sizes[normalized] = max(reference_sizes.get(normalized, 0), reference.expected_size or 0)

    referenced_keys = set(reference_sizes)
    physical_keys = set(physical_files)
    valid_keys = referenced_keys & physical_keys
    missing_keys = referenced_keys - physical_keys
    orphan_keys = physical_keys - referenced_keys
    missing_expected_size = sum(reference_sizes[key] for key in missing_keys)
    missing_expected_size += sum(max(item.expected_size, 0) for item in invalid_references)

    return StorageScan(
        base_path=base_path,
        scanned_at=scanned_at,
        writable=os.access(base_path, os.W_OK),
        total_files=len(physical_files),
        total_size_bytes=sum(item.size for item in physical_files.values()),
        referenced_files=len(valid_keys),
        referenced_size_bytes=sum(physical_files[key].size for key in valid_keys),
        orphan_files=tuple(physical_files[key] for key in sorted(orphan_keys)),
        missing_files=len(missing_keys) + len(invalid_references),
        missing_expected_size_bytes=missing_expected_size,
        scan_errors=tuple(errors),
    )


def cleanup_orphan_files(scan: StorageScan) -> dict:
    deleted_files = 0
    deleted_size_bytes = 0
    skipped_files = 0
    errors: list[dict[str, str]] = []
    cutoff = scan.scanned_at - timedelta(hours=MINIMUM_ORPHAN_AGE_HOURS)

    for candidate in scan.cleanup_candidates:
        target = resolve_storage_key(scan.base_path, candidate.key)
        if target is None:
            skipped_files += 1
            continue
        try:
            if target.is_symlink() or not target.is_file():
                skipped_files += 1
                continue
            stat = target.stat()
            modified_at = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
            if modified_at > cutoff:
                skipped_files += 1
                continue
            size = stat.st_size
            target.unlink()
            deleted_files += 1
            deleted_size_bytes += size
        except OSError as exc:
            errors.append({"key": candidate.key, "message": str(exc)})

    for root, directories, _ in os.walk(scan.base_path, topdown=False, followlinks=False):
        for directory in directories:
            path = Path(root) / directory
            if path == scan.base_path or path.is_symlink():
                continue
            try:
                path.rmdir()
            except OSError:
                pass

    return {
        "deleted_files": deleted_files,
        "deleted_size_bytes": deleted_size_bytes,
        "skipped_files": skipped_files,
        "failed_files": len(errors),
        "errors": errors[:20],
    }