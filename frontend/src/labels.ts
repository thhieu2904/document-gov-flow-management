import type { AssignmentStatus, DisplayStatus, DocumentStatus, KpiStatus, Priority, Role } from "./types";

export const labels = {
  role: { manager: "Quản lý", staff: "Nhân viên" } as Record<Role, string>,
  priority: { normal: "Thường", high: "Khẩn", urgent: "Hỏa tốc" } as Record<Priority, string>,
  docStatus: {
    draft: "Chưa giao",
    in_progress: "Đang thực hiện",
    completed: "Hoàn tất",
  } as Record<DocumentStatus, string>,
  displayStatus: {
    draft: "Chưa giao",
    in_progress: "Đang thực hiện",
    due_soon: "Sắp đến hạn",
    overdue: "Quá hạn",
    completed: "Hoàn tất",
    completed_late: "Hoàn tất trễ hạn",
  } as Record<DisplayStatus, string>,
  assignmentStatus: {
    pending: "Chưa nhận",
    in_progress: "Đang làm",
    completed: "Hoàn tất",
    overdue: "Quá hạn",
  } as Record<AssignmentStatus, string>,
  kpiStatus: {
    not_entered: "Chưa đánh giá",
    exceeded: "Đạt và vượt",
    above_98: "Đạt trên 98%",
    above_68: "Đạt trên 68%",
    above_50: "Đạt trên 50%",
    below_50: "Đạt dưới 50%",
  } as Record<KpiStatus, string>,
};
