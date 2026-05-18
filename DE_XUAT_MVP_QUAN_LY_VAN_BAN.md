# Đề xuất MVP hệ thống quản lý văn bản và tiến độ công việc

## 1. Mục tiêu

Xây dựng một hệ thống quản lý văn bản và công việc nội bộ gọn hơn, trực quan hơn, dễ dùng hơn hệ thống cũ, nhưng vẫn giữ đúng nghiệp vụ cốt lõi:

- Tiếp nhận văn bản đến.
- Chuyển xử lý theo người/phòng ban.
- Phân biệt xử lý chính, phối hợp, xem để biết.
- Theo dõi ai chưa xử lý, đang xử lý, đã xử lý.
- Xem/tải file văn bản.
- Ghi nhận lịch sử xử lý.
- Quản lý tiến độ công việc phát sinh từ văn bản hoặc công việc độc lập.
- Quản lý văn bản đi ở mức tạo/xem/chuyển/kết thúc/phát hành cơ bản.

Mục tiêu không phải sao chép giao diện hệ thống cũ, mà là làm một app mới đáp ứng đúng nhu cầu vận hành của tổ chức.

## 2. Vấn đề cần tránh

Không nên thiết kế hệ thống chỉ như một app nhắc việc hoặc todo list.

Văn bản nội bộ có đặc thù:

- Một văn bản có thể chuyển qua nhiều người/phòng ban.
- Một văn bản có thể có nhiều nhánh xử lý.
- Mỗi người/đơn vị nhận văn bản có vai trò và trạng thái riêng.
- Một người có thể là xử lý chính ở văn bản này, phối hợp ở văn bản khác, và chỉ xem để biết ở văn bản khác nữa.

Vì vậy không thể chỉ dùng một trạng thái chung cho toàn bộ văn bản.

## 3. Cách hiểu quyền và vai trò

### 3.1. Chức vụ chỉ nên là nhãn hiển thị

Các chức vụ như:

```text
Giám đốc
Phó giám đốc
Chánh văn phòng
Trưởng phòng
Phó phòng
Văn thư phòng
Chuyên viên
```

nên được xem là nhãn/chức danh hiển thị, không nên hard-code toàn bộ quyền theo chức vụ.

Lý do:

- Một người có thể kiêm nhiều vai trò.
- Cơ cấu mỗi đơn vị có thể khác nhau.
- Nếu hard-code theo cấp bậc thật, app sẽ khó mở rộng và dễ sai nghiệp vụ.

Nên lưu chức vụ bằng trường:

```text
position_label
```

Ví dụ:

```text
Nguyễn Văn A
role hệ thống: manager
position_label: Phó Giám đốc
department: UBND X.Long Phú
```

### 3.2. Role hệ thống nên mỏng

MVP chỉ cần một số role hệ thống cơ bản:

```text
admin
clerk
manager
staff
```

Ý nghĩa:

```text
admin
  Quản lý tài khoản, phòng ban, cấu hình hệ thống.

clerk
  Văn thư/thư ký. Có thể vào sổ, tạo văn bản, chuyển bước đầu, phát hành/lưu hồ sơ.

manager
  Người có quyền điều phối trong phạm vi được giao. Có thể giao/chuyển/kết thúc theo vai trò trong văn bản.

staff
  Người xử lý công việc được giao, phối hợp hoặc xem để biết.
```

Role này chỉ dùng để mở các năng lực nền trong hệ thống.

### 3.3. Quyền thật nên nằm ở từng văn bản

Trong từng văn bản, người/phòng ban nhận sẽ có một vai trò xử lý:

```text
primary
  Xử lý chính / chủ trì.

collaborator
  Phối hợp xử lý.

informed
  Xem để biết.
```

Mỗi lượt giao/chuyển có trạng thái riêng:

```text
pending
  Chưa xử lý.

in_progress
  Đang xử lý.

completed
  Đã xử lý.

returned
  Bị trả lại / cần chỉnh sửa.
```

Ví dụ:

```text
Văn bản CV123 được chuyển cho anh A và anh B.

Anh A: xem để biết
  → chỉ cần xem và bấm kết thúc phần của mình.

Anh B: xử lý chính
  → có thể chuyển tiếp, giao phối hợp, hoặc kết thúc văn bản/nhánh xử lý.
```

## 4. Luồng văn bản đến đề xuất

Luồng chuẩn:

```text
Văn thư
→ Chánh văn phòng / người tham mưu
→ Lãnh đạo
→ Phòng ban chuyên môn
→ Văn thư phòng hoặc người tiếp nhận phòng
→ Lãnh đạo phòng
→ Chuyên viên / người phối hợp
→ Hoàn thành / lưu hồ sơ
```

Tuy nhiên, hệ thống không nên hard-code một đường thẳng duy nhất.

Nên thiết kế dạng cây:

```text
Lãnh đạo phòng
├─ Chuyên viên A: xử lý chính
├─ Chuyên viên B: phối hợp
└─ Chuyên viên C: xem để biết
```

Trong trường hợp chuyển sang phòng ban khác:

```text
Người gửi
→ Phòng ban nhận
→ Văn thư/thư ký phòng tiếp nhận
→ Lãnh đạo phòng
→ Người xử lý chính / phối hợp / xem để biết
```

Trong trường hợp xử lý trong phòng hiện tại:

```text
Lãnh đạo phòng
→ chọn 1 người xử lý chính
→ chọn nhiều người phối hợp
→ chọn nhiều người xem để biết
```

## 5. Menu văn bản đến

Menu đề xuất:

```text
Văn bản đến
├─ Xử lý chính
├─ Phối hợp
├─ Đã xử lý
└─ Xem để biết
```

Ý nghĩa:

```text
Xử lý chính
  Các văn bản chưa xử lý mà người dùng/phòng ban hiện tại nhận vai trò xử lý chính.

Phối hợp
  Các văn bản chưa xử lý mà người dùng/phòng ban hiện tại nhận vai trò phối hợp.

Đã xử lý
  Các văn bản người dùng/phòng ban hiện tại đã xử lý xong phần của mình.

Xem để biết
  Các văn bản được gửi để theo dõi, không yêu cầu xử lý chính.
```

Mục `Trả lại` có thể bỏ khỏi menu MVP, nhưng hệ thống vẫn nên có action trả lại/yêu cầu chỉnh sửa trong chi tiết văn bản.

## 6. Chi tiết văn bản đến

Màn chi tiết văn bản đến nên tập trung vào điều phối, không chỉ xem thông tin.

Các khối chính:

```text
1. Tóm tắt văn bản
   - Số đến
   - Số văn bản
   - Trích yếu
   - Cơ quan ban hành
   - Ngày ban hành/ngày đến
   - Độ khẩn
   - Hạn xử lý

2. File văn bản
   - Danh sách file
   - Xem/tải file

3. Phân công xử lý
   - Xử lý chính: chọn 1 người hoặc phòng ban
   - Phối hợp: chọn nhiều người/phòng ban
   - Xem để biết: chọn nhiều người/phòng ban
   - Ý kiến chỉ đạo/nội dung xử lý

4. Danh sách nhận
   - Ai nhận
   - Vai trò gì
   - Đã xử lý chưa

5. Tổng hợp ý kiến xử lý
   - Dạng cây hoặc bảng lịch sử
   - Ai chuyển cho ai
   - Chưa xử lý lúc nào
   - Đang xử lý lúc nào
   - Đã xử lý lúc nào
   - Nội dung thao tác
```

## 7. Kết thúc văn bản

Trong MVP, người đang được giao có thể bấm `Kết thúc`.

Ý nghĩa phụ thuộc vai trò:

```text
Nếu là người phối hợp:
  Kết thúc = hoàn thành phần phối hợp của mình.
  Không nhất thiết kết thúc toàn bộ văn bản.

Nếu là người xử lý chính/chủ trì:
  Kết thúc = hoàn thành nhánh xử lý chính.
  Có thể làm văn bản chuyển sang đã xử lý nếu không còn nhánh mở.

Nếu là người xem để biết:
  Kết thúc = đã xem/đã hoàn tất phần xem để biết.
```

MVP không bắt buộc cấp trên duyệt lại sau khi chuyên viên kết thúc, trừ khi sau này tổ chức yêu cầu.

## 8. Văn bản đi

Văn bản đi có các nhóm:

```text
Cần xử lý
Đã xử lý
Đang dự thảo
Đã phát hành
```

Hiện tại có thể thư ký/văn thư là người làm chính phần tạo/phát hành văn bản đi.

Luồng cơ bản:

```text
Người soạn/thư ký
→ trình ký
→ lãnh đạo ký duyệt
→ phát hành
→ lưu hồ sơ/lưu trữ
```

MVP văn bản đi nên hỗ trợ:

- Tạo văn bản đi cơ bản.
- Xem thông tin văn bản.
- Upload/xem/tải file.
- Trình ký.
- Ký duyệt hoặc đánh dấu đã xử lý.
- Phát hành.
- Lưu hồ sơ/lưu trữ.

## 9. Quản lý tiến độ công việc

Đây là scope quan trọng, nhưng cần tách rõ khỏi luồng văn bản.

Quản lý tiến độ dùng để theo dõi:

- Tổng nhiệm vụ.
- Đã hoàn thành.
- Đang xử lý.
- Trễ hạn.
- Cơ quan/phòng ban thực hiện.
- Người xử lý chính.
- Người phối hợp.
- Hạn xử lý.
- Kết quả.
- Trạng thái ưu tiên.

Nhiệm vụ có thể có hai loại:

```text
1. Nhiệm vụ phát sinh từ văn bản.
2. Công việc độc lập, không gắn văn bản.
```

Vì vậy dữ liệu công việc nên có:

```text
document_id nullable
```

Nếu có `document_id`, công việc được sinh ra từ văn bản.
Nếu không có `document_id`, đó là công việc nhập tay.

## 10. Data model lõi đề xuất

Các bảng/khái niệm chính:

```text
users
departments
documents
document_assignments
document_tasks
document_attachments
document_comments
workflow_events
notifications
```

Trong đó quan trọng nhất là `document_assignments`.

Một assignment nên có:

```text
id
document_id
parent_assignment_id
sender_user_id
sender_department_id
receiver_user_id
receiver_department_id
assignment_role
status
action_type
instruction
pending_at
started_at
completed_at
created_at
```

`parent_assignment_id` giúp tạo cây xử lý:

```text
Văn thư
→ Chánh VP
  → Lãnh đạo
    → Phòng chuyên môn
      → Chuyên viên xử lý chính
      → Người phối hợp
      → Người xem để biết
```

## 11. Demo MVP nên kể câu chuyện

Demo nên có một văn bản đến đi qua luồng:

```text
Văn thư
→ Chánh VP
→ Lãnh đạo
→ Phòng chuyên môn
→ Chuyên viên
→ Hoàn thành
```

Bên trong cần có nhánh:

```text
1 người xử lý chính
1-2 người phối hợp
1 người xem để biết
```

Khi đăng nhập từng tài khoản demo, người dùng phải thấy đúng hàng đợi của mình:

```text
Xử lý chính
Phối hợp
Đã xử lý
Xem để biết
Quản lý tiến độ
```

## 12. Các câu cần chốt thêm

Các câu đã được người dùng chốt:

### 12.1. Khi giao cho phòng ban, ai thấy đầu tiên?

```text
Văn thư phòng thấy đầu tiên.
```

Hàm ý:

```text
Người gửi chuyển văn bản cho phòng ban
→ văn thư phòng tiếp nhận
→ văn thư phòng chuyển cho lãnh đạo phòng hoặc người xử lý phù hợp
```

### 12.2. Người phối hợp bấm Kết thúc có bắt buộc nhập kết quả không?

```text
Không bắt buộc.
```

Hệ thống nên cho phép nhập kết quả/ghi chú nếu có, nhưng không chặn thao tác kết thúc khi để trống.

### 12.3. Quản lý tiến độ có cần công việc độc lập không?

```text
MVP chỉ cần task/nhiệm vụ phát sinh từ văn bản.
Không cần tạo công việc độc lập ở giai đoạn đầu.
```

Hàm ý:

```text
document_tasks.document_id bắt buộc có giá trị trong MVP.
```

Sau này nếu cần mở rộng công việc độc lập, có thể đổi thành nullable.

### 12.4. Văn bản đi cần tới mức nào?

```text
Nếu làm full được thì tốt.
```

MVP nên cố gắng hỗ trợ đủ luồng cơ bản:

```text
tạo văn bản đi
→ trình ký
→ ký duyệt
→ phát hành
→ lưu hồ sơ/lưu trữ
```

Nếu cần rút gọn để kịp demo, vẫn phải giữ đúng các mốc trạng thái này trong dữ liệu/workflow service.

### 12.5. Phòng ban có cần cây cha-con không?

```text
Không.
MVP dùng phòng ban flat.
```

Hàm ý:

```text
departments không cần parent_department_id trong MVP.
```

### 12.6. File demo xử lý thế nào?

```text
Cần có file mẫu thật để biết link/tải file hoạt động.
Tên file cần phù hợp nghiệp vụ.
Nội dung file có thể là lorem/text mẫu.
```

Hàm ý:

```text
Seed demo nên tạo/upload file mẫu thật.
File có thể là PDF/DOCX/MD đơn giản.
Tên file cần giống văn bản hành chính.
```

## 13. Các điểm còn cần làm rõ trước khi implement lớn

Sau các câu đã chốt, chỉ còn một số chi tiết cần xác nhận:

Các câu còn lại đã được chốt thêm:

### 13.1. Cấu trúc đơn vị

```text
MVP dùng phòng ban flat, nhưng thêm type để phân biệt ngữ cảnh.
```

Loại đơn vị:

```text
parent_unit
  Cấp cha / văn phòng UB / nơi có lãnh đạo cấp cao và văn thư trung tâm.

department
  Phòng ban chuyên môn / lớp con.
```

Không dùng cây cha-con trong MVP.

### 13.2. Văn bản đến

Về nghiệp vụ, user không "tạo" văn bản đến theo nghĩa tự sinh văn bản.

Tên đúng nên là:

```text
Tiếp nhận văn bản đến / Vào sổ văn bản đến
```

Quyền này thuộc về:

```text
clerk / văn thư
```

### 13.3. Văn bản đi

Chốt:

```text
Văn thư tạo văn bản đi.
```

Luồng sau đó:

```text
tạo / dự thảo
→ trình ký
→ ký duyệt
→ phát hành
→ lưu hồ sơ / lưu trữ
```

### 13.4. Ý nghĩa complete/kết thúc

Chốt:

```text
Complete/Kết thúc là hoàn thành assignment hoặc nhánh xử lý của người đó.
Không đồng nghĩa văn bản tổng thể đã hoàn thành.
```

Ví dụ:

```text
Văn bản CV123: đang xử lý

Lãnh đạo: completed
Phòng ban: in_progress
Chuyên viên A: completed
Chuyên viên B: pending
```

Vì vậy backend bắt buộc tách:

```text
documents.status
document_assignments.status
```

### 13.5. File storage

MVP dùng R2 thật cho file demo.

Tuy nhiên code cần thiết kế theo provider để sau này có thể đổi sang local nếu cần:

```text
StorageProvider
├─ R2StorageProvider
└─ LocalStorageProvider
```

DB chỉ lưu metadata:

```text
storage_provider
storage_key
original_name
mime_type
size
```

Nếu đổi từ R2 sang local sau này:

```text
STORAGE_PROVIDER=local
LOCAL_STORAGE_PATH=./uploads
```

App không cần sửa logic nghiệp vụ. Chỉ khi cần chuyển file cũ từ R2 về local thì mới cần script migrate file.

## 14. Hướng backend đã có thể chốt

Backend cần ưu tiên đúng nghiệp vụ hơn là chỉ CRUD.

Các nguyên tắc đã chốt:

```text
1. Documents chỉ giữ trạng thái tổng thể.
2. Document assignments giữ trạng thái xử lý riêng của từng người/đơn vị.
3. Assignment có parent_assignment_id để tạo cây luồng xử lý.
4. Role hệ thống mỏng: admin / clerk / manager / staff.
5. Chức vụ là label, không hard-code quyền.
6. Quyền thực tế dựa vào assignment của văn bản.
7. Phòng ban flat, có unit_type.
8. File đi qua backend, storage provider có thể là R2 hoặc local.
9. Audit/workflow event ghi mọi thao tác quan trọng.
```

## 15. Định hướng frontend

Frontend không cần copy giao diện hệ thống cũ, nhưng phải tạo được cảm giác:

```text
rõ ràng
chuyên nghiệp
dễ scan
đúng nghiệp vụ hành chính
```

Với người không biết code, giao diện là thứ họ đánh giá đầu tiên. Vì vậy frontend nên làm tốt phần trình bày và luồng thao tác.

### 15.1. Nguyên tắc giao diện

```text
Không làm như app todo.
Không dùng layout marketing.
Không nhồi quá nhiều trường.
Không gom mọi thứ vào một dashboard chung.
```

Nên dùng layout app nội bộ:

```text
sidebar nghiệp vụ
topbar gọn
bảng dữ liệu dễ scan
filter rõ
badge trạng thái
màu cảnh báo hạn xử lý
modal/form thao tác nhanh
timeline/cây xử lý trực quan
```

### 15.2. Menu chính đề xuất

```text
Tổng quan

Văn bản đến
  - Xử lý chính
  - Phối hợp
  - Đã xử lý
  - Xem để biết

Văn bản đi
  - Cần xử lý
  - Đã xử lý
  - Đang dự thảo
  - Đã phát hành

Quản lý tiến độ

Hồ sơ / lưu trữ

Quản trị
```

Menu hiển thị theo role/quyền.

### 15.3. Màn danh sách văn bản

Danh sách văn bản cần giống bảng nghiệp vụ:

```text
Số đến / số phát hành
Số văn bản
Trích yếu
Ngày ban hành / ngày đến
Cơ quan ban hành
Vai trò của tôi
Trạng thái phần xử lý của tôi
Hạn xử lý
File
```

Không nên hiển thị quá nhiều trường.

Màu trạng thái:

```text
Đỏ: quá hạn / hỏa tốc
Cam: khẩn / sắp đến hạn
Xanh: đang xử lý
Xám: đã xử lý / lưu trữ
```

### 15.4. Màn chi tiết văn bản

Màn chi tiết nên chia khối:

```text
1. Tóm tắt văn bản
2. File văn bản
3. Hành động của tôi
4. Chuyển xử lý / phân công
5. Danh sách nhận
6. Tổng hợp ý kiến xử lý
```

Phần quan trọng nhất là:

```text
Hành động của tôi
```

Vì người dùng cần biết ngay:

```text
tôi cần làm gì với văn bản này?
```

Ví dụ:

```text
Kết thúc phần xử lý
Chuyển tiếp
Giao xử lý chính
Thêm phối hợp
Gửi xem để biết
Upload kết quả
```

### 15.5. Tổng hợp ý kiến xử lý

Đây là phần giúp app có "hồn".

Không nên chỉ hiển thị log phẳng.

Nên hiển thị dạng cây hoặc bảng nhóm:

```text
Người/đơn vị
Vai trò
Chưa xử lý
Đang xử lý
Đã xử lý
Nội dung
Xem nhánh con
```

MVP có thể làm dạng cây đơn giản:

```text
Văn thư vào sổ
└─ Chánh VP tham mưu
   └─ Lãnh đạo chỉ đạo
      └─ Phòng Kinh tế tiếp nhận
         ├─ Chuyên viên A xử lý chính
         ├─ Chuyên viên B phối hợp
         └─ Chuyên viên C xem để biết
```

### 15.6. Quản lý tiến độ

Màn quản lý tiến độ nên có:

```text
Tổng nhiệm vụ
Đã hoàn thành
Đang xử lý
Trễ hạn
```

Bảng:

```text
Văn bản liên quan
Nội dung nhiệm vụ
Người/phòng ban xử lý chính
Người phối hợp
Hạn xử lý
Ngày hoàn thành
Kết quả
Trạng thái
Ưu tiên
```

Nên dùng màu để dễ scan, nhưng tiết chế hơn ảnh hệ thống cũ.

## 16. Yêu cầu bảo mật

Dù frontend đẹp là phần dễ được nhìn thấy, backend vẫn phải đảm bảo an toàn.

Các yêu cầu tối thiểu:

```text
1. Mọi API quan trọng phải kiểm quyền ở backend.
2. Ẩn nút trên frontend chỉ là hỗ trợ UX, không phải bảo mật.
3. File không public.
4. Tải file phải đi qua backend hoặc signed URL ngắn hạn sau khi kiểm quyền.
5. CORS chỉ mở frontend chính thức.
6. Audit log cho tạo, chuyển, kết thúc, upload, download file.
7. Không gửi mật khẩu plain text qua email.
8. Token đăng nhập phải kiểm tra bằng Supabase Auth.
9. R2 bucket để private.
10. Không dùng SQLite cho môi trường chính.
```

Quyền tải file:

```text
User chỉ tải được file nếu có quyền xem văn bản hoặc assignment liên quan.
```

Quyền chuyển/kết thúc:

```text
User chỉ chuyển/kết thúc assignment mà họ hoặc phòng ban của họ đang nhận.
```
