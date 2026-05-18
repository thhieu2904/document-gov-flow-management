import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { create } from "zustand";
import clsx from "clsx";
import {
  Archive,
  Bell,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  FileInput,
  FileOutput,
  FilePlus2,
  FolderArchive,
  History,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Paperclip,
  Pencil,
  RefreshCcw,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Upload,
  UserPlus,
  UserRoundCog,
  UsersRound,
} from "lucide-react";
import "./styles.css";

type ViewKey =
  | "dashboard"
  | "incoming"
  | "outgoing"
  | "progress"
  | "archive"
  | "admin_dashboard"
  | "admin_users"
  | "admin_departments"
  | "admin_check";
type IncomingQueue = "received" | "primary" | "collaborator" | "completed" | "informed";
type OutgoingQueue = "todo" | "done" | "draft" | "issued";
type AssignmentRole = "primary" | "collaborator" | "informed";
type AssignmentStatus = "pending" | "in_progress" | "completed" | "returned";
type ActionType = "advise" | "direct" | "forward" | "assign";
type Priority = "normal" | "high" | "urgent";
type DocumentType = "incoming" | "outgoing";

type User = {
  id: string;
  full_name: string;
  email: string;
  role: "admin" | "clerk" | "manager" | "staff";
  department_id: string | null;
  position_label: string | null;
  is_active: boolean;
  must_change_password: boolean;
};

type RoleOption = {
  key: User["role"];
  label: string;
};

type Department = {
  id: string;
  name: string;
  unit_type: "parent_unit" | "department";
  description?: string | null;
  is_active: boolean;
};

type DocumentRow = {
  id: string;
  document_type: DocumentType;
  title: string;
  code: string | null;
  arrival_number: string | null;
  issuing_agency: string | null;
  document_date: string | null;
  received_date: string | null;
  issued_date: string | null;
  due_date: string | null;
  priority: Priority;
  status: string;
  owner_department_id: string | null;
  is_unread?: boolean;
};

type Assignment = {
  id: string;
  document_id: string;
  parent_assignment_id: string | null;
  sender_user_id: string | null;
  sender_department_id: string | null;
  receiver_user_id: string | null;
  receiver_department_id: string | null;
  assignment_role: AssignmentRole;
  status: AssignmentStatus;
  action_type: string;
  instruction: string | null;
  priority: Priority;
  due_date: string | null;
  pending_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  returned_at: string | null;
  viewed_at: string | null;
  is_unread?: boolean;
  // per-assignment permissions (only in my_assignments)
  can_start?: boolean;
  can_complete?: boolean;
  can_forward?: boolean;
  can_return?: boolean;
};

type Attachment = {
  id: string;
  original_name: string;
  mime_type: string;
  size: number;
  created_at: string;
};

type HistoryLog = {
  id: string;
  assignment_id: string | null;
  user_id: string | null;
  action_type: string;
  description: string | null;
  created_at: string;
};

type Comment = {
  id: string;
  assignment_id: string | null;
  user_id: string | null;
  content: string;
  created_at: string;
};

type NotificationItem = {
  id: string;
  document_id: string | null;
  assignment_id: string | null;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
};

type DocumentDetail = DocumentRow & {
  assignments: Assignment[];
  my_assignments: Assignment[];
  comments: Comment[];
  attachments: Attachment[];
  history_logs: HistoryLog[];
  my_permissions: {
    can_update: boolean;
    can_forward: boolean;
    can_complete: boolean;
    can_void: boolean;
  };
};

type Page<T> = {
  items: T[];
  page: number;
  size: number;
  total: number;
};

type DashboardData = {
  total_documents: number;
  incoming_documents: number;
  outgoing_documents: number;
  in_progress: number;
  completed: number;
  overdue: number;
  open_tasks: number;
  due_soon: DocumentRow[];
};

type ProgressRow = {
  document_id: string;
  document_code: string | null;
  document_number: string | null;
  document_received_date: string | null;
  received_at: string | null;
  document_title: string;
  assignment_id: string;
  receiver_label: string;
  assignment_role: AssignmentRole;
  instruction: string | null;
  due_date: string | null;
  completed_at: string | null;
  priority: Priority;
  status: AssignmentStatus | "overdue";
};

type ProgressSortBy = "received_at" | "document_received_date" | "document_number" | "document_title" | "receiver_label" | "due_date" | "status" | "priority";
type ProgressSortDir = "asc" | "desc";

type AdminStats = {
  total_users: number;
  active_users: number;
  inactive_users: number;
  total_departments: number;
  active_departments: number;
  inactive_departments: number;
  total_documents: number;
  open_documents: number;
  total_assignments: number;
  open_assignments: number;
  total_attachments: number;
  recent_logs: Array<{
    id: string;
    action_type: string;
    description: string | null;
    user_id: string | null;
    document_id: string | null;
    created_at: string;
  }>;
};

type HealthCheckRow = {
  label: string;
  status: "pending" | "ok" | "error";
  detail: string;
  checked_at?: string;
};

type AppState = {
  token: string | null;
  currentUser: User | null;
  view: ViewKey;
  incomingQueue: IncomingQueue;
  outgoingQueue: OutgoingQueue;
  documentSearch: string;
  dueFrom: string;
  dueBefore: string;
  selectedDocumentId: string | null;
  documents: Page<DocumentRow>;
  detail: DocumentDetail | null;
  dashboard: DashboardData | null;
  progress: Page<ProgressRow>;
  users: User[];
  departments: Department[];
  loading: boolean;
  notice: string | null;
  setSession: (token: string | null, user: User | null) => void;
  setView: (view: ViewKey) => void;
  setIncomingQueue: (queue: IncomingQueue) => void;
  setOutgoingQueue: (queue: OutgoingQueue) => void;
  setDocumentFilters: (filters: Partial<Pick<AppState, "documentSearch" | "dueFrom" | "dueBefore">>) => void;
  setSelectedDocumentId: (id: string | null) => void;
  setDocuments: (documents: Page<DocumentRow>) => void;
  setDetail: (detail: DocumentDetail | null) => void;
  setDashboard: (dashboard: DashboardData | null) => void;
  setProgress: (progress: Page<ProgressRow>) => void;
  setUsers: (users: User[]) => void;
  setDepartments: (departments: Department[]) => void;
  setLoading: (loading: boolean) => void;
  setNotice: (notice: string | null) => void;
};

const emptyPage = <T,>(): Page<T> => ({ items: [], page: 1, size: 20, total: 0 });

const useAppStore = create<AppState>((set) => ({
  token: localStorage.getItem("document_flow_token"),
  currentUser: null,
  view: "dashboard",
  incomingQueue: "primary",
  outgoingQueue: "issued",
  documentSearch: "",
  dueFrom: "",
  dueBefore: "",
  selectedDocumentId: null,
  documents: emptyPage<DocumentRow>(),
  detail: null,
  dashboard: null,
  progress: emptyPage<ProgressRow>(),
  users: [],
  departments: [],
  loading: false,
  notice: null,
  setSession: (token, user) => {
    if (token) localStorage.setItem("document_flow_token", token);
    else localStorage.removeItem("document_flow_token");
    set({ token, currentUser: user, view: user?.role === "admin" ? "admin_dashboard" : "dashboard" });
  },
  setView: (view) => set({ view }),
  setIncomingQueue: (incomingQueue) => set({ incomingQueue, view: "incoming", selectedDocumentId: null }),
  setOutgoingQueue: (outgoingQueue) => set({ outgoingQueue, view: "outgoing", selectedDocumentId: null }),
  setDocumentFilters: (filters) => set(filters),
  setSelectedDocumentId: (selectedDocumentId) => set({ selectedDocumentId }),
  setDocuments: (documents) => set({ documents }),
  setDetail: (detail) => set({ detail }),
  setDashboard: (dashboard) => set({ dashboard }),
  setProgress: (progress) => set({ progress }),
  setUsers: (users) => set({ users }),
  setDepartments: (departments) => set({ departments }),
  setLoading: (loading) => set({ loading }),
  setNotice: (notice) => set({ notice }),
}));

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

const incomingLabels: Record<IncomingQueue, string> = {
  received: "Chờ giao",
  primary: "Xử lý chính",
  collaborator: "Phối hợp",
  completed: "Đã xử lý",
  informed: "Xem để biết",
};

const outgoingLabels: Record<OutgoingQueue, string> = {
  todo: "Cần xử lý",
  done: "Đã xử lý",
  draft: "Đang dự thảo",
  issued: "Đã phát hành",
};

const roleLabels: Record<User["role"], string> = {
  admin: "Quản trị",
  clerk: "Văn thư",
  manager: "Quản lý",
  staff: "Nhân viên",
};

const assignmentRoleLabels: Record<AssignmentRole, string> = {
  primary: "Xử lý chính",
  collaborator: "Phối hợp",
  informed: "Xem để biết",
};

const assignmentStatusLabels: Record<AssignmentStatus | "overdue", string> = {
  pending: "Chưa xử lý",
  in_progress: "Đang xử lý",
  completed: "Đã xử lý",
  returned: "Trả lại",
  overdue: "Quá hạn",
};

const priorityLabels: Record<Priority, string> = {
  normal: "Thường",
  high: "Khẩn",
  urgent: "Hỏa tốc",
};

const demoAccountEmails = [
  "admin@example.com",
  "vanthu@example.com",
  "chanhvp@example.com",
  "lanhdao@example.com",
  "vanthu.phong@example.com",
  "truongphong@example.com",
  "chuyenvien@example.com",
  "phoihop@example.com",
  "xemdebiet@example.com",
];

const loginDemoAccounts = [
  { email: "admin@example.com", role: "Quản trị", hint: "Quản lý người dùng, phòng ban, kiểm tra hệ thống." },
  { email: "vanthu@example.com", role: "Văn thư xã", hint: "Nhập văn bản giấy, giao xử lý, phát hành, lưu hồ sơ." },
  { email: "lanhdao@example.com", role: "Lãnh đạo", hint: "Xem việc cần ký duyệt/chỉ đạo và luồng xử lý." },
  { email: "vanthu.phong@example.com", role: "Văn thư phòng", hint: "Tiếp nhận văn bản gửi cho Phòng Kinh tế trước khi giao tiếp." },
  { email: "truongphong@example.com", role: "Trưởng phòng", hint: "Phân công chuyên viên, theo dõi việc chính." },
  { email: "chuyenvien@example.com", role: "Chuyên viên", hint: "Xử lý việc được giao trực tiếp, xem quá hạn/trả lại." },
  { email: "phoihop@example.com", role: "Phối hợp", hint: "Xem văn bản cần phối hợp xử lý." },
  { email: "xemdebiet@example.com", role: "Xem để biết", hint: "Chỉ xem văn bản, không có quyền xử lý." },
];

const loginDemoCoverage = [
  "Văn bản giấy đang Chờ giao",
  "Văn bản phòng ban có badge Chưa xem",
  "Xử lý chính, phối hợp, xem để biết",
  "Văn bản quá hạn và bị trả lại",
  "Dự thảo, trình ký, ký duyệt, phát hành",
  "File đính kèm, bình luận, lịch sử luồng xử lý",
];

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = useAppStore.getState().token;
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    const text = await response.text();
    let message = text || "Có lỗi khi gọi API";
    try {
      message = JSON.parse(text).detail || message;
    } catch {
      // keep raw text
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function downloadFile(attachmentId: string, fallbackName: string) {
  const token = useAppStore.getState().token;
  const response = await fetch(`${API_BASE}/attachments/${attachmentId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) throw new Error("Không tải được file");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fallbackName;
  link.click();
  URL.revokeObjectURL(url);
}

function App() {
  const token = useAppStore((state) => state.token);
  const currentUser = useAppStore((state) => state.currentUser);
  const view = useAppStore((state) => state.view);
  const selectedDocumentId = useAppStore((state) => state.selectedDocumentId);
  const detail = useAppStore((state) => state.detail);

  useEffect(() => {
    if (token && !currentUser) {
      api<User>("/auth/me")
        .then((user) => useAppStore.getState().setSession(token, user))
        .catch(() => useAppStore.getState().setSession(null, null));
    }
  }, [token, currentUser]);

  useEffect(() => {
    if (!token || !currentUser) return;
    void loadReferenceData();
  }, [token, currentUser]);

  useEffect(() => {
    if (selectedDocumentId) void loadDocumentDetail(selectedDocumentId);
  }, [selectedDocumentId]);

  function closeDetail() {
    useAppStore.getState().setSelectedDocumentId(null);
    useAppStore.getState().setDetail(null);
  }

  if (!token || !currentUser) return <LoginScreen />;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <AppHeader user={currentUser} />
      <div className="flex min-h-[calc(100vh-84px)]">
        <Sidebar user={currentUser} />
        <main className="min-w-0 flex-1 p-5">
          <Notice />
          {view === "admin_dashboard" && <AdminDashboard />}
          {view === "admin_users" && <AdminUsersView />}
          {view === "admin_departments" && <AdminDepartmentsView />}
          {view === "admin_check" && <AdminCheckView />}
          {view === "dashboard" && <Dashboard />}
          {view === "incoming" && <DocumentWorkspace type="incoming" />}
          {view === "outgoing" && <DocumentWorkspace type="outgoing" />}
          {view === "progress" && <ProgressView />}
          {view === "archive" && <ArchiveView />}
        </main>
      </div>
      {detail && <DocumentDetailModal detail={detail} onClose={closeDetail} />}
    </div>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState("vanthu@example.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await api<{ access_token: string; user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      useAppStore.getState().setSession(result.access_token, result.user);
      useAppStore.getState().setNotice(`Đăng nhập: ${result.user.full_name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không đăng nhập được");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#214b74] px-6 py-10">
      <div className="mx-auto grid min-h-[calc(100vh-80px)] max-w-6xl items-center gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-xl bg-white p-6 shadow-xl">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-[#2b668f]">Dữ liệu demo đã chuẩn bị</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">Kịch bản có thể thử ngay</h2>
            </div>
            <span className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-black text-[#214b74]">Mật khẩu: password123</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {loginDemoCoverage.map((item) => (
              <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                {item}
              </div>
            ))}
          </div>
          <div className="mt-5">
            <p className="mb-2 text-sm font-black text-slate-950">Chọn nhanh tài khoản theo vai trò</p>
            <div className="grid grid-cols-2 gap-2">
              {loginDemoAccounts.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  className={clsx(
                    "rounded-lg border p-3 text-left transition hover:border-[#1d6ef0] hover:bg-blue-50",
                    email === account.email ? "border-[#1d6ef0] bg-blue-50" : "border-slate-200 bg-white",
                  )}
                  onClick={() => {
                    setEmail(account.email);
                    setPassword("password123");
                  }}
                >
                  <span className="block text-xs font-black uppercase text-[#214b74]">{account.role}</span>
                  <span className="mt-1 block text-sm font-black text-slate-950">{account.email}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-500">{account.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <form onSubmit={submit} className="w-full rounded-xl bg-white p-6 shadow-xl">
          <div className="mb-6 flex items-center gap-4">
            <img src="/LOGO_HCC.jpg" alt="Logo HCC" className="h-16 w-16 rounded-full border object-cover p-1" />
            <div>
              <p className="text-xs font-bold uppercase text-[#2b668f]">Hệ thống quản lý văn bản nội bộ</p>
              <h1 className="text-xl font-black text-slate-950">Đăng nhập</h1>
            </div>
          </div>
          <label className="mb-3 block text-sm font-bold">
            Email
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="mb-4 block text-sm font-bold">
            Mật khẩu
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
          <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1d6ef0] px-4 py-2.5 font-bold text-white" disabled={loading}>
            {loading && <Loader2 size={18} className="animate-spin" />} Đăng nhập
          </button>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Nên bắt đầu bằng Văn thư xã, sau đó thử Văn thư phòng, Trưởng phòng, Chuyên viên và Lãnh đạo để thấy luồng chuyển văn bản.
          </p>
        </form>
      </div>
    </main>
  );
}

function AppHeader({ user }: { user: User }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((item) => !item.is_read).length;

  async function loadNotifications() {
    try {
      setNotifications(await api<NotificationItem[]>("/notifications"));
    } catch (err) {
      showError(err);
    }
  }

  async function openNotification(item: NotificationItem) {
    await runAction(async () => {
      if (!item.is_read) {
        await api(`/notifications/${item.id}/read`, { method: "POST" });
      }
      if (item.document_id) {
        useAppStore.getState().setSelectedDocumentId(item.document_id);
      }
      await loadNotifications();
      setOpen(false);
    }, "Đã mở thông báo");
  }

  useEffect(() => {
    void loadNotifications();
  }, [user.id]);

  return (
    <header className="border-b border-[#173a5f] bg-[#214b74] text-white">
      <div className="flex h-[84px] items-center justify-between px-5">
        <div className="flex items-center gap-4">
          <img src="/LOGO_HCC.jpg" alt="Logo HCC" className="h-16 w-16 rounded-full bg-white object-cover p-1" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-100">UBND Xã Long Phú</p>
            <h1 className="text-2xl font-bold uppercase tracking-wide">Hệ thống quản lý văn bản nội bộ</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              className="relative rounded-lg border border-blue-300/40 p-2 text-blue-50 hover:bg-white/10"
              title="Thông báo"
              onClick={() => {
                const next = !open;
                setOpen(next);
                if (next) void loadNotifications();
              }}
            >
              <Bell size={18} />
              {unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black text-white">{unread}</span>}
            </button>
            {open && (
              <div className="absolute right-0 top-12 z-[60] w-[360px] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="font-black">Thông báo</p>
                  <button className="text-xs font-bold text-slate-500 hover:text-slate-900" onClick={() => setOpen(false)}>Đóng</button>
                </div>
                <div className="max-h-[420px] overflow-y-auto p-2">
                  {notifications.slice(0, 10).map((item) => (
                    <button
                      key={item.id}
                      className={clsx("mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-blue-50", item.is_read ? "bg-white" : "bg-blue-50/80")}
                      onClick={() => void openNotification(item)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-bold text-slate-950">{item.title}</p>
                        {!item.is_read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#1d6ef0]" />}
                      </div>
                      <p className="mt-1 line-clamp-2 text-slate-600">{item.message}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatDateTime(item.created_at)}</p>
                    </button>
                  ))}
                  {!notifications.length && <EmptyState text="Chưa có thông báo." />}
                </div>
              </div>
            )}
          </div>
          <div className="rounded-lg border border-blue-300/40 bg-white/10 px-4 py-2 text-right">
            <p className="font-semibold">{user.full_name}</p>
            <p className="text-xs text-blue-100">{user.position_label || roleLabels[user.role]} · {roleLabels[user.role]}</p>
          </div>
          <button
            className="rounded-lg border border-blue-300/40 p-2 text-blue-50 hover:bg-white/10"
            title="Đăng xuất"
            onClick={() => useAppStore.getState().setSession(null, null)}
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}

function Sidebar({ user }: { user: User }) {
  if (user.role === "admin") return <AdminSidebar />;
  return <OperationalSidebar />;
}

function OperationalSidebar() {
  const currentUser = useAppStore((state) => state.currentUser);
  const view = useAppStore((state) => state.view);
  const incomingQueue = useAppStore((state) => state.incomingQueue);
  const outgoingQueue = useAppStore((state) => state.outgoingQueue);
  const setView = useAppStore((state) => state.setView);
  const setIncomingQueue = useAppStore((state) => state.setIncomingQueue);
  const setOutgoingQueue = useAppStore((state) => state.setOutgoingQueue);
  const canUseReceivedQueue = currentUser?.role === "admin" || currentUser?.role === "clerk";
  const incomingQueues: IncomingQueue[] = canUseReceivedQueue
    ? ["received", "primary", "collaborator", "informed", "completed"]
    : ["primary", "collaborator", "informed", "completed"];

  return (
    <aside className="w-[286px] shrink-0 border-r border-slate-200 bg-white">
      <nav className="thin-scrollbar h-[calc(100vh-84px)] overflow-y-auto p-3">
        <NavButton active={view === "dashboard"} icon={<LayoutDashboard size={17} />} onClick={() => setView("dashboard")}>
          Tổng quan
        </NavButton>
        <NavGroup icon={<FileInput size={17} />} title="Văn bản đến">
          {incomingQueues.map((queue) => (
            <QueueButton key={queue} active={view === "incoming" && incomingQueue === queue} label={incomingLabels[queue]} onClick={() => setIncomingQueue(queue)} />
          ))}
        </NavGroup>
        <NavGroup icon={<FileOutput size={17} />} title="Văn bản đi">
          {(["todo", "done", "draft", "issued"] as OutgoingQueue[]).map((queue) => (
            <QueueButton key={queue} active={view === "outgoing" && outgoingQueue === queue} label={outgoingLabels[queue]} onClick={() => setOutgoingQueue(queue)} />
          ))}
        </NavGroup>
        <NavButton active={view === "progress"} icon={<BriefcaseBusiness size={17} />} onClick={() => setView("progress")}>
          Quản lý tiến độ
        </NavButton>
        <NavButton active={view === "archive"} icon={<FolderArchive size={17} />} onClick={() => setView("archive")}>
          Hồ sơ / lưu trữ
        </NavButton>
      </nav>
    </aside>
  );
}

function AdminSidebar() {
  const view = useAppStore((state) => state.view);
  const setView = useAppStore((state) => state.setView);
  const setIncomingQueue = useAppStore((state) => state.setIncomingQueue);
  const setOutgoingQueue = useAppStore((state) => state.setOutgoingQueue);
  return (
    <aside className="w-[286px] shrink-0 border-r border-slate-200 bg-white">
      <nav className="thin-scrollbar h-[calc(100vh-84px)] overflow-y-auto p-3">
        <NavGroup icon={<UserRoundCog size={17} />} title="Quản trị hệ thống">
          <QueueButton active={view === "admin_dashboard"} label="Tổng quan hệ thống" onClick={() => setView("admin_dashboard")} />
          <QueueButton active={view === "admin_users"} label="Quản lý người dùng" onClick={() => setView("admin_users")} />
          <QueueButton active={view === "admin_departments"} label="Quản lý phòng ban" onClick={() => setView("admin_departments")} />
          <QueueButton active={view === "admin_check"} label="Kiểm tra hệ thống" onClick={() => setView("admin_check")} />
        </NavGroup>
        <NavGroup icon={<ClipboardCheck size={17} />} title="Kiểm tra nghiệp vụ">
          <QueueButton active={view === "dashboard"} label="Bàn làm việc" onClick={() => setView("dashboard")} />
          <QueueButton active={view === "incoming"} label="Văn bản đến" onClick={() => setIncomingQueue("primary")} />
          <QueueButton active={view === "outgoing"} label="Văn bản đi" onClick={() => setOutgoingQueue("issued")} />
          <QueueButton active={view === "archive"} label="Hồ sơ lưu trữ" onClick={() => setView("archive")} />
        </NavGroup>
      </nav>
    </aside>
  );
}

function NavButton({ active, icon, children, onClick }: { active: boolean; icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className={clsx("mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold", active ? "bg-[#214b74] text-white" : "text-slate-700 hover:bg-slate-100")}>
      {icon}
      {children}
    </button>
  );
}

function NavGroup({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="my-2 rounded-lg border border-slate-200">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5 text-sm font-black text-[#214b74]">
        {icon}
        {title}
      </div>
      <div className="py-1">{children}</div>
    </div>
  );
}

function QueueButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={clsx("flex w-full items-center justify-between px-8 py-2 text-left text-sm", active ? "bg-blue-50 font-bold text-[#214b74]" : "text-slate-700 hover:bg-slate-50")}>
      {label}
    </button>
  );
}

function Notice() {
  const notice = useAppStore((state) => state.notice);
  if (!notice) return null;
  return (
    <div className="mb-4 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-[#214b74]">
      {notice}
      <button onClick={() => useAppStore.getState().setNotice(null)}>Đóng</button>
    </div>
  );
}

function Dashboard() {
  const dashboard = useAppStore((state) => state.dashboard);
  const progress = useAppStore((state) => state.progress);
  const loading = useAppStore((state) => state.loading);
  const setView = useAppStore((state) => state.setView);
  const setIncomingQueue = useAppStore((state) => state.setIncomingQueue);

  useEffect(() => {
    void loadDashboard();
    void loadProgress();
  }, []);

  return (
    <section>
      <PageTitle eyebrow="Tổng quan" title="Bàn làm việc văn bản" description="Nhìn nhanh văn bản đến, văn bản đi, việc đang xử lý và quá hạn." action={<RefreshButton onClick={loadDashboard} />} />
      {loading && !dashboard ? <LoadingPanel /> : null}
      {dashboard && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Tổng văn bản" value={dashboard.total_documents} tone="blue" icon={<FileInput size={22} />} description="Tất cả văn bản trong hệ thống" onClick={() => setIncomingQueue("primary")} />
            <StatCard label="Đang xử lý" value={dashboard.in_progress} tone="cyan" icon={<BriefcaseBusiness size={22} />} description="Việc chưa hoàn thành" onClick={() => setView("progress")} />
            <StatCard label="Đã hoàn tất" value={dashboard.completed} tone="green" icon={<CheckCircle2 size={22} />} description="Đã xử lý xong" onClick={() => setIncomingQueue("completed")} />
            <StatCard label="Quá hạn" value={dashboard.overdue} tone="amber" icon={<History size={22} />} description="Cần xử lý gấp" onClick={() => setView("progress")} />
          </div>
          <Panel title="Tiến độ xử lý của tôi" icon={<BriefcaseBusiness size={18} />}>
            <ProgressTable items={progress.items} compact />
          </Panel>
        </>
      )}
    </section>
  );
}

function QuickLink({ label, description, icon, onClick }: { label: string; description: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-[#214b74] hover:bg-blue-50/60">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#214b74]/10 text-[#214b74]">{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
    </button>
  );
}

function DocumentWorkspace({ type }: { type: DocumentType }) {
  const currentUser = useAppStore((state) => state.currentUser);
  const queue = useAppStore((state) => (type === "incoming" ? state.incomingQueue : state.outgoingQueue));
  const documents = useAppStore((state) => state.documents);
  const selectedDocumentId = useAppStore((state) => state.selectedDocumentId);
  const documentSearch = useAppStore((state) => state.documentSearch);
  const dueFrom = useAppStore((state) => state.dueFrom);
  const dueBefore = useAppStore((state) => state.dueBefore);
  const setIncomingQueue = useAppStore((state) => state.setIncomingQueue);
  const [showCreate, setShowCreate] = useState(false);
  const title = type === "incoming" ? "Văn bản đến" : "Văn bản đi";
  const subtitle = type === "incoming" ? incomingLabels[queue as IncomingQueue] : outgoingLabels[queue as OutgoingQueue];
  const canCreateIncoming = currentUser?.role === "admin" || currentUser?.role === "clerk";
  const canCreateOutgoing = currentUser?.role === "admin" || currentUser?.role === "clerk" || currentUser?.role === "manager";
  const canCreate = type === "incoming" ? canCreateIncoming : canCreateOutgoing;
  const description = type === "incoming"
    ? queue === "received"
      ? "Văn bản giấy/email ngoài hệ thống được nhập thủ công, đang chờ giao xử lý."
      : "Văn bản được gửi/chuyển đến bạn hoặc phòng ban của bạn để xử lý, phối hợp hoặc xem để biết."
    : "Văn bản do đơn vị bạn tạo/gửi đi, theo dõi theo dự thảo, xử lý và phát hành.";
  const createLabel = type === "incoming" ? "Nhập văn bản giấy" : "Tạo văn bản đi";

  useEffect(() => {
    if (type === "incoming" && queue === "received" && !canCreateIncoming) setIncomingQueue("primary");
  }, [type, queue, canCreateIncoming, setIncomingQueue]);

  useEffect(() => {
    void loadDocuments(type);
  }, [type, queue, documentSearch, dueFrom, dueBefore]);

  return (
    <section>
      <PageTitle
        eyebrow={title}
        title={subtitle}
        description={description}
        action={canCreate ? <button onClick={() => setShowCreate(true)} className={type === "incoming" ? "icon-text-btn" : "primary-btn"}><FilePlus2 size={16} /> {createLabel}</button> : undefined}
      />
      <Toolbar />
      <Panel title={`Danh sách ${title.toLowerCase()}`} icon={type === "incoming" ? <FileInput size={18} /> : <FileOutput size={18} />}>
        <DocumentTable docs={documents.items} selectedId={selectedDocumentId || undefined} />
      </Panel>
      {showCreate && <CreateDocumentModal type={type} onClose={() => setShowCreate(false)} />}
    </section>
  );
}

function DocumentTable({ docs, selectedId, compact = false }: { docs: DocumentRow[]; selectedId?: string; compact?: boolean }) {
  const setSelected = useAppStore((state) => state.setSelectedDocumentId);
  return (
    <div className="thin-scrollbar overflow-auto">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <thead>
          <tr className="bg-[#214b74] text-left text-xs uppercase tracking-wide text-white">
            <th className="w-14 px-3 py-3 text-center">STT</th>
            <th className="w-32 px-3 py-3">Số đến/PH</th>
            <th className="w-52 px-3 py-3">Số văn bản</th>
            <th className="px-3 py-3">Trích yếu</th>
            <th className="w-36 px-3 py-3">Ngày</th>
            <th className="w-56 px-3 py-3">Cơ quan</th>
            <th className="w-28 px-3 py-3">Độ khẩn</th>
          </tr>
        </thead>
        <tbody>
          {docs.slice(0, compact ? 6 : docs.length).map((doc, index) => (
            <tr key={doc.id} onClick={() => setSelected(doc.id)} className={clsx("cursor-pointer border-b border-slate-200 hover:bg-blue-50", selectedId === doc.id ? "bg-blue-50" : index % 2 ? "bg-white" : "bg-slate-50/60")}>
              <td className="px-3 py-3 text-center font-semibold">{index + 1}</td>
              <td className="px-3 py-3 font-semibold">{doc.arrival_number || "PH"}</td>
              <td className="px-3 py-3 font-semibold">{doc.code || "-"}</td>
              <td className={clsx("px-3 py-3 leading-relaxed", doc.is_unread ? "font-black text-slate-950" : "font-semibold")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span>{doc.title}</span>
                  {doc.is_unread && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black uppercase text-amber-800">Chưa xem</span>}
                </div>
              </td>
              <td className="px-3 py-3">{formatDate(doc.received_date || doc.issued_date || doc.document_date)}</td>
              <td className="px-3 py-3">{doc.issuing_agency || "-"}</td>
              <td className="px-3 py-3"><PriorityBadge priority={doc.priority} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!docs.length && <EmptyState text="Không có văn bản trong mục này." />}
    </div>
  );
}

function DocumentDetailModal({ detail, onClose }: { detail: DocumentDetail; onClose: () => void }) {
  const users = useAppStore((state) => state.users);
  const departments = useAppStore((state) => state.departments);
  const [forwardAssignmentId, setForwardAssignmentId] = useState<string | null>(null);
  const [returnAssignmentId, setReturnAssignmentId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"receivers" | "comments" | "workflow" | "history">("receivers");

  const rootAssignments = detail.assignments.filter((item) => !item.parent_assignment_id);
  const userName = (id: string | null) => users.find((item) => item.id === id)?.full_name || "";
  const deptName = (id: string | null) => departments.find((item) => item.id === id)?.name || "";
  const labelFor = (assignment: Assignment) => userName(assignment.receiver_user_id) || deptName(assignment.receiver_department_id) || "Chưa rõ";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-10 pb-10" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-6xl rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 p-5 rounded-t-2xl">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-[#2b668f]">{detail.document_type === "incoming" ? "Thông tin văn bản đến" : "Thông tin văn bản đi"}</p>
            <h3 className="mt-1 text-xl font-bold leading-snug text-slate-950">{detail.title}</h3>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Đóng</button>
        </div>
        {/* Body — 2 columns */}
        <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-2">
          {/* Left column: metadata + actions */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Info label="Số văn bản" value={detail.code || "-"} />
              <Info label={detail.document_type === "incoming" ? "Số đến" : "Số phát hành"} value={detail.arrival_number || "PH"} />
              <Info label="Cơ quan" value={detail.issuing_agency || "-"} wide />
              <Info label="Ngày" value={formatDate(detail.received_date || detail.issued_date || detail.document_date)} />
              <Info label="Hạn xử lý" value={formatDate(detail.due_date)} />
              <Info label="Độ khẩn" value={priorityLabels[detail.priority]} />
              <Info label="Trạng thái" value={documentStatus(detail.status)} />
            </div>

            <PanelBlock title="Việc cần làm với văn bản" icon={<Archive size={16} />}>
              <DocumentActions detail={detail} />
            </PanelBlock>

            <PanelBlock title="File văn bản" icon={<Paperclip size={16} />}>
              {detail.attachments.map((file) => (
                <div key={file.id} className="mb-2 flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{file.original_name}</p>
                    <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
                  </div>
                  <button className="icon-text-btn" onClick={() => runAction(() => downloadFile(file.id, file.original_name), "Đã tải file")}>
                    <Download size={14} /> Tải
                  </button>
                </div>
              ))}
              {!detail.attachments.length && <EmptyState text="Chưa có file đính kèm." />}
              {detail.my_permissions.can_update && !["completed", "issued", "archived", "voided"].includes(detail.status) && <UploadAttachment documentId={detail.id} />}
            </PanelBlock>

            <PanelBlock title="Hành động của tôi" icon={<ShieldCheck size={16} />}>
              {detail.my_assignments.length ? (
                <div className="space-y-3">
                  {detail.my_assignments.map((assignment) => (
                    <div key={assignment.id} className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <RoleBadge role={assignment.assignment_role} />
                        <AssignmentStatusBadge status={assignment.status} />
                      </div>
                      <p className="text-sm font-semibold">{assignment.instruction || "Không có ghi chú xử lý."}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {assignment.can_start && (
                          <button className="icon-text-btn" onClick={() => runAssignmentAction(assignment.id, "start")}>
                            <Eye size={14} /> Bắt đầu
                          </button>
                        )}
                        {assignment.can_complete && (
                          <button className="primary-btn small" onClick={() => runAssignmentAction(assignment.id, "complete")}>
                            <CheckCircle2 size={14} /> Kết thúc phần của tôi
                          </button>
                        )}
                        {assignment.can_forward && (
                          <button className="icon-text-btn" onClick={() => setForwardAssignmentId(forwardAssignmentId === assignment.id ? null : assignment.id)}>
                            <Send size={14} /> Chuyển tiếp
                          </button>
                        )}
                        {assignment.can_return && (
                          <button className="icon-text-btn" onClick={() => setReturnAssignmentId(returnAssignmentId === assignment.id ? null : assignment.id)}>
                            <RotateCcw size={14} /> Trả lại
                          </button>
                        )}
                      </div>
                      {assignment.can_forward && forwardAssignmentId === assignment.id && <ForwardForm assignmentId={assignment.id} />}
                      {assignment.can_return && returnAssignmentId === assignment.id && (
                        <ReturnForm
                          assignmentId={assignment.id}
                          senderName={userName(assignment.sender_user_id) || deptName(assignment.sender_department_id) || "người gửi trước đó"}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text="Bạn không có phần xử lý trực tiếp trong văn bản này." />
              )}
            </PanelBlock>
          </div>

          {/* Right column: secondary detail tabs */}
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="grid grid-cols-4 border-b border-slate-200 bg-slate-50 text-sm font-bold">
                <DetailTabButton active={detailTab === "receivers"} onClick={() => setDetailTab("receivers")}>Người nhận</DetailTabButton>
                <DetailTabButton active={detailTab === "comments"} onClick={() => setDetailTab("comments")}>Bình luận</DetailTabButton>
                <DetailTabButton active={detailTab === "workflow"} onClick={() => setDetailTab("workflow")}>Luồng xử lý</DetailTabButton>
                <DetailTabButton active={detailTab === "history"} onClick={() => setDetailTab("history")}>Lịch sử</DetailTabButton>
              </div>
              <div className="p-3">
                {detailTab === "receivers" && (
                  <div className="space-y-2">
                    {detail.assignments.slice().reverse().map((assignment) => (
                      <div key={assignment.id} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                        <div>
                          <p className="font-semibold">{labelFor(assignment)}</p>
                          <p className="text-xs text-slate-500">{actionText(assignment.action_type)} · {formatDate(assignment.due_date)}</p>
                        </div>
                        <div className="text-right">
                          <RoleBadge role={assignment.assignment_role} />
                          <div className="mt-1"><AssignmentStatusBadge status={assignment.status} /></div>
                        </div>
                      </div>
                    ))}
                    {!detail.assignments.length && <EmptyState text="Chưa giao cho ai xử lý." />}
                  </div>
                )}
                {detailTab === "comments" && (
                  <div className="space-y-2">
                    {detail.comments.map((comment) => (
                      <div key={comment.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                        <p>{comment.content}</p>
                        <p className="mt-1 text-xs text-slate-500">{userName(comment.user_id) || "Người dùng"} · {formatDateTime(comment.created_at)}</p>
                      </div>
                    ))}
                    {!detail.comments.length && <EmptyState text="Chưa có bình luận." />}
                    <CommentForm documentId={detail.id} />
                  </div>
                )}
                {detailTab === "workflow" && (
                  <div className="space-y-2">
                    {rootAssignments.map((assignment) => (
                      <WorkflowNode key={assignment.id} assignment={assignment} assignments={detail.assignments} users={users} departments={departments} depth={0} />
                    ))}
                    {!rootAssignments.length && <EmptyState text="Chưa có luồng xử lý." />}
                  </div>
                )}
                {detailTab === "history" && (
                  <div className="space-y-2">
                    {detail.history_logs.map((log) => (
                      <div key={log.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                        <p className="font-semibold text-[#214b74]">{actionText(log.action_type)}</p>
                        <p>{log.description || "-"}</p>
                        <p className="text-xs text-slate-500">{formatDateTime(log.created_at)}</p>
                      </div>
                    ))}
                    {!detail.history_logs.length && <EmptyState text="Chưa có lịch sử thao tác." />}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      className={clsx("px-3 py-3 text-center transition", active ? "bg-white text-[#214b74]" : "text-slate-500 hover:bg-white/70 hover:text-slate-900")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function WorkflowNode({ assignment, assignments, users, departments, depth }: { assignment: Assignment; assignments: Assignment[]; users: User[]; departments: Department[]; depth: number }) {
  const children = assignments.filter((item) => item.parent_assignment_id === assignment.id);
  const receiver = users.find((item) => item.id === assignment.receiver_user_id)?.full_name || departments.find((item) => item.id === assignment.receiver_department_id)?.name || "Chưa rõ";
  const sender = users.find((item) => item.id === assignment.sender_user_id)?.full_name || "Hệ thống";
  return (
    <div>
      <div className="rounded-lg border border-slate-200 bg-white p-3" style={{ marginLeft: depth * 18 }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-950">{receiver}</p>
            <p className="mt-1 text-xs text-slate-500">Người gửi: {sender}</p>
          </div>
          <RoleBadge role={assignment.assignment_role} />
        </div>
        <p className="mt-2 text-sm text-slate-700">{assignment.instruction || actionText(assignment.action_type)}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <TimelineCell label="Chưa xử lý" value={assignment.pending_at} />
          <TimelineCell label="Đang xử lý" value={assignment.started_at} />
          <TimelineCell label="Đã xử lý" value={assignment.completed_at} />
        </div>
      </div>
      {children.map((child) => (
        <WorkflowNode key={child.id} assignment={child} assignments={assignments} users={users} departments={departments} depth={depth + 1} />
      ))}
    </div>
  );
}

function DocumentActions({ detail }: { detail: DocumentDetail }) {
  const [showAssign, setShowAssign] = useState(detail.document_type === "incoming" && detail.status === "received");
  const [showEdit, setShowEdit] = useState(false);
  const isClosed = ["archived", "voided"].includes(detail.status);
  const finalBusinessStatus = ["completed", "issued", "archived", "voided"].includes(detail.status);
  const canEdit = detail.my_permissions.can_update && !finalBusinessStatus;
  const canAssign = detail.my_permissions.can_update && detail.document_type === "incoming" && !finalBusinessStatus;
  const canArchive = detail.my_permissions.can_update && ["completed", "issued"].includes(detail.status) && !isClosed;
  const canSubmit = detail.document_type === "outgoing" && detail.status === "draft" && detail.my_permissions.can_update;
  const canApprove = detail.document_type === "outgoing" && detail.status === "pending_signature" && detail.my_permissions.can_update;
  const canIssue = detail.document_type === "outgoing" && ["draft", "approved"].includes(detail.status) && detail.my_permissions.can_update;
  const canVoid = detail.my_permissions.can_void && !finalBusinessStatus;

  if (!canEdit && !canAssign && !canArchive && !canSubmit && !canApprove && !canIssue && !canVoid) {
    return <EmptyState text="Không có thao tác văn bản khả dụng." />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <button className="icon-text-btn" onClick={() => setShowEdit(!showEdit)}>
            <Pencil size={14} /> Sửa thông tin
          </button>
        )}
        {canAssign && (
          <button className="primary-btn small" onClick={() => setShowAssign(!showAssign)}>
            <Send size={14} /> Giao xử lý
          </button>
        )}
        {canSubmit && (
          <button className="icon-text-btn" onClick={() => runDocumentAction(detail.id, "submit-signature", "Đã trình ký")}>
            <Send size={14} /> Trình ký
          </button>
        )}
        {canApprove && (
          <button className="primary-btn small" onClick={() => runDocumentAction(detail.id, "approve-signature", "Đã ký duyệt")}>
            <CheckCircle2 size={14} /> Ký duyệt
          </button>
        )}
        {canIssue && (
          <button className="primary-btn small" onClick={() => runDocumentAction(detail.id, "issue", "Đã phát hành")}>
            <FileOutput size={14} /> Phát hành
          </button>
        )}
        {canArchive && (
          <button className="icon-text-btn" onClick={() => runDocumentAction(detail.id, "archive", "Đã lưu hồ sơ")}>
            <Archive size={14} /> Lưu hồ sơ
          </button>
        )}
        {canVoid && (
          <button
            className="icon-text-btn !text-red-600 hover:!bg-red-50"
            onClick={() => {
              const reason = window.prompt("Nhập lý do hủy văn bản:");
              if (reason) {
                runAction(async () => {
                  await api(`/documents/${detail.id}/void`, {
                    method: "POST",
                    body: JSON.stringify({ reason }),
                  });
                  const store = useAppStore.getState();
                  store.setDetail(null);
                  store.setSelectedDocumentId(null);
                  await loadDocuments(detail.document_type, true);
                  await loadProgress();
                  if (store.view === "dashboard") await loadDashboard();
                }, "Đã hủy văn bản");
              }
            }}
          >
            <RotateCcw size={14} /> Hủy văn bản
          </button>
        )}
      </div>
      {showEdit && <EditDocumentForm detail={detail} onDone={() => setShowEdit(false)} />}
      {showAssign && <AssignDocumentForm detail={detail} onDone={() => setShowAssign(false)} />}
    </div>
  );
}

function EditDocumentForm({ detail, onDone }: { detail: DocumentDetail; onDone: () => void }) {
  const departments = useAppStore((state) => state.departments);
  const [title, setTitle] = useState(detail.title);
  const [code, setCode] = useState(detail.code || "");
  const [arrivalNumber, setArrivalNumber] = useState(detail.arrival_number || "");
  const [agency, setAgency] = useState(detail.issuing_agency || "");
  const [dueDate, setDueDate] = useState(detail.due_date || "");
  const [priority, setPriority] = useState<Priority>(detail.priority);
  const [departmentId, setDepartmentId] = useState(detail.owner_department_id || "");

  async function submit() {
    if (!title.trim()) throw new Error("Cần nhập trích yếu văn bản");
    await api(`/documents/${detail.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title,
        code: code || null,
        arrival_number: arrivalNumber || null,
        issuing_agency: agency || null,
        due_date: dueDate || null,
        priority,
        owner_department_id: departmentId || null,
      }),
    });
    onDone();
    await refreshActiveWorkspace();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 text-xs font-bold text-slate-600">Trích yếu <textarea className="field mt-1 min-h-20 w-full" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-600">Số văn bản <input className="field mt-1 w-full" value={code} onChange={(e) => setCode(e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-600">{detail.document_type === "incoming" ? "Số đến" : "Số phát hành"} <input className="field mt-1 w-full" value={arrivalNumber} onChange={(e) => setArrivalNumber(e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-600">Cơ quan ban hành <input className="field mt-1 w-full" value={agency} onChange={(e) => setAgency(e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-600">Hạn xử lý <input className="field mt-1 w-full" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
        <label className="text-xs font-bold text-slate-600">Độ khẩn <select className="field mt-1 w-full" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}><option value="normal">Thường</option><option value="high">Khẩn</option><option value="urgent">Hỏa tốc</option></select></label>
        <label className="text-xs font-bold text-slate-600">Đơn vị sở hữu <select className="field mt-1 w-full" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}><option value="">Không chọn</option>{departments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}</select></label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button className="icon-text-btn" onClick={onDone}>Đóng</button>
        <button className="primary-btn small" onClick={() => runAction(submit, "Đã cập nhật văn bản")}><CheckCircle2 size={14} /> Lưu</button>
      </div>
    </div>
  );
}

function AssignDocumentForm({ detail, onDone }: { detail: DocumentDetail; onDone: () => void }) {
  const users = useAppStore((state) => state.users);
  const departments = useAppStore((state) => state.departments);
  const [target, setTarget] = useState("");
  const [role, setRole] = useState<AssignmentRole>("primary");
  const [actionType, setActionType] = useState<ActionType>("assign");
  const [dueDate, setDueDate] = useState(detail.due_date || "");
  const [priority, setPriority] = useState<Priority>(detail.priority);
  const [instruction, setInstruction] = useState("Giao xử lý văn bản.");

  async function submit() {
    const [kind, id] = target.split(":");
    if (!id) throw new Error("Cần chọn người hoặc phòng ban nhận");
    await api(`/documents/${detail.id}/assign`, {
      method: "POST",
      body: JSON.stringify({
        receiver_user_id: kind === "user" ? id : null,
        receiver_department_id: kind === "department" ? id : null,
        assignment_role: role,
        action_type: actionType,
        instruction,
        due_date: dueDate || null,
        priority,
      }),
    });
    onDone();
    await refreshActiveWorkspace();
  }

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
      <div className="mb-2 text-sm font-bold text-[#214b74]">Giao văn bản cho người/phòng ban xử lý</div>
      <div className="grid grid-cols-2 gap-2">
        <select className="field" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Chọn người/phòng ban nhận</option>
          <optgroup label="Người dùng">
            {users.map((user) => <option key={user.id} value={`user:${user.id}`}>{user.full_name}</option>)}
          </optgroup>
          <optgroup label="Phòng ban">
            {departments.map((dept) => <option key={dept.id} value={`department:${dept.id}`}>{dept.name}</option>)}
          </optgroup>
        </select>
        <select className="field" value={role} onChange={(e) => setRole(e.target.value as AssignmentRole)}>
          <option value="primary">Xử lý chính</option>
          <option value="collaborator">Phối hợp</option>
          <option value="informed">Xem để biết</option>
        </select>
        <select className="field" value={actionType} onChange={(e) => setActionType(e.target.value as ActionType)}>
          <option value="assign">Phân công</option>
          <option value="direct">Chỉ đạo</option>
          <option value="advise">Tham mưu</option>
          <option value="forward">Chuyển xử lý</option>
        </select>
        <input className="field" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <select className="field" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
          <option value="normal">Thường</option>
          <option value="high">Khẩn</option>
          <option value="urgent">Hỏa tốc</option>
        </select>
      </div>
      <textarea className="field mt-2 min-h-20 w-full" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
      <div className="mt-2 flex justify-end gap-2">
        <button className="icon-text-btn" onClick={onDone}>Đóng</button>
        <button className="primary-btn" onClick={() => runAction(submit, "Đã giao xử lý")}>
          <Send size={14} /> Giao xử lý
        </button>
      </div>
    </div>
  );
}

function ForwardForm({ assignmentId }: { assignmentId: string }) {
  const users = useAppStore((state) => state.users);
  const departments = useAppStore((state) => state.departments);
  const [target, setTarget] = useState("");
  const [role, setRole] = useState<AssignmentRole>("primary");
  const [actionType, setActionType] = useState<ActionType>("forward");
  const [dueDate, setDueDate] = useState("");
  const [instruction, setInstruction] = useState("Chuyển xử lý theo nội dung chỉ đạo.");

  async function submit() {
    const [kind, id] = target.split(":");
    if (!id) throw new Error("Cần chọn người hoặc phòng ban nhận");
    await api(`/assignments/${assignmentId}/forward`, {
      method: "POST",
      body: JSON.stringify({
        action_type: actionType,
        instruction,
        receivers: [
          {
            receiver_user_id: kind === "user" ? id : null,
            receiver_department_id: kind === "department" ? id : null,
            assignment_role: role,
            due_date: dueDate || null,
            priority: "normal",
          },
        ],
      }),
    });
    await refreshActiveWorkspace();
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="grid grid-cols-2 gap-2">
        <select className="field" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Chọn người/phòng ban</option>
          <optgroup label="Người dùng">
            {users.map((user) => <option key={user.id} value={`user:${user.id}`}>{user.full_name}</option>)}
          </optgroup>
          <optgroup label="Phòng ban">
            {departments.map((dept) => <option key={dept.id} value={`department:${dept.id}`}>{dept.name}</option>)}
          </optgroup>
        </select>
        <select className="field" value={role} onChange={(e) => setRole(e.target.value as AssignmentRole)}>
          <option value="primary">Xử lý chính</option>
          <option value="collaborator">Phối hợp</option>
          <option value="informed">Xem để biết</option>
        </select>
        <select className="field" value={actionType} onChange={(e) => setActionType(e.target.value as ActionType)}>
          <option value="forward">Chuyển xử lý</option>
          <option value="advise">Tham mưu</option>
          <option value="direct">Chỉ đạo</option>
          <option value="assign">Phân công</option>
        </select>
        <input className="field" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <button className="primary-btn" onClick={() => runAction(submit, "Đã chuyển xử lý")}>
          <Send size={14} /> Chuyển
        </button>
      </div>
      <textarea className="field mt-2 min-h-20 w-full" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
    </div>
  );
}

function ReturnForm({ assignmentId, senderName }: { assignmentId: string; senderName: string }) {
  const users = useAppStore((state) => state.users);
  const departments = useAppStore((state) => state.departments);
  const [target, setTarget] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [instruction, setInstruction] = useState("Trả lại để bổ sung/chỉnh sửa nội dung xử lý.");

  async function submit() {
    const [kind, id] = target.split(":");
    await api(`/assignments/${assignmentId}/return`, {
      method: "POST",
      body: JSON.stringify({
        receiver_user_id: kind === "user" ? id : null,
        receiver_department_id: kind === "department" ? id : null,
        instruction,
        due_date: dueDate || null,
        priority: "normal",
      }),
    });
    await refreshActiveWorkspace();
  }

  return (
    <div className="mt-3 rounded-lg border border-red-100 bg-white p-3">
      <div className="grid grid-cols-2 gap-2">
        <select className="field" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Trả về {senderName} (người gửi)</option>
          <optgroup label="Người dùng">
            {users.map((user) => <option key={user.id} value={`user:${user.id}`}>{user.full_name}</option>)}
          </optgroup>
          <optgroup label="Phòng ban">
            {departments.map((dept) => <option key={dept.id} value={`department:${dept.id}`}>{dept.name}</option>)}
          </optgroup>
        </select>
        <input className="field" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      <textarea className="field mt-2 min-h-20 w-full" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
      <div className="mt-2 flex justify-end">
        <button className="icon-text-btn" onClick={() => runAction(submit, "Đã trả lại")}>
          <RotateCcw size={14} /> Trả lại
        </button>
      </div>
    </div>
  );
}

function CommentForm({ documentId }: { documentId: string }) {
  const [content, setContent] = useState("");

  async function submit() {
    if (!content.trim()) throw new Error("Cần nhập nội dung bình luận");
    await api(`/documents/${documentId}/comments`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    setContent("");
    await loadDocumentDetail(documentId);
  }

  return (
    <div className="pt-2">
      <textarea className="field min-h-20 w-full" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Nhập ý kiến xử lý..." />
      <div className="mt-2 flex justify-end">
        <button className="icon-text-btn" onClick={() => runAction(submit, "Đã thêm bình luận")}>
          <Send size={14} /> Gửi bình luận
        </button>
      </div>
    </div>
  );
}

function UploadAttachment({ documentId }: { documentId: string }) {
  const [file, setFile] = useState<File | null>(null);
  async function submit() {
    if (!file) throw new Error("Cần chọn file");
    const form = new FormData();
    form.set("file", file);
    await api(`/documents/${documentId}/attachments`, { method: "POST", body: form });
    await loadDocumentDetail(documentId);
  }
  return (
    <div className="mt-3 flex items-center gap-2">
      <input className="field min-w-0 flex-1" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <button className="icon-text-btn" onClick={() => runAction(submit, "Đã upload file")}>
        <Upload size={14} /> Upload
      </button>
    </div>
  );
}

function CreateDocumentModal({ type, onClose }: { type: DocumentType; onClose: () => void }) {
  const departments = useAppStore((state) => state.departments);
  const isManualIncoming = type === "incoming";
  const modalTitle = isManualIncoming ? "Nhập văn bản giấy/ngoài hệ thống" : "Tạo văn bản đi";
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [arrivalNumber, setArrivalNumber] = useState("");
  const [agency, setAgency] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [departmentId, setDepartmentId] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await runAction(async () => {
      const created = await api<DocumentRow>(type === "incoming" ? "/documents/incoming/receive" : "/documents/outgoing", {
        method: "POST",
        body: JSON.stringify({
          document_type: type,
          title,
          code: code || null,
          arrival_number: arrivalNumber || null,
          issuing_agency: agency || null,
          due_date: dueDate || null,
          priority,
          owner_department_id: departmentId || null,
        }),
      });
      if (type === "incoming") {
        useAppStore.getState().setIncomingQueue("received");
      }
      await loadDocuments(type);
      useAppStore.getState().setSelectedDocumentId(created.id);
      onClose();
    }, type === "incoming" ? "Đã nhập văn bản giấy, chờ giao xử lý" : "Đã tạo văn bản đi");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-5">
      <form onSubmit={submit} className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black">{modalTitle}</h3>
            {isManualIncoming && <p className="mt-1 text-sm text-slate-500">Dùng khi văn thư cần nhập văn bản giấy, email ngoài hệ thống hoặc file scan vào sổ để giao xử lý.</p>}
          </div>
          <button type="button" onClick={onClose} className="text-sm font-bold text-slate-500">Đóng</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-sm font-bold">Trích yếu <textarea className="field mt-1 min-h-24 w-full" value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
          <label className="text-sm font-bold">Số văn bản <input className="field mt-1 w-full" value={code} onChange={(e) => setCode(e.target.value)} /></label>
          <label className="text-sm font-bold">{type === "incoming" ? "Số đến" : "Số phát hành"} <input className="field mt-1 w-full" value={arrivalNumber} onChange={(e) => setArrivalNumber(e.target.value)} /></label>
          <label className="text-sm font-bold">Cơ quan ban hành <input className="field mt-1 w-full" value={agency} onChange={(e) => setAgency(e.target.value)} /></label>
          <label className="text-sm font-bold">Hạn xử lý <input className="field mt-1 w-full" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
          <label className="text-sm font-bold">Độ khẩn <select className="field mt-1 w-full" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}><option value="normal">Thường</option><option value="high">Khẩn</option><option value="urgent">Hỏa tốc</option></select></label>
          <label className="text-sm font-bold">Đơn vị sở hữu <select className="field mt-1 w-full" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}><option value="">Không chọn</option>{departments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}</select></label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="icon-text-btn" onClick={onClose}>Huỷ</button>
          <button className="primary-btn"><FilePlus2 size={16} /> Lưu</button>
        </div>
      </form>
    </div>
  );
}

function ProgressView() {
  const progress = useAppStore((state) => state.progress);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<ProgressSortBy>("received_at");
  const [sortDir, setSortDir] = useState<ProgressSortDir>("desc");
  const [page, setPage] = useState(1);

  const reload = (nextPage = page) => loadProgress({ search, sortBy, sortDir, page: nextPage, size: 20 });

  useEffect(() => {
    void reload(page);
  }, [search, sortBy, sortDir, page]);

  function applySearch(event?: React.FormEvent) {
    event?.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  }

  return (
    <section>
      <PageTitle eyebrow="Quản lý tiến độ" title="Theo dõi từng lượt xử lý" description="Mỗi assignment là một đầu việc có người/phòng ban nhận, vai trò, hạn và trạng thái riêng." action={<RefreshButton onClick={() => reload()} />} />
      <form onSubmit={applySearch} className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <label className="min-w-[320px] flex-1 text-sm font-bold">
          Tìm kiếm
          <div className="mt-1 flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3">
            <Search size={16} className="text-slate-400" />
            <input className="min-w-0 flex-1 outline-none" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="Tìm theo số vào sổ, ký hiệu, nội dung, người/đơn vị nhận..." />
          </div>
        </label>
        <label className="text-sm font-bold">
          Sắp xếp theo
          <select className="field mt-1 w-56" value={sortBy} onChange={(e) => { setPage(1); setSortBy(e.target.value as ProgressSortBy); }}>
            <option value="received_at">Mới nhận gần nhất</option>
            <option value="document_received_date">Ngày văn bản/tiếp nhận</option>
            <option value="document_number">Số vào sổ/PH</option>
            <option value="due_date">Hạn xử lý</option>
            <option value="document_title">Nội dung văn bản</option>
            <option value="receiver_label">Tên người/đơn vị nhận</option>
            <option value="status">Trạng thái</option>
            <option value="priority">Độ khẩn</option>
          </select>
        </label>
        <label className="text-sm font-bold">
          Thứ tự
          <select className="field mt-1 w-36" value={sortDir} onChange={(e) => { setPage(1); setSortDir(e.target.value as ProgressSortDir); }}>
            <option value="asc">Tăng dần</option>
            <option value="desc">Giảm dần</option>
          </select>
        </label>
        <button className="primary-btn h-10"><Search size={16} /> Tìm</button>
      </form>
      <Panel title="Danh sách tiến độ" icon={<BriefcaseBusiness size={18} />}>
        <ProgressTable items={progress.items} page={progress} onPageChange={setPage} />
      </Panel>
    </section>
  );
}

function ProgressTable({ items, compact = false, page, onPageChange }: { items: ProgressRow[]; compact?: boolean; page?: Page<ProgressRow>; onPageChange?: (page: number) => void }) {
  const rows = compact ? items.slice(0, 12) : items;
  const startIndex = page ? (page.page - 1) * page.size : 0;
  return (
    <>
      <div className="thin-scrollbar overflow-auto">
        <table className="w-full min-w-[1220px] border-collapse text-sm">
          <thead>
            <tr className="bg-[#214b74] text-left text-xs uppercase tracking-wide text-white">
              <th className="w-14 px-3 py-3 text-center">STT</th>
              <th className="w-32 px-3 py-3">Số vào sổ/PH</th>
              <th className="w-48 px-3 py-3">Ký hiệu</th>
              <th className="px-3 py-3">Nội dung</th>
              <th className="w-56 px-3 py-3">Người/đơn vị nhận</th>
              <th className="w-32 px-3 py-3">Ngày nhận</th>
              <th className="w-32 px-3 py-3">Hạn</th>
              <th className="w-32 px-3 py-3">Trạng thái</th>
              <th className="w-28 px-3 py-3">Ưu tiên</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item, index) => (
              <tr key={item.assignment_id} onClick={() => useAppStore.getState().setSelectedDocumentId(item.document_id)} className={clsx("cursor-pointer border-b border-white/60 hover:brightness-95", item.status === "overdue" ? "bg-amber-300/80" : item.status === "completed" ? "bg-emerald-50" : "bg-cyan-100")}>
                <td className="px-3 py-3 text-center font-semibold">{startIndex + index + 1}</td>
                <td className="px-3 py-3 font-semibold">{item.document_number || "-"}</td>
                <td className="px-3 py-3 font-semibold">{item.document_code || "-"}</td>
                <td className="px-3 py-3 font-semibold">{item.document_title}<div className="mt-1 text-xs font-normal text-slate-600">{item.instruction || "-"}</div></td>
                <td className="px-3 py-3">{item.receiver_label}<div className="mt-1"><RoleBadge role={item.assignment_role} /></div></td>
                <td className="px-3 py-3">{item.received_at ? formatDateTime(item.received_at) : formatDate(item.document_received_date)}</td>
                <td className="px-3 py-3">{formatDate(item.due_date)}</td>
                <td className="px-3 py-3">{assignmentStatusLabels[item.status]}</td>
                <td className="px-3 py-3"><PriorityBadge priority={item.priority} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && <EmptyState text="Chưa có dữ liệu tiến độ." />}
      </div>
      {page && onPageChange && <Pagination page={page} onPageChange={onPageChange} />}
    </>
  );
}

function Pagination<T>({ page, onPageChange }: { page: Page<T>; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(page.total / page.size));
  const from = page.total ? (page.page - 1) * page.size + 1 : 0;
  const to = Math.min(page.page * page.size, page.total);
  return (
    <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-sm">
      <span className="font-semibold text-slate-600">Hiển thị {from}-{to} / {page.total} dòng</span>
      <div className="flex items-center gap-2">
        <button className="icon-text-btn disabled:opacity-45" disabled={page.page <= 1} onClick={() => onPageChange(page.page - 1)}>Trước</button>
        <span className="rounded-lg bg-slate-100 px-3 py-2 font-bold text-slate-700">Trang {page.page}/{totalPages}</span>
        <button className="icon-text-btn disabled:opacity-45" disabled={page.page >= totalPages} onClick={() => onPageChange(page.page + 1)}>Sau</button>
      </div>
    </div>
  );
}

function ArchiveView() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  useEffect(() => {
    Promise.all([
      api<Page<DocumentRow>>("/documents?status=issued&size=50"),
      api<Page<DocumentRow>>("/documents?status=archived&size=50"),
    ])
      .then(([issued, archived]) => setDocs([...issued.items, ...archived.items]))
      .catch(showError);
  }, []);
  return (
    <section>
      <PageTitle eyebrow="Hồ sơ" title="Lưu trữ và tra cứu hồ sơ" description="Các văn bản đã phát hành/lưu trữ, phục vụ tìm kiếm nhanh khi demo." />
      <Panel title="Hồ sơ gần đây" icon={<Archive size={18} />}>
        <DocumentTable docs={docs} />
      </Panel>
    </section>
  );
}

function AdminDashboard() {
  const setView = useAppStore((state) => state.setView);
  const progress = useAppStore((state) => state.progress);
  const setProgress = useAppStore((state) => state.setProgress);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshStats = async () => {
    setLoading(true);
    const [nextStats, nextProgress] = await Promise.all([
      api<AdminStats>("/admin/stats"),
      api<Page<ProgressRow>>("/progress?size=50"),
    ]);
    setStats(nextStats);
    setProgress(nextProgress);
    setLoading(false);
  };

  useEffect(() => {
    void refreshStats();
  }, []);

  return (
    <section>
      <PageTitle
        eyebrow="Quản trị hệ thống"
        title="Điều hành hệ thống"
        description="Nhìn nhanh số liệu nền và theo dõi ngay các đầu việc đang chạy trong toàn hệ thống."
        action={<RefreshButton onClick={refreshStats} />}
      />
      {loading && !stats ? <LoadingPanel /> : !stats ? <EmptyState text="Không tải được số liệu quản trị. Hãy kiểm tra backend đã restart với router admin mới." /> : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Tài khoản hoạt động" value={stats.active_users} tone="blue" icon={<UsersRound size={22} />} description={`${stats.total_users} tài khoản trong hệ thống`} onClick={() => setView("admin_users")} />
            <StatCard label="Đơn vị hoạt động" value={stats.active_departments} tone="cyan" icon={<Building2 size={22} />} description={`${stats.total_departments} phòng ban/đơn vị`} onClick={() => setView("admin_departments")} />
            <StatCard label="Văn bản đang xử lý" value={stats.open_documents} tone="amber" icon={<FileInput size={22} />} description={`${stats.total_documents} văn bản demo hiện có`} onClick={() => setView("progress")} />
            <StatCard label="Đầu việc đang mở" value={stats.open_assignments} tone="green" icon={<BriefcaseBusiness size={22} />} description={`${stats.total_assignments} lượt giao xử lý`} onClick={() => setView("progress")} />
          </div>
          <Panel title="Tiến độ xử lý toàn hệ thống" icon={<BriefcaseBusiness size={18} />}>
            <ProgressTable items={progress.items} compact />
          </Panel>
        </>
      )}
    </section>
  );
}

function AdminUsersView() {
  const users = useAppStore((state) => state.users);
  const currentUser = useAppStore((state) => state.currentUser);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <section>
      <PageTitle
        eyebrow="Quản trị hệ thống"
        title="Quản lý người dùng"
        description="Tạo tài khoản, đổi vai trò/phòng ban/chức vụ, khóa/mở và reset mật khẩu."
        action={<button className="primary-btn" onClick={() => setCreating(true)}><UserPlus size={16} /> Tạo người dùng</button>}
      />
      <Panel title="Danh sách người dùng" icon={<UsersRound size={18} />}>
        <div className="thin-scrollbar overflow-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="bg-[#214b74] text-left text-xs uppercase tracking-wide text-white">
                <th className="w-14 px-3 py-3 text-center">STT</th>
                <th className="px-3 py-3">Họ tên</th>
                <th className="px-3 py-3">Email</th>
                <th className="w-32 px-3 py-3">Vai trò</th>
                <th className="w-56 px-3 py-3">Phòng ban</th>
                <th className="w-32 px-3 py-3">Trạng thái</th>
                <th className="w-72 px-3 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, index) => {
                const isCurrentUser = user.id === currentUser?.id;
                const selfActionTitle = isCurrentUser ? "Không thao tác khóa/reset trên tài khoản đang đăng nhập" : undefined;
                return (
                  <tr key={user.id} className={clsx("border-b border-slate-200", index % 2 ? "bg-white" : "bg-slate-50/60")}>
                    <td className="px-3 py-3 text-center font-semibold">{index + 1}</td>
                    <td className="px-3 py-3 font-semibold">{user.full_name}<div className="text-xs font-normal text-slate-500">{user.position_label || "-"}</div></td>
                    <td className="px-3 py-3">{user.email}</td>
                    <td className="px-3 py-3">{roleLabels[user.role]}</td>
                    <td className="px-3 py-3">{departmentName(user.department_id)}</td>
                    <td className="px-3 py-3"><StatusPill active={user.is_active} /></td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button className="icon-text-btn" onClick={() => setEditingUser(user)}><Pencil size={14} /> Sửa</button>
                        <button className="icon-text-btn disabled:cursor-not-allowed disabled:opacity-45" disabled={isCurrentUser} title={selfActionTitle} onClick={() => toggleUserActive(user)}>{user.is_active ? "Khóa" : "Mở"}</button>
                        <button className="icon-text-btn disabled:cursor-not-allowed disabled:opacity-45" disabled={isCurrentUser} title={selfActionTitle} onClick={() => resetUserPassword(user)}><KeyRound size={14} /> Reset</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!users.length && <EmptyState text="Chưa có người dùng." />}
        </div>
      </Panel>
      {creating && <UserModal mode="create" onClose={() => setCreating(false)} />}
      {editingUser && <UserModal mode="edit" user={editingUser} onClose={() => setEditingUser(null)} />}
    </section>
  );
}

function AdminDepartmentsView() {
  const departments = useAppStore((state) => state.departments);
  const [creating, setCreating] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);

  return (
    <section>
      <PageTitle
        eyebrow="Quản trị hệ thống"
        title="Quản lý phòng ban"
        description="Quản lý danh mục đơn vị flat, loại đơn vị và trạng thái hoạt động."
        action={<button className="primary-btn" onClick={() => setCreating(true)}><Building2 size={16} /> Tạo phòng ban</button>}
      />
      <Panel title="Danh sách phòng ban" icon={<Building2 size={18} />}>
        <div className="thin-scrollbar overflow-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="bg-[#214b74] text-left text-xs uppercase tracking-wide text-white">
                <th className="w-14 px-3 py-3 text-center">STT</th>
                <th className="px-3 py-3">Tên</th>
                <th className="w-48 px-3 py-3">Loại</th>
                <th className="w-36 px-3 py-3">Trạng thái</th>
                <th className="w-52 px-3 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((dept, index) => (
                <tr key={dept.id} className={clsx("border-b border-slate-200", index % 2 ? "bg-white" : "bg-slate-50/60")}>
                  <td className="px-3 py-3 text-center font-semibold">{index + 1}</td>
                  <td className="px-3 py-3 font-semibold">{dept.name}<div className="text-xs font-normal text-slate-500">{dept.description || "-"}</div></td>
                  <td className="px-3 py-3">{dept.unit_type === "parent_unit" ? "Cấp cha" : "Phòng ban"}</td>
                  <td className="px-3 py-3"><StatusPill active={dept.is_active} /></td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button className="icon-text-btn" onClick={() => setEditingDepartment(dept)}><Pencil size={14} /> Sửa</button>
                      <button className="icon-text-btn" onClick={() => toggleDepartmentActive(dept)}>{dept.is_active ? "Ẩn" : "Mở"}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!departments.length && <EmptyState text="Chưa có phòng ban." />}
        </div>
      </Panel>
      {creating && <DepartmentModal mode="create" onClose={() => setCreating(false)} />}
      {editingDepartment && <DepartmentModal mode="edit" department={editingDepartment} onClose={() => setEditingDepartment(null)} />}
    </section>
  );
}

function AdminCheckView() {
  const [rows, setRows] = useState<HealthCheckRow[]>([]);
  const [running, setRunning] = useState(false);

  async function runChecks() {
    setRunning(true);
    const checks: Array<{ label: string; run: () => Promise<string> }> = [
      { label: "Auth", run: async () => (await api<User>("/auth/me")).email },
      { label: "Người dùng", run: async () => `${(await api<User[]>("/users")).length} users` },
      { label: "Phòng ban", run: async () => `${(await api<Department[]>("/departments")).length} phòng ban` },
      { label: "Văn bản", run: async () => `${(await api<Page<DocumentRow>>("/documents?size=1")).total} văn bản` },
      { label: "Dashboard nghiệp vụ", run: async () => `${(await api<DashboardData>("/dashboard")).total_documents} văn bản visible` },
      { label: "Admin stats", run: async () => `${(await api<AdminStats>("/admin/stats")).total_users} users thống kê` },
    ];
    const nextRows: HealthCheckRow[] = [];
    for (const item of checks) {
      try {
        nextRows.push({ label: item.label, status: "ok", detail: await item.run(), checked_at: new Date().toISOString() });
      } catch (err) {
        nextRows.push({ label: item.label, status: "error", detail: err instanceof Error ? err.message : "Lỗi không xác định", checked_at: new Date().toISOString() });
      }
      setRows([...nextRows]);
    }
    setRunning(false);
  }

  useEffect(() => {
    void runChecks();
  }, []);

  return (
    <section>
      <PageTitle
        eyebrow="Quản trị hệ thống"
        title="Kiểm tra hệ thống"
        description="Health check nhanh từ UI. Trước demo vẫn nên chạy script regression check_mvp.py ở backend."
        action={<button className="primary-btn" onClick={runChecks} disabled={running}>{running && <Loader2 size={16} className="animate-spin" />} Chạy kiểm tra</button>}
      />
      <Panel title="Kết quả kiểm tra nhanh" icon={<ShieldCheck size={18} />}>
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[160px_100px_1fr_150px] gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <span className="font-semibold">{row.label}</span>
              <span className={clsx("font-bold", row.status === "ok" ? "text-emerald-700" : "text-red-700")}>{row.status === "ok" ? "OK" : "Lỗi"}</span>
              <span>{row.detail}</span>
              <span className="text-xs text-slate-500">{formatDateTime(row.checked_at)}</span>
            </div>
          ))}
          {!rows.length && <EmptyState text="Chưa chạy kiểm tra." />}
        </div>
      </Panel>
    </section>
  );
}

function UserModal({ mode, user, onClose }: { mode: "create" | "edit"; user?: User; onClose: () => void }) {
  const departments = useAppStore((state) => state.departments);
  const currentUser = useAppStore((state) => state.currentUser);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [password, setPassword] = useState(mode === "create" ? "password123" : "");
  const [role, setRole] = useState<User["role"]>(user?.role || "staff");
  const [departmentId, setDepartmentId] = useState(user?.department_id || "");
  const [positionLabel, setPositionLabel] = useState(user?.position_label || "");
  const [isActive, setIsActive] = useState(user?.is_active ?? true);
  const isSelfEdit = mode === "edit" && user?.id === currentUser?.id;

  useEffect(() => {
    api<RoleOption[]>("/roles").then(setRoles).catch(() => setRoles(Object.entries(roleLabels).map(([key, label]) => ({ key: key as User["role"], label }))));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await runAction(async () => {
      const payload = {
        full_name: fullName,
        email,
        password: password || undefined,
        role,
        department_id: departmentId || null,
        position_label: positionLabel || null,
        is_active: isActive,
      };
      if (mode === "create") {
        await api("/users", { method: "POST", body: JSON.stringify(payload) });
      } else if (user) {
        const { email: _email, password: _password, ...updatePayload } = payload;
        await api(`/users/${user.id}`, { method: "PATCH", body: JSON.stringify(updatePayload) });
      }
      await loadReferenceData();
      onClose();
    }, mode === "create" ? "Đã tạo người dùng" : "Đã cập nhật người dùng");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-5">
      <form onSubmit={submit} className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-black">{mode === "create" ? "Tạo người dùng" : "Sửa người dùng"}</h3>
          <button type="button" onClick={onClose} className="text-sm font-bold text-slate-500">Đóng</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-bold">Họ tên <input className="field mt-1 w-full" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></label>
          <label className="text-sm font-bold">Email <input className="field mt-1 w-full" value={email} onChange={(e) => setEmail(e.target.value)} disabled={mode === "edit"} required /></label>
          {mode === "create" && <label className="text-sm font-bold">Mật khẩu <input className="field mt-1 w-full" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></label>}
          <label className="text-sm font-bold">Vai trò <select className="field mt-1 w-full disabled:opacity-60" value={role} disabled={isSelfEdit} title={isSelfEdit ? "Không tự hạ vai trò của tài khoản đang đăng nhập" : undefined} onChange={(e) => setRole(e.target.value as User["role"])}>{roles.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
          <label className="text-sm font-bold">Phòng ban <select className="field mt-1 w-full" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}><option value="">Không gán</option>{departments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}</select></label>
          <label className="text-sm font-bold">Chức vụ <input className="field mt-1 w-full" value={positionLabel} onChange={(e) => setPositionLabel(e.target.value)} /></label>
          <label className="flex items-center gap-2 text-sm font-bold" title={isSelfEdit ? "Không tự khóa tài khoản đang đăng nhập" : undefined}><input type="checkbox" checked={isActive} disabled={isSelfEdit} onChange={(e) => setIsActive(e.target.checked)} /> Đang hoạt động</label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="icon-text-btn" onClick={onClose}>Huỷ</button>
          <button className="primary-btn"><CheckCircle2 size={16} /> Lưu</button>
        </div>
      </form>
    </div>
  );
}

function DepartmentModal({ mode, department, onClose }: { mode: "create" | "edit"; department?: Department; onClose: () => void }) {
  const [name, setName] = useState(department?.name || "");
  const [description, setDescription] = useState(department?.description || "");
  const [unitType, setUnitType] = useState<Department["unit_type"]>(department?.unit_type || "department");
  const [isActive, setIsActive] = useState(department?.is_active ?? true);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await runAction(async () => {
      const payload = { name, description: description || null, unit_type: unitType, is_active: isActive };
      if (mode === "create") {
        await api("/departments", { method: "POST", body: JSON.stringify(payload) });
      } else if (department) {
        await api(`/departments/${department.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      await loadReferenceData();
      onClose();
    }, mode === "create" ? "Đã tạo phòng ban" : "Đã cập nhật phòng ban");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-5">
      <form onSubmit={submit} className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-black">{mode === "create" ? "Tạo phòng ban" : "Sửa phòng ban"}</h3>
          <button type="button" onClick={onClose} className="text-sm font-bold text-slate-500">Đóng</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-sm font-bold">Tên <input className="field mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label className="col-span-2 text-sm font-bold">Mô tả <textarea className="field mt-1 min-h-20 w-full" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <label className="text-sm font-bold">Loại <select className="field mt-1 w-full" value={unitType} onChange={(e) => setUnitType(e.target.value as Department["unit_type"])}><option value="department">Phòng ban</option><option value="parent_unit">Cấp cha</option></select></label>
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Đang hoạt động</label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="icon-text-btn" onClick={onClose}>Huỷ</button>
          <button className="primary-btn"><CheckCircle2 size={16} /> Lưu</button>
        </div>
      </form>
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return <span className={clsx("inline-flex rounded-full px-2.5 py-1 text-xs font-bold", active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>{active ? "Đang hoạt động" : "Tạm khóa"}</span>;
}

function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-[#2b668f]">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{description}</p>
      </div>
      {action}
    </div>
  );
}

function Toolbar() {
  const storeSearch = useAppStore((state) => state.documentSearch);
  const storeDueFrom = useAppStore((state) => state.dueFrom);
  const storeDueBefore = useAppStore((state) => state.dueBefore);
  const [search, setSearch] = useState(storeSearch);
  const [dueFrom, setDueFrom] = useState(storeDueFrom);
  const [dueBefore, setDueBefore] = useState(storeDueBefore);

  function applyFilters(event?: React.FormEvent) {
    event?.preventDefault();
    useAppStore.getState().setDocumentFilters({ documentSearch: search.trim(), dueFrom, dueBefore });
  }

  function clearFilters() {
    setSearch("");
    setDueFrom("");
    setDueBefore("");
    useAppStore.getState().setDocumentFilters({ documentSearch: "", dueFrom: "", dueBefore: "" });
  }

  return (
    <form onSubmit={applyFilters} className="mb-4 grid grid-cols-[1fr_180px_180px_auto_auto] gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3">
        <Search size={17} className="text-slate-500" />
        <input className="h-10 flex-1 outline-none" placeholder="Tìm trích yếu, số văn bản, cơ quan..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <input className="field" type="date" title="Hạn xử lý từ ngày" aria-label="Hạn xử lý từ ngày" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} />
      <input className="field" type="date" title="Hạn xử lý đến ngày" aria-label="Hạn xử lý đến ngày" value={dueBefore} onChange={(e) => setDueBefore(e.target.value)} />
      <button className="icon-text-btn" type="submit"><Search size={16} /> Tìm kiếm</button>
      <button className="icon-text-btn" type="button" onClick={clearFilters}>Xóa lọc</button>
    </form>
  );
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 font-bold text-slate-900">
        {icon}
        {title}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function PanelBlock({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 p-3">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-bold">{icon} {title}</h4>
      {children}
    </section>
  );
}

function Info({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={clsx("rounded-lg bg-slate-50 p-2", wide && "col-span-2")}>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-0.5 font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function StatCard({ label, value, tone, icon, description, onClick }: { label: string; value: number; tone: "blue" | "cyan" | "green" | "amber"; icon: ReactNode; description: string; onClick?: () => void }) {
  const classes = {
    blue: "bg-gradient-to-br from-[#1d6ef0] to-[#1550b8] text-white",
    cyan: "bg-gradient-to-br from-cyan-400 to-cyan-600 text-white",
    green: "bg-gradient-to-br from-emerald-500 to-emerald-700 text-white",
    amber: "bg-gradient-to-br from-amber-400 to-amber-600 text-white",
  };
  return (
    <button onClick={onClick} className={clsx("group rounded-xl p-5 text-left shadow-sm transition-all hover:scale-[1.03] hover:shadow-lg active:scale-100", classes[tone])}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold opacity-90">{label}</p>
        <div className="opacity-60 transition group-hover:opacity-100">{icon}</div>
      </div>
      <p className="mt-2 text-3xl font-black">{value}</p>
      <p className="mt-1 text-xs font-medium opacity-70">{description}</p>
    </button>
  );
}

function LoadingPanel() {
  return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center font-semibold text-slate-500">Đang tải dữ liệu...</div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500">{text}</div>;
}

function RefreshButton({ onClick }: { onClick: () => void | Promise<void> }) {
  return <button className="icon-text-btn" onClick={() => void onClick()}><RefreshCcw size={16} /> Làm mới</button>;
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={clsx("rounded-full px-2 py-0.5 text-xs font-bold", priority === "urgent" ? "bg-red-100 text-red-700" : priority === "high" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600")}>{priorityLabels[priority]}</span>;
}

function RoleBadge({ role }: { role: AssignmentRole }) {
  return <span className={clsx("inline-flex rounded-full px-2.5 py-1 text-xs font-bold", role === "primary" ? "bg-blue-100 text-[#214b74]" : role === "collaborator" ? "bg-cyan-100 text-cyan-800" : "bg-slate-100 text-slate-600")}>{assignmentRoleLabels[role]}</span>;
}

function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  return <span className={clsx("inline-flex rounded-full px-2.5 py-1 text-xs font-bold", status === "completed" ? "bg-emerald-50 text-emerald-700" : status === "pending" ? "bg-amber-50 text-amber-800" : status === "returned" ? "bg-red-50 text-red-700" : "bg-blue-50 text-[#214b74]")}>{assignmentStatusLabels[status]}</span>;
}

function TimelineCell({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-md bg-slate-50 p-2">
      <p className="font-semibold text-slate-500">{label}</p>
      <p className={clsx("mt-1 font-bold", value ? "text-red-600" : "text-slate-300")}>{formatDateTime(value)}</p>
    </div>
  );
}

async function loadAdminStats(setStats: (stats: AdminStats | null) => void) {
  try {
    setStats(await api<AdminStats>("/admin/stats"));
  } catch (err) {
    showError(err);
  }
}

async function toggleUserActive(user: User) {
  await runAction(async () => {
    await api(`/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !user.is_active }) });
    await loadReferenceData();
  }, user.is_active ? "Đã khóa người dùng" : "Đã mở người dùng");
}

async function resetUserPassword(user: User) {
  if (!window.confirm(`Reset mật khẩu của ${user.full_name} về password123?`)) return;
  await runAction(async () => {
    await api(`/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ password: "password123" }) });
    await loadReferenceData();
  }, "Đã reset mật khẩu");
}

async function toggleDepartmentActive(department: Department) {
  await runAction(async () => {
    await api(`/departments/${department.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !department.is_active }) });
    await loadReferenceData();
  }, department.is_active ? "Đã ẩn phòng ban" : "Đã mở phòng ban");
}

async function loadReferenceData() {
  const [departments, users] = await Promise.all([
    api<Department[]>("/departments"),
    api<User[]>("/users").catch(() => []),
  ]);
  useAppStore.getState().setDepartments(departments);
  useAppStore.getState().setUsers(users);
}

async function loadDashboard() {
  await runLoad(async () => {
    useAppStore.getState().setDashboard(await api<DashboardData>("/dashboard"));
  });
}

async function loadDocuments(type: DocumentType, preserveSelection = false) {
  await runLoad(async () => {
    const state = useAppStore.getState();
    const queue = type === "incoming" ? state.incomingQueue : state.outgoingQueue;
    const params = new URLSearchParams({ queue, size: "50" });
    if (state.documentSearch) params.set("search", state.documentSearch);
    if (state.dueFrom) params.set("due_from", state.dueFrom);
    if (state.dueBefore) params.set("due_before", state.dueBefore);
    const page = await api<Page<DocumentRow>>(`/documents/${type === "incoming" ? "incoming" : "outgoing"}?${params.toString()}`);
    state.setDocuments(page);
    if (!preserveSelection) {
      state.setDetail(null);
      state.setSelectedDocumentId(null);
    }
  });
}

async function loadDocumentDetail(id: string) {
  await runLoad(async () => {
    const detail = await api<DocumentDetail>(`/documents/${id}`);
    useAppStore.getState().setDetail(detail);
    await loadDocuments(detail.document_type, true);
  });
}

async function loadProgress(options: { search?: string; sortBy?: ProgressSortBy; sortDir?: ProgressSortDir; page?: number; size?: number } = {}) {
  await runLoad(async () => {
    const params = new URLSearchParams({
      size: String(options.size || 20),
      page: String(options.page || 1),
      sort_by: options.sortBy || "received_at",
      sort_dir: options.sortDir || "desc",
    });
    if (options.search) params.set("search", options.search);
    useAppStore.getState().setProgress(await api<Page<ProgressRow>>(`/progress?${params.toString()}`));
  });
}

async function runAssignmentAction(id: string, action: "start" | "complete") {
  await runAction(async () => {
    await api(`/assignments/${id}/${action}`, { method: "POST", body: action === "complete" ? JSON.stringify({ result_note: "Hoàn thành phần xử lý của tôi." }) : undefined });
    await refreshActiveWorkspace();
  }, action === "start" ? "Đã bắt đầu xử lý" : "Đã kết thúc phần xử lý");
}

async function runDocumentAction(documentId: string, action: "submit-signature" | "approve-signature" | "issue" | "archive", success: string) {
  if (action === "archive" && !window.confirm("Lưu hồ sơ văn bản này?")) return;
  await runAction(async () => {
    await api(`/documents/${documentId}/${action}`, { method: "POST" });
    await refreshActiveWorkspace();
  }, success);
}

async function refreshActiveWorkspace() {
  const state = useAppStore.getState();
  const detail = state.detail;
  const selected = state.selectedDocumentId;
  if (detail) await loadDocuments(detail.document_type, true);
  if (selected) await loadDocumentDetail(selected);
  await loadProgress();
  if (state.view === "dashboard") await loadDashboard();
}

async function runLoad(work: () => Promise<void>) {
  const store = useAppStore.getState();
  store.setLoading(true);
  try {
    await work();
  } catch (err) {
    showError(err);
  } finally {
    useAppStore.getState().setLoading(false);
  }
}

async function runAction(work: () => Promise<void>, success: string) {
  try {
    await work();
    useAppStore.getState().setNotice(success);
  } catch (err) {
    showError(err);
  }
}

function showError(err: unknown) {
  useAppStore.getState().setNotice(err instanceof Error ? err.message : "Có lỗi xảy ra");
}

function departmentName(id: string | null) {
  return useAppStore.getState().departments.find((dept) => dept.id === id)?.name || "Chưa gán phòng ban";
}

function documentStatus(status: string) {
  const labels: Record<string, string> = {
    received: "Đã tiếp nhận",
    in_progress: "Đang xử lý",
    completed: "Đã xử lý",
    archived: "Lưu trữ",
    voided: "Đã hủy",
    draft: "Dự thảo",
    pending_signature: "Chờ ký duyệt",
    approved: "Đã ký duyệt",
    issued: "Đã phát hành",
  };
  return labels[status] || status;
}

function actionText(action: string) {
  const labels: Record<string, string> = {
    incoming_register: "Vào sổ",
    advise: "Tham mưu",
    direct: "Chỉ đạo",
    forward: "Chuyển xử lý",
    assign: "Phân công",
    complete: "Kết thúc văn bản",
    return: "Trả lại",
    outgoing_draft: "Tạo dự thảo",
    submit_signature: "Trình ký",
    approve_signature: "Ký duyệt",
    issue: "Phát hành",
    archive: "Lưu hồ sơ",
    file_upload: "Tải file lên",
    file_download: "Tải file xuống",
    comment: "Bình luận",
  };
  return labels[action] || action;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN").format(new Date(value));
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

createRoot(document.getElementById("root")!).render(<App />);
