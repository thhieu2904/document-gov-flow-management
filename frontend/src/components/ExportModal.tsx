import { useState } from "react";
import { Download, X } from "lucide-react";
import { apiDownload, errorMessage } from "../api";
import { Panel } from "./shared";

type Period = "week" | "month" | "custom" | "all";

export function ExportModal({
  onClose,
  scope,
  sortBy,
  sortDir,
  search,
  statuses,
  priorities,
}: {
  onClose: () => void;
  scope: string;
  sortBy: string;
  sortDir: string;
  search: string;
  statuses: string[];
  priorities: string[];
}) {
  const [period, setPeriod] = useState<Period>("all");
  const [anchorDate, setAnchorDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [keepFilters, setKeepFilters] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  function getWeekRange(dateString: string) {
    const start = new Date(dateString);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `${start.toLocaleDateString("vi-VN")} đến ${end.toLocaleDateString("vi-VN")}`;
  }

  function getMonthRange(dateString: string) {
    const d = new Date(dateString);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return `${start.toLocaleDateString("vi-VN")} đến ${end.toLocaleDateString("vi-VN")}`;
  }

  async function handleExport() {
    setExporting(true);
    setError("");
    try {
      const params = new URLSearchParams({ scope, sort_by: sortBy, sort_dir: sortDir });
      
      params.set("period", period);
      if (period === "week" || period === "month") {
        params.set("anchor_date", anchorDate);
      } else if (period === "custom") {
        params.set("start_date", startDate);
        params.set("end_date", endDate);
      }

      if (keepFilters) {
        if (search) params.set("search", search);
        statuses.forEach((item) => params.append("status", item));
        priorities.forEach((item) => params.append("priority", item));
      }

      await apiDownload(`/documents/export?${params.toString()}`, "Danh_sach_van_ban.xlsx");
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Không thể xuất báo cáo Excel."));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Panel
        title="Tùy chọn xuất báo cáo Excel"
        icon={<Download size={18} />}
        className="w-full max-w-lg overflow-hidden shadow-2xl"
        headerClassName="bg-slate-50"
        bodyClassName="p-0"
        action={<button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-200" onClick={onClose} aria-label="Đóng"><X size={20} /></button>}
      >
        <div className="p-4 space-y-5 text-sm">
          {error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</div> : null}
          {/* Thời gian */}
          <div>
            <div className="font-bold mb-3 text-slate-700">1. Chọn khoảng thời gian:</div>
            <div className="space-y-3 pl-2">
              <label className="flex items-center gap-3">
                <input type="radio" name="export-period" className="w-4 h-4" checked={period === "all"} onChange={() => setPeriod("all")} />
                <span>Tất cả thời gian</span>
              </label>

              <label className="flex items-center gap-3">
                <input type="radio" name="export-period" className="w-4 h-4" checked={period === "week"} onChange={() => setPeriod("week")} />
                <span className="w-20">Theo tuần</span>
                <input type="date" className="border rounded px-2 py-1 text-sm flex-1 disabled:opacity-50" value={anchorDate} onChange={e => setAnchorDate(e.target.value)} disabled={period !== "week"} />
              </label>
              {period === "week" && <div className="pl-[108px] text-xs text-emerald-600 italic">Từ {getWeekRange(anchorDate)}</div>}

              <label className="flex items-center gap-3">
                <input type="radio" name="export-period" className="w-4 h-4" checked={period === "month"} onChange={() => setPeriod("month")} />
                <span className="w-20">Theo tháng</span>
                <input type="date" className="border rounded px-2 py-1 text-sm flex-1 disabled:opacity-50" value={anchorDate} onChange={e => setAnchorDate(e.target.value)} disabled={period !== "month"} />
              </label>
              {period === "month" && <div className="pl-[108px] text-xs text-emerald-600 italic">Từ {getMonthRange(anchorDate)}</div>}

              <label className="flex items-start gap-3">
                <input type="radio" name="export-period" className="w-4 h-4 mt-1.5" checked={period === "custom"} onChange={() => setPeriod("custom")} />
                <span className="w-20 mt-1">Tùy chỉnh</span>
                <div className="flex-1 flex items-center gap-2">
                  <input type="date" className="border rounded px-2 py-1 text-sm w-full disabled:opacity-50" value={startDate} onChange={e => setStartDate(e.target.value)} disabled={period !== "custom"} />
                  <span className="text-slate-400">-</span>
                  <input type="date" className="border rounded px-2 py-1 text-sm w-full disabled:opacity-50" value={endDate} onChange={e => setEndDate(e.target.value)} disabled={period !== "custom"} />
                </div>
              </label>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Lọc hiện tại */}
          <div>
            <div className="font-bold mb-2 text-slate-700">2. Áp dụng bộ lọc hiện tại:</div>
            <label className="flex items-start gap-3 pl-2 cursor-pointer mt-2">
              <input type="checkbox" className="w-4 h-4 mt-0.5" checked={keepFilters} onChange={e => setKeepFilters(e.target.checked)} />
              <div>
                <span className="font-medium">Giữ nguyên các bộ lọc Tìm kiếm / Trạng thái</span>
                <div className="text-xs text-slate-500 mt-1">
                  Nếu bỏ chọn, file Excel sẽ xuất toàn bộ dữ liệu trong khoảng thời gian đã chọn mà không áp dụng bộ lọc nào.
                </div>
              </div>
            </label>
          </div>
        </div>
        
        <div className="flex justify-end gap-3 border-t bg-slate-50 p-4">
          <button type="button" className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-slate-200" onClick={onClose} disabled={exporting}>Hủy</button>
          <button type="button" className="flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50" onClick={handleExport} disabled={exporting}>
            <Download size={16} /> {exporting ? "Đang xuất..." : "Xác nhận xuất báo cáo"}
          </button>
        </div>
      </Panel>
    </div>
  );
}
