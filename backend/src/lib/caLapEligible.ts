// Pham vi xu ly "Ca lap": chi ca da "Hoan thanh XLSC" va hinh thuc bao hanh KHAC "Goi dien tu van"
// (ca goi dien tu van chi la huong dan qua dien thoai, khong phai 1 lan xu ly thuc te nen khong
// tinh la "lap"). NULL van giu lai (chua xac dinh hinh thuc bao hanh khac voi "Goi dien tu van" ro
// rang) - chi loai dung gia tri "Goi dien tu van", khong loai ca chua co du lieu. Tach rieng file
// (thay vi de trong routes/caLap.ts) de dung chung duoc voi lib/caLapRefresh.ts (cron refresh) ma
// khong tao vong lap import route -> lib -> route.
export function eligibleClause(prefix: string): string {
  return ` AND ${prefix}tien_do_hoan_thanh = 'Hoàn thành XLSC' AND (${prefix}hinh_thuc_bao_hanh IS NULL OR ${prefix}hinh_thuc_bao_hanh != 'Gọi điện tư vấn') AND ${prefix}huy_bo_at IS NULL`;
}
