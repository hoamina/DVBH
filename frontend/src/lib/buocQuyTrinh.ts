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
  { so: 7, ten: tr("Trả xác 3T"), tenNgan: tr("Trả xác"), ai: tr("KTV / Admin BH") },
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

  // 7-8. Tien do TRA XAC linh kien - App Bao hanh doi tra 3T (chot 2026-11-27):
  //   chua gui BH -> "Chua co linh kien bao hanh gui nen chua co xac"; co LK gui ve doi tra -> buoc 7 "Cho xu ly xac";
  //   7 xong khi moi xac da co ket qua (vao thung tra xac / tieu huy / that lac / khong co / xu ly ngoai);
  //   8 = thung tra xac doi tac (dang gom / cho ke toan -> ke toan duyet); xac ket thuc ngoai thung -> 8 bo qua.
  if (daTaiScSom(dv)) {
    const units = dv.scDon.flatMap((d) => d.don_vi);
    if (!dv.scDon.length) {
      for (const so of [7, 8]) b(so).ghiChu = tr("Chưa có linh kiện bảo hành gửi nên chưa có xác");
    } else {
      b(7).chiSo.push(tr("{0} đơn gửi BH", dv.scDon.length));
      // Moc bat dau cho xu ly xac = luc tao don gui BH dau tien.
      const guiDau = minLuc(dv.scDon.map((d) => d.phieu_gui?.tao_luc ?? d.tao_luc));
      const coTruongXac = units.some((u) => u.xac);
      const xacUnits = units.filter((u) => u.xac?.co_xac);
      const daPhanLoaiHet = units.length > 0 && units.every((u) => !!u.huong_xu_ly);
      if (coTruongXac && xacUnits.length === 0 && daPhanLoaiHet) {
        const huong = [...new Set(units.map((u) => u.huong_xu_ly_label ?? u.huong_xu_ly).filter((x): x is string => !!x))].join(", ");
        for (const so of [7, 8]) Object.assign(b(so), { trangThai: "bo_qua" as TrangThaiBuoc, ghiChu: tr("Không có xác ({0})", huong) });
      } else if (!xacUnits.length) {
        Object.assign(b(7), { trangThai: "dang" as TrangThaiBuoc, ghiChu: tr("Chờ xử lý xác"), luc: guiDau.luc, lucMs: guiDau.ms });
      } else {
        const chuaXl = xacUnits.filter((u) => !u.xac?.tt);
        const nhan = [...new Set(xacUnits.map((u) => u.xac!.tt_label))];
        b(7).chiSo.push(tr("{0} xác", xacUnits.length), ...nhan);
        if (chuaXl.length) {
          Object.assign(b(7), { trangThai: "dang" as TrangThaiBuoc, ghiChu: tr("Chờ xử lý xác ({0}/{1})", chuaXl.length, xacUnits.length), luc: guiDau.luc, lucMs: guiDau.ms });
        } else {
          dat(7, maxLuc(xacUnits.map((u) => u.xac!.xl_luc ?? u.xac!.thung?.tao_luc ?? null)), tr("Admin BH"));
          const trongThung = xacUnits.filter((u) => u.xac!.tt === "trong_thung" || u.xac!.tt === "da_tra");
          if (!trongThung.length) {
            Object.assign(b(8), { trangThai: "bo_qua" as TrangThaiBuoc, ghiChu: nhan.join(", ") });
          } else {
            const thung = [...new Map(trongThung.map((u) => [u.xac!.thung?.id ?? "", u.xac!.thung])).values()].filter(Boolean);
            for (const t of thung) b(8).chiSo.push([t!.id, t!.doi_tac, t!.trang_thai_label].filter(Boolean).join(" · "));
            if (trongThung.every((u) => u.xac!.tt === "da_tra")) dat(8, maxLuc(thung.map((t) => t!.kt_luc)), tr("Kế toán"));
            else Object.assign(b(8), { trangThai: "dang" as TrangThaiBuoc, ghiChu: tr("Chờ trả xác cho đối tác") });
          }
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

  const buocHienTai = ds.find((x) => x.trangThai === "dang") ?? null;
  const soXong = ds.filter((x) => x.trangThai === "xong").length;
  const now = dv.nowMs ?? Date.now();
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
  const tomTatTong = tongMs === null ? "" : daDongCa ? tr("Tổng thời gian xử lý {0}", fmtKhoang(tongMs)) : tr("Đã mở {0}", fmtKhoang(tongMs));
  return { buoc: ds, buocHienTai, soXong, daDongCa, choMs, tongMs, tomTat, tomTatTong };
}
