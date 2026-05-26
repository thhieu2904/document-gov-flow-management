import { useEffect, useState } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, FileText, Plus, Search, X, Download } from "lucide-react";
import { api, errorMessage } from "../api";
import type { AssignmentStatus, Department, DisplayStatus, DocumentRow, Page, Priority, User } from "../types";
import { fmtDateTimeSecond, fromDateTimeInputValue } from "../utils";
import { Empty, Loading, PageTitle, Pager, Panel, Priority as PriorityBadge, Status } from "./shared";
import { ExportModal } from "./ExportModal";

type StatusFilter = "open" | "draft" | "in_progress" | "due_soon" | "overdue" | "completed" | "completed_late";
type Period = "week" | "month" | "all";
type SortKey = "code" | "title" | "issued_at" | "due_at" | "progress" | "status" | "priority" | "created_at";
type SortDir = "asc" | "desc";

function displayStatus(doc: DocumentRow): DisplayStatus {
  if (doc.status === "completed") {
    if (doc.due_at && doc.completed_at && new Date(doc.completed_at).getTime() > new Date(doc.due_at).getTime()) return "completed_late";
    return "completed";
  }
  if (doc.due_at && new Date(doc.due_at).getTime() < Date.now()) return "overdue";
  if (doc.due_at && new Date(doc.due_at).getTime() <= Date.now() + 3 * 86400000) return "due_soon";
  return doc.status;
}

function rowStatus(doc: DocumentRow): DisplayStatus | AssignmentStatus {
  return doc.my_assignment_display_status || doc.display_status || displayStatus(doc);
}

function rowDueAt(doc: DocumentRow) {
  return doc.my_assignment_due_at || doc.due_at;
}

function rowProgress(doc: DocumentRow) {
  return doc.my_assignment_progress || `${doc.completed_count}/${doc.assignment_count}`;
}

function shortDate(value: Date) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(value);
}

function weekBounds(anchor: Date) {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function periodDetail(period: Period, anchor: Date) {
  if (period === "all") return "Tất cả thời gian";
  if (period === "month") return `Tháng ${anchor.getMonth() + 1}/${anchor.getFullYear()}`;
  const { start, end } = weekBounds(anchor);
  return `${shortDate(start)} - ${shortDate(end)}`;
}

function dateParam(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function DocumentsView({ scope, title, mode, currentUser, users, departments, onOpen, onChanged, initialStatuses }: { scope: "assigned_by_me" | "my_tasks"; title: string; mode: Period | "period"; currentUser: User; users: User[]; departments: Department[]; onOpen: (id: string) => void; onChanged?: () => Promise<void>; initialStatuses?: StatusFilter[] }) {
  const [page, setPage] = useState<Page<DocumentRow> | null>(null);
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [statuses, setStatuses] = useState<StatusFilter[]>(initialStatuses || []);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [period, setPeriod] = useState<Period>(mode === "period" ? "week" : "all");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [sortBy, setSortBy] = useState<SortKey>("due_at");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [pageNo, setPageNo] = useState(1);
  const [creating, setCreating] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const params = new URLSearchParams({ scope, size: "20", page: String(pageNo), sort_by: sortBy, sort_dir: sortDir });
      if (submittedSearch) params.set("search", submittedSearch);
      params.set("period", mode === "period" ? period : "all");
      if (mode === "period") params.set("anchor_date", dateParam(anchorDate));
      statuses.forEach((item) => params.append("status", item));
      priorities.forEach((item) => params.append("priority", item));
      setPage(await api<Page<DocumentRow>>(`/documents?${params.toString()}`));
    } catch (err) {
      setError(errorMessage(err, "Không tải được danh sách văn bản"));
    }
  }

  useEffect(() => {
    void load();
  }, [scope, submittedSearch, statuses.join(","), priorities.join(","), mode, period, anchorDate, sortBy, sortDir, pageNo]);

  function toggleSort(key: SortKey) {
    setPageNo(1);
    if (sortBy === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortBy(key);
      setSortDir(key === "issued_at" || key === "due_at" || key === "created_at" ? "desc" : "asc");
    }
  }

  function movePeriod(delta: -1 | 1) {
    if (period === "all") return;
    const next = new Date(anchorDate);
    if (period === "week") next.setDate(next.getDate() + delta * 7);
    else next.setFullYear(anchorDate.getFullYear(), anchorDate.getMonth() + delta, 1);
    setAnchorDate(next);
    setPageNo(1);
  }

  function toggleStatus(status: StatusFilter) {
    setPageNo(1);
    setStatuses((items) => items.includes(status) ? items.filter((item) => item !== status) : [...items, status]);
  }

  function togglePriority(priority: Priority) {
    setPageNo(1);
    setPriorities((items) => items.includes(priority) ? items.filter((item) => item !== priority) : [...items, priority]);
  }

  return (
    <section>
      <PageTitle title={title} desc={mode === "period" ? "Các văn bản có hạn hoặc ngày ban hành trong kỳ đang chọn." : "Kho tra cứu toàn bộ văn bản, gồm cả tồn đọng tháng trước và văn bản đã hoàn tất."} action={
        <div className="flex gap-2">
          <button className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-emerald-700" onClick={() => setShowExport(true)}><Download size={16} /> Xuất Excel</button>
          {currentUser.role === "manager" && scope === "assigned_by_me" ? <button className="primary-btn" onClick={() => setCreating(true)}><Plus size={16} /> Tạo văn bản</button> : null}
        </div>
      } />
      {error ? <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
      {/* Bộ lọc thống nhất */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Dòng 1: Tìm kiếm & Thời gian */}
        <div className="flex flex-wrap gap-4 border-b border-slate-100 p-4">
          <form className="flex min-w-[300px] flex-1 items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 transition-colors focus-within:bg-blue-50/50" onSubmit={(e) => { e.preventDefault(); setPageNo(1); setSubmittedSearch(search.trim()); }}>
            <Search size={16} className="text-slate-400" />
            <input className="flex-1 bg-transparent text-sm outline-none" placeholder="Tìm số hiệu hoặc trích yếu..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="text-xs font-bold text-[#214b74] hover:underline" type="submit">Tìm kiếm</button>
          </form>
          
          {mode === "period" ? (
            <div className="flex shrink-0 items-center gap-2">
              <div className="inline-flex rounded-lg bg-slate-100 p-1">
                <button type="button" className={period === "week" ? "rounded bg-white px-3 py-1 text-xs font-bold text-[#214b74] shadow-sm" : "rounded px-3 py-1 text-xs font-bold text-slate-500 hover:text-slate-700"} onClick={() => { setPeriod("week"); setPageNo(1); }}>Tuần</button>
                <button type="button" className={period === "month" ? "rounded bg-white px-3 py-1 text-xs font-bold text-[#214b74] shadow-sm" : "rounded px-3 py-1 text-xs font-bold text-slate-500 hover:text-slate-700"} onClick={() => { setPeriod("month"); setPageNo(1); }}>Tháng</button>
              </div>
              <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={() => movePeriod(-1)} aria-label="Kỳ trước"><ChevronLeft size={16} /></button>
              <div className="min-w-[180px] text-center text-sm font-black text-[#214b74]">{periodDetail(period, anchorDate)}</div>
              <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={() => movePeriod(1)} aria-label="Kỳ sau"><ChevronRight size={16} /></button>
            </div>
          ) : <div className="flex items-center text-sm font-bold text-[#214b74]">Kho dữ liệu toàn bộ</div>}
        </div>

        {/* Dòng 2: Trạng thái & Ưu tiên */}
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-2 text-xs font-black uppercase tracking-wider text-slate-400">Trạng thái</span>
            {([
              ["open", "Cần thực hiện"],
              ["draft", scope === "my_tasks" ? "Chưa nhận" : "Chưa giao"],
              ["in_progress", "Đang thực hiện"],
              ["due_soon", "Sắp đến hạn"],
              ["overdue", "Quá hạn"],
              ["completed", "Hoàn tất"],
              ["completed_late", "Hoàn tất trễ hạn"],
            ] as Array<[StatusFilter, string]>).map(([value, label]) => <button key={value} type="button" className={statuses.includes(value) ? "rounded-full bg-[#214b74] px-3 py-1 text-xs font-bold text-white shadow-sm" : "rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200"} onClick={() => toggleStatus(value)}>{label}</button>)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-2 w-[72px] text-xs font-black uppercase tracking-wider text-slate-400">Ưu tiên</span>
            {(["normal", "high", "urgent"] as Priority[]).map((value) => <button key={value} type="button" className={priorities.includes(value) ? "rounded-full bg-[#214b74] px-3 py-1 text-xs font-bold text-white shadow-sm" : "rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200"} onClick={() => togglePriority(value)}>{value === "normal" ? "Thường" : value === "high" ? "Khẩn" : "Hỏa tốc"}</button>)}
          </div>
        </div>
      </div>

      <Panel title="Danh sách văn bản" icon={<FileText size={18} />}>
        {page ? <>
          <DocumentTable docs={page.items} sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} onOpen={onOpen} />
          <Pager page={page.page} size={page.size} total={page.total} onPage={setPageNo} />
        </> : <Loading />}
      </Panel>
      {creating ? <DocumentModal users={users} departments={departments} onClose={() => setCreating(false)} onDone={async () => { setCreating(false); await load(); await onChanged?.(); }} /> : null}
      {showExport && (
        <ExportModal
          onClose={() => setShowExport(false)}
          scope={scope}
          sortBy={sortBy}
          sortDir={sortDir}
          search={submittedSearch}
          statuses={statuses}
          priorities={priorities}
        />
      )}
    </section>
  );
}

function SortHead({ label, field, sortBy, sortDir, onSort }: { label: string; field: SortKey; sortBy: SortKey; sortDir: SortDir; onSort: (field: SortKey) => void }) {
  return <th className="doc-table-nowrap whitespace-nowrap px-3 py-3"><button className="doc-table-nowrap flex items-center gap-1 uppercase whitespace-nowrap" onClick={() => onSort(field)}>{label}<span className="text-[10px]">{sortBy === field ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span></button></th>;
}

export function DocumentTable({ docs, sortBy, sortDir, onSort, onOpen }: { docs: DocumentRow[]; sortBy: SortKey; sortDir: SortDir; onSort: (field: SortKey) => void; onOpen: (id: string) => void }) {
  return (
    <div className="thin-scrollbar overflow-auto">
      <table className="doc-table w-full min-w-[1240px] text-sm">
        <thead><tr className="bg-[#214b74] text-left text-xs uppercase text-white"><SortHead label="Số hiệu" field="code" sortBy={sortBy} sortDir={sortDir} onSort={onSort} /><SortHead label="Trích yếu" field="title" sortBy={sortBy} sortDir={sortDir} onSort={onSort} /><SortHead label="Ngày tạo" field="created_at" sortBy={sortBy} sortDir={sortDir} onSort={onSort} /><SortHead label="Ngày ban hành" field="issued_at" sortBy={sortBy} sortDir={sortDir} onSort={onSort} /><SortHead label="Hạn hoàn thành" field="due_at" sortBy={sortBy} sortDir={sortDir} onSort={onSort} /><SortHead label="Tiến độ" field="progress" sortBy={sortBy} sortDir={sortDir} onSort={onSort} /><SortHead label="Trạng thái" field="status" sortBy={sortBy} sortDir={sortDir} onSort={onSort} /><SortHead label="Độ ưu tiên" field="priority" sortBy={sortBy} sortDir={sortDir} onSort={onSort} /></tr></thead>
        <tbody>
          {docs.map((doc) => (
            <tr key={doc.id} className="cursor-pointer border-b hover:bg-blue-50" onClick={() => onOpen(doc.id)}>
              <td className="doc-table-nowrap whitespace-nowrap px-3 py-3 font-bold">{doc.code || "-"}</td>
              <td className="px-3 py-3 font-bold">{doc.title}<div className="text-xs font-normal text-slate-500">{doc.summary || "-"}</div></td>
              <td className="doc-table-nowrap whitespace-nowrap px-3 py-3 text-slate-500">{fmtDateTimeSecond(doc.created_at)}</td>
              <td className="doc-table-nowrap whitespace-nowrap px-3 py-3">{fmtDateTimeSecond(doc.issued_at)}</td>
              <td className="doc-table-nowrap whitespace-nowrap px-3 py-3">{fmtDateTimeSecond(rowDueAt(doc))}</td>
              <td className="doc-table-nowrap whitespace-nowrap px-3 py-3 font-bold">{rowProgress(doc)}</td>
              <td className="doc-table-nowrap whitespace-nowrap px-3 py-3"><Status status={rowStatus(doc)} /></td>
              <td className="doc-table-nowrap whitespace-nowrap px-3 py-3"><PriorityBadge p={doc.priority} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!docs.length ? <Empty text="Chưa có văn bản." /> : null}
    </div>
  );
}

export function DocumentModal({ users, departments, onClose, onDone }: { users: User[]; departments: Department[]; onClose: () => void; onDone: () => Promise<void> }) {
  const staff = users.filter((u) => u.role === "staff" && u.is_active);
  const activeDepartments = departments.filter((d) => d.is_active);
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [summary, setSummary] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [departmentId, setDepartmentId] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [staffSearch, setStaffSearch] = useState("");
  const [staffDepartment, setStaffDepartment] = useState("");
  const [instruction, setInstruction] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const selectedStaff = staff.filter((item) => assignees.includes(item.id));
  const filteredStaff = staff.filter((item) => {
    const matchesSearch = `${item.full_name} ${item.email}`.toLowerCase().includes(staffSearch.toLowerCase());
    const matchesDept = !staffDepartment || item.department_id === staffDepartment;
    return matchesSearch && matchesDept;
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const doc = await api<DocumentRow>("/documents", { method: "POST", body: JSON.stringify({ title, code: code || null, summary: summary || null, issued_at: fromDateTimeInputValue(issuedAt), due_at: fromDateTimeInputValue(dueAt), priority, department_id: departmentId || null }) });
      if (file) {
        const form = new FormData();
        form.set("file", file);
        await api(`/documents/${doc.id}/attachments`, { method: "POST", body: form });
      }
      if (assignees.length) await api(`/documents/${doc.id}/assign`, { method: "POST", body: JSON.stringify({ assignee_ids: assignees, instruction, due_at: fromDateTimeInputValue(dueAt), priority }) });
      await onDone();
    } catch (err) {
      setError(errorMessage(err, "Không tạo được văn bản"));
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-5">
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex justify-between"><h3 className="text-lg font-black">Tạo văn bản</h3><button type="button" onClick={onClose}>Đóng</button></div>
        {error ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-bold">Số hiệu/ký hiệu<input className="field mt-1 w-full" value={code} onChange={(e) => setCode(e.target.value)} /></label>
          <label className="text-sm font-bold">Cơ quan/phòng ban thực hiện<select className="field mt-1 w-full" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}><option value="">Không chọn</option>{activeDepartments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <label className="col-span-2 text-sm font-bold">Trích yếu *<textarea className="field mt-1 min-h-20 w-full" value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
          <label className="text-sm font-bold">Ngày ban hành<input className="field mt-1 w-full" type="datetime-local" step={1} value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} /></label>
          <label className="text-sm font-bold">Hạn hoàn thành *<input className="field mt-1 w-full" type="datetime-local" step={1} value={dueAt} onChange={(e) => setDueAt(e.target.value)} required /></label>
          <label className="text-sm font-bold">Độ ưu tiên<select className="field mt-1 w-full" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}><option value="normal">Thường</option><option value="high">Khẩn</option><option value="urgent">Hỏa tốc</option></select></label>
          <label className="text-sm font-bold">File văn bản gốc<input className="field mt-1 w-full" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
          <label className="col-span-2 text-sm font-bold">Nội dung giao việc<textarea className="field mt-1 min-h-20 w-full" value={instruction} onChange={(e) => setInstruction(e.target.value)} /></label>
          <label className="col-span-2 text-sm font-bold">Ghi chú/mô tả nội bộ<textarea className="field mt-1 min-h-16 w-full" value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
          <div className="col-span-2 rounded-lg border border-slate-200 p-3">
            <div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-black">Nhân viên thực hiện</p><span className="text-xs font-bold text-slate-500">{assignees.length} đã chọn</span></div>
            {selectedStaff.length ? <div className="mb-3 flex flex-wrap gap-2">{selectedStaff.map((u) => <button key={u.id} type="button" className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#214b74]" onClick={() => setAssignees(assignees.filter((id) => id !== u.id))}>{u.full_name} <X className="inline" size={12} /></button>)}</div> : null}
            <div className="mb-2 grid grid-cols-[1fr_220px] gap-2">
              <input className="field" placeholder="Tìm nhân viên theo tên/email..." value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)} />
              <select className="field" value={staffDepartment} onChange={(e) => setStaffDepartment(e.target.value)}><option value="">Tất cả phòng ban</option>{activeDepartments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            </div>
            <div className="thin-scrollbar grid max-h-56 grid-cols-2 gap-2 overflow-auto pr-1">{filteredStaff.map((u) => <label key={u.id} className={clsx("rounded-lg border p-3 text-sm", assignees.includes(u.id) ? "border-[#1d6ef0] bg-blue-50" : "border-slate-200")}><input type="checkbox" className="mr-2" checked={assignees.includes(u.id)} onChange={(e) => setAssignees(e.target.checked ? [...assignees, u.id] : assignees.filter((id) => id !== u.id))} /><b>{u.full_name}</b><div className="ml-6 text-xs text-slate-500">{u.email}</div></label>)}</div>
            {!filteredStaff.length ? <Empty text="Không tìm thấy nhân viên phù hợp." /> : null}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2"><button type="button" className="icon-text-btn" onClick={onClose}>Hủy</button><button className="primary-btn"><Plus size={16} /> Lưu</button></div>
      </form>
    </div>
  );
}
