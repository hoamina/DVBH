// Menu "QL NSKX" (2026-11-11) - moi ca doi tac NSKX (VN) theo thang tiep nhan. 3 tab:
//  - Danh sach: loc/sap xep kieu Excel tren tieu de cot (server-side, backend routes/qlNskx.ts GET /danh-sach).
//  - Danh gia loi loc: GS khu vuc xac nhan co thay / khong thay loi, thay loi gi (de xuat tu linh kien sua chua co chu "lõi",
//    chon lai tu danh muc linh kien dong bo tu linh-kien-app).
//  - Bao cao: nhanh theo khu vuc / KTV.
// Nut "Đồng bộ đơn lõi lọc" (header): hoi linh-kien-app ca nao da co don "HỖ TRỢ NGOÀI BẢO HÀNH TG12…" (bo don huy/tu choi).
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "../components/ui/Tabs";
import { Btn } from "../components/ui/Btn";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { useToast } from "../components/ui/Toast";
import { KhuVucFilterControl } from "../components/KhuVucFilterControl";
import { LocCotPopover, locCotDangBat, tomTatLoc, GIA_TRI_TRONG, type GiaTriLoc, type KieuLocCot, type LocCot } from "../components/ui/LocCotPopover";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { api, buildQuery, ApiError } from "../api/client";
import { fmtDateTime, type LinhKienRow, type LinhKienLoiItem } from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { useExportRunner } from "../hooks/useExportRunner";
import { useAuth } from "../auth/AuthContext";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { fetchWithHashCache } from "../lib/staticListCache";
import { shortKhuVuc } from "../lib/khuVucShortLabel";
import { parseLinhKienLoi } from "../components/LoiLinhKienPanel";
import { useDiaGioiIndex, useDiaGioiLoc, NHAN_CAP_1 } from "../lib/diaGioi";
import { dl } from "../lib/banDichDuLieu";
import { tr } from "../i18n/tr";

interface LoiDaThay {
  ma_linh_kien: string;
  ten_linh_kien?: string;
  so_luong: number;
}
interface DonLoi {
  don_id: string;
  ma_lk: string;
  ten_lk: string | null;
  loai_de_xuat: string;
  so_luong_de_xuat: number;
  trang_thai_hien_tai: string | null;
  ngay_tao: string;
}
interface NskxRow {
  id: string;
  khach_hang: string | null;
  khu_vuc: string | null;
  ky_thuat_vien: string | null;
  ktv_trien_khai: string | null;
  tinh: string | null;
  seri_san_pham: string | null;
  nhom_san_pham: string | null;
  hang: string | null;
  nganh: string | null;
  nhom_kh: string | null;
  nhom_yeu_cau: string | null;
  loai_yeu_cau: string | null;
  mo_ta_loi: string | null;
  noi_dung_xu_ly: string | null;
  tien_do_hoan_thanh: string | null;
  dung_han: string | null;
  xu_ly_24h_bucket: string | null;
  thoi_gian_cskh_tiep_nhan: string | null;
  thoi_gian_hoan_thanh: string | null;
  linh_kien_loi: string | null;
  tuoi_ton: number | null;
  trang_thai: string;
  de_xuat_loi: "co" | "khong";
  tt_loi_loc: "chua_danh_gia" | "thay" | "khong_thay";
  tt_don: "da_len_don" | "chua_len_don" | "khong_can";
  thay_loi: number | null;
  ds_loi: string | null;
  ghi_chu_loi: string | null;
  nguoi_xac_nhan: string | null;
  ngay_xac_nhan: string | null;
  don_loi: string | null;
  ngay_dong_bo: string | null;
}
interface ThangPayload {
  rows: { thang: string; n: number }[];
  dong_bo: { so_ca: number; da_len_don: number; chua_len_don: number; thay_doi: number; luc: string | null; nguoi: string | null } | null;
}
interface BaoCaoRow {
  nhom: string | null;
  khu_vuc: string | null;
  tong_ca: number;
  da_hoan_thanh: number;
  duoi_24h: number;
  co_tinh_24h: number;
  dung_han: number;
  co_tinh_sla: number;
  da_dat_loi: number;
  khong_thay_loi: number;
  chua_dat_loi: number;
  chua_danh_gia: number;
}

const TT_DON: Record<string, { label: string; tone: BadgeTone }> = {
  da_len_don: { label: tr("Đã đặt lõi"), tone: "teal" },
  chua_len_don: { label: tr("Chưa đặt lõi"), tone: "amber" },
  khong_can: { label: tr("Không cần (không thay lõi)"), tone: "gray" },
};
const TT_LOI_LOC: Record<string, { label: string; tone: BadgeTone }> = {
  chua_danh_gia: { label: tr("Chưa đánh giá"), tone: "orange" },
  thay: { label: tr("Có thay lõi"), tone: "ocean" },
  khong_thay: { label: tr("Không thay lõi"), tone: "gray" },
};
const DE_XUAT: Record<string, string> = { co: tr("Có đề xuất lõi"), khong: tr("Không có") };

function parseJson<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
/** Linh kien sua chua co chu "lõi" (phan biet dau: "lỗi" KHONG tinh). */
function laLoi(text: string | null | undefined): boolean {
  return (text ?? "").toLowerCase().includes("lõi");
}
function deXuatLoi(r: NskxRow): LinhKienLoiItem[] {
  return parseLinhKienLoi(r.linh_kien_loi).filter((p) => laLoi(p.ten_linh_kien) || laLoi(p.nhom_linh_kien));
}
function pct(a: number, b: number): string {
  return b ? `${((a / b) * 100).toFixed(1)}%` : "—";
}
function thangHienTai(): string {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 7);
}
function nhanThang(t: string): string {
  const [y, m] = t.split("-");
  return tr("Tháng {0}/{1}", m, y);
}

const VIEWS = [
  { key: "danh-sach", label: tr("Danh sách") },
  { key: "danh-gia", label: tr("Đánh giá lõi lọc") },
  { key: "bao-cao", label: tr("Báo cáo") },
];

export function QlNskxModule({ openCase, headerExtra }: { openCase: (id: string, tab?: string) => void; headerExtra?: HTMLElement | null }) {
  const auth = useAuth();
  const user = auth.status === "authenticated" ? auth.user : null;
  const myAreas = user?.khu_vuc_phu_trach ?? [];
  const duocXacNhan = user?.vai_tro === "Admin" || user?.vai_tro === "TBP DVBH" || user?.vai_tro === "Giam sat";
  const [view, setView] = useLocalStorageState("filters:ql-nskx-view", "danh-sach");
  const [thang, setThang] = useLocalStorageState("filters:ql-nskx-thang", thangHienTai());
  const [khuVuc, setKhuVuc] = useLocalStorageState("filters:ql-nskx-khu-vuc", "");
  // Loc cot rieng cho tung tab danh sach; bam so o Bao cao se dat loc vao tab Danh sach.
  const [locDs, setLocDs] = useState<Record<string, LocCot>>({});
  const [locDg, setLocDg] = useState<Record<string, LocCot>>({ tt_loi_loc: { in: ["chua_danh_gia"] } });
  const qc = useQueryClient();
  const toast = useToast();
  const [dangDongBo, setDangDongBo] = useState(false);

  const { data: thangData } = useQuery({ queryKey: ["ql-nskx-thang"], queryFn: () => api.get<ThangPayload>("/ql-nskx/thang") });
  const { data: filtersData } = useQuery({ queryKey: ["dashboard-filters"], queryFn: () => api.get<{ khuVuc: string[] }>("/dashboard/filters") });

  const thangOptions = useMemo(() => {
    const ds = thangData?.rows ?? [];
    const opts = ds.map((r) => ({ value: r.thang, label: `${nhanThang(r.thang)} (${r.n})` }));
    if (!ds.some((r) => r.thang === thang)) opts.unshift({ value: thang, label: `${nhanThang(thang)} (0)` });
    return opts;
  }, [thangData, thang]);

  async function dongBo() {
    setDangDongBo(true);
    try {
      const r = await api.post<{ so_ca: number; da_len_don: number; chua_len_don: number; thay_doi: number }>("/ql-nskx/dong-bo-don");
      toast(tr("Đồng bộ xong {0} ca: {1} đã lên đơn, {2} chưa lên đơn ({3} thay đổi)", r.so_ca, r.da_len_don, r.chua_len_don, r.thay_doi));
      qc.invalidateQueries({ queryKey: ["ql-nskx"] });
      qc.invalidateQueries({ queryKey: ["ql-nskx-thang"] });
    } catch (e) {
      toast(e instanceof ApiError ? (e.detail ?? e.message) : String(e));
    } finally {
      setDangDongBo(false);
    }
  }

  function drill(nhom: string | null, dim: "khu_vuc" | "ktv", ttDon?: string) {
    const next: Record<string, LocCot> = {};
    if (nhom !== null) next[dim === "ktv" ? "ky_thuat_vien" : "khu_vuc"] = { in: [nhom === "" ? GIA_TRI_TRONG : nhom] };
    if (ttDon === "da_hoan_thanh") next.trang_thai = { in: ["Đã hoàn thành"] };
    else if (ttDon === "chua_danh_gia") next.tt_loi_loc = { in: ["chua_danh_gia"] };
    else if (ttDon) next.tt_don = { in: [ttDon] };
    setLocDs(next);
    setView("danh-sach");
  }

  const filterControl = (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={thang} onChange={setThang} options={thangOptions} />
      <KhuVucFilterControl
        value={khuVuc}
        onChange={setKhuVuc}
        options={[{ value: "", label: tr("Tất cả khu vực") }, ...(filtersData?.khuVuc.map((k) => ({ value: k, label: k })) ?? [])]}
        myAreas={myAreas}
      />
    </div>
  );
  const db = thangData?.dong_bo;

  return (
    <div className="anim-in">
      {headerExtra ? createPortal(filterControl, headerExtra) : <div className="mb-2">{filterControl}</div>}
      <div className="flex items-center gap-2 flex-wrap mb-2 text-xs text-[var(--ink-500)]">
        {duocXacNhan && (
          <Btn variant="subtle" size="sm" onClick={dongBo} loading={dangDongBo}>
            {tr("⟳ Đồng bộ đơn lõi lọc từ linh-kien-app")}
          </Btn>
        )}
        {db?.luc ? (
          <span>
            {tr("Lần đồng bộ gần nhất: {0} — {1} ca, {2} đã lên đơn, {3} chưa lên đơn", fmtDateTime(db.luc), db.so_ca, db.da_len_don, db.chua_len_don)}
            {db.nguoi ? ` (${db.nguoi})` : ""}
          </span>
        ) : (
          <span>{tr("Chưa đồng bộ đơn lõi lọc lần nào.")}</span>
        )}
      </div>
      <Tabs active={view} onChange={setView} tabs={VIEWS} />
      {view === "bao-cao" ? (
        <BaoCaoTab thang={thang} khuVuc={khuVuc} onDrill={drill} />
      ) : view === "danh-gia" ? (
        <DanhSachNskx key="danh-gia" cheDo="danh-gia" thang={thang} khuVuc={khuVuc} locCot={locDg} setLocCot={setLocDg} openCase={openCase} duocXacNhan={duocXacNhan} />
      ) : (
        <DanhSachNskx key="danh-sach" cheDo="danh-sach" thang={thang} khuVuc={khuVuc} locCot={locDs} setLocCot={setLocDs} openCase={openCase} duocXacNhan={duocXacNhan} />
      )}
    </div>
  );
}

function DanhSachNskx({
  cheDo,
  thang,
  khuVuc,
  locCot,
  setLocCot: setLocCotRaw,
  openCase,
  duocXacNhan,
}: {
  cheDo: "danh-sach" | "danh-gia";
  thang: string;
  khuVuc: string;
  locCot: Record<string, LocCot>;
  setLocCot: (v: Record<string, LocCot>) => void;
  openCase: (id: string, tab?: string) => void;
  duocXacNhan: boolean;
}) {
  const [page, setPage] = useState(1);
  const [idSearch, setIdSearch] = useState("");
  const [sortBy, setSortBy] = useState("tiep_nhan");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [dangSua, setDangSua] = useState<NskxRow | null>(null);
  const { mode: dgMode, idx: dgIdx } = useDiaGioiIndex();
  const diaGioiLoc = useDiaGioiLoc();
  const qc = useQueryClient();
  const setLocCot = (v: Record<string, LocCot>) => {
    setLocCotRaw(v);
    setPage(1);
  };

  const locCotGui: string | undefined | null = (() => {
    const out: Record<string, unknown> = {};
    for (const [k, f] of Object.entries(locCot)) {
      if (!locCotDangBat(f)) continue;
      if (k === "tinh") {
        const dg = diaGioiLoc.buildDgLoc((f.in ?? []).filter((v) => v !== GIA_TRI_TRONG));
        if (dg === null) return null;
        if (dg) out.tinh = { dg };
        continue;
      }
      out[k] = f;
    }
    return Object.keys(out).length ? JSON.stringify(out) : undefined;
  })();
  const params = {
    thang,
    khu_vuc: khuVuc || undefined,
    id: idSearch || undefined,
    page,
    pageSize: 20,
    sortBy,
    sortDir,
    loc_cot: locCotGui ?? undefined,
  };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["ql-nskx", "danh-sach", params],
    queryFn: () => api.get<{ rows: NskxRow[]; total: number; total_chua_loc?: number }>(`/ql-nskx/danh-sach${buildQuery(params)}`),
    enabled: locCotGui !== null,
  });
  async function layGiaTriCot(cot: string): Promise<GiaTriLoc[]> {
    const { rows } = await api.get<{ rows: (GiaTriLoc & { tinh?: string | null; tinh_moi?: string | null })[] }>(
      `/ql-nskx/danh-sach${buildQuery({ ...params, page: undefined, pageSize: undefined, gia_tri_cot: cot })}`,
    );
    if (cot !== "tinh") return rows;
    const gom = new Map<string, number>();
    for (const r of rows) {
      const ten = dgIdx.tinh(dgMode, { tinh: r.tinh ?? null, tinh_moi: r.tinh_moi ?? null }) || GIA_TRI_TRONG;
      gom.set(ten, (gom.get(ten) ?? 0) + r.n);
    }
    return [...gom.entries()].map(([v, n]) => ({ v, n }));
  }

  const nhanTt = (map: Record<string, { label: string }>) => (v: string) => map[v]?.label ?? v;
  const LOC_NHANH: { key: string; label: string; kieu: KieuLocCot; nhanGiaTri?: (v: string) => string }[] = [
    { key: "trang_thai", label: tr("Trạng thái ca"), kieu: "list" },
    { key: "tt_loi_loc", label: tr("Đánh giá lõi"), kieu: "list", nhanGiaTri: nhanTt(TT_LOI_LOC) },
    { key: "tt_don", label: tr("Đơn lõi lọc"), kieu: "list", nhanGiaTri: nhanTt(TT_DON) },
    { key: "de_xuat_loi", label: tr("Đề xuất lõi"), kieu: "list", nhanGiaTri: (v) => DE_XUAT[v] ?? v },
    { key: "tinh", label: NHAN_CAP_1[dgMode], kieu: "list" },
    { key: "ky_thuat_vien", label: "KTV", kieu: "list" },
    { key: "nhom_san_pham", label: "Model", kieu: "list" },
    { key: "loai_yeu_cau", label: tr("Loại yêu cầu"), kieu: "list" },
    { key: "dung_han", label: "SLA", kieu: "list" },
    { key: "xu_ly_24h_bucket", label: tr("Xử lý 24h"), kieu: "list" },
    { key: "tiep_nhan", label: tr("Ngày tiếp nhận"), kieu: "date" },
    { key: "hoan_thanh", label: tr("Ngày hoàn thành"), kieu: "date" },
  ];

  const cotTtLoi: Column<NskxRow> = {
    key: "tt_loi_loc",
    header: tr("Đánh giá lõi"),
    sortKey: "tt_loi_loc",
    filter: "list",
    filterValueLabel: nhanTt(TT_LOI_LOC),
    render: (r) => {
      const t = TT_LOI_LOC[r.tt_loi_loc];
      const ds = parseJson<LoiDaThay>(r.ds_loi);
      return (
        <div className="flex flex-col gap-0.5" title={r.nguoi_xac_nhan ? tr("{0} — {1}", r.nguoi_xac_nhan, fmtDateTime(r.ngay_xac_nhan)) : undefined}>
          <span>
            <Badge tone={t.tone}>{t.label}</Badge>
          </span>
          {ds.map((x) => (
            <span key={x.ma_linh_kien} className="text-xs">
              <span className="font-mono">{x.ma_linh_kien}</span> {x.ten_linh_kien} ×{x.so_luong}
            </span>
          ))}
        </div>
      );
    },
  };
  const cotTtDon: Column<NskxRow> = {
    key: "tt_don",
    header: tr("Đơn lõi lọc"),
    sortKey: "tt_don",
    filter: "list",
    filterValueLabel: nhanTt(TT_DON),
    render: (r) => {
      const t = TT_DON[r.tt_don];
      const don = parseJson<DonLoi>(r.don_loi);
      return (
        <div className="flex flex-col gap-0.5" title={r.ngay_dong_bo ? tr("Đồng bộ lúc {0}", fmtDateTime(r.ngay_dong_bo)) : undefined}>
          <span>
            <Badge tone={t.tone}>{t.label}</Badge>
          </span>
          {don.map((d) => (
            <span key={d.don_id} className="text-xs">
              <span className="font-mono">{d.ma_lk}</span> {d.ten_lk} ×{d.so_luong_de_xuat}
            </span>
          ))}
        </div>
      );
    },
  };
  const cotLinhKien: Column<NskxRow> = {
    key: "de_xuat_loi",
    header: tr("Linh kiện sửa chữa"),
    sortKey: "de_xuat_loi",
    filter: "list",
    filterValueLabel: (v) => DE_XUAT[v] ?? v,
    render: (r) => {
      const ds = parseLinhKienLoi(r.linh_kien_loi);
      if (!ds.length) return <span className="text-[var(--ink-400)]">—</span>;
      return (
        <div className="flex flex-col gap-0.5 text-xs">
          {ds.map((p) => (
            <span key={p.stt} className={laLoi(p.ten_linh_kien) || laLoi(p.nhom_linh_kien) ? "font-semibold text-[var(--ocean-700)]" : ""}>
              <span className="font-mono">{p.ma_linh_kien}</span> {p.ten_linh_kien}
            </span>
          ))}
        </div>
      );
    },
  };

  const columns: Column<NskxRow>[] = [
    { key: "id", header: "ID", sortKey: "id", filter: "text", render: (r) => <span className="font-mono text-[var(--ocean-600)] font-semibold">{r.id}</span> },
    { key: "khach_hang", header: tr("Khách hàng"), sortKey: "khach_hang", filter: "text", render: (r) => r.khach_hang ?? "—" },
    { key: "khu_vuc", header: tr("Khu vực"), sortKey: "khu_vuc", filter: "list", filterValueLabel: shortKhuVuc, render: (r) => shortKhuVuc(r.khu_vuc) },
    { key: "ky_thuat_vien", header: "KTV", sortKey: "ky_thuat_vien", filter: "list", render: (r) => r.ktv_trien_khai ?? r.ky_thuat_vien ?? "—" },
    { key: "tiep_nhan", header: tr("Tiếp nhận"), sortKey: "tiep_nhan", filter: "date", render: (r) => fmtDateTime(r.thoi_gian_cskh_tiep_nhan) },
    ...(cheDo === "danh-gia"
      ? [cotLinhKien, cotTtLoi, cotTtDon]
      : [
          { key: "trang_thai", header: tr("Trạng thái"), sortKey: "trang_thai", filter: "list" as const, render: (r: NskxRow) => <Badge tone={r.thoi_gian_hoan_thanh ? "teal" : "amber"}>{r.trang_thai}</Badge> },
          { key: "hoan_thanh", header: tr("Hoàn thành"), sortKey: "hoan_thanh", filter: "date" as const, render: (r: NskxRow) => fmtDateTime(r.thoi_gian_hoan_thanh) },
          { key: "tuoi_ton", header: tr("Tuổi tồn"), sortKey: "tuoi_ton", filter: "number" as const, render: (r: NskxRow) => r.tuoi_ton ?? "—" },
          { key: "dung_han", header: "SLA", sortKey: "dung_han", filter: "list" as const, render: (r: NskxRow) => r.dung_han ?? "—" },
          { key: "xu_ly_24h_bucket", header: tr("Xử lý 24h"), sortKey: "xu_ly_24h_bucket", filter: "list" as const, render: (r: NskxRow) => r.xu_ly_24h_bucket ?? "—" },
          cotTtLoi,
          cotTtDon,
        ]),
    ...(cheDo === "danh-gia" && duocXacNhan
      ? [
          {
            key: "thao_tac",
            header: "",
            render: (r: NskxRow) => (
              <Btn
                size="sm"
                variant={r.tt_loi_loc === "chua_danh_gia" ? "primary" : "ghost"}
                onClick={(e) => {
                  e.stopPropagation();
                  setDangSua(r);
                }}
              >
                {r.tt_loi_loc === "chua_danh_gia" ? tr("Xác nhận") : tr("Sửa")}
              </Btn>
            ),
          },
        ]
      : []),
  ];
  const optionalColumns: Column<NskxRow>[] = [
    { key: "seri_san_pham", header: "Serial", sortKey: "seri_san_pham", filter: "text", render: (r) => r.seri_san_pham ?? "—" },
    { key: "nhom_san_pham", header: "Model", sortKey: "nhom_san_pham", filter: "list", render: (r) => r.nhom_san_pham ?? "—" },
    { key: "loai_yeu_cau", header: tr("Loại yêu cầu"), sortKey: "loai_yeu_cau", filter: "list", render: (r) => dl(r.loai_yeu_cau) ?? "—" },
    { key: "tien_do_hoan_thanh", header: tr("Tiến độ"), sortKey: "tien_do_hoan_thanh", filter: "list", render: (r) => r.tien_do_hoan_thanh ?? "—" },
    { key: "mo_ta_loi", header: tr("Mô tả lỗi"), sortKey: "mo_ta_loi", filter: "text", render: (r) => <span className="line-clamp-2">{r.mo_ta_loi ?? "—"}</span> },
    ...(cheDo === "danh-sach" ? [cotLinhKien] : []),
    { key: "nguoi_xac_nhan", header: tr("Người xác nhận lõi"), sortKey: "nguoi_xac_nhan", filter: "list", render: (r) => r.nguoi_xac_nhan ?? "—" },
  ];

  const exportRunner = useExportRunner();
  async function handleExport() {
    const all = await api.get<{ rows: NskxRow[] }>(`/ql-nskx/danh-sach${buildQuery({ ...params, page: undefined, pageSize: undefined, export: true })}`);
    const rows = all.rows.map((r) => ({
      id: r.id,
      khach_hang: r.khach_hang,
      khu_vuc: shortKhuVuc(r.khu_vuc),
      ky_thuat_vien: r.ky_thuat_vien,
      ktv_trien_khai: r.ktv_trien_khai,
      tinh: r.tinh,
      seri_san_pham: r.seri_san_pham,
      nhom_san_pham: r.nhom_san_pham,
      loai_yeu_cau: r.loai_yeu_cau,
      thoi_gian_cskh_tiep_nhan: r.thoi_gian_cskh_tiep_nhan,
      thoi_gian_hoan_thanh: r.thoi_gian_hoan_thanh,
      trang_thai: r.trang_thai,
      dung_han: r.dung_han,
      xu_ly_24h_bucket: r.xu_ly_24h_bucket,
      linh_kien_sua_chua: parseLinhKienLoi(r.linh_kien_loi).map((p) => `${p.ma_linh_kien} ${p.ten_linh_kien}`).join("; "),
      de_xuat_loi: deXuatLoi(r).map((p) => p.ma_linh_kien).join("; "),
      tt_loi_loc: TT_LOI_LOC[r.tt_loi_loc]?.label,
      loi_da_thay: parseJson<LoiDaThay>(r.ds_loi).map((x) => `${x.ma_linh_kien} ${x.ten_linh_kien ?? ""} x${x.so_luong}`).join("; "),
      nguoi_xac_nhan: r.nguoi_xac_nhan,
      ngay_xac_nhan: r.ngay_xac_nhan,
      tt_don: TT_DON[r.tt_don]?.label,
      don_loi: parseJson<DonLoi>(r.don_loi).map((d) => `${d.don_id} ${d.ma_lk} x${d.so_luong_de_xuat}`).join("; "),
    }));
    await exportRowsToExcel(rows, `ql_nskx_${thang}.xlsx`, "Data", {
      id: "ID",
      khach_hang: "Khách hàng",
      khu_vuc: "Khu vực",
      ky_thuat_vien: "Kỹ thuật viên",
      ktv_trien_khai: "KTV triển khai",
      tinh: "Tỉnh",
      seri_san_pham: "Serial",
      nhom_san_pham: "Model",
      loai_yeu_cau: "Loại yêu cầu",
      thoi_gian_cskh_tiep_nhan: "Tiếp nhận",
      thoi_gian_hoan_thanh: "Hoàn thành",
      trang_thai: "Trạng thái",
      dung_han: "SLA",
      xu_ly_24h_bucket: "Xử lý 24h",
      linh_kien_sua_chua: "Linh kiện sửa chữa",
      de_xuat_loi: "Đề xuất lõi",
      tt_loi_loc: "Đánh giá lõi",
      loi_da_thay: "Lõi đã thay",
      nguoi_xac_nhan: "Người xác nhận lõi",
      ngay_xac_nhan: "Ngày xác nhận lõi",
      tt_don: "Đơn lõi lọc",
      don_loi: "Đơn đặt lõi (linh-kien-app)",
    });
  }

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <input
          type="text"
          value={idSearch}
          onChange={(e) => {
            setIdSearch(e.target.value);
            setPage(1);
          }}
          placeholder={tr("Tìm theo ID/Serial…")}
          className="focus-ring w-40 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
        />
        {cheDo === "danh-gia" && (
          <span className="text-xs text-[var(--ink-500)]">
            {tr("Linh kiện có chữ “lõi” được tô đậm và tự đề xuất khi xác nhận. Mặc định lọc ca chưa đánh giá.")}
          </span>
        )}
        <div className="ml-auto">
          <Btn variant="ghost" size="sm" onClick={exportRunner.run(handleExport)} disabled={exportRunner.busy}>
            {exportRunner.busy ? tr("⏳ Đang xuất…") : tr("⬇ Xuất Excel")}
          </Btn>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap mb-2 text-xs">
        <span className="font-semibold text-[var(--ink-400)] mr-0.5">{tr("Bộ lọc:")}</span>
        {LOC_NHANH.map((lc) => {
          const f = locCot[lc.key];
          const nhan = lc.nhanGiaTri ?? ((v: string) => (v === GIA_TRI_TRONG ? tr("(Trống)") : (dl(v) ?? v)));
          return (
            <LocCotPopover
              key={lc.key}
              kieu={lc.kieu}
              tieuDe={lc.label}
              value={f}
              onChange={(v) => {
                const next = { ...locCot };
                if (v) next[lc.key] = v;
                else delete next[lc.key];
                setLocCot(next);
              }}
              layGiaTri={lc.kieu === "list" ? () => layGiaTriCot(lc.key) : undefined}
              nhanGiaTri={nhan}
              nut={({ dangBat, mo, ref }) => (
                <button
                  ref={ref}
                  type="button"
                  onClick={mo}
                  className={`focus-ring inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition-colors ${
                    dangBat
                      ? "border-[var(--ocean-500)] bg-[var(--ocean-100)] text-[var(--ocean-700)] font-semibold"
                      : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-600)] hover:border-[var(--ocean-400)]"
                  }`}
                >
                  {lc.label}
                  {dangBat ? <span className="font-normal">: {tomTatLoc(f, nhan, lc.kieu)}</span> : <span className="opacity-50">▾</span>}
                </button>
              )}
            />
          );
        })}
        {Object.values(locCot).some(locCotDangBat) && (
          <button type="button" onClick={() => setLocCot({})} className="ml-1 text-[var(--coral-600)] hover:underline">
            {tr("✕ Xóa tất cả lọc")}
          </button>
        )}
      </div>
      <PaginatedTable
        columns={columns}
        optionalColumns={optionalColumns}
        rows={data?.rows ?? []}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        page={page}
        pageSize={20}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onRowClick={(r) => openCase(r.id, cheDo === "danh-gia" ? "loi-linh-kien" : undefined)}
        rowKey={(r) => r.id}
        emptyText={tr("Không có ca NSKX nào.")}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={(s, d) => {
          setSortBy(s);
          setSortDir(d);
          setPage(1);
        }}
        storageKey={`ql-nskx-${cheDo}`}
        colFilters={locCot}
        onColFiltersChange={setLocCot}
        loadFilterValues={layGiaTriCot}
        totalUnfiltered={data?.total_chua_loc}
      />
      {dangSua && (
        <XacNhanLoiModal
          row={dangSua}
          onClose={() => setDangSua(null)}
          onSaved={() => {
            setDangSua(null);
            qc.invalidateQueries({ queryKey: ["ql-nskx"] });
          }}
        />
      )}
    </div>
  );
}

function XacNhanLoiModal({ row, onClose, onSaved }: { row: NskxRow; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { data: lkData } = useQuery({
    queryKey: ["settings-linh-kien"],
    queryFn: () => fetchWithHashCache<{ rows: LinhKienRow[] }>("settings-linh-kien", "/settings/linh-kien/version", "/settings/linh-kien"),
  });
  const catalog = lkData?.rows ?? [];
  const tenTheoMa = useMemo(() => new Map(catalog.map((r) => [r.ma_linh_kien, r.ten_linh_kien])), [catalog]);
  const deXuat = useMemo(() => deXuatLoi(row), [row]);
  const daLuu = parseJson<LoiDaThay>(row.ds_loi);
  const [thay, setThay] = useState<boolean | null>(row.thay_loi === null ? (deXuat.length ? true : null) : row.thay_loi === 1);
  const [ds, setDs] = useState<LoiDaThay[]>(() => {
    if (daLuu.length) return daLuu;
    const gop = new Map<string, number>();
    for (const p of deXuat) if (p.ma_linh_kien) gop.set(p.ma_linh_kien, (gop.get(p.ma_linh_kien) ?? 0) + 1);
    return [...gop.entries()].map(([ma, so_luong]) => ({ ma_linh_kien: ma, so_luong }));
  });
  const [ghiChu, setGhiChu] = useState(row.ghi_chu_loi ?? "");
  const [tim, setTim] = useState("");
  const [chiLoi, setChiLoi] = useState(true);
  const [dangLuu, setDangLuu] = useState(false);

  const boDau = (v: string) => v.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
  const ketQua = useMemo(() => {
    const q = boDau(tim.trim());
    return catalog
      .filter((r) => (!chiLoi || laLoi(r.ten_linh_kien)) && (!q || boDau(`${r.ma_linh_kien} ${r.ten_linh_kien}`).includes(q)))
      .slice(0, 50);
  }, [catalog, tim, chiLoi]);
  const saiMa = ds.filter((x) => catalog.length > 0 && !tenTheoMa.has(x.ma_linh_kien));

  async function luu() {
    if (thay === null) return toast(tr("Chọn Có thay / Không thay lõi."));
    if (thay && !ds.length) return toast(tr("Chọn ít nhất 1 lõi lọc đã thay."));
    if (thay && saiMa.length) return toast(tr("Có mã không thuộc danh mục linh kiện — xoá và chọn lại."));
    setDangLuu(true);
    try {
      await api.put(`/ql-nskx/${encodeURIComponent(row.id)}/loi-loc`, { thay_loi: thay, ds_loi: thay ? ds : [], ghi_chu: ghiChu });
      toast(tr("Đã lưu xác nhận lõi lọc ca {0}", row.id));
      onSaved();
    } catch (e) {
      toast(e instanceof ApiError ? (e.detail ?? e.message) : String(e));
    } finally {
      setDangLuu(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={tr("Xác nhận lõi lọc — ca {0}", row.id)}
      width="max-w-2xl"
      footer={
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>
            {tr("Huỷ")}
          </Btn>
          <Btn onClick={luu} loading={dangLuu}>
            {tr("Lưu xác nhận")}
          </Btn>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <div className="text-xs text-[var(--ink-500)]">
          {row.khach_hang} · {row.ktv_trien_khai ?? row.ky_thuat_vien} · {shortKhuVuc(row.khu_vuc)}
        </div>
        <Card className="p-3">
          <div className="font-semibold mb-1">{tr("Linh kiện sửa chữa trên ca")}</div>
          {parseLinhKienLoi(row.linh_kien_loi).length === 0 ? (
            <div className="text-[var(--ink-400)]">{tr("Ca không có báo cáo linh kiện xử lý.")}</div>
          ) : (
            parseLinhKienLoi(row.linh_kien_loi).map((p) => (
              <div key={p.stt} className={laLoi(p.ten_linh_kien) || laLoi(p.nhom_linh_kien) ? "font-semibold text-[var(--ocean-700)]" : "text-[var(--ink-600)]"}>
                <span className="font-mono">{p.ma_linh_kien}</span> {p.ten_linh_kien}
                {p.cach_thuc_xu_ly ? <span className="font-normal text-[var(--ink-400)]"> — {p.cach_thuc_xu_ly}</span> : null}
              </div>
            ))
          )}
        </Card>
        <div className="flex gap-4">
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={thay === true} onChange={() => setThay(true)} /> {tr("Có thay lõi")}
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={thay === false} onChange={() => setThay(false)} /> {tr("Không thay lõi")}
          </label>
        </div>
        {thay && (
          <>
            <div>
              <div className="font-semibold mb-1">{tr("Lõi lọc đã thay")}</div>
              {ds.length === 0 && <div className="text-[var(--ink-400)]">{tr("Chưa chọn lõi nào.")}</div>}
              {ds.map((x, i) => {
                const ten = tenTheoMa.get(x.ma_linh_kien);
                return (
                  <div key={x.ma_linh_kien} className="flex items-center gap-2 py-1 border-b border-[var(--line)]">
                    <span className="font-mono">{x.ma_linh_kien}</span>
                    <span className={`flex-1 ${ten ? "" : "text-[var(--coral-600)]"}`}>{ten ?? tr("Không có trong danh mục linh kiện")}</span>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={x.so_luong}
                      onChange={(e) => setDs(ds.map((y, j) => (j === i ? { ...y, so_luong: Math.max(1, Number(e.target.value) || 1) } : y)))}
                      className="w-16 border border-[var(--line)] rounded px-1.5 py-0.5"
                    />
                    <button type="button" className="text-[var(--coral-600)]" onClick={() => setDs(ds.filter((_, j) => j !== i))}>
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <input
                  type="text"
                  value={tim}
                  onChange={(e) => setTim(e.target.value)}
                  placeholder={tr("Tìm mã / tên linh kiện để thêm…")}
                  className="focus-ring flex-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5"
                />
                <label className="inline-flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={chiLoi} onChange={(e) => setChiLoi(e.target.checked)} /> {tr("Chỉ lõi lọc")}
                </label>
              </div>
              <div className="max-h-48 overflow-auto border border-[var(--line)] rounded-lg">
                {ketQua.map((r) => (
                  <button
                    key={r.ma_linh_kien}
                    type="button"
                    disabled={ds.some((x) => x.ma_linh_kien === r.ma_linh_kien)}
                    onClick={() => setDs([...ds, { ma_linh_kien: r.ma_linh_kien, so_luong: 1 }])}
                    className="w-full text-left px-2.5 py-1 hover:bg-[var(--ocean-100)] disabled:opacity-40 border-b border-[var(--line)] last:border-0"
                  >
                    <span className="font-mono">{r.ma_linh_kien}</span> {r.ten_linh_kien}
                  </button>
                ))}
                {ketQua.length === 0 && <div className="px-2.5 py-2 text-[var(--ink-400)]">{tr("Không tìm thấy linh kiện.")}</div>}
              </div>
            </div>
          </>
        )}
        <textarea
          value={ghiChu}
          onChange={(e) => setGhiChu(e.target.value)}
          placeholder={tr("Ghi chú (tuỳ chọn)")}
          rows={2}
          className="focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5"
        />
      </div>
    </Modal>
  );
}

type CotBaoCao = "nhom" | "tong_ca" | "da_hoan_thanh" | "ty_24h" | "ty_sla" | "da_dat_loi" | "khong_thay_loi" | "chua_dat_loi" | "chua_danh_gia";

function BaoCaoTab({ thang, khuVuc, onDrill }: { thang: string; khuVuc: string; onDrill: (nhom: string | null, dim: "khu_vuc" | "ktv", tt?: string) => void }) {
  const [dim, setDim] = useLocalStorageState<"khu_vuc" | "ktv">("filters:ql-nskx-bao-cao-dim", "khu_vuc");
  const [sapXep, setSapXep] = useState<{ cot: CotBaoCao; chieu: "asc" | "desc" }>({ cot: "tong_ca", chieu: "desc" });
  const [timNhom, setTimNhom] = useState("");
  const params = { thang, khu_vuc: khuVuc || undefined, dim };
  const { data, isLoading, isError } = useQuery({
    queryKey: ["ql-nskx", "bao-cao", params],
    queryFn: () => api.get<{ rows: BaoCaoRow[] }>(`/ql-nskx/bao-cao${buildQuery(params)}`),
  });
  const giaTri = (r: BaoCaoRow, cot: CotBaoCao): number | string => {
    if (cot === "nhom") return r.nhom ?? "";
    if (cot === "ty_24h") return r.co_tinh_24h ? r.duoi_24h / r.co_tinh_24h : -1;
    if (cot === "ty_sla") return r.co_tinh_sla ? r.dung_han / r.co_tinh_sla : -1;
    return r[cot];
  };
  const rows = useMemo(() => {
    const boDau = (v: string) => v.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").toLowerCase();
    const q = boDau(timNhom.trim());
    const loc = (data?.rows ?? []).filter((r) => !q || boDau(r.nhom ?? "").includes(q));
    return [...loc].sort((a, b) => {
      const x = giaTri(a, sapXep.cot);
      const y = giaTri(b, sapXep.cot);
      const s = typeof x === "string" ? x.localeCompare(String(y), "vi") : x - (y as number);
      return sapXep.chieu === "asc" ? s : -s;
    });
  }, [data, timNhom, sapXep]);
  const tong = useMemo(() => {
    const t: BaoCaoRow = { nhom: null, khu_vuc: null, tong_ca: 0, da_hoan_thanh: 0, duoi_24h: 0, co_tinh_24h: 0, dung_han: 0, co_tinh_sla: 0, da_dat_loi: 0, khong_thay_loi: 0, chua_dat_loi: 0, chua_danh_gia: 0 };
    for (const r of rows) for (const k of Object.keys(t) as (keyof BaoCaoRow)[]) if (typeof r[k] === "number") (t[k] as number) += r[k] as number;
    return t;
  }, [rows]);

  const COTS: { cot: CotBaoCao; label: string; tt?: string }[] = [
    { cot: "tong_ca", label: tr("Tổng ca") },
    { cot: "da_hoan_thanh", label: tr("Đã hoàn thành"), tt: "da_hoan_thanh" },
    { cot: "ty_24h", label: tr("Tỷ lệ 24h") },
    { cot: "ty_sla", label: tr("Tỷ lệ SLA") },
    { cot: "da_dat_loi", label: tr("Đã đặt lõi"), tt: "da_len_don" },
    { cot: "khong_thay_loi", label: tr("Không thay lõi"), tt: "khong_can" },
    { cot: "chua_dat_loi", label: tr("Chưa đặt lõi"), tt: "chua_len_don" },
    { cot: "chua_danh_gia", label: tr("Chưa đánh giá lõi"), tt: "chua_danh_gia" },
  ];
  const o = (r: BaoCaoRow, c: (typeof COTS)[number], laTong: boolean) => {
    if (c.cot === "ty_24h") return pct(r.duoi_24h, r.co_tinh_24h);
    if (c.cot === "ty_sla") return pct(r.dung_han, r.co_tinh_sla);
    const v = r[c.cot as keyof BaoCaoRow] as number;
    return (
      <button type="button" className="hover:underline text-[var(--ocean-700)]" onClick={() => onDrill(laTong ? null : (r.nhom ?? ""), dim, c.cot === "tong_ca" ? undefined : c.tt)}>
        {v}
      </button>
    );
  };
  const muiTen = (cot: CotBaoCao) => (sapXep.cot === cot ? (sapXep.chieu === "asc" ? " ▲" : " ▼") : "");
  const bamSapXep = (cot: CotBaoCao) => setSapXep((s) => ({ cot, chieu: s.cot === cot && s.chieu === "desc" ? "asc" : "desc" }));

  async function xuat() {
    await exportRowsToExcel(
      [tong, ...rows].map((r, i) => ({
        nhom: i === 0 ? "Tổng cộng" : dim === "khu_vuc" ? shortKhuVuc(r.nhom) : r.nhom,
        tong_ca: r.tong_ca,
        da_hoan_thanh: r.da_hoan_thanh,
        ty_24h: pct(r.duoi_24h, r.co_tinh_24h),
        ty_sla: pct(r.dung_han, r.co_tinh_sla),
        da_dat_loi: r.da_dat_loi,
        khong_thay_loi: r.khong_thay_loi,
        chua_dat_loi: r.chua_dat_loi,
        chua_danh_gia: r.chua_danh_gia,
      })),
      `bao_cao_nskx_${thang}.xlsx`,
      "Data",
      { nhom: dim === "khu_vuc" ? "Khu vực" : "KTV", tong_ca: "Tổng ca", da_hoan_thanh: "Đã hoàn thành", ty_24h: "Tỷ lệ 24h", ty_sla: "Tỷ lệ SLA", da_dat_loi: "Đã đặt lõi", khong_thay_loi: "Không thay lõi", chua_dat_loi: "Chưa đặt lõi", chua_danh_gia: "Chưa đánh giá lõi" },
      { skipColumnPicker: true },
    );
  }

  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <Select
          value={dim}
          onChange={(v) => setDim(v as "khu_vuc" | "ktv")}
          options={[
            { value: "khu_vuc", label: tr("Theo khu vực") },
            { value: "ktv", label: tr("Theo KTV") },
          ]}
        />
        <input
          type="text"
          value={timNhom}
          onChange={(e) => setTimNhom(e.target.value)}
          placeholder={dim === "ktv" ? tr("Lọc KTV…") : tr("Lọc khu vực…")}
          className="focus-ring w-44 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
        />
        <span className="text-xs text-[var(--ink-500)]">
          {tr("{0} / {1} dòng · tỷ lệ 24h / SLA tính trên ca tính KPI · bấm số để xem danh sách", rows.length, data?.rows.length ?? 0)}
        </span>
        <div className="ml-auto">
          <Btn variant="ghost" size="sm" onClick={xuat}>
            {tr("⬇ Xuất Excel")}
          </Btn>
        </div>
      </div>
      {isLoading ? (
        <div className="text-sm text-[var(--ink-400)]">{tr("Đang tải…")}</div>
      ) : isError ? (
        <div className="text-sm text-[var(--coral-600)]">{tr("Không tải được dữ liệu")}</div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--ink-500)] border-b border-[var(--line)]">
                <th className="py-2 pr-3 cursor-pointer select-none" onClick={() => bamSapXep("nhom")}>
                  {dim === "khu_vuc" ? tr("Khu vực") : "KTV"}
                  {muiTen("nhom")}
                </th>
                {COTS.map((c) => (
                  <th key={c.cot} className="py-2 px-2 text-right cursor-pointer select-none whitespace-nowrap" onClick={() => bamSapXep(c.cot)}>
                    {c.label}
                    {muiTen(c.cot)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="font-semibold bg-[var(--ocean-100)]/40 border-b border-[var(--line)]">
                <td className="py-1.5 pr-3">{tr("Tổng cộng")}</td>
                {COTS.map((c) => (
                  <td key={c.cot} className="py-1.5 px-2 text-right tabular-nums">
                    {o(tong, c, true)}
                  </td>
                ))}
              </tr>
              {rows.map((r) => (
                <tr key={r.nhom ?? ""} className="border-b border-[var(--line)] hover:bg-slate-50">
                  <td className="py-1.5 pr-3">
                    {dim === "khu_vuc" ? shortKhuVuc(r.nhom) || "—" : r.nhom || "—"}
                    {dim === "ktv" && r.khu_vuc ? <span className="text-xs text-[var(--ink-400)]"> · {shortKhuVuc(r.khu_vuc)}</span> : null}
                  </td>
                  {COTS.map((c) => (
                    <td key={c.cot} className="py-1.5 px-2 text-right tabular-nums">
                      {o(r, c, false)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
