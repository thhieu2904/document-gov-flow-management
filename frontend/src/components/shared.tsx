import type { ReactNode } from "react";
import clsx from "clsx";
import { Loader2, RefreshCcw } from "lucide-react";
import { labels } from "../labels";
import type { AssignmentStatus, DisplayStatus, DocumentStatus } from "../types";

const statusTone: Record<DisplayStatus | AssignmentStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  in_progress: "bg-amber-50 text-amber-700",
  submitted: "bg-blue-50 text-blue-700",
  returned: "bg-orange-50 text-orange-700",
  due_soon: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  completed_late: "bg-emerald-50 text-emerald-700",
  approved: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  overdue: "bg-red-50 text-red-700",
};

export function NavButton({ active, icon, children, onClick }: { active: boolean; icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className={clsx("mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-bold whitespace-nowrap", active ? "bg-[#214b74] text-white" : "text-slate-700 hover:bg-slate-100")}>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}

export function PageTitle({ title, desc, action }: { title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-2xl font-black">{title}</h2>
        {desc ? <p className="mt-1 text-sm text-slate-600">{desc}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Panel({
  title,
  icon,
  children,
  action,
  className,
  headerClassName,
  bodyClassName,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={clsx("mb-5 rounded-lg border border-slate-200 bg-white", className)}>
      <div className={clsx("flex items-center justify-between gap-3 border-b px-4 py-3 font-black text-[#214b74]", headerClassName)}>
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate">{title}</span>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={clsx("p-4", bodyClassName)}>{children}</div>
    </div>
  );
}

export function Stat({ label, value, icon, tone = "blue", active, onClick }: { label: string; value: number; icon?: ReactNode; tone?: "blue" | "amber" | "red" | "slate"; active?: boolean; onClick?: () => void }) {
  const toneClass = {
    amber: active ? "border-amber-400 bg-amber-50 ring-2 ring-amber-200" : "border-amber-200 bg-amber-50",
    blue: active ? "border-blue-400 bg-blue-50 ring-2 ring-blue-200" : "border-blue-200 bg-blue-50",
    red: active ? "border-red-400 bg-red-50 ring-2 ring-red-200" : "border-red-200 bg-red-50",
    slate: active ? "border-slate-400 bg-white ring-2 ring-slate-200" : "border-slate-200 bg-white",
  }[tone];
  const className = clsx(
    "rounded-lg border p-4 text-left transition-[border-color,box-shadow,transform] duration-150",
    onClick ? "w-full hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300" : "",
    toneClass,
  );

  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className={clsx("text-sm font-bold", active ? "text-slate-900" : "text-slate-600")}>{label}</p>
        {icon ? <span className={clsx(active ? "text-blue-700" : "text-[#214b74]")}>{icon}</span> : null}
      </div>
      <p className="mt-1 text-3xl font-black">{value}</p>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-pressed={active}>
        {content}
      </button>
    );
  }

  return (
    <div className={className}>
      {content}
    </div>
  );
}

export function Status({ status }: { status: DisplayStatus | AssignmentStatus }) {
  const text = status in labels.displayStatus ? labels.displayStatus[status as DisplayStatus] : labels.assignmentStatus[status as AssignmentStatus];
  return <span className={clsx("rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap", statusTone[status])}>{text}</span>;
}

export function Priority({ p }: { p: "normal" | "high" | "urgent" }) {
  return <span className={clsx("rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap", p === "urgent" ? "bg-red-50 text-red-700" : p === "high" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600")}>{labels.priority[p]}</span>;
}

export function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-black">{value}</p>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm font-bold text-slate-500">{text}</div>;
}

export function Loading() {
  return (
    <div className="flex items-center gap-2 p-4 text-sm font-bold text-slate-500">
      <Loader2 className="animate-spin" size={16} /> Đang tải...
    </div>
  );
}

export function Refresh({ onClick }: { onClick: () => Promise<void> | void }) {
  return (
    <button className="icon-text-btn" onClick={() => void onClick()}>
      <RefreshCcw size={16} /> Làm mới
    </button>
  );
}

export function SystemModal({ title, children, onClose, action }: { title: string; children: ReactNode; onClose: () => void; action?: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/40 p-5">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-lg font-black">{title}</h3>
          <button type="button" className="text-sm font-bold text-slate-500" onClick={onClose}>Đóng</button>
        </div>
        <div className="text-sm leading-6 text-slate-700">{children}</div>
        {action ? <div className="mt-5 flex justify-end gap-2">{action}</div> : null}
      </div>
    </div>
  );
}

export function Pager({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (page: number) => void }) {
  const lastPage = Math.max(1, Math.ceil(total / size));
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="font-bold text-slate-500">Tổng {total} dòng · Trang {page}/{lastPage}</span>
      <div className="flex gap-2">
        <button className="icon-text-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>Trước</button>
        <button className="icon-text-btn" disabled={page >= lastPage} onClick={() => onPage(page + 1)}>Sau</button>
      </div>
    </div>
  );
}
