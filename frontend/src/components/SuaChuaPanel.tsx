// Khoi "App Gửi bảo hành" trong tab "Gửi BH" cua CaseDetail (2026-11-06) - du lieu song tu he suachua
// (frontend/src/lib/suaChuaTimeline.ts). Moi don gui sua (BH-...) cua ca: buoc hien tai, 6 moc luong
// (KTV dong thung -> gui xe -> Kho nhan -> Admin BH nhan -> xu ly -> tra KTV), tung don vi (huong xu ly,
// NV sua, ket qua, phieu tra) va nhat ky day du. Ca don KTV tao tay khong co don Odoo cung hien o day.
import { useState } from "react";
import { Badge, type BadgeTone } from "./ui/Badge";
import { Card } from "./ui/Card";
import { Field } from "./ui/Field";
import { LoadingInline } from "./ui/LoadingInline";
import { MaLinhKienLink } from "./HoSoLinhKienProvider";
import { fmtDateTime } from "../types";
import { tr } from "../i18n/tr";
import { SUACHUA_APP_URL, type SuaChuaDon, type SuaChuaDonVi, type SuaChuaTimelineResult } from "../lib/suaChuaTimeline";

export function giaiDoanTone(gd: string | null | undefined): BadgeTone {
  if (!gd) return "gray";
  if (gd === "tra_ktv_da_nhan") return "teal";
  if (gd === "tra_gui_that_bai" || gd === "tra_khieu_nai_van_chuyen" || gd === "admin_can_xem_lai") return "coral";
  if (gd.startsWith("ket_thuc") || gd === "thung_nhap" || gd === "tra_ket_thuc_khong_gui") return "gray";
  if (gd === "tra_da_gui" || gd === "thung_dang_gui") return "orange";
  if (gd === "cho_chan_doan" || gd === "tra_da_duyet_ke_toan") return "ocean";
  return "amber";
}

/** Buoc "tong" cua 1 don: don chua tach -> giai doan cua thung; 1 don vi -> giai doan don vi do; nhieu don vi ->
 * don vi cham nhat chua ket thuc (hoac don vi dau tien neu tat ca da ket thuc) + "x/y hoàn tất". */
export function giaiDoanDon(d: SuaChuaDon): { code: string | null; label: string; detail: string | null } {
  if (d.don_vi.length === 0) return { code: d.giai_doan, label: d.giai_doan_label ?? d.trang_thai_cha_label ?? "—", detail: null };
  const ketThuc = (g: string) => g === "tra_ktv_da_nhan" || g.startsWith("ket_thuc") || g === "tra_ket_thuc_khong_gui";
  const mo = d.don_vi.filter((u) => !ketThuc(u.giai_doan));
  const u = mo[0] ?? d.don_vi[0];
  const xong = d.don_vi.filter((x) => x.giai_doan === "tra_ktv_da_nhan").length;
  return { code: u.giai_doan, label: u.giai_doan_label ?? u.trang_thai_label ?? u.giai_doan, detail: d.don_vi.length > 1 ? tr("{0}/{1} hoàn tất", xong, d.don_vi.length) : null };
}

function Moc({ done, label, at, desc }: { done: boolean; label: string; at: string | null; desc?: string | null }) {
  return (
    <div className="relative pl-5 pb-2 last:pb-0">
      <span className={`absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full ${done ? "bg-[var(--teal-500)]" : "bg-slate-300"}`} />
      <div className={`text-xs font-semibold ${done ? "text-[var(--ink-900)]" : "text-[var(--ink-400)]"}`}>
        {label}
        {at && <span className="ml-2 font-normal text-[var(--ink-500)]">{fmtDateTime(at)}</span>}
      </div>
      {desc && <div className="text-xs text-[var(--ink-500)] mt-0.5 whitespace-pre-line">{desc}</div>}
    </div>
  );
}

function DonViRow({ u }: { u: SuaChuaDonVi }) {
  const t = u.phieu_tra;
  return (
    <div className="rounded-xl border border-[var(--line)] px-3 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-xs font-bold">{u.id}</span>
        <Badge tone={giaiDoanTone(u.giai_doan)}>{u.giai_doan_label ?? u.giai_doan}</Badge>
        {u.that_lac && <Badge tone="coral">{tr("Thất lạc")}</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2">
        <Field label={tr("Hướng xử lý")} value={u.huong_xu_ly_label ?? "—"} />
        <Field label={tr("Loại bảo hành")} value={u.loai_bao_hanh ?? "—"} />
        {u.ma_lk_thuc_te && <Field label={tr("Linh kiện thực tế")} value={<span>{u.ten_lk_thuc_te ?? ""} (<MaLinhKienLink ma={u.ma_lk_thuc_te} ten={u.ten_lk_thuc_te} className="font-mono" />)</span>} />}
        {u.nv_sua_chua && <Field label={tr("NV sửa chữa")} value={u.nv_sua_chua} />}
        {u.ket_qua && <Field label={tr("Kết quả")} value={u.ket_qua} />}
        {u.loai_doi_tru && <Field label={tr("Loại đối trừ")} value={u.loai_doi_tru} />}
        {u.xu_ly_xac && <Field label={tr("Xử lý xác")} value={u.xu_ly_xac} />}
        {u.ly_do_tu_choi && <Field label={tr("Lý do huỷ")} value={u.ly_do_tu_choi} />}
        {t && <Field label={tr("Phiếu trả")} value={<span><span className="font-mono">{t.id}</span> · {t.trang_thai_label ?? t.trang_thai}</span>} />}
        {t?.ma_van_don && <Field label={tr("Mã vận đơn trả")} value={t.ma_van_don} />}
        {t?.ma_don_hang && <Field label={tr("Mã đơn hàng")} value={t.ma_don_hang} />}
        {t?.ma_misa && <Field label={tr("Mã MISA")} value={t.ma_misa} />}
      </div>
      {(u.ghi_chu_admin || u.ghi_chu_nv || t?.danh_gia_ktv || t?.khong_nhan_duoc_ghi_chu || t?.ly_do_tu_choi_kt) && (
        <div className="text-xs text-[var(--ink-600)] mt-2 space-y-0.5">
          {u.ghi_chu_admin && <div>{tr("Ghi chú Admin:")} {u.ghi_chu_admin}</div>}
          {u.ghi_chu_nv && <div>{tr("Ghi chú NV:")} {u.ghi_chu_nv}</div>}
          {t?.ly_do_tu_choi_kt && <div>{tr("Kế toán từ chối:")} {t.ly_do_tu_choi_kt}</div>}
          {t?.khong_nhan_duoc_ghi_chu && <div>{tr("KTV báo không nhận được:")} {t.khong_nhan_duoc_ghi_chu}</div>}
          {t?.danh_gia_ktv && <div>{tr("KTV đánh giá:")} {t.danh_gia_ktv}</div>}
        </div>
      )}
    </div>
  );
}

function DonCard({ d }: { d: SuaChuaDon }) {
  const [moLog, setMoLog] = useState(false);
  const g = d.phieu_gui;
  const gd = giaiDoanDon(d);
  const coXuLy = d.don_vi.some((u) => u.huong_xu_ly);
  const traXong = d.don_vi.length > 0 && d.don_vi.every((u) => u.giai_doan === "tra_ktv_da_nhan" || u.giai_doan.startsWith("ket_thuc"));
  const phieuTra = [...new Map(d.don_vi.filter((u) => u.phieu_tra).map((u) => [u.phieu_tra!.id, u.phieu_tra!])).values()];
  const vanChuyen = g ? [g.hinh_thuc_gui, g.don_vi_van_chuyen, g.ma_van_don ? tr("Vận đơn {0}", g.ma_van_don) : null, g.ma_xe_hoac_tai_xe].filter(Boolean).join(" · ") : null;
  const xuLy = d.don_vi
    .filter((u) => u.huong_xu_ly_label)
    .map((u) => `${d.don_vi.length > 1 ? `#${u.so_thu_tu} ` : ""}${u.huong_xu_ly_label}${u.nv_sua_chua ? ` — ${u.nv_sua_chua}` : ""}${u.ket_qua ? ` — ${u.ket_qua}` : ""}`)
    .join("\n");
  const traAt = phieuTra.map((t) => t.cap_nhat).filter(Boolean).sort().pop() ?? null;
  return (
    <Card className="p-3 border-l-4 border-l-[var(--ocean-500)]">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="font-mono text-xs font-bold">{d.id}</span>
          <Badge tone={giaiDoanTone(gd.code)} solid>{gd.label}</Badge>
          {gd.detail && <span className="text-xs text-[var(--ink-500)]">{gd.detail}</span>}
          {d.odoo_id ? <Badge tone="gray">{tr("Đơn Odoo #{0}", d.odoo_id)}</Badge> : <Badge tone="gray">{tr("Tạo trên app")}</Badge>}
        </div>
        {g && <span className="text-xs text-[var(--ink-500)]">{tr("Thùng")} <span className="font-mono">{g.id}</span></span>}
      </div>
      <div className="text-sm font-semibold">
        {d.ten_lk ?? tr("(chưa rõ linh kiện)")} {d.ma_lk && <span className="font-mono text-xs text-[var(--ink-400)]">(<MaLinhKienLink ma={d.ma_lk} ten={d.ten_lk} />)</span>}
      </div>
      <div className="text-xs text-[var(--ink-600)] mt-0.5">
        {tr("SL khai {0}", d.so_luong_khai)}
        {d.so_luong_thuc_nhan != null && " · " + tr("thực nhận {0}", d.so_luong_thuc_nhan)}
        {d.ly_do_chenh_lech_sl && ` (${d.ly_do_chenh_lech_sl})`}
        {d.loai_doi_tru_de_xuat && " · " + tr("KTV đề xuất: {0}", d.loai_doi_tru_de_xuat)}
      </div>
      {d.mo_ta_loi && <div className="text-xs text-[var(--ink-700)] mt-1">{tr("Mô tả lỗi:")} {d.mo_ta_loi}</div>}

      <div className="mt-3 ml-1 border-l-2 border-[var(--line)] pl-2">
        <Moc done={!!g} label={tr("KTV đóng thùng")} at={g?.tao_luc ?? d.tao_luc} desc={g?.ktv ? `${g.ktv}${g.ma_ktv ? ` (${g.ma_ktv})` : ""}` : null} />
        <Moc done={!!g?.gui_xe_luc} label={tr("Gửi xe về Kho")} at={g?.gui_xe_luc ?? null} desc={vanChuyen} />
        <Moc done={!!g?.kho_nhan_luc} label={tr("Kho nhận hàng")} at={g?.kho_nhan_luc ?? null} desc={[g?.kho_nhan, g?.su_co ? tr("Sự cố: {0}", g.su_co) : null].filter(Boolean).join("\n") || null} />
        <Moc done={!!g?.admin_nhan_luc} label={tr("Admin BH nhận")} at={g?.admin_nhan_luc ?? null} desc={g?.admin_nhan ?? null} />
        <Moc done={coXuLy} label={tr("Phân loại / xử lý")} at={null} desc={xuLy || null} />
        <Moc
          done={traXong}
          label={tr("Trả KTV")}
          at={traAt}
          desc={phieuTra.map((t) => `${t.id} · ${t.trang_thai_label ?? t.trang_thai}${t.ma_van_don ? ` · ${tr("Vận đơn {0}", t.ma_van_don)}` : ""}`).join("\n") || null}
        />
      </div>

      {d.don_vi.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="text-xs font-semibold text-[var(--ink-500)]">{tr("Đơn vị xử lý ({0})", d.don_vi.length)}</div>
          {d.don_vi.map((u) => (
            <DonViRow key={u.id} u={u} />
          ))}
        </div>
      )}

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
                  <span className="font-mono text-[var(--ink-400)] ml-2">{l.ma}</span>
                  {l.nguoi && <span className="ml-2 font-semibold">{l.nguoi}</span>}
                  {(l.tu || l.den) && (
                    <span className="ml-2">
                      {l.tu ?? "—"} → {l.den ?? "—"}
                    </span>
                  )}
                  {l.ghi_chu && <div className="text-[var(--ink-700)] whitespace-pre-line">{l.ghi_chu}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function SuaChuaPanel({ data, isLoading }: { data: SuaChuaTimelineResult | undefined; isLoading: boolean }) {
  if (isLoading) return <LoadingInline label={tr("App Gửi bảo hành")} className="text-sm text-[var(--ink-500)]" />;
  if (!data || !data.configured) return null;
  if (!data.ok) return <div className="text-xs text-[var(--coral-600)]">{tr("Không tải được dữ liệu từ app Gửi bảo hành ({0}).", data.error ?? "")}</div>;
  if (data.don.length === 0) return null;
  return (
    <div className="space-y-2">
      {data.don.map((d) => (
        <DonCard key={d.id} d={d} />
      ))}
      <div className="text-right">
        <a href={SUACHUA_APP_URL} target="_blank" rel="noreferrer" className="focus-ring text-xs font-semibold text-[var(--ocean-600)] hover:underline">
          {tr("Mở app Gửi bảo hành ↗")}
        </a>
      </div>
    </div>
  );
}
