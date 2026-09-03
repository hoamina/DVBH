/**
 * "theo_doi_doi_tra" tren case_dvbh (migration 0104) - tu dong phat hien case thuoc dien doi tra/doi
 * may qua 2 dieu kien AND: loai_yeu_cau + luu_y_loi_linh_kien nam trong 2 danh muc Settings (bat_tat=1,
 * xem settings_loai_yeu_cau_doi_tra / settings_luu_y_loi_linh_kien_doi_tra). Tinh TAI importProcessor.ts
 * moi lan co GHI_MOI/GHI_DE that su - KHONG can AI/pipeline ngoai (khac nghi_ngo_tranh_chap, xem
 * ratchet.ts ratchetNghiNgoTranhChap): day la so khop chuoi xac dinh, tu tinh duoc hoan toan trong app.
 *
 * Cung mo hinh 4 trang thai voi nghi_ngo_tranh_chap:
 *   0 = khong khop dieu kien (mac dinh)
 *   2 = khop, DANG CHO danh gia thu cong (tab "Theo doi doi tra")
 *   1 = da XAC NHAN dung - day sang tranh_chap_tien_trinh, xu ly nhu 1 khieu nai binh thuong
 *   3 = da xac nhan "Bo qua" - khoa vinh vien
 * Khac nghi_ngo_tranh_chap o cho "1"/"3" CHI phat sinh tu hanh dong xac nhan/bo qua thu cong (xem
 * routes/tranhChap.ts), khong bao gio den tu import - import chi bao gio ghi 0 hoac 2.
 */
export function computeTheoDoiDoiTra(
  currentDbValue: number,
  incomingLoaiYeuCau: unknown,
  incomingLuuYLoiLinhKien: unknown,
  loaiYeuCauSet: ReadonlySet<string>,
  luuYLoiLinhKienSet: ReadonlySet<string>,
): number {
  // 1 (da xac nhan dung) va 3 (da bo qua) la 2 trang thai chot - khoa vinh vien, khong bao gio tu
  // dong danh gia lai du du lieu import sau co khop dieu kien hay khong (giong ratchetNghiNgoTranhChap).
  if (currentDbValue === 1 || currentDbValue === 3) return currentDbValue;

  const loai = typeof incomingLoaiYeuCau === "string" ? incomingLoaiYeuCau.trim() : "";
  const luuY = typeof incomingLuuYLoiLinhKien === "string" ? incomingLuuYLoiLinhKien.trim() : "";
  const matched = loai.length > 0 && luuY.length > 0 && loaiYeuCauSet.has(loai) && luuYLoiLinhKienSet.has(luuY);
  return matched ? 2 : 0;
}
