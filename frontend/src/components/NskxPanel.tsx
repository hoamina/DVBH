// Tab "NSKX" trong chi tiet ca (2026-11-11) - chi ca doi tac NSKX, nguoi co module "ql-nskx".
// Luong ngang (Tiep nhan -> Hoan thanh -> Danh gia loi -> Dat loi) + xac nhan Co thay / Khong thay / Khong ap dung (GS/TBP/Admin)
// + "Xem chi tiet": lich su xac nhan, don dat loi (API linh-kien-app dung CHUNG du lieu tab "Mua hang" - useLinhKienTimeline),
// linh kien sua chua tren ca. Backend: routes/qlNskx.ts GET /ca/:id, PUT /:id/loi-loc.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import { Badge, type BadgeTone } from "./ui/Badge";
import { Btn } from "./ui/Btn";
import { Card } from "./ui/Card";
import { useToast } from "./ui/Toast";
import { LuongNgangDoiTra, type MocDoiTra } from "./LuongMailPanel";
import { parseLinhKienLoi } from "./LoiLinhKienPanel";
import { fetchWithHashCache } from "../lib/staticListCache";
import { useLinhKienTimeline, linhKienTrangThaiLabel, type LinhKienOrder } from "../lib/linhKienTimeline";
import { fmtDateTime, type LinhKienRow, type LinhKienLoiItem } from "../types";
import { tr } from "../i18n/tr";

export const NSKX_DOI_TAC = ["NSKX", "[NSKX]"];
const LOAI_DE_XUAT_LOI = "HỖ TRỢ NGOÀI BẢO HÀNH TG12";
const DON_HUY = ["TN tu choi", "Tu choi", "Da huy"];
const donHuy = (o: LinhKienOrder) => DON_HUY.includes(o.trang_thai_hien_tai ?? "");

export interface LoiDaThay {
  ma_linh_kien: string;
  ten_linh_kien?: string;
  so_luong: number;
}
interface DonLoi {
  don_id: string;
  ma_lk: string;
  ten_lk: string | null;
  so_luong_de_xuat: number;
  trang_thai_hien_tai: string | null;
  ngay_tao: string;
}
interface CaNskx {
  row: {
    id: string;
    thoi_gian_cskh_tiep_nhan: string | null;
    thoi_gian_hoan_thanh: string | null;
    de_xuat_loi: "co" | "khong";
    tt_loi_loc: string;
    tt_don: string;
    thay_loi: number | null;
    ds_loi: string | null;
    ghi_chu_loi: string | null;
    nguoi_xac_nhan: string | null;
    ngay_xac_nhan: string | null;
    don_loi: string | null;
    ngay_dong_bo: string | null;
  };
  log: { thay_loi: number; ds_loi: string | null; ghi_chu: string | null; nguoi_xac_nhan: string; ngay_xac_nhan: string }[];
  duoc_xac_nhan: boolean;
}

export const TT_DON: Record<string, { label: string; tone: BadgeTone }> = {
  da_len_don: { label: tr("Đã đặt lõi"), tone: "teal" },
  chua_len_don: { label: tr("Chưa đặt lõi"), tone: "amber" },
  khong_can: { label: tr("Không cần (không thay lõi)"), tone: "gray" },
  khong_ap_dung: { label: tr("Không áp dụng"), tone: "gray" },
};
export const TT_LOI_LOC: Record<string, { label: string; tone: BadgeTone }> = {
  chua_danh_gia: { label: tr("Chưa đánh giá"), tone: "orange" },
  thay: { label: tr("Có thay lõi"), tone: "ocean" },
  khong_thay: { label: tr("Không thay lõi"), tone: "gray" },
  tu_dong_khong_thay: { label: tr("Không thay lõi (tự động)"), tone: "gray" },
  khong_ap_dung: { label: tr("Không áp dụng"), tone: "gray" },
};
const NHAN_THAY_LOI: Record<number, string> = { 1: tr("Có thay lõi"), 0: tr("Không thay lõi"), 2: tr("Không áp dụng") };

export function parseJsonArr<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
/** Linh kien co chu "lõi" (phan biet dau: "lỗi" KHONG tinh). */
export function laLoi(text: string | null | undefined): boolean {
  return (text ?? "").toLowerCase().includes("lõi");
}
export function deXuatLoi(linhKienLoi: string | null | undefined): LinhKienLoiItem[] {
  return parseLinhKienLoi(linhKienLoi).filter((p) => laLoi(p.ten_linh_kien) || laLoi(p.nhom_linh_kien));
}
const boDau = (v: string) => v.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
/** Gio VN wall-clock "YYYY-MM-DD HH:MM[:SS]" -> ISO +07:00 (luong ngang tinh khoang cach theo ISO). */
const isoVn = (s: string | null | undefined) => (s ? (s.includes("T") ? s : `${s.replace(" ", "T")}${s.length <= 10 ? "T00:00:00" : ""}+07:00`) : null);

export function NskxPanel({ caseId, linhKienLoi }: { caseId: string; linhKienLoi: string | null | undefined }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["ql-nskx", "ca", caseId],
    queryFn: () => api.get<CaNskx>(`/ql-nskx/ca/${encodeURIComponent(caseId)}`),
  });
  // Dung chung du lieu tab "Mua hang" (cung queryKey -> khong goi them API).
  const { data: lk, isLoading: lkLoading } = useLinhKienTimeline(caseId);
  const donLk = useMemo(() => (lk?.orders ?? []).filter((o) => (o.loai_de_xuat ?? "").includes(LOAI_DE_XUAT_LOI)), [lk]);
  const [moChiTiet, setMoChiTiet] = useState(false);

  if (isLoading) return <div className="text-sm text-[var(--ink-400)]">{tr("Đang tải…")}</div>;
  if (isError || !data) return <div className="text-sm text-[var(--coral-600)]">{tr("Không tải được thông tin NSKX của ca này.")}</div>;
  const r = data.row;
  const donDongBo = parseJsonArr<DonLoi>(r.don_loi);
  const donConHieuLuc = donLk.filter((o) => !donHuy(o));
  const ngayDat = donConHieuLuc.map((o) => o.ngay_tao).sort()[0] ?? donDongBo.map((d) => d.ngay_tao).sort()[0] ?? null;
  const daDanhGia = r.tt_loi_loc !== "chua_danh_gia";
  const khongCanDat = ["khong_can", "khong_ap_dung"].includes(r.tt_don);
  const moc: MocDoiTra[] = [
    { label: tr("CSKH tiếp nhận"), nhan: tr("Tiếp nhận"), at: isoVn(r.thoi_gian_cskh_tiep_nhan) },
    { label: tr("Ca hoàn thành"), nhan: tr("Hoàn thành"), at: isoVn(r.thoi_gian_hoan_thanh) },
    {
      label: tr("Đánh giá lõi: {0}", TT_LOI_LOC[r.tt_loi_loc]?.label ?? r.tt_loi_loc),
      nhan: daDanhGia ? (TT_LOI_LOC[r.tt_loi_loc]?.label ?? "") : tr("Đánh giá lõi"),
      at: isoVn(r.ngay_xac_nhan) ?? (daDanhGia ? isoVn(r.thoi_gian_hoan_thanh) : null),
      who: r.nguoi_xac_nhan ?? undefined,
    },
    {
      label: khongCanDat ? tr("Đặt lõi: không cần") : tr("Đặt lõi (đơn TG12 bên linh-kien-app)"),
      nhan: khongCanDat ? tr("Không cần đặt") : tr("Đặt lõi"),
      at: isoVn(ngayDat),
    },
  ];

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold">{tr("Đánh giá lõi lọc")}</span>
        <Badge tone={TT_LOI_LOC[r.tt_loi_loc]?.tone ?? "gray"}>{TT_LOI_LOC[r.tt_loi_loc]?.label ?? r.tt_loi_loc}</Badge>
        <Badge tone={TT_DON[r.tt_don]?.tone ?? "gray"}>{TT_DON[r.tt_don]?.label ?? r.tt_don}</Badge>
      </div>
      <LuongNgangDoiTra moc={moc} daKetThuc={khongCanDat || !!ngayDat} />

      {data.duoc_xac_nhan ? (
        <XacNhanForm
          key={`${r.ngay_xac_nhan ?? ""}`}
          caseId={caseId}
          linhKienLoi={linhKienLoi}
          hienTai={r}
          donCuaCa={lk?.orders ?? []}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["ql-nskx"] });
            toast(tr("Đã lưu xác nhận lõi lọc ca {0}", caseId));
          }}
        />
      ) : (
        <div className="text-xs text-[var(--ink-500)]">{tr("Chỉ Giám sát khu vực / TBP DVBH / Admin được xác nhận lõi lọc.")}</div>
      )}

      <div>
        <button type="button" onClick={() => setMoChiTiet((v) => !v)} className="focus-ring text-xs font-semibold text-[var(--ocean-600)] hover:underline">
          {moChiTiet ? tr("▴ Thu gọn") : tr("▾ Xem chi tiết")}
        </button>
      </div>
      {moChiTiet && (
        <>
          <Card className="p-3">
            <div className="font-semibold mb-1">{tr("Lịch sử xác nhận")}</div>
            {data.log.length === 0 ? (
              <div className="text-[var(--ink-400)]">{tr("Chưa có lần xác nhận nào.")}</div>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {data.log.map((l, i) => (
                  <li key={i} className="border-l-2 border-[var(--ocean-200,#cfe3ef)] pl-2">
                    <div>
                      <b>{NHAN_THAY_LOI[l.thay_loi] ?? l.thay_loi}</b>
                      <span className="text-xs text-[var(--ink-500)]"> · {fmtDateTime(l.ngay_xac_nhan)} · {l.nguoi_xac_nhan}</span>
                    </div>
                    {parseJsonArr<LoiDaThay>(l.ds_loi).map((x) => (
                      <div key={x.ma_linh_kien} className="text-xs">
                        <span className="font-mono">{x.ma_linh_kien}</span> {x.ten_linh_kien} ×{x.so_luong}
                      </div>
                    ))}
                    {l.ghi_chu && <div className="text-xs text-[var(--ink-500)]">{l.ghi_chu}</div>}
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card className="p-3">
            <div className="font-semibold mb-1">{tr("Thông tin đặt lõi (linh-kien-app)")}</div>
            {lkLoading ? (
              <div className="text-[var(--ink-400)]">{tr("Đang tải…")}</div>
            ) : lk && !lk.ok ? (
              <div className="text-[var(--coral-600)]">{tr("Không tải được dữ liệu linh-kien-app ({0}).", lk.error ?? "")}</div>
            ) : donLk.length === 0 ? (
              <div className="text-[var(--ink-400)]">{tr("Chưa có đơn loại “{0}…” cho ca này.", LOAI_DE_XUAT_LOI)}</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--ink-500)]">
                    <th className="py-1 pr-2">{tr("Mã đơn")}</th>
                    <th className="py-1 pr-2">{tr("Linh kiện")}</th>
                    <th className="py-1 pr-2 text-right">SL</th>
                    <th className="py-1 pr-2">{tr("Loại đề xuất")}</th>
                    <th className="py-1 pr-2">{tr("Trạng thái")}</th>
                    <th className="py-1">{tr("Ngày tạo")}</th>
                  </tr>
                </thead>
                <tbody>
                  {donLk.map((o) => (
                    <tr key={o.order_id} className="border-t border-[var(--line)]">
                      <td className="py-1 pr-2 font-mono">{o.order_id}</td>
                      <td className="py-1 pr-2">
                        <span className="font-mono">{o.ma_lk}</span> {o.ten_lk}
                      </td>
                      <td className="py-1 pr-2 text-right">{o.so_luong_de_xuat ?? "—"}</td>
                      <td className="py-1 pr-2">{o.loai_de_xuat}</td>
                      <td className="py-1 pr-2">{linhKienTrangThaiLabel(o.trang_thai_hien_tai)}</td>
                      <td className="py-1">{fmtDateTime(o.ngay_tao?.slice(0, 19).replace("T", " "))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="text-[11px] text-[var(--ink-400)] mt-1">
              {r.ngay_dong_bo
                ? tr("Trạng thái trong báo cáo theo lần đồng bộ {0}.", fmtDateTime(r.ngay_dong_bo))
                : tr("Ca chưa có trong lần đồng bộ đơn lõi lọc nào (báo cáo dùng kết quả đồng bộ).")}
            </div>
          </Card>
          <Card className="p-3">
            <div className="font-semibold mb-1">{tr("Linh kiện sửa chữa trên ca")}</div>
            {parseLinhKienLoi(linhKienLoi).length === 0 ? (
              <div className="text-[var(--ink-400)]">{tr("Ca không có báo cáo linh kiện xử lý.")}</div>
            ) : (
              parseLinhKienLoi(linhKienLoi).map((p) => (
                <div key={p.stt} className={laLoi(p.ten_linh_kien) || laLoi(p.nhom_linh_kien) ? "font-semibold text-[var(--ocean-700)]" : "text-[var(--ink-600)]"}>
                  <span className="font-mono">{p.ma_linh_kien}</span> {p.ten_linh_kien}
                  {p.cach_thuc_xu_ly ? <span className="font-normal text-[var(--ink-400)]"> — {p.cach_thuc_xu_ly}</span> : null}
                </div>
              ))
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function XacNhanForm({
  caseId,
  linhKienLoi,
  hienTai,
  donCuaCa,
  onSaved,
}: {
  caseId: string;
  linhKienLoi: string | null | undefined;
  hienTai: CaNskx["row"];
  /** Moi don linh-kien-app cua ca (cung du lieu tab Mua hang) - phan tich tren may nguoi dung, khong goi them API/D1. */
  donCuaCa: LinhKienOrder[];
  onSaved: () => void;
}) {
  const toast = useToast();
  const { data: lkData } = useQuery({
    queryKey: ["settings-linh-kien"],
    queryFn: () => fetchWithHashCache<{ rows: LinhKienRow[] }>("settings-linh-kien", "/settings/linh-kien/version", "/settings/linh-kien"),
  });
  const catalog = lkData?.rows ?? [];
  const tenTheoMa = useMemo(() => new Map(catalog.map((r) => [r.ma_linh_kien, r.ten_linh_kien])), [catalog]);
  const deXuat = useMemo(() => deXuatLoi(linhKienLoi), [linhKienLoi]);
  // Ma trong bao cao linh kien Odoo cua ca: duoc luu du chua co trong danh muc (chu he thong 2026-11-11), ten theo bao cao.
  const tenTheoBaoCao = useMemo(
    () => new Map(parseLinhKienLoi(linhKienLoi).filter((p) => p.ma_linh_kien).map((p) => [String(p.ma_linh_kien), p.ten_linh_kien ?? ""])),
    [linhKienLoi],
  );
  const TT_THEO_SO: Record<number, string> = { 1: "thay", 0: "khong_thay", 2: "khong_ap_dung" };
  const [trangThai, setTrangThai] = useState<string | null>(
    hienTai.thay_loi !== null ? TT_THEO_SO[hienTai.thay_loi] : hienTai.tt_loi_loc === "tu_dong_khong_thay" ? "khong_thay" : deXuat.length ? "thay" : null,
  );
  const [ds, setDs] = useState<LoiDaThay[]>(() => {
    const daLuu = parseJsonArr<LoiDaThay>(hienTai.ds_loi);
    if (daLuu.length) return daLuu;
    const gop = new Map<string, number>();
    for (const p of deXuat) if (p.ma_linh_kien) gop.set(p.ma_linh_kien, (gop.get(p.ma_linh_kien) ?? 0) + 1);
    return [...gop.entries()].map(([ma, so_luong]) => ({ ma_linh_kien: ma, so_luong }));
  });
  const [ghiChu, setGhiChu] = useState(hienTai.ghi_chu_loi ?? "");
  const [tim, setTim] = useState("");
  const [chiLoi, setChiLoi] = useState(true);
  // Danh sach chon loi chi mo khi bam vao o tim.
  const [moChon, setMoChon] = useState(false);
  // Don theo ma LK (bo don huy/tu choi), de hien trang thai dat hang canh tung loi + goi y loi da dat ma chua chon.
  const donTheoMa = useMemo(() => {
    const m = new Map<string, LinhKienOrder[]>();
    for (const o of donCuaCa) if (!donHuy(o)) m.set(o.ma_lk, [...(m.get(o.ma_lk) ?? []), o]);
    return m;
  }, [donCuaCa]);
  const goiYDaDat = useMemo(
    () =>
      [...donTheoMa.values()]
        .map((ds) => ds[0])
        .filter((o) => !ds.some((x) => x.ma_linh_kien === o.ma_lk) && (laLoi(o.ten_lk) || (o.loai_de_xuat ?? "").includes(LOAI_DE_XUAT_LOI))),
    [donTheoMa, ds],
  );
  const [dangLuu, setDangLuu] = useState(false);
  const ketQua = useMemo(() => {
    const q = boDau(tim.trim());
    return catalog.filter((r) => (!chiLoi || laLoi(r.ten_linh_kien)) && (!q || boDau(`${r.ma_linh_kien} ${r.ten_linh_kien}`).includes(q))).slice(0, 50);
  }, [catalog, tim, chiLoi]);
  const saiMa = ds.filter((x) => catalog.length > 0 && !tenTheoMa.has(x.ma_linh_kien) && !tenTheoBaoCao.has(x.ma_linh_kien));

  async function luu() {
    if (!trangThai) return toast(tr("Chọn Có thay / Không thay / Không áp dụng."));
    if (trangThai === "thay" && !ds.length) return toast(tr("Chọn ít nhất 1 lõi lọc đã thay."));
    if (trangThai === "thay" && saiMa.length) return toast(tr("Có mã không thuộc danh mục linh kiện — xoá và chọn lại."));
    setDangLuu(true);
    try {
      await api.put(`/ql-nskx/${encodeURIComponent(caseId)}/loi-loc`, { trang_thai: trangThai, ds_loi: trangThai === "thay" ? ds : [], ghi_chu: ghiChu });
      onSaved();
    } catch (e) {
      toast(e instanceof ApiError ? (e.detail ?? e.message) : String(e));
    } finally {
      setDangLuu(false);
    }
  }

  const LUA_CHON = [
    { v: "thay", nhan: tr("Có thay lõi") },
    { v: "khong_thay", nhan: tr("Không thay lõi") },
    { v: "khong_ap_dung", nhan: tr("Không áp dụng") },
  ];
  return (
    <Card className="p-3 flex flex-col gap-2">
      <div className="flex gap-1.5 flex-wrap">
        {LUA_CHON.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setTrangThai(o.v)}
            className={`focus-ring rounded-full border px-3 py-1 text-sm ${
              trangThai === o.v
                ? "border-[var(--ocean-500)] bg-[var(--ocean-100)] text-[var(--ocean-700)] font-semibold"
                : "border-[var(--line)] text-[var(--ink-600)] hover:border-[var(--ocean-400)]"
            }`}
          >
            {o.nhan}
          </button>
        ))}
      </div>
      {hienTai.tt_loi_loc === "tu_dong_khong_thay" && hienTai.thay_loi === null && (
        <div className="text-xs text-[var(--ink-500)]">{tr("Hệ thống đang tự tính “Không thay lõi” vì linh kiện sửa chữa không có lõi. Lưu để xác nhận hoặc đổi lại.")}</div>
      )}
      {trangThai === "thay" && (
        <>
          <div>
            <div className="font-semibold mb-1">{tr("Lõi lọc đã thay")}</div>
            {ds.length === 0 && <div className="text-[var(--ink-400)]">{tr("Chưa chọn lõi nào.")}</div>}
            {ds.map((x, i) => {
              const ten = tenTheoMa.get(x.ma_linh_kien);
              const tenBc = ten ? undefined : tenTheoBaoCao.get(x.ma_linh_kien);
              const don = donTheoMa.get(x.ma_linh_kien) ?? [];
              const tenDon = don[0]?.ten_lk;
              return (
                <div key={x.ma_linh_kien} className="flex items-center gap-2 py-1 border-b border-[var(--line)]">
                  <span className="font-mono">{x.ma_linh_kien}</span>
                  <span className="flex-1 min-w-0">
                    {tenBc !== undefined ? (
                      <span>
                        {tenBc || tenDon || x.ma_linh_kien}{" "}
                        <span className="text-[var(--ink-400)]" title={tr("Mã lấy từ báo cáo linh kiện của ca, chưa có trong danh mục linh kiện")}>
                          {tr("(theo báo cáo linh kiện của ca)")}
                        </span>
                      </span>
                    ) : (
                    <span className={ten ? "" : "text-[var(--coral-600)]"}>{ten ?? (tenDon ? `${tenDon} — ${tr("không có trong danh mục linh kiện")}` : tr("Không có trong danh mục linh kiện"))}</span>
                    )}
                    <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
                      {don.length ? (
                        don.map((o) => (
                          <span key={o.order_id} title={`${o.order_id} · ${o.loai_de_xuat ?? ""} · ${o.ngay_tao?.slice(0, 10) ?? ""}`}>
                            <Badge tone="teal">{tr("Đã đặt: {0}", linhKienTrangThaiLabel(o.trang_thai_hien_tai))}</Badge>
                          </span>
                        ))
                      ) : (
                        <Badge tone="amber">{tr("Chưa có đơn đặt mã này")}</Badge>
                      )}
                    </span>
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={x.so_luong}
                    onChange={(e) => setDs(ds.map((y, j) => (j === i ? { ...y, so_luong: Math.max(1, Number(e.target.value) || 1) } : y)))}
                    className="w-16 border border-[var(--line)] rounded px-1.5 py-0.5"
                  />
                  <button type="button" aria-label={tr("Bỏ")} className="text-[var(--coral-600)]" onClick={() => setDs(ds.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          {goiYDaDat.length > 0 && (
            <div className="rounded-lg bg-[var(--amber-100,#fff4dc)] px-2.5 py-1.5 text-xs">
              <div className="font-semibold mb-0.5">{tr("Lõi đã đặt cho ca này (linh-kien-app) nhưng chưa chọn:")}</div>
              {goiYDaDat.map((o) => (
                <div key={o.ma_lk} className="flex items-center gap-2">
                  <span className="font-mono">{o.ma_lk}</span>
                  <span className="flex-1">
                    {o.ten_lk} · {linhKienTrangThaiLabel(o.trang_thai_hien_tai)}
                  </span>
                  <button
                    type="button"
                    className="text-[var(--ocean-600)] font-semibold hover:underline"
                    onClick={() => setDs([...ds, { ma_linh_kien: o.ma_lk, so_luong: o.so_luong_de_xuat ?? 1 }])}
                  >
                    {tr("+ Thêm")}
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={tim}
              onChange={(e) => {
                setTim(e.target.value);
                setMoChon(true);
              }}
              onFocus={() => setMoChon(true)}
              onBlur={() => setTimeout(() => setMoChon(false), 150)}
              placeholder={tr("Bấm để nhập mã / tên lõi cần thêm…")}
              className="focus-ring flex-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5"
            />
            <label className="inline-flex items-center gap-1 text-xs">
              <input type="checkbox" checked={chiLoi} onChange={(e) => setChiLoi(e.target.checked)} /> {tr("Chỉ lõi lọc")}
            </label>
          </div>
          {moChon && (
          <div className="max-h-44 overflow-auto border border-[var(--line)] rounded-lg">
            {ketQua.map((r) => (
              <button
                key={r.ma_linh_kien}
                type="button"
                disabled={ds.some((x) => x.ma_linh_kien === r.ma_linh_kien)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setDs([...ds, { ma_linh_kien: r.ma_linh_kien, so_luong: 1 }]);
                  setTim("");
                }}
                className="w-full text-left px-2.5 py-1 hover:bg-[var(--ocean-100)] disabled:opacity-40 border-b border-[var(--line)] last:border-0"
              >
                <span className="font-mono">{r.ma_linh_kien}</span> {r.ten_linh_kien}
              </button>
            ))}
            {ketQua.length === 0 && <div className="px-2.5 py-2 text-[var(--ink-400)]">{tr("Không tìm thấy linh kiện.")}</div>}
          </div>
          )}
        </>
      )}
      <textarea
        value={ghiChu}
        onChange={(e) => setGhiChu(e.target.value)}
        placeholder={tr("Ghi chú (tuỳ chọn)")}
        rows={2}
        className="focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5"
      />
      <div className="flex justify-end">
        <Btn onClick={luu} loading={dangLuu}>
          {tr("Lưu xác nhận")}
        </Btn>
      </div>
    </Card>
  );
}
