export const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

type ValidationDetail = {
  loc?: Array<string | number>;
  msg?: string;
  type?: string;
  ctx?: { reason?: string };
};

const fieldLabels: Record<string, string> = {
  email: "Email",
  password: "Mật khẩu",
  current_password: "Mật khẩu hiện tại",
  new_password: "Mật khẩu mới",
  full_name: "Họ tên",
  role: "Vai trò",
  department_id: "Phòng ban",
  name: "Tên",
  title: "Trích yếu",
  due_at: "Hạn hoàn thành",
  issued_at: "Ngày ban hành",
  priority: "Độ ưu tiên",
  file: "File",
};

function fieldLabel(loc: ValidationDetail["loc"]) {
  const parts = loc?.filter((item) => item !== "body" && item !== "query" && item !== "path") || [];
  const key = parts.length ? parts[parts.length - 1] : null;
  return key == null ? "" : fieldLabels[String(key)] || String(key);
}

function humanMessage(detail: ValidationDetail) {
  const raw = detail.msg || detail.ctx?.reason || "Dữ liệu không hợp lệ";
  if (detail.type === "missing" || raw === "Field required") return "Bắt buộc nhập";
  if (detail.type?.includes("email") || raw.toLowerCase().includes("valid email")) {
    return "Email không hợp lệ. Vui lòng nhập đúng định dạng, ví dụ ten@congty.com.";
  }
  if (detail.type?.includes("string_too_short")) return raw.replace("String should have at least", "Cần tối thiểu");
  if (detail.type?.includes("greater_than_equal")) return raw.replace("Input should be greater than or equal to", "Cần lớn hơn hoặc bằng");
  if (detail.type?.includes("less_than_equal")) return raw.replace("Input should be less than or equal to", "Cần nhỏ hơn hoặc bằng");
  return raw;
}

function formatErrorDetail(detail: unknown, fallback: string) {
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => {
      if (!item || typeof item !== "object") return String(item);
      const validation = item as ValidationDetail;
      const label = fieldLabel(validation.loc);
      return label ? `${label}: ${humanMessage(validation)}` : humanMessage(validation);
    }).join("\n");
  }
  if (typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
    if (typeof record.message === "string") return record.message;
    if (typeof record.msg === "string") return record.msg;
    return fallback;
  }
  return String(detail);
}

async function responseErrorMessage(response: Response) {
  const fallback = response.statusText || "Có lỗi xảy ra";
  try {
    const body = await response.json();
    return formatErrorDetail(body?.detail ?? body?.message ?? body, fallback);
  } catch {
    return fallback;
  }
}

export function errorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("simple_doc_token");
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export async function apiDownload(path: string, defaultFilename: string = "download.file") {
  const token = localStorage.getItem("simple_doc_token");
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(apiUrl(path), { headers });
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }

  const disposition = response.headers.get("Content-Disposition");
  let filename = defaultFilename;
  if (disposition) {
    const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const plain = disposition.match(/filename="?([^";]+)"?/i);
    if (encoded?.[1]) {
      try {
        filename = decodeURIComponent(encoded[1]);
      } catch {
        filename = encoded[1];
      }
    } else if (plain?.[1]) {
      filename = plain[1];
    }
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export function apiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (API_BASE === "/api") return normalized.startsWith("/api/") ? normalized : `${API_BASE}${normalized}`;
  if (normalized.startsWith("/api/")) {
    const origin = API_BASE.endsWith("/api") ? API_BASE.slice(0, -4) : API_BASE;
    return `${origin}${normalized}`;
  }
  return `${API_BASE}${normalized}`;
}
