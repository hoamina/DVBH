import { tr } from "../i18n/tr";
import { gt } from "../lib/banDichDuLieu";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, buildQuery } from "../api/client";
import { useQuocGiaDangXem } from "../lib/phamVi";
import { usePhReportGroups, phGroupForStation } from "../lib/phReportGroups";
import { exportRowsToExcel } from "../lib/exportExcel";
import { Card } from "./ui/Card";
import { Select } from "./ui/Select";
import { Btn } from "./ui/Btn";
import { LyDoGiaiTrinhCharts, type LyDoDong } from "./LyDoGiaiTrinhCharts";
import { shortKhuVuc, khuVucGop, soSanhNhom } from "../lib/khuVucShortLabel";
interface ReasonRow { khu_vuc: string | null; tram: string | null; ly_do: string; so_ca: number }
export function ExplanationReasonReport({ khuVuc }: { khuVuc: string }) {
  const [month, setMonth] = useState(() => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7));
  const [dim, setDim] = useState("khu_vuc");
  const [groupFilter, setGroupFilter] = useState("");
  const isPH = useQuocGiaDangXem() === "PH";
  const [groups] = usePhReportGroups();
  const q = useQuery({ queryKey: ["backlog-stats", "giai-trinh-ly-do-thang", month, khuVuc], queryFn: () => api.get<{ rows: ReasonRow[] }>(`/cases/giai-trinh-ly-do-thang${buildQuery({ thang: month, khu_vuc: khuVuc })}`) });
  const rows = useMemo(() => {
    const result = new Map<string, { nhom: string; ly_do: string; so_ca: number }>();
    for (const r of q.data?.rows ?? []) {
      const group = phGroupForStation(r.tram, groups);
      if (isPH && groupFilter && group !== groupFilter) continue;
      const nhom = isPH && dim === "nhom" ? group : dim === "tram" ? r.tram ?? tr("Chưa phân công") : r.khu_vuc ? khuVucGop(r.khu_vuc) : tr("Chưa có khu vực"); // 2026-11-20: gop ma la ve khu vuc chuan
      const key = JSON.stringify([nhom, r.ly_do]);
      const row = result.get(key) ?? { nhom, ly_do: r.ly_do, so_ca: 0 };
      row.so_ca += r.so_ca; result.set(key, row);
    }
    return [...result.values()].sort((a, b) => (dim === "khu_vuc" ? soSanhNhom(a.nhom, b.nhom) : a.nhom.localeCompare(b.nhom, "vi")) || b.so_ca - a.so_ca);
  }, [q.data, dim, isPH, groups, groupFilter]);
  const total = rows.reduce((sum, r) => sum + r.so_ca, 0);
  // 2 bieu do (2026-11-18): chia theo khu vuc (PH dang xem "Theo nhom PH" -> theo nhom), cung bo loc nhom PH voi bang.
  const theoNhomPh = isPH && dim === "nhom";
  const dongChart = useMemo<LyDoDong[]>(() => {
    const out: LyDoDong[] = [];
    for (const r of q.data?.rows ?? []) {
      const group = phGroupForStation(r.tram, groups);
      if (isPH && groupFilter && group !== groupFilter) continue;
      out.push({ nhom: theoNhomPh ? group : (r.khu_vuc ? khuVucGop(r.khu_vuc) : tr("Chưa có khu vực")), ly_do: r.ly_do, so_ca: r.so_ca });
    }
    return out;
  }, [q.data, isPH, groups, groupFilter, theoNhomPh]);
  return <Card className="p-4 mt-3">
    <div className="flex flex-wrap gap-2 items-center mb-3">
      <b>{tr("Lý do giải trình cuối cùng theo tháng")}</b>
      <input aria-label={tr("Tháng báo cáo lý do")} type="month" value={month} onChange={(e) => { if (e.target.value) setMonth(e.target.value); }} className="border rounded-lg p-1.5" />
      <Select value={dim} onChange={setDim} options={[{ value: "khu_vuc", label: tr("Theo khu vực") }, { value: "tram", label: tr("Theo trạm") }, ...(isPH ? [{ value: "nhom", label: tr("Theo nhóm PH") }] : [])]} />
      {isPH && <Select value={groupFilter} onChange={setGroupFilter} options={[{ value: "", label: tr("Tất cả nhóm PH") }, "KRF", ...groups.map((g) => g.name)]} />}
      <Btn variant="ghost" size="sm" disabled={!q.data || q.isFetching} onClick={() => exportRowsToExcel(dim === "khu_vuc" ? rows.map((r) => ({ ...r, nhom: shortKhuVuc(r.nhom) })) : rows, `ly_do_giai_trinh_${month}.xlsx`, "Data", { nhom: tr("Khu vực / Nhóm / Trạm"), ly_do: tr("Lý do cuối cùng"), so_ca: tr("Số ca") })}>{tr("⬇ Xuất Excel")}</Btn>
    </div>
    <p className="text-xs text-[var(--ink-400)] mb-3">{tr("Mỗi ca tính một lần theo giải trình cuối cùng trong tháng, gồm ca đang tồn và đã đóng; bỏ ca hủy/lưu trữ. Nhóm PH theo trạm và cài đặt cục bộ hiện tại. Không áp dụng ngày loại trừ của báo cáo tỷ lệ.")}</p>
    {q.isPending ? <p>{tr("Đang tải…")}</p> : q.isError ? <p role="alert">{tr("Không tải được báo cáo.")} <button onClick={() => void q.refetch()}>{tr("Thử lại")}</button></p> : <><LyDoGiaiTrinhCharts dong={dongChart} nhanNhom={theoNhomPh ? (x) => x : shortKhuVuc} /><div className="overflow-x-auto"><table className="dense w-full text-sm">
      <thead><tr className="text-left border-b"><th>{tr("Khu vực / Nhóm / Trạm")}</th><th>{tr("Lý do cuối cùng")}</th><th>{tr("Số ca")}</th><th>{tr("Tỷ lệ tổng")}</th></tr></thead>
      <tbody><tr className="font-bold border-b"><td>{tr("Tổng cộng")}</td><td></td><td>{total}</td><td>{total ? "100%" : "—"}</td></tr>
        {rows.map((r) => <tr key={JSON.stringify([r.nhom, r.ly_do])} className="border-b"><td className="py-2">{dim === "khu_vuc" ? shortKhuVuc(r.nhom) : r.nhom}</td><td>{gt(r.ly_do)}</td><td>{r.so_ca}</td><td>{total ? Math.round(r.so_ca / total * 1000) / 10 : 0}%</td></tr>)}
        {!rows.length && <tr><td colSpan={4} className="py-8 text-center">{tr("Không có giải trình trong tháng đã chọn.")}</td></tr>}
      </tbody></table></div></>}
  </Card>;
}
