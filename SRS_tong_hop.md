# TỔNG HỢP SRS — HỆ THỐNG QUẢN LÝ GIẢI TRÌNH TỒN DVBH

## 1. Bối cảnh & mục tiêu
Xem chi tiết: `ban-yeu-cau-he-thong-giai-trinh-ton-DVBH_260715-v2.md`

## 2. Nền tảng kỹ thuật (đã chốt — chuyển sang Cloudflare 2026-07-16)
- Frontend: React + Vite, build tĩnh phục vụ qua Cloudflare Workers Static Assets (cùng 1 Worker với API)
- Auth: Google OAuth 2.0 tự triển khai trong Worker (KHÔNG dùng Firebase Auth nữa), session
  bằng JWT ký HS256 trong cookie HttpOnly
- Database: Cloudflare D1 (SQLite serverless) — nguồn dữ liệu duy nhất, thay Cloud SQL/Postgres
- Backend: Cloudflare Workers (Hono router)
- Job archive định kỳ: Cloudflare Cron Triggers
- Không dùng R2 (Cloudflare yêu cầu thêm thẻ thanh toán để bật R2 dù free tier — quyết định
  2026-07-16: không lưu ảnh demo linh kiện nữa, chỉ quản lý mã/tên/giá bán)
- Báo cáo: truy vấn SQL trực tiếp trên D1 (aggregation/pivot tính trong Worker route), không dùng BigQuery

Xem chi tiết kiến trúc, API, migrations trong mã nguồn thư mục `backend/` và `frontend/`.

## 3. Sơ đồ dữ liệu (7 bảng + 2 bảng bổ sung)
`schema.sql` là bản Postgres gốc (tham chiếu lịch sử). Bản chạy thật là D1/SQLite trong
`migrations/0001_init.sql` (7 bảng, chuyển TEXT[]→JSON text, UUID→crypto.randomUUID(),
BOOLEAN→INTEGER 0/1) và `migrations/0002_gaps.sql` (bổ sung `case_dvbh.assigned_to`,
`case_dvbh.archived_at`, bảng `settings_audit_log`, bảng `import_history`).

- `users` — tài khoản, vai trò, khu vực phụ trách, trạng thái duyệt
- `settings_ly_do` — danh mục lý do chậm
- `linh_kien` — danh mục linh kiện dùng khi giải trình (thêm/sửa/tắt-bật hiển thị; cột `anh_demo` còn giữ trong schema nhưng không dùng vì đã bỏ R2)
- `case_dvbh` — bảng trung tâm, ~41 cột từ CRM + cột hệ thống + `assigned_to` (phân công khảo sát) + `archived_at` (chính sách lưu trữ). **`id` kiểu TEXT** (không phải số) — xác nhận 2026-07-16: ID thật từ CRM có thể chứa ký tự chữ/gạch nối (vd "CASE-2026-001"), khác với `schema.sql` gốc dùng `BIGINT`. `giai_trinh.case_id`/`ket_qua_goi.case_id`/`vi_pham.case_id` cũng đổi theo thành TEXT.
- `giai_trinh` — log giải trình ca tồn, 1-nhiều với case_dvbh
- `ket_qua_goi` — kết quả cuộc gọi khảo sát, loai_khao_sat là mảng (1 cuộc gọi khảo sát nhiều loại lỗi)
- `vi_pham` — 1 dòng/loại lỗi/cuộc gọi, gộp cấp 1 (ket_qua_cap_1, nguoi_ghi_nhan) và cấp 2 (chot_bo_cap_2, nguoi_chot)
- `settings_audit_log` — nhật ký thay đổi settings_ly_do/linh_kien (ai/khi nào/đổi gì)
- `import_history` — lịch sử các lần import (hiển thị trong module Import data)

## 4. Logic nghiệp vụ đã chốt (khác/bổ sung so với bản yêu cầu gốc)

### 4.1. Nguồn tính "nghi ngờ vi phạm"
CRM nguồn tự tính và trả về sẵn 4 cột true/false (`loi_120p`, `loi_qua_han_24h`, `loi_lo_ke_hoach`, `loi_kh_hen_lai`) trong file import hàng ngày — app KHÔNG tự tính công thức từ timestamp nữa (khác với thiết kế ban đầu ở mục 4.1 bản yêu cầu gốc).

### 4.2. Quy tắc ghi nhận 1 chiều (ratchet)
```
if (DB hiện tại == true)          → giữ nguyên true, bỏ qua giá trị import
else if (import == true)          → cập nhật thành true
else                                → giữ false
```
NaN/rỗng trong file import coi như `false`.

### 4.3. Các cột không thuộc logic vi phạm
`ĐÚNG HẠN` (`dung_han`), `XỬ LÝ 24h` (`xu_ly_24h_bucket`) — chỉ phục vụ báo cáo SLA (module Tổng quát), không liên quan đến logic khảo sát/vi phạm.

### 4.4. Cột "TBP" trong file nguồn
Thực chất là cột **Khu vực** (không phải Trưởng bộ phận DVBH) — map vào `case_dvbh.khu_vuc`, dùng để phân quyền xem theo khu vực.

### 4.5. Danh mục linh kiện
`giai_trinh.linh_kien_thieu` là lựa chọn từ bảng `linh_kien` (không phải text tự do). Bảng `linh_kien` có Admin CRUD + tắt/bật hiển thị khi chọn trong giải trình; linh kiện bị tắt vẫn giữ nguyên trong các giải trình cũ (không xóa lịch sử).

### 4.6. GIAI TRINH / KET QUA GOI / LOI GHI NHAN
3 bảng này do app tự sinh dữ liệu qua thao tác người dùng — không có nguồn dữ liệu cũ cần migrate.

## 5. Việc còn cần xác nhận / mở
- Vai trò quản lý bảng `linh_kien`: tạm mặc định Admin only, cần xác nhận có mở thêm vai trò khác không
- Đã hoàn thành (2026-07-16): API backend đầy đủ (Hono trên Cloudflare Workers), luồng import
  thật (so khớp ID + ratchet, chạy trên D1), UI/UX 8 module + CaseDetail (React + Vite, port
  từ mockup), job archive >3 tháng (Cron Trigger), D1 database thật đã tạo và áp migrations
- Đã bỏ: lưu ảnh linh kiện qua R2 (Cloudflare yêu cầu thẻ thanh toán để bật R2, user quyết định
  không cần tính năng này)
- Còn cần làm ngoài repo trước khi dùng thật: tạo OAuth Client ID/Secret thật trên Google Cloud
  Console, xem `secrets.md`
