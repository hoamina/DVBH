# Yêu cầu R4–R6: Báo cáo tính sẵn trên server (version-tag cache)

Ngày lập: 2026-07-23. Mục tiêu: mọi endpoint BÁO CÁO/THỐNG KÊ trả dữ liệu tính sẵn (~2 rows đọc/lượt xem); chỉ tính lại khi nhóm dữ liệu liên quan có ghi mới. Đo thực tế 10h–11h sáng nay: 5,7 triệu rows đọc/giờ do các thống kê tính live toàn bảng mỗi lượt xem.

## Nguyên lý

1. Bảng `data_versions(domain TEXT PK, version INTEGER, updated_at)` — mỗi domain 1 dòng.
2. Domain: `cases`, `giai_trinh`, `vi_pham`, `ket_qua_goi`, `giai_trinh_lap`, `blacklist`, `settings`, `users`, `nap_gas_danh_gia` (thêm 2026-07-24, xem migration 0025), `tranh_chap` (thêm 2026-07-29, xem migration 0035 — bảng `tranh_chap_tien_trinh`/`tranh_chap_log`).
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
  - `nap_gas_danh_gia` (thêm 2026-07-24): napGas.ts PUT /:id/danh-gia.
  - `tranh_chap` (thêm 2026-07-29): tranhChap.ts POST /:caseId/tiep-nhan, POST /tien-trinh/:id/log, PATCH /log/:id.
- Dọn rác rpt:% 7 ngày trong importRoute.ts (mục 5).

## R5 — Bọc nhóm endpoint TỒN/GIẢI TRÌNH (sau R4). CHỈ đụng các file này

| Endpoint | File | Domains |
|---|---|---|
| GET /cases/counts | cases.ts | cases, giai_trinh, settings |
| GET /cases/backlog-stats | cases.ts | cases, giai_trinh, settings |
| GET /cases/backlog-by-khu-vuc | cases.ts | cases, giai_trinh, settings |
| GET /missing-parts/by-khu-vuc | missingParts.ts | cases, giai_trinh, settings |
| GET /notifications/count | notifications.ts | cases, giai_trinh, vi_pham, giai_trinh_lap, blacklist, nap_gas_danh_gia, tranh_chap |
| GET /dashboard/daily-report | dailyReport.ts (computeDailyReport) | cases, giai_trinh, vi_pham, settings |
| GET /nap-gas/by-khu-vuc (thêm 2026-07-24) | napGas.ts | cases, nap_gas_danh_gia |
| GET /tranh-chap/tien-trinh/stats (thêm 2026-07-29) | tranhChap.ts | cases, tranh_chap |
| GET /tranh-chap/count (thêm 2026-07-29) | tranhChap.ts | cases, tranh_chap |

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

## R8 — Rà soát domain "cases": chỉ bump khi có IMPORT THẬT (chốt 2026-07-23)

Rà soát trực tiếp SQL của 20 báo cáo đã bọc, đối chiếu với danh sách nơi bump domain "cases". Kết luận + quyết định của chủ hệ thống:

1. **BUG - `dashboard/kpis` thiếu domain `giai_trinh`**: hàm `computeDashboardKpis` (dashboard.ts) đọc bảng `giai_trinh` (subquery `tonDaGiaiTrinh` dùng `EXISTS (SELECT 1 FROM giai_trinh...)`) nhưng domain khai báo tại `cachedReport` hiện chỉ `["cases", "vi_pham"]`. SỬA: thêm `"giai_trinh"` vào mảng domain của lệnh gọi `cachedReport` cho `dashboard/kpis` → `["cases", "vi_pham", "giai_trinh"]`.

2. **Bỏ bump "cases" khỏi thao tác KHÔNG liên quan báo cáo** — `survey.ts` route `POST /assign` và `POST /assign-bulk/commit` hiện đang `bumpVersions(db, ["cases"])` sau khi UPDATE cột `assigned_to`. Đã rà soát: KHÔNG có báo cáo tính sẵn nào (trong toàn bộ 20 endpoint đã bọc cachedReport) đọc cột `assigned_to`. SỬA: XÓA HẲN lệnh gọi `bumpVersions(db, ["cases"])` tại 2 route này (không thay bằng domain khác — thao tác gán CSKH không cần làm bất kỳ báo cáo tính sẵn nào cũ đi).

3. **Bỏ bump "cases" khỏi cron lưu trữ** — `backend/src/index.ts`, nhánh `scheduled()` archive hàng ngày, hiện gọi `bumpVersions(env.DB, ["cases"])` khi `archiveResult.meta.changes > 0`. Chủ hệ thống đã CHỐT (2026-07-23): các báo cáo lấy thẳng từ dữ liệu import (doanh thu, SLA, 24h, pivot, violation-breakdown, monthly-trend...) CHỈ tính lại đúng 1 lần tại thời điểm import thật — cron lưu trữ (tự động, không phải "log công việc mới") KHÔNG được xem là sự kiện làm các báo cáo này cũ đi. SỬA: XÓA lệnh gọi `bumpVersions` khỏi nhánh archive trong `scheduled()`. Sau khi xóa, domain `"cases"` CHỈ còn được bump tại đúng 2 nơi: `POST /api/import/commit` và `POST /api/import/sync-sheet` (cả hai trong `importRoute.ts`, khi `GHI_MOI + GHI_DE > 0`).

4. **Hệ quả cần cập nhật comment**: sau khi sửa mục 3, comment giải thích domain "cases" trong `lib/dataVersions.ts` (nếu có nhắc đến "moi ghi vao case_dvbh" chung chung) nên nói rõ: domain "cases" phản ánh ĐÚNG 1 loại sự kiện — import dữ liệu case mới/ghi đè (commit hoặc sync-sheet), KHÔNG bao gồm archive tự động hay thao tác nghiệp vụ khác (assign...). Cập nhật comment cho khớp thực tế mới, không cần đổi tên domain.

KHÔNG đổi domain nào khác (giai_trinh, vi_pham, giai_trinh_lap, blacklist, settings, users) — các domain đó đã đúng, đã rà soát kỹ khớp với đúng bảng mà từng báo cáo đọc.

Sau khi sửa: `cd backend && npx tsc --noEmit` phải pass. KHÔNG commit/deploy/migrate.

## R9 — Tách cột thuần-import khỏi cột phụ thuộc giải trình (chốt 2026-07-23)

Phát hiện qua báo cáo thực tế của người dùng: nhiều endpoint gộp CHUNG 1 câu SQL 2 loại cột khác bản chất — (a) cột chỉ phụ thuộc `case_dvbh`/`blacklist_serial` (chỉ đổi khi import/blacklist), (b) cột cần JOIN `giai_trinh`/`giai_trinh_lap` (đổi khi có giải trình/chốt đánh giá mới). Vì cả 2 loại đang chung 1 `cachedReport` với domain gộp, mỗi lần có giải trình mới thì CẢ HAI loại cột đều bị tính lại — bao gồm cả loại (a) vốn không hề đổi giá trị. Tách thành 2 câu SQL + 2 cache block độc lập để loại (a) không bị invalidate bởi log giải trình.

**QUAN TRỌNG - không được hiểu lầm "chỉ tính khi import" quá rộng**: các cột kiểu "ĐÃ GIẢI TRÌNH", "CẦN GIẢI TRÌNH", "LỖI LẶP ĐÃ CHỐT" v.v. **PHẢI** tiếp tục phụ thuộc domain giai_trinh/giai_trinh_lap - đây là mục đích chính của con số đó (theo dõi tiến độ xử lý). CHỈ tách cột nào chứng minh được KHÔNG đọc field nào từ `lg.*`/`gl.*` (alias JOIN giai_trinh/giai_trinh_lap) trong công thức SELECT của chính nó.

### R9.1 — `backend/src/routes/cases.ts` — `computeBacklogStats`

Câu `tongTon` hiện SELECT 6 cột trong 1 câu JOIN `latestGiaiTrinhJoin`: `tong, tren_1, tren_3, tren_7, tren_14` (thuần `case_dvbh`, KHÔNG đọc `lg.*`) + `da_giai_trinh` (đọc `lg.case_id`). Tách thành 2 câu:
- Câu A (KHÔNG JOIN giai_trinh): `SELECT COUNT(*) as tong, SUM(...) as tren_1/tren_3/tren_7/tren_14 FROM case_dvbh c WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL${scope}${extra}` — domain `["cases"]`.
- Câu B (giữ nguyên JOIN, chỉ lấy da_giai_trinh): `SELECT SUM(CASE WHEN lg.case_id IS NOT NULL THEN 1 ELSE 0 END) as da_giai_trinh FROM case_dvbh c ${latestGiaiTrinhJoin(CASE_FILTER_TON)} WHERE ...` — domain `["cases","giai_trinh"]`.

Câu `aging` đã thuần `case_dvbh` sẵn (không JOIN gì) → giữ nguyên, domain `["cases"]`.
Câu `byReason` cần `lg.ly_do_cham` → giữ nguyên, domain `["cases","giai_trinh","settings"]` (settings vì `NEED_GIAI_TRINH_CATEGORIES`/dedup dùng settings_ly_do ở nơi khác trong file - kiểm tra lại đúng domain cases.ts đang khai cho endpoint này, giữ nguyên settings nếu route hiện tại có).

Route `/backlog-stats` gọi `cachedReport` 3 lần độc lập (hoặc 1 lần bọc ngoài gọi Promise.all 3 hàm compute con, mỗi hàm tự cachedReport riêng) thay vì 1 lần cho cả `computeBacklogStats`. Giữ nguyên `BacklogStatsPayload` shape trả về cho frontend (gộp lại kết quả 3 phần trước khi return).

### R9.2 — `backend/src/routes/cases.ts` — `computeBacklogByKhuVuc`

1 câu SELECT ${dimCol}, `tong_ton/tren_3/tren_7/tren_14` (thuần `case_dvbh`) CÙNG `da_giai_trinh/can_giai_trinh_tong/lo_ke_hoach/cho_giai_trinh_lai/chua_gt_3_ngay/chua_gt_5_ngay/dieu_hoa_1_ngay/b2b_1_ngay/thieu_linh_kien` (tất cả đọc `lg.*` hoặc EXISTS settings_ly_do). Tách 2 câu GROUP BY riêng theo `${dimCol}`:
- Câu A (không JOIN giai_trinh): SELECT dimCol, tong_ton, tren_3, tren_7, tren_14 — domain `["cases"]`.
- Câu B (giữ JOIN + EXISTS settings_ly_do): SELECT dimCol, da_giai_trinh, can_giai_trinh_tong, lo_ke_hoach, cho_giai_trinh_lai, chua_gt_3_ngay, chua_gt_5_ngay, dieu_hoa_1_ngay, b2b_1_ngay, thieu_linh_kien — domain `["cases","giai_trinh","settings"]`.

Merge kết quả 2 câu theo khóa `nhom`/dimCol trong JS (LEFT JOIN thủ công bằng Map, giống pattern `khuVucQuery` cũ ở caLap.ts) trước khi trả về, giữ đúng shape hiện tại (1 mảng rows với đủ tất cả cột như cũ).

### R9.3 — `backend/src/routes/caLap.ts` — `computeCaLapTongQuan`

Đây là endpoint tốn nhất (raSoat/valid quét toàn bộ case đã đóng trong tháng, ~15k dòng). Tách response thành 2 phần độc lập, MERGE lại trong `computeCaLapTongQuan` trước khi return (giữ nguyên 100% shape `CaLapTongQuanPayload` hiện tại cho frontend):

**Block A — domain `["cases","blacklist"]`** (KHÔNG JOIN giai_trinh_lap):
- `raSoatQuery`, `validQuery` (giữ nguyên y hệt).
- Từ `lapKpiQuery`: tách ra 1 câu MỚI dùng `${CA_LAP_CTE}` (không JOIN giai_trinh_lap) chỉ lấy `tong_lap, serial_lap, qua_han_lap, ktv_lien_quan` (4 cột này đọc thuần từ CTE `lap`, không đọc `gl.*`).
- `khuVucQuery`: tách `lapByKv` CTE thành 2 - 1 bản không JOIN gl chỉ lấy `lap_n, serial_lap` theo khu_vuc, giữ nguyên `raSoatByKv`/`validByKv`. Kết quả: SELECT r.khu_vuc, r.raSoat, valid_serial, serial_sai, ty_le_serial_sai, lap_n, serial_lap (KHÔNG có con_dong/da_giai_trinh/loi_chot/gs_chua/qc_chua).
- `ktvQuery`: tương tự, tách `lapByKtv` chỉ lấy `lap_n` theo ky_thuat_vien (bỏ da_giai_trinh, loi_chot) - giữ `raSoatByKtv`.
- `trendQuery`, `topKtvQuery`, `topTinhQuery` (đã thuần CTE `lap`, không JOIN gl sẵn) - giữ nguyên, đưa vào Block A.

**Block B — domain `["cases","giai_trinh_lap","blacklist"]`**:
- `lapKpiQuery` phần còn lại: `da_giai_trinh, gs_chua, qc_chua, loi_lap_da_chot` (JOIN giai_trinh_lap).
- `khuVucQuery` phần `lapByKv` còn lại: `con_dong, da_giai_trinh, loi_chot, gs_chua, qc_chua` theo khu_vuc (JOIN giai_trinh_lap) - merge vào cùng key `nhom` với Block A ở bước cuối.
- `ktvQuery` phần `da_giai_trinh, loi_chot` theo ky_thuat_vien - merge cùng key `nhom` với Block A.
- `trangThaiQuery`, `loaiChotQuery` (cần `gl.qc_chot`/`gl.chot_danh_gia_lap`).

Gọi `cachedReport` 2 lần (1 cho Block A với key `ca-lap/tong-quan-a`, 1 cho Block B với key `ca-lap/tong-quan-b`, cả 2 dùng CHUNG params/scope để buildReportKey), Promise.all cả 2, rồi merge kết quả thành đúng `CaLapTongQuanPayload` như code hiện tại (đối chiếu kỹ trường `kpi.*`, `khuVuc[]`, `ktvTable[]`, `charts.*` không thiếu field nào, không đổi tên field).

### Ràng buộc riêng R9

- **BẮT BUỘC đối chiếu số liệu**: sau khi tách, chạy thử trên D1 local (hoặc viết script so sánh) để xác nhận kết quả TỪNG FIELD giống hệt bản gốc (trước khi tách) với cùng 1 bộ dữ liệu - không được lệch dù 1 số. Nếu không dựng được môi trường so sánh tự động, đối chiếu tay từng công thức SQL trước/sau, ghi rõ trong báo cáo.
- KHÔNG đổi domain của bất kỳ cột nào đang đúng cần giai_trinh/giai_trinh_lap (xem cảnh báo đầu mục R9).
- KHÔNG đổi response shape trả về frontend.
- `cd backend && npx tsc --noEmit` phải pass.
- R9.1+R9.2 (cases.ts) và R9.3 (caLap.ts) là 2 file khác nhau, có thể làm song song.

## Ràng buộc chung cho MỌI hạng mục

- KHÔNG đổi shape response; KHÔNG sửa frontend.
- Query param đưa vào key phải chuẩn hóa (sort tên param, bỏ param rỗng) để cùng bộ lọc ra cùng key.
- Scope theo vai trò (scopeByKhuVuc) BẮT BUỘC nằm trong key — không để user bị giới hạn đọc nhầm cache của người xem toàn bộ.
- Code style + comment tiếng Việt không dấu như codebase.
- `cd backend && npx tsc --noEmit` phải pass. KHÔNG commit, KHÔNG deploy, KHÔNG chạy migration.
- Có ghi (bump) là làm trong cùng batch với ghi chính hoặc ngay sau, KHÔNG quên đường backfill.
