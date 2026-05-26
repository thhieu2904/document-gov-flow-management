import { useState } from "react";
import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { api, errorMessage } from "../api";

export function Login({ onLoggedIn }: { onLoggedIn: (token: string) => void }) {
  const [email, setEmail] = useState("manager@example.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const demo = [
    ["manager@example.com", "Quản lý: tạo văn bản, giao việc, chốt hoàn tất"],
    ["nhanvien1@example.com", "Nhân viên: nhận việc, gửi lại kết quả"],
    ["nhanvien2@example.com", "Nhân viên: có việc đang làm/quá hạn"],
    ["nhanvien3@example.com", "Nhân viên: có việc đã hoàn tất"],
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await api<{ access_token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      onLoggedIn(result.access_token);
    } catch (err) {
      setError(errorMessage(err, "Không đăng nhập được"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#214b74] px-6 py-10">
      <div className="mx-auto grid min-h-[calc(100vh-80px)] max-w-5xl items-center gap-6 lg:grid-cols-[1fr_0.9fr]">
        <section className="rounded-xl bg-white p-6 shadow-xl">
          <p className="text-xs font-black uppercase text-[#2b668f]">MVP quản lý văn bản nội bộ</p>
          <h1 className="mt-1 text-2xl font-black">Flow đơn giản</h1>
          <div className="mt-4 grid gap-2 text-sm font-semibold text-slate-700">
            {["Quản lý tạo văn bản và đính kèm file", "Giao cho một hoặc nhiều nhân viên", "Nhân viên nhận việc, xử lý, upload file kết quả", "Nhân viên bấm Gửi lại manager", "Manager xem trạng thái và bấm Hoàn tất"].map((item) => <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 p-3">{item}</div>)}
          </div>
          <p className="mt-5 text-sm font-black">Tài khoản demo</p>
          <div className="mt-2 grid gap-2">
            {demo.map(([mail, hint]) => (
              <button key={mail} type="button" className={clsx("rounded-lg border p-3 text-left", email === mail ? "border-[#1d6ef0] bg-blue-50" : "border-slate-200")} onClick={() => { setEmail(mail); setPassword("password123"); }}>
                <b>{mail}</b>
                <div className="text-xs text-slate-500">{hint}</div>
              </button>
            ))}
          </div>
        </section>
        <form onSubmit={submit} className="rounded-xl bg-white p-6 shadow-xl">
          <div className="mb-6 flex items-center gap-4">
            <img src="/LOGO_HCC.jpg" className="h-16 w-16 rounded-full border object-cover p-1" />
            <div>
              <p className="text-xs font-bold uppercase text-[#2b668f]">Hệ thống quản lý văn bản</p>
              <h2 className="text-xl font-black">Đăng nhập</h2>
            </div>
          </div>
          <label className="mb-3 block text-sm font-bold">Email<input className="field mt-1 w-full" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="mb-4 block text-sm font-bold">Mật khẩu<input className="field mt-1 w-full" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {error ? <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
          <button className="primary-btn w-full" disabled={loading}>{loading ? <Loader2 className="animate-spin" size={18} /> : null} Đăng nhập</button>
          <p className="mt-4 text-xs text-slate-500">Mật khẩu demo: password123</p>
        </form>
      </div>
    </main>
  );
}
