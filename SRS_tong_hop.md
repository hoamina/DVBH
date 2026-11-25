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
Dự án ban đầu chạy trên tài khoản tài khoản Cloudflare cũ (cá nhân) (Worker `dvbh-suite`, D1 `dvbh-db`) —
**tài khoản này đã DỪNG sử dụng**, không còn thao tác gì thêm lên đó. Toàn bộ công việc từ
2026-07-22 chuyển hẳn sang tài khoản tài khoản vận hành smarttrade:
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

### 4.8. Múi giờ hiển thị (CẬP NHẬT 2026-08-27 — quy ước đã đổi từ mô tả gốc 2026-07-22 bên dưới)

**Quy ước HIỆN TẠI (chốt, áp dụng cho MỌI cột thời gian trong toàn hệ thống — không phân biệt
nguồn gốc):** lưu giờ **VN địa phương (UTC+7)** dạng chuỗi `"YYYY-MM-DD HH:MM:SS"`, hiển thị/so
sánh trực tiếp KHÔNG quy đổi timezone. Áp dụng cho cả 2 nhóm:
- Cột hệ thống tự sinh khi ghi từ code JS (`created_at`, `ngay_giai_trinh`, `ngay_chot`,
  `ngay_import`...): dùng `nowVN()` (`backend/src/lib/vnTime.ts`) thay vì `new Date().toISOString()`
  (hàm đó trả UTC thật — KHÔNG được dùng cho các cột này).
- Cột dữ liệu nhập từ Excel/Sheet/CRM (`thoi_gian_cskh_tiep_nhan`...): giữ nguyên giờ VN như import,
  không quy đổi (xem `ratchet.ts businessFieldValue`, `ageCalc.ts AGE_ANCHOR`).

Frontend đọc bằng `parseDbDateTime()`/`fmtDateTime()` (`frontend/src/types.ts`) — hàm này giả định
chuỗi đầu vào ĐÃ LÀ giờ VN (thêm hậu tố `+07:00` nếu chuỗi chưa có timezone), KHÔNG cộng thêm +7.

**Ngoại lệ có chủ đích, PHẢI biết trước khi thêm cột mới:** `tranh_chap_log.created_at` (migration
0098, cột audit nội bộ, ghi qua `nowUtcSqlite()`) là UTC THẬT — dùng riêng để so sánh trực tiếp với
`datetime('now')` trong SQL (tính "quá hạn cập nhật"), KHÔNG dùng `parseDbDateTime()` khi hiển thị
(xem cách xử lý thủ công ở `TranhChapModule.tsx` — parse thẳng bằng hậu tố `"Z"`, không qua hàm
chung). Đây là NGOẠI LỆ DUY NHẤT đã biết — mọi cột khác đều theo quy ước VN-local ở trên.

**Bug thực tế đã gặp (sửa 2026-08-27):** `tranh_chap_log_con.created_at` (migration 0092, "log con"
trong luồng tranh chấp) có `DEFAULT (datetime('now'))` trong schema nhưng câu INSERT ban đầu KHÔNG
truyền cột này tường minh, nên rơi vào DEFAULT = UTC thật — lệch với quy ước VN-local dùng cho mọi
cột khác, khiến "log con" hiển thị sớm hơn thực tế 7 tiếng và sắp xếp sai trong tab "Tiến trình
chung" (`CaseDetail.tsx`). Đã sửa: INSERT giờ truyền tường minh `nowVN()`
(`backend/src/routes/tranhChap.ts`), và backfill dữ liệu cũ qua
`migrations/0099_fix_tranh_chap_log_con_utc.sql` (`+7 hours` cho các dòng đã ghi trước khi sửa).
**Bài học: khi thêm cột `TEXT DEFAULT (datetime('now'))` mới, PHẢI luôn set tường minh qua `nowVN()`
trong câu INSERT — không được dựa vào DEFAULT của schema, vì DEFAULT đó là UTC thật, sai quy ước.**

---

Mô tả gốc (2026-07-22, ĐÃ LỖI THỜI — giữ lại để biết lịch sử, không áp dụng): trước đây quy ước là
lưu UTC + cộng +7 ở frontend. Quy ước đó đã đổi sang lưu thẳng giờ VN-local như mô tả ở trên; nếu
gặp code/tài liệu cũ còn nhắc "lưu UTC, cộng +7 khi hiển thị" cho cột hệ thống tự sinh thì đó là
mô tả CŨ, không còn đúng — trừ ngoại lệ `tranh_chap_log.created_at` đã nêu.

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
- **Bổ sung 2026-09-30 — nguồn thứ 2 song song: hệ "Đặt mua linh kiện" (linh-kien-app).** Ngoài 2 sheet
  Mua hàng/Thiếu hàng ở trên (vẫn giữ), "Tiến trình chung" + tab Mua hàng/Thiếu hàng còn ghép log của
  linh-kien-app, kéo theo yêu cầu khi mở ca qua `GET /api/cases/:id/linh-kien-timeline` (backend gọi
  `GET /api/partner/v1/case-timeline` của linh-kien-app qua Service Binding `LINHKIEN_APP`, không lưu D1).
  Mỗi dòng log (đơn/ticket thiếu LK/phiếu xuất kho/trả hàng) = 1 mốc, nhãn trạng thái map từ enum sự kiện
  cố định của API (`frontend/src/lib/linhKienTimeline.ts`); người thực hiện = `actor_name (email)`.

## 7. Quản lý tồn > Báo cáo: "Số ca tồn theo KTV" (chốt 2026-10-03)

- **Mẫu báo cáo**: dòng = (KTV, Khu vực), cột ngang = ngày 1 → ngày cuối tháng (chọn tháng), mỗi ô = số
  ca tồn chốt 08:00 ngày đó. Thẻ mới nằm ngay dưới bảng "Số ca tồn theo mốc thời gian", dùng chung bộ lọc
  khu vực của module.
- **Lọc tuổi tồn**: nút nhanh Tất cả / ≥3 / ≥5 / ≥7 / ≥14 ngày + "Tùy chọn" từ X đến Y ngày (bao gồm 2 đầu,
  bỏ trống Y = không giới hạn). Tuổi tồn tính như cột ≥3/5/7/14 của bảng mốc thời gian (mốc 00:00 VN).
- **Chỉ số phụ** (tính trên cùng ma trận): Lũy kế (tổng ca-ngày tồn), TB tồn/ngày (lũy kế ÷ số ngày có
  dữ liệu), Đầu kỳ, Cuối kỳ, Biến động (cuối − đầu); chế độ "Biến động so với ngày trước" (mỗi ô = tăng/giảm
  so với ngày có dữ liệu trước đó, ngày 1 so với ngày cuối tháng trước; tăng = đỏ, giảm = xanh); "Theo dõi
  tồn nhanh": tồn ngày mới nhất + chênh lệch, lũy kế tháng, TB/ngày, số KTV có tồn, top 10 KTV tồn cao
  nhất, top 10 KTV tăng tồn nhiều nhất. Xuất Excel theo chế độ đang xem (kèm dòng TỔNG CỘNG).
- **Lưu chết 08:00** (so sánh với phương án "tính lúc xem", chủ hệ thống chọn lưu chết): bảng
  `ton_ktv_daily` (migration 0121), 1 dòng JSON/ngày = histogram tuổi tồn theo (KTV, khu vực), cùng tập ca
  với `backlogTongTon` của báo cáo 08:00 nên tổng khớp bảng mốc thời gian. Gán KTV **tại thời điểm chốt**.
  Không bổ sung ngày cũ — có dữ liệu từ ngày deploy (v1.408). Ghi bởi cron 08:00 + nút "Làm mới báo cáo"
  (Import data). Giám sát chỉ thấy khu vực phụ trách (lọc lúc đọc).

## 8. Ca thiếu linh kiện: tồn kho linh kiện từ linh-kien-app (chốt 2026-10-08)

**Nguồn:** file MISA "tồn kho công nợ" Kế toán import hằng ngày bên linh-kien-app (kho công ty + kho KTV). DVBH kéo về qua
API đối tác `GET /api/partner/v1/ton-kho(/meta)`, lưu `ton_kho_lk` — **chỉ 1 phiên bản**, có bản mới thì ghi đè toàn bộ.
**Lịch:** hỏi mỗi giờ 8h–18h (giờ VN), thứ 2–thứ 7; đã kéo được bản của hôm nay thì dừng hỏi tới hết ngày; nút "Đồng bộ tồn
kho" cho kéo thủ công (ép kéo lại cùng phiên bản: Admin/TBP DVBH).
**Số tồn** = tồn cuối kỳ MISA (KHÔNG trừ đơn đã đặt sau lúc import).

| Hạng mục | Nội dung |
|---|---|
| Cột "Tồn kho MB/MN" (tab Linh kiện thiếu) | Cộng tồn các kho gán MB/MN ở tab **Cấu hình kho** (mặc định theo linh-kien-app: MB = 6804-MB, GLMB, SNKMB, VGMB, MMMB; MN = 6803, VGMN). Kèm cột "Tồn KTV" (tổng mọi kho KTV) và "Ca lâu nhất". |
| Tình trạng từng mã (loại trừ nhau, theo thứ tự) | **Kho có hàng** (MB+MN > 0 → điều chuyển) → **Chỉ KTV đang giữ** → **Hết hàng, chưa có PO** → **Hết hàng, PO trễ** (quá ngày dự kiến hàng về của PO gần nhất) → **Hết hàng, chờ PO**. Cờ riêng **Lệch tồn giữa miền**: ca thiếu ở miền này (khu vực qldvbh.mb*/mn*) mà kho miền này hết, kho miền kia còn. |
| Thẻ báo cáo | 6 thẻ trên đầu tab (số mã + số ca đang chờ), bấm = lọc bảng; sắp xếp "nhiều ca / ưu tiên theo tổng ngày chờ / ca chờ lâu nhất"; Xuất Excel. |
| Hồ sơ linh kiện (bấm 1 mã) | Nhận định nhanh + ca đang thiếu + tồn từng kho công ty + KTV đang giữ (ưu tiên cùng khu vực ca thiếu) + ticket thiếu hàng (kho xử lý tới đâu) + 200 đơn đặt hàng gần nhất (linh-kien-app, gọi lúc mở) + PO (app EO Mua hàng). Cột "PO cho ca này" (v1.648) ghép PO về ca qua mã ca, mã đơn `DDH-…` hoặc mã ticket `TLK-…` ghi trong "ID CRM" / "ID đặt hàng" của PO, ghi rõ đường ghép. |


## 9. Quản lý khảo sát: "Danh sách loại trừ" (chốt 2026-10-09)

- Người quản lý: TN CSKH, TBP CSKH (+ Admin). Tab chỉ hiện với các vai trò này; backend `requireRole` cùng danh sách.
- Mỗi dòng = 1 KTV + 1 nhóm lỗi (120 phút / Hẹn quá 24h / Lỡ kế hoạch / KH hẹn lại) + khoảng ngày [từ, đến], so với
  **ngày CSKH tiếp nhận ca**. KTV khớp theo mã `(ma)` đầu chuỗi `ky_thuat_vien` (ổn định qua các lần đổi tên).
- Hiệu lực: nghi ngờ thuộc loại trừ không còn tính "cần khảo sát" (`NEED_SURVEY_CONDITION`). Ca chỉ có nghi ngờ bị
  loại trừ → tự rời danh sách cần gọi; ca còn nghi ngờ khác → vẫn cần gọi, nghi ngờ bị loại trừ hiện mờ + gạch ngang +
  cảnh báo "không cần gọi" (danh sách + màn hình gọi); CSKH vẫn có thể kết luận nếu muốn, nhưng ca không bị giữ lại
  hàng đợi vì nghi ngờ đó.
- Tạo: thủ công (chọn KTV từ danh sách, chọn nhiều nhóm lỗi → mỗi nhóm 1 dòng) hoặc import Excel (cột KTV — mã hoặc
  chuỗi CRM, Nhóm lỗi — nhiều nhóm cách dấu phẩy / "Tất cả", Từ ngày, Đến ngày dd/mm/yyyy, Ghi chú; có file mẫu, xem
  trước dòng lỗi trước khi import). Sửa = xóa + tạo lại. Mỗi lần thêm/xóa tính lại `can_khao_sat` ngay cho ca bị ảnh hưởng.
- Chưa áp dụng cho các chỉ số báo cáo khảo sát (tỷ lệ nghi ngờ/vi phạm vẫn đếm theo cờ lỗi gốc).
- **Chỉ áp cho ca nguồn CRM KRF** (chốt 2026-11-07): ca CRM 3T (ID bắt đầu bằng "T") không bao giờ bị loại trừ, vẫn cần
  khảo sát bình thường dù KTV có trong danh sách — chỉ tính cho ca tiếp nhận **từ 07/11/2026**; ca 3T tiếp nhận trước đó
  giữ nguyên loại trừ cũ (không đẩy lại vào danh sách gọi). Tab "Theo dõi KTV loại trừ" vẫn đếm mọi nguồn như cũ.

## 10. Địa giới cũ / mới — tỉnh, huyện, xã (chốt 2026-10-10)

- **Dữ liệu:** ca QuickSight (cũ) chỉ có `tinh`/`quan_huyen` theo địa giới CŨ (tên lúc có lúc không tiền tố, vd "Hà Nội" /
  "Thành phố Hà Nội"). Ca Odoo (từ 1/10) luôn có `tinh_moi`/`xa_moi` (địa giới MỚI, có tiền tố) và có thêm `tinh`/`quan_huyen`
  (= `tinh_cu`/`huyen_cu`) khi ca đã đóng, chưa đóng thì để trống.
- **Nút chung "Địa giới: Cũ | Mới"** trên thanh đầu trang (lưu trên máy người dùng), áp dụng cho mọi báo cáo/bộ lọc tỉnh:
  - Cũ: nhóm/lọc theo tỉnh cũ → cấp 2 = Quận/Huyện. Ca chưa có tỉnh cũ → nhóm "(Chưa có tỉnh cũ)".
  - Mới: ca có `tinh_moi` dùng thẳng; ca chưa có (toàn bộ ca cũ) → quy đổi tỉnh cũ → tỉnh mới theo bảng **Cài đặt → Quy đổi
    tỉnh** (`tinh_quy_doi`, migration 0130, nạp sẵn 63 → 34 theo nghị quyết sáp nhập 2025, Admin/TBP DVBH sửa/thêm tên biến
    thể). Cấp 2 = Xã/Phường mới; ca cũ không có → "(Chưa có xã mới)" (không quy đổi huyện → xã vì cấp huyện đã bỏ).
- **Chuẩn hoá tên ở client** (`frontend/src/lib/diaGioi.ts`), server không phân tích: khoá so khớp = bỏ tiền tố (Tỉnh/Thành
  phố/TP/Quận/Huyện/Thị xã/Xã/Phường…) + bỏ dấu + chữ thường ("Hoà Bình" = "Hòa Bình", "Thừa Thiên Huế" → Huế); tên hiển thị
  chuẩn có tiền tố ("Thành phố Hà Nội"). Cấp 2: ưu tiên bản có tiền tố nếu dữ liệu chỉ có 1 kiểu.
- **Lọc:** client khai triển lựa chọn về các giá trị THÔ có trong DB (danh sách tổ hợp `GET /api/dia-gioi/to-hop`, cache theo
  domain `cases`) rồi gửi `dg_loc` (JSON, 1 bind + `json_each`) — `filterParams.ts diaGioiLoc`. Đã áp dụng: Khảo sát (lọc
  tỉnh → huyện/xã, phễu vi phạm, báo cáo theo khu vực), Tranh chấp (6 tab), Doanh thu (bảng theo tỉnh + lọc tỉnh bảng KTV).
- Kiểm tra trên tên thật production: 67 biến thể tên QuickSight → 63 tỉnh cũ, Odoo 63 tỉnh cũ + 34 tỉnh mới, không còn tên lọt
  bảng. Bảng quy đổi khớp 63/63 cặp (tỉnh cũ, tỉnh mới) Odoo ghi thật (2 ca lệch là lỗi nhập địa chỉ).
- **Đợt 2 (v1.444):** các bảng "nhóm theo Tỉnh" — server nhóm theo cặp thô `(tinh, tinh_moi)` (cấp 2: thêm `quan_huyen`,
  `xa_moi`) nối bằng ký tự `` (`filterParams.ts dimGroupExpr`), client gộp theo chế độ (`lib/diaGioi.ts gomTheoDiaGioi`) rồi
  cộng cột đếm / tính lại cột %: Tổng quát (pivot), Quản lý tồn (báo cáo tồn + Tuổi tồn TB), Ca thiếu LK ("Số mã linh kiện" để
  trống khi 1 nhóm gộp nhiều tên — COUNT DISTINCT không cộng được), Nạp gas, Khảo sát (theo Tỉnh, theo Quận/Huyện ↔ Xã/Phường
  mới). Bấm 1 dòng tỉnh để xem danh sách → lọc qua `dg_loc`. Cột Tỉnh / Quận-Huyện trong Danh sách chi tiết Quản lý tồn đổi
  theo chế độ; chi tiết ca cũ hiện thêm "tỉnh mới (quy đổi)". Dữ liệu cache/snapshot cũ chỉ có tỉnh cũ vẫn đọc được (client tự
  quy đổi).

- Xuất Excel (2026-10-14): bảng báo cáo gộp theo tỉnh xuất đúng như màn hình; file danh sách ca có thêm 2 cột theo chế độ
  đang chọn (Cũ: "Tỉnh cũ" + "Quận/Huyện"; Mới: "Tỉnh mới" + "Xã/Phường mới", đã chuẩn hóa + quy đổi), cột địa chỉ thô giữ
  lại với tên "(gốc)" / "(Odoo)".

## 11. Phạm vi báo cáo: Tất cả / NSKX / Không NSKX (chốt 2026-10-13)

- Nút 3 lựa chọn trên thanh đầu trang, mọi vai trò đều chọn được, lưu trên máy người dùng.
- CHỈ ảnh hưởng việc xem: mọi báo cáo và danh sách (kể cả danh sách làm việc) lọc theo tập ca của phạm vi. Logic từng báo
  cáo giữ nguyên. Không đổi: nghiệp vụ (giải trình, khảo sát, duyệt…), badge số trên menu, ảnh Telegram, API đối tác.
- NSKX = đối tác `NSKX` (gồm cách ghi CRM cũ `[NSKX]`). Không NSKX = mọi ca còn lại (kể cả ca chưa có đối tác).
- Báo cáo cố định (số chốt 08:00, tỷ lệ giải trình 17:30, tuổi tồn, tồn theo KTV, Cảnh báo tồn) có số riêng từng phạm vi
  từ 13/10/2026; trước ngày này chỉ có số "Tất cả".
- Báo cáo lũy kế: nhóm NSKX = cột "KH VIPs" chứa "NSKX" (kể cả ghi nhầm "NSXK", vd "NSXK - hết 1 năm"); tháng hệ thống tự
  tính ghi "NSKX" cho ca NSKX. Tab Tốc độ theo miền: RTAT và tốc độ cuối tuần không phân chia theo NSKX (có ghi chú).
- Module "Báo cáo NSKX" riêng đã gỡ.

## 12. Đa quốc gia: VN, ID (INDO), sau này PLP… (kế hoạch duyệt 2026-10-29)

Mục tiêu: mỗi người được phân quyền xem dữ liệu VN, ID hoặc toàn bộ; mọi báo cáo/danh sách/Excel/badge/số chốt/cache
tính theo đúng phần được xem; thêm nước mới không cần sửa code. Khác "Phạm vi NSKX" (§11, chỉ là nút xem): quốc gia là
**quyền**, server phải ép.

**Giai đoạn**
1. **GĐ1 – Nền dữ liệu (xong, v1.499, migration 0148)** — chưa đổi hành vi, mọi người vẫn thấy như cũ.
   - Bảng `quoc_gia` (VN, ID) + `quoc_gia_mau_id` (mẫu ID dạng GLOB → quốc gia + nguồn, có độ ưu tiên). Mẫu sẵn:
     `SC[0-9]*` = Odoo VN, `T[0-9]*` = CRM 3T, `[0-9]*` = CRM cũ (ID toàn số — dữ liệu thật có dạng này).
   - `case_dvbh.quoc_gia` (mặc định VN, không cần cập nhật lại dữ liệu cũ). Import (Excel + QuickSight/Odoo) gán nước cho
     ca **tạo mới** theo mẫu; ca đã có giữ nguyên nước. ID không khớp mẫu nào → VN (tạm, chờ chốt Q4).
   - `users.pham_vi_quoc_gia` (NULL = toàn bộ): chọn trong Quản lý User → Phân quyền → "Quốc gia được xem" (nút lưu riêng).
   - Cài đặt → "Quốc gia": thêm/tắt nước, thêm/xóa mẫu ID, thử 1 ID xem xếp vào đâu (Admin).
2. **GĐ2 + GĐ3 (xong, v1.502, migration 0149)** — đã ép quyền, chi tiết bên dưới. Kế hoạch gốc:
   **GĐ2 – Ép quyền phía server**: mở rộng proxy đổi tên bảng của §11 thêm chiều quốc gia (view `case_hieu_luc_<nước>`,
   bản sao bảng số chốt/cache theo nước tạo động khi kích hoạt nước, không cần migration); kiểm tra 1 ca theo nước
   (`FORBIDDEN_QUOC_GIA`); rà các truy vấn bảng con (vi phạm, khảo sát, giải trình…) chưa đi qua `case_hieu_luc`; badge theo nước.
3. **GĐ3 – Số chốt 08:00/17:30 theo nước, nút chọn nước trên TopBar** (chỉ hiện nước được phép; NSKX chỉ ở VN), chép lịch
   sử số chốt cũ sang bản VN.
4. **GĐ4 – R2 (ca đã đóng, lũy kế) + API đối tác theo nước** (cần chủ hệ thống duyệt).
5. **GĐ5 – Đón nguồn Odoo INDO thật.**

**Chủ hệ thống đã chốt (2026-10-29)**
- Q1: mẫu ID của INDO/PLP bổ sung sau (thêm ở Cài đặt → "Quốc gia" khi có).
- Q4: ca không khớp mẫu nào → xếp VN.
- Q8: nhân viên hiện tại mặc định VN (Admin giữ toàn bộ để quản trị); tài khoản mới đăng nhập cũng mặc định VN.
- Q2: người được xem nhiều nước chọn xem từng nước một (nút chọn nước trên thanh đầu trang).

**Chủ hệ thống chốt tiếp (2026-10-29)**
- Q3: INDO dùng chung danh mục; các lựa chọn trong Cài đặt có thêm cột bản dịch, hiển thị theo ngôn ngữ người dùng
  (lựa chọn đang có: AI dịch sẵn; thêm mới: Admin tự nhập). Hiện ở mọi nơi trên giao diện; Excel và ảnh Telegram vẫn tiếng Việt.
- Q5: tách dữ liệu ca đã đóng (R2) theo nước.
- Q6: ảnh Telegram gửi riêng từng nước.
- Q7: API đối tác trả toàn bộ (không giới hạn nước).

**Đã triển khai GĐ2 + GĐ3 (v1.502, 2026-10-29)**
- Nhân viên hiện có + tài khoản mới: chỉ xem VN. Admin: toàn bộ. Đổi ở Quản lý User → Phân quyền → "Quốc gia được xem".
- Người chỉ có 1 nước: không thấy nút chọn nước, mọi báo cáo/danh sách/Excel/badge/chi tiết ca chỉ gồm nước đó; mở ca của
  nước khác (gõ ID, tìm kiếm) → không tìm thấy; thao tác ghi lên ca nước khác → không tìm thấy.
- Người nhiều nước / toàn bộ: nút "Quốc gia" trên thanh đầu trang, xem từng nước một (toàn bộ có thêm "Tất cả").
  Nút NSKX chỉ hiện khi xem VN hoặc Tất cả.
- Số chốt 08:00 / 17:30 / Cảnh báo tồn / tuổi tồn / tồn theo KTV có bản riêng từng nước; lịch sử trước 29/10/2026 đã
  chép sang bản VN. Ảnh Telegram vẫn là số "Tất cả".
- Thêm nước mới: Cài đặt → "Quốc gia" → thêm mã + bật → hệ thống tự tạo bảng riêng, thêm mẫu ID cho nguồn của nước đó.
- Chưa tách theo nước (chờ Q3/Q5/Q7): Đặt mua linh kiện / Trả hàng / Phiếu xuất kho, API đối tác, file R2 tải về (đang lọc
  ở trình duyệt).

**Đã triển khai GĐ4 (v1.505, migration 0150, 2026-10-29)**
- Q5: file R2 ca đã đóng vẫn là 1 file/ngày (không thêm lần ghi R2), nhưng máy chủ chỉ trả dòng của nước người dùng
  đang xem → trình duyệt không bao giờ nhận dữ liệu nước khác. Bộ nhớ đệm trình duyệt tách theo nước.
- Q6: ảnh 08:00 (Cảnh báo tồn) và 17:30 (tỷ lệ giải trình) gửi theo từng nước vào nhóm Telegram của nước đó (Cài đặt →
  Quốc gia → cột "Nhóm Telegram"). VN giữ nhóm cũ; ID chưa có nhóm → chưa gửi. "Tất cả" không gửi nữa (hiện chỉ có dữ liệu
  VN nên ảnh VN giống hệt trước).
- Q3: 11 danh mục (lý do chậm, lý do chậm đặt mua LK, loại lỗi + nhóm lỗi vi phạm, phân loại / kết quả / lý do tồn tranh chấp,
  loại yêu cầu bỏ qua lặp / đổi trả, lưu ý lỗi linh kiện, loại đề xuất + nhóm) có cột "Bản dịch (EN / ID)"; 121 giá trị
  hiện có đã dịch sẵn. Áp dụng ở ô chọn, danh sách, chi tiết ca, tiến trình tranh chấp, đặt mua LK.
- Q7: API đối tác giữ nguyên (toàn bộ).

**Bổ sung 2026-11-11 (v1.563)**
- **Quốc gia gửi kèm từ API**: pipeline auto qs gửi trường `quoc_gia` (theo nguồn tải: QuickSight/ocrm = VN,
  g.karofi = PH; bật `SEND_QUOC_GIA` bên pipeline). Có trường → dùng luôn (để trống = VN), cả khi tạo ca mới lẫn khi
  ca đã có mà nước khác giá trị đang lưu (sửa ca bị mẫu ID gán nhầm; tính như ghi đè). Mã chưa có trong danh mục
  Quốc gia → báo lỗi trong kết quả import, tạm gán theo mẫu ID. Không có trường (import Excel tay) → giữ cách cũ (mẫu
  ID, chỉ khi tạo mới). Không nằm trong `crm_hash`. Chi phí D1 gần như không đổi (cách cũ cũng chỉ đọc vài dòng mẫu
  ID/lần import); lợi ích là gán đúng nước.
- **Bỏ lựa chọn "Tất cả quốc gia"** trên TopBar: người được xem toàn bộ cũng chỉ xem từng nước (mặc định VN, nút chọn
  các nước đang bật). Server (`chonQuocGia`) không còn trả "mọi nước" cho request GET của người dùng. Số chốt cron
  của phạm vi gộp vẫn chạy (Cảnh báo tồn / log chuyển cấp dùng phạm vi gốc).

## 13. Menu "QL NSKX" — báo cáo riêng ca đối tác NSKX (chốt 2026-11-11)

- Phạm vi: mọi ca `doi_tac` = NSKX / [NSKX], chỉ VN, chia theo **tháng tiếp nhận CSKH**; tôn trọng khu vực phụ trách của người xem.
  Không phụ thuộc nút "Phạm vi báo cáo". Quyền mặc định: Admin, Viewer, QC, Giám sát, TBP DVBH (tài khoản đã tuỳ chỉnh module phải tick thêm).
- Tab **Danh sách**: lọc/sắp xếp kiểu Excel trên tiêu đề cột + thanh "Bộ lọc" (trạng thái ca, đánh giá lõi, đơn lõi lọc, đề xuất lõi,
  tỉnh, KTV, model, loại yêu cầu, SLA, 24h, ngày tiếp nhận/hoàn thành), xuất Excel.
- Tab **Đánh giá lõi lọc**: hệ thống đề xuất lõi từ linh kiện sửa chữa trên ca (báo cáo linh kiện xử lý Odoo, tên/nhóm có chữ "lõi").
  Giám sát (khu vực mình) / TBP DVBH / Admin xác nhận **Có thay / Không thay**; nếu thay thì chọn lõi + SL, chỉ được chọn mã có trong
  danh mục linh kiện (đồng bộ từ linh-kien-app). Lưu ở bảng `nskx_loi_loc` (người + giờ xác nhận), sửa lại được.
- Nút **Đồng bộ đơn lõi lọc** (thủ công): **chỉ ca NSKX tiếp nhận từ 01/11/2026** (chốt chủ hệ thống 2026-11-11); gửi ds ca NSKX (trừ ca đã xác nhận không thay) sang linh-kien-app, nhận lại ca nào đã có đơn loại
  đề xuất "HỖ TRỢ NGOÀI BẢO HÀNH TG12…" còn hiệu lực (bỏ đơn huỷ / từ chối; khớp theo mã ca và cả ID Lada). Trạng thái đơn:
  **Đã đặt lõi** (có đơn) > **Không cần** (GS xác nhận không thay) > **Không áp dụng** (ca tiếp nhận trước 01/11/2026) > **Chưa đặt lõi** (còn lại). Báo cáo có thêm cột "Không áp dụng". Gồm cả ca đã lên đơn để phát hiện đơn bị huỷ sau.
- Bổ sung 2026-11-11 (lần 2): chi tiết ca NSKX có tab **"NSKX"** (mở mặc định khi bấm ca từ menu QL NSKX): luồng ngang Tiếp nhận →
  Hoàn thành → Đánh giá lõi → Đặt lõi; chọn **Có thay / Không thay / Không áp dụng** (+ lõi đã thay); "▾ Xem chi tiết" = lịch sử xác
  nhận, đơn đặt lõi từ API linh-kien-app (cùng dữ liệu tab Mua hàng), linh kiện sửa chữa. Tab Đánh giá lõi lọc mặc định lọc ca
  **đã hoàn thành** + chưa đánh giá; ca đã hoàn thành mà linh kiện sửa chữa không có lõi tự tính **"Không thay lõi (tự động)"**.
- v1.568: tab NSKX đứng sau "Tiến trình chung"; ô chọn lõi thu gọn, chỉ mở khi bấm nhập; cạnh mỗi lõi hiện "Đã đặt: <trạng thái>" /
  "Chưa có đơn đặt mã này" theo đơn linh-kien-app của chính ca đó, kèm gợi ý lõi đã đặt mà chưa chọn (tính trên trình duyệt, không ghi D1).
- v1.571: **Đặt lõi** sang linh-kien-app ngay trong hệ (lẻ ở tab NSKX, hàng loạt ở menu): đơn loại "HỖ TRỢ NGOÀI BẢO HÀNH TG12-NSKX",
  người đặt = người bấm, người nhận = KTV triển khai (không có thì Trạm), chỉ lõi đã xác nhận (dây / cút đặt ngoài), lõi đã có đơn không đặt lại.
- v1.572: đặt hàng loạt theo bộ lọc danh sách đang xem; GS có ca ngoài khu vực phụ trách được hỏi có đặt cả khu vực khác không (Không =
  chỉ khu vực mình); bảng lõi dự kiến đặt nhóm theo KTV (mã, số ca, tổng SL, dự kiến tự duyệt / thiếu hàng / bị chặn).
- Tab **Báo cáo**: theo khu vực / KTV (`ky_thuat_vien`): tổng ca, đã hoàn thành, tỷ lệ 24h, tỷ lệ SLA (cùng công thức Tổng quát — trên ca
  tính KPI), đã đặt lõi, không thay lõi, chưa đặt lõi, chưa đánh giá lõi; bấm số → mở Danh sách đã lọc đúng nhóm.



### Bổ sung 16/11/2026 — Tổng quát và báo cáo giải trình tháng

**Khảo sát và phương án chốt**

- Tổng quát dùng `/dashboard/man-tong-quat` và truy vấn pivot theo bộ lọc, có cache phiên bản dữ liệu. Chiều KTV hiện là `COALESCE(ktv_trien_khai, ky_thuat_vien)`; không được đổi ngầm trở lại trạm. Phân nhóm PH cần lấy thêm trạm bên cạnh KTV trước khi cộng trên trình duyệt.
- `so_gio_xu_ly` đã lưu giờ, không phải ngày. Bucket CRM ≤24h độc lập và đôi lúc có dữ liệu trước cột giờ. Vì vậy giữ tỷ lệ ≤24h cũ và thêm SLA giờ riêng; không ước lượng mốc 8h từ bucket 24h. SLA dùng ca tính KPI đã hoàn thành, có `0 <= so_gio_xu_ly < 8760`; tử số là số ca có giờ <= mốc, mẫu số chung là số ca có giờ hợp lệ. Không có mẫu số hiển thị “—”. Tổng/nhóm cộng tử số và mẫu số rồi tính lại tỷ lệ.
- Báo cáo giải trình cũ xem 14 ngày nhưng chọn tháng chỉ ảnh hưởng tải file. Chốt đổi bảng sang tháng đang chọn để tiêu đề lũy kế, bảng và Excel cùng một nguồn. Nguồn là log chốt ngày, không tính lại từ dữ liệu sống.

**Tự phản biện và cách xử lý**

1. Tuần đầu/cuối năm có ngày thuộc năm khác: dùng tuần ISO (thứ Hai–Chủ nhật), tuần 1 chứa ngày 04/01; năm có 52/53 tuần. Tuần thay phạm vi tháng theo ngày hoàn thành, không giao cắt với tháng khiến mất ngày. Chuyển tháng khác sẽ bỏ chọn tuần; lựa chọn “Theo tháng” khôi phục bộ lọc tháng. Backend kiểm tra khoảng ngày hợp lệ tối đa 7 ngày và tách cache theo khoảng ngày.
2. Một KTV làm nhiều trạm: khi thu gọn PH, API trả KTV × trạm; frontend gán theo trạm rồi cộng. Bảng top 10 vẫn dùng KTV triển khai như trước. Không bình quân các tỷ lệ nhóm.
3. Trạm bị gán hai nhóm: giao diện chuyển trạm khỏi nhóm cũ khi gán nhóm mới. KRF là nhóm phần dư, không sửa trực tiếp; xóa nhóm trả trạm về KRF. Tên nhóm không trống/trùng/KRF. Brills có sẵn nhưng chưa gán trạm, không tự suy đoán thành viên.
4. Một ngày chỉ loại trừ vài khu vực: bỏ các khu vực đó khỏi tổng ngày và lũy kế; ô khu vực ghi “Loại trừ”; chỉ khi toàn bộ khu vực bị loại trừ thì tổng ngày cũng ghi “Loại trừ”. Chủ nhật tự loại trừ. Excel áp dụng cùng quy tắc cho cả hai cột đã/cần.
5. Một ca giải trình nhiều lần hoặc có thêm giải trình tháng sau: báo cáo lý do lấy đúng một dòng cuối **trong tháng**, theo `ngay_giai_trinh DESC, id DESC`, không lấy lý do mới nhất toàn thời gian. Báo cáo gồm ca đang tồn/đã đóng có giải trình trong tháng, bỏ hủy/lưu trữ; ngày loại trừ của báo cáo tỷ lệ không áp dụng ở báo cáo phân loại lý do.
6. Báo cáo tháng cũ không phải ảnh chụp bất biến của cơ cấu: khu vực/trạm lấy từ ca hiện tại, nhóm PH từ cấu hình cục bộ hiện tại; không có lịch sử thay đổi cơ cấu để phục hồi. Chỉnh lịch sử giải trình hoặc hủy/lưu trữ ca cũng có thể làm số thay đổi. Không tuyên bố đây là snapshot phân nhóm lịch sử.

**Sáu yêu cầu đã triển khai trong mã nguồn**

1. Tổng quát: chọn năm và tuần ISO, có ngày đầu/cuối tuần; áp dụng KPI, pivot và bảng top 10. Banner vấn đề trong ngày vẫn phản ánh ngày hiện tại.
2. Pivot: thêm SLA ≤8h, ≤24h, ≤48h, ≤72h cạnh tỷ lệ ≤24h cũ, trên từng dòng/tổng cộng và Excel; thêm mẫu số giờ hợp lệ vào Excel.
3. Settings khi xem PH: “Nhóm trạm PH (cục bộ)”, tạo/xóa nhóm và chọn nhiều trạm; lưu localStorage `reports:PH:station-groups:v1`. Pivot KTV có “Thu gọn theo nhóm PH”. Không thêm cột/bảng/migration D1; tên và thành viên nhóm không gửi server.
4. Pivot: thêm chiều “Nhóm yêu cầu” (`nhom_yeu_cau`) vào lựa chọn “Nhóm theo”.
5. Quản lý tồn: xem bảng theo tháng được chọn, tiêu đề `Lũy kế YYYY-MM: xx/yy (zz%)` từ tổng ca-ngày đã/cần giải trình sau loại trừ. Áp dụng bộ lọc khu vực chung cùng quyền xem; file tháng ghi “Loại trừ” đúng ô, tổng chỉ cộng số không loại trừ. Có trạng thái tải/lỗi và khóa tải file khi chưa xong.
6. Quản lý tồn: tab “Lý do giải trình theo tháng”, nhóm theo khu vực/trạm hoặc nhóm PH; lọc nhóm PH, số ca, tỷ trọng tổng, tổng cộng, Excel. Endpoint `/cases/giai-trinh-ly-do-thang?thang=YYYY-MM&khu_vuc=...` dùng cache theo tháng/phạm vi và versions cases/giai_trinh. Bảo toàn proxy quốc gia/NSKX và quyền khu vực.

**Kiểm chứng**

`node scripts/check-report-enhancements.cjs`: thực thi SQL thật trên SQLite in-memory với dữ liệu thử; kiểm tra tuần giao năm/53 tuần, đúng biên SLA/giờ thiếu/giờ sai, nhóm KTV nhiều trạm, quyền nước/khu vực, lý do cuối trong tháng và tie-break, Excel loại trừ một phần/toàn bộ/Chủ nhật. EXPLAIN xác nhận khoảng hoàn thành dùng `idx_case_hoan_thanh_not_null`, lý do dùng `idx_giai_trinh_ngay`, tra lần cuối dùng `idx_giai_trinh_case_ngay`. Không đo rows_read production và không truy cập dữ liệu production cho kiểm thử này. Có bổ sung bản dịch EN/ID cho giao diện mới.

## 14. Tab "Tiến trình chung" — giao diện thu gọn (chốt 2026-11-18, v1.623)

- Đầu tab: **luồng xử lý ca dạng ngang** (dùng lại `LuongNgang` của tab Bảo hành): Tiếp nhận → GT tồn → Đặt LK → Giao LK → Bảo hành →
  Đổi trả → Khảo sát → Vi phạm → Tranh chấp → Đóng ca; chỉ hiện nhánh có phát sinh; bước đang chờ tô nổi. Ca chưa đóng và không nhánh
  nào đang chờ → "Đóng ca" là bước đang chờ.
- Danh sách chia theo **ngày** (tiêu đề ngày + thứ, khoảng cách tới ngày trước), trong dòng chỉ giờ:phút; người làm chỉ hiện tên
  (rê chuột xem đầy đủ).
- **Gộp theo đối tượng**: các mốc LIỀN NHAU cùng đối tượng = 1 thẻ — đơn linh kiện (đặt + thiếu LK + phiếu xuất kho của đơn), đơn bảo
  hành (Odoo / app), luồng đổi trả, tiến trình tranh chấp, ca lặp, GT tồn cùng lý do, mở/đóng ca; khảo sát + vi phạm ghi nhận cùng
  người lệch ≤ 5 phút = "Cuộc gọi khảo sát". Thẻ ≤ 2 mốc hiện đủ từng dòng; thẻ lớn hơn hiện luồng ngang mini (nếu có) + bước mới
  nhất + "▸ Xem N log".
- **Log phụ** = log chỉ ghi dữ liệu của phiếu xuất kho (sự kiện `pxk_*` ngoài danh sách bước quy trình: lưu mã đơn hàng, lưu mã MISA,
  tải ảnh biên bản, thêm đơn vào phiếu…): ẩn mặc định, thông tin rút thành chip trên thẻ (mỗi loại giữ giá trị mới nhất), vẫn xem
  được khi mở "Xem N log" hoặc tick "Hiện log phụ".
- Chip lọc theo nguồn: Ca · GT tồn · Vi phạm/Khảo sát · Mua hàng/Xuất kho · Bảo hành · Đổi trả · Tranh chấp · Khác; lựa chọn lọc và
  "Hiện log phụ" nhớ theo trình duyệt. Bấm thẻ = mở tab chi tiết nguồn (như cũ).

## 15. Quản lý tồn › "Lý do giải trình cuối cùng theo tháng" — biểu đồ (chốt 2026-11-18, v1.625)

- Trên bảng có 2 biểu đồ, dùng cùng tháng / bộ lọc khu vực / nhóm PH với bảng (mỗi ca tính 1 lần theo giải trình cuối cùng trong tháng).
- Biểu đồ 1 "Tỷ lệ lý do tồn trong tháng": % mỗi lý do trên tổng số ca, thanh ngang giảm dần; quá 13 lý do thì gộp phần đuôi thành "Khác".
- Biểu đồ 2 "Lý do theo khu vực": top 12 lý do, mỗi lý do chồng theo khu vực (MB1, MB2…), xem theo Số ca hoặc % trong lý do; chọn 1 lý do
  → cột số ca theo từng khu vực (giảm dần), rê chuột xem % trong lý do. PH xem "Theo nhóm PH" thì chia theo nhóm PH.

## 16. Quản lý tồn › Danh sách chi tiết — cột gửi bảo hành (chốt 2026-11-18, v1.626)

- 6 cột tuỳ chọn (bật qua "⚙ Tùy chỉnh cột"), có trong Excel, mỗi cột lọc + sắp xếp kiểu Excel (lọc phía server):
  1. Hạn bảo hành: Còn / Hết / Chưa đủ dữ liệu / Không tính (trước 11/2026) — cùng quy tắc tab Hạn BH của "Sửa DT · HĐ · BH", sửa tay thắng.
  2. Số LK Odoo báo gửi BH: tổng số lượng các đơn bảo hành Odoo KTV tạo cho ca (bỏ đơn huỷ / từ chối / lưu trữ).
  3. Số LK thực tế đã gửi BH: theo app Gửi bảo hành ở mọi trạng thái, trừ đơn bị huỷ / từ chối (thùng huỷ, đơn vị huỷ bảo hành).
  4. Trạng thái đổi trả BH = trạng thái THẤP NHẤT của các LK; cột "Diễn giải đổi trả BH" liệt kê số LK theo từng trạng thái.
  5. Tốc độ tồn đổi trả (ngày) = 0h hôm nay − lần KTV bấm gửi xe cuối (đơn chưa gửi xe không tính mốc); khi mọi LK đã kết thúc (KTV đã nhận /
     kết thúc không gửi / chuyển kho) = thời gian xử lý lâu nhất trong các đơn (gửi xe → kết thúc), hiện kèm ✓.
- Phi chức năng (chủ hệ thống): tận dụng API sẵn có, không kéo riêng cho từng báo cáo; xử lý được trên máy người dùng thì không xử lý trên
  server → app Gửi bảo hành đẩy tóm tắt theo ca cùng request 15 phút đã có, DVBH lưu 1 bảng dùng chung (`gui_bh_ca`); nhãn, diễn giải, số
  ngày, hạn BH tính trên trình duyệt; server chỉ tính khi lọc / sắp xếp.

## 17. SLA mới (không loại trừ) — nút chuyển SLA cũ / mới + báo cáo so sánh (chốt 2026-11-20, v1.635)

- **SLA cũ (có loại trừ)**: giữ nguyên như hiện tại (QuickSight + Odoo), là toàn bộ dữ liệu `dung_han` đang có.
- **SLA mới (không loại trừ)**: giờ xử lý = đóng ca − mở ca (Odoo "Thời điểm tiếp nhận", QuickSight "Thời gian NV CSKH tiếp nhận"), tính
  liền cả lễ / Chủ nhật; ca chưa đóng tính tới 00:00 ngày chạy pipeline và không vào báo cáo. So với mốc "SLA (giờ)" Odoo (18/30/42/90h theo
  địa chỉ mới, không đổi): giờ < mốc = Đúng hạn, còn lại Quá hạn. Ca không có mốc → dùng luôn kết quả SLA cũ.
- Pipeline auto qs tính và gửi (`so_gio_xu_ly_klt`, `dung_han_klt`); dvbh không tự tính.
- Mẫu số: ca có thời gian đóng ca và Tính vào KPI = 1 (giống SLA cũ). Một công thức chung toàn hệ thống, không chỉnh riêng khu vực.
- Báo cáo SLA mới chỉ từ tháng 11/2026 (kỳ trước công tắc khoá ở "SLA cũ").
- Giao diện: công tắc "SLA cũ (có loại trừ) / SLA mới (không loại trừ)" ở Tổng quát (thẻ Tỷ lệ SLA, ≤24h, Top 10 KTV, bảng pivot + Excel) và
  QL NSKX › Báo cáo; lựa chọn nhớ trên máy. Bảng "So sánh SLA cũ / SLA mới" ở Tổng quát: cùng nhóm + bộ lọc với pivot, cột số ca tính, SLA cũ,
  SLA mới, chênh lệch (điểm %), ca có mốc Odoo, cũ ĐH → mới QH, cũ QH → mới ĐH, ≤24h cũ / mới, giờ TB cũ / mới; sắp xếp, lọc nhóm, Excel.
- Chưa làm: Báo cáo lũy kế (chỉ SLA cũ).

## 18. Mẫu tải "Form tồn" + thứ tự khu vực cố định (chốt 2026-11-20, v1.637)

- Bảng chọn cột khi tải Quản lý tồn › Danh sách chi tiết có thêm mẫu cố định **"Form tồn"** (52 cột theo file mẫu, tiêu đề tiếng Việt). Các cột hệ
  thống không có trong mẫu được nối tiếp sau cột 52 theo thứ tự và tích chọn trong bảng chọn cột; không tích cột nào thì nối tất cả.
- Mẫu cá nhân đã lưu: cột mới tự nối cuối (bật sẵn). "Mẫu tính lương": tải đúng cột của mẫu (không nối).
- "Mẫu tính báo cáo" (chốt 2026-11-21, v1.651): mẫu cố định thứ 3 cho MỌI danh sách ca, đúng 67 cột / thứ tự / tiêu đề hàng 1 của file
  "Mẫu tính báo cáo.xlsx" (không nối cột). Cột app không lưu để trống; cột Odoo dạng danh sách (linh kiện lỗi) gộp thành 1 ô.
- Mọi bảng báo cáo / ô chọn theo khu vực xếp cố định: MB1, MB2, MB3, MN1, MN2, MN3, B2B MB, B2B MN, KDDV, SCVP MB, SCVP MN, rồi các nhóm khác A-Z.

## 18b. Tỷ lệ giải trình theo ngày — khoảng ngày + cột Tổng (chốt 2026-11-25, v1.654)

- Cạnh ô chọn tháng có "Từ … đến …" ngày: có đủ 2 ngày hợp lệ thì bảng, lũy kế và file tải theo khoảng đó (tối đa 93 ngày), nút × xoá về tháng.
- Cột "Tổng" khoá cứng ngay sau cột Khu vực: đã giải trình / cần giải trình cộng cả kỳ đang xem → tỷ lệ, bỏ ngày loại trừ.
- Dòng tài khoản CTV/TEST ghi nhầm vào cột khu vực bị ẩn khỏi bảng số chốt theo ngày (không cộng vào Tổng cộng), khớp ảnh Telegram 17:30.
- (v1.655) Ô tỷ lệ < 100% tô màu cảnh báo 3 mức khác nhau: 95–<100% vàng nhạt, 80–<95% cam, <80% đỏ; có chú thích màu trên bảng.
- (v1.658) Màu dịu hơn (nền nhạt, chữ đậm cùng tông); ngày đủ 100% tô xanh nhạt; cột "Tổng" và dòng "Tổng cộng" có viền tím riêng.
- (v1.657) Ô "Loại trừ" đổi sang xám kẻ sọc chéo cho khác hẳn màu cảnh báo ngày thiếu.
- (v1.656) Cài đặt › "Ngày loại trừ giải trình": thêm cột "Ngày tạo", mặc định sắp xếp theo ngày tạo mới nhất trước; sắp xếp được theo Ngày / Ngày tạo.

## 19. Báo cáo đúng hạn theo ngành — tuần / tháng (chốt 2026-11-20, v1.638)

- Màn Tổng quát (v1.644, chủ hệ thống 2026-11-20 "làm gọn, filter/tab chỉ 2-3 dòng, báo cáo/biểu đồ chiếm diện tích chính"): bỏ tiêu đề trang
  (hàng tab đã ghi), Báo cáo nhanh thành 1 dải "Hôm nay" (không theo bộ lọc), mọi bộ lọc + kỳ trên 1 dòng (dính khi cuộn từ tablet trở lên),
  bỏ ô "Đang xem" (kỳ ghi trong ô chọn), thẻ KPI cỡ gọn. Màn 1366×768 thấy biểu đồ đầu tiên không cần cuộn.
  v1.645: Hãng và Model là ô chọn nhiều (có tìm, chọn tất cả / bỏ chọn); Hãng ở Báo cáo doanh thu cũng chọn nhiều. Nhiều giá trị = HOẶC.
- Vị trí (v1.642): tab "Báo cáo theo ngành" trong menu Tổng quát (tab thứ 2 sau "Tổng quát", tab đang mở nhớ trên máy); v1.640 từng là menu riêng.
  Ô chọn Theo tuần (◀ ▶, Tuần này) / Theo tháng (13 tháng gần nhất) + nút SLA cũ/mới ngay trên báo cáo; kỳ + bộ lọc lưu trên máy (mặc định tuần hiện tại). Bộ lọc Khu vực + Ngành (cột Ngành) + Hãng, chọn nhiều
  (v1.639 thêm Khu vực; Giám sát xem tồn bình quân theo khu vực phụ trách).
- Chỉ số mỗi ngành + Tổng cộng (ca đóng trong kỳ theo ngày hoàn thành, tính KPI): Số ca đóng; Tỷ lệ 24h đối tác KRF (Đối tác Karofi,
  Korihome, Livotec, NSKX, Purastar, Simple Home); Tỷ lệ 24h Hãng khác (đối tác còn lại); Tỷ lệ SLA; RTAT = giờ xử lý trung bình;
  Tồn bình quân / ngày = tổng số ca tồn lúc 08:00 các ngày trong kỳ / số ngày có số chốt (tuần = 7 ngày).
- 24h / SLA / RTAT theo nút SLA cũ / SLA mới. Menu: "Báo cáo vi phạm" nằm ở nhóm Tổng quan (v1.639).
- Số chốt tồn theo Ngành × Hãng ghi mỗi sáng từ 21/11/2026; tháng 11 ghi bù từ thời gian tiếp nhận / đóng ca.
