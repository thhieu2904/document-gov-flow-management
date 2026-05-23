export function Header() {
  return (
    <header className="border-b border-[#173a5f] bg-[#214b74] text-white">
      <div className="flex h-[84px] items-center px-5">
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
