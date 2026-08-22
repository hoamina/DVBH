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

### 2.1. Tài khoản Cloudflare (cập nhật 2026-07-22)
Dự án ban đầu chạy trên tài khoản `meomeo3101@gmail.com` (Worker `dvbh-suite`, D1 `dvbh-db`) —
**tài khoản này đã DỪNG sử dụng**, không còn thao tác gì thêm lên đó. Toàn bộ công việc từ
2026-07-22 chuyển hẳn sang tài khoản `smarttrade.vp@gmail.com`:
- Worker: `dvbh` — domain `https://dvbh.dichvu3t.workers.dev`
- D1: `dvbh-db-smarttrade` (cùng schema/migrations với D1 cũ, không copy data thật)
- Config riêng: `wrangler.smarttrade.jsonc` (khác `wrangler.jsonc` cũ, KHÔNG dùng chung)
- Deploy: `npm run deploy:smarttrade` (build frontend + `wrangler deploy --config wrangler.smarttrade.jsonc`)
- Google OAuth Client riêng (không dùng chung Client ID/Secret với tài khoản cũ)

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

### 4.7. Cột "Link hình ảnh" (thêm 2026-07-22)
Cột mới trong file import hàng ngày, nằm ngay sau cột "TBP" — nhiều URL ảnh báo cáo công việc
cách nhau bởi dấu phẩy, giới hạn tối đa 30 ảnh/ca. Backend (`ratchet.ts`) tách chuỗi và tự đổi
domain rút gọn `key.com/` thành domain S3 thật (`srt-iotp-prod-storage.s3.ap-southeast-1.amazonaws.com/`)
NGAY LÚC IMPORT — client không bao giờ nhận giá trị thô, chỉ nhận mảng URL đã xử lý xong (lưu
`case_dvbh.link_hinh_anh` dạng JSON array string, theo đúng quy ước `TEXT[]→JSON text` của D1).
Hiển thị dạng gallery ảnh (grid + lightbox) trong Chi tiết ca, mục "Thông tin xử lý".

### 4.8. Múi giờ hiển thị (sửa bug 2026-07-22)
Mọi timestamp hệ thống tự sinh (`ngay_import`, `ngay_giai_trinh`, `ngay_chot`...) lưu theo UTC
(`datetime('now')` của SQLite, `new Date().toISOString()` của JS đều là UTC) — đây là quy ước có
chủ đích (xem `backend/src/lib/ageCalc.ts`), KHÔNG phải bug lưu sai giờ. Frontend phải luôn cộng
+7 khi hiển thị/so sánh (`parseDbDateTime()` trong `frontend/src/types.ts`, ép chuỗi là UTC rồi
format theo `timeZone: "Asia/Ho_Chi_Minh"`) — trước 2026-07-22 bước cộng +7 này bị thiếu, khiến
mọi giờ hiển thị chậm hơn thực tế 7 tiếng.

## 5. Việc còn cần xác nhận / mở
- Vai trò quản lý bảng `linh_kien`: tạm mặc định Admin only, cần xác nhận có mở thêm vai trò khác không
- Đã hoàn thành (2026-07-16): API backend đầy đủ (Hono trên Cloudflare Workers), luồng import
  thật (so khớp ID + ratchet, chạy trên D1), UI/UX 8 module + CaseDetail (React + Vite, port
  từ mockup), job archive >3 tháng (Cron Trigger), D1 database thật đã tạo và áp migrations
- Đã bỏ: lưu ảnh linh kiện qua R2 (Cloudflare yêu cầu thẻ thanh toán để bật R2, user quyết định
  không cần tính năng này)
- Còn cần làm ngoài repo trước khi dùng thật: tạo OAuth Client ID/Secret thật trên Google Cloud
  Console, xem `secrets.md`

## 6. Tab "Tiến trình chung" (CaseDetail) — nguồn dữ liệu ngoài (Google Sheet), chốt 2026-08-22

Bảng dưới liệt kê TOÀN BỘ mốc thời gian mà tab "Tiến trình chung" (`CaseDetail.tsx`, hàm
`tienTrinhChungEvents`) lấy từ 5 tập dữ liệu Google Sheet đồng bộ qua `lib/purchaseWarrantySync.ts`
(KHÔNG lưu D1, chỉ cache IndexedDB trình duyệt — xem đầu file đó). Mục đích: khi các luồng này sau
này được thay bằng API thật kết nối trực tiếp từ hệ thống Mua hàng/Bảo hành/Thiếu hàng/QC/PO, chỉ
cần đối chiếu lại đúng cột tương ứng theo bảng này khi viết lại phần tạo 18 mốc bên dưới — không đổi
phần còn lại (merge/sort theo `sortMs`, hiển thị, khoảng cách ngày, tiêu đề tóm tắt).

Cột "Trạng thái" ghi rõ nguồn: **[cột]** = lấy nguyên giá trị 1 cột trên sheet (đổi theo dữ liệu thật
từng dòng), **[cố định]** = chuỗi nhãn cố định do yêu cầu nghiệp vụ đặt tên cho mốc đó (không đọc từ
cột nào, luôn hiện y nguyên).

| Nguồn | Mốc # | Cột "Thời gian" (tên thật trên sheet) | Trạng thái hiển thị | Loại |
|---|---|---|---|---|
| Mua hàng | 1 | `NGÀY TẠO` | giá trị cột `LOẠI ĐỀ XUẤT` | [cột] |
| Mua hàng | 2 | `NGÀY XÁC NHẬN` | "Tác nghiệp tiếp nhận" + nếu `TRẠNG THÁI DUYỆT` ≠ "ĐỒNG Ý" thì thêm "Trạng thái duyệt: <giá trị>" | [cố định] + [cột] phụ có điều kiện |
| Mua hàng | 3 | `NGÀY ADMIN TẠO ĐƠN XUẤT` | "Tác nghiệp tạo phiếu" | [cố định] |
| Mua hàng | 4 | `NGÀY KẾ TOÁN DUYỆT` | "Kế toán duyệt phiếu" | [cố định] |
| Mua hàng | 5 | `NGÀY KHO XÁC NHẬN` | "Kho duyệt xuất hàng" | [cố định] |
| Bảo hành | 1 | `THỜI GIAN TẠO` | "Tạo đơn bảo hành" | [cố định] |
| Bảo hành | 2 | `NGÀY GỬI` | "KTV gửi đơn bảo hành" | [cố định] |
| Bảo hành | 3 | `NGÀY KHO NHẬN HÀNG` | "Kho nhận hàng" | [cố định] |
| Bảo hành | 4 | `NGÀY GIỜ ADMIN NHẬN TỪ KHO` | "Admin nhận được linh kiện" | [cố định] |
| Bảo hành | 5 | `NGÀY GIỜ SỬA XONG` (KHÁC `NGÀY GIỜ TRẢ XONG` — 2 cột thật riêng biệt, đã xác nhận với chủ hệ thống 2026-08-22, không được gộp) | "Đã sửa xong" | [cố định] |
| Bảo hành | 6 | `NGÀY KHO NHẬN HÀNG TỪ ADMIN` | "Kế toán duyệt phiếu" | [cố định] |
| Bảo hành | 7 | `NGÀY KHO GỬI HÀNG CHO KTV` | "Kho gửi linh kiện cho KTV" | [cố định] |
| Bảo hành | 8 | `NGÀY KTV NHẬN HÀNG` | "KTV đã nhận được linh kiện" | [cố định] |
| Thiếu hàng | 1 | `Ngày tạo` | giá trị cột `Lý do lựa chọn` | [cột] |
| Thiếu hàng | 2 | `Ngày tiếp nhận` | "Kho đã tiếp nhận" | [cố định] |
| Thiếu hàng | 3 | `Ngày kho xác nhận hàng về` | "Kho xác nhận hàng về" | [cố định] |
| Thiếu hàng | 4 | `Ngày Admin xử lý` | "Admin kết thúc" | [cố định] |
| QC thực tế | 1 | `NGÀY ĐÁNH GIÁ` | giá trị cột `KẾT QUẢ` | [cột] |
| PO đặt hàng | 1 (chỉ lấy dòng có `ID CRM` = ID ca đang xem) | `Ngày tạo` | giá trị cột `Tất cả` | [cột] |

Ghi chú kỹ thuật:
- Đối chiếu ca hiện tại với từng nguồn dùng lại nguyên các hàm `matchMuaHang`/`matchBaoHanh`/
  `matchThieuHang`/`matchQcThucTe`/`matchPoDatHang` đã có sẵn (`lib/purchaseWarrantyMatch.ts`) — tab
  "Tiến trình chung" KHÔNG có logic đối chiếu riêng, dùng đúng danh sách đã lọc sẵn ở các tab
  Mua hàng/Bảo hành/Thiếu hàng/QC thực tế/PO đặt hàng hiện có trong `CaseDetail.tsx`. Riêng PO đặt
  hàng: tab riêng dùng `poDatHangMatched` (khớp rộng hơn, gồm cả khớp qua mã linh kiện thiếu), còn
  "Tiến trình chung" LỌC HẸP hơn — chỉ lấy dòng `idCrm === id ca đang xem`, đúng theo yêu cầu gốc.
- Định dạng ngày trên cả 5 sheet là `DD/MM/YYYY H:MM:SS` (không phải `YYYY-MM-DD...` như D1) — parse
  bằng `parseSheetDateTime()` (`lib/purchaseWarrantyMatch.ts`), trả về 0 nếu rỗng/không parse được;
  mốc có `sortMs === 0` bị loại khỏi timeline (không hiện dòng trống ngày).
- Tên cột (tiếng Việt, có dấu, viết hoa/thường đúng như trên sheet) khai báo tại
  `FIELD_ALIASES` trong `lib/purchaseWarrantySync.ts` — đã đối chiếu trực tiếp với header thật của
  từng sheet (cả 2 miền MB/MN với mua-hang/bao-hanh) qua `curl` ngày 2026-08-22 trước khi thêm, không
  suy đoán tên cột.
- 3 mốc "Thời gian xử lý đặt hàng/sửa chữa bảo hành/thiếu hàng" trong tiêu đề tóm tắt tính theo kiểu
  "bao trùm" (mốc sớm nhất → mốc muộn nhất TRONG SỐ các mốc đã ghi nhận được của chính nhóm đó) vì 3
  nhóm sheet này không có tín hiệu "còn mở/đã đóng" đáng tin cậy để suy ra mốc kết thúc như tranh
  chấp — đây là lựa chọn diễn giải của lập trình, KHÔNG phải yêu cầu tường minh, cần nêu rõ nếu chủ hệ
  thống muốn đổi quy tắc này sau.
