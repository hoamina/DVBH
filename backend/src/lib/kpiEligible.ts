/**
 * "Ca tinh vao KPI/doanh thu bao cao" - chot voi user 2026-07-20: chi ca DA DONG THANH CONG
 * (tien_do_hoan_thanh = 'Hoàn thành XLSC') VA duoc co KPI danh dau tinh vao KPI (tinh_vao_kpi = 1)
 * moi duoc tinh vao cac bao cao dang "ket qua cong viec" (doanh thu, ty le...). Ca "Khong hoan
 * thanh XLSC" hoac "Hoan thanh XLSC" nhung tinh_vao_kpi = 0 (~13% so ca da dong tren production)
 * KHONG duoc tinh, du van co gia tri dt_* > 0 trong du lieu goc.
 *
 * Nguon duy nhat cho dieu kien nay - dashboard.ts's /kpis va /pivot da tu code dung dieu kien
 * tuong tu tu truoc (khong doi), revenue.ts va dailyReport.ts (doanh thu banner) truoc day KHONG
 * loc gi, gay lech so voi dashboard.ts - da sua de dung chung 1 nguon nay.
 *
 * Them 2026-07-30: ca da bi Admin "huy bo" (huy_bo_at IS NOT NULL, xem migration 0037/routes/cases.ts
 * POST /:id/huy) cung loai khoi KPI - khac tinh_vao_kpi (bi CRM import ghi de moi lan), cot huy_bo_at
 * nam ngoai BUSINESS_FIELDS nen an toan, khong bi import xoa.
 */
export const KPI_ELIGIBLE_CLAUSE = "tien_do_hoan_thanh = 'Hoàn thành XLSC' AND tinh_vao_kpi = 1 AND huy_bo_at IS NULL";

export function kpiEligibleClause(prefix = ""): string {
  return `${prefix}tien_do_hoan_thanh = 'Hoàn thành XLSC' AND ${prefix}tinh_vao_kpi = 1 AND ${prefix}huy_bo_at IS NULL`;
}
