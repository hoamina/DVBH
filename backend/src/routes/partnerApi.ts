import { Hono, type Context } from "hono";
import type { Env } from "../types";
import { CASE_FILTER_TON } from "../lib/needGiaiTrinh";
import { findActivePartnerKey, checkRateLimit, logPartnerApiCall } from "../lib/partnerApiAuth";
import { buildPartnerExcel, type PartnerCaseRow, type GiaiTrinhHistoryRow } from "../lib/partnerExcel";
import { processKtvImportRows, type KtvImportRow } from "./settings";
import { computeAndStoreHash } from "../lib/contentHash";
import { bumpVersions } from "../lib/dataVersions";
import { nowVN } from "../lib/vnTime";

/**
 * API cho doi tac ben ngoai quet dinh ky lay du lieu CRM (xem PARTNER_API_GUIDE.md) - khong dung
 * session/OAuth (khong co nguoi ngoi truoc may), xac thuc bang X-API-Key rieng cho tung doi tac
 * (partner_api_keys, xem lib/partnerApiAuth.ts), KHAC voi EXTERNAL_IMPORT_API_KEY (1 secret tinh
 * dung chung cho pipeline QuickSight noi bo, xem routes/externalImport.ts) vi day la nhieu doi tac
 * ben ngoai, moi ben can 1 key rieng co the thu hoi doc lap.
 *
 * Mount o prefix rieng "/api/partner" (xem index.ts), tach biet hoan toan middleware session cua cac
 * route con lai.
 *
 * CO Y KHONG ap KHU_VUC_AN_KHOI_BAO_CAO (filterParams.ts khuVucReportExclusionClause) o day - danh
 * sach do chi dung de an 2 don vi kinh doanh khoi THONG KE/BAO CAO NOI BO (xem giai thich o
 * filterParams.ts), khong phai "case khong ton tai". API nay la xuat du lieu CRM tho cho doi tac
 * ngoai, an di se lam mat that su ca sự co trong file ho nhan duoc - khac ban chat voi 1 bao cao
 * tong hop noi bo.
 *
 * SUA 2026-08-28: file nay KHONG CON 100% chi doc nua - them "/sync/ktv" + "/sync/linh-kien" (dong
 * bo tu he doc lap "Dat mua linh kien", xem CLAUDE.md cua he do muc "Nguon goc tach he thong") de
 * he do CHU DONG DAY danh ba KTV/danh muc linh kien moi nhat sang day dinh ky (cron 1h/lan) hoac
 * khi Admin ben do bam "Đồng bộ ngay". Day la NGOAI LE DAU TIEN pha vo bat bien "chi doc" cua router
 * nay - can biet khi doc lai comment o tren.
 */
const partnerApi = new Hono<{ Bindings: Env }>();

// IP rate limit & API Key validity caching bang Cache API (giúp chặn DDoS/DoS miễn phí không tốn D1)
partnerApi.use("*", async (c, next) => {
  const cache = caches.default;
  const ip = c.req.header("CF-Connecting-IP") || "local-ip";
  const ipCacheKey = new Request(`https://internal-cache.dvbh-suite/partner-ip-limit/${encodeURIComponent(ip)}`);

  const cachedIp = await cache.match(ipCacheKey);
  if (cachedIp) {
    const data = (await cachedIp.json()) as { count: number; exp: number };
    if (data.count > 60) {
      return c.json({ error: "TOO_MANY_REQUESTS_IP" }, 429);
    }
    data.count++;
    c.executionCtx.waitUntil(
      cache.put(
        ipCacheKey,
        new Response(JSON.stringify(data), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `max-age=${Math.max(1, Math.round((data.exp - Date.now()) / 1000))}`,
          },
        })
      )
    );
  } else {
    const exp = Date.now() + 60_000;
    c.executionCtx.waitUntil(
      cache.put(
        ipCacheKey,
        new Response(JSON.stringify({ count: 1, exp }), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "max-age=60",
          },
        })
      )
    );
  }

  // Kiểm tra nhanh trong cache xem API Key này đã từng bị xác định là sai trước đó không
  const apiKey = c.req.header("X-API-Key") || "";
  if (!apiKey) return c.json({ error: "MISSING_API_KEY" }, 401);

  const keyCacheKey = new Request(`https://internal-cache.dvbh-suite/partner-key-valid/${encodeURIComponent(apiKey)}`);
  const cachedKey = await cache.match(keyCacheKey);
  if (cachedKey) {
    const keyData = (await cachedKey.json()) as { valid: boolean };
    if (!keyData.valid) {
      return c.json({ error: "INVALID_API_KEY" }, 401);
    }
  }

  await next();
});

const MAX_ROWS = 20_000;
const MAX_RANGE_DAYS = 31;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

const CASE_COLUMNS =
  "id, khach_hang, khu_vuc, tinh, doi_tac, hang, nhom_san_pham, seri_san_pham, mo_ta_loi, " +
  "thoi_gian_cskh_tiep_nhan, thoi_gian_hen_xu_ly, thoi_gian_hoan_thanh, tien_do_hoan_thanh";

// "YYYY-MM-DD" -> Date (UTC-neutral, chi dung de tinh khoang cach ngay/cong 1 ngay - khong lien quan
// gio VN thuc te cua thoi_gian_hoan_thanh, cot do van la text so sanh truc tiep).
function parseDateOnly(s: string): Date | null {
  if (!DATE_ONLY_RE.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  return d;
}

function addDays(d: Date, days: number): string {
  return new Date(d.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

function todayVN(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

partnerApi.get("/cases", async (c) => {
  const apiKey = c.req.header("X-API-Key")!;
  const keyRow = await findActivePartnerKey(c.env.DB, apiKey);
  if (!keyRow) {
    // Cache kết quả sai trong 5 phút để tránh bị spam làm cạn kiệt Quota đọc D1
    const keyCacheKey = new Request(`https://internal-cache.dvbh-suite/partner-key-valid/${encodeURIComponent(apiKey)}`);
    c.executionCtx.waitUntil(
      caches.default.put(
        keyCacheKey,
        new Response(JSON.stringify({ valid: false }), {
          headers: { "Content-Type": "application/json", "Cache-Control": "max-age=300" },
        })
      )
    );
    return c.json({ error: "INVALID_API_KEY" }, 401);
  }

  const mode = c.req.query("mode");
  if (mode !== "da-dong" && mode !== "dang-ton") return c.json({ error: "INVALID_MODE" }, 400);

  let whereSql: string;
  let whereBinds: unknown[];
  let filenameSuffix: string;

  if (mode === "dang-ton") {
    whereSql = CASE_FILTER_TON;
    whereBinds = [];
    filenameSuffix = `dang_ton_${todayVN()}`;
  } else {
    const tuNgay = c.req.query("tu_ngay") ?? "";
    const denNgay = c.req.query("den_ngay") ?? "";
    const tuDate = parseDateOnly(tuNgay);
    const denDate = parseDateOnly(denNgay);
    if (!tuDate || !denDate || tuDate.getTime() > denDate.getTime()) {
      return c.json({ error: "INVALID_DATE_RANGE" }, 400);
    }
    const rangeDays = Math.round((denDate.getTime() - tuDate.getTime()) / 86_400_000) + 1;
    if (rangeDays > MAX_RANGE_DAYS) return c.json({ error: "RANGE_TOO_LARGE" }, 400);

    whereSql = "thoi_gian_hoan_thanh >= ? AND thoi_gian_hoan_thanh < ?";
    whereBinds = [`${tuNgay} 00:00:00`, `${addDays(denDate, 1)} 00:00:00`];
    filenameSuffix = `da_dong_${tuNgay}_${denNgay}`;
  }

  // Tải trước số dòng kết quả từ D1
  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM case_dvbh WHERE ${whereSql}`)
    .bind(...whereBinds)
    .first<{ cnt: number }>();
  const totalCount = countRow?.cnt ?? 0;

  if (totalCount > MAX_ROWS) return c.json({ error: "TOO_MANY_ROWS" }, 400);

  // Ghi log và đồng thời kiểm tra rate limit trong 1 câu truy vấn nguyên tử (chống Race Condition TOCTOU)
  const insertLog = await c.env.DB.prepare(`
    INSERT INTO partner_api_call_log (api_key_id, mode, so_dong)
    SELECT ?1, ?2, ?3
    WHERE (
      SELECT COUNT(*) FROM partner_api_call_log
      WHERE api_key_id = ?1 AND date(called_at) = date('now', '+7 hours')
    ) < 30
    AND (
      NOT EXISTS (SELECT 1 FROM partner_api_call_log WHERE api_key_id = ?1)
      OR
      (
        SELECT (strftime('%s', datetime('now', '+7 hours')) - strftime('%s', called_at))
        FROM partner_api_call_log
        WHERE api_key_id = ?1
        ORDER BY called_at DESC LIMIT 1
      ) >= 60
    )
  `)
    .bind(keyRow.id, mode, totalCount)
    .run();

  if ((insertLog.meta.changes ?? 0) === 0) {
    // Nếu chèn thất bại tức là đã vượt qua giới hạn rate limit. Kiểm tra xem lỗi nào để phản hồi đúng
    const todayCount = await c.env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM partner_api_call_log WHERE api_key_id = ? AND date(called_at) = date('now', '+7 hours')"
    )
      .bind(keyRow.id)
      .first<{ cnt: number }>();
    if ((todayCount?.cnt ?? 0) >= 30) {
      return c.json({ error: "DAILY_LIMIT_EXCEEDED" }, 429);
    }
    return c.json({ error: "MIN_INTERVAL_NOT_MET" }, 429);
  }

  const { results: caseRows } = await c.env.DB.prepare(
    `SELECT ${CASE_COLUMNS} FROM case_dvbh WHERE ${whereSql} ORDER BY id`,
  )
    .bind(...whereBinds)
    .all<PartnerCaseRow>();

  const { results: historyRows } = await c.env.DB.prepare(
    `SELECT case_id, ly_do_cham, noi_dung, ngay_giai_trinh FROM giai_trinh
     WHERE case_id IN (SELECT id FROM case_dvbh WHERE ${whereSql})
     ORDER BY case_id, ngay_giai_trinh ASC`,
  )
    .bind(...whereBinds)
    .all<GiaiTrinhHistoryRow>();

  const buffer = buildPartnerExcel(caseRows, historyRows);
  // Ep kieu ArrayBuffer - xlsx tra ve Uint8Array<ArrayBufferLike> (TS lib khong biet chac khong phai
  // SharedArrayBuffer), trong khi day thuc su la Uint8Array thuong tu XLSX.write({type:"array"}).
  return c.body(buffer as unknown as ArrayBuffer, 200, {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="dvbh_${filenameSuffix}.xlsx"`,
  });
});

// Tap field tra ve cho /case-lookup - chot cung doi tac "Dat mua linh kien" 2026-08-26, xem
// DANH_SACH_FIELD_UNG_VIEN_API_DOI_TAC.md (doi tac da tu chon giu ca dt_san_pham/dt_linh_kien/
// dt_dich_vu va ly_do_qua_han sau khi duoc canh bao day la du lieu tai chinh/noi bo - quyet dinh
// nghiep vu, khong phai bo sot).
const CASE_LOOKUP_COLUMNS = [
  "ky_thuat_vien", "khach_hang", "seri_san_pham", "khu_vuc", "tinh", "quan_huyen", "hang",
  "san_pham_bao_hanh", "tien_do_hoan_thanh", "mo_ta_loi", "nhom_san_pham", "nhom_yeu_cau",
  "loai_yeu_cau", "hinh_thuc_bao_hanh", "ngay_mua", "thoi_gian_cskh_tiep_nhan",
  "thoi_gian_hen_xu_ly", "thoi_gian_hoan_thanh", "doi_tac", "link_crm", "noi_dung_xu_ly",
  "luu_y_loi_linh_kien", "cach_thuc_xu_ly", "nganh", "loai_nganh", "nhom_kh",
  "dt_san_pham", "dt_linh_kien", "dt_dich_vu", "ly_do_qua_han",
] as const;
type CaseLookupRow = Record<(typeof CASE_LOOKUP_COLUMNS)[number], string | number | null>;

// GET /api/partner/case-lookup?id=... - tra cuu 1 case theo ID, CHI phuc vu he thong doc lap moi
// "Dat mua linh kien" (tach ra thanh 1 he Cloudflare rieng 2026-08-19 - xem
// "Luồng tạo đơn mua hàng/CLAUDE.md" muc "Nguồn gốc tách hệ thống"). Day la diem noi DUY NHAT giua 2
// he: he moi CHI goi endpoint nay (tra cuu theo ID, khong ghi gi ca). Tra ve tap field CASE_LOOKUP_
// COLUMNS o tren - dung khoa xac thuc rieng (X-API-Key thay vi session) vi ben goi la 1 he thong
// khac, khong co nguoi dang nhap. KHONG ap dung rate-limit 30/ngay+60s cua "/cases" o tren (thiet
// ke cho export hang loat dinh ky) - endpoint nay phuc vu tra cuu TUNG BAN GHI theo thoi gian thuc
// (nguoi dung go ID, debounce 500ms). Ngoai lop chan IP chung o middleware "*" (60 req/phut/IP qua
// Cache API), them 1 lop rate-limit rieng theo tung API key (200 req/phut) qua Cache API (khong ghi
// D1 - tranh ton quota rows_written cho luu luong tra cuu tan suat cao) de gioi han thiet hai neu
// 1 key bi lo/bi do quet ma khong anh huong cac doi tac/KTV khac dang dung chung IP egress.
const CASE_LOOKUP_KEY_LIMIT_PER_MIN = 200;

partnerApi.get("/case-lookup", async (c) => {
  const apiKey = c.req.header("X-API-Key")!;
  const keyRow = await findActivePartnerKey(c.env.DB, apiKey);
  if (!keyRow) {
    const keyCacheKey = new Request(`https://internal-cache.dvbh-suite/partner-key-valid/${encodeURIComponent(apiKey)}`);
    c.executionCtx.waitUntil(
      caches.default.put(
        keyCacheKey,
        new Response(JSON.stringify({ valid: false }), {
          headers: { "Content-Type": "application/json", "Cache-Control": "max-age=300" },
        })
      )
    );
    return c.json({ error: "INVALID_API_KEY" }, 401);
  }

  const cache = caches.default;
  const keyLimitCacheKey = new Request(`https://internal-cache.dvbh-suite/partner-lookup-key-limit/${keyRow.id}`);
  const cachedKeyLimit = await cache.match(keyLimitCacheKey);
  if (cachedKeyLimit) {
    const data = (await cachedKeyLimit.json()) as { count: number; exp: number };
    if (data.count > CASE_LOOKUP_KEY_LIMIT_PER_MIN) {
      return c.json({ error: "TOO_MANY_REQUESTS_KEY" }, 429);
    }
    data.count++;
    c.executionCtx.waitUntil(
      cache.put(
        keyLimitCacheKey,
        new Response(JSON.stringify(data), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `max-age=${Math.max(1, Math.round((data.exp - Date.now()) / 1000))}`,
          },
        })
      )
    );
  } else {
    const exp = Date.now() + 60_000;
    c.executionCtx.waitUntil(
      cache.put(
        keyLimitCacheKey,
        new Response(JSON.stringify({ count: 1, exp }), {
          headers: { "Content-Type": "application/json", "Cache-Control": "max-age=60" },
        })
      )
    );
  }

  const id = c.req.query("id")?.trim();
  if (!id) return c.json({ found: false, preview: null });

  const caseRow = await c.env.DB.prepare(
    `SELECT ${CASE_LOOKUP_COLUMNS.join(", ")} FROM case_dvbh WHERE id = ?`,
  )
    .bind(id)
    .first<CaseLookupRow>();
  if (!caseRow) return c.json({ found: false, preview: null });

  return c.json({ found: true, preview: caseRow });
});

// Dung chung cho ca 2 route sync ben duoi - gioi han so dong 1 lan goi (khop dung
// CHUNK_SIZE/batch cua sync client ben "Dat mua linh kien", tranh 1 request qua lon).
const SYNC_MAX_ROWS = 200;

async function requirePartnerKey(c: Context<{ Bindings: Env }>) {
  const apiKey = c.req.header("X-API-Key")!;
  const keyRow = await findActivePartnerKey(c.env.DB, apiKey);
  if (!keyRow) {
    const keyCacheKey = new Request(`https://internal-cache.dvbh-suite/partner-key-valid/${encodeURIComponent(apiKey)}`);
    c.executionCtx.waitUntil(
      caches.default.put(
        keyCacheKey,
        new Response(JSON.stringify({ valid: false }), {
          headers: { "Content-Type": "application/json", "Cache-Control": "max-age=300" },
        })
      )
    );
  }
  return keyRow;
}

// POST /api/partner/sync/ktv - { rows: KtvImportRow[] } - dong bo danh ba KTV tu he "Dat mua linh
// kien" (nguon su that cho danh ba nay tu sau khi tach he - xem CLAUDE.md he do). Dung LAI dung ham
// processKtvImportRows() cua routes/settings.ts (Admin dung khi tu import Excel tay) - upsert theo
// ma_ktv + tu cap tai khoan placeholder cho dong co email_dang_nhap, khong nhan doi logic.
partnerApi.post("/sync/ktv", async (c) => {
  const keyRow = await requirePartnerKey(c);
  if (!keyRow) return c.json({ error: "INVALID_API_KEY" }, 401);

  const body = await c.req.json<{ rows: KtvImportRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  if (body.rows.length > SYNC_MAX_ROWS) return c.json({ error: "TOO_MANY_ROWS" }, 400);

  // "sync:<ten doi tac>" thay vi email that - de Admin xem cot nguoi_cap_nhat biet ngay dong nao
  // do he ngoai tu dong ghi, khac voi 1 Admin that tung sua tay.
  const summary = await processKtvImportRows(c.env.DB, body.rows, `sync:${keyRow.ten_doi_tac}`, true);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["settings"]));
  return c.json({ upserted: summary.thanhCong, errors: summary.errors });
});

interface LinhKienSyncRow {
  ma_linh_kien?: string;
  ten_linh_kien?: string;
  gia_ban?: number | null;
  gia_tham_chieu?: number | null;
  don_vi?: string | null;
  ghi_chu?: string | null;
  anh_demo?: string | null;
  bat_tat?: boolean;
  dac_thu?: boolean;
  chi_sua_chua?: boolean;
}

// POST /api/partner/sync/linh-kien - { rows: LinhKienSyncRow[] } - dong bo danh muc linh kien tu he
// "Dat mua linh kien", cung ly do/nguon goc voi "/sync/ktv" o tren. KHAC voi processKtvImportRows
// (giu COALESCE cho vai truong de tuong thich Admin tu nhap thieu cot) - o day GHI DE THANG toan bo
// truong duoc gui, vi he goi sang la nguon su that DUY NHAT cho danh muc nay (da xac nhan voi nguoi
// dung), khong con ai sua tay truc tiep o Settings DVBH nua.
partnerApi.post("/sync/linh-kien", async (c) => {
  const keyRow = await requirePartnerKey(c);
  if (!keyRow) return c.json({ error: "INVALID_API_KEY" }, 401);

  const body = await c.req.json<{ rows: LinhKienSyncRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  if (body.rows.length > SYNC_MAX_ROWS) return c.json({ error: "TOO_MANY_ROWS" }, 400);

  const nguoiCapNhat = `sync:${keyRow.ten_doi_tac}`;
  const now = nowVN();
  const errors: string[] = [];
  const statements = [];
  for (const [i, row] of body.rows.entries()) {
    const ma = row.ma_linh_kien?.trim();
    const ten = row.ten_linh_kien?.trim();
    if (!ma || !ten) {
      errors.push(`Dòng ${i + 1}: thiếu ma_linh_kien/ten_linh_kien`);
      continue;
    }
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO linh_kien (ma_linh_kien, ten_linh_kien, gia_ban, gia_tham_chieu, don_vi, ghi_chu, anh_demo, bat_tat, dac_thu, chi_sua_chua, nguoi_cap_nhat, ngay_cap_nhat)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ma_linh_kien) DO UPDATE SET
           ten_linh_kien = excluded.ten_linh_kien, gia_ban = excluded.gia_ban,
           gia_tham_chieu = excluded.gia_tham_chieu, don_vi = excluded.don_vi,
           ghi_chu = excluded.ghi_chu, anh_demo = excluded.anh_demo, bat_tat = excluded.bat_tat,
           dac_thu = excluded.dac_thu, chi_sua_chua = excluded.chi_sua_chua,
           nguoi_cap_nhat = excluded.nguoi_cap_nhat, ngay_cap_nhat = excluded.ngay_cap_nhat`,
      ).bind(
        ma,
        ten,
        row.gia_ban ?? null,
        row.gia_tham_chieu ?? null,
        row.don_vi?.trim() || null,
        row.ghi_chu?.trim() || null,
        row.anh_demo?.trim() || null,
        row.bat_tat ? 1 : 0,
        row.dac_thu ? 1 : 0,
        row.chi_sua_chua ? 1 : 0,
        nguoiCapNhat,
        now,
      ),
    );
  }
  if (statements.length > 0) {
    await c.env.DB.batch(statements);
    const { results } = await c.env.DB.prepare("SELECT * FROM linh_kien ORDER BY ma_linh_kien").all();
    await computeAndStoreHash(c.env.DB, "linh_kien", results);
    c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["settings"]));
  }
  return c.json({ upserted: statements.length, errors });
});

export default partnerApi;
