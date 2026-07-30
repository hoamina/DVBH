import { Select } from "./ui/Select";

/**
 * Bo loc long nhau Tinh -> Quan/Huyen (dung cho Bao cao khao sat theo khu vuc). Select tinh luon
 * hien; Select huyen CHI hien khi da chon 1 tinh cu the (khac "Tat ca cac tinh" = tinh rong) - danh
 * sach huyen lay tu tinhHuyenMap[tinh] (xem GET /dashboard/filters, field "tinhHuyen"). Doi tinh se
 * tu xoa lua chon huyen dang co (huyen cu co the khong thuoc tinh moi).
 */
export function TinhHuyenFilterControl({
  tinh,
  quanHuyen,
  tinhOptions,
  tinhHuyenMap,
  onTinhChange,
  onQuanHuyenChange,
}: {
  tinh: string;
  quanHuyen: string;
  tinhOptions: string[];
  tinhHuyenMap: Record<string, string[]>;
  onTinhChange: (tinh: string) => void;
  onQuanHuyenChange: (quanHuyen: string) => void;
}) {
  const huyenOptions = tinh ? tinhHuyenMap[tinh] ?? [] : [];

  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={tinh}
        onChange={(v) => {
          onTinhChange(v);
          onQuanHuyenChange("");
        }}
        options={[{ value: "", label: "Tất cả các tỉnh" }, ...tinhOptions.map((t) => ({ value: t, label: t }))]}
      />
      {tinh && huyenOptions.length > 0 && (
        <Select
          value={quanHuyen}
          onChange={onQuanHuyenChange}
          options={[{ value: "", label: "Tất cả huyện" }, ...huyenOptions.map((h) => ({ value: h, label: h }))]}
        />
      )}
    </div>
  );
}
