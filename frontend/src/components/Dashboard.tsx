import { AlertTriangle, BriefcaseBusiness, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, FileText, Inbox, ListChecks, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import { labels } from "../labels";
import type { Dashboard, DashboardDocument, Department, User } from "../types";
import { fmtDateTimeSecond } from "../utils";
import { DocumentModal } from "./Documents";
import { Empty, Loading, PageTitle, Panel, Priority, Refresh, Stat, Status } from "./shared";

type Period = "week" | "month" | "all";
type SortKey = "code" | "title" | "created_at" | "due_at" | "progress" | "status" | "priority";
type SortDir = "asc" | "desc";

function assigneeText(item: DashboardDocument) {
  if (!item.assignees.length) return "Chưa giao nhân viên";
  return item.assignees.map((assignee) => `${assignee.name} - ${labels.assignmentStatus[assignee.status]}`).join(", ");
}

function dateParam(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  if (period === "month") return `Tháng ${anchor.getMonth() + 1}/${anchor.getFullYear()}`;
  const { start, end } = weekBounds(anchor);
  return `${shortDate(start)} - ${shortDate(end)}`;
}

function periodLabel(period: Period) {
  if (period === "month") return "Xem theo tháng";
  if (period === "all") return "Tất cả thời gian";
  return "Xem theo tuần";
}

function SortHead({ label, field, sortBy, sortDir, onSort }: { label: string; field: SortKey; sortBy: SortKey; sortDir: SortDir; onSort: (field: SortKey) => void }) {
  return (
    <th className="px-3 py-3">
      <button type="button" className="flex items-center gap-1 uppercase whitespace-nowrap" onClick={() => onSort(field)}>
        {label}
        <span className="text-[10px]">{sortBy === field ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}

function WorkGrid({
  items,
  sortBy,
  sortDir,
  onSort,
  onOpen,
}: {
  items: DashboardDocument[];
  sortBy: SortKey;
  sortDir: SortDir;
  onSort: (field: SortKey) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="thin-scrollbar overflow-auto">
      <table className="w-full min-w-[1120px] text-sm">
        <thead>
          <tr className="bg-[#214b74] text-left text-xs uppercase text-white">
            <SortHead label="Số hiệu" field="code" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            <SortHead label="Trích yếu" field="title" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            <SortHead label="Ngày tạo" field="created_at" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            <th className="px-3 py-3">Nhân viên</th>
            <SortHead label="Hạn hoàn thành" field="due_at" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            <SortHead label="Tiến độ" field="progress" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            <SortHead label="Trạng thái" field="status" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            <SortHead label="Ưu tiên" field="priority" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {items.map((doc) => (
            <tr key={doc.id} className="cursor-pointer border-b hover:bg-blue-50" onClick={() => onOpen(doc.id)}>
              <td className="px-3 py-3 font-bold">{doc.code || "-"}</td>
              <td className="px-3 py-3 font-bold">{doc.title}</td>
              <td className="px-3 py-3 text-slate-500">{fmtDateTimeSecond(doc.created_at)}</td>
              <td className="max-w-[320px] px-3 py-3 text-slate-600">{assigneeText(doc)}</td>
              <td className="px-3 py-3">{fmtDateTimeSecond(doc.due_at)}</td>
              <td className="px-3 py-3 font-bold">{doc.completed_count}/{doc.assignment_count}</td>
              <td className="px-3 py-3"><Status status={doc.display_status} /></td>
              <td className="px-3 py-3"><Priority p={doc.priority} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length ? <Empty text="Không có văn bản cần xử lý." /> : null}
    </div>
  );
}

export function DashboardView({ user, users, departments, onOpen, onChanged }: { user: User; users: User[]; departments: Department[]; onOpen: (id: string) => void; onChanged?: () => Promise<void> }) {
  const [period, setPeriod] = useState<Exclude<Period, "all">>("week");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [data, setData] = useState<Dashboard | null>(null);
  const [creating, setCreating] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("due_at");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const params = new URLSearchParams({ period, sort_by: sortBy, sort_dir: sortDir });
      params.set("anchor_date", dateParam(anchorDate));
      setData(await api<Dashboard>(`/dashboard?${params.toString()}`));
    } catch (err) {
      setError(errorMessage(err, "Không tải được tổng quan"));
    }
  }

  useEffect(() => {
    void load();
  }, [user.id, period, anchorDate, sortBy, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortBy(key);
      setSortDir(key === "created_at" || key === "due_at" ? "desc" : "asc");
    }
  }

  function movePeriod(delta: -1 | 1) {
    const next = new Date(anchorDate);
    if (period === "week") next.setDate(next.getDate() + delta * 7);
    else next.setFullYear(anchorDate.getFullYear(), anchorDate.getMonth() + delta, 1);
    setAnchorDate(next);
  }

  if (!data) {
    return (
      <section>
        <PageTitle title="Tổng quan" desc="Theo dõi văn bản, hạn xử lý và kết quả hoàn thành." action={<Refresh onClick={load} />} />
        {error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</div> : <Loading />}
      </section>
    );
  }
  const stats = user.role === "manager"
    ? [
        { label: "Tổng văn bản", value: data.total_documents, icon: <FileText size={20} /> },
        { label: "Chưa giao", value: data.draft_documents, icon: <Inbox size={20} />, tone: "slate" as const },
        { label: "Đang thực hiện", value: data.in_progress_documents, icon: <BriefcaseBusiness size={20} />, tone: "slate" as const },
        { label: "Sắp đến hạn", value: data.due_soon_documents, icon: <CalendarClock size={20} />, tone: "blue" as const },
        { label: "Quá hạn", value: data.overdue_documents, icon: <AlertTriangle size={20} />, tone: "red" as const },
        { label: "Hoàn tất trong kỳ", value: data.completed_documents, icon: <CheckCircle2 size={20} />, tone: "slate" as const },
      ]
    : [
        { label: "Việc của tôi", value: data.total_documents, icon: <FileText size={20} /> },
        { label: "Cần xử lý", value: data.open_documents, icon: <Inbox size={20} />, tone: "slate" as const },
        { label: "Đang làm", value: data.in_progress_documents, icon: <BriefcaseBusiness size={20} />, tone: "slate" as const },
        { label: "Sắp đến hạn", value: data.due_soon_documents, icon: <CalendarClock size={20} />, tone: "blue" as const },
        { label: "Quá hạn", value: data.overdue_documents, icon: <AlertTriangle size={20} />, tone: "red" as const },
        { label: "Đã nộp trong kỳ", value: data.completed_documents, icon: <CheckCircle2 size={20} />, tone: "slate" as const },
      ];

  return (
    <section>
      <PageTitle
        title="Tổng quan"
        desc={user.role === "manager" ? "Theo dõi toàn bộ văn bản đang cần thực hiện, hạn xử lý và kết quả hoàn thành." : "Theo dõi các văn bản được giao và hạn xử lý của bạn."}
        action={user.role === "manager" ? <button className="primary-btn" onClick={() => setCreating(true)}><Plus size={16} /> Thêm văn bản</button> : undefined}
      />
      {error ? <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</div> : null}
      <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button className={period === "week" ? "rounded-md bg-[#214b74] px-4 py-2 text-sm font-bold text-white" : "rounded-md px-4 py-2 text-sm font-bold text-slate-600 hover:bg-white"} onClick={() => setPeriod("week")}>Tuần</button>
            <button className={period === "month" ? "rounded-md bg-[#214b74] px-4 py-2 text-sm font-bold text-white" : "rounded-md px-4 py-2 text-sm font-bold text-slate-600 hover:bg-white"} onClick={() => setPeriod("month")}>Tháng</button>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-[#214b74] hover:bg-blue-50" onClick={() => movePeriod(-1)} aria-label="Kỳ trước"><ChevronLeft size={18} /></button>
            <div className="min-w-[260px] rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-center">
              <p className="text-xs font-bold uppercase text-slate-500">{periodLabel(period)}</p>
              <p className="font-black text-slate-900">{periodDetail(period, anchorDate)}</p>
            </div>
            <button className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-[#214b74] hover:bg-blue-50" onClick={() => movePeriod(1)} aria-label="Kỳ sau"><ChevronRight size={18} /></button>
            <Refresh onClick={load} />
          </div>
        </div>
      </div>
      <div className="mb-5 grid gap-3" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
        {stats.map((item) => <Stat key={item.label} {...item} />)}
      </div>
      <Panel title="Văn bản cần xử lý" icon={<ListChecks size={18} />}>
        <WorkGrid items={data.work_items} sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} onOpen={onOpen} />
      </Panel>
      {creating ? <DocumentModal users={users} departments={departments} onClose={() => setCreating(false)} onDone={async () => { setCreating(false); await load(); await onChanged?.(); }} /> : null}
    </section>
  );
}
