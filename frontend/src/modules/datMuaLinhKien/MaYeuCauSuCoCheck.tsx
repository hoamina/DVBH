import { useState, useEffect } from "react";
import { api, buildQuery } from "../../api/client";
import { shortKhuVuc } from "../../lib/khuVucShortLabel";
import type { MaYeuCauSuCoPreview } from "./types";

// Canh bao mem khi nhap "Ma yeu cau su co lien quan" (tieu chi UX phan hoi 2026-08-15, muc 5) - debounce
// 500ms sau khi ngung go, goi GET /dat-mua-lk/kiem-tra-ma-yeu-cau (KHONG dung GET /api/cases/:id vi
// route do chan theo scopeByKhuVuc - 1 GS nhap dung ma nhung case ngoai khu vuc phu trach se nhan 403
// va hien SAI thanh "khong tim thay"). Chi nhac nho, KHONG chan submit.
//
// CHOT 2026-08-16 (phan hoi: "hien thong tin co ban de nguoi tao tu doi chieu"): khi tim thay, hien
// them 1 the nho tom tat ca (khach hang/serial/hang+san pham/khu vuc/KTV xu ly/tien do) de nguoi go
// mã tu xac nhan day dung la ca minh can - khong chi 1 dong bao "co/khong tim thay" nhu truoc.
export function MaYeuCauSuCoCheck({ value, nguoiNhanHang }: { value: string; nguoiNhanHang: string }) {
  const [result, setResult] = useState<{ found: boolean; khopKtv: boolean | null; preview: MaYeuCauSuCoPreview | null } | null>(null);
  const id = value.trim();

  useEffect(() => {
    setResult(null);
    if (!id) return;
    const t = setTimeout(() => {
      api
        .get<{ found: boolean; khopKtv: boolean | null; preview: MaYeuCauSuCoPreview | null }>(
          `/dat-mua-lk/kiem-tra-ma-yeu-cau${buildQuery({ id, nguoi_nhan_hang: nguoiNhanHang || undefined })}`,
        )
        .then(setResult)
        .catch(() => setResult(null));
    }, 500);
    return () => clearTimeout(t);
  }, [id, nguoiNhanHang]);

  if (!id || !result) return null;

  if (!result.found) {
    return (
      <div className="mt-1.5 rounded-lg border border-[var(--amber-500)]/30 bg-[var(--amber-100)]/60 px-2.5 py-1.5 text-[11px] font-medium text-[var(--amber-700)]">
        ⚠ Mã sự cố không chính xác hoặc chưa đồng bộ lên server — hãy chắc chắn thông tin chính xác.
      </div>
    );
  }

  const toneCls =
    result.khopKtv === true
      ? { border: "border-[var(--teal-500)]/35", bg: "bg-[var(--teal-100)]/45", head: "text-[var(--teal-600)]" }
      : result.khopKtv === false
        ? { border: "border-[var(--coral-500)]/35", bg: "bg-[var(--coral-100)]/45", head: "text-[var(--coral-600)]" }
        : { border: "border-[var(--line)]", bg: "bg-[var(--surface-100)]", head: "text-[var(--ink-600)]" };

  const p = result.preview;
  return (
    <div className={`mt-1.5 rounded-lg border ${toneCls.border} ${toneCls.bg} px-2.5 py-2`}>
      <div className={`text-[11px] font-bold mb-1.5 ${toneCls.head}`}>
        {result.khopKtv === true && "✓ Đúng KTV xử lý — đối chiếu ca dưới đây trước khi gửi"}
        {result.khopKtv === false && "⚠ Mã này không do bạn/KTV này xử lý — kiểm tra lại"}
        {result.khopKtv === null && "Đã tìm thấy ca — đối chiếu thông tin dưới đây"}
      </div>
      {p && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-[var(--ink-700)]">
          <div className="col-span-2">
            <span className="text-[var(--ink-500)]">Khách hàng: </span>
            <span className="font-semibold">{p.khach_hang ?? "—"}</span>
          </div>
          <div>
            <span className="text-[var(--ink-500)]">Serial: </span>
            <span className="font-mono">{p.seri_san_pham ?? "—"}</span>
          </div>
          <div>
            <span className="text-[var(--ink-500)]">Hãng: </span>
            {p.hang ?? "—"}
            {p.san_pham_bao_hanh ? ` · ${p.san_pham_bao_hanh}` : ""}
          </div>
          <div>
            <span className="text-[var(--ink-500)]">Khu vực: </span>
            {shortKhuVuc(p.khu_vuc)}
            {p.tinh ? ` · ${p.tinh}` : ""}
            {p.quan_huyen ? ` · ${p.quan_huyen}` : ""}
          </div>
          <div>
            <span className="text-[var(--ink-500)]">Tiến độ: </span>
            {p.tien_do_hoan_thanh ?? "—"}
          </div>
          <div className="col-span-2">
            <span className="text-[var(--ink-500)]">KTV xử lý: </span>
            {p.ky_thuat_vien ?? "—"}
          </div>
        </div>
      )}
    </div>
  );
}

