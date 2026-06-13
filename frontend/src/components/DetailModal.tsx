import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { CheckCircle, Clock, FileText, Paperclip, RotateCcw, Send, ThumbsUp, Trash2, Upload, UsersRound, X } from "lucide-react";
import { api, apiDownload, errorMessage } from "../api";
import type { Assignment, AssignmentStatus, Attachment, DisplayStatus, DocumentDetail, User } from "../types";
import { fmtDateTimeSecond, fmtSize, userName } from "../utils";
import { Empty, Panel, Status, SystemModal } from "./shared";

function assignmentDisplayStatus(assignment: Assignment): DisplayStatus | AssignmentStatus {
  if (assignment.status === "approved" && assignment.due_at && assignment.completed_at && new Date(assignment.completed_at).getTime() > new Date(assignment.due_at).getTime()) {
    return "completed_late";
  }
  if (assignment.status === "submitted" || assignment.status === "returned") return assignment.status;
  if (assignment.status !== "approved" && assignment.due_at && new Date(assignment.due_at).getTime() < Date.now()) {
    return "overdue";
  }
  return assignment.status;
}

function lateText(assignment: Assignment) {
  if (assignment.status !== "approved" || !assignment.due_at || !assignment.completed_at) return "";
  return new Date(assignment.completed_at).getTime() > new Date(assignment.due_at).getTime() ? " · Trễ hạn" : " · Đúng hạn";
}

function derivedDocStatus(detail: DocumentDetail) {
  if (detail.status === "completed") return "completed";
  if (detail.status === "submitted") return "submitted";
  if (!detail.assignment_count) return "draft";
  if (detail.due_at && new Date(detail.due_at).getTime() < Date.now()) return "overdue";
  if (detail.due_at) {
    const daysLeft = (new Date(detail.due_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysLeft <= 3) return "due_soon";
  }
  return "in_progress";
}

export function DetailModal({ detail, currentUser, users, onClose, onReload }: { detail: DocumentDetail; currentUser: User; users: User[]; onClose: () => void; onReload: () => Promise<void> }) {
  const myAssignment = detail.assignments.find((item) => item.assignee_id === currentUser.id);
  const originalFiles = detail.attachments.filter((item) => !item.assignment_id);
  const resultFiles = detail.attachments.filter((item) => item.assignment_id != null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const isAssigned = detail.assignment_count > 0;
  const canUploadOriginal = detail.my_permissions.can_update && !isAssigned;
  const docStatus = derivedDocStatus(detail);

  async function deleteDoc() {
    setError("");
    try {
      await api(`/documents/${detail.id}`, { method: "DELETE" });
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Không xóa được văn bản"));
      setConfirmDelete(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-5">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="text-xs font-black uppercase tracking-wider text-[#2b668f]">Chi tiết văn bản</p>
                <Status status={docStatus} />
              </div>
              <h2 className="max-w-4xl text-xl font-black leading-snug text-slate-950">{detail.title}</h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {detail.my_permissions.can_delete ? <button className="icon-text-btn text-red-700" onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Xóa</button> : null}
              <button className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <DetailInfo label="Số hiệu" value={detail.code || "-"} />
            <DetailInfo label="Ban hành" value={fmtDateTimeSecond(detail.issued_at)} icon={<Clock size={15} />} />
            <DetailInfo label="Hạn hoàn thành" value={fmtDateTimeSecond(detail.due_at)} icon={<Clock size={15} />} danger={docStatus === "overdue"} warning={docStatus === "due_soon"} />
            <DetailInfo label="Tiến độ" value={`${detail.completed_count}/${detail.assignment_count}`} icon={<CheckCircle size={15} />} />
          </div>
        </div>

        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-6">
          {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
          {detail.summary ? <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><b className="text-slate-700">Ghi chú:</b> {detail.summary}</div> : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.82fr)]">
            <div className="grid gap-4">
              <Panel title="Tài liệu gốc" icon={<Paperclip size={16} />} className="mb-0" bodyClassName="space-y-3">
                {canUploadOriginal ? <UploadBox documentId={detail.id} onDone={onReload} /> : null}
                {isAssigned && detail.my_permissions.can_update && !canUploadOriginal ? <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">Đã giao việc nên không thể thêm file gốc.</p> : null}
                <AttachmentList files={originalFiles} users={users} emptyText="Chưa có tài liệu gốc." />
              </Panel>

              <Panel title="File kết quả xử lý" icon={<Upload size={16} />} className="mb-0" bodyClassName="space-y-3">
                <AttachmentList files={resultFiles} users={users} emptyText="Nhân viên chưa gửi file kết quả." />
              </Panel>
            </div>

            <Panel title={`Việc được giao (${detail.assignments.length})`} icon={<UsersRound size={16} />} className="mb-0" bodyClassName="space-y-3">
              {detail.assignments.length ? (
                detail.assignments.map((a) => (
                  <div key={a.id} className={clsx("rounded-lg border p-4", a.status === "approved" ? "border-emerald-200 bg-emerald-50/50" : a.status === "returned" ? "border-orange-200 bg-orange-50/40" : assignmentDisplayStatus(a) === "overdue" ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-white")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <b className="block truncate text-sm text-slate-950">{a.assignee?.full_name || userName(users, a.assignee_id)}</b>
                        <p className="mt-1 text-xs font-semibold text-slate-500">Hạn: {fmtDateTimeSecond(a.due_at)}</p>
                      </div>
                      <Status status={assignmentDisplayStatus(a)} />
                    </div>
                    {a.instruction ? <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-700">{a.instruction}</p> : null}
                    {a.result_note ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold leading-5 text-emerald-800">Kết quả: {a.result_note}</p> : null}
                    {a.latest_return_note ? <p className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-xs font-bold leading-5 text-orange-800">Lý do trả về gần nhất: {a.latest_return_note}</p> : null}
                    {a.reviews?.length ? (
                      <div className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-[11px] font-semibold text-slate-500">
                        {a.reviews.slice(0, 3).map((review) => (
                          <p key={review.id}>{review.action === "approved" ? "Duyệt" : "Trả về"} bởi {review.reviewer?.full_name || "quản lý"} lúc {fmtDateTimeSecond(review.created_at)}{review.note ? `: ${review.note}` : ""}</p>
                        ))}
                      </div>
                    ) : null}
                    <p className="mt-3 text-[11px] font-semibold text-slate-500">Duyệt: {fmtDateTimeSecond(a.completed_at)}{lateText(a)}</p>
                    {detail.my_permissions.can_review && a.status === "submitted" ? <ReviewActions assignment={a} onReload={onReload} /> : null}
                  </div>
                ))
              ) : <Empty text="Chưa giao cho ai." />}
            </Panel>
          </div>

          {myAssignment ? <StaffActions assignment={myAssignment} detail={detail} onReload={onReload} /> : null}
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete ? <SystemModal title="Xác nhận thu hồi văn bản" onClose={() => setConfirmDelete(false)} action={<><button className="icon-text-btn" onClick={() => setConfirmDelete(false)}>Hủy</button><button className="primary-btn bg-red-600 hover:bg-red-700" onClick={deleteDoc}>Thu hồi & Xóa</button></>}>
        <p>Xóa vĩnh viễn văn bản <strong>{detail.title}</strong> và toàn bộ file liên quan?</p>
        {isAssigned ? <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">⚠ Văn bản đã giao cho {detail.assignment_count} nhân viên. Họ sẽ nhận email thông báo thu hồi.</p> : null}
        <p className="mt-2 text-sm text-slate-500">Thao tác này không thể hoàn tác.</p>
      </SystemModal> : null}
    </div>
  );
}

function DetailInfo({ label, value, icon, danger, warning }: { label: string; value: string; icon?: ReactNode; danger?: boolean; warning?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-black uppercase text-slate-500">
        {icon ? <span className="text-slate-400">{icon}</span> : null}
        {label}
      </p>
      <p className={clsx("mt-1 truncate text-sm font-black", danger ? "text-red-600" : warning ? "text-amber-600" : "text-slate-900")}>{value}</p>
    </div>
  );
}

function AttachmentList({ files, users, emptyText }: { files: Attachment[]; users: User[]; emptyText: string }) {
  const [error, setError] = useState("");
  if (!files.length) return <Empty text={emptyText} />;
  return (
    <div className="space-y-2">
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p> : null}
      {files.map((a) => {
        const uploader = a.uploaded_by_name || userName(users, a.uploaded_by);
        return (
          <button key={a.id} type="button" onClick={async () => { setError(""); try { await apiDownload(a.download_url, a.original_name); } catch (err) { setError(errorMessage(err, "Không tải được file")); } }} className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 text-left text-sm transition-colors hover:border-[#1d6ef0] hover:bg-blue-50">
            <span className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#214b74]">
                <FileText size={18} />
              </span>
              <span className="min-w-0">
                <b className="block truncate text-[#214b74]">{a.original_name}</b>
                <span className="text-xs font-semibold text-slate-500">{fmtSize(a.size)} · {uploader}</span>
              </span>
            </span>
            <span className="shrink-0 text-xs font-black text-[#214b74]">Tải</span>
          </button>
        );
      })}
    </div>
  );
}

function ReviewActions({ assignment, onReload }: { assignment: Assignment; onReload: () => Promise<void> }) {
  const [action, setAction] = useState<"approve" | "return" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!action) return;
    setError("");
    if (action === "return" && !note.trim()) {
      setError("Cần nhập lý do trả về");
      return;
    }
    setSaving(true);
    try {
      await api(`/assignments/${assignment.id}/${action}`, { method: "POST", body: JSON.stringify({ note: note.trim() || null }) });
      setAction(null);
      setNote("");
      await onReload();
    } catch (err) {
      setError(errorMessage(err, action === "approve" ? "Không duyệt được kết quả" : "Không trả về được kết quả"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
      <button type="button" className="icon-text-btn text-emerald-700" onClick={() => setAction("approve")}><ThumbsUp size={14} /> Duyệt</button>
      <button type="button" className="icon-text-btn text-orange-700" onClick={() => setAction("return")}><RotateCcw size={14} /> Trả về</button>
      {action ? (
        <SystemModal title={action === "approve" ? "Duyệt kết quả xử lý" : "Trả về để làm lại"} onClose={() => setAction(null)} action={<><button className="icon-text-btn" onClick={() => setAction(null)}>Hủy</button><button className="primary-btn" onClick={submit} disabled={saving}>{saving ? "Đang lưu..." : action === "approve" ? "Duyệt" : "Trả về"}</button></>}>
          {error ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 font-bold text-red-700">{error}</p> : null}
          <label className="block font-bold">
            {action === "approve" ? "Ghi chú duyệt (không bắt buộc)" : "Lý do trả về *"}
            <textarea className="field mt-1 min-h-24 w-full" value={note} onChange={(e) => setNote(e.target.value)} placeholder={action === "approve" ? "Nhập ghi chú nếu cần..." : "Nhập nội dung cần nhân viên bổ sung..."} />
          </label>
        </SystemModal>
      ) : null}
    </div>
  );
}

function StaffActions({ assignment, detail, onReload }: { assignment: Assignment; detail: DocumentDetail; onReload: () => Promise<void> }) {
  const [note, setNote] = useState(assignment.result_note || "");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const canSendResult = assignment.status === "pending" || assignment.status === "in_progress" || assignment.status === "returned";

  async function start() {
    setError("");
    try {
      await api(`/assignments/${assignment.id}/start`, { method: "POST" });
      await onReload();
    } catch (err) {
      setError(errorMessage(err, "Không bắt đầu được việc"));
    }
  }

  async function submit() {
    setError("");
    setSaving(true);
    try {
      if (file) {
        const form = new FormData();
        form.set("file", file);
        form.set("assignment_id", assignment.id);
        await api(`/documents/${detail.id}/attachments`, { method: "POST", body: form });
      }
      await api(`/assignments/${assignment.id}/submit`, { method: "POST", body: JSON.stringify({ result_note: note }) });
      setFile(null);
      await onReload();
    } catch (err) {
      setError(errorMessage(err, "Không gửi lại được kết quả"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Thao tác của tôi" icon={<Send size={16} />}>
      {error ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
      {assignment.status === "pending" ? <button className="primary-btn" onClick={start}>Bắt đầu làm</button> : null}
      {assignment.status === "returned" && assignment.latest_return_note ? <p className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-sm font-bold text-orange-800">Bị trả về: {assignment.latest_return_note}</p> : null}
      {canSendResult ? (
        <>
          <FilePicker id={`assignment-result-${assignment.id}`} label="File kết quả xử lý" file={file} onChange={setFile} />
          <textarea className="field mt-3 min-h-24 w-full" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi kết quả xử lý..." />
          <button className="primary-btn mt-3" onClick={submit} disabled={saving}><Send size={16} /> {saving ? "Đang gửi..." : "Gửi lại quản lý"}</button>
        </>
      ) : (
        <>
          {assignment.status === "submitted" ? <p className="mb-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700">Kết quả đã gửi và đang chờ quản lý duyệt.</p> : null}
          {assignment.status === "approved" ? <p className="mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">Việc này đã được duyệt.</p> : null}
        </>
      )}
    </Panel>
  );
}

function UploadBox({ documentId, assignmentId, onDone }: { documentId: string; assignmentId?: string; onDone: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  async function upload() {
    if (!file) return;
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      if (assignmentId) form.set("assignment_id", assignmentId);
      await api(`/documents/${documentId}/attachments`, { method: "POST", body: form });
      setFile(null);
      await onDone();
    } catch (err) {
      setError(errorMessage(err, "Không upload được file"));
    }
  }

  return (
    <>
      {error ? <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p> : null}
      <div className="grid gap-2">
        <FilePicker id={`original-upload-${documentId}`} label="Thêm tài liệu gốc" file={file} onChange={setFile} compact />
        <button className="icon-text-btn" onClick={upload}><Upload size={14} /> Upload</button>
      </div>
    </>
  );
}

function FilePicker({ id, label, file, onChange, compact }: { id: string; label: string; file: File | null; onChange: (file: File | null) => void; compact?: boolean }) {
  return (
    <label htmlFor={id} className={clsx("flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed p-3 transition-colors", compact ? "min-h-16" : "min-h-20", file ? "border-[#1d6ef0] bg-blue-50" : "border-slate-300 bg-slate-50 hover:border-[#1d6ef0] hover:bg-blue-50/60")}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-[#214b74]">
        <Upload size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black text-slate-950">{label}</span>
        <span className={clsx("block truncate text-xs font-semibold", file ? "text-[#214b74]" : "text-slate-500")}>{file ? file.name : "Chưa chọn file"}</span>
      </span>
      <span className="rounded-lg bg-white px-3 py-2 text-xs font-black text-[#214b74] shadow-sm">{file ? "Đổi file" : "Chọn file"}</span>
      <input id={id} className="sr-only" type="file" onChange={(e) => onChange(e.target.files?.[0] || null)} />
    </label>
  );
}
