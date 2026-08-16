import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../components/ui/Btn";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { Tabs } from "../components/ui/Tabs";
import { Select } from "../components/ui/Select";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { api, buildQuery } from "../api/client";
import { getAllFromCache, getLastCacheTimestamp, mergeLinhKienToCache } from "../lib/linhKienCache";
import { getAllLdeFromCache, clearLdeCache, mergeLdeToCache, getOptionsForUser, type LdeEntry } from "../lib/loaiDeXuatCache";
import { fmtDateTime, fmtVND } from "../types";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/AuthContext";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { ImportUploader } from "../components/ImportUploader";
import { StatCard } from "../components/ui/StatCard";
import { shortKhuVuc } from "../lib/khuVucShortLabel";

// Module "Dat mua linh kien" (Phase 2) - thay the quy trinh dat hang linh kien tren Google
// Sheets/AppSheet, xem plan "Module Dat Mua Linh Kien". Tabs hien theo co vai tro (la_ktv_dvbh/
// la_ve_tinh/la_kho/la_ke_toan) + vai_tro chuan (Giam sat theo doi, TBP DVBH/Admin = TN tac nghiep).

// Ma loi tra ve tu applyDonHangLog (backend/src/routes/datMuaLinhKien.ts) khi 1 dong trong bulk-log
// khong hop le - dung de phan biet voi cac nextTrangThai hop le ("TN da duyet", "Cho TN duyet"...).
const BULK_LOG_ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "không tìm thấy dòng đơn hàng",
  DONG_DA_DONG: "dòng đã đóng",
  FORBIDDEN_ROLE: "không đủ quyền xử lý",
  INVALID_STATE: "sai trạng thái hiện tại",
  USE_TRA_HANG_ROUTE: "dòng trả hàng dùng tab riêng",
  MISSING_LY_DO_CHAM: "thiếu lý do chậm",
  LY_DO_CHAM_KHONG_HOP_LE: "lý do chậm không hợp lệ",
  DA_CO_CA_THIEU_LK_DANG_MO: "đã có ca thiếu linh kiện đang mở cho dòng này",
};

// Ma loi tra ve tu applyTraHangLog (backend/src/routes/traHang.ts) khi 1 dong trong bulk-log khong
// hop le - dung de phan biet voi cac nextTrangThai hop le.
const TRA_HANG_BULK_ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "không tìm thấy dòng trả hàng",
  DA_DONG: "dòng đã đóng",
  FORBIDDEN_ROLE: "không đủ quyền xử lý",
  INVALID_STATE: "sai trạng thái hiện tại",
};

// Khop response cua POST /dat-mua-lk/don-hang/import/preview|commit (them 2026-08-15, tieu chi UX
// #4) - xem processDatDonHangImportRows o backend/src/routes/datMuaLinhKien.ts.
interface DatDonHangImportSummary {
  thanhCong: number;
  loi: number;
  errors: string[];
  soPhieu: number;
  ktvList: string[];
  phieuIds?: string[];
}

interface LkDanhMucRow {
  ma_linh_kien: string;
  ten_linh_kien: string;
  // CHOT 2026-08-16 (dot 3 gop y): "Gia de xuat" lay tu gia_ban (gia ban dang quan ly chu dong),
  // KHONG con dung gia_tham_chieu.
  gia_ban: number | null;
  don_vi: string | null;
  bat_tat: number;
}

// Trang thai 1 DONG don hang - null cho dong loai_don='tra_hang' (dung tra_hang_log rieng, xem
// TraHangTab). Log dinh kem la lich su rieng cua dong do (dat_don_hang_log).
interface DonHangLogRow {
  id: number;
  dat_don_hang_id: string;
  trang_thai: string;
  nguoi_xu_ly: string;
  ngay_xu_ly: string;
  ghi_chu: string | null;
}

interface DonHangRow {
  id: string;
  phieu_dat_id: string;
  loai_don: "mua" | "cong_no" | "tra_hang";
  ma_lk: string;
  ten_lk_snapshot: string | null;
  loai_de_xuat: string | null;
  so_luong_de_xuat: number;
  so_luong_thuc_xuat: number | null;
  gia_de_xuat: number | null;
  gia_chot: number | null;
  ly_do_cham: string | null;
  ma_xuat_kho: string | null;
  ma_misa: string | null;
  so_tien_cong_no: number | null;
  nguoi_tao: string;
  // Denormalize xuong tan dong (CHOT 2026-08-15, bo khai niem "phieu dat" - migration 0075).
  nguoi_nhan_hang: string | null;
  email_gs: string | null;
  ngay_tao: string;
  // 6 truong bo sung 2026-08-14 (doi chieu Excel goc, xem migration 0070) - nguoi tao dien luc tao.
  ghi_chu: string | null;
  yeu_cau_hoa_don: string | null;
  tt_mail_duyet: string | null;
  tt_khach_hang: string | null;
  chinh_sach: string | null;
  ma_yeu_cau_su_co: string | null;
  uu_tien: number;
  trang_thai?: string | null;
  logs?: DonHangLogRow[];
  cases?: { id: string; khach_hang: string | null; khu_vuc: string | null }[];
  // Chi co tren GET /phieu-dat/:id va GET /phieu-xuat-kho/:id (tinh server-side, khong luu DB) - true
  // khi dong ton qua 24h ke tu "Cho TN duyet" ma chua duoc dien ly_do_cham (xem lib/hanLyDoCham.ts).
  qua_han_ly_do_cham?: boolean;
}

// PXK - "chuyen tien" la 1 dieu kien chan rieng tren chinh PXK (thay the bang phieu_so_tien cu, xem
// migration 0066), khong phai 1 buoc trong chuoi trang_thai chinh.
interface PhieuXuatKhoRow {
  id: string;
  ma_xuat_kho: string;
  // Dot 2 (muc C/D/E/F, migration 0077).
  ma_xuat_kho_xac_nhan: number;
  ma_misa: string | null;
  ma_van_don: string | null;
  anh_bien_ban_url: string | null;
  nguoi_tao: string;
  nguoi_nhan_hang: string | null;
  // Dot 3 gop y #8 (migration 0079) - denormalize tu dong con, null cho PXK cu truoc khi chot quy tac.
  loai_don: "mua" | "cong_no" | "tra_hang" | null;
  ngay_tao: string;
  ghi_chu: string | null;
  trang_thai: string;
  so_dong: number;
  so_tien_can_chuyen: number | null;
  trang_thai_chuyen_tien: string | null;
  bang_chung_chuyen_tien_url?: string | null;
  ngay_ktv_chuyen?: string | null;
}

interface DonHangKhaDungRow {
  id: string;
  ma_lk: string;
  ten_lk_snapshot: string | null;
  so_luong_de_xuat: number;
  gia_chot: number | null;
  gia_de_xuat: number | null;
  updated_at: string;
  nguoi_nhan_hang: string | null;
}

interface ThieuLkRow {
  id: string;
  dat_don_hang_id: string;
  ly_do_cham_id: number | null;
  ten_ly_do: string | null;
  ngay_du_kien_co_hang: string | null;
  nguoi_tao: string;
  ngay_tao: string;
  trang_thai: string;
}

interface LyDoChamRow {
  id: number;
  ten_ly_do: string;
  he_thong_su_dung: string;
  quan_ly_don_thieu_linh_kien: number;
  bat_tat: number;
}

// Dong dat_don_hang (loai_don='tra_hang'), kem trang thai rieng luong tra hang - xem
// backend/src/routes/traHang.ts (buoc 3 ke hoach "Luong tao don mua hang").
interface TraHangRow extends DonHangRow {
  trang_thai_tra_hang: string;
}

// Trang thai cua 1 DONG don hang (dat_don_hang_log) - khong con o cap phieu.
const DON_HANG_TRANG_THAI_TONE: Record<string, BadgeTone> = {
  "Cho Tram duyet": "amber",
  "Cho TN duyet": "ocean",
  "TN da duyet": "teal",
  "TN tu choi": "coral",
  "Cho hang": "amber",
  "Da huy": "gray",
};

// Phan hoi UX muc 2 (2026-08-15): to mau/gach ngang TEN LINH KIEN theo trang thai dong don hang -
// chi ap dung len phan ten (khong toan hang, tranh roi mat), StatusBadge canh ben van la diem neo
// chinh. Dung lai cac token mau san co (--coral-*/--amber-*/--teal-*), khong them mau moi.
const DON_HANG_ROW_STYLE: Record<string, string> = {
  "Da huy": "line-through text-[var(--coral-600)]",
  "TN tu choi": "line-through text-[var(--coral-600)]",
  "Cho Tram duyet": "text-[var(--amber-600)]",
  "Cho TN duyet": "text-[var(--amber-600)]",
  "Cho hang": "text-[var(--amber-700)] font-medium",
  "TN da duyet": "text-[var(--teal-600)]",
};

const PXK_TRANG_THAI_TONE: Record<string, BadgeTone> = {
  "Dang tao phieu": "ocean",
  "Cho ke toan": "amber",
  "Da chot xong don xuat": "amber",
  "Dang gui KTV": "amber",
  "KTV da nhan": "teal",
  "Ke toan huy": "gray",
  "Hang tru kho": "teal",
  "Kho da ket thuc": "teal",
};

const CHUYEN_TIEN_TONE: Record<string, BadgeTone> = {
  "Cho KTV chuyen": "amber",
  "KTV da chuyen": "ocean",
  "TN da duyet": "teal",
};

const TRA_HANG_TRANG_THAI_TONE: Record<string, BadgeTone> = {
  "Cho ke toan duyet mem": "amber",
  "Cho kho xac nhan": "amber",
  "Cho QC xac nhan": "ocean",
  "Cho TN duyet tong": "ocean",
  "Cho ke toan xac nhan nhap kho": "amber",
  "Cho kho xac nhan nhap kho": "amber",
  "Da hoan thanh": "teal",
  "Tu choi": "coral",
  "Da huy": "gray",
};

const THIEU_LK_TRANG_THAI_TONE: Record<string, BadgeTone> = {
  "Cho kho xu ly": "amber",
  "Kho da tiep nhan": "ocean",
  "Kho xac nhan hang da ve": "teal",
  "Kho tu choi sai TT": "coral",
  "Da huy bo": "gray",
  "Da ket thuc": "teal",
};

function StatusBadge({ value, tones }: { value: string; tones: Record<string, BadgeTone> }) {
  return <Badge tone={tones[value] ?? "gray"}>{value}</Badge>;
}

// Dot 3 gop y #7: hien ten KTV thay vi email tho khap module. Dung chung 1 nguon
// (GET /dat-mua-lk/nguoi-nhan-hang-kha-dung, da mo cho moi nguoi da dang nhap - xem backend) build
// Map email -> {ma_ktv, ten_hien_thi}, dung react-query cache mac dinh (khong can fetch lai nhieu lan
// vi cac component deu dung chung 1 queryKey).
type KtvDisplayMap = Map<string, { ma_ktv: string; ten_hien_thi: string | null }>;

function useKtvDisplayMap(): KtvDisplayMap {
  const { data } = useQuery({
    queryKey: ["dat-mua-lk-nguoi-nhan-hang-kha-dung"],
    queryFn: () => api.get<{ rows: { ma_ktv: string; ten_hien_thi: string | null; email_dang_nhap: string }[] }>("/dat-mua-lk/nguoi-nhan-hang-kha-dung"),
  });
  return new Map((data?.rows ?? []).map((r) => [r.email_dang_nhap, { ma_ktv: r.ma_ktv, ten_hien_thi: r.ten_hien_thi }]));
}

function formatNguoiDisplay(email: string, map: KtvDisplayMap): string {
  const entry = map.get(email);
  if (!entry) return email;
  return `👤 (${entry.ma_ktv}) ${entry.ten_hien_thi ?? email}`;
}

// Breakdown "viec can xu ly" theo tung loai (tieu chi UX #1/#2, them 2026-08-15) - khop dung shape
// DatMuaLkBreakdown o backend/src/routes/notifications.ts (GET /dat-mua-lk/tom-tat tai dung cung
// ham/cache voi badge sidebar nen luon dong bo so lieu).
interface DatMuaLkBreakdown {
  total: number;
  choTnDuyet: number;
  choTnTraHang: number;
  choKhoThieuLk: number;
  choKhoPxk: number;
  choKhoTraHang: number;
  choKeToanPxk: number;
  choKeToanTraHang: number;
  choQcTraHang: number;
  choTramDuyet: number;
}

interface JumpTarget {
  tab: string;
  filter: string;
  // Loc them theo "nguoi nhan hang" (KTV) khi nhay tu 1 dong trong tab "Bao cao" (phan hoi UX
  // 2026-08-15, dot nang cap tab rieng) - undefined = khong loc theo KTV.
  nguoiNhanHang?: string;
}

// 12 chi so, 1 dong = 1 KTV (phan hoi UX muc 6, nang cap 2026-08-15: tach theo KTV cho GS/TN/Kho/Ke
// toan) - khop shape GET /dat-mua-lk/bao-cao-tong-the (backend/src/routes/datMuaLinhKien.ts).
interface BaoCaoRow {
  email: string;
  ten: string | null;
  slDon: number;
  slDeXuat: number;
  slTuChoi: number;
  slDuyet: number;
  slThucDuyet: number;
  tongTienThucTe: number;
  tongTienDatMua: number;
  tongChoChuyen: number;
  slChoKeToan: number;
  slChoKhoGui: number;
  slDaGui: number;
  slDaXacNhan: number;
}

// Thanh tom tat "viec can xu ly" o dau module - moi pill nhay dung tab + filter dich (tieu chi UX
// #2), tai dung dung cac chuoi trang_thai da co san trong tung tab (xem cac Select filterTrangThai
// ben duoi). 2 bucket "tra hang" gop tu 2 trang thai (Kho/Ke toan deu co "...nhap kho" phia sau) chi
// nhay ve trang thai CHINH (buoc dau, pho bien hon) vi filter cua tab chi chon duoc 1 gia tri.
function SummaryStrip({ pills, onJump }: { pills: { key: string; label: string; count: number; tab: string; filter: string }[]; onJump: (t: JumpTarget) => void }) {
  if (pills.length === 0) return null;
  return (
    <div className="flex gap-2 flex-wrap mb-3">
      {pills.map((p) => (
        <button
          key={p.key}
          onClick={() => onJump({ tab: p.tab, filter: p.filter })}
          className={`focus-ring flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
            p.count > 0
              ? "bg-[var(--coral-50,#fff1ee)] border-[var(--coral-300,#f3a08c)] text-[var(--coral-700,#a3401f)] hover:brightness-95"
              : "bg-[var(--surface-100)] border-[var(--line)] text-[var(--ink-500)] hover:bg-[var(--surface-200)]"
          }`}
        >
          {p.label}
          <span className="tabular-nums">({p.count})</span>
        </button>
      ))}
    </div>
  );
}

// Tab "Bao cao" (nang cap 2026-08-15 thanh tab rieng + bang theo KTV cho GS/TN/Kho/Ke toan, click 1
// con so nhay sang danh sach chi tiet kem san filter). rows.length<=1 (KTV/Ve tinh tu xem minh) ->
// luoi StatCard 3 nhom; rows.length>1 (GS/TN/Kho/Ke toan) -> bang co tim kiem, sap xep theo ton dong,
// moi o so la nut bam nhay sang tab+filter+nguoiNhanHang tuong ung.
function BaoCaoTab({ onJump }: { onJump: (t: JumpTarget) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dat-mua-lk-bao-cao-tong-the"],
    queryFn: () => api.get<{ rows: BaoCaoRow[] }>("/dat-mua-lk/bao-cao-tong-the"),
  });
  const [search, setSearch] = useState("");

  const rows = data?.rows ?? [];
  if (isLoading) return <div className="text-sm text-[var(--ink-500)] py-6 text-center mt-4">Đang tải...</div>;
  if (rows.length === 0) return <div className="text-sm text-[var(--ink-400)] py-6 text-center mt-4">Chưa có dữ liệu.</div>;

  if (rows.length <= 1) {
    const r = rows[0];
    return (
      <div className="mt-4 space-y-4">
        <div>
          <div className="text-xs font-semibold text-[var(--ink-500)] uppercase tracking-wide mb-1.5">Đơn hàng</div>
          <div className="flex gap-2 sm:gap-3 flex-wrap">
            <StatCard label="SL đơn" value={r.slDon} tone="ocean" onClick={() => onJump({ tab: "don-cua-toi", filter: "", nguoiNhanHang: r.email })} />
            <StatCard label="SL đề xuất/đã đặt" value={r.slDeXuat} tone="ocean" onClick={() => onJump({ tab: "don-cua-toi", filter: "", nguoiNhanHang: r.email })} />
            <StatCard label="SL bị từ chối" value={r.slTuChoi} tone="coral" muted={r.slTuChoi === 0} onClick={() => onJump({ tab: "don-cua-toi", filter: "TN tu choi", nguoiNhanHang: r.email })} />
            <StatCard label="SL được duyệt" value={r.slDuyet} tone="teal" onClick={() => onJump({ tab: "don-cua-toi", filter: "TN da duyet", nguoiNhanHang: r.email })} />
            <StatCard label="SL thực duyệt" value={r.slThucDuyet} tone="teal" onClick={() => onJump({ tab: "don-cua-toi", filter: "TN da duyet", nguoiNhanHang: r.email })} />
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-[var(--ink-500)] uppercase tracking-wide mb-1.5">Tiền</div>
          <div className="flex gap-2 sm:gap-3 flex-wrap">
            <StatCard label="Tổng tiền thực tế" value={fmtVND(r.tongTienThucTe)} tone="teal" onClick={() => onJump({ tab: "don-cua-toi", filter: "TN da duyet", nguoiNhanHang: r.email })} />
            <StatCard label="Tổng chờ chuyển" value={fmtVND(r.tongChoChuyen)} tone="amber" muted={r.tongChoChuyen === 0} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "", nguoiNhanHang: r.email })} />
            <StatCard label="Tổng tiền đặt mua" value={fmtVND(r.tongTienDatMua)} tone="ocean" onClick={() => onJump({ tab: "don-cua-toi", filter: "", nguoiNhanHang: r.email })} />
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-[var(--ink-500)] uppercase tracking-wide mb-1.5">Xuất kho</div>
          <div className="flex gap-2 sm:gap-3 flex-wrap">
            <StatCard label="SL đang chờ kế toán" value={r.slChoKeToan} tone="amber" muted={r.slChoKeToan === 0} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "Cho ke toan", nguoiNhanHang: r.email })} />
            <StatCard label="SL đang chờ kho gửi" value={r.slChoKhoGui} tone="amber" muted={r.slChoKhoGui === 0} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "Da chot xong don xuat", nguoiNhanHang: r.email })} />
            <StatCard label="SL đã gửi" value={r.slDaGui} tone="ocean" onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "Dang gui KTV", nguoiNhanHang: r.email })} />
            <StatCard label="SL đã xác nhận" value={r.slDaXacNhan} tone="teal" onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "KTV da nhan", nguoiNhanHang: r.email })} />
          </div>
        </div>
      </div>
    );
  }

  // Ton dong = don chua xong (tru duyet/tu choi) + dong dang di qua PXK chua toi tay KTV. Sap xep
  // giam dan de day nguoi con nhieu viec len dau (chot voi chu he thong).
  function tonDong(r: BaoCaoRow) {
    return Math.max(0, r.slDon - r.slDuyet - r.slTuChoi) + r.slChoKeToan + r.slChoKhoGui + r.slDaGui;
  }
  const q = search.trim().toLowerCase();
  const filtered = rows.filter((r) => !q || (r.ten ?? "").toLowerCase().includes(q) || r.email.toLowerCase().includes(q));
  const sorted = [...filtered].sort((a, b) => tonDong(b) - tonDong(a) || (a.ten ?? a.email).localeCompare(b.ten ?? b.email));

  const tong = rows.reduce(
    (acc, r) => ({
      slDon: acc.slDon + r.slDon,
      slDeXuat: acc.slDeXuat + r.slDeXuat,
      slTuChoi: acc.slTuChoi + r.slTuChoi,
      slDuyet: acc.slDuyet + r.slDuyet,
      slThucDuyet: acc.slThucDuyet + r.slThucDuyet,
      tongTienThucTe: acc.tongTienThucTe + r.tongTienThucTe,
      tongTienDatMua: acc.tongTienDatMua + r.tongTienDatMua,
      tongChoChuyen: acc.tongChoChuyen + r.tongChoChuyen,
      slChoKeToan: acc.slChoKeToan + r.slChoKeToan,
      slChoKhoGui: acc.slChoKhoGui + r.slChoKhoGui,
      slDaGui: acc.slDaGui + r.slDaGui,
      slDaXacNhan: acc.slDaXacNhan + r.slDaXacNhan,
    }),
    { slDon: 0, slDeXuat: 0, slTuChoi: 0, slDuyet: 0, slThucDuyet: 0, tongTienThucTe: 0, tongTienDatMua: 0, tongChoChuyen: 0, slChoKeToan: 0, slChoKhoGui: 0, slDaGui: 0, slDaXacNhan: 0 },
  );

  function Num({ value, onClick }: { value: number | string; onClick: () => void }) {
    return (
      <button onClick={onClick} className="focus-ring text-[var(--ocean-600)] font-semibold hover:underline tabular-nums">
        {value}
      </button>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Tìm theo tên/email KTV..."
        className="focus-ring w-full sm:w-72 bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
      />
      <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-[var(--surface-100)] text-[var(--ink-600)]">
              <th className="px-3 py-2 text-left" rowSpan={2}>KTV</th>
              <th className="px-3 py-1 text-center border-l border-[var(--line)]" colSpan={5}>Đơn hàng</th>
              <th className="px-3 py-1 text-center border-l border-[var(--line)]" colSpan={3}>Tiền</th>
              <th className="px-3 py-1 text-center border-l border-[var(--line)]" colSpan={4}>Xuất kho</th>
            </tr>
            <tr className="bg-[var(--surface-100)] text-[var(--ink-600)]">
              <th className="px-2 py-1.5 text-right border-l border-[var(--line)]">SL đơn</th>
              <th className="px-2 py-1.5 text-right">SL đề xuất</th>
              <th className="px-2 py-1.5 text-right">Từ chối</th>
              <th className="px-2 py-1.5 text-right">Duyệt</th>
              <th className="px-2 py-1.5 text-right">Thực duyệt</th>
              <th className="px-2 py-1.5 text-right border-l border-[var(--line)]">Tiền thực tế</th>
              <th className="px-2 py-1.5 text-right">Chờ chuyển</th>
              <th className="px-2 py-1.5 text-right">Tiền đặt mua</th>
              <th className="px-2 py-1.5 text-right border-l border-[var(--line)]">Chờ kế toán</th>
              <th className="px-2 py-1.5 text-right">Chờ kho gửi</th>
              <th className="px-2 py-1.5 text-right">Đã gửi</th>
              <th className="px-2 py-1.5 text-right">Đã xác nhận</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.email} className="border-t border-[var(--line)] hover:bg-[var(--surface-100)]/60">
                <td className="px-3 py-1.5 font-medium whitespace-nowrap">{r.ten || r.email}</td>
                <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={r.slDon} onClick={() => onJump({ tab: "don-cua-toi", filter: "", nguoiNhanHang: r.email })} /></td>
                <td className="px-2 py-1.5 text-right"><Num value={r.slDeXuat} onClick={() => onJump({ tab: "don-cua-toi", filter: "", nguoiNhanHang: r.email })} /></td>
                <td className="px-2 py-1.5 text-right"><Num value={r.slTuChoi} onClick={() => onJump({ tab: "don-cua-toi", filter: "TN tu choi", nguoiNhanHang: r.email })} /></td>
                <td className="px-2 py-1.5 text-right"><Num value={r.slDuyet} onClick={() => onJump({ tab: "don-cua-toi", filter: "TN da duyet", nguoiNhanHang: r.email })} /></td>
                <td className="px-2 py-1.5 text-right"><Num value={r.slThucDuyet} onClick={() => onJump({ tab: "don-cua-toi", filter: "TN da duyet", nguoiNhanHang: r.email })} /></td>
                <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={fmtVND(r.tongTienThucTe)} onClick={() => onJump({ tab: "don-cua-toi", filter: "TN da duyet", nguoiNhanHang: r.email })} /></td>
                <td className="px-2 py-1.5 text-right"><Num value={fmtVND(r.tongChoChuyen)} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "", nguoiNhanHang: r.email })} /></td>
                <td className="px-2 py-1.5 text-right"><Num value={fmtVND(r.tongTienDatMua)} onClick={() => onJump({ tab: "don-cua-toi", filter: "", nguoiNhanHang: r.email })} /></td>
                <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={r.slChoKeToan} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "Cho ke toan", nguoiNhanHang: r.email })} /></td>
                <td className="px-2 py-1.5 text-right"><Num value={r.slChoKhoGui} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "Da chot xong don xuat", nguoiNhanHang: r.email })} /></td>
                <td className="px-2 py-1.5 text-right"><Num value={r.slDaGui} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "Dang gui KTV", nguoiNhanHang: r.email })} /></td>
                <td className="px-2 py-1.5 text-right"><Num value={r.slDaXacNhan} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "KTV da nhan", nguoiNhanHang: r.email })} /></td>
              </tr>
            ))}
            <tr className="border-t-2 border-[var(--line)] bg-[var(--surface-100)] font-semibold">
              <td className="px-3 py-1.5">Tổng cộng</td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={tong.slDon} onClick={() => onJump({ tab: "don-cua-toi", filter: "" })} /></td>
              <td className="px-2 py-1.5 text-right"><Num value={tong.slDeXuat} onClick={() => onJump({ tab: "don-cua-toi", filter: "" })} /></td>
              <td className="px-2 py-1.5 text-right"><Num value={tong.slTuChoi} onClick={() => onJump({ tab: "don-cua-toi", filter: "TN tu choi" })} /></td>
              <td className="px-2 py-1.5 text-right"><Num value={tong.slDuyet} onClick={() => onJump({ tab: "don-cua-toi", filter: "TN da duyet" })} /></td>
              <td className="px-2 py-1.5 text-right"><Num value={tong.slThucDuyet} onClick={() => onJump({ tab: "don-cua-toi", filter: "TN da duyet" })} /></td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={fmtVND(tong.tongTienThucTe)} onClick={() => onJump({ tab: "don-cua-toi", filter: "TN da duyet" })} /></td>
              <td className="px-2 py-1.5 text-right"><Num value={fmtVND(tong.tongChoChuyen)} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "" })} /></td>
              <td className="px-2 py-1.5 text-right"><Num value={fmtVND(tong.tongTienDatMua)} onClick={() => onJump({ tab: "don-cua-toi", filter: "" })} /></td>
              <td className="px-2 py-1.5 text-right border-l border-[var(--line)]"><Num value={tong.slChoKeToan} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "Cho ke toan" })} /></td>
              <td className="px-2 py-1.5 text-right"><Num value={tong.slChoKhoGui} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "Da chot xong don xuat" })} /></td>
              <td className="px-2 py-1.5 text-right"><Num value={tong.slDaGui} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "Dang gui KTV" })} /></td>
              <td className="px-2 py-1.5 text-right"><Num value={tong.slDaXacNhan} onClick={() => onJump({ tab: "phieu-xuat-kho", filter: "KTV da nhan" })} /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DatMuaLinhKienModule({
  forceView,
  openCase,
}: { forceView?: string; openCase?: (id: string, tab?: string) => void } = {}) {
  const auth = useAuth();
  const user = auth.status === "authenticated" ? auth.user : null;
  const addToast = useToast();
  const qc = useQueryClient();

  const canTacNghiep = user?.vai_tro === "TBP DVBH" || user?.vai_tro === "Admin";
  const isGiamSat = user?.vai_tro === "Giam sat";
  // UI xem chi tiet ca (case_dvbh, du lieu CRM noi bo) khong danh cho KTV/CTV/Tram (deu la co
  // la_ktv_dvbh/la_ve_tinh) - chot voi chu he thong 2026-08-15: cot "Ma yeu cau su co" van hien gia
  // tri cho nhom nay, chi khong bam mo duoc. Kho/Ke toan/QC/GS/TN/Admin van xem duoc binh thuong.
  const canXemChiTietCa = !(user?.la_ktv_dvbh || user?.la_ve_tinh);
  // "canDatHo" (tao ho, xem "nguoi nhan hang") = KTV/Ve tinh tu tao + TN/GS tao ho - khop dung
  // canQuanLyDonHo() backend. Tach rieng khoi "canBulkTram" (quyen bulk-duyet o "Don cua toi"):
  // truoc day 2 quyen nay dung CHUNG 1 bien canCreatePhieuDat nen khi them Giam sat vao de mo tab
  // "Tao phieu dat" (bug rieng phien 14/8 - GS khong vao duoc du TaoDonTab/canQuanLy da ho tro san),
  // GS se VO TINH duoc ca giao dien bulk-duyet Tram (backend van chan dung FORBIDDEN_ROLE vi GS
  // khong phai tram_cha cua ai, nhung nut se luon that bai - trai UX). canBulkTram GIU NGUYEN tap
  // vai tro cu (KTV/Ve tinh/TN/Admin, khong Giam sat).
  const canDatHo = !!(user?.la_ktv_dvbh || user?.la_ve_tinh || canTacNghiep || isGiamSat);
  const canKho = !!user?.la_kho || user?.vai_tro === "Admin";
  const canKeToan = !!user?.la_ke_toan || user?.vai_tro === "Admin";
  const canQC = user?.vai_tro === "QC" || user?.vai_tro === "Admin";

  // Tab "Tao phieu dat" rieng da bo (2026-08-15, phan hoi UX #12) - gop thanh nut "+ Tao don" mo
  // Modal ngay trong "Don cua toi/Danh sach" (xem DonCuaToiTab) de toan bo xu ly nam tren 1 man
  // hinh, tranh loang thong tin.
  const tabs = [
    { key: "don-cua-toi", label: "Đơn của tôi / Danh sách" },
    // Giam sat them vao 2 tab duoi - CHI de theo doi (khong co canTacNghiep/canKho/canKeToan/canQC
    // rieng nen khong nut hanh dong nao hien ra, xem PxkDetailModal/TraHangTab).
    ...(canTacNghiep || canKho || canKeToan || isGiamSat ? [{ key: "phieu-xuat-kho", label: "Phiếu xuất kho" }] : []),
    { key: "thieu-lk", label: "Thiếu linh kiện" },
    ...(canTacNghiep || canKho || canKeToan || canQC || isGiamSat ? [{ key: "tra-hang", label: "Đơn trả hàng" }] : []),
    // Tab rieng cho 12 chi so tong quan (phan hoi UX muc 6, nang cap 2026-08-15) - luon hien, noi
    // dung tu doi theo vai tro qua API (KTV/Ve tinh: the tong hop; GS/TN/Kho/Ke toan: bang theo KTV).
    { key: "bao-cao", label: "Báo cáo" },
  ];
  // Tab "hang cho" mac dinh THEO VAI TRO - Kho/Ke toan/QC "thuan" truoc day luon roi vao "Don cua
  // toi" - tab khong lien quan gi den viec cua ho (viec that o "Thieu linh kien"/"Phieu xuat kho"/
  // "Don tra hang"). Chi anh huong LAN DAU vao module (useLocalStorageState chi doc default nay khi
  // chua co gia tri luu san), nhung tu do khong bao gio tu doi lai (dung y muon).
  const defaultView = canKho
    ? "thieu-lk"
    : canKeToan
      ? "phieu-xuat-kho"
      : canQC
        ? "tra-hang"
        : (tabs[0]?.key ?? "don-cua-toi");
  const [view, setView] = useLocalStorageState("filters:dat-mua-lk-view", defaultView);
  const activeView = forceView && tabs.some((t) => t.key === forceView) ? forceView : tabs.some((t) => t.key === view) ? view : tabs[0]?.key ?? "don-cua-toi";

  // Thanh tom tat + nhay dung tab/filter (tieu chi UX #1/#2) - jumpTarget tieu thu 1 lan roi tu xoa
  // (setTimeout 0 chay sau khi effect cua tab con da doc prop initialFilterOverride trong cung 1 luot
  // flush), tranh ap lai gia tri cu moi lan re-render.
  const [jumpTarget, setJumpTarget] = useState<JumpTarget | null>(null);
  useEffect(() => {
    if (!jumpTarget) return;
    const t = setTimeout(() => setJumpTarget(null), 0);
    return () => clearTimeout(t);
  }, [jumpTarget]);
  function jumpTo(target: JumpTarget) {
    setJumpTarget(target);
    setView(target.tab);
  }
  const filterFor = (tab: string) => (jumpTarget?.tab === tab ? jumpTarget.filter : undefined);
  const nguoiNhanHangFor = (tab: string) => (jumpTarget?.tab === tab ? jumpTarget.nguoiNhanHang : undefined);

  const { data: summary } = useQuery({
    queryKey: ["dat-mua-lk-tom-tat"],
    queryFn: () => api.get<DatMuaLkBreakdown>("/dat-mua-lk/tom-tat"),
    refetchInterval: 5 * 60_000,
  });

  const summaryPills: { key: string; label: string; count: number; tab: string; filter: string }[] = [];
  if (summary && canTacNghiep) {
    summaryPills.push({ key: "choTnDuyet", label: "Chờ TN duyệt", count: summary.choTnDuyet, tab: "don-cua-toi", filter: "Cho TN duyet" });
    summaryPills.push({ key: "choTnTraHang", label: "Chờ TN duyệt trả hàng", count: summary.choTnTraHang, tab: "tra-hang", filter: "Cho TN duyet tong" });
  }
  if (summary && canKho) {
    summaryPills.push({ key: "choKhoThieuLk", label: "Chờ kho xử lý thiếu LK", count: summary.choKhoThieuLk, tab: "thieu-lk", filter: "Cho kho xu ly" });
    summaryPills.push({ key: "choKhoPxk", label: "Chờ kho chốt PXK", count: summary.choKhoPxk, tab: "phieu-xuat-kho", filter: "Da chot xong don xuat" });
    summaryPills.push({ key: "choKhoTraHang", label: "Chờ kho xác nhận trả hàng", count: summary.choKhoTraHang, tab: "tra-hang", filter: "Cho kho xac nhan" });
  }
  if (summary && canKeToan) {
    summaryPills.push({ key: "choKeToanPxk", label: "Chờ kế toán duyệt PXK", count: summary.choKeToanPxk, tab: "phieu-xuat-kho", filter: "Cho ke toan" });
    summaryPills.push({ key: "choKeToanTraHang", label: "Chờ kế toán trả hàng", count: summary.choKeToanTraHang, tab: "tra-hang", filter: "Cho ke toan duyet mem" });
  }
  if (summary && canQC) {
    summaryPills.push({ key: "choQcTraHang", label: "Chờ QC xác nhận trả hàng", count: summary.choQcTraHang, tab: "tra-hang", filter: "Cho QC xac nhan" });
  }
  // Bucket Tram chi hien khi THUC SU co dong cho duyet (khac cac bucket tren, khong co co san 1 bien
  // "la Tram" don gian o cap module - xem comment computeDatMuaLkBreakdown backend).
  if (summary && summary.choTramDuyet > 0) {
    summaryPills.push({ key: "choTramDuyet", label: "Chờ Trạm duyệt", count: summary.choTramDuyet, tab: "don-cua-toi", filter: "Cho Tram duyet" });
  }

  return (
    <div className="anim-in">
      <SummaryStrip pills={summaryPills} onJump={jumpTo} />
      <Tabs active={activeView} onChange={setView} tabs={tabs} />
      {activeView === "don-cua-toi" && (
        <DonCuaToiTab
          user={user}
          addToast={addToast}
          qc={qc}
          canTacNghiep={canTacNghiep}
          canBulkTram={!!(user?.la_ktv_dvbh || user?.la_ve_tinh || canTacNghiep) && !user?.tram_cha}
          canDatHo={canDatHo}
          isGiamSat={isGiamSat}
          canXemChiTietCa={canXemChiTietCa}
          openCase={openCase}
          initialFilterOverride={filterFor("don-cua-toi")}
          initialNguoiNhanHangOverride={nguoiNhanHangFor("don-cua-toi")}
        />
      )}
      {activeView === "phieu-xuat-kho" && (
        <PhieuXuatKhoTab
          addToast={addToast}
          qc={qc}
          canTacNghiep={canTacNghiep}
          canKho={canKho}
          canKeToan={canKeToan}
          currentEmail={user?.email ?? ""}
          isAdmin={user?.vai_tro === "Admin"}
          initialFilterOverride={filterFor("phieu-xuat-kho")}
          initialNguoiNhanHangOverride={nguoiNhanHangFor("phieu-xuat-kho")}
        />
      )}
      {activeView === "thieu-lk" && (
        <ThieuLkTab addToast={addToast} qc={qc} canKho={canKho} canTacNghiep={canTacNghiep} currentEmail={user?.email ?? ""} initialFilterOverride={filterFor("thieu-lk")} />
      )}
      {activeView === "tra-hang" && (
        <TraHangTab addToast={addToast} qc={qc} canKeToan={canKeToan} canKho={canKho} canQC={canQC} canTacNghiep={canTacNghiep} initialFilterOverride={filterFor("tra-hang")} />
      )}
      {activeView === "bao-cao" && <BaoCaoTab onJump={jumpTo} />}
    </div>
  );
}

// ---------- Tab "Tao don" ----------

function deriveLoaiDon(v: string): "mua" | "cong_no" | "tra_hang" {
  if (v.includes("TRẢ HÀNG")) return "tra_hang";
  if (v.includes("CÔNG NỢ") || v.includes("HỖ TRỢ") || v.includes("TRỪ CÔNG NỢ") || v.includes("THẺ BẢO HÀNH"))
    return "cong_no";
  return "mua";
}

// Mau/nhan theo loai don - dung lai 3 tone san co cua Badge.tsx (khong them token mau moi), giup
// phan biet nhanh cac dong trong 1 phieu (phan hoi UX 2026-08-15 dot 2: giao diem qua nhat nhoa).
const LOAI_DON_TONE: Record<ReturnType<typeof deriveLoaiDon>, { tone: BadgeTone; label: string; border: string }> = {
  mua: { tone: "ocean", label: "Mua hàng", border: "border-l-[var(--ocean-400)]" },
  cong_no: { tone: "amber", label: "Công nợ", border: "border-l-[var(--amber-500)]" },
  tra_hang: { tone: "coral", label: "Trả hàng", border: "border-l-[var(--coral-500)]" },
};

// Chinh sach + Ma yeu cau su co bat buoc khi Loai de xuat la cong no THAT (chua "CONG NO") nhung
// khong phai luong tra hang (da co "TRA HANG") - chot 2026-08-15, doi xung voi validate phia server
// (POST /phieu-dat, processDatDonHangImportRows trong datMuaLinhKien.ts).
function canNoRequired(loaiDeXuat: string): boolean {
  return loaiDeXuat.includes("CÔNG NỢ") && !loaiDeXuat.includes("TRẢ HÀNG");
}

// To mau nhat quan cho nhan cac truong BAT BUOC (dot 3 gop y tong the: "to mau/noi bat gia tri bat
// buoc") - dung 1 kieu nhan duy nhat (mau coral khi con trong) thay vi chi 2 truong cu (Chinh sach/
// Ma yeu cau su co) co ma "*" con cac truong bat buoc khac (Ma LK/Loai de xuat/So luong) khong co.
function reqLabelClass(missing: boolean): string {
  return `block text-[11px] font-semibold mb-1 ${missing ? "text-[var(--coral-600)]" : "text-[var(--ink-600)]"}`;
}

// Tim option Loai de xuat khop 3 nut bam nhanh pho bien nhat (MUA HANG/CONG NO/TRU CONG NO) - khop
// ca bien the co tien to ngoac nhu "(TBP DONG Y) MUA HANG" cho TN/Admin lan chuoi thuan cho KTV
// (xem migration 0061_loai_de_xuat_settings.sql).
function pickLdeQuick(options: string[], keyword: string): string | undefined {
  return options.find((o) => o.replace(/^\([^)]*\)\s*/, "").trim() === keyword);
}

// YEU_CAU_HOA_DON_OPTIONS/CHINH_SACH_OPTIONS: gia tri co dinh theo sheet "Settings" file Excel goc
// (khong doi duoc qua Settings module - khac loai_de_xuat, danh sach nay it thay doi va gan chat voi
// logic nghiep vu chinh_sach/yeu_cau_hoa_don, khong can quan ly dong nhu loai_de_xuat).
const YEU_CAU_HOA_DON_OPTIONS = ["Không", "Yêu cầu hóa đơn (KTV không thu phí dịch vụ)", "Yêu cầu hóa đơn (KTV có thu phí dịch vụ)"];
const CHINH_SACH_OPTIONS = ["Trong CSBH", "Ngoài CSBH"];
// Nhan rut gon cho 3 nut tich chon YCHD (dot 3 gop y #4) - gia tri luu DB VAN la chuoi day du o
// YEU_CAU_HOA_DON_OPTIONS, chi doi nhan HIEN THI cho gon.
const YEU_CAU_HOA_DON_SHORT_LABELS: Record<string, string> = {
  "Không": "Không",
  "Yêu cầu hóa đơn (KTV không thu phí dịch vụ)": "HĐ - Không thu phí",
  "Yêu cầu hóa đơn (KTV có thu phí dịch vụ)": "HĐ - Có thu phí",
};

interface DonHangDraft {
  ma_lk: string;
  loai_de_xuat: string;
  so_luong_de_xuat: number;
  // 6 truong bo sung 2026-08-14 (doi chieu Excel goc, xem migration 0070) - deu do nguoi tao dien
  // luc tao, khong sua duoc sau do. KHONG con ly_do_cham o day (chuyen sang TAC NGHIEP dien qua PATCH
  // /don-hang/:id khi dong ton qua 24h - xem PxkDetailModal). KHONG con so_tien_cong_no (chot
  // 2026-08-15: bo o nhap tay, thay bang "Gia de xuat uoc tinh" tu tinh tu gia_ban*so_luong,
  // xem cho render duoi).
  ghi_chu: string;
  yeu_cau_hoa_don: string;
  tt_mail_duyet: string;
  tt_khach_hang: string;
  chinh_sach: string;
  ma_yeu_cau_su_co: string;
  // Danh dau don uu tien (chot 2026-08-16, dot 3 gop y) - tich rieng TUNG dong, khong anh huong sap
  // xep, chi de hien thi/to mau noi bat.
  uu_tien: boolean;
}

function emptyDraft(): DonHangDraft {
  return {
    ma_lk: "", loai_de_xuat: "", so_luong_de_xuat: 1,
    ghi_chu: "", yeu_cau_hoa_don: YEU_CAU_HOA_DON_OPTIONS[0], tt_mail_duyet: "", tt_khach_hang: "", chinh_sach: "", ma_yeu_cau_su_co: "",
    uu_tien: false,
  };
}

// Goi y ma LK cung nhom thay the - buoc 2 ke hoach "Luong tao don mua hang", ap dung cho MOI nguoi
// dung (khong rieng Kho/TN). GS/TN co them nut "Them vao nhom thay the" de bo sung nhanh tai day.
function ThayTheGoiY({ maLk, canQuanLy, addToast }: { maLk: string; canQuanLy: boolean; addToast: (msg: string) => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["lk-thay-the", maLk],
    queryFn: () => api.get<{ rows: LkDanhMucRow[] }>(`/lk-settings/thay-the/${encodeURIComponent(maLk)}`),
  });
  const { data: nhomData } = useQuery({
    queryKey: ["lk-nhom-thay-the"],
    queryFn: () => api.get<{ rows: { id: number; ten_nhom: string; ma_lk_list: string[] }[] }>("/lk-settings/nhom-thay-the"),
    enabled: canQuanLy,
  });

  const themVaoNhom = useMutation({
    mutationFn: (nhomId: number) => {
      const nhom = nhomData?.rows.find((n) => n.id === nhomId);
      const maLkList = Array.from(new Set([...(nhom?.ma_lk_list ?? []), maLk]));
      return api.patch(`/lk-settings/nhom-thay-the/${nhomId}`, { ma_lk_list: maLkList });
    },
    onSuccess: () => {
      addToast(`Đã thêm ${maLk} vào nhóm thay thế`);
      qc.invalidateQueries({ queryKey: ["lk-nhom-thay-the"] });
      qc.invalidateQueries({ queryKey: ["lk-thay-the", maLk] });
    },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });

  const rows = data?.rows ?? [];

  return (
    <div className="col-span-2 sm:col-span-6 -mt-1 text-xs flex items-center gap-2 flex-wrap">
      {rows.length > 0 && (
        <span className="text-[var(--ink-500)]">
          Có thể thay thế bằng: {rows.map((r) => `${r.ma_linh_kien} - ${r.ten_linh_kien}`).join(", ")}
        </span>
      )}
      {canQuanLy && (nhomData?.rows.length ?? 0) > 0 && (
        <Select
          value=""
          onChange={(v) => v && themVaoNhom.mutate(Number(v))}
          options={[
            { value: "", label: "+ Thêm vào nhóm thay thế" },
            ...(nhomData?.rows ?? []).map((n) => ({ value: String(n.id), label: n.ten_nhom })),
          ]}
        />
      )}
    </div>
  );
}

// Dung chung boi TaoDonTab (luon tai) va DonHangDetailModal (chi tai khi nguoi tao mo che do sua -
// tach thanh hook rieng de khong lap logic dong bo cache 2 noi, tranh lech neu sua sau nay).
function useLkAndLdeCache(enabled: boolean) {
  const [danhMuc, setDanhMuc] = useState<LkDanhMucRow[]>([]);
  const [ldeEntries, setLdeEntries] = useState<LdeEntry[]>([]);
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!enabled || syncedRef.current) return;
    syncedRef.current = true;

    (async () => {
      // LK cache
      const cached = await getAllFromCache();
      if (cached.length > 0) {
        setDanhMuc(cached.filter((r) => r.bat_tat) as unknown as LkDanhMucRow[]);
      }
      const since = await getLastCacheTimestamp();
      const url = since ? `/lk-settings/danh-muc?since=${encodeURIComponent(since)}` : "/lk-settings/danh-muc";
      const { rows } = await api.get<{ rows: LkDanhMucRow[] }>(url);
      if (rows.length > 0) {
        await mergeLinhKienToCache(rows as unknown as import("../types").LinhKienRow[]);
        setDanhMuc((prev) => {
          const map = new Map(prev.map((r) => [r.ma_linh_kien, r]));
          for (const r of rows) map.set(r.ma_linh_kien, r);
          return Array.from(map.values()).filter((r) => r.bat_tat);
        });
      }

      // LDE cache - full sync moi lan (dataset nho, tranh stale cache khi admin hard-delete option -
      // incremental ?since= khong biet den xoa nen cache giu row cu mai mai).
      const ldeCached = await getAllLdeFromCache();
      if (ldeCached.length > 0) setLdeEntries(ldeCached.filter((e) => e.bat_tat));
      const { rows: ldeRows } = await api.get<{ rows: LdeEntry[] }>("/settings/loai-de-xuat");
      await clearLdeCache();
      if (ldeRows.length > 0) await mergeLdeToCache(ldeRows);
      setLdeEntries(ldeRows.filter((e) => e.bat_tat));
    })();
  }, [enabled]);

  return { danhMuc, ldeEntries };
}

function TaoDonTab({
  addToast, qc, canQuanLy, onClose,
}: {
  addToast: (msg: string) => void; qc: ReturnType<typeof useQueryClient>; canQuanLy: boolean; onClose: () => void;
}) {
  const { danhMuc, ldeEntries } = useLkAndLdeCache(true);

  const [nguoiNhanHang, setNguoiNhanHang] = useState("");
  const [drafts, setDrafts] = useState<DonHangDraft[]>([emptyDraft()]);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  // CHOT 2026-08-16 (dot 3 gop y #2): bo cuc accordion 2 cot - CHI 1 dong "dang mo" tai 1 thoi diem
  // (activeIdx), cac dong con lai thu gon ben trai. Khong lien quan `expandedRows` (o do la "Hien thi
  // them" cac truong phu Chinh sach/TT trong 1 the, con day la thu gon/mo rong CA THE dong).
  const [activeIdx, setActiveIdx] = useState(0);
  const [showGoiY, setShowGoiY] = useState(false);

  const auth = useAuth();
  const currentEmail = auth.status === "authenticated" ? auth.user.email : "";
  const loaiDeXuatOptions = getOptionsForUser(auth.status === "authenticated" ? auth.user : null, ldeEntries);

  // CHOT 2026-08-16 (dot 3 gop y #4): mac dinh "Loai de xuat" la "MUA HANG" thay vi de trong - chi
  // dien 1 lan khi danh sach loai de xuat vua tai xong VA dong duy nhat con "nguyen" (chua ai dong,
  // tranh ghi de luc nguoi dung da chon).
  useEffect(() => {
    if (loaiDeXuatOptions.length === 0) return;
    const matched = pickLdeQuick(loaiDeXuatOptions, "MUA HÀNG");
    if (!matched) return;
    setDrafts((prev) => (prev.length === 1 && !prev[0].loai_de_xuat ? [{ ...prev[0], loai_de_xuat: matched }] : prev));
  }, [loaiDeXuatOptions.length]);

  // Thay "Nhan ban phieu cu" (khong hieu qua theo phan hoi thuc te 2026-08-15) bang top 20 linh
  // kien thuong dat TOAN HE THONG - giup chon nhanh khong phai luc trong danh sach ~5000 linh kien.
  const { data: topLinhKienData } = useQuery({
    queryKey: ["dat-mua-lk-top-linh-kien"],
    queryFn: () => api.get<{ rows: { ma_lk: string; ten_lk: string | null; loai_de_xuat: string; so_lan: number }[] }>("/dat-mua-lk/top-linh-kien"),
  });

  // Gan vao dong DANG MO (activeIdx) neu con trong, khac thi them dong moi va chuyen dong moi thanh
  // dong dang mo (nhat quan voi hanh vi nut "+ Them dong" - dot 3 gop y #2/#9).
  function chonTopLinhKien(maLk: string, loaiDeXuat: string) {
    if (!drafts[activeIdx]?.ma_lk.trim()) {
      updateDraft(activeIdx, { ma_lk: maLk, loai_de_xuat: loaiDeXuat });
    } else {
      setDrafts((prev) => [...prev, { ...emptyDraft(), ma_lk: maLk, loai_de_xuat: loaiDeXuat }]);
      setActiveIdx(drafts.length);
    }
  }

  // Giai doan 4b - TN/GS tao ho chon "nguoi nhan hang" khac chinh minh, lay tu Danh sach KTV da
  // ghep tai khoan dang nhap (xem Settings > Danh sach KTV). Rong = mac dinh chinh nguoi tao.
  const { data: nguoiNhanHangData } = useQuery({
    queryKey: ["dat-mua-lk-nguoi-nhan-hang-kha-dung"],
    queryFn: () => api.get<{ rows: { ma_ktv: string; ten_hien_thi: string | null; email_dang_nhap: string }[] }>("/dat-mua-lk/nguoi-nhan-hang-kha-dung"),
    enabled: canQuanLy,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/dat-mua-lk/phieu-dat", {
        nguoi_nhan_hang: nguoiNhanHang || undefined,
        don_hang: drafts.map((d) => ({
          ma_lk: d.ma_lk,
          loai_de_xuat: d.loai_de_xuat.trim(),
          so_luong_de_xuat: d.so_luong_de_xuat,
          ghi_chu: d.ghi_chu.trim() || undefined,
          yeu_cau_hoa_don: d.yeu_cau_hoa_don.trim() || undefined,
          tt_mail_duyet: d.tt_mail_duyet.trim() || undefined,
          tt_khach_hang: d.tt_khach_hang.trim() || undefined,
          chinh_sach: d.chinh_sach.trim() || undefined,
          ma_yeu_cau_su_co: d.ma_yeu_cau_su_co.trim() || undefined,
          uu_tien: d.uu_tien || undefined,
        })),
      }),
    onSuccess: (res) => {
      addToast(`Đã tạo đơn đặt hàng ${res.id}`);
      setNguoiNhanHang("");
      setDrafts([emptyDraft()]);
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-tom-tat"] });
      onClose();
    },
    onError: (err) => addToast("Không thể tạo đơn: " + (err instanceof Error ? err.message : String(err))),
  });

  function updateDraft(idx: number, patch: Partial<DonHangDraft>) {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }

  // Dieu kien 1 dong "xong" - dung chung cho canSubmit (toan bo phieu) VA gate nut "+ Them dong"
  // (chi 1 dong, dot 3 gop y #2: "phai xong A moi them duoc B").
  function isLineComplete(d: DonHangDraft): boolean {
    return !!(
      d.ma_lk.trim() &&
      d.loai_de_xuat.trim() &&
      d.so_luong_de_xuat > 0 &&
      (!canNoRequired(d.loai_de_xuat) || (d.chinh_sach.trim() && d.ma_yeu_cau_su_co.trim()))
    );
  }

  const canSubmit = drafts.every(isLineComplete);
  const [showImport, setShowImport] = useState(false);

  function themDong() {
    if (!isLineComplete(drafts[activeIdx])) return;
    setDrafts((prev) => [...prev, { ...emptyDraft(), loai_de_xuat: prev[activeIdx]?.loai_de_xuat ?? "" }]);
    setActiveIdx(drafts.length);
  }

  function deleteDraft(idx: number) {
    if (drafts.length === 1) return;
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
    setActiveIdx((cur) => (idx < cur ? cur - 1 : idx === cur ? Math.max(0, cur - 1) : cur));
  }

  const tongGiaUocTinh = drafts.reduce((sum, d) => {
    const lk = d.ma_lk.trim() ? danhMuc.find((m) => m.ma_linh_kien === d.ma_lk) : undefined;
    return sum + (lk?.gia_ban != null ? lk.gia_ban * d.so_luong_de_xuat : 0);
  }, 0);

  return (
    <Modal
      open
      title="🧾 Tạo đơn đặt linh kiện"
      onClose={onClose}
      width="max-w-4xl"
      // Thanh tong tien + nut hanh dong co dinh o day (khong nam trong vung cuon) - phan hoi UX
      // 2026-08-15 dot 2: don nhieu dong tren dien thoai phai cuon het moi thay nut "Tao phieu dat",
      // giong pattern gio hang (Shopee/Tiki) tong tien/nut thanh toan luon co dinh. To nen ocean nhat
      // (phan hoi thiet ke: day la hanh dong CHINH cua ca man hinh, thanh xam trung tinh nhu moi
      // footer khac trong app khong du noi bat).
      footer={
        <div className="flex items-center justify-between gap-3 -mx-5 -my-3 px-5 py-3 bg-[var(--ocean-100)]/35">
          <div className="text-sm">
            {tongGiaUocTinh > 0 ? (
              <>
                <span className="text-[var(--ink-500)]">Tổng giá đề xuất ước tính: </span>
                <span className="font-bold text-[var(--ocean-700)]">{fmtVND(tongGiaUocTinh)}</span>
                <span className="ml-1 text-[11px] text-[var(--ink-400)]">(*Giá tham khảo)</span>
              </>
            ) : (
              <span className="text-[var(--ink-500)]">{drafts.length} dòng</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Btn
              variant="ghost"
              size="sm"
              onClick={themDong}
              disabled={!isLineComplete(drafts[activeIdx])}
              title={!isLineComplete(drafts[activeIdx]) ? "Hoàn tất dòng đang nhập trước khi thêm dòng mới" : undefined}
            >
              + Thêm dòng
            </Btn>
            <Btn size="md" onClick={() => create.mutate()} disabled={!canSubmit || create.isPending}>
              {create.isPending ? "Đang tạo..." : drafts.length > 1 ? `Tạo ${drafts.length} đơn` : "Tạo đơn"}
            </Btn>
          </div>
        </div>
      }
    >
      {/* CHOT (phan hoi thiet ke): "Nguoi nhan hang" gio nam trong 1 khoi the that su (nen
          surface-100, bo goc) thay vi nhan+select troi noi giua trang - doc ro day la buoc 1 that
          su cua form, khong phai chi tiet phu. */}
      {canQuanLy && (
        <div className="mb-3 bg-[var(--surface-100)] border border-[var(--line)] rounded-xl p-3">
          <label className="block text-[11px] font-bold uppercase tracking-wide text-[var(--ocean-700)] mb-1.5">👤 Người nhận hàng</label>
          <Select
            value={nguoiNhanHang}
            onChange={setNguoiNhanHang}
            options={[
              { value: "", label: "-- Chính tôi --" },
              ...(nguoiNhanHangData?.rows ?? []).map((r) => ({ value: r.email_dang_nhap, label: `${r.ma_ktv} - ${r.ten_hien_thi ?? r.email_dang_nhap}` })),
            ]}
          />
          <div className="text-[11px] text-[var(--ink-500)] mt-1">Tạo hộ cho KTV/Trạm khác — bỏ trống nếu bạn tự nhận hàng.</div>
        </div>
      )}

      {/* Goi y nhanh (dot 3 gop y #9) va Import Excel la 2 tinh nang KHAC NHAU (goi y = loi tat cho
          MOI nguoi, import = nghiep vu nang cho TN/GS) - phan hoi thiet ke: truoc day ca 2 dung
          CHUNG 1 kieu vien cham xam giong het nhau nen nhin nhu 1 tinh nang lap lai. Gio tach mau:
          Goi y nhanh tint ocean (nhe nhang, ai cung dung), Import Excel giu trung tinh/xam (cong cu
          nang, chi TN/GS thay). */}
      {(topLinhKienData?.rows.length ?? 0) > 0 && !showGoiY && (
        <button
          onClick={() => setShowGoiY(true)}
          className="focus-ring w-full text-left mb-2.5 px-3 py-2 rounded-xl border border-dashed border-[var(--ocean-400)]/50 bg-[var(--ocean-100)]/25 text-xs font-semibold text-[var(--ocean-700)] hover:border-[var(--ocean-400)] hover:bg-[var(--ocean-100)]/45 transition-colors"
        >
          ⭐ Gợi ý nhanh linh kiện thường đặt ({topLinhKienData!.rows.length}) — bấm để mở rộng
        </button>
      )}
      {(topLinhKienData?.rows.length ?? 0) > 0 && showGoiY && (
        <div className="mb-3 rounded-xl border border-[var(--ocean-400)]/40 bg-[var(--ocean-100)]/20 p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-wide text-[var(--ocean-700)]">⭐ Chọn nhanh linh kiện thường đặt</label>
            <button onClick={() => setShowGoiY(false)} className="focus-ring text-xs font-semibold text-[var(--ocean-600)] hover:opacity-70">
              ▲ Thu gọn
            </button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {(topLinhKienData?.rows ?? []).map((r) => (
              <button
                key={`${r.ma_lk}|${r.loai_de_xuat}`}
                onClick={() => chonTopLinhKien(r.ma_lk, r.loai_de_xuat)}
                title={`${r.ma_lk} - ${r.ten_lk ?? r.ma_lk} (${r.loai_de_xuat})`}
                className="focus-ring shrink-0 px-2.5 py-1 rounded-full text-xs font-medium bg-white text-[var(--ocean-700)] border border-[var(--ocean-100)] hover:border-[var(--ocean-400)] hover:bg-[var(--ocean-100)]/50 transition-colors max-w-[220px] truncate whitespace-nowrap"
              >
                {r.ma_lk} - {r.ten_lk ?? r.ma_lk} <span className="text-[var(--ocean-500)]">({r.loai_de_xuat})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Import Excel chi danh cho TN/GS (canQuanLy) - KTV/CTV/Trạm/Vệ tinh KHONG thay muc nay, luon
          nhap thu cong qua form ben duoi. Thu gon mac dinh (chi 1 dong bam de mo rong) vi nhap lieu
          thu cong la uu tien chinh, import chi la lua chon phu - tranh chiem dien tich xu ly chinh.
          Giu tone trung tinh/xam (khac Goi y nhanh o tren) - day la cong tac vien nang, khong phai
          loi tat pho thong. */}
      {canQuanLy && !showImport && (
        <button
          onClick={() => setShowImport(true)}
          className="focus-ring w-full text-left mb-4 px-3 py-2 rounded-xl border border-dashed border-[var(--line)] text-xs font-semibold text-[var(--ink-500)] hover:border-[var(--ink-400)] hover:text-[var(--ink-700)] transition-colors"
        >
          ⇩ Import Excel hàng loạt (tuỳ chọn) — bấm để mở rộng
        </button>
      )}
      {canQuanLy && showImport && (
        <div className="mb-1">
          <button onClick={() => setShowImport(false)} className="focus-ring text-xs font-semibold text-[var(--ink-500)] hover:text-[var(--ink-700)] mb-1">
            ▲ Thu gọn Import Excel
          </button>
        </div>
      )}
      {canQuanLy && showImport && (
        <ImportUploader<DatDonHangImportSummary>
          description={
            <>
              Nhập hàng loạt đơn mua linh kiện từ Excel/CSV — các dòng cùng 1 KTV (cột{" "}
              <b className="font-mono">nguoi_nhan_hang</b> = mã KTV) sẽ gộp thành 1 phiếu đặt. Bắt buộc:{" "}
              <b className="font-mono">nguoi_nhan_hang</b>, <b className="font-mono">ma_lk</b>,{" "}
              <b className="font-mono">loai_de_xuat</b>, <b className="font-mono">so_luong_de_xuat</b>. Tùy chọn:{" "}
              <b className="font-mono">ghi_chu</b>, <b className="font-mono">yeu_cau_hoa_don</b>,{" "}
              <b className="font-mono">tt_mail_duyet</b>, <b className="font-mono">tt_khach_hang</b>,{" "}
              <b className="font-mono">chinh_sach</b>, <b className="font-mono">ma_yeu_cau_su_co</b>.
            </>
          }
          templateUrl="/api/dat-mua-lk/don-hang/import/template"
          previewUrl="/dat-mua-lk/don-hang/import/preview"
          commitUrl="/dat-mua-lk/don-hang/import/commit"
          buildBody={(rows) => ({ rows })}
          renderSummary={(s) => (
            <div className="grid grid-cols-3 gap-3 mb-2">
              <StatCard label="Dòng hợp lệ" value={s.thanhCong} tone="teal" />
              <StatCard label="Dòng lỗi" value={s.loi} tone={s.loi > 0 ? "amber" : "gray"} />
              <StatCard label="Số phiếu sẽ tạo" value={s.soPhieu} tone="ocean" />
            </div>
          )}
          getErrors={(s) => s.errors}
          successMessage={(s) => `Đã tạo ${s.soPhieu} phiếu đặt cho ${s.ktvList.length} KTV (${s.thanhCong} dòng)`}
          invalidateKeys={[["dat-mua-lk-don-hang"], ["dat-mua-lk-tom-tat"]]}
        />
      )}

      {/* CHOT 2026-08-16 (dot 3 gop y #2): bo cuc accordion 2 cot khi co >1 dong - trai la cac dong
          DA THU GON (bam de mo lai), phai la dong DANG MO (activeIdx) voi day du form nhu cu. Chi 1
          dong "mo" tai 1 thoi diem. */}
      <div className={drafts.length > 1 ? "grid grid-cols-1 md:grid-cols-[240px_1fr] gap-3 items-start" : ""}>
        {drafts.length > 1 && (
          <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-400)] px-1">Các dòng khác ({drafts.length - 1})</div>
            {drafts.map((d, idx) => {
              if (idx === activeIdx) return null;
              const loaiDonThu = deriveLoaiDon(d.loai_de_xuat);
              const toneThu = LOAI_DON_TONE[loaiDonThu];
              const lkThu = d.ma_lk.trim() ? danhMuc.find((m) => m.ma_linh_kien === d.ma_lk) : undefined;
              const giaLineThu = lkThu?.gia_ban != null ? `${fmtVND(lkThu.gia_ban)} / cái × ${d.so_luong_de_xuat} = ${fmtVND(lkThu.gia_ban * d.so_luong_de_xuat)}` : null;
              const completeThu = isLineComplete(d);
              // Phan hoi thiet ke: dong thu gon truoc day bo goc/vien khac han dong dang mo (rounded-lg
              // vs rounded-xl, khong co header bar) nen nhin nhu 2 kieu component khac nhau - gio dung
              // CHUNG rounded-xl + 1 dai header mini (nhat, cung mau voi header dong dang mo) de ro day
              // la CUNG 1 loai the, chi khac trang thai mo/dong.
              return (
                <button
                  key={idx}
                  onClick={() => setActiveIdx(idx)}
                  className={`focus-ring w-full text-left bg-white border border-[var(--line)] ${toneThu.border} border-l-4 rounded-xl overflow-hidden text-xs hover:shadow-sm transition-shadow`}
                >
                  <div className={`px-2.5 py-1 border-b border-[var(--line)] ${d.uu_tien ? "bg-[var(--amber-100)]/40" : "bg-[var(--surface-100)]"}`}>
                    <span className="font-mono text-[10px] text-[var(--ink-400)]">Dòng {idx + 1}</span>
                  </div>
                  <div className="px-2.5 py-1.5">
                    <div className="flex items-center gap-1 font-semibold text-[var(--ink-900)]">
                      {d.uu_tien && <span title="Ưu tiên">⭐</span>}
                      <span className="truncate">{d.ma_lk ? `${d.ma_lk} · ${lkThu?.ten_linh_kien ?? d.ma_lk}` : "(Chưa chọn linh kiện)"}</span>
                    </div>
                    {giaLineThu && <div className="text-[var(--ink-500)] mt-0.5">Giá đề xuất: {giaLineThu}</div>}
                    {!completeThu && <div className="text-[var(--coral-600)] font-semibold mt-0.5">⚠ Chưa hoàn tất</div>}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {(() => {
          const idx = activeIdx;
          const d = drafts[idx];
          const loaiDon = deriveLoaiDon(d.loai_de_xuat);
          const batBuoc = canNoRequired(d.loai_de_xuat);
          const lk = d.ma_lk.trim() ? danhMuc.find((m) => m.ma_linh_kien === d.ma_lk) : undefined;
          const giaUocTinh = lk?.gia_ban != null ? lk.gia_ban * d.so_luong_de_xuat : null;
          const showThem = loaiDon !== "mua" || expandedRows.has(idx);
          const tone = LOAI_DON_TONE[loaiDon];
          return (
            <div className={`bg-white border border-[var(--line)] ${tone.border} border-l-4 rounded-xl overflow-hidden shadow-sm`}>
              {/* Header dong: so thu tu + loai don (mau phan biet) + xoa dong - dua nut xoa len dau
                  de luon de thay, khong chen vao giua luong tab cua cac o nhap (phan hoi UX dot 2).
                  Phan hoi thiet ke: doi nen tu --bg (trung voi nen TRANG - lam header lan vao khung
                  modal) sang --surface-100 that su phan tang; "Xoa dong" doi tu link chu suong sang
                  nut that (Btn danger) cho ro trong luong hanh dong xoa. */}
              <div className="flex items-center justify-between px-3 py-2 bg-[var(--surface-100)] border-b border-[var(--line)]">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-[var(--ink-400)]">Dòng {idx + 1}{drafts.length > 1 ? ` / ${drafts.length}` : ""}</span>
                  <Badge tone={tone.tone}>{tone.label}</Badge>
                </div>
                <Btn size="sm" variant="danger" onClick={() => deleteDraft(idx)} disabled={drafts.length === 1}>
                  ✕ Xóa dòng
                </Btn>
              </div>

              <div className="p-3 flex flex-col gap-3">
                {/* 1) Ma linh kien - luon full-width MOI breakpoint (truoc day bi ket 33% tren
                    tablet/desktop khien ten linh kien dai bi cat - phan hoi UX dot 2 diem chinh). */}
                <div>
                  <label className={reqLabelClass(!d.ma_lk.trim())}>Mã linh kiện *</label>
                  <Select
                    value={d.ma_lk}
                    onChange={(v) => updateDraft(idx, { ma_lk: v })}
                    options={[{ value: "", label: "-- Chọn --" }, ...danhMuc.map((m) => ({ value: m.ma_linh_kien, label: `${m.ma_linh_kien} - ${m.ten_linh_kien}` }))]}
                  />
                </div>

                {/* 2) Loai de xuat - ngay sau Ma linh kien vi day la cap truong "nhan dien" hay dien
                    cung luc, tab lien tuc khong bi ngat quang boi cac truong phu. */}
                <div>
                  <label className={reqLabelClass(!d.loai_de_xuat.trim())}>Loại đề xuất *</label>
                  <div className="flex gap-1 mb-1">
                    {(["MUA HÀNG", "CÔNG NỢ", "TRỪ CÔNG NỢ"] as const).map((kw) => {
                      const matched = pickLdeQuick(loaiDeXuatOptions, kw);
                      if (!matched) return null;
                      return (
                        <Btn key={kw} size="sm" variant={d.loai_de_xuat === matched ? "primary" : "ghost"} onClick={() => updateDraft(idx, { loai_de_xuat: matched })}>
                          {kw}
                        </Btn>
                      );
                    })}
                  </div>
                  <Select
                    value={d.loai_de_xuat}
                    onChange={(v) => updateDraft(idx, { loai_de_xuat: v })}
                    options={[{ value: "", label: "-- Chọn --" }, ...loaiDeXuatOptions.map((o) => ({ value: o, label: o }))]}
                  />
                </div>

                {/* 3) So luong + Gia uoc tinh - di chung 1 hang vi so luong quyet dinh gia; Gia
                    khong phai o nhap (khong can tab-stop) nen ghep canh So luong khong lam roi tab. */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={reqLabelClass(!(d.so_luong_de_xuat > 0))}>Số lượng *</label>
                    <input
                      type="number"
                      min={1}
                      value={d.so_luong_de_xuat}
                      onChange={(e) => updateDraft(idx, { so_luong_de_xuat: Number(e.target.value) })}
                      className={`focus-ring w-full bg-white border rounded-lg px-2.5 py-1.5 text-sm ${d.so_luong_de_xuat > 0 ? "border-[var(--line)]" : "border-[var(--coral-400)]"}`}
                    />
                  </div>
                  <div>
                    <span className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Giá đề xuất ước tính</span>
                    {giaUocTinh != null ? (
                      <div className="bg-[var(--ocean-100)]/50 border border-[var(--ocean-100)] rounded-lg px-2.5 py-1.5">
                        <div className="text-sm font-bold text-[var(--ocean-700)] leading-tight">{fmtVND(giaUocTinh)}</div>
                        <div className="text-[10px] text-[var(--ink-400)] leading-tight">*Giá tham khảo</div>
                      </div>
                    ) : (
                      <div className="text-xs text-[var(--ink-400)] px-2.5 py-1.5">—</div>
                    )}
                  </div>
                </div>

                {/* Phan hoi thiet ke: truoc day la 1 checkbox troi noi, khong co khung, de bi lot -
                    gio la 1 "the" nho co vien/nen doi mau khi tich, giong 1 toggle that su. */}
                <label
                  className={`flex items-center gap-2 text-xs font-semibold rounded-lg border px-2.5 py-1.5 cursor-pointer transition-colors ${
                    d.uu_tien ? "border-[var(--amber-500)]/50 bg-[var(--amber-100)]/50 text-[var(--amber-700)]" : "border-[var(--line)] text-[var(--ink-500)] hover:border-[var(--amber-500)]/60"
                  }`}
                >
                  <input type="checkbox" checked={d.uu_tien} onChange={(e) => updateDraft(idx, { uu_tien: e.target.checked })} />
                  ⭐ Đánh dấu là đơn ưu tiên
                </label>

                {d.ma_lk.trim() && <ThayTheGoiY maLk={d.ma_lk.trim()} canQuanLy={canQuanLy} addToast={addToast} />}

                <div className="flex items-center gap-2 -my-1">
                  <div className="h-px flex-1 bg-[var(--line)]" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-400)]">Thông tin bổ sung (tuỳ chọn)</span>
                  <div className="h-px flex-1 bg-[var(--line)]" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Yêu cầu hóa đơn</label>
                    <div className="flex gap-1 flex-wrap">
                      {YEU_CAU_HOA_DON_OPTIONS.map((o) => (
                        <Btn
                          key={o}
                          type="button"
                          size="sm"
                          variant={d.yeu_cau_hoa_don === o ? "primary" : "ghost"}
                          onClick={() => updateDraft(idx, { yeu_cau_hoa_don: o })}
                        >
                          {YEU_CAU_HOA_DON_SHORT_LABELS[o] ?? o}
                        </Btn>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={reqLabelClass(batBuoc && !d.ma_yeu_cau_su_co.trim())}>Mã yêu cầu sự cố liên quan{batBuoc ? " *" : ""}</label>
                    <input
                      value={d.ma_yeu_cau_su_co}
                      onChange={(e) => updateDraft(idx, { ma_yeu_cau_su_co: e.target.value })}
                      maxLength={20}
                      className={`focus-ring w-full max-w-[180px] bg-white border rounded-lg px-2.5 py-1.5 text-sm ${batBuoc && !d.ma_yeu_cau_su_co.trim() ? "border-[var(--coral-400)]" : "border-[var(--line)]"}`}
                    />
                  </div>
                </div>
                <MaYeuCauSuCoCheck value={d.ma_yeu_cau_su_co} nguoiNhanHang={nguoiNhanHang || currentEmail} />

                {showThem && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={reqLabelClass(batBuoc && !d.chinh_sach.trim())}>Chính sách{batBuoc ? " *" : ""}</label>
                        <Select
                          value={d.chinh_sach}
                          onChange={(v) => updateDraft(idx, { chinh_sach: v })}
                          options={[{ value: "", label: "-- Không chọn --" }, ...CHINH_SACH_OPTIONS.map((o) => ({ value: o, label: o }))]}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">TT+Mail duyệt</label>
                        <input
                          value={d.tt_mail_duyet}
                          onChange={(e) => updateDraft(idx, { tt_mail_duyet: e.target.value })}
                          placeholder="Mã/nội dung email phê duyệt đặc biệt (nếu có)"
                          className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">TT khách hàng</label>
                      <input
                        value={d.tt_khach_hang}
                        onChange={(e) => updateDraft(idx, { tt_khach_hang: e.target.value })}
                        placeholder="Tên/SĐT/địa chỉ khách hàng liên quan"
                        className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                      />
                    </div>
                  </>
                )}
                {loaiDon === "mua" && !expandedRows.has(idx) && (
                  <button
                    onClick={() => setExpandedRows((s) => new Set(s).add(idx))}
                    className="focus-ring self-start text-xs font-semibold text-[var(--ink-500)] hover:text-[var(--ocean-600)]"
                  >
                    Hiển thị thêm (Chính sách/TT mail duyệt/TT khách hàng) ▾
                  </button>
                )}

                {/* Ghi chu - luon o CUOI CUNG cua card (phan hoi UX dot 2). */}
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Ghi chú (tuỳ chọn)</label>
                  <input
                    value={d.ghi_chu}
                    onChange={(e) => updateDraft(idx, { ghi_chu: e.target.value })}
                    className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                  />
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </Modal>
  );
}

interface MaYeuCauSuCoPreview {
  khach_hang: string | null;
  seri_san_pham: string | null;
  khu_vuc: string | null;
  tinh: string | null;
  quan_huyen: string | null;
  hang: string | null;
  san_pham_bao_hanh: string | null;
  tien_do_hoan_thanh: string | null;
  ky_thuat_vien: string | null;
}

// Canh bao mem khi nhap "Ma yeu cau su co lien quan" (tieu chi UX phan hoi 2026-08-15, muc 5) - debounce
// 500ms sau khi ngung go, goi GET /dat-mua-lk/kiem-tra-ma-yeu-cau (KHONG dung GET /api/cases/:id vi
// route do chan theo scopeByKhuVuc - 1 GS nhap dung ma nhung case ngoai khu vuc phu trach se nhan 403
// va hien SAI thanh "khong tim thay"). Chi nhac nho, KHONG chan submit.
//
// CHOT 2026-08-16 (phan hoi: "hien thong tin co ban de nguoi tao tu doi chieu"): khi tim thay, hien
// them 1 the nho tom tat ca (khach hang/serial/hang+san pham/khu vuc/KTV xu ly/tien do) de nguoi go
// mã tu xac nhan day dung la ca minh can - khong chi 1 dong bao "co/khong tim thay" nhu truoc.
function MaYeuCauSuCoCheck({ value, nguoiNhanHang }: { value: string; nguoiNhanHang: string }) {
  const [result, setResult] = useState<{ found: boolean; khopKtv: boolean | null; preview: MaYeuCauSuCoPreview | null } | null>(null);
  const id = value.trim();

  useEffect(() => {
    setResult(null);
    if (!id) return;
    const t = setTimeout(() => {
      api
        .get<{ found: boolean; khopKtv: boolean | null; preview: MaYeuCauSuCoPreview | null }>(
          `/dat-mua-lk/kiem-tra-ma-yeu-cau${buildQuery({ id, nguoi_nhan_hang: nguoiNhanHang || undefined })}`,
        )
        .then(setResult)
        .catch(() => setResult(null));
    }, 500);
    return () => clearTimeout(t);
  }, [id, nguoiNhanHang]);

  if (!id || !result) return null;

  if (!result.found) {
    return (
      <div className="mt-1.5 rounded-lg border border-[var(--amber-500)]/30 bg-[var(--amber-100)]/60 px-2.5 py-1.5 text-[11px] font-medium text-[var(--amber-700)]">
        ⚠ Mã sự cố không chính xác hoặc chưa đồng bộ lên server — hãy chắc chắn thông tin chính xác.
      </div>
    );
  }

  const toneCls =
    result.khopKtv === true
      ? { border: "border-[var(--teal-500)]/35", bg: "bg-[var(--teal-100)]/45", head: "text-[var(--teal-600)]" }
      : result.khopKtv === false
        ? { border: "border-[var(--coral-500)]/35", bg: "bg-[var(--coral-100)]/45", head: "text-[var(--coral-600)]" }
        : { border: "border-[var(--line)]", bg: "bg-[var(--surface-100)]", head: "text-[var(--ink-600)]" };

  const p = result.preview;
  return (
    <div className={`mt-1.5 rounded-lg border ${toneCls.border} ${toneCls.bg} px-2.5 py-2`}>
      <div className={`text-[11px] font-bold mb-1.5 ${toneCls.head}`}>
        {result.khopKtv === true && "✓ Đúng KTV xử lý — đối chiếu ca dưới đây trước khi gửi"}
        {result.khopKtv === false && "⚠ Mã này không do bạn/KTV này xử lý — kiểm tra lại"}
        {result.khopKtv === null && "Đã tìm thấy ca — đối chiếu thông tin dưới đây"}
      </div>
      {p && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-[var(--ink-700)]">
          <div className="col-span-2">
            <span className="text-[var(--ink-500)]">Khách hàng: </span>
            <span className="font-semibold">{p.khach_hang ?? "—"}</span>
          </div>
          <div>
            <span className="text-[var(--ink-500)]">Serial: </span>
            <span className="font-mono">{p.seri_san_pham ?? "—"}</span>
          </div>
          <div>
            <span className="text-[var(--ink-500)]">Hãng: </span>
            {p.hang ?? "—"}
            {p.san_pham_bao_hanh ? ` · ${p.san_pham_bao_hanh}` : ""}
          </div>
          <div>
            <span className="text-[var(--ink-500)]">Khu vực: </span>
            {shortKhuVuc(p.khu_vuc)}
            {p.tinh ? ` · ${p.tinh}` : ""}
            {p.quan_huyen ? ` · ${p.quan_huyen}` : ""}
          </div>
          <div>
            <span className="text-[var(--ink-500)]">Tiến độ: </span>
            {p.tien_do_hoan_thanh ?? "—"}
          </div>
          <div className="col-span-2">
            <span className="text-[var(--ink-500)]">KTV xử lý: </span>
            {p.ky_thuat_vien ?? "—"}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Modal chi tiet phieu dat ----------

// Cac trang thai 1 dong con "dang mo" - moi cho phep chon checkbox/hanh dong don le.
const DON_HANG_DANG_MO = ["Cho Tram duyet", "Cho TN duyet"];

// Muc tieu chung cho panel "can nhap truoc khi xac nhan" (tu choi CAN chon Ly do cham, huy CAN nhap
// ly do tu do - phan hoi UX muc 1, 2026-08-15) - dung chung cho PhieuDatDetailModal va
// DonCuaToiTab/PhieuDongBang. id = "bulk" khi ap dung cho ca tap `selected` dang chon.
type ActionTarget = { id: string | "bulk"; action: "tu_choi" | "huy" };

// Hanh dong ap dung duoc cho 1 DONG don hang, tuy vao trang thai hien tai + vai tro nguoi dang xem -
// nang len module-level (truoc day chi nam trong PhieuDatDetailModal) de dung chung cho ca bang dong
// con trong che do xem "phieu + dong" o DonCuaToiTab (phan hoi UX 2026-08-15). "Tu choi" luon can
// chon Ly do cham khi o "Cho TN duyet" (xem rejectTarget o noi goi) - khong con "cho_hang" rieng.
function actionsFor(
  d: DonHangRow,
  ctx: { canTacNghiep: boolean; canActAsTram: boolean; currentEmail: string },
): { duyet: boolean; tuChoi: boolean; huy: boolean } {
  if (d.loai_don === "tra_hang" || !d.trang_thai) return { duyet: false, tuChoi: false, huy: false };
  const isOwnerOrTram = ctx.currentEmail === d.nguoi_tao || ctx.canActAsTram;
  if (d.trang_thai === "Cho Tram duyet") {
    return { duyet: ctx.canActAsTram, tuChoi: ctx.canActAsTram, huy: isOwnerOrTram };
  }
  if (d.trang_thai === "Cho TN duyet") {
    return { duyet: ctx.canTacNghiep, tuChoi: ctx.canTacNghiep, huy: isOwnerOrTram };
  }
  return { duyet: false, tuChoi: false, huy: false };
}

// Cot "Ma yeu cau su co lien quan" - bam mo popup chi tiet ca (App.tsx openCase) CHI khi
// canXemChiTietCa (khong phai KTV/CTV/Tram, xem comment canXemChiTietCa o DatMuaLinhKienModule) VA
// co openCase - nguoc lai van hien gia tri dang text thuong (khong an du lieu, chi khong bam mo
// duoc). Dung chung cho bang dong con o DonCuaToiTab va bang dong trong PhieuDatDetailModal.
function MaYcscCell({ value, canXemChiTietCa, openCase }: { value: string | null; canXemChiTietCa: boolean; openCase?: (id: string, tab?: string) => void }) {
  if (!value?.trim()) return <span className="text-[var(--ink-400)]">—</span>;
  if (canXemChiTietCa && openCase) {
    return (
      <span className="font-mono text-[var(--ocean-600)] font-semibold cursor-pointer hover:underline" onClick={() => openCase(value.trim(), "giai-trinh")}>
        {value}
      </span>
    );
  }
  return <span className="font-mono">{value}</span>;
}

// CHOT 2026-08-15: thay the PhieuDatDetailModal (chi tiet ca "phieu") - khong con khai niem phieu,
// modal gio chi xem/xu ly DUNG 1 dong don hang (goi GET /dat-mua-lk/don-hang/:id). Khong con checkbox/
// bulk-select trong modal (bulk-select van hoat dong o ngoai bang danh sach, xem DonHangGroupedList).
function DonHangDetailModal({
  id,
  onClose,
  addToast,
  qc,
  canTacNghiep,
  canActAsTram,
  currentEmail,
  canXemChiTietCa,
  openCase,
}: {
  id: string;
  onClose: () => void;
  addToast: (msg: string) => void;
  qc: ReturnType<typeof useQueryClient>;
  canTacNghiep: boolean;
  canActAsTram: boolean;
  currentEmail: string;
  canXemChiTietCa: boolean;
  openCase?: (id: string, tab?: string) => void;
}) {
  const [ghiChu, setGhiChu] = useState("");
  // "Tu choi" bat buoc chon 1 Ly do cham, "Huy" bat buoc nhap ghiChu tu do (phan hoi UX muc 1, xem
  // comment applyDonHangLog o backend).
  const [actionTarget, setActionTarget] = useState<"tu_choi" | "huy" | null>(null);
  const [lyDoChamId, setLyDoChamId] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["dat-mua-lk-don-hang-detail", id],
    queryFn: () => api.get<{ donHang: DonHangRow }>(`/dat-mua-lk/don-hang/${id}`),
  });
  const { data: lyDoData } = useQuery({
    queryKey: ["dat-mua-lk-ly-do-cham"],
    queryFn: () => api.get<{ rows: LyDoChamRow[] }>("/dat-mua-lk/ly-do-cham?he_thong=" + encodeURIComponent("Mua hàng")),
    enabled: canTacNghiep,
  });

  function invalidate() {
    setGhiChu("");
    setActionTarget(null);
    setLyDoChamId("");
    qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang-detail", id] });
    qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
  }

  const logMutation = useMutation({
    mutationFn: ({ hanh_dong, ly_do_cham_id }: { hanh_dong: string; ly_do_cham_id?: number }) =>
      api.post(`/dat-mua-lk/don-hang/${id}/log`, { hanh_dong, ly_do_cham_id, ghi_chu: ghiChu.trim() || undefined }),
    onSuccess: () => {
      invalidate();
      addToast("Đã cập nhật trạng thái dòng đơn hàng");
    },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });

  function confirmTuChoi() {
    if (actionTarget !== "tu_choi" || !lyDoChamId) return;
    logMutation.mutate({ hanh_dong: "tu_choi", ly_do_cham_id: Number(lyDoChamId) });
  }
  function confirmHuy() {
    if (actionTarget !== "huy" || !ghiChu.trim()) return;
    logMutation.mutate({ hanh_dong: "huy" });
  }

  const d = data?.donHang;
  const actions = d ? actionsFor(d, { canTacNghiep, canActAsTram, currentEmail }) : { duyet: false, tuChoi: false, huy: false };
  const tone = d ? LOAI_DON_TONE[d.loai_don] : null;
  const ktvDisplayMap = useKtvDisplayMap();

  // CHOT 2026-08-16 (dot 3 gop y #6, dao nguoc quy tac "6 truong phu bat bien" cua migration 0070):
  // nguoi tao sua duoc TOAN BO thong tin dong CHI khi dong con dang mo (chua qua TN xu ly xong) - khop
  // dung DON_HANG_DANG_MO da dinh nghia o tren cho hanh dong duyet/tu choi.
  const isCreatorEditWindow = !!d && currentEmail === d.nguoi_tao && DON_HANG_DANG_MO.includes(d.trang_thai ?? "");
  const [isEditMode, setIsEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState<DonHangDraft | null>(null);
  const { danhMuc, ldeEntries } = useLkAndLdeCache(isEditMode);
  const auth = useAuth();
  const loaiDeXuatOptions = getOptionsForUser(auth.status === "authenticated" ? auth.user : null, ldeEntries);

  function startEdit() {
    if (!d) return;
    setEditDraft({
      ma_lk: d.ma_lk,
      loai_de_xuat: d.loai_de_xuat ?? "",
      so_luong_de_xuat: d.so_luong_de_xuat,
      ghi_chu: d.ghi_chu ?? "",
      yeu_cau_hoa_don: d.yeu_cau_hoa_don ?? YEU_CAU_HOA_DON_OPTIONS[0],
      tt_mail_duyet: d.tt_mail_duyet ?? "",
      tt_khach_hang: d.tt_khach_hang ?? "",
      chinh_sach: d.chinh_sach ?? "",
      ma_yeu_cau_su_co: d.ma_yeu_cau_su_co ?? "",
      uu_tien: d.uu_tien === 1,
    });
    setIsEditMode(true);
  }
  function cancelEdit() {
    setIsEditMode(false);
    setEditDraft(null);
  }
  function updateEditDraft(patch: Partial<DonHangDraft>) {
    setEditDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  const editMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/dat-mua-lk/don-hang/${id}`, body),
    onSuccess: () => {
      setIsEditMode(false);
      setEditDraft(null);
      invalidate();
      addToast("Đã lưu thay đổi đơn hàng");
    },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });

  function saveEdit() {
    if (!editDraft) return;
    editMutation.mutate({
      ma_lk: editDraft.ma_lk,
      loai_de_xuat: editDraft.loai_de_xuat.trim(),
      so_luong_de_xuat: editDraft.so_luong_de_xuat,
      ghi_chu: editDraft.ghi_chu.trim() || undefined,
      yeu_cau_hoa_don: editDraft.yeu_cau_hoa_don.trim() || undefined,
      tt_mail_duyet: editDraft.tt_mail_duyet.trim() || undefined,
      tt_khach_hang: editDraft.tt_khach_hang.trim() || undefined,
      chinh_sach: editDraft.chinh_sach.trim() || undefined,
      ma_yeu_cau_su_co: editDraft.ma_yeu_cau_su_co.trim() || undefined,
      uu_tien: editDraft.uu_tien,
    });
  }

  const editCanSave =
    !!editDraft &&
    editDraft.ma_lk.trim() !== "" &&
    editDraft.loai_de_xuat.trim() !== "" &&
    editDraft.so_luong_de_xuat > 0 &&
    (!canNoRequired(editDraft.loai_de_xuat) || (editDraft.chinh_sach.trim() !== "" && editDraft.ma_yeu_cau_su_co.trim() !== ""));

  // TN ho tro sua 4 truong phu cho nguoi tao trong luc dang xu ly (khong gioi han trang thai, khac
  // voi khoi sua toan bo cua nguoi tao o tren - dot 3 gop y #6).
  const [tnEditOpen, setTnEditOpen] = useState(false);
  const [tnDraft, setTnDraft] = useState({ ma_yeu_cau_su_co: "", yeu_cau_hoa_don: "", tt_khach_hang: "", tt_mail_duyet: "" });
  const tnEditMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/dat-mua-lk/don-hang/${id}`, body),
    onSuccess: () => {
      setTnEditOpen(false);
      invalidate();
      addToast("Đã lưu thay đổi (TN hỗ trợ)");
    },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });
  function openTnEdit() {
    if (!d) return;
    setTnDraft({
      ma_yeu_cau_su_co: d.ma_yeu_cau_su_co ?? "",
      yeu_cau_hoa_don: d.yeu_cau_hoa_don ?? "",
      tt_khach_hang: d.tt_khach_hang ?? "",
      tt_mail_duyet: d.tt_mail_duyet ?? "",
    });
    setTnEditOpen(true);
  }

  const footer =
    !isLoading && d ? (
      isEditMode ? (
        <div className="flex items-center justify-end gap-2">
          <Btn variant="ghost" size="sm" onClick={cancelEdit} disabled={editMutation.isPending}>Huỷ sửa</Btn>
          <Btn size="sm" onClick={saveEdit} disabled={!editCanSave || editMutation.isPending}>Lưu thay đổi</Btn>
        </div>
      ) : actionTarget === "tu_choi" ? (
        <div className="space-y-2">
          <div className="font-semibold text-xs">Từ chối dòng {d.id} — chọn lý do chậm</div>
          <div className="flex gap-2 flex-wrap items-center">
            <Select
              value={lyDoChamId}
              onChange={setLyDoChamId}
              options={[{ value: "", label: "-- Chọn lý do --" }, ...(lyDoData?.rows ?? []).map((l) => ({ value: String(l.id), label: l.ten_ly_do }))]}
            />
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder="Ghi chú thêm (tuỳ chọn)"
              className="focus-ring flex-1 min-w-[160px] bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
            <Btn variant="ghost" size="sm" onClick={() => { setActionTarget(null); setLyDoChamId(""); }}>Hủy</Btn>
            <Btn size="sm" variant="danger" onClick={confirmTuChoi} disabled={!lyDoChamId || logMutation.isPending}>Xác nhận từ chối</Btn>
          </div>
        </div>
      ) : actionTarget === "huy" ? (
        <div className="space-y-2">
          <div className="font-semibold text-xs">Hủy dòng {d.id} — nhập lý do hủy</div>
          <div className="flex gap-2 flex-wrap items-center">
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder="Lý do hủy (bắt buộc)"
              className="focus-ring flex-1 min-w-[200px] bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
            <Btn variant="ghost" size="sm" onClick={() => { setActionTarget(null); setGhiChu(""); }}>Đóng</Btn>
            <Btn size="sm" variant="danger" onClick={confirmHuy} disabled={!ghiChu.trim() || logMutation.isPending}>Xác nhận hủy</Btn>
          </div>
        </div>
      ) : actions.duyet || actions.tuChoi || actions.huy ? (
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {actions.duyet && <Btn size="sm" onClick={() => logMutation.mutate({ hanh_dong: "duyet" })} disabled={logMutation.isPending}>Duyệt</Btn>}
          {actions.tuChoi && (
            <Btn
              size="sm"
              variant="danger"
              onClick={() => (d.trang_thai === "Cho Tram duyet" ? logMutation.mutate({ hanh_dong: "tu_choi" }) : setActionTarget("tu_choi"))}
              disabled={logMutation.isPending}
            >
              Từ chối
            </Btn>
          )}
          {actions.huy && <Btn size="sm" variant="ghost" onClick={() => setActionTarget("huy")} disabled={logMutation.isPending}>Hủy</Btn>}
        </div>
      ) : null
    ) : null;

  return (
    <Modal open title={`Đơn hàng ${id}`} onClose={onClose} width="max-w-2xl" footer={footer}>
      {isLoading ? (
        <div className="text-sm text-[var(--ink-500)] py-4 text-center">Đang tải...</div>
      ) : !d ? null : (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3 bg-[var(--surface-100)] rounded-xl p-3">
            <div>
              <div className="text-[11px] font-semibold text-[var(--ink-500)] mb-0.5">Người tạo</div>
              <div className="font-semibold text-[var(--ink-900)]">{formatNguoiDisplay(d.nguoi_tao, ktvDisplayMap)}</div>
            </div>
            {d.nguoi_nhan_hang && d.nguoi_nhan_hang !== d.nguoi_tao && (
              <div>
                <div className="text-[11px] font-semibold text-[var(--ink-500)] mb-0.5">Người nhận hàng</div>
                <div className="font-semibold text-[var(--ink-900)]">{formatNguoiDisplay(d.nguoi_nhan_hang, ktvDisplayMap)}</div>
              </div>
            )}
            <div>
              <div className="text-[11px] font-semibold text-[var(--ink-500)] mb-0.5">Ngày tạo</div>
              <div className="text-[var(--ink-900)]">{fmtDateTime(d.ngay_tao)}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-[var(--ink-500)] mb-0.5">Tổng tiền đề xuất</div>
              <div className="font-bold text-[var(--ocean-700)]">{fmtVND((d.gia_de_xuat ?? 0) * d.so_luong_de_xuat)}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              {tone && <Badge tone={tone.tone}>{tone.label}</Badge>}
              {d.loai_don === "tra_hang" ? (
                <span className="text-[var(--ink-400)]">Xem tab Đơn trả hàng</span>
              ) : (
                <StatusBadge value={d.trang_thai ?? ""} tones={DON_HANG_TRANG_THAI_TONE} />
              )}
              {d.qua_han_ly_do_cham && <Badge tone="coral">Quá hạn - cần lý do chậm</Badge>}
              {d.uu_tien === 1 && <Badge tone="amber">⭐ Ưu tiên</Badge>}
            </div>
            {isCreatorEditWindow && !isEditMode && (
              <Btn size="sm" variant="ghost" onClick={startEdit}>✎ Sửa đơn</Btn>
            )}
          </div>

          {isEditMode && editDraft ? (
            <div className="space-y-3 bg-[var(--surface-100)] rounded-xl p-3">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Mã linh kiện</label>
                <Select
                  value={editDraft.ma_lk}
                  onChange={(v) => updateEditDraft({ ma_lk: v })}
                  options={[{ value: "", label: "-- Chọn --" }, ...danhMuc.map((m) => ({ value: m.ma_linh_kien, label: `${m.ma_linh_kien} - ${m.ten_linh_kien}` }))]}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Loại đề xuất *</label>
                <div className="flex gap-1 mb-1">
                  {(["MUA HÀNG", "CÔNG NỢ", "TRỪ CÔNG NỢ"] as const).map((kw) => {
                    const matched = pickLdeQuick(loaiDeXuatOptions, kw);
                    if (!matched) return null;
                    return (
                      <Btn key={kw} size="sm" variant={editDraft.loai_de_xuat === matched ? "primary" : "ghost"} onClick={() => updateEditDraft({ loai_de_xuat: matched })}>
                        {kw}
                      </Btn>
                    );
                  })}
                </div>
                <Select
                  value={editDraft.loai_de_xuat}
                  onChange={(v) => updateEditDraft({ loai_de_xuat: v })}
                  options={[{ value: "", label: "-- Chọn --" }, ...loaiDeXuatOptions.map((o) => ({ value: o, label: o }))]}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Số lượng</label>
                  <input
                    type="number"
                    min={1}
                    value={editDraft.so_luong_de_xuat}
                    onChange={(e) => updateEditDraft({ so_luong_de_xuat: Number(e.target.value) })}
                    className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Yêu cầu hóa đơn</label>
                  <div className="flex gap-1 flex-wrap">
                    {YEU_CAU_HOA_DON_OPTIONS.map((o) => (
                      <Btn key={o} size="sm" variant={editDraft.yeu_cau_hoa_don === o ? "primary" : "ghost"} onClick={() => updateEditDraft({ yeu_cau_hoa_don: o })}>
                        {YEU_CAU_HOA_DON_SHORT_LABELS[o] ?? o}
                      </Btn>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">
                    Mã yêu cầu sự cố liên quan{canNoRequired(editDraft.loai_de_xuat) ? " *" : ""}
                  </label>
                  <input
                    value={editDraft.ma_yeu_cau_su_co}
                    onChange={(e) => updateEditDraft({ ma_yeu_cau_su_co: e.target.value })}
                    maxLength={20}
                    className={`focus-ring w-full bg-white border rounded-lg px-2.5 py-1.5 text-sm ${canNoRequired(editDraft.loai_de_xuat) && !editDraft.ma_yeu_cau_su_co.trim() ? "border-[var(--coral-400)]" : "border-[var(--line)]"}`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">
                    Chính sách{canNoRequired(editDraft.loai_de_xuat) ? " *" : ""}
                  </label>
                  <Select
                    value={editDraft.chinh_sach}
                    onChange={(v) => updateEditDraft({ chinh_sach: v })}
                    options={[{ value: "", label: "-- Không chọn --" }, ...CHINH_SACH_OPTIONS.map((o) => ({ value: o, label: o }))]}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">TT+Mail duyệt</label>
                  <input
                    value={editDraft.tt_mail_duyet}
                    onChange={(e) => updateEditDraft({ tt_mail_duyet: e.target.value })}
                    className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">TT khách hàng</label>
                  <input
                    value={editDraft.tt_khach_hang}
                    onChange={(e) => updateEditDraft({ tt_khach_hang: e.target.value })}
                    className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-[var(--amber-700)]">
                <input type="checkbox" checked={editDraft.uu_tien} onChange={(e) => updateEditDraft({ uu_tien: e.target.checked })} />
                ⭐ Đơn ưu tiên
              </label>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Ghi chú (tuỳ chọn)</label>
                <input
                  value={editDraft.ghi_chu}
                  onChange={(e) => updateEditDraft({ ghi_chu: e.target.value })}
                  className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                />
              </div>
            </div>
          ) : (
            <>
              <div>
                <div className="font-mono text-xs text-[var(--ink-500)]">{d.ma_lk}</div>
                <div className={`font-semibold text-base ${DON_HANG_ROW_STYLE[d.trang_thai ?? ""] ?? ""}`}>{d.ten_lk_snapshot ?? d.ma_lk}</div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <div className="text-[11px] font-semibold text-[var(--ink-500)] mb-0.5">SL đề xuất</div>
                  <div>{d.so_luong_de_xuat}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-[var(--ink-500)] mb-0.5">Giá đề xuất</div>
                  <div>{d.gia_de_xuat != null ? fmtVND(d.gia_de_xuat) : "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-[var(--ink-500)] mb-0.5">Giá chốt</div>
                  <div>{d.gia_chot != null ? fmtVND(d.gia_chot) : "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-[var(--ink-500)] mb-0.5">Mã yêu cầu sự cố</div>
                  <MaYcscCell value={d.ma_yeu_cau_su_co} canXemChiTietCa={canXemChiTietCa} openCase={openCase} />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-[var(--ink-500)] mb-0.5">Mã xuất kho</div>
                  <div>{d.ma_xuat_kho ?? "—"}</div>
                </div>
              </div>

              {d.ghi_chu && <div className="text-[var(--ink-500)]">{d.ghi_chu}</div>}
              {/* Ly do chon luc "tu choi"/"cho hang" luu trong ghi_chu cua log moi nhat (xem
                  applyDonHangLog backend) - hien cho nguoi tao biet vi sao, khong chi hien trang thai suong. */}
              {(d.trang_thai === "TN tu choi" || d.trang_thai === "Cho hang") && d.logs?.[0]?.ghi_chu && (
                <div className="text-xs text-[var(--ink-500)]">{d.logs[0].ghi_chu}</div>
              )}

              {canTacNghiep && (
                <div className="border border-[var(--line)] rounded-xl p-2.5">
                  {!tnEditOpen ? (
                    <button onClick={openTnEdit} className="focus-ring text-xs font-semibold text-[var(--ink-500)] hover:text-[var(--ocean-600)]">
                      TN hỗ trợ sửa thông tin phụ (Mã yêu cầu sự cố/Yêu cầu hóa đơn/TT khách hàng/TT mail duyệt) ▾
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-[var(--ink-600)]">TN hỗ trợ sửa thông tin phụ</div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Mã yêu cầu sự cố</label>
                          <input
                            value={tnDraft.ma_yeu_cau_su_co}
                            onChange={(e) => setTnDraft((s) => ({ ...s, ma_yeu_cau_su_co: e.target.value }))}
                            maxLength={20}
                            className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Yêu cầu hóa đơn</label>
                          <Select
                            value={tnDraft.yeu_cau_hoa_don}
                            onChange={(v) => setTnDraft((s) => ({ ...s, yeu_cau_hoa_don: v }))}
                            options={[{ value: "", label: "-- Không chọn --" }, ...YEU_CAU_HOA_DON_OPTIONS.map((o) => ({ value: o, label: YEU_CAU_HOA_DON_SHORT_LABELS[o] ?? o }))]}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">TT khách hàng</label>
                          <input
                            value={tnDraft.tt_khach_hang}
                            onChange={(e) => setTnDraft((s) => ({ ...s, tt_khach_hang: e.target.value }))}
                            className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">TT+Mail duyệt</label>
                          <input
                            value={tnDraft.tt_mail_duyet}
                            onChange={(e) => setTnDraft((s) => ({ ...s, tt_mail_duyet: e.target.value }))}
                            className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Btn variant="ghost" size="sm" onClick={() => setTnEditOpen(false)} disabled={tnEditMutation.isPending}>Đóng</Btn>
                        <Btn
                          size="sm"
                          onClick={() =>
                            tnEditMutation.mutate({
                              ma_yeu_cau_su_co: tnDraft.ma_yeu_cau_su_co.trim() || undefined,
                              yeu_cau_hoa_don: tnDraft.yeu_cau_hoa_don.trim() || undefined,
                              tt_khach_hang: tnDraft.tt_khach_hang.trim() || undefined,
                              tt_mail_duyet: tnDraft.tt_mail_duyet.trim() || undefined,
                            })
                          }
                          disabled={tnEditMutation.isPending}
                        >
                          Lưu
                        </Btn>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {d.cases && d.cases.length > 0 && (
            <div>
              <div className="font-semibold mb-1">Ca liên kết</div>
              <div className="flex gap-1.5 flex-wrap">
                {d.cases.map((cRow) => (
                  <span
                    key={cRow.id}
                    className={canXemChiTietCa && openCase ? "font-mono text-[var(--ocean-600)] font-semibold cursor-pointer hover:underline" : "font-mono"}
                    onClick={canXemChiTietCa && openCase ? () => openCase(cRow.id, "giai-trinh") : undefined}
                  >
                    {cRow.id}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(d.logs?.length ?? 0) > 0 && (
            <div>
              <div className="font-semibold mb-1">Lịch sử xử lý</div>
              <ul className="text-xs space-y-1 text-[var(--ink-500)]">
                {d.logs!.map((l) => (
                  <li key={l.id}>
                    {fmtDateTime(l.ngay_xu_ly)} — <span className="font-semibold text-[var(--ink-700)]">{l.trang_thai}</span> ({l.nguoi_xu_ly})
                    {l.ghi_chu ? ` — ${l.ghi_chu}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ---------- Tab "Don cua toi / Danh sach" ----------

function DonCuaToiTab({
  user,
  addToast,
  qc,
  canTacNghiep,
  canBulkTram,
  canDatHo,
  isGiamSat,
  canXemChiTietCa,
  openCase,
  initialFilterOverride,
  initialNguoiNhanHangOverride,
}: {
  user: { email: string; vai_tro: string | null } | null;
  addToast: (msg: string) => void;
  qc: ReturnType<typeof useQueryClient>;
  canTacNghiep: boolean;
  canBulkTram: boolean;
  canDatHo: boolean;
  isGiamSat: boolean;
  canXemChiTietCa: boolean;
  openCase?: (id: string, tab?: string) => void;
  initialFilterOverride?: string;
  initialNguoiNhanHangOverride?: string;
}) {
  // Nut "+ Tao don" mo Modal TaoDonTab ngay tai day (2026-08-15, phan hoi UX #12) - thay the tab
  // rieng "Tao phieu dat" da bo o component cha, gop toan bo xu ly ve 1 man hinh.
  const [showCreate, setShowCreate] = useState(false);
  // Mac dinh loc thang vao bucket "can xu ly" cua vai tro dang xem (chi anh huong lan dau, xem
  // comment defaultView o component cha) - TN thay "Cho TN duyet", Tram thay "Cho Tram duyet", con
  // lai (KTV/Ve tinh xem don cua chinh minh, GS theo doi) giu "Tat ca" vi ho can thay CA lich su, khong
  // chi phan cho duyet.
  const [filterTrangThai, setFilterTrangThai] = useLocalStorageState(
    "filters:dmlk-trang-thai",
    canTacNghiep ? "Cho TN duyet" : canBulkTram ? "Cho Tram duyet" : "",
  );
  // Nhay tu thanh tom tat cua module cha (tieu chi UX #2) - ghi de filter khi co jumpTarget dich.
  useEffect(() => {
    if (initialFilterOverride !== undefined) setFilterTrangThai(initialFilterOverride);
  }, [initialFilterOverride]);
  const [filterNguoiTao, setFilterNguoiTao] = useState("");
  const [filterNguoiNhanHang, setFilterNguoiNhanHang] = useState("");
  useEffect(() => {
    if (initialNguoiNhanHangOverride !== undefined) setFilterNguoiNhanHang(initialNguoiNhanHangOverride);
  }, [initialNguoiNhanHangOverride]);
  const [filterTuNgay, setFilterTuNgay] = useState("");
  const [filterDenNgay, setFilterDenNgay] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  // Sub-tab "Mua hang | Cong no" (dot 3 gop y #8), nhat quan voi PhieuXuatKhoTab - TN khong bao gio
  // gop 2 mang de xuat nay trong cung 1 luong xu ly. Mac dinh "Mua hang".
  const [xemLoaiDon, setXemLoaiDon] = useState<"mua" | "cong_no">("mua");
  const isAdmin = user?.vai_tro === "Admin";
  const canActAsTram = canBulkTram || isAdmin;
  // "Tu choi" bat buoc chon Ly do cham khi nguoi bam la TN/Admin tren dong "Cho TN duyet" (khac Tram
  // tu choi dong Ve tinh dang "Cho Tram duyet", khong can ly do); "Huy" bat buoc nhap ly do tu do
  // (phan hoi UX muc 1) - dung chung 1 ActionTarget (xem dinh nghia canh actionsFor). id = "bulk"
  // (tu choi ca set `selected` dang chon) HOAC 1 dat_don_hang id cu the (1 dong).
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [bulkLyDoChamId, setBulkLyDoChamId] = useState("");
  const [actionGhiChu, setActionGhiChu] = useState("");
  const { data: bulkLyDoData } = useQuery({
    queryKey: ["dat-mua-lk-ly-do-cham"],
    queryFn: () => api.get<{ rows: { id: number; ten_ly_do: string }[] }>("/dat-mua-lk/ly-do-cham?he_thong=" + encodeURIComponent("Mua hàng")),
    enabled: canTacNghiep,
  });

  const pageSize = 20;
  // CHOT 2026-08-15 (bo khai niem "phieu dat"): danh sach gio la DONG PHANG (GET /don-hang), phan
  // trang server-side that su (truoc day page/pageSize khong duoc gui len backend - bug tiem an, chi
  // luon lay trang 1 roi slice() client-side - sua luon vi dang viet lai dung doan code nay).
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dat-mua-lk-don-hang", filterTrangThai, filterNguoiTao, filterNguoiNhanHang, filterTuNgay, filterDenNgay, xemLoaiDon, page],
    queryFn: () =>
      api.get<{ rows: DonHangRow[]; page: number; pageSize: number; total: number }>(
        "/dat-mua-lk/don-hang" +
          buildQuery({
            trang_thai: filterTrangThai || undefined,
            nguoi_tao: filterNguoiTao || undefined,
            nguoi_nhan_hang: filterNguoiNhanHang || undefined,
            tu_ngay: filterTuNgay || undefined,
            den_ngay: filterDenNgay || undefined,
            loai_don: xemLoaiDon,
            page,
            pageSize,
          }),
      ),
  });

  const { data: veTinhData } = useQuery({
    queryKey: ["dat-mua-lk-ve-tinh-cua-toi"],
    queryFn: () => api.get<{ rows: { email: string; ten: string | null }[] }>("/dat-mua-lk/ve-tinh-cua-toi"),
    enabled: canBulkTram,
  });

  // Giai doan 4b - TN nhom/loc hang doi theo nguoi nhan hang (diem 5 yeu cau).
  const { data: nguoiNhanHangData } = useQuery({
    queryKey: ["dat-mua-lk-nguoi-nhan-hang-kha-dung"],
    queryFn: () => api.get<{ rows: { ma_ktv: string; ten_hien_thi: string | null; email_dang_nhap: string }[] }>("/dat-mua-lk/nguoi-nhan-hang-kha-dung"),
    enabled: canTacNghiep,
  });

  const bulkMutation = useMutation({
    // "ids" truyen tuong minh (khong doc "selected" qua closure) - cho phep goi truc tiep voi 1 dong
    // don le (thao tac nhanh tren tung dong trong DonHangGroupedList) ma khong dung den state
    // `selected` (chi danh cho chon hang loat cua Tram).
    mutationFn: ({ ids, hanh_dong, ly_do_cham_id, ghi_chu }: { ids: string[]; hanh_dong: "duyet" | "tu_choi" | "huy"; ly_do_cham_id?: number; ghi_chu?: string }) =>
      api.post<{ results: Record<string, string> }>("/dat-mua-lk/don-hang/bulk-log", { ids, hanh_dong, ly_do_cham_id, ghi_chu }),
    onSuccess: (res) => {
      setSelected(new Set());
      setActionTarget(null);
      setBulkLyDoChamId("");
      setActionGhiChu("");
      const entries = Object.entries(res.results);
      const failed = entries.filter(([, v]) => v in BULK_LOG_ERROR_MESSAGES);
      if (failed.length === 0) {
        addToast(`Đã xử lý thành công ${entries.length} dòng`);
      } else {
        const detail = failed.map(([lineId, code]) => `${lineId}: ${BULK_LOG_ERROR_MESSAGES[code] ?? code}`).join("; ");
        addToast(`Thành công ${entries.length - failed.length}/${entries.length} dòng. Thất bại: ${detail}`);
      }
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
    },
  });

  function confirmTuChoiChe() {
    if (!actionTarget || actionTarget.action !== "tu_choi" || !bulkLyDoChamId) return;
    const ids = actionTarget.id === "bulk" ? [...selected] : [actionTarget.id];
    bulkMutation.mutate({ ids, hanh_dong: "tu_choi", ly_do_cham_id: Number(bulkLyDoChamId) });
  }

  function confirmHuyChe() {
    if (!actionTarget || actionTarget.action !== "huy" || !actionGhiChu.trim()) return;
    const ids = actionTarget.id === "bulk" ? [...selected] : [actionTarget.id];
    bulkMutation.mutate({ ids, hanh_dong: "huy", ghi_chu: actionGhiChu.trim() });
  }

  const pageRows = data?.rows ?? [];
  // Chon hang loat gio o CAP DONG (truoc day cap phieu) - dong dang "Cho Tram duyet" ma Tram co the
  // duyet/tu choi, khong phai chinh dong nguoi tao tu tao.
  const rowsCoTheChon = pageRows.filter((r) => {
    const a = actionsFor(r, { canTacNghiep, canActAsTram, currentEmail: user?.email ?? "" });
    return r.trang_thai === "Cho Tram duyet" && (a.duyet || a.tuChoi) && r.nguoi_tao !== user?.email;
  });

  function toggleSelectAll() {
    setSelected((s) => (s.size === rowsCoTheChon.length ? new Set() : new Set(rowsCoTheChon.map((r) => r.id))));
  }
  function toggleSelectOne(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mt-4">
      {/* Sub-tab "Mua hang | Cong no" (dot 3 gop y #8), nhat quan voi tab Phieu xuat kho. */}
      <div className="flex gap-1 mb-3">
        {(["mua", "cong_no"] as const).map((l) => (
          <Btn key={l} size="sm" variant={xemLoaiDon === l ? "primary" : "ghost"} onClick={() => setXemLoaiDon(l)}>
            {LOAI_DON_TONE[l].label}
          </Btn>
        ))}
      </div>
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        {canDatHo && (
          <Btn size="sm" onClick={() => setShowCreate(true)}>
            + Tạo đơn
          </Btn>
        )}
        <Select
          value={filterTrangThai}
          onChange={setFilterTrangThai}
          options={[
            { value: "", label: "Tất cả trạng thái" },
            { value: "Cho Tram duyet", label: "Chờ Trạm duyệt" },
            { value: "Cho TN duyet", label: "Chờ TN duyệt" },
            { value: "TN da duyet", label: "TN đã duyệt" },
            { value: "TN tu choi", label: "TN từ chối" },
            { value: "Cho hang", label: "Chờ hàng" },
            { value: "Da huy", label: "Đã hủy" },
          ]}
        />
        {canBulkTram && (
          <div
            className="flex items-center gap-2 flex-wrap"
            title="Lọc theo Vệ tinh + khoảng ngày tạo đơn (dành cho Trạm xem đơn của Vệ tinh mình quản lý)"
          >
            <Select
              value={filterNguoiTao}
              onChange={setFilterNguoiTao}
              options={[
                { value: "", label: "Tất cả người tạo" },
                ...(veTinhData?.rows ?? []).map((v) => ({ value: v.email, label: v.ten || v.email })),
              ]}
            />
            <span className="text-xs text-[var(--ink-500)]">Từ ngày</span>
            <input
              type="date"
              value={filterTuNgay}
              onChange={(e) => setFilterTuNgay(e.target.value)}
              className="focus-ring bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
            <span className="text-xs text-[var(--ink-500)]">Đến ngày</span>
            <input
              type="date"
              value={filterDenNgay}
              onChange={(e) => setFilterDenNgay(e.target.value)}
              className="focus-ring bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
        )}
        {canTacNghiep && (nguoiNhanHangData?.rows.length ?? 0) > 0 && (
          <Select
            value={filterNguoiNhanHang}
            onChange={setFilterNguoiNhanHang}
            options={[
              { value: "", label: "Tất cả người nhận hàng" },
              ...(nguoiNhanHangData?.rows ?? []).map((r) => ({ value: r.email_dang_nhap, label: `${r.ma_ktv} - ${r.ten_hien_thi ?? r.email_dang_nhap}` })),
            ]}
          />
        )}
      </div>
      {canActAsTram && rowsCoTheChon.length > 0 && (
        <div className="flex items-center gap-2 mb-2 text-xs">
          <input type="checkbox" checked={rowsCoTheChon.length > 0 && selected.size === rowsCoTheChon.length} onChange={toggleSelectAll} />
          <span className="text-[var(--ink-500)]">Chọn tất cả dòng đang chờ Trạm duyệt trên trang này</span>
        </div>
      )}
      {canActAsTram && selected.size > 0 && (
        <div className="flex flex-col gap-2 mb-3 bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-3 py-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm">Đã chọn {selected.size} dòng</span>
            <Btn size="sm" onClick={() => bulkMutation.mutate({ ids: [...selected], hanh_dong: "duyet" })} disabled={bulkMutation.isPending}>Duyệt tất cả</Btn>
            <Btn
              size="sm"
              variant="danger"
              onClick={() => (canTacNghiep ? setActionTarget({ id: "bulk", action: "tu_choi" }) : bulkMutation.mutate({ ids: [...selected], hanh_dong: "tu_choi" }))}
              disabled={bulkMutation.isPending}
            >
              Từ chối tất cả
            </Btn>
          </div>
          {actionTarget?.id === "bulk" && actionTarget.action === "tu_choi" && (
            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={bulkLyDoChamId}
                onChange={setBulkLyDoChamId}
                options={[{ value: "", label: "-- Chọn lý do chậm (áp dụng cho dòng TN xử lý) --" }, ...(bulkLyDoData?.rows ?? []).map((l) => ({ value: String(l.id), label: l.ten_ly_do }))]}
              />
              <Btn size="sm" variant="danger" onClick={confirmTuChoiChe} disabled={!bulkLyDoChamId || bulkMutation.isPending}>
                Xác nhận từ chối
              </Btn>
              <Btn size="sm" variant="ghost" onClick={() => { setActionTarget(null); setBulkLyDoChamId(""); }}>Huỷ</Btn>
            </div>
          )}
        </div>
      )}
      <DonHangGroupedList
        rows={pageRows}
        isLoading={isLoading}
        isError={isError}
        page={page}
        pageSize={pageSize}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onDetail={setDetailId}
        canTacNghiep={canTacNghiep}
        canActAsTram={canActAsTram}
        currentEmail={user?.email ?? ""}
        canXemChiTietCa={canXemChiTietCa}
        openCase={openCase}
        bulkMutation={bulkMutation}
        actionTarget={actionTarget}
        setActionTarget={setActionTarget}
        bulkLyDoChamId={bulkLyDoChamId}
        setBulkLyDoChamId={setBulkLyDoChamId}
        bulkLyDoData={bulkLyDoData}
        confirmTuChoiChe={confirmTuChoiChe}
        actionGhiChu={actionGhiChu}
        setActionGhiChu={setActionGhiChu}
        confirmHuyChe={confirmHuyChe}
        selected={selected}
        toggleSelectOne={toggleSelectOne}
        showCheckbox={canActAsTram}
      />
      {detailId && (
        <DonHangDetailModal
          id={detailId}
          onClose={() => setDetailId(null)}
          addToast={addToast}
          qc={qc}
          canTacNghiep={canTacNghiep}
          canActAsTram={canActAsTram}
          currentEmail={user?.email ?? ""}
          canXemChiTietCa={canXemChiTietCa}
          openCase={openCase}
        />
      )}
      {showCreate && (
        <TaoDonTab
          addToast={addToast}
          qc={qc}
          canQuanLy={canTacNghiep || isGiamSat}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

// CHOT 2026-08-15: thay the PhieuDongBang (nhom theo phieu_dat) - khong con khai niem phieu, danh
// sach gio la 1 mang DONG PHANG (da fetch san o component cha qua GET /don-hang), nhom LAI PHIA
// CLIENT theo nguoi_nhan_hang (KTV) de tac nghiep van xu ly theo tung KTV nhu truoc. Vi phan trang o
// cap DONG (khong phai cap phieu), 1 KTV co the bi chia 2 trang neu dong cua ho nam sat ranh gioi
// trang - trade-off chap nhan duoc (danh sach luon sap theo nguoi_nhan_hang o backend nen it xay ra),
// badge tong hop moi nhom chi tinh tren cac dong DANG HIEN o trang hien tai, khong phai toan bo KTV.
function DonHangGroupedList({
  rows,
  isLoading,
  isError,
  page,
  pageSize,
  total,
  onPageChange,
  onDetail,
  canTacNghiep,
  canActAsTram,
  currentEmail,
  canXemChiTietCa,
  openCase,
  bulkMutation,
  actionTarget,
  setActionTarget,
  bulkLyDoChamId,
  setBulkLyDoChamId,
  bulkLyDoData,
  confirmTuChoiChe,
  actionGhiChu,
  setActionGhiChu,
  confirmHuyChe,
  selected,
  toggleSelectOne,
  showCheckbox,
}: {
  rows: DonHangRow[];
  isLoading: boolean;
  isError: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onDetail: (id: string) => void;
  canTacNghiep: boolean;
  canActAsTram: boolean;
  currentEmail: string;
  canXemChiTietCa: boolean;
  openCase?: (id: string, tab?: string) => void;
  bulkMutation: ReturnType<typeof useMutation<{ results: Record<string, string> }, Error, { ids: string[]; hanh_dong: "duyet" | "tu_choi" | "huy"; ly_do_cham_id?: number; ghi_chu?: string }>>;
  actionTarget: ActionTarget | null;
  setActionTarget: (v: ActionTarget | null) => void;
  bulkLyDoChamId: string;
  setBulkLyDoChamId: (v: string) => void;
  bulkLyDoData: { rows: { id: number; ten_ly_do: string }[] } | undefined;
  confirmTuChoiChe: () => void;
  actionGhiChu: string;
  setActionGhiChu: (v: string) => void;
  confirmHuyChe: () => void;
  selected: Set<string>;
  toggleSelectOne: (id: string) => void;
  showCheckbox: boolean;
}) {
  const ktvDisplayMap = useKtvDisplayMap();
  if (isLoading) return <div className="text-sm text-[var(--ink-500)] py-6 text-center">Đang tải...</div>;
  if (isError) return <div className="text-sm text-[var(--coral-500)] py-6 text-center">Lỗi tải dữ liệu.</div>;
  if (rows.length === 0) return <div className="text-sm text-[var(--ink-400)] py-6 text-center">Không có dữ liệu.</div>;

  const groups = new Map<string, DonHangRow[]>();
  for (const d of rows) {
    const key = d.nguoi_nhan_hang || d.nguoi_tao;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }

  return (
    <div className="space-y-2">
      {[...groups.entries()].map(([nguoiNhan, dongCon]) => {
        const choDuyet = dongCon.filter((d) => d.trang_thai === "Cho Tram duyet" || d.trang_thai === "Cho TN duyet").length;
        const dongY = dongCon.filter((d) => d.trang_thai === "TN da duyet").length;
        const tuChoi = dongCon.filter((d) => d.trang_thai === "TN tu choi").length;
        const choHang = dongCon.filter((d) => d.trang_thai === "Cho hang").length;
        const tongTien = dongCon.reduce((s, d) => s + (d.gia_de_xuat ?? 0) * d.so_luong_de_xuat, 0);
        return (
          <div key={nguoiNhan} className="border border-[var(--line)] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 flex-wrap bg-[var(--surface-100)] px-3 py-2">
              <div className="flex items-center gap-3 flex-wrap text-sm">
                <span className="font-bold text-[var(--ink-900)]">{formatNguoiDisplay(nguoiNhan, ktvDisplayMap)}</span>
                <span className="text-[var(--ink-400)] text-xs">{dongCon.length} dòng</span>
                <span className="font-semibold text-[var(--ocean-700)]">{fmtVND(tongTien)}</span>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {choDuyet > 0 && <Badge tone="amber">{choDuyet} chờ duyệt</Badge>}
                {dongY > 0 && <Badge tone="teal">{dongY} đồng ý</Badge>}
                {tuChoi > 0 && <Badge tone="coral">{tuChoi} từ chối</Badge>}
                {choHang > 0 && <Badge tone="amber">{choHang} chờ hàng</Badge>}
              </div>
            </div>
            <div className="overflow-x-auto border-t border-[var(--line)]">
              <table className="min-w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-white text-[var(--ink-500)]">
                    {showCheckbox && <th className="pl-3 pr-1 py-1.5"></th>}
                    <th className="pl-5 pr-3 py-1.5 text-left font-semibold">Linh kiện</th>
                    <th className="px-3 py-1.5 text-left font-semibold">Loại</th>
                    <th className="px-3 py-1.5 text-right font-semibold">SL</th>
                    <th className="px-3 py-1.5 text-right font-semibold">Giá đề xuất</th>
                    <th className="px-3 py-1.5 text-left font-semibold">Mã yêu cầu sự cố</th>
                    <th className="px-3 py-1.5 text-left font-semibold">Trạng thái</th>
                    <th className="px-3 py-1.5 text-left font-semibold">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {dongCon.map((d) => {
                    const actions = actionsFor(d, { canTacNghiep, canActAsTram, currentEmail });
                    const tone = LOAI_DON_TONE[d.loai_don];
                    const rowStyle = DON_HANG_ROW_STYLE[d.trang_thai ?? ""] ?? "";
                    const chonDuoc = showCheckbox && d.trang_thai === "Cho Tram duyet" && (actions.duyet || actions.tuChoi);
                    return (
                      <tr key={d.id} className={`border-t border-[var(--line)] ${tone.border} border-l-4 ${d.uu_tien === 1 ? "bg-[var(--amber-100)]/30" : ""}`}>
                        {showCheckbox && (
                          <td className="pl-3 pr-1 py-1.5">
                            {chonDuoc && <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelectOne(d.id)} />}
                          </td>
                        )}
                        <td className="pl-5 pr-3 py-1.5">
                          <div className="font-mono text-[10px] text-[var(--ink-400)]">{d.ma_lk}</div>
                          <div className={`font-medium ${rowStyle}`}>
                            {d.uu_tien === 1 && <span title="Ưu tiên">⭐ </span>}
                            {d.ten_lk_snapshot ?? d.ma_lk}
                          </div>
                        </td>
                        <td className="px-3 py-1.5"><Badge tone={tone.tone}>{tone.label}</Badge></td>
                        <td className="px-3 py-1.5 text-right">{d.so_luong_de_xuat}</td>
                        <td className="px-3 py-1.5 text-right">{d.gia_de_xuat != null ? fmtVND(d.gia_de_xuat) : "—"}</td>
                        <td className="px-3 py-1.5">
                          {d.ma_yeu_cau_su_co ? <MaYcscCell value={d.ma_yeu_cau_su_co} canXemChiTietCa={canXemChiTietCa} openCase={openCase} /> : <span className="text-[var(--ink-400)]">—</span>}
                        </td>
                        <td className="px-3 py-1.5">
                          {d.loai_don === "tra_hang" ? (
                            <span className="text-[var(--ink-400)]">Xem tab Đơn trả hàng</span>
                          ) : (
                            <StatusBadge value={d.trang_thai ?? ""} tones={DON_HANG_TRANG_THAI_TONE} />
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="flex gap-1 flex-wrap">
                            {actions.duyet && (
                              <Btn size="sm" variant="ghost" onClick={() => bulkMutation.mutate({ ids: [d.id], hanh_dong: "duyet" })} disabled={bulkMutation.isPending}>
                                Duyệt
                              </Btn>
                            )}
                            {actions.tuChoi && (
                              <Btn
                                size="sm"
                                variant="danger"
                                onClick={() => (d.trang_thai === "Cho Tram duyet" ? bulkMutation.mutate({ ids: [d.id], hanh_dong: "tu_choi" }) : setActionTarget({ id: d.id, action: "tu_choi" }))}
                                disabled={bulkMutation.isPending}
                              >
                                Từ chối
                              </Btn>
                            )}
                            {actions.huy && (
                              <Btn size="sm" variant="ghost" onClick={() => setActionTarget({ id: d.id, action: "huy" })} disabled={bulkMutation.isPending}>
                                Hủy
                              </Btn>
                            )}
                            <Btn size="sm" variant="ghost" onClick={() => onDetail(d.id)}>Chi tiết</Btn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {actionTarget && actionTarget.id !== "bulk" && actionTarget.action === "tu_choi" && dongCon.some((d) => d.id === actionTarget.id) && (
              <div className="flex items-center gap-2 flex-wrap border-t border-[var(--line)] bg-[var(--surface-100)] px-3 py-2">
                <span className="text-xs font-semibold">Từ chối dòng {actionTarget.id} — chọn lý do chậm</span>
                <Select
                  value={bulkLyDoChamId}
                  onChange={setBulkLyDoChamId}
                  options={[{ value: "", label: "-- Chọn lý do --" }, ...(bulkLyDoData?.rows ?? []).map((l) => ({ value: String(l.id), label: l.ten_ly_do }))]}
                />
                <Btn size="sm" variant="danger" onClick={confirmTuChoiChe} disabled={!bulkLyDoChamId || bulkMutation.isPending}>Xác nhận</Btn>
                <Btn size="sm" variant="ghost" onClick={() => { setActionTarget(null); setBulkLyDoChamId(""); }}>Hủy</Btn>
              </div>
            )}
            {actionTarget && actionTarget.id !== "bulk" && actionTarget.action === "huy" && dongCon.some((d) => d.id === actionTarget.id) && (
              <div className="flex items-center gap-2 flex-wrap border-t border-[var(--line)] bg-[var(--surface-100)] px-3 py-2">
                <span className="text-xs font-semibold">Hủy dòng {actionTarget.id} — nhập lý do</span>
                <input
                  value={actionGhiChu}
                  onChange={(e) => setActionGhiChu(e.target.value)}
                  placeholder="Lý do hủy (bắt buộc)"
                  className="focus-ring flex-1 min-w-[160px] bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-xs"
                />
                <Btn size="sm" variant="danger" onClick={confirmHuyChe} disabled={!actionGhiChu.trim() || bulkMutation.isPending}>Xác nhận hủy</Btn>
                <Btn size="sm" variant="ghost" onClick={() => { setActionTarget(null); setActionGhiChu(""); }}>Đóng</Btn>
              </div>
            )}
          </div>
        );
      })}
      <div className="flex items-center justify-end gap-2 text-sm text-[var(--ink-500)]">
        <Btn size="sm" variant="ghost" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>‹ Trước</Btn>
        <span>Trang {page}</span>
        <Btn size="sm" variant="ghost" onClick={() => onPageChange(page + 1)} disabled={page * pageSize >= total}>Sau ›</Btn>
      </div>
    </div>
  );
}

// ---------- Tab "Phieu xuat kho" (TN/Ke toan/Kho) ----------
// "Chuyen tien" (thay phieu_so_tien cu) la dieu kien chan rieng tren chinh PXK, khong con tab/bang
// rieng - xem chi tiet trong PxkDetailModal.

function PhieuXuatKhoTab({
  addToast, qc, canTacNghiep, canKho, canKeToan, currentEmail, isAdmin, initialFilterOverride, initialNguoiNhanHangOverride,
}: {
  addToast: (msg: string) => void; qc: ReturnType<typeof useQueryClient>;
  canTacNghiep: boolean; canKho: boolean; canKeToan: boolean; currentEmail: string; isAdmin: boolean;
  initialFilterOverride?: string; initialNguoiNhanHangOverride?: string;
}) {
  // Ke toan/Kho mac dinh loc dung buoc cua ho, TN giu "Tat ca" (theo doi xuyen suot toan bo vong doi
  // PXK minh tao) - xem comment defaultView o component cha ve pham vi anh huong.
  const [filterTrangThai, setFilterTrangThai] = useLocalStorageState(
    "filters:dmlk-pxk-tt",
    canKeToan ? "Cho ke toan" : canKho ? "Da chot xong don xuat" : "",
  );
  useEffect(() => {
    if (initialFilterOverride !== undefined) setFilterTrangThai(initialFilterOverride);
  }, [initialFilterOverride]);
  // Loc theo "Nguoi nhan hang" (KTV) - them cung dot voi chot nghiep vu "1 PXK = 1 KTV" (migration
  // 0074), phuc vu drill-down tu tab "Bao cao" (nhay toi dung KTV + trang thai).
  const [filterNguoiNhanHang, setFilterNguoiNhanHang] = useState("");
  useEffect(() => {
    if (initialNguoiNhanHangOverride !== undefined) setFilterNguoiNhanHang(initialNguoiNhanHangOverride);
  }, [initialNguoiNhanHangOverride]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createData, setCreateData] = useState({ ghi_chu: "", so_tien_can_chuyen: "" });
  const [chonKtv, setChonKtv] = useState("");
  const [chonLoaiDon, setChonLoaiDon] = useState<"mua" | "cong_no">("mua");
  const [selectedDonHang, setSelectedDonHang] = useState<Set<string>>(new Set());
  const [timKiemDonHang, setTimKiemDonHang] = useState("");
  const [page, setPage] = useState(1);
  // Sub-tab "Mua hang | Cong no" (dot 3 gop y #8: TN khong bao gio gop 2 mang de xuat nay trong cung
  // 1 PXK) - danh sach chinh loc theo dung loai dang xem, mac dinh "Mua hang".
  const [xemLoaiDon, setXemLoaiDon] = useState<"mua" | "cong_no">("mua");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dat-mua-lk-pxk", filterTrangThai, filterNguoiNhanHang, xemLoaiDon],
    queryFn: () => api.get<{ rows: PhieuXuatKhoRow[] }>("/phieu-xuat-kho" + buildQuery({ trang_thai: filterTrangThai || undefined, nguoi_nhan_hang: filterNguoiNhanHang || undefined, loai_don: xemLoaiDon })),
  });

  // Danh sach dong "TN da duyet" + chua gan PXK nao - nguon picker chon dong (CHOT 2026-08-14: thay
  // o nhap tay ID tu do, xem comment GET /phieu-xuat-kho/don-hang-kha-dung backend). Loc san theo
  // chonLoaiDon (dot 3 gop y #8) - doi Loai phieu se lam lai truy van.
  const { data: khaDungData, isLoading: khaDungLoading } = useQuery({
    queryKey: ["dat-mua-lk-pxk-don-hang-kha-dung", chonLoaiDon],
    queryFn: () => api.get<{ rows: DonHangKhaDungRow[] }>("/phieu-xuat-kho/don-hang-kha-dung" + buildQuery({ loai_don: chonLoaiDon })),
    enabled: showCreate,
  });

  // Danh sach KTV co ten hien thi dep, dung cho ca bo loc VA buoc "chon KTV" bat buoc luc tao PXK
  // (chot nghiep vu 2026-08-15: 1 PXK chi gan cho 1 KTV) - tai dung dung endpoint DonCuaToiTab da
  // dung. Backend da mo quyen xem cho moi vai tro (Dot 3 gop y #7) nen bo "enabled: canTacNghiep" -
  // Kho/Ke toan cung can tra cuu ten khi doi email -> ten trong bang/chi tiet PXK.
  const { data: nguoiNhanHangData } = useQuery({
    queryKey: ["dat-mua-lk-nguoi-nhan-hang-kha-dung"],
    queryFn: () => api.get<{ rows: { ma_ktv: string; ten_hien_thi: string | null; email_dang_nhap: string }[] }>("/dat-mua-lk/nguoi-nhan-hang-kha-dung"),
  });
  const ktvDisplayMap: KtvDisplayMap = new Map((nguoiNhanHangData?.rows ?? []).map((r) => [r.email_dang_nhap, { ma_ktv: r.ma_ktv, ten_hien_thi: r.ten_hien_thi }]));
  function labelKtv(email: string): string {
    return formatNguoiDisplay(email, ktvDisplayMap);
  }

  const q = timKiemDonHang.trim().toLowerCase();
  // Chi hien dong cua KTV DA CHON (chot nghiep vu 1 PXK = 1 KTV) - rong neu chua chon KTV.
  const donHangLoc = chonKtv
    ? (khaDungData?.rows ?? []).filter(
        (r) => r.nguoi_nhan_hang === chonKtv && (!q || r.ma_lk.toLowerCase().includes(q) || (r.ten_lk_snapshot ?? "").toLowerCase().includes(q)),
      )
    : [];
  // Danh sach KTV thuc su co dong kha dung (de dung lam options Select "Chon KTV") - chi liet ke
  // KTV dang co dong cho tao PXK, tranh chon xong roi thay danh sach rong.
  const ktvKhaDung = [...new Set((khaDungData?.rows ?? []).map((r) => r.nguoi_nhan_hang).filter((x): x is string => !!x))];

  function toggleDonHang(id: string) {
    setSelectedDonHang((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleChonTatCaLoc() {
    setSelectedDonHang((s) => {
      const idsLoc = donHangLoc.map((r) => r.id);
      const daChonHet = idsLoc.length > 0 && idsLoc.every((id) => s.has(id));
      const next = new Set(s);
      if (daChonHet) idsLoc.forEach((id) => next.delete(id));
      else idsLoc.forEach((id) => next.add(id));
      return next;
    });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/phieu-xuat-kho", {
        ghi_chu: createData.ghi_chu.trim() || undefined,
        dat_don_hang_ids: [...selectedDonHang],
        so_tien_can_chuyen: createData.so_tien_can_chuyen ? Number(createData.so_tien_can_chuyen) : undefined,
        nguoi_nhan_hang: chonKtv,
        loai_don: chonLoaiDon,
      }),
    onSuccess: (res) => {
      addToast(`Đã tạo phiếu xuất kho ${res.id}`);
      setShowCreate(false);
      setCreateData({ ghi_chu: "", so_tien_can_chuyen: "" });
      setSelectedDonHang(new Set());
      setTimKiemDonHang("");
      setChonKtv("");
      setChonLoaiDon("mua");
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk-don-hang-kha-dung"] });
    },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });

  const cols: Column<PhieuXuatKhoRow>[] = [
    { key: "id", header: "Mã PXK", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "loai_don", header: "Loại", render: (r) => (r.loai_don ? <Badge tone={LOAI_DON_TONE[r.loai_don].tone}>{LOAI_DON_TONE[r.loai_don].label}</Badge> : <span className="text-[var(--ink-400)]">—</span>) },
    {
      key: "ma_xuat_kho",
      header: "Mã đơn hàng",
      render: (r) => (r.ma_xuat_kho_xac_nhan ? r.ma_xuat_kho : <span className="text-[var(--ink-400)] italic">Chưa có (đang chờ KTV chuyển tiền)</span>),
    },
    { key: "ma_van_don", header: "Mã vận đơn", render: (r) => r.ma_van_don ?? <span className="text-[var(--ink-400)]">—</span> },
    { key: "nguoi_tao", header: "Người tạo", render: (r) => labelKtv(r.nguoi_tao) },
    { key: "nguoi_nhan_hang", header: "Người nhận hàng", render: (r) => (r.nguoi_nhan_hang ? labelKtv(r.nguoi_nhan_hang) : <span className="text-[var(--ink-400)]">—</span>) },
    { key: "ngay_tao", header: "Ngày tạo", render: (r) => fmtDateTime(r.ngay_tao) },
    { key: "so_dong", header: "Số dòng", render: (r) => r.so_dong },
    {
      key: "chuyen_tien", header: "Chuyển tiền",
      render: (r) => (r.so_tien_can_chuyen != null ? <StatusBadge value={r.trang_thai_chuyen_tien ?? ""} tones={CHUYEN_TIEN_TONE} /> : <span className="text-[var(--ink-400)] text-xs">Không cần</span>),
    },
    { key: "trang_thai", header: "Trạng thái", render: (r) => <StatusBadge value={r.trang_thai} tones={PXK_TRANG_THAI_TONE} /> },
    { key: "actions", header: "", render: (r) => <Btn size="sm" variant="ghost" onClick={() => setDetailId(r.id)}>Chi tiết</Btn> },
  ];

  return (
    <div className="mt-4">
      {/* Sub-tab "Mua hang | Cong no" (dot 3 gop y #8) - TN khong bao gio gop 2 mang de xuat nay
          trong cung 1 PXK, tach han danh sach xem theo tung mang, mac dinh Mua hang. */}
      <div className="flex gap-1 mb-3">
        {(["mua", "cong_no"] as const).map((l) => (
          <Btn key={l} size="sm" variant={xemLoaiDon === l ? "primary" : "ghost"} onClick={() => setXemLoaiDon(l)}>
            {LOAI_DON_TONE[l].label}
          </Btn>
        ))}
      </div>
      <div className="flex gap-2 mb-3 flex-wrap justify-between">
        <Select
          value={filterTrangThai}
          onChange={setFilterTrangThai}
          options={[
            { value: "", label: "Tất cả" },
            { value: "Dang tao phieu", label: "Đang tạo phiếu" },
            { value: "Cho ke toan", label: "Chờ kế toán" },
            { value: "Da chot xong don xuat", label: "Đã chốt xong đơn xuất" },
            { value: "Dang gui KTV", label: "Đang gửi KTV" },
            { value: "KTV da nhan", label: "KTV đã nhận" },
            { value: "Ke toan huy", label: "Kế toán huỷ" },
            { value: "Hang tru kho", label: "Hàng trừ kho" },
            { value: "Kho da ket thuc", label: "Kho đã kết thúc" },
          ]}
        />
        {(nguoiNhanHangData?.rows.length ?? 0) > 0 && (
          <Select
            value={filterNguoiNhanHang}
            onChange={setFilterNguoiNhanHang}
            options={[{ value: "", label: "Tất cả người nhận hàng" }, ...(nguoiNhanHangData?.rows ?? []).map((r) => ({ value: r.email_dang_nhap, label: `${r.ma_ktv} - ${r.ten_hien_thi ?? r.email_dang_nhap}` }))]}
          />
        )}
        {canTacNghiep && <Btn size="sm" onClick={() => setShowCreate(true)}>+ Tạo phiếu xuất kho</Btn>}
      </div>
      <PaginatedTable columns={cols} rows={(data?.rows ?? []).slice((page - 1) * 20, page * 20)} isLoading={isLoading} isError={isError} page={page} pageSize={20} total={data?.rows.length ?? 0} onPageChange={setPage} rowKey={(r) => r.id} />
      {showCreate && (
        <Modal
          open
          title="Tạo phiếu xuất kho"
          onClose={() => {
            setShowCreate(false);
            setSelectedDonHang(new Set());
            setTimKiemDonHang("");
            setChonKtv("");
            setChonLoaiDon("mua");
          }}
        >
          <div className="space-y-3 text-sm">
            <div>
              <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Loại phiếu *</label>
              <div className="flex gap-1">
                {(["mua", "cong_no"] as const).map((l) => (
                  <Btn
                    key={l}
                    size="sm"
                    variant={chonLoaiDon === l ? "primary" : "ghost"}
                    onClick={() => { setChonLoaiDon(l); setChonKtv(""); setSelectedDonHang(new Set()); }}
                  >
                    {LOAI_DON_TONE[l].label}
                  </Btn>
                ))}
              </div>
            </div>
            <div>
              {/* Chot nghiep vu 2026-08-15: 1 PXK CHI gan cho 1 KTV - bat buoc chon KTV TRUOC, danh
                  sach dong ben duoi chi hien dong cua dung KTV do (khong con tron nhieu KTV). */}
              <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Chọn KTV nhận hàng *</label>
              <Select
                value={chonKtv}
                onChange={(v) => { setChonKtv(v); setSelectedDonHang(new Set()); }}
                options={[{ value: "", label: "-- Chọn KTV --" }, ...ktvKhaDung.map((email) => ({ value: email, label: labelKtv(email) }))]}
                className="w-full"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-[var(--ink-600)]">Chọn dòng đơn hàng đã "TN đã duyệt" (*)</label>
                <span className="text-xs text-[var(--ink-500)]">Đã chọn {selectedDonHang.size}</span>
              </div>
              <input
                value={timKiemDonHang}
                onChange={(e) => setTimKiemDonHang(e.target.value)}
                placeholder="Tìm theo mã LK, tên LK..."
                disabled={!chonKtv}
                className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mb-1.5 disabled:bg-[var(--surface-100)]"
              />
              <div className="border border-[var(--line)] rounded-lg max-h-64 overflow-y-auto">
                {!chonKtv ? (
                  <div className="text-xs text-[var(--ink-400)] text-center py-4">Chọn KTV nhận hàng ở trên trước.</div>
                ) : khaDungLoading ? (
                  <div className="text-xs text-[var(--ink-500)] text-center py-4">Đang tải...</div>
                ) : donHangLoc.length === 0 ? (
                  <div className="text-xs text-[var(--ink-400)] text-center py-4">
                    {(khaDungData?.rows.length ?? 0) === 0 ? "Không có dòng nào đang chờ tạo phiếu xuất kho." : "Không khớp tìm kiếm."}
                  </div>
                ) : (
                  <>
                    <label className="flex items-center gap-2 px-2.5 py-1.5 border-b border-[var(--line)] bg-[var(--surface-100)] text-xs font-semibold cursor-pointer">
                      <input type="checkbox" checked={donHangLoc.length > 0 && donHangLoc.every((r) => selectedDonHang.has(r.id))} onChange={toggleChonTatCaLoc} />
                      Chọn tất cả ({donHangLoc.length})
                    </label>
                    {donHangLoc.map((r) => (
                      <label key={r.id} className="flex items-center gap-2 px-2.5 py-1.5 border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--surface-100)] cursor-pointer text-xs">
                        <input type="checkbox" checked={selectedDonHang.has(r.id)} onChange={() => toggleDonHang(r.id)} />
                        <span className="font-mono">{r.ma_lk}</span>
                        <span className="flex-1 truncate">{r.ten_lk_snapshot ?? r.ma_lk}</span>
                        <span className="text-[var(--ink-500)]">SL {r.so_luong_de_xuat}</span>
                      </label>
                    ))}
                  </>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Số tiền cần KTV chuyển (bỏ trống nếu không cần)</label>
              <input
                type="number"
                value={createData.so_tien_can_chuyen}
                onChange={(e) => setCreateData((p) => ({ ...p, so_tien_can_chuyen: e.target.value }))}
                className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Ghi chú</label>
              <input
                value={createData.ghi_chu}
                onChange={(e) => setCreateData((p) => ({ ...p, ghi_chu: e.target.value }))}
                className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowCreate(false);
                  setSelectedDonHang(new Set());
                  setTimKiemDonHang("");
                  setChonKtv("");
                  setChonLoaiDon("mua");
                }}
              >
                Hủy
              </Btn>
              <Btn size="sm" onClick={() => createMutation.mutate()} disabled={!chonKtv || selectedDonHang.size === 0 || createMutation.isPending}>Tạo</Btn>
            </div>
          </div>
        </Modal>
      )}
      {detailId && (
        <PxkDetailModal
          id={detailId}
          onClose={() => setDetailId(null)}
          addToast={addToast}
          qc={qc}
          canTacNghiep={canTacNghiep}
          canKho={canKho}
          canKeToan={canKeToan}
          currentEmail={currentEmail}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}

function PxkDetailModal({
  id, onClose, addToast, qc, canTacNghiep, canKho, canKeToan, currentEmail, isAdmin,
}: {
  id: string; onClose: () => void; addToast: (msg: string) => void;
  qc: ReturnType<typeof useQueryClient>; canTacNghiep: boolean; canKho: boolean; canKeToan: boolean;
  currentEmail: string; isAdmin: boolean;
}) {
  const [ghiChu, setGhiChu] = useState("");
  const [maVanDonInput, setMaVanDonInput] = useState("");
  const [soTienMoi, setSoTienMoi] = useState("");
  const [bangChungUrl, setBangChungUrl] = useState("");
  const [maXuatKhoDraft, setMaXuatKhoDraft] = useState("");
  const [maMisaDraft, setMaMisaDraft] = useState("");
  const [uploadingAnh, setUploadingAnh] = useState(false);
  // Nhap "Ly do cham" tung dong (CHOT 2026-08-14 - xem lib/hanLyDoCham.ts backend) - TN dien khi
  // dong ton qua 24h ke tu "Cho TN duyet" ma chua duoc dua vao PXK "Cho ke toan", bat buoc truoc khi
  // bam "Gui ke toan" (backend chan cung, xem POST /phieu-xuat-kho/:id/log).
  const [lyDoChamDraft, setLyDoChamDraft] = useState<Record<string, string>>({});
  const { data, isLoading } = useQuery({
    queryKey: ["pxk-detail", id],
    queryFn: () =>
      api.get<{
        phieuXuatKho: PhieuXuatKhoRow & { trang_thai: string };
        donHang: DonHangRow[];
        logs: Array<{ id: number; trang_thai: string; nguoi_xu_ly: string; ngay_xu_ly: string; ghi_chu: string | null }>;
      }>(`/phieu-xuat-kho/${id}`),
  });

  function invalidate() {
    setGhiChu("");
    setMaVanDonInput("");
    setSoTienMoi("");
    setBangChungUrl("");
    qc.invalidateQueries({ queryKey: ["pxk-detail", id] });
    qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk"] });
  }

  const logMutation = useMutation({
    mutationFn: (trang_thai: string) =>
      api.post(`/phieu-xuat-kho/${id}/log`, {
        trang_thai,
        ghi_chu: ghiChu.trim() || undefined,
        ma_van_don: trang_thai === "Dang gui KTV" ? maVanDonInput.trim() || undefined : undefined,
      }),
    onSuccess: () => { invalidate(); addToast("Đã cập nhật trạng thái"); },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("THIEU_LY_DO_CHAM")) {
        addToast("Còn dòng chưa nhập Lý do chậm (quá 24h) - điền ở bảng dòng đơn hàng bên dưới trước khi gửi kế toán");
      } else if (msg.includes("MA_XUAT_KHO_CHUA_XAC_NHAN")) {
        addToast("Cần nhập Mã đơn hàng trước khi gửi kế toán");
      } else if (msg.includes("MISSING_MA_MISA")) {
        addToast("Cần nhập Mã MISA trước khi chốt xong đơn xuất");
      } else {
        addToast("Lỗi: " + msg);
      }
    },
  });

  const maXuatKhoMutation = useMutation({
    mutationFn: () => api.patch(`/phieu-xuat-kho/${id}/ma-xuat-kho`, { ma_xuat_kho: maXuatKhoDraft.trim() }),
    onSuccess: () => { setMaXuatKhoDraft(""); qc.invalidateQueries({ queryKey: ["pxk-detail", id] }); qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk"] }); addToast("Đã lưu mã đơn hàng"); },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });

  const maMisaMutation = useMutation({
    mutationFn: () => api.patch(`/phieu-xuat-kho/${id}/ma-misa`, { ma_misa: maMisaDraft.trim() }),
    onSuccess: () => { setMaMisaDraft(""); qc.invalidateQueries({ queryKey: ["pxk-detail", id] }); qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk"] }); addToast("Đã lưu mã MISA"); },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });

  async function handleUploadAnhBienBan(file: File) {
    setUploadingAnh(true);
    try {
      const bytes = await file.arrayBuffer();
      await api.postBinary(`/phieu-xuat-kho/${id}/anh-bien-ban`, bytes, file.type || "image/jpeg");
      qc.invalidateQueries({ queryKey: ["pxk-detail", id] });
      addToast("Đã tải ảnh biên bản");
    } catch (err) {
      addToast("Lỗi tải ảnh: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploadingAnh(false);
    }
  }

  const lyDoChamMutation = useMutation({
    mutationFn: ({ donHangId, ly_do_cham }: { donHangId: string; ly_do_cham: string }) =>
      api.patch(`/dat-mua-lk/don-hang/${donHangId}`, { ly_do_cham }),
    onSuccess: (_res, { donHangId }) => {
      setLyDoChamDraft((p) => { const n = { ...p }; delete n[donHangId]; return n; });
      qc.invalidateQueries({ queryKey: ["pxk-detail", id] });
      addToast("Đã lưu lý do chậm");
    },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });

  const yeuCauChuyenTienMutation = useMutation({
    mutationFn: () => api.post(`/phieu-xuat-kho/${id}/chuyen-tien`, { so_tien: Number(soTienMoi) }),
    onSuccess: () => { invalidate(); addToast("Đã yêu cầu chuyển tiền"); },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });

  const chuyenTienMutation = useMutation({
    mutationFn: (body: { trang_thai: string; bang_chung_chuyen_tien_url?: string }) => api.patch(`/phieu-xuat-kho/${id}/chuyen-tien`, body),
    onSuccess: () => { invalidate(); addToast("Đã cập nhật chuyển tiền"); },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });

  const pxk = data?.phieuXuatKho;
  const trangThai = pxk?.trang_thai ?? "";
  const isDong = ["KTV da nhan", "Ke toan huy", "Hang tru kho", "Kho da ket thuc"].includes(trangThai);
  const chuyenTienOk = pxk?.so_tien_can_chuyen == null || pxk.trang_thai_chuyen_tien === "TN da duyet";
  const ktvDisplayMap = useKtvDisplayMap();

  return (
    <Modal open title={`Phiếu xuất kho ${id}`} onClose={onClose}>
      {isLoading ? (
        <div className="text-sm text-[var(--ink-500)] py-4 text-center">Đang tải...</div>
      ) : !data || !pxk ? null : (
        <div className="space-y-4 text-sm">
          <div className="flex gap-3 items-center flex-wrap">
            {pxk.ma_xuat_kho_xac_nhan ? (
              <span className="font-mono font-bold">{pxk.ma_xuat_kho}</span>
            ) : (
              <span className="text-[var(--ink-400)] italic text-xs">Chưa có mã đơn hàng (đang chờ KTV chuyển tiền)</span>
            )}
            <StatusBadge value={trangThai} tones={PXK_TRANG_THAI_TONE} />
            {pxk.nguoi_nhan_hang && (
              <span className="text-[var(--ink-500)] text-xs">{formatNguoiDisplay(pxk.nguoi_nhan_hang, ktvDisplayMap)}</span>
            )}
            <span className="text-[var(--ink-500)] text-xs">{fmtDateTime(pxk.ngay_tao)}</span>
            {pxk.ma_misa && <span className="text-xs text-[var(--ink-500)]">Mã MISA: <span className="font-mono">{pxk.ma_misa}</span></span>}
            {pxk.ma_van_don && <span className="text-xs text-[var(--ink-500)]">Mã vận đơn: <span className="font-mono">{pxk.ma_van_don}</span></span>}
            {pxk.anh_bien_ban_url && (
              <a href={pxk.anh_bien_ban_url} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline text-xs">Xem ảnh biên bản</a>
            )}
          </div>

          {/* Muc C (Dot 2, 2026-08-15): TN nhap "Ma don hang" that SAU khi KTV da chuyen tien xong -
              chi hien luc con "Dang tao phieu", bat buoc truoc khi duoc gui ke toan (chan o backend). */}
          {canTacNghiep && trangThai === "Dang tao phieu" && (
            <div className="border border-[var(--line)] rounded-lg p-3 space-y-2">
              <div className="font-semibold text-xs">Mã đơn hàng {!pxk.ma_xuat_kho_xac_nhan && <span className="text-[var(--coral-600)]">*</span>}</div>
              <div className="flex gap-2 items-end">
                <input
                  value={maXuatKhoDraft}
                  onChange={(e) => setMaXuatKhoDraft(e.target.value)}
                  placeholder={pxk.ma_xuat_kho_xac_nhan ? pxk.ma_xuat_kho : "Nhập mã đơn hàng sau khi KTV đã chuyển tiền"}
                  className="focus-ring flex-1 bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                />
                <Btn size="sm" onClick={() => maXuatKhoMutation.mutate()} disabled={!maXuatKhoDraft.trim() || maXuatKhoMutation.isPending}>Lưu</Btn>
              </div>
            </div>
          )}

          {/* Muc D (Dot 2): Ke toan dien "Ma MISA" tren chinh PXK, bat buoc truoc khi chot xong don xuat. */}
          {canKeToan && trangThai === "Cho ke toan" && (
            <div className="border border-[var(--line)] rounded-lg p-3 space-y-2">
              <div className="font-semibold text-xs">Mã MISA {!pxk.ma_misa && <span className="text-[var(--coral-600)]">*</span>}</div>
              <div className="flex gap-2 items-end">
                <input
                  value={maMisaDraft}
                  onChange={(e) => setMaMisaDraft(e.target.value)}
                  placeholder={pxk.ma_misa ?? "Nhập mã MISA"}
                  className="focus-ring flex-1 bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                />
                <Btn size="sm" onClick={() => maMisaMutation.mutate()} disabled={!maMisaDraft.trim() || maMisaMutation.isPending}>Lưu</Btn>
              </div>
            </div>
          )}

          {/* Muc F (Dot 2): CHI dung nguoi nhan hang duoc tai anh bien ban + xac nhan da nhan. */}
          {trangThai === "Dang gui KTV" && currentEmail === pxk.nguoi_nhan_hang && (
            <div className="border border-[var(--line)] rounded-lg p-3 space-y-2">
              <div className="font-semibold text-xs">Ảnh biên bản tiếp nhận (không bắt buộc)</div>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={uploadingAnh}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUploadAnhBienBan(f); }}
                className="text-xs"
              />
              {uploadingAnh && <div className="text-xs text-[var(--ink-500)]">Đang tải ảnh...</div>}
            </div>
          )}

          <div className="border border-[var(--line)] rounded-lg p-3 space-y-2">
            <div className="font-semibold text-xs">Chuyển tiền</div>
            {pxk.so_tien_can_chuyen == null ? (
              canTacNghiep && trangThai === "Dang tao phieu" ? (
                <div className="flex gap-2 items-end">
                  <input
                    type="number"
                    value={soTienMoi}
                    onChange={(e) => setSoTienMoi(e.target.value)}
                    placeholder="Số tiền cần chuyển"
                    className="focus-ring flex-1 bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                  />
                  <Btn size="sm" onClick={() => yeuCauChuyenTienMutation.mutate()} disabled={!soTienMoi || yeuCauChuyenTienMutation.isPending}>Yêu cầu chuyển</Btn>
                </div>
              ) : (
                <span className="text-[var(--ink-400)] text-xs">Không cần chuyển tiền</span>
              )
            ) : (
              <>
                <div className="flex gap-2 items-center flex-wrap">
                  <span className="font-semibold">{fmtVND(pxk.so_tien_can_chuyen)}</span>
                  <StatusBadge value={pxk.trang_thai_chuyen_tien ?? ""} tones={CHUYEN_TIEN_TONE} />
                  {pxk.bang_chung_chuyen_tien_url && (
                    <a href={pxk.bang_chung_chuyen_tien_url} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline text-xs">Xem bằng chứng</a>
                  )}
                </div>
                {pxk.trang_thai_chuyen_tien === "Cho KTV chuyen" && (
                  <div className="flex gap-2 items-end">
                    <input
                      value={bangChungUrl}
                      onChange={(e) => setBangChungUrl(e.target.value)}
                      placeholder="Link ảnh/bằng chứng đã chuyển khoản"
                      className="focus-ring flex-1 bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                    />
                    <Btn size="sm" onClick={() => chuyenTienMutation.mutate({ trang_thai: "KTV da chuyen", bang_chung_chuyen_tien_url: bangChungUrl })} disabled={!bangChungUrl.trim() || chuyenTienMutation.isPending}>
                      Đã chuyển
                    </Btn>
                  </div>
                )}
                {canTacNghiep && pxk.trang_thai_chuyen_tien === "KTV da chuyen" && (
                  <Btn size="sm" onClick={() => chuyenTienMutation.mutate({ trang_thai: "TN da duyet" })} disabled={chuyenTienMutation.isPending}>Duyệt bằng chứng</Btn>
                )}
              </>
            )}
          </div>

          <div>
            <div className="font-semibold text-xs mb-1">Dòng đơn hàng</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[var(--surface-2)]">
                    <th className="px-2 py-1 text-left border border-[var(--line)]">Mã</th>
                    <th className="px-2 py-1 text-left border border-[var(--line)]">Tên LK</th>
                    <th className="px-2 py-1 text-right border border-[var(--line)]">SL</th>
                    <th className="px-2 py-1 text-left border border-[var(--line)]">Lý do chậm</th>
                  </tr>
                </thead>
                <tbody>
                  {data.donHang.map((d) => (
                    <tr key={d.id} className={`hover:bg-[var(--surface-2)] ${d.uu_tien === 1 ? "bg-[var(--amber-100)]/30" : ""}`}>
                      <td className="px-2 py-1 border border-[var(--line)] font-mono">{d.ma_lk}</td>
                      <td className="px-2 py-1 border border-[var(--line)]">
                        {d.uu_tien === 1 && <span title="Ưu tiên">⭐ </span>}
                        {d.ten_lk_snapshot ?? d.ma_lk}
                      </td>
                      <td className="px-2 py-1 border border-[var(--line)] text-right">{d.so_luong_de_xuat}</td>
                      <td className="px-2 py-1 border border-[var(--line)]">
                        {d.ly_do_cham ? (
                          <span>{d.ly_do_cham}</span>
                        ) : canTacNghiep && trangThai === "Dang tao phieu" ? (
                          <div className="flex gap-1 items-center">
                            {d.qua_han_ly_do_cham && <Badge tone="coral">Quá hạn</Badge>}
                            <input
                              value={lyDoChamDraft[d.id] ?? ""}
                              onChange={(e) => setLyDoChamDraft((p) => ({ ...p, [d.id]: e.target.value }))}
                              placeholder="Nhập lý do chậm"
                              className="focus-ring flex-1 bg-white border border-[var(--line)] rounded-lg px-2 py-1 text-xs"
                            />
                            <Btn
                              size="sm"
                              variant="ghost"
                              onClick={() => lyDoChamMutation.mutate({ donHangId: d.id, ly_do_cham: lyDoChamDraft[d.id] ?? "" })}
                              disabled={!lyDoChamDraft[d.id]?.trim() || lyDoChamMutation.isPending}
                            >
                              Lưu
                            </Btn>
                          </div>
                        ) : (
                          <span className="text-[var(--ink-400)]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="text-xs space-y-0.5">
            {data.logs.map((l) => (
              <div key={l.id} className="text-[var(--ink-600)]">
                <span className="font-medium">{l.trang_thai}</span> — {l.nguoi_xu_ly} {fmtDateTime(l.ngay_xu_ly)}
                {l.ghi_chu && <span className="ml-1 text-[var(--ink-400)]">({l.ghi_chu})</span>}
              </div>
            ))}
          </div>

          {!isDong && (
            <div className="border-t border-[var(--line)] pt-3 space-y-2">
              {/* Muc E (Dot 2): Kho tach rieng "Ma van don" khoi ghi chu chung, chi ap dung luc chuyen
                  "Dang gui KTV". */}
              {canKho && trangThai === "Da chot xong don xuat" && (
                <input
                  value={maVanDonInput}
                  onChange={(e) => setMaVanDonInput(e.target.value)}
                  placeholder="Mã vận đơn (tuỳ chọn, áp dụng khi bấm Đang gửi KTV)"
                  className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                />
              )}
              <input
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                placeholder="Ghi chú (tuỳ chọn)"
                className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
              <div className="flex gap-2 flex-wrap">
                {canTacNghiep && trangThai === "Dang tao phieu" && (
                  <Btn
                    size="sm"
                    onClick={() => logMutation.mutate("Cho ke toan")}
                    disabled={logMutation.isPending || !chuyenTienOk || !pxk.ma_xuat_kho_xac_nhan}
                    title={!chuyenTienOk ? "Cần TN duyệt bằng chứng chuyển tiền trước" : !pxk.ma_xuat_kho_xac_nhan ? "Cần nhập Mã đơn hàng trước" : undefined}
                  >
                    Gửi kế toán
                  </Btn>
                )}
                {(canTacNghiep || canKeToan) && ["Dang tao phieu", "Cho ke toan"].includes(trangThai) && (
                  <Btn size="sm" variant="danger" onClick={() => logMutation.mutate("Ke toan huy")} disabled={logMutation.isPending}>Kế toán huỷ</Btn>
                )}
                {canKeToan && trangThai === "Cho ke toan" && (
                  <Btn size="sm" onClick={() => logMutation.mutate("Da chot xong don xuat")} disabled={logMutation.isPending || !pxk.ma_misa} title={!pxk.ma_misa ? "Cần nhập Mã MISA trước" : undefined}>
                    Đã chốt xong đơn xuất
                  </Btn>
                )}
                {canKho && trangThai === "Da chot xong don xuat" && (
                  <>
                    <Btn size="sm" onClick={() => logMutation.mutate("Dang gui KTV")} disabled={logMutation.isPending}>Đang gửi KTV</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => logMutation.mutate("Hang tru kho")} disabled={logMutation.isPending}>Hàng trừ kho</Btn>
                  </>
                )}
                {/* Muc F (Dot 2): CHOT bat buoc DUNG nguoi nhan hang xac nhan - an nut voi moi nguoi
                    khac (ke ca Admin/TN xem, du backend van cho Admin bam duoc de xu ly su co). */}
                {trangThai === "Dang gui KTV" && currentEmail === pxk.nguoi_nhan_hang && (
                  <Btn size="sm" onClick={() => logMutation.mutate("KTV da nhan")} disabled={logMutation.isPending}>KTV đã nhận</Btn>
                )}
                {trangThai === "Dang gui KTV" && currentEmail !== pxk.nguoi_nhan_hang && isAdmin && (
                  <Btn size="sm" variant="ghost" onClick={() => logMutation.mutate("KTV da nhan")} disabled={logMutation.isPending} title="Admin xác nhận thay KTV (trường hợp đặc biệt)">
                    KTV đã nhận (Admin xác nhận thay)
                  </Btn>
                )}
                {canKho && trangThai === "Dang gui KTV" && (
                  <Btn size="sm" variant="ghost" onClick={() => logMutation.mutate("Kho da ket thuc")} disabled={logMutation.isPending}>Kho đã kết thúc (KTV không phản hồi)</Btn>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ---------- Tab "Thieu linh kien" ----------

function ThieuLkTab({
  addToast, qc, canKho, canTacNghiep, currentEmail, initialFilterOverride,
}: {
  addToast: (msg: string) => void; qc: ReturnType<typeof useQueryClient>; canKho: boolean; canTacNghiep: boolean; currentEmail: string;
  initialFilterOverride?: string;
}) {
  // Kho mac dinh loc dung hang doi cua ho ("Cho kho xu ly"), con lai giu "Tat ca".
  const [filterTrangThai, setFilterTrangThai] = useLocalStorageState("filters:dmlk-tlk-tt", canKho ? "Cho kho xu ly" : "");
  useEffect(() => {
    if (initialFilterOverride !== undefined) setFilterTrangThai(initialFilterOverride);
  }, [initialFilterOverride]);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionTrangThai, setActionTrangThai] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [ngayDuKien, setNgayDuKien] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const ktvDisplayMap = useKtvDisplayMap();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dat-mua-lk-thieu-lk", filterTrangThai],
    queryFn: () => api.get<{ rows: ThieuLkRow[] }>("/dat-mua-lk/thieu-lk" + buildQuery({ trang_thai: filterTrangThai || undefined })),
  });

  // "Kho da tiep nhan" = buoc Kho giai trinh ly do thieu hang that su + bao ngay du kien co hang
  // (dung cot trong Excel goc) - bat buoc ghi_chu, khong nhu cac buoc khac chi tuy chon.
  const isGiaiTrinh = actionTrangThai === "Kho da tiep nhan";

  // Nhan tham so truc tiep (khong doc qua state actionId/actionTrangThai) de cac nut khong can nhap
  // lieu co the ban thang mutate() ma khong mo modal (tieu chi UX #3, sua 2026-08-15) - modal "Xac
  // nhan" van goi ham nay voi actionId/actionTrangThai hien tai cho truong hop isGiaiTrinh.
  const logMutation = useMutation({
    mutationFn: (args: { id: string; trangThai: string; ghiChu?: string; ngayDuKien?: string }) =>
      api.post(`/dat-mua-lk/thieu-lk/${args.id}/log`, {
        trang_thai: args.trangThai,
        ghi_chu: args.ghiChu?.trim() || undefined,
        ngay_du_kien_co_hang: args.ngayDuKien || undefined,
      }),
    onSuccess: () => {
      setActionId(null);
      setGhiChu("");
      setNgayDuKien("");
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-thieu-lk"] });
      addToast("Đã cập nhật trạng thái thiếu LK");
    },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });

  // "Da ket thuc" la cua TN (khop cot "Admin xu ly" trong Excel goc), con lai la Kho. "Da huy bo"
  // cung mo cho chinh TN da tao ticket (nguoi_tao), khong chi Kho - khop quyen da co san o backend
  // (POST /thieu-lk/:id/log: isCancel cho phep nguoi_tao huy bat ky luc nao con dang mo).
  const NEXT_STATES = (r: ThieuLkRow): { trangThai: string; canDo: boolean }[] => {
    const isCreator = r.nguoi_tao === currentEmail;
    if (r.trang_thai === "Cho kho xu ly")
      return [
        { trangThai: "Kho da tiep nhan", canDo: canKho },
        { trangThai: "Kho tu choi sai TT", canDo: canKho },
        { trangThai: "Da huy bo", canDo: isCreator },
      ];
    if (r.trang_thai === "Kho da tiep nhan")
      return [
        { trangThai: "Kho xac nhan hang da ve", canDo: canKho },
        { trangThai: "Da huy bo", canDo: canKho || isCreator },
      ];
    if (r.trang_thai === "Kho xac nhan hang da ve") return [{ trangThai: "Da ket thuc", canDo: canTacNghiep }];
    return [];
  };

  // Bulk-log (tieu chi UX #4, them 2026-08-15) - chi ap dung cho cac buoc KHONG can nhap lieu bat
  // buoc ("Kho da tiep nhan" can giai trinh rieng tung dong nen loai khoi bulk). Thanh hanh dong chi
  // hien cac trang thai dich CHUNG cho toan bo dong da chon (giao cua tap NEXT_STATES tung dong).
  const BULK_ELIGIBLE_STATES = ["Kho xac nhan hang da ve", "Kho tu choi sai TT", "Da huy bo", "Da ket thuc"];
  const eligibleBulkStates = (r: ThieuLkRow) => NEXT_STATES(r).filter((s) => s.canDo && BULK_ELIGIBLE_STATES.includes(s.trangThai)).map((s) => s.trangThai);
  const rowsCoTheChon = (data?.rows ?? []).filter((r) => eligibleBulkStates(r).length > 0);
  const selectedRows = (data?.rows ?? []).filter((r) => selected.has(r.id));
  const commonBulkStates =
    selectedRows.length === 0
      ? []
      : selectedRows.reduce<string[]>((acc, r, i) => (i === 0 ? eligibleBulkStates(r) : acc.filter((s) => eligibleBulkStates(r).includes(s))), []);

  function toggleSelectAll() {
    setSelected((s) => (s.size === rowsCoTheChon.length && rowsCoTheChon.length > 0 ? new Set() : new Set(rowsCoTheChon.map((r) => r.id))));
  }
  function toggleSelectOne(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const bulkMutation = useMutation({
    mutationFn: (trangThai: string) => api.post<{ results: Record<string, string> }>("/dat-mua-lk/thieu-lk/bulk-log", { ids: [...selected], trang_thai: trangThai }),
    onSuccess: (res) => {
      setSelected(new Set());
      const entries = Object.entries(res.results);
      const failed = entries.filter(([, v]) => v !== "ok");
      addToast(failed.length === 0 ? `Đã xử lý thành công ${entries.length} dòng` : `Thành công ${entries.length - failed.length}/${entries.length} dòng`);
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-thieu-lk"] });
    },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });

  const cols: Column<ThieuLkRow>[] = [
    {
      key: "chon",
      header: <input type="checkbox" checked={rowsCoTheChon.length > 0 && selected.size === rowsCoTheChon.length} onChange={toggleSelectAll} />,
      render: (r: ThieuLkRow) => (eligibleBulkStates(r).length > 0 ? <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelectOne(r.id)} /> : null),
    },
    { key: "id", header: "Mã TLK", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "dat_don_hang_id", header: "Đơn hàng", render: (r) => <span className="font-mono text-xs">{r.dat_don_hang_id}</span> },
    { key: "nguoi_tao", header: "TN báo", render: (r) => formatNguoiDisplay(r.nguoi_tao, ktvDisplayMap) },
    { key: "ngay_tao", header: "Ngày báo", render: (r) => fmtDateTime(r.ngay_tao) },
    { key: "ten_ly_do", header: "Lý do chậm", render: (r) => r.ten_ly_do ?? "—" },
    { key: "ngay_du_kien_co_hang", header: "Ngày dự kiến có hàng", render: (r) => r.ngay_du_kien_co_hang ?? "—" },
    { key: "trang_thai", header: "Trạng thái", render: (r) => <StatusBadge value={r.trang_thai} tones={THIEU_LK_TRANG_THAI_TONE} /> },
    {
      key: "actions", header: "",
      render: (r) => {
        const nexts = NEXT_STATES(r).filter((s) => s.canDo);
        if (nexts.length === 0) return null;
        return (
          <div className="flex gap-1">
            {nexts.map((s) =>
              s.trangThai === "Kho da tiep nhan" ? (
                <Btn key={s.trangThai} size="sm" variant="ghost" onClick={() => { setActionId(r.id); setActionTrangThai(s.trangThai); setGhiChu(""); setNgayDuKien(""); }}>
                  {s.trangThai}
                </Btn>
              ) : (
                <Btn key={s.trangThai} size="sm" variant="ghost" disabled={logMutation.isPending} onClick={() => logMutation.mutate({ id: r.id, trangThai: s.trangThai })}>
                  {s.trangThai}
                </Btn>
              ),
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="mt-4">
      <div className="flex gap-2 mb-3">
        <Select
          value={filterTrangThai}
          onChange={setFilterTrangThai}
          options={[
            { value: "", label: "Tất cả" },
            { value: "Cho kho xu ly", label: "Chờ kho xử lý" },
            { value: "Kho da tiep nhan", label: "Kho đã tiếp nhận" },
            { value: "Kho xac nhan hang da ve", label: "Hàng đã về" },
            { value: "Da ket thuc", label: "Đã kết thúc" },
          ]}
        />
      </div>
      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3 bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-3 py-2">
          <span className="text-sm">Đã chọn {selected.size} dòng</span>
          {commonBulkStates.length === 0 ? (
            <span className="text-xs text-[var(--ink-500)]">Các dòng đã chọn không có bước xử lý chung — chọn lại theo cùng trạng thái</span>
          ) : (
            commonBulkStates.map((s) => (
              <Btn key={s} size="sm" onClick={() => bulkMutation.mutate(s)} disabled={bulkMutation.isPending}>
                {s}
              </Btn>
            ))
          )}
        </div>
      )}
      <PaginatedTable columns={cols} rows={(data?.rows ?? []).slice((page - 1) * 20, page * 20)} isLoading={isLoading} isError={isError} page={page} pageSize={20} total={data?.rows.length ?? 0} onPageChange={setPage} rowKey={(r) => r.id} />
      {actionId && (
        <Modal open title={`Chuyển sang: ${actionTrangThai}`} onClose={() => setActionId(null)}>
          <div className="space-y-3 text-sm">
            {isGiaiTrinh && (
              <div>
                <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Ngày dự kiến có hàng</label>
                <input
                  type="date"
                  value={ngayDuKien}
                  onChange={(e) => setNgayDuKien(e.target.value)}
                  className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                />
              </div>
            )}
            <div>
              {isGiaiTrinh && <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Giải thích lý do thiếu hàng *</label>}
              <input
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                placeholder={isGiaiTrinh ? "Bắt buộc - giải thích thực tế vì sao thiếu hàng" : "Ghi chú (tuỳ chọn)"}
                className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="sm" onClick={() => setActionId(null)}>Hủy</Btn>
              <Btn
                size="sm"
                onClick={() => actionId && logMutation.mutate({ id: actionId, trangThai: actionTrangThai, ghiChu, ngayDuKien: isGiaiTrinh ? ngayDuKien : undefined })}
                disabled={logMutation.isPending || (isGiaiTrinh && !ghiChu.trim())}
              >
                Xác nhận
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------- Tab "Don tra hang" (tach hoan toan khoi mua/cong no - buoc 3 ke hoach) ----------

function TraHangTab({
  addToast, qc, canKeToan, canKho, canQC, canTacNghiep, initialFilterOverride,
}: {
  addToast: (msg: string) => void; qc: ReturnType<typeof useQueryClient>;
  canKeToan: boolean; canKho: boolean; canQC: boolean; canTacNghiep: boolean; initialFilterOverride?: string;
}) {
  // Uu tien QC > Ke toan > Kho > TN cho mac dinh (chi anh huong lan dau) - 1 nguoi hiem khi giu qua
  // 1 trong 4 flag nay cung luc (ngoai Admin, da tu roi tabs[0] khac o component cha).
  const [filterTrangThai, setFilterTrangThai] = useLocalStorageState(
    "filters:dmlk-th-tt",
    canQC ? "Cho QC xac nhan" : canKeToan ? "Cho ke toan duyet mem" : canKho ? "Cho kho xac nhan" : canTacNghiep ? "Cho TN duyet tong" : "",
  );
  useEffect(() => {
    if (initialFilterOverride !== undefined) setFilterTrangThai(initialFilterOverride);
  }, [initialFilterOverride]);
  const [layLuiId, setLayLuiId] = useState<string | null>(null);
  const [ghiChu, setGhiChu] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const ktvDisplayMap = useKtvDisplayMap();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["tra-hang", filterTrangThai],
    queryFn: () => api.get<{ rows: TraHangRow[] }>("/tra-hang" + buildQuery({ trang_thai: filterTrangThai || undefined })),
  });

  // Ban thang, khong qua modal (tieu chi UX #3, sua 2026-08-15) - "Duyet"/"Tu choi" khong bat buoc
  // nhap gi them nen khong can buoc "Xac nhan" phu. Modal chi con giu cho "Day lui" (ghiChu bat
  // buoc, xem layLuiMutation ben duoi).
  const logMutation = useMutation({
    mutationFn: (args: { id: string; hanhDong: "duyet" | "tu_choi" | "huy" }) => api.post(`/tra-hang/${args.id}/log`, { hanh_dong: args.hanhDong }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tra-hang"] });
      addToast("Đã cập nhật trạng thái đơn trả hàng");
    },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });

  const layLuiMutation = useMutation({
    mutationFn: () => api.post(`/tra-hang/${layLuiId}/log-lui`, { ghi_chu: ghiChu.trim() }),
    onSuccess: () => {
      setLayLuiId(null);
      setGhiChu("");
      qc.invalidateQueries({ queryKey: ["tra-hang"] });
      addToast("Đã đẩy lùi 1 bước");
    },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });

  function canXuLy(trangThai: string): boolean {
    if (trangThai === "Cho ke toan duyet mem") return canKeToan;
    if (trangThai === "Cho kho xac nhan") return canKho;
    if (trangThai === "Cho QC xac nhan") return canQC;
    if (trangThai === "Cho TN duyet tong") return canTacNghiep;
    if (trangThai === "Cho ke toan xac nhan nhap kho") return canKeToan;
    if (trangThai === "Cho kho xac nhan nhap kho") return canKho;
    return false;
  }

  const DA_DONG = ["Da hoan thanh", "Tu choi", "Da huy"];
  const CO_THE_DAY_LUI = ["Cho kho xac nhan", "Cho QC xac nhan", "Cho TN duyet tong", "Cho ke toan xac nhan nhap kho", "Cho kho xac nhan nhap kho"];

  // Bulk-log (tieu chi UX #4, them 2026-08-15) - "Duyet"/"Tu choi" khong bat buoc nhap gi nen ap
  // dung duoc hang loat, khac dong nhau ve trang_thai_tra_hang (moi dong tu tinh buoc ke tiep rieng
  // o server) - chi can canXuLy() dung cho trang thai hien tai cua dong do.
  const rowsCoTheChon = (data?.rows ?? []).filter((r) => canXuLy(r.trang_thai_tra_hang));
  function toggleSelectAll() {
    setSelected((s) => (s.size === rowsCoTheChon.length && rowsCoTheChon.length > 0 ? new Set() : new Set(rowsCoTheChon.map((r) => r.id))));
  }
  function toggleSelectOne(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const bulkMutation = useMutation({
    mutationFn: (hanhDong: "duyet" | "tu_choi") => api.post<{ results: Record<string, string> }>("/tra-hang/bulk-log", { ids: [...selected], hanh_dong: hanhDong }),
    onSuccess: (res) => {
      setSelected(new Set());
      const entries = Object.entries(res.results);
      const failed = entries.filter(([, v]) => v in TRA_HANG_BULK_ERROR_MESSAGES);
      if (failed.length === 0) addToast(`Đã xử lý thành công ${entries.length} dòng`);
      else addToast(`Thành công ${entries.length - failed.length}/${entries.length} dòng. Thất bại: ${failed.map(([id, code]) => `${id}: ${TRA_HANG_BULK_ERROR_MESSAGES[code] ?? code}`).join("; ")}`);
      qc.invalidateQueries({ queryKey: ["tra-hang"] });
    },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });

  const cols: Column<TraHangRow>[] = [
    {
      key: "chon",
      header: <input type="checkbox" checked={rowsCoTheChon.length > 0 && selected.size === rowsCoTheChon.length} onChange={toggleSelectAll} />,
      render: (r: TraHangRow) => (canXuLy(r.trang_thai_tra_hang) ? <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelectOne(r.id)} /> : null),
    },
    { key: "id", header: "Mã đơn hàng", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "ma_lk", header: "Mã LK", render: (r) => r.ma_lk },
    { key: "ten_lk_snapshot", header: "Tên LK", render: (r) => r.ten_lk_snapshot ?? r.ma_lk },
    { key: "so_luong_de_xuat", header: "SL", render: (r) => r.so_luong_de_xuat },
    { key: "nguoi_tao", header: "Người tạo", render: (r) => formatNguoiDisplay(r.nguoi_tao, ktvDisplayMap) },
    { key: "ngay_tao", header: "Ngày tạo", render: (r) => fmtDateTime(r.ngay_tao) },
    { key: "trang_thai_tra_hang", header: "Trạng thái", render: (r) => <StatusBadge value={r.trang_thai_tra_hang} tones={TRA_HANG_TRANG_THAI_TONE} /> },
    {
      key: "actions", header: "",
      render: (r) => {
        if (DA_DONG.includes(r.trang_thai_tra_hang)) return null;
        return (
          <div className="flex gap-1">
            {canXuLy(r.trang_thai_tra_hang) && (
              <>
                <Btn size="sm" disabled={logMutation.isPending} onClick={() => logMutation.mutate({ id: r.id, hanhDong: "duyet" })}>Duyệt</Btn>
                <Btn size="sm" variant="danger" disabled={logMutation.isPending} onClick={() => logMutation.mutate({ id: r.id, hanhDong: "tu_choi" })}>Từ chối</Btn>
              </>
            )}
            {(canKeToan || canKho) && CO_THE_DAY_LUI.includes(r.trang_thai_tra_hang) && (
              <Btn size="sm" variant="ghost" onClick={() => { setLayLuiId(r.id); setGhiChu(""); }}>Đẩy lùi</Btn>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="mt-4">
      <div className="flex gap-2 mb-3">
        <Select
          value={filterTrangThai}
          onChange={setFilterTrangThai}
          options={[
            { value: "", label: "Tất cả" },
            { value: "Cho ke toan duyet mem", label: "Chờ kế toán duyệt mềm" },
            { value: "Cho kho xac nhan", label: "Chờ kho xác nhận" },
            { value: "Cho QC xac nhan", label: "Chờ QC xác nhận" },
            { value: "Cho TN duyet tong", label: "Chờ TN duyệt tổng" },
            { value: "Cho ke toan xac nhan nhap kho", label: "Chờ kế toán xác nhận nhập kho" },
            { value: "Cho kho xac nhan nhap kho", label: "Chờ kho xác nhận nhập kho" },
            { value: "Da hoan thanh", label: "Đã hoàn thành" },
            { value: "Tu choi", label: "Từ chối" },
            { value: "Da huy", label: "Đã huỷ" },
          ]}
        />
      </div>
      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3 bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-3 py-2">
          <span className="text-sm">Đã chọn {selected.size} dòng</span>
          <Btn size="sm" onClick={() => bulkMutation.mutate("duyet")} disabled={bulkMutation.isPending}>Duyệt tất cả</Btn>
          <Btn size="sm" variant="danger" onClick={() => bulkMutation.mutate("tu_choi")} disabled={bulkMutation.isPending}>Từ chối tất cả</Btn>
        </div>
      )}
      <PaginatedTable columns={cols} rows={(data?.rows ?? []).slice((page - 1) * 20, page * 20)} isLoading={isLoading} isError={isError} page={page} pageSize={20} total={data?.rows.length ?? 0} onPageChange={setPage} rowKey={(r) => r.id} />
      {layLuiId && (
        <Modal open title="Đẩy lùi 1 bước" onClose={() => setLayLuiId(null)}>
          <div className="space-y-3 text-sm">
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder="Lý do đẩy lùi (bắt buộc)"
              className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="sm" onClick={() => setLayLuiId(null)}>Hủy</Btn>
              <Btn size="sm" onClick={() => layLuiMutation.mutate()} disabled={layLuiMutation.isPending || !ghiChu.trim()}>Xác nhận</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
