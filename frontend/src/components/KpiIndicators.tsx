import { useEffect, useMemo, useState, type FormEvent } from "react";
import clsx from "clsx";
import { Pencil, Plus, RotateCcw, Search, Target, Trash2 } from "lucide-react";
import { api, errorMessage } from "../api";
import type { Department, KpiIndicator } from "../types";
import { Empty, Loading, PageTitle, Panel } from "./shared";

type IndicatorModalState = { mode: "create" } | { mode: "edit"; indicator: KpiIndicator };
type StatusFilter = "active" | "hidden" | "all";

function departmentName(departments: Department[], indicator: KpiIndicator) {
  if (indicator.department?.name) return indicator.department.name;
  if (!indicator.department_id) return "Chưa gán";
  return departments.find((item) => item.id === indicator.department_id)?.name || "Phòng ban không còn hoạt động";
}

function IndicatorStatusBadge({ active }: { active: boolean }) {
  return (
    <span className={clsx(
      "inline-flex rounded-full border px-2.5 py-1 text-xs font-bold whitespace-nowrap",
      active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600",
    )}>
      {active ? "Đang dùng" : "Đã ẩn"}
    </span>
  );
}

export function KpiIndicatorsView({ departments }: { departments: Department[] }) {
  const [indicators, setIndicators] = useState<KpiIndicator[] | null>(null);
  const [modal, setModal] = useState<IndicatorModalState | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [departmentId, setDepartmentId] = useState("all");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadIndicators() {
    setError("");
    setIndicators(null);
    try {
      setIndicators(await api<KpiIndicator[]>("/kpi/indicators?active_only=false"));
    } catch (err) {
      setError(errorMessage(err, "Không tải được danh mục chỉ tiêu"));
      setIndicators([]);
    }
  }

  useEffect(() => {
    void loadIndicators();
  }, []);

  const stats = useMemo(() => {
    const items = indicators || [];
    return {
      total: items.length,
      active: items.filter((item) => item.is_active).length,
      hidden: items.filter((item) => !item.is_active).length,
      unassigned: items.filter((item) => item.is_active && !item.department_id).length,
    };
  }, [indicators]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (indicators || []).filter((item) => {
      if (status === "active" && !item.is_active) return false;
      if (status === "hidden" && item.is_active) return false;
      if (departmentId !== "all" && (departmentId === "none" ? item.department_id : item.department_id !== departmentId)) return false;
      if (!keyword) return true;
      const text = `${item.number} ${item.name} ${item.description || ""} ${departmentName(departments, item)}`.toLowerCase();
      return text.includes(keyword);
    });
  }, [departmentId, departments, indicators, search, status]);

  async function hideIndicator(indicator: KpiIndicator) {
    if (!window.confirm(`Ẩn chỉ tiêu số ${indicator.number}: ${indicator.name}? Chỉ tiêu đã ẩn sẽ không xuất hiện ở màn nhập và biểu đồ.`)) return;
    setError("");
    setNotice("");
    try {
      await api<KpiIndicator>(`/kpi/indicators/${indicator.id}`, { method: "DELETE" });
      setNotice(`Đã ẩn chỉ tiêu số ${indicator.number}.`);
      await loadIndicators();
    } catch (err) {
      setError(errorMessage(err, "Không ẩn được chỉ tiêu"));
    }
  }

  async function restoreIndicator(indicator: KpiIndicator) {
    setError("");
    setNotice("");
    try {
      await api<KpiIndicator>(`/kpi/indicators/${indicator.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: true }),
      });
      setNotice(`Đã khôi phục chỉ tiêu số ${indicator.number}.`);
      await loadIndicators();
    } catch (err) {
      setError(errorMessage(err, "Không khôi phục được chỉ tiêu"));
    }
  }

  return (
    <section>
      <PageTitle
        title="Quản lý chỉ tiêu"
        desc="Thêm, chỉnh sửa, gán phòng ban hoặc ẩn chỉ tiêu. Màn nhập và biểu đồ chỉ lấy các chỉ tiêu đang dùng."
        action={<button className="primary-btn" onClick={() => setModal({ mode: "create" })}><Plus size={16} /> Thêm chỉ tiêu</button>}
      />

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs font-black uppercase text-slate-400">Tổng danh mục</p>
          <p className="mt-1 text-2xl font-black">{stats.total}</p>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-xs font-black uppercase text-emerald-600">Đang dùng</p>
          <p className="mt-1 text-2xl font-black text-emerald-800">{stats.active}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-black uppercase text-slate-400">Đã ẩn</p>
          <p className="mt-1 text-2xl font-black text-slate-700">{stats.hidden}</p>
        </div>
        <div className="rounded-lg border border-amber-100 bg-amber-50 p-4">
          <p className="text-xs font-black uppercase text-amber-700">Chưa gán phòng ban</p>
          <p className="mt-1 text-2xl font-black text-amber-800">{stats.unassigned}</p>
        </div>
      </div>

      <div className="mb-4 rounded-lg border bg-white p-3">
        <div className="mb-2 flex gap-2">
          <input className="field min-w-0 flex-1" placeholder="Tìm số, tên chỉ tiêu, mô tả hoặc phòng ban..." value={search} onChange={(event) => setSearch(event.target.value)} />
          <button className="icon-text-btn"><Search size={16} /> Tìm</button>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <select className="field" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
            <option value="active">Đang dùng</option>
            <option value="hidden">Đã ẩn</option>
            <option value="all">Tất cả trạng thái</option>
          </select>
          <select className="field" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
            <option value="all">Tất cả phòng ban</option>
            <option value="none">Chưa gán phòng ban</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>{department.name}{department.is_active ? "" : " (đã xóa)"}</option>
            ))}
          </select>
        </div>
      </div>

      {notice ? <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{notice}</p> : null}
      {error ? <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}

      <Panel title="Danh sách chỉ tiêu" icon={<Target size={18} />}>
        {!indicators ? <Loading /> : (
          <div className="thin-scrollbar overflow-auto">
            <table className="w-full min-w-[1120px] text-sm">
              <thead>
                <tr className="bg-[#214b74] text-left text-xs uppercase text-white">
                  <th className="w-20 px-3 py-3 text-center">Số</th>
                  <th className="px-3 py-3">Tên chỉ tiêu</th>
                  <th className="px-3 py-3">Mô tả</th>
                  <th className="w-56 px-3 py-3">Phòng ban</th>
                  <th className="w-32 px-3 py-3">Trạng thái</th>
                  <th className="w-32 px-3 py-3">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((indicator) => (
                  <tr key={indicator.id} className={clsx("border-b transition-colors hover:bg-blue-50", !indicator.is_active && "bg-slate-50 text-slate-500")}>
                    <td className="px-3 py-3 text-center font-black text-[#214b74]">{indicator.number}</td>
                    <td className="px-3 py-3 font-bold text-slate-900">{indicator.name}</td>
                    <td className="max-w-[460px] px-3 py-3 text-slate-600">
                      <p className="line-clamp-3">{indicator.description || "-"}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className={indicator.department_id ? "font-semibold text-slate-700" : "font-bold text-amber-700"}>
                        {departmentName(departments, indicator)}
                      </span>
                    </td>
                    <td className="px-3 py-3"><IndicatorStatusBadge active={indicator.is_active} /></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <button className="rounded-lg p-1.5 text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700" title="Sửa chỉ tiêu" onClick={() => setModal({ mode: "edit", indicator })}>
                          <Pencil size={17} />
                        </button>
                        {indicator.is_active ? (
                          <button className="rounded-lg p-1.5 text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700" title="Ẩn chỉ tiêu" onClick={() => void hideIndicator(indicator)}>
                            <Trash2 size={17} />
                          </button>
                        ) : (
                          <button className="rounded-lg p-1.5 text-emerald-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700" title="Khôi phục chỉ tiêu" onClick={() => void restoreIndicator(indicator)}>
                            <RotateCcw size={17} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length ? <Empty text="Không có chỉ tiêu phù hợp." /> : null}
          </div>
        )}
      </Panel>

      {modal ? (
        <IndicatorModal
          state={modal}
          departments={departments}
          onClose={() => setModal(null)}
          onDone={async (message) => {
            setModal(null);
            setNotice(message);
            await loadIndicators();
          }}
        />
      ) : null}
    </section>
  );
}

function IndicatorModal({
  state,
  departments,
  onClose,
  onDone,
}: {
  state: IndicatorModalState;
  departments: Department[];
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const indicator = state.mode === "edit" ? state.indicator : null;
  const [numberText, setNumberText] = useState(indicator ? String(indicator.number) : "");
  const [name, setName] = useState(indicator?.name || "");
  const [description, setDescription] = useState(indicator?.description || "");
  const [departmentId, setDepartmentId] = useState(indicator?.department_id || "");
  const [isActive, setIsActive] = useState(indicator?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const departmentOptions = useMemo(() => {
    return departments.filter((department) => department.is_active || department.id === departmentId);
  }, [departmentId, departments]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const numberValue = Number(numberText);
    const trimmedName = name.trim();
    if (!Number.isInteger(numberValue) || numberValue < 1) {
      setError("Số chỉ tiêu phải là số nguyên lớn hơn 0.");
      return;
    }
    if (!trimmedName) {
      setError("Tên chỉ tiêu không được để trống.");
      return;
    }
    setSaving(true);
    try {
      const basePayload = {
        number: numberValue,
        name: trimmedName,
        description: description.trim() || null,
        department_id: departmentId || null,
      };
      if (state.mode === "create") {
        await api<KpiIndicator>("/kpi/indicators", { method: "POST", body: JSON.stringify(basePayload) });
        await onDone(`Đã thêm chỉ tiêu số ${numberValue}.`);
      } else {
        await api<KpiIndicator>(`/kpi/indicators/${state.indicator.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...basePayload, is_active: isActive }),
        });
        await onDone(`Đã cập nhật chỉ tiêu số ${numberValue}.`);
      }
    } catch (err) {
      setError(errorMessage(err, "Không lưu được chỉ tiêu"));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-5">
      <form onSubmit={submit} className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-black">{state.mode === "edit" ? `Chỉnh sửa - Chỉ tiêu ${state.indicator.number}` : "Thêm chỉ tiêu"}</h3>
          <button type="button" className="text-sm font-bold text-slate-500" onClick={onClose}>Đóng</button>
        </div>
        {error ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
        <div className="grid gap-3 md:grid-cols-[160px_1fr]">
          <label className="text-sm font-bold">
            Số chỉ tiêu *
            <input className="field mt-1 w-full" type="number" min={1} step={1} value={numberText} onChange={(event) => setNumberText(event.target.value)} required />
          </label>
          <label className="text-sm font-bold">
            Tên chỉ tiêu *
            <input className="field mt-1 w-full" value={name} onChange={(event) => setName(event.target.value)} maxLength={500} required />
          </label>
          <label className="text-sm font-bold md:col-span-2">
            Mô tả
            <textarea className="field mt-1 min-h-28 w-full" value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label className="text-sm font-bold md:col-span-2">
            Phòng ban phụ trách
            <select className="field mt-1 w-full" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
              <option value="">Chưa gán phòng ban</option>
              {departmentOptions.map((department) => (
                <option key={department.id} value={department.id}>{department.name}{department.is_active ? "" : " (đã xóa)"}</option>
              ))}
            </select>
          </label>
          {state.mode === "edit" ? (
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm font-bold md:col-span-2">
              <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
              Trạng thái: {isActive ? "Đang dùng" : "Đã ẩn"}
            </label>
          ) : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="icon-text-btn" onClick={onClose}>Hủy</button>
          <button className="primary-btn" disabled={saving}><Plus size={16} /> {saving ? "Đang lưu..." : "Lưu"}</button>
        </div>
      </form>
    </div>
  );
}
