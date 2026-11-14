import { Hono } from "hono";
import { danhDauMoiTruongLocal } from "./lib/telegram";
import type { Env } from "./types";
import authRoutes from "./routes/auth";
import casesRoutes from "./routes/cases";
import missingPartsRoutes from "./routes/missingParts";
import poDatHangRoutes from "./routes/poDatHang";
import tranhChapRoutes from "./routes/tranhChap";
import napGasRoutes from "./routes/napGas";
import surveyRoutes from "./routes/survey";
import viPhamRoutes from "./routes/viPham";
import viPhamKtvRoutes from "./routes/viPhamKtv";
import importViPhamRoutes from "./routes/importViPham";
import baoCaoViPhamRoutes from "./routes/baoCaoViPham";
import importRoutes from "./routes/importRoute";
import importGiaiTrinhRoutes from "./routes/importGiaiTrinh";
import importGiaiTrinhLapRoutes from "./routes/importGiaiTrinhLap";
import importGiaiTrinhLapNhanhRoutes from "./routes/importGiaiTrinhLapNhanh";
import importKhaoSatRoutes from "./routes/importKhaoSat";
import importNapGasRoutes from "./routes/importNapGas";
import externalImportRoutes from "./routes/externalImport";
import settingsRoutes from "./routes/settings";
import usersRoutes from "./routes/users";
import dashboardRoutes from "./routes/dashboard";
import revenueRoutes from "./routes/revenue";
import notificationsRoutes from "./routes/notifications";
import greetingRoutes from "./routes/greeting";
import caLapRoutes from "./routes/caLap";
import partnerApiRoutes from "./routes/partnerApi";
import lkSettingsRoutes from "./routes/lkSettings";
import datMuaLinhKienRoutes from "./routes/datMuaLinhKien";
import phieuXuatKhoRoutes from "./routes/phieuXuatKho";
import traHangRoutes from "./routes/traHang";
import backlogAgeReportRoutes from "./routes/backlogAgeReport";
import luyKeRoutes from "./routes/luyKe";
import { computeAndPushLuyKeCurrentMonth } from "./lib/luyKeCompute";
import { refreshCaLapPrecompute, refreshCaLapTheoThayDoi } from "./lib/caLapRefresh";
import { selfHealDaDongDayChunks } from "./lib/daDongDayChunks";
import { withD1Retry } from "./lib/d1Retry";
import { warmDefaultReports } from "./lib/reportWarmup";
import { retryLuongDoiTraSnapshot } from "./lib/canhBaoTon";
import { chotNhom, chotBuNeuThieu, nhomTheoPhut, tatCaNhom } from "./lib/chotTon";
import { autoLogCaKetThucTrongNgay } from "./lib/autoLogCaKetThuc";
import { autoLogGiaiTrinhQuaTranhChap } from "./lib/canhBaoCap2GiaiTrinh";
import { phamViMiddleware } from "./lib/phamVi";
import { chotGiaiTrinhNhom, retryLuongDoiTraPhamVi, envVn } from "./lib/phamViChot";
import { selfHealCanKhaoSat } from "./lib/canKhaoSat";
import { syncGiaiTrinhTonB2B, hasSucceededToday } from "./lib/etxGiaiTrinhSync";
import { syncViPhamFromSheet } from "./lib/viPhamSheetSync";
import { autoSyncTonKhoLk } from "./lib/tonKhoLk";
import { dongBoDonLkGanNhat } from "./lib/donLkGanNhat";
import { capNhatPoHangVeNeuCan } from "./lib/poHangVeMien";
import { syncLkThayThe } from "./lib/lkThayThe";
import tonKhoLkRoutes from "./routes/tonKhoLk";
import diaGioiRoutes from "./routes/diaGioi";
import quocGiaRoutes from "./routes/quocGia";
import banDichRoutes from "./routes/banDich";
import qlNskxRoutes from "./routes/qlNskx";
import suaDoanhThuRoutes from "./routes/suaDoanhThu";

const app = new Hono<{ Bindings: Env }>();
// "Phạm vi báo cáo" Tất cả / NSKX / Không NSKX (lib/phamVi.ts) - GET co ?pv= doc/ghi bo du lieu rieng cua pham vi.
// Header bao mat cho moi response API (2026-11-07; tai nguyen tinh dung frontend/public/_headers).
app.use("/api/*", async (c, next) => {
  await next();
  const dat = (h: Headers) => {
    h.set("X-Content-Type-Options", "nosniff");
    h.set("X-Frame-Options", "SAMEORIGIN");
    h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  };
  try {
    dat(c.res.headers);
  } catch {
    // Response lay thang tu fetch()/Service Binding co headers bat bien -> boc lai 1 Response moi roi moi dat.
    c.res = new Response(c.res.body, c.res);
    dat(c.res.headers);
  }
});
app.use("/api/*", phamViMiddleware);

app.route("/api/auth", authRoutes);
app.route("/api/cases", casesRoutes);
app.route("/api/missing-parts", missingPartsRoutes);
app.route("/api/po-dat-hang", poDatHangRoutes);
app.route("/api/ton-kho-lk", tonKhoLkRoutes);
app.route("/api/dia-gioi", diaGioiRoutes);
app.route("/api/quoc-gia", quocGiaRoutes);
app.route("/api/ban-dich", banDichRoutes);
app.route("/api/ql-nskx", qlNskxRoutes);
app.route("/api/sua-doanh-thu", suaDoanhThuRoutes);
app.route("/api/tranh-chap", tranhChapRoutes);
app.route("/api/nap-gas", napGasRoutes);
app.route("/api/survey", surveyRoutes);
app.route("/api/vi-pham", viPhamRoutes);
app.route("/api/vi-pham-ktv", viPhamKtvRoutes);
app.route("/api/bao-cao-vi-pham", baoCaoViPhamRoutes);
// "/api/import/vi-pham" PHAI mount TRUOC "/api/import": importRoutes co use("*", requireRole("Admin",
// "TBP DVBH")) - middleware "*" cua router mount o "/api/import" khop CA moi duong dan con, nen neu mount
// sau thi CSKH/TN CSKH/TBP CSKH/QC bi 403 o moi endpoint import vi pham (bug 2026-09-30: chon file
// khong co phan hoi vi /column-map bi 403). Mount truoc -> handler vi pham tra response, ket thuc chuoi.
// Cac router import con con lai dung CUNG bo vai tro voi importRoutes nen khong bi anh huong.
// "/api/import/giai-trinh-lap-nhanh" (Giam sat/QC/Admin) cung PHAI mount truoc - bug 2026-10-26: mount sau "/api/import"
// nen Giam sat/QC bi 403 o ca /template lan /preview /commit (chi Admin dung duoc).
app.route("/api/import/vi-pham", importViPhamRoutes);
app.route("/api/import/giai-trinh-lap-nhanh", importGiaiTrinhLapNhanhRoutes);
app.route("/api/import", importRoutes);
app.route("/api/import/giai-trinh", importGiaiTrinhRoutes);
app.route("/api/import/giai-trinh-lap", importGiaiTrinhLapRoutes);
app.route("/api/import/khao-sat", importKhaoSatRoutes);
app.route("/api/import/nap-gas", importNapGasRoutes);
// Prefix rieng biet hoan toan voi "/api/import" (khong dung verifySessionMiddleware - xem
// routes/externalImport.ts) - pipeline Python QuickSight goi qua API key tinh.
app.route("/api/external-import", externalImportRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/revenue", revenueRoutes);
app.route("/api/notifications", notificationsRoutes);
app.route("/api/greeting", greetingRoutes);
app.route("/api/ca-lap", caLapRoutes);
// Doi tac ben ngoai quet du lieu CRM dinh ky (xem PARTNER_API_GUIDE.md) - khong dung session/OAuth,
// xac thuc rieng qua X-API-Key trong routes/partnerApi.ts.
app.route("/api/partner", partnerApiRoutes);
app.route("/api/lk-settings", lkSettingsRoutes);
app.route("/api/dat-mua-lk", datMuaLinhKienRoutes);
app.route("/api/phieu-xuat-kho", phieuXuatKhoRoutes);
app.route("/api/tra-hang", traHangRoutes);
app.route("/api/backlog-age-report", backlogAgeReportRoutes);
app.route("/api/luy-ke", luyKeRoutes);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "INTERNAL_ERROR" }, 500);
});

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

const ARCHIVE_AFTER = "-3 months";

// 17h15/17h20/17h25 gio VN = 10h15/10h20/10h25 UTC - keo "Giai trinh ton B2B" tu API doi tac ETX
// (xem lib/etxGiaiTrinhSync.ts). 3 moc co dinh (khong phai setTimeout dong) VI stack nay khong co
// Durable Object/Queue - moc 17h20/17h25 chi la "thu lai" THAT SU khi hasSucceededToday() bao chua
// xong (loi mang/API ETX tam thoi), tu bo qua ngay khi da xong o moc truoc do - tuong duong "that
// bai thi thu lai sau 5 phut, toi da 2 lan" ma khong can them ha tang moi.
// 1 CHUOI CRON DUY NHAT "15,20,25 10 * * *" (khong phai 3 phan tu mang rieng) - phat hien 2026-09-16:
// khai bao 3 phan tu rieng lam TONG so Cron Trigger cua Worker vuot qua gioi han cua Cloudflare (co
// san 4 cron khac + 3 cai nay = 7), nen deploy "thanh cong" ve mat CLI nhung Cloudflare ROI 3 trigger
// nay ma khong bao loi (wrangler khong phat hien) - ket qua la lich chua bao gio thuc su chay (0 dong
// trong etx_giai_trinh_sync_log ke tu luc trien khai). Gop lai thanh 1 phan tu (dung pattern list
// nhieu gio/phut trong 1 truong cron, giong VI_PHAM_SHEET_SYNC_CRON o duoi) de giam tong so Cron
// Trigger, dong thoi van giu dung 3 moc gio 10h15/10h20/10h25 UTC. event.cron tra ve dung nguyen
// van chuoi da khai bao, nen so sanh bang chuoi la du, khong can Set.
const ETX_SYNC_CRON = "15,20,25 10 * * *";

// 08:00 sang gio VN = 01:00 UTC. Chot voi chu he thong 2026-08-02: gom luoi an toan "ca lap"/
// dashboard (truoc la CA_LAP_REFRESH_CRON rieng, chay moi gio) vao chung 1 dot voi "Bao cao ngay
// 08:00" (banner Tong quat, xem lib/dailySnapshot.ts) - co che CHINH cua ca 2 van la goi truc tiep
// ngay sau khi import/ghi du lieu that (importRoute.ts/externalImport.ts), nen day chi con la luoi
// an toan du phong, khong can tan suat cao hon 1 lan/ngay. Phai khai bao trong ca 2
// wrangler*.jsonc "triggers.crons".
// 2026-10-08: mo rong thanh MOI GIO 01-11 UTC (= 8h-18h VN) de hoi ton kho linh kien ben linh-kien-app
// (lib/tonKhoLk.ts autoSyncTonKhoLk) MA KHONG them Cron Trigger thu 5 (Worker da tung bi Cloudflare am tham bo
// trigger khi vuot gioi han, xem ETX_SYNC_CRON). 2026-11-07: CHOT SO da chuyen sang 07:30 (CHOT_0730_1730_CRON); trigger nay chi con
// luoi an toan moi gio + viec nang luc 12:00 (gio UTC 5).
const DAILY_SNAPSHOT_CRON = "0 1-11 * * *";

// 17:30 chieu gio VN = 10:30 UTC - "chot" ty le giai trinh trong ngay theo khu vuc vao bang
// giai_trinh_daily_log (migration 0040, xem lib/dailySnapshot.ts chotGiaiTrinhDailyLog) - LICH SU
// vinh vien, khong co duong ghi tay, khac DAILY_SNAPSHOT_CRON (bi ghi de moi ngay). CO Y giu rieng
// voi DAILY_SNAPSHOT_CRON (khong gom ve 08:00) - neu chot cung luc voi baseline 08:00 thi ty le
// "da giai trinh trong ngay" se luon bang 0%, mat tac dung theo doi cuoi ngay. Phai khai bao trong
// ca 2 wrangler*.jsonc "triggers.crons".
// 2026-11-07: GOP them moc 07:30 VN (00:30 UTC) - "chot so 08:00" chay som 07:30 de gian cach voi luong 08:00 (nguoi dung mo man +
// luoi an toan moi gio) - KHONG them Cron Trigger moi (Cloudflare tung am tham bo trigger khi vuot gioi han, xem ETX_SYNC_CRON).
// Moc dieu kien "ton tai 08:00" (TON_ANCHOR_0800) va moc tuoi ton khong doi nen so chot 07:30 = so 08:00 (import chi 07:05 / 09:04).
// 2026-11-08: them phut 40 (VAN 1 trigger) - moi nuoc chot rieng khung gio: VN phut 30 (07:30 / 17:30), nuoc khac + "Tất cả quốc gia"
// phut 40 (07:40 / 17:40) - xem lib/chotTon.ts nhomTheoPhut.
const CHOT_0730_1730_CRON = "30,40 0,10 * * *";

// 03:00 sang gio VN = 20:00 UTC (ngay hom truoc) - dong bo hang ngay vi_pham tu Google Sheet QC tu
// quan ly ben ngoai he thong (them 2026-09-16, xem lib/viPhamSheetSync.ts). Gop chung voi archive
// case (truoc la ARCHIVE_CRON rieng "0 20 1 * *") vao CUNG 1 entry cron nay - chot voi chu he thong
// 2026-09-16 de giam tong so Cron Trigger cua Worker (dang gan gioi han Cloudflare, xem etx-giai-trinh
// bug cung ngay). Archive van CHI chay 1 lan/thang - dung new Date().getUTCDate() === 1 lam guard
// TRONG CODE (thay vi dua vao truong "ngay" cua bieu thuc cron) de giu dung y nghia "ngay 1 UTC = 03h
// VN ngay 2" nhu cu, khong doi lich archive.
const VI_PHAM_SHEET_SYNC_CRON = "0 20 * * *";
const VI_PHAM_SHEET_SYNC_ACTOR_EMAIL = "he-thong-tu-dong@dvbh.internal";

// Chay 1 sync, ghi log neu that bai (nuot loi - KHONG throw) de 1 sync loi khong chan cac sync con
// lai trong cung dot cron. Log qua console.error (xem qua `wrangler tail`) vi day la tac vu nen,
// khong co response HTTP nao de bao loi cho nguoi dung nhu route /sync-sheet thu cong.
async function runSheetSync(label: string, fn: () => Promise<{ ok: boolean; reason?: string; message?: string }>): Promise<void> {
  try {
    const result = await fn();
    if (!result.ok) {
      console.error(`[cron-sheet-sync] ${label} that bai (${result.reason})${result.message ? `: ${result.message}` : ""}`);
    }
  } catch (err) {
    console.error(`[cron-sheet-sync] ${label} loi khong mong doi:`, err instanceof Error ? err.message : String(err));
  }
}

/** Chot so "Bao cao ngay 08:00" theo NHOM QUOC GIA (lib/chotTon.ts, 2026-11-08): phut 30 (07:30 VN) -> VN; phut 40 (07:40) -> nuoc khac
 * + pham vi "Tất cả quốc gia" cua Admin. Moi nhom 1 LAN DOC tap ca ton (~1.700 ca, ~8 cau) roi tinh moi scope trong bo nho - truoc day
 * ~6.000 cau/lan, Promise.all tu lam D1 "overloaded" -> 04/11-08/11 gan nhu khong chot duoc. Telegram Canh bao ton gui trong
 * generateCanhBaoTonSnapshot (chi pham vi nuoc co nhom Telegram). */
async function chotBuoiSang(env: Env, phut: number): Promise<void> {
  for (const nhom of await nhomTheoPhut(env, phut)) {
    try {
      await chotNhom(env, nhom, "auto", { canhBaoTon: true, giuSoDaChot: true });
    } catch (err) {
      console.error(`[cron-chot] nhom ${nhom ?? "tat-ca"} loi:`, err instanceof Error ? err.message : String(err));
    }
  }
}

/** 12:00 VN - cac luoi an toan nang truoc day chay ngay sau chot 08:00 (ca lap, lam nong cache, can_khao_sat, luy ke R2). */
async function viecNangBuoiTrua(env: Env): Promise<void> {
  // Luoi an toan cho "ca lap" (gop tu CA_LAP_REFRESH_CRON rieng, truoc chay moi gio). SUA 2026-11-11: chi tinh lai SERIAL cua
  // cac ca co updated_at moi hon lan truoc (refreshCaLapTheoThayDoi) thay vi LAG tren moi ca da dong (~1 trieu dong doc); rieng
  // Chu nhat tinh lai toan bo 1 lan (bat ca thay doi khong cham updated_at, vd doi serial bang tay).
  try {
    const chuNhat = new Date(Date.now() + 7 * 60 * 60 * 1000).getUTCDay() === 0;
    if (chuNhat) await refreshCaLapPrecompute(env.DB);
    else await refreshCaLapTheoThayDoi(env.DB);
  } catch (err) {
    console.error("[cron-daily-snapshot] refreshCaLapPrecompute loi:", err instanceof Error ? err.message : String(err));
  }
  // Luoi an toan cho bao cao dashboard - co che CHINH la pipeline QuickSight tu goi
  // POST /api/external-import/refresh-reports dung 1 lan sau moi dot day file (xem
  // externalImport.ts). Neu tin hieu do bi mat (loi mang, pipeline quen goi...), cache van tu
  // lam moi toi da sau 1 lan/ngay nho nhanh nay - warmDefaultReports() tu bo qua (chi 1 luot doc
  // re) nhung bao cao nao chua doi tu lan tinh truoc, khong ton kem khi khong co gi moi.
  try {
    await warmDefaultReports(env.DB);
    await warmDefaultReports(envVn(env).DB);
  } catch (err) {
    console.error("[cron-daily-snapshot] warmDefaultReports loi:", err instanceof Error ? err.message : String(err));
  }
  // Luoi an toan tu-heal cho case_dvbh.can_khao_sat (migration 0097, xem lib/canKhaoSat.ts) -
  // co che CHINH van la 3 diem ghi goi recomputeCanKhaoSatBatch() truc tiep (importProcessor.ts,
  // routes/survey.ts POST /calls, routes/importKhaoSat.ts); day chi bat lai truong hop 1 diem
  // ghi nao do bi lech/bo sot. Doc lap voi cac buoc tren, boc rieng try/catch.
  try {
    await selfHealCanKhaoSat(env.DB);
  } catch (err) {
    console.error("[self-heal] can-khao-sat loi:", err instanceof Error ? err.message : String(err));
  }
  // "Bao cao luy ke" tu dong - chot 2026-08-28 (xem lib/luyKeCompute.ts). Tinh lai THANG HIEN TAI
  // tu case_dvbh that va ghi R2 (2 diem ghi da CHOT, xem chu thich dau lib/luyKeChunks.ts) - song
  // song voi import Excel thu cong hien co (nguoi dung "chot cuoi" 1 thang bang import se GHI DE
  // ket qua cron). Doc lap voi cac buoc tren, boc rieng try/catch.
  try {
    await computeAndPushLuyKeCurrentMonth(env);
  } catch (err) {
    console.error("[cron-daily-snapshot] computeAndPushLuyKeCurrentMonth loi:", err instanceof Error ? err.message : String(err));
  }
}

export default {
  fetch: (req: Request, env: Env, ctx: ExecutionContext) => {
    danhDauMoiTruongLocal(env);
    return app.fetch(req, env, ctx);
  },

  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    danhDauMoiTruongLocal(env);
    if (event.cron === ETX_SYNC_CRON) {
      try {
        if (await hasSucceededToday(env.DB)) return; // dot truoc trong ngay da xong, khong goi lai API
        const result = await syncGiaiTrinhTonB2B(env);
        if (!result.ok) {
          console.error(`[cron-etx-giai-trinh] that bai (${result.reason})${"message" in result ? `: ${result.message}` : ""}`);
        }
      } catch (err) {
        console.error("[cron-etx-giai-trinh] loi khong mong doi:", err instanceof Error ? err.message : String(err));
      }
      return;
    }

    if (event.cron === VI_PHAM_SHEET_SYNC_CRON) {
      await runSheetSync("vi_pham_ngoai", () => syncViPhamFromSheet(env, VI_PHAM_SHEET_SYNC_ACTOR_EMAIL));
      // Archive gop chung vao day (truoc la ARCHIVE_CRON rieng "0 20 1 * *") - guard bang ngay UTC
      // thay vi truong "ngay" cua cron de giu dung lich cu "ngay 1 UTC = 03h VN ngay 2", van chi
      // chay 1 lan/thang du entry cron nay fire moi ngay.
      if (new Date().getUTCDate() === 1) {
        // idx_case_archive_pending (migration 0019) phuc vu dung cau nay: chi giu lai cac dong
        // archived_at IS NULL nen SQLite khong phai quet lai ca phan da archive tu lau.
        // Khong bump domain "cases" o day - archive tu dong KHONG lam bao cao tinh san cu di, chi
        // import (commit/sync-sheet) moi bump domain nay (xem R8 trong YEU_CAU_BAO_CAO_TINH_SAN.md
        // va comment o lib/dataVersions.ts).
        await env.DB.prepare(
          `UPDATE case_dvbh SET archived_at = datetime('now', '+7 hours')
           WHERE thoi_gian_hoan_thanh IS NOT NULL AND archived_at IS NULL
             AND thoi_gian_hoan_thanh < datetime('now', '+7 hours', ?)`,
        )
          .bind(ARCHIVE_AFTER)
          .run();
      }
      return;
    }

    if (event.cron === DAILY_SNAPSHOT_CRON) {
      // LICH 2026-11-07 (gian cach luong tu dong buoi sang, khong them Cron Trigger): 07:05 pipeline import (ben ngoai) -> 07:30 CHOT SO
      // (CHOT_0730_1730_CRON, chotBuoiSang) -> 08:00..18:00 moi gio: luoi an toan duoi day -> 12:00 them viecNangBuoiTrua.
      // Truoc day moi viec don vao lan fire 08:00, chot chay sau luoi an toan va loi bi nuot -> 04/11-07/11 khong co ban chot nao.
      const gio = new Date(event.scheduledTime).getUTCHours();
      // CHOT BU (2026-11-08): nhom nuoc nao hom nay chua co dau "chot xong" (cron 07:30/07:40 loi) -> chot lai ngay, TRUOC moi viec khac.
      try {
        await chotBuNeuThieu(env);
      } catch (err) {
        console.error("[chot-bu] loi:", err instanceof Error ? err.message : String(err));
      }
      // 18:00 VN: pham vi nao chua co log 17h30 hom nay -> chot lai (khong gui trung Telegram).
      if (gio === 11) {
        for (const nhom of await tatCaNhom(env)) await chotGiaiTrinhNhom(env, nhom, true);
      }
      // Tu do + tu va snapshot R2 "ca da dong" (lib/daDongDayChunks.ts selfHealDaDongDayChunks) - SUA 2026-11-05: chay MOI lan
      // fire (8h-18h VN), dung thiet ke "luoi an toan moi gio"; truoc do chi con chay luc 08:00, lai nam sau 2 buoc khong boc
      // try/catch -> 03/11-05/11 snapshot dung ghi ma khong ai biet (Danh sach tong thieu ca). Rat re khi khong co gi doi
      // (1 dong doc qua index). withD1Retry: ca ham idempotent, chay lai an toan khi D1 "overloaded".
      try {
        await withD1Retry(() => selfHealDaDongDayChunks(env), 4);
      } catch (err) {
        console.error("[self-heal] da-dong-day-chunks loi:", err instanceof Error ? err.message : String(err));
      }
      try {
        await autoSyncTonKhoLk(env, event.scheduledTime);
      } catch (err) {
        console.error("[cron-ton-kho-lk] loi khong mong doi:", err instanceof Error ? err.message : String(err));
      }
      // Nhom linh kien tuong duong (Ho so linh kien, lib/lkThayThe.ts): 1 request / gio, chi ghi khi phien ban doi.
      try {
        const r = await syncLkThayThe(env, { actor: "cron" });
        if (!r.ok) console.error("[cron-lk-thay-the] loi:", r.loi);
      } catch (err) {
        console.error("[cron-lk-thay-the] loi:", err instanceof Error ? err.message : String(err));
      }
      // 4 cot PO theo KV cua Quan ly ton (lib/poHangVeMien.ts, 2026-11-14): version PO doi ma chua tinh toan bo -> tinh lai (luoi an toan).
      try {
        await capNhatPoHangVeNeuCan(env.DB);
      } catch (err) {
        console.error("[cron-po-hang-ve-mien] loi:", err instanceof Error ? err.message : String(err));
      }
      // "ID đặt hàng gần nhất" (Quan ly ton, lib/donLkGanNhat.ts, 2026-11-12): moi gio chi hoi ca chua co / don chua ket thuc;
      // 08:00 VN (gio UTC 1) hoi lai moi ca ung vien + don dong cua ca het la ung vien.
      try {
        await dongBoDonLkGanNhat(env, { toanBo: gio === 1 });
      } catch (err) {
        console.error("[cron-don-lk-gan-nhat] loi:", err instanceof Error ? err.message : String(err));
      }
      // Chi tieu "Luong doi tra" cua the Canh bao ton doc tu he theodoidoimay - neu luc chot 07:30 khong goi duoc
      // (hoac snapshot chot truoc khi co chi tieu) thi moi lan fire 8h-18h VN thu lai (lib/canhBaoTon.ts).
      {
        try {
          await retryLuongDoiTraSnapshot(env);
        } catch (err) {
          console.error("[cron-luong-doi-tra] retry loi:", err instanceof Error ? err.message : String(err));
        }
        await retryLuongDoiTraPhamVi(env);
        // Luoi an toan: ca "can giai trinh" (chot 08:00) da ket thuc trong ngay -> tu ghi log (lib/autoLogCaKetThuc.ts).
        try {
          await autoLogCaKetThucTrongNgay(env.DB);
        } catch (err) {
          console.error("[cron-auto-log-ket-thuc] loi:", err instanceof Error ? err.message : String(err));
        }
        // (2026-10-21) KHONG chay moi gio: bo sung bucket CEO (chi can 1 lan sau khi chot Canh bao ton, + tu bo sung khi doc
        // neu thieu - damBaoBucketCeo) va tu ghi giai trinh qua tranh chap (da chay ngay sau moi lan ghi log tranh chap +
        // 1 lan truoc chot 17h30) - tranh doc/ghi D1 thua.
      }
      // 12:00 VN (gio UTC 5): viec nang con lai cua "dot 08:00" cu - doi ra gio trua (it nguoi dung, khong trung import 07:05/09:04)
      // de gian cach luong tu dong buoi sang (2026-11-07). Chot so da chuyen sang 07:30 (CHOT_0730_1730_CRON).
      if (gio === 5) await viecNangBuoiTrua(env);
      return;
    }

    if (event.cron === CHOT_0730_1730_CRON) {
      const t = new Date(event.scheduledTime);
      const phut = t.getUTCMinutes();
      // 07:30 / 07:40 VN (gio UTC 0): CHOT SO "Bao cao ngay 08:00" theo nhom nuoc - xem chotBuoiSang.
      if (t.getUTCHours() === 0) {
        await chotBuoiSang(env, phut);
        return;
      }
      // 17:30 VN: bat log tranh chap cap 2 (dung chung moi nuoc, ghi 1 lan) truoc khi chot.
      if (phut < 40) {
        try {
          await autoLogGiaiTrinhQuaTranhChap(env.DB);
        } catch (err) {
          console.error("[cron-daily-log-1730] autoLogGiaiTrinhQuaTranhChap loi:", err instanceof Error ? err.message : String(err));
        }
      }
      for (const nhom of await nhomTheoPhut(env, phut)) await chotGiaiTrinhNhom(env, nhom);
      return;
    }

  },
};
