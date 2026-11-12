// Loc + sap xep kieu Excel PHIA TRINH DUYET (2026-11-12) cho bang nho da tinh san o client (vd "Bảng chi tiết" Báo cáo lũy
// kế) - cung dinh dang LocCot va cung PaginatedTable/LocCotPopover voi bang phan trang server (backend lib/locCot.ts), chi
// khac la ap ngay tren mang dong. Chu: tim theo tu khong phan biet dau/hoa thuong; list: chon nhieu gia tri (GIA_TRI_TRONG =
// o trong); number/date: khoang tu - den (date so chuoi yyyy-mm-dd).
import { GIA_TRI_TRONG, boDau, locCotDangBat, type GiaTriLoc, type LocCot } from "../components/ui/LocCotPopover";

export type LayGiaTriCot<T> = (row: T) => string | number | null | undefined;

function khop(v: string | number | null | undefined, f: LocCot): boolean {
  const s = v === null || v === undefined ? "" : String(v);
  if (f.in?.length) return f.in.includes(s === "" ? GIA_TRI_TRONG : s);
  if (f.q?.trim()) return boDau(s).includes(boDau(f.q.trim()));
  if (f.tu || f.den) {
    if (s === "") return false;
    if (typeof v === "number") {
      if (f.tu && v < Number(f.tu)) return false;
      if (f.den && v > Number(f.den)) return false;
      return true;
    }
    if (f.tu && s < f.tu) return false;
    if (f.den && s.slice(0, f.den.length) > f.den) return false;
  }
  return true;
}

/** Ap moi bo loc cot (tru cot `boQua`, dung khi lay danh sach gia tri cho chinh cot do). */
export function locDong<T>(rows: T[], loc: Record<string, LocCot>, lay: Record<string, LayGiaTriCot<T>>, boQua?: string): T[] {
  const dangBat = Object.entries(loc).filter(([k, f]) => k !== boQua && locCotDangBat(f) && lay[k]);
  if (!dangBat.length) return rows;
  return rows.filter((r) => dangBat.every(([k, f]) => khop(lay[k](r), f)));
}

/** So sanh: so theo gia tri, chu theo thu tu tu nhien (vi, numeric - "2024-05" < "2024-06", "Tuần 2" < "Tuần 10"); o trong cuoi. */
export function sapXepDong<T>(rows: T[], lay: LayGiaTriCot<T> | undefined, dir: "asc" | "desc"): T[] {
  if (!lay) return rows;
  const k = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = lay(a);
    const y = lay(b);
    const rx = x === null || x === undefined || x === "";
    const ry = y === null || y === undefined || y === "";
    if (rx || ry) return rx === ry ? 0 : rx ? 1 : -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * k;
    return String(x).localeCompare(String(y), "vi", { numeric: true }) * k;
  });
}

/** Danh sach gia tri + so dong cua 1 cot (cho popup loc kieu "list"), da ap cac bo loc KHAC. */
export function giaTriCot<T>(rows: T[], loc: Record<string, LocCot>, lay: Record<string, LayGiaTriCot<T>>, cot: string): GiaTriLoc[] {
  const get = lay[cot];
  if (!get) return [];
  const dem = new Map<string | null, number>();
  for (const r of locDong(rows, loc, lay, cot)) {
    const v = get(r);
    const s = v === null || v === undefined || v === "" ? null : String(v);
    dem.set(s, (dem.get(s) ?? 0) + 1);
  }
  return [...dem.entries()]
    .map(([v, n]) => ({ v, n }))
    .sort((a, b) => (a.v === null ? 1 : b.v === null ? -1 : a.v.localeCompare(b.v, "vi", { numeric: true })));
}
