# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Internal web app for managing DVBH (warranty service) case workflows: SLA tracking, backlog
explanations (`giai_trinh`), violation review (`vi_pham`), CSKH customer surveys, revenue, and
several related sub-workflows (duplicate-case review, gas-refill review, disputes). UI text, DB
columns, and code comments are in Vietnamese (no diacritics in code/DB, diacritics in UI strings).
Read `HANDOFF.md` first in any new session — it has business-logic context (ratchet rule, 4-branch
import logic, role permissions, archive policy) that isn't repeated here. `SRS_tong_hop.md` and
`nhat_ky_lam_viec.md` (Vietnamese) hold the fuller design history and session log — update them
instead of creating new summary docs. `KE_HOACH_TOI_UU_D1.md` documents the D1 read-cost
optimization plan (still partially open, see "D1 read-budget discipline" below).

## Commands

Run from repo root (npm workspaces: `backend`, `frontend`).

```bash
npm run dev:worker      # wrangler dev (backend), port 8787, local D1 via --persist-to .wrangler/state
npm run dev:frontend    # vite dev server (frontend), port 5173
npm run build           # tsc -b + vite build (frontend only — this is what deploy scripts build)
```

Typecheck (no test suite exists in this repo):
```bash
npm run typecheck --workspace backend
npm run typecheck --workspace frontend
```

Migrations — local (safe, uses `.wrangler/state` SQLite emulation, never touches remote):
```bash
npm run db:migrate:local
```

Migrations/deploy — remote (**always target `smarttrade`, not the default config** — see below):
```bash
npx wrangler d1 migrations list dvbh-db-smarttrade --remote --config wrangler.smarttrade.jsonc
npm run db:migrate:smarttrade
npm run deploy:smarttrade
```

### Deploy target: always `smarttrade`

The repo has **two parallel wrangler configs** pointing at two different Workers/D1 databases:

| | `wrangler.jsonc` (default) | `wrangler.smarttrade.jsonc` (**actually used**) |
|---|---|---|
| Worker | `dvbh-suite` @ ongtho.workers.dev | `dvbh` @ dichvu3t.workers.dev |
| D1 | `dvbh-db` | `dvbh-db-smarttrade` |
| R2 | `dvbh-reports` | `dvbh-reports-smarttrade` |
| npm script | `npm run deploy` / `db:migrate:remote` | `npm run deploy:smarttrade` / `db:migrate:smarttrade` |

`npm run dev:worker` / `dev:frontend` / `db:migrate:local` go through the default `wrangler.jsonc`
but always with `--local`, so they're safe regardless. **Never run `npm run deploy` or
`db:migrate:remote`** (the un-suffixed scripts) — those hit the unused legacy target. When asked to
"deploy" with no target specified, use `deploy:smarttrade` directly.

**Always bump `APP_VERSION` in `frontend/src/version.ts` by `+0.001` before every `deploy:smarttrade`**
(e.g. `"1.055"` → `"1.056"`) — this is the version string shown in the UI footer ("Hệ thống nội bộ
không chia sẻ dưới mọi hình thức. Phiên bản vX.XXX") and the only way anyone can tell a deploy
actually landed. Bump by hand, not by decimal arithmetic (`0.1 + 0.001` floating-point-rounds badly
in JS) — read the current string, increment the integer suffix, write it back as a string.

## Architecture

**Stack**: Cloudflare Workers (Hono) serving both the API and the built frontend as static assets
from one Worker; Cloudflare D1 (SQLite) as the only database; Cloudflare R2 for large read-mostly
JSON snapshots (see below); Cron Triggers for scheduled jobs. No BigQuery, no Firebase — an earlier
GCP/Firebase design in `HANDOFF.md` was abandoned in favor of this all-Cloudflare stack.

**Critical wrangler setting**: `assets.run_worker_first: ["/api/*"]` in both wrangler configs is
load-bearing. Without it, real browser navigation requests (which send `Sec-Fetch-Mode: navigate`)
get intercepted by Workers Static Assets' SPA fallback and never reach the Worker — `curl` won't
reproduce this bug since it doesn't send that header. Don't remove this setting.

### Backend (`backend/src/`)

- `index.ts` — Hono app, mounts one router per domain under `/api/*`, `app.get("*")` falls through
  to `ASSETS.fetch` for the SPA. **Cron schedule (2026-11-08, still 4 triggers — Cloudflare silently drops extra ones):** 07:05
  QuickSight import (external) → chốt "Báo cáo ngày 08:00" PER COUNTRY GROUP via `"30,40 0,10 * * *"` (`lib/chotTon.ts nhomTheoPhut`):
  minute 30 = VN (+VN×NSKX/Không NSKX), minute 40 = other countries + Admin's mixed "Tất cả quốc gia" scopes; same split for the
  17:30/17:40 tỷ lệ giải trình log (`phamViChot.ts chotGiaiTrinhNhom`) → 08:00–18:00 hourly safety nets (`"0 1-11 * * *"`; first
  `chotBuNeuThieu`: any scope without today's `chot_xong|all` marker row is re-chốt; 18:00 re-runs a missing 17:30 log) → 12:00
  `viecNangBuoiTrua`. **`lib/chotTon.ts` = ONE read per country group** (~1.700 open cases with every NEED_* flag computed in the same
  SQL, + 4 small banner reads, ~8 queries, ~2.5s) then every scope (role / giám sát / each khu vực / NSKX subset) is filtered in memory
  and written with `db.batch`. The old per-scope SQL (~6.000 queries per chốt, `Promise.all` fan-out) overloaded D1 by itself and
  broke the chốt 04–08/11 (verified 08/11: identical results, 0 diffs on 3 scopes). Snapshots no longer hold kpis/pivot/revenue
  (routes fall back to `cachedReport`). Read-time self-heal (`getSnapshotForUser`, `getBacklogDailyForKhuVuc`, `getCanhBaoTonSnapshot`)
  uses the same one-read engine and does NOT persist before 07:30 (`vnTime.ts duocLuuSoTuTinh`). "Đã xử lý trong ngày" = one
  `layCaDaGiaiTrinhSau` query + set intersection (not 98-id chunks per bucket). Never reintroduce `Promise.all` fan-outs in chốt code
  (`gioiHanDongThoi` caps the remaining generators at 2 concurrent queries). Workers Logs enabled. `scheduled()` handles three cron triggers (see `wrangler*.jsonc`
  `triggers.crons`): the hourly one (`CA_LAP_REFRESH_CRON`) is now a safety net for three
  independent, try/catch-isolated jobs (self-heal of R2 "đã đóng" chunks now runs on EVERY `DAILY_SNAPSHOT_CRON` fire
  8h–18h VN, first, wrapped in `withD1Retry` — fixed 2026-11-05 after it had silently drifted to 08:00-only) — it refreshes the "ca lặp" (duplicate case) precompute — since 2026-11-11 only the
  SERIALS of cases whose `updated_at` passed the marker (`refreshCaLapTheoThayDoi`, noon job; full LAG recompute only on Sundays,
  blacklist / "loại yêu cầu bỏ qua lặp" changes, or no marker yet), and every write path only rewrites rows whose prior actually changed
  (the *real* refresh trigger is the import path calling `refreshCaLapPrecompute(db, affectedSerials)` directly, plus case huỷ/bỏ huỷ;
  an empty serial list is a no-op, not a full recompute). Month lists read `idx_case_lap_ht` (migration 0159), self-heals R2 "đã đóng"
  day-chunk snapshots (`selfHealDaDongDayChunks`), and re-warms the dashboard report cache
  (`warmDefaultReports`, itself a fallback for the QuickSight pipeline's own
  `POST /api/external-import/refresh-reports` call); a 3x/day one (`SHEET_SYNC_CRON`, 2h/6h/9h UTC =
  9h/13h/16h VN) auto-syncs the 4 legacy AppSheet-fed Google Sheets (`giai_trinh`/`giai_trinh_lap`/
  `khao_sat`/`nap_gas_danh_gia`, NOT the main CRM) under a fixed system actor email (migration 0033),
  sequentially so one failing sync doesn't block the rest; the daily one archives completed cases
  older than 3 months.
- `routes/*.ts` — one file per feature area, matches the sidebar modules in `frontend/src/modules/`.
  Notable routes not covered elsewhere:
  - `notifications.ts` — `GET /api/notifications/count` returns `NotificationsCountPayload` (badge
    counts for every sidebar module). Cached via `cachedReport`. The `datMuaLk` badge is personalized
    per user role/flags (Tram scope is per-person; TN/Kho/Ke toan/QC see system-wide queues).
  - `datMuaLinhKien.ts` — purchase order workflow for spare parts. Header (`phieu_dat`) + per-row
    (`dat_don_hang`) design with per-row state machine (see `dat_don_hang_log`). Scoped by
    `scopeDatMua.ts`, NOT by `scopeByKhuVuc`. Access flags `la_ktv_dvbh`/`la_ve_tinh`/`la_kho`/
    `la_ke_toan` determine which queue each user sees. GS watches but doesn't approve.
  - `traHang.ts` — return-goods flow, shares `dat_don_hang` with a `loai_don='tra_hang'` flag and
    uses `tra_hang_log` for its 6-step state machine (migration 0064).
  - `phieuXuatKho.ts` — warehouse exit slips (`phieu_xuat_kho`, migration 0058), managed by `la_kho`
    users.
  - `lkSettings.ts` — CRUD for `lk_danh_muc` (parts catalog) and `loai_de_xuat` groups/options;
    fronted by `SettingsModule.tsx` (Admin/TBP DVBH).
  - `partnerApi.ts` — external partner-facing API, authenticated via `X-API-Key` header checked
    against `partner_api_keys` (SHA-256 hashed at rest, `partnerApiAuth.ts`, migration 0047) — a
    plain key comparison, not HMAC-signed requests. Separate from the main UI auth flow. Was
    100% read-only until 2026-08-28, when `POST /sync/ktv` + `POST /sync/linh-kien` were added so
    the independent "Đặt mua linh kiện" system (`linh-kien-app` repo — see that repo's `CLAUDE.md`
    "Nguồn gốc tách hệ thống") can push its `ktv_lien_he`/`linh_kien` updates back here on an hourly
    cron + manual trigger — that system is now the source of truth for those 2 tables, so these 2
    routes overwrite unconditionally (no merge/preserve logic) and Admin's own Settings screens for
    them here are effectively legacy for hand-editing.
  - `missingParts.ts` — tracks `thieu_lk` (missing parts) per order line; closed by `la_kho` users
    when parts arrive, which resumes the parent `dat_don_hang` row.
  - `cases.ts` `GET /:id/mail-timeline` — same pattern for the independent "Theo dõi đổi máy" Worker (`theodoidoimay`,
    repo "thu ky mail doi may"): proxies its `GET /api/partner/case?id=` via Service Binding `THEODOI_APP` + secret
    `THEODOI_APP_API_KEY` (`lib/mailTimeline.ts`), on demand, nothing stored in D1. Shown as CaseDetail tab "Luồng mail"
    (`components/LuongMailPanel.tsx`): exchange-approval milestones parsed from CC'd emails.
  - `cases.ts` `GET /:id/sua-chua-timeline` (2026-11-06) — same pattern for the "Gửi bảo hành linh kiện" Worker (`suachua`,
    repo `../gui-bao-hanh-linh-kien`): proxies its `GET /api/partner/v1/case-timeline?id=` via Service Binding `SUACHUA_APP` +
    secret `SUACHUA_APP_API_KEY` (= `DVBH_PARTNER_API_KEY` there) (`lib/suaChuaTimeline.ts`), on demand, nothing stored. Shown at
    its own CaseDetail tab "Bảo hành" (key `bao-hanh-app`, next to "Mua hàng", same card layout; `components/SuaChuaPanel.tsx`:
    per-order card + per-unit process flow `luong` computed by suachua `lib/partnerCaseFlow.ts`, filtered log) + log rows in
    "Tiến trình chung". Shared box / return-slip logs are filtered suachua-side to transitions + lines naming this order. Covers app-created orders without an Odoo order too; the `sc_*` badge on `don_bao_hanh_odoo` stays for lists.
  - `cases.ts` `GET /:id/linh-kien-timeline` — proxies linh-kien-app's `GET /api/partner/v1/case-timeline`
    (purchase/missing-part/PXK/return logs for one case) via Service Binding `LINHKIEN_APP` + secret
    `LINHKIEN_APP_API_KEY` (`lib/linhKienTimeline.ts`); called on demand when a case is opened, nothing
    stored in D1. Merged into CaseDetail "Tiến trình chung" alongside the AppSheet Google Sheet source
    (was kept in parallel with the AppSheet sheets 2026-09-30; since 2026-11-12, v1.581, CaseDetail no longer shows the 3 AppSheet sources — mua hàng / bảo hành / thiếu hàng — anywhere: tabs, "Gửi BH", Tiến trình chung, badges. Since 2026-11-14 the mua hàng / bảo hành / thiếu hàng / PO Google Sheets are NOT loaded at all (`purchaseWarrantySync.ts DATASET_DA_BO`); only the QC thực tế sheet remains; PO = app EO only).
  - `externalImport.ts` `POST /don-bao-hanh-odoo` — "danh sách đơn bảo hành từ Odoo" (OCRM model
    `technical.service.warranty`) pushed by the auto qs pipeline (`ocrm/warranty.py`), upserted into
    `don_bao_hanh_odoo` by Odoo id (skips rows whose `ngay_cap_nhat_odoo` didn't change), bumps domain
    `don_bao_hanh_odoo` (part of `CASE_DETAIL_DOMAINS`). Odoo cases also carry `OPTIONAL_FIELDS`
    (`ratchet.ts`: `tinh_cu`/`huyen_cu`/`xa_cu`/`linh_kien_loi`, migration 0122) — written only when the
    key is present in the row, hashed only when non-empty, deliberately NOT in `COLUMN_MAP` (manual Excel
    import would null them). CaseDetail tab "Lỗi linh kiện" (`components/LoiLinhKienPanel.tsx`) joins
    `linh_kien_loi` items with `don_bao_hanh_odoo` rows by `ma_linh_kien`.
    `so_gio_xu_ly_klt` (REAL) / `dung_han_klt` (migration 0163, v1.573) = SLA WITHOUT the "KH hẹn lại lịch" exclusion
    (both sources, sent only when the pipeline sets `SEND_SLA_KHONG_LOAI_TRU`); optional fields like the rest — the
    existing `so_gio_xu_ly` / `dung_han` are unchanged. Shown in CaseDetail next to "Đúng hạn" only when present.
  - `partnerApi.ts` `GET /don-bao-hanh-odoo` + `POST /sync/sua-chua-trang-thai` (2026-10-04, migration
    0123) — the "Sửa chữa bảo hành" Worker (`suachua`) PULLS Odoo warranty orders every 15 min with a
    `(ngay_dong_bo, odoo_id)` cursor (+ `?ids=` re-fetch for orders whose case arrived later; LEFT JOIN
    `case_dvbh.ky_thuat_vien` so suachua can match the KTV) and PUSHES back its repair status in batches.
    Repair status lives in separate `sc_*` columns — never overwrites Odoo's `trang_thai`, never touches
    `ngay_dong_bo` (would re-trigger the pull). Pull chosen over push: read/write cost is ~equal (a few
    hundred rows/day vs. 4-5 pipeline runs/day) but pull self-heals and adds no risk to external-import.
    Neither endpoint calls `logPartnerApiCall` (would write 1 D1 row per 15-min poll). `LoiLinhKienPanel`
    shows the `sc_*` status as a second badge.
  - `partnerApi.ts` `GET /thieu-linh-kien` (2026-10-16, PARTNER_API_GUIDE §12) — open "Ca thiếu linh kiện" list as JSON,
    same definition as the menu (reuses `missingParts.ts` exported `baseJoin`), live, paginated (≤1000), 30 req/min/key,
    no `logPartnerApiCall`, does NOT hide `KHU_VUC_AN_KHOI_BAO_CAO` (partner-API convention).
  - `partnerApi.ts` `GET /thong-ke-ktv` (2026-10-26, PARTNER_API_GUIDE §14, `lib/thongKeKtv.ts`) — per-KTV monthly work
    counts for the vipham Worker's "Báo cáo nhanh" (it reuses its case-lookup key). Same KPI definitions as the dashboard
    (KPI month = completion date; `tong_ca_tiep_nhan` = CSKH-received date), KTV = `(ma)` prefix of `ky_thuat_vien`. All KTVs
    of a month computed once via `cachedReport` key `partner/thong-ke-ktv/<thang>`, domain `cases` only (reads `vi_pham`
    but deliberately not declared — that domain bumps on every survey result). 30 req/min/key, no `logPartnerApiCall`.
  - `partnerApi.ts` `POST /sync/po-dat-hang` + `routes/poDatHang.ts` `GET /api/po-dat-hang` (2026-10-20, migration 0139,
    PARTNER_API_GUIDE §13) — the "EO Mua hàng" Worker (`muahang`, repo `../EO MUA HANG/eomua`) PUSHES every EO line
    (PO) it changed, upserted into `po_dat_hang_eo` by `id_dat_lk` (`LK-…` legacy / `EOI-<id>` new), skipping
    rows whose `row_hash` is unchanged; changed rows get `phien_ban` = new version and the version bump runs IN THE SAME
    batch only when some row carries it (migration 0168, 2026-11-14). The client (`lib/poDatHangEo.ts`, cache key
    `po-dat-hang-eo-v2`) always sends `?v=<version>`: unchanged → 1 row read; older → ONLY rows with `phien_ban > v`
    (`"delta":true`, merged by `id_dat_lk`); no/invalid v → full. No row is ever deleted (delta has no tombstones — add
    them before adding a delete path). The legacy Google Sheet PO source was dropped 2026-11-14 (app EO only). Mapped to the sheet's field names/date format so CaseDetail / Linh kiện thiếu / Hồ sơ LK are
    unchanged; `maLinhKienGoc` (equivalent-part swap) also matches.
  - `auth.ts` 3T Pet toggles (2026-10-29, migration 0147) — the "3T Pet" widget (Worker `3t-pet`) is NOT in `index.html`;
    `frontend/src/lib/pet3t.ts` injects its script only when system flag (`cai_dat_he_thong` key `bat_pet_3t`, returned as
    `pet_3t_he_thong` by `GET /api/auth/me`, Admin sets via `PATCH /api/auth/pet-3t-he-thong`) AND personal `users.bat_pet_3t`
    (`PATCH /api/auth/me`) are on. UI: `components/PetSettingsPanel.tsx` in Cài đặt cá nhân. `cai_dat_he_thong` is a generic
    key/value table for future system flags (no FK to `users` on purpose).
  - `partnerApi.ts` `GET /google-sheet-ca` (2026-10-29, PARTNER_API_GUIDE §15) — a Google Sheet PULLS open cases + cases
    completed in the last `so_ngay` (default 3) days, filtered by `khu_vuc`, as the 28 CRM-export columns of the owner's
    template ("Kỹ thuật viên" = `COALESCE(ktv_trien_khai, ky_thuat_vien)`, owner 2026-11-05); the Apps Script lives in `scripts/google-sheet-ca.gs` (daily trigger + manual menu, upsert by ID, key in
    Script Properties). Two UNION ALL branches so each hits a partial index. Pull chosen over push (no Google creds/cron
    in the Worker, self-heals). Live (not cached), no `logPartnerApiCall`, 30 req/min/key.
  - `cases.ts` `GET /:id/lada/:orderId` + table `case_lada` (2026-11-03, migration 0153) — "ID Lada" = `order_id` of the ETX/Lada
    "Giải trình tồn B2B" API (`lib/etxGiaiTrinhSync.ts`; `id_truy_xuat` = `case_dvbh.id`). The sync upserts one row per Lada
    order (1 case can have several) via `ghiLienKetLada`, writing only when a column changed; domain `lada` (in
    `CASE_DETAIL_DOMAINS`). CaseDetail field "ID Lada" (`components/LadaPanel.tsx`) → popup that proxies the ETX API by
    `order_id` + stored `ma_doi_tac` on demand (60-day retention, not stored, staff emails stripped).
    Older orders: Settings ETX tab button "Lấy ID Lada 60 ngày" (`chi_lien_ket_lada`) writes only `case_lada`, never `giai_trinh`/sync log.
  - `qlNskx.ts` (2026-11-11, migration 0160, module `ql-nskx`, `modules/QlNskxModule.tsx`) — menu "QL NSKX": every NSKX case
    (VN, `doi_tac IN ('NSKX','[NSKX]')`) by CSKH-received month, Excel-style column filters reusing `lib/locCot.ts` with its own
    column map (`locCotClause(..., cotMap)`); frontend skips `?pv=` for `/ql-nskx`. Tab "Đánh giá lõi lọc": GS (own khu vực) / TBP
    DVBH / Admin confirm thay/không thay + which cores (`nskx_loi_loc`, codes must exist in `linh_kien` OR in the case's own Odoo `linh_kien_loi` (owner 2026-11-11, name taken from that report); suggestion = `linh_kien_loi`
    items whose name contains "lõi" — accent-sensitive, "lỗi" is not a core). Manual button `POST /dong-bo-don` sends NSKX cases
    received from 2026-11-01 (`NSKX_DONG_BO_TU_NGAY`, owner decision)
    not marked "không thay" (+ their `case_lada` IDs) to linh-kien-app `POST /api/partner/v1/don-loi-loc`, which returns live orders of
    type "HỖ TRỢ NGOÀI BẢO HÀNH TG12…" (cancelled/rejected excluded) → `nskx_don_lk` (only changed rows written; summary in
    `cai_dat_he_thong` key `nskx_dong_bo_don`). Order status = đã lên đơn > không cần (không thay) > không áp dụng (received before 2026-11-01) > chưa lên đơn.
    Migration 0161: `thay_loi` 2 = không áp dụng + `nskx_loi_loc_log` (history). An unconfirmed COMPLETED case with no "lõi" part counts
    as `tu_dong_khong_thay`. CaseDetail tab "nskx" (`components/NskxPanel.tsx`, prop `coNskx`, in App `VALID_TABS`) = flow + confirm
    form + history + TG12 orders from the SAME `useLinhKienTimeline` data as tab "Mua hàng"; QL NSKX rows open the case on this tab. Live reads, no cache.
    **Đặt lõi** (v1.571, migration 0162, `lib/nskxDatLoi.ts`, `components/DatLoiNskxModal.tsx`): `POST /dat-loi/xem-truoc` + `/dat-loi/tao`
    call linh-kien-app `POST /api/partner/v1/dat-hang(/kiem-tra)` (v1.470+) AS THE CLICKING USER (`email_nguoi_dat`; the DVBH key needs
    "đặt thay đúng người bấm" turned on there, v1.473), recipient = `(ma)` of `ktv_trien_khai` else `ky_thuat_vien`, type
    "HỖ TRỢ NGOÀI BẢO HÀNH TG12-NSKX", `ma_yeu_cau_su_co` = case id; only confirmed cores (`thay_loi = 1`), cases from 2026-11-01.
    Anti-duplicate: live TG12 read right before ordering, per-case lock `nskx_dat_loi_khoa` (5 min), deterministic `ma_yeu_cau`
    (re-send returns the old slip). One slip per recipient ≤30 lines, created SEQUENTIALLY; blocked lines are dropped after kiem-tra.
    Every call logged in `nskx_dat_loi_log`. Single (tab NSKX) and bulk (v1.572: button in the list toolbar, `GET /dat-loi/ung-vien` takes the SAME filters as `/danh-sach`
    via shared `whereTheoLoc`, ≤500 cases; a Giám sát whose list includes cases outside `khu_vuc_phu_trach` is asked whether to include
    them; the preview always runs kiem-tra (≤20 slips) and groups lines per KTV with a per-core summary).
  - `lib/donLkGanNhat.ts` (2026-11-12, migration 0164 `don_lk_gan_nhat`, v1.577) — Quản lý tồn > Danh sách chi tiết cột "ID đặt hàng
    gần nhất" + trạng thái / ngày đặt / duyệt / xuất hàng cho ca đang tồn có "Mã linh kiện thiếu" ở giải trình gần nhất. Kéo từ linh-kien-app
    `POST /api/partner/v1/don-gan-nhat-theo-ca` (bên đó chọn 1 đơn/ca: bỏ trả hàng/từ chối/huỷ, ưu tiên đúng mã LK thiếu kể cả mã thay thế,
    rồi mới nhất; khớp mã ca > ID Lada > mã `DDH-…` trong "Mã xuất hàng liên quan"). Mỗi giờ 8h–18h (piggyback `DAILY_SNAPSHOT_CRON`) chỉ hỏi
    ca chưa có dòng / đơn chưa kết thúc / đổi mã LK; 08:00 hỏi lại tất cả + xoá dòng ca hết là ứng viên; mở chi tiết ca (`/:id/linh-kien-timeline`)
    làm mới ca đó. Chỉ ghi dòng có cột đổi; lỗi giữ dữ liệu cũ (tóm tắt ở `cai_dat_he_thong` `don_lk_gan_nhat_dong_bo`). List đọc bảng theo khoá
    chính cho đúng các ca của trang (`layDuCotCa`), lọc/sắp xếp qua `COT_LOC` `don_lk_*` (subquery). Ca chưa có đơn trên app mà mã trong giải trình
    trùng ID Google Sheet mua hàng cũ → frontend hiện tạm từ sheet (nghiêng, không lọc server).
  - `suaDoanhThu.ts` (2026-11-14, migration 0170, module `sua-doanh-thu` "Sửa DT · HĐ · BH", `modules/SuaDoanhThuModule.tsx`,
    CaseDetail block `components/DtHdBhPanel.tsx` in the "Doanh thu" section). Editors: GS (own `khu_vuc_phu_trach` only) / CSKH /
    TN CSKH / TBP DVBH / TBP CSKH / Admin, no approval, every change logged in `case_sua_log`. (1) **Doanh thu chuẩn**: the 3 `dt_*`
    columns are OVERWRITTEN with the corrected values (owner: corrected revenue replaces CRM revenue in every report), CRM originals
    kept in `dt_*_crm`; `importProcessor buildFullOverwrite` keeps `dt_*` when `dt_sua_at IS NOT NULL` (same pattern as
    `khu_vuc_sua_at`); edits bump `cases`. R2 "đã đóng" chunks / the frozen 08:00 snapshot keep old numbers until rewritten. (2) **Xuất
    hóa đơn**: linh-kien-app PUSHES invoice-requested order lines when Kế toán chốt a PXK (`POST /api/partner/sync/don-hoa-don`, its
    `lib/hoaDonDvbh.ts`) + manual pull button (`GET {LINHKIEN_APP_URL}/api/partner/v1/don-hoa-don?tu_ngay=`), both via
    `lib/hoaDonLk.ts ghiDonHoaDon` → `don_hoa_don_lk` (matched by case id on the order > `case_lada`, only changed rows written).
    Case = "có HĐ" automatically when it has a non-cancelled line; manual override in `case_hd_bh.xuat_hoa_don`. (3) **Hạn bảo hành**
    (`lib/hanBaoHanh.ts`, frontend copy `lib/hanBaoHanh.ts`): hạn = min(ngày mua +24T, ngày SX +36T); tiếp nhận > hạn → hết BH; only
    cases received from 2026-11-01; computed at read time, manual override `case_hd_bh.con_bao_hanh`. Excel import
    `POST /import?commit=0|1`. Domain `hd_bh` (in `CASE_DETAIL_DOMAINS`). Live reads, no cache.
  - `greeting.ts` — one-time greeting popup system (`greeting` table, migration 0044).
  - `survey.ts` `/loai-tru` (2026-10-09, migration 0128 `khao_sat_loai_tru`) — "Danh sách loại trừ" khảo sát: KTV
    (`ma_ktv`, matched as the `(ma)` prefix of `case_dvbh.ky_thuat_vien`) + loai_loi + `[tu_ngay, den_ngay]` vs the
    case's CSKH-received date. Wired into `NEED_SURVEY_CONDITION` (`lib/surveyConditions.ts` `loaiTruExistsSql`), so
    an excluded suspicion no longer makes `can_khao_sat = 1`; candidates also return `loai_tru_*` flags so the UI fades
    an excluded suspicion on cases that still need a call for other reasons. Add/delete recompute `can_khao_sat` for
    the affected cases with one `UPDATE … WHERE can_khao_sat IS NOT <new>` (no-op rows not written).
  - `diaGioi.ts` (2026-10-10, migration 0130 `tinh_quy_doi`) — "Địa giới cũ / mới": global toggle on TopBar, name
    normalization + old→new province mapping done CLIENT-side (`frontend/src/lib/diaGioi.ts`); server only serves the raw
    mapping table + raw `(tinh, quan_huyen, tinh_moi, xa_moi)` combos (`/to-hop`). Filters arrive as `dg_loc` (JSON of raw
    values, one bind via `json_each`) → `lib/filterParams.ts diaGioiLoc`. Old address = `tinh`/`quan_huyen` for every source
    (Odoo copies `tinh_cu` into it when closed), new = `tinh_moi`/`xa_moi` (Odoo only). New report endpoints grouping by
    province should return the raw `(tinh, tinh_moi)` pair and let the client group, not a server-normalized name.
  - `tonKhoLk.ts` (2026-10-08, migration 0125, `lib/tonKhoLk.ts`) — spare-part stock pulled from linh-kien-app's
    `GET /api/partner/v1/ton-kho(/meta)` (the MISA stock file Kế toán imports daily there; Service Binding
    `LINHKIEN_APP`). Only ONE version kept: a new `phien_ban` (linh-kien-app import time) → DELETE + re-insert all
    of `ton_kho_lk` (~8.7k rows) in one batch, bump domain `ton_kho`. Auto-checked hourly 8h–18h VN Mon–Sat
    (stops for the day once today's version is in) by piggybacking on `DAILY_SNAPSHOT_CRON`, now `"0 1-11 * * *"`
    — (since 2026-11-07 the morning "08:00" chốt runs at 07:30 from `CHOT_0730_1730_CRON`, heavy tails at 12:00 = UTC hour 5); this avoids a 5th Cron
    Trigger (see the ETX_SYNC_CRON note on the silently dropped triggers). `ton_kho_nhom_kho` = which `ma_kho`
    sum into "Tồn kho MB"/"Tồn kho MN" (tab "Cấu hình kho", Admin/TBP DVBH edit). UI: `components/TonKhoLk.tsx`.
    "Linh kiện tương đương" (2026-11-12, v1.579, migration 0165 `lk_thay_the`, `lib/lkThayThe.ts`): nhóm thay thế kéo từ linh-kien-app
    `GET /v1/lk-thay-the` mỗi lần fire `DAILY_SNAPSHOT_CRON` (chỉ ghi khi `phien_ban` đổi; trạng thái ở `cai_dat_he_thong` `lk_thay_the_dong_bo`;
    `POST /api/ton-kho-lk/lk-thay-the/sync` ép kéo). `GET /ma/:ma/tuong-duong` = các nhóm chứa mã + tồn MB/MN/kho khác/KTV theo khu vực của
    từng mã (đọc `ton_kho_lk`). UI: tab "Linh kiện tương đương" + dải tóm tắt trong Hồ sơ (`components/LkTuongDuong.tsx`); bấm mã mở hồ sơ mã
    đó, `HoSoLinhKienProvider` giữ ngăn xếp (← Quay lại / ⤒ Hồ sơ gốc).
    GĐ2 "Hồ sơ linh kiện" (`components/HoSoLinhKien.tsx`): per-part stock `GET /ma/:ma`, order history + shortage
    tickets proxied on demand from linh-kien-app `GET /ma/:ma/lich-su` (not stored), cases via `/api/missing-parts?ma_lk=`.
    TopBar box "Tra tồn LK" (`components/TonKhoSearch.tsx`, 2026-10-20): `GET /tim?q=` accent-insensitive search on code+name
    (`lib/tonKhoTim.ts`: in-isolate index keyed by version ton_kho+settings, 10-min max age), returns MB/MN/KTV + catalog-only codes.
- `middleware/` — `session.ts` verifies the `dvbh_session` JWT cookie and sets `email`; a route then
  loads the full `AppUser` (role, `khu_vuc_phu_trach` assigned regions, approval status) via
  `loadUser.ts` and sets `user`; `requireRole.ts` gates by role; `scopeByKhuVuc.ts` builds the
  region-scoping `WHERE` clause every list/report query needs — roles in `ROLES_XEM_TOAN_BO`
  (`types.ts`: `Admin, Viewer, TBP DVBH, TBP CSKH, QC` — QC added 2026-07-29, "xem như Viewer" per
  `HANDOFF.md`) see everything, everyone else is restricted to their assigned `khu_vuc_phu_trach`.
  This same constant also gates `requireRole` on `routes/revenue.ts` — adding a role here grants it
  both unrestricted region scope *and* Revenue API access, two different things bundled in one flag;
  keep that in mind before adding another role to the list. `revenue.ts` needed a role
  (`Giam sat`) that should see Revenue but *not* get unrestricted region scope, so it's appended as a
  separate `requireRole(...ROLES_XEM_TOAN_BO, "Giam sat")` arg instead of being added to the constant
  — the pattern to follow if another role needs Revenue access without full region visibility.
- **"KTV triển khai" (`case_dvbh.ktv_trien_khai`, migration 0135, Odoo only)**: the account that actually handled the case
  when the "Đội ngũ/Trạm" station account (`ky_thuat_vien` = "Trạm triển khai") has several people; NULL = same as
  `ky_thuat_vien`. Computed in the auto qs pipeline (`ocrm/transform_odoo.py ktv_trien_khai()`), sent only with
  `ODOO_SEND_KTV_TRIEN_KHAI=true`. Read it as `COALESCE(ktv_trien_khai, ky_thuat_vien)`; reports still group by
  `ky_thuat_vien` until the owner decides otherwise — exception (owner, 2026-10-22): Tổng quát pivot dim KTV
  (`dashboardCompute.ts PIVOT_KTV_TRIEN_KHAI_EXPR`, snapshot flag `pivotKtvTrienKhai`, cache key `dashboard/pivot-v2`).
- **"Phạm vi báo cáo" Tất cả / NSKX / Không NSKX (`lib/phamVi.ts`, migration 0136, 2026-10-13)**: TopBar toggle that
  only affects VIEWING reports/lists. The frontend `api/client.ts` appends `?pv=nskx|khong_nskx` to every GET (except
  `/notifications`, `/auth`); `phamViMiddleware` then swaps `c.env.DB` for a wrapper that **rewrites table names in
  every SQL statement**: `case_hieu_luc` → view `case_hieu_luc_<pv>`, `case_dvbh [alias] INDEXED BY idx` → filtered
  view/subquery, and the snapshot/cache tables (`precomputed_cache`, `daily_snapshot`, `giai_trinh_daily_log`,
  `backlog_age_daily`, `backlog_age_month_manifest`, `ton_ktv_daily`, `canh_bao_ton_daily_log`) → `<table>_<pv>`
  copies. So all report/snapshot/self-heal code runs unchanged but reads and writes the scope's own data, and can never
  overwrite the "Tất cả" numbers. NSKX = `doi_tac IN ('NSKX','[NSKX]')` (`[NSKX]` = old CRM label, pre-07/2026).
  Rules: (1) a **new snapshot/cache table** fed from case reads must get `_nskx`/`_khong_nskx` copies (+ per-country copies:
  add it to `BANG_THEO_PHAM_VI` and create `_vn`/`_vn_nskx`/`_vn_khong_nskx`/`_id` in its migration) or scoped modes silently
  show/write "Tất cả" data; (2) code reachable from a GET that writes
  **shared** derived data (e.g. `refreshCaLapPrecompute`) must use `dbGoc(db)`; (3) anything sent outside (Telegram)
  must not send from a non-country scope (Telegram: `nhomTelegramCuaPhamVi`); (4) cron/refresh-reports chot both scopes via `lib/phamViChot.ts` (history
  starts 2026-10-13). R2 data (closed-case chunks, lũy kế) is filtered client-side (`frontend/src/lib/phamVi.ts`;
  lũy kế NSKX = column "KH VIPs" containing NSKX/NSXK, auto months write "NSKX"). The old "Báo cáo NSKX" module was removed.
- **"Đa quốc gia" (multi-country, SRS §12, migrations 0148/0149, 2026-10-29) — ENFORCED**: `case_dvbh.quoc_gia` is set on
  INSERT only (GHI_MOI) from GLOB ID patterns in `quoc_gia_mau_id` (`lib/quocGia.ts`; real IDs: all-digits = old CRM,
  `T…` = CRM 3T, `SC…` = Odoo VN; unmatched → VN). `users.pham_vi_quoc_gia` (NULL = all; staff + new accounts default
  `["VN"]`, Admin = all) is a **permission**, applied in `loadUser` via `apPhamViQuocGia` (`lib/phamVi.ts`) on top of the
  NSKX proxy: GET → same table-rename proxy with a country dimension (suffix `vn`, `vn_nskx`, `vn_khong_nskx`, `id`, …;
  NSKX only exists for VN) **plus** every plain `FROM/JOIN case_dvbh [alias]` becomes a `quoc_gia`-filtered subquery
  (so a case of another country is "not found", child-table joins are filtered too); non-GET → only that case_dvbh filter
  over ALL the user's countries (`bocGhiTheoNuoc`). Skipped: `/auth`, `/partner`, `/external-import`, `/import`.
  **Khu vực phụ trách ở nước khác VN** (2026-11-12, v1.582, `lib/phamVi.ts khuVucTheoNuocDangXem`): GET của nước ≠ VN chỉ giữ khu vực đã gán
  (`khu_vuc_phu_trach`/`khu_vuc_duoc_xem`) có trong dữ liệu nước đó; không còn khu vực nào → thay bằng mọi khu vực của nước (xem toàn bộ nước,
  quyền vào nước = `pham_vi_quoc_gia`). Áp ngay trong `apPhamViQuocGia` (`c.set("user")`) nên mọi `scopeByKhuVuc` + chốt/snapshot Giám sát theo;
  danh sách khu vực mỗi nước cache 10 phút trong isolate. Frontend: `KhuVucFilterControl` bỏ chip khu vực đã gán không có trong options của nước
  đang xem; `api/client.ts` (`boKhuVucDaGanKhoiPath`) bỏ `khu_vuc=` chỉ gồm khu vực đã gán khỏi request của nước khác.
  Gán khu vực cho Giám sát nước khác (v1.583): màn Phân quyền (`UsersModule.tsx`) nhóm chip theo nước — VN từ `/dashboard/filters?qg=VN`
  (ép `qg` đứng đầu, client nối `qg` hiện tại phía sau, Hono lấy giá trị đầu), nước khác từ `GET /api/users/khu-vuc-theo-nuoc` (Admin, DISTINCT
  khu_vuc mỗi nước đang bật qua index riêng). GS PH: gán khu vực PH + `pham_vi_quoc_gia` có PH.
  **"Mốc tồn cần giải trình" theo nước** (2026-11-13, v1.591, migration 0167 `quoc_gia.moc_ton_giai_trinh`, VN 5 / PH 1): nhánh "Chưa GT >N ngày"
  (`needGiaiTrinh.ts NEED_CHUA_GT_5_NGAY`, tên giữ nguyên) = `AGE >= MOC_TON_GIAI_TRINH_EXPR` (subquery `quoc_gia` theo `c.quoc_gia`, mặc định 5) →
  NEED_TONG, thẻ, cột nhóm tồn, chốt số đều theo. Mọi nơi dùng NEED_* phải có alias `c` là case_dvbh/case_hieu_luc (cần cột `quoc_gia`).
  Admin sửa ở Cài đặt > Quốc gia (PUT /api/quoc-gia/nuoc `moc_ton_giai_trinh`, bump settings/cases/giai_trinh). UI đổi nhãn qua `nhanTheoMoc`.
  Every user views ONE country at a time — the "Tất cả quốc gia" option was removed 2026-11-11 (owner); a full-scope user
  without/with an invalid `?qg=` gets VN (`chonQuocGia`), the mixed base scope is now only for cron/partner/import.
  Since 2026-11-11 the import also accepts an explicit `quoc_gia` field per row (auto qs `SEND_QUOC_GIA`, by download
  source; empty = VN, unknown code → error + ID-pattern fallback): used on INSERT and re-written on an existing case whose
  stored country differs (counted as GHI_DE); not part of `crm_hash`. Rows without the key keep the ID-pattern rule.
  Per-country views/table copies: VN+ID in migration 0149 (history copied from the base tables), new countries created at
  runtime from the base DDL (`lib/quocGiaKichHoat.ts`, on Admin enable + every cron chốt). Cron chốt/17:30/retry loop all
  scopes (`lib/phamViChot.ts`), `warmDefaultReports` also warms VN. Telegram/`xoaBanPhamVi` check `laPhamViGoc(db)`.
  R2 "đã đóng" chunks stay ONE shared file per day (no extra R2 writes) but `POST /api/cases/da-dong-chunks` only returns
  rows of the request's country (`chonQuocGia`, rows without `quoc_gia` = VN); client IndexedDB keys carry the country.
  Lũy kế = VN only. Telegram 08:00/17:30 images are sent per COUNTRY scope to `quoc_gia.telegram_chat_id` (migration 0150,
  `lib/telegram.ts nhomTelegramCuaPhamVi`; "Tất cả"/NSKX scopes send nothing) and NEVER from local dev
  (`danhDauMoiTruongLocal`, `LOCAL_DEV_BYPASS_AUTH=true`). Partner API = all countries (owner decision). Catalogs
  (khu vực, KTV, settings lists, Đặt mua LK) are shared by all countries. No index on `quoc_gia` on purpose (low
  selectivity would mislead the planner).
- **Settings option translations (migration 0150, owner decision 2026-10-29)**: the 11 option tables in Settings (`ban_dich_en`/
  `ban_dich_id`, + `nhom_loi_en/id` on `settings_loai_vi_pham`; list in `routes/banDich.ts BANG_LUA_CHON`) have EN/ID
  translations — existing ones AI-translated in the migration, new ones typed by Admin in the "Bản dịch (EN / ID)" column
  (`components/BanDichCell.tsx`, `PUT /api/ban-dich`). Stored/sent values stay Vietnamese; the UI shows `dl(value)`
  (`frontend/src/lib/banDichDuLieu.ts`, dictionary from `GET /api/ban-dich` loaded after login when language ≠ vi). Wrap
  `dl()` only at render sites of these values (never compared/sent/Excel values). This is the one exception to "business
  data stays Vietnamese" in the i18n section below.
- **Cancelled cases (`huy_bo_at`) are excluded everywhere via VIEW `case_hieu_luc`** (migration 0133,
  2026-10-11): every report/list/dropdown READ query uses `case_hieu_luc`, not `case_dvbh`. Keep `case_dvbh`
  only for writes, single-case lookups by id (Admin can still open a cancelled case), and queries with
  `INDEXED BY` (not allowed on a view — add `huy_bo_at IS NULL` by hand there). New report queries must
  read the view. Column qualifiers must match: `case_hieu_luc.col`, never `case_dvbh.col`, when FROM is the view.
- `lib/` — shared business logic, not framework code. Notable ones:
  - `ratchet.ts` — column mapping (Vietnamese Excel headers → DB columns) and the one-way "ratchet"
    rule for the 4 violation-flag columns: once `true` in DB, an import can never flip it back to
    `false`. This is a direct port of the original Node/pg `import.js` (kept in repo root for
    reference, not used at runtime).
  - `importProcessor.ts` — the 3-branch decision per imported row (`GHI_MOI` new / `BO_QUA` no-op /
    `GHI_DE` real overwrite). Change detection compares `crm_hash` (SHA-256 of `BUSINESS_FIELDS`,
    see `ratchet.ts computeCrmHash`) instead of `SELECT *` + field-by-field diff — a 4th branch that
    used to fire a no-op "seen today" write for open cases with zero data change (`CAP_NHAT_MOC_
    THOI_GIAN`) was removed 2026-07-28 (business decision: not needed). Legacy rows with `crm_hash
    IS NULL` self-heal on next touch; run `POST /api/import/backfill-crm-hash` (Admin, paginated,
    loop until `remaining: 0`) once after deploying this feature to a DB that predates it, or the
    next import will treat every untouched row as "changed" in one batch.
  - `ageCalc.ts` — case age is computed against a fixed "00:00 Vietnam time" anchor
    (`AGE_ANCHOR`), not `datetime('now')` directly — D1's `datetime('now')` is UTC and must be
    shifted `+7 hours` first. All `thoi_gian_*` columns are stored as Vietnam **local** wall-clock
    time as imported (not UTC) — never apply a timezone conversion to them.
  - `dataVersions.ts` / `reportCache.ts` — the report-caching system (see below).
  - `precomputedCache.ts` — separate, simpler "compute-on-miss + explicit recompute-after-write"
    cache for dashboard filter/month dropdowns, keyed directly (no version-tag comparison).
  - `caLapRefresh.ts` — incremental recompute of the "ca lặp" (duplicate case) precompute table,
    keyed by affected `seri_san_pham` when possible, full recompute as a fallback safety net.
  - `daDongDayChunks.ts` — the R2 JSON-snapshot mechanism (see "R2 usage rules" below).
  - `moduleAccess.ts` — per-user module visibility logic (migration 0042). `effectiveModules(user)`
    is the single source of truth: Admin always gets everything; otherwise uses `user.modules` (JSON
    array from DB) if non-null, else falls back to `DEFAULT_MODULES_BY_ROLE[vai_tro]`. The flags
    `la_ktv_dvbh`/`la_ve_tinh`/`la_kho`/`la_ke_toan` auto-add `dat-mua-lk` and `tra-hang` to any
    base list. The 3 system modules (import/settings/users) are NOT in this system — they stay
    hardcoded to `requireRole("Admin")` in their routes.
  - `scopeDatMua.ts` — scope middleware for the "Đặt mua linh kiện" module. Uses user
    relationships (creator / Tram parent / GS assignment), not `khu_vuc_phu_trach`.
  - `dailySnapshot.ts` — runs at the daily cron: snapshots giai_trinh counts, pushes a PNG report
    image via Telegram (`telegram.ts` + `reportImage.ts`).
  - `canhBaoTon.ts` + `luongDoiTraTon.ts` — "Cảnh báo tồn" card (Quản lý tồn), frozen at 08:00. Since 2026-10-12 it
    has 5 metrics per level; `luongDoiTra7`/`luongDoiTra10` come from the external theodoidoimay Worker (open flow,
    exchange case not completed, age from mail `origin_at`), not D1 — so their bucket can carry `loi` when that Worker
    was unreachable at 08:00, and every hourly `DAILY_SNAPSHOT_CRON` fire retries (`retryLuongDoiTraSnapshot`).
    `getCanhBaoTonSnapshot`/`computeCanhBaoTonBuckets` take `Env` (need the Service Binding), not `D1Database`.
    **"Tồn TBP / Tồn CEO" log** (2026-10-29, migration 0151): every time the base-scope ("Tất cả") Cảnh báo tồn snapshot of
    today is written (08:00 chốt, self-heal, luồng đổi trả retry), `ghiLogChuyenCapCanhBao` diffs each level (Cấp 1 = TBP/TP
    DVBH, Cấp 2 = CEO) against the most recent earlier snapshot and inserts one row per case that newly entered it into
    `canh_bao_ton_chuyen_cap_log` (UNIQUE case+cap+ngay → idempotent; bumps domain `canh_bao_ton_log`, in
    `CASE_DETAIL_DOMAINS`). Shown in CaseDetail tab "GT tồn" as "Nhật ký hệ thống" — owner rule: log only, it is **NOT** a
    giải trình, so it lives in its own table and is returned as `chuyenCapLog`, never merged into `giai_trinh`/`giaiTrinh`.
  - `telegram.ts` — sends PNG images via Telegram Bot API (`sendTelegramPhoto`); used only by
    `dailySnapshot.ts` for the 17:30 VN daily report push.

#### Report caching: version-tag system (`dataVersions.ts` + `reportCache.ts`)

Read-heavy report/stat endpoints don't query source tables live on every request. Instead:
1. `data_versions` table holds one integer version per data **domain** (`blacklist`, `cases`,
   `dat_mua_lk`, `giai_trinh`, `giai_trinh_lap`, `ket_qua_goi`, `nap_gas_danh_gia`, `settings`,
   `tranh_chap`, `users`, `vi_pham`). Every write path calls `bumpVersions(db, [...domains])` right
   after (or in the same batch as) its actual write. `tranh_chap` was added 2026-07-29 (bumped by
   every write to `tranh_chap_tien_trinh`/`tranh_chap_log`); `dat_mua_lk` was added 2026-08-14
   for the "Đặt mua linh kiện" badge in `notifications/count` — bumped by every write in
   `datMuaLinhKien.ts`, `phieuXuatKho.ts`, `traHang.ts` (previously those writes bumped `cases`
   by mistake, causing unnecessary dashboard invalidation).
2. Report endpoints wrap their compute function in `cachedReport(db, key, domains, compute)`: it
   builds a version-tag from the declared domains (plus the current Vietnam-time date, since
   age-bucketed reports can change at midnight with zero writes), compares it to the tag stored in
   the cached envelope, and only re-runs `compute()` on a mismatch.
3. `YEU_CAU_BAO_CAO_TINH_SAN.md` is the spec for this system — it lists every wrapped endpoint and
   its declared domains. **When adding a new report endpoint or changing what tables an existing one
   reads, update the domain list there and in the corresponding `cachedReport()` call** — an
   endpoint that reads a table not in its domain list will silently serve stale cached data forever.
4. Domain `cases` is deliberately narrow: it only bumps on an actual CRM import
   (commit/sync-sheet with `GHI_MOI + GHI_DE > 0`), not on every write to `case_dvbh` — see the
   comment block at the top of `dataVersions.ts` before adding a new bump site.

This system exists because of a real production incident: live-computed stats were reading ~5.7M
rows/hour before caching. D1 has a 5M-rows-read/day soft budget on the Free plan — see
`KE_HOACH_TOI_UU_D1.md` for the full cost audit and remaining optimization stages if query costs
come up again.

#### D1 read-budget discipline: how "rows read/written" are actually counted

Before proposing a D1 query optimization, know what actually moves the billed number
([source](https://developers.cloudflare.com/d1/platform/pricing/)):

- **Billing is per row scanned, not per column, and not per byte.** `SELECT *` vs `SELECT id` on
  the same matched rows costs the *same* `rows_read` — column count/row size never affects the
  count. Narrowing a `SELECT` list only saves bytes transferred (Worker↔D1 latency/CPU), not the
  metered `rows_read` figure. Don't justify a `SELECT *` → narrow-projection change by "fewer rows
  read" — it isn't; justify it by "less to transfer" or "simpler comparison logic" if that's the
  real reason.
- **`rows_read` counts rows *scanned* to answer the query, not rows returned.** A `WHERE` on an
  unindexed column still has to scan every candidate row to decide which to keep, even if the
  result set is tiny — e.g. `computeDashboardFilters()`'s 7 `SELECT DISTINCT` calls
  (`routes/dashboard.ts`) each scan the full `case_dvbh` table because most of those dims aren't
  indexed, regardless of how few distinct values come back. A `WHERE id IN (...)` lookup (primary
  key) is the opposite case: it's a direct index seek, one row read per matched `id`, and narrowing
  the column list changes nothing about that count.
- **`rows_written` counts one row for the base table plus one more per index that the write's
  changed columns touch.** Updating an indexed column costs 2+ "rows written" (table + each index),
  not 1 — this is why `KE_HOACH_TOI_UU_D1.md` Giai đoạn 4 treats adding new dim indexes as a
  tradeoff to measure, not a free win, and it's real leverage for reducing writes: cutting an
  unnecessary `UPDATE` (e.g. the removed `CAP_NHAT_MOC_THOI_GIAN` branch, see `importProcessor.ts`
  above) saves more than trimming that same write's column list ever would.
- **Practical implication:** the actual lever for cutting `rows_read` is reducing *rows scanned*
  (a matching index, or a narrower `WHERE`/`IN` set) — not reducing columns selected. The lever for
  cutting `rows_written` is reducing *how many rows get written at all* (skip no-op writes) and
  *how many indexes a hot column touches* — not the payload size of the write.
- **"D1 DB is overloaded" (account-wide, lasts minutes during the pipeline import window, 2026-11-05)**: background/import
  writes that must not be lost go through `lib/d1Retry.ts withD1Retry` (only retries that error). It silently stopped the
  R2 "đã đóng" snapshot 03–05/11 (bg_error write failed too) → Danh sách tổng missed cases.
- **Latency = D1 queue time, not rows (audit 2026-11-07)**: one D1 DB runs ONE query at a time, so a 1 ms case search waits
  behind every 1–5 s report query, and "overloaded" = this DB's own queue passing ~10 s. Rank optimizations by
  `wrangler d1 insights … --sort-by=time` (total ms held), not only by rows read. Each sequential D1 round trip per request
  also queues separately — batch independent reads with `db.batch` (done in `loadUser` + `cachedReport`, v1.536). Before a
  recreate-table migration, re-create EVERY index of the old table: migration 0022 silently lost `idx_ket_qua_goi_ngay`
  (restored in 0154) and call-history-by-month scanned the whole table at ~5.5 s for months.
- **Max 100 bound parameters per statement** (D1-specific; plain SQLite allows ~32k). A dynamic
  `IN (?, ?, ...)` built from a data-driven list (ids, emails) fails with "too many SQL variables" once
  the list + other binds pass 100 — the Ca lặp Excel export did exactly this with ~3-4k prior ids
  (fixed 2026-10-09). Use `lib/d1InChunks.ts` `allInChunks()` (chunks into one `db.batch`) or a SQL
  subquery instead of passing the list; small fixed lists (khu vực, status constants) are fine.
- **Free vs Paid plan, for scale context:** Free = 5M rows-read/day hard cap (queries fail past it),
  100k rows-written/day hard cap. Workers Paid ($5/mo base, a specific dashboard subscription
  distinct from just having a card on file for R2 pay-as-you-go) = 25 **billion** rows-read/month
  included (≈833M/day-equivalent) + $0.001/million overage, 50 million rows-written/month included
  + $1/million overage — no hard cap, metered instead. Check current plan status in the Cloudflare
  dashboard (Workers & Pages → Plans) before treating the 5M/day figure as the live constraint.

#### R2 usage rules (important — ask before changing)

R2 (`REPORTS` binding) currently has exactly **one** legitimate write path: `recomputeDaDongDayChunks()`
in `daDongDayChunks.ts`, called only from the import commit/sync-sheet flow when
`GHI_MOI + GHI_DE > 0`. It snapshots completed ("đã đóng") cases as one JSON blob per calendar day
under `da-dong/day/<YYYY-MM-DD>.json`, with a SHA-256 hash per day tracked in
`da_dong_chunk_manifest` (migration 0029) so clients can diff-check which days need re-download, and
a per-file rate limiter (`r2DownloadRateLimit.ts`) applied at the call site in `routes/cases.ts`.
**Do not add a new R2 write trigger (compute-on-miss on read, a new cron, a new business action)
without asking the system owner first** — this was an explicit decision to keep R2 writes
predictable and infrequent. Note that `secrets.md` still says "not using R2" — that's stale; R2 was
reintroduced later specifically for this snapshot mechanism, and the wrangler configs' `r2_buckets`
blocks are current.

#### D1 migration constraint: FK-referenced tables can't use the "recreate table" pattern

D1 wraps each migration in an implicit transaction, so `PRAGMA foreign_keys=OFF` is a no-op mid
migration and explicit `BEGIN`/`COMMIT` is rejected outright. The repo's established pattern for
changing a `CHECK`/`UNIQUE` constraint (`CREATE x_new` → copy rows → `DROP x` → `RENAME`) only works
if **no other table currently holds a live FK-referencing row** into the table being recreated —
`DROP TABLE` does an implicit referential-integrity check against every child table. `users` in
particular is now referenced by ~10 other tables, so this pattern can no longer be used to alter
`users.vai_tro`'s CHECK constraint (worked for `vi_pham`/`giai_trinh` earlier only because they had
no live FK children at the time). Plain `ALTER TABLE ADD COLUMN` is unaffected and always safe.
Before proposing a recreate-table migration, `grep -rn "REFERENCES <table>" migrations/` first.

Migration files are numbered sequentially, applied in filename order — check `migrations/` for the
current max number before adding a new one (currently `0170`). **`0030` is intentionally used by two
files** (`0030_r2_snapshot_manifest.sql` and `0030_revert_thoi_gian_wallclock_utc.sql`) — this looks
like a bug but isn't fixable: wrangler tracks applied migrations by exact filename in the remote
`d1_migrations` table, and `0030_r2_snapshot_manifest.sql` was already applied to the `smarttrade`
production DB (2026-07-25) before the duplicate was noticed. Renaming it to `0031` to "fix" the
numbering breaks production (wrangler no longer recognizes the file as applied, re-runs `CREATE
TABLE`, fails with "already exists") — confirmed by hitting exactly this in production on
2026-07-28. Leave it as-is; never rename an already-applied migration file.

### Frontend (`frontend/src/`)

- `App.tsx` — top-level auth-state switch (loading/anonymous/pending/rejected/authenticated), then
  `MainApp` renders the sidebar + active module + a `CaseDetail` popup. Active module persists to
  `localStorage`. `caseStack` is a navigation stack (not a single case id) so the case-detail popup
  supports drilling into a related case (e.g. duplicate-case history) and returning via "back"
  without losing the original view mode/tab.
- `modules/` — one file per sidebar module, mirrors `backend/src/routes/`.
- `layout/navConfig.ts` — `ROLE_MODULES` defines the **default** module list per role; since
  migration 0042, per-user overrides are stored in `users.modules` and applied by the backend
  `moduleAccess.ts`. Both must stay in sync: `ROLE_MODULES` in `navConfig.ts` must match
  `DEFAULT_MODULES_BY_ROLE` in `backend/src/lib/moduleAccess.ts` — there is no shared/generated
  source, sync manually when changing either. The frontend uses the effective list returned by
  `GET /api/users/me` (field `modules_effectif`) to render the sidebar.
- `api/client.ts` — thin fetch wrapper (`api.get/post/patch/delete/postForm`); a 401 response
  redirects the whole page to `/api/auth/login` (session cookie expired), everything else surfaces
  as `ApiError` with the backend's `{error, message}` body.
- `theme/` — user-customizable theme (colors/fonts), separate from role-based module access.
- `lib/closedDataCache.ts` — client-side IndexedDB cache paired with the R2 day-chunk system above;
  compares content hash from the manifest before re-fetching a day's chunk from R2.
- `i18n/` — UI language VI/EN/ID (i18next + react-i18next, 2026-10-28). Stored per account in
  `users.ngon_ngu` (migration 0146, `PATCH /api/auth/me {ngon_ngu}`), mirrored in localStorage
  `dvbh_ngon_ngu` for the login screen/boot; switcher `components/NgonNguSwitcher.tsx` (TopBar + login).
  **Only UI chrome is translated** — business data (khu vực, CRM/Odoo statuses, reasons, KTV names,
  notes), Excel cell values, Telegram images and server error messages stay Vietnamese (owner decision).
  Two mechanisms side by side: (1) frame (sidebar/topbar/login, v1.492) uses i18next keys `t("topbar.x")` in
  `i18n/locales/*.json`; nav labels use `nav.<moduleKey>`; (2) everything else (all modules, v1.494) uses
  `tr("<câu tiếng Việt>", ...args)` from `i18n/tr.ts` — the Vietnamese sentence IS the key, translations live in
  `i18n/tu-dien.json` (`{"<vi>": ["<en>", "<id>"]}`, `{0}` = params), missing key = stays Vietnamese. Language is
  fixed per page load (switching reloads); the dictionary loads in `main.tsx` BEFORE `bootstrap.tsx` so module-level
  constants get translated too. **Excel downloads (owner decision 2026-11-03, replaces "Excel stays Vietnamese")**:
  column HEADERS follow the user's language, cell values stay Vietnamese, file/sheet names unchanged. Internally
  `exportExcel.ts` still turns labels back into Vietnamese (`veTiengViet`) so saved column-picker templates survive a
  language switch; `lib/excelChung.ts` translates them only when writing the sheet / showing the picker (`tieuDeExcel`,
  "A - B" labels translated per part). Exception: the fixed "Mẫu tính lương" preset keeps its Vietnamese CRM headers.
  App-generated import templates (Khảo sát loại trừ, Gán CSKH hàng loạt) are translated too, so their parsers accept the
  VI/EN/ID header of each expected column (`napCacBanDichTieuDe`). New export header → add it to `tu-dien.json`.
  Dates (owner correction 2026-11-04, v1.520): ONLY date-time columns change — `taoSheetTuDong` turns a column into real
  Excel date cells only when every non-empty value is `yyyy-mm-dd[ hh:mm[:ss]]` AND at least one has a time; cells with
  time → `dd/mm/yyyy hh:mm:ss`, cells without → `dd/mm/yyyy` (wall-clock VN, no timezone shift). Date-only columns
  (`yyyy-mm-dd`), `dd/mm/yyyy` strings, ISO `T…Z` values and every other column stay exactly as before.
  New UI string: wrap in `tr("...")`, then `node frontend/scripts/i18n-kiem-tra.mjs` (lists untranslated keys;
  `--con-lai` lists unwrapped Vietnamese strings — most remaining ones are intentionally data/Excel/comparison
  values). Never wrap a value that is compared, sent to the server, or used as a key — wrap at the render site.
- `lib/loaiDeXuatCache.ts` — IndexedDB cache for `loai_de_xuat` options (spare-part proposal types),
  incremental sync pattern identical to the linh kien cache. `getOptionsForUser()` filters by the
  user's role flags (`la_ktv_dvbh`, `la_ve_tinh`, `vai_tro:…`) stored in `vai_tro_json` per entry,
  so the client can filter without an extra API call.

### Auth & roles

Google OAuth 2.0 implemented directly in the Worker (no Firebase/Auth0), session is a JWT in an
HttpOnly cookie (`dvbh_session`, see `middleware/session.ts` + `lib/jwt.ts`). New Google logins land
in `trang_thai_duyet = "Cho duyet"` (pending) until an Admin approves and assigns a role +
`khu_vuc_phu_trach`. `BOOTSTRAP_ADMIN_EMAIL` (in `wrangler*.jsonc` vars) auto-promotes its first
login to Admin — see `secrets.md` for the rotation/cleanup note on that value.

Nine roles (`VAI_TRO_VALUES` in `types.ts`): Admin, Viewer, QC, Giám sát, TBP DVBH, CSKH, TN CSKH,
TBP CSKH, KSNB Đối tác — each with a different module/region scope, see `navConfig.ts` and
`HANDOFF.md` "Vai trò & phân quyền" for the business rules behind each.

## Nhận việc từ Trợ lý Mây (tự sửa)
- Issue gắn nhãn `may:tu-sua` là việc do Trợ lý Mây chuyển sang, mã `MAY-xxxxx` ở tiêu đề. Sửa ĐÚNG phạm vi mô tả.
- Kiểm tra bắt buộc trước khi mở PR: `npm run build` (eslint chạy trước; đỏ = dừng). Flutter: `flutter analyze && flutter build web`.
- Nhánh `may/may-xxxxx`, PR vào `main`, tiêu đề bắt đầu bằng mã, mô tả tiếng Việt (nguyên nhân · cách sửa · cách thử), ghi `Closes #<issue>`.
- KHÔNG BAO GIỜ: sửa `firestore.rules`/`storage.rules`/hàm `hrLink`/secrets; chạy `firebase deploy` trần; đổi tính năng ngoài issue; xoá dữ liệu.
- Không chắc / cần người quyết: bình luận `MÂY: CẦN NGƯỜI` + lý do rồi dừng.
- Deploy do workflow `may-deploy` làm sau khi được duyệt — KHÔNG tự deploy trong lúc sửa.
