import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { api, errorMessage } from "./api";
import { DashboardView } from "./components/Dashboard";
import { DepartmentsView } from "./components/Departments";
import { DetailModal } from "./components/DetailModal";
import { DocumentsView } from "./components/Documents";
import { Header } from "./components/Header";
import { KpiDisplayView } from "./components/KpiDisplay";
import { KpiIndicatorsView } from "./components/KpiIndicators";
import { KpiInputView } from "./components/KpiMonthly";
import { Login } from "./components/Login";
import { RemindersView } from "./components/Reminders";
import { StorageManagementView } from "./components/StorageManagement";
import { Sidebar } from "./components/Sidebar";
import { UsersView } from "./components/Users";
import { SystemModal } from "./components/shared";
import { labels } from "./labels";
import type { Department, DocumentDetail, User, View } from "./types";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("simple_doc_token"));
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [notice, setNotice] = useState("");
  const [passwordModal, setPasswordModal] = useState(false);
  const [profileModal, setProfileModal] = useState(false);
  const [userFilterDepartmentId, setUserFilterDepartmentId] = useState("all");

  async function bootstrap() {
    if (!localStorage.getItem("simple_doc_token")) return;
    try {
      const me = await api<User>("/auth/me");
      setCurrentUser(me);
      const [nextUsers, nextDepartments] = await Promise.all([api<User[]>("/users"), api<Department[]>("/departments")]);
      setUsers(nextUsers);
      setDepartments(nextDepartments);
    } catch {
      localStorage.removeItem("simple_doc_token");
      setToken(null);
      setCurrentUser(null);
    }
  }

  useEffect(() => {
    void bootstrap();
  }, [token]);

  useEffect(() => {
    const isAdmin = currentUser?.role === "superadmin" || currentUser?.role === "manager";
    if (!isAdmin && (view === "users" || view === "departments" || view === "all_documents" || view === "completed_documents" || view === "reminders" || view === "kpi_input" || view === "kpi_indicators")) setView("dashboard");
    if (currentUser?.role !== "superadmin" && (view === "departments" || view === "storage")) setView("dashboard");
  }, [currentUser?.role, view]);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      return;
    }
    api<DocumentDetail>(`/documents/${detailId}`).then(setDetail).catch((err) => setNotice(errorMessage(err, "Không tải được chi tiết văn bản")));
  }, [detailId]);

  async function refreshReference() {
    const [nextUsers, nextDepartments] = await Promise.all([api<User[]>("/users"), api<Department[]>("/departments")]);
    setUsers(nextUsers);
    setDepartments(nextDepartments);
  }

  async function reloadDetail() {
    if (detail) setDetail(await api<DocumentDetail>(`/documents/${detail.id}`));
  }

  if (!token || !currentUser) {
    return <Login onLoggedIn={(nextToken) => { localStorage.setItem("simple_doc_token", nextToken); setToken(nextToken); }} />;
  }

  const isAdmin = currentUser.role === "superadmin" || currentUser.role === "manager";
  const assignedScope = isAdmin ? "assigned_by_me" : "my_tasks";
  const logout = () => { localStorage.removeItem("simple_doc_token"); setToken(null); setCurrentUser(null); };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <Header user={currentUser} view={view} onChange={setView} />
      <div className="app-shell">
        <Sidebar user={currentUser} view={view} onChange={(nextView) => { if (nextView === "users") setUserFilterDepartmentId("all"); setView(nextView); }} onLogout={logout} onOpenProfile={() => setProfileModal(true)} />
        <main className="min-w-0 flex-1 p-5">
          {notice ? <div className="mb-4 flex justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-[#214b74]">{notice}<button onClick={() => setNotice("")}>Đóng</button></div> : null}
          {view === "dashboard" ? <DashboardView user={currentUser} users={users} departments={departments} onOpen={setDetailId} onChanged={refreshReference} onNavigate={setView} /> : null}
          {view === "assigned" ? <DocumentsView key="assigned" scope={assignedScope} title={isAdmin ? "Văn bản xử lý chính" : "Tất cả việc được giao"} mode={isAdmin ? "period" : "all"} currentUser={currentUser} users={users} departments={departments} onOpen={setDetailId} onChanged={refreshReference} /> : null}
          {view === "assigned_pending" ? <DocumentsView key="assigned_pending" scope="my_tasks" title="Việc cần xử lý" mode="all" currentUser={currentUser} users={users} departments={departments} onOpen={setDetailId} onChanged={refreshReference} initialStatuses={["open"]} /> : null}
          {view === "assigned_completed" ? <DocumentsView key="assigned_completed" scope="my_tasks" title="Việc đã duyệt" mode="all" currentUser={currentUser} users={users} departments={departments} onOpen={setDetailId} onChanged={refreshReference} initialStatuses={["completed", "completed_late"]} /> : null}
          {view === "all_documents" ? <DocumentsView key="all_documents" scope="assigned_by_me" title="Tất cả văn bản" mode="all" currentUser={currentUser} users={users} departments={departments} onOpen={setDetailId} onChanged={refreshReference} /> : null}
          {view === "completed_documents" ? <DocumentsView key="completed_documents" scope="assigned_by_me" title="Văn bản đã hoàn tất" mode="all" currentUser={currentUser} users={users} departments={departments} onOpen={setDetailId} onChanged={refreshReference} initialStatuses={["completed", "completed_late"]} /> : null}
          {view === "users" ? <UsersView users={users} departments={departments} currentUser={currentUser} onChanged={refreshReference} initialDepartmentId={userFilterDepartmentId} onClearInitialDepartment={() => setUserFilterDepartmentId("all")} /> : null}
          {view === "departments" && currentUser.role === "superadmin" ? <DepartmentsView departments={departments} users={users} onChanged={refreshReference} onViewUsers={(deptId) => { setUserFilterDepartmentId(deptId); setView("users"); }} /> : null}
          {view === "storage" && currentUser.role === "superadmin" ? <StorageManagementView /> : null}
          {view === "reminders" ? <RemindersView /> : null}
          {view === "kpi_input" ? <KpiInputView currentUser={currentUser} /> : null}
          {view === "kpi_display" ? <KpiDisplayView /> : null}
          {view === "kpi_indicators" ? <KpiIndicatorsView departments={departments} /> : null}
        </main>
      </div>
      {detail ? <DetailModal detail={detail} currentUser={currentUser} users={users} onClose={() => setDetailId(null)} onReload={reloadDetail} /> : null}
      {profileModal ? <ProfileModal user={currentUser} onClose={() => setProfileModal(false)} onChangePassword={() => { setProfileModal(false); setPasswordModal(true); }} /> : null}
      {(passwordModal || currentUser.must_change_password) ? <ChangePasswordModal forced={currentUser.must_change_password} onClose={() => { if (!currentUser.must_change_password) setPasswordModal(false); }} onDone={(result) => { localStorage.setItem("simple_doc_token", result.access_token); setToken(result.access_token); setPasswordModal(false); setCurrentUser(result.user); setNotice("Đổi mật khẩu thành công!"); }} /> : null}
    </div>
  );
}

function ChangePasswordModal({ forced, onClose, onDone }: { forced: boolean; onClose: () => void; onDone: (result: { access_token: string; user: User }) => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Mật khẩu mới không khớp");
      return;
    }
    try {
      const result = await api<{ access_token: string; user: User }>("/auth/change-password", { method: "POST", body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) });
      onDone(result);
    } catch (err) {
      setError(errorMessage(err, "Không đổi được mật khẩu"));
    }
  }
  const passwordType = showPassword ? "text" : "password";
  return (
    <SystemModal title={forced ? "Đổi mật khẩu lần đầu" : "Đổi mật khẩu"} onClose={onClose} action={<><button className="icon-text-btn" disabled={forced} onClick={onClose}>Hủy</button><button className="primary-btn" onClick={submit}>Đổi mật khẩu</button></>}>
      {forced ? <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 font-bold text-amber-700">Bạn đang dùng mật khẩu tạm. Vui lòng đổi mật khẩu trước khi tiếp tục.</p> : null}
      {error ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 font-bold text-red-700">{error}</p> : null}
      <div className="mb-3 flex justify-end">
        <button type="button" className="inline-flex items-center gap-1 text-xs font-bold text-[#214b74]" onClick={() => setShowPassword((value) => !value)}>
          {showPassword ? <EyeOff size={14} /> : <Eye size={14} />} {showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        </button>
      </div>
      <label className="mb-3 block text-sm font-bold">Mật khẩu hiện tại<input className="field mt-1 w-full" type={passwordType} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label>
      <label className="mb-3 block text-sm font-bold">Mật khẩu mới<input className="field mt-1 w-full" type={passwordType} minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
      <label className="block text-sm font-bold">Xác nhận mật khẩu mới<input className="field mt-1 w-full" type={passwordType} minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></label>
    </SystemModal>
  );
}

function ProfileModal({ user, onClose, onChangePassword }: { user: User; onClose: () => void; onChangePassword: () => void }) {
  return (
    <SystemModal title="Thông tin tài khoản" onClose={onClose} action={<><button className="icon-text-btn" onClick={onClose}>Đóng</button><button className="primary-btn" onClick={onChangePassword}>Đổi mật khẩu</button></>}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase">Họ và tên</label>
          <div className="mt-1 font-semibold text-slate-900">{user.full_name}</div>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase">Email</label>
          <div className="mt-1 font-semibold text-slate-900">{user.email}</div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase">Vai trò</label>
            <div className="mt-1 font-semibold text-slate-900">{labels.role[user.role] || user.role}</div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase">Chức danh</label>
            <div className="mt-1 font-semibold text-slate-900">{user.position_label || "Chưa cập nhật"}</div>
          </div>
        </div>
      </div>
    </SystemModal>
  );
}
