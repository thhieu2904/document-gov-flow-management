import { useEffect, useState } from "react";
import { BellRing, Mail, Play, RefreshCcw, Users, UserCog } from "lucide-react";
import { api, errorMessage } from "../api";
import type { EmailLog, ReminderSettings } from "../types";
import { Empty, Loading, PageTitle, Panel, SystemModal } from "./shared";

function asBool(value: boolean | string | undefined) {
  return value === true || value === "true";
}

function previewSummary(result: any) {
  if (!result) return "";
  if ("sendable" in result) {
    const sendable = Number(result.sendable || 0);
    if (sendable === 0) return `Không có email nào cần gửi. Tổng đã quét: ${result.total || 0}.`;
    return `Sẽ gửi ${sendable} email. Tổng đã quét: ${result.total || 0}.`;
  }
  if ("subject" in result) return `Sẽ gửi 1 email: ${result.subject}`;
  return "Sẵn sàng gửi.";
}

function canSend(result: any) {
  if (!result) return true;
  if ("sendable" in result) return Number(result.sendable || 0) > 0;
  return true;
}

const eventTypeLabels: Record<string, string> = {
  smtp_test: "Kiểm tra SMTP",
  account_created: "Tạo tài khoản",
  password_reset: "Đặt lại mật khẩu",
  assignment_created: "Giao việc",
  assignment_submitted: "Gửi chờ duyệt",
  assignment_approved: "Duyệt kết quả",
  assignment_returned: "Trả về kết quả",
  staff_due_soon: "Nhắc sắp đến hạn",
  staff_urgent: "Nhắc rất gấp",
  staff_overdue: "Nhắc quá hạn",
  manager_digest: "Tổng hợp hàng ngày",
  manager_weekly_report: "Báo cáo tuần",
  manager_monthly_report: "Báo cáo tháng",
  document_deleted: "Thu hồi văn bản",
};

const statusLabels: Record<string, string> = {
  sent: "Đã gửi",
  failed: "Thất bại",
  pending: "Đang chờ",
};

export function RemindersView() {
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [preview, setPreview] = useState<any | null>(null);
  const [confirm, setConfirm] = useState<{ label: string; path: string; preview: any } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [testEmail, setTestEmail] = useState("");

  async function load() {
    try {
      setError("");
      setSettings(await api<ReminderSettings>("/reminders/settings"));
      setLogs(await api<EmailLog[]>("/reminders/email-logs"));
    } catch (err) {
      setError(errorMessage(err, "Không tải được cấu hình."));
    }
  }

  useEffect(() => { void load(); }, []);

  async function save() {
    if (!settings) return;
    setError("");
    try {
      await api("/reminders/settings", { method: "PUT", body: JSON.stringify({
        staff_reminder_enabled: asBool(settings.staff_reminder_enabled),
        staff_reminder_time: settings.staff_reminder_time,
        staff_due_soon_days: Number(settings.staff_due_soon_days),
        staff_urgent_enabled: asBool(settings.staff_urgent_enabled),
        staff_overdue_enabled: asBool(settings.staff_overdue_enabled),
        manager_digest_enabled: asBool(settings.manager_digest_enabled),
        manager_digest_time: settings.manager_digest_time,
        manager_report_mode: settings.manager_report_mode,
        manager_report_time: settings.manager_report_time,
      }) });
      setNotice("Đã lưu cấu hình.");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Không lưu được cấu hình."));
    }
  }

  async function action(path: string, label: string) {
    setError("");
    try {
      const result = await api<any>(path, { method: "POST" });
      setPreview({ label, result });
      await load();
    } catch (err) {
      setError(errorMessage(err, `Không thực hiện được: ${label}`));
    }
  }

  async function prepareRun(path: string, label: string, previewPath: string) {
    setError("");
    try {
      const result = await api<any>(previewPath, { method: "POST" });
      setConfirm({ label, path, preview: result });
    } catch (err) {
      setError(errorMessage(err, `Không xem trước được: ${label}`));
    }
  }

  async function confirmRun() {
    if (!confirm) return;
    setError("");
    try {
      const result = await api<any>(confirm.path, { method: "POST" });
      setPreview({ label: confirm.label, result });
      setConfirm(null);
      setNotice(`Đã thực hiện: ${confirm.label}.`);
      await load();
    } catch (err) {
      setError(errorMessage(err, `Không gửi được: ${confirm.label}`));
    }
  }

  async function sendTestEmail() {
    setError("");
    try {
      const result = await api<any>("/reminders/email-test", { method: "POST", body: JSON.stringify(testEmail.trim() ? { to_email: testEmail.trim() } : {}) });
      setPreview({ label: "Gửi email kiểm tra", result });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Không gửi được email kiểm tra."));
    }
  }

  if (!settings) {
    return (
      <section>
        <PageTitle title="Nhắc hẹn & Báo cáo" desc="Cấu hình nhắc hạn tự động, tổng hợp hàng ngày và báo cáo định kỳ cho quản lý." action={<button className="icon-text-btn" onClick={load}><RefreshCcw size={16} /> Làm mới</button>} />
        <Panel title="Cấu hình" icon={<BellRing size={18} />}>
          {error ? <Empty text={`Lỗi: ${error}`} /> : <Loading />}
        </Panel>
      </section>
    );
  }

  return (
    <section>
      <PageTitle title="Nhắc hẹn & Báo cáo" desc="Cấu hình nhắc hạn tự động, tổng hợp hàng ngày và báo cáo định kỳ cho quản lý." action={<button className="icon-text-btn" onClick={load}><RefreshCcw size={16} /> Làm mới</button>} />
      {notice ? <div className="mb-4 flex justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-[#214b74]">{notice}<button onClick={() => setNotice("")}>Đóng</button></div> : null}
      {error ? <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</div> : null}

      {/* Row 1: Config + SMTP */}
      <div className="grid grid-cols-[1.2fr_0.8fr] gap-4">
        <div className="space-y-4">
          {/* Nhắc nhân viên */}
          <Panel title="Nhắc nhân viên" icon={<Users size={18} />}>
            <p className="mb-3 text-xs text-slate-500">Hệ thống tự động gửi email nhắc nhân viên mỗi ngày theo giờ cấu hình. Mỗi văn bản chỉ nhắc 1 lần cho mỗi loại.</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 rounded-lg border p-3 text-sm font-bold"><input type="checkbox" checked={asBool(settings.staff_reminder_enabled)} onChange={(e) => setSettings({ ...settings, staff_reminder_enabled: e.target.checked })} /> Bật nhắc tự động</label>
              <label className="text-sm font-bold">Giờ gửi nhắc hàng ngày<input className="field mt-1 w-full" type="time" value={settings.staff_reminder_time} onChange={(e) => setSettings({ ...settings, staff_reminder_time: e.target.value })} /></label>
              <label className="text-sm font-bold">Nhắc trước hạn (số ngày)<input className="field mt-1 w-full" type="number" min={1} max={30} value={settings.staff_due_soon_days} onChange={(e) => setSettings({ ...settings, staff_due_soon_days: e.target.value })} /></label>
              <label className="flex items-center gap-2 rounded-lg border p-3 text-sm font-bold"><input type="checkbox" checked={asBool(settings.staff_urgent_enabled)} onChange={(e) => setSettings({ ...settings, staff_urgent_enabled: e.target.checked })} /> Nhắc khi còn 1 ngày (rất gấp)</label>
              <label className="flex items-center gap-2 rounded-lg border p-3 text-sm font-bold"><input type="checkbox" checked={asBool(settings.staff_overdue_enabled)} onChange={(e) => setSettings({ ...settings, staff_overdue_enabled: e.target.checked })} /> Nhắc khi đã quá hạn</label>
            </div>
          </Panel>

          {/* Tổng hợp cho quản lý */}
          <Panel title="Tổng hợp cho quản lý" icon={<UserCog size={18} />}>
            <p className="mb-3 text-xs text-slate-500">Quản lý nhận email tổng hợp các văn bản cần chú ý hàng ngày, và báo cáo tiến độ theo tuần hoặc tháng.</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 rounded-lg border p-3 text-sm font-bold"><input type="checkbox" checked={asBool(settings.manager_digest_enabled)} onChange={(e) => setSettings({ ...settings, manager_digest_enabled: e.target.checked })} /> Bật tổng hợp hàng ngày</label>
              <label className="text-sm font-bold">Giờ gửi tổng hợp<input className="field mt-1 w-full" type="time" value={settings.manager_digest_time} onChange={(e) => setSettings({ ...settings, manager_digest_time: e.target.value })} /></label>
              <label className="text-sm font-bold">Báo cáo định kỳ<select className="field mt-1 w-full" value={settings.manager_report_mode} onChange={(e) => setSettings({ ...settings, manager_report_mode: e.target.value })}><option value="off">Tắt</option><option value="weekly">Hàng tuần (gửi thứ Hai)</option><option value="monthly">Hàng tháng (gửi ngày 1)</option><option value="both">Cả tuần lẫn tháng</option></select></label>
              <label className="text-sm font-bold">Giờ gửi báo cáo<input className="field mt-1 w-full" type="time" value={settings.manager_report_time} onChange={(e) => setSettings({ ...settings, manager_report_time: e.target.value })} /></label>
            </div>
            <p className="mt-3 text-xs text-slate-500">Nội dung báo cáo luôn tính đến thời điểm gửi email.</p>
          </Panel>

          <div className="flex justify-end"><button className="primary-btn" onClick={save}>Lưu cấu hình</button></div>
        </div>

        {/* SMTP */}
        <Panel title="Cấu hình gửi mail" icon={<Mail size={18} />}>
          <div className="space-y-2 text-sm">
            <p><b>Trạng thái:</b> {settings.email_enabled ? <span className="font-bold text-emerald-600">Đang bật</span> : <span className="font-bold text-red-600">Đang tắt</span>}</p>
            <p><b>Máy chủ SMTP:</b> {settings.smtp_host || "Chưa cấu hình"}:{settings.smtp_port || ""}</p>
            <p><b>Gửi từ:</b> {settings.smtp_from_name} &lt;{settings.smtp_from_email}&gt;</p>
            <p><b>Resend API:</b> {settings.resend_configured ? "Đã cấu hình" : "Chưa cấu hình"}</p>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <input className="field min-w-0 flex-1" type="email" placeholder="Email nhận test (để trống = email bạn)" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
            <button className="primary-btn shrink-0" onClick={sendTestEmail}><Mail size={16} /> Gửi thử</button>
          </div>
          <p className="mt-2 text-xs text-slate-500">Cấu hình SMTP đọc từ file .env trên máy chủ. Thay đổi cần restart backend.</p>
        </Panel>
      </div>

      {/* Row 2: Manual triggers */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Panel title="Chạy thủ công — Nhắc nhân viên" icon={<Users size={18} />}>
          <div className="flex flex-wrap gap-2">
            <button className="icon-text-btn" onClick={() => action("/reminders/preview/staff", "Xem trước nhắc nhân viên")}>Xem trước</button>
            <button className="icon-text-btn" onClick={() => prepareRun("/reminders/run/staff", "Gửi nhắc nhân viên ngay", "/reminders/preview/staff")}>Gửi nhắc ngay</button>
          </div>
        </Panel>
        <Panel title="Chạy thủ công — Quản lý" icon={<UserCog size={18} />}>
          <div className="flex flex-wrap gap-2">
            <button className="icon-text-btn" onClick={() => action("/reminders/preview/manager-digest", "Xem trước tổng hợp hàng ngày")}>Xem trước tổng hợp</button>
            <button className="icon-text-btn" onClick={() => prepareRun("/reminders/run/manager-digest", "Gửi tổng hợp ngay", "/reminders/preview/manager-digest")}>Gửi tổng hợp ngay</button>
            <button className="icon-text-btn" onClick={() => action("/reminders/preview/weekly-report", "Xem trước báo cáo tuần")}>Xem trước báo cáo tuần</button>
            <button className="icon-text-btn" onClick={() => prepareRun("/reminders/run/weekly-report", "Gửi báo cáo tuần ngay", "/reminders/preview/weekly-report")}>Gửi báo cáo tuần ngay</button>
            <button className="icon-text-btn" onClick={() => action("/reminders/preview/monthly-report", "Xem trước báo cáo tháng")}>Xem trước báo cáo tháng</button>
            <button className="icon-text-btn" onClick={() => prepareRun("/reminders/run/monthly-report", "Gửi báo cáo tháng ngay", "/reminders/preview/monthly-report")}>Gửi báo cáo tháng ngay</button>
          </div>
        </Panel>
      </div>

      {/* Row 3: Logs */}
      <div className="mt-4">
        <Panel title="Lịch sử gửi email" icon={<Mail size={18} />}>
          <div className="thin-scrollbar overflow-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead><tr className="bg-[#214b74] text-left text-xs uppercase text-white"><th className="px-3 py-3">Thời gian</th><th className="px-3 py-3">Loại</th><th className="px-3 py-3">Người nhận</th><th className="px-3 py-3">Tiêu đề</th><th className="px-3 py-3">Trạng thái</th></tr></thead>
              <tbody>{logs.map((log) => <tr key={log.id} className="border-b"><td className="px-3 py-3">{log.sent_at || log.created_at}</td><td className="px-3 py-3">{eventTypeLabels[log.event_type] || log.event_type}</td><td className="px-3 py-3">{log.recipient_email}</td><td className="px-3 py-3 font-bold">{log.subject}</td><td className="px-3 py-3">{statusLabels[log.status] || log.status}</td></tr>)}</tbody>
            </table>
            {!logs.length ? <Empty text="Chưa có lịch sử gửi email." /> : null}
          </div>
        </Panel>
      </div>

      {preview ? <SystemModal title={preview.label} onClose={() => setPreview(null)} action={<button className="primary-btn" onClick={() => setPreview(null)}>Đóng</button>}>
        <pre className="thin-scrollbar max-h-[420px] overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-white">{JSON.stringify(preview.result, null, 2)}</pre>
      </SystemModal> : null}
      {confirm ? <SystemModal title="Xác nhận gửi email" onClose={() => setConfirm(null)} action={<>
        <button className="icon-text-btn" onClick={() => setConfirm(null)}>Hủy</button>
        <button className="primary-btn" disabled={!canSend(confirm.preview)} onClick={confirmRun}>Xác nhận gửi</button>
      </>}>
        <p className="font-bold text-slate-900">{confirm.label}</p>
        <p className="mt-2">{previewSummary(confirm.preview)}</p>
        <pre className="thin-scrollbar mt-3 max-h-[260px] overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-white">{JSON.stringify(confirm.preview, null, 2)}</pre>
      </SystemModal> : null}
    </section>
  );
}
