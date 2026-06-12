import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any

from app.core.config import settings


CAPTCHA_EXPIRES_SECONDS = 300


def _secret() -> bytes:
    seed = settings.captcha_secret or settings.supabase_service_role_key or settings.database_url or settings.app_name
    return seed.encode("utf-8")


def _encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}")


def _signature(data: bytes) -> str:
    return _encode(hmac.new(_secret(), data, hashlib.sha256).digest())


def _answer_digest(captcha_id: str, expires_at: int, answer: str) -> str:
    message = f"{captcha_id}:{expires_at}:{answer}".encode("utf-8")
    return _encode(hmac.new(_secret(), message, hashlib.sha256).digest())


def create_captcha_challenge() -> dict[str, Any]:
    length = 4 + secrets.randbelow(3)
    code = "".join(secrets.choice("0123456789") for _ in range(length))
    captcha_id = secrets.token_urlsafe(12)
    expires_at = int(time.time()) + CAPTCHA_EXPIRES_SECONDS
    payload = {
        "captcha_id": captcha_id,
        "expires_at": expires_at,
        "answer_digest": _answer_digest(captcha_id, expires_at, code),
    }
    raw_payload = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    token = f"{_encode(raw_payload)}.{_signature(raw_payload)}"
    return {
        "captcha_id": captcha_id,
        "captcha_code": code,
        "captcha_token": token,
        "expires_in_seconds": CAPTCHA_EXPIRES_SECONDS,
    }


def verify_captcha(token: str | None, answer: str | None) -> bool:
    if not token or not answer:
        return False
    try:
        raw_payload_text, signature = token.split(".", 1)
        raw_payload = _decode(raw_payload_text)
        expected_signature = _signature(raw_payload)
        if not hmac.compare_digest(signature, expected_signature):
            return False
        payload = json.loads(raw_payload.decode("utf-8"))
        expires_at = int(payload["expires_at"])
        if expires_at < int(time.time()):
            return False
        normalized_answer = answer.strip()
        expected_digest = _answer_digest(payload["captcha_id"], expires_at, normalized_answer)
        return hmac.compare_digest(payload["answer_digest"], expected_digest)
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return False
