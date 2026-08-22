import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "../components/ui/Tabs";
import { Btn } from "../components/ui/Btn";
import { Badge, statusTone } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { KhuVucFilterControl } from "../components/KhuVucFilterControl";
import { KtvNameWithPhone, KTV_PHONE_EDIT_ROLES } from "../components/KtvNameWithPhone";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { ChartCanvas } from "../components/chart/ChartCanvas";
import { api, buildQuery } from "../api/client";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/AuthContext";
import { LOAI_LOI_META, LOAI_LOI_KEYS, parseLoaiKhaoSat, type LoaiLoi, type ViPhamRow, type KetQuaGoiRow } from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { CASE_FIELD_LABELS } from "../lib/caseFieldLabels";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { shortKhuVuc } from "../lib/khuVucShortLabel";
import { usePersonDirectory, formatPersonDisplay } from "../lib/personDisplay";

// Khop dung field tra ve tu backend GET /survey?tab=... (xem SELECT trong backend/src/routes/survey.ts) -
// gop ca 2 hinh dang hang co the co (CanKhaoSatRow cho can-khao-sat/qua-han-khao-sat, ViPhamRow cho
// cho-qc/da-xu-ly), du 1 lan xuat chi co 1 trong 2 hinh dang.
const SURVEY_EXPORT_LABELS: Record<string, string> = {
  ...CASE_FIELD_LABELS,
  case_id: "Ca",
  ket_qua_goi_id: "ID cuộc gọi khảo sát",
  loai_loi: "Loại lỗi",
  ket_qua_cap_1: "Kết quả cấp 1",
  chot_bo_cap_2: "Chốt cấp 2",
  nguoi_ghi_nhan: "Người ghi nhận",
  ngay_ghi_nhan: "Ngày ghi nhận",
  nguoi_chot: "Người chốt",
  ngay_chot: "Ngày chốt",
  need_loi_120p: "Nghi ngờ lỗi 120 phút",
  need_loi_qua_han_24h: "Nghi ngờ hẹn quá 24h",
  need_loi_lo_ke_hoach: "Nghi ngờ lỡ kế hoạch",
  need_loi_kh_hen_lai: "Nghi ngờ KH hẹn lại",
  loai_khao_sat: "Loại khảo sát",
  doi_tuong_lien_he: "Đối tượng liên hệ",
  ket_qua_cuoc_goi: "Kết quả cuộc gọi",
  dien_giai: "Diễn giải",
  ghi_chu: "Ghi chú",
  ly_do_that_bai: "Lý do thất bại",
  can_goi_lai: "Cần gọi lại",
  nguoi_thuc_hien: "Người thực hiện",
  ngay_gio_thuc_hien: "Ngày giờ thực hiện",
};

// Khop dung gia tri backend/src/routes/survey.ts POST /calls chap nhan (xem KET_QUA_GOI_OPTIONS
// trong SurveyCallWorkspace.tsx) - lap lai o day thay vi import de tranh vong lap module
// (SurveyCallWorkspace.tsx da import nguoc lai tu file nay).
const KET_QUA_CUOC_GOI_OPTIONS = ["Liên hệ thành công", "Không nghe máy", "Số sai / không liên lạc được", "Không cần khảo sát"];
import { QLDVBH_FILTER_VALUE } from "../constants";
import { SurveyCallWorkspace } from "./SurveyCallWorkspace";
import { useSurveyCandidates } from "../hooks/useSurveyCandidates";
import { TinhHuyenFilterControl } from "../components/TinhHuyenFilterControl";

interface FunnelData {
  nghiNgo: number;
  canKhaoSat: number;
  choQc: number;
  daXuLy: number;
}
interface LeaderboardRow {
  nhom?: string;
  giam_sat_email?: string;
  giam_sat?: string | null;
  so_vi_pham: number;
  tong_ca: number;
  ty_le_vi_pham: number;
}
interface TrendRow {
  ngay: string;
  so_cuoc_goi: number;
}

export interface CanKhaoSatRow {
  id: string;
  khach_hang: string | null;
  khu_vuc: string | null;
  seri_san_pham?: string | null;
  assigned_to: string | null;
  need_loi_120p: number;
  need_loi_qua_han_24h: number;
  need_loi_lo_ke_hoach: number;
  need_loi_kh_hen_lai: number;
  mo_ta_loi?: string | null;
  ky_thuat_vien?: string | null;
  tinh?: string | null;
  quan_huyen?: string | null;
  thoi_gian_cskh_tiep_nhan?: string | null;
  thoi_gian_hen_xu_ly?: string | null;
  thoi_gian_hoan_thanh?: string | null;
  link_crm?: string | null;
  noi_dung_xu_ly?: string | null;
}

interface SurveyBaoCaoRow {
  nhom: string;
  tong_tiep_nhan: number;
  tong_hoan_thanh: number;
  nghi_ngo_120p: number;
  nghi_ngo_24h: number;
  nghi_ngo_lkh: number;
  nghi_ngo_hl: number;
  da_goi_120p: number;
  da_goi_24h: number;
  da_goi_lkh: number;
  da_goi_hl: number;
  vi_pham_120p: number;
  vi_pham_24h: number;
  vi_pham_lkh: number;
  vi_pham_hl: number;
  tong_cuoc_goi: number;
  goi_thanh_cong: number;
  can_khao_sat: number;
  tong_nghi_ngo: number;
  tong_vi_pham: number;
  ksnb_chot: number;
  ksnb_bo: number;
  da_khao_sat: number;
  cho_khao_sat: number;
  khao_sat_that_bai: number;
  cho_khao_sat_lai: number;
  bo_qua_khong_khao_sat: number;
  ty_le_nghi_ngo_120p: number;
  ty_le_nghi_ngo_24h: number;
  ty_le_nghi_ngo_lkh: number;
  ty_le_nghi_ngo_hl: number;
  ty_le_vi_pham_120p: number;
  ty_le_vi_pham_24h: number;
  ty_le_vi_pham_lkh: number;
  ty_le_vi_pham_hl: number;
  ty_le_da_goi_120p: number;
  ty_le_da_goi_24h: number;
  ty_le_da_goi_lkh: number;
  ty_le_da_goi_hl: number;
  ty_le_vi_pham_tren_da_goi_120p: number;
  ty_le_vi_pham_tren_da_goi_24h: number;
  ty_le_vi_pham_tren_da_goi_lkh: number;
  ty_le_vi_pham_tren_da_goi_hl: number;
  ty_le_da_goi_hen_lai_toan_he_thong: number;
  ty_le_ktv_chu_dong_toan_he_thong: number;
  ty_le_goi_thanh_cong: number;
}

const SURVEY_REPORT_DIM_OPTIONS = [
  { value: "khu_vuc", label: "Khu vực" },
  { value: "tinh", label: "Tỉnh" },
  { value: "ky_thuat_vien", label: "KTV" },
];

const SURVEY_BAO_CAO_EXPORT_LABELS: Record<string, string> = {
  nhom: "Nhóm",
  tong_tiep_nhan: "Ca CRM mở mới",
  tong_hoan_thanh: "Ca CRM đã đóng",
  can_khao_sat: "Cần khảo sát",
  tong_nghi_ngo: "Tổng nghi ngờ",
  tong_vi_pham: "Tổng vi phạm",
  ksnb_chot: "KSNB chốt lỗi",
  ksnb_bo: "KSNB bỏ lỗi",
  da_khao_sat: "Đã khảo sát",
  cho_khao_sat: "Chờ khảo sát",
  khao_sat_that_bai: "Khảo sát thất bại",
  cho_khao_sat_lai: "Đang chờ khảo sát lại",
  bo_qua_khong_khao_sat: "Bỏ qua không khảo sát",
  nghi_ngo_120p: "Nghi ngờ 120 phút",
  ty_le_nghi_ngo_120p: "% Nghi ngờ 120 phút",
  da_goi_120p: "Đã gọi 120 phút",
  ty_le_da_goi_120p: "% Đã gọi 120 phút",
  vi_pham_120p: "Vi phạm 120 phút",
  ty_le_vi_pham_120p: "% Vi phạm 120 phút",
  ty_le_vi_pham_tren_da_goi_120p: "% Vi phạm / đã gọi 120 phút",
  nghi_ngo_24h: "Nghi ngờ quá 24h",
  ty_le_nghi_ngo_24h: "% Nghi ngờ quá 24h",
  da_goi_24h: "Đã gọi quá 24h",
  ty_le_da_goi_24h: "% Đã gọi quá 24h",
  vi_pham_24h: "Vi phạm quá 24h",
  ty_le_vi_pham_24h: "% Vi phạm quá 24h",
  ty_le_vi_pham_tren_da_goi_24h: "% Vi phạm / đã gọi quá 24h",
  nghi_ngo_lkh: "Nghi ngờ lỡ kế hoạch",
  ty_le_nghi_ngo_lkh: "% Nghi ngờ lỡ kế hoạch",
  da_goi_lkh: "Đã gọi lỡ kế hoạch",
  ty_le_da_goi_lkh: "% Đã gọi lỡ kế hoạch",
  vi_pham_lkh: "Vi phạm lỡ kế hoạch",
  ty_le_vi_pham_lkh: "% Vi phạm lỡ kế hoạch",
  ty_le_vi_pham_tren_da_goi_lkh: "% Vi phạm / đã gọi lỡ kế hoạch",
  nghi_ngo_hl: "Nghi ngờ hẹn lại",
  ty_le_nghi_ngo_hl: "% Nghi ngờ hẹn lại",
  da_goi_hl: "Đã gọi hẹn lại",
  ty_le_da_goi_hl: "% Đã gọi hẹn lại",
  vi_pham_hl: "Vi phạm hẹn lại",
  ty_le_vi_pham_hl: "% Vi phạm hẹn lại",
  ty_le_vi_pham_tren_da_goi_hl: "% Vi phạm / đã gọi hẹn lại",
  ty_le_da_goi_hen_lai_toan_he_thong: "Tỷ lệ % đã gọi hẹn 120'",
  ty_le_ktv_chu_dong_toan_he_thong: "% KTV chủ động 120'",
  tong_cuoc_goi: "Tổng cuộc gọi",
  goi_thanh_cong: "Khảo sát thành công",
  ty_le_goi_thanh_cong: "% Khảo sát thành công",
};

// 3 cot con (Nghi ngo / Da goi / Vi pham) cho 1 nhom loai loi (120p/24h/lo-ke-hoach/hen-lai) trong
// bang "Bao cao khao sat theo khu vuc" - tach rieng tung cot (thay vi gop 1 o nhu truoc) de xep duoi
// 1 tieu de nhom 2 tang (colSpan=3) - xem <thead> cua bang. Mau nen theo loai: Nghi ngo (ocean) / Da
// goi (trung tinh) / Vi pham (coral) - dung nhat quan ca 4 nhom cho de doi chieu ngang qua bang.
function renderNghiNgoTd(count: number, tyLe: number, onClick?: () => void, key?: string) {
  return (
    <td key={key} className="py-2 px-2 text-center bg-[var(--ocean-100)] border-l border-[var(--line)]">
      {onClick ? (
        <button className="font-mono font-semibold text-[var(--ocean-600)] hover:underline" onClick={onClick}>
          {count}
        </button>
      ) : (
        <span className="font-mono font-semibold text-[var(--ocean-600)]">{count}</span>
      )}
      <div className="text-[10px] text-[var(--ocean-600)]">{tyLe}%</div>
    </td>
  );
}
function renderDaGoiTd(count: number, tyLe: number, key?: string) {
  return (
    <td key={key} className="py-2 px-2 text-center bg-slate-50">
      <span className="font-mono font-semibold text-[var(--ink-600)]">{count}</span>
      <div className="text-[10px] text-[var(--ink-400)]">{tyLe}%</div>
    </td>
  );
}
function renderViPhamTd(count: number, tyLe: number, key?: string) {
  return (
    <td key={key} className="py-2 px-2 text-center bg-[var(--coral-100)]">
      <span className="font-mono font-semibold text-[var(--coral-600)]">{count}</span>
      <div className="text-[10px] text-[var(--coral-600)]">{tyLe}%</div>
    </td>
  );
}

export const FLAG_TO_LOAI: Record<string, LoaiLoi> = {
  need_loi_120p: "Loi 120 phut",
  need_loi_qua_han_24h: "Hen qua 24h",
  need_loi_lo_ke_hoach: "Loi lo ke hoach",
  need_loi_kh_hen_lai: "KH hen lai",
};

export function neededLoaiLoi(row: CanKhaoSatRow): LoaiLoi[] {
  return Object.entries(FLAG_TO_LOAI)
    .filter(([field]) => (row as unknown as Record<string, number>)[field])
    .map(([, loai]) => loai);
}

const VIEWS = [
  { key: "bao-cao", label: "Báo cáo" },
  { key: "danh-sach", label: "Danh sách chi tiết" },
];

const PAGE_SIZE = 20;

export function SurveyModule({ openCase }: { openCase: (id: string, tab?: string) => void }) {
  const personDir = usePersonDirectory();
  const [view, setView] = useLocalStorageState("filters:survey-view", "bao-cao");
  const [tab, setTab] = useLocalStorageState("filters:survey-tab", "can-khao-sat");
  const [page, setPage] = useState(1);
  const [localKtvFilter, setLocalKtvFilter] = useState("");
  const [localLoaiLoiFilter, setLocalLoaiLoiFilter] = useState("");
  // CHOT 2026-08-06: doi tu 1 ngay don sang khoang ngay (tu/den) - loc bang so sanh chuoi ISO
  // (YYYY-MM-DD) tren 10 ky tu dau cua truong ngay, dung ca voi truong chi co ngay lan truong co
  // gio (thoi_gian_cskh_tiep_nhan/ngay_ghi_nhan/ngay_gio_thuc_hien).
  const [localNgayTuFilter, setLocalNgayTuFilter] = useState("");
  const [localNgayDenFilter, setLocalNgayDenFilter] = useState("");
  // CHOT 2026-08-06: loc theo ID ca - dung chung cho CA 5 tab cua "Danh sach chi tiet" (khong rieng
  // 1 tab nao), va "Ket qua cuoc goi" - rieng cho tab "Lich su khao sat" (cac tab khac khong co du
  // lieu nay o dang phang, "cho-qc"/"da-xu-ly" la case_id gop nhieu vi_pham nen khong hop).
  const [localIdFilter, setLocalIdFilter] = useState("");
  const [localKetQuaFilter, setLocalKetQuaFilter] = useState("");
  const [workspaceInitialAdHocId, setWorkspaceInitialAdHocId] = useState<string | null>(null);

  const [localNguoiGoiFilter, setLocalNguoiGoiFilter] = useState("");
  const [localLoaiKhaoSatFilter, setLocalLoaiKhaoSatFilter] = useState("");

  useEffect(() => {
    setLocalKtvFilter("");
    setLocalLoaiLoiFilter("");
    setLocalNgayTuFilter("");
    setLocalNgayDenFilter("");
    setLocalIdFilter("");
    setLocalKetQuaFilter("");
    setLocalNguoiGoiFilter("");
    setLocalLoaiKhaoSatFilter("");
    setPage(1);
  }, [tab, view]);

  const [khuVucFilter, setKhuVucFilter] = useLocalStorageState("filters:survey-khu-vuc", "");
  // Thang cho "Danh sach chi tiet" (tab can-khao-sat/qua-han-khao-sat) - CHOT 2026-08-02: gioi han
  // theo thoi_gian_cskh_tiep_nhan (thoi diem mo ca), xem GET /survey/candidates. Khong anh huong
  // cho-qc/da-xu-ly (khac nguon du lieu, van khong gioi han thang nhu truoc).
  const [thangDanhSach, setThangDanhSach] = useLocalStorageState("filters:survey-danh-sach-thang", new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7));
  // Bo loc mo rong cho "Bao cao khao sat theo khu vuc" (Phan C) - tinh/quanHuyen/ktv cung duoc
  // drillDown() set khi bam vao 1 o so trong bang pivot (giong khuVucFilter da co), nen anh huong
  // ca "Danh sach chi tiet" (xem filterParams ben duoi), khong chi rieng bang pivot.
  const [reportDim, setReportDim] = useLocalStorageState("filters:survey-report-dim", "khu_vuc");
  const [tinhFilter, setTinhFilter] = useLocalStorageState("filters:survey-tinh", "");
  const [quanHuyenFilter, setQuanHuyenFilter] = useLocalStorageState("filters:survey-quan-huyen", "");
  const [ktvFilter, setKtvFilter] = useLocalStorageState("filters:survey-ktv", "");
  const [nguoiKhaoSatFilter, setNguoiKhaoSatFilter] = useLocalStorageState("filters:survey-nguoi-khao-sat", "");
  const [thangReport, setThangReport] = useLocalStorageState("filters:survey-thang-report", new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7));
  const [ngayGoiTuReport, setNgayGoiTuReport] = useLocalStorageState("filters:survey-ngay-goi-tu-report", "");
  const [ngayGoiDenReport, setNgayGoiDenReport] = useLocalStorageState("filters:survey-ngay-goi-den-report", "");
  // CHOT 2026-08-06: "Nguon CRM" - suy tu ky tu dau ID ca (T... = CRM 3T, con lai = CRM KRF), xem
  // nguonCrmClause() trong backend/src/routes/survey.ts.
  const [nguonCrmFilter, setNguonCrmFilter] = useLocalStorageState("filters:survey-nguon-crm", "");
  const auth = useAuth();
  const role = auth.status === "authenticated" ? auth.user.vai_tro : null;
  const myAreas = auth.status === "authenticated" ? auth.user.khu_vuc_phu_trach : [];
  const addToast = useToast();
  const qc = useQueryClient();

  const isQC = role === "QC" || role === "Admin";
  const isLead = role === "TN CSKH" || role === "TBP CSKH" || role === "Admin";
  const canSurvey = ["CSKH", "TN CSKH", "TBP CSKH", "Admin"].includes(role ?? "");
  // CHOT 2026-08-05: Mo quyen xem "Danh sach chi tiet" cho vai tro CSKH theo yeu cau cua chu he thong
  const canViewDanhSach = true;
  const visibleViews = canViewDanhSach ? VIEWS : VIEWS.filter((v) => v.key !== "danh-sach");
  const effectiveView = canViewDanhSach ? view : "bao-cao";

  const filterParams = { khu_vuc: khuVucFilter, tinh: tinhFilter, quan_huyen: quanHuyenFilter, ky_thuat_vien: ktvFilter };

  const { data: monthOptions } = useQuery({
    queryKey: ["dashboard-months"],
    queryFn: () => api.get<{ months: string[] }>("/dashboard/months"),
  });
  const currentMonth = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7);
  const danhSachMonthOptions = (monthOptions?.months ?? []).map((m) => ({ value: m, label: m }));
  if (!danhSachMonthOptions.some((o) => o.value === currentMonth)) {
    danhSachMonthOptions.unshift({ value: currentMonth, label: `${currentMonth} (hiện tại)` });
  }

  // "Can khao sat"/"Qua han khao sat" - CHOT 2026-08-02: doc song tu D1, gioi han theo thang mo ca
  // (xem hooks/useSurveyCandidates.ts + backend/src/routes/survey.ts GET /candidates) - loc
  // khu_vuc/tinh/quan_huyen/ky_thuat_vien da chuyen sang server-side (query param), khong con loc
  // client-side nhu truoc.
  const {
    canKhaoSat: canKhaoSatRows,
    quaHanKhaoSat: quaHanKhaoSatRows,
    refetch: refetchCandidates,
  } = useSurveyCandidates({
    thang: thangDanhSach,
    khuVuc: khuVucFilter,
    tinh: tinhFilter,
    quanHuyen: quanHuyenFilter,
    ktv: ktvFilter,
    enabled: view === "danh-sach" && (tab === "can-khao-sat" || tab === "qua-han-khao-sat"),
  });

  const { data: choQc } = useQuery({
    queryKey: ["survey", "cho-qc", filterParams],
    queryFn: () => api.get<{ rows: ViPhamRow[] }>(`/survey${buildQuery({ tab: "cho-qc", ...filterParams })}`),
    enabled: view === "danh-sach" && tab === "cho-qc",
  });
  const { data: daXuLy } = useQuery({
    queryKey: ["survey", "da-xu-ly", filterParams],
    queryFn: () => api.get<{ rows: ViPhamRow[] }>(`/survey${buildQuery({ tab: "da-xu-ly", ...filterParams })}`),
    enabled: view === "danh-sach" && tab === "da-xu-ly",
  });
  // "Lich su khao sat" (CHOT 2026-08-06) - toan bo cuoc goi (ket_qua_goi) trong thang, gioi han
  // giong "Can khao sat"/"Qua han khao sat" (dung chung thangDanhSach) - xem GET /survey/call-history.
  const { data: callHistory } = useQuery({
    queryKey: ["survey", "lich-su-khao-sat", thangDanhSach, filterParams],
    queryFn: () => api.get<{ rows: KetQuaGoiRow[] }>(`/survey/call-history${buildQuery({ thang: thangDanhSach, ...filterParams })}`),
    enabled: view === "danh-sach" && tab === "lich-su-khao-sat",
  });
  const { data: counts } = useQuery({
    queryKey: ["survey-counts", khuVucFilter, thangDanhSach],
    queryFn: () => api.get<Record<string, number>>(`/survey/counts${buildQuery({ khu_vuc: khuVucFilter, thang: thangDanhSach })}`),
  });
  // CHOT 2026-08-20: 5 query cua tab "Bao cao" (baoCaoKhuVuc/funnel/ktvBoard/giamSatBoard/trend) deu
  // "enabled: false" - KHONG tu dong refetch khi doi bo loc/mount, chi chay qua refreshReport() (nut
  // "Cap nhat bao cao", xem ben duoi) - giam so lan goi cac endpoint bao cao dang bi cache mien theo
  // domain "ket_qua_goi" (bump gan nhu lien tuc gio hanh chinh, xem SURVEY_REPORT_DOMAINS o
  // backend/src/routes/survey.ts) thay vi tu dong goi lai moi khi nguoi dung doi Thang/Khu vuc/KTV...
  const { data: baoCaoKhuVuc, refetch: refetchBaoCaoKhuVuc } = useQuery({
    queryKey: ["survey-bao-cao-khu-vuc", reportDim, khuVucFilter, tinhFilter, quanHuyenFilter, ktvFilter, nguoiKhaoSatFilter, thangReport, ngayGoiTuReport, ngayGoiDenReport, nguonCrmFilter],
    queryFn: () =>
      api.get<{ rows: SurveyBaoCaoRow[]; thang: string }>(
        `/survey/bao-cao-khu-vuc${buildQuery({
          dim: reportDim,
          khu_vuc: khuVucFilter,
          tinh: tinhFilter,
          quan_huyen: quanHuyenFilter,
          ky_thuat_vien: ktvFilter,
          nguoi_khao_sat: nguoiKhaoSatFilter,
          thang: thangReport,
          ngay_goi_tu: ngayGoiTuReport || undefined,
          ngay_goi_den: ngayGoiDenReport || undefined,
          nguon_crm: nguonCrmFilter || undefined,
        })}`,
      ),
    enabled: false,
  });

  // Dong "Tong cong" dau bang "Bao cao khao sat theo khu vuc" - cong don cac cot dem tren cac dong
  // dang hien, roi tinh lai TAT CA cot % tu tong (khong cong trung binh % tung dong) - dung CHINH
  // XAC cong thuc backend/src/routes/survey.ts computeSurveyKhuVucReport() (dong 575-595) de khop
  // dung y nghia tung ty le.
  const baoCaoTotal = useMemo(() => {
    const rows = baoCaoKhuVuc?.rows ?? [];
    const pctLocal = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
    const sum = (key: keyof SurveyBaoCaoRow) => rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
    const tong_tiep_nhan = sum("tong_tiep_nhan");
    const tong_hoan_thanh = sum("tong_hoan_thanh");
    const nghi_ngo_120p = sum("nghi_ngo_120p");
    const nghi_ngo_24h = sum("nghi_ngo_24h");
    const nghi_ngo_lkh = sum("nghi_ngo_lkh");
    const nghi_ngo_hl = sum("nghi_ngo_hl");
    const da_goi_120p = sum("da_goi_120p");
    const da_goi_24h = sum("da_goi_24h");
    const da_goi_lkh = sum("da_goi_lkh");
    const da_goi_hl = sum("da_goi_hl");
    const vi_pham_120p = sum("vi_pham_120p");
    const vi_pham_24h = sum("vi_pham_24h");
    const vi_pham_lkh = sum("vi_pham_lkh");
    const vi_pham_hl = sum("vi_pham_hl");
    const tong_cuoc_goi = sum("tong_cuoc_goi");
    const goi_thanh_cong = sum("goi_thanh_cong");
    const can_khao_sat = sum("can_khao_sat");
    const tong_nghi_ngo = sum("tong_nghi_ngo");
    const tong_vi_pham = sum("tong_vi_pham");
    const ksnb_chot = sum("ksnb_chot");
    const ksnb_bo = sum("ksnb_bo");
    const da_khao_sat = sum("da_khao_sat");
    const khao_sat_that_bai = sum("khao_sat_that_bai");
    const cho_khao_sat_lai = sum("cho_khao_sat_lai");
    const bo_qua_khong_khao_sat = sum("bo_qua_khong_khao_sat");
    const row: SurveyBaoCaoRow = {
      nhom: "Tổng cộng",
      tong_tiep_nhan,
      tong_hoan_thanh,
      nghi_ngo_120p,
      nghi_ngo_24h,
      nghi_ngo_lkh,
      nghi_ngo_hl,
      da_goi_120p,
      da_goi_24h,
      da_goi_lkh,
      da_goi_hl,
      vi_pham_120p,
      vi_pham_24h,
      vi_pham_lkh,
      vi_pham_hl,
      tong_cuoc_goi,
      goi_thanh_cong,
      can_khao_sat,
      tong_nghi_ngo,
      tong_vi_pham,
      ksnb_chot,
      ksnb_bo,
      da_khao_sat,
      cho_khao_sat: Math.max(0, can_khao_sat - da_khao_sat),
      khao_sat_that_bai,
      cho_khao_sat_lai,
      bo_qua_khong_khao_sat,
      ty_le_nghi_ngo_120p: pctLocal(nghi_ngo_120p, tong_tiep_nhan),
      ty_le_nghi_ngo_24h: pctLocal(nghi_ngo_24h, tong_tiep_nhan),
      ty_le_nghi_ngo_lkh: pctLocal(nghi_ngo_lkh, tong_tiep_nhan),
      ty_le_nghi_ngo_hl: pctLocal(nghi_ngo_hl, tong_tiep_nhan),
      ty_le_vi_pham_120p: pctLocal(vi_pham_120p, tong_tiep_nhan),
      ty_le_vi_pham_24h: pctLocal(vi_pham_24h, tong_tiep_nhan),
      ty_le_vi_pham_lkh: pctLocal(vi_pham_lkh, tong_tiep_nhan),
      ty_le_vi_pham_hl: pctLocal(vi_pham_hl, tong_tiep_nhan),
      ty_le_da_goi_120p: pctLocal(da_goi_120p, tong_tiep_nhan),
      ty_le_da_goi_24h: pctLocal(da_goi_24h, tong_tiep_nhan),
      ty_le_da_goi_lkh: pctLocal(da_goi_lkh, tong_tiep_nhan),
      ty_le_da_goi_hl: pctLocal(da_goi_hl, tong_tiep_nhan),
      ty_le_vi_pham_tren_da_goi_120p: pctLocal(vi_pham_120p, da_goi_120p),
      ty_le_vi_pham_tren_da_goi_24h: pctLocal(vi_pham_24h, da_goi_24h),
      ty_le_vi_pham_tren_da_goi_lkh: pctLocal(vi_pham_lkh, da_goi_lkh),
      ty_le_vi_pham_tren_da_goi_hl: pctLocal(vi_pham_hl, da_goi_hl),
      ty_le_da_goi_hen_lai_toan_he_thong: pctLocal(tong_tiep_nhan - (nghi_ngo_120p - da_goi_120p), tong_tiep_nhan),
      ty_le_ktv_chu_dong_toan_he_thong: pctLocal(tong_tiep_nhan - nghi_ngo_120p, tong_tiep_nhan),
      ty_le_goi_thanh_cong: pctLocal(goi_thanh_cong, tong_cuoc_goi),
    };
    return row;
  }, [baoCaoKhuVuc]);

  // Cot dau tien sap A-Z.
  const sortedBaoCaoRows = [...(baoCaoKhuVuc?.rows ?? [])].sort((a, b) => a.nhom.localeCompare(b.nhom, "vi"));
  const { data: khuVucOptions } = useQuery({
    queryKey: ["dashboard-filters"],
    queryFn: () =>
      api.get<{ khuVuc: string[]; hang: string[]; tinh: string[]; kyThuatVien: string[]; tinhHuyen: Record<string, string[]> }>("/dashboard/filters"),
  });
  const { data: cskhList } = useQuery({
    queryKey: ["cskh-list"],
    queryFn: () => api.get<{ rows: { email: string; ten: string | null }[] }>("/survey/cskh-list"),
    enabled: isLead,
  });
  const { data: funnel, refetch: refetchFunnel } = useQuery({
    queryKey: ["vi-pham-funnel", thangReport],
    queryFn: () => api.get<FunnelData>(`/vi-pham/funnel${buildQuery({ thang: thangReport })}`),
    enabled: false,
  });
  const { data: ktvBoard, refetch: refetchKtvBoard } = useQuery({
    queryKey: ["vi-pham-leaderboard", "ktv", thangReport],
    queryFn: () => api.get<{ rows: LeaderboardRow[] }>(`/vi-pham/leaderboard${buildQuery({ by: "ktv", thang: thangReport })}`),
    enabled: false,
  });
  const { data: giamSatBoard, refetch: refetchGiamSatBoard } = useQuery({
    queryKey: ["vi-pham-leaderboard", "giam-sat", thangReport],
    queryFn: () => api.get<{ rows: LeaderboardRow[] }>(`/vi-pham/leaderboard${buildQuery({ by: "giam-sat", thang: thangReport })}`),
    enabled: false,
  });
  const { data: trend, refetch: refetchTrend } = useQuery({
    queryKey: ["survey-trend"],
    queryFn: () => api.get<{ rows: TrendRow[] }>("/survey/trend?days=30"),
    enabled: false,
  });
  const trendRows = trend?.rows ?? [];

  const [reportLastUpdated, setReportLastUpdated] = useState<Date | null>(null);
  const [isRefreshingReport, setIsRefreshingReport] = useState(false);
  const reportAutoLoadedRef = useRef(false);

  // Nut "Cap nhat bao cao" - chi diem duy nhat kich hoat 5 query tren (xem enabled: false o tung
  // query). Tu dong chay 1 LAN duy nhat khi mo tab "Bao cao" lan dau (useEffect ben duoi) - sau do
  // doi bo loc (Thang/Khu vuc/KTV...) se KHONG tu goi lai, phai bam nut nay.
  async function refreshReport() {
    setIsRefreshingReport(true);
    try {
      await Promise.all([refetchFunnel(), refetchKtvBoard(), refetchGiamSatBoard(), refetchTrend(), refetchBaoCaoKhuVuc()]);
      setReportLastUpdated(new Date());
    } finally {
      setIsRefreshingReport(false);
    }
  }

  useEffect(() => {
    if (effectiveView === "bao-cao" && !reportAutoLoadedRef.current) {
      reportAutoLoadedRef.current = true;
      refreshReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveView]);

  const groupedViPham = useMemo(() => {
    const list = tab === "cho-qc" ? choQc?.rows ?? [] : daXuLy?.rows ?? [];
    const g = new Map<string, ViPhamRow[]>();
    for (const v of list) {
      if (!g.has(v.case_id)) g.set(v.case_id, []);
      g.get(v.case_id)!.push(v);
    }
    return Array.from(g.entries()).map(([caseId, vs]) => ({ caseId, vs }));
  }, [tab, choQc, daXuLy]);

  const availableKtvs = useMemo(() => {
    const ktvs = new Set<string>();
    if (tab === "can-khao-sat" || tab === "qua-han-khao-sat") {
      const source = tab === "can-khao-sat" ? canKhaoSatRows : quaHanKhaoSatRows;
      for (const r of source) {
        if (r.ky_thuat_vien) ktvs.add(r.ky_thuat_vien.trim());
      }
    } else if (tab === "lich-su-khao-sat") {
      for (const r of callHistory?.rows ?? []) {
        if (r.ky_thuat_vien) ktvs.add(r.ky_thuat_vien.trim());
      }
    } else {
      const source = groupedViPham;
      for (const { vs } of source) {
        for (const v of vs) {
          if (v.ky_thuat_vien) ktvs.add(v.ky_thuat_vien.trim());
        }
      }
    }
    return Array.from(ktvs).sort((a, b) => a.localeCompare(b, "vi"));
  }, [tab, canKhaoSatRows, quaHanKhaoSatRows, groupedViPham, callHistory]);

  // Danh sach nguoi goi thuc te co trong du lieu thang dang xem (khong phai toan bo CSKH) - dung cho
  // filter "Nguoi goi" o tab "Lich su khao sat", CHOT 2026-08-06.
  const availableNguoiGoi = useMemo(() => {
    const nguoiGoi = new Set<string>();
    for (const r of callHistory?.rows ?? []) {
      if (r.nguoi_thuc_hien) nguoiGoi.add(r.nguoi_thuc_hien);
    }
    return Array.from(nguoiGoi).sort((a, b) => a.localeCompare(b, "vi"));
  }, [callHistory]);

  const filteredRows = useMemo(() => {
    let rows = tab === "can-khao-sat" ? canKhaoSatRows : quaHanKhaoSatRows;
    if (localKtvFilter) {
      rows = rows.filter((r) => r.ky_thuat_vien?.trim() === localKtvFilter.trim());
    }
    if (localLoaiLoiFilter) {
      rows = rows.filter((r) => neededLoaiLoi(r).includes(localLoaiLoiFilter as LoaiLoi));
    }
    if (localNgayTuFilter) {
      rows = rows.filter((r) => r.thoi_gian_cskh_tiep_nhan && r.thoi_gian_cskh_tiep_nhan.slice(0, 10) >= localNgayTuFilter);
    }
    if (localNgayDenFilter) {
      rows = rows.filter((r) => r.thoi_gian_cskh_tiep_nhan && r.thoi_gian_cskh_tiep_nhan.slice(0, 10) <= localNgayDenFilter);
    }
    if (localIdFilter) {
      const q = localIdFilter.trim().toLowerCase();
      rows = rows.filter((r) => r.id.toLowerCase().includes(q) || (r.seri_san_pham ?? "").toLowerCase().includes(q));
    }
    return [...rows].sort((a, b) => {
      const da = a.thoi_gian_cskh_tiep_nhan ? new Date(a.thoi_gian_cskh_tiep_nhan).getTime() : 0;
      const db = b.thoi_gian_cskh_tiep_nhan ? new Date(b.thoi_gian_cskh_tiep_nhan).getTime() : 0;
      if (da !== db) return da - db;
      return a.id.localeCompare(b.id);
    });
  }, [tab, canKhaoSatRows, quaHanKhaoSatRows, localKtvFilter, localLoaiLoiFilter, localNgayTuFilter, localNgayDenFilter, localIdFilter]);

  const filteredGroupedViPham = useMemo(() => {
    let list = groupedViPham;
    if (localKtvFilter) {
      list = list.filter(({ vs }) => vs.some((v) => v.ky_thuat_vien?.trim() === localKtvFilter.trim()));
    }
    if (localLoaiLoiFilter) {
      list = list.filter(({ vs }) => vs.some((v) => v.loai_loi === localLoaiLoiFilter));
    }
    if (localNgayTuFilter) {
      list = list.filter(({ vs }) => vs.some((v) => v.ngay_ghi_nhan && v.ngay_ghi_nhan.slice(0, 10) >= localNgayTuFilter));
    }
    if (localNgayDenFilter) {
      list = list.filter(({ vs }) => vs.some((v) => v.ngay_ghi_nhan && v.ngay_ghi_nhan.slice(0, 10) <= localNgayDenFilter));
    }
    if (localIdFilter) {
      const q = localIdFilter.trim().toLowerCase();
      list = list.filter(({ caseId, vs }) => caseId.toLowerCase().includes(q) || vs.some((v) => (v.seri_san_pham ?? "").toLowerCase().includes(q)));
    }
    return [...list].sort((a, b) => {
      const da = a.vs[0]?.ngay_ghi_nhan ? new Date(a.vs[0].ngay_ghi_nhan).getTime() : 0;
      const db = b.vs[0]?.ngay_ghi_nhan ? new Date(b.vs[0].ngay_ghi_nhan).getTime() : 0;
      if (da !== db) return da - db;
      return a.caseId.localeCompare(b.caseId);
    });
  }, [groupedViPham, localKtvFilter, localLoaiLoiFilter, localNgayTuFilter, localNgayDenFilter, localIdFilter]);

  const filteredCallHistory = useMemo(() => {
    let rows = callHistory?.rows ?? [];
    if (localIdFilter) {
      const q = localIdFilter.trim().toLowerCase();
      rows = rows.filter((r) => r.case_id.toLowerCase().includes(q) || (r.seri_san_pham ?? "").toLowerCase().includes(q));
    }
    if (localKtvFilter) {
      rows = rows.filter((r) => r.ky_thuat_vien?.trim() === localKtvFilter.trim());
    }
    if (localKetQuaFilter) {
      rows = rows.filter((r) => r.ket_qua_cuoc_goi === localKetQuaFilter);
    }
    if (localNgayTuFilter) {
      rows = rows.filter((r) => r.ngay_gio_thuc_hien && r.ngay_gio_thuc_hien.slice(0, 10) >= localNgayTuFilter);
    }
    if (localNgayDenFilter) {
      rows = rows.filter((r) => r.ngay_gio_thuc_hien && r.ngay_gio_thuc_hien.slice(0, 10) <= localNgayDenFilter);
    }
    if (localNguoiGoiFilter) {
      rows = rows.filter((r) => r.nguoi_thuc_hien === localNguoiGoiFilter);
    }
    if (localLoaiKhaoSatFilter) {
      rows = rows.filter((r) => parseLoaiKhaoSat(r.loai_khao_sat).includes(localLoaiKhaoSatFilter as LoaiLoi));
    }
    return [...rows].sort((a, b) => new Date(b.ngay_gio_thuc_hien).getTime() - new Date(a.ngay_gio_thuc_hien).getTime());
  }, [callHistory, localIdFilter, localKtvFilter, localKetQuaFilter, localNgayTuFilter, localNgayDenFilter, localNguoiGoiFilter, localLoaiKhaoSatFilter]);

  // Bam vao 1 o so trong bang "Bao cao khao sat theo khu vuc" - gan gia tri dong do vao dung bo loc
  // ung voi reportDim dang chon (giong drillDown trong BacklogModule.tsx), roi chuyen sang Danh
  // sach chi tiet voi tab tuong ung. "nguoiKhaoSatFilter" KHONG tham gia (chi anh huong tu so bang
  // bao cao, khong phai 1 dim de nhom/loc danh sach).
  function drillDown(value: string, targetTab: string) {
    if (reportDim === "khu_vuc") setKhuVucFilter(value);
    else if (reportDim === "tinh") setTinhFilter(value);
    else if (reportDim === "quan_huyen") setQuanHuyenFilter(value);
    else if (reportDim === "ky_thuat_vien") setKtvFilter(value);
    setTab(targetTab);
    setPage(1);
    setView("danh-sach");
  }

  const [assignModal, setAssignModal] = useState<CanKhaoSatRow | null>(null);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

  const qcDecide = useMutation({
    mutationFn: ({ id, chot }: { id: string; chot: boolean }) => api.patch(`/vi-pham/${id}/cap2`, { chot }),
    onSuccess: (_d, vars) => {
      addToast(`QC đã ${vars.chot ? "chốt" : "bỏ"} vi phạm cấp 2 cho ${vars.id}`);
      qc.invalidateQueries({ queryKey: ["survey"] });
      qc.invalidateQueries({ queryKey: ["survey-counts"] });
    },
  });

  async function handleExport() {
    if (tab === "can-khao-sat" || tab === "qua-han-khao-sat") {
      const rows = filteredRows.map((r) => ({ ...r, khu_vuc: shortKhuVuc(r.khu_vuc) }));
      await exportRowsToExcel(rows, `khao_sat_${tab}.xlsx`, "Data", SURVEY_EXPORT_LABELS);
      return;
    }
    if (tab === "lich-su-khao-sat") {
      const rows = filteredCallHistory.map((r) => ({ ...r, khu_vuc: shortKhuVuc(r.khu_vuc) }));
      await exportRowsToExcel(rows, `khao_sat_${tab}.xlsx`, "Data", SURVEY_EXPORT_LABELS);
      return;
    }
    const res = await api.get<{ rows: Record<string, unknown>[] }>(`/survey${buildQuery({ tab, export: true, ...filterParams })}`);
    let rows = res.rows;
    if (localKtvFilter) {
      rows = rows.filter((r) => r.ky_thuat_vien === localKtvFilter);
    }
    if (localLoaiLoiFilter) {
      rows = rows.filter((r) => r.loai_loi === localLoaiLoiFilter);
    }
    if (localNgayTuFilter) {
      rows = rows.filter((r) => typeof r.ngay_ghi_nhan === "string" && r.ngay_ghi_nhan.slice(0, 10) >= localNgayTuFilter);
    }
    if (localNgayDenFilter) {
      rows = rows.filter((r) => typeof r.ngay_ghi_nhan === "string" && r.ngay_ghi_nhan.slice(0, 10) <= localNgayDenFilter);
    }
    rows = rows.map((r) => ({ ...r, khu_vuc: shortKhuVuc(typeof r.khu_vuc === "string" ? r.khu_vuc : null) }));
    await exportRowsToExcel(rows, `khao_sat_${tab}.xlsx`, "Data", SURVEY_EXPORT_LABELS);
  }

  return (
    <div className="anim-in">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="text-sm text-[var(--ink-600)] max-w-2xl">
          Các ca được hệ thống tự động gắn cờ <b>“nghi ngờ vi phạm – cần khảo sát”</b>. CSKH xác minh thực tế qua điện thoại trước khi kết luận có vi phạm hay không.
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap mb-1 mt-2">
        <KhuVucFilterControl
          value={khuVucFilter}
          onChange={(v) => {
            setKhuVucFilter(v);
            setPage(1);
          }}
          options={[
            { value: "", label: "Tất cả khu vực" },
            { value: QLDVBH_FILTER_VALUE, label: "Tất cả DVBH (MB/MN...)" },
            ...(khuVucOptions?.khuVuc.map((k) => ({ value: k, label: k })) ?? []),
          ]}
          myAreas={myAreas}
        />
        {canSurvey && (
          <Btn size="sm" onClick={() => setWorkspaceOpen(true)}>
            🎧 Vào chế độ gọi khảo sát
          </Btn>
        )}
      </div>

      <Tabs active={effectiveView} onChange={setView} tabs={visibleViews} />

      {effectiveView === "bao-cao" ? (
        <div className="mt-4">
          <div className="flex items-center gap-3 mb-4">
            <Btn size="sm" onClick={refreshReport} disabled={isRefreshingReport}>
              {isRefreshingReport ? "⏳ Đang cập nhật..." : "🔄 Cập nhật báo cáo"}
            </Btn>
            <span className="text-xs text-[var(--ink-400)]">
              {reportLastUpdated
                ? `Cập nhật lần cuối: ${reportLastUpdated.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} ${reportLastUpdated.toLocaleDateString("vi-VN")}`
                : "Chưa tải báo cáo"}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Card className="p-4">
              <div className="font-display font-bold text-sm mb-3">
                Phễu xử lý vi phạm <span className="font-normal text-xs text-[var(--ink-400)]">(tháng {thangReport}, theo thời gian mở ca)</span>
              </div>
              <ChartCanvas
                type="bar"
                data={{
                  labels: ["Nghi ngờ vi phạm", "Cần khảo sát", "Chờ QC chốt cấp 2", "Đã xử lý xong"],
                  datasets: [
                    {
                      label: "Số ca",
                      data: [funnel?.nghiNgo ?? 0, funnel?.canKhaoSat ?? 0, funnel?.choQc ?? 0, funnel?.daXuLy ?? 0],
                      backgroundColor: ["#D98A1F", "#1591C9", "#D84C4C", "#159C93"],
                      borderRadius: 6,
                    },
                  ],
                }}
                options={{ indexAxis: "y" as const }}
              />
            </Card>
            <Card className="p-4">
              <div className="font-display font-bold text-sm mb-3">
                Top 10 KTV nhiều vi phạm đã xác nhận nhất <span className="font-normal text-xs text-[var(--ink-400)]">(tháng {thangReport}, tỷ lệ trên tổng số ca của KTV trong tháng)</span>
              </div>
              <ChartCanvas
                type="bar"
                data={{
                  labels: (ktvBoard?.rows ?? []).map((r) => r.nhom ?? "—"),
                  datasets: [{ label: "Tỷ lệ vi phạm (%)", data: (ktvBoard?.rows ?? []).map((r) => r.ty_le_vi_pham), backgroundColor: "#D84C4C", borderRadius: 6 }],
                }}
                options={{
                  indexAxis: "y" as const,
                  plugins: {
                    tooltip: {
                      callbacks: {
                        label: (ctx) => {
                          const r = (ktvBoard?.rows ?? [])[ctx.dataIndex];
                          return `${ctx.formattedValue}% (${r?.so_vi_pham ?? 0}/${r?.tong_ca ?? 0} ca)`;
                        },
                      },
                    },
                  },
                }}
              />
            </Card>
          </div>

          <Card className="p-4 mb-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <div className="font-display font-bold text-sm">Báo cáo khảo sát theo khu vực</div>
                {canViewDanhSach && <div className="text-xs text-[var(--ink-400)] mt-0.5">Bấm vào số "Nghi ngờ" để lọc thẳng xuống danh sách chi tiết.</div>}
              </div>
              <Btn
                variant="ghost"
                size="sm"
                onClick={() =>
                  exportRowsToExcel(
                    reportDim === "khu_vuc" ? sortedBaoCaoRows.map((r) => ({ ...r, nhom: shortKhuVuc(r.nhom) })) : sortedBaoCaoRows,
                    "bao_cao_khao_sat_khu_vuc.xlsx",
                    "Data",
                    SURVEY_BAO_CAO_EXPORT_LABELS,
                  )
                }
              >
                ⬇ Xuất Excel
              </Btn>
            </div>

            <div className="flex items-center gap-2 flex-wrap mb-3">
              <Select
                value={reportDim}
                onChange={(v) => {
                  setReportDim(v);
                  setPage(1);
                }}
                options={[
                  ...SURVEY_REPORT_DIM_OPTIONS,
                  ...(tinhFilter ? [{ value: "quan_huyen", label: "Quận/Huyện" }] : []),
                ]}
              />
              <TinhHuyenFilterControl
                tinh={tinhFilter}
                quanHuyen={quanHuyenFilter}
                tinhOptions={khuVucOptions?.tinh ?? []}
                tinhHuyenMap={khuVucOptions?.tinhHuyen ?? {}}
                onTinhChange={setTinhFilter}
                onQuanHuyenChange={setQuanHuyenFilter}
              />
              <Select
                value={ktvFilter}
                onChange={setKtvFilter}
                options={[{ value: "", label: "Tất cả KTV" }, ...(khuVucOptions?.kyThuatVien ?? []).map((k) => ({ value: k, label: k }))]}
              />
              <Select
                value={nguonCrmFilter}
                onChange={(v) => {
                  setNguonCrmFilter(v);
                  setPage(1);
                }}
                options={[
                  { value: "", label: "Nguồn CRM: Toàn bộ" },
                  { value: "crm_3t", label: "CRM 3T" },
                  { value: "crm_krf", label: "CRM KRF" },
                ]}
              />
              {isLead && (
                <Select
                  value={nguoiKhaoSatFilter}
                  onChange={setNguoiKhaoSatFilter}
                  options={[{ value: "", label: "Tất cả CSKH khảo sát" }, ...(cskhList?.rows ?? []).map((u) => ({ value: u.email, label: u.ten ?? u.email }))]}
                />
              )}
              <input
                type="month"
                value={thangReport}
                onChange={(e) => setThangReport(e.target.value)}
                className="focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
              <div className="flex items-center gap-1">
                <span className="text-xs text-[var(--ink-400)]">Từ ngày</span>
                <input
                  type="date"
                  value={ngayGoiTuReport}
                  onChange={(e) => {
                    setNgayGoiTuReport(e.target.value);
                    setPage(1);
                  }}
                  className="focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                  title="Lọc theo khoảng ngày gọi - từ ngày"
                />
                <span className="text-xs text-[var(--ink-400)]">đến</span>
                <input
                  type="date"
                  value={ngayGoiDenReport}
                  onChange={(e) => {
                    setNgayGoiDenReport(e.target.value);
                    setPage(1);
                  }}
                  className="focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                  title="Lọc theo khoảng ngày gọi - đến ngày"
                />
                {(ngayGoiTuReport || ngayGoiDenReport) && (
                  <button
                    type="button"
                    onClick={() => {
                      setNgayGoiTuReport("");
                      setNgayGoiDenReport("");
                      setPage(1);
                    }}
                    className="text-xs text-[var(--ink-400)] hover:text-[var(--ink-600)] whitespace-nowrap"
                    title="Xóa lọc theo ngày"
                  >
                    ✖ Xóa lọc ngày
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="dense w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                    <th rowSpan={2} className="py-2 pr-3 align-bottom">{SURVEY_REPORT_DIM_OPTIONS.find((d) => d.value === reportDim)?.label ?? (reportDim === "quan_huyen" ? "Quận/Huyện" : "Nhóm")}</th>
                    <th rowSpan={2} className="py-2 pr-3 align-bottom">Ca CRM mở mới</th>
                    <th rowSpan={2} className="py-2 pr-3 align-bottom">Ca CRM đã đóng</th>
                    <th rowSpan={2} className="py-2 pr-3 align-bottom">% KTV chủ động 120'</th>
                    <th rowSpan={2} className="py-2 pr-3 align-bottom">Tỷ lệ % đã gọi hẹn 120'</th>
                    <th rowSpan={2} className="py-2 pr-3 align-bottom">Cần khảo sát</th>
                    <th rowSpan={2} className="py-2 pr-3 align-bottom bg-[var(--amber-100)] text-[var(--amber-700)]">Chờ khảo sát</th>
                    <th rowSpan={2} className="py-2 pr-3 align-bottom">Tổng nghi ngờ</th>
                    <th colSpan={3} className="py-1 px-2 text-center border-l border-[var(--line)]">120 phút</th>
                    <th colSpan={3} className="py-1 px-2 text-center border-l border-[var(--line)]">Quá 24h</th>
                    <th colSpan={3} className="py-1 px-2 text-center border-l border-[var(--line)]">Lỡ kế hoạch</th>
                    <th colSpan={3} className="py-1 px-2 text-center border-l border-[var(--line)]">Hẹn lại</th>
                    <th rowSpan={2} className="py-2 pr-3 align-bottom">Tổng vi phạm</th>
                    <th rowSpan={2} className="py-2 pr-3 align-bottom">KSNB chốt lỗi</th>
                    <th rowSpan={2} className="py-2 pr-3 align-bottom">KSNB bỏ lỗi</th>
                    <th rowSpan={2} className="py-2 pr-3 align-bottom">Đã khảo sát</th>
                    <th rowSpan={2} className="py-2 pr-3 align-bottom">Khảo sát thành công</th>
                    <th rowSpan={2} className="py-2 pr-3 align-bottom">Khảo sát thất bại</th>
                    <th rowSpan={2} className="py-2 pr-3 align-bottom">Đang chờ khảo sát lại</th>
                    <th rowSpan={2} className="py-2 pr-3 align-bottom">Bỏ qua không khảo sát</th>
                  </tr>
                  <tr className="text-left text-[var(--ink-400)] text-[10px] uppercase border-b border-[var(--line)]">
                    {[0, 1, 2, 3].map((i) => (
                      <Fragment key={i}>
                        <th className="py-1 px-2 text-center border-l border-[var(--line)] bg-[var(--ocean-100)] text-[var(--ocean-600)]">Nghi ngờ</th>
                        <th className="py-1 px-2 text-center bg-slate-50">Đã gọi</th>
                        <th className="py-1 px-2 text-center bg-[var(--coral-100)] text-[var(--coral-600)]">Vi phạm</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedBaoCaoRows.length > 0 && (
                    <tr className="border-b border-[var(--line)] bg-slate-50 font-bold align-top">
                      <td className="py-2 pr-3">Tổng cộng</td>
                      <td className="py-2 pr-3 font-mono">{baoCaoTotal.tong_tiep_nhan}</td>
                      <td className="py-2 pr-3 font-mono">{baoCaoTotal.tong_hoan_thanh}</td>
                      <td className="py-2 pr-3 font-mono">{baoCaoTotal.ty_le_ktv_chu_dong_toan_he_thong}%</td>
                      <td className="py-2 pr-3 font-mono">{baoCaoTotal.ty_le_da_goi_hen_lai_toan_he_thong}%</td>
                      <td className="py-2 pr-3 font-mono">{baoCaoTotal.can_khao_sat}</td>
                      <td className="py-2 pr-3 font-mono bg-[var(--amber-100)] text-[var(--amber-700)]">{baoCaoTotal.cho_khao_sat}</td>
                      <td className="py-2 pr-3 font-mono">{baoCaoTotal.tong_nghi_ngo}</td>
                      {renderNghiNgoTd(baoCaoTotal.nghi_ngo_120p, baoCaoTotal.ty_le_nghi_ngo_120p)}
                      {renderDaGoiTd(baoCaoTotal.da_goi_120p, baoCaoTotal.ty_le_da_goi_120p)}
                      {renderViPhamTd(baoCaoTotal.vi_pham_120p, baoCaoTotal.ty_le_vi_pham_tren_da_goi_120p)}
                      {renderNghiNgoTd(baoCaoTotal.nghi_ngo_24h, baoCaoTotal.ty_le_nghi_ngo_24h)}
                      {renderDaGoiTd(baoCaoTotal.da_goi_24h, baoCaoTotal.ty_le_da_goi_24h)}
                      {renderViPhamTd(baoCaoTotal.vi_pham_24h, baoCaoTotal.ty_le_vi_pham_tren_da_goi_24h)}
                      {renderNghiNgoTd(baoCaoTotal.nghi_ngo_lkh, baoCaoTotal.ty_le_nghi_ngo_lkh)}
                      {renderDaGoiTd(baoCaoTotal.da_goi_lkh, baoCaoTotal.ty_le_da_goi_lkh)}
                      {renderViPhamTd(baoCaoTotal.vi_pham_lkh, baoCaoTotal.ty_le_vi_pham_tren_da_goi_lkh)}
                      {renderNghiNgoTd(baoCaoTotal.nghi_ngo_hl, baoCaoTotal.ty_le_nghi_ngo_hl)}
                      {renderDaGoiTd(baoCaoTotal.da_goi_hl, baoCaoTotal.ty_le_da_goi_hl)}
                      {renderViPhamTd(baoCaoTotal.vi_pham_hl, baoCaoTotal.ty_le_vi_pham_tren_da_goi_hl)}
                      <td className="py-2 pr-3 font-mono">{baoCaoTotal.tong_vi_pham}</td>
                      <td className="py-2 pr-3 font-mono">{baoCaoTotal.ksnb_chot}</td>
                      <td className="py-2 pr-3 font-mono">{baoCaoTotal.ksnb_bo}</td>
                      <td className="py-2 pr-3 font-mono">{baoCaoTotal.da_khao_sat}</td>
                      <td className="py-2 pr-3 font-mono">
                        {baoCaoTotal.goi_thanh_cong}/{baoCaoTotal.tong_cuoc_goi} ({baoCaoTotal.ty_le_goi_thanh_cong}%)
                      </td>
                      <td className="py-2 pr-3 font-mono">{baoCaoTotal.khao_sat_that_bai}</td>
                      <td className="py-2 pr-3 font-mono">{baoCaoTotal.cho_khao_sat_lai}</td>
                      <td className="py-2 pr-3 font-mono">{baoCaoTotal.bo_qua_khong_khao_sat}</td>
                    </tr>
                  )}
                  {sortedBaoCaoRows.map((r) => (
                    <tr key={r.nhom} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50 align-top">
                      <td className="py-2 pr-3 font-semibold">{reportDim === "khu_vuc" ? shortKhuVuc(r.nhom) : r.nhom}</td>
                      <td className="py-2 pr-3 font-mono">{r.tong_tiep_nhan}</td>
                      <td className="py-2 pr-3 font-mono">{r.tong_hoan_thanh}</td>
                      <td className="py-2 pr-3 font-mono">{r.ty_le_ktv_chu_dong_toan_he_thong}%</td>
                      <td className="py-2 pr-3 font-mono">{r.ty_le_da_goi_hen_lai_toan_he_thong}%</td>
                      <td className="py-2 pr-3 font-mono">
                        {canViewDanhSach ? (
                          <button className="text-[var(--ocean-600)] hover:underline" onClick={() => drillDown(r.nhom, "can-khao-sat")}>
                            {r.can_khao_sat}
                          </button>
                        ) : (
                          r.can_khao_sat
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono font-semibold bg-[var(--amber-100)] text-[var(--amber-700)]">{r.cho_khao_sat}</td>
                      <td className="py-2 pr-3 font-mono">{r.tong_nghi_ngo}</td>
                      {renderNghiNgoTd(r.nghi_ngo_120p, r.ty_le_nghi_ngo_120p, canViewDanhSach ? () => drillDown(r.nhom, "can-khao-sat") : undefined)}
                      {renderDaGoiTd(r.da_goi_120p, r.ty_le_da_goi_120p)}
                      {renderViPhamTd(r.vi_pham_120p, r.ty_le_vi_pham_tren_da_goi_120p)}
                      {renderNghiNgoTd(r.nghi_ngo_24h, r.ty_le_nghi_ngo_24h, canViewDanhSach ? () => drillDown(r.nhom, "can-khao-sat") : undefined)}
                      {renderDaGoiTd(r.da_goi_24h, r.ty_le_da_goi_24h)}
                      {renderViPhamTd(r.vi_pham_24h, r.ty_le_vi_pham_tren_da_goi_24h)}
                      {renderNghiNgoTd(r.nghi_ngo_lkh, r.ty_le_nghi_ngo_lkh, canViewDanhSach ? () => drillDown(r.nhom, "can-khao-sat") : undefined)}
                      {renderDaGoiTd(r.da_goi_lkh, r.ty_le_da_goi_lkh)}
                      {renderViPhamTd(r.vi_pham_lkh, r.ty_le_vi_pham_tren_da_goi_lkh)}
                      {renderNghiNgoTd(r.nghi_ngo_hl, r.ty_le_nghi_ngo_hl, canViewDanhSach ? () => drillDown(r.nhom, "can-khao-sat") : undefined)}
                      {renderDaGoiTd(r.da_goi_hl, r.ty_le_da_goi_hl)}
                      {renderViPhamTd(r.vi_pham_hl, r.ty_le_vi_pham_tren_da_goi_hl)}
                      <td className="py-2 pr-3 font-mono">{r.tong_vi_pham}</td>
                      <td className="py-2 pr-3 font-mono">{r.ksnb_chot}</td>
                      <td className="py-2 pr-3 font-mono">{r.ksnb_bo}</td>
                      <td className="py-2 pr-3 font-mono">{r.da_khao_sat}</td>
                      <td className="py-2 pr-3 font-mono">
                        {r.goi_thanh_cong}/{r.tong_cuoc_goi} ({r.ty_le_goi_thanh_cong}%)
                      </td>
                      <td className="py-2 pr-3 font-mono">{r.khao_sat_that_bai}</td>
                      <td className="py-2 pr-3 font-mono">{r.cho_khao_sat_lai}</td>
                      <td className="py-2 pr-3 font-mono">{r.bo_qua_khong_khao_sat}</td>
                    </tr>
                  ))}
                  {sortedBaoCaoRows.length === 0 && (
                    <tr>
                      <td colSpan={28} className="py-8 text-center text-[var(--ink-400)] text-sm">
                        Không có dữ liệu.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Card className="p-4">
              <div className="font-display font-bold text-sm mb-3">Xu hướng cuộc gọi khảo sát (30 ngày)</div>
              <ChartCanvas
                type="line"
                data={{
                  labels: trendRows.map((r) => new Date(r.ngay).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })),
                  datasets: [{ label: "Số cuộc gọi", data: trendRows.map((r) => r.so_cuoc_goi), borderColor: "#159C93", backgroundColor: "rgba(21,156,147,0.1)", tension: 0.35, fill: true, pointRadius: 2 }],
                }}
              />
            </Card>
            <Card className="p-4">
              <div className="font-display font-bold text-sm mb-3">
                Top 10 Giám sát nhiều vi phạm đã xác nhận nhất <span className="font-normal text-xs text-[var(--ink-400)]">(tháng {thangReport}, tỷ lệ trên tổng số ca khu vực phụ trách trong tháng)</span>
              </div>
              <ChartCanvas
                type="bar"
                data={{
                  labels: (giamSatBoard?.rows ?? []).map((r) => r.giam_sat ?? r.giam_sat_email ?? "—"),
                  datasets: [{ label: "Tỷ lệ vi phạm (%)", data: (giamSatBoard?.rows ?? []).map((r) => r.ty_le_vi_pham), backgroundColor: "#D98A1F", borderRadius: 6 }],
                }}
                options={{
                  indexAxis: "y" as const,
                  plugins: {
                    tooltip: {
                      callbacks: {
                        label: (ctx) => {
                          const r = (giamSatBoard?.rows ?? [])[ctx.dataIndex];
                          return `${ctx.formattedValue}% (${r?.so_vi_pham ?? 0}/${r?.tong_ca ?? 0} ca)`;
                        },
                      },
                    },
                  },
                }}
              />
            </Card>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          {(tinhFilter || quanHuyenFilter || ktvFilter) && (
            <div className="text-xs text-[var(--ink-400)] mb-2">
              Đang lọc thêm:{" "}
              {[tinhFilter && `Tỉnh "${tinhFilter}"`, quanHuyenFilter && `Huyện "${quanHuyenFilter}"`, ktvFilter && `KTV "${ktvFilter}"`].filter(Boolean).join(", ")}{" "}
              <button
                className="text-[var(--ocean-600)] underline"
                onClick={() => {
                  setTinhFilter("");
                  setQuanHuyenFilter("");
                  setKtvFilter("");
                  setPage(1);
                }}
              >
                Xóa bộ lọc
              </button>
            </div>
          )}
          <Tabs
            active={tab}
            onChange={(k) => {
              setTab(k);
              setPage(1);
            }}
            tabs={[
              { key: "can-khao-sat", label: "Cần khảo sát", count: counts?.["can-khao-sat"] },
              { key: "qua-han-khao-sat", label: "Quá hạn khảo sát", count: counts?.["qua-han-khao-sat"] },
              { key: "cho-qc", label: "Chờ QC chốt cấp 2", count: counts?.["cho-qc"] },
              { key: "da-xu-ly", label: "Đã xử lý xong", count: counts?.["da-xu-ly"] },
              { key: "lich-su-khao-sat", label: "Lịch sử khảo sát" },
            ]}
          />

          {bulkAssignOpen && <BulkAssignModal onClose={() => setBulkAssignOpen(false)} canKhaoSatRows={canKhaoSatRows} onDataChanged={refetchCandidates} />}

          <div className="flex items-center gap-4 mb-3 flex-wrap bg-slate-50 p-2.5 rounded-lg border border-[var(--line)]">
            {(tab === "can-khao-sat" || tab === "qua-han-khao-sat" || tab === "lich-su-khao-sat") && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-[var(--ink-600)]">Tháng:</span>
                <Select value={thangDanhSach} onChange={(v) => { setThangDanhSach(v); setPage(1); }} options={danhSachMonthOptions} />
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-[var(--ink-600)]">ID/Serial:</span>
              <input
                type="text"
                value={localIdFilter}
                onChange={(e) => { setLocalIdFilter(e.target.value); setPage(1); }}
                placeholder="Nhập ID/Serial..."
                className="px-2 py-1 text-xs border border-[var(--line)] rounded bg-white text-[var(--ink-800)] w-32 focus:outline-none focus:border-[var(--ocean-500)]"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-[var(--ink-600)]">KTV trong danh sách:</span>
              <Select
                value={localKtvFilter}
                onChange={(v) => { setLocalKtvFilter(v); setPage(1); }}
                options={[
                  { value: "", label: "Tất cả KTV" },
                  ...availableKtvs.map((k) => ({ value: k, label: k }))
                ]}
              />
            </div>

            {tab !== "lich-su-khao-sat" && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-[var(--ink-600)]">Loại lỗi nghi ngờ:</span>
                <Select
                  value={localLoaiLoiFilter}
                  onChange={(v) => { setLocalLoaiLoiFilter(v); setPage(1); }}
                  options={[
                    { value: "", label: "Tất cả lỗi" },
                    ...LOAI_LOI_KEYS.map((k) => ({ value: k, label: LOAI_LOI_META[k].label }))
                  ]}
                />
              </div>
            )}

            {tab === "lich-su-khao-sat" && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-[var(--ink-600)]">Kết quả cuộc gọi:</span>
                <Select
                  value={localKetQuaFilter}
                  onChange={(v) => { setLocalKetQuaFilter(v); setPage(1); }}
                  options={[
                    { value: "", label: "Tất cả kết quả" },
                    ...KET_QUA_CUOC_GOI_OPTIONS.map((k) => ({ value: k, label: k }))
                  ]}
                />
              </div>
            )}

            {tab === "lich-su-khao-sat" && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-[var(--ink-600)]">Người gọi:</span>
                <Select
                  value={localNguoiGoiFilter}
                  onChange={(v) => { setLocalNguoiGoiFilter(v); setPage(1); }}
                  options={[
                    { value: "", label: "Tất cả người gọi" },
                    ...availableNguoiGoi.map((k) => ({ value: k, label: k }))
                  ]}
                />
              </div>
            )}

            {tab === "lich-su-khao-sat" && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-[var(--ink-600)]">Loại khảo sát:</span>
                <Select
                  value={localLoaiKhaoSatFilter}
                  onChange={(v) => { setLocalLoaiKhaoSatFilter(v); setPage(1); }}
                  options={[
                    { value: "", label: "Tất cả loại" },
                    ...LOAI_LOI_KEYS.map((k) => ({ value: k, label: LOAI_LOI_META[k].label }))
                  ]}
                />
              </div>
            )}

            <div className="flex items-center gap-1.5">
              {/* CHOT 2026-08-05: 1 filter dung chung nhung loc theo 2 truong KHAC NHAU tuy tab (xem
                  filteredRows/filteredGroupedViPham/filteredCallHistory ben tren) - "Can khao sat"/
                  "Qua han khao sat" chua co cuoc goi nao nen loc theo thoi_gian_cskh_tiep_nhan (ngay
                  mo ca), con cac tab con lai da co ket qua goi nen loc theo ngay goi thuc te - nhan
                  phai doi theo tab de dung y nghia, tranh nham la "ngay tao ca". */}
              <span className="text-xs font-semibold text-[var(--ink-600)]">{tab === "can-khao-sat" || tab === "qua-han-khao-sat" ? "Ngày tạo nghi vấn:" : "Ngày gọi:"}</span>
              <span className="text-xs text-[var(--ink-400)]">Từ</span>
              <input
                type="date"
                value={localNgayTuFilter}
                onChange={(e) => { setLocalNgayTuFilter(e.target.value); setPage(1); }}
                className="px-2 py-1 text-xs border border-[var(--line)] rounded bg-white text-[var(--ink-800)] focus:outline-none focus:border-[var(--ocean-500)]"
              />
              <span className="text-xs text-[var(--ink-400)]">đến</span>
              <input
                type="date"
                value={localNgayDenFilter}
                onChange={(e) => { setLocalNgayDenFilter(e.target.value); setPage(1); }}
                className="px-2 py-1 text-xs border border-[var(--line)] rounded bg-white text-[var(--ink-800)] focus:outline-none focus:border-[var(--ocean-500)]"
              />
            </div>

            {(localKtvFilter || localLoaiLoiFilter || localNgayTuFilter || localNgayDenFilter || localIdFilter || localKetQuaFilter || localNguoiGoiFilter || localLoaiKhaoSatFilter) && (
              <button
                className="text-xs text-[var(--ocean-600)] hover:underline ml-auto font-medium"
                onClick={() => {
                  setLocalKtvFilter("");
                  setLocalLoaiLoiFilter("");
                  setLocalNgayTuFilter("");
                  setLocalNgayDenFilter("");
                  setLocalIdFilter("");
                  setLocalKetQuaFilter("");
                  setLocalNguoiGoiFilter("");
                  setLocalLoaiKhaoSatFilter("");
                  setPage(1);
                }}
              >
                Xóa lọc nhanh
              </button>
            )}

            <div className="flex items-center gap-2 ml-auto">
              {tab === "can-khao-sat" && isLead && (
                <Btn variant="ghost" size="sm" onClick={() => setBulkAssignOpen(true)}>
                  ⇄ Gán CSKH hàng loạt
                </Btn>
              )}
              <Btn variant="ghost" size="sm" onClick={handleExport}>
                ⬇ Xuất Excel
              </Btn>
            </div>
          </div>
          {tab === "qua-han-khao-sat" && (
            <div className="text-xs text-[var(--ink-400)] mb-2">Ca đã hoàn thành quá 3 ngày mà chưa khảo sát — có thể gọi hoặc bỏ qua nếu đã quá muộn.</div>
          )}

          {(tab === "can-khao-sat" || tab === "qua-han-khao-sat") &&
            (() => {
              const fullRows = filteredRows;
              const columns: Column<CanKhaoSatRow>[] = [
                { key: "id", header: "Ca", render: (row) => (
                  <span className="font-mono text-[var(--ocean-600)] font-semibold cursor-pointer" onClick={() => openCase(row.id, "vi-pham")}>
                    {row.id}
                  </span>
                ) },
                { key: "khach_hang", header: "Khách hàng", render: (row) => row.khach_hang },
                { key: "ky_thuat_vien", header: "Kỹ thuật viên", render: (row) => <span className="text-xs"><KtvNameWithPhone kyThuatVien={row.ky_thuat_vien} canEdit={!!role && KTV_PHONE_EDIT_ROLES.includes(role)} /></span> },
                { key: "loai_loi", header: "Loại lỗi nghi ngờ", render: (row) => (
                  <div className="flex flex-wrap gap-1">
                    {neededLoaiLoi(row).map((loai) => (
                      <Badge key={loai} tone="ocean">
                        {LOAI_LOI_META[loai].short}
                      </Badge>
                    ))}
                  </div>
                ) },
                { key: "assigned_to", header: "Phân công", render: (row) => <span className="text-xs">{row.assigned_to || <span className="italic text-[var(--ink-400)]">Chưa phân công</span>}</span> },
                { key: "khu_vuc", header: "Khu vực", render: (row) => shortKhuVuc(row.khu_vuc) },
                {
                  key: "action",
                  header: "",
                  className: "text-right whitespace-nowrap",
                  render: (row) => {
                    const hasAction = canSurvey || isLead;
                    if (!hasAction) return null;
                    return (
                      <div className="flex gap-1.5 justify-end">
                        {canSurvey && (
                          <Btn
                            size="sm"
                            variant="primary"
                            onClick={() => {
                              setWorkspaceInitialAdHocId(row.id);
                              setWorkspaceOpen(true);
                            }}
                          >
                            ☎ Báo cáo cuộc gọi
                          </Btn>
                        )}
                        {isLead && (
                          <Btn size="sm" variant="ghost" onClick={() => setAssignModal(row)}>
                            Phân công
                          </Btn>
                        )}
                      </div>
                    );
                  },
                },
              ];
              return (
                <PaginatedTable
                  columns={columns}
                  rows={fullRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
                  isLoading={false}
                  isError={false}
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={fullRows.length}
                  onPageChange={setPage}
                  rowKey={(row) => row.id}
                  emptyText="Không có mục nào."
                  storageKey="survey-can-khao-sat"
                />
              );
            })()}

          {(tab === "cho-qc" || tab === "da-xu-ly") &&
            (() => {
              const columns: Column<(typeof groupedViPham)[number]>[] = [
                {
                  key: "caseId",
                  header: "Ca",
                  render: ({ caseId }) => (
                    <span className="font-mono text-[var(--ocean-600)] font-semibold cursor-pointer" onClick={() => openCase(caseId, "vi-pham")}>
                      #{caseId}
                    </span>
                  ),
                },
                {
                  key: "khach_hang",
                  header: "Khách hàng",
                  render: ({ vs }) => vs[0].khach_hang,
                },
                {
                  key: "ky_thuat_vien",
                  header: "Kỹ thuật viên",
                  render: ({ vs }) => <span className="text-xs"><KtvNameWithPhone kyThuatVien={vs[0].ky_thuat_vien} canEdit={!!role && KTV_PHONE_EDIT_ROLES.includes(role)} /></span>,
                },
                {
                  key: "ket_qua",
                  header: "Kết quả khảo sát",
                  render: ({ vs }) => (
                    <div className="flex flex-wrap gap-1">
                      {vs.map((v) => (
                        <Badge key={v.id} tone={statusTone(v.chot_bo_cap_2 !== null ? (v.chot_bo_cap_2 ? "đã xác nhận" : "Không vi phạm") : "chờ QC")}>
                          {LOAI_LOI_META[v.loai_loi]?.short ?? v.loai_loi} · {v.ket_qua_cap_1}
                        </Badge>
                      ))}
                    </div>
                  ),
                },
                {
                  key: "khu_vuc",
                  header: "Khu vực",
                  render: ({ vs }) => shortKhuVuc(vs[0].khu_vuc),
                },
                {
                  key: "action",
                  header: "",
                  className: "text-right",
                  render: ({ caseId, vs }) => (
                    <div className="text-right">
                      {tab === "cho-qc" && isQC && (
                        <div className="flex gap-1.5 justify-end flex-wrap">
                          {vs.map((v) => (
                            <span key={v.id} className="flex gap-1">
                              <Btn size="sm" variant="success" onClick={() => qcDecide.mutate({ id: v.id, chot: true })}>
                                Chốt {LOAI_LOI_META[v.loai_loi]?.short}
                              </Btn>
                              <Btn size="sm" variant="danger" onClick={() => qcDecide.mutate({ id: v.id, chot: false })}>
                                Bỏ {LOAI_LOI_META[v.loai_loi]?.short}
                              </Btn>
                            </span>
                          ))}
                        </div>
                      )}
                      {tab === "cho-qc" && !isQC && <span className="text-xs text-[var(--ink-400)] italic">Chờ QC xử lý</span>}
                      {tab === "da-xu-ly" && (
                        <Btn size="sm" variant="ghost" onClick={() => openCase(caseId, "vi-pham")}>
                          Xem chi tiết
                        </Btn>
                      )}
                    </div>
                  ),
                },
              ];
              return (
                <PaginatedTable
                  columns={columns}
                  rows={filteredGroupedViPham.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
                  isLoading={false}
                  isError={false}
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={filteredGroupedViPham.length}
                  onPageChange={setPage}
                  rowKey={({ caseId }) => caseId}
                  emptyText="Không có mục nào."
                  storageKey="survey-cho-qc-da-xu-ly"
                />
              );
            })()}

          {tab === "lich-su-khao-sat" &&
            (() => {
              const columns: Column<KetQuaGoiRow>[] = [
                {
                  key: "ngay_gio_thuc_hien",
                  header: "Ngày giờ gọi",
                  render: (r) => <span className="text-xs whitespace-nowrap">{r.ngay_gio_thuc_hien}</span>,
                },
                {
                  key: "case_id",
                  header: "Ca",
                  render: (r) => (
                    <span className="font-mono text-[var(--ocean-600)] font-semibold cursor-pointer" onClick={() => openCase(r.case_id, "khao-sat")}>
                      {r.case_id}
                    </span>
                  ),
                },
                { key: "khach_hang", header: "Khách hàng", render: (r) => r.khach_hang ?? "—" },
                {
                  key: "ky_thuat_vien",
                  header: "Kỹ thuật viên",
                  render: (r) => <span className="text-xs"><KtvNameWithPhone kyThuatVien={r.ky_thuat_vien} canEdit={!!role && KTV_PHONE_EDIT_ROLES.includes(role)} /></span>,
                },
                {
                  key: "loai_khao_sat",
                  header: "Loại khảo sát",
                  render: (r) => {
                    const loaiList = parseLoaiKhaoSat(r.loai_khao_sat);
                    return loaiList.length === 0 ? (
                      <span className="text-xs text-[var(--ink-400)] italic">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {loaiList.map((loai) => (
                          <Badge key={loai} tone="ocean">
                            {LOAI_LOI_META[loai]?.short ?? loai}
                          </Badge>
                        ))}
                      </div>
                    );
                  },
                },
                { key: "ket_qua_cuoc_goi", header: "Kết quả cuộc gọi", render: (r) => r.ket_qua_cuoc_goi ?? "—" },
                {
                  key: "can_goi_lai",
                  header: "Cần gọi lại",
                  render: (r) => (r.can_goi_lai === null ? "—" : <Badge tone={r.can_goi_lai ? "amber" : "gray"}>{r.can_goi_lai ? "Có" : "Không"}</Badge>),
                },
                { key: "nguoi_thuc_hien", header: "Người thực hiện", render: (r) => <span className="text-xs">{formatPersonDisplay(r.nguoi_thuc_hien, personDir)}</span> },
              ];
              return (
                <PaginatedTable
                  columns={columns}
                  rows={filteredCallHistory.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
                  isLoading={false}
                  isError={false}
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={filteredCallHistory.length}
                  onPageChange={setPage}
                  rowKey={(r) => r.id}
                  emptyText="Không có cuộc gọi nào trong tháng này."
                  storageKey="survey-lich-su-khao-sat"
                />
              );
            })()}
        </div>
      )}

      {assignModal && <AssignModal row={assignModal} onClose={() => setAssignModal(null)} onDataChanged={refetchCandidates} />}
      {workspaceOpen && (
        <SurveyCallWorkspace
          initialAdHocId={workspaceInitialAdHocId ?? undefined}
          onExit={() => {
            setWorkspaceOpen(false);
            setWorkspaceInitialAdHocId(null);
            refetchCandidates();
          }}
          openCase={openCase}
          initialKhuVuc={khuVucFilter}
        />
      )}
    </div>
  );
}

function AssignModal({ row, onClose, onDataChanged }: { row: CanKhaoSatRow; onClose: () => void; onDataChanged: () => void }) {
  const { data: cskhList } = useQuery({
    queryKey: ["cskh-list"],
    queryFn: () => api.get<{ rows: { email: string; ten: string | null }[] }>("/survey/cskh-list"),
  });
  const [cskh, setCskh] = useState("");
  const [openAll, setOpenAll] = useState(false);
  const addToast = useToast();
  const qc = useQueryClient();

  const submit = useMutation({
    mutationFn: () => api.post("/survey/assign", { case_id: row.id, assigned_to: openAll ? null : cskh || null }),
    onSuccess: () => {
      addToast(`Đã phân công khảo sát ca ${row.id}`);
      qc.invalidateQueries({ queryKey: ["survey"] });
      qc.invalidateQueries({ queryKey: ["survey-counts"] });
      onDataChanged();
      onClose();
    },
  });

  return (
    <Modal open onClose={onClose} title={`Phân công khảo sát — Ca ${row.id}`}>
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={openAll} onChange={(e) => setOpenAll(e.target.checked)} /> Mở cho tất cả CSKH cùng nhận (ai gọi trước được tính năng suất)
        </label>
        {!openAll && (
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Phân công cho CSKH cụ thể</label>
            <Select
              value={cskh}
              onChange={setCskh}
              options={[{ value: "", label: "— Chọn CSKH —" }, ...(cskhList?.rows ?? []).map((u) => ({ value: u.email, label: u.ten ?? u.email }))]}
              className="w-full mt-1"
            />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>
            Hủy
          </Btn>
          <Btn onClick={() => submit.mutate()} disabled={submit.isPending || (!openAll && !cskh)}>
            Xác nhận phân công
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

interface BulkAssignSummary {
  capNhat: number;
  loi: number;
  errors: string[];
}

function BulkAssignModal({
  onClose,
  canKhaoSatRows,
  onDataChanged,
}: {
  onClose: () => void;
  canKhaoSatRows: CanKhaoSatRow[];
  onDataChanged: () => void;
}) {
  const [step, setStep] = useState<"idle" | "preview">("idle");
  const [preview, setPreview] = useState<BulkAssignSummary | null>(null);
  const [rows, setRows] = useState<{ id?: string; assigned_to?: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addToast = useToast();
  const qc = useQueryClient();

  async function handleDownload() {
    await exportRowsToExcel(canKhaoSatRows, "can_khao_sat_gan_cskh.xlsx");
  }

  const previewMutation = useMutation({
    mutationFn: (rows: { id?: string; assigned_to?: string }[]) => api.post<BulkAssignSummary>("/survey/assign-bulk/preview", { rows }),
    onSuccess: (summary) => {
      setPreview(summary);
      setStep("preview");
    },
    onError: () => addToast("Không đọc được file, kiểm tra lại định dạng."),
  });

  const commitMutation = useMutation({
    mutationFn: () => api.post<BulkAssignSummary>("/survey/assign-bulk/commit", { rows }),
    onSuccess: (summary) => {
      addToast(`Đã gán CSKH cho ${summary.capNhat} ca`);
      qc.invalidateQueries({ queryKey: ["survey"] });
      qc.invalidateQueries({ queryKey: ["survey-counts"] });
      onDataChanged();
      onClose();
    },
    onError: () => addToast("Gán CSKH hàng loạt thất bại, thử lại sau."),
  });

  async function handleFileChosen(file: File) {
    const XLSX = await import("xlsx");
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      const workbook = XLSX.read(data, { type: "binary" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json<{ id?: string; assigned_to?: string }>(sheet, { defval: "" });
      setRows(parsed);
      previewMutation.mutate(parsed);
    };
    reader.readAsBinaryString(file);
  }

  return (
    <Modal open onClose={onClose} title="Gán CSKH hàng loạt" width="max-w-xl">
      <div className="text-sm text-[var(--ink-600)] mb-4">
        1. Tải danh sách hiện tại (có cột <b className="font-mono">assigned_to</b>) → 2. Điền email CSKH phụ trách cho từng dòng trong Excel → 3. Tải file đã điền lên
        đây để cập nhật hàng loạt.
      </div>
      <Btn variant="ghost" size="sm" onClick={handleDownload} className="mb-4">
        ⬇ Tải danh sách hiện tại
      </Btn>

      {step === "idle" && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer border-2 border-dashed border-[var(--ocean-100)] rounded-2xl p-8 text-center hover:border-[var(--ocean-400)] hover:bg-[var(--ocean-100)]/20 transition-colors"
        >
          <div className="text-2xl mb-2">⇩</div>
          <div className="font-semibold text-sm text-[var(--ink-900)]">{previewMutation.isPending ? "Đang phân tích file…" : "Bấm để chọn file đã điền"}</div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileChosen(file);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {step === "preview" && preview && (
        <div className="anim-in">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl bg-[var(--teal-500)]/10 p-3">
              <div className="text-xs text-[var(--ink-400)]">Sẽ cập nhật</div>
              <div className="text-xl font-bold text-[var(--teal-500)]">{preview.capNhat}</div>
            </div>
            <div className="rounded-xl bg-[var(--coral-500)]/10 p-3">
              <div className="text-xs text-[var(--ink-400)]">Lỗi</div>
              <div className="text-xl font-bold text-[var(--coral-500)]">{preview.loi}</div>
            </div>
          </div>
          {preview.errors.length > 0 && (
            <div className="text-xs text-[var(--coral-500)] mb-4 max-h-24 overflow-y-auto">
              {preview.errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Btn onClick={() => commitMutation.mutate()} disabled={commitMutation.isPending || preview.capNhat === 0}>
              {commitMutation.isPending ? "Đang cập nhật…" : "Xác nhận gán CSKH"}
            </Btn>
            <Btn
              variant="ghost"
              onClick={() => {
                setStep("idle");
                setPreview(null);
              }}
            >
              Hủy
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}
