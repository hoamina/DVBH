import type { Env } from "../types";

// Bao tin sang he ngoai "vipham.dichvu3t.workers.dev" (KTV tu giai trinh, xem migration
// 0108_vi_pham_giai_trinh.sql) - CHUA xay dung tinh den thoi diem viet ham nay, day la "base" chuan
// bi truoc phia DVBH. Dung CHUNG 1 endpoint/1 ham cho 2 loai su kien (phan biet qua "loai_su_kien"):
//   - "nghi_ngo_moi": CSKH vua ghi nhan nghi ngo cap 1 (xem routes/survey.ts POST /calls).
//   - "cap_nhat": GS hoac QC vua cap nhat thong tin vi pham do (chot/bo cap 2 - xem routes/viPham.ts
//     PATCH /:id/cap2 - hoac GS nhap giai trinh thay ngay trong DVBH - xem POST /:id/giai-trinh).
//     KHONG goi khi giai trinh den tu chinh he vipham qua POST /api/partner/sync/giai-trinh-vi-pham
//     (se vong lai chinh du lieu cua no, khong co y nghia).
// Mot chieu, khong doi phan hoi, khong duoc phep lam vo luong chinh (CSKH ghi nhan/GS giai trinh/QC
// chot) neu he ngoai chua san sang/loi mang - xem PARTNER_API_GUIDE.md muc 9.1.
interface ViPhamNotifyBase {
  vi_pham_id: string;
  case_id: string;
}

export interface ViPhamNghiNgoMoiPayload extends ViPhamNotifyBase {
  loai_su_kien: "nghi_ngo_moi";
  loai_loi: string;
  ket_qua_cap_1: string | null;
  khach_hang: string | null;
  khu_vuc: string | null;
  ky_thuat_vien: string | null;
  seri_san_pham: string | null;
  ngay_ghi_nhan: string;
  nguoi_ghi_nhan: string;
}

export interface ViPhamCapNhatQcChotPayload extends ViPhamNotifyBase {
  loai_su_kien: "cap_nhat";
  nguon_cap_nhat: "qc_chot_cap_2";
  chot_bo_cap_2: boolean;
  nguoi_chot: string;
  ngay_chot: string;
}

export interface ViPhamCapNhatGiaiTrinhPayload extends ViPhamNotifyBase {
  loai_su_kien: "cap_nhat";
  nguon_cap_nhat: "giam_sat_giai_trinh";
  nguoi_giai_trinh: string | null;
  ngay_giai_trinh: string;
  noi_dung_giai_trinh: string | null;
  ghi_chu: string | null;
  anh_urls: string[];
}

export type ViPhamNotifyPayload = ViPhamNghiNgoMoiPayload | ViPhamCapNhatQcChotPayload | ViPhamCapNhatGiaiTrinhPayload;

export async function pushViPhamToVipham(env: Env, payload: ViPhamNotifyPayload): Promise<void> {
  if (!env.VIPHAM_APP_URL || !env.VIPHAM_APP_API_KEY || !env.VIPHAM_APP) return;
  try {
    // Dung Service Binding (KHONG fetch() thang URL that) - "dvbh" va "vipham" cung 1 tai khoan
    // Cloudflare, fetch() thang bi chan loi 1042 (chong SSRF Worker-to-Worker) giong linh-kien-app da
    // gap voi CASE_LOOKUP_SERVICE (xem CLAUDE.md linh-kien-app + wrangler.jsonc cua vi-pham-app da ghi
    // chu san phuong an nay). URL van dung dung host that trong Request - VIPHAM_APP binding chi doi
    // huong request toi dung Worker, khong lien quan gi toi viec route noi bo cua Hono ben nhan (no chi
    // doc pathname).
    const res = await env.VIPHAM_APP.fetch(`${env.VIPHAM_APP_URL}/api/nhan-vi-pham`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": env.VIPHAM_APP_API_KEY },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[pushViPhamToVipham] ${payload.loai_su_kien} vi_pham_id=${payload.vi_pham_id} tra loi ${res.status}: ${text.slice(0, 300)}`);
    }
  } catch (err) {
    // Khong duoc phep lam vo luong chinh (xem chu thich dau file) - NHUNG phai log lai de con debug,
    // truoc day catch rong nuot loi hoan toan khien 1042 (hoac bat ky loi nao khac) khong the phat
    // hien duoc tu ben ngoai (bai hoc tu vu "vi pham khong bao sang vipham" 2026-09-11).
    console.error(`[pushViPhamToVipham] ${payload.loai_su_kien} vi_pham_id=${payload.vi_pham_id} loi:`, err);
  }
}
