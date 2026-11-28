// Bo tinh "luong 8 buoc" cua 1 ca (2026-11-27, giao dien Chi tiet ca v2 + bo sung Tien trinh chung v1).
// CHI doc du lieu popup Chi tiet ca DA TAI san (khong goi them API, khong doc them D1):
//   case_dvbh (mo / dong ca, lich_hen Odoo) · don LK + phieu xuat kho (app Dat mua linh kien) · thieu hang / PO
//   · luong gui xac (App Bao hanh doi tra 3T - Worker suachua, API case-timeline).
// Giai doan 1 = CHI HIEN THI: khong co SLA tung buoc, khong co ma loi theo buoc (cho Giam doc chot).
//
// Quy uoc trang thai:
//   xong   = co moc thoi gian that
//   dang   = buoc dang cho xu ly (moi ca toi da 1 buoc "dang" trong nhom 1-6 va 1 trong nhom 7-8)
//   chua   = chua toi
//   bo_qua = khong ap dung cho ca nay (vd ca khong dat linh kien -> bo qua 3,4,5,7,8; kho co san -> bo qua 4)
import type { CaseRow, LichHenItem } from "../types";
import type { LinhKienOrder } from "./linhKienTimeline";
import type { SuaChuaDon } from "./suaChuaTimeline";
import { tr } from "../i18n/tr";
import { phutLamViec, fmtPhut, type KieuGio } from "./gioLamViec";

export type TrangThaiBuoc = "xong" | "dang" | "chua" | "bo_qua";

export interface BuocQuyTrinh {
  so: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  ten: string; // ten day du, vd "Xác nhận lịch hẹn"
  tenNgan: string; // ten ngan cho dai 8 o, vd "Lịch hẹn"
  ai: string; // vai tro thuong lam buoc nay
  trangThai: TrangThaiBuoc;
  luc: string | null; // moc "xong" (hoac moc bat dau khi dang) - chuoi goc tu nguon
  lucMs: number | null;
  nguoi: string | null;
  // So ms tu moc buoc truoc co moc toi moc buoc nay (de hien "+3 giờ"); null neu khong tinh duoc.
  cachTruocMs: number | null;
  // Cac dong tom tat ngan (da dich), vd "3 lần hẹn", "PO 2 dòng".
  chiSo: string[];
  // Ly do bo qua / ghi chu ngan (da dich).
  ghiChu: string | null;
  // SLA cua buoc (chot 2026-11-28) - null khi buoc chua bat dau / khong ap dung / thieu moc bat dau.
  sla: SlaBuoc | null;
}

export interface SlaBuoc {
  kieu: KieuGio;
  hanPhut: number; // han (phut lam viec theo kieu)
  hanNhan: string; // "2 giờ (giờ KTV)", "8 giờ hành chính", "3 ngày KTV", "7 ngày"
  batDauMs: number;
  ketThucMs: number | null; // null = dang chay (tinh toi hien tai)
  daDungPhut: number;
  quaHan: boolean;
  nhan: string; // "Trong hạn · còn 1 giờ 20 phút" / "Quá SLA 3 giờ" / "Đạt SLA (5 giờ / 8 giờ)"
}

// SLA tung buoc - nguyen van chu he thong 2026-11-28: "hẹn 2h (ktv hẹn sau 2h nhận ca) · đặt LK 8h (sau khi ktv đặt BO xác nhận trong giờ làm việc)
// · mua hàng 8h (từ thời điểm báo thiếu) · giao LK (8h sau khi tiếp nhận đơn từ KTV - hoặc hàng về nếu thiếu) · đóng ca sau 3 ngày làm việc
// · trả xác 7 ngày · xác nhận xác 30 ngày" + "tính theo giờ làm việc 8h các việc liên quan đến ktv thì không loại trừ nửa thứ 7 và chủ nhật = 12h".
export const SLA_BUOC: Record<number, { kieu: KieuGio; phut: number; nhan: string }> = {
  2: { kieu: "ktv", phut: 2 * 60, nhan: tr("2 giờ KTV") },
  3: { kieu: "vp", phut: 8 * 60, nhan: tr("8 giờ hành chính") },
  4: { kieu: "vp", phut: 8 * 60, nhan: tr("8 giờ hành chính") },
  5: { kieu: "vp", phut: 8 * 60, nhan: tr("8 giờ hành chính") },
  6: { kieu: "ktv", phut: 3 * 12 * 60, nhan: tr("3 ngày làm việc KTV (36 giờ)") },
  7: { kieu: "lich", phut: 7 * 24 * 60, nhan: tr("7 ngày") },
  8: { kieu: "lich", phut: 30 * 24 * 60, nhan: tr("30 ngày") },
};

function fmtTheoKieu(phut: number, kieu: KieuGio): string {
  return kieu === "lich" ? fmtKhoang(phut * 60_000) : fmtPhut(phut);
}

export interface DauVaoBuocQuyTrinh {
  ca: CaseRow | null | undefined;
  lichHen: LichHenItem[];
  lkOrders: LinhKienOrder[];
  soPo: number; // so dong PO dat hang khop ca (tab PO dat hang)
  scDon: SuaChuaDon[]; // don gui xac / gui BH tu App Bao hanh doi tra
  // false = API app Dat mua LK / App Bao hanh doi tra dang tai hoac loi -> KHONG ket luan "bo qua" (thieu du lieu != khong co).
  daTaiLk?: boolean;
  daTaiSc?: boolean;
  nowMs?: number;
  // Ngay khong lam viec (YYYY-MM-DD) cua khu vuc / nuoc cua ca - "Ngày loại trừ giải trình" (Cai dat). Chu nhat / chieu T7 da tinh san.
  ngayNghi?: ReadonlySet<string>;
}

export interface KetQuaBuocQuyTrinh {
  buoc: BuocQuyTrinh[];
  buocHienTai: BuocQuyTrinh | null; // buoc "dang" dau tien (uu tien nhom 1-6)
  soXong: number;
  daDongCa: boolean;
  // Dung chung v1 + v2 (cung 1 cau, cung so lieu):
  choMs: number | null; // da cho o buoc hien tai bao lau (tu moc cua buoc / moc gan nhat truoc no)
  tongMs: number | null; // ca da dong: tu khoi tao toi dong ca; ca mo: tu khoi tao toi nay
  tomTat: string; // "Đang ở bước 3 · Đặt linh kiện — chờ 2 ngày" / "Ca đã đóng — 5/8 bước có dữ liệu."
  tomTatTong: string; // "Tổng thời gian xử lý 3 ngày" / "Đã mở 17 ngày"
}

/** "YYYY-MM-DD HH:MM:SS" (gio VN) hoac ISO 8601 -> ms. Chuoi rong / sai -> null. */
export function lucToMs(v: string | null | undefined): number | null {
  if (!v) return null;
  const s = v.trim();
  if (!s) return null;
  // Chi co ngay ("2026-10-04") -> 00:00 gio VN; co gio thi doi " " -> "T"; khong co mui gio -> +07:00.
  const coGio = /T|\d{1,2}:\d{2}/.test(s);
  const base = coGio ? s.replace(" ", "T") : `${s}T00:00:00`;
  const iso = /[+-]\d\d:?\d\d$|Z$/.test(base) ? base : `${base}+07:00`;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function minLuc(list: (string | null | undefined)[]): { luc: string | null; ms: number | null } {
  let best: { luc: string | null; ms: number | null } = { luc: null, ms: null };
  for (const v of list) {
    const ms = lucToMs(v);
    if (ms !== null && (best.ms === null || ms < best.ms)) best = { luc: v ?? null, ms };
  }
  return best;
}

function maxLuc(list: (string | null | undefined)[]): { luc: string | null; ms: number | null } {
  let best: { luc: string | null; ms: number | null } = { luc: null, ms: null };
  for (const v of list) {
    const ms = lucToMs(v);
    if (ms !== null && (best.ms === null || ms > best.ms)) best = { luc: v ?? null, ms };
  }
  return best;
}

/** Khoang thoi gian ngan gon: "45 phút", "3 giờ", "2 ngày 4 giờ". */
export function fmtKhoang(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms < 0) return "";
  const phut = Math.round(ms / 60000);
  if (phut < 60) return tr("{0} phút", phut);
  const gio = Math.floor(phut / 60);
  if (gio < 24) return tr("{0} giờ", gio);
  const ngay = Math.floor(gio / 24);
  const du = gio % 24;
  return du ? tr("{0} ngày {1} giờ", ngay, du) : tr("{0} ngày", ngay);
}

export const DINH_NGHIA_BUOC: { so: BuocQuyTrinh["so"]; ten: string; tenNgan: string; ai: string }[] = [
  { so: 1, ten: tr("Khởi tạo"), tenNgan: tr("Khởi tạo"), ai: "CSKH" },
  { so: 2, ten: tr("Xác nhận lịch hẹn"), tenNgan: tr("Lịch hẹn"), ai: tr("KTV / Trạm") },
  { so: 3, ten: tr("Đặt linh kiện"), tenNgan: tr("Đặt LK"), ai: tr("KTV / Giám sát") },
  { so: 4, ten: tr("Mua hàng"), tenNgan: tr("Mua hàng"), ai: tr("Mua hàng / Kho") },
  { so: 5, ten: tr("Giao LK cho KTV"), tenNgan: tr("Giao LK"), ai: tr("Kho") },
  { so: 6, ten: tr("Đóng ca"), tenNgan: tr("Đóng ca"), ai: tr("KTV / Trạm") },
  { so: 7, ten: tr("Trả xác 3T"), tenNgan: tr("Trả xác"), ai: tr("KTV / Kho / Admin BH") },
  { so: 8, ten: tr("Xác nhận xác"), tenNgan: tr("XN xác"), ai: tr("Admin BH / Kế toán") },
];

function daTaiScSom(dv: DauVaoBuocQuyTrinh): boolean {
  return dv.daTaiSc !== false;
}

export function tinhBuocQuyTrinh(dv: DauVaoBuocQuyTrinh): KetQuaBuocQuyTrinh {
  const c = dv.ca;
  const daDongCa = !!c?.thoi_gian_hoan_thanh;
  const ds = DINH_NGHIA_BUOC.map<BuocQuyTrinh>((d) => ({
    ...d,
    trangThai: "chua",
    luc: null,
    lucMs: null,
    nguoi: null,
    cachTruocMs: null,
    chiSo: [],
    ghiChu: null,
    sla: null,
  }));
  const b = (so: number) => ds[so - 1];
  const dat = (so: number, luc: { luc: string | null; ms: number | null }, nguoi: string | null = null) => {
    if (luc.ms === null) return false;
    Object.assign(b(so), { trangThai: "xong" as TrangThaiBuoc, luc: luc.luc, lucMs: luc.ms, nguoi });
    return true;
  };

  // 1. Khoi tao
  dat(1, { luc: c?.thoi_gian_cskh_tiep_nhan ?? null, ms: lucToMs(c?.thoi_gian_cskh_tiep_nhan) }, "CSKH");

  // 2. Xac nhan lich hen - moc = lan hen DAU TIEN duoc tao (Odoo). Ca khong co lich hen Odoo nhung co "thoi gian hen xu ly" -> lay gia tri do.
  const henHopLe = dv.lichHen.filter((h) => h.trang_thai !== "cancelled");
  if (henHopLe.length) {
    const dau = minLuc(henHopLe.map((h) => h.ngay_tao ?? h.thoi_gian_hen));
    dat(2, dau, c?.ky_thuat_vien ?? null);
    b(2).chiSo.push(tr("{0} lần hẹn", dv.lichHen.length));
    const cuoi = maxLuc(henHopLe.map((h) => h.thoi_gian_hen));
    if (cuoi.luc) b(2).chiSo.push(tr("Hẹn: {0}", cuoi.luc.slice(0, 16)));
  } else if (c?.thoi_gian_hen_xu_ly) {
    dat(2, { luc: c.thoi_gian_hen_xu_ly, ms: lucToMs(c.thoi_gian_hen_xu_ly) }, c?.ky_thuat_vien ?? null);
  }

  // 3. Dat linh kien
  const orders = dv.lkOrders;
  if (orders.length) {
    const dau = minLuc(orders.map((o) => o.ngay_tao));
    dat(3, dau, orders[0]?.nguoi_tao_ten ?? orders[0]?.nguoi_tao ?? null);
    b(3).chiSo.push(tr("{0} đơn LK", orders.length));
  }

  // 4. Mua hang - chi co khi co yeu cau thieu LK / PO. Co don LK ma khong thieu -> kho co san -> bo qua.
  const thieu = orders.flatMap((o) => o.thieu_lk ?? []);
  const coThieuEvent = orders.some((o) => o.timeline.some((e) => e.source === "thieu_lk"));
  if (thieu.length || coThieuEvent || dv.soPo > 0) {
    const chuaVe = thieu.filter((t) => !t.ngay_hang_ve_thuc_te);
    if (thieu.length && chuaVe.length === 0) dat(4, maxLuc(thieu.map((t) => t.ngay_hang_ve_thuc_te)), tr("Mua hàng"));
    else {
      const batDau = minLuc([...thieu.map((t) => t.ngay_tao), ...orders.flatMap((o) => o.timeline.filter((e) => e.source === "thieu_lk").map((e) => e.at))]);
      Object.assign(b(4), { trangThai: "dang" as TrangThaiBuoc, luc: batDau.luc, lucMs: batDau.ms });
      const duKien = maxLuc(chuaVe.map((t) => t.ngay_du_kien_co_hang));
      if (duKien.luc) b(4).chiSo.push(tr("Dự kiến về: {0}", duKien.luc.slice(0, 10)));
    }
    if (thieu.length) b(4).chiSo.push(tr("{0} yêu cầu thiếu LK", thieu.length));
    if (dv.soPo) b(4).chiSo.push(tr("{0} dòng PO", dv.soPo));
  } else if (orders.length) {
    Object.assign(b(4), { trangThai: "bo_qua" as TrangThaiBuoc, ghiChu: tr("Kho có sẵn") });
  }

  // 5. Giao LK cho KTV - phieu xuat kho
  if (orders.length) {
    const pxk = minLuc(orders.flatMap((o) => o.timeline.filter((e) => e.source === "phieu_xuat_kho").map((e) => e.at)));
    const soPxk = orders.reduce((n, o) => n + o.phieu_xuat_kho.length, 0);
    if (!dat(5, pxk, tr("Kho")) && soPxk > 0) Object.assign(b(5), { trangThai: "xong" as TrangThaiBuoc });
    if (soPxk) b(5).chiSo.push(tr("{0} phiếu xuất kho", soPxk));
  }

  // 6. Dong ca
  dat(6, { luc: c?.thoi_gian_hoan_thanh ?? null, ms: lucToMs(c?.thoi_gian_hoan_thanh) }, c?.ky_thuat_vien ?? null);
  if (c?.tien_do_hoan_thanh) b(6).chiSo.push(c.tien_do_hoan_thanh);

  // 7-8 (chot 2026-11-28) - App Bao hanh doi tra 3T:
  //   7 "Tra xac 3T" = DON GUI DOI TRA: KTV tao don -> gui xe -> Kho nhan -> Admin BH nhan (xong khi Admin BH nhan du moi phieu gui).
  //   8 "Xac nhan xac" = TIEN DO TRA XAC: cho xu ly xac -> vao thung tra xac -> Ke toan duyet = tra xac thanh cong (xong);
  //     xac ket thuc ngoai thung (tieu huy / that lac / luu kho / khong co / xu ly ngoai) cung la xong (ghi ket qua).
  //   Chua co don gui -> ca 2 buoc "Chua co linh kien bao hanh gui nen chua co xac".
  //   Xac = xac don vi Doi moi / Tru cong no + xac linh kien sau sua chua (de xuat da xuat).
  if (daTaiScSom(dv)) {
    const units = dv.scDon.flatMap((d) => d.don_vi);
    if (!dv.scDon.length) {
      for (const so of [7, 8]) b(so).ghiChu = tr("Chưa có linh kiện bảo hành gửi nên chưa có xác");
    } else {
      // ---- Buoc 7: don gui doi tra ----
      const phieuMap = new Map(dv.scDon.filter((d) => d.phieu_gui).map((d) => [d.phieu_gui!.id, d.phieu_gui!]));
      const phieu = [...phieuMap.values()];
      b(7).chiSo.push(tr("{0} đơn gửi BH", dv.scDon.length));
      for (const p of phieu) b(7).chiSo.push([p.id, p.trang_thai_label].filter(Boolean).join(" · "));
      const taoDau = minLuc(dv.scDon.map((d) => d.phieu_gui?.tao_luc ?? d.tao_luc));
      const donKhongThung = dv.scDon.filter((d) => !d.phieu_gui);
      const daNhanHet = phieu.every((p) => p.admin_nhan_luc) && donKhongThung.every((d) => d.don_vi.length > 0);
      if (daNhanHet) {
        dat(
          7,
          phieu.length ? maxLuc(phieu.map((p) => p.admin_nhan_luc)) : maxLuc(donKhongThung.map((d) => d.tao_luc)),
          phieu.find((p) => p.admin_nhan)?.admin_nhan ?? tr("Admin BH"),
        );
      } else {
        const choAdmin = phieu.some((p) => p.kho_nhan_luc && !p.admin_nhan_luc);
        const dangGui = phieu.some((p) => p.gui_xe_luc && !p.kho_nhan_luc);
        Object.assign(b(7), {
          trangThai: "dang" as TrangThaiBuoc,
          luc: taoDau.luc,
          lucMs: taoDau.ms,
          nguoi: phieu[0]?.ktv ?? null,
          ghiChu: choAdmin ? tr("Kho đã nhận — chờ Admin BH nhận") : dangGui ? tr("Đang gửi về kho") : tr("Chờ KTV gửi"),
        });
      }

      // ---- Buoc 8: tien do tra xac ----
      // 1 "xac" = xac don vi Doi moi / Tru cong no (SL 1) + xac linh kien sau sua chua (de xuat da xuat) - cung dinh nghia man Quan ly xac ben suachua.
      const coTruongXac = units.some((u) => u.xac);
      type Xac = { tt: string | null; tt_label: string; xl_luc: string | null; thung: NonNullable<SuaChuaDon["don_vi"][number]["xac"]>["thung"]; sl: number };
      const xacs: Xac[] = units.flatMap((u) => [
        ...(u.xac?.co_xac ? [{ tt: u.xac.tt, tt_label: u.xac.tt_label, xl_luc: u.xac.xl_luc, thung: u.xac.thung, sl: 1 }] : []),
        ...(u.xac_sua_chua ?? []).map((d) => ({ tt: d.tt, tt_label: d.tt_label, xl_luc: d.xl_luc, thung: d.thung, sl: d.so_luong || 1 })),
      ]);
      const daPhanLoaiHet = units.length > 0 && units.every((u) => !!u.huong_xu_ly);
      // Don vi sua chua chua xong (chua ket thuc / chua co phieu tra) -> co the con phat sinh xac linh kien thay.
      const dangSua = units.some(
        (u) => (u.huong_xu_ly === "sua_chua" || u.huong_xu_ly === "dich_vu_tinh_phi") && !u.phieu_tra && !String(u.trang_thai).startsWith("ket_thuc"),
      );
      const soXac = xacs.reduce((n, x) => n + x.sl, 0);
      const nhan = [...new Set(xacs.map((x) => x.tt_label))];
      if (xacs.length) b(8).chiSo.push(tr("{0} xác", soXac), ...nhan);
      const thung = [...new Map(xacs.filter((x) => x.thung).map((x) => [x.thung!.id, x.thung!])).values()];
      for (const t of thung) b(8).chiSo.push([t.id, t.doi_tac, t.trang_thai_label].filter(Boolean).join(" · "));
      if (coTruongXac && xacs.length === 0 && daPhanLoaiHet && !dangSua) {
        const huong = [...new Set(units.map((u) => u.huong_xu_ly_label ?? u.huong_xu_ly).filter((x): x is string => !!x))].join(", ");
        Object.assign(b(8), { trangThai: "bo_qua" as TrangThaiBuoc, ghiChu: tr("Không có xác ({0})", huong) });
      } else if (b(7).trangThai !== "xong") {
        b(8).ghiChu = tr("Chờ đơn gửi đổi trả về tới Admin BH");
      } else if (!xacs.length) {
        Object.assign(b(8), { trangThai: "dang" as TrangThaiBuoc, ghiChu: dangSua ? tr("Đang sửa chữa — chờ xác định xác") : tr("Chờ xử lý xác") });
      } else {
        const chuaXl = xacs.filter((x) => !x.tt);
        const trongThungChoKt = xacs.filter((x) => x.tt === "trong_thung");
        if (chuaXl.length || dangSua) {
          Object.assign(b(8), {
            trangThai: "dang" as TrangThaiBuoc,
            ghiChu: chuaXl.length ? tr("Chờ xử lý xác ({0}/{1})", chuaXl.length, xacs.length) : tr("Đang sửa chữa — chờ xác định xác"),
          });
        } else if (trongThungChoKt.length) {
          Object.assign(b(8), { trangThai: "dang" as TrangThaiBuoc, ghiChu: tr("Chờ trả xác cho đối tác") });
        } else {
          // Moi xac da co ket qua cuoi: da tra (ke toan duyet thung) hoac ket thuc ngoai thung.
          const daTra = xacs.filter((x) => x.tt === "da_tra");
          dat(
            8,
            maxLuc([...daTra.map((x) => x.thung?.kt_luc ?? null), ...xacs.filter((x) => x.tt !== "da_tra").map((x) => x.xl_luc)]),
            daTra.length ? tr("Kế toán") : tr("Admin BH"),
          );
          b(8).ghiChu = daTra.length === xacs.length ? tr("Trả xác thành công") : nhan.join(", ");
        }
      }
    }
  }

  // Ca khong dat linh kien: 3,4,5 bo qua khi ca da dong; 7,8 bo qua khi khong co don gui xac.
  // Chi ket luan khi DA TAI duoc du lieu nguon; tai loi -> ghi chu, giu "chua".
  const daTaiLk = dv.daTaiLk !== false;
  const daTaiSc = dv.daTaiSc !== false;
  if (!daTaiLk) for (const so of [3, 4, 5]) if (b(so).trangThai === "chua") b(so).ghiChu = tr("Chưa tải được dữ liệu");
  if (!daTaiSc) for (const so of [7, 8]) if (b(so).trangThai === "chua") b(so).ghiChu = tr("Chưa tải được dữ liệu");
  if (!orders.length && daDongCa && daTaiLk) {
    for (const so of [3, 4, 5]) if (b(so).trangThai === "chua") Object.assign(b(so), { trangThai: "bo_qua" as TrangThaiBuoc, ghiChu: tr("Không đặt linh kiện") });
  }
  // Buoc 2 khong co du lieu hen nhung ca da sang buoc sau -> coi nhu bo qua (khong de "chua toi" mai).
  if (b(2).trangThai === "chua" && [3, 4, 5, 6].some((so) => b(so).trangThai === "xong")) {
    Object.assign(b(2), { trangThai: "bo_qua" as TrangThaiBuoc, ghiChu: tr("Không có lịch hẹn") });
  }

  // Buoc "dang": nhom 1-6 = buoc chua xong dau tien sau buoc xong cuoi (ca con mo); nhom 7-8 tuong tu (sau khi co LK).
  const danhDang = (tu: number, den: number) => {
    if (ds.slice(tu - 1, den).some((x) => x.trangThai === "dang")) return;
    for (let so = tu; so <= den; so++) {
      if (b(so).trangThai === "chua") {
        b(so).trangThai = "dang";
        return;
      }
    }
  };
  if (!daDongCa) danhDang(1, 6);

  // Khoang cach toi buoc truoc co moc.
  let truoc: number | null = null;
  for (const x of ds) {
    if (x.lucMs !== null) {
      x.cachTruocMs = truoc !== null && x.lucMs >= truoc ? x.lucMs - truoc : null;
      truoc = x.lucMs;
    }
  }

  const now = dv.nowMs ?? Date.now();

  // ---- SLA tung buoc: moc bat dau / ket thuc ----
  const evDau = (names: string[]) => minLuc(orders.flatMap((o) => o.timeline.filter((e) => names.includes(e.event)).map((e) => e.at)));
  const boDuyet = evDau(["tn_da_duyet"]);
  const mocSau = evDau(["pxk_dang_tao_phieu", "pxk_cho_ke_toan", "pxk_da_chot_don_xuat", "pxk_dang_gui_ktv", "pxk_ktv_da_nhan"]);
  const baoThieu = minLuc([
    ...orders.flatMap((o) => (o.thieu_lk ?? []).map((t) => t.ngay_tao)),
    ...orders.flatMap((o) => o.timeline.filter((e) => e.event === "cho_hang" || e.event === "thieu_lk_cho_kho_xu_ly").map((e) => e.at)),
  ]);
  const phanHoiMua = evDau(["thieu_lk_kho_da_cap_nhat", "thieu_lk_kho_xac_nhan_hang_ve"]);
  const hangVe = maxLuc([
    ...orders.flatMap((o) => (o.thieu_lk ?? []).map((t) => t.ngay_hang_ve_thuc_te)),
    ...orders.flatMap((o) => o.timeline.filter((e) => e.event === "thieu_lk_kho_xac_nhan_hang_ve").map((e) => e.at)),
  ]);
  const ktvNhanLk = evDau(["pxk_ktv_da_nhan"]);
  const mocSla: Record<number, { bd: number | null; kt: number | null }> = {
    // 2: KTV hen trong 2h (gio KTV) tu luc nhan ca.
    2: { bd: b(1).lucMs, kt: b(2).trangThai === "xong" ? b(2).lucMs : null },
    // 3: KTV dat don -> BO xac nhan (duyet) trong 8h hanh chinh. Don di thang phieu xuat (khong qua duyet) -> lay moc phieu xuat.
    3: { bd: minLuc(orders.map((o) => o.ngay_tao)).ms, kt: boDuyet.ms ?? mocSau.ms },
    // 4: bao thieu -> Mua hang phan hoi (cap nhat ngay du kien / hang ve) trong 8h hanh chinh.
    4: { bd: b(4).trangThai === "bo_qua" ? null : baoThieu.ms, kt: phanHoiMua.ms },
    // 5: tiep nhan don cua KTV (BO duyet) - hoac hang ve neu thieu -> phieu xuat kho trong 8h hanh chinh.
    5: { bd: b(4).trangThai !== "bo_qua" && baoThieu.ms !== null ? hangVe.ms : boDuyet.ms ?? minLuc(orders.map((o) => o.ngay_tao)).ms, kt: b(5).trangThai === "xong" ? b(5).lucMs : null },
    // 6: tu luc KTV nhan LK (hoac giao LK / hen neu khong can LK) -> dong ca trong 3 ngay KTV.
    6: { bd: ktvNhanLk.ms ?? (b(5).trangThai === "xong" ? b(5).lucMs : null) ?? (orders.length ? null : b(2).lucMs ?? b(1).lucMs), kt: b(6).lucMs },
    // 7: tu dong ca -> Admin BH nhan don gui doi tra trong 7 ngay.
    7: { bd: dv.scDon.length ? b(6).lucMs : null, kt: b(7).trangThai === "xong" ? b(7).lucMs : null },
    // 8: tu Admin BH nhan -> tra xac xong trong 30 ngay.
    8: { bd: b(7).trangThai === "xong" ? b(7).lucMs : null, kt: b(8).trangThai === "xong" ? b(8).lucMs : null },
  };
  for (const [soStr, def] of Object.entries(SLA_BUOC)) {
    const so = Number(soStr);
    const x = b(so);
    const m = mocSla[so];
    if (!m || m.bd === null || x.trangThai === "bo_qua" || x.trangThai === "chua") continue;
    const kt = m.kt !== null && m.kt >= m.bd ? m.kt : null;
    const dung = phutLamViec(m.bd, kt ?? now, def.kieu, dv.ngayNghi);
    const quaHan = dung > def.phut;
    const nhan = kt !== null
      ? quaHan
        ? tr("Quá SLA {0} (SLA {1})", fmtTheoKieu(dung - def.phut, def.kieu), def.nhan)
        : tr("Đạt SLA ({0} / {1})", fmtTheoKieu(dung, def.kieu), def.nhan)
      : quaHan
        ? tr("Quá SLA {0} (SLA {1})", fmtTheoKieu(dung - def.phut, def.kieu), def.nhan)
        : tr("Trong hạn · còn {0} (SLA {1})", fmtTheoKieu(def.phut - dung, def.kieu), def.nhan);
    x.sla = { kieu: def.kieu, hanPhut: def.phut, hanNhan: def.nhan, batDauMs: m.bd, ketThucMs: kt, daDungPhut: dung, quaHan, nhan };
  }

  const buocHienTai = ds.find((x) => x.trangThai === "dang") ?? null;
  const soXong = ds.filter((x) => x.trangThai === "xong").length;
  let choMs: number | null = null;
  if (buocHienTai) {
    const truocMs = ds.filter((x) => x.so < buocHienTai.so && x.lucMs !== null).map((x) => x.lucMs as number);
    const tu = buocHienTai.lucMs ?? (truocMs.length ? Math.max(...truocMs) : null);
    choMs = tu !== null && now >= tu ? now - tu : null;
  }
  const dau = ds[0].lucMs;
  const cuoi = ds[5].lucMs ?? (daDongCa ? null : now);
  const tongMs = dau !== null && cuoi !== null && cuoi >= dau ? cuoi - dau : null;
  const tomTat = buocHienTai
    ? choMs !== null
      ? tr("Đang ở bước {0} · {1} — chờ {2}", buocHienTai.so, buocHienTai.ten, fmtKhoang(choMs))
      : tr("Đang ở bước {0} · {1}", buocHienTai.so, buocHienTai.ten)
    : daDongCa
      ? tr("Ca đã đóng — {0}/8 bước có dữ liệu.", soXong)
      : tr("{0}/8 bước có dữ liệu.", soXong);
  const soQuaSla = ds.filter((x) => x.sla?.quaHan).length;
  const tomTatTong = [
    tongMs === null ? "" : daDongCa ? tr("Tổng thời gian xử lý {0}", fmtKhoang(tongMs)) : tr("Đã mở {0}", fmtKhoang(tongMs)),
    soQuaSla ? tr("{0} bước quá SLA", soQuaSla) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return { buoc: ds, buocHienTai, soXong, daDongCa, choMs, tongMs, tomTat, tomTatTong };
}
