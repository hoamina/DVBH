import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "./ui/Card";
import { Btn } from "./ui/Btn";
import { Modal } from "./ui/Modal";
import { useToast } from "./ui/Toast";
import { api } from "../api/client";
import { describeError } from "./ImportUploader";
import { exportRowsToExcel } from "../lib/exportExcel";
import type { LuyKeRow } from "../hooks/useLuyKeChunked";

// Tab "Tốc độ theo miền" cua Bao cao luy ke (yeu cau chu he thong 2026-10-10, mau: sheet "7. TỐC ĐỘ XỬ
// LÝ THEO THÁNG CỦA DVBH THEO MIỀN"). So ca / dung han / duoi 24h tinh tu chunk luy ke (bo "KHO ĐMX") -
// CHOT voi chu he thong: chap nhan lech nhe so voi sheet cu (nguon khac). RTAT + "cuoi tuan" (ca CSKH
// tiep nhan T7/CN, RTAT = so_gio_xu_ly CRM, bo dong hong) lay tu bang luy_ke_toc_do_mien (migration 0131): tu thang autoTuThang cron 08:00 tu
// tinh, cac thang truoc Admin/TBP DVBH nhap tay.

interface TocDoMienDb {
  thang: string;
  rtat_mb_ngay: number | null;
  rtat_mn_ngay: number | null;
  so_ca_gio_mb: number | null;
  so_ca_gio_mn: number | null;
  cuoi_tuan_sla: number | null;
  cuoi_tuan_24h: number | null;
  cuoi_tuan_so_ca: number | null;
  nguon: "auto" | "tay";
  nguoi_cap_nhat: string | null;
  updated_at: string;
}

interface Counts {
  tq: number;
  dhTq: number;
  h24Tq: number;
  mb: number;
  mn: number;
  dhMb: number;
  dhMn: number;
  h24Mb: number;
  h24Mn: number;
}

interface ReportRow extends Counts {
  key: string;
  label: string;
  laNam: boolean;
  thang: string | null;
  rtatMb: number | null;
  rtatMn: number | null;
  tbMb: number | null;
  tbMn: number | null;
  tbTq: number | null;
  ctSla: number | null;
  ct24h: number | null;
  db?: TocDoMienDb;
}

const emptyCounts = (): Counts => ({ tq: 0, dhTq: 0, h24Tq: 0, mb: 0, mn: 0, dhMb: 0, dhMn: 0, h24Mb: 0, h24Mn: 0 });

// Khop mienOf() o backend/src/lib/luyKeCompute.ts.
function mienOf(khuVuc: string): "MB" | "MN" | null {
  const k = khuVuc.toLowerCase();
  if (k.includes(".mb")) return "MB";
  if (k.includes(".mn")) return "MN";
  return null;
}

const ratio = (n: number, d: number) => (d > 0 ? n / d : null);
const fmtPct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
const fmtInt = (v: number) => v.toLocaleString("vi-VN");
const fmtNum = (v: number | null, digits: number) => (v === null ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits }));

// TB RTAT (gio) = tong RTAT (ngay) x 24 / so ca. Thang tu dong: mau so = so ca CO so_gio_xu_ly (bang
// luy_ke_toc_do_mien); thang nhap tay: mau so = so ca cua mien trong luy ke (giong cong thuc sheet cu).
function tinhRtat(db: TocDoMienDb | undefined, c: Counts) {
  const rtatMb = db?.rtat_mb_ngay ?? null;
  const rtatMn = db?.rtat_mn_ngay ?? null;
  const denMb = db?.so_ca_gio_mb ?? c.mb;
  const denMn = db?.so_ca_gio_mn ?? c.mn;
  return { rtatMb, rtatMn, denMb, denMn };
}

export function LuyKeTocDoMien({ rows, canEdit }: { rows: LuyKeRow[]; canEdit: boolean }) {
  const addToast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["luy-ke-toc-do-mien"],
    queryFn: () => api.get<{ rows: TocDoMienDb[]; autoTuThang: string }>("/luy-ke/toc-do-mien"),
  });
  const autoTuThang = data?.autoTuThang ?? "2026-10";
  const [editing, setEditing] = useState<ReportRow | null>(null);

  const reportRows = useMemo<ReportRow[]>(() => {
    const dbByThang = new Map((data?.rows ?? []).map((r) => [r.thang, r]));
    const byThang = new Map<string, Counts>();
    for (const r of rows) {
      if (r.phan_loai === "KHO ĐMX") continue;
      const c = byThang.get(r.thang) ?? emptyCounts();
      const dh = r.dung_han === "Đúng hạn";
      const h24 = r.toc_do.startsWith("1.");
      c.tq += r.sl;
      if (dh) c.dhTq += r.sl;
      if (h24) c.h24Tq += r.sl;
      const mien = mienOf(r.khu_vuc);
      if (mien === "MB") {
        c.mb += r.sl;
        if (dh) c.dhMb += r.sl;
        if (h24) c.h24Mb += r.sl;
      } else if (mien === "MN") {
        c.mn += r.sl;
        if (dh) c.dhMn += r.sl;
        if (h24) c.h24Mn += r.sl;
      }
      byThang.set(r.thang, c);
    }

    const years = [...new Set([...byThang.keys()].map((t) => t.slice(0, 4)))].sort();
    const out: ReportRow[] = [];
    for (const year of years) {
      const months = [...byThang.keys()].filter((t) => t.startsWith(year)).sort();
      const yc = emptyCounts();
      let yRtatMb = 0, yRtatMn = 0, yDenMb = 0, yDenMn = 0, coRtatMb = false, coRtatMn = false;
      const monthRows: ReportRow[] = [];
      for (const thang of months) {
        const c = byThang.get(thang)!;
        for (const k of Object.keys(yc) as (keyof Counts)[]) yc[k] += c[k];
        const db = dbByThang.get(thang);
        const { rtatMb, rtatMn, denMb, denMn } = tinhRtat(db, c);
        if (rtatMb !== null) { yRtatMb += rtatMb; yDenMb += denMb; coRtatMb = true; }
        if (rtatMn !== null) { yRtatMn += rtatMn; yDenMn += denMn; coRtatMn = true; }
        const tbMb = rtatMb !== null ? ratio(rtatMb * 24, denMb) : null;
        const tbMn = rtatMn !== null ? ratio(rtatMn * 24, denMn) : null;
        const tbTq = rtatMb !== null && rtatMn !== null ? ratio((rtatMb + rtatMn) * 24, denMb + denMn) : null;
        monthRows.push({
          ...c,
          key: thang,
          label: `Tháng ${thang.slice(2, 4)}${thang.slice(5, 7)}`,
          laNam: false,
          thang,
          rtatMb,
          rtatMn,
          tbMb,
          tbMn,
          tbTq,
          ctSla: db?.cuoi_tuan_sla ?? null,
          ct24h: db?.cuoi_tuan_24h ?? null,
          db,
        });
      }
      out.push({
        ...yc,
        key: `nam-${year}`,
        label: `Năm ${year}`,
        laNam: true,
        thang: null,
        rtatMb: coRtatMb ? yRtatMb : null,
        rtatMn: coRtatMn ? yRtatMn : null,
        tbMb: coRtatMb ? ratio(yRtatMb * 24, yDenMb) : null,
        tbMn: coRtatMn ? ratio(yRtatMn * 24, yDenMn) : null,
        tbTq: coRtatMb && coRtatMn ? ratio((yRtatMb + yRtatMn) * 24, yDenMb + yDenMn) : null,
        ctSla: null,
        ct24h: null,
      });
      out.push(...monthRows);
    }
    return out;
  }, [rows, data]);

  const COLS: { key: string; header: string; get: (r: ReportRow) => string; tone?: string }[] = [
    { key: "tq", header: "Toàn quốc", get: (r) => fmtInt(r.tq) },
    { key: "dhTq", header: "Đúng hạn toàn quốc", get: (r) => fmtInt(r.dhTq) },
    { key: "h24Tq", header: "24h toàn quốc", get: (r) => fmtInt(r.h24Tq) },
    { key: "slaTq", header: "% SLA toàn quốc", get: (r) => fmtPct(ratio(r.dhTq, r.tq)), tone: "bg-fuchsia-50" },
    { key: "p24Tq", header: "% 24h toàn quốc", get: (r) => fmtPct(ratio(r.h24Tq, r.tq)), tone: "bg-fuchsia-50" },
    { key: "mb", header: "Miền Bắc", get: (r) => fmtInt(r.mb) },
    { key: "mn", header: "Miền Nam", get: (r) => fmtInt(r.mn) },
    { key: "dhMb", header: "Đúng hạn MB", get: (r) => fmtInt(r.dhMb) },
    { key: "dhMn", header: "Đúng hạn MN", get: (r) => fmtInt(r.dhMn) },
    { key: "h24Mb", header: "24h MB", get: (r) => fmtInt(r.h24Mb) },
    { key: "h24Mn", header: "24h MN", get: (r) => fmtInt(r.h24Mn) },
    { key: "slaMb", header: "% SLA MB", get: (r) => fmtPct(ratio(r.dhMb, r.mb)), tone: "bg-pink-50" },
    { key: "p24Mb", header: "% 24h MB", get: (r) => fmtPct(ratio(r.h24Mb, r.mb)), tone: "bg-pink-50" },
    { key: "slaMn", header: "% SLA MN", get: (r) => fmtPct(ratio(r.dhMn, r.mn)), tone: "bg-amber-50" },
    { key: "p24Mn", header: "% 24h MN", get: (r) => fmtPct(ratio(r.h24Mn, r.mn)), tone: "bg-amber-50" },
    { key: "rtatMb", header: "Tổng RTAT MB (ngày)", get: (r) => fmtNum(r.rtatMb, 0), tone: "bg-green-50" },
    { key: "rtatMn", header: "Tổng RTAT MN (ngày)", get: (r) => fmtNum(r.rtatMn, 0), tone: "bg-green-50" },
    { key: "tbMb", header: "TB RTAT MB (giờ)", get: (r) => fmtNum(r.tbMb, 1), tone: "bg-violet-50" },
    { key: "tbMn", header: "TB RTAT MN (giờ)", get: (r) => fmtNum(r.tbMn, 1), tone: "bg-violet-50" },
    { key: "tbTq", header: "TB RTAT TQ (giờ)", get: (r) => fmtNum(r.tbTq, 2), tone: "bg-violet-50" },
    { key: "ctSla", header: "Tốc độ SLA cuối tuần", get: (r) => fmtPct(r.ctSla), tone: "bg-purple-50" },
    { key: "ct24h", header: "Tốc độ 24h cuối tuần", get: (r) => fmtPct(r.ct24h), tone: "bg-purple-50" },
  ];

  function exportExcel() {
    const out = reportRows.map((r) => Object.fromEntries([["ky", r.label], ...COLS.map((c) => [c.key, c.get(r)])]));
    const labels = Object.fromEntries([["ky", "Không tính kho ĐMX"], ...COLS.map((c) => [c.key, c.header])]);
    void exportRowsToExcel(out, "toc_do_xu_ly_theo_mien.xlsx", "Tốc độ theo miền", labels);
  }

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
        <div>
          <div className="font-display font-bold text-sm">Tốc độ xử lý theo tháng của DVBH theo miền</div>
          <div className="text-xs text-[var(--ink-400)] mt-0.5">
            Không tính kho ĐMX. Số ca / đúng hạn / 24h tính từ dữ liệu lũy kế. RTAT và tốc độ cuối tuần (ca CSKH tiếp nhận Thứ 7/Chủ nhật) tự tính lúc 08:00 hằng ngày từ{" "}
            {`${autoTuThang.slice(5, 7)}/${autoTuThang.slice(0, 4)}`}; các tháng trước nhập tay{canEdit ? " (bấm ✎ ở cuối dòng)" : ""}.
          </div>
        </div>
        <Btn size="sm" variant="ghost" onClick={exportExcel}>
          ⬇ Xuất Excel
        </Btn>
      </div>
      <div className="overflow-x-auto">
        <table className="dense w-full text-xs whitespace-nowrap">
          <thead>
            <tr className="text-left text-[var(--ink-400)] uppercase border-b border-[var(--line)]">
              <th className="py-2 pr-3 sticky left-0 bg-[var(--surface-0,white)]">Không tính kho ĐMX</th>
              {COLS.map((c) => (
                <th key={c.key} className={`py-2 px-2 text-right whitespace-normal min-w-[64px] ${c.tone ?? ""}`}>
                  {c.header}
                </th>
              ))}
              {canEdit && <th className="py-2 px-2" />}
            </tr>
          </thead>
          <tbody>
            {reportRows.map((r) => (
              <tr key={r.key} className={`border-b border-[var(--line)] last:border-0 ${r.laNam ? "bg-cyan-100 font-bold" : "hover:bg-slate-50"}`}>
                <td className={`py-1.5 pr-3 sticky left-0 ${r.laNam ? "bg-cyan-100" : "bg-[var(--surface-0,white)]"}`}>{r.label}</td>
                {COLS.map((c) => (
                  <td key={c.key} className={`py-1.5 px-2 text-right font-mono ${r.laNam ? "" : (c.tone ?? "")}`}>
                    {c.get(r)}
                  </td>
                ))}
                {canEdit && (
                  <td className="py-1.5 px-2 text-center">
                    {r.thang && r.thang < autoTuThang && (
                      <button type="button" className="text-[var(--ocean-500)] hover:underline" title="Nhập RTAT / tốc độ cuối tuần" onClick={() => setEditing(r)}>
                        ✎
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {reportRows.length === 0 && (
              <tr>
                <td colSpan={COLS.length + 2} className="py-8 text-center text-[var(--ink-400)]">
                  Chưa có dữ liệu lũy kế.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <EditTocDoMienModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            addToast(`Đã lưu số liệu ${editing.label}.`);
            void qc.invalidateQueries({ queryKey: ["luy-ke-toc-do-mien"] });
          }}
        />
      )}
    </Card>
  );
}

function EditTocDoMienModal({ row, onClose, onSaved }: { row: ReportRow; onClose: () => void; onSaved: () => void }) {
  const addToast = useToast();
  const init = (v: number | null | undefined, pct = false) => (v === null || v === undefined ? "" : String(pct ? Math.round(v * 1000) / 10 : v));
  const [form, setForm] = useState({
    rtat_mb_ngay: init(row.db?.rtat_mb_ngay),
    rtat_mn_ngay: init(row.db?.rtat_mn_ngay),
    cuoi_tuan_sla_pct: init(row.db?.cuoi_tuan_sla, true),
    cuoi_tuan_24h_pct: init(row.db?.cuoi_tuan_24h, true),
  });
  const save = useMutation({
    mutationFn: () => {
      const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
      return api.put(`/luy-ke/toc-do-mien/${row.thang}`, {
        rtat_mb_ngay: num(form.rtat_mb_ngay),
        rtat_mn_ngay: num(form.rtat_mn_ngay),
        cuoi_tuan_sla_pct: num(form.cuoi_tuan_sla_pct),
        cuoi_tuan_24h_pct: num(form.cuoi_tuan_24h_pct),
      });
    },
    onSuccess: onSaved,
    onError: (err) => addToast(describeError(err)),
  });
  const fields: { key: keyof typeof form; label: string }[] = [
    { key: "rtat_mb_ngay", label: "Tổng RTAT Miền Bắc (ngày)" },
    { key: "rtat_mn_ngay", label: "Tổng RTAT Miền Nam (ngày)" },
    { key: "cuoi_tuan_sla_pct", label: "Tốc độ SLA cuối tuần (%)" },
    { key: "cuoi_tuan_24h_pct", label: "Tốc độ 24h cuối tuần (%)" },
  ];
  return (
    <Modal open onClose={onClose} title={`Nhập số liệu — ${row.label}`}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {fields.map((f) => (
          <div key={f.key}>
            <label className="text-xs font-semibold text-[var(--ink-400)]">{f.label}</label>
            <input
              inputMode="decimal"
              value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
        ))}
        <div className="text-[11px] text-[var(--ink-400)]">TB RTAT (giờ) tự tính = Tổng RTAT × 24 / số ca của miền trong tháng. Để trống = xoá giá trị.</div>
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" type="button" onClick={onClose}>
            Hủy
          </Btn>
          <Btn disabled={save.isPending}>{save.isPending ? "Đang lưu…" : "Lưu"}</Btn>
        </div>
      </form>
    </Modal>
  );
}
