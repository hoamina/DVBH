import { useQueryClient } from "@tanstack/react-query";
import { quyenQuocGiaHienTai, setQuocGia, useQuocGiaDangXem } from "../lib/phamVi";
import { useQuocGia } from "../lib/quocGia";
import { tr } from "../i18n/tr";

// Nut chon quoc gia dang xem (2026-10-29, "Đa quốc gia" SRS §12) - canh nut "Phạm vi". Chi hien khi nguoi dung co hon
// 1 lua chon: nguoi toan bo = tung nuoc dang bat; nguoi duoc vai nuoc = cac nuoc do (luon xem tung nuoc 1).
// Doi nuoc -> bo toan bo du lieu react-query de moi man tai lai (giong PhamViToggle). Server tu kiem lai quyen.
export function QuocGiaToggle({ className = "" }: { className?: string }) {
  const qg = useQuocGiaDangXem();
  const qc = useQueryClient();
  const { data } = useQuocGia();
  const quyen = quyenQuocGiaHienTai();
  const dsNuoc = data?.quoc_gia ?? [];
  const tenNuoc = new Map(dsNuoc.map((q) => [q.ma, q.ten]));
  // Bo "Tất cả quốc gia" (chu he thong 2026-11-11): nguoi toan bo chon trong cac nuoc dang bat, xem tung nuoc 1.
  const luaChon: string[] = quyen === undefined ? [] : quyen === null ? dsNuoc.filter((q) => q.kich_hoat).map((q) => q.ma) : quyen;
  if (luaChon.length <= 1) return null;

  const chon = (v: string) => {
    if (v === qg) return;
    setQuocGia(v);
    qc.resetQueries();
  };
  return (
    <div className={`flex items-center gap-1.5 ${className}`} title={tr("Quốc gia đang xem")}>
      <span className="text-[11px] hidden lg:inline text-[var(--ink-400)]">{tr("Quốc gia")}</span>
      <div role="radiogroup" aria-label={tr("Quốc gia đang xem")} className="inline-flex rounded-lg border border-[var(--line)] p-0.5 bg-[var(--surface)]">
        {luaChon.map((v) => (
          <button
            key={v}
            role="radio"
            aria-checked={qg === v}
            title={tenNuoc.get(v) ?? v}
            onClick={() => chon(v)}
            className={`focus-ring px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              qg === v ? "bg-[var(--ocean-500)] text-white" : "text-[var(--ink-600)] hover:bg-slate-100"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
