import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Save, Target } from "lucide-react";
import { api, errorMessage } from "../api";
import type { KpiIndicator, KpiPeriod, KpiResultRow, User } from "../types";
import { Empty, Loading, PageTitle, Panel } from "./shared";
import {
  classifyKpiStatus,
  currentKpiMonth,
  findKpiPeriod,
  formatKpiPercent,
  KpiStatusBadge,
  kpiMonthName,
  kpiRowTone,
  loadKpiPeriods,
  MonthPicker,
} from "./KpiShared";

type EditableRow = KpiResultRow & { percentageInput: string; noteInput: string };

function toEditable(row: KpiResultRow): EditableRow {
  return { ...row, percentageInput: row.percentage == null ? "" : String(row.percentage), noteInput: row.note || "" };
}

function indicatorToEditable(indicator: KpiIndicator): EditableRow {
  return {
    id: null,
    indicator: { id: indicator.id, number: indicator.number, name: indicator.name, description: indicator.description },
    department: indicator.department || null,
    percentage: null,
    status: "not_entered",
    status_label: "Chưa đánh giá",
    note: null,
    percentageInput: "",
    noteInput: "",
  };
}

async function createPeriodForMonth(month: number, year: number) {
  return api<KpiPeriod>("/kpi/periods", { method: "POST", body: JSON.stringify({ month, year }) });
}

export function KpiInputView({ currentUser }: { currentUser: User }) {
  const canEdit = currentUser.role === "manager";
  const currentMonth = currentKpiMonth();
  const [periods, setPeriods] = useState<KpiPeriod[]>([]);
  const [month, setMonth] = useState(currentMonth.month);
  const [year, setYear] = useState(currentMonth.year);
  const [rows, setRows] = useState<EditableRow[] | null>(null);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selectedPeriod = useMemo(() => findKpiPeriod(periods, month, year), [periods, month, year]);
  const selectedName = kpiMonthName(month, year);

  async function reloadPeriods() {
    const items = await loadKpiPeriods();
    setPeriods(items);
    return items;
  }

  useEffect(() => {
    reloadPeriods().catch((err) => setError(errorMessage(err, "Không tải được kỳ KPI")));
  }, []);

  useEffect(() => {
    setNotice("");
    setError("");
    setRowsLoading(true);
    const period = selectedPeriod;
    const request = period
      ? api<KpiResultRow[]>(`/kpi/periods/${period.id}/results`).then((items) => items.map(toEditable))
      : api<KpiIndicator[]>("/kpi/indicators").then((items) => items.map(indicatorToEditable));

    request
      .then(setRows)
      .catch((err) => setError(errorMessage(err, "Không tải được dữ liệu chỉ tiêu tháng")))
      .finally(() => setRowsLoading(false));
  }, [selectedPeriod?.id, month, year]);

  function updateRow(indicatorId: string, patch: Partial<EditableRow>) {
    setRows((items) => items?.map((row) => row.indicator.id === indicatorId ? { ...row, ...patch } : row) || null);
  }

  async function ensurePeriod() {
    const existing = findKpiPeriod(periods, month, year);
    if (existing) return existing;
    try {
      return await createPeriodForMonth(month, year);
    } catch (err) {
      const latestPeriods = await reloadPeriods();
      const latest = findKpiPeriod(latestPeriods, month, year);
      if (latest) return latest;
      throw err;
    }
  }

  async function save() {
    if (!canEdit || !rows) return;
    const invalid = rows.find((row) => !row.department);
    if (invalid) {
      setError(`Chỉ tiêu số ${invalid.indicator.number} chưa được gán phòng ban.`);
      return;
    }
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const period = await ensurePeriod();
      await api(`/kpi/periods/${period.id}/results`, {
        method: "PUT",
        body: JSON.stringify({
          results: rows.map((row) => ({
            indicator_id: row.indicator.id,
            department_id: row.department!.id,
            percentage: row.percentageInput.trim() === "" ? null : Number(row.percentageInput),
            note: row.noteInput.trim() || null,
          })),
        }),
      });
      setNotice(`Đã lưu ${period.name}.`);
      await reloadPeriods();
      const nextRows = await api<KpiResultRow[]>(`/kpi/periods/${period.id}/results`);
      setRows(nextRows.map(toEditable));
    } catch (err) {
      setError(errorMessage(err, "Không lưu được chỉ tiêu tháng"));
    } finally {
      setSaving(false);
    }
  }

  const enteredCount = rows?.filter((row) => row.percentageInput.trim() !== "").length || 0;

  return (
    <section>
      <PageTitle
        title="Nhập chỉ tiêu tháng"
        desc="Chọn tháng cần nhập. Tháng chưa có dữ liệu sẽ hiện 21 dòng trống, lưu lần đầu sẽ tự ghi nhận tháng đó."
        action={canEdit ? <button className="primary-btn" disabled={saving || !rows?.length} onClick={() => void save()}><Save size={16} /> {saving ? "Đang lưu..." : "Lưu tháng"}</button> : null}
      />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-white p-3">
        <MonthPicker periods={periods} month={month} year={year} onMonthChange={setMonth} onYearChange={setYear} />
        <div className="mb-1 text-right text-sm font-bold">
          <p className="text-[#214b74]">Đang nhập {selectedName}</p>
          <p className={selectedPeriod ? "text-slate-500" : "text-amber-700"}>{selectedPeriod ? `${selectedPeriod.entered_count}/${selectedPeriod.total_count} chỉ tiêu đã có %` : "Tháng này chưa có dữ liệu, nhập xong bấm lưu"}</p>
        </div>
      </div>
      {notice ? <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{notice}</p> : null}
      {error ? <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
      <Panel title={`Bảng nhập 21 chỉ tiêu - ${enteredCount} dòng có %`} icon={<Target size={18} />}>
        {rowsLoading || !rows ? <Loading /> : rows.length ? (
          <div className="thin-scrollbar overflow-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="bg-[#214b74] text-left text-xs uppercase text-white">
                  <th className="w-14 px-3 py-3">Số</th>
                  <th className="px-3 py-3">Chỉ tiêu</th>
                  <th className="w-32 px-3 py-3">% đạt</th>
                  <th className="w-36 px-3 py-3">Đánh giá</th>
                  <th className="px-3 py-3">Nội dung chi tiết nếu có</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const percentage = row.percentageInput.trim() === "" ? null : Number(row.percentageInput);
                  const status = classifyKpiStatus(percentage);
                  return (
                    <tr key={row.indicator.id} className={clsx("border-b", kpiRowTone(status))}>
                      <td className="px-3 py-3 font-black">{row.indicator.number}</td>
                      <td className="px-3 py-3 font-bold">
                        {row.indicator.name}
                        <div className="line-clamp-2 text-xs font-normal text-slate-500">{row.indicator.description || "-"}</div>
                      </td>
                      <td className="px-3 py-3">
                        {canEdit ? <input className="field w-28" type="number" min={0} step="0.01" value={row.percentageInput} onChange={(event) => updateRow(row.indicator.id, { percentageInput: event.target.value })} /> : <strong>{formatKpiPercent(row.percentage)}</strong>}
                      </td>
                      <td className="px-3 py-3"><KpiStatusBadge status={status} /></td>
                      <td className="px-3 py-3">
                        {canEdit ? <textarea className="field min-h-16 w-full min-w-[420px]" value={row.noteInput} onChange={(event) => updateRow(row.indicator.id, { noteInput: event.target.value })} placeholder="Nhập nội dung để đưa vào báo cáo, nếu có" /> : (row.note || "-")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty text="Chưa có danh mục 21 chỉ tiêu. Hãy chạy seed danh mục chỉ tiêu trước." />}
      </Panel>
    </section>
  );
}
