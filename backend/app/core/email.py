from email.message import EmailMessage

from app.core.config import settings


async def send_email(to_email: str, subject: str, body: str) -> None:
    if not settings.email_enabled or not settings.smtp_host:
        return
    try:
        import aiosmtplib
    except ModuleNotFoundError:
        return

    message = EmailMessage()
    message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    await aiosmtplib.send(
        message,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_username or None,
        password=settings.smtp_password or None,
        start_tls=settings.smtp_use_tls,
    )


def assignment_email_body(title: str, link: str, note: str | None = None) -> str:
    lines = [
        f"Ban duoc giao xu ly van ban: {title}",
        "",
        "Vui long dang nhap he thong de xem chi tiet va file dinh kem:",
        link,
    ]
    if note:
        lines.extend(["", f"Ghi chu: {note}"])
    return "\n".join(lines)
