from pathlib import Path
import sys

from sqlalchemy import select

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.database import get_session_local
from app.models import KpiIndicator

SEED_INDICATORS = [
    (1, "Trồng trọt", "Tổng sản lượng lúa cả năm; tỷ lệ sản lượng lúa đặc sản, lúa chất lượng cao; diện tích cây màu lương thực, thực phẩm và cây công nghiệp ngắn ngày"),
    (2, "Chăn nuôi", "Tổng đàn gia súc; tổng đàn gia cầm"),
    (3, "Thuỷ sản, hải sản", "Tổng sản lượng khai thác và nuôi trồng thuỷ sản, hải sản"),
    (4, "Thu ngân sách nhà nước", "Tổng thu ngân sách nhà nước"),
    (5, "Kinh tế tập thể, kinh tế tư nhân", "Phấn đấu thành lập mới từ 02 doanh nghiệp tư nhân, 02 hợp tác xã, 03 tổ hợp tác và có ít nhất 02 sản phẩm OCOP đạt 3 sao"),
    (6, "Nước sạch và rác thải sinh hoạt", "Tỷ lệ người dân được sử dụng nước sạch theo quy chuẩn; tỷ lệ rác thải sinh hoạt được thu gom và xử lý đúng quy định"),
    (7, "Đường nông thôn mới kiểu mẫu", "Phấn đấu mỗi ấp có ít nhất 01 tuyến đường nông thôn mới kiểu mẫu"),
    (8, "Thu nhập bình quân đầu người", "Thu nhập bình quân đầu người đạt 65 triệu đồng"),
    (9, "Khoa học công nghệ, đổi mới sáng tạo và chuyển đổi số", "Tỷ lệ sử dụng dịch vụ công trực tuyến của người dân và doanh nghiệp đạt 82%; người dân và doanh nghiệp được tuyên truyền về chủ trương phát triển khoa học công nghệ, đổi mới sáng tạo và chuyển đổi số đạt 100%; phấn đấu bố trí tổng chi ngân sách cho phát triển khoa học công nghệ, đổi mới sáng tạo và chuyển đổi số đạt 3%; phấn đấu kết quả xếp hạng theo bộ chỉ số phục vụ người dân, doanh nghiệp trong thực hiện thủ tục hành chính, cung cấp dịch vụ công nằm trong nhóm từ 01 - 10 trên tổng số 103 xã, phường"),
    (10, "Giảm tỷ lệ hộ nghèo", "Phấn đấu mức giảm tỷ lệ hộ nghèo từ 1 - 1,5% trở lên"),
    (11, "Lao động và việc làm", "Tỷ lệ lao động qua đào tạo có bằng cấp, chứng chỉ; giải quyết việc làm mới"),
    (12, "Huy động trẻ em, học sinh đi học", "Tỷ lệ huy động trẻ em, học sinh đi học trong độ tuổi: Nhà trẻ 25%; Mẫu giáo 94%; Tiểu học 100%; Trung học cơ sở 94%; Trung học phổ thông 73%"),
    (13, "Trường đạt chuẩn quốc gia", "Tỷ lệ/trường đạt chuẩn quốc gia"),
    (14, "Xoá nhà tạm, nhà dột nát", "Phấn đấu xoá nhà tạm, nhà dột nát"),
    (15, "Bảo hiểm y tế, bảo hiểm xã hội và hồ sơ sức khoẻ", "Tỷ lệ vận động người dân tham gia bảo hiểm y tế; số lao động tham gia bảo hiểm xã hội; tỷ lệ dân số được quản lý hồ sơ sức khoẻ và khám sức khoẻ định kỳ"),
    (16, "Tuyển chọn và gọi công dân nhập ngũ", "Công tác tuyển chọn và gọi công dân nhập ngũ đạt chỉ tiêu trên giao"),
    (17, "An ninh trật tự", "Không để hình thành điểm nóng về an ninh trật tự; hoàn thành chỉ tiêu xây dựng xã an toàn về an ninh, trật tự; xây dựng xã không ma tuý; phấn đấu kéo giảm vụ việc liên quan an ninh trật tự, an toàn xã hội"),
    (18, "Đánh giá tổ chức cơ sở đảng và đảng viên", "Phấn đấu có từ 85% tổ chức cơ sở đảng và 90% đảng viên được đánh giá, xếp loại hoàn thành tốt nhiệm vụ trở lên"),
    (19, "Kết nạp đảng viên", "Chỉ tiêu kết nạp đảng viên"),
    (20, "Đào tạo, bồi dưỡng cán bộ", "Phấn đấu có 90% cán bộ, công chức, viên chức cấp xã và đội ngũ chủ chốt ấp tham gia các lớp đào tạo, bồi dưỡng theo kế hoạch"),
    (21, "Mặt trận Tổ quốc và các tổ chức chính trị - xã hội", "Uỷ ban Mặt trận Tổ quốc Việt Nam xã được đánh giá hoàn thành tốt nhiệm vụ; 75% tỷ lệ quần chúng tham gia các tổ chức chính trị, tổ chức chính trị - xã hội trong độ tuổi"),
]


def main() -> None:
    db = get_session_local()()
    created = 0
    updated = 0
    try:
        existing = {item.number: item for item in db.scalars(select(KpiIndicator)).all()}
        for number, name, description in SEED_INDICATORS:
            indicator = existing.get(number)
            if indicator:
                indicator.name = name
                indicator.description = description
                indicator.is_active = True
                updated += 1
            else:
                db.add(KpiIndicator(number=number, name=name, description=description, department_id=None, is_active=True))
                created += 1
        db.commit()
        print(f"KPI indicators ready: created={created}, updated={updated}, total={len(SEED_INDICATORS)}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
