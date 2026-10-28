import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, buildQuery } from "../api/client";
import { Badge } from "./ui/Badge";
import { Btn } from "./ui/Btn";
import { Card } from "./ui/Card";
import { Select } from "./ui/Select";
import { StatCard } from "./ui/StatCard";
import { PaginatedTable, type Column } from "./ui/PaginatedTable";
import { ThInfo } from "./ui/ThInfo";
import { LOAI_LOI_META, fmtDate, type LoaiLoi } from "../types";
import { shortKhuVuc } from "../lib/khuVucShortLabel";
import { exportRowsToExcel } from "../lib/exportExcel";
import { LOAI_TRU_LOAI_LOI } from "./KhaoSatLoaiTru";
import { tr } from "../i18n/tr";


// Tab "Theo dõi KTV loại trừ" - Quản lý khảo sát (2026-10-17, backend GET /survey/loai-tru/theo-doi). Mỗi dòng danh sách
// loại trừ: so TỶ LỆ NGHI NGỜ loại lỗi đó trong kỳ loại trừ với N ngày ngay trước kỳ -> quản lý thấy nhanh KTV nào đột
// biến tăng nghi ngờ sau khi được miễn gọi, thuộc khu vực nào, để quyết định tháng sau còn giữ trong danh sách không.
// Ngưỡng "đột biến" tính ở client (đổi ngưỡng không gọi lại API).

interface ApiRow {
  id: number;
  ma_ktv: string;
  ten_ktv: string | null;
  loai_loi: LoaiLoi;
  tu_ngay: string;
  den_ngay: string;
  khu_vuc: string;
  ky: "truoc" | "trong";
  tiep_nhan: number;
  nghi_ngo: number;
}

type DanhGia = "dot_bien" | "it_du_lieu" | "on_dinh";

interface DongKtv {
  id: number;
  ma_ktv: string;
  ten_ktv: string | null;
  loai_loi: LoaiLoi;
  tu_ngay: string;
  den_ngay: string;
  khu_vuc: string; // khu vực có nhiều ca nhất của KTV trong 2 kỳ
  tnTruoc: number;
  nnTruoc: number;
  tnTrong: number;
  nnTrong: number;
  tlTruoc: number | null;
  tlTrong: number | null;
  chenh: number | null; // điểm %
  heSo: number | null;
  danhGia: DanhGia;
  dangHieuLuc: boolean;
}

const pct = (n: number, d: number) => (d > 0 ? (100 * n) / d : null);
const fmtPct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);
const fmtChenh = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`);

const DANH_GIA_META: Record<DanhGia, { label: string; tone: "coral" | "gray" | "teal" }> = {
  dot_bien: { label: tr("Đột biến – xem lại"), tone: "coral" },
  it_du_lieu: { label: tr("Ít dữ liệu"), tone: "gray" },
  on_dinh: { label: tr("Ổn định"), tone: "teal" },
};

const THU_TU_DANH_GIA: Record<DanhGia, number> = { dot_bien: 0, on_dinh: 1, it_du_lieu: 2 };

export function KhaoSatTheoDoiLoaiTruTab({ khuVucFilter }: { khuVucFilter: string }) {
  const [xemTheo, setXemTheo] = useState<"ktv" | "khu_vuc">("ktv");
  const [loaiLoi, setLoaiLoi] = useState("");
  const [hieuLuc, setHieuLuc] = useState<"dang" | "tat_ca">("dang");
  const [nguongDiem, setNguongDiem] = useState(5);
  const [soCaToiThieu, setSoCaToiThieu] = useState(10);
  const [chiDotBien, setChiDotBien] = useState(false);
  const [khuVucChon, setKhuVucChon] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, isError, refetch } = useQuery({
    // khu_vuc = bo loc khu vuc chung cua module (o dau trang) - backend loc trong JS tren ket qua cache chung.
    queryKey: ["survey-loai-tru-theo-doi", khuVucFilter],
    queryFn: () => api.get<{ homNay: string; soNgayTruoc: number; rows: ApiRow[] }>(`/survey/loai-tru/theo-doi${buildQuery({ khu_vuc: khuVucFilter })}`),
  });
  const homNay = data?.homNay ?? "";
  const soNgayTruoc = data?.soNgayTruoc ?? 90;

  // Gộp các dòng (theo khu vực x kỳ) về 1 dòng / mục loại trừ, rồi chấm "đột biến" theo ngưỡng.
  const dongKtv = useMemo<DongKtv[]>(() => {
    const m = new Map<number, DongKtv & { kv: Map<string, number> }>();
    for (const r of data?.rows ?? []) {
      let d = m.get(r.id);
      if (!d) {
        d = {
          id: r.id, ma_ktv: r.ma_ktv, ten_ktv: r.ten_ktv, loai_loi: r.loai_loi, tu_ngay: r.tu_ngay, den_ngay: r.den_ngay, khu_vuc: "",
          tnTruoc: 0, nnTruoc: 0, tnTrong: 0, nnTrong: 0, tlTruoc: null, tlTrong: null, chenh: null, heSo: null, danhGia: "it_du_lieu",
          dangHieuLuc: r.tu_ngay <= homNay && r.den_ngay >= homNay, kv: new Map(),
        };
        m.set(r.id, d);
      }
      if (r.ky === "truoc") {
        d.tnTruoc += r.tiep_nhan;
        d.nnTruoc += r.nghi_ngo;
      } else {
        d.tnTrong += r.tiep_nhan;
        d.nnTrong += r.nghi_ngo;
      }
      d.kv.set(r.khu_vuc, (d.kv.get(r.khu_vuc) ?? 0) + r.tiep_nhan);
    }
    return [...m.values()].map(({ kv, ...d }) => {
      const khuVuc = [...kv.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
      const tlTruoc = pct(d.nnTruoc, d.tnTruoc);
      const tlTrong = pct(d.nnTrong, d.tnTrong);
      const chenh = tlTruoc !== null && tlTrong !== null ? tlTrong - tlTruoc : null;
      const heSo = tlTruoc && tlTrong !== null ? tlTrong / tlTruoc : null;
      const duDuLieu = d.tnTrong >= soCaToiThieu && d.tnTruoc >= soCaToiThieu;
      const danhGia: DanhGia = !duDuLieu ? "it_du_lieu" : chenh !== null && chenh >= nguongDiem ? "dot_bien" : "on_dinh";
      return { ...d, khu_vuc: khuVuc, tlTruoc, tlTrong, chenh, heSo, danhGia };
    });
  }, [data, homNay, nguongDiem, soCaToiThieu]);

  const dongLoc = useMemo(
    () =>
      dongKtv
        .filter((d) => !loaiLoi || d.loai_loi === loaiLoi)
        .filter((d) => hieuLuc === "tat_ca" || d.dangHieuLuc)
        .filter((d) => !khuVucChon || d.khu_vuc === khuVucChon)
        .filter((d) => !chiDotBien || d.danhGia === "dot_bien")
        .sort((a, b) => THU_TU_DANH_GIA[a.danhGia] - THU_TU_DANH_GIA[b.danhGia] || (b.chenh ?? -999) - (a.chenh ?? -999)),
    [dongKtv, loaiLoi, hieuLuc, khuVucChon, chiDotBien],
  );

  // Gộp theo khu vực (khu vực chính của từng KTV) - không lọc "chỉ đột biến"/khu vực chọn để vẫn thấy toàn cảnh.
  const dongKhuVuc = useMemo(() => {
    const m = new Map<string, { khu_vuc: string; soMuc: number; soDotBien: number; soItDuLieu: number; tnTruoc: number; nnTruoc: number; tnTrong: number; nnTrong: number }>();
    for (const d of dongKtv.filter((x) => (!loaiLoi || x.loai_loi === loaiLoi) && (hieuLuc === "tat_ca" || x.dangHieuLuc))) {
      let k = m.get(d.khu_vuc);
      if (!k) {
        k = { khu_vuc: d.khu_vuc, soMuc: 0, soDotBien: 0, soItDuLieu: 0, tnTruoc: 0, nnTruoc: 0, tnTrong: 0, nnTrong: 0 };
        m.set(d.khu_vuc, k);
      }
      k.soMuc++;
      if (d.danhGia === "dot_bien") k.soDotBien++;
      if (d.danhGia === "it_du_lieu") k.soItDuLieu++;
      k.tnTruoc += d.tnTruoc;
      k.nnTruoc += d.nnTruoc;
      k.tnTrong += d.tnTrong;
      k.nnTrong += d.nnTrong;
    }
    return [...m.values()]
      .map((k) => {
        const tlTruoc = pct(k.nnTruoc, k.tnTruoc);
        const tlTrong = pct(k.nnTrong, k.tnTrong);
        return { ...k, tlTruoc, tlTrong, chenh: tlTruoc !== null && tlTrong !== null ? tlTrong - tlTruoc : null };
      })
      .sort((a, b) => b.soDotBien - a.soDotBien || (b.chenh ?? -999) - (a.chenh ?? -999));
  }, [dongKtv, loaiLoi, hieuLuc]);

  const tongDotBien = dongLoc.filter((d) => d.danhGia === "dot_bien").length;
  const soKvDotBien = dongKhuVuc.filter((k) => k.soDotBien > 0).length;

  // Chu thich cach tinh tung cot (hien qua dau "(?)" o tieu de) - nguoi xem tu hieu, khong phai hoi lai.
  const INFO = {
    khuVuc: tr("Khu vực có nhiều ca tiếp nhận nhất của KTV, tính gộp cả 2 kỳ (trước và trong kỳ loại trừ)."),
    ky: tr("Khoảng ngày khai báo trong Danh sách loại trừ, so với ngày CSKH tiếp nhận ca. \"Hết hạn\" = đã qua ngày kết thúc."),
    truoc: tr("Tỷ lệ nghi ngờ = số ca bị hệ thống gắn cờ đúng loại lỗi được loại trừ ÷ số ca tiếp nhận của KTV, trong {0} ngày ngay trước ngày bắt đầu loại trừ. Trong ngoặc: (số ca nghi ngờ / số ca tiếp nhận).", soNgayTruoc),
    trong: tr("Cùng cách tính như cột \"Trước\", từ ngày bắt đầu loại trừ đến hôm nay (hoặc đến ngày kết thúc nếu kỳ đã hết hạn). Đây là tỷ lệ nghi ngờ, không phải vi phạm xác nhận - trong kỳ loại trừ các ca này không được gọi khảo sát."),
    chenh: tr("= Tỷ lệ trong kỳ − tỷ lệ trước, đơn vị điểm % (vd 20% lên 30% là +10). (×n) = tỷ lệ trong kỳ ÷ tỷ lệ trước. Đỏ = tăng từ {0} điểm trở lên (ngưỡng đột biến), xanh = giảm.", nguongDiem),
    danhGia: tr("Đột biến – xem lại: chênh lệch ≥ {0} điểm % VÀ mỗi kỳ có ít nhất {1} ca tiếp nhận. Ít dữ liệu: 1 trong 2 kỳ có dưới {2} ca nên tỷ lệ chưa đáng tin. Ổn định: các trường hợp còn lại. Đổi ngưỡng ở ô phía trên.", nguongDiem, soCaToiThieu, soCaToiThieu),
    soMuc: tr("Số dòng trong Danh sách loại trừ (1 dòng = 1 KTV × 1 loại lỗi × 1 kỳ) có khu vực chính là khu vực này, theo bộ lọc loại lỗi và kỳ đang chọn."),
    soDotBien: tr("Số dòng loại trừ của khu vực được đánh giá \"Đột biến – xem lại\" theo ngưỡng đang chọn."),
    soItDuLieu: tr("Số dòng loại trừ của khu vực có 1 trong 2 kỳ dưới {0} ca tiếp nhận (chưa đủ để đánh giá).", soCaToiThieu),
    kvTruoc: tr("Cộng dồn mọi KTV loại trừ của khu vực: tổng ca nghi ngờ ÷ tổng ca tiếp nhận trong {0} ngày trước kỳ loại trừ của từng KTV.", soNgayTruoc),
    kvTrong: tr("Cộng dồn mọi KTV loại trừ của khu vực: tổng ca nghi ngờ ÷ tổng ca tiếp nhận trong kỳ loại trừ."),
    kvChenh: tr("= Tỷ lệ trong kỳ − tỷ lệ trước của cả khu vực, đơn vị điểm %."),
  };

  const ktvLabel = (d: DongKtv) => (d.ten_ktv && d.ten_ktv !== d.ma_ktv ? `${d.ma_ktv} — ${d.ten_ktv}` : d.ma_ktv);
  const kyLabel = (d: DongKtv) => `${fmtDate(d.tu_ngay)} – ${fmtDate(d.den_ngay)}`;

  const cotKtv: Column<DongKtv>[] = [
    { key: "ktv", header: "KTV", render: (d) => <span className="text-xs font-semibold">{ktvLabel(d)}</span> },
    { key: "khu_vuc", header: <ThInfo label={tr("Khu vực")} info={INFO.khuVuc} />, render: (d) => <span className="text-xs">{shortKhuVuc(d.khu_vuc)}</span> },
    { key: "loai_loi", header: tr("Loại lỗi"), render: (d) => <span className="text-xs">{LOAI_LOI_META[d.loai_loi]?.label ?? d.loai_loi}</span> },
    { key: "ky", header: <ThInfo label={tr("Kỳ loại trừ")} info={INFO.ky} />, render: (d) => <span className="text-xs whitespace-nowrap">{kyLabel(d)}{!d.dangHieuLuc && <span className="text-[var(--ink-400)]">  {tr("(hết hạn)")}</span>}</span> },
    {
      key: "truoc",
      header: <ThInfo label={tr("Trước ({0} ngày)", soNgayTruoc)} info={INFO.truoc} />,
      render: (d) => (
        <span className="font-mono text-xs whitespace-nowrap">
          {fmtPct(d.tlTruoc)} <span className="text-[var(--ink-400)]">({d.nnTruoc}/{d.tnTruoc})</span>
        </span>
      ),
    },
    {
      key: "trong",
      header: <ThInfo label={tr("Trong kỳ loại trừ")} info={INFO.trong} />,
      render: (d) => (
        <span className="font-mono text-xs whitespace-nowrap">
          {fmtPct(d.tlTrong)} <span className="text-[var(--ink-400)]">({d.nnTrong}/{d.tnTrong})</span>
        </span>
      ),
    },
    {
      key: "chenh",
      header: <ThInfo label={tr("Chênh lệch (điểm %)")} info={INFO.chenh} />,
      render: (d) => (
        <span className={`font-mono text-xs font-semibold ${d.chenh !== null && d.chenh >= nguongDiem ? "text-[var(--coral-500)]" : d.chenh !== null && d.chenh < 0 ? "text-[var(--teal-500)]" : ""}`}>
          {fmtChenh(d.chenh)}
          {d.heSo !== null && <span className="font-normal text-[var(--ink-400)]"> (×{d.heSo.toFixed(1)})</span>}
        </span>
      ),
    },
    { key: "danh_gia", header: <ThInfo label={tr("Đánh giá")} info={INFO.danhGia} />, render: (d) => <Badge tone={DANH_GIA_META[d.danhGia].tone}>{DANH_GIA_META[d.danhGia].label}</Badge> },
  ];

  const xuatExcel = () =>
    exportRowsToExcel(
      dongLoc.map((d) => ({
        ma_ktv: d.ma_ktv,
        ten_ktv: d.ten_ktv ?? "",
        khu_vuc: d.khu_vuc,
        loai_loi: LOAI_LOI_META[d.loai_loi]?.label ?? d.loai_loi,
        tu_ngay: d.tu_ngay,
        den_ngay: d.den_ngay,
        tiep_nhan_truoc: d.tnTruoc,
        nghi_ngo_truoc: d.nnTruoc,
        ty_le_truoc: d.tlTruoc === null ? "" : Number(d.tlTruoc.toFixed(1)),
        tiep_nhan_trong: d.tnTrong,
        nghi_ngo_trong: d.nnTrong,
        ty_le_trong: d.tlTrong === null ? "" : Number(d.tlTrong.toFixed(1)),
        chenh_lech: d.chenh === null ? "" : Number(d.chenh.toFixed(1)),
        danh_gia: DANH_GIA_META[d.danhGia].label,
      })),
      `theo_doi_ktv_loai_tru_${homNay}.xlsx`,
      "Data",
      {
        ma_ktv: "Mã KTV",
        ten_ktv: "Tên KTV",
        khu_vuc: "Khu vực",
        loai_loi: "Loại lỗi",
        tu_ngay: "Loại trừ từ",
        den_ngay: "Loại trừ đến",
        tiep_nhan_truoc: tr("Tiếp nhận {0} ngày trước", soNgayTruoc),
        nghi_ngo_truoc: "Nghi ngờ trước",
        ty_le_truoc: "Tỷ lệ nghi ngờ trước (%)",
        tiep_nhan_trong: "Tiếp nhận trong kỳ",
        nghi_ngo_trong: "Nghi ngờ trong kỳ",
        ty_le_trong: "Tỷ lệ nghi ngờ trong kỳ (%)",
        chenh_lech: "Chênh lệch (điểm %)",
        danh_gia: "Đánh giá",
      },
    );

  const dongTrang = dongLoc.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="mt-4">
      <div className="text-sm text-[var(--ink-600)] mb-3">
        {tr("So sánh")} <b>{tr("tỷ lệ nghi ngờ")}</b>  {tr("(số ca bị hệ thống gắn cờ lỗi / số ca tiếp nhận) của từng KTV trong danh sách loại trừ:")} <b>{tr("trong kỳ loại trừ")}</b>  {tr("so với")} <b>{soNgayTruoc}  {tr("ngày ngay trước khi loại trừ")}</b>{tr(", đúng loại lỗi được loại trừ, theo ngày CSKH tiếp nhận ca. So tỷ lệ chứ không so số lượng vì 2 kỳ dài khác nhau. Không so vi phạm xác nhận vì ca của KTV được loại trừ không còn được gọi khảo sát.")}</div>

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <div>
            <div className="text-xs text-[var(--ink-400)] mb-1">Xem theo</div>
            <Select value={xemTheo} onChange={(v) => { setXemTheo(v as "ktv" | "khu_vuc"); setPage(1); }} options={[{ value: "ktv", label: "KTV" }, { value: "khu_vuc", label: tr("Khu vực") }]} />
          </div>
          <div>
            <div className="text-xs text-[var(--ink-400)] mb-1">{tr("Loại lỗi")}</div>
            <Select
              value={loaiLoi}
              onChange={(v) => { setLoaiLoi(v); setPage(1); }}
              options={[{ value: "", label: tr("Tất cả loại lỗi") }, ...LOAI_TRU_LOAI_LOI.map((l) => ({ value: l, label: LOAI_LOI_META[l].label }))]}
            />
          </div>
          <div>
            <div className="text-xs text-[var(--ink-400)] mb-1">{tr("Kỳ loại trừ")}</div>
            <Select
              value={hieuLuc}
              onChange={(v) => { setHieuLuc(v as "dang" | "tat_ca"); setPage(1); }}
              options={[{ value: "dang", label: tr("Đang hiệu lực") }, { value: "tat_ca", label: tr("Tất cả (gồm đã hết hạn ≤120 ngày)") }]}
            />
          </div>
          <label className="text-xs text-[var(--ink-400)]">
            {tr("Đột biến khi tăng ≥")}<input type="number" min={0} step={1} value={nguongDiem} onChange={(e) => { setNguongDiem(Number(e.target.value) || 0); setPage(1); }} className="focus-ring ml-1 w-16 border border-[var(--line)] rounded-lg px-2 py-1 text-sm" />
            <span className="ml-1">{tr("điểm %")}</span>
          </label>
          <label className="text-xs text-[var(--ink-400)]">
            {tr("Mỗi kỳ tối thiểu")}<input type="number" min={1} step={1} value={soCaToiThieu} onChange={(e) => { setSoCaToiThieu(Math.max(1, Number(e.target.value) || 1)); setPage(1); }} className="focus-ring ml-1 w-16 border border-[var(--line)] rounded-lg px-2 py-1 text-sm" />
            <span className="ml-1">ca</span>
          </label>
          <label className="text-xs inline-flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={chiDotBien} onChange={(e) => { setChiDotBien(e.target.checked); setPage(1); }} />
            {tr("Chỉ hiện đột biến")}</label>
          <div className="ml-auto">
            <Btn variant="ghost" size="sm" onClick={xuatExcel} disabled={dongLoc.length === 0}>
              {tr("⬇ Xuất Excel")}</Btn>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-3 mb-4">
        <StatCard label={tr("Mục loại trừ đang xem")} value={dongLoc.length} tone="ocean" />
        <StatCard label={tr("KTV đột biến – cần xem lại")} value={tongDotBien} tone="coral" onClick={() => { setXemTheo("ktv"); setChiDotBien(true); setPage(1); }} />
        <StatCard label={tr("Khu vực có KTV đột biến")} value={soKvDotBien} tone="amber" onClick={() => setXemTheo("khu_vuc")} />
      </div>

      {khuVucChon && xemTheo === "ktv" && (
        <div className="mb-2 text-xs">
          {tr("Đang lọc khu vực")} <b>{shortKhuVuc(khuVucChon)}</b>{" "}
          <button className="text-[var(--ocean-600)] hover:underline" onClick={() => setKhuVucChon("")}>
            {tr("✕ Bỏ lọc")}</button>
        </div>
      )}

      {xemTheo === "ktv" ? (
        <PaginatedTable
          columns={cotKtv}
          rows={dongTrang}
          isLoading={isLoading}
          isError={isError}
          onRetry={refetch}
          page={page}
          pageSize={pageSize}
          total={dongLoc.length}
          onPageChange={setPage}
          rowKey={(d) => d.id}
          rowClassName={(d) => (d.danhGia === "dot_bien" ? "bg-[var(--coral-100)]" : "")}
          emptyText={tr("Không có KTV nào trong danh sách loại trừ khớp bộ lọc.")}
          storageKey="survey-loai-tru-theo-doi"
        />
      ) : (
        <PaginatedTable
          columns={[
            {
              key: "khu_vuc",
              header: tr("Khu vực"),
              render: (k) => (
                <button className="text-[var(--ocean-600)] hover:underline text-left text-xs font-semibold" onClick={() => { setKhuVucChon(k.khu_vuc); setXemTheo("ktv"); setPage(1); }}>
                  {shortKhuVuc(k.khu_vuc)}
                </button>
              ),
            },
            { key: "so_muc", header: <ThInfo label={tr("Số mục loại trừ")} info={INFO.soMuc} />, render: (k) => <span className="font-mono text-xs">{k.soMuc}</span> },
            { key: "dot_bien", header: <ThInfo label={tr("KTV đột biến")} info={INFO.soDotBien} />, render: (k) => (k.soDotBien > 0 ? <Badge tone="coral">{k.soDotBien}</Badge> : <span className="font-mono text-xs">0</span>) },
            { key: "it", header: <ThInfo label={tr("Ít dữ liệu")} info={INFO.soItDuLieu} />, render: (k) => <span className="font-mono text-xs text-[var(--ink-400)]">{k.soItDuLieu}</span> },
            { key: "truoc", header: <ThInfo label={tr("Tỷ lệ nghi ngờ trước ({0} ngày)", soNgayTruoc)} info={INFO.kvTruoc} />, render: (k) => <span className="font-mono text-xs">{fmtPct(k.tlTruoc)} <span className="text-[var(--ink-400)]">({k.nnTruoc}/{k.tnTruoc})</span></span> },
            { key: "trong", header: <ThInfo label={tr("Trong kỳ loại trừ")} info={INFO.kvTrong} />, render: (k) => <span className="font-mono text-xs">{fmtPct(k.tlTrong)} <span className="text-[var(--ink-400)]">({k.nnTrong}/{k.tnTrong})</span></span> },
            { key: "chenh", header: <ThInfo label={tr("Chênh lệch (điểm %)")} info={INFO.kvChenh} />, render: (k) => <span className="font-mono text-xs font-semibold">{fmtChenh(k.chenh)}</span> },
          ]}
          rows={dongKhuVuc}
          isLoading={isLoading}
          isError={isError}
          onRetry={refetch}
          page={1}
          pageSize={Math.max(1, dongKhuVuc.length)}
          total={dongKhuVuc.length}
          onPageChange={() => {}}
          rowKey={(k) => k.khu_vuc}
          emptyText={tr("Không có dữ liệu.")}
          storageKey="survey-loai-tru-theo-doi-kv"
        />
      )}
      <div className="text-xs text-[var(--ink-400)] mt-2">
        {tr("Khu vực của KTV = khu vực có nhiều ca nhất của KTV trong 2 kỳ. \"Ít dữ liệu\" = một trong 2 kỳ có ít hơn")} {soCaToiThieu}  {tr("ca tiếp nhận (tỷ lệ chưa đáng tin). Bấm tên khu vực để xem danh sách KTV của khu vực đó.")}</div>
    </div>
  );
}
