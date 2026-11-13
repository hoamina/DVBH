// Tab "Bảo hành" cua CaseDetail (2026-11-06, vong 2) - du lieu song tu he suachua ("App Gửi bảo hành",
// frontend/src/lib/suaChuaTimeline.ts). Cung khuon the tab "Mua hàng": moi don gui sua (DH-...) la 1 the
// (linh kien, badge trang thai, ma don, luoi thong tin) + LUONG QUY TRINH tu luc KTV tao don toi khi KTV nhan lai
// (moc do suachua tinh: xong / dang cho / chua toi / loi, kem thoi diem, nguoi lam, thoi gian giua 2 moc).
// Don nhieu don vi: cac moc chung (tao don -> xac nhan SL) hien 1 lan, tu buoc phan loai tach theo tung don vi.
import { useState } from "react";
import { Badge, type BadgeTone } from "./ui/Badge";
import { Card } from "./ui/Card";
import { Field } from "./ui/Field";
import { LoadingInline } from "./ui/LoadingInline";
import { MaLinhKienLink } from "./HoSoLinhKienProvider";
import { fmtDateTime, parseDbDateTime } from "../types";
import { tr } from "../i18n/tr";
import { MoAppLink, GhiChuBox, SUACHUA_URL } from "./MoAppLink";
import { SUACHUA_APP_URL, type SuaChuaDon, type SuaChuaDonVi, type SuaChuaMoc, type SuaChuaTimelineResult } from "../lib/suaChuaTimeline";

export function giaiDoanTone(gd: string | null | undefined): BadgeTone {
  if (!gd) return "gray";
  if (gd === "tra_ktv_da_nhan") return "teal";
  if (gd === "tra_gui_that_bai" || gd === "tra_khieu_nai_van_chuyen" || gd === "admin_can_xem_lai") return "coral";
  if (gd.startsWith("ket_thuc") || gd === "thung_nhap" || gd === "tra_ket_thuc_khong_gui") return "gray";
  if (gd === "tra_da_gui" || gd === "thung_dang_gui") return "orange";
  if (gd === "cho_chan_doan" || gd === "tra_da_duyet_ke_toan") return "ocean";
  return "amber";
}

const KET_THUC = (g: string) => g === "tra_ktv_da_nhan" || g.startsWith("ket_thuc") || g === "tra_ket_thuc_khong_gui";

/** Buoc "tong" cua 1 don: chua tach -> giai doan thung; 1 don vi -> giai doan don vi; nhieu -> don vi cham nhat chua xong. */
export function giaiDoanDon(d: SuaChuaDon): { code: string | null; label: string; detail: string | null } {
  if (d.don_vi.length === 0) return { code: d.giai_doan, label: d.giai_doan_label ?? d.trang_thai_cha_label ?? "—", detail: null };
  const mo = d.don_vi.filter((u) => !KET_THUC(u.giai_doan));
  const u = mo[0] ?? d.don_vi[0];
  const xong = d.don_vi.filter((x) => x.giai_doan === "tra_ktv_da_nhan").length;
  return { code: u.giai_doan, label: u.giai_doan_label ?? u.trang_thai_label ?? u.giai_doan, detail: d.don_vi.length > 1 ? tr("{0}/{1} hoàn tất", xong, d.don_vi.length) : null };
}

function khoangThoiGian(ms: number): string {
  if (ms < 0) return "";
  const gio = ms / 3_600_000;
  if (gio < 1) return tr("{0} phút", Math.max(1, Math.round(ms / 60_000)));
  if (gio < 24) return tr("{0} giờ", Math.round(gio * 10) / 10);
  return tr("{0} ngày", Math.round((gio / 24) * 10) / 10);
}
// Gio VN local "YYYY-MM-DD[ HH:MM:SS]" (nowVN() ben suachua) - cung cach doc voi cot thoi gian D1 dvbh.
const msOf = (at: string | null) => (at ? parseDbDateTime(at.includes(":") ? at : `${at} 00:00:00`).getTime() : NaN);

const MOC_STYLE: Record<SuaChuaMoc["trang_thai"], { dot: string; text: string; icon: string }> = {
  xong: { dot: "bg-[var(--teal-500)] text-white", text: "text-[var(--ink-900)]", icon: "✓" },
  dang: { dot: "bg-[var(--amber-500)] text-white ring-4 ring-[var(--amber-500)]/20", text: "text-[var(--ink-900)]", icon: "…" },
  chua: { dot: "bg-slate-200 text-slate-400", text: "text-[var(--ink-400)]", icon: "" },
  loi: { dot: "bg-[var(--coral-500)] text-white", text: "text-[var(--coral-600)]", icon: "!" },
};

/** Luong quy trinh dang cac buoc doc. prevAt = moc truoc khoi (de tinh "+x" cho moc dau khi luong bi tach). */
export function Luong({ moc, prevAt = null }: { moc: SuaChuaMoc[]; prevAt?: string | null }) {
  let truoc = prevAt;
  return (
    <ol className="relative">
      {moc.map((m, i) => {
        const st = MOC_STYLE[m.trang_thai];
        const cach = m.at && truoc ? khoangThoiGian(msOf(m.at) - msOf(truoc)) : "";
        if (m.at) truoc = m.at;
        const last = i === moc.length - 1;
        return (
          <li key={m.key + i} className="relative pl-8 pb-3 last:pb-0">
            {!last && <span className={`absolute left-[11px] top-6 bottom-0 w-0.5 ${m.trang_thai === "xong" ? "bg-[var(--teal-500)]/50" : "bg-slate-200"}`} />}
            <span className={`absolute left-0 top-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${st.dot}`}>{st.icon}</span>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className={`text-sm font-semibold ${st.text}`}>{tr(m.label)}</span>
              {m.trang_thai === "dang" && <Badge tone="amber">{tr("Đang chờ")}</Badge>}
              {m.at && <span className="text-xs text-[var(--ink-500)]">{fmtDateTime(m.at)}</span>}
              {cach && <span className="text-[11px] text-[var(--ink-400)]">(+{cach})</span>}
            </div>
            {m.nguoi && <div className="text-sm font-medium text-[var(--ink-700)] mt-0.5">👤 {m.nguoi}</div>}
            {m.ghi_chu && <GhiChuBox className="mt-1">{m.ghi_chu}</GhiChuBox>}
          </li>
        );
      })}
    </ol>
  );
}

export const MOC_CHUNG = new Set(["tao_don", "gui_xe", "kho_nhan", "admin_nhan", "xac_nhan_sl"]);

// Nhan ngan cho luong ngang (key on dinh do suachua tinh, lib/partnerCaseFlow.ts). Key la -> dung nhan day du.
const NHAN_NGAN: Record<string, string> = {
  tao_don: "Tạo đơn",
  gui_xe: "Gửi xe",
  kho_nhan: "Kho nhận",
  admin_nhan: "Admin nhận",
  xac_nhan_sl: "Xác nhận SL",
  phan_loai: "Phân loại",
  sua_chua: "Sửa chữa",
  admin_xac_nhan: "Admin XN",
  phieu_tra: "Phiếu trả",
  ke_toan: "KT duyệt",
  kho_gui: "Kho gửi",
  ktv_nhan: "KTV nhận",
};

/** "YYYY-MM-DD HH:MM[:SS]" -> "dd/mm HH:mm" (gio VN local, khong doi mui gio). */
function ngayNgan(at: string | null): string {
  if (!at) return "";
  const m = at.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return at;
  return `${m[3]}/${m[2]}${m[4] ? ` ${m[4]}:${m[5]}` : ""}`;
}

/** Luong NGANG gon (mac dinh): 1 duong thang cac buoc, nhan ngan + ngay gio; buoc dang cho to noi. Re chuot xem day du. */
export function LuongNgang({ moc }: { moc: SuaChuaMoc[] }) {
  return (
    <div className="overflow-x-auto pb-1 min-w-0">
      <ol className="flex min-w-max items-start">
        {moc.map((m, i) => {
          const st = MOC_STYLE[m.trang_thai];
          const den = m.trang_thai !== "chua";
          const title = [tr(m.label), m.at ? fmtDateTime(m.at) : null, m.nguoi, m.ghi_chu].filter(Boolean).join("\n");
          const nhan = m.trang_thai === "loi" || !NHAN_NGAN[m.key] ? tr(m.label) : tr(NHAN_NGAN[m.key]);
          return (
            <li key={m.key + i} className="relative flex flex-col items-center w-[76px] shrink-0" title={title}>
              {i > 0 && <span className={`absolute top-[9px] right-1/2 w-full h-0.5 ${den ? "bg-[var(--teal-500)]" : "bg-slate-200"}`} />}
              <span className={`relative z-10 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${st.dot}`}>{st.icon}</span>
              <span className={`mt-1 text-[11px] leading-tight text-center px-0.5 ${m.trang_thai === "dang" ? "font-bold text-[var(--amber-600)]" : st.text}`}>{nhan}</span>
              {m.at && <span className="text-[10px] text-[var(--ink-400)] leading-tight">{ngayNgan(m.at)}</span>}
            </li>
          );
        })}
      </ol>
      {/* Ghi chu cua cac buoc da toi (huong xu ly, ket qua, van don, ly do...) hien luon - khong bat re chuot moi thay. */}
      {moc.some((m) => m.ghi_chu && m.trang_thai !== "chua") && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {moc
            .filter((m) => m.ghi_chu && m.trang_thai !== "chua")
            .map((m, i) => (
              <span key={m.key + i} className="rounded-md border-l-4 border-[var(--amber-500)] bg-[var(--amber-100)] px-2 py-0.5 text-[13px] text-[var(--ink-900)]">
                <span className="font-semibold">{tr(NHAN_NGAN[m.key] ?? m.label)}:</span> {m.ghi_chu}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

function DonViChiTiet({ u }: { u: SuaChuaDonVi }) {
  const t = u.phieu_tra;
  const fields: [string, React.ReactNode][] = [];
  if (u.loai_bao_hanh) fields.push([tr("Loại bảo hành"), u.loai_bao_hanh]);
  if (u.ma_lk_thuc_te) fields.push([tr("Linh kiện thực tế"), <span key="lk">{u.ten_lk_thuc_te ?? ""} (<MaLinhKienLink ma={u.ma_lk_thuc_te} ten={u.ten_lk_thuc_te} className="font-mono" />)</span>]);
  if (u.loai_doi_tru) fields.push([tr("Loại đối trừ"), u.loai_doi_tru]);
  if (u.xu_ly_xac) fields.push([tr("Xử lý xác"), u.xu_ly_xac]);
  if (t) fields.push([tr("Phiếu trả"), <span key="tra"><MoAppLink base={SUACHUA_URL} id={t.id} /> · {t.trang_thai_label ?? t.trang_thai}</span>]);
  if (t?.ma_van_don) fields.push([tr("Mã vận đơn trả"), t.ma_van_don]);
  if (t?.ma_don_hang) fields.push([tr("Mã đơn hàng"), t.ma_don_hang]);
  if (t?.ma_misa) fields.push([tr("Mã MISA"), t.ma_misa]);
  const notes = [
    [tr("Ghi chú Admin:"), u.ghi_chu_admin],
    [tr("Ghi chú NV:"), u.ghi_chu_nv],
    [tr("Kế toán từ chối:"), t?.ly_do_tu_choi_kt],
    [tr("KTV báo không nhận được:"), t?.khong_nhan_duoc_ghi_chu],
    [tr("KTV đánh giá:"), t?.danh_gia_ktv],
  ].filter((x): x is [string, string] => !!x[1]);
  if (fields.length === 0 && notes.length === 0) return null;
  return (
    <div className="mt-2 pt-2 border-t border-dashed border-[var(--line)]">
      {fields.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-[var(--ink-600)]">
          {fields.map(([l, v]) => (
            <Field key={l} label={l} value={v} />
          ))}
        </div>
      )}
      {notes.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {notes.map(([l, v]) => (
            <GhiChuBox key={l} label={l}>{v}</GhiChuBox>
          ))}
        </div>
      )}
    </div>
  );
}

function DonCard({ d }: { d: SuaChuaDon }) {
  const [moLog, setMoLog] = useState(false);
  const [moRong, setMoRong] = useState(false);
  const g = d.phieu_gui;
  const gd = giaiDoanDon(d);
  const nhieu = d.don_vi.length > 1;
  const luongChung = (d.don_vi[0]?.luong ?? d.luong ?? []).filter((m) => !nhieu || MOC_CHUNG.has(m.key));
  const lastChungAt = [...luongChung].reverse().find((m) => m.at)?.at ?? null;
  const huong = [...new Set(d.don_vi.map((u) => u.huong_xu_ly_label).filter(Boolean))].join(", ");
  // Tong thoi gian: tu luc tao don toi moc cuoi da xong (don da ket thuc) hoac toi bay gio (dang xu ly).
  const tatCaMoc = d.don_vi.length ? d.don_vi.flatMap((u) => u.luong ?? []) : (d.luong ?? []);
  const xongHet = d.don_vi.length > 0 && d.don_vi.every((u) => KET_THUC(u.giai_doan));
  const cuoi = tatCaMoc.filter((m) => m.at).map((m) => m.at!).sort().pop() ?? null;
  const tongMs = d.tao_luc ? (xongHet && cuoi ? msOf(cuoi) : Date.now()) - msOf(d.tao_luc) : NaN;
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1.5">
        <span className="font-semibold text-sm">{d.ten_lk || d.ma_lk || tr("(chưa rõ linh kiện)")}</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge tone="gray">{d.odoo_id ? tr("Đơn Odoo #{0}", d.odoo_id) : tr("Tạo trên app")}</Badge>
          <Badge tone={giaiDoanTone(gd.code)}>{gd.label}</Badge>
          {gd.detail && <span className="text-xs text-[var(--ink-500)]">{gd.detail}</span>}
        </div>
      </div>
      <div className="text-xs text-[var(--ink-400)] font-mono mb-2">
        <MoAppLink base={SUACHUA_URL} id={d.id} title={tr("Mở đơn trên app Gửi bảo hành")} />
        {g && (
          <>
            {" · "}
            {tr("Thùng")} <MoAppLink base={SUACHUA_URL} id={g.id} title={tr("Mở thùng gửi trên app Gửi bảo hành")} />
          </>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-[var(--ink-600)]">
        <Field label={tr("Mã linh kiện")} value={d.ma_lk ? <MaLinhKienLink ma={d.ma_lk} ten={d.ten_lk} /> : "—"} />
        <Field label={tr("SL khai / thực nhận")} value={`${d.so_luong_khai ?? "—"} / ${d.so_luong_thuc_nhan ?? "—"}${d.ly_do_chenh_lech_sl ? ` (${d.ly_do_chenh_lech_sl})` : ""}`} />
        <Field label={tr("KTV gửi")} value={g?.ktv ? `${g.ktv}${g.ma_ktv ? ` (${g.ma_ktv})` : ""}` : "—"} />
        <Field label={tr("Ngày tạo")} value={fmtDateTime(d.tao_luc)} />
        <Field label={tr("Hướng xử lý")} value={huong || "—"} />
        <Field label={xongHet ? tr("Tổng thời gian xử lý") : tr("Đã xử lý được")} value={Number.isFinite(tongMs) ? khoangThoiGian(tongMs) : "—"} />
        {d.loai_doi_tru_de_xuat && <Field label={tr("KTV đề xuất")} value={d.loai_doi_tru_de_xuat} />}
        {g?.su_co && <Field label={tr("Sự cố tiếp nhận")} value={g.su_co} />}
      </div>
      {d.mo_ta_loi && (
        <div className="text-xs mt-2 px-2.5 py-1.5 rounded-lg bg-[var(--coral-100,#fdecec)] text-[var(--ink-800)]">
          <span className="font-semibold">{tr("Lỗi:")}</span> {d.mo_ta_loi}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-[var(--line)]">
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="text-xs font-semibold text-[var(--ink-500)]">{tr("Luồng quy trình bảo hành")}</div>
          <button type="button" className="focus-ring text-xs font-semibold text-[var(--ocean-600)] hover:underline shrink-0" onClick={() => setMoRong((v) => !v)}>
            {moRong ? tr("▴ Thu gọn") : tr("▾ Xem chi tiết")}
          </button>
        </div>
        {!moRong &&
          (nhieu ? (
            <div className="space-y-2">
              {d.don_vi.map((u) => (
                <div key={u.id} className="flex items-start gap-2">
                  <span className="text-[11px] font-bold w-9 shrink-0 pt-0.5">
                    <MoAppLink base={SUACHUA_URL} id={u.id} title={u.id}>#{u.so_thu_tu}</MoAppLink>
                  </span>
                  <LuongNgang moc={u.luong ?? []} />
                </div>
              ))}
            </div>
          ) : (
            <LuongNgang moc={d.don_vi[0]?.luong ?? d.luong ?? []} />
          ))}
        {moRong && (
          <>
            <Luong moc={luongChung} />
            {nhieu &&
              d.don_vi.map((u) => (
                <div key={u.id} className="mt-3 ml-3 pl-3 border-l-2 border-[var(--ocean-500)]/30">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="text-xs font-bold text-[var(--ink-700)]">{tr("Đơn vị #{0}", u.so_thu_tu)}</span>
                    <span className="text-[11px]"><MoAppLink base={SUACHUA_URL} id={u.id} /></span>
                    <Badge tone={giaiDoanTone(u.giai_doan)}>{u.giai_doan_label ?? u.giai_doan}</Badge>
                    {u.that_lac && <Badge tone="coral">{tr("Thất lạc")}</Badge>}
                  </div>
                  <Luong moc={(u.luong ?? []).filter((m) => !MOC_CHUNG.has(m.key))} prevAt={lastChungAt} />
                  <DonViChiTiet u={u} />
                </div>
              ))}
            {!nhieu && d.don_vi[0] && <DonViChiTiet u={d.don_vi[0]} />}
            {d.timeline.length > 0 && (
              <div className="mt-3">
                <button type="button" className="focus-ring text-xs font-semibold text-[var(--ocean-600)] hover:underline" onClick={() => setMoLog((v) => !v)}>
                  {moLog ? tr("▾ Ẩn nhật ký") : tr("▸ Nhật ký ({0})", d.timeline.length)}
                </button>
                {moLog && (
                  <div className="mt-1.5 space-y-1">
                    {d.timeline.map((l, i) => (
                      <div key={i} className="text-xs border-b border-[var(--line)] last:border-0 py-1">
                        <span className="text-[var(--ink-500)]">{fmtDateTime(l.at)}</span>
                        <span className="ml-2"><MoAppLink base={SUACHUA_URL} id={l.ma} /></span>
                        {l.nguoi && <span className="ml-2 font-semibold">{l.nguoi}</span>}
                        {(l.tu || l.den) && l.tu !== l.den && (
                          <span className="ml-2">
                            {l.tu ?? "—"} → {l.den ?? "—"}
                          </span>
                        )}
                        {l.ghi_chu && <div className="text-sm text-[var(--ink-900)] whitespace-pre-line mt-0.5">{l.ghi_chu}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

export function SuaChuaPanel({ data, isLoading }: { data: SuaChuaTimelineResult | undefined; isLoading: boolean }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-[var(--ink-500)]">{tr("App Gửi bảo hành")}</div>
        <a href={SUACHUA_APP_URL} target="_blank" rel="noreferrer" className="focus-ring text-xs font-semibold text-[var(--ocean-600)] hover:underline">
          {tr("Mở app Gửi bảo hành ↗")}
        </a>
      </div>
      {isLoading && <LoadingInline label={tr("App Gửi bảo hành")} className="text-sm text-[var(--ink-500)]" />}
      {!isLoading && data && !data.configured && <div className="text-xs text-[var(--ink-400)] italic">{tr("Chưa cấu hình kết nối app Gửi bảo hành.")}</div>}
      {!isLoading && data?.configured && !data.ok && <div className="text-xs text-[var(--coral-600)]">{tr("Không tải được dữ liệu từ app Gửi bảo hành ({0}).", data.error ?? "")}</div>}
      {!isLoading && data?.ok && data.don.length === 0 && <div className="text-sm text-[var(--ink-400)] italic">{tr("Không có đơn gửi bảo hành nào gắn với ca này.")}</div>}
      <div className="space-y-3">
        {(data?.ok ? data.don : []).map((d) => (
          <DonCard key={d.id} d={d} />
        ))}
      </div>
    </div>
  );
}
