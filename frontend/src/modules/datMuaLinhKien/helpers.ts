import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../api/client";
import { getAllFromCache, getLastCacheTimestamp, mergeLinhKienToCache } from "../../lib/linhKienCache";
import { getAllLdeFromCache, clearLdeCache, mergeLdeToCache, type LdeEntry } from "../../lib/loaiDeXuatCache";
import type { BadgeTone } from "../../components/ui/Badge";
import type { LkDanhMucRow, NguoiNhanHangKhaDungRow, DonHangDraft, DonHangRow, KtvDisplayMap, XepHangLinhKienRow } from "./types";
import { YEU_CAU_HOA_DON_OPTIONS, GENERIC_ERROR_MESSAGES } from "./constants";

// Ham/hook thuan (khong JSX) dung chung nhieu tab, tach tu DatMuaLinhKienModule.tsx (UI redesign
// Phase 3, phan hoi Codex 2026-08-19).

export function describeApiError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.detail) return err.detail;
    const known = GENERIC_ERROR_MESSAGES[err.code ?? ""];
    if (known) return known;
    return `không xác định (mã: ${err.code ?? err.status})`;
  }
  return err instanceof Error ? err.message : String(err);
}

// Dot 3 gop y #7: hien ten KTV thay vi email tho khap module. Dung chung 1 nguon
// (GET /dat-mua-lk/nguoi-nhan-hang-kha-dung, da mo cho moi nguoi da dang nhap - xem backend) build
// Map email -> {ma_ktv, ten_hien_thi}, dung react-query cache mac dinh (khong can fetch lai nhieu lan
// vi cac component deu dung chung 1 queryKey).
export function useKtvDisplayMap(): KtvDisplayMap {
  const { data } = useQuery({
    queryKey: ["dat-mua-lk-nguoi-nhan-hang-kha-dung"],
    queryFn: () => api.get<{ rows: { ma_ktv: string; ten_hien_thi: string | null; email_dang_nhap: string }[] }>("/dat-mua-lk/nguoi-nhan-hang-kha-dung"),
  });
  return new Map((data?.rows ?? []).map((r) => [r.email_dang_nhap, { ma_ktv: r.ma_ktv, ten_hien_thi: r.ten_hien_thi }]));
}

// SUA BUG (phan hoi 2026-08-18): "luồng quy trình" (PipelineFlow) + 3 nut sub-tab so luong dung 2
// query rieng (`dat-mua-lk-luong-quy-trinh`, `dat-mua-lk-loai-don-counts`) voi refetchInterval 5 phut
// - truoc day KHONG co mutation nao invalidate 2 query nay, nen sau khi nguoi dung thao tac xong 1
// buoc (duyet/tu choi/tao PXK/...) so dem tren pipeline VAN CU cho toi khi refetchInterval tu kich
// hoat hoac F5 thu cong. Goi ham nay trong onSuccess cua MOI mutation lam doi trang thai luong (tao
// don, sua don, duyet/tu choi/huy, thieu_lk, tra_hang, PXK) de so dem cap nhat NGAY, khong can F5.
export function invalidatePipelineCounts(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["dat-mua-lk-luong-quy-trinh"] });
  qc.invalidateQueries({ queryKey: ["dat-mua-lk-loai-don-counts"] });
}

export function formatNguoiDisplay(email: string, map: KtvDisplayMap): string {
  const entry = map.get(email);
  if (!entry) return email;
  // RA SOAT 2026-08-18: GS tu nhan hang khong co ma_ktv that (backend tra chuoi rong) - bo phan
  // "(ma_ktv)" thay vi hien "() Ten" xau.
  return entry.ma_ktv ? `👤 (${entry.ma_ktv}) ${entry.ten_hien_thi ?? email}` : `👤 ${entry.ten_hien_thi ?? email}`;
}

// CHOT (ra soat "Tao Don Linh Kien 2.0" #2): hien them "(GS: Ten GS)" sau ten KTV trong cac Select
// chon "nguoi nhan hang" - CHI khi danh sach dang xem gom NHIEU HON 1 GS khac nhau (TN chon giua
// nhieu GS quan ly). GS tu xem chi thay dung KTV cua minh (danh sach dong nhat 1 GS) nen tu dong bo
// qua, tranh hien thua "(GS: chinh minh)".
export function ktvOptionLabel(r: NguoiNhanHangKhaDungRow, allRows: NguoiNhanHangKhaDungRow[]): string {
  const base = `${r.ma_ktv} - ${r.ten_hien_thi ?? r.email_dang_nhap}`;
  const distinctGs = new Set(allRows.map((x) => x.ten_gs).filter((x): x is string => !!x));
  return distinctGs.size > 1 && r.ten_gs ? `${base} (GS: ${r.ten_gs})` : base;
}

// CHOT (phan hoi 2026-08-19: "trong tên linh kiện đã có mã linh kiện thì không cần thêm tiền tố") -
// nhieu ten_linh_kien trong danh muc da TU chua san ma o dang "[ma]"/"(ma)" trong chuoi (vd "Bóng đèn
// UV 6W (2 chân) [2014010043]") - ghep them tien to "ma - " nhu truoc day khien ma hien LAP 2 LAN.
// Kiem tra chuoi con (khong phan biet hoa/thuong) truoc: neu ten da chua ma thi GIU NGUYEN ten, nguoc
// lai moi them "(ma)" o CUOI thay vi tien to o dau.
export function formatLkLabel(maLinhKien: string, tenLinhKien: string): string {
  if (tenLinhKien.toLowerCase().includes(maLinhKien.toLowerCase())) return tenLinhKien;
  return `${tenLinhKien} (${maLinhKien})`;
}

export function trangThaiLabel(options: { value: string; label: string }[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

// ---------- Tab "Tao don" ----------

export function deriveLoaiDon(v: string): "mua" | "cong_no" | "tra_hang" {
  if (v.includes("TRẢ HÀNG")) return "tra_hang";
  if (v.includes("CÔNG NỢ") || v.includes("HỖ TRỢ") || v.includes("TRỪ CÔNG NỢ") || v.includes("THẺ BẢO HÀNH"))
    return "cong_no";
  return "mua";
}

// Mau/nhan theo loai don - dung lai 3 tone san co cua Badge.tsx (khong them token mau moi), giup
// phan biet nhanh cac dong trong 1 phieu (phan hoi UX 2026-08-15 dot 2: giao diem qua nhat nhoa).
export const LOAI_DON_TONE: Record<ReturnType<typeof deriveLoaiDon>, { tone: BadgeTone; label: string; border: string }> = {
  mua: { tone: "ocean", label: "Mua hàng", border: "border-l-[var(--ocean-400)]" },
  cong_no: { tone: "amber", label: "Công nợ", border: "border-l-[var(--amber-500)]" },
  tra_hang: { tone: "coral", label: "Trả hàng", border: "border-l-[var(--coral-500)]" },
};

// Chinh sach + Ma yeu cau su co bat buoc khi Loai de xuat la cong no THAT (chua "CONG NO") nhung
// khong phai luong tra hang (da co "TRA HANG") - chot 2026-08-15, doi xung voi validate phia server
// (POST /phieu-dat, processDatDonHangImportRows trong datMuaLinhKien.ts).
export function canNoRequired(loaiDeXuat: string): boolean {
  return loaiDeXuat.includes("CÔNG NỢ") && !loaiDeXuat.includes("TRẢ HÀNG");
}

// To mau nhat quan cho nhan cac truong BAT BUOC (dot 3 gop y tong the: "to mau/noi bat gia tri bat
// buoc") - dung 1 kieu nhan duy nhat (mau coral khi con trong) thay vi chi 2 truong cu (Chinh sach/
// Ma yeu cau su co) co ma "*" con cac truong bat buoc khac (Ma LK/Loai de xuat/So luong) khong co.
export function reqLabelClass(missing: boolean): string {
  return `block text-[11px] font-semibold mb-1 ${missing ? "text-[var(--coral-600)]" : "text-[var(--ink-600)]"}`;
}

// Tim option Loai de xuat khop 3 nut bam nhanh pho bien nhat (MUA HANG/CONG NO/TRU CONG NO) - khop
// ca bien the co tien to ngoac nhu "(TBP DONG Y) MUA HANG" cho TN/Admin lan chuoi thuan cho KTV
// (xem migration 0061_loai_de_xuat_settings.sql).
export function pickLdeQuick(options: string[], keyword: string): string | undefined {
  return options.find((o) => o.replace(/^\([^)]*\)\s*/, "").trim() === keyword);
}


export function emptyDraft(): DonHangDraft {
  return {
    ma_lk: "", loai_de_xuat: "", so_luong_de_xuat: 1,
    ghi_chu: "", yeu_cau_hoa_don: YEU_CAU_HOA_DON_OPTIONS[0], tt_mail_duyet: "", tt_khach_hang: "", chinh_sach: "", ma_yeu_cau_su_co: "",
    uu_tien: false,
  };
}

// Dung chung boi TaoDonTab (luon tai) va DonHangDetailModal (chi tai khi nguoi tao mo che do sua -
// tach thanh hook rieng de khong lap logic dong bo cache 2 noi, tranh lech neu sua sau nay).
export function useLkAndLdeCache(enabled: boolean) {
  const [danhMuc, setDanhMuc] = useState<LkDanhMucRow[]>([]);
  const [ldeEntries, setLdeEntries] = useState<LdeEntry[]>([]);
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!enabled || syncedRef.current) return;
    syncedRef.current = true;

    (async () => {
      // LK cache - "chi_sua_chua" (Only sua chua) loai khoi picker tao don, xem migration 0083.
      const cached = await getAllFromCache();
      if (cached.length > 0) {
        setDanhMuc(cached.filter((r) => r.bat_tat && !r.chi_sua_chua) as unknown as LkDanhMucRow[]);
      }
      const since = await getLastCacheTimestamp();
      const url = since ? `/lk-settings/danh-muc?since=${encodeURIComponent(since)}` : "/lk-settings/danh-muc";
      const { rows } = await api.get<{ rows: LkDanhMucRow[] }>(url);
      if (rows.length > 0) {
        await mergeLinhKienToCache(rows as unknown as import("../../types").LinhKienRow[]);
        setDanhMuc((prev) => {
          const map = new Map(prev.map((r) => [r.ma_linh_kien, r]));
          for (const r of rows) map.set(r.ma_linh_kien, r);
          return Array.from(map.values()).filter((r) => r.bat_tat && !r.chi_sua_chua);
        });
      }

      // LDE cache - full sync moi lan (dataset nho, tranh stale cache khi admin hard-delete option -
      // incremental ?since= khong biet den xoa nen cache giu row cu mai mai).
      const ldeCached = await getAllLdeFromCache();
      if (ldeCached.length > 0) setLdeEntries(ldeCached.filter((e) => e.bat_tat));
      const { rows: ldeRows } = await api.get<{ rows: LdeEntry[] }>("/settings/loai-de-xuat");
      await clearLdeCache();
      if (ldeRows.length > 0) await mergeLdeToCache(ldeRows);
      setLdeEntries(ldeRows.filter((e) => e.bat_tat));
    })();
  }, [enabled]);

  return { danhMuc, ldeEntries };
}

// CHOT (ra soat "Tao Don Linh Kien 2.0" #3): danh sach xep hang theo luot duyet thanh cong 30 ngay
// gan nhat, tinh san 1 lan/ngay o backend (xem GET /dat-mua-lk/xep-hang-linh-kien) - dung react-query
// cache mac dinh nen chi 1 request du dung o nhieu noi (TaoDonTab + DonHangDetailModal).
//
// SUA LAG (phan hoi 2026-08-18): Map duoc dung lai (useMemo) thay vi dung lai MOI LAN RENDER - truoc
// day ham nay build lai Map tu dau moi khi component cha re-render (vd nguoi dung go 1 ky tu o
// truong Ghi chu KHAC cung dang mo), khong lien quan gi den du lieu xep hang nhung van ton chi phi.
export function useLinhKienRankMap(): Map<string, number> {
  const { data } = useQuery({
    queryKey: ["dat-mua-lk-xep-hang-linh-kien"],
    queryFn: () => api.get<{ rows: XepHangLinhKienRow[] }>("/dat-mua-lk/xep-hang-linh-kien"),
  });
  return useMemo(() => {
    const map = new Map<string, number>();
    (data?.rows ?? []).forEach((r, i) => map.set(r.ma_lk, i + 1));
    return map;
  }, [data]);
}

// Hanh dong ap dung duoc cho 1 DONG don hang, tuy vao trang thai hien tai + vai tro nguoi dang xem -
// nang len module-level (truoc day chi nam trong PhieuDatDetailModal) de dung chung cho ca bang dong
// con trong che do xem "phieu + dong" o DonCuaToiTab (phan hoi UX 2026-08-15).
// "choHang" (phan hoi 2026-08-19: "tac nghiep khong co chuc nang chuyen don sang cho hang") - truoc
// day chi la 1 nhanh AN trong "Tu choi" (chon Ly do co quan_ly_don_thieu_linh_kien=1 se tu dong ra
// "Cho hang" thay vi "TN tu choi", xem migration 0065) - TN khong biet ly do nao dan toi ket qua nao
// nen tuong nhu khong co chuc nang. Tach thanh 1 nut rieng NGAY CANH "Tu choi", chi khac o cho danh
// sach Ly do hien ra da LOC SAN theo quan_ly_don_thieu_linh_kien (xem 2 noi goi actionsFor.choHang o
// duoi) - KHONG doi API/hanh_dong backend (van la "tu_choi", he thong van tu quyet dinh ket qua dua
// vao ly_do_cham_id da chon, dung y CHOT 2026-08-14). Chi ap dung o buoc "Cho TN duyet" (buoc duy
// nhat co the ra "Cho hang" - xem applyDonHangLog backend), Tram/TBP khong co.
export function actionsFor(
  d: DonHangRow,
  ctx: { canTacNghiep: boolean; canTPDvbhXacNhan?: boolean; canActAsTram: boolean; currentEmail: string },
): { duyet: boolean; tuChoi: boolean; choHang: boolean; huy: boolean } {
  if (d.loai_don === "tra_hang" || !d.trang_thai) return { duyet: false, tuChoi: false, choHang: false, huy: false };
  const isOwnerOrTram = ctx.currentEmail === d.nguoi_tao || ctx.canActAsTram;
  if (d.trang_thai === "Cho Tram duyet") {
    return { duyet: ctx.canActAsTram, tuChoi: ctx.canActAsTram, choHang: false, huy: isOwnerOrTram };
  }
  // CHOT 2026-08-17 (migration 0082): buoc "TP DVBH xac nhan linh kien dac thu" - ngay truoc Tac
  // nghiep, chi ap dung khi ma LK cua dong dang duoc tao/duyet thuoc nhom "dac thu".
  if (d.trang_thai === "Cho TBP xac nhan") {
    return { duyet: !!ctx.canTPDvbhXacNhan, tuChoi: !!ctx.canTPDvbhXacNhan, choHang: false, huy: isOwnerOrTram };
  }
  if (d.trang_thai === "Cho TN duyet") {
    return { duyet: ctx.canTacNghiep, tuChoi: ctx.canTacNghiep, choHang: ctx.canTacNghiep, huy: isOwnerOrTram };
  }
  return { duyet: false, tuChoi: false, choHang: false, huy: false };
}
