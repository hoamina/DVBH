import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "../components/ui/Card";
import { StatCard } from "../components/ui/StatCard";
import { Select } from "../components/ui/Select";
import { Btn } from "../components/ui/Btn";
import { Tabs } from "../components/ui/Tabs";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { Badge, statusTone } from "../components/ui/Badge";
import { useToast } from "../components/ui/Toast";
import { KhuVucFilterControl } from "../components/KhuVucFilterControl";
import { api, buildQuery } from "../api/client";
import { exportRowsToExcel } from "../lib/exportExcel";
import { useExportRunner } from "../hooks/useExportRunner";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { useAuth } from "../auth/AuthContext";
import { QLDVBH_FILTER_VALUE, CURRENT_MONTH_VALUE } from "../constants";
import { shortKhuVuc } from "../lib/khuVucShortLabel";
import { tr } from "../i18n/tr";

const ALL_KHU_VUC = "Tất cả khu vực";
const ALL_KTV = "Tất cả KTV";
const ALL_NHOM_KH = "Tất cả nhóm KH";
const ALL_NGUON_CRM = "Tất cả nguồn";

interface BaoCaoViPhamFilters {
  thang: string;
  khu_vuc: string;
  ky_thuat_vien: string;
  nhom_kh: string;
  nguon_crm: string;
}

interface TongQuanPayload {
  slGhiNhan: number;
  slKtvGiaiTrinh: number;
  slGsGiaiTrinh: number;
  slChoKtvGiaiTrinh: number;
  slChoQcChot: number;
  slQcDaChot: number;
  slQcDaBo: number;
}

interface DaChieuRow {
  nhom: string;
  soGhiNhan: number;
  soDaChot: number;
  soDaBo: number;
  tyLeDaChot: number;
  tongDiemThe: number;
  soKtvGiaiTrinh: number;
  soGsGiaiTrinh: number;
  soChoGiaiTrinh: number;
  tyLeGiaiTrinh: number;
  // 2026-10-24: ca dong trong thang (Hoàn thành + Không hoàn thành XLSC) + ty le chot loi = SL da chot / ca dong.
  // null khi phan tich theo "Kết quả cấp 1" (thuoc tinh cua vi pham, khong gan voi ca dong).
  soCaDong: number | null;
  tyLeChotLoi: number | null;
}

interface DiemTheRow {
  kyThuatVien: string;
  khuVuc: string | null;
  soViPham: number;
  tongDiem: number;
}

interface DanhSachRow {
  id: string;
  source: "case" | "ktv";
  caseId: string | null;
  khuVuc: string | null;
  kyThuatVien: string | null;
  khachHang: string | null;
  loaiLoi: string;
  ketQuaCap1: string | null;
  trangThai: string;
  chotBoCap2: number | null;
  ghiChu: string | null;
  diemThe: number;
  nguoiGhiNhan: string;
  ngayGhiNhan: string;
  nguoiChot: string | null;
  ngayChot: string | null;
  // Chi co o dong source==="case" (doc vi_pham_giai_trinh) - xem GIAI_TRINH_COLS trong
  // backend/src/lib/viPhamBaoCao.ts, dong "ktv" luon null (vi_pham_ktv khong co buoc giai trinh).
  giaiTrinhKtvNoiDung: string | null;
  giaiTrinhKtvNgay: string | null;
  giaiTrinhGsNoiDung: string | null;
  giaiTrinhGsNgay: string | null;
}

// CHOT voi chu he thong 2026-09-22 (lan 2): "Khong loi" KHONG con la 1 lua chon loc o day - vi pham
// CSKH ket luan khong loi KHONG duoc tinh la vi pham, loai het khoi danh sach nay tu goc (xem chu
// thich computeViPhamDanhSach trong backend/src/lib/viPhamBaoCao.ts).
const TRANG_THAI_OPTIONS = [
  { value: "", label: tr("Tất cả trạng thái") },
  { value: "cho_giai_trinh", label: tr("Chờ KTV/GS giải trình") },
  { value: "cho_qc_chot", label: tr("Chờ QC chốt") },
  { value: "da_chot", label: tr("QC đã chốt") },
  { value: "da_bo", label: tr("QC đã bỏ") },
];

// Ca 500 dong tren man hinh vua khop LIMIT server (xem computeViPhamDanhSach) - dau hieu HEURISTIC
// danh sach co the con bi cat bot, khong phai con so chinh xac (khong query rieng 1 COUNT(*) cho
// tab nay, tranh them 1 nguon rows_read moi chi de hien 1 dong canh bao - xem YEU_CAU_BAO_CAO_
// TINH_SAN.md ve ky luat rows_read).
const DANH_SACH_SCREEN_LIMIT = 500;

// Phan trang phia client tren tap du lieu da tai (toi da DANH_SACH_SCREEN_LIMIT dong) - dung
// nguyen quy uoc PaginatedTable chung toan bo app (vd SurveyModule.tsx), khong tu y dung bang
// tho khong phan trang cho danh sach tung dong nhu tab nay.
const DANH_SACH_PAGE_SIZE = 20;

const DANH_SACH_EXPORT_LABELS: Record<string, string> = {
  id: "Mã vi phạm",
  nguon: "Nguồn",
  caseId: "ID case",
  khuVuc: "Khu vực",
  kyThuatVien: "KTV",
  khachHang: "Khách hàng",
  loaiLoi: "Loại lỗi",
  ketQuaCap1: "Kết quả chốt cấp 1",
  trangThai: "Trạng thái",
  giaiTrinhKtvNoiDung: "Giải trình của KTV",
  giaiTrinhKtvNgay: "Ngày giải trình KTV",
  giaiTrinhGsNoiDung: "Giải trình của GS",
  giaiTrinhGsNgay: "Ngày giải trình GS",
  ketQuaChotQc: "Kết quả chốt QC",
  ghiChu: "Ghi chú",
  diemThe: "Điểm thẻ",
  nguoiGhiNhan: "Người ghi nhận",
  ngayGhiNhan: "Ngày ghi nhận",
  nguoiChot: "Người chốt",
  ngayChot: "Ngày chốt",
};

const NHOM_OPTIONS = [
  { value: "khu_vuc", label: tr("Khu vực") },
  { value: "ky_thuat_vien", label: tr("Kỹ thuật viên") },
  { value: "ket_qua_cap_1", label: tr("Loại lỗi") },
  { value: "nhom_kh", label: tr("Nhóm KH") },
  { value: "nguon_crm", label: tr("Nguồn CRM") },
];

// Tach ma KTV khoi chuoi tho dang "(ma_ktv) Ten hien thi" (quy uoc du lieu CRM, xem
// lib/viPhamBaoCao.ts computeViPhamDiemThe) - khong khop duoc (du lieu khong dung dinh dang, hiem
// gap) thi fallback hien nguyen chuoi goc lam "Ten", "ID" de trong.
function parseKtv(raw: string): { id: string; ten: string } {
  const m = raw.match(/^\(([^)]+)\)\s*(.*)$/);
  return m ? { id: m[1], ten: m[2] || raw } : { id: "—", ten: raw };
}

// Quy doi diem the sang so luong the theo tang (yeu cau chu he thong 2026-09-20): 4 diem = 1 the
// hong; 4 the hong = 1 the vang (= 16 diem); 4 the vang = 1 the do (= 64 diem). Tinh theo he co so 4
// tren don vi "the hong" (hongUnits = floor(diem/4)) roi quy doi tiep len vang/do, thay vi chi hien
// 1 icon cap cao nhat - CHOT trong ban phan tich: 1 loi 16 diem ("Để lại thông tin cá nhân cho KH")
// nhay THANG len 1 the vang, bo qua the hong hoan toan - phai hien du breakdown de khong gay hieu
// lam "tai sao khong co the hong nao ca".
function tinhThe(diem: number): { do: number; vang: number; hong: number } {
  const hongUnits = Math.floor(diem / 4);
  const doCount = Math.floor(hongUnits / 16);
  const conLaiSauDo = hongUnits % 16;
  const vangCount = Math.floor(conLaiSauDo / 4);
  const hongCount = conLaiSauDo % 4;
  return { do: doCount, vang: vangCount, hong: hongCount };
}

function TheBadge({ diem }: { diem: number }) {
  const the = tinhThe(diem);
  if (the.do === 0 && the.vang === 0 && the.hong === 0) {
    return <span className="text-xs text-[var(--ink-400)] italic">{tr("Chưa có thẻ")}</span>;
  }
  const parts: { label: string; cls: string }[] = [];
  if (the.do > 0) parts.push({ label: tr("{0} thẻ đỏ", the.do), cls: "bg-[var(--coral-100)] text-[var(--coral-600)]" });
  if (the.vang > 0) parts.push({ label: tr("{0} thẻ vàng", the.vang), cls: "bg-[var(--amber-100)] text-[var(--amber-600)]" });
  if (the.hong > 0) parts.push({ label: tr("{0} thẻ hồng", the.hong), cls: "bg-pink-100 text-pink-700" });
  return (
    <div className="flex flex-wrap gap-1">
      {parts.map((p) => (
        <span key={p.label} className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${p.cls}`}>
          {p.label}
        </span>
      ))}
    </div>
  );
}

// Nen "nhiet" cho cot % da chot trong bang da chieu - cang nhieu % vi pham da duoc xac nhan thuc su
// (so voi tong ghi nhan) thi nen cang do dam, giup phat hien nhanh nhom co ty le vi pham cao bat
// thuong. Toi da 55% opacity de chu van doc duoc ro tren nen.
function heatBg(pct: number): string {
  const alpha = Math.min(1, Math.max(0, pct) / 100) * 0.55;
  return `rgba(216, 76, 76, ${alpha})`;
}

// Hien 1 o "Giai trinh cua KTV/GS" - rut gon 40 ky tu + ngay giai trinh, dung y het pattern
// giaiTrinhCol() cua SurveyModule.tsx (tab cho-qc/da-xu-ly/vi-pham-da-chot) de nhat quan cach hien
// thi giua 2 noi cung doc du lieu tu vi_pham_giai_trinh.
function renderGiaiTrinh(noiDung: string | null, ngay: string | null) {
  if (!noiDung) return <span className="text-xs text-[var(--ink-300)] italic">{tr("Chưa có")}</span>;
  const rutGon = noiDung.length > 40 ? `${noiDung.slice(0, 40)}…` : noiDung;
  return (
    <div className="text-xs max-w-[200px] truncate" title={noiDung}>
      {rutGon}
      {ngay && <span className="text-[var(--ink-400)]"> ({ngay.slice(0, 10)})</span>}
    </div>
  );
}

// Cot cho PaginatedTable cua tab "Tat ca vi pham" - tach ham rieng (thay vi inline trong JSX) vi
// cot "Thao tac" phu thuoc ca isQC lan chotMutation (callback + trang thai isPending).
function danhSachColumns(isQC: boolean, chotMutation: { isPending: boolean; mutate: (v: { row: DanhSachRow; chot: boolean }) => void }): Column<DanhSachRow>[] {
  const cols: Column<DanhSachRow>[] = [
    {
      key: "id",
      header: tr("Mã VP"),
      render: (r) => (
        <span className="font-mono text-xs">
          {r.id}
          {r.source === "ktv" && <span className="ml-1 text-[10px] text-[var(--ink-400)]" title={tr("Vi phạm import trực tiếp KTV, không gắn ID case")}>(KTV)</span>}
        </span>
      ),
    },
    { key: "caseId", header: "ID case", render: (r) => <span className="font-mono text-xs">{r.caseId ?? "—"}</span> },
    { key: "khuVuc", header: tr("Khu vực"), render: (r) => (r.khuVuc ? shortKhuVuc(r.khuVuc) : "—") },
    { key: "kyThuatVien", header: "KTV", render: (r) => r.kyThuatVien ?? "—" },
    { key: "loaiLoi", header: tr("Loại lỗi"), render: (r) => r.loaiLoi },
    { key: "ketQuaCap1", header: tr("Kết quả cấp 1"), render: (r) => r.ketQuaCap1 ?? "—" },
    { key: "trangThai", header: tr("Trạng thái"), render: (r) => r.trangThai },
    { key: "giaiTrinhKtv", header: tr("Giải trình của KTV"), render: (r) => renderGiaiTrinh(r.giaiTrinhKtvNoiDung, r.giaiTrinhKtvNgay) },
    { key: "giaiTrinhGs", header: tr("Giải trình của GS"), render: (r) => renderGiaiTrinh(r.giaiTrinhGsNoiDung, r.giaiTrinhGsNgay) },
    {
      key: "ketQuaChotQc",
      header: tr("Kết quả chốt QC"),
      render: (r) => (
        <Badge tone={statusTone(r.chotBoCap2 !== null ? (r.chotBoCap2 ? tr("đã xác nhận") : tr("Không vi phạm")) : tr("chờ QC"))}>
          {r.chotBoCap2 !== null ? (r.chotBoCap2 ? tr("Đã xác nhận") : tr("Không vi phạm")) : tr("Chờ QC")}
        </Badge>
      ),
    },
    { key: "diemThe", header: tr("Điểm thẻ"), render: (r) => <span className="font-mono">{r.diemThe || "—"}</span> },
    { key: "ngayGhiNhan", header: tr("Ngày ghi nhận"), render: (r) => <span className="text-xs">{r.ngayGhiNhan}</span> },
    { key: "ghiChu", header: tr("Ghi chú"), render: (r) => <span className="text-xs text-[var(--ink-600)]">{r.ghiChu ?? ""}</span> },
  ];
  if (isQC) {
    cols.push({
      key: "thaoTac",
      header: tr("Thao tác"),
      render: (r) =>
        r.chotBoCap2 === null ? (
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            <Btn size="sm" variant="success" disabled={chotMutation.isPending} onClick={() => chotMutation.mutate({ row: r, chot: true })}>
              {tr("Chốt")}</Btn>
            <Btn size="sm" variant="danger" disabled={chotMutation.isPending} onClick={() => chotMutation.mutate({ row: r, chot: false })}>
              {tr("Bỏ")}</Btn>
          </div>
        ) : (
          <span className="text-xs text-[var(--ink-400)]">—</span>
        ),
    });
  }
  return cols;
}

export function BaoCaoViPhamModule({ openCase }: { openCase: (id: string, tab?: string) => void }) {
  const auth = useAuth();
  const myAreas = auth.status === "authenticated" ? auth.user.khu_vuc_phu_trach : [];
  const role = auth.status === "authenticated" ? auth.user.vai_tro : null;
  const isQC = role === "QC" || role === "Admin";
  const qcClient = useQueryClient();
  const addToast = useToast();
  const [tab, setTab] = useState<"tong-quan" | "da-chieu" | "diem-the" | "danh-sach">("tong-quan");
  const [trangThai, setTrangThai] = useState("");
  const [danhSachPage, setDanhSachPage] = useState(1);
  // Portal target de nut "Tuy chinh cot" cua PaginatedTable render chung 1 hang voi filter Trang
  // thai + nut Xuat Excel (thay vi rieng 1 hang phia tren bang) - xem PaginatedTable.tsx
  // columnSettingsContainer. useState (khong phai useRef) vi can trigger re-render khi DOM node
  // gan xong de PaginatedTable portal vao dung luc.
  const [colSettingsSlot, setColSettingsSlot] = useState<HTMLDivElement | null>(null);
  const [filters, setFilters] = useLocalStorageState<BaoCaoViPhamFilters>("filters:bao-cao-vi-pham", {
    thang: CURRENT_MONTH_VALUE,
    khu_vuc: ALL_KHU_VUC,
    ky_thuat_vien: ALL_KTV,
    nhom_kh: ALL_NHOM_KH,
    nguon_crm: ALL_NGUON_CRM,
  });
  const [nhom, setNhom] = useLocalStorageState<string>("filters:bao-cao-vi-pham:nhom", "khu_vuc");

  const apiParams = {
    thang: filters.thang !== CURRENT_MONTH_VALUE ? filters.thang : undefined,
    khu_vuc: filters.khu_vuc !== ALL_KHU_VUC ? filters.khu_vuc : undefined,
    ky_thuat_vien: filters.ky_thuat_vien !== ALL_KTV ? filters.ky_thuat_vien : undefined,
    nhom_kh: filters.nhom_kh !== ALL_NHOM_KH ? filters.nhom_kh : undefined,
    nguon_crm: filters.nguon_crm !== ALL_NGUON_CRM ? filters.nguon_crm : undefined,
  };

  const { data: filterOptions } = useQuery({
    queryKey: ["dashboard-filters"],
    queryFn: () => api.get<{ khuVuc: string[]; kyThuatVien: string[]; nhomKh: (string | null)[] }>("/dashboard/filters"),
  });
  const { data: monthOptions } = useQuery({
    queryKey: ["dashboard-months"],
    queryFn: () => api.get<{ months: string[] }>("/dashboard/months"),
  });

  const khuVucOptions = [
    ALL_KHU_VUC,
    { value: QLDVBH_FILTER_VALUE, label: tr("Tất cả QLDVBH (MB/MN...)") },
    ...(filterOptions?.khuVuc ?? []).map((k) => ({ value: k, label: k })),
  ];
  const thangOptions = [{ value: CURRENT_MONTH_VALUE, label: tr("Tháng hiện tại") }, ...(monthOptions?.months ?? [])];
  const ktvOptions = [ALL_KTV, ...(filterOptions?.kyThuatVien ?? [])];
  const nhomKhOptions = [ALL_NHOM_KH, ...(filterOptions?.nhomKh ?? []).filter((n): n is string => !!n)];

  // 2026-11-07: mo man / doi bo loc KEO 1 LAN - Tong quan lay qua GET /bao-cao-vi-pham/man kem du lieu dung tab dang mo, roi NAP SAN
  // vao cache cua query tab do (setQueryData) -> query tab thay du lieu moi, khong goi them. Query tab cho Tong quan xong moi chay
  // (enabled ... && !!tongQuan) de khong ban trung. Chuyen tab sau do: Tong quan da co, chi tab moi goi route le nhu truoc.
  const { data: tongQuan } = useQuery({
    queryKey: ["bao-cao-vi-pham-tong-quan", apiParams],
    queryFn: async () => {
      const r = await api.get<{
        tongQuan: TongQuanPayload;
        daChieu: { rows: DaChieuRow[] } | null;
        diemThe: { rows: DiemTheRow[] } | null;
        danhSach: { rows: DanhSachRow[] } | null;
      }>(`/bao-cao-vi-pham/man${buildQuery({ ...apiParams, tab, nhom: tab === "da-chieu" ? nhom : undefined, trang_thai: tab === "danh-sach" ? trangThai || undefined : undefined })}`);
      if (r.daChieu) qcClient.setQueryData(["bao-cao-vi-pham-da-chieu", apiParams, nhom], r.daChieu);
      if (r.diemThe) qcClient.setQueryData(["bao-cao-vi-pham-diem-the", apiParams], r.diemThe);
      if (r.danhSach) qcClient.setQueryData(["bao-cao-vi-pham-danh-sach", apiParams, trangThai], r.danhSach);
      return r.tongQuan;
    },
  });
  const { data: daChieu } = useQuery({
    queryKey: ["bao-cao-vi-pham-da-chieu", apiParams, nhom],
    queryFn: () => api.get<{ rows: DaChieuRow[] }>(`/bao-cao-vi-pham/da-chieu${buildQuery({ ...apiParams, nhom })}`),
    enabled: tab === "da-chieu" && !!tongQuan,
  });
  const { data: diemThe } = useQuery({
    queryKey: ["bao-cao-vi-pham-diem-the", apiParams],
    queryFn: () => api.get<{ rows: DiemTheRow[] }>(`/bao-cao-vi-pham/diem-the${buildQuery(apiParams)}`),
    enabled: tab === "diem-the" && !!tongQuan,
  });
  const { data: danhSach } = useQuery({
    queryKey: ["bao-cao-vi-pham-danh-sach", apiParams, trangThai],
    queryFn: () => api.get<{ rows: DanhSachRow[] }>(`/bao-cao-vi-pham/danh-sach${buildQuery({ ...apiParams, trang_thai: trangThai || undefined })}`),
    enabled: tab === "danh-sach" && !!tongQuan,
  });
  // Quay ve trang 1 moi khi bo loc doi (khong thi co the dung o 1 trang rong neu du lieu moi it
  // hon vi tri trang dang xem).
  useEffect(() => {
    setDanhSachPage(1);
  }, [apiParams.thang, apiParams.khu_vuc, apiParams.ky_thuat_vien, apiParams.nhom_kh, apiParams.nguon_crm, trangThai]);

  // Xuat Excel: goi lai API rieng voi export=true (LIMIT 5000 thay vi 500 tren man hinh) - dung
  // nguyen pattern handleExport() cua SurveyModule.tsx (routes/survey.ts GET /?export=true), KHONG
  // chi xuat dung 500 dong dang hien tren man hinh.
  //
  // Dung whitelist tuong minh (khong spread {...r}) thay vi de exportRowsToExcel() xuat nguyen cot
  // tho cua DanhSachRow - 2 truong "source"/"chotBoCap2" (enum/co the null, dung noi bo cho FE quyet
  // dinh hien nut Chot/Bo) khong co nhan Viet hoa rieng trong DANH_SACH_EXPORT_LABELS nen truoc day
  // bi xuat kem theo TEN KHOA THO (vd cot "chotBoCap2" voi gia tri 0/1/null) thay vi hien nhu cot
  // "Kết quả chốt QC" (dang chu, giong het cot tren man hinh) - CHOT sau bao cao "file tai ve khong
  // du cot" 2026-09-24: chuyen sang derive 2 truong hien thi "nguon"/"ketQuaChotQc" ngay tai day,
  // dam bao Excel khop CHINH XAC danh sach cot dang hien tren man hinh.
  const exportRunner = useExportRunner();
  async function handleExportDanhSach() {
    const res = await api.get<{ rows: DanhSachRow[] }>(`/bao-cao-vi-pham/danh-sach${buildQuery({ ...apiParams, trang_thai: trangThai || undefined, export: "true" })}`);
    const rows = res.rows.map((r) => ({
      id: r.id,
      nguon: r.source === "ktv" ? tr("Import KTV (không gắn case)") : "Case",
      caseId: r.caseId ?? "",
      khuVuc: r.khuVuc ? shortKhuVuc(r.khuVuc) : "",
      kyThuatVien: r.kyThuatVien ?? "",
      khachHang: r.khachHang ?? "",
      loaiLoi: r.loaiLoi,
      ketQuaCap1: r.ketQuaCap1 ?? "",
      trangThai: r.trangThai,
      giaiTrinhKtvNoiDung: r.giaiTrinhKtvNoiDung ?? "",
      giaiTrinhKtvNgay: r.giaiTrinhKtvNgay ?? "",
      giaiTrinhGsNoiDung: r.giaiTrinhGsNoiDung ?? "",
      giaiTrinhGsNgay: r.giaiTrinhGsNgay ?? "",
      ketQuaChotQc: r.chotBoCap2 !== null ? (r.chotBoCap2 ? tr("Đã xác nhận") : tr("Không vi phạm")) : tr("Chờ QC"),
      ghiChu: r.ghiChu ?? "",
      diemThe: r.diemThe,
      nguoiGhiNhan: r.nguoiGhiNhan,
      ngayGhiNhan: r.ngayGhiNhan,
      nguoiChot: r.nguoiChot ?? "",
      ngayChot: r.ngayChot ?? "",
    }));
    await exportRowsToExcel(rows, "bao_cao_vi_pham_danh_sach.xlsx", "Data", DANH_SACH_EXPORT_LABELS);
  }

  // Chot/bo cap 2 ngay trong bang - 2 endpoint khac nhau tuy "source" (xem ViPhamDanhSachRow.source,
  // "ktv" = vi pham import khong gan case, migration 0115, khong co buoc giai trinh qua app ngoai
  // nen QC chot thang tai day thay vi qua SurveyModule).
  const chotMutation = useMutation({
    mutationFn: ({ row, chot }: { row: DanhSachRow; chot: boolean }) =>
      api.patch(row.source === "ktv" ? `/vi-pham-ktv/${row.id}/cap2` : `/vi-pham/${row.id}/cap2`, { chot }),
    onSuccess: () => {
      qcClient.invalidateQueries({ queryKey: ["bao-cao-vi-pham-danh-sach"] });
      qcClient.invalidateQueries({ queryKey: ["bao-cao-vi-pham-tong-quan"] });
      qcClient.invalidateQueries({ queryKey: ["bao-cao-vi-pham-diem-the"] });
      qcClient.invalidateQueries({ queryKey: ["bao-cao-vi-pham-da-chieu"] });
    },
    onError: () => addToast(tr("Không chốt/bỏ được - thử lại sau")),
  });

  const nhomLabel = NHOM_OPTIONS.find((o) => o.value === nhom)?.label ?? "Nhóm";

  return (
    <div className="anim-in">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <KhuVucFilterControl value={filters.khu_vuc} onChange={(v) => setFilters({ ...filters, khu_vuc: v })} options={khuVucOptions} myAreas={myAreas} />
        <Select value={filters.ky_thuat_vien} onChange={(v) => setFilters({ ...filters, ky_thuat_vien: v })} options={ktvOptions} />
        <Select value={filters.nhom_kh} onChange={(v) => setFilters({ ...filters, nhom_kh: v })} options={nhomKhOptions} />
        <Select value={filters.nguon_crm} onChange={(v) => setFilters({ ...filters, nguon_crm: v })} options={[ALL_NGUON_CRM, { value: "crm_3t", label: "CRM 3T" }, { value: "crm_krf", label: "CRM KRF" }]} />
        <Select value={filters.thang} onChange={(v) => setFilters({ ...filters, thang: v })} options={thangOptions} />
      </div>

      <Tabs
        tabs={[
          { key: "tong-quan", label: tr("Tổng quan") },
          { key: "da-chieu", label: tr("Đa chiều") },
          { key: "diem-the", label: tr("Điểm thẻ") },
          { key: "danh-sach", label: tr("Tất cả vi phạm") },
        ]}
        active={tab}
        onChange={(k) => setTab(k as typeof tab)}
      />

      {tab === "tong-quan" && (
        <div className="flex flex-wrap gap-3">
          <StatCard label={tr("SL ghi nhận")} value={tongQuan?.slGhiNhan ?? 0} tone="ocean" />
          <StatCard label={tr("SL KTV đã giải trình")} value={tongQuan?.slKtvGiaiTrinh ?? 0} tone="teal" />
          <StatCard label={tr("SL GS giải trình hộ")} value={tongQuan?.slGsGiaiTrinh ?? 0} tone="teal" />
          <StatCard label={tr("SL chờ KTV/GS giải trình")} value={tongQuan?.slChoKtvGiaiTrinh ?? 0} tone="orange" muted={!tongQuan?.slChoKtvGiaiTrinh} />
          <StatCard label={tr("SL chờ QC chốt")} value={tongQuan?.slChoQcChot ?? 0} tone="amber" muted={!tongQuan?.slChoQcChot} />
          <StatCard label={tr("SL QC đã chốt")} value={tongQuan?.slQcDaChot ?? 0} tone="coral" />
          <StatCard label={tr("SL QC đã bỏ")} value={tongQuan?.slQcDaBo ?? 0} tone="gray" />
        </div>
      )}

      {tab === "da-chieu" && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="font-display font-bold text-sm">{tr("Phân tích theo")}</div>
              <Select value={nhom} onChange={setNhom} options={NHOM_OPTIONS} />
            </div>
            <Btn
              variant="ghost"
              size="sm"
              onClick={() =>
                exportRowsToExcel(
                  (daChieu?.rows ?? []).map((r) => ({ ...r, soCaDong: r.soCaDong ?? "", tyLeChotLoi: r.tyLeChotLoi ?? "" })),
                  `bao_cao_vi_pham_${nhom}.xlsx`,
                  "Data",
                  {
                  nhom: nhomLabel,
                  soCaDong: "Ca đóng trong tháng",
                  tyLeChotLoi: "% Tỷ lệ chốt lỗi",
                  soGhiNhan: "SL ghi nhận",
                  soDaChot: "SL đã chốt",
                  soDaBo: "SL đã bỏ",
                  tyLeDaChot: "% Đã chốt",
                  tongDiemThe: "Tổng điểm thẻ",
                  soKtvGiaiTrinh: "Ca KTV đã giải trình",
                  soGsGiaiTrinh: "Ca GS đã giải trình",
                  soChoGiaiTrinh: "Ca chờ giải trình",
                  tyLeGiaiTrinh: "% Tỷ lệ giải trình",
                  },
                )
              }
            >
              {tr("⬇ Xuất Excel")}</Btn>
          </div>
          <table className="dense w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                <th className="py-2 pr-3">{nhomLabel}</th>
                <th className="py-2 pr-3" title={tr("Số ca có thời gian hoàn thành trong tháng - gồm ca Hoàn thành và ca Không hoàn thành (hủy) XLSC. Không áp dụng khi phân tích theo Kết quả cấp 1.")}>
                  {tr("Ca đóng trong tháng")}</th>
                <th className="py-2 pr-3">{tr("SL ghi nhận")}</th>
                <th className="py-2 pr-3">{tr("SL đã chốt")}</th>
                <th className="py-2 pr-3">{tr("SL đã bỏ")}</th>
                <th className="py-2 pr-3">{tr("% Đã chốt")}</th>
                <th className="py-2 pr-3" title={tr("SL vi phạm đã chốt / Ca đóng trong tháng × 100")}>{tr("Tỷ lệ chốt lỗi")}</th>
                <th className="py-2 pr-3">{tr("Tổng điểm thẻ")}</th>
                <th className="py-2 pr-3">{tr("Ca KTV đã giải trình")}</th>
                <th className="py-2 pr-3">{tr("Ca GS đã giải trình")}</th>
                <th className="py-2 pr-3">{tr("Ca chờ giải trình")}</th>
                <th className="py-2 pr-3">{tr("Tỷ lệ giải trình")}</th>
              </tr>
            </thead>
            <tbody>
              {(daChieu?.rows ?? []).map((r) => (
                <tr key={r.nhom} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                  <td className="py-2 pr-3 font-semibold">{nhom === "khu_vuc" ? shortKhuVuc(r.nhom) : r.nhom}</td>
                  <td className="py-2 pr-3 font-mono">{r.soCaDong ?? "—"}</td>
                  <td className="py-2 pr-3 font-mono">{r.soGhiNhan}</td>
                  <td className="py-2 pr-3 font-mono">{r.soDaChot}</td>
                  <td className="py-2 pr-3 font-mono">{r.soDaBo}</td>
                  <td className="py-2 pr-3 font-mono" style={{ backgroundColor: heatBg(r.tyLeDaChot) }}>
                    {r.tyLeDaChot}%
                  </td>
                  <td className="py-2 pr-3 font-mono">{r.tyLeChotLoi == null ? "—" : `${r.tyLeChotLoi}%`}</td>
                  <td className="py-2 pr-3 font-mono">{r.tongDiemThe}</td>
                  <td className="py-2 pr-3 font-mono">{r.soKtvGiaiTrinh}</td>
                  <td className="py-2 pr-3 font-mono">{r.soGsGiaiTrinh}</td>
                  <td className="py-2 pr-3 font-mono" style={{ backgroundColor: r.soChoGiaiTrinh ? "var(--amber-100)" : undefined }}>
                    {r.soChoGiaiTrinh}
                  </td>
                  <td className="py-2 pr-3 font-mono">{r.tyLeGiaiTrinh}%</td>
                </tr>
              ))}
              {(daChieu?.rows ?? []).length === 0 && (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-[var(--ink-400)] text-sm">
                    {tr("Không có dữ liệu.")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "diem-the" && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-display font-bold text-sm">{tr("Bảng xếp hạng điểm thẻ theo KTV")}</div>
            <Btn
              variant="ghost"
              size="sm"
              onClick={() =>
                exportRowsToExcel(
                  (diemThe?.rows ?? []).map((r) => {
                    const { id, ten } = parseKtv(r.kyThuatVien);
                    return { ten, id, khuVuc: r.khuVuc ?? "—", soViPham: r.soViPham, tongDiem: r.tongDiem };
                  }),
                  "bao_cao_diem_the_ktv.xlsx",
                  "Data",
                  { ten: "Tên KTV", id: "ID KTV", khuVuc: "Khu vực", soViPham: "Số vi phạm", tongDiem: "Tổng điểm thẻ" },
                )
              }
            >
              {tr("⬇ Xuất Excel")}</Btn>
          </div>
          <table className="dense w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                <th className="py-2 pr-3">{tr("Tên KTV")}</th>
                <th className="py-2 pr-3">ID KTV</th>
                <th className="py-2 pr-3">{tr("Khu vực")}</th>
                <th className="py-2 pr-3">{tr("Số vi phạm")}</th>
                <th className="py-2 pr-3">{tr("Tổng điểm")}</th>
                <th className="py-2 pr-3">{tr("Thẻ hiện tại")}</th>
              </tr>
            </thead>
            <tbody>
              {(diemThe?.rows ?? []).map((r) => {
                const { id, ten } = parseKtv(r.kyThuatVien);
                const coTheDo = tinhThe(r.tongDiem).do > 0;
                return (
                  <tr key={r.kyThuatVien} className={`border-b border-[var(--line)] last:border-0 hover:bg-slate-50 ${coTheDo ? "bg-[var(--coral-100)]/40" : ""}`}>
                    <td className="py-2 pr-3 font-semibold">{ten}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-[var(--ink-400)]">{id}</td>
                    <td className="py-2 pr-3">{r.khuVuc ? shortKhuVuc(r.khuVuc) : "—"}</td>
                    <td className="py-2 pr-3 font-mono">{r.soViPham}</td>
                    <td className="py-2 pr-3 font-mono font-bold">{r.tongDiem}</td>
                    <td className="py-2 pr-3">
                      <TheBadge diem={r.tongDiem} />
                    </td>
                  </tr>
                );
              })}
              {(diemThe?.rows ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[var(--ink-400)] text-sm">
                    {tr("Không có dữ liệu.")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "danh-sach" && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--ink-600)]">{tr("Trạng thái:")}</span>
              <Select value={trangThai} onChange={setTrangThai} options={TRANG_THAI_OPTIONS} />
            </div>
            <div className="flex items-center gap-2">
              <div ref={setColSettingsSlot} />
              <Btn variant="ghost" size="sm" onClick={exportRunner.run(handleExportDanhSach)} disabled={exportRunner.busy}>
                {exportRunner.busy ? tr("⏳ Đang xuất…") : tr("⬇ Xuất Excel")}
              </Btn>
            </div>
          </div>
          {(danhSach?.rows.length ?? 0) >= DANH_SACH_SCREEN_LIMIT && (
            <div className="text-xs text-[var(--amber-600)] bg-[var(--amber-50)] border border-[var(--amber-200)] rounded-lg px-3 py-1.5 mb-2">
              {tr("Đang hiển thị")} {DANH_SACH_SCREEN_LIMIT}  {tr("dòng gần nhất — có thể còn nhiều dòng khớp bộ lọc hơn. Bấm")} <b>{tr("⬇ Xuất Excel")}</b>  {tr("để tải đầy đủ (tối đa 5000 dòng).")}</div>
          )}
          <PaginatedTable<DanhSachRow>
            columns={danhSachColumns(isQC, chotMutation)}
            rows={(danhSach?.rows ?? []).slice((danhSachPage - 1) * DANH_SACH_PAGE_SIZE, danhSachPage * DANH_SACH_PAGE_SIZE)}
            isLoading={false}
            isError={false}
            page={danhSachPage}
            pageSize={DANH_SACH_PAGE_SIZE}
            total={danhSach?.rows.length ?? 0}
            onPageChange={setDanhSachPage}
            onRowClick={(r) => (r.caseId ? openCase(r.caseId, "vi-pham") : addToast(tr("Vi phạm này không gắn ID case (import trực tiếp KTV)")))}
            rowKey={(r) => r.id}
            emptyText={tr("Không có dữ liệu.")}
            storageKey="bao-cao-vi-pham-danh-sach"
            columnSettingsContainer={colSettingsSlot}
          />
        </Card>
      )}
    </div>
  );
}
