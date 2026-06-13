import { useCallback, useEffect, useState, type FormEvent } from "react";
import clsx from "clsx";
import { Loader2, RefreshCcw } from "lucide-react";
import { api, errorMessage } from "../api";

type CaptchaChallenge = {
  captcha_id: string;
  captcha_code: string;
  captcha_token: string;
  expires_in_seconds: number;
};

export function Login({ onLoggedIn }: { onLoggedIn: (token: string) => void }) {
  const [email, setEmail] = useState("thhieu2904@gmail.com");
  const [password, setPassword] = useState("password123");
  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const demo = [
    ["thhieu2904@gmail.com", "Superadmin: quản lý toàn hệ thống"],
    ["nguyenvanquang.vms@gmail.com", "Superadmin: quản lý toàn hệ thống"],
    ["quanly.vanhanh@example.com", "Quản lý: xử lý văn bản trong phòng ban"],
    ["nhanvien1@example.com", "Nhân viên: nhận việc, gửi lại kết quả"],
    ["nhanvien2@example.com", "Nhân viên: có việc đang làm/quá hạn"],
    ["nhanvien3@example.com", "Nhân viên: có việc đã hoàn tất"],
  ];

  const refreshCaptcha = useCallback(async (showError = true) => {
    setCaptchaLoading(true);
    try {
      const result = await api<CaptchaChallenge>("/auth/captcha");
      setCaptcha(result);
      setCaptchaAnswer("");
    } catch (err) {
      if (showError) setError(errorMessage(err, "Không tải được mã xác nhận"));
      setCaptcha(null);
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCaptcha();
  }, [refreshCaptcha]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!captcha) {
      setError("Chưa có mã xác nhận. Vui lòng bấm Đổi mã rồi thử lại.");
      return;
    }
    if (!captchaAnswer.trim()) {
      setError("Vui lòng nhập mã xác nhận.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await api<{ access_token: string }>(
        "/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            email,
            password,
            captcha_token: captcha.captcha_token,
            captcha_answer: captchaAnswer.trim(),
          }),
        },
      );
      onLoggedIn(result.access_token);
    } catch (err) {
      setError(errorMessage(err, "Không đăng nhập được"));
      void refreshCaptcha(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#214b74] px-6 py-10 flex items-center justify-center">
      <div className="w-full max-w-[440px]">
        <form onSubmit={submit} className="rounded-xl bg-white p-6 shadow-xl">
          <div className="mb-6 flex items-center gap-4">
            <img src="/LOGO_HCC.jpg" className="h-16 w-16 rounded-full border object-cover p-1" />
            <div>
              <p className="text-xs font-bold uppercase text-[#2b668f]">Hệ thống quản lý văn bản</p>
              <h2 className="text-xl font-black">Đăng nhập</h2>
            </div>
          </div>
          <label className="mb-3 block text-sm font-bold">Email<input className="field mt-1 w-full" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="mb-3 block text-sm font-bold">Mật khẩu<input className="field mt-1 w-full" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <label className="mb-4 block text-sm font-bold">Mã xác nhận
            <div className="mt-1 grid gap-2 sm:grid-cols-[auto_1fr_auto]">
              <div className="flex h-11 min-w-32 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 font-mono text-lg font-black tracking-[0.28em] text-[#214b74]">
                {captchaLoading ? <Loader2 className="animate-spin" size={18} /> : captcha?.captcha_code || "----"}
              </div>
              <input
                className="field min-w-0"
                inputMode="numeric"
                maxLength={6}
                pattern="[0-9]*"
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Nhập mã"
              />
              <button type="button" className="icon-text-btn justify-center" onClick={() => void refreshCaptcha()} disabled={captchaLoading}>
                <RefreshCcw size={16} /> Đổi mã
              </button>
            </div>
          </label>
          {error ? <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
          <button className="primary-btn w-full" disabled={loading || captchaLoading || !captcha}>{loading ? <Loader2 className="animate-spin" size={18} /> : null} Đăng nhập</button>
          
          <div className="mt-6 border-t border-slate-100 pt-4 flex items-center justify-between text-xs">
            <div>
              <p className="font-black text-slate-400 uppercase tracking-wider text-[9px]">Hỗ trợ kỹ thuật</p>
              <p className="font-bold text-slate-800 mt-0.5">Nguyễn Văn Quang</p>
            </div>
            <div className="text-right">
              <p className="font-black text-slate-400 uppercase tracking-wider text-[9px]">Số điện thoại</p>
              <a href="tel:0907007397" className="font-bold text-[#1d6ef0] hover:underline mt-0.5 block">0907007397</a>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
