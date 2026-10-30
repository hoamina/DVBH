import { dbGoc } from "./phamVi";

/**
 * Danh sach khu_vuc nhom "QLDVBH" (ten chua "qldvbh") - danh muc khu vuc dung chung moi nuoc/pham vi.
 * SUA 2026-10-30 (v1.513): truoc la `SELECT DISTINCT khu_vuc FROM case_hieu_luc WHERE khu_vuc LIKE '%qldvbh%'` - view
 * (huy_bo_at IS NULL) lam planner di idx_case_huy_bo_at + tra ~143k dong ngau nhien, do that 4,6-5,5 giay/lan, 58 lan/3 ngay
 * (truy van ton thoi gian NHAT cua D1). Gio quet idx_case_khu_vuc (covering, khong cham bang) tren DB goc: ~9ms. Khong loc ca
 * huy bo: khu vuc chi con o ca da huy thi snapshot cua no = 0, khong lam lech tong.
 */
export async function layKhuVucQldvbh(db: D1Database): Promise<string[]> {
  const { results } = await dbGoc(db)
    .prepare("SELECT DISTINCT khu_vuc FROM case_dvbh INDEXED BY idx_case_khu_vuc WHERE khu_vuc LIKE '%qldvbh%'")
    .all<{ khu_vuc: string }>();
  return results.map((r) => r.khu_vuc);
}
