import { useMemo, useState } from "react";
import { ArrowRightLeft, Building2, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { api } from "../api";
import type { Department, User } from "../types";
import { Empty, PageTitle, Panel, SystemModal } from "./shared";

type DepartmentModalState = { mode: "create" } | { mode: "edit"; department: Department };

function activeStaff(users: User[], departmentId: string) {
  return users.filter((u) => u.role === "staff" && u.is_active && u.department_id === departmentId);
}

export function DepartmentsView({ departments, users, onChanged }: { departments: Department[]; users: User[]; onChanged: () => Promise<void> }) {
  const [modal, setModal] = useState<DepartmentModalState | null>(null);
  const [transfer, setTransfer] = useState<Department | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"active" | "deleted" | "all">("active");

  const filtered = useMemo(() => departments.filter((d) => {
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (status === "active" && !d.is_active) return false;
    if (status === "deleted" && d.is_active) return false;
    return true;
  }), [departments, search, status]);

  async function softDelete(department: Department) {
    try {
      await api(`/departments/${department.id}`, { method: "DELETE" });
      await onChanged();
    } catch (err) {
      setAlert(err instanceof Error ? err.message : "Không xóa được phòng ban");
    }
  }

  async function restore(department: Department) {
    await api(`/departments/${department.id}/restore`, { method: "POST" });
    await onChanged();
  }

  return (
    <section>
      <PageTitle title="Phòng ban" desc="Phòng ban là nhóm quản lý nhân viên. Xóa phòng ban là xóa mềm để giữ lịch sử." action={<button className="primary-btn" onClick={() => setModal({ mode: "create" })}><Plus size={16} /> Thêm phòng ban</button>} />
      <div className="mb-4 rounded-lg border bg-white p-3">
        <div className="mb-2 flex gap-2">
          <input className="field flex-1" placeholder="Tìm phòng ban..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="icon-text-btn"><Search size={16} /> Tìm</button>
        </div>
        <select className="field w-full" value={status} onChange={(e) => setStatus(e.target.value as "active" | "deleted" | "all")}><option value="active">Đang sử dụng</option><option value="deleted">Đã xóa</option><option value="all">Tất cả</option></select>
      </div>
      <Panel title="Danh sách phòng ban" icon={<Building2 size={18} />}>
        <div className="thin-scrollbar overflow-auto">
          <table className="w-full min-w-[940px] text-sm">
            <thead><tr className="bg-[#214b74] text-left text-xs uppercase text-white"><th className="px-3 py-3">Tên phòng ban</th><th className="px-3 py-3">Mô tả</th><th className="px-3 py-3">Nhân viên</th><th className="px-3 py-3">Văn bản</th><th className="px-3 py-3">Trạng thái</th><th className="px-3 py-3">Thao tác</th></tr></thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="border-b hover:bg-blue-50">
                  <td className="px-3 py-3 font-bold" onClick={() => setModal({ mode: "edit", department: d })}>{d.name}</td>
                  <td className="px-3 py-3">{d.description || "-"}</td>
                  <td className="px-3 py-3">{d.active_member_count ?? activeStaff(users, d.id).length}</td>
                  <td className="px-3 py-3">{d.document_count ?? "-"}</td>
                  <td className="px-3 py-3">{d.is_active ? "Đang sử dụng" : "Đã xóa"}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button className="icon-text-btn" onClick={() => setModal({ mode: "edit", department: d })}><Pencil size={15} /> Sửa</button>
                      <button className="icon-text-btn" onClick={() => setTransfer(d)}><ArrowRightLeft size={15} /> Chuyển</button>
                      {d.is_active ? <button className="icon-text-btn" onClick={() => softDelete(d)}><Trash2 size={15} /> Xóa</button> : <button className="icon-text-btn" onClick={() => restore(d)}><RotateCcw size={15} /> Khôi phục</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length ? <Empty text="Không có phòng ban phù hợp." /> : null}
        </div>
      </Panel>
      {modal ? <DepartmentModal state={modal} onClose={() => setModal(null)} onDone={async () => { setModal(null); await onChanged(); }} /> : null}
      {transfer ? <TransferModal department={transfer} users={users} departments={departments.filter((d) => d.is_active && d.id !== transfer.id)} onClose={() => setTransfer(null)} onDone={async () => { setTransfer(null); await onChanged(); }} /> : null}
      {alert ? <SystemModal title="Không thể xóa phòng ban" onClose={() => setAlert(null)} action={<button className="primary-btn" onClick={() => setAlert(null)}>Đã hiểu</button>}><p>{alert}</p></SystemModal> : null}
    </section>
  );
}

function DepartmentModal({ state, onClose, onDone }: { state: DepartmentModalState; onClose: () => void; onDone: () => Promise<void> }) {
  const department = state.mode === "edit" ? state.department : null;
  const [name, setName] = useState(department?.name || "");
  const [description, setDescription] = useState(department?.description || "");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const payload = { name: name.trim(), description: description.trim() || null };
      if (state.mode === "create") await api<Department>("/departments", { method: "POST", body: JSON.stringify(payload) });
      else await api<Department>(`/departments/${state.department.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được phòng ban");
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-5">
      <form onSubmit={submit} className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-black">{state.mode === "edit" ? `Chỉnh sửa - ${state.department.name}` : "Thêm phòng ban"}</h3><button type="button" onClick={onClose}>Đóng</button></div>
        {error ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
        <label className="mb-3 block text-sm font-bold">Tên phòng ban *<input className="field mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label className="mb-3 block text-sm font-bold">Mô tả<textarea className="field mt-1 min-h-24 w-full" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <div className="mt-5 flex justify-end gap-2"><button type="button" className="icon-text-btn" onClick={onClose}>Hủy</button><button className="primary-btn"><Plus size={16} /> Lưu</button></div>
      </form>
    </div>
  );
}

function TransferModal({ department, users, departments, onClose, onDone }: { department: Department; users: User[]; departments: Department[]; onClose: () => void; onDone: () => Promise<void> }) {
  const [targetId, setTargetId] = useState("");
  const [error, setError] = useState("");
  const count = activeStaff(users, department.id).length;
  async function submit() {
    setError("");
    try {
      await api(`/departments/${department.id}/transfer-users`, { method: "POST", body: JSON.stringify({ target_department_id: targetId }) });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không chuyển được nhân viên");
    }
  }
  return (
    <SystemModal title={`Chuyển nhân viên - ${department.name}`} onClose={onClose} action={<><button className="icon-text-btn" onClick={onClose}>Hủy</button><button className="primary-btn" disabled={!targetId} onClick={submit}>Chuyển</button></>}>
      {error ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 font-bold text-red-700">{error}</p> : null}
      <p>Có <strong>{count}</strong> nhân viên đang hoạt động trong phòng ban này.</p>
      <label className="mt-3 block text-sm font-bold">Phòng ban đích<select className="field mt-1 w-full" value={targetId} onChange={(e) => setTargetId(e.target.value)}><option value="">Chọn phòng ban</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
    </SystemModal>
  );
}
