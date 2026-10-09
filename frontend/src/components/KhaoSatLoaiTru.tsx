import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Badge } from "./ui/Badge";
import { Btn } from "./ui/Btn";
import { Card } from "./ui/Card";
import { useToast } from "./ui/Toast";
import { LOAI_LOI_META, fmtDate, fmtDateTime, type LoaiLoi } from "../types";
import { extractMaKtv } from "../lib/ktvPhone";

// Tab "Danh sách loại trừ" - Quản lý khảo sát (2026-10-09, backend routes/survey.ts /loai-tru, migration 0128).
// TN CSKH / TBP CSKH khai bao KTV + nhom loi + khoang ngay (theo NGAY CSKH TIEP NHAN ca) khong bat buoc khao sat.
// Ca chi con nghi ngo bi loai tru -> tu roi danh sach can goi; ca con loi khac -> van can goi, loi bi loai tru hien mo.

export const LOAI_TRU_LOAI_LOI: LoaiLoi[] = ["Loi 120 phut", "Hen qua 24h", "Loi lo ke hoach", "KH hen lai"];

interface LoaiTruRow {
  id: number;
  ma_ktv: string;
  ten_ktv: string | null;
  loai_loi: LoaiLoi;
  tu_ngay: string;
  den_ngay: string;
  ghi_chu: string | null;
  nguon: "thu_cong" | "import";
  nguoi_tao: string;
  ngay_tao: string;
}

type NewRow = { ma_ktv: string; ten_ktv: string | null; loai_loi: LoaiLoi; tu_ngay: string; den_ngay: string; ghi_chu: string | null };

function homNayVN(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function hieuLuc(r: LoaiTruRow, today: string): { label: string; tone: "teal" | "ocean" | "gray" } {
  if (r.den_ngay < today) return { label: "Hết hạn", tone: "gray" };
  if (r.tu_ngay > today) return { label: "Sắp áp dụng", tone: "ocean" };
  return { label: "Đang áp dụng", tone: "teal" };
}

// Bo dau + thuong hoa de doi chieu chu nhap tay trong file Excel.
function khongDau(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

/** "120" / "Lỗi 120 phút" / "24h" / "Lỡ kế hoạch" / "LKH" / "Hẹn lại" / "Tất cả" -> danh sach loai_loi. */
function parseNhomLoi(raw: string): LoaiLoi[] | null {
  const s = khongDau(raw);
  if (!s) return null;
  if (s === "tat ca" || s === "all") return [...LOAI_TRU_LOAI_LOI];
  const out = new Set<LoaiLoi>();
  for (const part of s.split(/[,;|+]/).map((p) => p.trim()).filter(Boolean)) {
    if (part.includes("120")) out.add("Loi 120 phut");
    else if (part.includes("24")) out.add("Hen qua 24h");
    else if (part.includes("lo ke hoach") || part === "lkh" || part.includes("lo kh")) out.add("Loi lo ke hoach");
    else if (part.includes("hen lai")) out.add("KH hen lai");
    else return null;
  }
  return out.size ? [...out] : null;
}

/** Excel: Date (cellDates) | "dd/mm/yyyy" | "yyyy-mm-dd" -> "yyyy-mm-dd". */
function parseNgay(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    // xlsx cellDates tao Date o gio dia phuong trinh duyet - lay thanh phan ngay dia phuong.
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  const s = String(v ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export function KhaoSatLoaiTruTab({ kyThuatVienOptions }: { kyThuatVienOptions: string[] }) {
  const qc = useQueryClient();
  const addToast = useToast();
  const today = homNayVN();
  const { data, isLoading } = useQuery({
    queryKey: ["survey-loai-tru"],
    queryFn: () => api.get<{ rows: LoaiTruRow[]; canEdit: boolean }>("/survey/loai-tru"),
  });
  const rows = data?.rows ?? [];
  const canEdit = !!data?.canEdit;

  // ma_ktv -> ten day du (chuoi ky_thuat_vien CRM) - de chon KTV va doi chieu file import.
  const ktvByMa = useMemo(() => {
    const m = new Map<string, string>();
    for (const k of kyThuatVienOptions) {
      const ma = extractMaKtv(k);
      if (ma && !m.has(ma.toLowerCase())) m.set(ma.toLowerCase(), k);
    }
    return m;
  }, [kyThuatVienOptions]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["survey-loai-tru"] });
    qc.invalidateQueries({ queryKey: ["survey-candidates"] });
    qc.invalidateQueries({ queryKey: ["survey-counts"] });
  };

  const addMut = useMutation({
    mutationFn: (p: { rows: NewRow[]; nguon: "thu_cong" | "import" }) => api.post<{ added: number; caCapNhat: number }>("/survey/loai-tru", p),
    onSuccess: (res) => {
      addToast(`Đã thêm ${res.added} dòng loại trừ · ${res.caCapNhat} ca được cập nhật danh sách cần gọi`);
      invalidate();
    },
    onError: (e) => addToast(`Không thêm được: ${e instanceof Error ? e.message : String(e)}`),
  });
  const delMut = useMutation({
    mutationFn: (id: number) => api.delete<{ caCapNhat: number }>(`/survey/loai-tru/${id}`),
    onSuccess: (res) => {
      addToast(`Đã xóa · ${res.caCapNhat} ca được cập nhật lại danh sách cần gọi`);
      invalidate();
    },
    onError: (e) => addToast(`Không xóa được: ${e instanceof Error ? e.message : String(e)}`),
  });

  // ---- Form thu cong ----
  const [ktvInput, setKtvInput] = useState("");
  const [loaiChon, setLoaiChon] = useState<Set<LoaiLoi>>(new Set(["Loi 120 phut"]));
  const [tuNgay, setTuNgay] = useState(today);
  const [denNgay, setDenNgay] = useState(today);
  const [ghiChu, setGhiChu] = useState("");
  const ktvMa = extractMaKtv(ktvInput) ?? (ktvByMa.has(ktvInput.trim().toLowerCase()) ? ktvInput.trim() : null);
  const ktvHopLe = !!ktvMa && ktvByMa.has(ktvMa.toLowerCase());
  const formLoi = !ktvHopLe ? "Chọn KTV trong danh sách" : loaiChon.size === 0 ? "Chọn ít nhất 1 nhóm lỗi" : tuNgay > denNgay ? '"Từ ngày" sau "Đến ngày"' : null;

  function themThuCong() {
    if (formLoi || !ktvMa) return;
    const ten = ktvByMa.get(ktvMa.toLowerCase()) ?? null;
    addMut.mutate(
      {
        nguon: "thu_cong",
        rows: [...loaiChon].map((loai) => ({ ma_ktv: ktvMa, ten_ktv: ten, loai_loi: loai, tu_ngay: tuNgay, den_ngay: denNgay, ghi_chu: ghiChu.trim() || null })),
      },
      {
        onSuccess: () => {
          setKtvInput("");
          setGhiChu("");
        },
      },
    );
  }

  // ---- Import ----
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ ok: NewRow[]; loi: string[]; tenFile: string } | null>(null);

  async function taiMau() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      ["KTV", "Nhóm lỗi", "Từ ngày", "Đến ngày", "Ghi chú"],
      ["(ma.ktv) hoặc mã KTV, vd and.mn2", "120 phút", "01/10/2026", "31/10/2026", "KTV nghỉ phép"],
      ["and.mn2", "120 phút, Lỡ kế hoạch", "01/10/2026", "15/10/2026", ""],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Loai tru");
    XLSX.writeFile(wb, "mau_danh_sach_loai_tru_khao_sat.xlsx");
  }

  async function docFile(file: File) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const ok: NewRow[] = [];
    const loi: string[] = [];
    raw.forEach((r, i) => {
      const dong = i + 2;
      const get = (...keys: string[]) => {
        const k = Object.keys(r).find((h) => keys.includes(khongDau(h)));
        return k ? r[k] : "";
      };
      const ktvRaw = String(get("ktv", "ky thuat vien", "ma ktv") ?? "").trim();
      if (!ktvRaw) return; // dong trong
      const ma = extractMaKtv(ktvRaw) ?? ktvRaw.replace(/^\(|\)$/g, "").trim();
      const ten = ktvByMa.get(ma.toLowerCase());
      const loais = parseNhomLoi(String(get("nhom loi", "loai loi", "loi") ?? ""));
      const tu = parseNgay(get("tu ngay"));
      const den = parseNgay(get("den ngay"));
      if (!ten) loi.push(`Dòng ${dong}: không tìm thấy KTV "${ktvRaw}"`);
      else if (!loais) loi.push(`Dòng ${dong}: nhóm lỗi không hiểu "${String(get("nhom loi", "loai loi", "loi"))}"`);
      else if (!tu || !den) loi.push(`Dòng ${dong}: ngày không hợp lệ`);
      else if (tu > den) loi.push(`Dòng ${dong}: "Từ ngày" sau "Đến ngày"`);
      else {
        const maThat = extractMaKtv(ten) ?? ma;
        for (const loai of loais) ok.push({ ma_ktv: maThat, ten_ktv: ten, loai_loi: loai, tu_ngay: tu, den_ngay: den, ghi_chu: String(get("ghi chu") ?? "").trim() || null });
      }
    });
    setPreview({ ok, loi, tenFile: file.name });
  }

  // ---- Danh sach ----
  const [locHieuLuc, setLocHieuLuc] = useState<"con-hieu-luc" | "tat-ca">("con-hieu-luc");
  const [timKtv, setTimKtv] = useState("");
  const hienThi = rows.filter(
    (r) =>
      (locHieuLuc === "tat-ca" || r.den_ngay >= today) &&
      (!timKtv.trim() || khongDau(`${r.ma_ktv} ${r.ten_ktv ?? ""}`).includes(khongDau(timKtv))),
  );

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl px-4 py-3 text-sm bg-[var(--ocean-100)] text-[var(--ink-700)]" style={{ borderLeft: "4px solid var(--ocean-500)" }}>
        KTV + nhóm lỗi trong khoảng ngày (theo <b>ngày CSKH tiếp nhận ca</b>) sẽ <b>không bắt buộc gọi khảo sát</b>. Ca chỉ có lỗi
        bị loại trừ → tự rời danh sách cần gọi; ca còn lỗi khác → vẫn cần gọi, lỗi bị loại trừ hiện mờ kèm cảnh báo.
      </div>

      {canEdit && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="font-display font-bold text-sm mb-3">➕ Thêm thủ công</div>
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-xs font-semibold text-[var(--ink-400)]">Kỹ thuật viên</label>
                <input
                  list="loai-tru-ktv-list"
                  value={ktvInput}
                  onChange={(e) => setKtvInput(e.target.value)}
                  placeholder="Gõ mã hoặc tên KTV…"
                  className="w-full mt-1 rounded-lg border border-[var(--line)] px-3 py-2 focus-ring"
                />
                <datalist id="loai-tru-ktv-list">
                  {kyThuatVienOptions.map((k) => (
                    <option key={k} value={k} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--ink-400)]">Nhóm lỗi bỏ qua</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {LOAI_TRU_LOAI_LOI.map((l) => {
                    const on = loaiChon.has(l);
                    return (
                      <button
                        key={l}
                        type="button"
                        onClick={() => {
                          const n = new Set(loaiChon);
                          if (on) n.delete(l);
                          else n.add(l);
                          setLoaiChon(n);
                        }}
                        className={`focus-ring px-3 py-1.5 rounded-lg border text-xs font-semibold ${on ? "bg-[var(--ocean-500)] text-white border-[var(--ocean-500)]" : "border-[var(--line)] text-[var(--ink-600)] hover:bg-slate-50"}`}
                      >
                        {on ? "✓ " : ""}
                        {LOAI_LOI_META[l].label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[var(--ink-400)]">Từ ngày</label>
                  <input type="date" value={tuNgay} onChange={(e) => setTuNgay(e.target.value)} className="w-full mt-1 rounded-lg border border-[var(--line)] px-3 py-2 focus-ring" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--ink-400)]">Đến ngày</label>
                  <input type="date" value={denNgay} onChange={(e) => setDenNgay(e.target.value)} className="w-full mt-1 rounded-lg border border-[var(--line)] px-3 py-2 focus-ring" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--ink-400)]">Ghi chú (lý do)</label>
                <input value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} className="w-full mt-1 rounded-lg border border-[var(--line)] px-3 py-2 focus-ring" />
              </div>
              <div className="flex items-center gap-3">
                <Btn size="sm" onClick={themThuCong} disabled={!!formLoi || addMut.isPending}>
                  {addMut.isPending ? "Đang lưu…" : `Thêm ${loaiChon.size > 1 ? `${loaiChon.size} dòng` : ""}`}
                </Btn>
                {formLoi && ktvInput && <span className="text-xs text-[var(--coral-600)]">{formLoi}</span>}
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="font-display font-bold text-sm mb-1">📥 Import danh sách (Excel)</div>
            <div className="text-xs text-[var(--ink-400)] mb-3">
              Cột: <b>KTV</b> (mã hoặc chuỗi "(mã) …" như trên CRM) · <b>Nhóm lỗi</b> (120 phút / 24h / Lỡ kế hoạch / Hẹn lại / Tất cả — nhiều nhóm cách nhau dấu phẩy)
              · <b>Từ ngày</b> · <b>Đến ngày</b> (dd/mm/yyyy) · Ghi chú.
            </div>
            <div className="flex items-center gap-2 mb-3">
              <Btn size="sm" variant="ghost" onClick={taiMau}>
                ⬇ Tải file mẫu
              </Btn>
              <Btn size="sm" variant="subtle" onClick={() => fileRef.current?.click()}>
                📂 Chọn file…
              </Btn>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) docFile(f).catch((err) => addToast(`Không đọc được file: ${err instanceof Error ? err.message : String(err)}`));
                  e.target.value = "";
                }}
              />
            </div>
            {preview && (
              <div className="rounded-lg border border-[var(--line)] p-3 text-xs space-y-2">
                <div className="font-semibold">
                  {preview.tenFile}: <span className="text-[var(--teal-600)]">{preview.ok.length} dòng hợp lệ</span>
                  {preview.loi.length > 0 && <span className="text-[var(--coral-600)]"> · {preview.loi.length} dòng lỗi (bỏ qua)</span>}
                </div>
                {preview.loi.length > 0 && (
                  <ul className="max-h-28 overflow-auto text-[var(--coral-600)] list-disc pl-4">
                    {preview.loi.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <Btn
                    size="sm"
                    disabled={preview.ok.length === 0 || addMut.isPending}
                    onClick={() => addMut.mutate({ rows: preview.ok, nguon: "import" }, { onSuccess: () => setPreview(null) })}
                  >
                    {addMut.isPending ? "Đang import…" : `Import ${preview.ok.length} dòng`}
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => setPreview(null)}>
                    Hủy
                  </Btn>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <div className="font-display font-bold text-sm">
            Danh sách loại trừ <span className="text-[var(--ink-400)] font-normal">({hienThi.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <input value={timKtv} onChange={(e) => setTimKtv(e.target.value)} placeholder="Tìm KTV…" className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm focus-ring" />
            <div className="flex rounded-lg border border-[var(--line)] overflow-hidden text-xs font-semibold">
              {(
                [
                  ["con-hieu-luc", "Còn hiệu lực"],
                  ["tat-ca", "Tất cả"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setLocHieuLuc(k)} className={`px-2.5 py-1.5 ${locHieuLuc === k ? "bg-[var(--ocean-500)] text-white" : "text-[var(--ink-500)] hover:bg-slate-50"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="dense w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                <th className="py-2 pr-3">Kỹ thuật viên</th>
                <th className="py-2 pr-3">Nhóm lỗi</th>
                <th className="py-2 pr-3">Từ ngày</th>
                <th className="py-2 pr-3">Đến ngày</th>
                <th className="py-2 pr-3">Hiệu lực</th>
                <th className="py-2 pr-3">Ghi chú</th>
                <th className="py-2 pr-3">Tạo bởi</th>
                {canEdit && <th className="py-2 pr-3" />}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-[var(--ink-400)]">
                    Đang tải…
                  </td>
                </tr>
              )}
              {!isLoading && hienThi.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-[var(--ink-400)]">
                    Chưa có dòng loại trừ nào.
                  </td>
                </tr>
              )}
              {hienThi.map((r) => {
                const hl = hieuLuc(r, today);
                return (
                  <tr key={r.id} className={`border-b border-[var(--line)] last:border-0 ${hl.tone === "gray" ? "opacity-60" : ""}`}>
                    <td className="py-2 pr-3 text-xs">{r.ten_ktv ?? `(${r.ma_ktv})`}</td>
                    <td className="py-2 pr-3">
                      <Badge tone="ocean">{LOAI_LOI_META[r.loai_loi]?.label ?? r.loai_loi}</Badge>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(r.tu_ngay)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(r.den_ngay)}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={hl.tone}>{hl.label}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-xs">{r.ghi_chu ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs text-[var(--ink-400)]">
                      {r.nguoi_tao}
                      <div>
                        {fmtDateTime(r.ngay_tao)} · {r.nguon === "import" ? "Import" : "Thủ công"}
                      </div>
                    </td>
                    {canEdit && (
                      <td className="py-2 pr-3 text-right">
                        <Btn
                          size="sm"
                          variant="ghost"
                          disabled={delMut.isPending}
                          onClick={() => {
                            if (window.confirm(`Xóa loại trừ "${LOAI_LOI_META[r.loai_loi]?.label}" của ${r.ten_ktv ?? r.ma_ktv}?`)) delMut.mutate(r.id);
                          }}
                        >
                          🗑 Xóa
                        </Btn>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
