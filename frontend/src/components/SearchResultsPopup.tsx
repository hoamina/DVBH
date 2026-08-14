import { Modal } from "./ui/Modal";
import { Badge } from "./ui/Badge";
import { Btn } from "./ui/Btn";
import { CachThucXuLyLine } from "./CachThucXuLyLine";
import { fmtDateTime } from "../types";
import type { CaseRow } from "../types";
import { shortKhuVuc } from "../lib/khuVucShortLabel";

export type SearchMatchRow = Pick<
  CaseRow,
  "id" | "khach_hang" | "khu_vuc" | "thoi_gian_cskh_tiep_nhan" | "thoi_gian_hoan_thanh" | "tien_do_hoan_thanh" | "ky_thuat_vien" | "cach_thuc_xu_ly" | "link_crm"
> & {
  // CHOT 2026-08-12: server tra kem (xem GET /cases/search o backend), gia tri 0/1 tu SQL CASE WHEN
  // (D1/SQLite khong co kieu boolean rieng, giu quy uoc "number" giong eligible_for_eval trong
  // types.ts) - 1 neu ca nay dang thuc su bi tinh vao "Ca lap can danh gia" (tab "Can danh gia" cua
  // module Ca lap: co ca truoc do cung serial trong nguong 45 ngay, chua bi huy, GS chua danh gia
  // lap) - dung de lam noi bat dong tuong ung trong popup, giup nguoi tim theo Serial nhan ra ngay
  // khong can mo tung ca doi chieu tay.
  can_giai_trinh_lap: number;
};

/**
 * Nhieu ca cung tra ve 1 lan tim kiem Serial (TopBar) - tai dung dung style card cua "Chuoi lich su
 * theo serial" (tab Ca lap, CaseDetail.tsx) de nguoi dung quen mat, nhung la 1 Modal doc lap (khong
 * gan voi 1 ca dang mo san nhu ben do) - CHOT 2026-08-05: chi dung o day, KHONG doi lai phan "Chuoi
 * lich su theo serial" hien co trong CaseDetail.
 */
export function SearchResultsPopup({
  query,
  matches,
  onSelect,
  onClose,
}: {
  query: string;
  matches: SearchMatchRow[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} title={`${matches.length} ca cùng serial "${query}"`} width="max-w-md">
      <div className="space-y-2">
        {matches.map((m) => (
          <div
            key={m.id}
            onClick={() => onSelect(m.id)}
            className={`flex items-start gap-2 py-2 px-2 -mx-2 rounded-lg border cursor-pointer hover:bg-slate-50 hover:border-[var(--line)] ${
              m.can_giai_trinh_lap ? "border-[var(--coral-500)] bg-[var(--coral-100)]" : "border-transparent"
            }`}
          >
            <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${m.thoi_gian_hoan_thanh ? "bg-[var(--teal-500)]" : "bg-[var(--amber-500)]"}`}></span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {m.thoi_gian_hoan_thanh ? (
                    <span className="text-xs font-semibold">{fmtDateTime(m.thoi_gian_hoan_thanh)}</span>
                  ) : (
                    <Badge tone="amber">Đang tồn đọng</Badge>
                  )}
                  {!!m.can_giai_trinh_lap && <Badge tone="coral">⚠ Cần đánh giá lặp</Badge>}
                </div>
                {m.link_crm && (
                  <a href={m.link_crm} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                    <Btn size="sm" variant="subtle" type="button">
                      🔗 CRM
                    </Btn>
                  </a>
                )}
              </div>
              <div className="text-xs text-[var(--ink-600)] mt-0.5">
                {m.khach_hang || "—"} · {shortKhuVuc(m.khu_vuc)}
              </div>
              <div className="text-xs text-[var(--ink-600)]">
                ID <span className="font-mono">{m.id}</span> · {m.ky_thuat_vien ?? "—"}
                {m.tien_do_hoan_thanh && ` · ${m.tien_do_hoan_thanh}`}
              </div>
              {m.cach_thuc_xu_ly && <CachThucXuLyLine text={m.cach_thuc_xu_ly} />}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
