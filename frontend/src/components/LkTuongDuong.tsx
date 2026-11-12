import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { fmtDateTime } from "../types";
import { Badge } from "./ui/Badge";
import { LoadingInline } from "./ui/LoadingInline";
import { fmtSl } from "./TonKhoLk";
import { tr } from "../i18n/tr";

// "Linh kiện tương đương" trong Ho so linh kien (2026-11-12, chu he thong): cac ma cung nhom thay the (keo dinh ky tu App Dat hang LK,
// backend lib/lkThayThe.ts) kem ton MB / MN / kho khac / KTV theo khu vuc - nhin 3-5 giay biet ma nao con hang, con bao nhieu, o dau.
// Bam ma -> mo ho so ma do (popup giu lich su, co nut quay lai ho so goc).

export interface LkTd {
  ma_lk: string;
  ten_lk: string | null;
  bat_tat: number | null;
  co_trong_danh_muc: number;
  ghi_chu: string | null;
  ton_mb: number;
  ton_mn: number;
  ton_kho_khac: number;
  ton_ktv: number;
  so_ktv: number;
  theo_kv: { kv: string; sl: number; so_ktv: number }[];
  kho: { ma_kho: string; ten_kho: string | null; nhom: string | null; sl: number }[];
}
interface NhomTd {
  id: number;
  ten_nhom: string | null;
  ghi_chu: string | null;
  linh_kien: LkTd[];
}
interface TdResp {
  nhom: NhomTd[];
  dong_bo: { phien_ban: string | null; dong_bo_luc: string | null; kiem_tra_luc: string | null; loi: string | null; so_nhom: number } | null;
}

export const tongTon = (l: LkTd) => l.ton_mb + l.ton_mn + l.ton_kho_khac + l.ton_ktv;

export function useLkTuongDuong(maLk: string) {
  const q = useQuery({
    queryKey: ["ton-kho-lk-tuong-duong", maLk],
    queryFn: () => api.get<TdResp>(`/ton-kho-lk/ma/${encodeURIComponent(maLk)}/tuong-duong`),
    staleTime: 5 * 60 * 1000,
  });
  // Cac ma tuong duong (khong tinh chinh ma dang xem), gop moi nhom, khong trung.
  const khac = useMemo(() => {
    const m = new Map<string, LkTd>();
    for (const n of q.data?.nhom ?? []) for (const l of n.linh_kien) if (l.ma_lk !== maLk && !m.has(l.ma_lk)) m.set(l.ma_lk, l);
    return [...m.values()];
  }, [q.data, maLk]);
  const conHang = khac.filter((l) => tongTon(l) > 0);
  const tong = {
    mb: khac.reduce((s, l) => s + l.ton_mb, 0),
    mn: khac.reduce((s, l) => s + l.ton_mn, 0),
    khac: khac.reduce((s, l) => s + l.ton_kho_khac, 0),
    ktv: khac.reduce((s, l) => s + l.ton_ktv, 0),
  };
  return { q, khac, conHang, tong };
}

/** Dai tom tat o dau ho so (view chinh) - chi hien khi ma co nhom tuong duong. */
export function TuongDuongBanner({ maLk, onXem }: { maLk: string; onXem: () => void }) {
  const { q, khac, conHang, tong } = useLkTuongDuong(maLk);
  if (q.isLoading || khac.length === 0) return null;
  const co = conHang.length > 0;
  return (
    <button
      type="button"
      onClick={onXem}
      className="focus-ring w-full text-left rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 hover:brightness-[0.98]"
      style={{
        background: co ? "var(--teal-100)" : "var(--bg)",
        borderLeft: `5px solid ${co ? "var(--teal-500)" : "var(--ink-400)"}`,
      }}
    >
      <span className="text-lg leading-none">🔁</span>
      <span className="font-display font-bold text-sm" style={{ color: co ? "var(--teal-600)" : "var(--ink-600)" }}>
        {tr("{0} mã tương đương", khac.length)}
      </span>
      <span className="text-sm text-[var(--ink-700)]">
        {co
          ? tr("{0} mã còn hàng · MB {1} · MN {2} · KTV {3}", conHang.length, fmtSl(tong.mb), fmtSl(tong.mn), fmtSl(tong.ktv))
          : tr("đều đang hết hàng")}
      </span>
      {co && (
        <span className="flex flex-wrap gap-1">
          {conHang
            .sort((a, b) => tongTon(b) - tongTon(a))
            .slice(0, 4)
            .map((l) => (
              <span key={l.ma_lk} className="rounded-md bg-white/70 px-1.5 py-[1px] text-xs font-mono font-semibold text-[var(--teal-600)]">
                {l.ma_lk} · {fmtSl(tongTon(l))}
              </span>
            ))}
        </span>
      )}
      <span className="ml-auto text-xs font-semibold text-[var(--ocean-600)]">{tr("Xem chi tiết →")}</span>
    </button>
  );
}

const TH = "py-1.5 px-2";

function SoO({ v, nhan }: { v: number; nhan?: boolean }) {
  return (
    <td className={`${TH} text-right tabular-nums ${v > 0 ? "font-bold text-[var(--ink-900)]" : "text-[var(--ink-400)]"} ${nhan ? "text-sm" : ""}`}>
      {v > 0 ? fmtSl(v) : "0"}
    </td>
  );
}

/** Tab "Linh kiện tương đương". */
export function LkTuongDuongView({ maLk, onMoMa }: { maLk: string; onMoMa?: (ma: string, ten: string | null) => void }) {
  const qc = useQueryClient();
  const { q, khac, conHang, tong } = useLkTuongDuong(maLk);
  const sync = useMutation({
    mutationFn: () => api.post("/ton-kho-lk/lk-thay-the/sync", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ton-kho-lk-tuong-duong"] }),
  });
  const db = q.data?.dong_bo;
  const chan = (
    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ink-500)]">
      <span>
        {tr("Danh sách tương đương lấy từ App Đặt hàng LK")}
        {db?.dong_bo_luc ? " · " + tr("cập nhật {0}", fmtDateTime(db.dong_bo_luc)) : ""}
        {" · " + tr("tồn kho theo file MISA mới nhất")}
      </span>
      {db?.loi && <span className="text-[var(--coral-600)]">· {tr("Lần đồng bộ gần nhất lỗi: {0}", db.loi)}</span>}
      <button
        type="button"
        disabled={sync.isPending}
        onClick={() => sync.mutate()}
        className="focus-ring ml-auto rounded-md border border-[var(--line)] px-2 py-0.5 hover:bg-[var(--surface-100)] disabled:opacity-50"
      >
        {sync.isPending ? tr("Đang đồng bộ…") : tr("↻ Đồng bộ ngay")}
      </button>
      {sync.isError && <span className="text-[var(--coral-600)]">{tr("Không đồng bộ được.")}</span>}
    </div>
  );

  if (q.isLoading) return <LoadingInline />;
  if (q.isError) return <div className="text-sm text-[var(--coral-600)]">{tr("Không tải được danh sách linh kiện tương đương.")}</div>;
  const nhom = q.data?.nhom ?? [];
  if (nhom.length === 0)
    return (
      <div className="space-y-3">
        <div className="rounded-xl bg-[var(--bg)] px-4 py-6 text-center text-sm text-[var(--ink-500)]">
          {tr("Mã {0} chưa thuộc nhóm linh kiện tương đương nào.", maLk)}
        </div>
        {chan}
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[
          { label: tr("Mã tương đương"), v: String(khac.length), sub: tr("{0} còn hàng", conHang.length), mau: conHang.length ? "teal" : "ink" },
          { label: tr("Tồn kho MB"), v: fmtSl(tong.mb), sub: tr("cộng các mã tương đương"), mau: tong.mb ? "ocean" : "ink" },
          { label: tr("Tồn kho MN"), v: fmtSl(tong.mn), sub: tr("cộng các mã tương đương"), mau: tong.mn ? "ocean" : "ink" },
          { label: tr("Kho khác"), v: fmtSl(tong.khac), sub: tr("kho chưa xếp MB/MN"), mau: tong.khac ? "ocean" : "ink" },
          { label: tr("KTV đang giữ"), v: fmtSl(tong.ktv), sub: tr("cộng các mã tương đương"), mau: tong.ktv ? "teal" : "ink" },
        ].map((x) => (
          <div
            key={x.label}
            className="rounded-lg px-3 py-2 min-w-[140px]"
            style={{
              background: x.mau === "ink" ? "var(--bg)" : `var(--${x.mau}-100)`,
              borderTop: `3px solid ${x.mau === "ink" ? "var(--line)" : `var(--${x.mau}-500)`}`,
            }}
          >
            <div className="text-[11px] text-[var(--ink-500)]">{x.label}</div>
            <div className="font-display font-bold text-lg tabular-nums" style={{ color: x.mau === "ink" ? "var(--ink-400)" : `var(--${x.mau}-600)` }}>
              {x.v}
            </div>
            <div className="text-[11px] text-[var(--ink-500)]">{x.sub}</div>
          </div>
        ))}
      </div>

      {nhom.map((n) => {
        const ds = [...n.linh_kien].sort((a, b) => Number(b.ma_lk === maLk) - Number(a.ma_lk === maLk) || tongTon(b) - tongTon(a));
        return (
          <div key={n.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden" style={{ borderLeft: "4px solid var(--teal-500)" }}>
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-[var(--line)]" style={{ background: "color-mix(in srgb, var(--teal-100) 55%, transparent)" }}>
              <span className="text-sm">🔁</span>
              <span className="font-semibold text-sm text-[var(--teal-600)]">{n.ten_nhom || tr("Nhóm #{0}", n.id)}</span>
              <span className="text-xs text-[var(--ink-500)]">{tr("{0} mã", n.linh_kien.length)}</span>
              {n.ghi_chu && <span className="text-xs text-[var(--ink-500)] italic truncate">· {n.ghi_chu}</span>}
            </div>
            <div className="overflow-auto">
              <table className="dense w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--ink-400)] uppercase border-b border-[var(--line)]">
                    <th className={TH}>{tr("Mã LK")}</th>
                    <th className={TH}>{tr("Tên linh kiện")}</th>
                    <th className={`${TH} text-right`}>{tr("Tổng còn")}</th>
                    <th className={`${TH} text-right`}>MB</th>
                    <th className={`${TH} text-right`}>MN</th>
                    <th className={`${TH} text-right`}>{tr("Kho khác")}</th>
                    <th className={`${TH} text-right`}>{tr("KTV giữ")}</th>
                    <th className={TH}>{tr("Khu vực có hàng (KTV)")}</th>
                    <th className={TH}>{tr("Kho có hàng")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ds.map((l) => {
                    const dangXem = l.ma_lk === maLk;
                    const t = tongTon(l);
                    return (
                      <tr
                        key={l.ma_lk}
                        className="border-b border-[var(--line)] last:border-0"
                        style={
                          dangXem
                            ? { background: "var(--ocean-100)" }
                            : t > 0
                              ? { background: "color-mix(in srgb, var(--teal-100) 45%, transparent)" }
                              : { color: "var(--ink-500)" }
                        }
                      >
                        <td className={`${TH} whitespace-nowrap`}>
                          {dangXem ? (
                            <span className="font-mono font-bold text-[var(--ocean-600)]">{l.ma_lk}</span>
                          ) : (
                            <button
                              type="button"
                              disabled={!onMoMa}
                              onClick={() => onMoMa?.(l.ma_lk, l.ten_lk)}
                              title={tr("Mở hồ sơ linh kiện {0}", l.ma_lk)}
                              className="focus-ring font-mono font-semibold text-[var(--ocean-600)] underline decoration-dotted underline-offset-2 hover:text-[var(--ocean-500)]"
                            >
                              {l.ma_lk}
                            </button>
                          )}
                          {dangXem && <Badge tone="ocean">{tr("đang xem")}</Badge>}
                          {l.bat_tat === 0 && <Badge tone="gray">{tr("đã tắt")}</Badge>}
                          {!l.co_trong_danh_muc && <Badge tone="gray">{tr("ngoài danh mục")}</Badge>}
                        </td>
                        <td className={`${TH} max-w-[320px]`}>
                          <div className="truncate" title={l.ten_lk ?? undefined}>{l.ten_lk ?? "—"}</div>
                          {l.ghi_chu && <div className="text-[11px] text-[var(--ink-400)] truncate">{l.ghi_chu}</div>}
                        </td>
                        <td className={`${TH} text-right tabular-nums text-sm font-bold ${t > 0 ? "text-[var(--teal-600)]" : "text-[var(--coral-500)]"}`}>
                          {t > 0 ? fmtSl(t) : tr("Hết")}
                        </td>
                        <SoO v={l.ton_mb} />
                        <SoO v={l.ton_mn} />
                        <SoO v={l.ton_kho_khac} />
                        <td className={`${TH} text-right tabular-nums whitespace-nowrap ${l.ton_ktv > 0 ? "font-bold text-[var(--ink-900)]" : "text-[var(--ink-400)]"}`}>
                          {l.ton_ktv > 0 ? `${fmtSl(l.ton_ktv)} · ${tr("{0} người", l.so_ktv)}` : "0"}
                        </td>
                        <td className={TH}>
                          <span className="flex flex-wrap gap-1">
                            {l.theo_kv.length
                              ? l.theo_kv.slice(0, 6).map((k) => (
                                  <span key={k.kv} title={tr("{0} KTV", k.so_ktv)} className="rounded-md bg-[var(--teal-100)] text-[var(--teal-600)] px-1.5 py-[1px] font-semibold whitespace-nowrap">
                                    {k.kv} {fmtSl(k.sl)}
                                  </span>
                                ))
                              : "—"}
                            {l.theo_kv.length > 6 && <span className="text-[var(--ink-400)]">+{l.theo_kv.length - 6}</span>}
                          </span>
                        </td>
                        <td className={TH}>
                          <span className="flex flex-wrap gap-1">
                            {l.kho.length
                              ? l.kho.slice(0, 4).map((k) => (
                                  <span key={k.ma_kho} title={k.ten_kho ?? k.ma_kho} className="rounded-md bg-[var(--ocean-100)] text-[var(--ocean-600)] px-1.5 py-[1px] font-semibold whitespace-nowrap">
                                    {k.nhom ? `${k.nhom} · ` : ""}{k.ma_kho} {fmtSl(k.sl)}
                                  </span>
                                ))
                              : "—"}
                            {l.kho.length > 4 && <span className="text-[var(--ink-400)]">+{l.kho.length - 4}</span>}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {chan}
    </div>
  );
}
