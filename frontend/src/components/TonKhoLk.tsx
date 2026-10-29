import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import { fmtDateTime } from "../types";
import { Btn } from "./ui/Btn";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";
import { Select } from "./ui/Select";
import { useToast } from "./ui/Toast";
import { IdSerialSearchInput } from "./IdSerialSearchInput";
import { tr } from "../i18n/tr";

// Ton kho linh kien keo tu linh-kien-app (2026-10-08) - xem backend lib/tonKhoLk.ts + routes/tonKhoLk.ts. Dung o
// module "Ca thiếu linh kiện": thanh trang thai dong bo + cot "Tồn kho MB/MN" (tab Linh kien thieu) + tab "Cấu
// hình kho".

export interface TonKhoLkMeta {
  phien_ban: string | null;
  ky_tu_ngay: string | null;
  ky_den_ngay: string | null;
  so_dong: number | null;
  dong_bo_luc: string | null;
  dong_bo_boi: string | null;
  kiem_tra_luc: string | null;
  loi: string | null;
}

export interface TonKhoTongHop {
  ton_mb: number;
  ton_mn: number;
  ton_ktv: number;
}

interface KhoRow {
  ma_kho: string;
  ten_kho: string | null;
  nguon: "kho" | "ktv" | null;
  co_ktv: number;
  so_ma: number;
  tong_sl: number | null;
  nhom: "MB" | "MN" | null;
  nguoi_cap_nhat: string | null;
  ngay_cap_nhat: string | null;
}

export function fmtSl(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

function vnToday(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

export function useTonKhoMeta() {
  return useQuery({
    queryKey: ["ton-kho-lk-meta"],
    queryFn: () => api.get<{ meta: TonKhoLkMeta | null; canCauHinh: boolean }>("/ton-kho-lk/meta"),
    staleTime: 60_000,
  });
}

/** Map ma_hang -> ton MB/MN/KTV (null khi chua tai xong). */
type TonKhoTongHopPayload = { rows: ({ ma_hang: string } & TonKhoTongHop)[] };
const TON_KHO_TONG_HOP_QUERY = {
  queryKey: ["ton-kho-lk-tong-hop"],
  queryFn: () => api.get<TonKhoTongHopPayload>("/ton-kho-lk/tong-hop"),
  staleTime: 5 * 60_000,
};

function tonKhoMap(data: TonKhoTongHopPayload): Map<string, TonKhoTongHop> {
  const m = new Map<string, TonKhoTongHop>();
  for (const r of data.rows) m.set(r.ma_hang, { ton_mb: r.ton_mb, ton_mn: r.ton_mn, ton_ktv: r.ton_ktv });
  return m;
}

export function useTonKhoTongHop() {
  const q = useQuery(TON_KHO_TONG_HOP_QUERY);
  const map = useMemo(() => (q.data ? tonKhoMap(q.data) : null), [q.data]);
  return { map, isLoading: q.isLoading, isError: q.isError };
}

/** Lay map ton kho ngoai render (vd luc Xuat Excel) - dung chung cache react-query voi useTonKhoTongHop -> cung con so voi tab "Linh kiện thiếu". */
export function useLayTonKhoTongHop() {
  const qc = useQueryClient();
  return async () => tonKhoMap(await qc.fetchQuery(TON_KHO_TONG_HOP_QUERY));
}

function useInvalidateTonKho() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["ton-kho-lk-meta"] });
    qc.invalidateQueries({ queryKey: ["ton-kho-lk-tong-hop"] });
    qc.invalidateQueries({ queryKey: ["ton-kho-lk-kho"] });
  };
}

/** Dong trang thai: phien ban ton kho dang dung + nut "Đồng bộ ngay". Phien ban khong phai hom nay -> canh bao. */
/** Dong "Ke toan cap nhat ..." gon cho noi chi can xem (Ho so linh kien) - khong co nut dong bo. */
export function TonKhoCapNhatLine() {
  const meta = useTonKhoMeta().data?.meta ?? null;
  if (!meta?.phien_ban) return <span className="text-xs text-[var(--coral-500)]">{tr("Chưa có dữ liệu tồn kho từ kế toán.")}</span>;
  const cu = !meta.phien_ban.startsWith(vnToday());
  return (
    <span className={`text-xs ${cu ? "text-[var(--amber-600)] font-semibold" : "text-[var(--ink-400)]"}`}>
      {tr("Kế toán cập nhật tồn kho lúc")} {fmtDateTime(meta.phien_ban)}
      {meta.ky_tu_ngay ? " " + tr("(MISA kỳ {0}–{1})", meta.ky_tu_ngay, meta.ky_den_ngay ?? "?") : ""}
      {cu ? " " + tr("— chưa có bản hôm nay") : ""}
    </span>
  );
}

export function TonKhoSyncBar() {
  const { data } = useTonKhoMeta();
  const addToast = useToast();
  const invalidate = useInvalidateTonKho();
  const sync = useMutation({
    mutationFn: (force: boolean) => api.post<{ ok: true; changed: boolean; so_dong?: number }>(`/ton-kho-lk/sync${force ? "?force=1" : ""}`),
    onSuccess: (r) => {
      addToast(r.changed ? tr("Đã kéo tồn kho mới ({0} dòng).", fmtSl(r.so_dong)) : tr("Tồn kho đã là bản mới nhất, không có bản import mới."));
      invalidate();
    },
    onError: (err) => {
      addToast(tr("Không đồng bộ được tồn kho: {0}", err instanceof ApiError ? err.detail || err.message : String(err)));
      invalidate();
    },
  });
  const meta = data?.meta ?? null;
  const cu = !!meta?.phien_ban && !meta.phien_ban.startsWith(vnToday());

  return (
    <div className="flex items-center gap-2 flex-wrap text-xs">
      {!meta?.phien_ban ? (
        <span className="text-[var(--coral-500)] font-semibold">{tr("Chưa có dữ liệu tồn kho — bấm \"Đồng bộ tồn kho\".")}</span>
      ) : (
        <span className={cu ? "text-[var(--amber-600)] font-semibold" : "text-[var(--ink-400)]"}>
          {tr("Tồn kho MISA")}{meta.ky_tu_ngay ? " " + tr("kỳ {0}–{1}", meta.ky_tu_ngay, meta.ky_den_ngay ?? "?") : ""}  {tr("· kế toán import")} {fmtDateTime(meta.phien_ban)}
          {cu ? " " + tr("(chưa có bản hôm nay)") : ""}
          {meta.kiem_tra_luc ? " " + tr("· kiểm tra lúc {0}", fmtDateTime(meta.kiem_tra_luc)) : ""}
        </span>
      )}
      {meta?.loi && <span className="text-[var(--coral-500)]" title={meta.loi}>{tr("⚠ Lần đồng bộ gần nhất lỗi")}</span>}
      <Btn size="sm" variant="ghost" onClick={() => sync.mutate(false)} disabled={sync.isPending}>
        {sync.isPending ? tr("⏳ Đang đồng bộ…") : tr("🔄 Đồng bộ tồn kho")}
      </Btn>
    </div>
  );
}

const NHOM_OPTIONS = [
  { value: "", label: tr("Không tính") },
  { value: "MB", label: tr("Tồn kho MB") },
  { value: "MN", label: tr("Tồn kho MN") },
];

const LOC_OPTIONS = [
  { value: "kho", label: tr("Kho công ty + kho chưa khớp KTV") },
  { value: "da-tinh", label: tr("Đang tính MB/MN") },
  { value: "tat-ca", label: tr("Tất cả (gồm kho KTV)") },
];

function nguonBadge(r: KhoRow) {
  if (r.nguon === "kho") return <Badge tone="ocean">{tr("Kho công ty")}</Badge>;
  if (r.nguon === "ktv" && r.co_ktv) return <Badge tone="teal">Kho KTV</Badge>;
  if (r.nguon === "ktv") return <Badge tone="amber">{tr("Chưa khớp KTV")}</Badge>;
  return <Badge tone="gray">{tr("Không còn trong dữ liệu")}</Badge>;
}

/** Tab "Cấu hình kho": khai bao kho nao cong vao "Tồn kho MB"/"Tồn kho MN". */
export function TonKhoCauHinhTab() {
  const { data: metaData } = useTonKhoMeta();
  const canCauHinh = !!metaData?.canCauHinh;
  const addToast = useToast();
  const invalidate = useInvalidateTonKho();
  const [search, setSearch] = useState("");
  const [loc, setLoc] = useState("kho");
  const { data, isLoading } = useQuery({
    queryKey: ["ton-kho-lk-kho"],
    queryFn: () => api.get<{ rows: KhoRow[] }>("/ton-kho-lk/kho"),
  });
  const save = useMutation({
    mutationFn: ({ ma, nhom }: { ma: string; nhom: string }) => api.put(`/ton-kho-lk/kho/${encodeURIComponent(ma)}`, { nhom: nhom || null }),
    onSuccess: () => invalidate(),
    onError: (err) => addToast(tr("Không lưu được: {0}", err instanceof ApiError ? err.detail || err.message : String(err))),
  });

  const rows = data?.rows ?? [];
  const mb = rows.filter((r) => r.nhom === "MB");
  const mn = rows.filter((r) => r.nhom === "MN");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (loc === "da-tinh") return !!r.nhom;
        if (loc === "kho") return !!r.nhom || r.nguon === "kho" || r.nguon === null || (r.nguon === "ktv" && !r.co_ktv);
        return true;
      })
      .filter((r) => !q || r.ma_kho.toLowerCase().includes(q) || (r.ten_kho ?? "").toLowerCase().includes(q))
      .sort((a, b) => (a.nhom ? 0 : 1) - (b.nhom ? 0 : 1) || (a.nguon === "kho" ? 0 : 1) - (b.nguon === "kho" ? 0 : 1) || a.ma_kho.localeCompare(b.ma_kho));
  }, [rows, loc, search]);

  return (
    <Card className="p-3 mt-3">
      <div className="mb-3 flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="font-display font-bold text-sm">{tr("Cấu hình kho tính tồn MB / MN")}</div>
          <div className="text-xs text-[var(--ink-400)] mt-0.5">
            {tr("Cột \"Tồn kho MB\" = cộng tồn cuối kỳ (file MISA) của các kho gán MB; tương tự MN. Kho không gán = không tính.")}{!canCauHinh && " " + tr("Chỉ Admin / TBP DVBH được sửa.")}
          </div>
          <div className="mt-1.5"><TonKhoSyncBar /></div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={loc} onChange={setLoc} options={LOC_OPTIONS} />
          <IdSerialSearchInput value={search} onChange={setSearch} placeholder={tr("Tìm mã/tên kho…")} />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-2 mb-3 text-xs">
        <div className="rounded-lg border border-[var(--line)] p-2">
          <span className="font-semibold">{tr("Tồn kho MB")}</span> = {mb.length ? mb.map((r) => r.ma_kho).join(" + ") : <i className="text-[var(--ink-400)]">{tr("chưa gán kho nào")}</i>}
        </div>
        <div className="rounded-lg border border-[var(--line)] p-2">
          <span className="font-semibold">{tr("Tồn kho MN")}</span> = {mn.length ? mn.map((r) => r.ma_kho).join(" + ") : <i className="text-[var(--ink-400)]">{tr("chưa gán kho nào")}</i>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="dense w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
              <th className="py-2 pr-3">{tr("Mã kho")}</th>
              <th className="py-2 pr-3">{tr("Tên kho")}</th>
              <th className="py-2 pr-3">{tr("Loại")}</th>
              <th className="py-2 pr-3 text-right">{tr("Số mã hàng")}</th>
              <th className="py-2 pr-3 text-right">{tr("Tổng SL tồn")}</th>
              <th className="py-2 pr-3">{tr("Tính vào")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.ma_kho} className="border-b border-[var(--line)] last:border-0 even:bg-[var(--surface-100)]/60">
                <td className="py-1.5 pr-3 font-mono font-semibold">{r.ma_kho}</td>
                <td className="py-1.5 pr-3 text-xs">{r.ten_kho ?? "—"}</td>
                <td className="py-1.5 pr-3">{nguonBadge(r)}</td>
                <td className="py-1.5 pr-3 text-right">{fmtSl(r.so_ma)}</td>
                <td className="py-1.5 pr-3 text-right">{fmtSl(r.tong_sl)}</td>
                <td className="py-1.5 pr-3">
                  {canCauHinh ? (
                    <Select value={r.nhom ?? ""} onChange={(v) => save.mutate({ ma: r.ma_kho, nhom: v })} options={NHOM_OPTIONS} />
                  ) : r.nhom ? (
                    <Badge tone={r.nhom === "MB" ? "ocean" : "teal"}>{tr("Tồn kho")} {r.nhom}</Badge>
                  ) : (
                    <span className="text-xs text-[var(--ink-400)]">{tr("Không tính")}</span>
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[var(--ink-400)] text-sm">
                  {rows.length === 0 ? tr("Chưa có dữ liệu tồn kho — bấm \"Đồng bộ tồn kho\".") : tr("Không có kho phù hợp.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
