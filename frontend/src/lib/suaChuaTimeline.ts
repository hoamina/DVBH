// Luong "Gui bao hanh linh kien" cua 1 ca tu he suachua (GET /api/cases/:id/sua-chua-timeline ->
// backend/src/lib/suaChuaTimeline.ts -> suachua GET /api/partner/v1/case-timeline). Them 2026-11-06.
// Goi theo yeu cau khi mo ca, khong luu D1. Nhan tieng Viet do suachua tinh san (khong chep state machine).
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export interface SuaChuaPhieuGui {
  id: string;
  trang_thai: string;
  trang_thai_label: string | null;
  ktv: string | null;
  ma_ktv: string | null;
  tao_luc: string | null;
  gui_xe_luc: string | null;
  hinh_thuc_gui: string | null;
  don_vi_van_chuyen: string | null;
  ma_van_don: string | null;
  ma_xe_hoac_tai_xe: string | null;
  kho_nhan: string | null;
  kho_nhan_luc: string | null;
  admin_nhan: string | null;
  admin_nhan_luc: string | null;
  su_co: string | null;
}

export interface SuaChuaPhieuTra {
  id: string;
  trang_thai: string;
  trang_thai_label: string | null;
  loai_doi_tru: string | null;
  ma_don_hang: string | null;
  ma_misa: string | null;
  ma_van_don: string | null;
  danh_gia_ktv: string | null;
  khong_nhan_duoc_ghi_chu: string | null;
  ly_do_tu_choi_kt: string | null;
  tao_luc: string | null;
  cap_nhat: string | null;
}

export interface SuaChuaDonVi {
  id: string;
  so_thu_tu: number;
  giai_doan: string;
  giai_doan_label: string | null;
  trang_thai: string;
  trang_thai_label: string | null;
  ma_lk_thuc_te: string | null;
  ten_lk_thuc_te: string | null;
  loai_bao_hanh: string | null;
  huong_xu_ly: string | null;
  huong_xu_ly_label: string | null;
  loai_doi_tru: string | null;
  ket_qua: string | null;
  xu_ly_xac: string | null;
  nv_sua_chua: string | null;
  ly_do_tu_choi: string | null;
  ghi_chu_admin: string | null;
  ghi_chu_nv: string | null;
  that_lac: boolean;
  cap_nhat: string | null;
  phieu_tra: SuaChuaPhieuTra | null;
}

export interface SuaChuaLog {
  at: string | null; // gio VN local "YYYY-MM-DD HH:MM:SS"
  doi_tuong: "phieu_gui" | "phieu_sc" | "phieu_sc_ct" | "phieu_tra";
  ma: string;
  tu: string | null;
  den: string | null;
  nguoi: string | null;
  ghi_chu: string | null;
}

export interface SuaChuaDon {
  id: string;
  odoo_id: number | null;
  ma_lk: string | null;
  ten_lk: string | null;
  mo_ta_loi: string | null;
  so_luong_khai: number;
  so_luong_thuc_nhan: number | null;
  ly_do_chenh_lech_sl: string | null;
  loai_doi_tru_de_xuat: string | null;
  nguon_tao: string;
  trang_thai_cha: string;
  trang_thai_cha_label: string | null;
  giai_doan: string | null; // chi co khi don chua tach don vi
  giai_doan_label: string | null;
  tao_luc: string | null;
  phieu_gui: SuaChuaPhieuGui | null;
  don_vi: SuaChuaDonVi[];
  timeline: SuaChuaLog[];
}

export interface SuaChuaTimelineResult {
  configured: boolean;
  ok: boolean;
  error: string | null;
  don: SuaChuaDon[];
}

export function useSuaChuaTimeline(caseId: string | null | undefined) {
  return useQuery({
    queryKey: ["sua-chua-timeline", caseId],
    queryFn: () => api.get<SuaChuaTimelineResult>(`/cases/${encodeURIComponent(caseId!)}/sua-chua-timeline`),
    enabled: !!caseId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export const SUACHUA_APP_URL = "https://suachua.dichvu3t.workers.dev";
