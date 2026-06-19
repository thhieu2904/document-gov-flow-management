import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileCheck2,
  FileQuestion,
  HardDrive,
  RefreshCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { api, errorMessage } from "../api";
import type { StorageCleanupResult, StorageStats } from "../types";
import { Loading, PageTitle, Panel, SystemModal } from "./shared";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} ${unit}`;
}

function StorageMetric({
  label,
  files,
  bytes,
  icon,
  tone,
}: {
  label: string;
  files: number;
  bytes: number;
  icon: ReactNode;
  tone: "blue" | "green" | "amber" | "red";
}) {
  const toneClasses = {
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-800",
  }[tone];

  return (
    <div className={`rounded-xl border p-4 ${toneClasses}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black">{label}</p>
        {icon}
      </div>
      <p className="mt-3 text-2xl font-black">{formatBytes(bytes)}</p>
      <p className="mt-1 text-xs font-bold opacity-75">{files.toLocaleString("vi-VN")} file</p>
    </div>
  );
}

export function StorageManagementView() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setStats(await api<StorageStats>("/storage/stats"));
    } catch (err) {
      setError(errorMessage(err, "Không tải được thông tin lưu trữ."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function cleanup() {
    setCleaning(true);
    setError("");
    try {
      const result = await api<StorageCleanupResult>("/storage/cleanup", {
        method: "POST",
        body: JSON.stringify({ confirm: true }),
      });
      setStats(result.stats);
      setConfirmCleanup(false);
      setNotice(`Đã xóa ${result.deleted_files.toLocaleString("vi-VN")} file, giải phóng ${formatBytes(result.deleted_size_bytes)}.`);
      if (result.failed_files > 0) {
        setError(`${result.failed_files} file không thể xóa. Vui lòng kiểm tra quyền thư mục lưu trữ.`);
      }
    } catch (err) {
      setError(errorMessage(err, "Không dọn được file không còn tham chiếu."));
    } finally {
      setCleaning(false);
    }
  }

  const protectedOrphans = stats ? stats.orphan_files - stats.cleanup_eligible_files : 0;

  return (
    <section>
      <PageTitle
        title="Quản lý lưu trữ"
        desc="Theo dõi file văn bản trên ổ đĩa và dọn file không còn được cơ sở dữ liệu sử dụng."
        action={
          <button className="icon-text-btn bg-white" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className={loading ? "animate-spin" : ""} size={16} /> Làm mới
          </button>
        }
      />

      {notice ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
          <CheckCircle2 size={18} /> {notice}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} /> <span>{error}</span>
        </div>
      ) : null}

      {loading && !stats ? <Loading /> : null}

      {stats ? (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StorageMetric label="Tổng dung lượng" files={stats.total_files} bytes={stats.total_size_bytes} icon={<HardDrive size={22} />} tone="blue" />
            <StorageMetric label="File hợp lệ" files={stats.referenced_files} bytes={stats.referenced_size_bytes} icon={<FileCheck2 size={22} />} tone="green" />
            <StorageMetric label="File không tham chiếu" files={stats.orphan_files} bytes={stats.orphan_size_bytes} icon={<FileQuestion size={22} />} tone="amber" />
            <StorageMetric label="File đang bị thiếu" files={stats.missing_files} bytes={stats.missing_expected_size_bytes} icon={<Database size={22} />} tone="red" />
          </div>

          <Panel title="Trạng thái lưu trữ" icon={<ShieldCheck size={18} />}>
            <div className="space-y-4">
              <div className={`flex items-start gap-3 rounded-lg border p-4 ${stats.writable ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                {stats.writable ? <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-700" size={20} /> : <AlertTriangle className="mt-0.5 shrink-0 text-red-700" size={20} />}
                <div>
                  <p className="font-black">{stats.writable ? "Backend có quyền ghi file" : "Backend không có quyền ghi file"}</p>
                  <p className="mt-1 text-sm text-slate-600">Kiểm tra lúc {new Date(stats.scanned_at).toLocaleString("vi-VN")}.</p>
                </div>
              </div>

              {stats.missing_files > 0 ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <p className="font-black">Có {stats.missing_files.toLocaleString("vi-VN")} file được ghi trong cơ sở dữ liệu nhưng không còn trên ổ đĩa.</p>
                  <p className="mt-1">Cleanup không xóa hoặc sửa các bản ghi này. Cần kiểm tra backup trước khi xử lý.</p>
                </div>
              ) : null}

              {stats.scan_errors.length > 0 ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <p className="font-black">Không thể quét đầy đủ thư mục lưu trữ.</p>
                  <p className="mt-1">{stats.scan_errors[0]}</p>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 p-4">
                <div>
                  <p className="font-black">Có thể dọn {stats.cleanup_eligible_files.toLocaleString("vi-VN")} file ({formatBytes(stats.cleanup_eligible_size_bytes)})</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Chỉ file không còn tham chiếu và cũ hơn {stats.minimum_orphan_age_hours} giờ mới được xóa.
                    {protectedOrphans > 0 ? ` ${protectedOrphans.toLocaleString("vi-VN")} file mới hơn đang được bảo vệ.` : ""}
                  </p>
                </div>
                <button
                  className="primary-btn bg-red-600 hover:bg-red-700"
                  disabled={stats.cleanup_eligible_files === 0 || cleaning || stats.scan_errors.length > 0}
                  onClick={() => setConfirmCleanup(true)}
                >
                  <Trash2 size={16} /> Dọn file không còn tham chiếu
                </button>
              </div>
            </div>
          </Panel>
        </>
      ) : null}

      {confirmCleanup && stats ? (
        <SystemModal
          title="Xác nhận dọn file"
          onClose={() => setConfirmCleanup(false)}
          action={
            <>
              <button className="icon-text-btn" disabled={cleaning} onClick={() => setConfirmCleanup(false)}>Hủy</button>
              <button className="primary-btn bg-red-600 hover:bg-red-700" disabled={cleaning} onClick={() => void cleanup()}>
                <Trash2 size={16} /> {cleaning ? "Đang dọn..." : "Xóa vĩnh viễn"}
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-700">
            Hệ thống sẽ quét lại và xóa vĩnh viễn tối đa <strong>{stats.cleanup_eligible_files.toLocaleString("vi-VN")} file</strong>, tương đương <strong>{formatBytes(stats.cleanup_eligible_size_bytes)}</strong>.
          </p>
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">Thao tác này không thể hoàn tác.</p>
        </SystemModal>
      ) : null}
    </section>
  );
}