// Pham vi xu ly "Ca lap": chi ca da "Hoan thanh XLSC" va hinh thuc bao hanh KHAC "Goi dien tu van"
// (ca goi dien tu van chi la huong dan qua dien thoai, khong phai 1 lan xu ly thuc te nen khong
// tinh la "lap"). NULL van giu lai (chua xac dinh hinh thuc bao hanh khac voi "Goi dien tu van" ro
// rang) - chi loai dung gia tri "Goi dien tu van", khong loai ca chua co du lieu. Tach rieng file
// (thay vi de trong routes/caLap.ts) de dung chung duoc voi lib/caLapRefresh.ts (cron refresh) ma
// khong tao vong lap import route -> lib -> route.
//
// them 2026-08-29: loai them ca co "Loai yeu cau" nam trong danh muc settings_loai_yeu_cau_bo_qua_lap
// (bat_tat=1, xem migration 0103 + routes/settings.ts) - danh muc nay do Admin khai bao dong trong
// Settings (vd "Dan tem, poster sieu thi"), KHONG hardcode nhu dieu kien hinh_thuc_bao_hanh o tren vi
// can bat/tat va them moi ma khong deploy. NOT EXISTS an toan voi loai_yeu_cau NULL (SQL 3-valued
// logic: NULL = x luon UNKNOWN, khong co dong nao khop -> ca van giu nguyen dien.
export function eligibleClause(prefix: string): string {
  return ` AND ${prefix}tien_do_hoan_thanh = 'Hoàn thành XLSC' AND (${prefix}hinh_thuc_bao_hanh IS NULL OR ${prefix}hinh_thuc_bao_hanh != 'Gọi điện tư vấn') AND ${prefix}huy_bo_at IS NULL AND NOT EXISTS (SELECT 1 FROM settings_loai_yeu_cau_bo_qua_lap x WHERE x.loai_yeu_cau = ${prefix}loai_yeu_cau AND x.bat_tat = 1)`;
}
