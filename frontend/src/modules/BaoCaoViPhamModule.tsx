import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "../components/ui/Card";
import { StatCard } from "../components/ui/StatCard";
import { Select } from "../components/ui/Select";
import { Btn } from "../components/ui/Btn";
import { Tabs } from "../components/ui/Tabs";
import { useToast } from "../components/ui/Toast";
import { KhuVucFilterControl } from "../components/KhuVucFilterControl";
import { api, buildQuery } from "../api/client";
import { exportRowsToExcel } from "../lib/exportExcel";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { useAuth } from "../auth/AuthContext";
import { QLDVBH_FILTER_VALUE, CURRENT_MONTH_VALUE } from "../constants";
import { shortKhuVuc } from "../lib/khuVucShortLabel";

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
}

// CHOT voi chu he thong 2026-09-22 (lan 2): "Khong loi" KHONG con la 1 lua chon loc o day - vi pham
// CSKH ket luan khong loi KHONG duoc tinh la vi pham, loai het khoi danh sach nay tu goc (xem chu
// thich computeViPhamDanhSach trong backend/src/lib/viPhamBaoCao.ts).
const TRANG_THAI_OPTIONS = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "cho_giai_trinh", label: "Chờ KTV/GS giải trình" },
  { value: "cho_qc_chot", label: "Chờ QC chốt" },
  { value: "da_chot", label: "QC đã chốt" },
  { value: "da_bo", label: "QC đã bỏ" },
];

// Ca 500 dong tren man hinh vua khop LIMIT server (xem computeViPhamDanhSach) - dau hieu HEURISTIC
// danh sach co the con bi cat bot, khong phai con so chinh xac (khong query rieng 1 COUNT(*) cho
// tab nay, tranh them 1 nguon rows_read moi chi de hien 1 dong canh bao - xem YEU_CAU_BAO_CAO_
// TINH_SAN.md ve ky luat rows_read).
const DANH_SACH_SCREEN_LIMIT = 500;

const DANH_SACH_EXPORT_LABELS: Record<string, string> = {
  id: "Mã vi phạm",
  caseId: "ID case",
  khuVuc: "Khu vực",
  kyThuatVien: "KTV",
  khachHang: "Khách hàng",
  loaiLoi: "Loại lỗi",
  ketQuaCap1: "Kết quả chốt cấp 1",
  trangThai: "Trạng thái",
  ghiChu: "Ghi chú",
  diemThe: "Điểm thẻ",
  nguoiGhiNhan: "Người ghi nhận",
  ngayGhiNhan: "Ngày ghi nhận",
  nguoiChot: "Người chốt",
  ngayChot: "Ngày chốt",
};

const NHOM_OPTIONS = [
  { value: "khu_vuc", label: "Khu vực" },
  { value: "ky_thuat_vien", label: "Kỹ thuật viên" },
  { value: "ket_qua_cap_1", label: "Loại lỗi" },
  { value: "nhom_kh", label: "Nhóm KH" },
  { value: "nguon_crm", label: "Nguồn CRM" },
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
    return <span className="text-xs text-[var(--ink-400)] italic">Chưa có thẻ</span>;
  }
  const parts: { label: string; cls: string }[] = [];
  if (the.do > 0) parts.push({ label: `${the.do} thẻ đỏ`, cls: "bg-[var(--coral-100)] text-[var(--coral-600)]" });
  if (the.vang > 0) parts.push({ label: `${the.vang} thẻ vàng`, cls: "bg-[var(--amber-100)] text-[var(--amber-600)]" });
  if (the.hong > 0) parts.push({ label: `${the.hong} thẻ hồng`, cls: "bg-pink-100 text-pink-700" });
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

export function BaoCaoViPhamModule() {
  const auth = useAuth();
  const myAreas = auth.status === "authenticated" ? auth.user.khu_vuc_phu_trach : [];
  const role = auth.status === "authenticated" ? auth.user.vai_tro : null;
  const isQC = role === "QC" || role === "Admin";
  const qcClient = useQueryClient();
  const addToast = useToast();
  const [tab, setTab] = useState<"tong-quan" | "da-chieu" | "diem-the" | "danh-sach">("tong-quan");
  const [trangThai, setTrangThai] = useState("");
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
    { value: QLDVBH_FILTER_VALUE, label: "Tất cả QLDVBH (MB/MN...)" },
    ...(filterOptions?.khuVuc ?? []).map((k) => ({ value: k, label: k })),
  ];
  const thangOptions = [{ value: CURRENT_MONTH_VALUE, label: "Tháng hiện tại" }, ...(monthOptions?.months ?? [])];
  const ktvOptions = [ALL_KTV, ...(filterOptions?.kyThuatVien ?? [])];
  const nhomKhOptions = [ALL_NHOM_KH, ...(filterOptions?.nhomKh ?? []).filter((n): n is string => !!n)];

  const { data: tongQuan } = useQuery({
    queryKey: ["bao-cao-vi-pham-tong-quan", apiParams],
    queryFn: () => api.get<TongQuanPayload>(`/bao-cao-vi-pham/tong-quan${buildQuery(apiParams)}`),
  });
  const { data: daChieu } = useQuery({
    queryKey: ["bao-cao-vi-pham-da-chieu", apiParams, nhom],
    queryFn: () => api.get<{ rows: DaChieuRow[] }>(`/bao-cao-vi-pham/da-chieu${buildQuery({ ...apiParams, nhom })}`),
    enabled: tab === "da-chieu",
  });
  const { data: diemThe } = useQuery({
    queryKey: ["bao-cao-vi-pham-diem-the", apiParams],
    queryFn: () => api.get<{ rows: DiemTheRow[] }>(`/bao-cao-vi-pham/diem-the${buildQuery(apiParams)}`),
    enabled: tab === "diem-the",
  });
  const { data: danhSach } = useQuery({
    queryKey: ["bao-cao-vi-pham-danh-sach", apiParams, trangThai],
    queryFn: () => api.get<{ rows: DanhSachRow[] }>(`/bao-cao-vi-pham/danh-sach${buildQuery({ ...apiParams, trang_thai: trangThai || undefined })}`),
    enabled: tab === "danh-sach",
  });

  // Xuat Excel: goi lai API rieng voi export=true (LIMIT 5000 thay vi 500 tren man hinh) - dung
  // nguyen pattern handleExport() cua SurveyModule.tsx (routes/survey.ts GET /?export=true), KHONG
  // chi xuat dung 500 dong dang hien tren man hinh.
  async function handleExportDanhSach() {
    const res = await api.get<{ rows: DanhSachRow[] }>(`/bao-cao-vi-pham/danh-sach${buildQuery({ ...apiParams, trang_thai: trangThai || undefined, export: "true" })}`);
    const rows = res.rows.map((r) => ({ ...r, khuVuc: r.khuVuc ? shortKhuVuc(r.khuVuc) : r.khuVuc }));
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
    onError: () => addToast("Không chốt/bỏ được - thử lại sau"),
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
          { key: "tong-quan", label: "Tổng quan" },
          { key: "da-chieu", label: "Đa chiều" },
          { key: "diem-the", label: "Điểm thẻ" },
          { key: "danh-sach", label: "Tất cả vi phạm" },
        ]}
        active={tab}
        onChange={(k) => setTab(k as typeof tab)}
      />

      {tab === "tong-quan" && (
        <div className="flex flex-wrap gap-3">
          <StatCard label="SL ghi nhận" value={tongQuan?.slGhiNhan ?? 0} tone="ocean" />
          <StatCard label="SL KTV đã giải trình" value={tongQuan?.slKtvGiaiTrinh ?? 0} tone="teal" />
          <StatCard label="SL GS giải trình hộ" value={tongQuan?.slGsGiaiTrinh ?? 0} tone="teal" />
          <StatCard label="SL chờ KTV/GS giải trình" value={tongQuan?.slChoKtvGiaiTrinh ?? 0} tone="orange" muted={!tongQuan?.slChoKtvGiaiTrinh} />
          <StatCard label="SL chờ QC chốt" value={tongQuan?.slChoQcChot ?? 0} tone="amber" muted={!tongQuan?.slChoQcChot} />
          <StatCard label="SL QC đã chốt" value={tongQuan?.slQcDaChot ?? 0} tone="coral" />
          <StatCard label="SL QC đã bỏ" value={tongQuan?.slQcDaBo ?? 0} tone="gray" />
        </div>
      )}

      {tab === "da-chieu" && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="font-display font-bold text-sm">Phân tích theo</div>
              <Select value={nhom} onChange={setNhom} options={NHOM_OPTIONS} />
            </div>
            <Btn
              variant="ghost"
              size="sm"
              onClick={() =>
                exportRowsToExcel(daChieu?.rows ?? [], `bao_cao_vi_pham_${nhom}.xlsx`, "Data", {
                  nhom: nhomLabel,
                  soGhiNhan: "SL ghi nhận",
                  soDaChot: "SL đã chốt",
                  soDaBo: "SL đã bỏ",
                  tyLeDaChot: "% Đã chốt",
                  tongDiemThe: "Tổng điểm thẻ",
                })
              }
            >
              ⬇ Xuất Excel
            </Btn>
          </div>
          <table className="dense w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                <th className="py-2 pr-3">{nhomLabel}</th>
                <th className="py-2 pr-3">SL ghi nhận</th>
                <th className="py-2 pr-3">SL đã chốt</th>
                <th className="py-2 pr-3">SL đã bỏ</th>
                <th className="py-2 pr-3">% Đã chốt</th>
                <th className="py-2 pr-3">Tổng điểm thẻ</th>
              </tr>
            </thead>
            <tbody>
              {(daChieu?.rows ?? []).map((r) => (
                <tr key={r.nhom} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                  <td className="py-2 pr-3 font-semibold">{nhom === "khu_vuc" ? shortKhuVuc(r.nhom) : r.nhom}</td>
                  <td className="py-2 pr-3 font-mono">{r.soGhiNhan}</td>
                  <td className="py-2 pr-3 font-mono">{r.soDaChot}</td>
                  <td className="py-2 pr-3 font-mono">{r.soDaBo}</td>
                  <td className="py-2 pr-3 font-mono" style={{ backgroundColor: heatBg(r.tyLeDaChot) }}>
                    {r.tyLeDaChot}%
                  </td>
                  <td className="py-2 pr-3 font-mono">{r.tongDiemThe}</td>
                </tr>
              ))}
              {(daChieu?.rows ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[var(--ink-400)] text-sm">
                    Không có dữ liệu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "diem-the" && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-display font-bold text-sm">Bảng xếp hạng điểm thẻ theo KTV</div>
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
              ⬇ Xuất Excel
            </Btn>
          </div>
          <table className="dense w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                <th className="py-2 pr-3">Tên KTV</th>
                <th className="py-2 pr-3">ID KTV</th>
                <th className="py-2 pr-3">Khu vực</th>
                <th className="py-2 pr-3">Số vi phạm</th>
                <th className="py-2 pr-3">Tổng điểm</th>
                <th className="py-2 pr-3">Thẻ hiện tại</th>
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
                    Không có dữ liệu.
                  </td>
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
              <span className="text-xs font-semibold text-[var(--ink-600)]">Trạng thái:</span>
              <Select value={trangThai} onChange={setTrangThai} options={TRANG_THAI_OPTIONS} />
            </div>
            <Btn variant="ghost" size="sm" onClick={handleExportDanhSach}>
              ⬇ Xuất Excel
            </Btn>
          </div>
          {(danhSach?.rows.length ?? 0) >= DANH_SACH_SCREEN_LIMIT && (
            <div className="text-xs text-[var(--amber-600)] bg-[var(--amber-50)] border border-[var(--amber-200)] rounded-lg px-3 py-1.5 mb-2">
              Đang hiển thị {DANH_SACH_SCREEN_LIMIT} dòng gần nhất trên màn hình — có thể còn nhiều dòng khớp bộ lọc hơn. Bấm <b>⬇ Xuất Excel</b> để tải đầy đủ (tối đa 5000 dòng).
            </div>
          )}
          <table className="dense w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                <th className="py-2 pr-3">Mã VP</th>
                <th className="py-2 pr-3">ID case</th>
                <th className="py-2 pr-3">Khu vực</th>
                <th className="py-2 pr-3">KTV</th>
                <th className="py-2 pr-3">Loại lỗi</th>
                <th className="py-2 pr-3">Kết quả cấp 1</th>
                <th className="py-2 pr-3">Trạng thái</th>
                <th className="py-2 pr-3">Điểm thẻ</th>
                <th className="py-2 pr-3">Ngày ghi nhận</th>
                <th className="py-2 pr-3">Ghi chú</th>
                {isQC && <th className="py-2 pr-3">Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {(danhSach?.rows ?? []).map((r) => (
                <tr key={r.id} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                  <td className="py-2 pr-3 font-mono text-xs">
                    {r.id}
                    {r.source === "ktv" && <span className="ml-1 text-[10px] text-[var(--ink-400)]" title="Vi phạm import trực tiếp KTV, không gắn ID case">(KTV)</span>}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{r.caseId ?? "—"}</td>
                  <td className="py-2 pr-3">{r.khuVuc ? shortKhuVuc(r.khuVuc) : "—"}</td>
                  <td className="py-2 pr-3">{r.kyThuatVien ?? "—"}</td>
                  <td className="py-2 pr-3">{r.loaiLoi}</td>
                  <td className="py-2 pr-3">{r.ketQuaCap1 ?? "—"}</td>
                  <td className="py-2 pr-3">{r.trangThai}</td>
                  <td className="py-2 pr-3 font-mono">{r.diemThe || "—"}</td>
                  <td className="py-2 pr-3 text-xs">{r.ngayGhiNhan}</td>
                  <td className="py-2 pr-3 text-xs text-[var(--ink-600)]">{r.ghiChu ?? ""}</td>
                  {isQC && (
                    <td className="py-2 pr-3">
                      {r.chotBoCap2 === null ? (
                        <div className="flex gap-1">
                          <Btn size="sm" variant="success" disabled={chotMutation.isPending} onClick={() => chotMutation.mutate({ row: r, chot: true })}>
                            Chốt
                          </Btn>
                          <Btn size="sm" variant="danger" disabled={chotMutation.isPending} onClick={() => chotMutation.mutate({ row: r, chot: false })}>
                            Bỏ
                          </Btn>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--ink-400)]">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {(danhSach?.rows ?? []).length === 0 && (
                <tr>
                  <td colSpan={isQC ? 11 : 10} className="py-8 text-center text-[var(--ink-400)] text-sm">
                    Không có dữ liệu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
