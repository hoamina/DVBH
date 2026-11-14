import type { VaiTro } from "../auth/AuthContext";
import { tr } from "../i18n/tr";


export interface NavItem {
  key: string;
  label: string;
  icon: string;
  /** Neu co, Sidebar se hien "(N)" canh nhan sau khi doi chieu voi GET /notifications/count. */
  countKey?: "backlog" | "missingParts" | "survey" | "caLap" | "napGas" | "tranhChap" | "datMuaLk";
}
export interface NavGroup {
  /** Khoa dich i18n "navGroup.<key>" (label tieng Viet giu lam mac dinh). */
  key: string;
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "tong-quan",
    label: tr("Tổng quan"),
    items: [
      { key: "dashboard", label: tr("Tổng quát"), icon: "◧" },
      { key: "revenue", label: tr("Báo cáo doanh thu"), icon: "◨" },
      { key: "luy-ke", label: tr("Báo cáo lũy kế"), icon: "📈" },
    ],
  },
  {
    key: "van-hanh",
    label: tr("Vận hành"),
    items: [
      { key: "backlog", label: tr("Quản lý tồn"), icon: "◫", countKey: "backlog" },
      { key: "missing-parts", label: tr("Ca thiếu linh kiện"), icon: "⬒", countKey: "missingParts" },
      { key: "tranh-chap", label: tr("Tranh chấp, KN"), icon: "⚖", countKey: "tranhChap" },
      { key: "nap-gas", label: tr("Đánh giá nạp gas"), icon: "🛢", countKey: "napGas" },
      { key: "survey", label: tr("Quản lý khảo sát"), icon: "◐", countKey: "survey" },
      { key: "bao-cao-vi-pham", label: tr("Báo cáo vi phạm"), icon: "🛡" },
      { key: "ca-lap", label: tr("Ca lặp"), icon: "🔁", countKey: "caLap" },
      { key: "danh-sach-tong", label: tr("Danh sách tổng"), icon: "📋" },
      { key: "ql-nskx", label: tr("QL NSKX"), icon: "💧" },
      // 2026-11-14 (migration 0170): sua doanh thu chuan / don xuat hoa don / han bao hanh - xem backend routes/suaDoanhThu.ts.
      { key: "sua-doanh-thu", label: tr("Sửa DT · HĐ · BH"), icon: "🧾" },
      // "tra-hang" la 1 tab CON cua module dat-mua-lk (App.tsx render lai DatMuaLinhKienModule voi
      // forceView) - datMuaLk badge da GOM CA bucket tra hang, chi gan countKey o "dat-mua-lk" de
      // tranh hien trung 1 con so o 2 dong sidebar gay hieu nham cong don.
      { key: "dat-mua-lk", label: tr("Đặt mua linh kiện"), icon: "◈", countKey: "datMuaLk" },
      { key: "tra-hang", label: tr("Đơn trả hàng"), icon: "↩" },
      // CHOT 2026-08-17 (migration 0082): tach khoi tab Settings (Admin-only) thanh module rieng -
      // hien theo flag quan_ly_danh_muc_lk (xem App.tsx), khong theo vai_tro mac dinh nao.
      { key: "danh-muc-lk", label: tr("Danh mục linh kiện"), icon: "🔧" },
    ],
  },
  {
    key: "he-thong",
    label: tr("Hệ thống"),
    items: [
      { key: "import", label: "Import data", icon: "⇩" },
      { key: "settings", label: "Settings", icon: "⚙" },
      { key: "users", label: tr("Quản lý User"), icon: "⚉" },
    ],
  },
  {
    key: "ca-nhan",
    label: tr("Cá nhân"),
    items: [{ key: "giao-dien", label: tr("Cài đặt cá nhân"), icon: "👤" }],
  },
];

// "giao-dien" la tuy chinh ca nhan (ten goi, gioi tinh, mau + font), khong phai quyen nghiep vu -
// cho tat ca vai tro deu thay, khong ghep chung voi trang Settings (chi Admin moi vao duoc). Giu
// nguyen key cu "giao-dien" du hien la trang rong hon (them thong tin ca nhan) de khong lam vo
// localStorage active-module dang luu cua nguoi dung hien tai.
export const ROLE_MODULES: Record<VaiTro, string[]> = {
  Admin: NAV_GROUPS.flatMap((g) => g.items.map((i) => i.key)),
  Viewer: ["dashboard", "revenue", "luy-ke", "backlog", "missing-parts", "tranh-chap", "nap-gas", "survey", "ca-lap", "danh-sach-tong", "ql-nskx", "dat-mua-lk", "sua-doanh-thu", "giao-dien"],
  QC: ["dashboard", "backlog", "missing-parts", "tranh-chap", "nap-gas", "survey", "bao-cao-vi-pham", "ca-lap", "danh-sach-tong", "ql-nskx", "dat-mua-lk", "sua-doanh-thu", "giao-dien"],
  "Giam sat": ["dashboard", "revenue", "luy-ke", "backlog", "missing-parts", "tranh-chap", "nap-gas", "bao-cao-vi-pham", "ca-lap", "danh-sach-tong", "ql-nskx", "dat-mua-lk", "tra-hang", "sua-doanh-thu", "giao-dien"],
  // "dat-mua-lk"/"tra-hang" KHONG con hardcode o day tu 2026-08-16 (migration 0081) - Tac nghiep
  // tach doc lap khoi vai_tro (xem App.tsx dong cap them tu dong theo la_tac_nghiep, khop dung
  // DEFAULT_MODULES_BY_ROLE["TBP DVBH"] o backend/src/lib/moduleAccess.ts).
  "TBP DVBH": ["dashboard", "revenue", "luy-ke", "backlog", "missing-parts", "tranh-chap", "nap-gas", "bao-cao-vi-pham", "ca-lap", "danh-sach-tong", "ql-nskx", "sua-doanh-thu", "giao-dien"],
  CSKH: ["dashboard", "survey", "danh-sach-tong", "dat-mua-lk", "sua-doanh-thu", "giao-dien"],
  "TN CSKH": ["dashboard", "survey", "danh-sach-tong", "dat-mua-lk", "sua-doanh-thu", "giao-dien"],
  "TBP CSKH": ["dashboard", "revenue", "luy-ke", "survey", "bao-cao-vi-pham", "danh-sach-tong", "sua-doanh-thu", "giao-dien"],
  // KSNB Doi tac: CHI xem (khong con giai trinh duoc, chot 2026-07-24 - xem canGiaiTrinh trong
  // App.tsx) bao cao tranh chap, khong duoc vao module nao khac (quyet dinh nghiep vu rieng - xem
  // scopeTranhChap() trong tranhChap.ts).
  "KSNB Doi tac": ["tranh-chap", "giao-dien"],
};

export const MODULE_TITLES: Record<string, string> = {
  dashboard: tr("Tổng quát"),
  revenue: tr("Báo cáo doanh thu"),
  "luy-ke": tr("Báo cáo lũy kế"),
  backlog: tr("Quản lý tồn"),
  "missing-parts": tr("Ca thiếu linh kiện"),
  "tranh-chap": tr("Tranh chấp, KN"),
  "nap-gas": tr("Đánh giá nạp gas"),
  survey: tr("Quản lý khảo sát"),
  "bao-cao-vi-pham": tr("Báo cáo vi phạm"),
  "ca-lap": tr("Ca lặp"),
  "danh-sach-tong": tr("Danh sách tổng"),
  "ql-nskx": tr("QL NSKX"),
  "sua-doanh-thu": tr("Sửa doanh thu · Xuất hóa đơn · Hạn bảo hành"),
  import: "Import data",
  settings: "Settings",
  users: tr("Quản lý User"),
  "giao-dien": tr("Cài đặt cá nhân"),
  "dat-mua-lk": tr("Đặt mua linh kiện"),
  "tra-hang": tr("Đơn trả hàng"),
  "danh-muc-lk": tr("Danh mục linh kiện"),
};
