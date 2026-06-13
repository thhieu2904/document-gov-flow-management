export type Role = "superadmin" | "manager" | "staff";
export type Priority = "normal" | "high" | "urgent";
export type DocumentStatus = "draft" | "in_progress" | "submitted" | "completed";
export type DisplayStatus = DocumentStatus | "due_soon" | "overdue" | "completed_late";
export type AssignmentStatus = "pending" | "in_progress" | "submitted" | "returned" | "approved" | "overdue";
export type KpiStatus = "not_entered" | "exceeded" | "above_98" | "above_68" | "above_50" | "below_50";
export type View = "dashboard" | "assigned" | "assigned_pending" | "assigned_completed" | "all_documents" | "completed_documents" | "users" | "departments" | "reminders" | "kpi_input" | "kpi_display";

export type User = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  department_id: string | null;
  position_label: string | null;
  is_active: boolean;
  must_change_password: boolean;
};

export type Department = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  member_count?: number;
  active_member_count?: number;
  document_count?: number;
  manager?: { id: string; full_name: string; email: string } | null;
};

export type KpiIndicator = {
  id: string;
  number: number;
  name: string;
  description: string | null;
  department_id: string | null;
  department?: { id: string; name: string } | null;
  is_active: boolean;
};

export type KpiPeriod = {
  id: string;
  month: number;
  year: number;
  name: string;
  status: "open" | "closed";
  total_count: number;
  entered_count: number;
};

export type KpiResultRow = {
  id: string | null;
  indicator: { id: string; number: number; name: string; description?: string | null };
  department: { id: string; name: string } | null;
  percentage: number | null;
  status: KpiStatus;
  status_label: string;
  note: string | null;
};

export type KpiSummary = {
  period_name: string;
  total: number;
  exceeded: number;
  above_98: number;
  above_68: number;
  above_50: number;
  below_50: number;
  not_entered: number;
  report_text: string;
};

export type KpiChartItem = {
  name: string;
  percentage: number | null;
  status: KpiStatus;
};

export type KpiChartData = {
  labels: string[];
  data: KpiChartItem[];
};

export type Page<T> = { items: T[]; page: number; size: number; total: number };

export type ReminderSettings = {
  staff_reminder_enabled: boolean | string;
  staff_reminder_time: string;
  staff_due_soon_days: number | string;
  staff_urgent_enabled: boolean | string;
  staff_overdue_enabled: boolean | string;
  manager_digest_enabled: boolean | string;
  manager_digest_time: string;
  manager_report_mode: "off" | "weekly" | "monthly" | "both" | string;
  manager_report_time: string;
  email_enabled?: boolean;
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_from_email?: string;
  smtp_from_name?: string;
  smtp_use_tls?: boolean;
  resend_configured?: boolean;
};

export type EmailLog = {
  id: string;
  event_type: string;
  recipient_email: string;
  subject: string;
  status: string;
  sent_at: string | null;
  created_at: string;
  document_id: string | null;
  assignment_id: string | null;
};

export type DocumentRow = {
  id: string;
  title: string;
  code: string | null;
  summary: string | null;
  priority: Priority;
  status: DocumentStatus;
  display_status?: DisplayStatus;
  issued_at: string | null;
  due_at: string | null;
  created_by: string;
  department_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  assignment_count: number;
  completed_count: number;
  my_assignment_id?: string | null;
  my_assignment_status?: Exclude<AssignmentStatus, "overdue"> | null;
  my_assignment_display_status?: DisplayStatus | AssignmentStatus | null;
  my_assignment_due_at?: string | null;
  my_assignment_completed_at?: string | null;
  my_assignment_progress?: string | null;
};

export type Assignment = {
  id: string;
  document_id: string;
  assigned_by: string;
  assignee_id: string;
  assignee?: Pick<User, "id" | "full_name" | "email" | "role" | "department_id"> | null;
  instruction: string | null;
  result_note: string | null;
  priority: Priority;
  status: Exclude<AssignmentStatus, "overdue">;
  due_at: string | null;
  started_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  reviews?: AssignmentReview[];
  latest_return_note?: string | null;
};

export type AssignmentReview = {
  id: string;
  assignment_id: string;
  reviewer_id: string;
  reviewer?: Pick<User, "id" | "full_name" | "email" | "role" | "department_id"> | null;
  action: "approved" | "returned";
  note: string | null;
  created_at: string;
};

export type Attachment = {
  id: string;
  document_id: string;
  assignment_id: string | null;
  original_name: string;
  mime_type: string;
  size: number;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
  download_url: string;
};

export type DocumentDetail = DocumentRow & {
  assignments: Assignment[];
  attachments: Attachment[];
  my_permissions: { can_update: boolean; can_assign: boolean; can_delete: boolean; can_review?: boolean };
};

export type DashboardDocument = {
  id: string;
  code: string | null;
  title: string;
  status: DocumentStatus;
  display_status: DisplayStatus;
  priority: Priority;
  issued_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  assignment_count: number;
  completed_count: number;
  assignees: Array<{ name: string; status: AssignmentStatus }>;
};

export type Dashboard = {
  total_documents: number;
  open_documents: number;
  draft_documents: number;
  in_progress_documents: number;
  due_soon_documents: number;
  overdue_documents: number;
  completed_documents: number;
  open_tasks: number;
  overdue_tasks: number;
  work_items: DashboardDocument[];
};
