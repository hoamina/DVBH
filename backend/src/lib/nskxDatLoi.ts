// DAT LOI LOC NSKX truc tiep sang linh-kien-app (2026-11-11, v1.571, migration 0162) - menu QL NSKX + tab NSKX trong chi tiet ca.
// Goi API doi tac linh-kien-app (v1.471): POST /api/partner/v1/dat-hang/kiem-tra (khong ghi) + POST /api/partner/v1/dat-hang (tao phieu),
// cung logic nut "Tao don" ben do (gia, chiet khau KH tra gop, ton kho, tu duyet, gom phieu). Chu he thong chot:
//  - nguoi dat = tai khoan nguoi bam (gui email_nguoi_dat; key LINHKIEN_APP_API_KEY phai duoc Admin linh-kien-app bat "dat thay dung nguoi bam");
//  - nguoi nhan = KTV trien khai, khong co thi Tram trien khai (ky_thuat_vien) - ma "(ma)" dau chuoi = ktv_lien_he.ma_ktv;
//  - CHI dat loi da xac nhan (nskx_loi_loc.thay_loi = 1, ds_loi) - day / cut dat ngoai; loai de xuat "HỖ TRỢ NGOÀI BẢO HÀNH TG12-NSKX".
// An toan khi dat so luong lon:
//  - 1 phieu = 1 nguoi nhan, <= DONG_MOI_PHIEU dong (API cho 100; nho hon de moi lan goi nhanh, it rui ro timeout), cac dong cua 1 ca
//    luon nam chung 1 phieu; goi TUAN TU tung phieu (khong Promise.all - bai hoc "D1 overloaded").
//  - API chan CA PHIEU neu 1 dong bi chan -> luon kiem-tra truoc, bo dong loi (bao ly do), roi moi tao phan con lai.
//  - Chong trung: (1) ngay truoc khi dat doc SONG don TG12 cua cac ca (POST /v1/don-loi-loc) - loi nao ca da co don con hieu luc thi bo;
//    (2) khoa tam theo ca (nskx_dat_loi_khoa) khi 2 nguoi bam cung luc; (3) ma_yeu_cau tat dinh theo nguoi + noi dung phieu -> gui lai
//    sau loi mang / timeout thi linh-kien-app tra phieu cu (trung_lap), khong tao them.
import type { Env } from "../types";
import { nowVN } from "./vnTime";

export const LOAI_DE_XUAT_TG12_NSKX = "HỖ TRỢ NGOÀI BẢO HÀNH TG12-NSKX";
export const NSKX_DAT_LOI_TU_NGAY = "2026-11-01"; // = NSKX_DONG_BO_TU_NGAY (routes/qlNskx.ts): ca truoc ngay nay "khong ap dung"
export const CA_TOI_DA_MOI_LAN = 500;
const DONG_MOI_PHIEU = 30;
const KHOA_HET_HAN_PHUT = 5;
const DK_NSKX = "c.doi_tac IN ('NSKX', '[NSKX]') AND COALESCE(c.quoc_gia, 'VN') = 'VN'";

export type DongDat = { case_id: string; ma_lk: string; ten_lk: string; so_luong: number };
export type PhieuDat = { ma_ktv: string; ten_nguoi_nhan: string; ca: string[]; dong: DongDat[] };
export type BoQua = { case_id: string; ma_lk?: string; ly_do: string };
export type KeHoach = { phieu: PhieuDat[]; bo_qua: BoQua[] };

type DonLoiLocRow = { case_id: string; don: { ma_lk?: string }[] };

/** "(ma.ktv) Ten..." -> "ma.ktv"; khong co ngoac -> null. */
export function maKtvTuChuoi(s: string | null | undefined): string | null {
  const m = /^\s*\(([^)]+)\)/.exec(s ?? "");
  return m ? m[1].trim() : null;
}

function parseDsLoi(raw: string | null): { ma_linh_kien: string; ten_linh_kien?: string; so_luong: number }[] {
  if (!raw) return [];
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => {
        const o = (x ?? {}) as { ma_linh_kien?: unknown; ten_linh_kien?: unknown; so_luong?: unknown };
        return { ma_linh_kien: String(o.ma_linh_kien ?? "").trim(), ten_linh_kien: o.ten_linh_kien ? String(o.ten_linh_kien) : undefined, so_luong: Math.max(1, Math.round(Number(o.so_luong) || 1)) };
      })
      .filter((x) => x.ma_linh_kien);
  } catch {
    return [];
  }
}

export class LoiLinhKienApp extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

/** POST JSON sang linh-kien-app qua Service Binding (fallback fetch URL). Tra { status, body } - KHONG nem loi voi 4xx (nguoi goi tu xu ly). */
async function goiLk(env: Env, path: string, body: unknown, timeoutMs: number): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!env.LINHKIEN_APP_URL || !env.LINHKIEN_APP_API_KEY) throw new LoiLinhKienApp("Chưa cấu hình kết nối linh-kien-app.", 500);
  const url = `${env.LINHKIEN_APP_URL}${path}`;
  const init: RequestInit = {
    method: "POST",
    headers: { "X-API-Key": env.LINHKIEN_APP_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  };
  const res = env.LINHKIEN_APP ? await env.LINHKIEN_APP.fetch(url, init) : await fetch(url, init);
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { error: "KHONG_PHAI_JSON", message: text.slice(0, 200) };
  }
  if (res.status >= 500) throw new LoiLinhKienApp(`linh-kien-app trả HTTP ${res.status}: ${String(json.message ?? json.error ?? text).slice(0, 200)}`);
  return { status: res.status, body: json };
}

/** Doc SONG don TG12 con hieu luc cua cac ca (kem cap [ID Lada, ca]) - dung cho chong trung + cap nhat nskx_don_lk. */
export async function docDonLoiLocSong(env: Env, db: D1Database, caseIds: string[]): Promise<DonLoiLocRow[]> {
  if (!caseIds.length) return [];
  const { results: lada } = await db
    .prepare("SELECT order_id, case_id FROM case_lada WHERE case_id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(caseIds))
    .all<{ order_id: string; case_id: string }>();
  const out: DonLoiLocRow[] = [];
  for (let i = 0; i < caseIds.length; i += 1000) {
    const lo = caseIds.slice(i, i + 1000);
    const loSet = new Set(lo);
    const r = await goiLk(env, "/api/partner/v1/don-loi-loc", { case_ids: lo, lada: lada.filter((x) => loSet.has(String(x.case_id))).map((x) => [String(x.order_id), String(x.case_id)]) }, 20000);
    if (r.status !== 200) throw new LoiLinhKienApp(`Không đọc được đơn lõi lọc từ linh-kien-app (${r.status} ${String(r.body.error ?? "")}).`);
    out.push(...(((r.body.rows as DonLoiLocRow[] | undefined) ?? []).map((x) => ({ case_id: String(x.case_id), don: Array.isArray(x.don) ? x.don : [] }))));
  }
  return out;
}

/** Ghi ket qua doc song vao nskx_don_lk (chi dong thay doi) - giong POST /ql-nskx/dong-bo-don. */
export async function ghiDonLk(db: D1Database, rows: DonLoiLocRow[]): Promise<void> {
  if (!rows.length) return;
  const { results: cu } = await db
    .prepare("SELECT case_id, co_don, don FROM nskx_don_lk WHERE case_id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(rows.map((r) => r.case_id)))
    .all<{ case_id: string; co_don: number; don: string | null }>();
  const truoc = new Map(cu.map((r) => [String(r.case_id), r]));
  const luc = nowVN();
  const ghi: D1PreparedStatement[] = [];
  for (const r of rows) {
    const coDon = r.don.length ? 1 : 0;
    const donJson = r.don.length ? JSON.stringify(r.don) : null;
    const t = truoc.get(r.case_id);
    if (t && t.co_don === coDon && (t.don ?? null) === donJson) continue;
    ghi.push(
      db
        .prepare(
          `INSERT INTO nskx_don_lk (case_id, co_don, don, ngay_dong_bo) VALUES (?, ?, ?, ?)
           ON CONFLICT(case_id) DO UPDATE SET co_don = excluded.co_don, don = excluded.don, ngay_dong_bo = excluded.ngay_dong_bo`,
        )
        .bind(r.case_id, coDon, donJson, luc),
    );
  }
  for (let i = 0; i < ghi.length; i += 200) await db.batch(ghi.slice(i, i + 200));
}

/**
 * Lap ke hoach dat cho cac ca: loc ca hop le (NSKX VN, trong khu vuc nguoi bam, da xac nhan "Co thay loi", tiep nhan tu 01/11/2026, co ma
 * nguoi nhan), bo loi da co don TG12 con hieu luc (doc song) va ma chua co trong danh muc linh-kien-app, gom theo nguoi nhan, chia phieu.
 * scope = khuVucWhereClause cua nguoi bam (alias c).
 */
export async function lapKeHoach(env: Env, db: D1Database, caseIds: string[], scope: { sql: string; binds: unknown[] }): Promise<{ keHoach: KeHoach; donSong: DonLoiLocRow[] }> {
  const ids = [...new Set(caseIds.map((x) => String(x ?? "").trim()).filter(Boolean))];
  const boQua: BoQua[] = [];
  const { results: ca } = await db
    .prepare(
      `SELECT c.id, c.ktv_trien_khai, c.ky_thuat_vien, c.thoi_gian_cskh_tiep_nhan, n.thay_loi, n.ds_loi
       FROM case_hieu_luc c LEFT JOIN nskx_loi_loc n ON n.case_id = c.id
       WHERE c.id IN (SELECT value FROM json_each(?)) AND ${DK_NSKX}${scope.sql}`,
    )
    .bind(JSON.stringify(ids), ...scope.binds)
    .all<{ id: string; ktv_trien_khai: string | null; ky_thuat_vien: string | null; thoi_gian_cskh_tiep_nhan: string | null; thay_loi: number | null; ds_loi: string | null }>();
  const theoId = new Map(ca.map((r) => [String(r.id), r]));
  const hopLe: { id: string; maKtv: string; tenNhan: string; loi: ReturnType<typeof parseDsLoi> }[] = [];
  for (const id of ids) {
    const r = theoId.get(id);
    if (!r) {
      boQua.push({ case_id: id, ly_do: "Không tìm thấy ca NSKX trong khu vực của bạn" });
      continue;
    }
    if (r.thay_loi !== 1) {
      boQua.push({ case_id: id, ly_do: "Chưa xác nhận “Có thay lõi”" });
      continue;
    }
    if ((r.thoi_gian_cskh_tiep_nhan ?? "") < NSKX_DAT_LOI_TU_NGAY) {
      boQua.push({ case_id: id, ly_do: "Ca tiếp nhận trước 01/11/2026 — không áp dụng đặt lõi" });
      continue;
    }
    const loi = parseDsLoi(r.ds_loi);
    if (!loi.length) {
      boQua.push({ case_id: id, ly_do: "Chưa chọn lõi lọc đã thay" });
      continue;
    }
    const nguon = r.ktv_trien_khai?.trim() ? r.ktv_trien_khai : r.ky_thuat_vien;
    const maKtv = maKtvTuChuoi(nguon);
    if (!maKtv) {
      boQua.push({ case_id: id, ly_do: `Không xác định được mã người nhận từ “${nguon ?? ""}”` });
      continue;
    }
    hopLe.push({ id, maKtv, tenNhan: nguon ?? maKtv, loi });
  }
  if (!hopLe.length) return { keHoach: { phieu: [], bo_qua: boQua }, donSong: [] };

  // Don TG12 dang co (doc song) - loi nao ca da co don con hieu luc thi khong dat lai.
  const donSong = await docDonLoiLocSong(env, db, hopLe.map((x) => x.id));
  const daDat = new Set<string>();
  for (const r of donSong) for (const d of r.don) if (d.ma_lk) daDat.add(`${r.case_id}|${String(d.ma_lk).trim()}`);
  // Danh muc linh kien (dong bo tu linh-kien-app) - ma ngoai danh muc thi linh-kien-app chan ca phieu -> bo truoc, bao dat tay.
  const tatCaMa = [...new Set(hopLe.flatMap((x) => x.loi.map((l) => l.ma_linh_kien)))];
  const { results: dm } = await db
    .prepare("SELECT ma_linh_kien, ten_linh_kien FROM linh_kien WHERE ma_linh_kien IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(tatCaMa))
    .all<{ ma_linh_kien: string; ten_linh_kien: string }>();
  const tenDm = new Map(dm.map((r) => [r.ma_linh_kien, r.ten_linh_kien]));

  const theoKtv = new Map<string, { ten: string; ca: { id: string; dong: DongDat[] }[] }>();
  for (const x of hopLe) {
    const dong: DongDat[] = [];
    for (const l of x.loi) {
      if (daDat.has(`${x.id}|${l.ma_linh_kien}`)) {
        boQua.push({ case_id: x.id, ma_lk: l.ma_linh_kien, ly_do: "Đã có đơn TG12 cho lõi này" });
        continue;
      }
      if (!tenDm.has(l.ma_linh_kien)) {
        boQua.push({ case_id: x.id, ma_lk: l.ma_linh_kien, ly_do: "Mã chưa có trong danh mục linh-kien-app — đặt tay" });
        continue;
      }
      dong.push({ case_id: x.id, ma_lk: l.ma_linh_kien, ten_lk: tenDm.get(l.ma_linh_kien) ?? l.ten_linh_kien ?? l.ma_linh_kien, so_luong: l.so_luong });
    }
    if (!dong.length) continue;
    const g = theoKtv.get(x.maKtv) ?? { ten: x.tenNhan, ca: [] };
    g.ca.push({ id: x.id, dong });
    theoKtv.set(x.maKtv, g);
  }
  const phieu: PhieuDat[] = [];
  for (const [maKtv, g] of [...theoKtv.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    let cur: PhieuDat | null = null;
    for (const ca of g.ca.sort((a, b) => a.id.localeCompare(b.id))) {
      if (!cur || (cur.dong.length + ca.dong.length > DONG_MOI_PHIEU && cur.dong.length > 0)) {
        cur = { ma_ktv: maKtv, ten_nguoi_nhan: g.ten, ca: [], dong: [] };
        phieu.push(cur);
      }
      cur.ca.push(ca.id);
      cur.dong.push(...ca.dong);
    }
  }
  return { keHoach: { phieu, bo_qua: boQua }, donSong };
}

function bodyPhieu(p: PhieuDat, emailNguoiDat: string) {
  return {
    email_nguoi_dat: emailNguoiDat,
    ma_ktv: p.ma_ktv,
    ghi_chu: `Đặt lõi lọc NSKX từ DVBH (QL NSKX) — ${p.ca.length} ca`,
    don_hang: p.dong.map((d) => ({
      ma_lk: d.ma_lk,
      loai_de_xuat: LOAI_DE_XUAT_TG12_NSKX,
      so_luong: d.so_luong,
      ma_yeu_cau_su_co: d.case_id,
      ghi_chu: `Lõi lọc NSKX ca ${d.case_id}`,
    })),
  };
}

export type DongKiemTra = DongDat & { trang_thai: string | null; loi: string | null; thong_diep: string | null };
export type KetQuaKiemTra = { loi_phieu: string | null; dong: DongKiemTra[] };

/** /v1/dat-hang/kiem-tra cho 1 phieu (khong ghi). Map ket qua ve dong goc qua "goc" (combo tach nhieu dong -> lay dong loi dau tien). */
export async function kiemTraPhieu(env: Env, p: PhieuDat, emailNguoiDat: string): Promise<KetQuaKiemTra> {
  const r = await goiLk(env, "/api/partner/v1/dat-hang/kiem-tra", bodyPhieu(p, emailNguoiDat), 30000);
  if (r.status !== 200) return { loi_phieu: String(r.body.error ?? `HTTP_${r.status}`), dong: p.dong.map((d) => ({ ...d, trang_thai: null, loi: null, thong_diep: null })) };
  const ds = (r.body.dong as { goc?: number; trang_thai?: string; loi?: string | null; thong_diep?: string | null }[] | undefined) ?? [];
  const out: DongKiemTra[] = p.dong.map((d) => ({ ...d, trang_thai: null, loi: null, thong_diep: null }));
  ds.forEach((k, i) => {
    const o = out[typeof k.goc === "number" ? k.goc : i];
    if (!o) return;
    if (k.loi && !o.loi) {
      o.loi = k.loi;
      o.thong_diep = k.thong_diep ?? null;
    }
    if (!o.trang_thai) o.trang_thai = k.trang_thai ?? null;
  });
  const loiPhieu = (r.body.loi_phieu as string | null | undefined) ?? null;
  // MA_LK_NOT_FOUND tra kem ma_lk -> danh dau dong do (nguoi goi bo dong roi kiem tra lai), khong coi la loi ca phieu.
  if (loiPhieu === "MA_LK_NOT_FOUND" && typeof r.body.ma_lk === "string") {
    for (const o of out) if (o.ma_lk === r.body.ma_lk) {
      o.loi = "MA_LK_NOT_FOUND";
      o.thong_diep = "Mã không có trong danh mục linh-kien-app";
    }
    return { loi_phieu: null, dong: out };
  }
  return { loi_phieu: loiPhieu, dong: out };
}

const LOI_PHIEU_VI: Record<string, string> = {
  KEY_KHONG_DUOC_DAT_THAY_NGUOI_DUNG: "Khóa API của DVBH chưa được bật “đặt thay đúng người bấm” bên linh-kien-app (Admin linh-kien-app: Cài đặt › API đối tác).",
  KEY_CHUA_DUOC_CAP_QUYEN_DAT_HANG: "Khóa API của DVBH chưa được cấp quyền đặt hàng bên linh-kien-app.",
  TAI_KHOAN_DAT_HANG_KHONG_TON_TAI: "Tài khoản của bạn chưa có trên linh-kien-app.",
  TAI_KHOAN_DAT_HANG_BI_KHOA: "Tài khoản của bạn bị khoá trên linh-kien-app.",
  TAI_KHOAN_DAT_HANG_CHUA_DUYET: "Tài khoản của bạn chưa được duyệt trên linh-kien-app.",
  FORBIDDEN_ROLE: "Tài khoản của bạn trên linh-kien-app không có quyền đặt hộ KTV (cần Giám sát / Tác nghiệp / Admin).",
  KHONG_TIM_THAY_NGUOI_NHAN: "Không tìm thấy người nhận (mã KTV chưa có tài khoản đăng nhập trên linh-kien-app).",
  KTV_CHUA_CO_MA_MISA: "Người nhận chưa có mã MISA trên linh-kien-app.",
  NGUOI_NHAN_HANG_KHONG_HOP_LE: "Người nhận không hợp lệ trên linh-kien-app.",
  NGUOI_NHAN_HANG_DA_TAT: "Tài khoản người nhận đã tắt trên linh-kien-app.",
  LOAI_DE_XUAT_KHONG_HOP_LE: "Loại đề xuất “HỖ TRỢ NGOÀI BẢO HÀNH TG12-NSKX” không còn bật bên linh-kien-app.",
};
export const moTaLoi = (ma: string | null | undefined) => (ma ? LOI_PHIEU_VI[ma] ?? ma : null);

async function sha(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type KetQuaTao = {
  ma_ktv: string;
  ten_nguoi_nhan: string;
  ca: string[];
  phieu_id: string | null;
  trung_lap: boolean;
  loi: string | null;
  dong: (DongKiemTra & { don_id?: string | null })[];
};

/** Kiem tra + tao 1 phieu: bo dong bi chan (toi da 5 vong), tao phan con lai voi ma_yeu_cau tat dinh, ghi nskx_dat_loi_log. */
export async function taoPhieu(env: Env, db: D1Database, p: PhieuDat, emailNguoiDat: string): Promise<KetQuaTao> {
  let conLai = p;
  const biBo: DongKiemTra[] = [];
  let kt: KetQuaKiemTra | null = null;
  for (let vong = 0; vong < 5 && conLai.dong.length; vong++) {
    kt = await kiemTraPhieu(env, conLai, emailNguoiDat);
    if (kt.loi_phieu) break;
    const loi = kt.dong.filter((d) => d.loi);
    if (!loi.length) break;
    biBo.push(...loi);
    // Bo ca CA co dong bi chan? Khong - chi bo dong loi, cac loi khac cua ca van dat.
    const dongMoi = kt.dong.filter((d) => !d.loi);
    conLai = { ...conLai, dong: dongMoi, ca: [...new Set(dongMoi.map((d) => d.case_id))] };
    kt = null;
  }
  const kq: KetQuaTao = { ma_ktv: p.ma_ktv, ten_nguoi_nhan: p.ten_nguoi_nhan, ca: p.ca, phieu_id: null, trung_lap: false, loi: null, dong: [...biBo] };
  const ghiLog = (maYeuCau: string, phieuId: string | null, ketQua: unknown, loi: string | null, soDong: number) =>
    db
      .prepare("INSERT INTO nskx_dat_loi_log (ma_yeu_cau, phieu_id, nguoi_dat, ma_ktv, ds_ca, so_dong, ket_qua, loi, ngay) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(maYeuCau, phieuId, emailNguoiDat, p.ma_ktv, JSON.stringify(p.ca), soDong, ketQua ? JSON.stringify(ketQua).slice(0, 20000) : null, loi, nowVN())
      .run();
  if (kt?.loi_phieu) {
    kq.loi = moTaLoi(kt.loi_phieu);
    kq.dong.push(...kt.dong);
    await ghiLog("-", null, null, kt.loi_phieu, 0);
    return kq;
  }
  if (!conLai.dong.length) {
    kq.loi = "Mọi dòng của phiếu đều bị chặn — xem lý do từng dòng.";
    return kq;
  }
  const body = bodyPhieu(conLai, emailNguoiDat);
  const maYeuCau = `NSKX-${(await sha(`${emailNguoiDat}|${p.ma_ktv}|${JSON.stringify(body.don_hang)}`)).slice(0, 24)}`;
  let r: { status: number; body: Record<string, unknown> };
  try {
    r = await goiLk(env, "/api/partner/v1/dat-hang", { ...body, ma_yeu_cau: maYeuCau }, 90000);
  } catch (err) {
    kq.loi = `Không rõ kết quả (${String(err instanceof Error ? err.message : err).slice(0, 150)}). Bấm đặt lại — hệ thống không tạo trùng.`;
    kq.dong.push(...conLai.dong.map((d) => ({ ...d, trang_thai: null, loi: "KHONG_RO", thong_diep: null })));
    await ghiLog(maYeuCau, null, null, kq.loi, conLai.dong.length);
    return kq;
  }
  if (r.status !== 200 && r.status !== 201) {
    const loiDong = (r.body.loi as { ma?: string; thongDiep?: string }[] | undefined) ?? [];
    kq.loi = loiDong.length ? loiDong.map((l) => l.thongDiep ?? l.ma).join(" · ") : moTaLoi(String(r.body.error ?? `HTTP_${r.status}`));
    kq.dong.push(...conLai.dong.map((d) => ({ ...d, trang_thai: null, loi: String(r.body.error ?? "LOI"), thong_diep: null })));
    await ghiLog(maYeuCau, null, r.body, String(r.body.error ?? r.status), conLai.dong.length);
    return kq;
  }
  kq.phieu_id = String(r.body.id ?? "") || null;
  kq.trung_lap = r.body.trung_lap === true;
  const dongTao = (r.body.dong as { id?: string; trang_thai?: string; ly_do?: string | null }[] | undefined) ?? [];
  // Combo co the tach nhieu don - chi khop theo thu tu khi so dong bang nhau; khac thi bo id don (van xem duoc o tab Mua hang).
  const khop = dongTao.length === conLai.dong.length;
  kq.dong.push(
    ...conLai.dong.map((d, i) => ({
      ...d,
      trang_thai: khop ? dongTao[i]?.trang_thai ?? "Đã tạo" : "Đã tạo",
      loi: null,
      thong_diep: khop ? dongTao[i]?.ly_do ?? null : null,
      don_id: khop ? dongTao[i]?.id ?? null : null,
    })),
  );
  await ghiLog(maYeuCau, kq.phieu_id, r.body, null, conLai.dong.length);
  return kq;
}

/** Khoa tam cac ca (bo khoa qua han). Tra cac ca khoa duoc (cua minh) + cac ca dang bi nguoi khac khoa. */
export async function khoaCa(db: D1Database, ids: string[], email: string): Promise<{ cuaMinh: string[]; nguoiKhac: string[]; luc: string }> {
  const luc = nowVN();
  const hetHan = new Date(Date.now() + 7 * 3600_000 - KHOA_HET_HAN_PHUT * 60_000).toISOString().slice(0, 19).replace("T", " ");
  const json = JSON.stringify(ids);
  await db.batch([
    db.prepare("DELETE FROM nskx_dat_loi_khoa WHERE case_id IN (SELECT value FROM json_each(?)) AND luc < ?").bind(json, hetHan),
    db.prepare("INSERT OR IGNORE INTO nskx_dat_loi_khoa (case_id, nguoi, luc) SELECT value, ?, ? FROM json_each(?)").bind(email, luc, json),
  ]);
  const { results } = await db
    .prepare("SELECT case_id, nguoi, luc FROM nskx_dat_loi_khoa WHERE case_id IN (SELECT value FROM json_each(?))")
    .bind(json)
    .all<{ case_id: string; nguoi: string; luc: string }>();
  // Khoa cu cua CHINH nguoi nay (lan truoc bi ngat giua chung) van tinh la cua minh - trung lap neu co do ma_yeu_cau tat dinh chan.
  const cuaMinh = results.filter((r) => r.nguoi === email).map((r) => String(r.case_id));
  const set = new Set(cuaMinh);
  return { cuaMinh, nguoiKhac: ids.filter((id) => !set.has(id)), luc };
}

export async function moKhoaCa(db: D1Database, ids: string[], email: string): Promise<void> {
  if (!ids.length) return;
  await db.prepare("DELETE FROM nskx_dat_loi_khoa WHERE case_id IN (SELECT value FROM json_each(?)) AND nguoi = ?").bind(JSON.stringify(ids), email).run();
}
