# HANDOFF — HỆ THỐNG QUẢN LÝ GIẢI TRÌNH TỒN DVBH
*File này dành cho Claude Code đọc khi bắt đầu phiên làm việc mới trên dự án.*

## Bối cảnh
Hệ thống web nội bộ quản lý sự vụ DVBH: SLA, tồn đọng, vi phạm, khảo sát CSKH.
Toàn bộ thiết kế (schema, logic nghiệp vụ, UI) đã được thống nhất qua một phiên tư vấn với Claude (claude.ai). File này tổng hợp lại để Claude Code tiếp tục — không thiết kế lại từ đầu.

## Cập nhật 2026-07-16: đã chuyển hẳn sang Cloudflare
Quyết định kiến trúc GCP/Firebase bên dưới (mục 1-3) **không còn áp dụng** — xem
`SRS_tong_hop.md` mục 2 để biết stack Cloudflare hiện tại. Toàn bộ code thật (backend Hono,
frontend React/Vite, migrations D1) đã được viết trong thư mục `backend/`, `frontend/`,
`migrations/` của repo này.

## Trạng thái hiện tại (2026-07-17): ĐÃ LIVE, đã qua đợt mở rộng 10 tính năng
- ✅ D1 database thật (`dvbh-db`), migrations `--remote` đã áp dụng (đến `0003_extend.sql`), đang chứa 13.850+ ca thật do user tự import
- ✅ Google OAuth Client ID/Secret thật, đã set qua `wrangler secret put`
- ✅ `SESSION_SECRET` thật, đã set qua `wrangler secret put`
- ✅ Đã deploy: **https://dvbh-suite.ongtho.workers.dev** — đăng nhập Google hoạt động thật
- ✅ Đã sửa 1 bug production quan trọng: xem mục "Bug đã gặp" bên dưới
- ✅ Đã hoàn thành đợt mở rộng 10 tính năng theo phản hồi dùng thử thật (xem `nhat_ky_lam_viec.md` mục "phiên 5"): filter khu vực ảo QLDVBH + filter tháng, số lượng trên tab, xuất Excel mọi nơi, đồng bộ `linh_kien` từ Google Sheet, CaseDetail đầy đủ 34 cột, 19 lý do chậm mới, import lịch sử (giải trình cũ + khảo sát cũ) có file mẫu, thêm biểu đồ cho cả 5 khu vực báo cáo (Dashboard/Khảo sát-Vi phạm/Ca tồn/Doanh thu)
- Không dùng R2, xem mục dưới

## Việc CẦN làm tiếp
1. `git init` (chưa có git repo) → commit tiếng Việt mô tả chi tiết → push lên nhánh hiện tại của tổ chức **ETX87** trên GitHub
2. Tiếp tục cập nhật `SRS_tong_hop.md` và `nhat_ky_lam_viec.md`, không tạo file trùng

**Đã bỏ R2** (2026-07-16): tài khoản Cloudflare yêu cầu thêm thẻ thanh toán mới bật được R2 dù chỉ dùng free tier — user quyết định không cần lưu ảnh linh kiện nữa, đã gỡ toàn bộ phụ thuộc R2 khỏi code (xem mục "Tech stack" bên dưới).

## Bug đã gặp: đăng nhập Google không phản hồi trên trình duyệt thật (đã sửa)
Sau khi deploy, `curl` tới `/api/auth/login` luôn trả 302 đúng, nhưng bấm nút trên trình duyệt
thật không có phản ứng gì. Nguyên nhân: Cloudflare Workers Static Assets có tính năng
"Navigation request optimization" (compatibility_date ≥ 2025-04-01) khiến request điều hướng
thật của trình duyệt (`Sec-Fetch-Mode: navigate`) tự động bỏ qua Worker, rơi vào SPA fallback
(`not_found_handling: single-page-application`) và trả thẳng `index.html` — trong khi `curl`
không gửi header đó nên vẫn chạy qua Worker bình thường (đây là lý do tự test bằng curl "thấy
đúng" nhưng user vẫn gặp lỗi thật). **Fix**: thêm `"run_worker_first": ["/api/*"]` vào `assets`
trong `wrangler.jsonc` để mọi request `/api/*` luôn chạy qua Worker trước, không rơi vào asset
fallback. Bài học: bất kỳ project nào kết hợp SPA + Worker API trên Cloudflare đều phải khai
báo `run_worker_first` cho prefix API, nếu không sẽ hỏng âm thầm khi test bằng công cụ dòng
lệnh nhưng lỗi thật khi người dùng bấm link trên trình duyệt.

## Tech stack đã chốt (Cloudflare, cập nhật 2026-07-16)
- Frontend: React + Vite, build phục vụ qua Cloudflare Workers Static Assets
- Auth: Google OAuth 2.0 tự viết trong Worker (không dùng Firebase Auth), session JWT cookie HttpOnly
- Database: Cloudflare D1 (SQLite serverless) — nguồn dữ liệu duy nhất
- Backend: Cloudflare Workers (Hono router), 1 Worker phục vụ cả API và static assets
- Job archive định kỳ: Cloudflare Cron Triggers
- (Không dùng R2 — không lưu ảnh linh kiện, xem lý do ở mục trên)
- Báo cáo: truy vấn SQL trực tiếp trên D1, KHÔNG dùng BigQuery
- UI: hiện đại, tối giản, phong cách Apple, tông xanh dương/xanh nước biển tươi; **responsive nhưng ưu tiên desktop trước — đã phân biệt rõ UI/UX desktop (sidebar cố định) và mobile (sidebar thành drawer trượt qua hamburger menu)**

## Khối lượng dữ liệu dự kiến
Data tĩnh 25.000–35.000/tháng; ghi đè+ghi mới ~1.500–2.500 ca/ngày; log ~200–300 ca/ngày; khảo sát ~400–1.000 ca/ngày. → 1 Cloud SQL instance nhỏ (2 vCPU/4-8GB) là đủ, không cần BigQuery/read replica ở giai đoạn này.

## Vai trò & phân quyền
Admin (full), Viewer (full view), QC (như Viewer + chốt/bỏ vi phạm cấp 2), Giám sát (view + giải trình theo khu vực phụ trách), TBP DVBH (quản lý nhiều Giám sát), CSKH (khảo sát + chốt vi phạm cấp 1), TN CSKH (như CSKH + phân công khảo sát + sửa data khảo sát nhầm), TBP CSKH (như TN CSKH + full view). KTV không có tài khoản, chỉ là field dữ liệu. Đăng nhập Google → chờ Admin duyệt + gán vai trò/khu vực mới truy cập được.

## Logic nghiệp vụ cốt lõi
1. **Import hàng ngày**: so khớp theo ID. CRM nguồn tự trả sẵn 4 cột true/false (Lỗi 120', Quá hẹn 24h, Lỡ kế hoạch, KH hẹn lại) — KHÔNG tự tính công thức từ timestamp. NaN/rỗng = false.
2. **Ratchet 1 chiều**: DB đang true → giữ true (bỏ qua import); DB đang false, import true → cập nhật true. Logic gốc trong `import.js` (Node/pg, tham chiếu lịch sử), đã port sang `backend/src/lib/ratchet.ts` + `backend/src/lib/importProcessor.ts` chạy trên D1.
3. **4 nhánh xử lý mỗi dòng import**: GHI_MOI (ID mới) / BO_QUA (case đã hoàn thành + không đổi) / CAP_NHAT_MOC_THOI_GIAN (ca tồn + không đổi, chỉ update ngay_cap_nhat_gan_nhat + ratchet) / GHI_DE (có thay đổi).
4. **Khảo sát & chốt vi phạm 2 cấp**: CSKH/TN CSKH/TBP CSKH gọi khảo sát → chốt cấp 1 (`ket_qua_cap_1`) → QC xét → chốt/bỏ cấp 2 (`chot_bo_cap_2`, final). Không được nhảy cấp. 1 cuộc gọi có thể khảo sát nhiều loại lỗi cùng lúc.
5. **Tỷ lệ vi phạm dùng cho báo cáo** = `COALESCE(chot_bo_cap_2, ket_qua_cap_1 khác "Không lỗi")` — ưu tiên cấp 2, fallback cấp 1 nếu chưa có cấp 2.
6. **Ca tồn** = case chưa có `thoi_gian_hoan_thanh`. Giám sát giải trình định kỳ 3 ngày/lần, mỗi giải trình 1 dòng log, không ghi đè, lưu vĩnh viễn.
7. **Chính sách lưu trữ**: case đã hoàn thành giữ 3 tháng rồi archive; case tồn giữ vĩnh viễn; log luôn lưu vĩnh viễn bất kể trạng thái case.
8. **Danh mục linh kiện** (`linh_kien`): Admin CRUD + tắt/bật hiển thị khi chọn trong giải trình; linh kiện bị tắt vẫn giữ nguyên trong giải trình cũ.

## Dashboard Tổng quát (đã code thật)
4 nhóm: SLA (hiệu suất xử lý), Vi phạm, Ca tồn & giải trình, Khảo sát. Doanh thu và Khối lượng công việc tách riêng module khác. Có báo cáo dạng bảng pivot đổi chiều nhóm (khu vực/đối tác/hãng/tỉnh/KTV), cột tỷ lệ đứng trước số liệu tuyệt đối. Đã code trong `frontend/src/modules/DashboardModule.tsx` + `backend/src/routes/dashboard.ts`.

## File tham chiếu lịch sử (thiết kế GCP ban đầu, không còn dùng trực tiếp)
- `schema.sql` — DDL Postgres gốc (đã chuyển đổi sang `migrations/0001_init.sql` cho D1)
- `import.js` — logic import Node.js/pg gốc (đã port sang `backend/src/lib/importProcessor.ts`)
- `auth-middleware.js` — middleware Firebase gốc (đã port sang `backend/src/middleware/*.ts` với Google OAuth tự viết)
- `SRS_tong_hop.md` — tổng hợp toàn bộ quyết định thiết kế (đã cập nhật phần nền tảng kỹ thuật)
- `nhat_ky_lam_viec.md` — nhật ký các buổi làm việc

## Cấu trúc code thật (2026-07-16)
- `migrations/` — D1 schema (SQLite)
- `backend/src/` — Worker API (Hono): `routes/` (8 module + auth), `middleware/` (session/role/khu vực), `lib/` (ratchet, import, jwt)
- `frontend/src/` — React + Vite: `modules/` (8 module + CaseDetail), `layout/`, `auth/`, `components/ui/`
- `wrangler.jsonc` — cấu hình D1/Cron/Assets
- `secrets.md` — nơi lưu & cách xoay vòng secret (gitignored)

## Việc còn mở / cần xác nhận thêm với user
- Vai trò quản lý bảng `linh_kien`: tạm mặc định Admin only
- Hệ thống đã LIVE tại `https://dvbh-suite.ongtho.workers.dev` (D1 + OAuth + secrets thật đều
  đã cấu hình xong, xem mục "Trạng thái hiện tại" ở đầu file)
- Chưa có: GitHub repo thật (chưa `git init`)
- Không dùng R2 / không lưu ảnh linh kiện (quyết định 2026-07-16, xem trên)
