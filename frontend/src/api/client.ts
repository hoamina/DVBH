const BASE = "/api";

export class ApiError extends Error {
  status: number;
  code?: string;
  detail?: string;
  constructor(status: number, code?: string, detail?: string) {
    super(code ?? `HTTP_${status}`);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormBody = init?.body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: isFormBody ? init?.headers : { "Content-Type": "application/json", ...init?.headers },
  });

  if (res.status === 401) {
    window.location.href = "/api/auth/login";
    throw new ApiError(401, "UNAUTHENTICATED");
  }

  if (!res.ok) {
    let code: string | undefined;
    let detail: string | undefined;
    try {
      const body = await res.json();
      code = body.error;
      // "message" - vai backend tra them mo ta cu the (vd NO_ROWS_PARSED cua importNapGas.ts,
      // FETCH_FAILED cua cac route sync-sheet) - uu tien hien noi dung nay hon ma loi tho trong
      // describeError() ben duoi, giup nguoi dung hieu ngay can sua gi thay vi chi thay 1 ma loi.
      if (typeof body.message === "string") detail = body.message;
    } catch {
      /* body khong phai JSON */
    }
    throw new ApiError(res.status, code, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  postForm: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }),
  // Upload binary tho (vd anh) voi Content-Type la mime that (khong phai multipart/form-data) - xem
  // POST /phieu-xuat-kho/:id/anh-bien-ban (backend doc truc tiep qua c.req.arrayBuffer()).
  postBinary: <T>(path: string, bytes: ArrayBuffer, contentType: string) =>
    request<T>(path, { method: "POST", body: bytes, headers: { "Content-Type": contentType } }),
};

export function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}
