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
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-100 sm:text-xs">ĐẢNG ỦY - HĐND - UBND - UBMTTQVN XÃ LONG PHÚ</p>
            <h1 className="text-xl font-bold uppercase sm:text-2xl">VĂN BẢN XÃ LONG PHÚ</h1>
          </div>
        </div>
        <div className="hidden sm:block rounded-lg border border-blue-400/20 bg-[#1a3d60]/40 px-3 py-1.5 text-right text-xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-200">Hỗ trợ kỹ thuật</p>
          <p className="font-bold text-white">Nguyễn Văn Quang</p>
          <p className="text-blue-100 mt-0.5">SĐT: <a href="tel:0907007397" className="font-bold text-amber-300 hover:text-amber-200 hover:underline">0907007397</a></p>
        </div>
      </div>
    </header>
  );
}
