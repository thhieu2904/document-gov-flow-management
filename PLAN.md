# Plan MVP Hệ Thống Quản Lý Luồng Xử Lý Văn Bản

## Summary

Xây app mới từ đầu theo **Hướng 3**:

```text
React Vite TS trên Vercel
FastAPI backend chạy Docker trên máy nội bộ
Supabase Auth + Supabase PostgreSQL
Cloudflare R2 private cho file
Cloudflare Tunnel public backend API
```

App tập trung vào **quản lý văn bản**, gồm văn bản đến, văn bản đi, và nhiệm vụ phát sinh từ văn bản. Code/schema dùng tiếng Anh; UI, trạng thái, email và dữ liệu mẫu dùng tiếng Việt.

Source tham khảo `src-tham-khao` chỉ dùng để đọc kinh nghiệm, không phát triển trực tiếp. Các file draft đã lỡ tạo ở root trước đó sẽ được thay thế bằng cấu trúc sạch khi bắt đầu implement.

## Key Changes

- Frontend:
  - React + Vite + TypeScript, deploy được lên Vercel.
  - UI nghiệp vụ tiếng Việt: đăng nhập, dashboard, danh sách văn bản, chi tiết văn bản, tạo văn bản, phân công, task con, bình luận, file, lịch sử xử lý, quản trị user/phòng ban.
  - Giao diện theo app nội bộ: gọn, dễ scan, ưu tiên bảng, filter, form, trạng thái.

- Backend:
  - FastAPI + SQLAlchemy + Alembic.
  - Supabase Auth cho đăng nhập/token.
  - Backend lưu profile, role, phòng ban, quyền workflow trong PostgreSQL.
  - Admin tạo user trong UI, đặt mật khẩu tạm; user bắt buộc đổi mật khẩu lần đầu.
  - SMTP cơ bản để gửi email khi được giao việc, bị trả lại, chờ duyệt, gần/quá hạn.

- Data model chính:
  - `users`, `roles`, `departments`
  - `documents`: văn bản đến / văn bản đi / văn bản nội bộ xử lý
  - `document_assignments`: giao/chuyển xử lý, gồm vai trò `primary`, `collaborator`, `informed`
  - `document_tasks`: task con phát sinh từ văn bản
  - `comments`, `attachments`, `status_logs`, `audit_logs`, `notifications`
  - File chỉ lưu metadata trong DB; nội dung file nằm ở R2 private.

- Workflow:
  - Văn bản đến: mới tạo → trình lãnh đạo → đã giao xử lý → phòng ban tiếp nhận → đang xử lý → chờ duyệt → hoàn thành → lưu trữ.
  - Nhánh trả lại: chờ duyệt → yêu cầu chỉnh sửa → đang xử lý lại.
  - Văn bản đi: dự thảo → chờ phát hành → đã phát hành → lưu hồ sơ.
  - Task con: được giao → đang xử lý → chờ duyệt hoặc hoàn thành → yêu cầu chỉnh sửa nếu bị trả lại.
  - MVP cho phép “người đang được giao” hoàn thành theo nhu cầu hiện tại, nhưng rule nằm trong workflow service để sau này đổi sang bắt buộc trưởng/phó phòng hoặc lãnh đạo duyệt mà không sửa sâu.

- Phân quyền:
  - Role mặc định: `admin`, `records_clerk`, `leadership`, `department_manager`, `staff`, `viewer`.
  - Admin quản trị toàn hệ thống.
  - Văn thư tạo/tiếp nhận văn bản, đính kèm file, trình lãnh đạo.
  - Lãnh đạo xem phạm vi phù hợp, giao phòng ban/người xử lý, chuyển ngoại lệ.
  - Trưởng/phó phòng xem văn bản thuộc phòng, phân task cho chuyên viên, kiểm tra/trả lại/hoàn thành trong phạm vi.
  - Chuyên viên xem việc liên quan, cập nhật tiến độ, phản hồi, upload kết quả.
  - Viewer chỉ xem văn bản được cấp quyền/xem để biết.
  - Backend kiểm quyền cho mọi API, kể cả tải file.

- File R2:
  - R2 bucket private.
  - Upload/download đi qua backend.
  - Backend kiểm đăng nhập, quyền văn bản/task, ghi audit rồi stream file về người dùng.
  - Không dùng link public R2 trong MVP.

- Deploy:
  - `frontend` deploy Vercel.
  - `backend` đóng Docker image, chạy trên máy nội bộ.
  - Cloudflare Tunnel trỏ `api.domain.com` về container backend.
  - CORS chỉ mở cho domain frontend chính thức.
  - Config qua `.env`: Supabase URL/keys, database URL, R2 credentials, SMTP, frontend URL, JWT/Supabase settings.

## Public Interfaces

- Auth:
  - `POST /api/auth/login`
  - `POST /api/auth/change-password`
  - `GET /api/auth/me`

- Admin:
  - `GET/POST/PATCH /api/users`
  - `GET/POST/PATCH /api/departments`
  - `GET /api/roles`

- Documents:
  - `GET/POST /api/documents`
  - `GET/PATCH /api/documents/{id}`
  - `POST /api/documents/{id}/submit`
  - `POST /api/documents/{id}/assign`
  - `POST /api/documents/{id}/status`
  - `POST /api/documents/{id}/archive`

- Tasks:
  - `GET/POST /api/documents/{id}/tasks`
  - `PATCH /api/tasks/{task_id}`
  - `POST /api/tasks/{task_id}/assign`
  - `POST /api/tasks/{task_id}/status`

- Collaboration and audit:
  - `POST /api/documents/{id}/comments`
  - `GET /api/documents/{id}/timeline`
  - `GET /api/notifications`

- Files:
  - `POST /api/documents/{id}/attachments`
  - `POST /api/tasks/{task_id}/attachments`
  - `GET /api/attachments/{id}/download`

## Test Plan

- Backend tests:
  - Login bằng Supabase token mock/fixture.
  - Admin tạo user, set role/phòng ban, bắt buộc đổi mật khẩu lần đầu.
  - Permission matrix cho từng role.
  - Văn thư tạo văn bản đến, trình lãnh đạo, lãnh đạo giao phòng ban.
  - Trưởng/phó phòng tạo task con, giao xử lý chính/phối hợp/xem để biết.
  - Chuyên viên phản hồi, upload file, hoàn thành hoặc gửi chờ duyệt.
  - Người không liên quan không xem/tải được file.
  - Audit log có đủ tạo, giao, chuyển, đổi trạng thái, upload, download.
  - SMTP dùng mock provider trong test.
  - R2 dùng mock S3-compatible client trong test.

- Frontend tests:
  - Build Vite thành công.
  - Smoke flow: login → dashboard → tạo văn bản → giao xử lý → xem chi tiết → upload/tải file.
  - Kiểm tra UI theo role: admin thấy quản trị, staff chỉ thấy việc liên quan, viewer không thấy nút sửa.
  - Kiểm tra responsive cơ bản desktop/mobile.

## Assumptions

- MVP dùng **Supabase Auth**, nhưng toàn bộ thao tác tạo user/quyền diễn ra trong UI app.
- Admin đặt mật khẩu tạm; hệ thống không gửi mật khẩu plain text qua email mặc định.
- Phòng ban MVP là mô hình phẳng, có trưởng/phó và thành viên.
- Văn bản đi MVP chỉ theo dõi phát hành, chưa làm quy trình duyệt phức tạp.
- File giới hạn mặc định cấu hình qua env, chặn file thực thi nguy hiểm, cho phép PDF/Office/image/zip.
- Email dùng SMTP cơ bản trước; template chỉnh sửa nâng cao và báo cáo email chi tiết để giai đoạn sau.
