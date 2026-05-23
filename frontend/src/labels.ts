import type { AssignmentStatus, DisplayStatus, DocumentStatus, Priority, Role } from "./types";

export const labels = {
  role: { manager: "Quản lý", staff: "Nhân viên" } as Record<Role, string>,
  priority: { normal: "Thường", high: "Khẩn", urgent: "Gấp" } as Record<Priority, string>,
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
};
