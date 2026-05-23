from uuid import uuid4
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.constants import ALLOWED_UPLOAD_EXTENSIONS
from app.core.config import settings


def sanitize_filename(filename: str) -> str:
    cleaned = "".join(char if char.isalnum() or char in "._- " else "_" for char in filename).strip()
    return cleaned.replace(" ", "_") or "file"


def validate_upload(filename: str, size: int) -> None:
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Dinh dang file khong duoc ho tro")
    if size > settings.max_upload_bytes:
        raise HTTPException(status_code=400, detail=f"File vuot qua gioi han {settings.max_upload_mb}MB")


class StorageProvider:
    async def save(self, file: UploadFile, prefix: str) -> tuple[str, int]:
        raise NotImplementedError

    def open_for_read(self, storage_key: str):
        raise NotImplementedError

    def delete(self, storage_key: str) -> None:
        raise NotImplementedError


class R2StorageProvider(StorageProvider):
    def __init__(self) -> None:
        if not all([settings.r2_endpoint_url, settings.r2_access_key_id, settings.r2_secret_access_key, settings.r2_bucket]):
            raise RuntimeError("R2 storage requires endpoint, access key, secret key, and bucket")
        import boto3
        from botocore.client import Config

        self.client = boto3.client(
            "s3",
            endpoint_url=settings.r2_endpoint_url,
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )

    async def save(self, file: UploadFile, prefix: str) -> tuple[str, int]:
        content = await file.read()
        validate_upload(file.filename or "file", len(content))
        safe_name = sanitize_filename(file.filename or "file")
        key = f"{prefix}/{uuid4().hex}_{safe_name}"
        self.client.put_object(
            Bucket=settings.r2_bucket,
            Key=key,
            Body=content,
            ContentType=file.content_type or "application/octet-stream",
        )
        return key, len(content)

    def open_for_read(self, storage_key: str):
        try:
            obj = self.client.get_object(Bucket=settings.r2_bucket, Key=storage_key)
        except Exception as exc:
            raise HTTPException(status_code=404, detail="File khong ton tai") from exc
        return obj["Body"]

    def delete(self, storage_key: str) -> None:
        self.client.delete_object(Bucket=settings.r2_bucket, Key=storage_key)


class LocalStorageProvider(StorageProvider):
    def __init__(self) -> None:
        self.base_path = Path(getattr(settings, "local_storage_path", "") or "uploads").resolve()
        self.base_path.mkdir(parents=True, exist_ok=True)

    async def save(self, file: UploadFile, prefix: str) -> tuple[str, int]:
        content = await file.read()
        validate_upload(file.filename or "file", len(content))
        safe_name = sanitize_filename(file.filename or "file")
        key = f"{prefix}/{uuid4().hex}_{safe_name}"
        target = (self.base_path / key).resolve()
        if not str(target).startswith(str(self.base_path)):
            raise HTTPException(status_code=400, detail="Duong dan file khong hop le")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return key, len(content)

    def open_for_read(self, storage_key: str):
        target = (self.base_path / storage_key).resolve()
        if not str(target).startswith(str(self.base_path)) or not target.exists():
            raise HTTPException(status_code=404, detail="File khong ton tai")
        return target.open("rb")

    def delete(self, storage_key: str) -> None:
        target = (self.base_path / storage_key).resolve()
        if str(target).startswith(str(self.base_path)) and target.exists():
            target.unlink()


def get_storage_provider(provider: str | None = None) -> StorageProvider:
    actual = provider or settings.storage_provider
    if actual == "r2":
        return R2StorageProvider()
    if actual == "local":
        return LocalStorageProvider()
    raise RuntimeError("Unsupported storage provider.")
