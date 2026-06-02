import { BarChart3, PencilLine } from "lucide-react";
import clsx from "clsx";
import type { ReactNode } from "react";
import type { User, View } from "../types";

function HeaderNavButton({ active, children, icon, onClick }: { active: boolean; children: ReactNode; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      className={clsx("inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-black transition", active ? "bg-white text-[#214b74]" : "bg-white/10 text-white hover:bg-white/20")}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  );
}

export function Header({ user, view, onChange }: { user: User; view: View; onChange: (view: View) => void }) {
  return (
    <header className="border-b border-[#173a5f] bg-[#214b74] text-white">
      <div className="flex min-h-[84px] flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-4">
          <img src="/LOGO_HCC.jpg" className="h-16 w-16 rounded-full bg-white object-cover p-1" />
          <div>
            <p className="text-xs font-semibold uppercase text-blue-100">UBND Xã Long Phú</p>
            <h1 className="text-2xl font-bold uppercase">Quản lý văn bản nội bộ</h1>
          </div>
        </div>
      </div>
    </header>
  );
}
