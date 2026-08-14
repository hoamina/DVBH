import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { nextSequentialId } from "../lib/idCounter";
import { nowVN } from "../lib/vnTime";
import { scopeDatMuaNguoiTao } from "../lib/scopeDatMua";
import { bumpVersions } from "../lib/dataVersions";

// Luong chinh "Dat mua linh kien" - phieu dat (header) + dong don hang - xem migration
// 0056_phieu_dat.sql. Trang thai phieu_dat LUON suy tu phieu_dat_log MOI NHAT (pattern header+log
// giong tranh_chap_tien_trinh, xem lib/scopeDatMua.ts cho quy tac phan quyen xem).
//
// CHOT 2026-08-13: GS KHONG duyet phieu_dat - luong di thang "Cho Ve tinh duyet" (neu nguoi tao la
// Ve tinh) hoac "Cho TN duyet" (neu nguoi tao la KTV/Tram) -> TN duyet/tu choi.
const datMuaLinhKien = new Hono<{ Bindings: Env }>();
datMuaLinhKien.use("*", verifySessionMiddleware, loadUser);

const TRANG_THAI_DONG = ["TN da duyet", "TN tu choi", "Da huy"] as const;

function latestPhieuDatStatusExpr(phieuDatIdCol: string): string {
  return `(SELECT trang_thai FROM phieu_dat_log WHERE phieu_dat_id = ${phieuDatIdCol} ORDER BY id DESC LIMIT 1)`;
}

function canCreatePhieuDat(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!(user.la_ktv_dvbh || user.la_ve_tinh || canTacNghiep(c) || user.vai_tro === "Giam sat");
}

function canTacNghiep(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return user.vai_tro === "TBP DVBH" || user.vai_tro === "Admin";
}

// Tien to ID phieu_dat theo VAI TRO nguoi goi API luc tao (khong luu cot rieng) - chot buoc 1 ke
// hoach "Luong tao don mua hang": XH- (KTV/Ve tinh tu tao), TN- (Tac nghiep tao ho), AD- (GS tao
// ho). Uu tien TN/GS truoc vi 1 nguoi co the vua la_ktv_dvbh vua giu vai_tro khac.
function phieuDatPrefix(c: Context<{ Bindings: Env }>): "XH" | "TN" | "AD" {
  const user = c.get("user");
  if (canTacNghiep(c)) return "TN";
  if (user.vai_tro === "Giam sat") return "AD";
  return "XH";
}

// GET /api/dat-mua-lk/ve-tinh-cua-toi - danh sach Ve tinh (email + ten) co tram_cha = nguoi goi,
// dung cho dropdown filter "nguoi tao" o buoc 5 ke hoach (duyet hang loat cho Tram). Tram nao khong
// co Ve tinh nao thi tra rows rong (khong loi).
datMuaLinhKien.get("/ve-tinh-cua-toi", async (c) => {
  const user = c.get("user");
  const { results } = await c.env.DB.prepare("SELECT email, ten FROM users WHERE tram_cha = ? ORDER BY ten").bind(user.email).all();
  return c.json({ rows: results });
});

// GET /api/dat-mua-lk/phieu-dat?trang_thai=&nguoi_tao=&tu_ngay=&den_ngay=&page=&pageSize() -
// danh sach, scope theo quan he nguoi dung (xem scopeDatMuaNguoiTao). Mac dinh khong loc trang
// thai (client tu chon tab). nguoi_tao/tu_ngay/den_ngay them o buoc 5 ke hoach - loc trong pham vi
// Tram da xem duoc qua scope, khong mo rong quyen xem.
datMuaLinhKien.get("/phieu-dat", async (c) => {
  const scope = scopeDatMuaNguoiTao(c);
  const trangThai = c.req.query("trang_thai");
  const nguoiTao = c.req.query("nguoi_tao");
  const tuNgay = c.req.query("tu_ngay");
  const denNgay = c.req.query("den_ngay");
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;

  let whereSql = "1=1" + (scope?.whereSql ?? "");
  const binds: unknown[] = [...(scope?.binds ?? [])];
  if (trangThai) {
    whereSql += ` AND ${latestPhieuDatStatusExpr("pd.id")} = ?`;
    binds.push(trangThai);
  }
  if (nguoiTao) {
    whereSql += " AND pd.nguoi_tao = ?";
    binds.push(nguoiTao);
  }
  if (tuNgay) {
    whereSql += " AND pd.ngay_tao >= ?";
    binds.push(tuNgay);
  }
  if (denNgay) {
    whereSql += " AND pd.ngay_tao <= ?";
    binds.push(denNgay + " 23:59:59");
  }

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM phieu_dat pd WHERE ${whereSql}`)
    .bind(...binds)
    .first<{ total: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT pd.id, pd.nguoi_tao, pd.ngay_tao, pd.email_gs, pd.ghi_chu,
       ${latestPhieuDatStatusExpr("pd.id")} as trang_thai,
       (SELECT COUNT(*) FROM dat_don_hang WHERE phieu_dat_id = pd.id) as so_dong
     FROM phieu_dat pd
     WHERE ${whereSql}
     ORDER BY pd.ngay_tao DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize, offset)
    .all();

  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0 });
});

// POST /api/dat-mua-lk/phieu-dat - { ghi_chu?, don_hang: [{ ma_lk, loai_don, loai_de_xuat?,
// so_luong_de_xuat, ly_do_cham?, so_tien_cong_no? }] } - KTV/Tram/Ve tinh tao phieu + >=1 dong don
// hang trong 1 lan. email_gs tu dien tu users.giam_sat_quan_ly (chi de theo doi). Trang thai dau
// tien: "Cho Ve tinh duyet" neu nguoi tao la Ve tinh (Tram phai duyet/day len truoc khi den TN),
// nguoc lai "Cho TN duyet" luon (KTV/Tram di thang TN, KHONG qua GS - chot 2026-08-13).
datMuaLinhKien.post("/phieu-dat", async (c) => {
  if (!canCreatePhieuDat(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const body = await c.req.json<{
    ghi_chu?: string;
    don_hang: { ma_lk: string; loai_don: "mua" | "cong_no" | "tra_hang"; loai_de_xuat?: string; so_luong_de_xuat: number; ly_do_cham?: string; so_tien_cong_no?: number }[];
  }>();
  if (!Array.isArray(body.don_hang) || body.don_hang.length === 0) return c.json({ error: "MISSING_DON_HANG" }, 400);

  const user = c.get("user");
  const now = nowVN();
  const phieuDatId = await nextSequentialId(c.env.DB, "phieu_dat", phieuDatPrefix(c), 6);

  const statements = [
    c.env.DB.prepare("INSERT INTO phieu_dat (id, nguoi_tao, ngay_tao, email_gs, ghi_chu, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(
      phieuDatId,
      user.email,
      now,
      user.giam_sat_quan_ly,
      body.ghi_chu?.trim() || null,
      now,
    ),
    c.env.DB.prepare("INSERT INTO phieu_dat_log (phieu_dat_id, trang_thai, nguoi_xu_ly, ngay_xu_ly) VALUES (?, ?, ?, ?)").bind(
      phieuDatId,
      user.la_ve_tinh ? "Cho Ve tinh duyet" : "Cho TN duyet",
      user.email,
      now,
    ),
  ];

  for (const dh of body.don_hang) {
    if (!dh.ma_lk?.trim() || !dh.so_luong_de_xuat || dh.so_luong_de_xuat <= 0) return c.json({ error: "INVALID_DON_HANG" }, 400);
    const lk = await c.env.DB.prepare("SELECT ten_lk, gia_tham_chieu FROM lk_danh_muc WHERE ma_lk = ?")
      .bind(dh.ma_lk.trim())
      .first<{ ten_lk: string; gia_tham_chieu: number | null }>();
    if (!lk) return c.json({ error: "MA_LK_NOT_FOUND", ma_lk: dh.ma_lk }, 400);

    const donHangId = await nextSequentialId(c.env.DB, "dat_don_hang", "DDH", 6);
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO dat_don_hang
           (id, phieu_dat_id, loai_don, ma_lk, ten_lk_snapshot, loai_de_xuat, so_luong_de_xuat, gia_de_xuat, ly_do_cham, so_tien_cong_no, nguoi_tao, ngay_tao, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        donHangId,
        phieuDatId,
        dh.loai_don,
        dh.ma_lk.trim(),
        lk.ten_lk,
        dh.loai_de_xuat?.trim() || null,
        dh.so_luong_de_xuat,
        lk.gia_tham_chieu,
        dh.ly_do_cham?.trim() || null,
        dh.loai_don === "cong_no" ? dh.so_tien_cong_no ?? null : null,
        user.email,
        now,
        now,
      ),
    );
  }

  await c.env.DB.batch(statements);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["cases"]));
  return c.json({ id: phieuDatId }, 201);
});

// GET /api/dat-mua-lk/phieu-dat/:id - chi tiet + dong don hang + log + case gan kem.
datMuaLinhKien.get("/phieu-dat/:id", async (c) => {
  const id = c.req.param("id");
  const pd = await c.env.DB.prepare(`SELECT pd.*, ${latestPhieuDatStatusExpr("pd.id")} as trang_thai FROM phieu_dat pd WHERE pd.id = ?`)
    .bind(id)
    .first();
  if (!pd) return c.json({ error: "NOT_FOUND" }, 404);

  const { results: donHang } = await c.env.DB.prepare("SELECT * FROM dat_don_hang WHERE phieu_dat_id = ? ORDER BY ngay_tao ASC").bind(id).all<{ id: string }>();
  const { results: logs } = await c.env.DB.prepare("SELECT * FROM phieu_dat_log WHERE phieu_dat_id = ? ORDER BY id DESC").bind(id).all();

  const donHangIds = (donHang as { id: string }[]).map((d) => d.id);
  let caseByDonHang: Record<string, unknown[]> = {};
  if (donHangIds.length > 0) {
    const placeholders = donHangIds.map(() => "?").join(", ");
    const { results: cases } = await c.env.DB.prepare(
      `SELECT ddc.dat_don_hang_id, c.id, c.khach_hang, c.khu_vuc FROM dat_don_case ddc JOIN case_dvbh c ON c.id = ddc.case_id WHERE ddc.dat_don_hang_id IN (${placeholders})`,
    )
      .bind(...donHangIds)
      .all<{ dat_don_hang_id: string }>();
    caseByDonHang = {};
    for (const row of cases as Record<string, unknown>[]) {
      const key = row.dat_don_hang_id as string;
      (caseByDonHang[key] ??= []).push(row);
    }
  }

  return c.json({
    phieuDat: pd,
    donHang: (donHang as { id: string }[]).map((d) => ({ ...d, cases: caseByDonHang[d.id] ?? [] })),
    logs,
  });
});

// Logic dung chung cho 1 phieu_dat - tach ra de route bulk-log (buoc 5 ke hoach "Luong tao don
// mua hang", diem 11) tai su dung dung 1 cho, khong copy lai role-check. Tra { error, status } khi
// khong hop le, hoac { nextTrangThai } khi thanh cong (da INSERT log + UPDATE updated_at).
async function applyPhieuDatLog(
  c: Context<{ Bindings: Env }>,
  id: string,
  hanhDong: "duyet" | "tu_choi" | "huy",
  ghiChu: string | undefined,
): Promise<{ error: string; status: 404 | 409 | 403 } | { nextTrangThai: string }> {
  const pd = await c.env.DB.prepare(`SELECT nguoi_tao, ${latestPhieuDatStatusExpr("id")} as trang_thai FROM phieu_dat WHERE id = ?`)
    .bind(id)
    .first<{ nguoi_tao: string; trang_thai: string | null }>();
  if (!pd) return { error: "NOT_FOUND", status: 404 };
  if (pd.trang_thai && (TRANG_THAI_DONG as readonly string[]).includes(pd.trang_thai)) return { error: "PHIEU_DA_DONG", status: 409 };

  const user = c.get("user");
  let nextTrangThai: string;

  if (hanhDong === "huy") {
    const nguoiTaoRow = await c.env.DB.prepare("SELECT tram_cha FROM users WHERE email = ?").bind(pd.nguoi_tao).first<{ tram_cha: string | null }>();
    const isOwnerOrTram = pd.nguoi_tao === user.email || nguoiTaoRow?.tram_cha === user.email;
    if (!isOwnerOrTram && user.vai_tro !== "Admin") return { error: "FORBIDDEN_ROLE", status: 403 };
    nextTrangThai = "Da huy";
  } else if (pd.trang_thai === "Cho Ve tinh duyet") {
    const nguoiTaoRow = await c.env.DB.prepare("SELECT tram_cha FROM users WHERE email = ?").bind(pd.nguoi_tao).first<{ tram_cha: string | null }>();
    if (nguoiTaoRow?.tram_cha !== user.email && user.vai_tro !== "Admin") return { error: "FORBIDDEN_ROLE", status: 403 };
    nextTrangThai = hanhDong === "duyet" ? "Cho TN duyet" : "Da huy";
  } else if (pd.trang_thai === "Cho TN duyet") {
    if (!canTacNghiep(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    nextTrangThai = hanhDong === "duyet" ? "TN da duyet" : "TN tu choi";
  } else {
    return { error: "INVALID_STATE", status: 409 };
  }

  await c.env.DB.prepare("INSERT INTO phieu_dat_log (phieu_dat_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)")
    .bind(id, nextTrangThai, user.email, nowVN(), ghiChu?.trim() || null)
    .run();
  await c.env.DB.prepare("UPDATE phieu_dat SET updated_at = ? WHERE id = ?").bind(nowVN(), id).run();

  return { nextTrangThai };
}

// POST /api/dat-mua-lk/phieu-dat/:id/log - chuyen trang thai (Tram duyet/day len TN, TN duyet/tu
// choi, huy). Chi cho phep dung buoc hop le tiep theo tuy vao ai goi:
//  - Tram (la_ktv_dvbh + co Ve tinh thuoc minh) tren phieu dang "Cho Ve tinh duyet" cua chinh Ve
//    tinh minh quan ly: chuyen sang "Cho TN duyet" (duyet) hoac "Da huy" (tu choi).
//  - TN (TBP DVBH/Admin) tren phieu dang "Cho TN duyet": chuyen "TN da duyet" hoac "TN tu choi".
//  - Nguoi tao (hoac Tram cua nguoi tao): huy phieu khi con dang mo (chua vao trang thai dong).
datMuaLinhKien.post("/phieu-dat/:id/log", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ hanh_dong: "duyet" | "tu_choi" | "huy"; ghi_chu?: string }>();
  const result = await applyPhieuDatLog(c, id, body.hanh_dong, body.ghi_chu);
  if ("error" in result) return c.json({ error: result.error }, result.status);

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["cases"]));
  return c.json({ ok: true, trang_thai: result.nextTrangThai });
});

// POST /api/dat-mua-lk/phieu-dat/bulk-log - { ids, hanh_dong, ghi_chu? } cho Tram duyet/tu choi
// nhieu phieu cua cac Ve tinh minh quan ly trong 1 lan (buoc 5 ke hoach, diem 11) - tai dung dung
// 1 logic role-check voi route don le, khong duplicate.
datMuaLinhKien.post("/phieu-dat/bulk-log", async (c) => {
  const body = await c.req.json<{ ids: string[]; hanh_dong: "duyet" | "tu_choi" | "huy"; ghi_chu?: string }>();
  if (!Array.isArray(body.ids) || body.ids.length === 0) return c.json({ error: "MISSING_IDS" }, 400);

  const results: Record<string, string> = {};
  for (const id of body.ids) {
    const result = await applyPhieuDatLog(c, id, body.hanh_dong, body.ghi_chu);
    results[id] = "error" in result ? result.error : result.nextTrangThai;
  }

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["cases"]));
  return c.json({ results });
});

// PATCH /api/dat-mua-lk/don-hang/:id - TN sua gia chot/so luong thuc xuat/ma xuat kho/ma MISA.
// Rang buoc buoc 6 ke hoach (diem 18): khi gan ma_xuat_kho thi phai co phieu_so_tien lien ket voi
// phieu_dat cha o trang_thai 'TN da duyet'. Ngoai le: loai_don='tra_hang' khong bat buoc (khong co
// phieu so tien trong quy trinh tra hang).
datMuaLinhKien.patch("/don-hang/:id", async (c) => {
  if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const id = c.req.param("id");
  const body = await c.req.json<{ so_luong_thuc_xuat?: number; gia_chot?: number; ma_xuat_kho?: string; ma_misa?: string }>();
  const existing = await c.env.DB.prepare("SELECT phieu_dat_id, loai_don, ma_xuat_kho, so_luong_thuc_xuat, gia_chot, ma_misa FROM dat_don_hang WHERE id = ?")
    .bind(id)
    .first<{ phieu_dat_id: string; loai_don: string; ma_xuat_kho: string | null; so_luong_thuc_xuat: number | null; gia_chot: number | null; ma_misa: string | null }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const newMaXuatKho = body.ma_xuat_kho !== undefined ? body.ma_xuat_kho?.trim() || null : existing.ma_xuat_kho;
  const isAssigningMaXuatKho = newMaXuatKho !== null && newMaXuatKho !== existing.ma_xuat_kho;

  if (isAssigningMaXuatKho && existing.loai_don !== "tra_hang") {
    const approved = await c.env.DB.prepare(
      "SELECT id FROM phieu_so_tien WHERE phieu_dat_id = ? AND trang_thai = 'TN da duyet' LIMIT 1",
    )
      .bind(existing.phieu_dat_id)
      .first();
    if (!approved) return c.json({ error: "MISSING_PHIEU_SO_TIEN_APPROVED" }, 409);
  }

  const next = {
    so_luong_thuc_xuat: body.so_luong_thuc_xuat !== undefined ? body.so_luong_thuc_xuat : existing.so_luong_thuc_xuat,
    gia_chot: body.gia_chot !== undefined ? body.gia_chot : existing.gia_chot,
    ma_xuat_kho: newMaXuatKho,
    ma_misa: body.ma_misa !== undefined ? body.ma_misa?.trim() || null : existing.ma_misa,
  };

  await c.env.DB.prepare("UPDATE dat_don_hang SET so_luong_thuc_xuat = ?, gia_chot = ?, ma_xuat_kho = ?, ma_misa = ?, updated_at = ? WHERE id = ?")
    .bind(next.so_luong_thuc_xuat, next.gia_chot, next.ma_xuat_kho, next.ma_misa, nowVN(), id)
    .run();

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["cases"]));
  return c.json({ ok: true });
});

// DELETE /api/dat-mua-lk/don-hang/:id - xoa 1 dong (chi khi phieu dat cha con dang mo).
datMuaLinhKien.delete("/don-hang/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare(
    `SELECT ddh.phieu_dat_id, ${latestPhieuDatStatusExpr("ddh.phieu_dat_id")} as trang_thai FROM dat_don_hang ddh WHERE ddh.id = ?`,
  )
    .bind(id)
    .first<{ phieu_dat_id: string; trang_thai: string | null }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
  if (existing.trang_thai && (TRANG_THAI_DONG as readonly string[]).includes(existing.trang_thai)) return c.json({ error: "PHIEU_DA_DONG" }, 409);

  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM dat_don_case WHERE dat_don_hang_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM dat_don_hang WHERE id = ?").bind(id),
  ]);
  return c.json({ ok: true });
});

// POST /api/dat-mua-lk/don-hang/:id/case - { case_id } gan 1 case_dvbh vao dong don hang.
datMuaLinhKien.post("/don-hang/:id/case", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ case_id: string }>();
  if (!body.case_id?.trim()) return c.json({ error: "MISSING_CASE_ID" }, 400);

  const donHang = await c.env.DB.prepare("SELECT id FROM dat_don_hang WHERE id = ?").bind(id).first();
  if (!donHang) return c.json({ error: "NOT_FOUND" }, 404);
  const caseRow = await c.env.DB.prepare("SELECT id FROM case_dvbh WHERE id = ?").bind(body.case_id.trim()).first();
  if (!caseRow) return c.json({ error: "CASE_NOT_FOUND" }, 404);

  await c.env.DB.prepare("INSERT OR IGNORE INTO dat_don_case (dat_don_hang_id, case_id) VALUES (?, ?)").bind(id, body.case_id.trim()).run();
  return c.json({ ok: true }, 201);
});

datMuaLinhKien.delete("/don-hang/:id/case/:caseId", async (c) => {
  const id = c.req.param("id");
  const caseId = c.req.param("caseId");
  await c.env.DB.prepare("DELETE FROM dat_don_case WHERE dat_don_hang_id = ? AND case_id = ?").bind(id, caseId).run();
  return c.json({ ok: true });
});

// ---------- Nhanh "thieu linh kien" (state machine doc lap - xem migration 0057) ----------
// Khong chan luong dat_don_hang chinh - chi de theo doi rieng khi kho bao thieu hang tai thoi
// diem chuan bi xuat. Nguoi tao (KTV/Tram/Ve tinh cua dong don) hoac TN tao duoc, Kho xu ly.

const THIEU_LK_TRANG_THAI_DONG = ["Da huy bo", "Da ket thuc"] as const;

function latestThieuLkStatusExpr(thieuLkIdCol: string): string {
  return `(SELECT trang_thai FROM thieu_lk_log WHERE thieu_lk_id = ${thieuLkIdCol} ORDER BY id DESC LIMIT 1)`;
}

function canKho(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!user.la_kho || user.vai_tro === "Admin";
}

// POST /api/dat-mua-lk/don-hang/:id/thieu-lk - { ly_do? } tao nhanh thieu LK cho 1 dong don hang.
// Log dau tien luon "Cho kho xu ly".
datMuaLinhKien.post("/don-hang/:id/thieu-lk", async (c) => {
  const donHangId = c.req.param("id");
  const body = await c.req.json<{ ly_do?: string }>();
  const donHang = await c.env.DB.prepare("SELECT id FROM dat_don_hang WHERE id = ?").bind(donHangId).first();
  if (!donHang) return c.json({ error: "NOT_FOUND" }, 404);

  const user = c.get("user");
  const now = nowVN();
  const thieuLkId = await nextSequentialId(c.env.DB, "thieu_lk", "TLK", 6);

  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO thieu_lk (id, dat_don_hang_id, ly_do, nguoi_tao, ngay_tao) VALUES (?, ?, ?, ?, ?)").bind(
      thieuLkId,
      donHangId,
      body.ly_do?.trim() || null,
      user.email,
      now,
    ),
    c.env.DB.prepare("INSERT INTO thieu_lk_log (thieu_lk_id, trang_thai, nguoi_xu_ly, ngay_xu_ly) VALUES (?, ?, ?, ?)").bind(
      thieuLkId,
      "Cho kho xu ly",
      user.email,
      now,
    ),
  ]);

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["cases"]));
  return c.json({ id: thieuLkId }, 201);
});

// GET /api/dat-mua-lk/thieu-lk?dat_don_hang_id=&trang_thai= - danh sach, Kho/TN xem toan bo, nguoi
// khac chi xem thieu-lk cua dong don hang minh tao.
datMuaLinhKien.get("/thieu-lk", async (c) => {
  const user = c.get("user");
  const donHangId = c.req.query("dat_don_hang_id");
  const trangThai = c.req.query("trang_thai");

  let whereSql = "1=1";
  const binds: unknown[] = [];
  if (!canKho(c) && !canTacNghiep(c)) {
    whereSql += " AND tlk.nguoi_tao = ?";
    binds.push(user.email);
  }
  if (donHangId) {
    whereSql += " AND tlk.dat_don_hang_id = ?";
    binds.push(donHangId);
  }
  if (trangThai) {
    whereSql += ` AND ${latestThieuLkStatusExpr("tlk.id")} = ?`;
    binds.push(trangThai);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT tlk.*, ${latestThieuLkStatusExpr("tlk.id")} as trang_thai FROM thieu_lk tlk WHERE ${whereSql} ORDER BY tlk.ngay_tao DESC`,
  )
    .bind(...binds)
    .all();
  return c.json({ rows: results });
});

// POST /api/dat-mua-lk/thieu-lk/:id/log - Kho (hoac Admin) cap nhat trang thai xu ly. Nguoi tao co
// the "Da huy bo" khi con dang mo.
datMuaLinhKien.post("/thieu-lk/:id/log", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ trang_thai: string; ghi_chu?: string }>();
  const tlk = await c.env.DB.prepare(`SELECT nguoi_tao, ${latestThieuLkStatusExpr("id")} as trang_thai FROM thieu_lk WHERE id = ?`)
    .bind(id)
    .first<{ nguoi_tao: string; trang_thai: string | null }>();
  if (!tlk) return c.json({ error: "NOT_FOUND" }, 404);
  if (tlk.trang_thai && (THIEU_LK_TRANG_THAI_DONG as readonly string[]).includes(tlk.trang_thai)) return c.json({ error: "DA_DONG" }, 409);

  const user = c.get("user");
  const isCancel = body.trang_thai === "Da huy bo";
  if (isCancel) {
    if (tlk.nguoi_tao !== user.email && user.vai_tro !== "Admin") return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  } else if (!canKho(c)) {
    return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  }

  const validNext = ["Kho da tiep nhan", "Kho xac nhan hang da ve", "Kho tu choi sai TT", "Da huy bo", "Da ket thuc"];
  if (!validNext.includes(body.trang_thai)) return c.json({ error: "INVALID_TRANG_THAI" }, 400);

  await c.env.DB.prepare("INSERT INTO thieu_lk_log (thieu_lk_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)")
    .bind(id, body.trang_thai, user.email, nowVN(), body.ghi_chu?.trim() || null)
    .run();

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["cases"]));
  return c.json({ ok: true });
});

// ---------- Phieu so tien (xem migration 0058_phieu_xuat_kho.sql) ----------
// Luong 5 buoc tuyen tinh, dung cot trang_thai truc tiep (khong bang log rieng): TN tao "Cho KTV
// chuyen" -> KTV dinh bang chung "KTV da chuyen" -> TN duyet "TN da duyet" (hoac tu choi/huy).

datMuaLinhKien.get("/phieu-so-tien", async (c) => {
  const phieuDatId = c.req.query("phieu_dat_id");
  let whereSql = "1=1";
  const binds: unknown[] = [];
  if (phieuDatId) {
    whereSql += " AND phieu_dat_id = ?";
    binds.push(phieuDatId);
  }
  const { results } = await c.env.DB.prepare(`SELECT * FROM phieu_so_tien WHERE ${whereSql} ORDER BY ngay_tao DESC`).bind(...binds).all();
  return c.json({ rows: results });
});

// POST /api/dat-mua-lk/phieu-so-tien - { phieu_dat_id, so_tien, ghi_chu? } TN tao.
datMuaLinhKien.post("/phieu-so-tien", async (c) => {
  if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const body = await c.req.json<{ phieu_dat_id: string; so_tien: number; ghi_chu?: string }>();
  if (!body.phieu_dat_id?.trim() || !body.so_tien || body.so_tien <= 0) return c.json({ error: "MISSING_FIELDS" }, 400);

  const pd = await c.env.DB.prepare("SELECT id FROM phieu_dat WHERE id = ?").bind(body.phieu_dat_id.trim()).first();
  if (!pd) return c.json({ error: "PHIEU_DAT_NOT_FOUND" }, 404);

  const user = c.get("user");
  const id = await nextSequentialId(c.env.DB, "phieu_so_tien", "PST", 6);
  await c.env.DB.prepare(
    "INSERT INTO phieu_so_tien (id, phieu_dat_id, so_tien, ghi_chu, nguoi_tao, ngay_tao) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, body.phieu_dat_id.trim(), body.so_tien, body.ghi_chu?.trim() || null, user.email, nowVN())
    .run();

  return c.json({ id }, 201);
});

// PATCH /api/dat-mua-lk/phieu-so-tien/:id - KTV dinh bang chung chuyen tien (trang_thai ->
// "KTV da chuyen"), hoac TN duyet/tu choi/huy.
datMuaLinhKien.patch("/phieu-so-tien/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ trang_thai: string; bang_chung_url?: string }>();
  const existing = await c.env.DB.prepare("SELECT * FROM phieu_so_tien WHERE id = ?").bind(id).first<{ trang_thai: string }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
  if (["TN da duyet", "TN tu choi", "Da huy"].includes(existing.trang_thai)) return c.json({ error: "DA_DONG" }, 409);

  const validNext = ["KTV da chuyen", "TN da duyet", "TN tu choi", "Da huy"];
  if (!validNext.includes(body.trang_thai)) return c.json({ error: "INVALID_TRANG_THAI" }, 400);

  if (body.trang_thai === "KTV da chuyen") {
    if (!body.bang_chung_url?.trim()) return c.json({ error: "MISSING_BANG_CHUNG" }, 400);
    await c.env.DB.prepare("UPDATE phieu_so_tien SET trang_thai = ?, bang_chung_url = ?, ngay_ktv_chuyen = ? WHERE id = ?")
      .bind(body.trang_thai, body.bang_chung_url.trim(), nowVN(), id)
      .run();
  } else {
    if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
    await c.env.DB.prepare("UPDATE phieu_so_tien SET trang_thai = ? WHERE id = ?").bind(body.trang_thai, id).run();
  }

  return c.json({ ok: true });
});

export default datMuaLinhKien;
