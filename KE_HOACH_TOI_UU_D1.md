# Kế hoạch tối ưu chi phí D1 (giới hạn ưu tiên: 5 triệu rows_read/ngày)

Ngày lập: 2026-07-23. Căn cứ: audit toàn bộ code backend/frontend/cron + số liệu thật `wrangler d1 insights` 24h (2026-07-22 → 23) + trạng thái deploy/migration production.

## 1. Hiện trạng đo được (production, 24h)

- **Top 15 query đọc ~18,6 triệu rows/ngày — gấp ~3,7 lần hạn mức 5M.**
- Kích thước bảng: `case_dvbh` 18.478 (1.565 đang tồn, 0 đã archive), `giai_trinh` 25.348, `linh_kien` 5.814, `users` 18.
- **Nguyên nhân gốc số 1: production chạy code CŨ.** Deploy cuối 12:23 22/07, mọi commit tối ưu (4cfeae5 → 88ac4c0) đều sau 15:00 22/07. DB remote mới apply migration đến `0014` — thiếu `0015–0018` (index hiệu năng + precompute "ca lặp").

Phân rã chi phí đo được:

| Nhóm | rows_read/ngày | Ghi chú |
|---|---|---|
| CTE "ca lặp" (LAG) tính live mỗi request (7 biến thể) | ~9,3M | Code mới đã precompute (0017) nhưng CHƯA deploy |
| `SELECT DISTINCT tinh/nganh/hang/nhom_san_pham` (`/dashboard/filters`) | ~4,3M | 6/7 cột không index, full scan mỗi lần |
| Join `giai_trinh` bằng `ROW_NUMBER()` toàn bảng (backlog, thiếu LK, daily-report, notifications) | ~4M | `LATEST_GIAI_TRINH_JOIN` không giới hạn tập case |
| Ghi (import ~4k INSERT giai_trinh + ~1,9k case/ngày) | không đáng kể | Luồng import đã tối ưu tốt (IN-chunk + batch) |

## 2. Đánh giá theo tầng (kết quả 3 audit)

- **Frontend (code mới)**: ổn — staleTime 2', `refetchOnWindowFocus:false`, polling chỉ 2 endpoint × 5'/lần, cache IndexedDB theo hash/version. Không phải điểm nghẽn.
- **Luồng import/backfill**: sạch (đọc IN-chunk theo PK, ghi `db.batch()`, không N+1). Chi phí thật nằm ở việc nó kích hoạt refresh "ca lặp" full-scan.
- **Cron**: (a) refresh "ca lặp" mỗi giờ chạy full recompute VÔ ĐIỀU KIỆN (~N rows/lần × 24) — tự vượt 5M/ngày khi bảng đạt ~200k; (b) cron archive quét lại cả hàng đã archive (thiếu partial index).
- **Backend routes**: các cờ đỏ chính — `LATEST_GIAI_TRINH_JOIN`/`BASE_JOIN` quét toàn bộ `giai_trinh` ở ~8 endpoint; `/dashboard/filters` 6 full scan/request; `/kpis`, `/pivot`, `/violation-breakdown`, `/revenue` full scan khi không lọc tháng; thiếu index `ket_qua_goi(ngay_gio_thuc_hien)`; `COUNT(*)` không điều kiện trên `login_log` (bảng tăng vô hạn).

## 3. Kế hoạch theo giai đoạn

> **Trạng thái 2026-07-23:** Giai đoạn 1–3 ĐÃ CODE XONG trên working tree (chưa commit/deploy) — thực thi bởi 3 AI cấp thấp theo đặc tả R1/R2/R3, đã review chéo + sửa 1 bug (blacklist serial chuẩn hóa không dùng incremental được → quay về full recompute cho riêng luồng blacklist), type-check + build + EXPLAIN QUERY PLAN đều pass. Giai đoạn 0 chờ chủ hệ thống chạy lệnh (đụng production). Giai đoạn 4 chờ quyết định nghiệp vụ.

### Giai đoạn 0 — Kích hoạt tối ưu đã có (KHÔNG sửa code, tác động lớn nhất)
- Apply migration 0015–0018 lên remote: `npx wrangler d1 migrations apply dvbh-db --remote`
- Build frontend + deploy Worker bản mới nhất.
- **Kỳ vọng: cắt ~9,3M/ngày (CTE ca lặp) + kích hoạt staleTime/polling mới của FE.**
- Đây là thao tác lên production — do chủ hệ thống bấm lệnh/xác nhận.

### Giai đoạn 1 — Cron & precompute thông minh (R1)
- Migration 0019: `idx_case_archive_pending (thoi_gian_hoan_thanh) WHERE archived_at IS NULL`; `idx_ket_qua_goi_ngay (ngay_gio_thuc_hien)`; `idx_case_kpi_eligible (tien_do_hoan_thanh, tinh_vao_kpi) WHERE thoi_gian_hoan_thanh IS NOT NULL`.
- Cron refresh ca lặp: thêm guard "chỉ chạy khi MAX(updated_at) ca đóng thay đổi so với lần refresh trước" (lưu marker trong `content_versions`).
- `refreshCaLapPrecompute` hỗ trợ chế độ **incremental theo `seri_san_pham` bị ảnh hưởng** (import truyền tập serial GHI_MOI/GHI_DE; blacklist truyền serial tương ứng). Cron giữ full recompute làm lưới an toàn nhưng có guard.
- **Kỳ vọng: chi phí refresh từ O(N)×24–44 lần/ngày về ~O(serial thay đổi)/lần import + gần 0 khi im lặng.**

### Giai đoạn 2 — Cache danh mục bộ lọc (R2)
- `/dashboard/filters` và `/dashboard/months`: tính sẵn JSON, lưu `content_versions`, refresh theo sự kiện import (giống cơ chế hash "ca lặp"); compute-on-miss lần đầu. Response giữ nguyên shape — FE không đổi.
- **Kỳ vọng: cắt ~4,3M/ngày còn ~vài trăm rows/ngày.**

### Giai đoạn 3 — Giới hạn join `giai_trinh` (R3)
- `LATEST_GIAI_TRINH_JOIN`/`BASE_JOIN`/`MISSING_PARTS_JOIN`: giới hạn subquery ROW_NUMBER() vào đúng tập case đang xét (`gt.case_id IN (SELECT id FROM case_dvbh WHERE <điều kiện tab tương ứng>)`), áp dụng tại: `cases.ts` (list/counts/backlog-stats/backlog-by-khu-vuc/da-dong), `missingParts.ts`, `dailyReport.ts`, `notifications.ts`.
- `users.ts /login-log`: COUNT giới hạn 90 ngày gần nhất (dùng `idx_login_log_thoi_gian`).
- **Kỳ vọng: mỗi lượt gọi từ ~25k rows (toàn bảng giai_trinh) về ~3–5k (chỉ giải trình của ~1,5k ca đang tồn).**

### Giai đoạn 4 — Quyết định nghiệp vụ (cần chủ hệ thống chốt, chưa tự làm)
- Dashboard/Revenue mặc định "toàn thời gian" → có nên mặc định tháng hiện tại? (giảm full scan `case_dvbh` mỗi lần vào Dashboard; thay đổi dữ liệu hiển thị mặc định).
- Tab "quá hạn khảo sát": điều kiện hiện khớp gần như MỌI ca đã đóng trong lịch sử → có nên chặn mốc (vd chỉ xét ca đóng ≤ 60–90 ngày)? (thay đổi nghiệp vụ).
- Bổ sung index các cột dim (`hang`, `tinh`, `doi_tac`, …) chỉ khi Giai đoạn 2 chưa đủ (mỗi index thêm chi phí ghi khi import).

### Giai đoạn 5 — Giám sát định kỳ
- Hàng tuần chạy: `npx wrangler d1 insights dvbh-db --time-period 7d --sort-type sum --sort-by reads --limit 10` để bắt query mới phát sinh.
- Ngưỡng cảnh báo: tổng rows_read > 3M/ngày (60% hạn mức) thì rà lại.

## 4. Ước tính sau tối ưu (bảng 18,5k hàng, 18 user)

| Nguồn | Trước | Sau G0 | Sau G1–G3 |
|---|---|---|---|
| CTE ca lặp live | ~9,3M | ~0 (precompute) | ~0 |
| Refresh precompute | — | ~18k × 24–44 lần ≈ 0,4–0,8M | < 50k |
| /dashboard/filters + /months | ~4,3M | ~4,3M | < 10k |
| Join giai_trinh toàn bảng | ~4M | ~2–3M | < 0,3M |
| Dashboard/Revenue full scan (không lọc tháng) | (lẫn trong trên) | ~0,5–1M | ~0,5M (chờ G4) |
| **Tổng ước tính** | **~18,6M+** | **~7–9M** | **≈ 1M/ngày** |
