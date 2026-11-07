import { useState } from "react";
import { tr } from "../i18n/tr";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";
import { Field } from "./ui/Field";
import { fmtDate, fmtDateTime, fmtVND, type CaseRow } from "../types";
import { shortKhuVuc } from "../lib/khuVucShortLabel";
import {
  cungKhuVuc,
  hienBaoHanhNhaMay,
  hienHaiLong,
  hienTuongChiMotPhia,
  laKhongHaiLong,
  nhanCuocGoi,
  nhanLyDoDanhGia,
  parseJsonObject,
  type BaoHanhNhaMay,
  type HienTuongOdoo,
  type KhaoSatOdoo,
  type KtvOdoo,
  type PhiOdoo,
  type SlaOdoo,
  type ThongSoNuoc,
} from "../lib/odooBoSung";

/**
 * Cac manh hien thi 7 nhom thong tin bo sung tu Odoo (migration 0155) - CaseDetail gan vao DUNG vung lien quan
 * (khong them tab): KTV -> duoi "KTV triển khai"; SLA -> vung "Thời hạn và SLA"; Hiện tượng lỗi -> tab Xử lý;
 * Thu phí -> muc Doanh thu; BH nhà máy -> Phân loại & nguồn gốc; Thông số nước -> dau tab Lỗi; Khảo sát -> tab
 * Khảo sát. Moi manh tra ve null khi ca khong co du lieu (ca QuickSight / Odoo chua nhap) - khong hien "—".
 * Mau do (coral) CHI cho trang thai can xu ly: check-in lech > 200m, KH không hài lòng, trễ SLA, KTV chưa nhận
 * việc khi ca con mo, lech khu vuc DVBH/Odoo.
 */

const muted = "text-[11px] font-normal text-[var(--ink-500)]";
const so = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });

// Duoi "KTV triển khai" (tab Cơ bản): nhan viec / check-in (bam de xem danh sach) / ly do tra viec.
export function KtvOdooStatus({ c }: { c: CaseRow }) {
  const k = parseJsonObject<KtvOdoo>(c.ktv_odoo);
  const [mo, setMo] = useState(false);
  if (!k) return null;
  const ck = k.checkin ?? [];
  const lech = ck.filter((x) => x.lech_tren_200m);
  const dangMo = !c.thoi_gian_hoan_thanh;
  return (
    <div className="mt-1 space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        {k.da_nhan_viec ? (
          <Badge tone="teal">{tr("✓ Đã nhận việc")}</Badge>
        ) : (
          <Badge tone={dangMo ? "coral" : "gray"}>{tr("Chưa xác nhận nhận việc")}</Badge>
        )}
        {ck.length > 0 && (
          <button type="button" onClick={() => setMo((v) => !v)} className="focus-ring rounded" title={tr("Xem chi tiết check-in")}>
            <Badge tone={lech.length > 0 ? "coral" : "gray"}>
              📍 {tr("Check-in {0} lần", ck.length)}
              {lech.length > 0 && ` · ${tr("lệch > 200m")}`} {mo ? "▴" : "▾"}
            </Badge>
          </button>
        )}
      </div>
      {mo && ck.length > 0 && (
        <ul className={`${muted} space-y-0.5`} title={tr("Lệch = khoảng cách giữa vị trí GPS và vị trí theo mạng lúc check-in")}>
          {ck.map((x, i) => (
            <li key={i}>
              {fmtDateTime(x.thoi_diem)} · {x.ktv ?? "—"} · {tr("lệch {0}m", x.lech_m)}
              {x.so_anh > 0 && ` · ${tr("{0} ảnh selfie", x.so_anh)}`}
              {x.lech_tren_200m && (
                <>
                  {" "}
                  <Badge tone="coral">{tr("Lệch > 200m")}</Badge>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {k.ly_do_tra_viec && (
        <div className={muted}>
          {tr("Lý do trả việc:")} {k.ly_do_tra_viec}
        </div>
      )}
    </div>
  );
}

// Dong "SLA Odoo" trong vung "Thời hạn và SLA" (tab Cơ bản).
export function SlaOdooLine({ c }: { c: CaseRow }) {
  const s = parseJsonObject<SlaOdoo>(c.sla_odoo);
  if (!s) return null;
  const kvDvbh = shortKhuVuc(c.khu_vuc);
  const lechKv = !cungKhuVuc(kvDvbh, s.khu_vuc);
  const tre = s.tre_khi_dong || !!s.qua_sla_luc;
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {s.khu_vuc_sla && <span>{s.khu_vuc_sla}</span>}
      {s.sla_gio != null && <span>· {s.sla_gio}h</span>}
      {s.han && <span>· {tr("hạn")} {fmtDateTime(s.han)}</span>}
      {tre ? (
        <Badge tone="coral">
          {s.so_gio_tre ? tr("Trễ SLA {0}h", so(s.so_gio_tre)) : tr("Quá SLA")}
          {s.qua_sla_luc && !s.so_gio_tre ? ` ${fmtDateTime(s.qua_sla_luc)}` : ""}
        </Badge>
      ) : (
        c.thoi_gian_hoan_thanh && s.han && <Badge tone="teal">{tr("Kịp SLA")}</Badge>
      )}
      {s.so_ngay_xu_ly != null && c.thoi_gian_hoan_thanh && <span className="text-[var(--ink-500)]">· {tr("xử lý {0} ngày", so(s.so_ngay_xu_ly))}</span>}
      {/* Khu vuc Odoo chi hien khi KHAC khu vuc DVBH (giong nhau thi da thay o dong "Khu vực" phia tren) */}
      {lechKv && (
        <span title={tr("Khu vực DVBH khác khu vực trên Odoo")}>
          <Badge tone="amber">{tr("Odoo: {0} ≠ DVBH: {1}", s.khu_vuc ?? "", kvDvbh)}</Badge>
        </span>
      )}
    </div>
  );
}

export function coSlaOdoo(c: CaseRow): boolean {
  return !!parseJsonObject<SlaOdoo>(c.sla_odoo);
}

// "Hiện tượng lỗi" (tab Xử lý): KH báo vs KTV xác định - hien tuong chi co o 1 phia to vang.
export function HienTuongOdooValue({ c }: { c: CaseRow }) {
  const h = parseJsonObject<HienTuongOdoo>(c.hien_tuong_odoo);
  if (!h) return null;
  const khac1 = hienTuongChiMotPhia(h.kh_bao, h.ktv_xac_dinh);
  const khac2 = hienTuongChiMotPhia(h.ktv_xac_dinh, h.kh_bao);
  const dong = (nhan: string, ds: string[] | undefined, khac: Set<string>) => (
    <div className="flex items-start gap-2">
      <span className={`${muted} w-24 shrink-0 pt-0.5`}>{nhan}</span>
      <span className="flex flex-wrap gap-1">
        {(ds ?? []).length > 0 ? (ds ?? []).map((x) => (
          <Badge key={x} tone={khac.has(x) ? "amber" : "gray"}>
            {x}
          </Badge>
        )) : <span className={muted}>—</span>}
      </span>
    </div>
  );
  return (
    <div className="space-y-1">
      {dong(tr("KH báo"), h.kh_bao, khac1)}
      {dong(tr("KTV xác định"), h.ktv_xac_dinh, khac2)}
    </div>
  );
}

export function coHienTuongOdoo(c: CaseRow): boolean {
  return !!parseJsonObject<HienTuongOdoo>(c.hien_tuong_odoo);
}

// Dong thu phi (muc "Doanh thu" - tab Bổ sung).
export function PhiOdooLine({ c }: { c: CaseRow }) {
  const p = parseJsonObject<PhiOdoo>(c.phi_odoo);
  if (!p) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <Badge tone="gray">{p.mat_phi ? tr("Mất phí") : tr("Không thu phí")}</Badge>
      {p.ly_do_khong_thu_phi && <span>{p.ly_do_khong_thu_phi}</span>}
      {p.da_thu != null && <span>· {tr("Đã thu")} {fmtVND(p.da_thu)}</span>}
      {p.da_nhap_thu_tien && <Badge tone="teal">{tr("Đã nhập thu tiền")}</Badge>}
    </div>
  );
}

export function coPhiOdoo(c: CaseRow): boolean {
  return !!parseJsonObject<PhiOdoo>(c.phi_odoo);
}

// "Bảo hành nhà máy" (muc Phân loại & nguồn gốc - tab Bổ sung).
export function BaoHanhNhaMayField({ c }: { c: CaseRow }) {
  const b = parseJsonObject<BaoHanhNhaMay>(c.bao_hanh_nha_may);
  if (!b) return null;
  const tt = hienBaoHanhNhaMay(b.trang_thai);
  const phu = [b.ma && `${tr("Mã")} ${b.ma}`, b.ngay_xuat_kho && `${tr("xuất kho")} ${fmtDate(b.ngay_xuat_kho)}`].filter(Boolean).join(" · ");
  return (
    <div className="col-span-2">
      <Field
        label={tr("Bảo hành nhà máy")}
        value={
          <div>
            <span className="flex flex-wrap items-center gap-1.5">
              {tt && (
                <span title={b.trang_thai_goc ? tr("Trạng thái gốc: {0}", b.trang_thai_goc) : undefined}>
                  <Badge tone={tt.tone}>{tt.nhan}</Badge>
                </span>
              )}
              {(b.ngay_kich_hoat || b.ngay_het_han) && (
                <span>
                  {fmtDate(b.ngay_kich_hoat)} → {fmtDate(b.ngay_het_han)}
                  {b.so_thang ? ` (${tr("{0} tháng", b.so_thang)})` : ""}
                </span>
              )}
            </span>
            {phu && <div className={muted}>{phu}</div>}
          </div>
        }
      />
    </div>
  );
}

// Dai "Thông số nước" o dau tab Lỗi - chi hien khi co so do.
export function ThongSoNuocStrip({ c }: { c: CaseRow | null | undefined }) {
  const n = parseJsonObject<ThongSoNuoc>(c?.thong_so_nuoc);
  if (!n) return null;
  const tds = [
    n.tds_vao != null || n.tds_ra != null ? `TDS ${tr("vào")} ${n.tds_vao ?? "—"} → ${tr("ra")} ${n.tds_ra ?? "—"}` : null,
    n.tds_tai_voi != null ? `${tr("tại vòi")} ${n.tds_tai_voi}` : null,
    n.tds_nuoc_thai != null ? `${tr("nước thải")} ${n.tds_nuoc_thai}` : null,
    n.ph != null ? `pH ${n.ph}` : null,
  ].filter(Boolean);
  return (
    <div className="mb-3 rounded-lg border border-[var(--line)] px-3 py-2 text-sm">
      <div className="text-[11px] font-semibold text-[var(--ink-400)] uppercase tracking-wide">{tr("Thông số nước tại nhà KH")}</div>
      <div>{[n.nguon_nuoc, ...tds].filter(Boolean).join(" · ")}</div>
    </div>
  );
}

// The dau tien cua tab ngoai "Khảo sát".
export function KhaoSatOdooCard({ c }: { c: CaseRow | null | undefined }) {
  const k = parseJsonObject<KhaoSatOdoo>(c?.khao_sat_odoo);
  if (!k) return null;
  const hl = hienHaiLong(k.hai_long);
  return (
    <Card className="p-3 mb-3">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1.5">
        <span className="font-semibold text-sm">{tr("Khảo sát CSKH (Odoo)")}</span>
        {hl && <Badge tone={hl.tone}>{hl.nhan}</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-[var(--ink-600)]">
        <span title={k.cuoc_goi}>
          <Field label={tr("Cuộc gọi")} value={nhanCuocGoi(k.cuoc_goi) ?? "—"} />
        </span>
        {k.ly_do && (
          <span title={k.ly_do}>
            <Field label={tr("Lý do đánh giá")} value={nhanLyDoDanhGia(k.ly_do)} />
          </span>
        )}
        {k.ghi_chu && (
          <div className="col-span-2">
            <Field label={tr("Ghi chú")} value={k.ghi_chu} />
          </div>
        )}
      </div>
    </Card>
  );
}

export function coKhaoSatOdoo(c: CaseRow | null | undefined): boolean {
  return !!parseJsonObject<KhaoSatOdoo>(c?.khao_sat_odoo);
}

// Badge tieu de ca: CHI khi KH khong hai long (tin hieu can xu ly) - hai long thi khong chiem cho.
export function khongHaiLongBadge(c: CaseRow) {
  if (!laKhongHaiLong(parseJsonObject<KhaoSatOdoo>(c.khao_sat_odoo))) return null;
  return <Badge tone="coral">{tr("KH không hài lòng")}</Badge>;
}

// Su kien cho "Tiến trình chung": check-in + moc qua SLA.
export function odooTimelineEvents(c: CaseRow | null | undefined) {
  const out: { key: string; rawTs: string; typeLabel: string; actor: string | null; summary: string; lech: boolean }[] = [];
  if (!c) return out;
  const k = parseJsonObject<KtvOdoo>(c.ktv_odoo);
  (k?.checkin ?? []).forEach((x, i) => {
    if (!x.thoi_diem) return;
    out.push({
      key: `ck-${i}`,
      rawTs: x.thoi_diem,
      typeLabel: tr("Check-in KTV (Odoo)"),
      actor: x.ktv,
      summary: x.lech_tren_200m ? tr("Lệch GPS–mạng {0}m (> 200m)", x.lech_m) : tr("Lệch GPS–mạng {0}m", x.lech_m),
      lech: x.lech_tren_200m,
    });
  });
  const s = parseJsonObject<SlaOdoo>(c.sla_odoo);
  if (s?.qua_sla_luc) {
    out.push({ key: "qua-sla", rawTs: s.qua_sla_luc, typeLabel: tr("Quá SLA (Odoo)"), actor: null, summary: s.han ? tr("Hạn SLA {0}", fmtDateTime(s.han)) : "", lech: true });
  }
  return out;
}
