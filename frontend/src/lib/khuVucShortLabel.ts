/**
 * Rut gon ten khu vuc de tiet kiem dien tich hien thi (bang bao cao, pivot, dropdown, cot Khu vuc...)
 * ap dung TOAN HE THONG - CHOT 2026-08-06 theo yeu cau chu he thong. CHI doi nhan HIEN THI, KHONG
 * doi gia tri that (case_dvbh.khu_vuc, filter query param, khu_vuc_phu_trach...) - cac cho do van
 * phai dung nguyen chuoi CRM goc de khop dung logic scope/filter/permission.
 * Khu vuc khong co trong bang nay (CRM them moi/doi ten) tra ve nguyen chuoi goc - khong mat du lieu.
 */
export const KHU_VUC_SHORT_LABELS: Record<string, string> = {
  "(qldvbh.mb1) Quản lý khu vực MB1": "MB1",
  "(qldvbh.mb2) Quản lý khu vực MB2": "MB2",
  "(qldvbh.mb3) Quản lý khu vực MB3": "MB3",
  "(qldvbh.mn1) Quản lý khu vực MN1": "MN1",
  "(qldvbh.mn2) Quản lý khu vực MN2": "MN2",
  "(qldvbh.mn3) Quản lý khu vực MN3": "MN3",
  "(qlkddv.3t) Quản lý kinh doanh dịch vụ": "KDDV",
  "(qlb2b.b2b-mn) Quản lý B2B Miền Bắc": "B2B MB",
  "(qlb2b.b2b-mn) Quản lý B2B Miền Nam": "B2B MN",
  "Phòng bảo hành 3T miền Bắc": "SCVP MB",
  "Phòng bảo hành 3T miền Nam": "SCVP MN",
};

export function shortKhuVuc(raw: string | null | undefined): string {
  if (!raw) return "—";
  return KHU_VUC_SHORT_LABELS[raw] ?? raw;
}

/**
 * Gop khu vuc "la" ve khu vuc chuan DE HIEN THI bao cao theo khu vuc (2026-11-19, chu he thong chon "gop vao khu vuc chuan"):
 *  - CRM doi ma B2B tu 10/2026: "(qlb2b.b2b-mb) Quản lý B2B Miền Nam" (moi) = "(qlb2b.b2b-mn) Quản lý B2B Miền Nam" (cu); tuong tu
 *    Mien Bac nguoc lai. KHONG doi du lieu (quyen GS dang gan theo ca 2 ma) - chi gop dong khi hien thi.
 *  - Tai khoan CTV/TEST bi ghi vao cot khu vuc: du lieu da sua ve khu vuc chuan (migration 0177 + importProcessor), nhung so chot
 *    theo ngay da luu (giai_trinh_daily_log...) van mang ten cu -> gop o day.
 * Khu vuc khong co trong bang -> giu nguyen.
 */
export const KHU_VUC_GOP: Record<string, string> = {
  "(qlb2b.b2b-mb) Quản lý B2B Miền Nam": "(qlb2b.b2b-mn) Quản lý B2B Miền Nam",
  "(qlb2b.b2b-mb) Quản lý B2B Miền Bắc": "(qlb2b.b2b-mn) Quản lý B2B Miền Bắc",
  "(huydg.bn-mb) CTV Bắc Ninh - Đào Gia Huy - NS-3919": "(qldvbh.mb3) Quản lý khu vực MB3",
  "(huydg.bn-mb) CTV Bắc Ninh - Đào Gia Huy - NS-3919 - NS-3919": "(qldvbh.mb3) Quản lý khu vực MB3",
  "(hoant.hd-mb) CTV Hải Dương - Nguyễn Thị Hoa - NS - 3959": "(qldvbh.mb3) Quản lý khu vực MB3",
  "(gskv.test) GS Khu Vực-TEST": "(teamkdbl.krf) Kinh doanh bán lẻ KRF",
};

export function khuVucGop(raw: string): string {
  return KHU_VUC_GOP[raw] ?? raw;
}

/** Gop cac dong { khu_vuc, days: [{ ngay, ...so }] } co cung khu vuc chuan - cong cac cot so theo tung ngay. */
export function gopDongTheoKhuVuc<D extends { ngay: string }, R extends { khu_vuc: string; days: D[] }>(rows: R[]): R[] {
  const theo = new Map<string, R>();
  for (const r of rows) {
    const k = khuVucGop(r.khu_vuc);
    const cu = theo.get(k);
    if (!cu) {
      theo.set(k, { ...r, khu_vuc: k, days: r.days.map((d) => ({ ...d })) });
      continue;
    }
    for (const d of r.days) {
      const dd = cu.days.find((x) => x.ngay === d.ngay);
      if (!dd) { cu.days.push({ ...d }); continue; }
      for (const [key, v] of Object.entries(d)) {
        if (typeof v === "number") (dd as Record<string, unknown>)[key] = (Number((dd as Record<string, unknown>)[key]) || 0) + v;
      }
    }
  }
  return [...theo.values()];
}
