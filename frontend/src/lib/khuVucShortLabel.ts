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
