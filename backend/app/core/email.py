from email.message import EmailMessage
from html import escape
import logging

try:
    import aiosmtplib
except ModuleNotFoundError:
    aiosmtplib = None

try:
    import httpx
except ModuleNotFoundError:
    httpx = None

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_email(to_email: str, subject: str, html_content: str) -> bool:
    """Send notification email without raising into request handlers."""
    if not settings.email_enabled:
        return False

    if settings.resend_api_key and httpx:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {settings.resend_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": f"{settings.smtp_from_name} <{settings.smtp_from_email}>",
                        "to": to_email,
                        "subject": subject,
                        "html": html_content,
                    },
                    timeout=15.0,
                )
                if response.status_code in (200, 201):
                    return True
                logger.warning("Resend API error for %s: %s", to_email, response.text)
        except Exception as exc:
            logger.warning("Resend API failed for %s: %s", to_email, exc)

    if not settings.smtp_host or not settings.smtp_username:
        return False
    if aiosmtplib is None:
        logger.warning("SMTP dependency aiosmtplib is not installed")
        return False

    message = EmailMessage()
    message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content("Vui lòng bật chế độ xem HTML để đọc email này.")
    message.add_alternative(html_content, subtype="html")

    try:
        use_ssl = settings.smtp_port == 465
        await aiosmtplib.send(
            message,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_username,
            password=settings.smtp_password,
            use_tls=use_ssl,
            start_tls=not use_ssl,
            timeout=30,
        )
        return True
    except Exception as exc:
        logger.warning("SMTP failed for %s: %s", to_email, exc)
        return False


def build_email_html(title: str, body_html: str) -> str:
    return f"""
    <html>
    <body style="font-family: 'Segoe UI', Tahoma, sans-serif; line-height: 1.6;
                 color: #334155; background: #f1f5f9; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: #fff;
                  padding: 30px; border-radius: 8px;
                  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
        <h2 style="color: #214b74; margin-top: 0;">{title}</h2>
        {body_html}
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0 20px;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
          Đây là email tự động từ Hệ thống Quản lý Văn bản, vui lòng không trả lời.
        </p>
      </div>
    </body>
    </html>
    """


def link_button(url: str, label: str = "Mở hệ thống") -> str:
    safe_url = escape(url)
    return f"""
    <p style="margin: 20px 0;">
      <a href="{safe_url}" style="display: inline-block; background: #1d6ef0; color: #fff;
         text-decoration: none; padding: 10px 16px; border-radius: 6px; font-weight: 700;">{escape(label)}</a>
    </p>
    """


def fmt_email_datetime(value: object) -> str:
    if not value:
        return "Không có"
    return str(value)


def email_account_created(full_name: str, email: str, temporary_password: str, role_label: str, frontend_url: str) -> tuple[str, str]:
    subject = "[Tài khoản] Thông tin đăng nhập hệ thống quản lý văn bản"
    body = f"""
    <p>Chào <strong>{escape(full_name)}</strong>,</p>
    <p>Tài khoản {escape(role_label)} của bạn đã được tạo trên hệ thống quản lý văn bản.</p>
    <div style="background: #f8fafc; padding: 15px; border-left: 4px solid #1d6ef0; border-radius: 0 4px 4px 0; margin: 15px 0;">
      <p style="margin: 0 0 8px;"><strong>Email đăng nhập:</strong> {escape(email)}</p>
      <p style="margin: 0;"><strong>Mật khẩu tạm:</strong> {escape(temporary_password)}</p>
    </div>
    <p>Vui lòng đăng nhập và đổi mật khẩu trong lần sử dụng đầu tiên.</p>
    {link_button(frontend_url, "Đăng nhập hệ thống")}
    """
    return subject, build_email_html("Thông tin tài khoản", body)


def email_password_reset(full_name: str, email: str, temporary_password: str, frontend_url: str) -> tuple[str, str]:
    subject = "[Mật khẩu] Mật khẩu tạm mới"
    body = f"""
    <p>Chào <strong>{escape(full_name)}</strong>,</p>
    <p>Quản lý đã đặt lại mật khẩu cho tài khoản của bạn.</p>
    <div style="background: #f8fafc; padding: 15px; border-left: 4px solid #f59e0b; border-radius: 0 4px 4px 0; margin: 15px 0;">
      <p style="margin: 0 0 8px;"><strong>Email đăng nhập:</strong> {escape(email)}</p>
      <p style="margin: 0;"><strong>Mật khẩu tạm:</strong> {escape(temporary_password)}</p>
    </div>
    <p>Vui lòng đăng nhập và đổi mật khẩu ngay sau khi vào hệ thống.</p>
    {link_button(frontend_url, "Đăng nhập hệ thống")}
    """
    return subject, build_email_html("Mật khẩu tạm mới", body)


def email_assignment_created(doc_title: str, doc_code: str | None, instruction: str | None, due_date: str | None, frontend_url: str) -> tuple[str, str]:
    subject = f"[Giao việc] {doc_code or ''} - {doc_title}"
    body = f"""
    <p>Bạn được giao xử lý văn bản:</p>
    <div style="background: #f8fafc; padding: 15px; border-left: 4px solid #1d6ef0;
                border-radius: 0 4px 4px 0; margin: 15px 0;">
      <p style="margin: 0 0 8px;"><strong>Số hiệu/ký hiệu:</strong> {escape(doc_code or 'Không có')}</p>
      <p style="margin: 0 0 8px;"><strong>Trích yếu:</strong> {escape(doc_title)}</p>
      <p style="margin: 0 0 8px;"><strong>Hạn xử lý:</strong> {escape(due_date or 'Không có')}</p>
      {f'<p style="margin: 0;"><strong>Nội dung giao:</strong> {escape(instruction)}</p>' if instruction else ''}
    </div>
    <p>File gốc được lưu trong hệ thống. Vui lòng đăng nhập để xem chi tiết và xử lý.</p>
    {link_button(frontend_url)}
    """
    return subject, build_email_html("Bạn được giao văn bản mới", body)


def email_assignment_submitted(doc_title: str, doc_code: str | None, staff_name: str, result_note: str | None, frontend_url: str) -> tuple[str, str]:
    subject = f"[Đã gửi lại] {doc_code or ''} - {staff_name} đã xử lý"
    body = f"""
    <p>Nhân viên <strong>{staff_name}</strong> đã gửi lại kết quả xử lý văn bản:</p>
    <div style="background: #f8fafc; padding: 15px; border-left: 4px solid #16a34a;
                border-radius: 0 4px 4px 0; margin: 15px 0;">
      <p style="margin: 0 0 8px;"><strong>Số hiệu/ký hiệu:</strong> {escape(doc_code or 'Không có')}</p>
      <p style="margin: 0 0 8px;"><strong>Trích yếu:</strong> {escape(doc_title)}</p>
      {f'<p style="margin: 0;"><strong>Ghi chú kết quả:</strong> {escape(result_note)}</p>' if result_note else ''}
    </div>
    <p>Vui lòng đăng nhập để xem chi tiết và chốt hoàn tất:</p>
    {link_button(frontend_url)}
    """
    return subject, build_email_html("Nhân viên đã gửi lại văn bản", body)


def email_assignment_approved(doc_title: str, doc_code: str | None, reviewer_name: str, note: str | None, frontend_url: str) -> tuple[str, str]:
    subject = f"[Đã duyệt] {doc_code or ''} - {doc_title}"
    body = f"""
    <p>Kết quả xử lý văn bản của bạn đã được <strong>{escape(reviewer_name)}</strong> duyệt.</p>
    <div style="background: #f0fdf4; padding: 15px; border-left: 4px solid #16a34a;
                border-radius: 0 4px 4px 0; margin: 15px 0;">
      <p style="margin: 0 0 8px;"><strong>Số hiệu/ký hiệu:</strong> {escape(doc_code or 'Không có')}</p>
      <p style="margin: 0 0 8px;"><strong>Trích yếu:</strong> {escape(doc_title)}</p>
      {f'<p style="margin: 0;"><strong>Ghi chú duyệt:</strong> {escape(note)}</p>' if note else ''}
    </div>
    {link_button(frontend_url, "Xem văn bản")}
    """
    return subject, build_email_html("Kết quả đã được duyệt", body)


def email_assignment_returned(doc_title: str, doc_code: str | None, reviewer_name: str, note: str, frontend_url: str) -> tuple[str, str]:
    subject = f"[Trả về] {doc_code or ''} - {doc_title}"
    body = f"""
    <p>Kết quả xử lý văn bản của bạn đã được <strong>{escape(reviewer_name)}</strong> trả về để bổ sung.</p>
    <div style="background: #fff7ed; padding: 15px; border-left: 4px solid #f97316;
                border-radius: 0 4px 4px 0; margin: 15px 0;">
      <p style="margin: 0 0 8px;"><strong>Số hiệu/ký hiệu:</strong> {escape(doc_code or 'Không có')}</p>
      <p style="margin: 0 0 8px;"><strong>Trích yếu:</strong> {escape(doc_title)}</p>
      <p style="margin: 0;"><strong>Lý do/ghi chú:</strong> {escape(note)}</p>
    </div>
    <p>Vui lòng đăng nhập để chỉnh sửa ghi chú hoặc bổ sung file kết quả rồi gửi lại.</p>
    {link_button(frontend_url, "Cập nhật kết quả")}
    """
    return subject, build_email_html("Kết quả cần bổ sung", body)


def email_staff_reminder(kind_label: str, doc_title: str, doc_code: str | None, staff_name: str, due_at: str, frontend_url: str) -> tuple[str, str]:
    subject = f"[{kind_label}] {doc_code or ''} - {doc_title}"
    body = f"""
    <p>Chào <strong>{escape(staff_name)}</strong>,</p>
    <p>Hệ thống nhắc bạn xử lý văn bản sau:</p>
    <div style="background: #fef2f2; padding: 15px; border-left: 4px solid #dc2626; border-radius: 0 4px 4px 0; margin: 15px 0;">
      <p style="margin: 0 0 8px;"><strong>Số hiệu/ký hiệu:</strong> {escape(doc_code or 'Không có')}</p>
      <p style="margin: 0 0 8px;"><strong>Trích yếu:</strong> {escape(doc_title)}</p>
      <p style="margin: 0;"><strong>Hạn hoàn thành:</strong> {escape(due_at)}</p>
    </div>
    <p>Vui lòng đăng nhập hệ thống để cập nhật kết quả xử lý.</p>
    {link_button(frontend_url)}
    """
    return subject, build_email_html(kind_label, body)


def email_manager_digest(title: str, summary_html: str) -> tuple[str, str]:
    return f"[Tổng hợp] {title}", build_email_html(title, summary_html)


def email_document_completed(doc_title: str, doc_code: str | None, frontend_url: str) -> tuple[str, str]:
    subject = f"[Hoàn tất] {doc_code or ''} - {doc_title}"
    body = f"""
    <p>Văn bản đã được quản lý chốt <strong>hoàn tất</strong>:</p>
    <div style="background: #f8fafc; padding: 15px; border-left: 4px solid #16a34a;
                border-radius: 0 4px 4px 0; margin: 15px 0;">
      <p style="margin: 0 0 8px;"><strong>Mã:</strong> {doc_code or 'Không có'}</p>
      <p style="margin: 0;"><strong>Tên:</strong> {doc_title}</p>
    </div>
    <p><a href="{frontend_url}" style="color: #1d6ef0;">Xem chi tiết</a></p>
    """
    return subject, build_email_html("Văn bản đã hoàn tất", body)


def email_document_deleted(doc_title: str, doc_code: str | None, staff_name: str) -> tuple[str, str]:
    subject = f"[Thu hồi] {doc_code or ''} - {doc_title}"
    body = f"""
    <p>Chào <strong>{escape(staff_name)}</strong>,</p>
    <p>Văn bản sau đã bị quản lý <strong>thu hồi/hủy</strong>. Bạn không cần xử lý nữa.</p>
    <div style="background: #fef2f2; padding: 15px; border-left: 4px solid #dc2626;
                border-radius: 0 4px 4px 0; margin: 15px 0;">
      <p style="margin: 0 0 8px;"><strong>Số hiệu/ký hiệu:</strong> {escape(doc_code or 'Không có')}</p>
      <p style="margin: 0;"><strong>Trích yếu:</strong> {escape(doc_title)}</p>
    </div>
    <p>Nếu bạn có thắc mắc, vui lòng liên hệ quản lý trực tiếp.</p>
    """
    return subject, build_email_html("Văn bản đã bị thu hồi", body)
