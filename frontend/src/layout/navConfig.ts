import type { VaiTro } from "../auth/AuthContext";

export interface NavItem {
  key: string;
  label: string;
  icon: string;
  /** Neu co, Sidebar se hien "(N)" canh nhan sau khi doi chieu voi GET /notifications/count. */
  countKey?: "backlog" | "missingParts" | "survey" | "caLap";
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Tổng quan",
    items: [
      { key: "dashboard", label: "Tổng quát", icon: "◧" },
      { key: "revenue", label: "Báo cáo doanh thu", icon: "◨" },
    ],
  },
  {
    label: "Vận hành",
    items: [
      { key: "backlog", label: "Quản lý tồn", icon: "◫", countKey: "backlog" },
      { key: "missing-parts", label: "Ca thiếu linh kiện", icon: "⬒", countKey: "missingParts" },
      { key: "survey", label: "Quản lý khảo sát", icon: "◐", countKey: "survey" },
      { key: "ca-lap", label: "Ca lặp", icon: "🔁", countKey: "caLap" },
      { key: "danh-sach-tong", label: "Danh sách tổng", icon: "📋" },
    ],
  },
  {
    label: "Hệ thống",
    items: [
      { key: "import", label: "Import data", icon: "⇩" },
      { key: "settings", label: "Settings", icon: "⚙" },
      { key: "users", label: "Quản lý User", icon: "⚉" },
      { key: "archived", label: "Ca lưu trữ", icon: "🗄" },
    ],
  },
  {
    label: "Cá nhân",
    items: [{ key: "giao-dien", label: "Cài đặt cá nhân", icon: "👤" }],
  },
];

// "giao-dien" la tuy chinh ca nhan (ten goi, gioi tinh, mau + font), khong phai quyen nghiep vu -
// cho tat ca vai tro deu thay, khong ghep chung voi trang Settings (chi Admin moi vao duoc). Giu
// nguyen key cu "giao-dien" du hien la trang rong hon (them thong tin ca nhan) de khong lam vo
// localStorage active-module dang luu cua nguoi dung hien tai.
export const ROLE_MODULES: Record<VaiTro, string[]> = {
  Admin: NAV_GROUPS.flatMap((g) => g.items.map((i) => i.key)),
  Viewer: ["dashboard", "revenue", "backlog", "missing-parts", "survey", "ca-lap", "archived", "danh-sach-tong", "giao-dien"],
  QC: ["dashboard", "backlog", "missing-parts", "survey", "ca-lap", "danh-sach-tong", "giao-dien"],
  "Giam sat": ["dashboard", "backlog", "missing-parts", "ca-lap", "danh-sach-tong", "giao-dien"],
  "TBP DVBH": ["dashboard", "revenue", "backlog", "missing-parts", "ca-lap", "danh-sach-tong", "giao-dien"],
  CSKH: ["dashboard", "survey", "danh-sach-tong", "giao-dien"],
  "TN CSKH": ["dashboard", "survey", "danh-sach-tong", "giao-dien"],
  "TBP CSKH": ["dashboard", "revenue", "survey", "danh-sach-tong", "giao-dien"],
};

export const MODULE_TITLES: Record<string, string> = {
  dashboard: "Tổng quát",
  revenue: "Báo cáo doanh thu",
  backlog: "Quản lý tồn",
  "missing-parts": "Ca thiếu linh kiện",
  survey: "Quản lý khảo sát",
  "ca-lap": "Ca lặp",
  "danh-sach-tong": "Danh sách tổng",
  import: "Import data",
  settings: "Settings",
  users: "Quản lý User",
  archived: "Ca lưu trữ",
  "giao-dien": "Cài đặt cá nhân",
};
