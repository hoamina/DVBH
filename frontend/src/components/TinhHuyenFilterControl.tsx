import { Select } from "./ui/Select";
import { useDiaGioiLoc, NHAN_CAP_1, NHAN_CAP_2 } from "../lib/diaGioi";

/**
 * Bo loc long nhau Tinh -> cap 2 theo che do "Địa giới cũ / mới" chung (lib/diaGioi.ts, 2026-10-10): cu = Tinh cu ->
 * Quan/Huyen, moi = Tinh moi -> Xa/Phuong moi. Gia tri tinh = ten chuan da gom (vd "Thành phố Hà Nội"), cap 2 = khoa
 * chuan hoa - noi goi dung useDiaGioiLoc().buildDgLoc() de ra query param "dg_loc". Select cap 2 CHI hien khi da chon
 * 1 tinh; doi tinh tu xoa cap 2.
 */
export function TinhHuyenFilterControl({
  tinh,
  quanHuyen,
  onTinhChange,
  onQuanHuyenChange,
}: {
  tinh: string;
  quanHuyen: string;
  onTinhChange: (tinh: string) => void;
  onQuanHuyenChange: (quanHuyen: string) => void;
}) {
  const { mode, tinhOptions, cap2Options, chuanTinh } = useDiaGioiLoc();
  const tinhChuan = tinh ? chuanTinh(tinh) : null;
  const cap2 = tinh ? cap2Options(tinh) : [];

  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={tinhChuan !== null ? tinh : ""}
        onChange={(v) => {
          onTinhChange(v);
          onQuanHuyenChange("");
        }}
        options={[{ value: "", label: `Tất cả ${NHAN_CAP_1[mode].toLowerCase()}` }, ...tinhOptions]}
      />
      {tinh && cap2.length > 0 && (
        <Select
          value={quanHuyen}
          onChange={onQuanHuyenChange}
          options={[{ value: "", label: `Tất cả ${NHAN_CAP_2[mode].toLowerCase()}` }, ...cap2]}
        />
      )}
    </div>
  );
}
