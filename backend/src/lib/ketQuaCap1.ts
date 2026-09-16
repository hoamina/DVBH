// Tach tu routes/importKhaoSat.ts (2026-09-16) de routes/viPham.ts dung lai duoc (QC sua ket_qua_cap_1
// luc chot cap 2) ma khong phai lap lai cung logic - xem migration 0112.
//
// "Khong loi" (sentinel) + 3 gia tri CU (khong dau, dang cu) khong con hien trong dropdown DVBH nua
// nhung van duoc chap nhan lam gia tri hop le (sheet AppSheet ngoai/du lieu lich su van con dung).
// Danh sach "dang dung" doc THEM tu settings_loai_vi_pham (CA dong bat_tat=0, khong chi loc active -
// nguon ben ngoai/QC sua lai gia tri cu khong bat buoc phai theo dung trang thai bat/tat hien tai).
export const KET_QUA_CAP_1_FIXED_VALUES = ["Khong loi", "Loi khong lien he", "Loi sai bao cao", "Loi khac"];

export async function loadKetQuaCap1ValidValues(db: D1Database): Promise<Set<string>> {
  const { results } = await db.prepare("SELECT ten_loi FROM settings_loai_vi_pham").all<{ ten_loi: string }>();
  return new Set([...KET_QUA_CAP_1_FIXED_VALUES, ...results.map((r) => r.ten_loi)]);
}

// Tra ve co bat buoc Ghi chu hay khong cho 1 gia tri ket_qua_cap_1 - tra CHINH cot bat_buoc_ghi_chu
// cua danh muc (xem migration 0112) thay vi so sanh chuoi cung "=== 'Loi khac'" (fragile, VA thuc te
// SAI vi gia tri seed trong danh muc la "Lỗi khác" co dau, khac voi literal ASCII "Loi khac"). Gia tri
// ASCII "Loi khac" (KET_QUA_CAP_1_FIXED_VALUES, khong con trong danh muc) van coi la bat buoc ghi chu
// de giu nguyen hanh vi cu cho du lieu lich su.
export async function isGhiChuBatBuocForKetQuaCap1(db: D1Database, tenLoi: string): Promise<boolean> {
  const row = await db.prepare("SELECT bat_buoc_ghi_chu FROM settings_loai_vi_pham WHERE ten_loi = ?").bind(tenLoi).first<{ bat_buoc_ghi_chu: number }>();
  if (row) return !!row.bat_buoc_ghi_chu;
  return tenLoi === "Loi khac";
}
