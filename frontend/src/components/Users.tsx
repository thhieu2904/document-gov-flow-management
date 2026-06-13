import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, KeyRound, Lock, Pencil, Plus, Search, Unlock, UsersRound } from "lucide-react";
import { api, errorMessage } from "../api";
import { labels } from "../labels";
import type { Department, Role, User } from "../types";
import { Empty, PageTitle, Panel, SystemModal } from "./shared";

type UserModalState = { mode: "create" } | { mode: "edit"; user: User };

function departmentName(departments: Department[], user: User) {
  if (user.role === "superadmin") return "Toàn hệ thống";
  return departments.find((item) => item.id === user.department_id)?.name || "-";
}

export function UsersView({
  users,
  departments,
  currentUser,
  onChanged,
  initialDepartmentId = "all",
  onClearInitialDepartment
}: {
  users: User[];
  departments: Department[];
  currentUser: User;
  onChanged: () => Promise<void>;
  initialDepartmentId?: string;
  onClearInitialDepartment?: () => void;
}) {
  const [modal, setModal] = useState<UserModalState | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"all" | Role>("all");
  const [department, setDepartment] = useState(initialDepartmentId);
  const [status, setStatus] = useState<"all" | "active" | "locked">("all");
  const [error, setError] = useState("");

  useEffect(() => {
    setDepartment(initialDepartmentId);
  }, [initialDepartmentId]);
  const activeDepartments = departments.filter((item) => item.is_active);

  async function setUserActive(user: User, isActive: boolean) {
    setError("");
    try {
      await api(`/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ is_active: isActive }) });
      await onChanged();
    } catch (err) {
      setError(errorMessage(err, isActive ? "Không mở khóa được người dùng" : "Không khóa được người dùng"));
    }
  }

  const filtered = useMemo(() => users.filter((u) => {
    const text = `${u.full_name} ${u.email}`.toLowerCase();
    if (search && !text.includes(search.toLowerCase())) return false;
    if (role !== "all" && u.role !== role) return false;
    if (department !== "all" && u.department_id !== department) return false;
    if (status === "active" && !u.is_active) return false;
    if (status === "locked" && u.is_active) return false;
    return true;
  }), [users, search, role, department, status]);

  const stats = useMemo(() => {
    const total = users.length;
    const managers = users.filter((u) => u.role === "manager").length;
    const staff = users.filter((u) => u.role === "staff").length;
    const active = users.filter((u) => u.is_active).length;
    return { total, managers, staff, active };
  }, [users]);

  return (
    <section>
      <PageTitle title="Người dùng" desc="Quản lý tài khoản nhân viên, trạng thái và mật khẩu tạm." action={<button className="primary-btn" onClick={() => setModal({ mode: "create" })}><Plus size={16} /> Thêm người dùng</button>} />
      
      {/* Thẻ thống kê nhanh */}
      <div className="mb-4 grid grid-cols-4 gap-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Tổng tài khoản</div>
          <div className="mt-2 text-2xl font-black text-slate-900">{stats.total}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-blue-500">Quản lý (Trưởng phòng)</div>
          <div className="mt-2 text-2xl font-black text-blue-700">{stats.managers}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-500">Nhân viên (Staff)</div>
          <div className="mt-2 text-2xl font-black text-emerald-700">{stats.staff}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-teal-500">Đang hoạt động</div>
          <div className="mt-2 text-2xl font-black text-teal-700">{stats.active}</div>
        </div>
      </div>

      {error ? <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
      <div className="mb-4 rounded-lg border bg-white p-3">
        <div className="mb-2 flex gap-2">
          <input className="field flex-1" placeholder="Tìm họ tên hoặc email..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="icon-text-btn"><Search size={16} /> Tìm</button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <select className="field" value={role} onChange={(e) => setRole(e.target.value as "all" | Role)}><option value="all">Tất cả vai trò</option>{currentUser.role === "superadmin" ? <option value="superadmin">Quản trị toàn hệ thống</option> : null}<option value="manager">Quản lý</option><option value="staff">Nhân viên</option></select>
          <select className="field" value={department} onChange={(e) => setDepartment(e.target.value)}><option value="all">Tất cả phòng ban</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}{d.is_active ? "" : " (đã xóa)"}</option>)}</select>
          <select className="field" value={status} onChange={(e) => setStatus(e.target.value as "all" | "active" | "locked")}><option value="all">Tất cả trạng thái</option><option value="active">Đang hoạt động</option><option value="locked">Tạm khóa</option></select>
        </div>
      </div>
      <Panel title="Danh sách người dùng" icon={<UsersRound size={18} />}>
        <div className="thin-scrollbar overflow-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead><tr className="bg-[#214b74] text-left text-xs uppercase text-white"><th className="px-3 py-3">Họ tên / Email</th><th className="px-3 py-3">Vai trò</th><th className="px-3 py-3">Phòng ban</th><th className="px-3 py-3">Chức vụ</th><th className="px-3 py-3">Trạng thái</th><th className="px-3 py-3">Thao tác</th></tr></thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b hover:bg-blue-50">
                  <td className="px-3 py-3 font-bold cursor-pointer hover:underline text-[#214b74]" onClick={() => setModal({ mode: "edit", user: u })}>{u.full_name}<div className="text-xs font-normal text-slate-500">{u.email}</div></td>
                  <td className="px-3 py-3">
                    {u.role === "superadmin" ? (
                      <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700 border border-rose-200">
                        Admin hệ thống
                      </span>
                    ) : u.role === "manager" ? (
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-200">
                        Quản lý
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 border border-slate-200">
                        Nhân viên
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">{departmentName(departments, u)}</td>
                  <td className="px-3 py-3">{u.position_label || "-"}</td>
                  <td className="px-3 py-3">
                    {u.is_active ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                        Hoạt động
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-600 border border-rose-100">
                        Tạm khóa
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      <button 
                        className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors" 
                        onClick={() => setModal({ mode: "edit", user: u })}
                        title="Chỉnh sửa thông tin"
                      >
                        <Pencil size={17} />
                      </button>
                      {u.id !== currentUser.id ? (
                        u.is_active ? (
                          <button 
                            className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 hover:text-amber-700 transition-colors" 
                            onClick={() => setUserActive(u, false)}
                            title="Khóa tài khoản"
                          >
                            <Lock size={17} />
                          </button>
                        ) : (
                          <button 
                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors" 
                            onClick={() => setUserActive(u, true)}
                            title="Mở khóa tài khoản"
                          >
                            <Unlock size={17} />
                          </button>
                        )
                      ) : null}
                      <button 
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors" 
                        onClick={() => setResetUser(u)}
                        title="Đặt lại mật khẩu tạm"
                      >
                        <KeyRound size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length ? <Empty text="Không có người dùng phù hợp." /> : null}
        </div>
      </Panel>
      {modal ? <UserModal state={modal} currentUser={currentUser} departments={activeDepartments} onClose={() => setModal(null)} onDone={async () => { setModal(null); await onChanged(); }} /> : null}
      {resetUser ? <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} /> : null}
    </section>
  );
}

function UserModal({ state, currentUser, departments, onClose, onDone }: { state: UserModalState; currentUser: User; departments: Department[]; onClose: () => void; onDone: () => Promise<void> }) {
  const editing = state.mode === "edit";
  const user = state.mode === "edit" ? state.user : null;
  const canEditRoles = currentUser.role === "superadmin";
  const initialDepartmentId = user
    ? (user.role !== "superadmin" ? user.department_id || "" : "")
    : (currentUser.role === "manager" ? currentUser.department_id || "" : "");
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(user?.role || "staff");
  const [departmentId, setDepartmentId] = useState(initialDepartmentId);
  const [positionLabel, setPositionLabel] = useState(user?.position_label || "");
  const [isActive, setIsActive] = useState(user?.is_active ?? true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [managerWarning, setManagerWarning] = useState(false);

  function switchRole(nextRole: Role) {
    if (!canEditRoles) return;
    if (nextRole === "manager" && role !== "manager") {
      setManagerWarning(true);
      return;
    }
    setRole(nextRole);
    if (nextRole === "superadmin") setDepartmentId("");
    else if (!departmentId) setDepartmentId(currentUser.department_id || "");
  }

  function payload() {
    return {
      full_name: fullName.trim(),
      role,
      department_id: role === "superadmin" ? null : departmentId || null,
      position_label: positionLabel.trim() || null,
      is_active: isActive,
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (state.mode === "create") {
        await api<User>("/users", { method: "POST", body: JSON.stringify({ ...payload(), email: email.trim(), password }) });
      } else {
        const current = state.user;
        const next = payload();
        const changes: Record<string, unknown> = {};
        if (next.full_name !== current.full_name) changes.full_name = next.full_name;
        if (next.role !== current.role) changes.role = next.role;
        if (next.department_id !== current.department_id) changes.department_id = next.department_id;
        if (next.position_label !== current.position_label) changes.position_label = next.position_label;
        if (next.is_active !== current.is_active) changes.is_active = next.is_active;
        await api<User>(`/users/${current.id}`, { method: "PATCH", body: JSON.stringify(changes) });
      }
      await onDone();
    } catch (err) {
      setError(errorMessage(err, "Không lưu được người dùng"));
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-5">
      <form onSubmit={submit} className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-black">{editing ? `Chỉnh sửa - ${user?.full_name}` : "Thêm người dùng"}</h3><button type="button" onClick={onClose}>Đóng</button></div>
        {canEditRoles ? (
          <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button type="button" className={role === "staff" ? "rounded-md bg-[#214b74] px-4 py-2 text-sm font-bold text-white" : "rounded-md px-4 py-2 text-sm font-bold text-slate-600"} onClick={() => switchRole("staff")}>Nhân viên</button>
            <button type="button" className={role === "manager" ? "rounded-md bg-[#214b74] px-4 py-2 text-sm font-bold text-white" : "rounded-md px-4 py-2 text-sm font-bold text-slate-600"} onClick={() => switchRole("manager")}>Quản lý</button>
            <button type="button" className={role === "superadmin" ? "rounded-md bg-[#214b74] px-4 py-2 text-sm font-bold text-white" : "rounded-md px-4 py-2 text-sm font-bold text-slate-600"} onClick={() => switchRole("superadmin")}>Superadmin</button>
          </div>
        ) : <p className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-sm font-bold text-[#214b74]">Bạn đang tạo/sửa nhân viên trong phòng ban của mình.</p>}
        {error ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-sm font-bold">Họ tên *<input className="field mt-1 w-full" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></label>
          <label className="col-span-2 text-sm font-bold">Email *<input className="field mt-1 w-full" value={email} onChange={(e) => setEmail(e.target.value)} disabled={editing} required /></label>
          {!editing ? (
            <label className="col-span-2 text-sm font-bold">
              Mật khẩu tạm *
              <div className="mt-1 flex gap-2">
                <input className="field min-w-0 flex-1" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
                <button type="button" className="icon-text-btn shrink-0" onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />} {showPassword ? "Ẩn" : "Hiện"}
                </button>
              </div>
            </label>
          ) : null}
          {role !== "superadmin" ? (
            <label className="text-sm font-bold">
              Phòng ban *
              <select className="field mt-1 w-full" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} required disabled={!canEditRoles}>
                <option value="">Chọn phòng ban</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          ) : null}
          <label className={role === "superadmin" ? "col-span-2 text-sm font-bold" : "text-sm font-bold"}>
            Chức vụ
            <input className="field mt-1 w-full" value={positionLabel} onChange={(e) => setPositionLabel(e.target.value)} />
          </label>
          {editing ? <label className="col-span-2 flex items-center gap-2 rounded-lg border p-3 text-sm font-bold"><input type="checkbox" disabled={user?.id === currentUser.id} checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Trạng thái: {isActive ? "Đang hoạt động" : "Tạm khóa"}</label> : null}
        </div>
        <div className="mt-5 flex justify-end gap-2"><button type="button" className="icon-text-btn" onClick={onClose}>Hủy</button><button className="primary-btn"><Plus size={16} /> {editing ? "Lưu" : "Thêm"}</button></div>
      </form>
      {managerWarning ? <SystemModal title="Tạo tài khoản quản lý" onClose={() => setManagerWarning(false)} action={<><button className="icon-text-btn" onClick={() => setManagerWarning(false)}>Hủy</button><button className="primary-btn" onClick={() => { setRole("manager"); if (!departmentId) setDepartmentId(currentUser.department_id || ""); setManagerWarning(false); }}>Tôi hiểu</button></>}>
        <p>Tài khoản quản lý sẽ xem và xử lý văn bản trong phòng ban được gắn.</p>
        <p className="mt-2">Hệ thống hiện ưu tiên một quản lý chính cho mỗi phòng ban. Chỉ tạo thêm quản lý khi thật sự cần.</p>
      </SystemModal> : null}
    </div>
  );
}

function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [error, setError] = useState("");
  async function reset() {
    setError("");
    try {
      const result = await api<{ temporary_password: string }>(`/users/${user.id}/reset-password`, { method: "POST" });
      setTemporaryPassword(result.temporary_password);
    } catch (err) {
      setError(errorMessage(err, "Không reset được mật khẩu"));
    }
  }
  return (
    <SystemModal title={`Reset mật khẩu - ${user.full_name}`} onClose={onClose} action={!temporaryPassword ? <><button className="icon-text-btn" onClick={onClose}>Hủy</button><button className="primary-btn" onClick={reset}>Tạo mật khẩu tạm</button></> : <button className="primary-btn" onClick={onClose}>Đóng</button>}>
      {error ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 font-bold text-red-700">{error}</p> : null}
      {temporaryPassword ? <div className="rounded-lg border bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-500">Mật khẩu tạm</p><p className="mt-1 text-xl font-black">{temporaryPassword}</p><p className="mt-2 text-xs text-slate-500">Hệ thống đã gửi email nếu cấu hình mail đang bật. Người dùng sẽ phải đổi mật khẩu sau khi đăng nhập.</p></div> : <p>Hệ thống sẽ tạo mật khẩu ngẫu nhiên, gửi email cho người dùng và yêu cầu đổi mật khẩu sau khi đăng nhập.</p>}
    </SystemModal>
  );
}
