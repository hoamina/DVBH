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
| Hồ sơ linh kiện (bấm 1 mã) | Nhận định nhanh + ca đang thiếu + tồn từng kho công ty + KTV đang giữ (ưu tiên cùng khu vực ca thiếu) + ticket thiếu hàng (kho xử lý tới đâu) + 50 đơn đặt hàng gần nhất (linh-kien-app, gọi lúc mở) + PO/mua hàng/bảo hành (Google Sheet). |


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
- Tab **Báo cáo**: theo khu vực / KTV (`ky_thuat_vien`): tổng ca, đã hoàn thành, tỷ lệ 24h, tỷ lệ SLA (cùng công thức Tổng quát — trên ca
  tính KPI), đã đặt lõi, không thay lõi, chưa đặt lõi, chưa đánh giá lõi; bấm số → mở Danh sách đã lọc đúng nhóm.

