import clsx from "clsx";
import { api } from "../api";
import { labels } from "../labels";
import type { KpiPeriod, KpiStatus } from "../types";

export const KPI_STATUS_ORDER: KpiStatus[] = ["exceeded", "above_98", "above_68", "above_50", "below_50", "not_entered"];

export const KPI_STATUS_COLORS: Record<KpiStatus, string> = {
  exceeded: "#15803d",
  above_98: "#65a30d",
  above_68: "#d97706",
  above_50: "#ea580c",
  below_50: "#dc2626",
  not_entered: "#94a3b8",
};

const statusTone: Record<KpiStatus, string> = {
  exceeded: "bg-emerald-50 text-emerald-800 border-emerald-200",
  above_98: "bg-lime-50 text-lime-800 border-lime-200",
  above_68: "bg-amber-50 text-amber-800 border-amber-200",
  above_50: "bg-orange-50 text-orange-800 border-orange-200",
  below_50: "bg-red-50 text-red-800 border-red-200",
  not_entered: "bg-slate-100 text-slate-600 border-slate-200",
};

export function classifyKpiStatus(percentage: number | null): KpiStatus {
  if (percentage === null || Number.isNaN(percentage)) return "not_entered";
  if (percentage >= 100) return "exceeded";
  if (percentage >= 98) return "above_98";
  if (percentage >= 68) return "above_68";
  if (percentage >= 50) return "above_50";
  return "below_50";
}

export function KpiStatusBadge({ status }: { status: KpiStatus }) {
  return <span className={clsx("inline-flex rounded-full border px-2.5 py-1 text-xs font-bold", statusTone[status])}>{labels.kpiStatus[status]}</span>;
}

export function kpiRowTone(status: KpiStatus) {
  return {
    exceeded: "bg-emerald-50/40 hover:bg-emerald-50",
    above_98: "bg-lime-50/40 hover:bg-lime-50",
    above_68: "bg-amber-50/40 hover:bg-amber-50",
    above_50: "bg-orange-50/40 hover:bg-orange-50",
    below_50: "bg-red-50/40 hover:bg-red-50",
    not_entered: "bg-slate-50 hover:bg-slate-100",
  }[status];
}

export function formatKpiPercent(value: number | null) {
  if (value === null) return "Chưa nhập";
  return `${value.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export async function loadKpiPeriods() {
  return api<KpiPeriod[]>("/kpi/periods");
}

export function currentKpiMonth() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export function findKpiPeriod(periods: KpiPeriod[], month: number, year: number) {
  return periods.find((period) => period.month === month && period.year === year) || null;
}

export function kpiMonthName(month: number, year: number) {
  return `Tháng ${month}/${year}`;
}

export function kpiMonthOptions() {
  return Array.from({ length: 12 }, (_, index) => index + 1);
}

export function kpiYearOptions(periods: KpiPeriod[] = []) {
  const current = currentKpiMonth().year;
  return Array.from(new Set([current - 1, current, current + 1, ...periods.map((period) => period.year)])).sort((a, b) => b - a);
}

export function compactIndicatorName(name: string, max = 34) {
  const compact = name
    .replace(/^phấn đấu\s+/i, "")
    .replace(/^tỷ lệ\s+/i, "")
    .replace(/^tổng\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return compact.length > max ? `${compact.slice(0, max - 3).trim()}...` : compact;
}

export function targetGapText(value: number | null) {
  if (value === null) return "Chưa đánh giá";
  const gap = value - 100;
  if (gap >= 0) return `Vượt ${gap.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} điểm`;
  return `Thiếu ${Math.abs(gap).toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} điểm`;
}

export function MonthPicker({
  periods,
  month,
  year,
  onMonthChange,
  onYearChange,
}: {
  periods: KpiPeriod[];
  month: number;
  year: number;
  onMonthChange: (value: number) => void;
  onYearChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="block text-sm font-bold">Tháng
        <select className="field mt-1 w-36" value={month} onChange={(event) => onMonthChange(Number(event.target.value))}>
          {kpiMonthOptions().map((item) => <option key={item} value={item}>Tháng {item}</option>)}
        </select>
      </label>
      <label className="block text-sm font-bold">Năm
        <select className="field mt-1 w-32" value={year} onChange={(event) => onYearChange(Number(event.target.value))}>
          {kpiYearOptions(periods).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
    </div>
  );
}

export function PeriodSelect({ periods, value, onChange }: { periods: KpiPeriod[]; value: string; onChange: (value: string) => void }) {
  return (
    <select className="field min-w-[220px]" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Chọn kỳ báo cáo</option>
      {periods.map((period) => <option key={period.id} value={period.id}>{period.name} · {period.status === "open" ? "Đang mở" : "Đã đóng"}</option>)}
    </select>
  );
}
