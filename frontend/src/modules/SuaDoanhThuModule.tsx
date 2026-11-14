// Module "Sửa DT · HĐ · BH" (2026-11-14, migration 0170, backend routes/suaDoanhThu.ts). 3 tab:
//  - Ca đã sửa doanh thu: DT CRM gốc vs DT chuẩn, chênh lệch, người sửa, lý do.
//  - Đơn xuất hóa đơn: đơn có yêu cầu HĐ từ app Đặt mua linh kiện (đẩy khi Kế toán chốt + nút Đồng bộ) + ca GS đánh giá tay.
//  - Hạn bảo hành: ca tiếp nhận theo tháng (từ 11/2026), hạn tự tính (ngày mua +24T / ngày SX +36T, mốc nào trước), GS sửa tay.
// Bảng lọc + sắp xếp kiểu Excel phía trình duyệt (lib/locCotClient.ts) - danh sách nhỏ, đọc 1 lần.
// Import Excel: cột ID + DT sản phẩm / DT linh kiện / DT dịch vụ / Lý do / Xuất hóa đơn (Có/Không) / Bảo hành (Còn/Hết); xem trước rồi ghi.
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "../components/ui/Tabs";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { Select } from "../components/ui/Select";
import { Modal } from "../components/ui/Modal";
import { useToast } from "../components/ui/Toast";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import type { KieuLocCot, LocCot } from "../components/ui/LocCotPopover";
import { giaTriCot, locDong, sapXepDong, type LayGiaTriCot } from "../lib/locCotClient";
import { api, ApiError } from "../api/client";
import { fmtDate, fmtDateTime, fmtVND } from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { shortKhuVuc } from "../lib/khuVucShortLabel";
import { HAN_BH_TU_NGAY, NHAN_BH, type TrangThaiBh } from "../lib/hanBaoHanh";
import { tr } from "../i18n/tr";

type OpenCase = (id: string, tab?: string) => void;
const VIEWS = [
  { key: "doanh-thu", label: tr("Ca đã sửa doanh thu") },
  { key: "hoa-don", label: tr("Đơn xuất hóa đơn") },
  { key: "bao-hanh", label: tr("Hạn bảo hành") },
];

function thangHienTai() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 7);
}
function dsThang(): string[] {
  const out: string[] = [];
  let t = thangHienTai();
  while (t >= HAN_BH_TU_NGAY.slice(0, 7)) {
    out.push(t);
    const [y, m] = t.split("-").map(Number);
    t = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  }
  return out;
}
const tong = (a: number | null, b: number | null, c: number | null) => (a ?? 0) + (b ?? 0) + (c ?? 0);

/** Bang dung chung: loc + sap xep phia trinh duyet. */
function BangLoc<T>({ rows, cot, lay, rowKey, onRowClick, storageKey, sapMacDinh }: {
  rows: T[];
  cot: (Column<T> & { kieu: KieuLocCot })[];
  lay: Record<string, LayGiaTriCot<T>>;
  rowKey: (r: T) => string;
  onRowClick?: (r: T) => void;
  storageKey: string;
  sapMacDinh: { by: string; dir: "asc" | "desc" };
}) {
  const [loc, setLoc] = useState<Record<string, LocCot>>({});
  const [sap, setSap] = useState(sapMacDinh);
  const hien = useMemo(() => sapXepDong(locDong(rows, loc, lay), lay[sap.by], sap.dir), [rows, loc, sap, lay]);
  return (
    <PaginatedTable<T>
      columns={cot.map((c) => ({ ...c, sortKey: c.key, filter: c.kieu }))}
      rows={hien}
      isLoading={false}
      isError={false}
      page={1}
      pageSize={Math.max(1, hien.length)}
      total={hien.length}
      onPageChange={() => {}}
      rowKey={rowKey}
      onRowClick={onRowClick}
      emptyText={tr("Không có dữ liệu khớp bộ lọc.")}
      sortBy={sap.by}
      sortDir={sap.dir}
      onSortChange={(by, dir) => setSap({ by, dir })}
      colFilters={loc}
      onColFiltersChange={setLoc}
      loadFilterValues={async (k) => giaTriCot(rows, loc, lay, k)}
      totalUnfiltered={rows.length}
      storageKey={storageKey}
    />
  );
}

export function SuaDoanhThuModule({ openCase }: { openCase: OpenCase }) {
  const [view, setView] = useLocalStorageState("filters:sua-dt-view", "doanh-thu");
  const [moImport, setMoImport] = useState(false);
  return (
    <div className="anim-in">
      <Tabs
        active={view}
        onChange={setView}
        tabs={VIEWS}
        extra={
          <Btn size="sm" variant="subtle" onClick={() => setMoImport(true)}>
            {tr("⇩ Import Excel sửa DT / HĐ / BH")}
          </Btn>
        }
      />
      {view === "hoa-don" ? <HoaDonTab openCase={openCase} /> : view === "bao-hanh" ? <BaoHanhTab openCase={openCase} /> : <DoanhThuTab openCase={openCase} />}
      <ImportModal open={moImport} onClose={() => setMoImport(false)} />
    </div>
  );
}

// ---------------- Tab 1 ----------------
interface DtRow {
  id: string;
  khach_hang: string | null;
  khu_vuc: string | null;
  ky_thuat_vien: string | null;
  hang: string | null;
  loai_yeu_cau: string | null;
  thoi_gian_hoan_thanh: string | null;
  dt_san_pham: number | null;
  dt_linh_kien: number | null;
  dt_dich_vu: number | null;
  dt_san_pham_crm: number | null;
  dt_linh_kien_crm: number | null;
  dt_dich_vu_crm: number | null;
  dt_sua_at: string;
  dt_sua_by: string | null;
  dt_sua_ten: string | null;
  dt_sua_ly_do: string | null;
}
function DoanhThuTab({ openCase }: { openCase: OpenCase }) {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["sua-dt", "doanh-thu"], queryFn: () => api.get<{ rows: DtRow[] }>("/sua-doanh-thu/doanh-thu") });
  const rows = data?.rows ?? [];
  const crm = (r: DtRow) => tong(r.dt_san_pham_crm, r.dt_linh_kien_crm, r.dt_dich_vu_crm);
  const chuan = (r: DtRow) => tong(r.dt_san_pham, r.dt_linh_kien, r.dt_dich_vu);
  const lay: Record<string, LayGiaTriCot<DtRow>> = {
    id: (r) => r.id,
    khu_vuc: (r) => r.khu_vuc,
    ky_thuat_vien: (r) => r.ky_thuat_vien,
    hang: (r) => r.hang,
    hoan_thanh: (r) => r.thoi_gian_hoan_thanh?.slice(0, 10) ?? null,
    crm,
    chuan,
    chenh: (r) => chuan(r) - crm(r),
    nguoi: (r) => r.dt_sua_ten ?? r.dt_sua_by,
    luc: (r) => r.dt_sua_at.slice(0, 10),
    ly_do: (r) => r.dt_sua_ly_do,
  };
  const cot: (Column<DtRow> & { kieu: KieuLocCot })[] = [
    { key: "id", header: tr("ID ca"), kieu: "text", render: (r) => <span className="font-mono">{r.id}</span> },
    { key: "khu_vuc", header: tr("Khu vực"), kieu: "list", render: (r) => shortKhuVuc(r.khu_vuc) },
    { key: "ky_thuat_vien", header: tr("KTV"), kieu: "list", render: (r) => r.ky_thuat_vien ?? "—" },
    { key: "hang", header: tr("Hãng"), kieu: "list", render: (r) => r.hang ?? "—" },
    { key: "hoan_thanh", header: tr("Hoàn thành"), kieu: "date", render: (r) => fmtDate(r.thoi_gian_hoan_thanh) },
    {
      key: "crm",
      header: tr("DT CRM gốc"),
      kieu: "number",
      render: (r) => <span title={`SP ${fmtVND(r.dt_san_pham_crm)} · LK ${fmtVND(r.dt_linh_kien_crm)} · DV ${fmtVND(r.dt_dich_vu_crm)}`}>{fmtVND(crm(r))}</span>,
    },
    {
      key: "chuan",
      header: tr("DT chuẩn"),
      kieu: "number",
      render: (r) => <b title={`SP ${fmtVND(r.dt_san_pham)} · LK ${fmtVND(r.dt_linh_kien)} · DV ${fmtVND(r.dt_dich_vu)}`}>{fmtVND(chuan(r))}</b>,
    },
    {
      key: "chenh",
      header: tr("Chênh lệch"),
      kieu: "number",
      render: (r) => {
        const d = chuan(r) - crm(r);
        return <span className={d > 0 ? "text-[var(--teal-600)]" : d < 0 ? "text-[var(--coral-500)]" : ""}>{d > 0 ? "+" : ""}{fmtVND(d)}</span>;
      },
    },
    { key: "nguoi", header: tr("Người sửa"), kieu: "list", render: (r) => r.dt_sua_ten ?? r.dt_sua_by ?? "—" },
    { key: "luc", header: tr("Lúc sửa"), kieu: "date", render: (r) => fmtDateTime(r.dt_sua_at) },
    { key: "ly_do", header: tr("Lý do"), kieu: "text", render: (r) => r.dt_sua_ly_do ?? "—" },
  ];
  const tongCrm = rows.reduce((s, r) => s + crm(r), 0);
  const tongChuan = rows.reduce((s, r) => s + chuan(r), 0);
  return (
    <Card className="p-3">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
        <span>{tr("{0} ca đã sửa", rows.length)}</span>
        <span>{tr("DT CRM gốc")}: <b>{fmtVND(tongCrm)}</b></span>
        <span>{tr("DT chuẩn")}: <b>{fmtVND(tongChuan)}</b></span>
        <span>{tr("Chênh lệch")}: <b>{fmtVND(tongChuan - tongCrm)}</b></span>
        <Btn
          size="sm"
          variant="ghost"
          className="ml-auto"
          disabled={!rows.length}
          onClick={() =>
            exportRowsToExcel(
              rows.map((r) => ({
                "ID ca": r.id, "Khu vực": r.khu_vuc, KTV: r.ky_thuat_vien, "Hãng": r.hang, "Hoàn thành": r.thoi_gian_hoan_thanh,
                "DT SP CRM": r.dt_san_pham_crm, "DT LK CRM": r.dt_linh_kien_crm, "DT DV CRM": r.dt_dich_vu_crm,
                "DT sản phẩm": r.dt_san_pham, "DT linh kiện": r.dt_linh_kien, "DT dịch vụ": r.dt_dich_vu,
                "Chênh lệch": chuan(r) - crm(r), "Người sửa": r.dt_sua_by, "Lúc sửa": r.dt_sua_at, "Lý do": r.dt_sua_ly_do,
              })),
              "ca_da_sua_doanh_thu",
              "Sua DT",
              undefined,
              { skipColumnPicker: true },
            )
          }
        >
          {tr("⬇ Xuất Excel")}
        </Btn>
      </div>
      {isError ? (
        <Btn size="sm" onClick={() => refetch()}>{tr("Thử lại")}</Btn>
      ) : isLoading ? (
        <div className="text-sm text-[var(--ink-400)]">{tr("Đang tải…")}</div>
      ) : (
        <BangLoc rows={rows} cot={cot} lay={lay} rowKey={(r) => r.id} onRowClick={(r) => openCase(r.id)} storageKey="sua-dt-doanh-thu" sapMacDinh={{ by: "luc", dir: "desc" }} />
      )}
    </Card>
  );
}

// ---------------- Tab 2 ----------------
interface HdRow {
  key: string;
  case_id: string;
  khu_vuc: string | null;
  ky_thuat_vien: string | null;
  khach_hang: string | null;
  don_id: string | null;
  ma_lk: string | null;
  ten_lk: string | null;
  so_luong: number | null;
  yeu_cau_hoa_don: string | null;
  ma_misa: string | null;
  chot_ke_toan_luc: string | null;
  trang_thai: string;
  danh_gia: string;
  doanh_thu: number;
  sua_by: string | null;
}
interface HdPayload {
  don: (Record<string, unknown> & { don_id: string; case_id: string; da_huy: number; hd_tay: number | null })[];
  tay: (Record<string, unknown> & { case_id: string; hd_tay: number })[];
  dongBo: { luc: string; nhan: number; ghi: number; chua_khop: number } | null;
  duocSua: boolean;
}
function HoaDonTab({ openCase }: { openCase: OpenCase }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [dangDb, setDangDb] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["sua-dt", "hoa-don"], queryFn: () => api.get<HdPayload>("/sua-doanh-thu/hoa-don") });
  const rows: HdRow[] = useMemo(() => {
    const s = (v: unknown) => (v == null ? null : String(v));
    const n = (v: unknown) => (v == null ? null : Number(v));
    const out: HdRow[] = [];
    for (const d of data?.don ?? []) {
      out.push({
        key: `${d.don_id}|${d.case_id}`,
        case_id: d.case_id,
        khu_vuc: s(d.khu_vuc),
        ky_thuat_vien: s(d.ky_thuat_vien),
        khach_hang: s(d.khach_hang),
        don_id: d.don_id,
        ma_lk: s(d.ma_lk),
        ten_lk: s(d.ten_lk),
        so_luong: n(d.so_luong),
        yeu_cau_hoa_don: s(d.yeu_cau_hoa_don),
        ma_misa: s(d.ma_misa),
        chot_ke_toan_luc: s(d.chot_ke_toan_luc),
        trang_thai: d.da_huy ? tr("Đã huỷ") : s(d.trang_thai_pxk) ?? "—",
        danh_gia: !d.case_id ? tr("Chưa khớp ca") : d.hd_tay === 0 ? tr("Không (sửa tay)") : d.hd_tay === 1 ? tr("Có (sửa tay)") : d.da_huy ? tr("Không (đơn huỷ)") : tr("Có (tự động)"),
        doanh_thu: tong(n(d.dt_san_pham), n(d.dt_linh_kien), n(d.dt_dich_vu)),
        sua_by: s(d.hd_sua_by),
      });
    }
    for (const t of data?.tay ?? []) {
      out.push({
        key: `tay|${t.case_id}`,
        case_id: t.case_id,
        khu_vuc: s(t.khu_vuc),
        ky_thuat_vien: s(t.ky_thuat_vien),
        khach_hang: s(t.khach_hang),
        don_id: null,
        ma_lk: null,
        ten_lk: null,
        so_luong: null,
        yeu_cau_hoa_don: null,
        ma_misa: null,
        chot_ke_toan_luc: s(t.hd_sua_at),
        trang_thai: tr("GS đánh giá tay"),
        danh_gia: t.hd_tay === 1 ? tr("Có (sửa tay)") : tr("Không (sửa tay)"),
        doanh_thu: tong(n(t.dt_san_pham), n(t.dt_linh_kien), n(t.dt_dich_vu)),
        sua_by: s(t.hd_sua_by),
      });
    }
    return out;
  }, [data]);
  async function dongBo() {
    setDangDb(true);
    try {
      const r = await api.post<{ nhan: number; ghi: number; xoa: number; chua_khop: number }>("/sua-doanh-thu/hoa-don/dong-bo");
      toast(tr("Đồng bộ xong: nhận {0} đơn, {1} dòng thay đổi, {2} đơn chưa khớp ca", r.nhan, r.ghi, r.chua_khop));
      qc.invalidateQueries({ queryKey: ["sua-dt"] });
    } catch (e) {
      toast(e instanceof ApiError ? (e.detail ?? e.message) : String(e));
    } finally {
      setDangDb(false);
    }
  }
  const lay: Record<string, LayGiaTriCot<HdRow>> = {
    case_id: (r) => r.case_id || null,
    khu_vuc: (r) => r.khu_vuc,
    ky_thuat_vien: (r) => r.ky_thuat_vien,
    don_id: (r) => r.don_id,
    lk: (r) => [r.ma_lk, r.ten_lk].filter(Boolean).join(" ") || null,
    so_luong: (r) => r.so_luong,
    yeu_cau_hoa_don: (r) => r.yeu_cau_hoa_don,
    ma_misa: (r) => r.ma_misa,
    chot: (r) => r.chot_ke_toan_luc?.slice(0, 10) ?? null,
    trang_thai: (r) => r.trang_thai,
    danh_gia: (r) => r.danh_gia,
    doanh_thu: (r) => r.doanh_thu,
  };
  const cot: (Column<HdRow> & { kieu: KieuLocCot })[] = [
    { key: "case_id", header: tr("ID ca"), kieu: "text", render: (r) => <span className="font-mono">{r.case_id || "—"}</span> },
    { key: "khu_vuc", header: tr("Khu vực"), kieu: "list", render: (r) => shortKhuVuc(r.khu_vuc) },
    { key: "ky_thuat_vien", header: tr("KTV"), kieu: "list", render: (r) => r.ky_thuat_vien ?? "—" },
    { key: "don_id", header: tr("Mã đơn LK"), kieu: "text", render: (r) => r.don_id ?? "—" },
    { key: "lk", header: tr("Linh kiện"), kieu: "text", render: (r) => (r.ma_lk ? `${r.ma_lk} ${r.ten_lk ?? ""}` : "—") },
    { key: "so_luong", header: tr("SL"), kieu: "number", render: (r) => r.so_luong ?? "—" },
    { key: "yeu_cau_hoa_don", header: tr("Yêu cầu HĐ"), kieu: "list", render: (r) => r.yeu_cau_hoa_don ?? "—" },
    { key: "ma_misa", header: tr("Mã MISA"), kieu: "text", render: (r) => r.ma_misa ?? "—" },
    { key: "chot", header: tr("KT chốt / sửa lúc"), kieu: "date", render: (r) => fmtDateTime(r.chot_ke_toan_luc) },
    { key: "trang_thai", header: tr("Trạng thái"), kieu: "list", render: (r) => r.trang_thai },
    { key: "danh_gia", header: tr("Xuất HĐ"), kieu: "list", render: (r) => <Badge tone={r.danh_gia.startsWith(tr("Có")) ? "teal" : "gray"}>{r.danh_gia}</Badge> },
    { key: "doanh_thu", header: tr("DT ca"), kieu: "number", render: (r) => fmtVND(r.doanh_thu) },
  ];
  const db = data?.dongBo;
  return (
    <Card className="p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[var(--ink-500)]">
        {data?.duocSua && (
          <Btn size="sm" variant="subtle" onClick={dongBo} loading={dangDb}>
            {tr("⟳ Đồng bộ đơn hóa đơn từ app linh kiện")}
          </Btn>
        )}
        <span>
          {db
            ? tr("Kéo gần nhất: {0} — {1} đơn, {2} chưa khớp ca", fmtDateTime(db.luc), db.nhan, db.chua_khop)
            : tr("Đơn mới được app linh kiện tự đẩy sang khi Kế toán chốt phiếu; bấm Đồng bộ để kéo bù.")}
        </span>
      </div>
      {isLoading ? (
        <div className="text-sm text-[var(--ink-400)]">{tr("Đang tải…")}</div>
      ) : (
        <BangLoc rows={rows} cot={cot} lay={lay} rowKey={(r) => r.key} onRowClick={(r) => r.case_id && openCase(r.case_id)} storageKey="sua-dt-hoa-don" sapMacDinh={{ by: "chot", dir: "desc" }} />
      )}
    </Card>
  );
}

// ---------------- Tab 3 ----------------
interface BhRow {
  id: string;
  khach_hang: string | null;
  khu_vuc: string | null;
  ky_thuat_vien: string | null;
  hang: string | null;
  san_pham_bao_hanh: string | null;
  seri_san_pham: string | null;
  loai_yeu_cau: string | null;
  hinh_thuc_bao_hanh: string | null;
  thoi_gian_cskh_tiep_nhan: string | null;
  ngay_mua: string | null;
  ngay_san_xuat: string | null;
  han_bh: string | null;
  han_theo: "ngay_mua" | "ngay_san_xuat" | null;
  bh_tu_dong: TrangThaiBh;
  bh_tay: number | null;
  bh_cuoi: TrangThaiBh;
  bh_sua_by: string | null;
}
function BaoHanhTab({ openCase }: { openCase: OpenCase }) {
  const [thang, setThang] = useLocalStorageState("filters:sua-dt-thang", thangHienTai());
  const thangOk = thang >= HAN_BH_TU_NGAY.slice(0, 7) ? thang : thangHienTai();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["sua-dt", "bao-hanh", thangOk],
    queryFn: () => api.get<{ rows: BhRow[] }>(`/sua-doanh-thu/bao-hanh?thang=${thangOk}`),
  });
  const rows = data?.rows ?? [];
  const nhan = (s: TrangThaiBh) => tr(NHAN_BH[s]);
  const lay: Record<string, LayGiaTriCot<BhRow>> = {
    id: (r) => r.id,
    khu_vuc: (r) => r.khu_vuc,
    ky_thuat_vien: (r) => r.ky_thuat_vien,
    hang: (r) => r.hang,
    san_pham: (r) => r.san_pham_bao_hanh,
    loai_yeu_cau: (r) => r.loai_yeu_cau,
    hinh_thuc: (r) => r.hinh_thuc_bao_hanh,
    tiep_nhan: (r) => r.thoi_gian_cskh_tiep_nhan?.slice(0, 10) ?? null,
    ngay_mua: (r) => r.ngay_mua?.slice(0, 10) ?? null,
    ngay_sx: (r) => r.ngay_san_xuat?.slice(0, 10) ?? null,
    han: (r) => r.han_bh,
    tu_dong: (r) => nhan(r.bh_tu_dong),
    cuoi: (r) => nhan(r.bh_cuoi),
    sua: (r) => (r.bh_tay === null ? tr("Tự động") : tr("Sửa tay")),
  };
  const cot: (Column<BhRow> & { kieu: KieuLocCot })[] = [
    { key: "id", header: tr("ID ca"), kieu: "text", render: (r) => <span className="font-mono">{r.id}</span> },
    { key: "khu_vuc", header: tr("Khu vực"), kieu: "list", render: (r) => shortKhuVuc(r.khu_vuc) },
    { key: "ky_thuat_vien", header: tr("KTV"), kieu: "list", render: (r) => r.ky_thuat_vien ?? "—" },
    { key: "hang", header: tr("Hãng"), kieu: "list", render: (r) => r.hang ?? "—" },
    { key: "san_pham", header: tr("Sản phẩm"), kieu: "text", render: (r) => r.san_pham_bao_hanh ?? "—" },
    { key: "loai_yeu_cau", header: tr("Loại yêu cầu"), kieu: "list", render: (r) => r.loai_yeu_cau ?? "—" },
    { key: "hinh_thuc", header: tr("Hình thức BH (CRM)"), kieu: "list", render: (r) => r.hinh_thuc_bao_hanh ?? "—" },
    { key: "tiep_nhan", header: tr("Tiếp nhận"), kieu: "date", render: (r) => fmtDate(r.thoi_gian_cskh_tiep_nhan) },
    { key: "ngay_mua", header: tr("Ngày mua"), kieu: "date", render: (r) => fmtDate(r.ngay_mua) },
    { key: "ngay_sx", header: tr("Ngày SX"), kieu: "date", render: (r) => fmtDate(r.ngay_san_xuat) },
    {
      key: "han",
      header: tr("Hạn BH"),
      kieu: "date",
      render: (r) => (r.han_bh ? `${fmtDate(r.han_bh)} (${r.han_theo === "ngay_mua" ? tr("mua") : tr("SX")})` : "—"),
    },
    { key: "tu_dong", header: tr("Tự tính"), kieu: "list", render: (r) => nhan(r.bh_tu_dong) },
    {
      key: "cuoi",
      header: tr("Đánh giá"),
      kieu: "list",
      render: (r) => <Badge tone={r.bh_cuoi === "con" ? "teal" : r.bh_cuoi === "het" ? "coral" : "gray"}>{nhan(r.bh_cuoi)}</Badge>,
    },
    { key: "sua", header: tr("Nguồn"), kieu: "list", render: (r) => (r.bh_tay === null ? tr("Tự động") : `${tr("Sửa tay")} · ${r.bh_sua_by ?? ""}`) },
  ];
  const dem = (s: TrangThaiBh) => rows.filter((r) => r.bh_cuoi === s).length;
  return (
    <Card className="p-3">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
        <Select value={thangOk} onChange={setThang} options={dsThang().map((t) => ({ value: t, label: tr("Tiếp nhận tháng {0}", `${t.slice(5)}/${t.slice(0, 4)}`) }))} />
        <span>{tr("{0} ca", rows.length)}</span>
        <span>{tr("Còn BH")}: <b>{dem("con")}</b></span>
        <span>{tr("Hết BH")}: <b>{dem("het")}</b></span>
        <span>{tr("Chưa đủ dữ liệu")}: <b>{dem("khong_ro")}</b></span>
        <span className="text-xs text-[var(--ink-400)]">{tr("Hạn = ngày mua +24 tháng / ngày SX +36 tháng, mốc nào đến trước. Mở ca để sửa tay.")}</span>
      </div>
      {isError ? (
        <div className="text-sm text-[var(--coral-500)]">{error instanceof ApiError ? (error.detail ?? error.message) : String(error)}</div>
      ) : isLoading ? (
        <div className="text-sm text-[var(--ink-400)]">{tr("Đang tải…")}</div>
      ) : (
        <BangLoc rows={rows} cot={cot} lay={lay} rowKey={(r) => r.id} onRowClick={(r) => openCase(r.id)} storageKey="sua-dt-bao-hanh" sapMacDinh={{ by: "tiep_nhan", dir: "desc" }} />
      )}
    </Card>
  );
}

// ---------------- Import Excel ----------------
const TIEU_DE: Record<string, string> = {
  "id ca": "id", id: "id", "ma ca": "id",
  "dt san pham": "dt_san_pham", "dt linh kien": "dt_linh_kien", "dt dich vu": "dt_dich_vu",
  "ly do": "ly_do", "xuat hoa don": "xuat_hoa_don", "bao hanh": "con_bao_hanh", "con bao hanh": "con_bao_hanh",
};
const khongDau = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
interface KqImport {
  commit: boolean;
  doanh_thu: number;
  hoa_don: number;
  bao_hanh: number;
  khong_doi: number;
  khong_tim_thay: number;
  khong_quyen: number;
  loi: string[];
}
function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [kq, setKq] = useState<KqImport | null>(null);
  const [dang, setDang] = useState(false);

  async function taiMau() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(
      [{ "ID ca": "SC0012345", "DT sản phẩm": 0, "DT linh kiện": 350000, "DT dịch vụ": 150000, "Lý do": "Khảo sát KH thực trả", "Xuất hóa đơn": "Có", "Bảo hành": "Hết" }],
      { header: ["ID ca", "DT sản phẩm", "DT linh kiện", "DT dịch vụ", "Lý do", "Xuất hóa đơn", "Bảo hành"] },
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sua DT");
    XLSX.writeFile(wb, "mau_sua_doanh_thu_hd_bh.xlsx");
  }
  async function docFile(file: File) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    const out = raw
      .map((r) => {
        const o: Record<string, unknown> = {};
        for (const [h, v] of Object.entries(r)) {
          const k = TIEU_DE[khongDau(h)];
          if (k) o[k] = typeof v === "string" ? v.trim() : v;
        }
        return o;
      })
      .filter((o) => String(o.id ?? "").trim());
    setRows(out);
    await gui(out, false);
  }
  async function gui(r: Record<string, unknown>[], commit: boolean) {
    setDang(true);
    try {
      const k = await api.post<KqImport>(`/sua-doanh-thu/import?commit=${commit ? 1 : 0}`, { rows: r });
      setKq(k);
      if (commit) {
        toast(tr("Đã ghi: {0} doanh thu, {1} xuất HĐ, {2} bảo hành", k.doanh_thu, k.hoa_don, k.bao_hanh));
        qc.invalidateQueries({ queryKey: ["sua-dt"] });
        qc.invalidateQueries({ queryKey: ["case"] });
      }
    } catch (e) {
      toast(e instanceof ApiError ? (e.detail ?? e.message) : String(e));
    } finally {
      setDang(false);
    }
  }
  function dong() {
    setRows(null);
    setKq(null);
    onClose();
  }
  return (
    <Modal open={open} onClose={dong} title={tr("Import Excel sửa doanh thu / xuất HĐ / bảo hành")} width="max-w-2xl">
      <div className="space-y-3 text-sm">
        <p className="text-[var(--ink-500)]">
          {tr("Cột bắt buộc: ID ca. Cột tuỳ chọn: DT sản phẩm, DT linh kiện, DT dịch vụ (ô trống = giữ số hiện tại), Lý do, Xuất hóa đơn (Có / Không / Tự động), Bảo hành (Còn / Hết / Tự động). GS chỉ sửa được ca thuộc khu vực mình phụ trách.")}
        </p>
        <div className="flex gap-2">
          <Btn size="sm" variant="ghost" onClick={taiMau}>{tr("⬇ Tải file mẫu")}</Btn>
          <Btn size="sm" onClick={() => fileRef.current?.click()} loading={dang && !kq}>{tr("Chọn file Excel…")}</Btn>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void docFile(f);
            }}
          />
        </div>
        {kq && rows && (
          <div className="rounded-lg border border-[var(--line)] p-3 space-y-1">
            <div className="font-semibold">{kq.commit ? tr("Kết quả ghi") : tr("Xem trước ({0} dòng)", rows.length)}</div>
            <div>
              {tr("Sửa doanh thu")}: <b>{kq.doanh_thu}</b> · {tr("Xuất HĐ")}: <b>{kq.hoa_don}</b> · {tr("Bảo hành")}: <b>{kq.bao_hanh}</b> · {tr("Không đổi")}: {kq.khong_doi} ·{" "}
              {tr("Không tìm thấy")}: {kq.khong_tim_thay} · {tr("Không có quyền")}: {kq.khong_quyen}
            </div>
            {kq.loi.length > 0 && (
              <ul className="max-h-40 overflow-auto text-xs text-[var(--coral-500)] list-disc pl-5">
                {kq.loi.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            )}
            {!kq.commit && kq.doanh_thu + kq.hoa_don + kq.bao_hanh > 0 && (
              <Btn size="sm" onClick={() => gui(rows, true)} loading={dang}>
                {tr("Ghi {0} thay đổi", kq.doanh_thu + kq.hoa_don + kq.bao_hanh)}
              </Btn>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
