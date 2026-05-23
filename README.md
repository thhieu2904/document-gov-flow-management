# Document Flow Management

MVP quản lý văn bản nội bộ theo mô hình đơn giản:

```text
Quản lý tạo văn bản -> giao cho nhân viên -> nhân viên xử lý và gửi lại -> quản lý bấm hoàn tất
```

Ứng dụng chỉ dùng 2 vai trò nghiệp vụ:

- `manager`: tạo văn bản, đính kèm file, giao việc, xem tiến độ, hoàn tất văn bản, quản lý người dùng/phòng ban.
- `staff`: xem việc được giao, bắt đầu làm, upload file kết quả, gửi lại manager.

Không còn các khái niệm cũ như văn thư, văn bản đến/đi, trình ký, phát hành, phối hợp, xem để biết.

## Tech Stack

- Frontend: React, TypeScript, Vite, TailwindCSS, Lucide icons.
- Backend: FastAPI, SQLAlchemy, Supabase Postgres/Auth.
- Storage: Cloudflare R2 hoặc local storage.

## Chạy Backend

```powershell
cd backend
conda run -p D:\env\conda\document-flow python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

`.env` cần có:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- R2 config nếu `STORAGE_PROVIDER=r2`

## Reset và Seed Demo

Lệnh này drop/recreate các bảng app và seed dữ liệu demo mới:

```powershell
cd backend
conda run -p D:\env\conda\document-flow python scripts\seed_demo.py
```

Tài khoản demo:

```text
manager@example.com / password123
nhanvien1@example.com / password123
nhanvien2@example.com / password123
nhanvien3@example.com / password123
```

## Kiểm Tra Regression

```powershell
cd backend
conda run -p D:\env\conda\document-flow python scripts\check_mvp.py
```

Check hiện tại bao phủ:

- Login manager/staff.
- Manager tạo văn bản.
- Manager giao cho staff.
- Staff thấy việc được giao.
- Staff bắt đầu và gửi lại.
- Document chuyển sang `submitted`.
- Manager hoàn tất.
- Staff bị chặn tạo văn bản.
- Progress search có dữ liệu.

## Chạy Frontend

```powershell
cd frontend
npm install
npm run dev
```

Mặc định frontend gọi API qua `/api`. Nếu chạy backend riêng host, cấu hình `VITE_API_BASE_URL`.

## Cấu Trúc Chính

- `backend/app/models.py`: schema app manager/staff.
- `backend/app/api/documents.py`: tạo/giao/xem/hoàn tất văn bản, comment, upload.
- `backend/app/api/assignments.py`: staff start/submit assignment.
- `backend/app/api/progress.py`: bảng tiến độ.
- `backend/scripts/seed_demo.py`: reset schema và seed demo.
- `frontend/src/main.tsx`: UI MVP hiện tại.
