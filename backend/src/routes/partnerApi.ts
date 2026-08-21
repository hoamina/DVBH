import { Hono } from "hono";
import type { Env } from "../types";
import { CASE_FILTER_TON } from "../lib/needGiaiTrinh";
import { findActivePartnerKey, checkRateLimit, logPartnerApiCall } from "../lib/partnerApiAuth";
import { buildPartnerExcel, type PartnerCaseRow, type GiaiTrinhHistoryRow } from "../lib/partnerExcel";

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

// GET /api/partner/case-lookup?id=... - tra cuu 1 case theo ID, CHI phuc vu he thong doc lap moi
// "Dat mua linh kien" (tach ra thanh 1 he Cloudflare rieng 2026-08-19 - xem
// "Luồng tạo đơn mua hàng/CLAUDE.md" muc "Nguồn gốc tách hệ thống"). Day la diem noi DUY NHAT giua 2
// he: he moi CHI goi endpoint nay (tra cuu theo ID, khong ghi gi ca). Tra ve dung tap field da chon
// loc nhu GET /api/dat-mua-lk/kiem-tra-ma-yeu-cau hien co (khong co du lieu tai chinh/nhay cam) -
// dung khoa xac thuc rieng (X-API-Key thay vi session) vi ben goi la 1 he thong khac, khong co nguoi
// dang nhap. KHONG ap dung rate-limit 30/ngay+60s cua "/cases" o tren (thiet ke cho export hang loat
// dinh ky) - endpoint nay phuc vu tra cuu TUNG BAN GHI theo thoi gian thuc (nguoi dung go ID, debounce
// 500ms; hoac xem chi tiet 1 don hang co nhieu case lien ket), chi dua vao lop chan chung o middleware
// "*" phia tren (60 req/phut/IP qua Cache API) - du cho muc dich nay.
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

  const id = c.req.query("id")?.trim();
  if (!id) return c.json({ found: false, preview: null });

  const caseRow = await c.env.DB.prepare(
    `SELECT ky_thuat_vien, khach_hang, seri_san_pham, khu_vuc, tinh, quan_huyen, hang, san_pham_bao_hanh, tien_do_hoan_thanh
     FROM case_dvbh WHERE id = ?`,
  )
    .bind(id)
    .first<{
      ky_thuat_vien: string | null; khach_hang: string | null; seri_san_pham: string | null; khu_vuc: string | null;
      tinh: string | null; quan_huyen: string | null; hang: string | null; san_pham_bao_hanh: string | null;
      tien_do_hoan_thanh: string | null;
    }>();
  if (!caseRow) return c.json({ found: false, preview: null });

  return c.json({
    found: true,
    preview: {
      khach_hang: caseRow.khach_hang,
      seri_san_pham: caseRow.seri_san_pham,
      khu_vuc: caseRow.khu_vuc,
      tinh: caseRow.tinh,
      quan_huyen: caseRow.quan_huyen,
      hang: caseRow.hang,
      san_pham_bao_hanh: caseRow.san_pham_bao_hanh,
      tien_do_hoan_thanh: caseRow.tien_do_hoan_thanh,
      ky_thuat_vien: caseRow.ky_thuat_vien,
    },
  });
});

export default partnerApi;
