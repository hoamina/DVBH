import { useEffect, useState } from "react";
import { Select, type SelectOption } from "./ui/Select";

/**
 * Bo loc "khu vuc" dung chung cho moi module (FilterBar + 6 module co Select khu_vuc rieng le).
 * "myAreas" = user.khu_vuc_phu_trach (co the rong, 1, hoac nhieu khu vuc). "options" giu NGUYEN
 * hinh dang/thu tu tung noi goi dang dung hom nay (phan tu DAU TIEN luon la lua chon "Tat ca khu
 * vuc" - "" hoac hang so ALL_KHU_VUC tuy noi goi) - component tu suy ra gia tri "tat ca" tu do,
 * khong hardcode, de tuong thich nguoc 100% voi backend/parseFilterParams hien co.
 *
 * - 0 hoac 1 khu vuc phu trach: Select don nhu cu (khong doi giao dien), chi khac la TU DONG chon
 *   san khu vuc cua ho ngay lan dau (thay vi mac dinh "Tat ca khu vuc") - giam tai du lieu phai tai
 *   cho vai tro khong bi gioi han server-side (Admin/Viewer/TBP...) nhung van xem duoc het neu can
 *   (chi can doi lai Select). Voi vai tro BI gioi han server-side (scopeByKhuVuc), day chi la UI ro
 *   rang hon - ket qua du lieu von da giong het nhau du co chon hay khong (backend luon AND them
 *   dieu kien scope rieng).
 * - 2+ khu vuc phu trach: hien danh sach "chip" CHI gom khu vuc cua rieng ho, bam de bat/tat tung
 *   khu vuc (mac dinh tat ca deu duoc chon = dung nhu hanh vi cu, khong loc gi them) + 1 nut phu de
 *   mo Select day du (xem het khu vuc he thong) cho ai can xem ngoai pham vi cua minh.
 */
export function KhuVucFilterControl({
  value,
  onChange,
  options,
  myAreas,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  myAreas: string[];
}) {
  const [showFullList, setShowFullList] = useState(false);
  const firstOption = options[0];
  const allValue = typeof firstOption === "string" ? firstOption : (firstOption?.value ?? "");

  // Tu dong chon san khu vuc duy nhat cua ho ngay lan dau (chi khi dang o gia tri "Tat ca" mac
  // dinh) - chi ap dung cho truong hop CHINH XAC 1 khu vuc, vi 2+ khu vuc da co che do chip rieng
  // (chon san CA nhom, khong can ep ve 1 gia tri don). Chay 1 lan luc mount la du (khu_vuc_phu_trach
  // gan nhu khong doi trong 1 phien lam viec).
  useEffect(() => {
    if (myAreas.length === 1 && value === allValue) onChange(myAreas[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (myAreas.length <= 1 || showFullList) {
    return (
      <div className="flex items-center gap-1.5">
        <Select value={value} onChange={onChange} options={options} />
        {myAreas.length > 1 && (
          <button
            type="button"
            onClick={() => setShowFullList(false)}
            className="text-xs text-[var(--ocean-600)] underline whitespace-nowrap"
          >
            ← Khu vực của tôi
          </button>
        )}
      </div>
    );
  }

  const selected = value === allValue ? myAreas : myAreas.filter((a) => value.split(",").includes(a));

  function toggle(area: string) {
    const next = selected.includes(area) ? selected.filter((a) => a !== area) : [...selected, area];
    onChange(next.length === 0 || next.length === myAreas.length ? allValue : next.join(","));
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-[var(--ink-400)]">Khu vực:</span>
      {myAreas.map((area) => {
        const active = selected.includes(area);
        return (
          <button
            key={area}
            type="button"
            onClick={() => toggle(area)}
            title={active ? "Bấm để bỏ chọn" : "Bấm để chọn"}
            className={`text-xs px-2 py-1 rounded-full border transition-colors ${
              active
                ? "bg-[var(--ocean-500)] text-white border-[var(--ocean-500)]"
                : "bg-white text-[var(--ink-400)] border-[var(--line)] hover:border-[var(--ocean-300)]"
            }`}
          >
            {area}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setShowFullList(true)}
        className="text-xs text-[var(--ocean-600)] underline whitespace-nowrap"
      >
        Xem tất cả khu vực hệ thống →
      </button>
    </div>
  );
}
