import { useState } from "react";
import { CheckCircle, Clock, FileText, Paperclip, Send, Trash2, Upload, UsersRound } from "lucide-react";
import { api, apiDownload } from "../api";
import type { Assignment, Attachment, DocumentDetail, User } from "../types";
import { fmtDateTimeSecond, fmtSize, userName } from "../utils";
import { Empty, Panel, Status, SystemModal } from "./shared";

function assignmentDisplayStatus(assignment: Assignment) {
  if (assignment.status === "completed" && assignment.due_at && assignment.completed_at && new Date(assignment.completed_at).getTime() > new Date(assignment.due_at).getTime()) {
    return "completed_late";
  }
  return assignment.status;
}

function lateText(assignment: Assignment) {
  if (assignment.status !== "completed" || !assignment.due_at || !assignment.completed_at) return "";
  return new Date(assignment.completed_at).getTime() > new Date(assignment.due_at).getTime() ? " · Trễ hạn" : " · Đúng hạn";
}

function derivedDocStatus(detail: DocumentDetail) {
  if (detail.status === "completed") return "completed";
  if (!detail.assignment_count) return "draft";
  if (detail.due_at && new Date(detail.due_at).getTime() < Date.now()) return "overdue";
  if (detail.due_at) {
    const daysLeft = (new Date(detail.due_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysLeft <= 3) return "due_soon";
  }
  return "in_progress";
}

const statusLabel: Record<string, string> = {
  draft: "Chưa giao",
  in_progress: "Đang thực hiện",
  due_soon: "Sắp đến hạn",
  overdue: "Quá hạn",
  completed: "Hoàn tất",
};

export function DetailModal({ detail, currentUser, users, onClose, onReload }: { detail: DocumentDetail; currentUser: User; users: User[]; onClose: () => void; onReload: () => Promise<void> }) {
  const myAssignment = detail.assignments.find((item) => item.assignee_id === currentUser.id && item.status !== "completed");
  const originalFiles = detail.attachments.filter((item) => !item.assignment_id);
  const resultFiles = detail.attachments.filter((item) => item.assignment_id != null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isAssigned = detail.assignment_count > 0;
  const canUploadOriginal = detail.my_permissions.can_update && !isAssigned;
  const docStatus = derivedDocStatus(detail);

  async function deleteDoc() {
    await api(`/documents/${detail.id}`, { method: "DELETE" });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-5">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="border-b bg-slate-50 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-xs font-black uppercase tracking-wider text-[#2b668f]">Chi tiết văn bản</p>
              <h2 className="text-lg font-black leading-tight">{detail.title}</h2>
              {detail.code ? <p className="mt-1 text-sm font-bold text-slate-500">Số hiệu: {detail.code}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Status status={docStatus} />
              {detail.my_permissions.can_delete ? <button className="icon-text-btn text-red-700" onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Xóa</button> : null}
              <button className="icon-text-btn" onClick={onClose}>Đóng</button>
            </div>
          </div>

          {/* Key info strip */}
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span><Clock size={14} className="mr-1 inline text-slate-400" /><b>Ban hành:</b> {fmtDateTimeSecond(detail.issued_at)}</span>
            <span><Clock size={14} className="mr-1 inline text-slate-400" /><b>Hạn:</b> <span className={docStatus === "overdue" ? "font-black text-red-600" : docStatus === "due_soon" ? "font-black text-amber-600" : ""}>{fmtDateTimeSecond(detail.due_at)}</span></span>
            <span><CheckCircle size={14} className="mr-1 inline text-slate-400" /><b>Tiến độ:</b> {detail.completed_count}/{detail.assignment_count}</span>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-4 p-6">
          {/* Summary if exists */}
          {detail.summary ? <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"><b className="text-slate-600">Ghi chú:</b> {detail.summary}</div> : null}

          {/* Two-column: Files + Assignments */}
          <div className="grid grid-cols-[1fr_1fr] gap-4">
            {/* Left: Files */}
            <div className="space-y-4">
              <Panel title="Tài liệu gốc" icon={<Paperclip size={16} />}>
                {canUploadOriginal ? <UploadBox documentId={detail.id} onDone={onReload} /> : null}
                {isAssigned && currentUser.role === "manager" && !canUploadOriginal ? <p className="mb-2 text-xs font-bold text-slate-400">Đã giao việc — không thể thêm file gốc.</p> : null}
                <AttachmentList files={originalFiles} users={users} emptyText="Chưa có tài liệu gốc." />
              </Panel>

              <Panel title="File kết quả xử lý" icon={<Upload size={16} />}>
                <AttachmentList files={resultFiles} users={users} emptyText="Nhân viên chưa gửi file kết quả." />
              </Panel>
            </div>

            {/* Right: Assignments */}
            <Panel title={`Việc được giao (${detail.assignments.length})`} icon={<UsersRound size={16} />}>
              {detail.assignments.length ? (
                <div className="space-y-2">
                  {detail.assignments.map((a) => (
                    <div key={a.id} className={`rounded-lg border p-3 ${a.status === "completed" ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <b className="text-sm">{a.assignee?.full_name || userName(users, a.assignee_id)}</b>
                        <Status status={assignmentDisplayStatus(a)} />
                      </div>
                      {a.instruction ? <p className="mt-1 text-xs text-slate-600">{a.instruction}</p> : null}
                      {a.result_note ? <p className="mt-2 rounded bg-emerald-50 px-2 py-1.5 text-xs font-bold text-emerald-800">Kết quả: {a.result_note}</p> : null}
                      <p className="mt-2 text-[11px] font-semibold text-slate-400">Hạn: {fmtDateTimeSecond(a.due_at)} · Hoàn tất: {fmtDateTimeSecond(a.completed_at)}{lateText(a)}</p>
                    </div>
                  ))}
                </div>
              ) : <Empty text="Chưa giao cho ai." />}
            </Panel>
          </div>

          {/* Staff action area */}
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

function AttachmentList({ files, users, emptyText }: { files: Attachment[]; users: User[]; emptyText: string }) {
  if (!files.length) return <Empty text={emptyText} />;
  return (
    <div className="mt-2 space-y-1.5">
      {files.map((a) => {
        const uploader = a.uploaded_by_name || userName(users, a.uploaded_by);
        return (
          <button key={a.id} type="button" onClick={() => void apiDownload(a.download_url, a.original_name)} className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm hover:bg-blue-50">
            <span className="min-w-0">
              <b className="block truncate text-[#214b74]">{a.original_name}</b>
              <span className="text-[11px] text-slate-500">{fmtSize(a.size)} · {uploader}</span>
            </span>
            <span className="shrink-0 text-xs font-black text-[#214b74]">Tải</span>
          </button>
        );
      })}
    </div>
  );
}

function StaffActions({ assignment, detail, onReload }: { assignment: Assignment; detail: DocumentDetail; onReload: () => Promise<void> }) {
  const [note, setNote] = useState(assignment.result_note || "");

  async function start() {
    await api(`/assignments/${assignment.id}/start`, { method: "POST" });
    await onReload();
  }

  async function submit() {
    await api(`/assignments/${assignment.id}/submit`, { method: "POST", body: JSON.stringify({ result_note: note }) });
    await onReload();
  }

  return (
    <Panel title="Thao tác của tôi" icon={<Send size={16} />}>
      {assignment.status === "pending" ? <button className="primary-btn" onClick={start}>Bắt đầu làm</button> : null}
      {assignment.status === "in_progress" ? (
        <>
          <UploadBox documentId={detail.id} assignmentId={assignment.id} onDone={onReload} />
          <textarea className="field mt-3 min-h-24 w-full" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi kết quả xử lý..." />
          <button className="primary-btn mt-3" onClick={submit}><Send size={16} /> Gửi lại quản lý</button>
        </>
      ) : null}
    </Panel>
  );
}

function UploadBox({ documentId, assignmentId, onDone }: { documentId: string; assignmentId?: string; onDone: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);

  async function upload() {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    if (assignmentId) form.set("assignment_id", assignmentId);
    await api(`/documents/${documentId}/attachments`, { method: "POST", body: form });
    setFile(null);
    await onDone();
  }

  return (
    <div className="flex gap-2">
      <input className="field flex-1" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <button className="icon-text-btn" onClick={upload}><Upload size={14} /> Upload</button>
    </div>
  );
}
