import { useEffect, useMemo, useState } from "react";
import { BarChart3, ListFilter } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, errorMessage } from "../api";
import { labels } from "../labels";
import type { KpiPeriod, KpiResultRow, KpiStatus, KpiSummary } from "../types";
import { Empty, Loading, PageTitle, Panel } from "./shared";
import {
  compactIndicatorName,
  currentKpiMonth,
  findKpiPeriod,
  formatKpiPercent,
  KPI_STATUS_COLORS,
  KPI_STATUS_ORDER,
  kpiMonthName,
  KpiStatusBadge,
  loadKpiPeriods,
  MonthPicker,
  targetGapText,
} from "./KpiShared";

type ChartRow = {
  id: string;
  number: number;
  name: string;
  shortName: string;
  value: number;
  percentage: number | null;
  status: KpiStatus;
  note: string | null;
};

const STATUS_TONE: Record<KpiStatus | "all", string> = {
  all: "border-slate-200 bg-white text-slate-700",
  exceeded: "border-emerald-200 bg-emerald-50 text-emerald-800",
  above_98: "border-lime-200 bg-lime-50 text-lime-800",
  above_68: "border-amber-200 bg-amber-50 text-amber-800",
  above_50: "border-orange-200 bg-orange-50 text-orange-800",
  below_50: "border-red-200 bg-red-50 text-red-800",
  not_entered: "border-slate-200 bg-slate-100 text-slate-600",
};

const STATUS_RANK: Record<KpiStatus, number> = {
  exceeded: 0,
  above_98: 1,
  above_68: 2,
  above_50: 3,
  below_50: 4,
  not_entered: 5,
};

function KpiChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: ChartRow }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const note = row.note?.trim();

  return (
    <div className="max-w-sm rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-lg">
      <p className="text-xs font-black uppercase text-[#214b74]">Chỉ tiêu {row.number}</p>
      <p className="mt-1 font-black text-slate-900">{row.name}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <strong className={row.percentage != null && row.percentage >= 100 ? "text-emerald-700" : "text-red-700"}>
          {formatKpiPercent(row.percentage)}
        </strong>
        <span className="text-xs font-bold text-slate-500">{targetGapText(row.percentage)}</span>
        <KpiStatusBadge status={row.status} />
      </div>
      <p className="mt-2 max-h-24 overflow-y-auto rounded-md bg-slate-50 px-3 py-2 text-xs font-semibold leading-relaxed text-slate-700">
        {note || "Chưa có ghi chú cho chỉ tiêu này."}
      </p>
    </div>
  );
}

function orderedRows(rows: KpiResultRow[]) {
  return [...rows].sort((a, b) => {
    const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rank !== 0) return rank;
    if (a.percentage === null && b.percentage === null) return a.indicator.number - b.indicator.number;
    if (a.percentage === null) return 1;
    if (b.percentage === null) return -1;
    return b.percentage - a.percentage;
  });
}

export function KpiDisplayView() {
  const currentMonth = currentKpiMonth();
  const [periods, setPeriods] = useState<KpiPeriod[]>([]);
  const [month, setMonth] = useState(currentMonth.month);
  const [year, setYear] = useState(currentMonth.year);
  const [rows, setRows] = useState<KpiResultRow[] | null>(null);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<KpiStatus | "all">("all");
  const [error, setError] = useState("");

  const selectedPeriod = useMemo(() => findKpiPeriod(periods, month, year), [periods, month, year]);
  const selectedName = kpiMonthName(month, year);

  useEffect(() => {
    loadKpiPeriods()
      .then(setPeriods)
      .catch((err) => setError(errorMessage(err, "Không tải được danh sách tháng")));
  }, []);

  useEffect(() => {
    setSelectedStatus("all");
    if (!selectedPeriod) {
      setRows([]);
      setSummary(null);
      return;
    }
    setRows(null);
    setSummary(null);
    setError("");
    Promise.all([
      api<KpiResultRow[]>(`/kpi/periods/${selectedPeriod.id}/results`),
      api<KpiSummary>(`/kpi/periods/${selectedPeriod.id}/summary`),
    ])
      .then(([nextRows, nextSummary]) => {
        setRows(nextRows);
        setSummary(nextSummary);
      })
      .catch((err) => setError(errorMessage(err, "Không tải được dữ liệu hiển thị chỉ tiêu")));
  }, [selectedPeriod?.id, month, year]);

  const allOrderedRows = useMemo(() => orderedRows(rows || []), [rows]);

  const visibleRows = useMemo(() => {
    return selectedStatus === "all" ? allOrderedRows : allOrderedRows.filter((row) => row.status === selectedStatus);
  }, [allOrderedRows, selectedStatus]);

  const chartRows = useMemo<ChartRow[]>(() => allOrderedRows.map((row) => ({
    id: row.indicator.id,
    number: row.indicator.number,
    name: row.indicator.name,
    shortName: `${row.indicator.number}. ${compactIndicatorName(row.indicator.name)}`,
    value: row.percentage ?? 0,
    percentage: row.percentage,
    status: row.status,
    note: row.note,
  })), [allOrderedRows]);

  const maxValue = Math.max(110, ...chartRows.map((row) => row.value)) + 8;

  function countFor(status: KpiStatus | "all") {
    if (status === "all") return summary?.total || 0;
    return summary?.[status] || 0;
  }

  return (
    <section>
      <PageTitle title="Biểu đồ chỉ tiêu" desc="Mặc định xem tháng hiện tại. Thanh ngang so với mốc 100% giúp thấy ngay chỉ tiêu đạt, vượt hoặc còn thiếu." />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-white p-3">
        <MonthPicker periods={periods} month={month} year={year} onMonthChange={setMonth} onYearChange={setYear} />
        <div className="mb-1 text-right text-sm font-bold">
          <p className="text-[#214b74]">Đang xem {selectedName}</p>
          <p className={selectedPeriod ? "text-slate-500" : "text-amber-700"}>{selectedPeriod ? `${selectedPeriod.entered_count}/${selectedPeriod.total_count} chỉ tiêu đã nhập %` : "Tháng này chưa có dữ liệu"}</p>
        </div>
      </div>
      {error ? <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}

      {!rows ? <Loading /> : selectedPeriod && summary ? (
        rows.length ? (
          <>
            <div className="mb-4 grid gap-3 md:grid-cols-3 xl:grid-cols-7">
              {(["all", ...KPI_STATUS_ORDER] as Array<KpiStatus | "all">).map((status) => (
                <button
                  key={status}
                  className={`rounded-lg border p-3 text-left transition hover:shadow-sm ${STATUS_TONE[status]} ${selectedStatus === status ? "ring-2 ring-[#214b74]/20" : ""}`}
                  onClick={() => setSelectedStatus(status)}
                >
                  <p className="text-xs font-black uppercase">{status === "all" ? "Tất cả" : labels.kpiStatus[status]}</p>
                  <p className="mt-1 text-2xl font-black">{countFor(status)}</p>
                </button>
              ))}
            </div>

            <Panel title={selectedStatus === "all" ? `So sánh ${summary.total} chỉ tiêu với mốc 100%` : `Đang làm nổi bật nhóm: ${labels.kpiStatus[selectedStatus]}`} icon={<BarChart3 size={18} />} bodyClassName="h-[780px]">
              <ResponsiveContainer width="100%" height={700}>
                <BarChart data={chartRows} layout="vertical" margin={{ top: 16, right: 58, left: 8, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, maxValue]} tickFormatter={(value) => `${value}%`} />
                  <YAxis type="category" dataKey="shortName" width={220} tick={{ fontSize: 11, fontWeight: 700 }} interval={0} />
                  <ReferenceLine x={100} stroke="#0f172a" strokeDasharray="4 4" label={{ value: "Mốc 100%", position: "top", fill: "#0f172a", fontWeight: 800 }} />
                  <Tooltip
                    content={(props: unknown) => {
                      const tooltip = props as { active?: boolean; payload?: Array<{ payload?: ChartRow }> };
                      return <KpiChartTooltip active={tooltip.active} payload={tooltip.payload} />;
                    }}
                    cursor={{ fill: "rgba(0,0,0,0.04)" }}
                  />
                  <Bar dataKey="value" radius={[0, 5, 5, 0]} isAnimationActive>
                    <LabelList dataKey="percentage" position="right" formatter={(value: number | null) => value == null ? "" : formatKpiPercent(value)} style={{ fontSize: 11, fontWeight: 800, fill: "#334155" }} />
                    {chartRows.map((row) => (
                      <Cell 
                        key={row.id} 
                        fill={KPI_STATUS_COLORS[row.status]} 
                        opacity={selectedStatus === "all" || selectedStatus === row.status ? 1 : 0.15} 
                        className="transition-opacity duration-300"
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap gap-3">
                {KPI_STATUS_ORDER.map((status) => <span key={status} className="flex items-center gap-2 text-xs font-bold text-slate-600"><span className="h-3 w-3 rounded-sm" style={{ background: KPI_STATUS_COLORS[status] }} />{labels.kpiStatus[status]}</span>)}
              </div>
            </Panel>

            <Panel title={selectedStatus === "all" ? "Chi tiết theo thứ tự biểu đồ" : `Chi tiết: ${labels.kpiStatus[selectedStatus]}`} icon={<ListFilter size={18} />}>
              {visibleRows.length ? (
                <div className="grid gap-2">
                  {visibleRows.map((row) => (
                    <div key={row.indicator.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-black">Chỉ tiêu {row.indicator.number}: {row.indicator.name}</p>
                          <p className="mt-1 text-sm text-slate-500">{row.indicator.description || "Chưa có mô tả"}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <strong className={row.percentage != null && row.percentage >= 100 ? "text-emerald-700" : "text-red-700"}>{formatKpiPercent(row.percentage)}</strong>
                          <span className="text-xs font-bold text-slate-500">{targetGapText(row.percentage)}</span>
                          <KpiStatusBadge status={row.status} />
                        </div>
                      </div>
                      {row.note ? <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">{row.note}</p> : null}
                    </div>
                  ))}
                </div>
              ) : <Empty text="Không có chỉ tiêu trong nhóm này." />}
            </Panel>
          </>
        ) : <Empty text={`Chưa có dữ liệu chỉ tiêu cho ${selectedName}.`} />
      ) : <Empty text={`Chưa có dữ liệu chỉ tiêu cho ${selectedName}.`} />}
    </section>
  );
}
