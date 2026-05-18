# 📄 Document Flow Management

Hệ thống quản lý văn bản và điều hành công việc nội bộ (MVP). Được thiết kế để số hóa và tối ưu hóa quy trình luân chuyển giấy tờ truyền thống, tập trung giải quyết bài toán luân chuyển văn bản phức tạp qua nhiều cấp phòng ban, cá nhân với các vai trò độc lập (Xử lý chính, Phối hợp, Xem để biết).

---

## ✨ Tính năng nổi bật đã triển khai

- 🔀 **Luân chuyển linh hoạt (Tree-based Workflow):** Hỗ trợ phân nhánh xử lý dạng cây, cho phép một văn bản được phân công đồng thời tới nhiều người/phòng ban qua các Assignment độc lập.
- 🔐 **Phân quyền động (Assignment-based RBAC):** Quyền thao tác và cập nhật trạng thái được xác định bằng vai trò trong từng văn bản (Primary, Collaborator, Informed) thay vì bị đóng cứng theo chức vụ hệ thống.
- 📊 **Theo dõi tiến độ toàn diện:** 
  - Vòng đời văn bản (Đến, Đi, Nội bộ) với nhiều trạng thái.
  - Tiến trình xử lý (Dashboard & Progress module) cho từng user/department (Pending, In Progress, Completed).
- ☁️ **Lưu trữ bảo mật (Cloudflare R2):** Tích hợp S3-compatible storage. Backend tự động kiểm tra phân quyền (RBAC) trước khi stream file về cho client (Presigned/Proxy).
- 🔔 **Thông báo & Audit Log:** Hệ thống thông báo in-app (Notifications module) và module Admin Stats lưu lịch sử kiểm toán/audit, cấu hình hệ thống.

---

## 🛠 Tech Stack

### 💻 Frontend (React + Vite)
- **Framework:** React 19, TypeScript, Vite
- **Styling:** TailwindCSS 4, Lucide React (Icons)
- **State Management:** Zustand (với các store độc lập: `useAuthStore`, v.v.)
- **Deploy:** Vercel

### ⚙️ Backend (FastAPI + Python)
- **Framework:** FastAPI (Python 3.10+)
- **Database ORM & Migrations:** SQLAlchemy, Alembic
- **Database & Auth Services:** Supabase PostgreSQL + Supabase Auth
- **File Storage:** Cloudflare R2 (Private Bucket)
- **Deploy:** Docker, Cloudflare Tunnel (expose local/docker API securely)

---

## 🚀 Cài đặt & Vận hành (Local Development)

### 1. Yêu cầu hệ thống
- Python 3.10+
- Node.js 18+
- Tài khoản Supabase (bật tính năng Auth và lấy chuỗi kết nối PostgreSQL)
- Tài khoản Cloudflare (tạo R2 private bucket và lấy S3 API Token)

### 2. Thiết lập Backend

```powershell
cd D:\Personal\document-flow-management\backend
Copy-Item .env.example .env
```
Mở file `.env` và điền các thông số:
- `DATABASE_URL` (Supabase Postgres)
- `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY`
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ACCOUNT_ID`

Chạy migration và khởi động server:
```powershell
python -m alembic -c alembic.ini upgrade head
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

*Tiện ích (Tùy chọn):*
- Tạo tài khoản Admin mặc định: `python scripts\create_admin.py --email admin@example.com --password "Temp@12345" --full-name "Admin"`
- Seed dữ liệu mẫu: `python scripts\seed_demo.py`
- Kiểm tra sức khỏe toàn bộ API nội bộ: `python scripts\check_mvp.py`

### 3. Thiết lập Frontend

```powershell
cd D:\Personal\document-flow-management\frontend
npm install
npm run dev
```
Trình duyệt sẽ tự động chạy tại `http://localhost:5173`.  
Đảm bảo đã khai báo `VITE_API_BASE_URL=http://127.0.0.1:8000` (nếu chạy local) hoặc trỏ về domain Cloudflare Tunnel của backend.

### 4. Triển khai bằng Docker (Backend)

```powershell
docker compose up -d --build
```
Hệ thống sẽ build image và expose cổng `8000`. Kết hợp Cloudflare Tunnel để đưa `http://localhost:8000` ra ngoài Internet an toàn.

---

## 🏗 Cấu trúc mã nguồn chính

- `backend/app/api/` : Các route module hóa (`auth.py`, `documents.py`, `assignments.py`, `attachments.py`, `progress.py`, `admin_stats.py`,...).
- `backend/app/core/` : Cấu hình ứng dụng, bảo mật và logic kết nối DB (`config.py`, `security.py`, `database.py`).
- `backend/app/models/` : SQLAlchemy ORM Models map với cấu trúc Supabase.
- `frontend/src/` : 
  - `components/` (các UI block dùng chung)
  - `pages/` (View logic của Dashboard, Document Detail, System Settings, ...)
  - `store/` (Zustand state management)

---

## 🔒 Lưu ý Vận hành & Bảo mật
- **CORS:** Chỉ nên đưa các domain frontend hợp lệ vào danh sách cấu hình.
- **File đính kèm:** R2 bucket BẮT BUỘC phải đặt ở trạng thái Private. Toàn bộ request tải file phải được chứng thực (Auth Bearer Token) qua API của hệ thống trước khi trả stream về.
- **Backup:** Phụ thuộc vào chính sách Lifecycle backup tự động của Supabase DB và Cloudflare R2.
