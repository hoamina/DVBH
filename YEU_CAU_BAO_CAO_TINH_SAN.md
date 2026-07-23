# Yêu cầu R4–R6: Báo cáo tính sẵn trên server (version-tag cache)

Ngày lập: 2026-07-23. Mục tiêu: mọi endpoint BÁO CÁO/THỐNG KÊ trả dữ liệu tính sẵn (~2 rows đọc/lượt xem); chỉ tính lại khi nhóm dữ liệu liên quan có ghi mới. Đo thực tế 10h–11h sáng nay: 5,7 triệu rows đọc/giờ do các thống kê tính live toàn bảng mỗi lượt xem.

## Nguyên lý

1. Bảng `data_versions(domain TEXT PK, version INTEGER, updated_at)` — mỗi domain 1 dòng.
2. Domain: `cases`, `giai_trinh`, `vi_pham`, `ket_qua_goi`, `giai_trinh_lap`, `blacklist`, `settings`, `users`.
3. Mọi đường GHI bump version domain tương ứng (UPSERT +1, chạy trong cùng batch/waitUntil với ghi chính).
4. Endpoint báo cáo bọc qua `cachedReport(db, key, domains, compute)`:
   - key = tên endpoint + toàn bộ query param chuẩn hóa (sort key) + scope khu_vuc của user (sorted). Ví dụ: `rpt:cases/counts|khu_vuc=Hà Nội|scope=MB1,MB2`.
   - Đọc `precomputed_cache.payload` (envelope JSON `{v:"cases:12|giai_trinh:5", data:{...}}`), so `v` với version hiện tại của các domain phụ thuộc (1 query IN). Khớp → trả `data`. Lệch/chưa có → chạy `compute()`, lưu lại envelope mới, trả kết quả.
   - Response shape TRẢ VỀ CLIENT GIỮ NGUYÊN 100% (chỉ bọc, không đổi data).
5. Dọn rác: sau import (cùng waitUntil sẵn có trong importRoute.ts) DELETE các dòng `precomputed_cache` có key LIKE 'rpt:%' và updated_at < datetime('now','-7 days').

## R4 — Hạ tầng (làm TRƯỚC)

- Migration `migrations/0021_data_versions.sql` tạo bảng data_versions.
- `backend/src/lib/dataVersions.ts`: `bumpVersions(db, domains: string[])` (1 câu UPSERT nhiều dòng), `getVersionTag(db, domains: string[]): Promise<string>` (SELECT IN, ghép "domain:version|..." theo thứ tự alphabet).
- `backend/src/lib/reportCache.ts`: `cachedReport<T>(db, key, domains, compute)` như mục 4; export `buildReportKey(endpoint, params: Record<string,string|undefined>, scope: string[]|null)`.
- Bump versions tại các đường ghi:
  - `cases`: importRoute.ts (commit + sync-sheet, khi GHI_MOI+GHI_DE>0), cron archive (index.ts, khi meta.changes>0).
  - `giai_trinh`: cases.ts POST /:id/giai-trinh; importGiaiTrinh.ts (commit/sync khi có INSERT).
  - `vi_pham` + `ket_qua_goi`: survey.ts (POST /calls, assign, assign-bulk), viPham.ts (PATCH /:id/cap2), importKhaoSat.ts.
  - `giai_trinh_lap`: caLap.ts các route ghi giai-trinh-lap/QC chốt, importGiaiTrinhLap.ts.
  - `blacklist`: caLap.ts blacklist POST/PATCH/DELETE/commit.
  - `settings`: settings.ts các route ghi (ly-do, linh-kien, sheet-urls).
  - `users`: users.ts PATCH /:email.
- Dọn rác rpt:% 7 ngày trong importRoute.ts (mục 5).

## R5 — Bọc nhóm endpoint TỒN/GIẢI TRÌNH (sau R4). CHỈ đụng các file này

| Endpoint | File | Domains |
|---|---|---|
| GET /cases/counts | cases.ts | cases, giai_trinh, settings |
| GET /cases/backlog-stats | cases.ts | cases, giai_trinh, settings |
| GET /cases/backlog-by-khu-vuc | cases.ts | cases, giai_trinh, settings |
| GET /missing-parts/by-khu-vuc | missingParts.ts | cases, giai_trinh, settings |
| GET /notifications/count | notifications.ts | cases, giai_trinh, vi_pham, giai_trinh_lap, blacklist |
| GET /dashboard/daily-report | dailyReport.ts (computeDailyReport) | cases, giai_trinh, vi_pham, settings |

Lưu ý: KHÔNG bọc các endpoint trả danh sách phân trang (GET /cases, /missing-parts list) — chỉ bọc thống kê/đếm. daily-report: key thêm email/scope user (scope + vai trò ảnh hưởng kết quả).

## R6 — Bọc nhóm DASHBOARD/DOANH THU/KHẢO SÁT/CA LẶP (sau R4, song song R5 được — file không trùng R5)

| Endpoint | File | Domains |
|---|---|---|
| GET /dashboard/kpis | dashboard.ts | cases, vi_pham |
| GET /dashboard/violation-breakdown | dashboard.ts | cases |
| GET /dashboard/pivot | dashboard.ts | cases |
| GET /dashboard/sla-trend | dashboard.ts | cases |
| GET /dashboard/monthly-trend | dashboard.ts | cases |
| GET /revenue, /revenue/trend, /revenue/giam-sat | revenue.ts | cases (+users cho giam-sat) |
| GET /survey/counts, /by-khu-vuc, /trend | survey.ts | cases, vi_pham, ket_qua_goi |
| GET /vi-pham/funnel, /leaderboard | viPham.ts | cases, vi_pham |
| GET /ca-lap/tong-quan | caLap.ts | cases, giai_trinh_lap, blacklist |

Lưu ý sla-trend/trend có param days/months — đưa vào key. KHÔNG bọc /survey danh sách, /ca-lap/danh-sach* (đã rẻ nhờ index 816 dòng).

## BỔ SUNG BẮT BUỘC (phát hiện 2026-07-23): thành phần "ngày VN" trong version tag

Nhiều báo cáo phụ thuộc TUỔI TỒN (>1/3/7/14 ngày, tính theo mốc 00:00 giờ VN = AGE_ANCHOR trong ageCalc.ts) — con số ĐỔI khi sang ngày mới dù KHÔNG có ghi nào. Vì vậy `cachedReport` phải tự ghép thêm `ngay:<YYYY-MM-DD theo giờ VN +7>` vào version tag của MỌI báo cáo (đơn giản, đồng nhất — chi phí chỉ là mỗi báo cáo tính lại thêm tối đa 1 lần/ngày). Cách lấy ngày VN: `new Date(Date.now() + 7*3600*1000).toISOString().slice(0,10)`.

## BỔ SUNG BẮT BUỘC cho R5/R6: tách hàm compute để tái sử dụng cho warm-up

Mỗi endpoint được bọc PHẢI tách phần tính toán thành hàm export riêng dạng `computeXxx(db: D1Database, params: {...}, scope: string[] | null)` (route handler chỉ còn: đọc params → build key → `cachedReport(db, key, domains, () => computeXxx(...))`). Lý do: hạng mục R7 (warm-up sau import) sẽ gọi lại đúng các hàm compute này với bộ params mặc định để tính sẵn 1 lần duy nhất sau mỗi import — theo yêu cầu của chủ hệ thống "tất cả báo cáo sẽ tính lại 1 lần duy nhất khi import mới".

## R7 — Warm-up sau import (làm SAU KHI R5+R6 xong)

Trong importRoute.ts, cùng waitUntil với bump `cases` (chỉ khi GHI_MOI+GHI_DE>0): gọi tuần tự các hàm computeXxx với bộ combo mặc định (scope null + không bộ lọc + tháng hiện tại + dim mặc định) và LƯU vào đúng key mà route sẽ đọc (dùng chung buildReportKey + cachedReport ghi đè). Danh sách warm: dashboard kpis, violation-breakdown, pivot (khu_vuc/hang/ky_thuat_vien), cases/counts, backlog-stats, backlog-by-khu-vuc (dim khu_vuc), missing-parts/by-khu-vuc (dim khu_vuc), survey/counts, revenue (dim khu_vuc + hang). KHÔNG warm các biến thể scope Giám sát (tầng version-tag tự lo khi họ xem).

## Ràng buộc chung cho MỌI hạng mục

- KHÔNG đổi shape response; KHÔNG sửa frontend.
- Query param đưa vào key phải chuẩn hóa (sort tên param, bỏ param rỗng) để cùng bộ lọc ra cùng key.
- Scope theo vai trò (scopeByKhuVuc) BẮT BUỘC nằm trong key — không để user bị giới hạn đọc nhầm cache của người xem toàn bộ.
- Code style + comment tiếng Việt không dấu như codebase.
- `cd backend && npx tsc --noEmit` phải pass. KHÔNG commit, KHÔNG deploy, KHÔNG chạy migration.
- Có ghi (bump) là làm trong cùng batch với ghi chính hoặc ngay sau, KHÔNG quên đường backfill.
