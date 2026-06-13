# Document Flow Management

MVP quản lý văn bản nội bộ theo mô hình đơn giản:

```text
Quản lý tạo văn bản -> giao cho nhân viên -> nhân viên xử lý và gửi lại -> quản lý bấm hoàn tất
```

Ứng dụng dùng 3 vai trò nghiệp vụ:

- `superadmin`: quản trị toàn hệ thống, quản lý phòng ban/người dùng và xem dữ liệu toàn hệ thống.
- `manager`: tạo văn bản, đính kèm file, giao việc, xem tiến độ, hoàn tất văn bản, quản lý người dùng/phòng ban.
- `staff`: xem việc được giao, bắt đầu làm, upload file kết quả, gửi lại manager.

Không còn các khái niệm cũ như văn thư, văn bản đến/đi, trình ký, phát hành, phối hợp, xem để biết.

## Tech Stack

- Frontend: React, TypeScript, Vite, TailwindCSS, Lucide icons.
- Backend: FastAPI, SQLAlchemy, PostgreSQL local.
- Auth: JWT nội bộ, mật khẩu hash bằng PBKDF2.
- Storage: local filesystem, mount ra `runtime/uploads` khi chạy Docker.

## Chạy Local Bằng Docker

```powershell
docker compose up -d --build
```

Docker stack gồm:

- `postgres`: PostgreSQL, chỉ dùng nội bộ trong Docker.
- `backend`: FastAPI, chỉ dùng nội bộ trong Docker.
- `frontend`: web nội bộ ở `http://localhost` hoặc `http://<ten-may-server>`.

Người dùng trong cùng mạng cơ quan truy cập:

```text
http://<ten-may-server>
```

Ví dụ nếu máy server tên `QLVB-SERVER`:

```text
http://QLVB-SERVER
```

File upload được lưu ngoài container tại:

```text
runtime/uploads/
```

## Reset và Seed Demo

Lệnh này drop/recreate các bảng app và seed dữ liệu demo mới:

```powershell
docker compose exec backend python scripts/seed_demo.py
```

Tài khoản demo:

```text
thhieu2904@gmail.com / password123
nguyenvanquang.vms@gmail.com / password123
quanly.vanhanh@example.com / password123
quanly.taichinh@example.com / password123
nhanvien1@example.com / password123
nhanvien2@example.com / password123
nhanvien3@example.com / password123
```

## Kiểm Tra Regression

```powershell
docker compose exec backend python scripts/check_mvp.py
```

Check hiện tại bao phủ:

- Login manager/staff.
- Manager tạo văn bản.
- Manager giao cho staff.
- Staff thấy việc được giao.
- Staff bắt đầu và gửi lại.
- Document chuyển sang `submitted`.
- Manager duyệt và document hoàn tất.
- Staff bị chặn tạo văn bản.

## Vận Hành Mỗi Ngày

Trên máy server, chỉ cần mở Docker Desktop. Các container dùng `restart: unless-stopped`, nên Docker khởi động xong thì hệ thống tự chạy lại.

Nếu cần chạy thủ công:

```powershell
docker compose up -d
```

Không dùng `docker compose down` hằng ngày vì lệnh đó gỡ container khỏi Docker. Chỉ dùng khi bảo trì.

Máy server cần mở Windows Firewall port `80` cho mạng nội bộ.

## Cấu Trúc Chính

- `backend/app/models.py`: schema app role/phòng ban/văn bản/KPI.
- `backend/app/api/documents.py`: tạo/giao/xem/hoàn tất văn bản, comment, upload.
- `backend/app/api/assignments.py`: staff start/submit, manager approve/return assignment.
- `backend/app/api/dashboard.py`: dashboard tiến độ.
- `backend/app/api/kpi.py`: nhập/xem KPI.
- `backend/scripts/seed_demo.py`: reset schema và seed demo.
- `frontend/src/main.tsx`: UI MVP hiện tại.
