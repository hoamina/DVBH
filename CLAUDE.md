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
  to `ASSETS.fetch` for the SPA. `scheduled()` handles three cron triggers (see `wrangler*.jsonc`
  `triggers.crons`): the hourly one (`CA_LAP_REFRESH_CRON`) is now a safety net for three
  independent, try/catch-isolated jobs — it refreshes the "ca lặp" (duplicate case) precompute only
  when `shouldSkipCronRefresh()` says source data actually changed (the *real* refresh trigger is the
  import path calling `refreshCaLapPrecompute()` directly, not the cron), self-heals R2 "đã đóng"
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
  - `partnerApi.ts` — external partner-facing API with HMAC-SHA256 auth (`partnerApiAuth.ts`,
    migration 0047). Separate from the main UI auth flow.
  - `missingParts.ts` — tracks `thieu_lk` (missing parts) per order line; closed by `la_kho` users
    when parts arrive, which resumes the parent `dat_don_hang` row.
  - `greeting.ts` — one-time greeting popup system (`greeting` table, migration 0044).
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
current max number before adding a new one (currently `0068`). **`0030` is intentionally used by two
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
