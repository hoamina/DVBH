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
  to `ASSETS.fetch` for the SPA. `scheduled()` handles two cron triggers (see `wrangler*.jsonc`
  `triggers.crons`): the hourly one refreshes the "ca lặp" (duplicate case) precompute — but only
  when `shouldSkipCronRefresh()` says source data actually changed since last run, since the *real*
  refresh trigger is now the import path calling `refreshCaLapPrecompute()` directly, not the cron;
  the daily one archives completed cases older than 3 months.
- `routes/*.ts` — one file per feature area, matches the sidebar modules in `frontend/src/modules/`.
- `middleware/` — `session.ts` verifies the `dvbh_session` JWT cookie and sets `email`; a route then
  loads the full `AppUser` (role, `khu_vuc_phu_trach` assigned regions, approval status) via
  `loadUser.ts` and sets `user`; `requireRole.ts` gates by role; `scopeByKhuVuc.ts` builds the
  region-scoping `WHERE` clause every list/report query needs — roles in `ROLES_XEM_TOAN_BO`
  (`types.ts`) see everything, everyone else is restricted to their assigned `khu_vuc_phu_trach`.
- `lib/` — shared business logic, not framework code. Notable ones:
  - `ratchet.ts` — column mapping (Vietnamese Excel headers → DB columns) and the one-way "ratchet"
    rule for the 4 violation-flag columns: once `true` in DB, an import can never flip it back to
    `false`. This is a direct port of the original Node/pg `import.js` (kept in repo root for
    reference, not used at runtime).
  - `importProcessor.ts` — the 4-branch decision per imported row (new / no-op / timestamp-only
    update / real overwrite) described in `HANDOFF.md`.
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

#### Report caching: version-tag system (`dataVersions.ts` + `reportCache.ts`)

Read-heavy report/stat endpoints don't query source tables live on every request. Instead:
1. `data_versions` table holds one integer version per data **domain** (`cases`, `giai_trinh`,
   `vi_pham`, `ket_qua_goi`, `giai_trinh_lap`, `blacklist`, `settings`, `users`,
   `nap_gas_danh_gia`). Every write path calls `bumpVersions(db, [...domains])` right after (or in
   the same batch as) its actual write.
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
rows/hour before caching. D1 has a 5M-rows-read/day soft budget — see `KE_HOACH_TOI_UU_D1.md` for
the full cost audit and remaining optimization stages if query costs come up again.

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

Migration files are numbered sequentially, applied in filename order — check
`migrations/` for the current max number before adding a new one (there are currently two files
both prefixed `0030`; don't add a third — resolve/renumber before extending further).

### Frontend (`frontend/src/`)

- `App.tsx` — top-level auth-state switch (loading/anonymous/pending/rejected/authenticated), then
  `MainApp` renders the sidebar + active module + a `CaseDetail` popup. Active module persists to
  `localStorage`. `caseStack` is a navigation stack (not a single case id) so the case-detail popup
  supports drilling into a related case (e.g. duplicate-case history) and returning via "back"
  without losing the original view mode/tab.
- `modules/` — one file per sidebar module, mirrors `backend/src/routes/`.
- `layout/navConfig.ts` — `ROLE_MODULES` is the single source of truth for which sidebar modules
  each `VaiTro` (role) can see; keep this in sync with backend `requireRole` checks in the
  corresponding route files (there is no shared/generated permission table).
- `api/client.ts` — thin fetch wrapper (`api.get/post/patch/delete/postForm`); a 401 response
  redirects the whole page to `/api/auth/login` (session cookie expired), everything else surfaces
  as `ApiError` with the backend's `{error, message}` body.
- `theme/` — user-customizable theme (colors/fonts), separate from role-based module access.
- `lib/closedDataCache.ts` — client-side IndexedDB cache paired with the R2 day-chunk system above;
  compares content hash from the manifest before re-fetching a day's chunk from R2.

### Auth & roles

Google OAuth 2.0 implemented directly in the Worker (no Firebase/Auth0), session is a JWT in an
HttpOnly cookie (`dvbh_session`, see `middleware/session.ts` + `lib/jwt.ts`). New Google logins land
in `trang_thai_duyet = "Cho duyet"` (pending) until an Admin approves and assigns a role +
`khu_vuc_phu_trach`. `BOOTSTRAP_ADMIN_EMAIL` (in `wrangler*.jsonc` vars) auto-promotes its first
login to Admin — see `secrets.md` for the rotation/cleanup note on that value.

Nine roles (`VAI_TRO_VALUES` in `types.ts`): Admin, Viewer, QC, Giám sát, TBP DVBH, CSKH, TN CSKH,
TBP CSKH, KSNB Đối tác — each with a different module/region scope, see `navConfig.ts` and
`HANDOFF.md` "Vai trò & phân quyền" for the business rules behind each.
