import { useEffect, useState, useMemo } from "react";
import { 
  BellRing, 
  Mail, 
  Play, 
  RefreshCcw, 
  Users, 
  UserCog, 
  Settings, 
  FileSpreadsheet, 
  Send, 
  Eye, 
  AlertCircle, 
  CheckCircle2, 
  XCircle,
  Clock
} from "lucide-react";
import { api, errorMessage } from "../api";
import type { EmailLog, ReminderSettings } from "../types";
import { Empty, Loading, PageTitle, SystemModal } from "./shared";

function asBool(value: boolean | string | undefined) {
  return value === true || value === "true";
}

function previewSummary(result: any) {
  if (!result) return "";
  if ("sendable" in result) {
    const sendable = Number(result.sendable || 0);
    if (sendable === 0) return "Không có email nào cần gửi. Tổng số văn bản đã quét: " + (result.total || 0) + ".";
    return `Sẽ gửi ${sendable} email nhắc nhở. Tổng số văn bản đã quét: ${result.total || 0}.`;
  }
  if ("subject" in result) return `Sẽ gửi 1 email với tiêu đề: ${result.subject}`;
  return "Hệ thống đã sẵn sàng xử lý gửi.";
}

function canSend(result: any) {
  if (!result) return true;
  if ("sendable" in result) return Number(result.sendable || 0) > 0;
  return true;
}

const eventTypeLabels: Record<string, string> = {
  smtp_test: "Kiểm tra kết nối SMTP",
  account_created: "Tạo tài khoản mới",
  password_reset: "Đặt lại mật khẩu",
  assignment_created: "Giao việc mới",
  assignment_submitted: "Gửi chờ duyệt",
  assignment_approved: "Duyệt kết quả",
  assignment_returned: "Trả về kết quả",
  staff_due_soon: "Nhắc việc sắp đến hạn",
  staff_urgent: "Nhắc việc rất gấp (1 ngày)",
  staff_overdue: "Nhắc việc đã quá hạn",
  manager_digest: "Tổng hợp công việc hàng ngày",
  manager_weekly_report: "Báo cáo tiến độ tuần",
  manager_monthly_report: "Báo cáo tiến độ tháng",
  document_deleted: "Thu hồi văn bản",
};

interface ToggleProps {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}

function ToggleSwitch({ checked, onChange, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`${
        checked ? "bg-[#214b74]" : "bg-slate-200"
      } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#214b74] focus:ring-offset-2 disabled:opacity-50`}
    >
      <span
        className={`${
          checked ? "translate-x-5" : "translate-x-0"
        } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
      />
    </button>
  );
}

export function RemindersView() {
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [preview, setPreview] = useState<any | null>(null);
  const [confirm, setConfirm] = useState<{ label: string; path: string; preview: any } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [testEmail, setTestEmail] = useState("");

  // UI Navigation & Filters
  const [activeTab, setActiveTab] = useState<"settings" | "manual" | "logs">("settings");
  const [logFilter, setLogFilter] = useState<"all" | "sent" | "failed" | "pending">("all");
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);

  async function load() {
    try {
      setError("");
      setSettings(await api<ReminderSettings>("/reminders/settings"));
      setLogs(await api<EmailLog[]>("/reminders/email-logs"));
    } catch (err) {
      setError(errorMessage(err, "Không tải được cấu hình nhắc hẹn."));
    }
  }

  useEffect(() => { void load(); }, []);

  async function save() {
    if (!settings) return;
    setError("");
    setIsSaving(true);
    try {
      await api("/reminders/settings", { 
        method: "PUT", 
        body: JSON.stringify({
          staff_reminder_enabled: asBool(settings.staff_reminder_enabled),
          staff_reminder_time: settings.staff_reminder_time,
          staff_due_soon_days: Number(settings.staff_due_soon_days),
          staff_urgent_enabled: asBool(settings.staff_urgent_enabled),
          staff_overdue_enabled: asBool(settings.staff_overdue_enabled),
          manager_digest_enabled: asBool(settings.manager_digest_enabled),
          manager_digest_time: settings.manager_digest_time,
          manager_report_mode: settings.manager_report_mode,
          manager_report_time: settings.manager_report_time,
        }) 
      });
      setNotice("Đã lưu cấu hình nhắc hẹn thành công.");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Không lưu được cấu hình nhắc hẹn."));
    } finally {
      setIsSaving(false);
    }
  }

  async function action(path: string, label: string) {
    setError("");
    try {
      const result = await api<any>(path, { method: "POST" });
      setPreview({ label, result });
      await load();
    } catch (err) {
      setError(errorMessage(err, `Không thực hiện xem trước được: ${label}`));
    }
  }

  async function prepareRun(path: string, label: string, previewPath: string) {
    setError("");
    try {
      const result = await api<any>(previewPath, { method: "POST" });
      setConfirm({ label, path, preview: result });
    } catch (err) {
      setError(errorMessage(err, `Không tải được danh sách gửi: ${label}`));
    }
  }

  async function confirmRun() {
    if (!confirm) return;
    setError("");
    try {
      const result = await api<any>(confirm.path, { method: "POST" });
      setPreview({ label: confirm.label, result });
      setConfirm(null);
      setNotice(`Đã thực hiện tiến trình gửi thành công: ${confirm.label}.`);
      await load();
    } catch (err) {
      setError(errorMessage(err, `Không gửi được email: ${confirm.label}`));
    }
  }

  async function sendTestEmail() {
    setError("");
    setIsSendingTest(true);
    try {
      const result = await api<any>("/reminders/email-test", { 
        method: "POST", 
        body: JSON.stringify(testEmail.trim() ? { to_email: testEmail.trim() } : {}) 
      });
      setPreview({ label: "Gửi email kiểm tra kết nối", result });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Không gửi được email kiểm tra kết nối SMTP."));
    } finally {
      setIsSendingTest(false);
    }
  }

  const filteredLogs = useMemo(() => {
    if (logFilter === "all") return logs;
    return logs.filter(log => log.status === logFilter);
  }, [logs, logFilter]);

  if (!settings) {
    return (
      <section className="space-y-4">
        <PageTitle 
          title="Nhắc hẹn & Báo cáo" 
          desc="Cấu hình hệ thống gửi nhắc hạn công việc tự động cho nhân viên và gửi báo cáo tiến độ tổng hợp cho quản lý." 
          action={<button className="icon-text-btn bg-white font-bold" onClick={load}><RefreshCcw size={16} /> Làm mới</button>} 
        />
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 flex items-center justify-center">
          {error ? <div className="text-rose-600 font-bold text-sm">Lỗi: {error}</div> : <Loading />}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <PageTitle 
        title="Nhắc hẹn & Báo cáo" 
        desc="Cấu hình hệ thống gửi nhắc hạn công việc tự động cho nhân viên và gửi báo cáo tiến độ tổng hợp cho quản lý." 
        action={<button className="icon-text-btn bg-white font-bold" onClick={load}><RefreshCcw size={16} /> Làm mới</button>} 
      />

      {notice ? (
        <div className="flex justify-between items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 shadow-sm transition-all">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600" />
            <span>{notice}</span>
          </div>
          <button className="text-emerald-600 hover:text-emerald-950 font-bold" onClick={() => setNotice("")}>Đóng</button>
        </div>
      ) : null}

      {error ? (
        <div className="flex justify-between items-center rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800 shadow-sm transition-all">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-600" />
            <span>{error}</span>
          </div>
          <button className="text-rose-600 hover:text-rose-950 font-bold" onClick={() => setError("")}>Đóng</button>
        </div>
      ) : null}

      {/* Modern Tabs Navigation */}
      <div className="flex border-b border-slate-200 gap-1">
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex items-center gap-2 pb-3 pt-2 px-4 text-sm font-bold border-b-2 transition-all duration-150 ${
            activeTab === "settings"
              ? "border-[#214b74] text-[#214b74]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Settings size={16} /> Cấu hình tự động
        </button>
        <button
          onClick={() => setActiveTab("manual")}
          className={`flex items-center gap-2 pb-3 pt-2 px-4 text-sm font-bold border-b-2 transition-all duration-150 ${
            activeTab === "manual"
              ? "border-[#214b74] text-[#214b74]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Play size={16} /> Hành động thủ công
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          className={`flex items-center gap-2 pb-3 pt-2 px-4 text-sm font-bold border-b-2 transition-all duration-150 ${
            activeTab === "logs"
              ? "border-[#214b74] text-[#214b74]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Mail size={16} /> Lịch sử gửi email
        </button>
      </div>

      {/* Tab 1: Cấu hình tự động */}
      {activeTab === "settings" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Settings Panels Column */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Nhắc nhở nhân viên */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-blue-700 rounded-lg">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Nhắc nhân viên xử lý văn bản</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Tự động gửi email thông báo công việc sắp đến hạn hoặc quá hạn cho nhân viên.</p>
                </div>
              </div>
              
              <div className="p-5 space-y-5">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100">
                  <div>
                    <h4 className="font-bold text-slate-700 text-sm">Bật nhắc tự động</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Cho phép hệ thống quét và gửi email nhắc nhở nhân viên hàng ngày.</p>
                  </div>
                  <ToggleSwitch
                    checked={asBool(settings.staff_reminder_enabled)}
                    onChange={(val) => setSettings({ ...settings, staff_reminder_enabled: val })}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Giờ quét nhắc hàng ngày</label>
                    <input 
                      className="field w-full mt-1" 
                      type="time" 
                      value={settings.staff_reminder_time} 
                      onChange={(e) => setSettings({ ...settings, staff_reminder_time: e.target.value })} 
                      disabled={!asBool(settings.staff_reminder_enabled)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nhắc trước hạn (số ngày)</label>
                    <input 
                      className="field w-full" 
                      type="number" 
                      min={1} 
                      max={30} 
                      value={settings.staff_due_soon_days} 
                      onChange={(e) => setSettings({ ...settings, staff_due_soon_days: e.target.value })}
                      disabled={!asBool(settings.staff_reminder_enabled)}
                    />
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-700 text-sm">Nhắc nhở gấp (còn 1 ngày)</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Gửi email cảnh báo gấp khi hạn xử lý công việc chỉ còn lại đúng 1 ngày.</p>
                    </div>
                    <ToggleSwitch
                      checked={asBool(settings.staff_urgent_enabled)}
                      onChange={(val) => setSettings({ ...settings, staff_urgent_enabled: val })}
                      disabled={!asBool(settings.staff_reminder_enabled)}
                    />
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-50 pt-4">
                    <div>
                      <h4 className="font-bold text-slate-700 text-sm">Nhắc nhở công việc đã quá hạn</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Tiếp tục quét và nhắc việc hàng ngày nếu công việc đã bị trễ hạn hoàn thành.</p>
                    </div>
                    <ToggleSwitch
                      checked={asBool(settings.staff_overdue_enabled)}
                      onChange={(val) => setSettings({ ...settings, staff_overdue_enabled: val })}
                      disabled={!asBool(settings.staff_reminder_enabled)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Tổng hợp cho quản lý */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                <div className="p-2 bg-amber-50 text-amber-700 rounded-lg">
                  <UserCog size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Tổng hợp & Báo cáo cho Quản lý</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Cấu hình gửi email tổng hợp hàng ngày và báo cáo định kỳ cho các cấp quản lý.</p>
                </div>
              </div>
              
              <div className="p-5 space-y-5">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100">
                  <div>
                    <h4 className="font-bold text-slate-700 text-sm">Bật tổng hợp hàng ngày (Digest)</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Gửi email tóm tắt các văn bản cần chú ý của phòng ban cho Quản lý vào cuối ngày.</p>
                  </div>
                  <ToggleSwitch
                    checked={asBool(settings.manager_digest_enabled)}
                    onChange={(val) => setSettings({ ...settings, manager_digest_enabled: val })}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Giờ gửi tổng hợp hàng ngày</label>
                    <input 
                      className="field w-full mt-1" 
                      type="time" 
                      value={settings.manager_digest_time} 
                      onChange={(e) => setSettings({ ...settings, manager_digest_time: e.target.value })}
                      disabled={!asBool(settings.manager_digest_enabled)}
                    />
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Chế độ báo cáo thống kê định kỳ</label>
                      <select 
                        className="field w-full mt-1" 
                        value={settings.manager_report_mode} 
                        onChange={(e) => setSettings({ ...settings, manager_report_mode: e.target.value })}
                      >
                        <option value="off">Tắt báo cáo định kỳ</option>
                        <option value="weekly">Hàng tuần (Gửi vào sáng thứ Hai)</option>
                        <option value="monthly">Hàng tháng (Gửi vào sáng ngày 1)</option>
                        <option value="both">Cả hàng tuần và hàng tháng</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Giờ gửi báo cáo định kỳ</label>
                      <input 
                        className="field w-full mt-1" 
                        type="time" 
                        value={settings.manager_report_time} 
                        onChange={(e) => setSettings({ ...settings, manager_report_time: e.target.value })}
                        disabled={settings.manager_report_mode === "off"}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Save Button */}
            <div className="flex justify-end">
              <button 
                className="primary-btn px-6 py-2.5 font-bold shadow-sm flex items-center gap-2"
                onClick={save}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <RefreshCcw size={16} className="animate-spin" />
                    Đang lưu cấu hình...
                  </>
                ) : (
                  "Lưu cấu hình hệ thống"
                )}
              </button>
            </div>
          </div>

          {/* SMTP Server Information Card */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
                    <Mail size={20} />
                  </div>
                  <h3 className="font-bold text-slate-800 text-base">Cấu hình gửi mail (SMTP)</h3>
                </div>
                
                {/* Glowing Pulse Status Badge */}
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-100 border text-xs font-bold">
                  {settings.email_enabled ? (
                    <>
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span className="text-emerald-700">Đang bật</span>
                    </>
                  ) : (
                    <>
                      <span className="relative flex h-2 w-2">
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                      </span>
                      <span className="text-rose-700">Đang tắt</span>
                    </>
                  )}
                </div>
              </div>
              
              <div className="p-5 space-y-4 text-sm text-slate-600">
                <div className="space-y-3 pb-4 border-b border-slate-100">
                  <div className="flex justify-between">
                    <span className="text-slate-400 text-xs font-bold uppercase">Máy chủ SMTP</span>
                    <span className="font-bold text-slate-800">{settings.smtp_host || "Chưa cấu hình"}:{settings.smtp_port}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 text-xs font-bold uppercase">Tên người gửi</span>
                    <span className="font-bold text-slate-800">{settings.smtp_from_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 text-xs font-bold uppercase">Email gửi</span>
                    <span className="font-bold text-slate-800">{settings.smtp_from_email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 text-xs font-bold uppercase">Mã hóa TLS</span>
                    <span className="font-bold text-slate-800">{settings.smtp_use_tls ? "Có (TLS/STARTTLS)" : "Không"}</span>
                  </div>
                </div>

                <div className="bg-amber-50 rounded-lg p-3.5 border border-amber-100 flex gap-2.5 text-xs text-amber-800 leading-relaxed">
                  <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-700" />
                  <p>Các kết nối gửi email SMTP được đọc trực tiếp từ tệp tin cấu hình môi trường <code>.env</code> trên máy chủ. Thay đổi các cài đặt SMTP đòi hỏi quản trị viên phải khởi động lại dịch vụ backend.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Hành động thủ công */}
      {activeTab === "manual" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Card 1: Nhắc nhở nhân viên */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col justify-between">
              <div className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-blue-50 text-blue-700 rounded-lg">
                    <Users size={20} />
                  </div>
                  <h4 className="font-bold text-slate-800 text-base">Nhắc nhở nhân viên ngay</h4>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  Quét nhanh toàn bộ các công việc chưa hoàn tất để lọc ra các văn bản sắp đến hạn, quá hạn hoặc gấp để gửi nhắc nhở lập tức đến nhân sự phụ trách.
                </p>
                <div className="text-[11px] bg-slate-50 border border-slate-100 text-slate-500 rounded p-2.5">
                  <span className="font-bold text-slate-700">Nguyên tắc:</span> Tiến trình tự động ghi log gửi email, tránh gửi email trùng lặp liên tục trong cùng ngày.
                </div>
              </div>
              <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex gap-2 justify-end">
                <button 
                  className="icon-text-btn bg-white hover:bg-slate-50 font-bold"
                  onClick={() => action("/reminders/preview/staff", "Xem trước danh sách nhắc nhở nhân viên")}
                >
                  <Eye size={14} /> Xem trước
                </button>
                <button 
                  className="primary-btn font-bold"
                  onClick={() => prepareRun("/reminders/run/staff", "Gửi nhắc nhở nhân viên ngay", "/reminders/preview/staff")}
                >
                  <Send size={14} /> Gửi nhắc ngay
                </button>
              </div>
            </div>

            {/* Card 2: Digest */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col justify-between">
              <div className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-amber-50 text-amber-700 rounded-lg">
                    <UserCog size={20} />
                  </div>
                  <h4 className="font-bold text-slate-800 text-base">Tổng hợp ngày cho Quản lý</h4>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  Tổng hợp toàn bộ danh sách văn bản cần chú ý (gấp, quá hạn, đến hạn) trong các phòng ban và gửi email báo cáo nhanh cho cấp quản lý phụ trách.
                </p>
                <div className="text-[11px] bg-slate-50 border border-slate-100 text-slate-500 rounded p-2.5">
                  <span className="font-bold text-slate-700">Nguyên tắc:</span> Đóng gói toàn bộ các văn bản cần xử lý trong một email duy nhất gửi cho quản lý để chống spam.
                </div>
              </div>
              <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex gap-2 justify-end">
                <button 
                  className="icon-text-btn bg-white hover:bg-slate-50 font-bold"
                  onClick={() => action("/reminders/preview/manager-digest", "Xem trước tổng hợp hàng ngày cho quản lý")}
                >
                  <Eye size={14} /> Xem trước
                </button>
                <button 
                  className="primary-btn font-bold bg-[#214b74] hover:bg-[#1a3d5f]"
                  onClick={() => prepareRun("/reminders/run/manager-digest", "Gửi email tổng hợp ngày ngay", "/reminders/preview/manager-digest")}
                >
                  <Send size={14} /> Gửi ngay
                </button>
              </div>
            </div>

            {/* Card 3: Báo cáo tuần */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col justify-between">
              <div className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-slate-100 text-slate-700 rounded-lg">
                    <FileSpreadsheet size={20} />
                  </div>
                  <h4 className="font-bold text-slate-800 text-base">Báo cáo tuần cho Quản lý</h4>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  Gửi email báo cáo tiến độ xử lý văn bản (tỷ lệ đúng hạn, trễ hạn, tồn đọng) trong tuần vừa qua cho cấp quản lý để đánh giá hiệu suất.
                </p>
                <div className="text-[11px] bg-slate-50 border border-slate-100 text-slate-500 rounded p-2.5">
                  <span className="font-bold text-slate-700">Chu kỳ dữ liệu:</span> Báo cáo được tính từ Thứ Hai tuần trước 00:00 đến thời điểm bấm nút chạy.
                </div>
              </div>
              <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex gap-2 justify-end">
                <button 
                  className="icon-text-btn bg-white hover:bg-slate-50 font-bold"
                  onClick={() => action("/reminders/preview/weekly-report", "Xem trước báo cáo tuần cho quản lý")}
                >
                  <Eye size={14} /> Xem trước
                </button>
                <button 
                  className="primary-btn font-bold bg-[#214b74] hover:bg-[#1a3d5f]"
                  onClick={() => prepareRun("/reminders/run/weekly-report", "Gửi báo cáo tuần ngay", "/reminders/preview/weekly-report")}
                >
                  <Send size={14} /> Gửi ngay
                </button>
              </div>
            </div>

            {/* Card 4: Báo cáo tháng */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col justify-between">
              <div className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-slate-100 text-slate-700 rounded-lg">
                    <FileSpreadsheet size={20} />
                  </div>
                  <h4 className="font-bold text-slate-800 text-base">Báo cáo tháng cho Quản lý</h4>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  Gửi email báo cáo thống kê tình hình tiếp nhận và giải quyết văn bản trong tháng vừa qua cho cấp quản lý phục vụ cuộc họp tổng kết.
                </p>
                <div className="text-[11px] bg-slate-50 border border-slate-100 text-slate-500 rounded p-2.5">
                  <span className="font-bold text-slate-700">Chu kỳ dữ liệu:</span> Báo cáo tính từ Ngày 1 tháng trước 00:00 đến thời điểm bấm nút chạy.
                </div>
              </div>
              <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex gap-2 justify-end">
                <button 
                  className="icon-text-btn bg-white hover:bg-slate-50 font-bold"
                  onClick={() => action("/reminders/preview/monthly-report", "Xem trước báo cáo tháng cho quản lý")}
                >
                  <Eye size={14} /> Xem trước
                </button>
                <button 
                  className="primary-btn font-bold bg-[#214b74] hover:bg-[#1a3d5f]"
                  onClick={() => prepareRun("/reminders/run/monthly-report", "Gửi báo cáo tháng ngay", "/reminders/preview/monthly-report")}
                >
                  <Send size={14} /> Gửi ngay
                </button>
              </div>
            </div>
          </div>

          {/* Test connection tool */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden max-w-xl">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
              <div className="p-2 bg-blue-50 text-blue-700 rounded-lg">
                <Send size={18} />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 text-sm">Kiểm tra kết nối gửi thử email</h4>
                <p className="text-xs text-slate-500">Nhập địa chỉ email bất kỳ để gửi thử một email thử nghiệm, giúp xác nhận kết nối SMTP hoạt động tốt.</p>
              </div>
            </div>
            <div className="p-5 flex items-center gap-3">
              <input 
                className="field flex-1" 
                type="email" 
                placeholder="Email nhận thử (để trống = email cá nhân của bạn)" 
                value={testEmail} 
                onChange={(e) => setTestEmail(e.target.value)} 
              />
              <button 
                className="primary-btn shrink-0 flex items-center gap-2 font-bold font-semibold" 
                onClick={sendTestEmail}
                disabled={isSendingTest}
              >
                {isSendingTest ? (
                  <>
                    <RefreshCcw size={14} className="animate-spin" />
                    Đang gửi...
                  </>
                ) : (
                  <>
                    <Send size={14} /> Gửi thử
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Lịch sử gửi email */}
      {activeTab === "logs" && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Quick status filters */}
          <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 bg-slate-50">
            <div className="flex gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
              <button 
                onClick={() => setLogFilter("all")}
                className={`px-3 py-1.5 rounded-md font-bold transition-all ${logFilter === "all" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                Tất cả logs
              </button>
              <button 
                onClick={() => setLogFilter("sent")}
                className={`px-3 py-1.5 rounded-md font-bold transition-all ${logFilter === "sent" ? "bg-emerald-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                Gửi thành công
              </button>
              <button 
                onClick={() => setLogFilter("failed")}
                className={`px-3 py-1.5 rounded-md font-bold transition-all ${logFilter === "failed" ? "bg-rose-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                Gửi thất bại
              </button>
              <button 
                onClick={() => setLogFilter("pending")}
                className={`px-3 py-1.5 rounded-md font-bold transition-all ${logFilter === "pending" ? "bg-amber-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                Đang chờ
              </button>
            </div>

            <button 
              className="icon-text-btn bg-white hover:bg-slate-50"
              onClick={load}
            >
              <RefreshCcw size={14} /> Làm mới lịch sử
            </button>
          </div>

          {/* Logs Table */}
          <div className="thin-scrollbar overflow-auto">
            <table className="w-full min-w-[900px] text-sm text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider">
                  <th className="px-5 py-3.5">Thời gian gửi</th>
                  <th className="px-5 py-3.5">Loại email</th>
                  <th className="px-5 py-3.5">Địa chỉ người nhận</th>
                  <th className="px-5 py-3.5">Tiêu đề Email</th>
                  <th className="px-5 py-3.5">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                      {log.sent_at || log.created_at}
                    </td>
                    <td className="px-5 py-3.5 text-xs font-bold text-slate-700">
                      {eventTypeLabels[log.event_type] || log.event_type}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600 font-medium">
                      {log.recipient_email}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-800 font-semibold max-w-[320px] truncate" title={log.subject}>
                      {log.subject}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {log.status === "sent" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                          <CheckCircle2 size={12} className="text-emerald-500" /> Đã gửi
                        </span>
                      ) : log.status === "failed" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 border border-rose-200">
                          <XCircle size={12} className="text-rose-500" /> Thất bại
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 border border-amber-200">
                          <Clock size={12} className="text-amber-500" /> Đang chờ
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredLogs.length ? (
              <div className="py-12">
                <Empty text="Không tìm thấy bản ghi lịch sử gửi email nào." />
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Modal 1: Live Interactive Previews */}
      {preview ? (
        <SystemModal 
          title={preview.label} 
          onClose={() => setPreview(null)} 
          action={<button className="primary-btn font-bold px-5" onClick={() => setPreview(null)}>Đóng</button>}
        >
          {preview.result.sent !== undefined ? (
            <div className="p-6 text-center space-y-4">
              {preview.result.sent ? (
                <>
                  <div className="w-16 h-16 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center mx-auto text-emerald-500 shadow-sm">
                    <CheckCircle2 size={32} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-lg">Gửi email kiểm tra thành công!</h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Email thử nghiệm đã được chuyển đi thành công đến địa chỉ:
                    </p>
                    <p className="text-sm font-bold text-[#214b74] mt-2 bg-slate-50 px-3 py-1.5 rounded-lg inline-block border">
                      {preview.result.to_email}
                    </p>
                    <div className="bg-amber-50 rounded-lg p-3.5 border border-amber-100 flex gap-2 text-xs text-amber-800 text-left mt-4 leading-relaxed">
                      <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-700" />
                      <p>Lưu ý: Nếu không thấy thư trong Hộp thư đến, vui lòng kiểm tra kỹ trong thư mục <strong>Thư rác (Spam)</strong> hoặc <strong>Danh mục quảng cáo</strong>. Do email tự động từ localhost chưa được cấu hình tên miền DKIM/SPF đầy đủ, các bộ lọc của Google thường phân loại thư vào đây.</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-rose-50 border border-rose-200 rounded-full flex items-center justify-center mx-auto text-rose-500 shadow-sm">
                    <XCircle size={32} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-lg">Gửi email kiểm tra thất bại</h4>
                    <p className="text-xs text-rose-600 mt-1 font-semibold">
                      Không thể chuyển email qua máy chủ SMTP.
                    </p>
                    <div className="text-xs text-slate-500 mt-3 text-left leading-relaxed space-y-2 bg-slate-50 p-3 rounded-lg border">
                      <p className="font-bold text-slate-700">Vui lòng kiểm tra lại:</p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>Đảm bảo địa chỉ email nhận chính xác.</li>
                        <li>Thông số cấu hình SMTP trong tệp <code>.env</code>.</li>
                        <li>Sử dụng <strong>Mật khẩu ứng dụng (App Password)</strong> gồm 16 ký tự, không dùng mật khẩu tài khoản Gmail chính.</li>
                      </ul>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : preview.result.html ? (
            <div className="space-y-4">
              {preview.result.period && (
                <div className="text-xs bg-slate-50 border rounded-lg p-3 text-slate-600 flex items-center justify-between">
                  <span><strong>Kỳ thống kê báo cáo:</strong> {preview.result.period}</span>
                  {preview.result.total !== undefined && <span><strong>Tổng số văn bản:</strong> {preview.result.total}</span>}
                </div>
              )}
              
              {/* Mail client mock frame */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-slate-50">
                <div className="bg-slate-100 border-b border-slate-200 px-4 py-3 text-xs space-y-1.5">
                  <div className="flex text-slate-500"><span className="w-20 font-bold shrink-0">Người gửi:</span> <span className="text-slate-800 font-semibold">{settings.smtp_from_name} &lt;{settings.smtp_from_email}&gt;</span></div>
                  <div className="flex text-slate-500"><span className="w-20 font-bold shrink-0">Người nhận:</span> <span className="text-slate-800 font-semibold">{preview.result.to_email || "Địa chỉ email của quản lý"}</span></div>
                  <div className="flex text-slate-500"><span className="w-20 font-bold shrink-0">Tiêu đề:</span> <span className="text-slate-800 font-bold">{preview.result.subject || "Thông báo từ hệ thống quản lý văn bản"}</span></div>
                </div>
                
                <div className="p-1 bg-white">
                  <iframe
                    title="Mẫu email xem trước"
                    srcDoc={preview.result.html}
                    className="w-full h-[360px] border-0 bg-white"
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>
            </div>
          ) : preview.result.items && preview.result.items.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                <AlertCircle size={16} className="text-blue-500" />
                Tìm thấy {preview.result.items.length} công việc cần gửi nhắc nhở:
              </p>
              <div className="thin-scrollbar max-h-[350px] overflow-auto rounded-xl border border-slate-200 shadow-sm">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b font-bold text-slate-600">
                      <th className="px-4 py-2.5">Người nhận</th>
                      <th className="px-4 py-2.5">Văn bản giao việc</th>
                      <th className="px-4 py-2.5">Hạn xử lý</th>
                      <th className="px-4 py-2.5 text-right">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {preview.result.items.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-800">{item.recipient_name}</div>
                          <div className="text-[10px] text-slate-400 font-medium">{item.recipient_email}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 font-medium max-w-[260px] truncate" title={item.document_title}>
                          {item.document_title}
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap font-medium">
                          {item.due_at_display}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`inline-flex px-2.5 py-0.5 rounded text-[10px] font-bold ${item.already_sent 
                            ? "bg-slate-100 text-slate-500 border border-slate-200" 
                            : "bg-blue-50 text-blue-700 border border-blue-200"
                          }`}>
                            {item.already_sent ? "Đã gửi hôm nay" : "Sẽ gửi nhắc"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 p-8 text-center border border-slate-200 border-dashed">
              <AlertCircle size={24} className="text-slate-400 mx-auto mb-2" />
              <p className="font-bold text-slate-500 text-sm">Không có dữ liệu hoặc không tìm thấy email nào phù hợp để gửi.</p>
            </div>
          )}
        </SystemModal>
      ) : null}

      {/* Modal 2: Confirmation Box */}
      {confirm ? (
        <SystemModal 
          title="Xác nhận gửi email hệ thống" 
          onClose={() => setConfirm(null)} 
          action={
            <div className="flex gap-2">
              <button className="icon-text-btn bg-white hover:bg-slate-50 font-bold" onClick={() => setConfirm(null)}>Hủy bỏ</button>
              <button 
                className="primary-btn font-bold px-5" 
                disabled={!canSend(confirm.preview)} 
                onClick={confirmRun}
              >
                Xác nhận & Gửi
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <h4 className="font-bold text-[#214b74] text-base flex items-center gap-1.5">
                <Play size={16} className="text-[#214b74]" /> {confirm.label}
              </h4>
              <p className="text-xs text-[#214b74] font-medium mt-1 leading-relaxed">{previewSummary(confirm.preview)}</p>
            </div>
            
            {confirm.preview.html ? (
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                <div className="bg-slate-100 border-b border-slate-200 px-4 py-2.5 text-xs text-slate-500 font-bold">
                  Xem trước Email sắp gửi:
                </div>
                <div className="p-1 bg-white">
                  <iframe
                    title="Thư xác nhận"
                    srcDoc={confirm.preview.html}
                    className="w-full h-[200px] border-0 bg-white"
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>
            ) : confirm.preview.items && confirm.preview.items.length > 0 ? (
              <div className="max-h-[200px] overflow-auto rounded-xl border border-slate-200 shadow-sm bg-slate-50">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b font-bold text-slate-600">
                      <th className="px-3 py-2">Người nhận</th>
                      <th className="px-3 py-2">Văn bản</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {confirm.preview.items.filter((item: any) => !item.already_sent).map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-bold text-slate-800">{item.recipient_name}</td>
                        <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate">{item.document_title}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </SystemModal>
      ) : null}
    </section>
  );
}
