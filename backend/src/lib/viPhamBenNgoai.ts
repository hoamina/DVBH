import type { Env } from "../types";

// Bao tin sang he ngoai "vipham.dichvu3t.workers.dev" (KTV tu giai trinh, xem migration
// 0108_vi_pham_giai_trinh.sql) - CHUA xay dung tinh den thoi diem viet ham nay, day la "base" chuan
// bi truoc phia DVBH. Goi khi CSKH ghi nhan nghi ngo cap 1 (khong doi QC chot cap 2) - xem
// routes/survey.ts POST /calls. Mot chieu, khong doi phan hoi, khong duoc phep lam vo luong CSKH ghi
// nhan khao sat neu he ngoai chua san sang/loi mang.
export interface ViPhamOutboundPayload {
  vi_pham_id: string;
  case_id: string;
  loai_loi: string;
  ket_qua_cap_1: string | null;
  khach_hang: string | null;
  khu_vuc: string | null;
  ky_thuat_vien: string | null;
  seri_san_pham: string | null;
  ngay_ghi_nhan: string;
  nguoi_ghi_nhan: string;
}

export async function pushViPhamToVipham(env: Env, payload: ViPhamOutboundPayload): Promise<void> {
  if (!env.VIPHAM_APP_URL || !env.VIPHAM_APP_API_KEY) return;
  try {
    await fetch(`${env.VIPHAM_APP_URL}/api/nhan-vi-pham`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": env.VIPHAM_APP_API_KEY },
      body: JSON.stringify(payload),
    });
  } catch {
    // Im lang bo qua - xem chu thich dau file.
  }
}
