import { useEffect, useRef, useState } from "react";

// Nut ⚙ "Tuy chon hien thi" o the "Thong tin case" (CaseDetail, 2026-10-22): nguoi dung tu an/hien tung truong de tap trung
// vao thong tin minh can. Luu localStorage tung may (khong goi server, khong doc/ghi D1). Khoa = nhan hien thi cua truong
// (CaseDetail renderCaseFieldsGrid dung CUNG chuoi nay) - doi nhan truong thi doi o ca 2 noi.
export const CASE_INFO_AN_TRUONG_KEY = "dvbh_case_info_an_truong";

export const NHOM_TRUONG_CASE_INFO: { nhom: string; truong: string[] }[] = [
  {
    nhom: "Cơ bản",
    truong: [
      "Khách hàng",
      "Serial",
      "Khu vực",
      "Địa chỉ mới",
      "Địa chỉ cũ",
      "Hãng / Nhóm SP",
      "Trạm triển khai",
      "KTV triển khai",
      "Tiếp nhận CSKH",
      "Hẹn xử lý",
      "Thời gian hoàn thành",
      "Dự kiến hoàn thành (giải trình gần nhất)",
      "Ngày import",
      "Cập nhật gần nhất",
      "Đúng hạn / Xử lý 24h",
    ],
  },
  {
    nhom: "Xử lý",
    truong: [
      "Nhóm / Loại yêu cầu",
      "Mức độ",
      "Cách thức xử lý",
      "Sản phẩm bảo hành",
      "Hình thức bảo hành",
      "Tiến độ hoàn thành",
      "Lý do hủy",
      "Lý do quá hạn",
      "Mô tả lỗi",
      "Lưu ý lỗi linh kiện",
      "Nội dung xử lý chi tiết",
    ],
  },
  { nhom: "Bổ sung", truong: ["Hình ảnh báo cáo công việc", "Doanh thu", "Phân loại & nguồn gốc"] },
];

export function readAnTruong(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(CASE_INFO_AN_TRUONG_KEY) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function writeAnTruong(an: Set<string>) {
  try {
    localStorage.setItem(CASE_INFO_AN_TRUONG_KEY, JSON.stringify([...an]));
  } catch {
    /* localStorage bi chan -> chi ap dung trong phien */
  }
}

export function CaseInfoFieldSettings({ an, onChange }: { an: Set<string>; onChange: (an: Set<string>) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function ngoai(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", ngoai);
    return () => document.removeEventListener("mousedown", ngoai);
  }, [open]);

  const doi = (truong: string, hien: boolean) => {
    const next = new Set(an);
    if (hien) next.delete(truong);
    else next.add(truong);
    onChange(next);
  };
  const doiNhom = (truong: string[], hien: boolean) => {
    const next = new Set(an);
    for (const t of truong) {
      if (hien) next.delete(t);
      else next.add(t);
    }
    onChange(next);
  };

  return (
    <div ref={ref} className="relative mt-1.5 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Chọn thông tin hiển thị (lưu trên máy này)"
        className={`focus-ring rounded-lg border px-2 py-1 text-xs font-semibold ${
          an.size > 0 ? "border-[var(--ocean-500)] text-[var(--ocean-600)] bg-[var(--ocean-100)]" : "border-[var(--line)] text-[var(--ink-500)] hover:bg-slate-100"
        }`}
      >
        ⚙{an.size > 0 ? ` Ẩn ${an.size}` : ""}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-[300px] max-h-[60vh] overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 shadow-xl text-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="font-display font-bold text-[var(--ink-900)]">Thông tin hiển thị</div>
            <button
              type="button"
              disabled={an.size === 0}
              onClick={() => onChange(new Set())}
              className="text-xs font-semibold text-[var(--ocean-600)] hover:underline disabled:opacity-40 disabled:no-underline"
            >
              Hiện tất cả
            </button>
          </div>
          <div className="text-[11px] text-[var(--ink-400)] mb-2">Bỏ tick để ẩn. Chỉ lưu trên trình duyệt máy này.</div>
          {NHOM_TRUONG_CASE_INFO.map(({ nhom, truong }) => {
            const hienHet = truong.every((t) => !an.has(t));
            return (
              <div key={nhom} className="mb-2">
                <label className="flex items-center gap-2 py-1 font-semibold text-[var(--ink-700)] cursor-pointer">
                  <input type="checkbox" checked={hienHet} onChange={(e) => doiNhom(truong, e.target.checked)} />
                  {nhom}
                </label>
                <div className="pl-5">
                  {truong.map((t) => (
                    <label key={t} className="flex items-center gap-2 py-0.5 text-[var(--ink-600)] cursor-pointer">
                      <input type="checkbox" checked={!an.has(t)} onChange={(e) => doi(t, e.target.checked)} />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
