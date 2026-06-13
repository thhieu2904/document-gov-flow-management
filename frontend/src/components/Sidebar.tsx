import { useState, useRef, useEffect } from "react";
import { BarChart3, BellRing, BriefcaseBusiness, Building2, CheckCircle, Database, FileText, ListTodo, LogOut, PencilLine, UsersRound, User as UserIcon } from "lucide-react";
import type { User, View } from "../types";
import { NavButton } from "./shared";
import { labels } from "../labels";

function SidebarGroup({ label }: { label: string }) {
  return (
    <div className="mt-4 mb-2 border-t border-slate-200 px-3 pt-3">
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span>
    </div>
  );
}

export function Sidebar({ user, view, onChange, onLogout, onOpenProfile }: { user: User; view: View; onChange: (view: View) => void; onLogout: () => void; onOpenProfile: () => void }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isAdmin = user.role === "superadmin" || user.role === "manager";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <aside className="app-sidebar flex w-[280px] shrink-0 flex-col border-r border-slate-200 bg-white p-3">
      <div className="app-sidebar-main min-h-0 flex-1">
        <NavButton active={view === "dashboard"} icon={<BriefcaseBusiness size={17} />} onClick={() => onChange("dashboard")}>Tổng quan</NavButton>
        {isAdmin ? (
          <>
            <SidebarGroup label="Văn bản" />
            <NavButton active={view === "assigned"} icon={<FileText size={17} />} onClick={() => onChange("assigned")}>Văn bản xử lý chính</NavButton>
            <NavButton active={view === "all_documents"} icon={<FileText size={17} />} onClick={() => onChange("all_documents")}>Tất cả văn bản</NavButton>
            <NavButton active={view === "completed_documents"} icon={<CheckCircle size={17} />} onClick={() => onChange("completed_documents")}>Văn bản đã hoàn tất</NavButton>
            <SidebarGroup label="Hệ thống" />
            <NavButton active={view === "users"} icon={<UsersRound size={17} />} onClick={() => onChange("users")}>Người dùng</NavButton>
            {user.role === "superadmin" ? <NavButton active={view === "departments"} icon={<Building2 size={17} />} onClick={() => onChange("departments")}>Phòng ban</NavButton> : null}
            <NavButton active={view === "reminders"} icon={<BellRing size={17} />} onClick={() => onChange("reminders")}>Nhắc hẹn</NavButton>
            <SidebarGroup label="Chỉ tiêu" />
            <NavButton active={view === "kpi_input"} icon={<PencilLine size={17} />} onClick={() => onChange("kpi_input")}>Nhập chỉ tiêu</NavButton>
            <NavButton active={view === "kpi_display"} icon={<BarChart3 size={17} />} onClick={() => onChange("kpi_display")}>Biểu đồ chỉ tiêu</NavButton>
          </>
        ) : (
          <>
            <SidebarGroup label="Công việc" />
            <NavButton active={view === "assigned_pending"} icon={<ListTodo size={17} />} onClick={() => onChange("assigned_pending")}>Việc cần xử lý</NavButton>
            <NavButton active={view === "assigned_completed"} icon={<CheckCircle size={17} />} onClick={() => onChange("assigned_completed")}>Việc đã duyệt</NavButton>
            <SidebarGroup label="Tra cứu" />
            <NavButton active={view === "assigned"} icon={<Database size={17} />} onClick={() => onChange("assigned")}>Tất cả việc được giao</NavButton>
            <NavButton active={view === "kpi_display"} icon={<BarChart3 size={17} />} onClick={() => onChange("kpi_display")}>Biểu đồ chỉ tiêu</NavButton>
          </>
        )}
      </div>
      <div className="relative border-t border-slate-200 pt-3" ref={menuRef}>
        {isMenuOpen && (
          <div className="absolute bottom-full left-0 mb-2 w-full rounded-lg border border-slate-200 bg-white p-1 shadow-lg z-10">
            <button className="flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-100" onClick={() => { setIsMenuOpen(false); onOpenProfile(); }}>
              <UserIcon className="shrink-0" size={16} /> <span className="truncate">Thông tin tài khoản</span>
            </button>
            <button className="flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-bold text-red-600 hover:bg-red-50 hover:text-red-700 mt-1" onClick={() => { setIsMenuOpen(false); onLogout(); }}>
              <LogOut className="shrink-0" size={16} /> <span className="truncate">Đăng xuất</span>
            </button>
          </div>
        )}
        <button 
          className="flex w-full items-center justify-between rounded-lg p-3 text-left hover:bg-slate-100 transition-colors"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          <div className="overflow-hidden">
            <p className="truncate text-sm font-black">{user.full_name}</p>
            <p className="text-xs font-bold text-slate-500">{labels.role[user.role]}</p>
          </div>
        </button>
      </div>
    </aside>
  );
}
