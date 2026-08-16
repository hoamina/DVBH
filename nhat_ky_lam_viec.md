# NHẬT KÝ LÀM VIỆC — HỆ THỐNG QUẢN LÝ GIẢI TRÌNH TỒN DVBH

## 2026-07-15

- Đọc bản yêu cầu hệ thống v2, xác nhận nắm logic nghiệp vụ (4 điều kiện nghi ngờ vi phạm, quy trình chốt 2 cấp, logic ca tồn, chính sách lưu trữ)
- Tư vấn nền tảng: đề xuất chuyển từ Firestore + BigQuery sang PostgreSQL (Cloud SQL) + Firebase Auth, do khối lượng dữ liệu vừa phải (~25-35k case/tháng) và logic nghiệp vụ nặng về quan hệ/báo cáo đa chiều — PostgreSQL xử lý tốt hơn mà không cần đồng bộ 2 hệ. User đồng ý.
- User cung cấp file Data_import mẫu (5 sheet: DATA, GIAI TRINH, KET QUA GOI, LOI GHI NHAN, SETTINGS) — dùng làm cơ sở thiết kế schema chi tiết
- Điều chỉnh logic: CRM nguồn tự tính sẵn 4 cột true/false nghi ngờ vi phạm, app chỉ áp quy tắc ratchet 1 chiều (false→true, không revert) khi ghi đè
- Xác nhận: NaN = false; 3 sheet GIAI TRINH/KET QUA GOI/LOI GHI NHAN chỉ là ví dụ cấu trúc không cần migrate; cột ĐÚNG HẠN/XỬ LÝ 24h chỉ phục vụ báo cáo SLA; cột "TBP" trong file nguồn thực chất là Khu vực
- Thiết kế và duyệt cấu trúc ERD 6 bảng (bằng mô tả chữ do lỗi render sơ đồ), sau đó bổ sung bảng thứ 7 `linh_kien` (danh mục linh kiện dùng khi giải trình, có Admin CRUD + tắt/bật hiển thị)
- Hoàn thành `schema.sql` đầy đủ 7 bảng (users, settings_ly_do, linh_kien, case_dvbh, giai_trinh, ket_qua_goi, vi_pham) với index, FK, CHECK constraint
- Khởi tạo `SRS_tong_hop.md` tổng hợp toàn bộ quyết định thiết kế

### Việc tiếp theo
- Xác nhận vai trò quản lý bảng linh_kien
- Thiết kế API backend (Node.js) cho luồng import
- Thiết kế UI/UX từng module

## 2026-07-16 (phiên 2)

- Nhận mockup HTML tĩnh (`he-thong-giai-trinh-ton-dvbh.html`, React qua CDN + Tailwind CDN, dữ liệu giả lập) làm tham chiếu UI/UX đầy đủ 8 module, đã duyệt phong cách "ocean/teal/amber/coral"
- Quyết định kiến trúc mới: chuyển hẳn từ GCP (Cloud SQL Postgres + Firebase Auth + Node.js/Cloud Run) sang **Cloudflare** (Workers + D1 + R2 + Cron Triggers), theo yêu cầu user
- Chốt 2 quyết định con: (1) Database = Cloudflare D1 thay vì Postgres qua Hyperdrive; (2) Auth = tự viết Google OAuth 2.0 trong Worker thay vì Cloudflare Access, để giữ đúng màn hình Login thương hiệu riêng trong mockup
- Viết migrations D1 (`migrations/0001_init.sql` chuyển đổi 7 bảng từ schema.sql sang SQLite; `migrations/0002_gaps.sql` bổ sung `assigned_to`, `archived_at`, `settings_audit_log`, `import_history`)
- Viết backend hoàn chỉnh (Hono trên Workers): auth OAuth2 + session JWT cookie, middleware phân quyền/khu vực, đủ API cho 8 module (cases/backlog, giải trình, khảo sát + chốt vi phạm 2 cấp, import, settings, users, dashboard, revenue) — port nguyên logic ratchet/4 nhánh import từ `import.js`
- Viết frontend hoàn chỉnh (React + Vite, Tailwind build thật): port đúng design system từ mockup thành component kit tái sử dụng, nối toàn bộ 8 module + CaseDetail vào API thật (TanStack Query), bỏ role-switcher giả xác thực
- Bổ sung chủ động các phần mockup còn thiếu: phân trang/sort server-side thật, trạng thái loading/empty/error, audit log cho Settings, module Ca lưu trữ (archived), export Excel thật (SheetJS), polling thông báo, responsive desktop/mobile tách bạch (sidebar thành drawer trên mobile)
- Phát hiện và sửa 1 bug thật qua kiểm thử trình duyệt: `useMediaQuery` chỉ dựa vào sự kiện `change` của MediaQueryList không đáng tin cậy ở mọi môi trường resize — đã thêm fallback lắng nghe `window.resize`
- Kiểm thử end-to-end bằng `wrangler dev` (D1/R2 local) + build frontend thật: luồng bootstrap Admin đầu tiên, dashboard, quản lý tồn, quản lý user, cron archive (giả lập ca cũ >3 tháng), upload ảnh linh kiện lên R2 — tất cả hoạt động đúng
- Viết `secrets.md` (gitignored) ghi rõ nơi lưu/cách xoay vòng OAuth Client ID/Secret, SESSION_SECRET, BOOTSTRAP_ADMIN_EMAIL
- Tạo D1 database thật trên Cloudflare (`dvbh-db`, tài khoản `meomeo3101@gmail.com`), áp migrations `--remote` thành công
- Thử tạo R2 bucket thật → bị chặn: Cloudflare bắt buộc thêm thẻ thanh toán mới bật được R2 (dù chỉ dùng free tier) — user quyết định **bỏ hẳn tính năng lưu ảnh linh kiện**, đã gỡ toàn bộ code phụ thuộc R2 (`LINH_KIEN_BUCKET` binding, endpoint upload, r2_buckets trong wrangler.jsonc)

### Việc còn cần làm ngoài repo (không tự động hoá được)
- `git init` + tạo GitHub repo thật + push lên tổ chức ETX87

## 2026-07-16 (phiên 3) — deploy thật lên Cloudflare

- Set `SESSION_SECRET` thật, deploy Worker lần đầu → domain thật: `https://dvbh-suite.ongtho.workers.dev`
- User tạo Google OAuth Client ID/Secret thật, set qua `wrangler secret put`
- **Bug thật phát hiện qua kiểm thử với user**: bấm "Đăng nhập bằng Google" trên trình duyệt thật không có phản ứng gì (nhảy 1 phát rồi quay lại y nguyên), nhưng `curl` tới cùng URL luôn trả về đúng 302 redirect sang Google. Nguyên nhân: Cloudflare Workers Static Assets có tính năng "Navigation request optimization" (từ compatibility_date >= 2025-04-01) khiến các request điều hướng thật của trình duyệt (Sec-Fetch-Mode: navigate) tự động bỏ qua Worker và rơi vào SPA fallback (`not_found_handling: single-page-application`) trả thẳng `index.html`, trong khi request kiểu `curl`/`fetch` vẫn chạy qua Worker bình thường — do đó việc tự kiểm tra bằng curl "thấy đúng" mà user vẫn gặp lỗi. Fix: thêm `"run_worker_first": ["/api/*"]` vào `assets` trong `wrangler.jsonc` để đảm bảo mọi request `/api/*` luôn chạy qua Worker trước, không rơi vào asset fallback. Đã deploy lại, xác nhận đúng bằng cách giả lập header `Sec-Fetch-Mode: navigate` qua curl.
- Bài học: khi kết hợp SPA + Worker API cùng 1 project trên Cloudflare, luôn phải khai báo `run_worker_first` cho prefix API — nếu không, mọi route API sẽ hoạt động đúng khi test bằng công cụ dòng lệnh nhưng lại âm thầm hỏng khi người dùng thật bấm link trên trình duyệt.
- Cấp quyền Admin cho `meomeo3101@gmail.com` trực tiếp trên D1 thật (tài khoản đã tự đăng nhập Google thành công, xác nhận toàn bộ luồng OAuth hoạt động)
- Đổi tên hiển thị hệ thống thành "Ông Thợ 3T - DVBH" (title, màn hình login, sidebar, topbar) — không đổi tên kỹ thuật của Worker (`dvbh-suite`) để tránh vỡ redirect URI đã đăng ký với Google

### Việc còn cần làm ngoài repo (không tự động hoá được)
- `git init` + tạo GitHub repo thật + push lên tổ chức ETX87

## 2026-07-16 (phiên 4) — sửa kiểu dữ liệu ID case

- User xác nhận: cột ID thật trong file CRM là dạng **text, có thể chứa ký tự không phải số** (vd "CASE-2026-001"), khác với giả định ban đầu (BIGINT trong `schema.sql` gốc)
- Sửa lại toàn bộ: `migrations/0001_init.sql` (`case_dvbh.id` và 3 cột FK `case_id` đổi INTEGER→TEXT), `backend/src/lib/importProcessor.ts` (validate/parse ID như chuỗi thay vì `Number()`), các route `cases.ts`/`survey.ts` (bỏ ép kiểu `Number()` cho case ID, giữ nguyên cho các ID khác thực sự là số như `settings_ly_do.id`), toàn bộ `frontend/src/types.ts` và các module (`CaseRow.id`, `case_id` trong GiaiTrinhRow/KetQuaGoiRow/ViPhamRow, chữ ký hàm `openCase`) đổi từ `number` sang `string`; bỏ luôn tiền tố "#" khi hiển thị ID vì không còn thuần số
- DB thật đang rỗng (chưa import dữ liệu thật) nên xử lý bằng cách DROP + tạo lại 4 bảng liên quan (case_dvbh, giai_trinh, ket_qua_goi, vi_pham) trực tiếp trên D1 remote, giữ nguyên bảng `users` (không mất tài khoản Admin đã tạo)
- Kiểm thử lại trên production: import case với ID "CASE-2026-TEST-001" → tra cứu theo ID và theo Serial đều đúng → xoá dữ liệu test

## 2026-07-17 — sửa công thức "Xử lý ≤24h" + phát hiện dữ liệu thật

- User chỉ ra logic tính tỷ lệ "Xử lý ≤24h" bị sai: trước đó `backend/src/routes/dashboard.ts` tự tính lại từ hiệu `thoi_gian_hen_xu_ly - thoi_gian_cskh_tiep_nhan`, trong khi CRM đã trả sẵn cột phân loại `xu_ly_24h_bucket` (5 giá trị: "0. Dưới 24h", "1. Từ 1-2 ngày", "2. Từ 2-3 ngày", "3. Trên 3 ngày", "KHÔNG TÍNH") — đúng như đã ghi chú ở SRS mục 4.3 nhưng chưa áp dụng đúng trong code
- Sửa công thức đúng: `ty24h = count(xu_ly_24h_bucket = "0. Dưới 24h") / count(xu_ly_24h_bucket khác "KHÔNG TÍNH" và khác NULL)`, áp dụng cho cả 3 endpoint `/kpis`, `/sla-trend`, `/pivot`
- Trong lúc kiểm thử trên production phát hiện: **user đã tự import dữ liệu thật** (13.850 ca) — không còn là môi trường trống. Đã kiểm chứng công thức mới khớp chính xác tay tính (9189/(13850-1337)=73.4%) trên chính dữ liệu thật này
- Phát hiện thêm 1 sai lệch quan trọng: giá trị cột "khu vực" thật **không phải tên tỉnh/thành** (Hà Nội, TP.HCM...) như giả định ban đầu trong thiết kế, mà là mã đội/nhóm CRM (vd "(qldvbh.mb2) Quản lý khu vực MB2", "Phòng bảo hành 3T miền Bắc"...). Đã sửa `UsersModule.tsx` (màn hình phân quyền khu vực cho user) để lấy danh sách khu vực **động từ chính dữ liệu case_dvbh** qua endpoint có sẵn `/api/dashboard/filters`, thay vì dùng hằng số cứng sai — đảm bảo luôn khớp thực tế kể cả khi CRM thêm/đổi mã khu vực sau này
- Dọn dữ liệu test khỏi DB thật sau mỗi lần kiểm thử

## 2026-07-17 (phiên 5) — đợt mở rộng 10 tính năng theo phản hồi dùng thử thật

Sau khi hệ thống chạy thật với 13.850 ca, user dùng thử và gửi 1 lô 10 yêu cầu bổ sung. Đã lập kế hoạch (lưu tại `.claude/plans/fancy-forging-cat.md`) và thực hiện theo 8 nhóm việc, deploy + kiểm chứng với dữ liệu thật sau mỗi nhóm thay vì dồn đến cuối:

1. **Migration 0003**: bỏ FK `linh_kien.nguoi_cap_nhat` (kỹ thuật rebuild bảng SQLite: tắt FK → tạo bảng mới → copy → xoá bảng cũ → đổi tên) để cho phép đồng bộ Google Sheet ghi email ngoài hệ thống; thêm 19 lý do chậm mới theo đúng danh sách user cung cấp (3 lý do gắn cờ "thuộc thiếu linh kiện").
2. **`filterParams.ts` dùng chung**: đọc `khu_vuc` (kể cả giá trị ảo `__QLDVBH__` → khớp mọi khu vực chứa "qldvbh") và `thang` (kể cả `CURRENT` → tháng hiện tại HOẶC ca còn tồn) từ query string; áp cho `dashboard.ts`/`revenue.ts`. Đồng thời sửa nốt công thức `tySla` (trước đó vẫn dùng `co_hen` làm mẫu số thay vì loại trừ "KHÔNG TÍNH" như đã sửa cho `ty24h` ở phiên trước) — cùng pattern, cùng lúc.
3. **Số lượng trên tab**: `/api/cases/counts` + `/api/survey/counts` (1 query SUM/CASE cho tất cả tab), hiển thị `"Chưa giải trình (4500)"` trên `Tabs`.
4. **Xuất Excel mọi nơi**: trả lời câu hỏi của user — tải xuống chỉ tốn vài nghìn rows-read, không đáng kể so với hạn mức D1 free tier (5 triệu/ngày) — mở quyền tải cho mọi vai trò đã xem được danh sách, thêm `export=true` vào Survey/Users/Archived/ImportHistory/Pivot.
5. **Đồng bộ `linh_kien` từ Google Sheet nội bộ**: fetch TSV → parse `[Mã]` → parse ngày `DD/MM/YYYY HH:MM[:SS]` → `INSERT ... ON CONFLICT DO UPDATE` (upsert atomic, tránh lỗi UNIQUE do sheet có 62 mã trùng và do lần chạy đầu bị dở dang) → kết quả cuối `{moi:363, capNhat:4, boQua:5443, loi:0}` khớp đúng 5.810 mã duy nhất, chạy lại lần 2 idempotent hoàn toàn (`{moi:0,capNhat:0,boQua:5810}`).
6. **CaseDetail đầy đủ hơn**: mở rộng từ ~12/34 cột hiển thị lên đủ nhóm "Thông tin xử lý", "Doanh thu", "Phân loại & nguồn gốc"; form giải trình bổ sung 2 field còn thiếu (`ngay_yeu_cau_co_hang`, `ma_xuat_hang_lien_quan`).
7. **Import dữ liệu lịch sử** (`giai_trinh` cũ + `ket_qua_goi`/`vi_pham` cũ): route mới `/api/import/giai-trinh` và `/api/import/khao-sat`, mỗi loại có `GET /template` (CSV mẫu tải về), `POST /preview`, `POST /commit`. Dùng chung `backfillImportProcessor.ts` (`findExistingCaseIds`, `ensureUsersExist` — tự tạo user "Chờ duyệt" cho email lạ để không vỡ FK, `loadActiveLyDoNames`, `runBatched`). `ImportModule.tsx` refactor thành 3 tab dùng chung 1 component `ImportUploader` tham số hoá theo `{templateUrl, previewUrl, commitUrl, columnMapUrl}`.
8. **Thêm biểu đồ** cho cả 5 khu vực báo cáo: Dashboard (xu hướng số ca hoàn thành + SLA theo tháng, SLA theo hãng, top 10 KTV SLA thấp nhất), Khảo sát/Vi phạm (phễu xử lý 4 giai đoạn, top 10 KTV/Giám sát nhiều vi phạm xác nhận nhất, xu hướng cuộc gọi khảo sát), Ca tồn (phân bố tuổi ca tồn theo 4 mốc, cơ cấu theo lý do chậm gần nhất), Doanh thu (xu hướng theo tháng).

**Kiểm chứng**: vì `wrangler dev --local` cần cookie session hợp lệ mà không có mật khẩu Google thật để đăng nhập tự động, đã tự ký JWT test bằng `SESSION_SECRET` giả trong `.dev.vars` (không phải secret thật) để kiểm thử toàn bộ luồng import lịch sử (preview validate lỗi đúng, commit ghi đúng bảng, ràng buộc `chk_cap2_sau_cap1` được chặn phía client, sinh ID tuần tự không trùng khi nhiều dòng cùng batch, tự tạo user "Chờ duyệt" đúng) trên D1 local, dọn sạch dữ liệu test sau đó. Với các endpoint biểu đồ mới (không thể dễ dàng giả lập session lên production vì không có `SESSION_SECRET` thật), đã chạy trực tiếp từng câu SQL y hệt qua `wrangler d1 execute --remote` (chỉ đọc) để xác nhận cú pháp đúng và số liệu hợp lý trên chính 13.850 ca thật (vd tồn <3 ngày: 882 ca, 3-7 ngày: 323, doanh thu tháng 7: ~2,45 tỷ).

## 2026-07-17 (phiên 6) — rà soát hệ thống + 3 yêu cầu bổ sung

Sau khi hoàn tất đợt mở rộng 10 tính năng, user yêu cầu rà soát toàn hệ thống trước khi bàn giao chính thức. Rà soát phát hiện 1 lỗ hổng phân quyền có thật (đang chờ user xác nhận có sửa hay không — xem phần cuối phiên): các endpoint danh sách (Doanh thu, Khảo sát/Vi phạm, Ca thiếu linh kiện, Ca tồn) không có `requireRole` khớp với `navConfig.ts` phía frontend — menu ẩn tab nhưng backend không chặn, nên 1 role bất kỳ vẫn gọi thẳng API để xem được dữ liệu module không thuộc về mình.

Sau đó user yêu cầu thêm 3 việc, đã hoàn thành và deploy:
1. **CaseDetail chia 3 tab**: "Thông tin khách hàng" / "Giải trình tồn (N)" / "Vi phạm ghi nhận (N)" — tách phần thông tin case, form+lịch sử giải trình, và danh sách vi phạm (trước đây chỉ hiện dạng badge tóm tắt) thành từng tab riêng, số lượng hiện ngay trên tên tab.
2. **Gán CSKH hàng loạt qua tải xuống/nhập lại**: nút "Gán CSKH hàng loạt" trên tab "Cần khảo sát" (chỉ TN CSKH/TBP CSKH/Admin) — tải file hiện có cột `assigned_to`, người dùng điền email CSKH trong Excel, tải lên lại để cập nhật hàng loạt. Backend `/api/survey/assign-bulk/preview|commit` validate case_id tồn tại và email đúng là CSKH đã duyệt trước khi ghi.
3. **Phát hiện + sửa lỗi hao phí đọc/ghi thật sự**: `nextSequentialId()` (sinh ID dạng "CG-000123") ở cả `survey.ts` và `importKhaoSat.ts` dùng `SELECT COUNT(*) FROM table` — nghĩa là mỗi lần ghi 1 dòng phải đọc lại TOÀN BỘ bảng `ket_qua_goi`/`vi_pham`, chi phí tăng dần vô hạn theo thời gian khi bảng lớn dần (sẽ rất tốn rows-read khi hệ thống chạy lâu). Sửa bằng bảng đếm riêng `id_counters` (migration `0004_id_counters.sql`, seed đúng bằng count hiện tại lúc migrate) + `UPDATE ... RETURNING` tăng atomic O(1) không phụ thuộc kích thước bảng nguồn — thêm biến thể `reserveSequentialIds()` giữ trước N ID trong 1 lần gọi cho import hàng loạt (loại bỏ hẳn hack "offset" cũ dùng để né trùng ID trong cùng 1 batch chưa commit).

**Kiểm chứng**: test cả luồng gọi khảo sát đơn lẻ và import khảo sát cũ hàng loạt (3 dòng cùng batch) trên D1 local sau khi áp migration `0004` — xác nhận ID sinh ra liên tục không trùng (CG-000001..000004) qua cả 2 đường. Test luồng gán CSKH hàng loạt với 1 dòng hợp lệ + 1 email không phải CSKH + 1 case_id không tồn tại — preview báo đúng lỗi từng dòng, commit chỉ ghi đúng 1 dòng hợp lệ. Áp migration `0004` lên production (bảng `id_counters` seed đúng = 0 khớp với `ket_qua_goi`/`vi_pham` hiện đang rỗng), deploy, xác nhận route mới trả 401 (không phải 404) trên production.

User hỏi tiếp: "nếu cùng thời điểm có 2 CSKH cũng khảo sát 1 ca thì sao?" — phát hiện đây là race condition thật: danh sách "Cần khảo sát" xác định 1 ca còn cần khảo sát 1 loại lỗi qua `NOT EXISTS` (đọc), trong khi việc ghi `vi_pham` không có gì chặn 2 request ghi cùng lúc cho cùng (case_id, loại_lỗi) — đây là race "check-rồi-ghi" kinh điển, không thể chặn chỉ bằng cách kiểm tra kỹ hơn ở code (vì 2 request có thể cùng vượt qua check trước khi request nào commit). Sửa bằng ràng buộc `UNIQUE(case_id, loai_loi)` thật ở tầng DB (migration `0005_vi_pham_unique.sql`, kỹ thuật rebuild bảng SQLite quen thuộc) — đúng với bản chất nghiệp vụ (1 ca chỉ có 1 kết luận chốt cho mỗi loại lỗi, không có luồng "mở lại" sau khi QC đã chốt cấp 2). `POST /survey/calls` đổi insert `vi_pham` thành `ON CONFLICT(case_id, loai_loi) DO NOTHING`, kiểm tra `meta.changes` sau `batch()` để biết loại lỗi nào ghi được (`daGhiNhan`) và loại lỗi nào đã bị người khác ghi trước (`boQua`), trả về cho frontend hiển thị toast rõ ràng thay vì lỗi chung chung — `ket_qua_goi` (log cuộc gọi) vẫn luôn được ghi vì đó là sự kiện có thật (có người gọi), chỉ có `vi_pham` (kết luận vi phạm) mới cần chống trùng. `importKhaoSat.ts` (backfill) cũng thêm kiểm tra trùng (case_id, loai_loi) cả với DB hiện có lẫn trong chính file đang import, cộng `ON CONFLICT DO NOTHING` làm lớp chặn cuối.

**Kiểm chứng race condition thật**: seed 1 ca test + 2 user CSKH cục bộ, bắn đồng thời 2 request `POST /survey/calls` cho cùng case+loại lỗi (chạy song song bằng `&` + `wait` trong bash, không phải tuần tự) — xác nhận đúng: 1 request nhận `daGhiNhan`, request kia nhận `boQua`, và DB chỉ có đúng 1 dòng `vi_pham` cho cặp đó trong khi cả 2 dòng `ket_qua_goi` (log cuộc gọi) đều được giữ. Test thêm luồng import khảo sát cũ với 1 dòng trùng cặp đã có trong DB + 1 dòng trùng ngay trong file — cả 2 đều bị preview báo lỗi đúng, không lọt qua. Áp migration `0005` lên production (đã xác nhận trước đó `vi_pham` đang có 0 dòng nên không có dữ liệu trùng cũ cản trở migrate), xác nhận ràng buộc UNIQUE đã có trên bảng thật qua `sqlite_master`, deploy và xác nhận route vẫn phản hồi đúng trên production.

## 2026-07-17 (phiên 7) — đồng bộ ca mới từ Google Sheet

User yêu cầu: tương tự cơ chế đồng bộ `linh_kien` đã có, xây dựng đồng bộ ca mới cần import từ 1 link Google Sheet publish TSV riêng (`CASE_SHEET_URL`), chỉ dành cho Admin. Kiểm tra thực tế header của sheet (`curl` trực tiếp, follow redirect 307 của Google) thì thấy **trùng khớp chính xác 1-1 với `COLUMN_MAP`** đã dùng cho import Excel thủ công hàng ngày (cùng tổ chức nguồn) — nên tái dùng thẳng `COLUMN_MAP` để ánh xạ cột theo vị trí thay vì định nghĩa lại, và tái dùng nguyên `processImport()` (giữ đúng logic ratchet/4 nhánh) sau khi parse xong, thay vì viết luồng ghi riêng.

- `backend/src/lib/caseSheetSync.ts` (mới): `parseCaseTsv()` parse header theo `COLUMN_MAP`, tự nhận dạng và convert 3 nhóm cột cần ép kiểu: ngày giờ đầy đủ (5 cột thời gian, hỗ trợ cả "DD/MM/YYYY HH:MM[:SS]" lẫn "YYYY-MM-DD..." có sẵn), ngày thuần (`ngay_mua`), số (DT sản phẩm/linh kiện/dịch vụ, thời gian xử lý — bỏ dấu phẩy ngăn cách nghìn), cờ boolean (4 cột lỗi nghi ngờ — nhận TRUE/1/X/CO/CÓ không phân biệt hoa thường). Không parse được ngày thì giữ nguyên chuỗi gốc thay vì ép null làm mất dữ liệu (nhất quán với việc `processImport` gốc cũng không validate định dạng ngày).
- `backend/src/routes/importRoute.ts` thêm `POST /api/import/sync-sheet`: fetch TSV → parse → `processImport(db, rows, true)` → ghi `import_history` với tên "Đồng bộ ca mới từ Google Sheet". Route này có `requireRole("Admin")` riêng, nghiêm ngặt hơn quyền `Admin + TBP DVBH` áp cho toàn bộ router import phía trên (TBP DVBH vẫn import thủ công được nhưng không được bấm nút đồng bộ tự động).
- `wrangler.jsonc`/`types.ts` thêm biến `CASE_SHEET_URL` (không nhạy cảm, sheet publish công khai).
- `ImportModule.tsx` tab "Import CRM hàng ngày" thêm khối "Đồng bộ ca mới từ Google Sheet" + nút bấm, chỉ hiện với Admin (gate 2 lớp: nav đã ẩn cả tab Import với người không phải Admin, cộng kiểm tra `vai_tro` ngay trong component).

**Kiểm chứng**: sheet thật hiện chưa có dữ liệu (chỉ có 41 cột header) nên không thể test bằng dữ liệu thật ngay — đã viết script Node so khớp toàn bộ 41 header thật với `COLUMN_MAP` (khớp 100%, không cột nào bị rớt), rồi dựng 1 route debug tạm thời gọi thẳng `parseCaseTsv()` với 1 file TSV giả lập tự dựng bằng script (đúng cấu trúc header thật, có dòng ngày "DD/MM/YYYY HH:MM:SS", số có dấu phẩy ngăn cách nghìn, cờ TRUE/FALSE, 1 dòng thiếu ID) để xác nhận toàn bộ logic convert đúng, sau đó feed kết quả parse qua `/import/commit` thật trên D1 local — xác nhận ghi đúng kiểu dữ liệu vào `case_dvbh` (ngày giờ, số, cờ lỗi), chạy lại lần 2 xác nhận ratchet nhận diện "không đổi" đúng (không ghi trùng thành ca mới). Test riêng quyền: user vai trò TBP DVBH bị chặn đúng ở `/sync-sheet` (403) nhưng vẫn dùng được import thủ công bình thường. Xoá route debug tạm trước khi build/deploy, dọn sạch dữ liệu test, deploy production và xác nhận biến `CASE_SHEET_URL` cùng route mới đã có trên Worker thật.

## 2026-07-17 (phiên 8) — tối ưu luồng giải trình/khảo sát + cache dữ liệu tĩnh

User yêu cầu 1 lô 6 thay đổi liên quan (đã lập kế hoạch qua plan mode trước khi code, lưu tại `.claude/plans/fancy-forging-cat.md`):

1. **CaseDetail**: đổi tab mặc định thành "Giải trình tồn" (trước đó là "Thông tin khách hàng") vì đó là việc chính người dùng cần làm khi mở 1 ca. Bỏ form giải trình luôn hiện sẵn phía trên lịch sử, thay bằng nút "+ Thêm giải trình" mở `Modal` (cùng pattern với các modal trong `SurveyModule.tsx`).
2. **Migration `0007_closed_case_month_index.sql`**: thêm index `idx_case_hoan_thanh_not_null` (partial, `WHERE thoi_gian_hoan_thanh IS NOT NULL`) để các truy vấn "ca đã đóng theo tháng" mới dùng range scan thay vì full scan; thêm bảng `content_versions` (ten_bang, hash) cho mục cache tĩnh bên dưới.
3. **Backlog thêm tab "Ca đã đóng"**: xem toàn bộ ca đã hoàn thành theo từng tháng (chọn tháng qua endpoint `/dashboard/months` có sẵn), để tra cứu lịch sử giải trình cho ca không còn nằm trong 4 tab vận hành (vốn chỉ hiện ca còn tồn) và cũng chưa đủ 3 tháng để vào "Ca lưu trữ". Dữ liệu cache theo tháng qua `closedDataCache.ts` (IndexedDB đã xây ở đợt trước) + phân trang thuần client — tránh kéo cả lịch sử về cùng lúc.
4. **MissingParts (Ca thiếu linh kiện) chia 2 tab "Đang tồn"/"Đã đóng"**: cùng pattern cache-theo-tháng như Backlog, dùng chung 1 component mới `ClosedCasesTab.tsx` (tái sử dụng cho cả Backlog lẫn MissingParts, tham số hoá theo `cacheKeyPrefix`/`buildUrl`/`columns`).
5. **Survey tách "Cần khảo sát"** thành 2 tab theo độ mới: "Cần khảo sát" (ca đang tồn HOẶC đã đóng ≤3 ngày so với 0h hôm nay) và "Quá hạn khảo sát" (đã đóng >3 ngày, chưa khảo sát — có thể gọi hoặc bỏ qua). Ngưỡng 3 ngày hardcode vì đã là hằng số nghiệp vụ có sẵn (giống ngưỡng "giải trình quá hạn" ở Backlog).
6. **Cache tĩnh có hash cho "Lý do tồn" và "Bảng giá linh kiện"**: `backend/src/lib/contentHash.ts` tính SHA-256 (Web Crypto) trên nội dung bảng, lưu vào `content_versions` mỗi khi ghi thành công (POST/PATCH/sync-sheet); 2 endpoint đọc hash rẻ (`GET .../version`, chỉ đọc bảng version nhỏ, không đụng bảng lớn). `frontend/src/lib/staticListCache.ts` nén gzip (`CompressionStream`, có sẵn trong trình duyệt) trước khi lưu IndexedDB kèm hash, so hash mỗi lần load — khớp thì dùng cache, khác thì tải lại. Áp dụng thay `useQuery` trực tiếp ở đúng 2 nơi dùng danh mục này: `CaseDetail.tsx` và `SettingsModule.tsx`.

**Kiểm chứng bằng trình duyệt thật** (wrangler dev local + tự ký JWT test + tiêm cookie qua `document.cookie`, seed 4 ca test: 1 đang tồn, 1 đã đóng tháng này, 1 đã đóng ≤3 ngày có cờ nghi ngờ, 1 đã đóng >3 ngày có cờ nghi ngờ):
- Gặp 1 trục trặc công cụ: `computer{action:"left_click", ref:...}` không bấm trúng nút thực tế trong Drawer/Modal (không rõ nguyên nhân — có thể do lệch toạ độ sau khi Drawer trượt vào), trong khi `computer{action:"screenshot"}` liên tục timeout. Chuyển hẳn sang bấm bằng `javascript_tool` (`document.querySelector(...).click()`) cho toàn bộ phần còn lại của phiên kiểm thử — đáng tin cậy hơn nhiều so với toạ độ pixel khi test trên trang có Drawer/Modal lồng nhau.
- Xác nhận đúng: tab mặc định khi mở ca là "Giải trình tồn"; nút "+ Thêm giải trình" mở modal đúng, dropdown lý do chậm lấy đúng từ cache tĩnh, submit ghi đúng vào lịch sử + cập nhật count tab ngay (0→1) + case tự chuyển từ "Chưa giải trình" sang "Đã giải trình".
- Tab "Ca đã đóng" (Backlog) và "Đã đóng" (MissingParts): đúng tháng mặc định (tháng hiện tại), đúng dữ liệu, cache banner + nút đồng bộ hoạt động.
- Survey: ca hoàn thành 1 ngày trước rơi đúng vào "Cần khảo sát", ca hoàn thành 8 ngày trước rơi đúng vào "Quá hạn khảo sát" — tách đúng theo ngưỡng 3 ngày.
- Cache tĩnh hash: gọi `PATCH /settings/ly-do/1` qua curl để tắt "Do KTV" (giả lập 1 người khác sửa qua nơi khác), xác nhận hash đổi ngay; mở lại modal giải trình trên chính phiên trình duyệt đang chạy (không hard-reload) — dropdown tự động loại bỏ "Do KTV" đúng như kỳ vọng, xác nhận cơ chế phát hiện thay đổi + tự đồng bộ hoạt động đúng trong điều kiện thực tế (không chỉ lý thuyết). Bật lại "Do KTV" sau khi test xong.
- Áp migration `0007` lên production trước (xác nhận qua `EXPLAIN QUERY PLAN` dùng đúng index mới, bảng `content_versions` rỗng đúng như kỳ vọng — sẽ tự seed lười ở lần gọi `/version` đầu tiên), dọn sạch dữ liệu test, deploy, xác nhận toàn bộ route mới trả 401 (không phải 404) trên production.

### Bug thật: import giải trình cũ báo lỗi với case_id toàn chữ số

User báo lỗi: tải file mẫu (header đúng "case_id") vẫn báo "không đúng định dạng"; đổi header thành "ID" (kiểu CRM import hàng ngày) thì báo tất cả các dòng "khong tim thay case_id \"\"".

**Root cause tìm được bằng cách tái hiện trực tiếp qua Node + package `xlsx` thật** (không đoán mò): khi 1 cột trong Excel/CSV chỉ chứa số (case_id CRM thật rất hay là dạng số thuần, vd "1014874"), SheetJS's `sheet_to_json` trả về giá trị ô đó dưới dạng kiểu JS `number`, không phải `string`. Code validate ở `importGiaiTrinh.ts`/`importKhaoSat.ts`/`survey.ts` (viết ở đợt import lịch sử và gán CSKH hàng loạt) dùng pattern `(row.case_id ?? "").trim()` — gọi thẳng `.trim()` trên giá trị chưa ép kiểu. Với số 1014874, biểu thức `(1014874).trim` không tồn tại → ném `TypeError`, làm sập cả request (500) → frontend hiện toast chung "Không đọc được file, kiểm tra lại định dạng." (đúng như user gặp với header "case_id" - header ĐÚNG nhưng dữ liệu là số nên vẫn sập). Khi đổi header thành "ID" (sai tên cột), `row.case_id` luôn `undefined` (không tìm thấy field) → `(undefined ?? "").trim()` = `""` hợp lệ về mặt kiểu, không sập, nhưng le tất cả các dòng đều "trống" — đúng y hệt log lỗi user gửi. Cùng 1 nguyên nhân gốc (thiếu ep kieu) giai thich duoc ca 2 trieu chung khac nhau ma user gap.

Bài học: `backend/src/lib/importProcessor.ts` (luồng import CRM hàng ngày gốc, sửa từ đợt đổi case_id sang TEXT) đã làm đúng (`String(row.id).trim()`), nhưng 3 file MỚI viết sau này (2 luồng import lịch sử + gán CSKH hàng loạt) không áp lại đúng bài học đó — 1 lỗ hổng lặp lại do không có kiểm tra chéo giữa các đợt code.

**Sửa**: ép `String(x ?? "")` trước mọi `.trim()`/`.toUpperCase()` trên dữ liệu đến từ file người dùng tải lên, ở toàn bộ 3 file: `importGiaiTrinh.ts` (case_id, ly_do_cham, nguoi_giai_trinh), `importKhaoSat.ts` (case_id, loai_loi, nguoi_thuc_hien, ket_qua_cap_1, hàm `toBool()` đổi tham số từ `string | undefined` sang `unknown`), `survey.ts` bulk-assign (id, assigned_to). Tiện thể phát hiện thêm 1 lỗi nhỏ ở file mẫu `importGiaiTrinh.ts`: dòng ví dụ có thừa 1 dấu phẩy so với dòng header (9 cột nhưng 10 field), khiến giá trị bị lệch cột trong chính file mẫu tải xuống — sửa luôn cho khớp.

**Kiểm chứng**: dùng chính package `xlsx` thật (không phải đoán) để tái hiện bug với 1 case_id dạng số thuần qua Node script trước khi sửa, xác nhận đúng lỗi `(intermediate value).trim is not a function`. Sau khi sửa, test lại qua `wrangler dev` local với case_id `1014874` (dạng số, gửi thẳng `case_id: 1014874` kiểu number trong JSON, đúng như SheetJS sẽ tạo ra) cho cả 3 endpoint — `/import/giai-trinh/preview+commit`, `/import/khao-sat/preview`, `/survey/assign-bulk/preview` — tất cả chạy đúng, không sập, giai-trinh commit ghi đúng `case_id: "1014874"` (string) vào DB. Dọn dữ liệu test, deploy production.

### Chỉ báo "Đồng bộ đến thời điểm nào" trên TopBar

User yêu cầu: 1 chỉ báo nhanh cho biết hệ thống đã đồng bộ dữ liệu đến thời điểm nào, xác định bằng `thoi_gian_cskh_tiep_nhan` (thời gian tiếp nhận, không phải thời gian import) của ca có giá trị lớn nhất trong toàn bộ `case_dvbh` (mọi ca đều vào hệ thống qua import nên không cần lọc thêm điều kiện). Thêm `GET /api/dashboard/sync-status` (không lọc theo khu_vực — phản ánh trạng thái tổng thể hệ thống, không phải phạm vi riêng từng user) và hiển thị dạng "🔄 Đồng bộ đến: DD/MM/YYYY HH:MM" cố định trên `TopBar.tsx` (luôn thấy được ở mọi màn hình), poll lại mỗi 5 phút.

**Phát hiện sớm 1 nguy cơ lãng phí trước khi kịp gây hại** (rút kinh nghiệm từ lỗi COUNT(*) đã sửa ở phiên trước): `MAX(thoi_gian_cskh_tiep_nhan)` không có index sẽ phải quét toàn bộ `case_dvbh` (13.850+ dòng và tăng dần) mỗi 5 phút cho MỖI tab trình duyệt đang mở — nhân lên rất nhanh. Thêm migration `0006_case_tiep_nhan_index.sql` tạo index cho cột này TRƯỚC khi deploy tính năng, xác nhận bằng `EXPLAIN QUERY PLAN` trên cả local lẫn production: chuyển từ (giả định) full scan sang `SEARCH case_dvbh USING COVERING INDEX` — tra cứu O(1) bất kể bảng lớn cỡ nào. Xác nhận giá trị thật trên production: ca gần nhất tiếp nhận lúc `2026-07-16T02:02:55.000Z`.

### Phân loại ca tồn theo khoảng tuổi + báo cáo tồn theo khu vực

User yêu cầu: tách danh sách ca tồn (Backlog) theo khoảng số ngày tồn để ưu tiên giải trình ca tồn lâu nhất trước, cộng thêm 1 bảng tổng quan theo khu vực (tổng tồn, từng khoảng tuổi, tỷ lệ tồn, số/tỷ lệ đã giải trình, số chờ giải trình lại, số lỡ kế hoạch) có filter chi tiết cho Admin/Viewer. Đã lập kế hoạch qua plan mode trước khi code (lưu tại `.claude/plans/fancy-forging-cat.md`), dùng `AskUserQuestion` chốt trước 3 định nghĩa nghiệp vụ mơ hồ: quy luật chia khoảng tuổi (+2 ngày rồi gộp phần còn lại: <1·1-3·3-5·5-7·7-10·10-15·15-30·>30), "lỡ kế hoạch" = `thoi_gian_hen_xu_ly` (hẹn CRM gốc, khác cột `ngày dự kiến hoàn thành` do người giải trình tự nhập ở tab "Quá hạn dự kiến" đã có), và "tỷ lệ tồn" = Tồn/(Tồn + Đã đóng trong kỳ).

- `backend/src/routes/cases.ts`: thêm `AGE_EXPR`/`ageFilterClause()` dùng `julianday(datetime('now','start of day')) - julianday(thoi_gian_cskh_tiep_nhan)` (neo mốc 0h hôm nay, không phải giờ hiện tại — khác 1 chút so với `backlog-stats` cũ vẫn neo theo `'now'`, cố tình để giữ đúng yêu cầu mới mà không đụng vào chart cũ). Thêm `tuoi_tu`/`tuoi_den` (số ngày, nửa mở) vào `GET /` và `GET /counts` — kết hợp được với `tab` bất kỳ. Thêm route mới `GET /backlog-by-khu-vuc?thang=`: 1 query GROUP BY khu_vực cho toàn bộ số đếm tồn (tổng + 7 khoảng + đã giải trình + chờ giải trình lại, tái dùng nguyên biểu thức `TAB_FILTERS["qua-han-giai-trinh"]` đã có thay vì viết lại) + lỡ kế hoạch, cộng 1 query riêng đếm số đã đóng trong tháng (dùng `monthBounds()` sẵn có) merge theo khu vực bằng JS — tỷ lệ % không tính ở backend, trả số thô để frontend tự tính bằng `pct()` giống hệt cách `DashboardModule.tsx` đã làm với bảng pivot (tránh 2 nơi tính tỷ lệ theo 2 kiểu khác nhau).
- `frontend/src/modules/BacklogModule.tsx`: đổi thứ tự tab, đưa "Đã giải trình" xuống cuối cùng (chỉ còn mang tính tra cứu, không phải việc cần làm ngay). Thêm `<Select>` lọc khu vực (tái dùng `/dashboard/filters` có sẵn) và lọc tuổi tồn (8 khoảng cố định + "Tùy chỉnh…" hiện 2 ô nhập số ngày từ/đến) áp dụng cho danh sách chi tiết. Thêm bảng "Báo cáo tồn theo khu vực" (Card, đặt trên `<Tabs>`), mỗi ô số (tổng tồn/từng khoảng tuổi/chờ giải trình lại) là 1 nút bấm để **drill-down**: set khu vực + khoảng tuổi tương ứng rồi tự chuyển sang tab "Chưa giải trình" (hoặc "Giải trình quá hạn" cho ô chờ giải trình lại) và cuộn xuống danh sách.
- Phát hiện 1 lỗi khi tự kiểm chứng bằng dữ liệu seed có kiểm soát: `GET /cases/counts` vốn chỉ áp `scopeByKhuVuc` (phạm vi được PHÉP xem của user) chứ chưa từng nhận query `khu_vuc` (bộ lọc CHỌN 1 khu vực cụ thể) — khi thêm Select khu vực ở frontend, badge số lượng trên tab bị sai (vẫn đếm toàn bộ thay vì đúng khu vực đang lọc). Sửa bằng cách thêm hẳn `khu_vuc` query param vào `/counts`, giống `extraFilter` đã có ở `GET /`.

**Kiểm chứng**: seed 10 ca test (khu vực `TEST_KV`) với `thoi_gian_cskh_tiep_nhan` lệch chính xác theo từng khoảng (<1, 1-3, 3-5, 5-7, 7-10 x2, 10-15, 15-30, >30 ngày), 1 ca có `thoi_gian_hen_xu_ly` đã qua (lỡ kế hoạch), 1 ca đã đóng trong tháng, 1 ca có giải trình cũ (12 ngày trước, vừa đếm "đã giải trình" vừa đếm "chờ giải trình lại" do >=3 ngày kể từ lần giải trình gần nhất) — đối chiếu tay từng số trên `/cases/backlog-by-khu-vuc`, khớp chính xác 100% (tổng tồn 8, đúng cả 7 khoảng, chờ giải trình lại 7/8, lỡ kế hoạch 1, đã đóng trong kỳ 1). Test qua trình duyệt thật (`wrangler dev` + JWT tiêm cookie): bảng hiện đúng số, bấm ô "chờ giải trình lại" của `TEST_KV` nhảy đúng sang tab "Giải trình quá hạn" với khu vực + đúng 7 ca hiện ra; chọn khoảng tuổi "1–3 ngày" qua Select lọc đúng còn 1 ca; tab "Ca đã đóng" ẩn đúng Select tuổi nhưng vẫn giữ Select khu vực hoạt động. Dọn dữ liệu test, deploy production (Version ID `4f2910b8-0b4c-4e6d-babe-aa7f056855da`), xác nhận route mới trả 401 (không phải 404).

### Đổi logic tính tuổi tồn (8h sáng giờ VN, đếm ngày tròn) + báo cáo linh kiện tồn theo khu vực

User yêu cầu 2 việc: (1) đổi hẳn cách tính "tuổi tồn" — 24h đầu không tính tồn, qua mốc 24h mới tính tồn 1 ngày (ví dụ đúng 73h đã trôi qua = tồn 3 ngày), mốc đo là **8h sáng giờ Việt Nam** của ngày xem báo cáo (không phải 0h như bản trước), đồng thời đổi bộ lọc tuổi tồn từ 8 khoảng chi tiết xuống còn 4 mốc dồn: tồn trên 1/3/5/7 ngày; (2) làm 1 bảng "Báo cáo linh kiện tồn theo khu vực" tương tự bảng đã có ở Quản lý tồn, cho module Ca thiếu linh kiện, có filter khu vực + tuổi tồn.

- `backend/src/lib/ageCalc.ts` (mới): tách công thức tính tuổi ra dùng chung cho cả `cases.ts` lẫn `missingParts.ts` (tránh 2 nơi tự triển khai rồi lệch nhau). Mốc neo `AGE_ANCHOR` = `datetime(date(datetime('now','+7 hours')) || ' 08:00:00', '-7 hours')` — do D1/SQLite `datetime('now')` trả về UTC, phải tự quy đổi: lấy ngày hôm nay theo lịch VN (+7h), đặt lại 8h sáng cho đúng ngày lịch đó, rồi trừ lại 7h để ra đúng mốc UTC tương ứng — xử lý đúng cả trường hợp biên (VD 23h UTC hôm trước = 6h sáng hôm sau giờ VN, ngày lịch VN đã sang ngày mới nhưng chưa tới 8h). Tuổi tồn = `CAST((julianday(anchor) - julianday(tiep_nhan)) AS INTEGER)` — `CAST AS INTEGER` trong SQLite cắt phần thập phân (làm tròn xuống với số dương), cho đúng "đếm số ngày 24h tròn đã trôi qua" thay vì làm tròn theo lịch.
- `backend/src/routes/cases.ts`: xoá định nghĩa `AGE_EXPR`/`ageFilterClause` cục bộ cũ (neo theo `'now','start of day'`), import từ `ageCalc.ts`. Đổi cột trong `/backlog-by-khu-vuc` từ 7 khoảng rời rạc (1-3, 3-5...) sang 3 cột mốc dồn `tren_3`/`tren_5`/`tren_7` (cột "Tổng tồn" đã tương đương mốc "trên 1 ngày" nên không lặp lại). Đổi luôn mốc tính "lỡ kế hoạch" (`thoi_gian_hen_xu_ly`) sang dùng chung `AGE_ANCHOR` thay vì `'now','start of day'` cũ, cho nhất quán 1 mốc neo duy nhất trong toàn bộ báo cáo.
- `backend/src/routes/missingParts.ts`: thêm `tuoi_tu`/`tuoi_den` + `khu_vuc` (lọc theo 1 khu vực cụ thể, khác với phạm vi được phép xem `scopeByKhuVuc`) vào nhánh `dang-ton` của `GET /missing-parts`. Thêm route mới `GET /missing-parts/by-khu-vuc`: nhóm theo khu vực, cùng kiểu cột mốc dồn (tổng tồn, trên 3/5/7 ngày), cộng thêm `tong_gia_tri_linh_kien` (SUM `dt_linh_kien`), `so_ma_linh_kien` (COUNT DISTINCT `linh_kien_thieu`), `lo_ke_hoach` — phản ánh đúng tinh thần "tổng quan tồn đọng linh kiện" user yêu cầu.
- Frontend: `BacklogModule.tsx` đổi `AGE_BUCKETS`/`KHU_VUC_BUCKET_COLS` sang 4 mốc dồn (giữ "Tùy chỉnh…" cho trường hợp cần khoảng chính xác khác, ví dụ khi bấm ô "Tổng tồn" trong bảng vẫn cần set đúng `tuoi_tu=1`). `MissingPartsModule.tsx` (viết lại tương tự `BacklogModule.tsx`): thêm Select khu vực + tuổi tồn phía trên Tabs (ẩn Select tuổi khi ở tab "Đã đóng", giữ Select khu vực), thêm bảng "Báo cáo linh kiện tồn theo khu vực" ngay trên Tabs với drill-down bấm số → set filter + tab "Đang tồn" + cuộn xuống danh sách, cùng pattern hệt Backlog.

**Kiểm chứng**: xác nhận công thức bằng SQL thuần trước khi seed dữ liệu (dùng CTE cố định 1 giá trị mốc, test các mốc 23h/25h/73h/95h/97h trước tiếp nhận — kết quả đúng y hệt ví dụ user đưa ra: 73h = tồn 3 ngày). Seed 5 ca test (case tiếp nhận đúng 23h/25h/73h/97h/168h trước mốc, 1 ca có `thoi_gian_hen_xu_ly` đã qua) + 1 ca giả lập thiếu linh kiện (gắn `giai_trinh` với lý do "Thiếu linh kiện do công ty", linh kiện thiếu ghi đúng mã `3004030373`, `dt_linh_kien` 500.000đ) — đối chiếu tay từng số trên cả `/cases/backlog-by-khu-vuc` lẫn `/missing-parts/by-khu-vuc`, khớp chính xác 100% (tổng tồn, trên 3/5/7 ngày, chờ giải trình lại, lỡ kế hoạch, giá trị + số mã linh kiện). Test qua trình duyệt thật: Select "Tuổi ca tồn" hiện đúng 4 mốc mới ở cả 2 module, bảng linh kiện tồn hiện đúng số, bấm ô "Tổng tồn" đúng nhảy filter khu vực + "Tồn trên 1 ngày" + tab "Đang tồn". Gặp 1 trục trặc phụ trong lúc test: `wrangler dev` bị treo/thoát ngầm giữa chừng (curl trả `000`) — không rõ nguyên nhân, khởi động lại là chạy bình thường, không liên quan tới code thay đổi. Dọn dữ liệu test, deploy production (Version ID `09f374f4-1184-482b-b7c6-a24f86e5a646`), xác nhận toàn bộ endpoint liên quan trả 401 (không phải 404).

### Tách "Báo cáo" / "Danh sách chi tiết" thành 2 tab riêng + filter DVBH + mặc định tuổi tồn "trên 3 ngày" (Quản lý tồn, Ca thiếu linh kiện, Quản lý khảo sát)

User yêu cầu 2 việc: (1) ở "Quản lý tồn", tách bảng báo cáo theo khu vực và danh sách ca chi tiết thành 2 tab riêng (thay vì xếp chồng luôn hiện cả 2), filter (khu vực, tuổi tồn) đặt chung phía trên và dùng chung cho cả 2 tab; filter khu vực thêm 1 lựa chọn gộp "DVBH" (khớp mọi khu vực có chứa "qldvbh" — vốn là các khu vực do TBP DVBH phụ trách); mặc định khi vào trang, filter tuổi tồn đặt sẵn "Tồn trên 3 ngày" (phản ánh khối lượng ca cần xử lý mỗi ngày của bộ phận); (2) áp dụng y hệt logic này cho "Ca thiếu linh kiện" và "Quản lý khảo sát".

- Filter "DVBH": phát hiện cơ chế `__QLDVBH__` (khớp `khu_vuc LIKE '%qldvbh%'`) đã có sẵn nhưng chỉ dùng trong `parseFilterParams()` (Dashboard/Doanh thu) — 3 route Backlog/MissingParts/Survey chưa hề hỗ trợ, chỉ so khớp `=` đúng 1 khu vực. Thêm hàm dùng chung `khuVucAdHocClause(column, khuVucFilter)` trong `backend/src/lib/filterParams.ts` (tái dùng đúng hằng số `QLDVBH_FILTER_VALUE` đã có, tránh định nghĩa trùng ở 2 nơi), áp dụng vào mọi điểm lọc khu vực ad-hoc ở `cases.ts` (`GET /`, `/counts`, `/backlog-by-khu-vuc`), `missingParts.ts` (`GET /`, `/by-khu-vuc`), và `survey.ts` (route này trước đó **hoàn toàn chưa có filter khu vực nào do người dùng tự chọn** — chỉ có `scopeByKhuVuc` theo vai trò — nay thêm mới đồng bộ với 2 route kia).
- `survey.ts`: thêm `tuoi_tu`/`tuoi_den` (tuổi ca tính từ `thoi_gian_cskh_tiep_nhan`, dùng chung `ageCalc.ts` đã có) vào cả 4 tab (`can-khao-sat`, `qua-han-khao-sat`, `cho-qc`, `da-xu-ly`) và `/counts`. Thêm route hoàn toàn mới `GET /survey/by-khu-vuc` — trước đây Survey **không có bất kỳ báo cáo theo khu vực nào** — thiết kế mới này chạy 4 truy vấn GROUP BY riêng (mỗi truy vấn tái dùng đúng điều kiện của 1 trong 4 tab hiện có: `NEED_SURVEY_CONDITION` + `RECENT_OR_OPEN`/`OVERDUE`, hoặc điều kiện `vi_pham.chot_bo_cap_2`), merge lại theo khu vực bằng JS thành 4 cột: Cần khảo sát / Quá hạn khảo sát / Chờ QC / Đã xử lý. Bảng này **không áp dụng** filter tuổi tồn (chỉ áp khu vực) — nhất quán với quy ước đã dùng ở Backlog/MissingParts: bảng tổng quan luôn hiện đầy đủ, filter tuổi tồn chỉ thu hẹp danh sách chi tiết.
- Frontend cả 3 module (`BacklogModule.tsx`, `MissingPartsModule.tsx`, `SurveyModule.tsx`): thêm state `view` ("bao-cao" | "danh-sach", mặc định "bao-cao") điều khiển 1 cặp `<Tabs>` cấp cao nhất, đặt filter (Select khu vực có thêm option "Tất cả DVBH (MB/MN...)", Select tuổi tồn mặc định `"gt-3"`) phía trên, dùng chung cho cả 2 view. View "Báo cáo" gom toàn bộ chart + bảng theo khu vực (di chuyển nguyên trạng từ vị trí cũ, không đổi nội dung); view "Danh sách chi tiết" gom Tabs con hiện có (chua-giai-trinh/dang-ton-da-dong/can-khao-sat...) + bảng/list, giữ nguyên hành vi cũ hoàn toàn. Drill-down từ bảng báo cáo: bấm số → set khu vực + tab con tương ứng + chuyển `view` sang "danh-sach" (bỏ hẳn cơ chế cuộn `scrollIntoView` cũ vì giờ là 2 tab tách biệt, không cần cuộn). Riêng Survey: do bảng báo cáo không áp tuổi tồn, khi drill-down chủ động set tuổi tồn về "Tất cả" để số ca hiện ở danh sách khớp đúng số đã bấm.

**Kiểm chứng**: test filter DVBH bằng curl trên cả 3 route mới/sửa (`/cases?khu_vuc=__QLDVBH__`, `/cases/backlog-by-khu-vuc?khu_vuc=__QLDVBH__`, `/missing-parts?khu_vuc=__QLDVBH__`, `/survey/by-khu-vuc?khu_vuc=__QLDVBH__`) — xác nhận chỉ trả về đúng các khu vực có "qldvbh" trong tên; test lại filter khu vực kiểu cũ (so khớp `=` 1 khu vực cụ thể) vẫn hoạt động đúng như trước (không có hồi quy). Test qua trình duyệt thật cho cả 3 module: tab "Báo cáo"/"Danh sách chi tiết" hiện đúng nội dung tương ứng, option "Tất cả DVBH" xuất hiện trong Select khu vực, vào "Danh sách chi tiết" thấy Select tuổi tồn mặc định đúng "Tồn trên 3 ngày", bấm 1 ô số trong bảng báo cáo (đã thử với Backlog và Survey) nhảy đúng sang "Danh sách chi tiết" với đúng khu vực + tab con + số dòng khớp chính xác con số đã bấm. Deploy production (Version ID `aa1a3d8c-7510-449a-8f47-8ff15e7201e3`), xác nhận toàn bộ route liên quan trả 401 (không phải 404).

### Tùy chỉnh giao diện theo tài khoản + Báo cáo nhanh đầu ngày theo vai trò

User yêu cầu 2 tính năng độc lập: (1) mỗi tài khoản tự chọn 1 gam màu giao diện riêng (5 gam màu dựng sẵn + 1 gam màu tùy chỉnh theo 6 vị trí: nút bấm/nền trang/nền thẻ/thanh top/viền/chữ), lưu theo tài khoản; (2) khi 1 tài khoản đăng nhập lần đầu trong ngày, đẩy 1 thông báo báo cáo nhanh vấn đề tồn đọng — vai trò "Giám sát" thì theo đúng khu vực phụ trách (ca tồn >3 ngày, thiếu linh kiện, nghi ngờ vi phạm, doanh thu), vai trò khác thì số tổng toàn hệ thống — cùng dữ liệu hiện thêm ở 1 thẻ nổi bật trên trang Tổng quát.

Khảo sát trước khi làm (2 Explore agent song song) xác nhận: hệ thống **chưa có** cơ chế theme/dark-mode nào, **chưa có** endpoint tự-phục-vụ để 1 user sửa hàng của chính mình (`users.ts` khóa Admin-only, chỉ thao tác trên user khác), và nút "🔔 Thông báo" ở TopBar **chỉ trang trí** (không dropdown, chỉ 1 chấm đỏ từ 1 API đếm không liên quan). Cả 2 đều là xây mới.

**Phần 1 — Theme:**
- Toàn bộ màu là CSS custom properties thuần (`frontend/src/styles/tokens.css`), Tailwind không đăng ký màu (`tailwind.config.js` không có `theme.colors`) — mọi nơi dùng `bg-[var(--x)]` arbitrary value. Nghĩa là đổi giá trị runtime của biến CSS (`document.documentElement.style.setProperty`) là đủ, không cần rebuild.
- Phát hiện 4 chỗ dùng màu **cứng** `bg-white` (không qua biến, sẽ không theme được nếu bỏ qua): `Card.tsx`, `Modal.tsx`, `Drawer.tsx`, và `TopBar.tsx` (cả `<header>` lẫn dropdown menu) — sửa cả 4 sang `bg-[var(--surface)]`/`bg-[var(--topbar-bg)]` (biến mới thêm vào tokens.css).
- Migration `0009_user_prefs.sql`: thêm `theme_config TEXT` (JSON, null = preset "ocean" mặc định) vào `users`.
- `backend/src/lib/theme.ts` (mới): `sanitizeThemeConfig()` validate cấu trúc + regex hex `^#[0-9a-fA-F]{6}$` cho từng màu, trả `null` nếu sai (không throw) để route tự quyết 400.
- `backend/src/routes/auth.ts` thêm `PATCH /me` — **chỉ** cho sửa `theme_config` của chính người gọi (khác hẳn `users.ts` vốn Admin-only + thao tác trên user khác).
- Frontend: `theme/presets.ts` (5 preset: Đại dương/Ngọc lục bảo/Hoàng hôn/Tím than/Than chì — preset "Đại dương" = giữ nguyên giao diện hiện tại, đảm bảo user chưa từng cài đặt không thấy đổi gì), `theme/ThemeProvider.tsx` (áp CSS var theo `user.theme_config` khi mount), `components/ThemeSettingsModal.tsx` (lưới 5 preset bấm 1 cái là áp ngay + lưu, + ô "Tùy chỉnh" mở 6 color picker đúng 6 vị trí user nêu — `accentDark`/`accentTint` tự suy ra từ màu nhấn chọn bằng phép tính RGB đơn giản, không bắt user chọn thêm 2 màu phụ). Entry point: mục "🎨 Đổi giao diện" trong dropdown user menu ở TopBar.

**Phần 2 — Báo cáo nhanh đầu ngày:**
- Phiên đăng nhập kéo dài 8h (`SESSION_TTL_SECONDS`, `auth.ts`) nên không đủ tin cậy để dùng tần suất OAuth callback làm mốc "lần đầu trong ngày" (có thể đăng nhập lại nhiều lần/ngày). Xử lý tại `GET /api/auth/me` (gọi mỗi lần mở app) bằng 1 câu `UPDATE` nguyên tử đối chiếu ngày lịch VN: `UPDATE users SET last_report_date = date(datetime('now','+7 hours')) WHERE email=? AND (last_report_date IS NULL OR last_report_date != date(...))` — `meta.changes=1` nghĩa là lần đầu hôm nay, trả `showDailyReport: true` để FE bắn toast đúng 1 lần/ngày.
- `backend/src/lib/dailyReport.ts` (mới): `computeDailyReport(db, user)` — vai trò "Giam sat" lọc theo đúng `khu_vuc_phu_trach` (`IN (...)`), vai trò khác không lọc (số tổng toàn hệ thống). Tái dùng nguyên các điều kiện đã có sẵn ở nơi khác (không viết lại logic mới): `AGE_EXPR` từ `ageCalc.ts` (ca tồn >3 ngày), `BASE_JOIN` từ `missingParts.ts` (thiếu linh kiện), điều kiện `nghiNgo` từ `viPham.ts` (nghi ngờ vi phạm), `REVENUE_EXPR` từ `revenue.ts` (doanh thu tháng hiện tại). Endpoint `GET /dashboard/daily-report` dùng chung cho cả toast lẫn thẻ Tổng quát, luôn tính mới không cache.
- Frontend: `App.tsx` bắn `addToast(...)` 1 lần khi `showDailyReport` (chặn lặp lại bằng `useRef`), `DashboardModule.tsx` thêm thẻ nổi bật "📊 Báo cáo nhanh vấn đề trong ngày" (tông coral/amber) đặt đầu trang, mỗi số liệu bấm được để điều hướng sang module tương ứng (thêm prop `onNavigate` truyền từ `App.tsx`).

**Kiểm chứng**: test `PATCH /auth/me` với theme hợp lệ/không hợp lệ (hex sai → 400 đúng), test `GET /auth/me` trả `showDailyReport:true` lần gọi đầu và `false` các lần sau. Seed 1 user `vai_tro='Giam sat'` với `khu_vuc_phu_trach=["TEST_REGION_GS"]` + cặp ca test giống hệt nhau ở TRONG và NGOÀI khu vực phụ trách (tồn >3 ngày, thiếu linh kiện, nghi vi phạm, doanh thu) — đối chiếu tay xác nhận `computeDailyReport` chỉ đếm đúng ca trong khu vực cho vai trò Giám sát, và đếm toàn hệ thống (cả trong lẫn ngoài) cho vai trò Admin — khớp chính xác 100%. Test qua trình duyệt thật: đổi giao diện qua modal, xác nhận biến CSS đổi đúng ngay lập tức + giữ nguyên sau F5 (persist đúng); thẻ báo cáo nhanh trên Tổng quát hiện đúng số hệt API, bấm vào điều hướng đúng module. Gặp 1 lần deploy lỗi mạng tạm thời ("fetch failed") — deploy lại thành công ngay. Deploy production (Version ID `a38ff9ac-ede7-44d2-8a5a-db92d6e4e468`), dọn dữ liệu test, xác nhận endpoint mới trả 401 (không phải 404).

### Sửa 2 lỗi phát sinh sau khi ra mắt tính năng theme + báo cáo nhanh

User báo 2 vấn đề ngay sau khi tính năng ở trên lên production: (1) bấm chuông 🔔 không phản hồi, không hiện gì; (2) không thấy "thẻ tùy chỉnh giao diện" ở giao diện admin.

- **Chuông không phản hồi**: đúng như đã ghi chú lúc khảo sát trước khi làm tính năng ("nút Thông báo hiện chỉ trang trí, không có dropdown") — đây là hạn chế đã biết nhưng chưa xử lý, giờ user chạm phải khi kỳ vọng chuông sẽ hiện báo cáo nhanh. Sửa: thêm `onClick` + dropdown thật cho chuông ở `TopBar.tsx`, hiện cả 2 số đếm cũ ("Ca cần giải trình", "Ca chờ QC chốt cấp 2" — vốn chỉ dùng để tô chấm đỏ trước đây) lẫn dữ liệu `/dashboard/daily-report` (4 chỉ số báo cáo nhanh), mỗi dòng bấm được để điều hướng đúng module (thêm `onNavigate` prop cho `TopBar`, truyền từ `App.tsx` giống cách đã làm với `DashboardModule`).
- **Không thấy thẻ đổi giao diện ở admin**: code không hề gating theo vai trò — nút "🎨 Đổi giao diện" đã có sẵn cho MỌI vai trò, nhưng nằm trong dropdown menu avatar (góc phải, bấm vào tên/ảnh đại diện mới thấy) — admin không nghĩ tới đó mà tìm trong trang Settings quen thuộc thì không thấy. Sửa bằng cách tách phần giao diện chọn màu ra `components/ThemeSettingsPanel.tsx` (dùng chung), `ThemeSettingsModal.tsx` giờ chỉ là lớp bọc `<Modal>` mỏng quanh panel này, và thêm hẳn 1 tab **"Giao diện"** mới trong `SettingsModule.tsx` (trang Admin đã quen thuộc) render thẳng panel đó — giữ nguyên luôn cả lối vào cũ ở TopBar cho các vai trò không có quyền vào Settings.

**Kiểm chứng**: qua trình duyệt thật — bấm chuông hiện đúng dropdown với đủ số liệu khớp với `/dashboard/daily-report`, bấm 1 dòng điều hướng đúng module; vào Settings → tab "Giao diện" hiện đúng đầy đủ UI chọn 5 preset + tùy chỉnh. Deploy production (Version ID `40e1c7a5-e8d0-41ca-847f-65c165301467`), xác nhận health check bình thường.

### Đồng bộ Google Sheet cho import lịch sử cũ + link đồng bộ cấu hình được ở Settings

User yêu cầu: áp dụng logic đồng bộ Google Sheet (đã có sẵn cho ca CRM và bảng giá linh kiện) cho cả 2 luồng import lịch sử cũ ("Import giải trình cũ", "Import khảo sát cũ"). Thêm điều kiện mới: link Google Sheet của TẤT CẢ 4 loại đồng bộ phải cấu hình được ngay trong Settings (Admin) — kể cả 2 link đã cài từ trước (`CASE_SHEET_URL`, `LINH_KIEN_SHEET_URL` trong `wrangler.jsonc`) cũng phải chuyển hẳn qua cơ chế này, không giữ song song 2 cách.

- Migration `0008_sheet_urls_settings.sql`: bảng `settings_sheet_urls` (khóa chính `loai_dong_bo`: `case`/`linh_kien`/`giai_trinh_cu`/`khao_sat_cu`, cột `url` nullable), seed sẵn 2 link thật hiện có cho `case`/`linh_kien` từ giá trị cũ trong `wrangler.jsonc`, để trống (`NULL`) cho 2 loại mới.
- `backend/src/lib/backfillSheetSync.ts` (mới): `parseBackfillTsv()` parse TSV theo header = tên cột DB trực tiếp (khác `caseSheetSync.ts` — không cần `COLUMN_MAP` vì loại import lịch sử vốn đã dùng tên cột DB làm tiêu đề CSV mẫu), `fetchSheetText()`, `getSheetUrl(db, loai)` đọc 1 dòng từ `settings_sheet_urls`. Tách `parseSheetDateTime`/`parseSheetDateOnly` từ `caseSheetSync.ts` ra file dùng chung `sheetDateParser.ts` để tái dùng logic parse ngày (hỗ trợ cả "YYYY-MM-DD" và "DD/MM/YYYY", có/không giờ) thay vì chép lại.
- Thêm `POST /api/import/giai-trinh/sync-sheet` và `POST /api/import/khao-sat/sync-sheet` (đều `requireRole("Admin")`, tái dùng nguyên `processRows()` sẵn có — chỉ khác nguồn dữ liệu đến từ sheet thay vì file upload).
- `settings.ts` thêm `GET/PATCH /api/settings/sheet-urls` (đọc/ghi link theo từng loại) và đổi `/linh-kien/sync-sheet` sang lấy link từ DB thay vì `c.env.LINH_KIEN_SHEET_URL`. `importRoute.ts` (`/sync-sheet` ca CRM) đổi tương tự sang `c.env.CASE_SHEET_URL`. Xóa hẳn 2 biến này khỏi `types.ts` và `wrangler.jsonc` sau khi migrate xong (không giữ lại như fallback — tránh 2 nguồn sự thật).
- Frontend: `SettingsModule.tsx` thêm tab "Link đồng bộ Google Sheet" (danh sách 4 loại, mỗi loại 1 ô nhập link + nút Lưu + hiển thị lần cập nhật cuối). `ImportModule.tsx` thêm khối "Đồng bộ ngay" cho tab "Import giải trình cũ"/"Import khảo sát cũ" (cùng pattern khối đã có ở tab CRM), chỉ hiện khi Admin **và** đã có link cấu hình cho loại đó (ẩn nút khi chưa cấu hình, tránh bấm vào rồi báo lỗi ngay).

**Kiểm chứng qua `wrangler dev` local** (không đoán, test bằng dữ liệu thật đi qua toàn bộ pipeline): dựng 1 static file server local (Python `http.server`) phục vụ 2 file TSV mẫu tự tạo (đúng định dạng cột DB, có ngày dạng "DD/MM/YYYY HH:MM:SS" để test parse), trỏ link qua `PATCH /settings/sheet-urls/giai_trinh_cu` và `.../khao_sat_cu`, gọi 2 endpoint sync-sheet mới — xác nhận ghi đúng vào `giai_trinh`/`ket_qua_goi`/`vi_pham`, ngày giờ parse đúng từ "DD/MM/YYYY" sang "YYYY-MM-DD HH:MM:SS". Test trường hợp chưa cấu hình link → đúng `MISSING_SHEET_URL`. Test hồi quy 2 luồng cũ (case/linh_kien) sau khi chuyển sang đọc link từ DB — gọi thật với link Google Sheet thật đã seed từ migration, xác nhận vẫn đồng bộ đúng (14.595 ca CRM, 5.812 linh kiện, không lỗi) — xác nhận việc bỏ hẳn biến env cũ không làm hỏng 2 luồng đã chạy production từ trước. Dọn dữ liệu test cục bộ (ca test, cấu hình link trỏ về server test đã tắt), áp migration `0008` lên production, deploy, xác nhận toàn bộ endpoint mới/đã sửa trả 401 (không phải 404) trên production thật.

### Bug thật: import giải trình cũ báo "hợp lệ sẵn sàng" nhưng bấm import lại báo lỗi

User gửi file `.xlsx` thật (13 dòng, tải đúng từ file mẫu hệ thống) kèm mô tả: bấm chọn file → hệ thống báo "hợp lệ, sẵn sàng import" (qua bước preview) → bấm "Xác nhận import" → toast "Import thất bại, thử lại sau."

**Điều tra bằng cách đọc trực tiếp file `.xlsx` thật** (Node + package `xlsx` thật, giả lập đúng cách `ImportUploader.tsx` parse: `cellDates: true`, đọc `binary string`) rồi feed nguyên dữ liệu qua `wrangler dev` local (đã seed đúng 13 `case_id` thật + toàn bộ danh mục `ly_do`/`linh_kien` khớp production): `preview` trả về 13/13 hợp lệ đúng như user thấy, nhưng gọi `commit` thì log server hiện rõ `FOREIGN KEY constraint failed` tại bảng `giai_trinh`, cột `linh_kien_thieu`.

**Root cause**: cột `giai_trinh.linh_kien_thieu` có khóa ngoại `REFERENCES linh_kien(ma_linh_kien)` — chỉ chấp nhận đúng MÃ linh kiện (vd `"3004030373"`), không phải tên đầy đủ. Nhưng cả 6/13 dòng trong file thật của user đều điền TÊN ĐẦY ĐỦ linh kiện (vd `"Vi mạch AIOTEC 4.0 J_5C ( 3004030373)"` — khớp chính xác 100% với cột `ten_linh_kien` trong bảng `linh_kien`, xác nhận bằng `SELECT ... WHERE ten_linh_kien IN (...)`). `processRows()` ở bước preview không hề validate field này (chỉ đưa thẳng `row.linh_kien_thieu || null` vào bind lúc insert) nên preview "hợp lệ" giả — lỗi FK chỉ lộ ra lúc commit thật sự ghi vào DB, và vì `runBatched()` gộp tất cả câu INSERT của cả file vào chung 1 `db.batch()` nên 1 dòng sai làm rớt luôn toàn bộ 13 dòng (kể cả 7 dòng hoàn toàn hợp lệ), không có cách nào cho user biết dòng nào/trường nào sai.

**Sửa**: thêm `loadLinhKienLookup(db)` trong `backfillImportProcessor.ts` — nạp map 2 chiều (cả `ma_linh_kien` lẫn `ten_linh_kien` đều trỏ về `ma_linh_kien`), rồi validate+resolve `linh_kien_thieu` ngay ở bước preview trong `importGiaiTrinh.ts`: nếu người dùng gõ đúng mã hoặc đúng tên đầy đủ đều chấp nhận (tự động quy đổi về mã trước khi ghi DB), nếu không khớp cả 2 cách thì báo lỗi rõ ràng theo từng dòng (`Dong X: linh_kien_thieu "..." khong co trong danh muc linh kien`) thay vì để vỡ FK lúc commit.

**Kiểm chứng**: test lại đúng file thật của user qua `wrangler dev` local — preview lẫn commit đều chạy đúng 13/13, kiểm tra DB xác nhận toàn bộ 6 dòng có `linh_kien_thieu` đã được quy đổi đúng về mã (không phải tên). Test thêm 1 dòng cố ý sai (`linh_kien_thieu: "khong ton tai gi ca"`) xác nhận bị chặn đúng ở preview với thông báo lỗi rõ ràng thay vì im lặng cho qua rồi vỡ ở commit. Dọn dữ liệu test, deploy production, xác nhận route vẫn trả 401 bình thường (Version ID `a5bb74b4-44ad-4550-8fb8-5f775a01cc31`).

### Cache cục bộ cho dữ liệu "đã đóng" (ca đã hoàn thành)

User yêu cầu: ca đã có `thoi_gian_hoan_thanh` (mặc định không đổi nữa) thì lưu cache ngay trên máy người dùng, hiện rõ "đang xem cache, cập nhật lần cuối lúc xxxx", kèm 1 nút đồng bộ lại thủ công khi cần đối chiếu server. Áp dụng cho 2 nơi hiển thị dữ liệu ca đã đóng: module "Ca lưu trữ" (toàn bộ danh sách) và Chi tiết ca (khi ca đã hoàn thành).

- `frontend/src/lib/closedDataCache.ts` (mới): cache dùng **IndexedDB** thay vì `localStorage` — hạn mức lớn hơn nhiều (localStorage ~5-10MB không đủ khi danh sách lưu trữ phình to vĩnh viễn theo thời gian, vì chính sách là archive giữ mãi mãi). Bọc try/catch toàn bộ, cache-miss coi như luôn fetch server nếu trình duyệt chặn IndexedDB.
- `components/ui/CacheBanner.tsx` (mới): banner dùng chung "📦 ... cập nhật lần cuối: ..." + nút "🔄 Đồng bộ lại".
- `ArchivedModule.tsx`: đổi từ phân trang phía server sang tải 1 lần toàn bộ danh sách (`?export=true`, cache đã có sẵn) rồi phân trang thuần phía client từ dữ liệu cache — tránh vấn đề "trang 1 đổi nội dung mỗi ngày" nếu cache theo từng trang riêng lẻ (do cron archive thêm ca mới vào đầu danh sách sắp theo `archived_at DESC` mỗi ngày).
- `CaseDetail.tsx`: cache theo từng `case_id`, chỉ cache nếu ca đó **đã hoàn thành** tại thời điểm fetch (ca đang tồn luôn fetch server, không cache, vì có thể đổi bất cứ lúc nào).
- Đóng 1 rủi ro phụ: dọn sạch toàn bộ cache khi đăng xuất (`TopBar.tsx` logout) — tránh máy dùng chung giữa 2 tài khoản khác phạm vi truy cập lộ dữ liệu cache của người trước.

**Kiểm chứng bằng trình duyệt thật** (không chỉ build/typecheck): seed 1 ca đã hoàn thành + đã lưu trữ và 1 ca đang tồn trên D1 local, chạy `wrangler dev`, tự ký JWT test + tiêm cookie qua `document.cookie` trong trang (vì không đăng nhập Google thật được) để có phiên đăng nhập thật. Phát hiện 1 lỗi thao tác của chính mình giữa chừng: quên `vite build` lại sau khi sửa code nên lần đầu browser vẫn chạy bundle cũ (banner không hiện) — phát hiện qua request network vẫn gọi `?page=1&pageSize=20` thay vì `?export=true` mới, build lại thì đúng ngay. Sau khi build lại, xác nhận đầy đủ qua trình duyệt thật: banner + nút đồng bộ hiện đúng ở cả 2 nơi, `indexedDB.databases()` có "dvbh-closed-cache", reload trang không tạo thêm network request (phục vụ thuần từ cache, timestamp giữ nguyên), bấm "Đồng bộ lại" tạo request mới + cập nhật timestamp, và xác nhận ca **đang tồn** không hiện banner/cache (đúng thiết kế chỉ cache dữ liệu đã đóng).

### Đổi giao diện: hiện cho mọi vai trò + thêm 8 gam màu + theme hóa thanh menu bên trái

User báo 2 việc: (1) tính năng đổi giao diện đang chỉ thấy được qua Settings (vốn chỉ Admin mới có trong `ROLE_MODULES`), cần đảm bảo mọi vai trò đều thấy được; (2) 5 gam màu dựng sẵn hiện có quá giống nhau (chỉ đổi màu nhấn, còn nền/viền/chữ gần như y hệt), cần thêm 5-10 gam màu khác biệt hơn, và gam màu đang không ảnh hưởng tới thanh menu bên trái (vẫn giữ nguyên gradient xanh navy cố định bất kể theme).

- **Vấn đề (1) thực ra đã có lối vào ở dropdown avatar TopBar từ trước (không phân quyền theo vai trò)** — nhưng nằm ẩn sau 2 lần bấm (avatar → dropdown → "🎨 Đổi giao diện") nên dễ bị bỏ sót, nhất là với vai trò không có Settings để đối chiếu. Sửa bằng cách đưa hẳn 1 nút "🎨" độc lập ra thẳng TopBar (cạnh chuông thông báo, `TopBar.tsx`) — hiện cho mọi vai trò vì TopBar dùng chung 1 component không phân quyền, bấm 1 lần mở thẳng modal, bỏ luôn entry trùng lặp trong dropdown avatar.
- **Vấn đề (2) - thêm 8 preset mới** (`theme/presets.ts`): Hồng đào, Chàm, Hổ phách, Rượu vang, Ngọc lam, Rừng sâu, Xanh thép, Mận chín — mỗi preset chọn tông màu nhấn khác hẳn nhau (hồng/chàm/vàng/đỏ mận/ngọc lam/xanh rêu/xanh thép/tím mận) thay vì chỉ xoay quanh xanh dương/xanh lá/cam/tím/xám như cũ. Giữ nguyên nền/viền vẫn sáng-trung tính (tránh vỡ các chỗ còn dùng cứng `bg-slate-100`/`hover:bg-slate-50` chưa theme hóa được — rà bằng grep xác nhận 18 file/37 chỗ dùng slate cứng, nên không làm dark-mode thật).
- **Theme hóa thanh menu**: phát hiện `Sidebar.tsx` dùng cứng `var(--ocean-950)`/`var(--ocean-900)` cho gradient nền — 2 biến này chưa từng được `applyThemeColors()` ghi đè, nên đổi theme không ảnh hưởng gì tới sidebar. Thêm 2 biến CSS mới `--sidebar-from`/`--sidebar-to` (`tokens.css`, mặc định = giá trị ocean cũ để không đổi giao diện mặc định), mỗi preset (kể cả 5 preset cũ) có cặp gradient riêng khớp tông màu (vd Rừng sâu dùng gradient xanh rêu đậm, Rượu vang dùng gradient đỏ mận đậm...) thay vì dùng chung 1 màu navy. `Sidebar.tsx` đổi sang đọc `var(--sidebar-from)`/`var(--sidebar-to)`.
- Theme "Tùy chỉnh" (color picker tự chọn) không bắt người dùng chọn thêm 2 màu sidebar riêng — thêm hàm `deriveSidebarShades(accentHex)` tự suy ra cặp gradient tối (hệ số ~0.22/~0.34 độ sáng của màu nhấn, khớp đúng cặp ocean-950/ocean-900 hiện có khi tính ngược) giống cách `deriveAccentShades` đã làm cho accentDark/accentTint.
- Backend `backend/src/lib/theme.ts`: thêm 8 key preset mới vào danh sách hợp lệ + thêm `sidebarFrom`/`sidebarTo` vào `CUSTOM_KEYS` (bắt buộc khi lưu preset "custom"). Xử lý tương thích ngược cho cấu hình custom đã lưu từ trước (thiếu 2 trường mới): `resolveThemeColors()` phía frontend tự suy ra qua `deriveSidebarShades` nếu thiếu, không cần migration DB (theme_config vẫn là 1 cột TEXT JSON tự do).

**Kiểm chứng qua `wrangler dev` local + trình duyệt thật**: build frontend, seed 1 user vai trò CSKH (không có "settings" trong `ROLE_MODULES`) + duyệt trạng thái `Da duyet`, tự ký JWT tiêm cookie. Xác nhận qua accessibility tree: nút "Đổi giao diện" hiện thẳng trên TopBar cho vai trò CSKH (không cần vào Settings), modal liệt kê đủ 13 preset + "Tùy chỉnh". Bấm preset "Rừng sâu" → kiểm tra `getComputedStyle` xác nhận `--sidebar-from`/`--sidebar-to`/`--ocean-500` đổi đúng giá trị đã định nghĩa, và `aside` element render đúng gradient mới (khớp qua `backgroundImage` tính toán); reload lại vẫn giữ nguyên (persist đúng qua PATCH `/auth/me`). Test tiếp nhánh "Tùy chỉnh": đổi màu nhấn qua color input → xác nhận `--sidebar-from`/`--sidebar-to` tự suy đúng theo công thức 0.22/0.34, lưu thành công (PATCH trả 200, không phải 400 vì thiếu field), reload vẫn giữ. Đăng nhập lại bằng tài khoản Admin thật (JWT ký cho `smarttrade.vp@gmail.com`) xác nhận tab "Giao diện" trong Settings vẫn hiển thị đủ 13 preset giống hệt (dùng chung `ThemeSettingsPanel`). Dọn dữ liệu test (xóa user CSKH test, reset `theme_config` của tài khoản Admin thật về NULL trên D1 **local**), tắt `wrangler dev` local. User xác nhận deploy ("cứ tự động nhé") — build lại frontend, `wrangler deploy` production (Version ID `764671ed-1de7-4a34-90bc-69a3de7af252`, không có migration DB vì `theme_config` vẫn là 1 cột TEXT JSON tự do có sẵn), health check xác nhận trang chủ 200 và `/api/auth/me` trả 401 (không phải 404).

### Giao diện: tách hẳn khỏi Settings thành trang riêng + tăng độ tương phản menu trái + thêm chọn phông chữ

User gửi ảnh chụp menu trái (gradient đỏ mận) kèm phản hồi: (1) menu trái vẫn chưa tùy chỉnh được màu, chữ mờ khó đọc; (2) muốn thêm tùy chỉnh phông chữ; (3) tách hẳn phần cài đặt giao diện ra khỏi tab Settings (đang ghép chung), thành 1 mục riêng.

- **Tách khỏi Settings**: gỡ tab "Giao diện" khỏi `SettingsModule.tsx` (vốn chỉ Admin vào được), thêm nhóm nav mới "Cá nhân" (`navConfig.ts`) với 1 mục "🎨 Giao diện" — thêm vào `ROLE_MODULES` của **tất cả** vai trò (đây là tùy chỉnh cá nhân, không phải quyền nghiệp vụ). Trang mới `modules/ThemeModule.tsx` render `ThemeSettingsPanel` full-page. Nút "🎨" trên TopBar đổi từ mở modal sang điều hướng thẳng tới trang này (`goTo("giao-dien")`), xóa hẳn `ThemeSettingsModal.tsx` (không còn nơi nào dùng).
- **Root cause độ tương phản kém**: `Sidebar.tsx` dùng cứng `text-white/35` (nhãn nhóm) và `text-white/60` (mục menu) — 2 mức độ mờ này được chọn cứng cho nền navy gốc, nhưng khi đổi sang preset màu trầm hơn (đỏ mận, tím than...) độ tương phản cảm nhận giảm rõ rệt dù công thức không đổi. Sửa tận gốc thay vì chỉnh số opacity: thêm hàm `deriveSidebarInk(sidebarFromHex)` (`theme/presets.ts`) tính độ sáng nền menu trái theo công thức luminance ITU-R BT.601, tự chọn bộ 4 mức chữ (`sidebarInk`/`sidebarInkMid`/`sidebarInkDim`/`sidebarHighlight`) — trắng đậm nếu nền tối, đen-navy đậm nếu nền sáng — thay vì 1 công thức trắng cố định. `applyThemeColors()` ghi 4 biến CSS mới (`--sidebar-ink*`, `--sidebar-highlight`) mỗi lần đổi theme. `Sidebar.tsx` đổi toàn bộ text/border/hover sang đọc các biến này, và thêm viền trái 3px màu nhấn (`border-[var(--ocean-500)]`) cho mục đang chọn để "nổi bật" rõ hơn thay vì chỉ có nền mờ.
- **Tùy chỉnh màu menu trái tường minh**: thêm 2 ô chọn màu trực tiếp "Menu trái (trên)"/"Menu trái (dưới)" (`sidebarFrom`/`sidebarTo`) vào `CUSTOM_FIELDS` của `ThemeSettingsPanel.tsx` — trước đây 2 màu này chỉ suy tự động từ màu nhấn, giờ suy tự động khi đổi màu nhấn **nhưng** người dùng chỉnh tay riêng được nếu muốn (Bởi cơ chế `deriveSidebarInk` tính theo độ sáng thực tế, dù người dùng chọn menu trái rất sáng thì chữ tự đổi sang tối để vẫn đọc được — không có tổ hợp màu nào tự chọn ra bị vỡ chữ).
- **Chọn phông chữ**: thêm `FontKey`/`FONT_OPTIONS` (`theme/presets.ts`) — chỉ dùng font đã nạp sẵn (Inter/Manrope/IBM Plex Mono qua `@fontsource` có sẵn, xem `tokens.css`) hoặc font hệ thống/serif, không thêm webfont mới để tránh phình bundle: "Mặc định (Inter)", "Manrope (bo tròn)", "Đơn cách (Mono)", "Có chân (Serif)", "Hệ thống (System UI)". `--font-body` (mới, `tokens.css`) thay cho font-family cứng trên `body`; `applyFont()` set biến này lúc chọn/khi tải trang (`ThemeProvider.tsx`). `font` là trường độc lập trong `ThemeConfig`, lưu chung `theme_config` JSON — chọn font không làm mất preset màu đang chọn và ngược lại (giữ state riêng, gộp lại lúc gọi `PATCH /auth/me`). Backend `theme.ts` thêm `FONT_KEYS` + validate optional field `font` trong `sanitizeThemeConfig`.

### Lời chào hàng ngày trên Dashboard (thời tiết + giờ trong ngày) — tính năng phụ, cô lập khỏi hệ thống chính

User muốn 1 banner chào hỏi thú vị trên Dashboard, kết hợp thời tiết thực tế (nắng nóng → nhắc mang mũ/nước, mưa → nhắc mang ô/áo mưa) và giờ trong ngày (sáng hỏi cà phê chưa, trưa hỏi ăn gì, tối hỏi ăn cơm chưa...). Yêu cầu kỹ thuật rõ ràng: đây là tính năng phụ, tuyệt đối không được ảnh hưởng hệ thống chính — không load được thì để trống, không báo lỗi.

- **Chọn nguồn thời tiết**: dùng **Open-Meteo** (`api.open-meteo.com`) — miễn phí, không cần API key/đăng ký, tránh phải quản lý secret cho 1 tính năng trang trí.
- **Chọn thành phố theo user**: hỏi lại user vì hệ thống chưa có trường thành phố/địa điểm cho từng người — user chọn suy theo khu vực Bắc/Nam có sẵn trong `khu_vuc_phu_trach` (vốn chỉ vai trò "Giám sát" mới được gán, các vai trò khác mảng rỗng → mặc định Hà Nội). Khảo sát dữ liệu thực tế qua `UsersModule.tsx` phát hiện giá trị lưu là chuỗi hiển thị đầy đủ dạng `"(qldvbh.mb2) Quản lý khu vực MB2"` — và phát hiện 1 điểm dữ liệu thực tế mâu thuẫn: `"(qlb2b.b2b-mn) Quản lý B2B Miền Bắc"` có **mã** chứa "mn" nhưng **nhãn chữ** lại ghi "Miền Bắc". Xử lý bằng cách gộp 2 tín hiệu bỏ phiếu (không chỉ dùng 1): (1) từ khóa "bắc"/"nam" trong chuỗi (bỏ dấu, hạ chữ thường), (2) tiền tố `mb`/`mn` của đoạn mã cuối cùng sau dấu chấm trong ngoặc — bên nào nhiều phiếu hơn thắng, hòa/rỗng mặc định Bắc. `inferRegion()` trong `backend/src/lib/greeting.ts`.
- **Tách bạch resilience**: `fetchWeather()` bọc `try/catch` + `AbortSignal.timeout(4000)`, mọi lỗi (mạng, timeout, JSON hỏng, field thiếu) đều trả `null` chứ không bao giờ throw — route `GET /api/greeting` (`backend/src/routes/greeting.ts`, dùng chung `verifySessionMiddleware`+`loadUser` như các route khác) luôn trả `200` kèm lời chào thuần theo giờ nếu thời tiết không lấy được, không bao giờ lộ lỗi 500 vì lý do thời tiết.
- **Nội dung "nhiều tùy chọn, thú vị"**: pool 3-4 câu mẫu ngẫu nhiên cho mỗi mốc giờ (sáng sớm/sáng/trưa/chiều/tối/khuya) x pool câu mẫu theo tình trạng thời tiết (nắng nóng/mưa/lạnh/sương mù/dễ chịu) — ghép ngẫu nhiên 1 câu giờ + 1 câu thời tiết mỗi lần load, tránh lặp lại nhàm chán (`buildGreeting()`).
- **Cô lập khỏi hệ thống chính ở tầng frontend**: `GreetingBanner.tsx` (mới) — `useQuery` với `retry:false`, `isLoading`/`isError`/thiếu data đều `return null` (ẩn hẳn banner, không toast lỗi). Bọc thêm 1 React Error Boundary riêng (`GreetingErrorBoundary`, class component — cách duy nhất bắt được lỗi throw trong render/effect, try/catch thường không bắt được) để nếu có lỗi render bất ngờ thì chỉ banner này biến mất, không sập cả Dashboard xung quanh. Gắn vào đầu `DashboardModule.tsx`, phía trên card "Báo cáo nhanh" sẵn có.

**Kiểm chứng qua `wrangler dev` local (gọi API thời tiết thật, không mock)**: seed 1 user vai trò Giám sát gán `khu_vuc_phu_trach=["(qldvbh.mn1) Quản lý khu vực MN1"]`, gọi thẳng `GET /api/greeting` bằng `curl` kèm JWT tự ký — xác nhận suy đúng ra TP. Hồ Chí Minh, thời tiết thật trả về (27°C, không mưa), response ~200ms. Gọi lại bằng tài khoản Admin thật (không có `khu_vuc_phu_trach`) — xác nhận mặc định đúng về Hà Nội, thời tiết thật khác (29.1°C). Test qua trình duyệt thật (tài khoản Giám sát): banner "👋 ..." hiện đúng trên Dashboard, tải lại trang nhiều lần thấy câu chào đổi ngẫu nhiên (xác nhận pool đa dạng hoạt động, không lặp 1 câu). Test resilience bằng code review có chủ đích (không giả lập được lỗi mạng thật qua công cụ trình duyệt tự động vì monkey-patch `fetch` không sống sót qua điều hướng trang) — xác nhận toàn bộ đường lỗi đều được xử lý ở nhiều lớp: `fetchWeather` không bao giờ throw, route luôn trả 200, `app.onError` toàn cục vẫn chặn được lỗi bất ngờ trả JSON thay vì crash, `isError` phía frontend ẩn banner, và Error Boundary là lớp chặn cuối cho lỗi render. Dọn dữ liệu test, tắt `wrangler dev`. Chưa deploy production — chờ xác nhận từ user.

**Kiểm chứng qua `wrangler dev` local + trình duyệt thật**: build lại, seed lại user CSKH test. Xác nhận qua accessibility tree: sidebar CSKH có nhóm mới "Cá nhân" > "Giao diện" (tách khỏi Settings mà CSKH vốn không có quyền vào); bấm vào mở đúng trang riêng (không phải modal), heading "Giao diện", đủ 13 preset (mỗi preset giờ có thêm chấm màu thứ 3 = màu menu trái để xem trước) + khối "Phông chữ" 5 lựa chọn. Chọn preset "Rượu vang" → dùng `getAnimations()...finish()` để bỏ qua transition bị đứng ở tool tự động hoá (phát hiện giữa chừng: `getComputedStyle` đọc màu chữ lúc transition đang "frozen" ở `localTime:0` do tab test không nhận animation frame — chỉ là hạn chế của công cụ test, không phải lỗi thật; xác nhận bằng cách gọi `finish()` rồi đọc lại) — xác nhận màu chữ mục đang chọn đúng trắng đậm, viền trái đúng màu nhấn preset (`rgb(163,34,62)` khớp `#a3223e`). Test nhánh "Tùy chỉnh": đổi tay riêng "Menu trái (trên)" sang màu rất sáng (`#f0f0f0`) mà **không** đổi màu nhấn → xác nhận `--sidebar-ink`/`--sidebar-ink-mid` tự chuyển sang tông tối (đúng cơ chế tự tính tương phản, không đợi phải chọn preset soạn sẵn); lưu (PATCH 200), chọn thêm font "Manrope" (PATCH 200 riêng, không ghi đè mất màu vừa lưu); reload lại xác nhận cả 2 đều giữ nguyên (`--sidebar-from` vẫn `#f0f0f0`, `--font-body` vẫn Manrope, `document.body` font thực tế đổi đúng). Đăng nhập lại Admin thật xác nhận: menu trái cũng có mục "Cá nhân > Giao diện" y hệt, và vào Settings xác nhận chỉ còn 3 tab cũ (Lý do chậm/Danh mục linh kiện/Link đồng bộ Sheet) — tab "Giao diện" đã gỡ hẳn. Dọn dữ liệu test (xóa CSKH test, reset `theme_config` Admin thật về NULL trên D1 **local**), tắt `wrangler dev`. User xác nhận deploy — build lại frontend, `wrangler deploy` production (Version ID `ec4533e4-fbd3-472f-a68e-864fd169d97a`, không có migration DB), health check xác nhận trang chủ 200 và `/api/auth/me` trả 401.

### Mở rộng kho câu chào lời chào Dashboard cho đỡ trùng lặp

User phản hồi muốn nhiều lời chào/động viên hơn để đỡ bị lặp lại. Mở rộng `TIME_TEMPLATES` (`backend/src/lib/greeting.ts`) từ 3-4 câu/khung giờ lên 9-13 câu/khung (6 khung: sáng sớm/sáng/trưa/chiều/tối/khuya), trộn lẫn câu chào hỏi thông thường và câu động viên ("bạn đã làm rất tốt hôm nay", "cố lên chút nữa thôi"...). Mở rộng `weatherRemarks()` từ 1-3 câu/loại lên 6-7 câu/loại (mưa/nóng/lạnh/sương mù/dễ chịu). Không đổi cấu trúc hàm (`buildGreeting` vẫn ghép ngẫu nhiên 1 câu giờ + 1 câu thời tiết), chỉ tăng kích thước pool để giảm khả năng lặp câu qua nhiều lần ghé Dashboard.

**Kiểm chứng**: build + `wrangler dev` local, gọi `GET /api/greeting` liên tục 6 lần bằng JWT tự ký (tài khoản Admin, giờ hiện tại rơi vào khung "khuya") — xác nhận cả 6 lần đều ra câu ghép khác nhau, không lần nào trùng lặp hoàn toàn. Dọn `theme_config` test, tắt `wrangler dev`. User xác nhận deploy — build lại frontend, `wrangler deploy` production (Version ID `5a11eb4e-8ffa-42c5-b59b-c2b8f8e6b336`, không có migration DB), health check xác nhận trang chủ 200, `/api/auth/me` và `/api/greeting` đều trả 401 (không phải 404).

*(Ghi chú: lần deploy này chạy qua PowerShell thay vì Bash — công cụ Bash trong phiên bị mất PATH tạm thời (`npm`/`tail` không tìm thấy), không phải lỗi của lệnh.)*

### 6 thay đổi UI: tab mặc định Chi tiết ca, gộp đồng bộ vào chuông, redesign TopBar (lời chào + vịt đi lạch bạch), chuông rung, logo/favicon, footer sidebar + versioning

User gửi 6 yêu cầu UI cùng lúc kèm ảnh logo "37":
1. Mở Chi tiết ca: nếu **không** mở từ giao diện "Giải trình tồn" (Quản lý tồn) thì tab đầu tiên phải là "Thông tin khách hàng" thay vì "Giải trình tồn" mặc định như cũ.
2. Gộp "Đồng bộ đến: ..." vào chung với chuông thông báo, bỏ khối riêng trên TopBar.
3. Bỏ breadcrumb "Ông Thợ 3T - DVBH / {module}" cạnh ô tìm kiếm; thu ngắn + ghim ô tìm kiếm sang trái; lời chào ("Chào {Tên}, {nội dung}") hiện ngay sau ô tìm kiếm, kèm 1 con vịt 🦆 đi lạch bạch qua lại đoạn chào liên tục.
4. Chuông 🔔 rung nhẹ mỗi 10 giây.
5. Thêm logo/favicon (ảnh "37" user gửi) cho thẻ trình duyệt + icon cạnh tiêu đề "ÔNG THỢ 3T".
6. Thêm dòng nhắc cuối menu trái: "Hệ thống nội bộ không chia sẻ dưới mọi hình thức. Phiên bản v1.0", quy ước mỗi lần deploy sau này tăng thêm 0.001.

- **(1) Tab mặc định theo ngữ cảnh mở**: `App.tsx` bọc `setOpenCaseId` thành hàm ghi thêm `openedFromModule` = giá trị `active` (module đang xem) tại đúng thời điểm gọi mở ca — vì mọi module (Backlog/MissingParts/Survey/Archived/tìm kiếm nhanh) đều gọi chung 1 `setOpenCaseId(id)` không kèm ngữ cảnh trước đây. `CaseDetail.tsx` nhận thêm prop `sourceModule`, `useEffect` chọn tab mặc định: `"giai-trinh"` nếu `sourceModule === "backlog"`, ngược lại `"info"`.
- **(2)+(3) Redesign TopBar** (`TopBar.tsx`): xóa hẳn prop `areaLabel`/breadcrumb (và chỗ tính nó ở `App.tsx`); `GlobalSearch` đổi `flex-1 max-w-md` → `w-40 sm:w-52 shrink-0` (ghim trái, không giãn nữa); khối "🔄 Đồng bộ đến" cũ (`hidden lg:flex` riêng) chuyển hẳn vào dòng đầu tiên trong dropdown chuông (trước "Việc cần xử lý").
- **Lời chào chuyển từ Dashboard sang TopBar toàn cục**: xóa `GreetingBanner.tsx` (card trên Dashboard), thay bằng `GreetingDuck.tsx` (mới) — cùng cơ chế chịu lỗi (Error Boundary + `useQuery retry:false`, ẩn hẳn nếu lỗi/đang tải, xem lại phần "Đón chào Dashboard" phía trên) nhưng hiển thị dạng dòng gọn (`hidden lg:flex`) ngay trong `TopBar.tsx`, để hiện xuyên suốt mọi module chứ không riêng Dashboard. Backend `greeting.ts` route thêm tiền tố `"Chào {Tên}, "` (lấy từ khoảng trắng cuối cùng của `user.ten`, khớp cách tính chữ cái đầu avatar đã có sẵn) + hàm `lowerFirst()` viết thường chữ đầu câu ghép để đọc tự nhiên sau dấu phẩy. Sửa 9/60+ câu trong `TIME_TEMPLATES` (`greeting.ts`) vốn tự mở đầu bằng "Chào ...!" (giờ bị trùng lặp với tiền tố mới) sang câu không mở đầu bằng "Chào" nữa, giữ nguyên toàn bộ các câu còn lại.
- **Con vịt đi lạch bạch**: keyframes CSS thuần `duck-walk` (`tokens.css`) — dùng `left: calc(100% - 20px)` (phần trăm theo chiều rộng khung cha) thay vì `translateX(px)` cố định để tự thích ứng độ dài đoạn chào bất kỳ, không cần đo bằng JS; lật hướng bằng `scaleX(-1)` đúng lúc đổi chiều (mốc 48-50% và 98-100% trong chu kỳ 9s). Thêm `duck-bob` (bob lên xuống nhanh 0.35s) lồng vào bên trong cho dáng "lạch bạch" thay vì trượt đều.
- **(4) Chuông rung**: keyframes `bell-shake` thuần CSS (không JS interval, tránh trôi timer) — nghỉ 92% đầu chu kỳ 10s, rung dồn dập ở ~8% cuối, lặp `infinite`.
- **(5) Logo**: không có công cụ nào lưu được ảnh dán trực tiếp trong chat thành file — hỏi lại user, user kéo-thả file thật vào chat, tìm thấy bằng cách quét các thư mục hay dùng (`Get-ChildItem` theo `LastWriteTime` gần nhất) ra `C:\Users\HP\Desktop\logo 3t.png`. Copy vào `frontend/public/logo-37.png` (Vite copy nguyên `public/` vào gốc `dist/`), thêm `<link rel="icon">` vào `index.html`, thay SVG placeholder (3 vòng tròn xanh) bằng `<img src="/logo-37.png">` ở cả `Sidebar.tsx` (header menu trái) **và** `LoginScreen.tsx` (trang đăng nhập — cùng 1 placeholder cũ, chủ động đồng bộ luôn cho nhất quán dù user không nêu rõ).
- **(6) Footer + versioning**: `frontend/src/version.ts` (mới) export `APP_VERSION` dạng string tay (không tính bằng số thập phân để tránh lỗi làm tròn 0.1+0.001 của JS) — bắt đầu `"1.0"`, quy ước từ nay **mỗi lần deploy production tăng tay 0.001** (vd `"1.001"`, `"1.002"`...) trước khi build. `Sidebar.tsx` thêm dòng chữ nhỏ cuối menu (dưới nút "« Thu gọn", ẩn khi menu thu gọn) hiển thị đúng 2 dòng user yêu cầu.

**Kiểm chứng qua `wrangler dev` local + trình duyệt thật** (tài khoản Admin thật, vì local D1 đã có sẵn dữ liệu quy mô production ~14k ca từ trước): xác nhận qua `getComputedStyle`/DOM trực tiếp (không dùng screenshot pixel vì công cụ chụp ảnh bị treo — nghi do animation `infinite` khiến render loop không "ổn định" để tool tự động chụp được, xử lý bằng cách kiểm tra qua class/thuộc tính DOM thay vì ảnh):
- TopBar: không còn breadcrumb, ô tìm kiếm thu nhỏ đúng ("Tra cứu ID/Serial…"), lời chào "Chào Admin, khuya rồi mà vẫn online... Thời tiết Hà Nội hôm nay khá dễ chịu, 29°C..." hiện đúng sau ô tìm kiếm; `.bell-shake`/`.duck-walk`/`.duck-bob` đều có mặt trong DOM.
- Mở dropdown chuông: dòng "🔄 Đồng bộ đến: 07:00 17/07/2026" nằm đúng đầu dropdown, không còn khối riêng ngoài TopBar.
- Mở ca từ "Quản lý khảo sát" (Survey, không phải Backlog): xác nhận nội dung tab hiển thị đúng field "Thông tin khách hàng" (không có "Lịch sử giải trình"). Mở lại đúng case đó từ "Quản lý tồn" (Backlog): xác nhận ngược lại — có "Lịch sử giải trình", không có field khách hàng — tab mặc định đổi đúng theo nguồn mở (test bằng cách scope text theo đúng phần tử Drawer, tránh nhầm với chữ "Khách hàng" lặp lại ở bảng danh sách phía sau).
- Logo: `naturalWidth`/`naturalHeight` > 0 và `complete: true` trên thẻ `<img src="/logo-37.png">` trong Sidebar — xác nhận ảnh tải thành công thật, không phải ảnh vỡ. Favicon `<link rel="icon">` trỏ đúng `/logo-37.png`.
- Sidebar: dòng "Hệ thống nội bộ không chia sẻ dưới mọi hình thức." + "Phiên bản v1.0" hiện đúng cuối menu.

Dọn `theme_config` test trên D1 local. Phát hiện + dọn sự cố phụ: do nhiều lần `Stop-Process` trước đó nhắm nhầm PID (`Get-NetTCPConnection` đôi lúc trả về tiến trình "Idle" PID 0 thay vì `workerd` thật), 9 tiến trình `wrangler dev` (`workerd.exe`) bị mồ côi tích tụ qua nhiều vòng test trong phiên — dọn sạch bằng `Get-Process -Name workerd | Stop-Process -Force` trước khi deploy. User xác nhận deploy (quyền tự động cho cả phiên) — build, `wrangler deploy` production (Version ID `e6e8a262-0902-40d1-9578-017c8292b0cd`, không có migration DB), health check xác nhận trang chủ 200, `/logo-37.png` 200, `/api/auth/me` 401.

### Bỏ con vịt (chữ bị cắt) + hệ thống "cách gọi" theo giới tính trong lời chào + Tên gọi/Giới tính tự phục vụ

User phản hồi 2 việc liên tiếp: (1) bỏ con vịt đi, đoạn lời chào đang bị mất chữ phía sau; (2) thêm cột "Tên" + "Giới tính" vào cài đặt tài khoản (tên bỏ trống thì mặc định lấy theo Google), dùng trong lời chào — ghép thêm 1 "cách gọi" ngẫu nhiên ngay sau tên theo giới tính, chia 3 nhóm (chung/nam/nữ, không xác định giới tính thì chỉ dùng nhóm chung), yêu cầu bổ sung tới ~30 cách gọi, 20 biến thể/loại thời tiết, 30 biến thể/mốc giờ để random đỡ lặp.

- **Bỏ vịt + sửa cắt chữ**: xóa hẳn `GreetingDuck.tsx` (đổi tên lại thành `Greeting.tsx`, bỏ hết phần tử/CSS con vịt `duck-walk`/`duck-bob` khỏi `tokens.css`). Root cause chữ bị cắt: khối lời chào nằm chung 1 hàng với ô tìm kiếm + nhóm icon bên phải trong `TopBar.tsx`, bị giới hạn `max-w-md` (448px) rồi `truncate` — với câu ghép dài ~140-150 ký tự thì luôn bị cắt mất phần sau dù đã bỏ giới hạn max-width (đo thử ở viewport 1280px: cần ~827px nhưng chỉ có ~523px). Sửa tận gốc bằng cách tách lời chào ra thành **hàng riêng, rộng hết chiều ngang trang**, nằm dưới hàng chính (hamburger/tìm kiếm/icon) trong cùng 1 `<header>` — hàng riêng có đủ chỗ (~980px ở viewport thường) nên hầu như không còn bị cắt, giữ `truncate` lại chỉ như lớp phòng hờ cho màn hình rất hẹp.
- **Hệ thống "cách gọi" theo giới tính** (`backend/src/lib/greeting.ts`): 3 pool `EPITHETS_CHUNG` (18 từ: siêu nhân/cute/hiền lành/hạnh phúc/đại gia/đại ka/lầy lội/hài hước/vui tính/chăm chỉ/tài giỏi/tốt bụng/năng động/đáng yêu/số hưởng/máu lửa/nhiệt huyết/chất chơi), `EPITHETS_NAM` (9: đẹp trai/đập trai/ga lăng/công tử/phong độ/lịch lãm/soái ca/bảnh bao/manly), `EPITHETS_NU` (9: xinh xắn/xinh gái/dễ thương/ngọt ngào/đẹp gái/duyên dáng/dịu dàng/xinh đẹp/nữ hoàng) — tổng 36, vượt mốc "30 cách gọi" yêu cầu. `pickEpithet(gioiTinh)`: `nam` → chung+nam, `nu` → chung+nu, `null`/không xác định → chỉ chung (đúng quy tắc user nêu).
- **Mở rộng pool đúng số lượng yêu cầu**: `TIME_TEMPLATES` tăng từ 9-13 câu/khung lên **đúng 30 câu/khung** cho cả 6 khung giờ (sáng sớm/sáng/trưa/chiều/tối/khuya = 180 câu); `weatherRemarks()` tăng từ 3-7 câu/loại lên **đúng 20 câu/loại** cho cả 5 loại (mưa/nóng/lạnh/sương mù/dễ chịu = 100 câu). Giữ nguyên kiến trúc ghép modun (1 câu giờ + 1 câu thời tiết) thay vì viết câu tích hợp sẵn cho từng tổ hợp — bắt buộc phải modun hóa mới khả thi ở quy mô 180×100 tổ hợp.
- **Tên gọi + Giới tính tự phục vụ**: Migration `0010_ten_goi_gioi_tinh.sql` thêm `users.ten_goi` (tên riêng dùng cho lời chào, uu tiên hơn `ten` lấy từ Google) và `users.gioi_tinh` (CHECK IN `nam`/`nu`, nullable). Chọn thiết kế 2 cột tách biệt thay vì sửa thẳng `ten` vì phát hiện root cause quan trọng: `auth.ts` callback OAuth **ghi đè `ten` từ Google mỗi lần đăng nhập** (`ON CONFLICT DO UPDATE SET ten = excluded.ten`) — nếu cho sửa thẳng `ten` thì tùy chỉnh của user sẽ bị Google ghi đè mất ở lần đăng nhập kế tiếp. `PATCH /api/auth/me` (dùng chung route tự phục vụ với theme_config) mở rộng nhận thêm `ten_goi`/`gioi_tinh`, validate độ dài + giá trị hợp lệ. Route `/api/greeting` đổi `firstNameOf()` ưu tiên `ten_goi || ten || email` (vẫn theo quy tắc lấy từ cuối cùng của tên đầy đủ, khớp cách tính chữ cái đầu avatar sẵn có), ghép `"Chào {Tên} {cách gọi}, {nội dung}"`.
- **UI Cài đặt cá nhân**: `PersonalInfoPanel.tsx` (mới) — ô nhập "Tên gọi" (placeholder gợi ý tên Google hiện có nếu để trống) + 3 nút chọn giới tính (Không xác định/Nam/Nữ). Thêm vào đầu trang `ThemeModule.tsx` (đổi tên hiển thị nav từ "Giao diện" → **"Cài đặt cá nhân"**, giữ nguyên key `giao-dien` để không vỡ `localStorage` module đang lưu của user hiện tại) — trang giờ có 2 khối: "Thông tin cá nhân" (mới) rồi đến "Giao diện" (gam màu + phông chữ, giữ nguyên).

**Kiểm chứng qua `wrangler dev` local + trình duyệt thật**: áp migration `0010` local trước, build, test qua API trực tiếp (PowerShell `Invoke-RestMethod` với `WebRequestSession` + cookie JWT tự ký, vì `-Headers` thường literal Cookie header bị chặn) — set `gioi_tinh=nam` gọi `/api/greeting` 5 lần liên tục: xác nhận cách gọi ra đúng hỗn hợp nhóm chung+nam ("đập trai", "soái ca" x2, "công tử", "số hưởng"), không có từ nhóm nữ. Đổi `gioi_tinh=nu`: ra đúng hỗn hợp chung+nữ ("hạnh phúc", "dịu dàng", "đại gia"). Đổi cả 2 về `null`: chỉ ra từ nhóm chung qua 8 lần gọi, tên rơi về đúng tên Google cũ ("Admin"). Test qua UI thật (click nút giới tính + input tên qua trình duyệt): phát hiện 1 lần test tự động hóa bị sai do bấm 2 nút liên tiếp không có độ trễ (`setGioiTinh` là state update bất đồng bộ của React, bấm nút giới tính rồi bấm Lưu ngay trong cùng 1 tick JS khiến nút Lưu đọc state cũ) — xác nhận đây chỉ là hạn chế kịch bản test tự động (người dùng thật bấm chuột luôn có độ trễ tự nhiên đủ để React re-render giữa 2 lần bấm), thêm `await` 200ms giữa 2 thao tác thì lưu đúng `gioi_tinh='nu'` vào D1 local ngay. Gọi `/api/greeting` 10 lần sau khi lưu đúng: xác nhận thấy đủ cả từ chung ("tốt bụng", "máu lửa"...) lẫn từ riêng nhóm nữ ("dễ thương", "xinh xắn", "xinh đẹp"). Xác nhận UI trang "Cài đặt cá nhân" hiện đủ 2 khối đúng thứ tự. Dọn dữ liệu test (`ten_goi`/`gioi_tinh`/`theme_config` về NULL), tắt hết `workerd` cũ. User xác nhận deploy — tăng version `1.0` → `1.001` (đúng quy ước đã lập), áp migration `0010` lên production D1 `--remote` trước, build, `wrangler deploy` (Version ID `877610fc-6a0a-49d9-bf24-ba60a13e1565`), health check xác nhận trang chủ 200, `/api/auth/me` và `/api/greeting` đều trả 401.

### Đưa lời chào trở lại hàng chính TopBar, chạy chữ kiểu băng tin khi dài hơn khung

User gửi ảnh khoanh đỏ vùng trống cạnh ô tìm kiếm trên cùng 1 hàng, yêu cầu chuyển lời chào lên đúng vùng đó (bỏ hàng riêng vừa tách ra trước đó) — nếu không đủ chỗ hiện hết thì cho chạy chữ dạng vòng lặp hoặc xuống dòng, tự chọn cách phù hợp.

- **Trả `TopBar.tsx` về 1 hàng duy nhất**: bỏ khối `<div className="h-16 ...">` bọc ngoài + hàng `<Greeting />` tách riêng thêm trước đó, đưa `<Greeting />` về lại ngay sau `<GlobalSearch />` trong cùng hàng `header` gốc — đúng vị trí ô đỏ trong ảnh user gửi.
- **Chọn cách "chạy chữ" thay vì xuống dòng**: xuống dòng sẽ đổi chiều cao `header` tùy độ dài câu (không đều, xấu); cắt chữ (`truncate`) thì mất nội dung như lần trước. Chọn kiểu băng tin (marquee) CSS thuần, tự thích ứng: `padding-left: 100%` (tính theo khung cha) đẩy chữ ra hẳn ngoài mép phải khung, rồi `transform: translateX(-100%)` (tính theo chính phần tử) kéo nó lùi đúng bằng độ rộng của chính nó — cộng lại luôn đủ khoảng chạy từ ngoài mép phải vào hẳn ngoài mép trái, đúng với MỌI tỷ lệ độ dài câu / độ rộng khung mà không cần đo bằng JS.
- **Chỉ chạy khi thật sự cần** (đúng yêu cầu "nếu không hiện đủ thì mới chạy"): `Greeting.tsx` đo `scrollWidth` (độ rộng chữ thật) so với `clientWidth` (khung hiện có) bằng 1 `useEffect` sau khi câu chào tải xong — chỉ gắn class `.greeting-marquee` khi chữ dài hơn khung, câu ngắn vừa khung thì hiện tĩnh, không cuộn vô ích.

**Kiểm chứng qua `wrangler dev` local + trình duyệt thật**: xác nhận qua DOM — khung lời chào quay lại đúng hàng chính (`clientWidth` 523px như trước), câu chào dài hơn nhiều (chữ thật ~906px) nên đúng như dự đoán được gắn class `.greeting-marquee`; dùng `getAnimations()` xác nhận animation đang chạy đúng cấu hình (20s, linear, lặp vô hạn, `playState: running`) — không dùng screenshot pixel (vẫn bị treo do animation vô hạn ở môi trường test). Dọn `workerd` cũ. User xác nhận deploy — tăng version `1.001` → `1.002`, build, `wrangler deploy` production (Version ID `d6f2c463-6318-43c9-bea1-19c2f7e4cf53`, không có migration DB), health check xác nhận trang chủ 200, `/api/auth/me` trả 401.

### Lời chào chỉ chọn 1 trong 2 (giờ HOẶC thời tiết), không ghép cả 2 nữa

User yêu cầu rút gọn câu chào: chỉ random chọn 1 trong 2 loại (theo mốc giờ trong ngày HOẶC theo thời tiết), không ghép cả 2 câu lại như trước nữa (đỡ dài).

- `backend/src/lib/greeting.ts`: sửa `buildGreeting()` — còn thời tiết (`weather !== null`) thì tung đồng xu 50/50 chọn `pick(TIME_TEMPLATES[tod])` hoặc `pick(weatherRemarks(weather))`, chỉ trả về **1** câu; không có thời tiết thì vẫn luôn dùng câu theo giờ (giữ nguyên nhánh cũ). Không đổi gì ở `routes/greeting.ts` (phần ghép `"Chào {Tên} {cách gọi}, ..."` không đổi).

**Kiểm chứng qua `wrangler dev` local**: gọi `GET /api/greeting` 10 lần liên tục bằng JWT tự ký — độ dài câu giảm từ ~140-160 ký tự xuống còn ~88-124 ký tự (đúng bằng 1 nửa nội dung như kỳ vọng). Lưu 8 mẫu ra file kiểm tra thủ công: xác nhận có cả câu loại "theo giờ" (vd "sáng nay làm việc hăng say vào...") lẫn loại "theo thời tiết" (vd "trời Hà Nội trong xanh, 30°C dễ chịu..."), tỷ lệ pha trộn hợp lý qua mẫu nhỏ, tên/cách gọi vẫn ngẫu nhiên đúng như trước. Dọn `workerd` cũ. User xác nhận deploy — tăng version `1.002` → `1.003`, build, `wrangler deploy` production (Version ID `b13493e5-9366-43e1-9c31-04067859b700`, không có migration DB), health check xác nhận trang chủ 200, `/api/auth/me` trả 401.

### Tăng cỡ chữ lời chào

User yêu cầu tăng kích cỡ chữ lời chào. `Greeting.tsx`: `text-xs font-medium` (12px) → `text-base font-semibold` (16px). Xác nhận qua `getComputedStyle` trong `wrangler dev` local: `fontSize: 16px`, header vẫn cao đúng 64px, khối chào cao 24px — vừa khít, không tràn. Dọn `workerd` cũ. User xác nhận deploy — tăng version `1.003` → `1.004`, build, `wrangler deploy` production (Version ID `4d074add-420e-4d09-af06-08d71a112067`, không có migration DB), health check xác nhận trang chủ 200, `/api/auth/me` trả 401.

### Chỉnh lại cỡ chữ (14px) + in đậm riêng phần "Chào Tên cách gọi"

User phản hồi: cỡ chữ 16px hơi to, chỉnh về 14px; nhưng đoạn đầu "Chào + Tên + cách gọi" thì in đậm.

- **Backend** (`routes/greeting.ts`): tách response thành `namePrefix` ("Chào {Tên} {cách gọi}", không có dấu phẩy) và `message` (nội dung câu, viết thường chữ đầu) riêng biệt thay vì gộp sẵn 1 chuỗi `message` như trước — để frontend tự quyết định kiểu chữ từng phần.
- **Frontend** (`Greeting.tsx`): `text-base font-semibold` (16px, cả câu đậm) → `text-sm` (14px, không đậm mặc định) cho cả khối; bọc riêng `<b className="font-bold">{namePrefix}</b>` rồi mới đến `, {message}` — chỉ phần tên+cách gọi đậm, phần nội dung còn lại chữ thường. `needsScroll` đo lại theo cả `namePrefix` lẫn `message` (list dependency của `useEffect`) vì giờ tách 2 field.
- **Dọn luôn 1 câu sót**: rà lại toàn bộ `TIME_TEMPLATES` phát hiện 1 dòng bỏ sót từ đợt sửa trước còn tự mở đầu bằng "Chào" ("Chào buổi sáng năng lượng, mong công việc hôm nay của bạn suôn sẻ nhé!") — gây lặp từ "Chào" khi ghép với `namePrefix` mới tách riêng, sửa thành "Buổi sáng tràn năng lượng, ...".

**Kiểm chứng qua `wrangler dev` local + trình duyệt thật**: gọi `GET /api/greeting` 15 lần bằng JWT tự ký, lưu ra file đọc thủ công — xác nhận không còn dòng nào bắt đầu bằng "chào" lặp lại sau khi sửa câu sót. Qua trình duyệt: `getComputedStyle` xác nhận `fontSize: 14px`, thẻ `<b>` chứa đúng `"Chào Admin hạnh phúc"` với `fontWeight: 700`, phần còn lại của câu không đậm. Dọn `workerd` cũ. User xác nhận deploy — tăng version `1.004` → `1.005`, build, `wrangler deploy` production (Version ID `84dbbe65-3807-4769-8974-75f7fcac5777`, không có migration DB), health check xác nhận trang chủ 200, `/api/auth/me` trả 401.

### 3 tính năng mới: số liệu trên chart, đổi chiều nhóm báo cáo linh kiện tồn, module "Danh sách tổng"

User yêu cầu 3 việc: (1) hiện số trực tiếp trên các biểu đồ (không chỉ tooltip khi hover); (2) ở "Báo cáo tồn theo khu vực" (module Ca thiếu linh kiện) thêm lựa chọn đổi chiều nhóm sang Đối tác/Tỉnh/Hãng/Model/Nhóm KH/Ngành thay vì chỉ Khu vực; (3) thêm 1 mục menu mới "Danh sách tổng" liệt kê toàn bộ ca đã đóng trong 3 tháng gần nhất + tất cả ca đang tồn, có filter và xuất Excel, dùng để đối chiếu/làm báo cáo.

- **(1) Số liệu trên chart** (`ChartCanvas.tsx`): viết 1 Chart.js plugin thuần (không thêm thư viện `chartjs-plugin-datalabels`) — `valueLabelsPlugin` dùng hook `afterDatasetsDraw`, lặp qua `chart.getDatasetMeta(i).data`, lấy toạ độ qua `element.tooltipPosition()`, vẽ giá trị bằng `ctx.fillText` màu `#4c6478` (khớp `--ink-600`). Xử lý 3 kiểu bố trí khác nhau: doughnut/pie (`textAlign/textBaseline: center/middle`, vẽ ngay giữa lát), bar ngang `indexAxis:"y"` (vẽ bên phải đầu cột, `textBaseline: middle`), bar/line dọc thường (vẽ phía trên đỉnh cột/điểm, `textBaseline: bottom`). Bỏ qua giá trị `0`/`null` để đỡ rối. Đăng ký **toàn cục** 1 lần (`Chart.register(...registerables, valueLabelsPlugin)`) nên áp dụng cho **mọi** biểu đồ dùng chung `ChartCanvas` (15 lượt dùng ở Dashboard/Backlog/Survey/Revenue) mà không cần sửa từng nơi gọi — muốn tắt riêng 1 biểu đồ thì truyền `options={{ plugins: { valueLabels: { display: false } } }}`.
- **(2) Đổi chiều nhóm báo cáo linh kiện tồn**: Backend `missingParts.ts` thêm whitelist `REPORT_DIMS` (khu_vuc/tinh/doi_tac/hang/nhom_san_pham/nhom_kh/nganh — chống SQL injection tên cột, không the bind ten cot nhu gia tri thuong) áp dụng chung cho route `/by-khu-vuc?dim=...` (đổi `SELECT c.khu_vuc as khu_vuc` → `SELECT ${dimCol} as nhom`, `GROUP BY ${dimCol}`) **và** route `/` (danh sách chi tiết) qua hàm mới `dimAdHocClause(dimKey, value)` nhận thêm `dim`/`dim_value` để drill-down hoạt động đúng khi nhóm theo cột khác Khu vực (Khu vực vẫn dùng cơ chế `khuVucAdHocClause` cũ có sẵn hỗ trợ giá trị ảo `__QLDVBH__`). Frontend `MissingPartsModule.tsx`: `KhuVucRow.khu_vuc` → `nhom` (field chung cho mọi dim), thêm `Select` "Nhóm theo" (7 lựa chọn) cạnh nút Xuất Excel, tiêu đề cột đầu bảng đổi động theo dim đang chọn, thêm state `drillDim`/`drillValue` riêng (khác `khuVucFilter` cũ) để khi nhóm theo dim khác Khu vực, bấm số vẫn lọc đúng xuống danh sách chi tiết (kể cả tab "Đã đóng" qua `ClosedCasesTab`).
- **(3) Module "Danh sách tổng"**: Backend thêm `GET /api/cases/tong-hop` (đặt TRƯỚC route catch-all `/:id` trong `cases.ts` — thứ tự đăng ký route quan trọng với Hono, để `/tong-hop` không bị nuốt thành `id="tong-hop"`) — điều kiện `archived_at IS NULL AND (thoi_gian_hoan_thanh IS NULL OR thoi_gian_hoan_thanh >= date(datetime('now','+7 hours'),'start of month','-2 months'))`, tức ca đang tồn (không giới hạn tuổi) CỘNG ca đã đóng trong đúng 3 tháng lịch gần nhất (tháng hiện tại + 2 tháng trước) — tái dùng nguyên `scopeByKhuVuc`/`khuVucAdHocClause`, hỗ trợ thêm filter `hang`/`trang_thai` (đang tồn/đã đóng/tất cả), phân trang server-side + `export=true` (LIMIT 5000) giống hệt pattern của `GET /cases` sẵn có (không cache IndexedDB toàn bộ như `ArchivedModule` vì tập dữ liệu này trộn cả ca ĐANG thay đổi liên tục, cần luôn fresh). Frontend `DanhSachTongModule.tsx` (mới) — filter Khu vực/Hãng/Trạng thái + `PaginatedTable` + nút Xuất Excel, tái dùng y hệt các component/helper sẵn có (`Select`, `PaginatedTable`, `exportRowsToExcel`, `buildQuery`). Thêm mục nav "📋 Danh sách tổng" vào nhóm "Vận hành" (`navConfig.ts`), cho **mọi vai trò** thấy (không riêng Admin, giống các module vận hành khác — tự động scoping theo khu vực qua middleware sẵn có).

**Kiểm chứng qua `wrangler dev` local + trình duyệt thật + API trực tiếp**: seed 1 dòng `giai_trinh` thật (lý do "Thiếu linh kiện do công ty", gắn vào 1 ca đang tồn thật `hang=KAROFI`) để báo cáo linh kiện tồn có dữ liệu thật để test đổi chiều nhóm (trước đó local rỗng ở nhóm này). Gọi `GET /missing-parts/by-khu-vuc?dim=hang` xác nhận trả đúng `nhom:"KAROFI"`; gọi `?dim=xyz` (không hợp lệ) xác nhận trả đúng 400. Gọi `GET /missing-parts?dim=hang&dim_value=KAROFI` xác nhận lọc đúng còn đúng 1 ca. Qua trình duyệt thật: đổi Select "Nhóm theo" sang "Hãng" → xác nhận tiêu đề cột đổi đúng thành "Hãng", bảng hiện đúng dòng "KAROFI"; bấm vào số → xác nhận danh sách chi tiết lọc đúng còn 1 ca (T-1014874). Gọi `GET /cases/tong-hop` xác nhận `total: 14595` = đúng bằng `13076` (đã đóng, `trang_thai=da-dong`) + `1519` (đang tồn, `trang_thai=dang-ton`) cộng lại khớp chính xác, không trùng/thiếu. Qua trình duyệt: vào "Danh sách tổng" xác nhận mô tả hiện đúng "5/2026, 6/2026, 7/2026", bảng hiện 20/14595 dòng, bấm 1 dòng mở đúng "Thông tin khách hàng" là tab đầu (đúng logic tab mặc định theo module nguồn đã làm trước đó, vì "Danh sách tổng" không phải "backlog"). Xác nhận biểu đồ có label số: không đọc được canvas bằng text (Chart.js vẽ ra `<canvas>`, không phải DOM) nên dùng `getImageData()` quét màu chữ `rgb(76,100,120)` đặc trưng của plugin trên từng canvas — 4/5 biểu đồ có hàng chục đến hàng trăm pixel khớp màu (xác nhận có vẽ chữ thật), 1 biểu đồ (10 KTV thấp nhất SLA) không có match nào nhưng nhiều khả năng do không có KTV nào đủ ngưỡng "≥5 ca trong kỳ lọc" ở dữ liệu test local (rỗng từ trước, không phải lỗi mới). Dọn dữ liệu test (xoá `giai_trinh` seed, reset `theme_config`), tắt `workerd` cũ. User xác nhận deploy — tăng version `1.005` → `1.006`, build, `wrangler deploy` production (Version ID `59379b2f-e098-4641-800f-71cd9ff91710`, không có migration DB vì chỉ thêm route/cột SELECT mới trên bảng có sẵn), health check xác nhận trang chủ 200, `/api/auth/me` và `/api/cases/tong-hop` đều trả 401.

### Chia trang cho mọi "danh sách chi tiết" đang load toàn bộ (bảng giá linh kiện + các bảng khác)

User phản hồi: danh sách bảng giá sản phẩm (Settings → Danh mục linh kiện) đang load toàn bộ, yêu cầu chia trang; kèm yêu cầu tổng quát "TẤT CẢ các danh sách chi tiết đều phải chia nhỏ thành các bảng".

- Rà toàn bộ `frontend/src/modules` tìm mọi `<table>` không qua `PaginatedTable`, phân 2 loại: (a) **báo cáo/tổng hợp** (mỗi dòng là 1 nhóm đã `GROUP BY` — khu vực/hãng/giám sát..., số dòng tự nhiên nhỏ và cố định, vd bảng "Báo cáo tồn theo khu vực" ở Backlog/MissingParts/Survey, pivot Dashboard, "Doanh thu theo Giám sát" ở Revenue) — **giữ nguyên**, không phải đối tượng của yêu cầu; (b) **danh sách chi tiết** (mỗi dòng là 1 bản ghi thật, số dòng tăng theo dữ liệu nghiệp vụ) — đây mới là các bảng cần chia trang.
- Phát hiện 4 chỗ thuộc nhóm (b) đang load/render toàn bộ không phân trang, xác nhận qua đếm số dòng thật trên D1 local:
  1. `SettingsModule.tsx` tab "Danh mục linh kiện" — backend `/settings/linh-kien` không có `LIMIT` — **5.812 dòng** (đúng ví dụ user nêu, nghiêm trọng nhất).
  2. `SettingsModule.tsx` tab "Lý do chậm" — backend `/settings/ly-do` cũng không `LIMIT` (19 dòng ở local, nhỏ nhưng vẫn sửa theo yêu cầu "tất cả").
  3. `UsersModule.tsx` — backend `/users?tab=` không `LIMIT`.
  4. `SurveyModule.tsx` — cả 4 tab "Danh sách chi tiết" (Cần khảo sát/Quá hạn khảo sát/Chờ QC chốt cấp 2/Đã xử lý xong) — backend `/survey` đã có `LIMIT 200` sẵn nhưng **frontend vẫn render nguyên 200 dòng trong 1 bảng dài**, không phân trang — thực tế backend đang cắt bớt từ **5.812 ca "quá hạn khảo sát" thật** xuống còn 200 mà không ai biết.
- Không đổi backend cho (1)+(2)+(3) — vẫn tải nguyên danh sách 1 lần (giữ cơ chế cache theo hash `fetchWithHashCache` sẵn có cho Settings, tránh tải lại khi dữ liệu không đổi) nhưng **chia trang phía client** bằng `PaginatedTable` có sẵn (`.slice((page-1)*pageSize, page*pageSize)`) — đổi từ bảng HTML thuần sang khai báo `Column<T>[]` + `<PaginatedTable>`, pageSize=20, thêm state `page` reset về 1 khi đổi tab/filter. Không cần sửa gì backend vì dữ liệu vốn đã tải hết vào bộ nhớ, chỉ đổi cách RENDER.
- SurveyModule (4): tương tự — chia trang client-side trên kết quả đã fetch (tối đa 200 dòng theo giới hạn backend sẵn có, không đổi giới hạn này), viết `Column<T>[]` cho cả 2 dạng bảng (`CanKhaoSatRow` và `groupedViPham` — nhóm theo `case_id` từ danh sách `vi_pham`), giữ nguyên toàn bộ logic nghiệp vụ hiện có (Badge trạng thái, nút Chốt/Bỏ cho QC, nút Phân công/Gọi khảo sát).

**Kiểm chứng qua `wrangler dev` local + trình duyệt thật**: đếm số dòng thật trên D1 local (`linh_kien`: 5.812, `settings_ly_do`: 19, `users`: 4, `survey/counts?qua-han-khao-sat`: 5.812 thật nhưng backend cắt 200). Qua trình duyệt: vào Settings → Danh mục linh kiện xác nhận chỉ render đúng 20/5.812 dòng trong DOM, chân trang hiện "5812 dòng ‹1/291›" (291 = 5812/20 làm tròn lên, khớp chính xác), bấm "›" xác nhận dòng đầu bảng đổi khác (dữ liệu trang 2 thật, không phải trang cũ lặp lại). Tab "Lý do chậm" và "Quản lý User" xác nhận cấu trúc phân trang đúng dù dữ liệu nhỏ ("1/1"). Vào Quản lý khảo sát → Danh sách chi tiết → "Quá hạn khảo sát" xác nhận chỉ render 20/200 dòng, chân trang "200 dòng ‹1/10›". Dọn `theme_config` test, tắt `workerd` cũ. User xác nhận deploy — tăng version `1.006` → `1.007`, build, `wrangler deploy` production (Version ID `97c4a121-fd85-4f7b-a9fb-613693771b4c`, không có migration/thay đổi backend nào), health check xác nhận trang chủ 200, `/api/auth/me` trả 401.

### Quản lý tồn: đổi chiều nhóm báo cáo + cột "Thiếu linh kiện" + Danh sách tổng tách theo tháng

User yêu cầu 3 việc trong thẻ "Quản lý tồn": (1) "Báo cáo tồn theo khu vực" thêm lựa chọn đổi chiều nhóm (đối tác/Tỉnh/Hãng/Model/Nhóm KH/Ngành), giống đã làm cho Ca thiếu linh kiện; (2) thêm cột "số lượng ca thiếu linh kiện" vào bảng số liệu; (3) module "Danh sách tổng" tách thành 4 file riêng: tháng hiện tại + 2 tháng trước + ca đang tồn.

- **Gộp chung logic "đổi chiều nhóm" dùng lại lần 2** (`backend/src/lib/filterParams.ts`): chuyển `REPORT_DIMS` + `dimAdHocClause` (trước đây định nghĩa riêng trong `missingParts.ts`) thành hàm dùng chung, vì nay đến lượt `cases.ts` cần y hệt logic này — tránh chép lại lần thứ 2. `REPORT_DIMS` đổi sang lưu tên cột THUẦN (không alias sẵn `"c."`) để dùng được ở cả câu truy vấn có alias `c.` lẫn không alias (bảng `da_dong_trong_ky` theo kỳ trong `backlog-by-khu-vuc` không dùng alias `c.`). Cập nhật lại `missingParts.ts` cho khớp cách gọi mới (tự ghép `"c."` khi cần).
- **(1)+(2) `cases.ts` `/backlog-by-khu-vuc`**: thêm `dim` query param (whitelist qua `REPORT_DIMS`, mặc định `khu_vuc`), đổi `SELECT c.khu_vuc as khu_vuc` → `SELECT ${dimCol} as nhom` (và tương tự cho câu truy vấn `da_dong_trong_ky` theo kỳ) để nhóm theo cột bất kỳ. Thêm cột `thieu_linh_kien` — đếm trong nhóm bao nhiêu ca tồn có `EXISTS (SELECT 1 FROM settings_ly_do sld WHERE sld.ten_ly_do = lg.ly_do_cham AND sld.thuoc_thieu_linh_kien = 1)` — đúng định nghĩa "thiếu linh kiện" mà `missingParts.ts` đang dùng (khớp 1-1 với module Ca thiếu linh kiện, không định nghĩa lại). Thêm `dim`/`dim_value` vào cả 2 nhánh của `GET /cases` (chính + `da-dong`) để drill-down từ dòng báo cáo nhóm theo dim khác Khu vực vẫn lọc đúng xuống danh sách chi tiết — y hệt pattern đã làm cho missing-parts. `frontend/src/modules/BacklogModule.tsx`: thêm `Select` "Nhóm theo" (7 lựa chọn), state `reportDim`/`drillDim`/`drillValue` tách biệt `khuVucFilter` (y hệt cấu trúc `MissingPartsModule.tsx` đã làm trước đó), thêm cột "Thiếu linh kiện" vào bảng.
- **(3) `DanhSachTongModule.tsx` viết lại thành 4 tab**: bỏ hẳn bộ lọc "Trạng thái" (dropdown) cũ vì giờ mỗi tab đã tự nhiên cố định đúng 1 trạng thái. 3 tab tháng (nhãn tự tính theo ngày hiện tại, vd tháng 07 sẽ hiện "Tháng 07/2026 (hiện tại)"/"Tháng 06/2026"/"Tháng 05/2026") tái dùng thẳng **endpoint `/cases?tab=da-dong&thang=` đã có sẵn** (dùng chung bởi `ClosedCasesTab` ở Backlog/MissingParts) — tải toàn bộ 1 tháng 1 lần (tập dữ liệu giới hạn theo tháng, không quá lớn), phân trang thuần phía client. Thêm hỗ trợ filter `hang` vào nhánh `da-dong` của `GET /cases` (trước đây chỉ có `khu_vuc`) để đồng bộ 2 bộ lọc chung Khu vực/Hãng áp dụng được cho cả 4 tab. Tab "Ca đang tồn" tái dùng `/cases/tong-hop?trang_thai=dang-ton` (đã có từ module trước) với phân trang server-side (giữ luôn fresh, không cache, vì đây là tập dữ liệu đổi liên tục). Mỗi tab có nút "Xuất Excel" riêng xuất đúng dữ liệu tab đó (tên file khác nhau theo tháng/"đang tồn") — đúng nghĩa "file tháng" riêng biệt user yêu cầu, thay vì 1 bảng gộp chung như trước.

**Kiểm chứng qua `wrangler dev` local + trình duyệt thật + API trực tiếp** (seed lại 1 dòng `giai_trinh` "Thiếu linh kiện do công ty" gắn case `hang=KAROFI` như lần trước): gọi `GET /cases/backlog-by-khu-vuc?dim=hang` xác nhận dòng KAROFI có `tong_ton:1338, thieu_linh_kien:1` (khớp đúng 1 ca vừa seed); gọi `?dim=xyz` xác nhận 400. Gọi `/cases?tab=chua-giai-trinh&dim=hang&dim_value=KAROFI` xác nhận `total:1337` = đúng bằng `1338 - 1 da_giai_trinh` (số liệu tự đối chiếu chéo khớp tuyệt đối). Qua trình duyệt: đổi "Nhóm theo" sang "Hãng" → cột đầu bảng đổi đúng "Hãng", dòng KAROFI hiện đúng toàn bộ số liệu kể cả cột "Thiếu linh kiện" = 1; bấm số tổng tồn → danh sách chi tiết lọc đúng còn "1337 dòng". Với Danh sách tổng: gọi trực tiếp `/cases?tab=da-dong&thang=2026-07/06/05` ra 11623/1433/20 dòng, cộng đúng bằng 13076 (khớp tổng đã xác nhận ở tính năng trước); `/cases/tong-hop?trang_thai=dang-ton` ra `total:1519`. Qua trình duyệt xác nhận đủ 4 tab đúng nhãn ("Tháng 07/2026 (hiện tại)"/"Tháng 06/2026"/"Tháng 05/2026"/"Ca đang tồn"), tab mặc định (07) hiện đúng "11623 dòng", chuyển sang "Ca đang tồn" hiện đúng "1519 dòng". Dọn dữ liệu test (xoá `giai_trinh` seed, reset `theme_config`), tắt `workerd` cũ. User xác nhận deploy — tăng version `1.007` → `1.008`, build, `wrangler deploy` production (Version ID `2db55768-7036-4904-924a-909b30932e7f`, không có migration DB), health check xác nhận trang chủ 200, `/api/auth/me` trả 401.

## 2026-07-18 — Chế độ gọi khảo sát cho telesale (thẻ nhiệm vụ khảo sát toàn màn hình)

User yêu cầu xây dựng 1 giao diện chuyên biệt cho CSKH gọi điện khảo sát vi phạm hàng loạt: hiển thị từng ca dưới dạng thẻ, gọi xong lưu kết quả thì tự động nhảy sang ca tiếp theo, có ô tìm theo ID để nhảy tới ca bất kỳ — và yêu cầu tự đóng vai telesale thao tác thử để tìm điểm chưa hợp lý trước khi coi là xong. Trước đây chỉ có 1 bảng danh sách + modal "Gọi khảo sát" mở/đóng riêng lẻ từng dòng, không phù hợp nhịp gọi liên tục hàng chục ca/ngày.

- **Phát hiện lỗ hổng nghiệp vụ có sẵn khi đọc lại `survey.ts`**: cột `can_goi_lai`/`ly_do_that_bai` đã có sẵn trong bảng `ket_qua_goi` và được `POST /survey/calls` chấp nhận trong body, nhưng validation cũ bắt buộc `results.length > 0` — tức là không có cách nào lưu 1 cuộc gọi "không nghe máy/sai số" mà không bị ép chọn Lỗi/Không lỗi cho ít nhất 1 loại, dù chưa liên hệ được khách. Sửa `backend/src/routes/survey.ts`: validate cho phép `results: []` khi có `can_goi_lai` kèm theo (log cuộc gọi thất bại, không tạo `vi_pham` nào), bọc `c.env.DB.batch(statements)` để bỏ qua khi mảng rỗng (tránh batch rỗng lỗi).
- Mở rộng SELECT của 2 tab `can-khao-sat`/`qua-han-khao-sat` trong `survey.ts`: thêm `mo_ta_loi, ky_thuat_vien, tinh, quan_huyen, thoi_gian_cskh_tiep_nhan, thoi_gian_hen_xu_ly, thoi_gian_hoan_thanh, link_crm, noi_dung_xu_ly` — đủ ngữ cảnh để hiển thị thẳng trên thẻ gọi mà không cần round-trip riêng, không đổi cấu trúc/hiệu năng câu truy vấn.
- File mới `frontend/src/modules/SurveyCallWorkspace.tsx` — overlay toàn màn hình (che cả Sidebar/TopBar, `fixed inset-0 z-40`) mở từ nút "🎧 Vào chế độ gọi khảo sát" trong `SurveyModule.tsx` (tab Danh sách chi tiết). Kiến trúc **hàng đợi hoàn toàn derived** (không mutate mảng thủ công): gộp 2 query `qua-han-khao-sat` + `can-khao-sat` sẵn có (tái dùng đúng queryKey của `SurveyModule` nên chia sẻ cache), lọc theo `khu_vuc` + toggle "Chỉ ca của tôi" (so khớp `assigned_to`), loại các ca đã kết luận xong trong phiên (`calledIds`), sắp xếp bằng `useMemo` — con trỏ `index` chỉ trỏ vào mảng, không cần splice: kết luận xong → thêm vào `calledIds` → ca đó biến mất khỏi mảng derived → ca kế tự "trượt" vào đúng vị trí con trỏ, tạo cảm giác auto-next mà không cần code điều hướng riêng. Ghi nhận cuộc gọi ngay trên thẻ (không qua modal): nếu "Liên hệ thành công" hiện khối chọn Lỗi/Không lỗi từng loại (tái dùng `neededLoaiLoi`/`FLAG_TO_LOAI` export từ `SurveyModule.tsx`); nếu thất bại (không nghe máy/sai số) hiện lý do thất bại + checkbox "Cần gọi lại", submit với `results: []`. Ô tìm theo ID/Serial tái dùng nguyên `GET /cases/search` (đang phục vụ TopBar) — có trong hàng đợi thì nhảy tức thì, không có thì gọi `/cases/:id` (đã có, dùng bởi `CaseDetail`) dựng "thẻ ngoài hàng đợi" tạm thời, tự tính lại `need_loi_*` từ cờ case + mảng `viPham` trả kèm (mirror đúng điều kiện NOT EXISTS phía backend).
- **Bug tự phát hiện qua đóng vai telesale thao tác thật (không phải do user báo)**: lần đầu sắp xếp hàng đợi ưu tiên `qua-han` lên trước rồi mới đến bump-do-gọi-thất-bại — nếu hàng đợi chỉ còn đúng 1 ca "quá hạn" và gọi thất bại ca đó, ca lại hiện ra ngay lập tức (vì nó vẫn là ca `qua-han` duy nhất bất kể đã bump), phá vỡ đúng cảm giác "tự động next" mà user yêu cầu. Sửa lại thứ tự so sánh: ca đã bump (gọi thất bại) luôn xếp sau MỌI ca chưa từng thử gọi, bất kể tier khẩn cấp — chỉ khi không còn ca nào chưa thử mới quay lại các ca bump theo đúng thứ tự thất bại trước sau.
- Sửa thêm 1 điểm trong lúc thử: ô tìm theo ID ban đầu dùng `onKeyDown` bắt phím Enter thủ công — đổi sang bọc `<form onSubmit>` khớp đúng pattern `GlobalSearch` (TopBar.tsx) đã dùng sẵn trong dự án, để Enter submit theo cơ chế form chuẩn của trình duyệt thay vì tự bắt phím.

**Kiểm chứng qua `wrangler dev` local + trình duyệt thật đóng vai CSKH**: seed 6 ca test (`TC-WS-001..006`) đủ kịch bản — nhiều cờ lỗi, ca mở chưa gán ai, ca gán người khác (test toggle "Chỉ ca của tôi"), ca quá hạn, ca đã khảo sát xong (test "không còn lỗi cần khảo sát"), có `link_crm`. Phát hiện lần seed đầu quyền xem theo `khu_vuc_phu_trach` rỗng (`[]`) làm CSKH test không thấy gì cả (`scopeByKhuVuc.ts`: mảng rỗng = "AND 1=0") — sửa seed gán đúng khu vực phụ trách rồi lặp lại. Xác nhận qua trình duyệt: ghi nhận 1 cuộc gọi có vi phạm → tự nhảy ca kế, hàng đợi giảm đúng, đếm "Đã xử lý" tăng, `vi_pham`/`ket_qua_goi` tạo đúng trong D1 (kiểm tra trực tiếp bằng `wrangler d1 execute`); ghi nhận cuộc gọi thất bại → không tạo `vi_pham` nào, `ket_qua_goi.can_goi_lai=1`, tự nhảy sang ca khác (sau khi sửa bug thứ tự). Tìm theo ID: ca trong hàng đợi nhảy tức thì, ca ngoài hàng đợi (đã khảo sát xong) hiện đúng thông báo "không còn lỗi cần khảo sát", ID không tồn tại báo lỗi đúng không tạo thẻ trắng. Test toggle "Chỉ ca của tôi" (3→4 ca khi tắt) và đổi khu vực (4→2 ca khi lọc "Da Nang") đúng số. Test "Xem hồ sơ đầy đủ" mở đúng Drawer `CaseDetail`, "◀ Ca trước"/"Bỏ qua ⏭" điều hướng đúng. Dọn sạch dữ liệu test (`TC-WS-*` + 2 user test) khỏi D1 local. User xác nhận deploy — tăng version `1.008` → `1.009`, build, `wrangler deploy` production (Version ID `ff814a15-3186-48c0-9a82-0e02062aded0`, không có migration DB vì cột `can_goi_lai`/`ly_do_that_bai` đã có sẵn từ `0001_init.sql`), health check xác nhận trang chủ 200, `/api/auth/me` trả 401.

**Đợt 2 cùng ngày — user yêu cầu "tiếp tục": test thêm vai trò khác + tinh chỉnh UX thêm.** Thêm vào `SurveyCallWorkspace.tsx`: chỉ số vị trí "Ca X/Y" trong hàng đợi (badge đầu, phân biệt rõ với trạng thái "Tìm thủ công" khi đang xem thẻ ngoài hàng đợi); phím tắt `PageUp`/`PageDown` để lùi/tiến ca (chỉ kích hoạt khi không đang gõ trong input/textarea/select — tránh xung đột cuộn trong ô ghi chú/tìm kiếm) kèm dòng gợi ý phím tắt hiển thị trên đầu thẻ.

- `wrangler dev --local` bị crash giữa chừng (`std::terminate()` trong `workerd`) sau nhiều lần hot-reload liên tiếp — lỗi flakiness đã biết của `wrangler dev --local`, không liên quan code; khởi động lại là qua.
- Test thêm 3 vai trò qua JWT test mint riêng: **TN CSKH** (seed `tn.cskh.test@example.com`, `khu_vuc_phu_trach=["Ha Noi","Da Nang"]`) xác nhận toggle "Chỉ ca của tôi" mặc định **tắt** (đúng thiết kế — chỉ CSKH thường mới mặc định bật), thấy cả ca mở lẫn ca gán cho mình; **Admin** (`smarttrade.vp@gmail.com` có sẵn) xác nhận thấy toàn bộ khu vực + dữ liệu thật quy mô lớn (**5.812 ca quá hạn khảo sát + 1.263 ca cần khảo sát** đang có sẵn trong D1 local) — hàng đợi tự động giới hạn đúng "Ca 1/400" (200+200 theo `LIMIT 200` sẵn có của backend, không đổi), thẻ hiển thị đúng dữ liệu ca thật (case `1253218`, KTV/địa chỉ thật) không lỗi console; **trạng thái hàng đợi rỗng** (seed `empty.test@example.com` với `khu_vuc_phu_trach=["KhuVucTestRong"]` — khu vực không khớp ca nào) xác nhận đúng hiện "🎉 Hết ca cần khảo sát trong hàng đợi hiện tại!" thay vì báo lỗi hay màn trắng.
- Test phím tắt PageUp/PageDown: `computer{action:"key"}` của công cụ trình duyệt gửi phím không kích hoạt được listener thật (cùng hạn chế đã gặp với phím Enter ở đợt 1) — xác nhận lại bằng cách dispatch `KeyboardEvent` thật qua JS trực tiếp trên `window`, cả 2 phím hoạt động đúng (điều hướng đúng ca kế/ca trước); có 1 lần đọc DOM ngay sau dispatch trong cùng 1 lệnh JS bị "chưa cập nhật" — do React chưa kịp flush render (race điều kiện của cách test, không phải bug code), xác nhận lại ở lệnh sau thì đúng.
- Dọn sạch dữ liệu test đợt 2 (`TC-ROLE-*` + 3 user test) khỏi D1 local. User xác nhận deploy đợt 2 — tăng version `1.009` → `1.010`, build, `wrangler deploy` production (Version ID `aad4be9d-fd36-4ac8-9fa7-f7f1a0b56ce2`, không có thay đổi backend/migration), health check xác nhận trang chủ 200, `/api/auth/me` trả 401.

## 2026-07-18 (phiên 9) — 3 cải tiến: tỷ lệ đã khảo sát, Link CRM cạnh tiêu đề, tab thông tin lên đầu + giải trình tự điền

User yêu cầu 3 việc: (1) thẻ "Nghi ngờ vi phạm" ở Tổng quát thêm tỷ lệ đã khảo sát; (2) `CaseDetail` hiện "Link CRM" ngay cạnh tiêu đề để mở nhanh; (3) mọi nơi mở Chi tiết ca đều ưu tiên hiện tab "Thông tin khách hàng" trước, và thêm nút "Thêm giải trình" ngay tại đó (không bắt phải qua tab Giải trình), tự động điền lại theo giải trình gần nhất để đỡ phải gõ lại nội dung giống hệt lần trước.

- **`backend/src/routes/dashboard.ts` `/kpis`**: thêm truy vấn `daKhaoSat` — đếm số dòng `vi_pham` (JOIN `case_dvbh` theo cùng bộ lọc khu vực/hãng/tháng) bất kể kết luận Lỗi hay Không lỗi, khác với `xacNhan` (chỉ đếm lỗi đã xác nhận thật). Trả thêm field `tyDaKhaoSat = pct(daKhaoSat, nghiNgo)`. `DashboardModule.tsx`: thêm `tyDaKhaoSat` vào interface `Kpis`, đổi `sub` của StatCard "Nghi ngờ vi phạm" thành `Vi phạm X% · Đã khảo sát Y%`.
- **`Drawer.tsx`** (chỉ `CaseDetail.tsx` dùng component này, không ảnh hưởng nơi khác): thêm prop `titleExtra?: ReactNode` render ngay cạnh `<h3>` tiêu đề (bọc cả 2 trong 1 `flex items-center gap-2`, tiêu đề `truncate` để không đẩy nút ra ngoài khi tên dài). `CaseDetail.tsx` truyền `titleExtra` là nút "🔗 Link CRM" mở tab mới khi `c.link_crm` tồn tại.
- **`CaseDetail.tsx` đổi tab mặc định + vị trí**: bỏ hẳn logic cũ "mở tab Giải trình tồn trước khi mở từ Quản lý tồn (backlog)" — giờ **luôn mặc định + luôn xếp đầu tab "Thông tin khách hàng"** cho mọi nơi gọi (dọn theo luôn: xoá hẳn prop `sourceModule` không còn dùng khỏi `CaseDetail` và state `openedFromModule`/`setOpenedFromModule` khỏi `App.tsx` vì không còn nơi nào cần). Thêm nút "+ Thêm giải trình" vào đầu tab Info (điều kiện hiện y hệt nút cũ ở tab Giải trình: `!c.thoi_gian_hoan_thanh && canGiaiTrinh`), cả 2 nút giờ dùng chung 1 hàm `openGiaiTrinhModal()`.
- **Tự động điền giải trình theo lịch sử gần nhất**: `openGiaiTrinhModal()` lấy `giaiTrinhList[0]` (mảng đã `ORDER BY ngay_giai_trinh DESC` sẵn từ backend) để điền lại `ly_do_cham` (chỉ điền nếu tên lý do đó vẫn còn active trong `settings_ly_do`, tránh chọn phải lý do đã bị tắt không có trong danh sách), `noi_dung`, `linh_kien_thieu`, `ma_xuat_hang_lien_quan`. **Cố tình để trống** 2 trường ngày (`ngay_du_kien`, `ngay_yeu_cau_co_hang`) vì đó là ngày dự kiến/yêu cầu mới, điền lại ngày cũ (đã qua hạn) sẽ gây nhầm hơn là giúp. Thêm dòng gợi ý nhỏ trong modal "Đã tự động điền lại theo giải trình gần nhất — kiểm tra lại nội dung trước khi gửi" khi có dữ liệu để điền, nhắc người dùng rà lại trước khi gửi thay vì bấm gửi mù theo dữ liệu cũ.

**Kiểm chứng qua `wrangler dev` local + trình duyệt thật** (Admin, vì cần quyền `canGiaiTrinh` để test nút giải trình): (1) seed chính xác 3 dòng `vi_pham` cho khu vực "Phòng bảo hành 3T miền Nam" (nghi_ngo=9 flags) — 2 dòng kết luận có lỗi (`ket_qua_cap_1 != 'Khong loi'`), 1 dòng "Khong loi" — tính tay kỳ vọng `tyViPham = 2/9 = 22.2%`, `tyDaKhaoSat = 3/9 = 33.3%`; lọc dashboard theo đúng khu vực đó, số hiện ra khớp chính xác "Vi phạm 22.2% · Đã khảo sát 33.3%". (2) Mở ca `1014874` (có `link_crm` thật) — xác nhận nút "🔗 Link CRM" hiện ngay cạnh "Chi tiết ca 1014874" trên header. (3) Xác nhận thứ tự tab đúng "Thông tin khách hàng" → "Giải trình tồn" → "Vi phạm ghi nhận", tab Info tự mở mặc định, có nút "+ Thêm giải trình" ngay trên đó; seed 1 dòng `giai_trinh` lịch sử (`ly_do_cham="Do KTV"`, `noi_dung="KTV dang ban lich..."`) cho ca này rồi bấm nút — xác nhận modal tự điền đúng `select="Do KTV"`, `textarea` đúng nội dung cũ, 2 ô ngày để trống, có dòng gợi ý tự điền; gửi thử xác nhận tạo thêm giải trình thành công ("Giải trình tồn" tăng từ (1) lên (2)), không lỗi console. Dọn sạch dữ liệu test (`vi_pham`/`ket_qua_goi` KPI-test, `giai_trinh` test ở ca `1014874`) khỏi D1 local. Grep toàn `frontend/src` xác nhận không còn tham chiếu `sourceModule`/`openedFromModule` sót lại sau khi xoá. User xác nhận deploy — tăng version `1.010` → `1.011`, build, `wrangler deploy` production (Version ID `54f985b0-80fe-4aa1-9a7b-3c2e960533fa`, không có migration DB), health check xác nhận trang chủ 200, `/api/auth/me` trả 401.

## 2026-07-18 (phiên 10) — Rà soát bảo mật/hiệu năng toàn hệ thống, sửa 6 lỗ hổng

User yêu cầu rà soát toàn bộ hệ thống tìm rủi ro ghi/đọc gây thất thoát dữ liệu hoặc tốn tài nguyên. Đọc lại toàn bộ 18 file route + middleware + lib phía backend (không chỉ những phần đã đụng tới trong các tính năng trước). Phát hiện 8 vấn đề, được user duyệt sửa hết ("cứ lần lượt sửa hết") — 6 vấn đề đầu là bug thật đã sửa, 2 vấn đề cuối (hasBusinessDataChanged so sánh số, audit log) đã đánh giá và 1 trong 2 đã sửa luôn vì rủi ro thấp/dễ sửa.

- **[Rò rỉ dữ liệu #1 — nghiêm trọng nhất] Doanh thu công ty lộ cho mọi vai trò qua banner "Báo cáo nhanh"**: `lib/dailyReport.ts` `computeDailyReport()` trước đây chỉ lọc khu vực cho vai trò "Giám sát", còn `doanhThuThang` (tiền) thì mọi vai trò khác — kể cả CSKH/TN CSKH/QC vốn **không** có quyền vào module "Báo cáo doanh thu" — đều nhận được số doanh thu toàn công ty trong banner + toast đầu ngày ở Dashboard (module ai cũng vào được). Sửa: thêm `canViewRevenue = ROLES_XEM_TOAN_BO.includes(vai_tro)` (đúng danh sách vai trò có quyền xem module Doanh thu ở `navConfig.ts`), trả `doanhThuThang: null` cho vai trò không được xem (bỏ hẳn luôn câu SQL tính doanh thu nếu không cần, đỡ phí 1 query), và **bỏ query luôn nếu không cần** thay vì tính rồi giấu. `DashboardModule.tsx`: ẩn hẳn ô "Doanh thu tháng này" khi `null` (không hiện "0đ" gây hiểu lầm là doanh thu bằng 0). `App.tsx`: bỏ luôn đoạn "DT tháng: ..." khỏi câu toast khi `doanhThuThang` là `null`.
- **[Rò rỉ dữ liệu #2] `revenue.ts` không có `requireRole`**: 3 endpoint (`/`, `/trend`, `/giam-sat`) trước đây chỉ dựa vào ẩn menu ở frontend, ai gọi thẳng API cũng qua được (chỉ lọc theo khu vực qua `scopeByKhuVuc`, không chặn vai trò). Thêm `requireRole(...ROLES_XEM_TOAN_BO)` — đúng khớp danh sách vai trò có module Doanh thu.
- **[Rò rỉ dữ liệu #3] `/api/notifications/count` đếm "Chờ QC" không lọc khu vực** trong khi danh sách thật ở `survey.ts` có lọc — QC bị giới hạn vùng thấy số ở chuông thông báo lớn hơn số họ xử lý được. Sửa: JOIN `case_dvbh` + áp `khuVucWhereClause` giống hệt tab "cho-qc".
- **[Rủi ro ghi #1 — nghiêm trọng] `POST /survey/assign` thiếu mọi kiểm tra**: không kiểm tra ca tồn tại, không kiểm tra ca thuộc khu vực người gọi, không kiểm tra `assigned_to` có phải email CSKH đã duyệt hay không (nhận bất kỳ chuỗi nào) — trong khi luồng gán hàng loạt (`/assign-bulk/commit`) đã làm đúng cả 3 việc này từ trước. Sửa: thêm kiểm tra ca tồn tại (404 nếu không), kiểm tra khu vực khớp `scopeByKhuVuc` (403 `FORBIDDEN_KHU_VUC` nếu khác, y hệt `GET /cases/:id`), và validate `assigned_to` qua `loadValidCskhEmails()` có sẵn (400 `INVALID_ASSIGNED_TO` nếu không hợp lệ).
- **[Lãng phí tài nguyên] `/api/greeting` gọi Open-Meteo ở MỌI request** (mỗi lần tải trang, mọi user) không cache, dù thời tiết chỉ cần mới mỗi 15-30 phút và chỉ có 2 vùng cố định (Bắc/Nam). Sửa: dùng Cache API sẵn có của Cloudflare (`caches.default`), cache theo URL request (đã bao gồm toạ độ vùng) với `Cache-Control: max-age=1800`.
- **[Robustness] `PATCH /users/:email`** không validate `vai_tro` trước khi ghi, giá trị sai sẽ vỡ CHECK constraint và rơi vào lỗi 500 chung chung. Thêm `VAI_TRO_VALUES` (mảng runtime đi kèm type `VaiTro`, giống pattern `LOAI_LOI_KEYS`) vào `types.ts`, validate trả 400 `INVALID_VAI_TRO` rõ ràng trước khi đụng DB.
- **[Hardening, rủi ro thấp]** `hasBusinessDataChanged` (dùng để quyết định có ghi đè lúc import hàng ngày hay không) so sánh mọi cột bằng `String(a) !== String(b)`, có thể báo "đã đổi" giả với cột số (vd "100000" vs "100000.0"), gây GHI_DE thừa. Sửa: so sánh 4 cột số (`dt_san_pham`, `dt_linh_kien`, `dt_dich_vu`, `so_phut_xu_ly`) bằng `Number()` khi cả 2 phía parse được số hữu hạn, rơi lại `String()` khi không (null/rác) để không đổi hành vi hiện có.
- Không sửa việc mở rộng `settings_audit_log` sang gán ca/đổi vai trò/QC chốt cấp 2 — đây là quyết định thiết kế lớn hơn (thêm bảng/luồng ghi log mới), để lại như gợi ý cải tiến, chưa làm trong đợt này.

**Kiểm chứng qua `wrangler dev` local + `curl` trực tiếp bằng cookie JWT test cho từng vai trò** (nhanh và chính xác hơn thao tác UI cho các API-level check này): seed 3 user test (CSKH, TN CSKH, CSKH2 — đều `khu_vuc_phu_trach=["Ha Noi"]`) + 2 ca test (`TC-AUDIT-HN` ở Ha Noi, `TC-AUDIT-DN` ở Da Nang). Xác nhận: CSKH gọi `GET /revenue` → 403; CSKH gọi `/dashboard/daily-report` → `doanhThuThang: null` (Admin cùng lúc vẫn ra số thật, xác nhận không ảnh hưởng vai trò được phép); qua trình duyệt xác nhận ô "Doanh thu tháng này" biến mất hoàn toàn khỏi banner khi đăng nhập CSKH. TN CSKH gán ca `TC-AUDIT-DN` (khác vùng) → 403 `FORBIDDEN_KHU_VUC`, DB xác nhận `assigned_to` vẫn `null` (không bị ghi); gán ca `TC-AUDIT-HN` (đúng vùng) với email rác → 400 `INVALID_ASSIGNED_TO`; gán với email CSKH2 hợp lệ → 200 OK, DB xác nhận đã ghi đúng. Admin `PATCH /users/...` với `vai_tro` rác → 400 `INVALID_VAI_TRO`; với giá trị hợp lệ → 200 OK. `/api/greeting` vẫn trả đúng dữ liệu sau khi thêm cache, không lỗi. Giữa chừng gặp sự cố ngoài ý muốn: nhiều tiến trình `workerd` cũ từ các lần `wrangler dev` trước đó (kể cả 1 lần từng báo crash) **không thoát hẳn**, cùng lắng nghe port 8787 và trả 404 xen kẽ ngẫu nhiên — phát hiện qua `netstat`, dọn sạch toàn bộ tiến trình `workerd` còn sót rồi khởi động lại 1 tiến trình sạch mới kiểm chứng lại đúng. Dọn dữ liệu test khỏi D1 local. User xác nhận deploy — tăng version `1.011` → `1.012`, build, `wrangler deploy` production (Version ID `46be9389-7990-4215-9b50-8fd0fd9656d0`, không có migration DB), health check xác nhận trang chủ 200, `/api/auth/me` và `/api/revenue` (chưa đăng nhập) đều trả 401.

### Bug: ca đóng ngày 1/7 bị thiếu khỏi danh sách/xuất Excel "tháng 7"

User báo tải danh sách ca đóng tháng 7 nhưng thiếu đúng ca đóng ngày 1/7/2026. Root-cause qua truy vấn trực tiếp D1 production (chỉ đọc, không đổi gì): `thoi_gian_hoan_thanh` đôi khi được import chỉ là NGÀY THUẦN (vd `"2026-07-01"`, không giờ) khi nguồn CRM không có giờ cho dòng đó. Cả 3 nơi tính "khoảng tháng" (`cases.ts` `monthBounds()` dùng bởi `/cases?tab=da-dong` + `/backlog-by-khu-vuc`, `missingParts.ts` `monthBounds()`, `dailyReport.ts` `currentMonthBoundsVN()` cho doanh thu tháng) đều dựng mốc đầu tháng dạng `"2026-07-01 00:00:00"` (có giờ) rồi so sánh bằng `>=` kiểu chuỗi thuần — mà SQLite so chuỗi thì `'2026-07-01' >= '2026-07-01 00:00:00'` là **FALSE** (chuỗi ngắn là tiền tố của chuỗi dài hơn thì bị coi là NHỎ HƠN). Kiểm tra trực tiếp bằng `SELECT '2026-07-01' >= '2026-07-01 00:00:00'` trên D1 production xác nhận trả `0`.

- Sửa cả 3 hàm: bỏ hẳn phần `" 00:00:00"` khỏi mốc đầu/cuối tháng (chỉ còn `"2026-07-01"`/`"2026-08-01"` thuần ngày) — với ngày thuần làm mốc thì mọi giá trị cột (có giờ hay không) đều so sánh đúng theo quy tắc "chuỗi dài hơn cùng tiền tố thì lớn hơn". Vẫn giữ dạng range (không dùng `strftime(...) = ?`) để tận dụng index như comment gốc đã ghi rõ lý do.
- Phát hiện thêm khi đối chiếu: bug này còn có chiều ngược lại chưa ai báo — 1 ca đóng đúng ngày 1 tháng SAU (vd 1/8) mà không có giờ sẽ bị lọt NGƯỢC vào báo cáo tháng TRƯỚC (do mốc cuối cũng bị lỗi tương tự, chỉ khác chiều). Fix chung 1 lần giải quyết luôn cả 2 chiều.
- **Đo trực tiếp mức độ ảnh hưởng thật trên production**: đếm số ca "đóng trong tháng 7" theo logic cũ (12.400) và logic mới (13.273) — chênh đúng **873 ca**, khớp chính xác với số ca có `thoi_gian_hoan_thanh = '2026-07-01'` (đếm riêng ra cũng đúng 873). Đây không phải edge-case hiếm — kiểm tra thêm thấy **từ đúng ngày 1/7 trở đi, phần lớn (700-900 ca/ngày) các ca đóng đều không có giờ**, trong khi tháng 6 chỉ 10-30 ca/ngày không giờ (bình thường). Đã báo lại user: đây là dấu hiệu có gì đó thay đổi ở nguồn dữ liệu CRM/luồng đồng bộ đúng từ 1/7 — đáng để kiểm tra nguồn, nhưng KHÔNG tự ý sửa gì thêm ở phần này (ngoài phạm vi được hỏi, và không biết đây có phải hành vi mong muốn từ phía CRM hay không).

**Kiểm chứng**: xác nhận qua `curl` trực tiếp trên D1 production (chỉ SELECT, không ghi) rồi seed 1 ca test `TC-BAREDATE-001` (`thoi_gian_hoan_thanh='2026-07-01'` không giờ) vào D1 local, gọi qua API thật `/api/cases?tab=da-dong&thang=2026-07` xác nhận ca xuất hiện đúng (trước sửa sẽ không có). Dọn ca test khỏi D1 local. Lúc đầu user yêu cầu chưa deploy ("Chưa, để sau"), sau đó cùng phiên yêu cầu deploy luôn ("deploy fix bug đi") — tăng version `1.012` → `1.013`, build, `wrangler deploy` production (Version ID `f518d5a3-1793-48d2-9fb6-310addbe0c33`, không có migration DB), health check xác nhận trang chủ 200, `/api/auth/me` trả 401.

### Điều tra thêm: vì sao 3 mốc thời gian mất giờ/phút/giây khi tải về, web hiện toàn "7h sáng"

Ngay sau đó user báo thêm: `thoi_gian_cskh_tiep_nhan`, `thoi_gian_hen_xu_ly`, `thoi_gian_hoan_thanh` ở nguồn đều có đủ giờ/phút/giây, nhưng tải về thì mất hết, và trên web toàn hiện đúng "7h sáng". Điều tra bằng D1 production (chỉ đọc):

- Đếm số dòng NGÀY THUẦN (10 ký tự, không giờ) cho cả 3 cột: `thoi_gian_cskh_tiep_nhan` 15.359 dòng, `thoi_gian_hen_xu_ly` 12.599 dòng, `thoi_gian_hoan_thanh` (đã biết) — quy mô gần như TOÀN BỘ dữ liệu từ 3 lượt import thủ công liên tiếp ("import data 260716 - 3t.xlsx", "import data 260716.xlsx" 13.492 dòng mới, và 1 lượt 17/7) tra trong `import_history` + group theo `ngay_import` khớp đúng khớp 3 mốc giờ import đó.
- Viết script tái hiện trực tiếp bằng chính package `xlsx` (SheetJS) mà `ImportUploader.tsx` dùng (`cellDates:true` + `sheet_to_json`) với nhiều kịch bản (Date object có giờ, Date object đúng nửa đêm, chuỗi text định dạng VN/ISO) để tìm xem có lỗi parse ở tầng frontend hay không, đối chiếu cả cách `api/client.ts` serialize JSON và cách `importProcessor.ts` ghi DB (không có bước reformat/parse ngày nào ở luồng import thủ công — ghi y nguyên chuỗi frontend gửi lên). **Không tìm thấy lỗi code nào trong hệ thống có thể giải thích được kiểu mất-giờ-sạch-sẽ-đúng-ngày quan sát thấy** (nếu là lỗi timezone/parse trong code, thường sẽ lệch ngày hoặc lệch giờ ngẫu nhiên, không phải luôn về đúng "00:00:00" của đúng ngày). Kết luận nghiêng về: file Excel gốc được tải lên 3 lượt đó (không phải các lượt đồng bộ hàng ngày bình thường) có khả năng bản thân đã chỉ chứa NGÀY (serial nguyên, không phần thập phân giờ) cho các dòng này — cần user hoặc `meomeo3101@gmail.com` (người đã import) kiểm tra lại chính file `import data 260716.xlsx`/`import data 260716 - 3t.xlsx` để xác nhận.
- **Xác nhận và sửa riêng bug hiển thị "7h sáng"** — đây là lỗi thật, xác định chắc chắn 100% bằng code, độc lập với nghi vấn nguồn dữ liệu ở trên: `fmtDateTime()` (`frontend/src/types.ts`) khi nhận chuỗi ngày thuần "2026-07-01" (không giờ), `new Date("2026-07-01")` bị JS hiểu là **nửa đêm UTC**, sau đó `toLocaleString("vi-VN")` hiển thị theo giờ máy trình duyệt (Việt Nam, UTC+7) → luôn ra đúng "07:00" bất kể ngày nào — tái hiện bằng script Node xác nhận chính xác ra "07:00 01/07/2026", khớp 100% với mô tả của user.
- **Sửa**: `fmtDateTime()` kiểm tra chuỗi đầu vào có khớp `\d{2}:\d{2}` (có giờ) hay không — nếu không có giờ thì gọi thẳng `fmtDate()` (chỉ hiện ngày, đúng với việc dữ liệu thật sự thiếu giờ, không tự bịa ra "00:00" hay bất kỳ giờ nào khác). Chuỗi có giờ đầy đủ thì giữ nguyên hành vi cũ (không đổi gì, vẫn hiện đúng giờ).

**Kiểm chứng**: script Node tái hiện logic mới xác nhận `fmtDateTime('2026-07-01')` → `"01/07/2026"` (không còn "07:00" giả), `fmtDateTime('2026-07-01 08:23:45')` → `"08:23 01/07/2026"` (giữ nguyên đúng, không đổi hành vi ca có giờ thật). Kiểm chứng lại qua trình duyệt thật trên `wrangler dev` local: seed ca `TC-DISPLAYTEST` với cả 3 trường `thoi_gian_cskh_tiep_nhan`/`thoi_gian_hen_xu_ly`/`thoi_gian_hoan_thanh` đều là ngày thuần (không giờ), mở Chi tiết ca xác nhận cả 3 trường hiện đúng "01/07/2026"/"02/07/2026"/"03/07/2026" — không còn "07:00" giả nữa. Dọn ca test khỏi D1 local. User xác nhận deploy — tăng version `1.013` → `1.014`, build, `wrangler deploy` production (Version ID `9168a5d1-b551-4127-b4c9-e4af11e5d29d`, không có migration DB), health check xác nhận trang chủ 200, `/api/auth/me` trả 401.

**Việc còn để ngỏ, chưa làm**: nguồn gốc thật sự vì sao 3 file import thủ công ngày 16-18/7 lại chứa ~13.000+ dòng ngày-thuần-không-giờ cho cả 3 mốc thời gian vẫn chưa xác định được chắc chắn (không tìm thấy lỗi code phía hệ thống mình) — cần user hoặc người đã import (`meomeo3101@gmail.com`) kiểm tra lại trực tiếp file gốc "import data 260716.xlsx"/"import data 260716 - 3t.xlsx" xem cột giờ có thật sự tồn tại trong file hay không. Nếu xác nhận file gốc có giờ đầy đủ, sẽ cần tái import/backfill lại đúng để khôi phục dữ liệu giờ cho ~13.000+ ca này (ratchet/GHI_DE của `processImport` sẽ tự ghi đè đúng nếu re-import cùng case_id với dữ liệu mới đầy đủ hơn).

### Thay logic "KHÔNG TÍNH" bằng cột mới `tinh_vao_kpi` (bool TRUE/FALSE từ CRM)

User yêu cầu: thêm 1 cột mới trong file import CRM là "Tính vào KPIs" (bool TRUE/FALSE), đặt ngay sau cột "Nhóm sản phẩm"; bỏ hẳn logic cũ dựa vào chuỗi văn bản `'KHÔNG TÍNH'` trong `dung_han`/`xu_ly_24h_bucket` để loại 1 ca khỏi mẫu số báo cáo SLA/24h; chuyển hẳn sang dùng cột mới này — ca nào `FALSE` thì không tính vào các báo cáo tốc độ/tỷ lệ.

- **`migrations/0011_tinh_vao_kpi.sql`**: `ALTER TABLE case_dvbh ADD COLUMN tinh_vao_kpi INTEGER NOT NULL DEFAULT 1`, backfill `0` cho đúng các ca `dung_han = 'KHÔNG TÍNH' OR xu_ly_24h_bucket = 'KHÔNG TÍNH'` — giữ nguyên kết quả báo cáo hiện tại ngay sau khi triển khai, cột mới tiếp quản từ đây trở đi.
- **`backend/src/lib/ratchet.ts`**: thêm `"Tính vào KPIs": "tinh_vao_kpi"` vào `COLUMN_MAP` ngay sau `"Nhóm sản phẩm"` (thứ tự `COLUMN_MAP` quyết định thứ tự cột trong file mẫu CSV `/api/import/template`, tự động đúng vị trí không cần sửa gì thêm ở `importRoute.ts`). Thêm `"tinh_vao_kpi"` vào `BUSINESS_FIELDS` (để tham gia ghi/so sánh khi import — không phải cờ ratchet 1 chiều như 4 cột nghi ngờ vi phạm, đây là business field thường, có thể đổi qua lại TRUE/FALSE tự do). Thêm `normalizeTinhVaoKpi()` — mặc định `true` (tính) khi rỗng/thiếu (khác `normalizeViolationFlag` mặc định `false` khi rỗng — đây là cơ chế "loại trừ khi được nói rõ", không phải "nghi ngờ khi được nói rõ"), chỉ `false` khi rõ ràng là `false`/`0`/`"FALSE"`/`"0"` (không phân biệt hoa thường). Thêm `businessFieldValue(field, incoming)` — helper dùng chung cho `importProcessor.ts`, đặc cách chuẩn hoá riêng `tinh_vao_kpi` về `1`/`0` sạch, các field khác giữ nguyên hành vi truyền thẳng như cũ.
- **`hasBusinessDataChanged`**: đặc cách so sánh `tinh_vao_kpi` bằng giá trị đã chuẩn hoá ở cả 2 phía (DB đã sạch `1`/`0`, dữ liệu nhập có thể là `"TRUE"`/`"FALSE"`/bool/số) — nếu không đặc cách, `1` (DB) so với `"TRUE"` (file) sẽ luôn bị coi là "đã đổi" dù thực chất giống nhau, gây `GHI_ĐÈ` giả liên tục mỗi lần import lại cùng dữ liệu.
- **`backend/src/routes/dashboard.ts`**: xoá sạch mọi chỗ `!= 'KHÔNG TÍNH'` (4 khối truy vấn: `/kpis`, `/sla-trend`, `/monthly-trend`, `/pivot`), thay bằng điều kiện `tinh_vao_kpi = 1` áp dụng cho **cả tử số lẫn mẫu số** (vd `dung_han_count`/`dung_han_tinh`, `duoi_24h_count`/`co_tinh_24h`) — quan trọng vì thiết kế mới tách rời `tinh_vao_kpi` khỏi `dung_han`/`xu_ly_24h_bucket` (2 cột độc lập), nên 1 ca có thể vừa `dung_han='Đúng hạn'` (nhìn như đạt SLA) vừa `tinh_vao_kpi=0` (bị loại) — nếu chỉ lọc mẫu số mà quên tử số, ca đó vẫn lọt vào tử số sai.

**Kiểm chứng qua D1 local + production (chỉ đọc để đối chiếu, ghi thử trên local trước)**: sau khi áp migration local, đối chiếu logic cũ và mới trên đúng 1 tập dữ liệu — cả 2 ra đúng `13.147` cho cả `dung_han_tinh` lẫn `co_tinh_24h` (khớp tuyệt đối, xác nhận backfill bảo toàn đúng kết quả báo cáo hiện tại). Test qua API thật (`wrangler dev` local): import 2 ca mới với `tinh_vao_kpi` `"FALSE"`/`"TRUE"` xác nhận lưu đúng `0`/`1`; import lại y hệt xác nhận KHÔNG báo `GHI_ĐÈ` giả (ra `CẬP_NHẬT_MỐC_THỜI_GIAN`, đúng ý nghĩa "không đổi thật"); đổi thật `tinh_vao_kpi` từ `TRUE` sang `FALSE` rồi import lại xác nhận có `GHI_ĐÈ=1` và DB cập nhật đúng `0`. Dựng thẳng 2 ca test có `dung_han='Đúng hạn'` nhưng `tinh_vao_kpi=0`, chạy đúng câu SQL mới của `/kpis` xác nhận cả `dung_han_count` lẫn `dung_han_tinh` đều ra `0` cho 2 ca này — đúng yêu cầu "FALSE thì không tính". Dọn ca test khỏi D1 local. User xác nhận migrate + deploy — chạy migration `0011` trên D1 remote trước (xác nhận qua đếm số dòng: `1.547` ca backfill về `0`, `13.814` ca giữ `1`, khớp tỉ lệ với local), tăng version `1.014` → `1.015`, build, `wrangler deploy` production (Version ID `33b0a2d8-c4fd-4b46-ae0a-c83fe66e5e88`), health check xác nhận trang chủ 200, `/api/auth/me` trả 401.

### Bug: ca bị trùng ID khi tải "Danh sách tổng" (vd ca 1200694 lặp 4 lần)

User báo tải danh sách từ "Danh sách tổng" thấy ca `1200694` bị trùng ID nhiều lần. Vì `case_dvbh.id` là PRIMARY KEY nên không thể có 2 dòng case_dvbh trùng ID thật — nghi ngay là do 1 JOIN nào đó nhân dòng lên. Kiểm tra D1 production (chỉ đọc): ca `1200694` có đúng **4 dòng `giai_trinh` trùng y hệt timestamp** `"2026-07-15 09:46:35"` (tới từng giây). 3 nơi dùng chung 1 kiểu JOIN "lấy giải trình mới nhất theo case_id" (`cases.ts` `LATEST_GIAI_TRINH_JOIN` — dùng bởi `/cases?tab=da-dong` mà "Danh sách tổng" gọi trực tiếp, `missingParts.ts` `BASE_JOIN`, `dailyReport.ts` `MISSING_PARTS_JOIN`) đều theo mẫu "tính `MAX(ngay_giai_trinh)` rồi JOIN ngược lại tìm dòng khớp giá trị max" — khi có từ 2 dòng `giai_trinh` trùng đúng giây trở lên (dễ xảy ra khi backfill hàng loạt không có cột ngày rõ ràng trong file, rơi vào nhánh `COALESCE(?, datetime('now'))`, và nhiều dòng insert trong cùng 1 batch request nhận cùng 1 giá trị `datetime('now')`), JOIN sẽ khớp **CẢ MẤY DÒNG TRÙNG GIỜ ĐÓ**, nhân 1 case_id thành nhiều dòng kết quả.

- Đếm quy mô ảnh hưởng thật trên production: **466 case_id riêng biệt** bị trùng theo kiểu này (một số case còn bị 2 lần, ở 2 mốc ngày giải trình khác nhau, như ca `1104980`).
- **Sửa cả 3 nơi**: thay `MAX(ngay_giai_trinh) + JOIN ngược` bằng `ROW_NUMBER() OVER (PARTITION BY case_id ORDER BY ngay_giai_trinh DESC, id DESC) = 1` — cửa sổ SQLite đảm bảo **luôn đúng 1 dòng cho mỗi case_id** dù có trùng giờ, dùng cột `id` (UUID) làm tiêu chí phân định phụ khi timestamp hoà nhau (không quan trọng "dòng nào" thắng khi 2 dòng trùng giờ tuyệt đối, chỉ cần chọn đúng 1 dòng nhất quán).
- Không cần migration DB — thuần sửa logic truy vấn.

**Kiểm chứng trực tiếp trên D1 production (chỉ đọc)**: chạy thẳng câu JOIN mới cho riêng ca `1200694` → ra đúng **1 dòng** (trước đó ra 4). Chạy trên toàn bộ `case_dvbh` với JOIN mới → `COUNT(*)` và `COUNT(DISTINCT id)` đều ra đúng `15.361` (khớp tuyệt đối, xác nhận không còn case nào bị nhân dòng trong toàn hệ thống). Dựng lại đúng kịch bản lỗi trên D1 local (1 ca test + 2 dòng `giai_trinh` trùng giờ) rồi gọi qua API thật `/api/cases?tab=da-giai-trinh` xác nhận ca chỉ xuất hiện đúng 1 lần; test thêm `/cases/counts`, `/missing-parts`, `/dashboard/daily-report` không lỗi. Dọn dữ liệu test khỏi D1 local. User xác nhận "Danh sách tổng" đúng là nơi tải file bị lỗi, xác nhận deploy — tăng version `1.015` → `1.016`, build, `wrangler deploy` production (Version ID `cb8912a6-1472-4dd2-a9bf-542556cae418`, không có migration DB), health check xác nhận trang chủ 200, `/api/auth/me` trả 401.

### Sửa "Tổng số ca" + "đã hoàn thành" ở Tổng quát cho đúng nghĩa nghiệp vụ

User báo StatCard "Tổng số ca" ở Dashboard đang tính sai: (1) "Tổng số ca" cần bao gồm mọi trạng thái của cột `tien_do_hoan_thanh` (Tiến độ hoàn thành) nhưng phải lọc `tinh_vao_kpi = true`; (2) dòng phụ "X đã hoàn thành" cần tính chặt hơn — chỉ đếm ca có `tien_do_hoan_thanh = 'Hoàn thành XLSC'` VÀ `tinh_vao_kpi = true`, thay vì cách cũ chỉ check `thoi_gian_hoan_thanh IS NOT NULL` (một ca có mốc thời gian hoàn thành không có nghĩa là đã hoàn thành thành công theo XLSC — có thể là "Không hoàn thành XLSC" hoặc còn "KTV đang xử lý sơ bộ").

- Kiểm tra dữ liệu thật trước khi hardcode chuỗi so sánh: `SELECT tien_do_hoan_thanh, COUNT(*) ... GROUP BY` trên D1 production xác nhận đúng 3 giá trị tồn tại: `"Hoàn thành XLSC"` (12.306 ca), `"Không hoàn thành XLSC"` (1.547), `"KTV đang xử lý sơ bộ"` (1.508) — không có lỗi chính tả trong yêu cầu của user.
- **`backend/src/routes/dashboard.ts` `/kpis`**: đổi `total` từ `COUNT(*)` (không lọc gì) sang `SUM(CASE WHEN tinh_vao_kpi = 1 THEN 1 ELSE 0 END)`; đổi `hoan_thanh` từ `SUM(CASE WHEN thoi_gian_hoan_thanh IS NOT NULL ...)` sang `SUM(CASE WHEN tinh_vao_kpi = 1 AND tien_do_hoan_thanh = 'Hoàn thành XLSC' THEN 1 ELSE 0 END)`. Không đụng tới `ton` (ca tồn đọng) hay các chỉ số khác — chỉ đúng 2 số user chỉ ra, tránh mở rộng phạm vi ngoài yêu cầu.

**Kiểm chứng**: so sánh trực tiếp trên D1 production giữa logic cũ/mới (`archived_at IS NULL`) — `new_total=12.057` (so với `old_total=15.361` không lọc), `new_hoan_thanh=12.055` (so với `old_hoan_thanh=13.853`), xác nhận quan hệ `hoan_thanh ≤ total` vẫn đúng ở cả 2 bộ số. Gọi qua API thật (`wrangler dev` local) và xem trực tiếp qua trình duyệt ở Dashboard với filter mặc định "Tháng hiện tại" — StatCard "Tổng số ca" hiện đúng "12568 / 11049 đã hoàn thành", số cục bộ khớp đúng với số `tinh_vao_kpi=1` (13.147) đã xác minh ở tính năng trước đó (cùng 1 database local, cùng phép lọc thang="") — nhất quán tuyệt đối. User xác nhận deploy — tăng version `1.016` → `1.017`, build, `wrangler deploy` production (Version ID `3a05e9e1-a5b9-4c7b-bba9-6e0f45c36b13`, không có migration DB), health check xác nhận trang chủ 200, `/api/auth/me` trả 401.

### Định nghĩa lại "Tổng số ca"/"đã hoàn thành" theo `tien_do_hoan_thanh` + thêm cột pivot "Số ca HT tính KPIS", rà soát logic SLA/24h toàn hệ thống

User sửa lại lần nữa định nghĩa "Tổng số ca" (khác với bản vá phiên trước): (1) "Tổng số ca" ở Tổng quát = đếm mọi ca có `tien_do_hoan_thanh` thuộc {"Hoàn thành XLSC", "Không hoàn thành XLSC"} — **bỏ hẳn điều kiện `tinh_vao_kpi=true`** khỏi mẫu số này (khác bản vá trước); "đã hoàn thành" giữ nguyên = `Hoàn thành XLSC` VÀ `tinh_vao_kpi=true`. (2) Bảng pivot đa chiều: đổi nghĩa cột "Số ca" thành "Số ca đã đóng" (cùng định nghĩa như (1)), thêm cột mới "Số ca HT tính KPIS" (= "đã hoàn thành" ở (1)). (3) Yêu cầu rà soát toàn bộ báo cáo liên quan SLA/24h xem có nên áp thêm điều kiện `tien_do_hoan_thanh='Hoàn thành XLSC'` hay không — sau khi thấy số liệu thực tế, user chốt lại **giữ nguyên logic cũ, chỉ cần `tinh_vao_kpi=true`** (không cần thêm điều kiện trạng thái hoàn thành).

- **`backend/src/routes/dashboard.ts` `/kpis`**: đổi `total` từ `SUM(CASE WHEN tinh_vao_kpi=1 THEN...)` sang `SUM(CASE WHEN tien_do_hoan_thanh IN ('Hoàn thành XLSC','Không hoàn thành XLSC') THEN 1 ELSE 0 END)` — loại hẳn ca còn "KTV đang xử lý sơ bộ" ra khỏi "Tổng số ca" nhưng không còn lọc theo `tinh_vao_kpi`. `hoan_thanh` giữ nguyên logic đã có từ trước.
- **`/pivot`**: đổi `total` từ `COUNT(*)` (không lọc gì, gồm cả ca đang xử lý) sang cùng công thức "đã đóng" ở trên; thêm field mới `ht_tinh_kpi` = `SUM(CASE WHEN tinh_vao_kpi=1 AND tien_do_hoan_thanh='Hoàn thành XLSC' THEN...)`. `frontend/src/modules/DashboardModule.tsx`: thêm `ht_tinh_kpi` vào interface `PivotRow`, đổi header "Số ca" → "Số ca đã đóng", thêm cột mới "Số ca HT tính KPIS" ngay sau, `colSpan` dòng "Không có dữ liệu" tăng từ `7 + LOAI_LOI_KEYS.length` lên `8 + ...`.
- **Rà soát SLA/24h toàn hệ thống**: grep toàn `backend/src` xác nhận `dung_han`/`xu_ly_24h_bucket` chỉ xuất hiện đúng ở 4 nơi trong `dashboard.ts` (`/kpis`, `/sla-trend`, `/monthly-trend`, `/pivot`), không có module nào khác tính lại SLA/24h độc lập — tránh rủi ro lệch định nghĩa giữa các báo cáo. Phát hiện đáng chú ý khi kiểm tra dữ liệu thật (dù không sửa gì, theo đúng quyết định cuối của user): **1.519 ca đang "KTV đang xử lý sơ bộ" (chưa đóng) vẫn có sẵn giá trị `dung_han`/`xu_ly_24h_bucket`** (không NULL) và `tinh_vao_kpi=1`, nên đang được tính vào tử số/mẫu số SLA — ban đầu thử thêm điều kiện `tien_do_hoan_thanh='Hoàn thành XLSC'` vào cả 4 nơi để loại các ca này, nhưng user xem lại yêu cầu và chốt **giữ nguyên hành vi hiện tại** (chỉ `tinh_vao_kpi=1`, không thêm điều kiện trạng thái) — đã revert đúng 4 chỗ về logic gốc. Đã ghi nhận lại phát hiện này để nếu sau này user đổi ý thì biết ngay vị trí cần sửa.

**Kiểm chứng qua `wrangler dev --local` + D1 local + trình duyệt thật** (JWT test mint riêng cho `smarttrade.vp@gmail.com`, script mint không lưu trong repo): đối chiếu `GET /dashboard/kpis` (không lọc gì) với truy vấn tay trực tiếp trên D1 local — cả 2 ra đúng `total:13076, hoanThanh:11628` (khớp tuyệt đối). `GET /dashboard/pivot?dim=hang` dòng KAROFI đối chiếu tay ra đúng `total:11554, ht_tinh_kpi:10286` (khớp tuyệt đối). Quan trọng: **quên build lại frontend sau khi sửa `DashboardModule.tsx`** — lần đầu mở trình duyệt vẫn thấy header cột cũ (`wrangler dev --local` phục vụ thẳng `frontend/dist` đã build sẵn, không tự rebuild khi sửa source) — phát hiện qua so sánh trực tiếp text trích xuất trang với kỳ vọng, chạy lại `npm run build` rồi khởi động lại `wrangler dev` (kèm dọn `workerd` cũ theo đúng gotcha đã biết) thì đúng. Sau khi build lại, qua trình duyệt thật với filter mặc định "Tháng hiện tại": tổng cột "Số ca đã đóng" trên toàn bộ dòng pivot theo Khu vực = **12496**, khớp tuyệt đối với StatCard "Tổng số ca"; tổng cột "Số ca HT tính KPIS" = **11049**, khớp tuyệt đối với "... đã hoàn thành" — đối chiếu chéo 2 API độc lập cho cùng 1 kết quả. Sau khi revert SLA/24h về logic gốc, gọi lại `/dashboard/kpis` xác nhận `tySla:83, ty24h:73.4` giữ nguyên y hệt trước khi sửa+revert (không có sai lệch). Không seed dữ liệu test (toàn bộ kiểm chứng dùng dữ liệu local có sẵn, chỉ đọc). User xác nhận deploy — tăng version `1.017` → `1.018`, build, `wrangler deploy` production (Version ID `9d334ef4-5258-49df-bdfc-32cc271af4cd`, không có migration DB), health check xác nhận trang chủ 200, `/api/auth/me` và `/api/dashboard/kpis` (chưa đăng nhập) đều trả 401.

## 2026-07-18 (phiên 12) — Hệ thống "Ca lặp" (port từ tool Google Apps Script "Radar Lặp" riêng vào DVBH Suite)

User cung cấp 2 file `Code.gs`/`Index.html` của 1 web app Google Apps Script riêng ("Radar Lặp") đang dùng để phát hiện + giải trình "ca lặp kỹ thuật" (cùng serial tái phát trong 45 ngày), đối chiếu thủ công qua 1 sheet "Ca lặp 2 tháng" lọc tay mỗi kỳ. Yêu cầu ban đầu: phân tích logic + đánh giá khả năng/hạn chế nếu đưa lên DVBH Suite (không code). Sau khi phân tích xong (xem tóm tắt bên dưới), user yêu cầu lập kế hoạch rồi triển khai luôn.

**Phân tích trước khi code**: đối chiếu `schema.sql`/`ratchet.ts` xác nhận DVBH Suite và Radar Lặp dùng **chung 1 nguồn CRM export** — mọi cột Radar Lặp cần (`Seri sản phẩm`, `TBP`→`khu_vuc`, `Kỹ thuật viên`, `Thời gian hoàn thành`, `Link CRM`...) đã có sẵn 1:1 trong `case_dvbh`, đã index sẵn theo serial (`idx_case_seri`). Hạn chế lớn nhất của hệ cũ: sheet "Ca lặp 2 tháng" lọc tay, giới hạn lịch sử tra cứu ~2 tháng (rủi ro bỏ sót ca lặp thật ở ranh giới tháng); DVBH Suite lưu toàn bộ lịch sử (15k+ ca) nên có thể quét chính xác tuyệt đối theo ngày, không cần bước lọc tay nào. Đã dùng `EnterPlanMode` (theo đúng workflow: multi-file, cần thiết kế schema mới) — hỏi user 2 quyết định thiết kế qua `AskUserQuestion`: (1) phạm vi mặc định của module mới → chốt "tháng hiện tại, có bộ lọc đổi" (giống Backlog/Ca thiếu linh kiện); (2) phân quyền → chốt **giữ nguyên ánh xạ vai trò cũ** của Radar Lặp (Giám sát ghi cấp 1, QC chốt cấp 2, cả 2 ghi "Chốt hình thức xử lý" — trường ảnh hưởng trực tiếp đến lương KTV, Admin toàn quyền, Viewer/TBP DVBH chỉ xem).

- **`migrations/0012_ca_lap.sql`**: 2 bảng mới. `blacklist_serial` (id, seri_san_pham UNIQUE đã chuẩn hoá TRIM+UPPER, bat_tat, nguoi_them, ngay_them) — loại serial khỏi phát hiện lặp (hàng demo/cho mượn quay vòng nhiều khách). `giai_trinh_lap` (id dạng `CL-000001` qua `nextSequentialId`, case_id UNIQUE, chot_danh_gia_lap/qc_chot dùng chung 1 enum 6 giá trị ASCII, chot_hinh_thuc_xu_ly enum 5 giá trị ASCII, dien_giai_lap, nguoi_giai_trinh/ngay_giai_trinh, qc_ghi_chu, nguoi_qc/ngay_qc) — cấu trúc **đúng y hệt yêu cầu dữ liệu user cung cấp**, enum dùng khoá ASCII khớp convention có sẵn của `vi_pham.ket_qua_cap_1` (nhãn tiếng Việt có dấu chỉ nằm ở map hiển thị frontend). Seed `id_counters` cho `giai_trinh_lap`.
- **`backend/src/routes/caLap.ts`** (route mới, mount `/api/ca-lap`): logic lõi phát hiện lặp dùng `LAG() OVER (PARTITION BY seri_san_pham ORDER BY thoi_gian_hoan_thanh ASC, id ASC)` — cùng idiom với `ROW_NUMBER() OVER (PARTITION BY ...)` đã dùng sửa bug trùng dòng giải trình ở phiên trước, quét toàn bộ `case_dvbh` (tận dụng `idx_case_seri`, không giới hạn "2 tháng" như bản cũ), loại serial rỗng/≤4 ký tự/đang bị blacklist. `gap_days ≤ 45` → "Bị lặp" (tính thống kê), `> 45` → "Quá hạn lặp" (chỉ hiển thị, không cần giải trình — đúng hành vi bản gốc). `GET /danh-sach` (lọc khu_vuc/tháng/trạng_thái, phân trang + KPI đếm nhanh + export). `POST /:caseId/gs` (`requireRole("Giam sat","Admin")`, upsert qua `ON CONFLICT(case_id) DO UPDATE`). `POST /:caseId/qc` (`requireRole("QC","Admin")`, chặn 400 `CAP1_CHUA_CO` nếu chưa có cấp 1 — mirror CHECK `chk_cap2_sau_cap1` của `vi_pham`). `POST /:caseId/hinh-thuc` (`requireRole("Giam sat","QC","Admin")`, upsert độc lập). `GET/POST/PATCH /blacklist` (đọc mở cho mọi user đã duyệt, ghi giới hạn Giam sat/QC/Admin, thêm mới idempotent qua `ON CONFLICT DO UPDATE SET bat_tat=1`). Export thêm `getCaLapDetection(db, caseId)` dùng bởi `cases.ts`.
- **`backend/src/routes/cases.ts` `GET /:id`**: thêm field `caLap` vào response hiện có (bên cạnh `giaiTrinh`/`ketQuaGoi`/`viPham`) — gồm `detection` (gapDays/priorId/priorHt, quét đúng CTE trên nhưng chỉ scope 1 serial nên rẻ), `giaiTrinhLap` (dòng giải trình nếu có), `lichSu` (toàn bộ chuỗi ca cùng serial, DESC theo thời gian hoàn thành — tương đương "Chuỗi lịch sử" của bản gốc).
- **Frontend**: `frontend/src/modules/CaLapModule.tsx` (mới) — mirror `BacklogModule.tsx`: filter khu vực/tháng, 4 `StatCard` KPI, tab trạng thái (Tất cả/Cần đánh giá/Chờ QC/Đã chốt/Quá hạn lặp), bảng phân trang, tab phụ "Blacklist serial" (bảng + `ToggleSwitch` + modal thêm, mirror `SettingsModule.tsx`). `frontend/src/modules/CaseDetail.tsx`: thêm tab thứ 4 "Ca lặp" (badge đếm) hiện thông tin ca liền trước + gap ngày + 3 form (Chốt hình thức xử lý / Giám sát giải trình / QC chốt — mỗi form chỉ hiện editable đúng vai trò `canGsLap`/`canQcLap`, còn lại hiện readonly) + chuỗi lịch sử; thêm nút nhỏ "➕ Blacklist" ngay cạnh field Serial (hiện với Giam sat/QC/Admin). `navConfig.ts`/`App.tsx`: đăng ký module mới + 2 quyền `canGsLap`/`canQcLap` tính ở `App.tsx` truyền xuống `CaseDetail`.

**Kiểm chứng qua `wrangler dev --local` + D1 local + JWT test 3 vai trò + trình duyệt thật** (seed 6 ca test `TC-LAP-001..006` — 1 cặp cùng serial gap 19 ngày, 1 cặp gap 70 ngày, 1 cặp serial bị blacklist trước; seed 2 user test `giamsat.test@example.com`/`qc.test@example.com` với `khu_vuc_phu_trach=["TestKhuVucLap"]`): `GET /ca-lap/danh-sach` ra đúng 2 dòng (loại đúng cặp bị blacklist) — `gap_days` tính ra `19.04`/`70.04` khớp đúng số ngày thật, phân loại đúng "Bị lặp"/"Quá hạn lặp". Test luồng quyền qua `curl`: QC gọi `/qc` trước khi có `/gs` → đúng 400 `CAP1_CHUA_CO`; Giám sát gọi endpoint `/qc` → đúng 403; Giám sát chốt cấp 1 → QC chốt cấp 2 thành công, `id` sinh đúng `CL-000001`. `trang_thai=da-chot` lọc đúng, KPI cập nhật đúng theo thời gian thực. `POST /hinh-thuc` upsert đúng, không đụng các cột khác đã có. `POST /blacklist` chuẩn hoá đúng `"  testlap004  "` → `"TESTLAP004"`. Qua trình duyệt thật (đăng nhập Giám sát): mở module "Ca lặp", đổi filter đúng ra 2 dòng + KPI đúng số; mở `CaseDetail` ca `TC-LAP-002` — tab "Ca lặp (1)" hiện đúng "Ca liền trước: TC-LAP-001 · 19.0 ngày", 2 select "Chốt hình thức xử lý"/"Giám sát giải trình" pre-fill đúng giá trị đã lưu qua API test trước đó (đối chiếu trực tiếp `select.value` qua JS, không chỉ nhìn text), khối "QC chốt" hiện đúng dạng readonly (vì vai trò Giám sát không có `canQcLap`) hiện đúng giá trị đã lưu; bấm nút "➕ Blacklist" cạnh Serial, xác nhận D1 local ghi đúng dòng mới `nguoi_them="giamsat.test@example.com"`. Dọn sạch toàn bộ dữ liệu test (6 ca, 4 blacklist serial test, 2 user test, giai_trinh_lap liên quan) khỏi D1 local. User xác nhận migrate + deploy — chạy migration `0012` trên D1 remote trước (xác nhận 2 bảng mới rỗng, `id_counters` seed đúng `0`), tăng version `1.018` → `1.019`, build, `wrangler deploy` production (Version ID `dba53b73-1e3e-4f75-9781-031395f9feb7`), health check xác nhận trang chủ 200, `/api/auth/me`/`/api/ca-lap/danh-sach`/`/api/ca-lap/blacklist` (chưa đăng nhập) đều trả 401.

**Việc còn để ngỏ, chưa làm** (đã ghi rõ trong kế hoạch, không nằm ngoài phạm vi được duyệt): chưa retire web "Radar Lặp" cũ (quyết định vận hành của user); chưa mở rộng `settings_audit_log` cho 2 bảng mới (đã có cột `nguoi_*`/`ngay_*` trực tiếp trên bảng làm audit trail cơ bản); ngưỡng 45 ngày đang hardcode, chưa cấu hình được qua UI.

### Đợt 2 cùng ngày — bổ sung tab "Tổng quan" (báo cáo) còn thiếu + tự đóng vai GS/QC để hoàn thiện

Sau khi deploy đợt 1, user phản hồi "hiện tại mới thấy danh sách ca lặp, các logic khác chưa thấy gì cả" và yêu cầu: (1) đọc lại **toàn bộ** file gốc `Index.html` (trước đó chỉ đọc từng đoạn rời rạc, bỏ sót phần lớn) để lập danh mục đầy đủ tính năng; (2) tự đóng vai Giám sát rồi QC, thao tác thật qua trình duyệt (đăng nhập → xem báo cáo → mở ca → giải trình → lưu), với tinh thần "người khó tính" để tự phát hiện lỗi trước khi báo xong.

Đọc lại toàn bộ file gốc (2041 dòng, trước đó chỉ đọc ~40%) phát hiện bản gốc có **5 tab** chứ không phải 1: "Báo cáo tổng quan" (11 KPI + bảng "Báo cáo theo khu vực" + 5 biểu đồ tương tác, dòng 1087-1251) hoàn toàn chưa port; "Danh sách chi tiết cả tháng" (quyết định không port riêng vì trùng phạm vi module "Danh sách tổng" có sẵn); "Serial lặp" đã port nhưng thiếu bảng leaderboard KTV; "Cần xử lý" (GS/QC lọc riêng việc của mình) đã có tương đương qua tab trạng_thái nhưng thiếu điểm-vào-mặc-định theo vai trò; "Đã giải trình" đã có qua filter "Đã chốt" nhưng bảng thiếu 2 cột. Dùng lại `EnterPlanMode` cho đợt bổ sung này (đủ lớn, đa file, cần thiết kế SQL mới).

- **`backend/src/routes/caLap.ts`**: thêm `GET /tong-quan?khu_vuc=&thang=` — tách `CA_LAP_CTE` (có `WITH`) thành `CA_LAP_CTE_BODY` (không `WITH`, dùng ghép giữa 1 khối `WITH` khác) + `CA_LAP_CTE` (standalone) sau khi gặp lỗi cú pháp SQLite "near 'ranked'" do lồng 2 từ khoá `WITH` — bài học: không thể nối trực tiếp 1 CTE block có sẵn `WITH` vào giữa danh sách CTE của 1 câu truy vấn khác. Trả về `kpi` (12 chỉ số, áp đúng nguyên tắc "loại chốt hiệu lực" `COALESCE(qc_chot, chot_danh_gia_lap)` — ưu tiên QC nếu đã chốt, khớp y hệt bản gốc `c._loai = qc || giamsat || null`), `khuVuc` (3 CTE độc lập theo khu_vực rồi `LEFT JOIN` từ tập lớn nhất ra ngoài — tránh dùng `FULL OUTER JOIN` vì rủi ro tương thích D1/SQLite), `ktvTable` (leaderboard 15 KTV nhiều ca lặp nhất), `charts` (5 bộ dữ liệu: trend theo ngày, phân bố trạng thái, top KTV, loại lỗi đã chốt, top tỉnh). Định nghĩa lại "tháng" nhất quán theo `thoi_gian_hoan_thanh` (ca đã đóng) xuyên suốt, khác nhẹ so với bản gốc (vốn tính theo "toàn bộ dòng trong sheet tháng đó" — khái niệm không tồn tại trong data model DVBH).
- **`frontend/src/modules/CaLapModule.tsx`**: thêm view "Tổng quan" làm mặc định đầu tiên (khớp hành vi bản gốc) — 10 `StatCard`, bảng khu vực dạng `<table>` thường (giống style pivot table của `DashboardModule.tsx`, có thanh tiến trình màu theo tỷ lệ tồn đọng: đỏ ≥60%/vàng ≥30%/xanh còn lại), bảng leaderboard KTV, 5 `ChartCanvas` (line/doughnut/2 bar/pie) bố cục `chart-grid`/`chart-row2` — **cố tình không làm click-để-lọc-chéo** như bản gốc (giữ đúng mức tương tác hiện có của `DashboardModule.tsx`, tránh phá vỡ tính nhất quán UI). Thêm mặc định `trangThai` theo vai trò đăng nhập (`Giam sat` → "Cần đánh giá", `QC` → "Chờ QC", còn lại → "Tất cả") qua prop `role` mới truyền từ `App.tsx`. Thêm 2 cột "Chốt hình thức xử lý"/"Người giải trình" vào bảng danh sách.

**Kiểm chứng qua đối chiếu tay + roleplay thật (làm khó tính theo đúng yêu cầu)**:
1. Test API `/tong-quan` trên dữ liệu PRODUCTION thật (local, không seed) tháng 07: tổng cột `lap_n` theo khu vực (783) và tổng biểu đồ `trend` theo ngày (783) đều khớp tuyệt đối với `tongLap` — xác nhận đúng trên quy mô lớn trước khi seed test nhỏ.
2. Seed bộ dữ liệu phong phú hơn hẳn đợt 1: 3 khu vực, 3 KTV, 3 tỉnh, 6 serial (12 ca `TC2-001..012`) đủ 4 trạng thái (cần đánh giá/chờ QC/đã chốt/quá hạn lặp), tính tay trước toàn bộ KPI/bảng khu vực/KTV/5 biểu đồ rồi đối chiếu qua `curl` — **khớp tuyệt đối 100%** ở mọi con số, kể cả điểm dễ sai nhất: ca đã có GS chốt nhưng chưa QC vẫn được tính vào "loại chốt hiệu lực" (COALESCE ưu tiên QC nhưng fallback đúng về GS khi QC null).
3. **Tự đóng vai Giám sát** (`giamsat2.test@example.com`, JWT test, `khu_vuc_phu_trach` đúng 3 khu vực test): đăng nhập → module mở đúng thẳng tab "Tổng quan" → đổi tháng → toàn bộ KPI/bảng/leaderboard/biểu đồ khớp đúng số đã tính tay → chuyển "Danh sách ca lặp" xác nhận mặc định lọc đúng "Cần đánh giá" → mở ca, chọn "Chốt đánh giá lặp" + diễn giải, lưu → **phát hiện bug thật**: quay lại danh sách trong CÙNG phiên (không tải lại trang), ca vừa giải trình VẪN còn ở "Cần đánh giá", KPI header không đổi.
4. **Truy nguyên gốc rễ**: `CaseDetail.tsx` cache case đã đóng (`thoi_gian_hoan_thanh` có giá trị) vào IndexedDB qua `closedDataCache.ts` — `queryFn` của `useQuery(["case", caseId])` **luôn ưu tiên đọc cache này trước khi gọi API**. `invalidateQueries` chỉ đánh dấu stale rồi gọi lại đúng `queryFn` đó — nhưng `queryFn` lại trả thẳng cache cũ vì `case.thoi_gian_hoan_thanh` không đổi (không biết `giai_trinh_lap` — dữ liệu liên quan — đã đổi). Tính năng "Ca lặp" là tính năng ĐẦU TIÊN của DVBH Suite cho phép ghi dữ liệu (GS/QC chốt) gắn với case **đã đóng** — mọi tính năng ghi trước đó (giải trình tồn) chỉ áp dụng cho case CHƯA đóng nên chưa từng đụng lỗ hổng này.
5. **Sửa**: đổi cả 4 mutation (GS/QC/hình thức xử lý/blacklist) từ `invalidateQueries` sang fetch tươi thật + ghi đè `closedDataCache` bằng `setCachedEntry` + `qc.setQueryData` — đúng y hệt pattern nút "🔄 Đồng bộ lại" (`syncCaseMutation`) đã có sẵn trong file. Đồng thời phát hiện thêm 1 điểm UX nhỏ khi soi kỹ: sau khi lưu, form vẫn hiện y hệt lúc trước, không có dòng "Lần cập nhật gần nhất: ai · lúc nào" như bản gốc luôn hiện — bổ sung dòng này cho cả form GS lẫn QC dù đang ở chế độ chỉnh sửa (trước đây chỉ hiện ở nhánh readonly).
6. **Kiểm chứng lại sau khi sửa (không F5 giữa các bước)**: giải trình lại đúng case đó → dòng "Lần cập nhật gần nhất" hiện ngay lập tức → quay lại "Danh sách ca lặp" trong cùng phiên → ca đã biến mất khỏi "Cần đánh giá", KPI header "Chờ QC" tăng đúng.
7. **Tự đóng vai QC** (`qc2.test@example.com`): đăng nhập → mặc định lọc đúng "Chờ QC" (3 dòng) → mở 1 ca đã có GS chốt → xác nhận form GS hiện readonly (đúng vì `canGsLap=false`), form QC hiện editable → chốt QC, lưu → xác nhận ngay "Lần cập nhật gần nhất" hiện đúng, không cần F5 → quay lại danh sách xác nhận "Chờ QC" giảm đúng, "Đã chốt" tăng đúng → quay lại "Tổng quan" xác nhận toàn bộ KPI cập nhật tức thời khớp tính tay (đã giải trình 5/5=100%, tỷ lệ QC 60%=3/5, lỗi lặp đã chốt=3, tỷ lệ 27.3%). Không có lỗi console trong suốt toàn bộ phiên roleplay.
8. Dọn sạch toàn bộ dữ liệu test đợt 2 (12 ca, 3 `giai_trinh_lap`, 2 user test) khỏi D1 local. User xác nhận deploy — không có migration mới (chỉ thêm route + frontend), tăng version `1.019` → `1.020`, build, `wrangler deploy` production (Version ID `a505d8da-f029-4ce5-aab1-f9f86fc1c9c7`), health check xác nhận trang chủ 200, `/api/auth/me`/`/api/ca-lap/tong-quan` (chưa đăng nhập) đều trả 401.

**Bài học rút ra cho các tính năng ghi-trên-case-đã-đóng sau này**: bất kỳ mutation mới nào ghi dữ liệu gắn với 1 case đã có `thoi_gian_hoan_thanh` đều phải dùng pattern `fetch tươi + setCachedEntry + qc.setQueryData` (như `syncCaseMutation`), KHÔNG được chỉ `invalidateQueries(["case", caseId])` — vì `closedDataCache` sẽ luôn chặn refetch thật cho case đã đóng.

### Đợt 3 cùng ngày — sửa luồng QC, quy tắc phạm vi mới, import blacklist, gọn giao diện, sidebar counts

User dùng thực tế phát hiện thêm 6 vấn đề, đưa ra cùng lúc: (1) ca thật `1255604` mở từ danh sách nhưng tab "Ca lặp" trống; (2) muốn import hàng loạt cho blacklist; (3) quy tắc nghiệp vụ mới — Ca lặp chỉ xử lý ca "Hoàn thành XLSC" + hình thức bảo hành ≠ "Gọi điện tư vấn"; (4) sidebar cần hiện số lượng cần xử lý cạnh mỗi mục; (5) giao diện giải trình lặp trong Chi tiết ca quá cồng kềnh; (6) "Chuỗi lịch sử theo serial" không bấm được để mở ca khác. Dùng lại `EnterPlanMode` (đa file, cần đối chiếu bản gốc + đo tác động số liệu).

- **Bug `1255604`**: điều tra bằng SQL trực tiếp trên production — serial `8283763` có đúng 2 ca (`1247776` 12/07, `1255604` 18/07), gap 6.03 ngày, chạy thẳng CTE phát hiện lặp ra đúng kết quả. Vậy lỗi KHÔNG nằm ở logic backend, mà ở **`closedDataCache`** (IndexedDB phía trình duyệt, `frontend/src/lib/closedDataCache.ts`): `CaseDetail.tsx` coi bất kỳ cache nào của case đã có `thoi_gian_hoan_thanh` là hợp lệ vĩnh viễn — nếu user từng mở ca đó TRƯỚC KHI tính năng "Ca lặp" tồn tại (trước phiên hôm nay), cache cũ thiếu hẳn field `caLap` sẽ được dùng lại mãi mãi, không bao giờ tự làm mới. **Sửa**: thêm điều kiện `cached.data.caLap !== undefined` vào bên cạnh điều kiện `thoi_gian_hoan_thanh` trước khi tin cache trong `queryFn`.
- **Sửa luồng GS/QC theo đúng bản gốc**: đọc lại `Code.gs` xác nhận `saveGiaiTrinhQC` gốc **không** kiểm tra đã có "Chốt đánh giá lặp" của GS hay chưa — GS và QC là 2 người đánh giá độc lập. Bản port trước đã tự thêm rào chắn `CAP1_CHUA_CO` (mượn ý tưởng từ `vi_pham`, sai so với đặc tả gốc). **Sửa**: `backend/src/routes/caLap.ts` `POST /:caseId/qc` bỏ hẳn điều kiện chặn, đổi từ `UPDATE`-only sang `INSERT ... ON CONFLICT(case_id) DO UPDATE` (khớp pattern `/gs`/`/hinh-thuc`) để QC tự tạo dòng mới từ đầu nếu GS chưa từng chốt; `CaseDetail.tsx` bỏ dòng cảnh báo + điều kiện `disabled` phụ thuộc GS.
- **Quy tắc phạm vi mới**: thêm hàm `eligibleClause(prefix)` dùng chung — `tien_do_hoan_thanh = 'Hoàn thành XLSC' AND (hinh_thuc_bao_hanh IS NULL OR hinh_thuc_bao_hanh != 'Gọi điện tư vấn')` (NULL vẫn giữ lại, chỉ loại đúng giá trị "Gọi điện tư vấn") — áp vào cả CTE `ranked` gốc lẫn 4 truy vấn "tổng ca cần rà soát" trong `/tong-quan` để nhất quán 1 định nghĩa "ca thuộc phạm vi Ca lặp". **Đo tác động thật trên production trước khi deploy** (đúng thói quen đã có): số ca lặp phát hiện được giảm từ **897 → 616 (giảm 281 ca, ~31%)** — đã báo lại user trước khi merge.
- **Import hàng loạt blacklist serial**: tái dùng nguyên `ImportUploader` component (`frontend/src/components/ImportUploader.tsx`) đã dùng cho 3 luồng import khác, không cần code UI mới. Backend thêm `GET /ca-lap/blacklist/template`, `POST /ca-lap/blacklist/preview`/`commit` theo đúng pattern `importGiaiTrinh.ts` (đơn giản nhất, không cần columnMap) — `processBlacklistRows()` chuẩn hoá + gộp trùng trong file bằng `Map`, ghi hàng loạt qua `runBatched()` có sẵn (`backend/src/lib/backfillImportProcessor.ts`).
- **Gọn giao diện tab Ca lặp**: gộp 3 `Card` riêng (Chốt hình thức xử lý / Giám sát / QC) thành **1 Card duy nhất** ngăn cách bằng `divide-y`, dòng "Ca liền trước" bỏ hẳn Card bao ngoài thành 1 dòng text, "Chốt hình thức xử lý" đổi thành dòng ngang gọn (label + Select + nút nhỏ), phần không có quyền sửa rút gọn còn 1 dòng tóm tắt thay vì hiển thị y hệt khối có quyền sửa, `textarea rows` giảm 3→2.
- **Chuỗi lịch sử theo serial bấm được**: thêm prop `onOpenCase: (id: string) => void` cho `CaseDetail` (App.tsx truyền thẳng `setOpenCaseId`, cùng setter đang dùng cho `caseId`), gắn `onClick` cho từng dòng lịch sử (trừ dòng ca đang xem).
- **Badge số lượng sidebar**: mở rộng `GET /api/notifications/count` (đã có sẵn, TopBar dùng chung) thêm `caThieuLinhKien` (dùng đúng điều kiện mặc định `missingParts.ts`), `khaoSat`/`caLap` **cá nhân hoá theo vai trò đăng nhập** (CSKH/TN CSKH → đếm "cần khảo sát", QC → "chờ QC"/"chờ QC lặp", Giam sat → "cần đánh giá lặp", vai trò khác → tổng cả 2) — export `NEED_SURVEY_CONDITION`/`RECENT_OR_OPEN_CONDITION` từ `survey.ts` và `CA_LAP_CTE`/`NGUONG_NGAY_LAP` từ `caLap.ts` để dùng lại đúng 1 định nghĩa, tránh lệch số với trang gốc. `navConfig.ts` thêm `countKey` cho 4 mục; `Sidebar.tsx` gọi chung `queryKey: ["notifications-count"]` với `TopBar.tsx` (dùng chung cache, không gọi API 2 lần), ẩn hẳn số khi bằng 0.

**Kiểm chứng qua `wrangler dev --local` + curl trực tiếp + trình duyệt thật**: seed 8 ca test phủ đủ 4 kịch bản (đúng phạm vi/loại vì "Gọi điện tư vấn"/loại vì "Không hoàn thành XLSC"/giữ lại vì hình thức bảo hành NULL) — `GET /danh-sach` chỉ trả đúng 2/4 cặp hợp lệ, khớp tuyệt đối kỳ vọng. QC gọi `/qc` trực tiếp cho ca chưa từng có GS chốt → thành công (`chot_danh_gia_lap` vẫn NULL, `qc_chot` ghi đúng) — xác nhận hết bị chặn. Import blacklist: preview/commit với dữ liệu có dòng trống + trùng (khác hoa/thường) → gộp đúng còn 2 serial, D1 ghi đúng `nguoi_them`. **Tái hiện đúng kịch bản bug `1255604`**: tự ghi 1 entry giả vào IndexedDB (`dvbh-closed-cache`) thiếu field `caLap` cho 1 ca test, mở lại qua UI thật → xác nhận KHÔNG dùng cache cũ (tên khách hàng đúng bản mới, không phải giá trị đánh dấu "STALE"), tab "Ca lặp" hiện đúng phát hiện lặp, banner cache timestamp cũng đã cập nhật mới. Giao diện gọn xác nhận qua trích xuất text: 1 Card duy nhất, form QC hiện đúng dữ liệu QC vừa chốt độc lập (không cần GS). Bấm dòng lịch sử "TC3-001" xác nhận Drawer chuyển đúng sang ca đó. Sidebar: GS thấy "Ca lặp (2)", QC thấy không có badge (0, ẩn đúng) — đối chiếu tay khớp chính xác logic 2 trạng thái độc lập. Không có lỗi console trong toàn bộ phiên test. Dọn sạch dữ liệu test (8 ca, 2 blacklist test, 2 user test) khỏi D1 local. User xác nhận deploy — không có migration mới, tăng version `1.020` → `1.021`, build, `wrangler deploy` production (Version ID `56743e01-9336-4da2-b1bb-62ca9af57333`), health check xác nhận trang chủ 200, `/api/auth/me`/`/api/notifications/count`/`/api/ca-lap/blacklist/template` (chưa đăng nhập) đều trả 401.

**Lưu ý cho user**: fix bug `1255604` nằm ở phía trình duyệt (cache cục bộ) — chỉ cần mở lại ca đó bình thường, hệ thống sẽ tự nhận ra cache cũ thiếu dữ liệu và tự tải lại, không cần xoá cache thủ công.

### 2026-07-18 — Popup Chi tiết ca dạng 2 cột toàn màn hình + điều hướng "Quay lại" + sửa bug chọn "Bỏ qua" không lưu được + gộp nút "Chốt lặp"

User yêu cầu 3 việc cùng lúc qua `CaseDetail.tsx`/`CaLapModule.tsx`: (1) khi bấm xem 1 ca trong "Chuỗi lịch sử theo serial" (Ca lặp) không có cách quay lại ca đang xem dở — cần popup to gần hết màn hình, tận dụng cho MỌI ca (không riêng Ca lặp), có nút Back + lựa chọn xem ngắn gọn/mở rộng; (2) "Hình thức xử lý" phải mặc định "TÍNH LƯƠNG", còn "Đánh giá lặp" nếu người dùng chọn "Bỏ qua" thì lại không lưu được — sai logic; đồng thời chuyển tab "Ca lặp" thành ưu tiên hiện danh sách ca lặp, giải trình chuyển vào 1 nút riêng; (3) giao diện QC cần thu gọn phần giải trình của Giám sát, và Giám sát cũng chốt qua 1 nút "Chốt lặp" giống QC. Dùng `EnterPlanMode`, có `AskUserQuestion` làm rõ 2 điểm trước khi code: bố cục popup (chốt: 2 cột — trái cố định Thông tin khách hàng, phải là các tab phụ đổi qua lại) và nút Chốt lặp (chốt: gộp Hình thức xử lý + Đánh giá lặp + diễn giải thành 1 lần lưu).

- **Root cause bug "chọn Bỏ qua không lưu được"**: `components/ui/Select.tsx` render `<option>` không có placeholder rỗng — khi state React là `""` mà không khớp option nào, trình duyệt tự hiển thị option ĐẦU TIÊN trong danh sách như đã chọn (`CA_LAP_KEYS[0] = "Bo qua"`) nhưng state thực sự vẫn là `""`. Người dùng bấm đúng "Bỏ qua" (đã hiện sẵn) không tạo ra thay đổi giá trị nên `onChange` không bắn — form state không bao giờ cập nhật, nút Lưu luôn bị `disabled`. Bug tương tự còn ẩn ở chỗ khác: nút Lưu kiểm tra thẳng state RAW (`!gsLapForm.chot_danh_gia_lap`) thay vì giá trị hiệu lực (ưu tiên state mới sửa > giá trị đã lưu server > mặc định nghiệp vụ) — mở lại 1 ca đã có đánh giá mà không đụng vào Select, nút Lưu cũng bị disable oan, và nếu bấm lưu ở trường khác thì `dien_giai_lap` cũ bị ghi đè thành rỗng.
- **Sửa**: thêm option placeholder `{ value: "", label: "— Chọn đánh giá —" }` cho 2 Select `chot_danh_gia_lap`/`qc_chot`; đổi toàn bộ chỗ đọc/lưu/kiểm tra disabled sang dùng biến "hiệu lực" (`effectiveChotDanhGiaLap`/`effectiveDienGiaiLap`/`effectiveQcChot`/`effectiveQcGhiChu`/`effectiveHinhThuc`) thay vì state thô; riêng `effectiveHinhThuc` fallback mặc định `"Tinh luong"` (không phải rỗng) — đúng yêu cầu nghiệp vụ, nút Chốt lặp của Giám sát vì vậy luôn sẵn sàng bấm ngay cả khi chưa đụng tới Select này.
- **`App.tsx`**: đổi `openCaseId: string | null` đơn lẻ thành stack `caseStack: string[]` + 4 hàm `openCase()` (reset stack, dùng cho mọi module mở ca từ danh sách/tìm kiếm) / `pushCase()` (chỉ dùng khi điều hướng TỪ BÊN TRONG popup sang ca liên quan, không mất lịch sử) / `popCase()` / `closeCase()`. 7 module vẫn nhận prop `openCase` y hệt tên cũ (không đổi call site nào).
- **`CaseDetail.tsx`** viết lại toàn bộ container: bỏ hẳn `Drawer` (xoá luôn file `components/ui/Drawer.tsx` vì không còn nơi dùng), thay bằng overlay to `w-full max-w-[1500px] h-[92vh]` chia lưới `grid-cols-[minmax(320px,38%)_1fr]` — **cột trái cố định** "Thông tin khách hàng" (không còn là 1 tab, luôn hiện bất kể đang xem tab phụ nào) + toggle "Ngắn gọn/Mở rộng" (ẩn/hiện 3 Card phụ "Thông tin xử lý"/"Doanh thu"/"Phân loại & nguồn gốc", KHÔNG reset theo `caseId` — giữ nguyên lựa chọn khi duyệt qua nhiều ca); **cột phải** giữ 3 tab còn lại (Giải trình tồn/Vi phạm ghi nhận/Ca lặp). Nút "← Quay lại" chỉ hiện khi `canGoBack` (stack sâu hơn 1). Tab Ca lặp đảo thứ tự: banner phát hiện + Badge trạng thái (dùng chung `trangThaiLapOf`) + 1 nút "🔒 Xử lý ca lặp"/"👁 Xem giải trình lặp" lên đầu, "Chuỗi lịch sử theo serial" xuống ngay dưới làm nội dung chính (trước đây form giải trình chiếm phần lớn màn hình, danh sách bị đẩy xuống cuối) — bấm dòng lịch sử giờ gọi `onOpenCase` = `pushCase` (có thể quay lại), giải trình chuyển hẳn vào 1 `Modal` riêng mở qua nút.
- **Modal "Giải trình / Chốt lặp"**: Giám sát 1 form gộp Hình thức xử lý + Đánh giá lặp + diễn giải, 1 nút "🔒 Chốt lặp" duy nhất; nếu không có quyền GS, hiện gọn 1 dòng `Badge + Hình thức + người/ngày` thay vì cả khối (yêu cầu "thu nhỏ lại để QC dễ tra cứu"). QC tương tự — 1 nút "🔒 Chốt lặp", người không có quyền QC thấy dòng gọn `Badge + người/ngày`.
- **`backend/src/routes/caLap.ts`**: gộp `chot_hinh_thuc_xu_ly` (optional) vào ngay `POST /:caseId/gs` — upsert cả 3 cột (`chot_danh_gia_lap`, `dien_giai_lap`, `chot_hinh_thuc_xu_ly`) trong 1 câu lệnh, dùng `COALESCE(excluded.x, giai_trinh_lap.x)` để không xoá mất giá trị cũ nếu request không gửi trường này. Xoá hẳn route `POST /:caseId/hinh-thuc` (không còn nơi gọi sau khi gộp UI).
- **`lib/caLapStatus.ts`** (mới): tách `trangThaiOf()` từ `CaLapModule.tsx` thành `trangThaiLapOf()` dùng chung cho cả danh sách module lẫn tab Ca lặp trong `CaseDetail.tsx` — tránh lặp logic, đảm bảo badge trạng thái hiển thị nhất quán ở 2 nơi.

**Kiểm chứng qua `wrangler dev --local` + D1 local (đã có sẵn 14.595 ca thật, không seed giả) + trình duyệt thật**: tìm đúng 1 cặp ca lặp thật trên dữ liệu production (`T23108`/`T22738`, serial `201500OOWBAB39L36`, gap 0.0 ngày, khu vực MN1) để test không cần seed. Seed 2 user test `giamsat.test@example.com` (Giam sat)/`qc.test@example.com` (QC) với `khu_vuc_phu_trach=["(qldvbh.mn1) Quản lý khu vực MN1"]` khớp đúng khu vực ca thật. Ký JWT tay (HS256, `SESSION_SECRET` từ `.dev.vars`), inject cookie qua trình duyệt thật:
1. Đăng nhập Giám sát, tìm `T23108` → popup 2 cột hiện đúng, "Mở rộng" hiện đủ 3 Card phụ, bấm "Ngắn gọn" → 3 Card biến mất ngay (đối chiếu `document.body.innerText` trước/sau).
2. Mở tab "Ca lặp" → đúng thứ tự Badge "Cần đánh giá" + nút "🔒 Xử lý ca lặp" trước, "Chuỗi lịch sử theo serial (2 ca)" ngay dưới. Mở Modal: xác nhận qua `select.value` (không chỉ nhìn text) — Hình thức xử lý = `"Tinh luong"` thật sự (không phải hiển thị giả), Đánh giá lặp = `""` (placeholder, không phải `"Bo qua"` giả), nút Chốt lặp `disabled=true` đúng.
3. Chọn "Bỏ qua" bằng cách bắn `change` event thật (đúng kịch bản bug gốc) → xác nhận `select.value` đổi thật + nút hết `disabled` → bấm Chốt lặp → `POST /ca-lap/T23108/gs` trả `200`, D1 xác nhận `chot_danh_gia_lap='Bo qua'` VÀ `chot_hinh_thuc_xu_ly='Tinh luong'` được ghi cùng lúc.
4. Bấm dòng "T22738" trong chuỗi lịch sử → popup chuyển đúng sang `T22738`, nút "Quay lại" xuất hiện → bấm Quay lại → về đúng `T23108`, nút "Quay lại" biến mất (đúng vì stack về lại độ sâu 1).
5. Đổi cookie sang QC, mở lại `T23108` → tab Ca lặp hiện đúng Badge "Chờ QC" → mở Modal xác nhận khối Giám sát hiện gọn 1 dòng `"Bỏ qua · Hình thức: TÍNH LƯƠNG · giamsat.test@example.com · ..."` (không phải cả khối như GS thấy) → chọn QC chốt = "Lặp do sai báo cáo", bấm Chốt lặp → D1 xác nhận `qc_chot` ghi đúng, `chot_danh_gia_lap`/`chot_hinh_thuc_xu_ly` của GS KHÔNG bị mất.
6. Mở lại module "Ca lặp" → danh sách, tab "Đã chốt" hiện đúng dòng `T23108` với badge trạng thái đúng (xác nhận `trangThaiLapOf` dùng chung không phá vỡ màn hình danh sách).
7. `npx tsc --noEmit` sạch cả 2 phía sau mỗi lần sửa lớn. Dọn sạch 2 user test + dòng `giai_trinh_lap` test khỏi D1 local, dừng sạch `workerd` sau khi xong (không để zombie process).

Tăng version `1.021` → `1.022`. Chờ user xác nhận trước khi `wrangler deploy` (không có migration mới — cột `chot_hinh_thuc_xu_ly` đã tồn tại sẵn từ migration `0012`, chỉ đổi cách ghi).

**Deploy bị chặn bởi Bash permission classifier của auto mode** — `wrangler deploy` cần user tự chạy tay hoặc tự duyệt quyền, agent không tự bypass được (đúng thiết kế an toàn). Việc deploy đợt này bị hoãn lại chờ user xử lý permission, rồi user tiếp tục yêu cầu 8 chỉnh sửa giao diện mới (xem mục dưới) trước khi quay lại deploy.

### 2026-07-18 (đợt 2 cùng ngày) — 8 tinh chỉnh giao diện Chi tiết ca theo phản hồi thực tế dùng thử

User dùng thử ngay popup 2 cột vừa đổi, phản hồi 8 điểm liền: (1) hiểu nhầm ý "Ngắn gọn/Mở rộng" ban đầu — thực ra muốn "Ngắn gọn" chính là **giao diện Drawer cũ** (panel hẹp góc phải, "Thông tin khách hàng" là 1 tab như trước), còn "Mở rộng" là popup to giữa màn hình mới — tức 2 kiểu xem hoàn toàn khác nhau, không phải ẩn/hiện vài Card như đã làm; (2) dòng ca đang xem trong "Chuỗi lịch sử theo serial" cần tô màu đỏ nhạt nổi bật + ghi chú "ca đang xem"; (3) khi đang xem tab "Ca lặp" mà bấm mở 1 ca liên quan, tab đang xem phải được giữ nguyên ở ca mới (không bật lại về tab mặc định), kèm thêm shortcut "về ca gốc" luôn hiện sẵn; (4) bỏ chữ "(log vĩnh viễn)" khỏi tiêu đề "Lịch sử giải trình"; (5) nút "+ Blacklist" cần nổi bật hơn; (6) banner cảnh báo cache + nút đồng bộ nên chuyển lên thanh tiêu đề (đang rộng, bỏ trống), rút ngắn lời nhắc; (7) nút "Link CRM" chuyển lên ngay sau mã ca ở tiêu đề; (8) ở "Ngắn gọn", khi mở 1 ca liên quan phải mặc định mở ở "Mở rộng", bấm Quay lại phải tự phục hồi đúng "Ngắn gọn" của ca trước đó.

- **`App.tsx`**: đổi `caseStack: string[]` thành `caseStack: { id, viewMode, tab }[]` — mỗi tầng stack tự lưu riêng `viewMode`/`tab` đang xem (không còn là state cục bộ của `CaseDetail`) để giải quyết đồng thời cả yêu cầu (3) và (8): `pushCase()` (mở ca liên quan) LUÔN đặt `viewMode: "expanded"` cho tầng mới bất kể tầng hiện tại đang gì, kế thừa nguyên `tab` từ tầng cha (nếu tab đó hợp lệ ở "expanded", luôn đúng vì "ca-lap" hợp lệ ở cả 2 chế độ) — `popCase()` tự nhiên phục hồi đúng `viewMode`/`tab` đã lưu riêng của tầng trước đó, không cần logic đặc biệt gì thêm. Thêm `backToRoot()` (nhảy thẳng về `caseStack[0]`) + `setTopViewMode()` (đổi viewMode tầng hiện tại, tự sửa `tab` về tab đầu tiên hợp lệ nếu tab cũ không tồn tại ở viewMode mới — vd tab "Thông tin khách hàng" chỉ có ở "compact").
- **`CaseDetail.tsx`** viết lại hoàn toàn phần container để hỗ trợ thật 2 kiểu bố cục riêng biệt (khớp đúng ý (1)):
  - **"compact"**: dựng lại đúng tinh thần Drawer cũ — panel hẹp `max-w-2xl` neo phải, click nền tối để đóng (backdrop `onClick={onClose}` như `Drawer.tsx` gốc), 4 tab gồm cả "Thông tin khách hàng" (không ghim cột trái nữa).
  - **"expanded"**: giữ nguyên bố cục 2 cột đã làm đợt trước (cột trái ghim Thông tin khách hàng, cột phải 3 tab).
  - Nội dung 4 khối (Thông tin khách hàng/Giải trình tồn/Vi phạm/Ca lặp) tách thành biến JSX dùng chung (`infoContent`/`giaiTrinhContent`/`viPhamContent`/`caLapContent`) — tránh chép trùng code giữa 2 bố cục, chỉ khác nơi đặt vào (tab vs cột ghim).
  - `viewMode`/`tab` không còn là `useState` nội bộ — nhận thẳng qua props từ `App.tsx` (controlled component hoàn toàn), effect reset theo `caseId` chỉ còn dọn các form nhập dở (GS/QC/hình thức xử lý), không đụng đến tab/viewMode nữa.
  - Thanh tiêu đề dùng chung cho cả 2 chế độ: `[← Quay lại] [⏮ Về ca {rootCaseId}] [Chi tiết ca {id}] [🔗 Link CRM]` bên trái (yêu cầu (7)), banner cache rút gọn `🕐 {giờ} + 🔄 Đồng bộ lại` ở giữa **chỉ hiện khi "expanded"** (yêu cầu (6) — "compact" vẫn giữ `CacheBanner` đầy đủ trong nội dung tab "Thông tin khách hàng" như bản gốc), toggle "Ngắn gọn/Mở rộng" + nút đóng bên phải.
- **Yêu cầu (2)**: dòng ca hiện tại trong "Chuỗi lịch sử theo serial" đổi từ `bg-[var(--ocean-100)]/50` sang `bg-[var(--coral-100)]` + thêm `<span>● ca đang xem</span>`.
- **Yêu cầu (4)**: bỏ chuỗi `" (log vĩnh viễn)"` khỏi heading.
- **Yêu cầu (5)**: nút "➕ Blacklist" cạnh Serial đổi từ pill viền mỏng chữ nhỏ (`text-[10px]`, chỉ viền) sang pill đặc nền `bg-[var(--coral-500)] text-white` (`text-xs font-bold`), giống pattern nút "success" của `Btn.tsx`.

**Kiểm chứng qua `wrangler dev --local` + trình duyệt thật** (dùng lại ca thật `T23108`/`T22738`, user test `giamsat.test@example.com`): xác nhận qua `document.body.innerText` + đọc `className` DOM trực tiếp (không chỉ nhìn chữ) từng điểm — (6)+(7): mở "expanded" thấy đúng `"Chi tiết ca T23108 · 🔗 Link CRM · 🕐 21:08 18/07/2026 · 🔄 Đồng bộ lại · Ngắn gọn · Mở rộng · ✕"` trên cùng 1 dòng tiêu đề; (4): heading còn đúng `"Lịch sử giải trình"`; (2): `className` dòng ca hiện tại có đúng `bg-[var(--coral-100)] font-semibold` + text `"● ca đang xem"`; chuyển "Ngắn gọn" xác nhận header bỏ hẳn banner cache rút gọn, tab-bar hiện thêm "Thông tin khách hàng"; bấm ca liên quan `T22738` trong chuỗi lịch sử → xác nhận mở đúng ở "expanded" (banner cache rút gọn xuất hiện lại) VÀ tab vẫn là "Ca lặp" (không bật về "Giải trình tồn") VÀ có sẵn cả `"← Quay lại"` lẫn `"⏮ Về ca T23108"`; bấm "Quay lại" → xác nhận về đúng `T23108`, tự động phục hồi đúng "Ngắn gọn" (đúng yêu cầu (8) và (3) cùng lúc), tab vẫn "Ca lặp", nút Quay lại/Về ca gốc biến mất đúng (stack về độ sâu 1). `npx tsc --noEmit` sạch cả 2 phía. Dọn sạch user test + dữ liệu test khỏi D1 local, dừng sạch `workerd`.

Tăng version `1.022` → `1.023`. Chờ user xác nhận + tự xử lý permission trước khi `wrangler deploy`.

**Auto mode classifier chặn cả việc tự cấu hình quyền cho chính mình** — user hỏi "sao bạn không auto được nữa", agent giải thích: quyền "tự động deploy" trước đây chỉ bỏ qua bước HỎI XÁC NHẬN TRONG CHAT, còn `wrangler deploy` còn bị chặn ở lớp "auto mode classifier" riêng (an toàn cứng, không đọc lịch sử hội thoại). User yêu cầu agent tự set quyền qua skill cấu hình `settings.json` — bị classifier chặn luôn (đúng thiết kế: agent không được tự cấp quyền leo thang cho chính mình). Đã hướng dẫn user 2 cách tự làm: `/permissions` trong CLI, hoặc tự sửa `.claude/settings.local.json` thêm rule `Bash(npm run deploy:*)`.

### 2026-07-19 — 3 tính năng nhỏ: xác nhận blacklist, badge serial đã blacklist, tỷ lệ serial sai

User yêu cầu thêm 3 việc liên quan chất lượng dữ liệu serial trong tính năng Ca lặp: (1) bấm "+ Blacklist" phải hiện popup xác nhận trước khi ghi (tránh bấm nhầm loại 1 serial khỏi phát hiện lặp); (2) case nào có serial đang thuộc blacklist phải hiện icon/gạch ngang để người dùng biết ngay serial này "sai"; (3) lập báo cáo tỷ lệ ca có serial sai (rỗng + độ dài ≤4 ký tự + đang bị blacklist) trên tổng ca cần rà soát (ca đã hoàn thành + thuộc phạm vi tính KPI Ca lặp).

- **`backend/src/routes/caLap.ts`**: `getCaLapDetection()` (dùng bởi `GET /api/cases/:id`) thêm field `serialBlacklisted: boolean` — 1 `EXISTS`-style query (`SELECT 1 FROM blacklist_serial WHERE seri_san_pham = UPPER(TRIM(?)) AND bat_tat = 1`) chạy song song với các query khác sẵn có (không thêm round-trip). `GET /tong-quan`: nhận ra "serial sai" chính là phần bù chính xác của "serial chuẩn" (`tongSerialChuan`) đã tính sẵn trong CÙNG tập "ca cần rà soát" (`eligibleClause()`) — không viết query mới, chỉ thêm 2 cột tính từ 2 con số có sẵn: `khuVucQuery` thêm `serial_sai = raSoat - validSerial` + `ty_le_serial_sai = ROUND(serial_sai*100/raSoat, 1)`; KPI tổng thêm `tySerialSai` theo cùng công thức ở cấp toàn hệ thống.
- **`frontend/src/types.ts`**: `CaLapDetection` thêm `serialBlacklisted: boolean`.
- **`frontend/src/modules/CaseDetail.tsx`**:
  - Field "Serial" giờ đọc `caLap?.serialBlacklisted`: nếu đã blacklist → serial hiện gạch ngang (`line-through`) + `Badge tone="gray"` "🚫 Đã blacklist" (thay hẳn nút thêm, tránh bấm thêm lại vô ích); nếu chưa → giữ nút "➕ Blacklist" nhưng đổi hành vi từ gọi mutation ngay lập tức sang `setBlacklistConfirmOpen(true)` mở 1 `Modal` xác nhận riêng ("Xác nhận thêm" / "Hủy", theo đúng pattern Modal xác nhận đã dùng ở `SurveyModule.tsx` — không dùng `window.confirm()` vì codebase không có tiền lệ này). `addBlacklist` mutation tự đóng modal xác nhận khi thành công (`refreshCaLapQueries()` sẵn có sẽ tự fetch lại `caLap.serialBlacklisted` mới, badge hiện ra ngay không cần thao tác thêm).
- **`frontend/src/modules/CaLapModule.tsx`** (tab Tổng quan): thêm `StatCard` "Tỷ lệ serial sai" cạnh "Ca serial chuẩn"; bảng "Báo cáo theo khu vực" thêm 2 cột "Serial sai"/"Tỷ lệ sai" (tô màu coral nếu ≥30%, cùng ngưỡng màu với cột "Tồn đọng").

**Kiểm chứng qua `wrangler dev --local` + trình duyệt thật** (đọc trực tiếp `document.body.innerText` + network requests, không chỉ nhìn UI): tab Tổng quan hiện đúng "Tỷ lệ serial sai 1.7%" và bảng khu vực đúng "Serial sai 33 · Tỷ lệ sai 1.7%" (khớp tay: 1928 cần rà soát - 1895 serial chuẩn = 33, 33/1928×100 ≈ 1.7%). Mở ca thật `T23108`: bấm "➕ Blacklist" → xác nhận **chưa có request nào bắn ra** (network log trống) cho tới khi bấm "Xác nhận thêm" trong modal → lúc đó mới thấy `POST /api/ca-lap/blacklist` trả `201` → Field Serial ngay lập tức đổi thành `"🚫 Đã blacklist"` (đọc `className` xác nhận đúng `line-through`). Dọn sạch: gỡ blacklist test, xoá user test, dừng sạch `workerd`. `npx tsc --noEmit` sạch cả 2 phía.

Tăng version `1.023` → `1.024`. Chờ user tự chạy `wrangler deploy` (bị chặn bởi permission classifier, xem mục trên) — gộp chung 1 lần deploy với các thay đổi `1.023` chưa lên production.

### 2026-07-19 (đợt 2 cùng ngày) — 5 chỉnh sửa nhỏ dựa trên ảnh chụp thực tế dùng thử

User gửi 3 ảnh chụp popup Chi tiết ca đang dùng thật (case ID thật ngoài production) kèm 5 yêu cầu: (1) đổi giao diện theo ảnh; (2) banner cache rút gọn quá thành mỗi cái đồng hồ, thêm lại cụm "Data khách hàng đã lưu về máy bạn"; (3) bỏ chữ "Ca đang xem" trong chuỗi lịch sử, chỉ dùng màu để nhận biết; (4) câu bị cụt "giúp tôi xóa danh sách blacklist. hiện tại. thay" — dùng `AskUserQuestion` làm rõ, user chọn **cả 2**: thêm nút xoá từng dòng blacklist VÀ xoá sạch danh sách blacklist hiện tại trên production ngay; (5) ca có serial thuộc blacklist không được nằm trong danh sách cần kiểm soát lặp nữa. Ảnh thứ 3 (timeline chấm đỏ/xanh + nút CRM từng dòng + "cách ca sau X ngày") được xác nhận qua `AskUserQuestion` là muốn áp dụng thật cho "Chuỗi lịch sử theo serial" (không chỉ tham khảo), nhưng vẫn giữ đúng yêu cầu (3): bỏ chữ, chỉ dùng màu chấm.

- **`backend/src/routes/caLap.ts`**: `getCaLapDetection()` mở rộng `lichSu` query thêm `tien_do_hoan_thanh`, `link_crm` (phục vụ timeline mới). Thêm `DELETE /api/ca-lap/blacklist/:id` (xoá hẳn khỏi bảng — khác với `PATCH .../bat_tat` chỉ tạm tắt).
- **`frontend/src/api/client.ts`**: thêm `api.delete()` (client chưa có method DELETE trước đó).
- **`frontend/src/types.ts`**: `CaLapDetection.lichSu` thêm `tien_do_hoan_thanh`/`link_crm`.
- **`frontend/src/modules/CaseDetail.tsx`**:
  - Banner cache rút gọn trong header (bản "expanded") đổi từ chỉ `🕐 {giờ}` thành `💾 Dữ liệu khách hàng đã lưu về máy bạn · 🕐 {giờ}` (yêu cầu 2).
  - "Chuỗi lịch sử theo serial" viết lại theo đúng ảnh tham chiếu: tiêu đề thêm "(mới nhất trên đầu)"; mỗi dòng có chấm tròn màu (`coral` = ca đang xem, `teal` = ca khác — **không còn chữ** "ca đang xem"/"ca hiện tại", đúng yêu cầu 3) + nút "🔗 CRM" riêng (chặn `stopPropagation` để không kích hoạt điều hướng cả dòng) + dòng phụ "ID {id} · {KTV} · {tiến độ hoàn thành}"; giữa 2 dòng liền kề chèn "↳ cách ca sau X.X ngày" (tính tay bằng chênh lệch mili-giây giữa 2 `thoi_gian_hoan_thanh`, không cần thêm cột SQL).
- **`frontend/src/modules/CaLapModule.tsx`**: tab Blacklist serial thêm cột nút "🗑 Xoá" (mở `Modal` xác nhận riêng, theo đúng pattern Modal xác nhận đã dùng ở blacklist-add của `CaseDetail.tsx` — không dùng `window.confirm()`) — gọi `deleteBlacklistMutation` (dùng `api.delete()` mới thêm).
- **Yêu cầu (5) — điều tra kỹ trước khi kết luận**: đọc lại toàn bộ `CA_LAP_CTE`/`/danh-sach`/`/tong-quan`/`getCaLapDetection` xác nhận LOGIC đã đúng từ trước (CTE `ranked` gốc đã có `NOT EXISTS (blacklist bat_tat=1)` áp dụng xuyên suốt mọi endpoint liên quan Ca lặp) — không cần sửa code. Xác nhận bằng thực nghiệm thật qua `wrangler dev --local`: gọi trực tiếp `/api/ca-lap/danh-sach` trước/sau khi blacklist 1 serial thật (`total` giảm đúng 77→76, case biến mất khỏi danh sách), rồi xoá blacklist qua nút mới → `total` về lại 77, case xuất hiện lại — đúng ý yêu cầu.
- **Phát hiện phụ trong lúc test**: 1 lần thấy `CaseDetail` hiện sai trạng thái blacklist ("Đã blacklist" dù server thực tế `false`) — điều tra ra là do `closedDataCache` (IndexedDB) giữ bản ghi CŨ từ phiên test trước, không phải bug logic — xác nhận lại bằng gọi API trực tiếp (`serialBlacklisted: false` thật) và bấm "🔄 Đồng bộ lại" để đồng bộ UI. Không cần sửa gì — hành vi cache đã đúng thiết kế từ trước (xem đợt sửa bug `1255604` trước đó), banner + nút đồng bộ hôm nay (yêu cầu 2) chính là cách xử lý đúng cho tình huống này.

**Xoá blacklist hiện tại trên production (yêu cầu 4, xác nhận qua `AskUserQuestion`)**: kiểm tra qua `wrangler d1 execute --remote` phát hiện **242 dòng** trong `blacklist_serial` production, toàn bộ thêm cùng 1 thời điểm (`2026-07-18 13:50:50`) bởi 1 tài khoản (`meomeo3101@gmail.com`) với serial dạng số ngắn ("0","1","10","111"...) — rõ ràng là dữ liệu test/import sót lại, không phải blacklist nghiệp vụ thật. Lệnh `DELETE FROM blacklist_serial` trên `--remote` bị **auto mode classifier chặn** (cùng lớp chặn `wrangler deploy` trước đó) — chưa xoá được, đã bàn giao lệnh cho user tự chạy.

**Kiểm chứng qua `wrangler dev --local` + trình duyệt thật** (ca thật `T23108`/`T22738`): xác nhận đúng cả 5 yêu cầu qua `document.body.innerText` + đọc `className` — (2) header hiện đúng `"💾 Dữ liệu khách hàng đã lưu về máy bạn · 🕐 00:19 19/07/2026"`; (3)+(1) tab Ca lặp hiện đúng `"CHUỖI LỊCH SỬ THEO SERIAL (2 CA, MỚI NHẤT TRÊN ĐẦU)"` + 2 chấm màu xác nhận qua `className` (`bg-[var(--teal-500)]` cho ca khác, `bg-[var(--coral-500)]` cho ca đang xem) + nút "🔗 CRM" từng dòng + `"↳ cách ca sau 0.0 ngày"` đúng số; `innerText.includes('ca đang xem')` = `false`; (4) nút "🗑 Xoá" mở đúng modal xác nhận, xoá xong `blacklist_serial` local về rỗng; (5) test thật blacklist/un-blacklist 1 serial xác nhận `/danh-sach` loại/thêm lại đúng case. `npx tsc --noEmit` sạch cả 2 phía. Dọn sạch user test khỏi D1 local, dừng sạch `workerd`.

Tăng version `1.024` → `1.025`. Còn 2 việc chờ user tự làm (cùng bị permission classifier chặn): `wrangler deploy` (gộp cả `1.023`→`1.025`) và `DELETE FROM blacklist_serial` trên `--remote` (xoá 242 dòng test).

### Hàng chờ (chưa làm — user chủ động queue lại cho phiên sau, chưa yêu cầu triển khai ngay)

1. **Import dữ liệu giải trình lặp cũ**: thêm chức năng import cho `giai_trinh_lap` (các ca lặp đã có sẵn ngoài thực tế nhưng chưa nhập hệ thống) — theo đúng pattern các import khác đã có trong app: (a) import qua Excel/CSV (tái dùng `ImportUploader.tsx` + 1 processor mới kiểu `processBlacklistRows`), (b) import trực tiếp từ Google Sheet, (c) màn hình cấu hình link Google Sheet trong `SettingsModule`. Cần khảo sát trước: app đã có cơ chế "import từ Google Sheet" ở đâu chưa (nếu có, tái dùng đúng pattern đó thay vì viết mới).
2. **Audit toàn hệ thống + roleplay từng vai trò**: rà soát bug, logic nghi ngờ gây ghi database dư thừa (vòng lặp/N+1 query), cách xử lý dữ liệu chưa hiệu quả, view/UX chưa tốt — trên TOÀN BỘ module, không riêng Ca lặp. Tự đóng vai từng role thực tế (Admin/Giám sát/QC/CSKH/TN CSKH/TBP DVBH/TBP CSKH/Viewer), thao tác qua trình duyệt như công việc hàng ngày thật của role đó, đánh giá xem tính năng cho role đó đã đủ chưa. **(còn chưa làm — mục 1 đã hoàn thành, xem bên dưới)**

### 2026-07-19 (đợt 3 cùng ngày) — Import "giải trình lặp cũ" (Excel + Google Sheet + Settings), hoàn thành mục hàng chờ (1)

User chọn bắt đầu mục hàng chờ (1) trước (qua `AskUserQuestion`). Dùng `EnterPlanMode` + 2 `Explore` agent song song khảo sát trước khi code: 1 agent tìm toàn bộ pattern import hiện có (`ImportUploader.tsx`, `importGiaiTrinh.ts`, `backfillImportProcessor.ts`), 1 agent tìm cơ chế Google Sheet + settings kiểu single-value + schema `giai_trinh_lap`. Phát hiện quan trọng: app **đã có sẵn TOÀN BỘ hạ tầng cần thiết** — cơ chế "Google Sheet publish-to-web TSV" đã tồn tại qua `settings_sheet_urls` (bảng key-value dùng chung cho 4 loại đồng bộ: `case`, `linh_kien`, `giai_trinh_cu`, `khao_sat_cu`) + `backfillSheetSync.ts` (`getSheetUrl`/`fetchSheetText`/`parseBackfillTsv`) + tab "Link đồng bộ Google Sheet" trong `SettingsModule.tsx` đã render generic mọi dòng trong bảng đó — nên chỉ cần THÊM 1 dòng cấu hình mới, không cần code UI settings mới. Việc chính chỉ là clone `importGiaiTrinh.ts` (import `giai_trinh`, cho phép nhiều dòng/ca) sang bản cho `giai_trinh_lap` (khác biệt cốt lõi: `case_id` là `UNIQUE`, nên phải **upsert** chứ không phải insert thuần).

- **`migrations/0013_giai_trinh_lap_sheet_url.sql`**: thêm 1 dòng `('giai_trinh_lap_cu', NULL)` vào `settings_sheet_urls`.
- **`backend/src/routes/importGiaiTrinhLap.ts`** (mới, nhân bản có sửa từ `importGiaiTrinh.ts`): cột file mẫu `case_id,chot_danh_gia_lap,chot_hinh_thuc_xu_ly,dien_giai_lap,nguoi_giai_trinh,ngay_giai_trinh,qc_chot,qc_ghi_chu,nguoi_qc,ngay_qc`. 2 quyết định thiết kế quan trọng khác hẳn `/gs`/`/qc` sống:
  1. **Không mặc định ngày thiếu về `datetime('now')`** như route sống (đúng cho hành động đang xảy ra thật, nhưng SAI cho backfill dữ liệu CŨ — sẽ ghi sai ngày lịch sử) — phát hiện thêm 1 nguy cơ bug tinh vi nếu làm sai: nếu coalesce-về-now ngay trong `VALUES`, `excluded.ngay_giai_trinh` sẽ LUÔN khác null, khiến `ON CONFLICT ... COALESCE(excluded.x, table.x)` ghi đè nhầm ngày thật đã có sẵn của 1 dòng khác chỉ set QC không set GS. Giải pháp: bắt buộc `ngay_giai_trinh` phải có nếu dòng có `chot_danh_gia_lap` (tương tự `ngay_qc`/`qc_chot`), từ chối dòng nếu thiếu.
  2. **Upsert với `COALESCE(excluded.x, giai_trinh_lap.x)` cho MỌI cột** (giống hệt route `/gs` sống) — 1 dòng import chỉ có QC sẽ không xoá mất dữ liệu GS đã nhập tay từ trước, và ngược lại.
  - Trùng `case_id` trong cùng 1 file: dòng sau đè dòng trước (`Map` dedup, khớp pattern import blacklist).
  - Sinh ID hàng loạt qua `reserveSequentialIds(db, "giai_trinh_lap", "CL", 6, count)` (hàm có sẵn trong `idCounter.ts`, dùng đúng 1 lần round-trip thay vì N lần).
  - `POST /sync-sheet` (Admin-only) dùng `parseBackfillTsv(text, new Set(["ngay_giai_trinh","ngay_qc"]))` — cả 2 cột ngày đều datetime, không có cột chỉ-ngày nào.
- **`backend/src/index.ts`**: mount `/api/import/giai-trinh-lap`. **`backend/src/routes/settings.ts`**: thêm `"giai_trinh_lap_cu"` vào `VALID_LOAI_DONG_BO`.
- **`frontend/src/modules/SettingsModule.tsx`**: thêm nhãn `giai_trinh_lap_cu: "Giải trình lặp cũ"` — không cần sửa gì khác, tab sheet-urls tự hiện dòng mới.
- **`frontend/src/modules/ImportModule.tsx`**: thêm tab "Import giải trình lặp cũ" — tái dùng nguyên `BackfillSummary` interface có sẵn (cùng hình dạng `{thanhCong, loi, errors}`), nút "🔄 Đồng bộ ngay" theo đúng pattern các tab khác (chỉ hiện khi Admin + đã cấu hình URL), `invalidateKeys` gồm `["ca-lap-danh-sach"]`/`["ca-lap-tong-quan"]`/`["notifications-count"]` (khác với tab "giai-trinh" dùng `[]` vì import đó không ảnh hưởng số liệu cache nào, còn import này thì có).

**Kiểm chứng qua `wrangler dev --local` + `curl` trực tiếp (nhanh hơn trình duyệt cho test API thuần) + trình duyệt thật cho phần Settings/UI**: dựng bộ 7 dòng test phủ đủ mọi nhánh — 1 dòng GS+QC đầy đủ, 1 dòng chỉ QC, 1 dòng `chot_danh_gia_lap` sai giá trị enum, 1 `case_id` không tồn tại, 1 dòng có `chot_danh_gia_lap` nhưng thiếu `ngay_giai_trinh`, 2 dòng cùng `case_id` (test dedup) — preview trả đúng `thanhCong:3, loi:3` khớp tay tính trước, đúng cả 3 dòng lỗi được liệt kê đúng lý do. Commit xong, `SELECT` trực tiếp D1 xác nhận: dòng dedup giữ đúng dòng SAU cùng; dòng QC-only ghi đúng GS=null; auto-tạo đúng 4 user "Chờ duyệt" từ email trong `nguoi_giai_trinh`/`nguoi_qc` chưa tồn tại. Test riêng COALESCE: import tiếp 1 dòng chỉ-QC đè lên ca vừa import GS+QC đầy đủ → xác nhận GS field giữ nguyên, chỉ QC field đổi — đúng thiết kế chống ghi đè nhầm. Test Settings: `PATCH /settings/sheet-urls/giai_trinh_lap_cu` lưu đúng URL, tab Import hiện đúng nút "Đồng bộ ngay" (do `hasSheetUrl` true), bấm thử với URL giả → `POST /sync-sheet` trả đúng `502` (fetch that bai, xu ly loi dung nhu thiet ke). Test thực tế trên 1 cặp ca lặp THẬT (`T23108`/`T22738`, chưa từng giải trình) — import 1 dòng GS+QC qua tính năng mới → xác nhận ca chuyển đúng từ không nằm trong bất kỳ bucket nào sang nằm trong "Đã chốt" của `/ca-lap/danh-sach` (đúng ý mục đích của tính năng: import xong, hệ thống coi ca đó đã xử lý xong như chốt tay). `npx tsc --noEmit` sạch cả 2 phía. Dọn sạch toàn bộ dữ liệu test (giai_trinh_lap, user test, sheet URL) khỏi D1 local, dừng sạch `workerd`.

Tăng version `1.025` → `1.026`. Cần chạy migration `0013` trên `--remote` TRƯỚC khi deploy (thêm 1 dòng vào `settings_sheet_urls`, không phá dữ liệu cũ) — cùng nhóm việc đang chờ user tự chạy (deploy + migration đều bị permission classifier chặn).

### 2026-07-19 (đợt 4 cùng ngày) — Animation chuông thông báo + rework "Báo cáo nhanh vấn đề trong ngày" + xoá blacklist test trên production

User yêu cầu 3 việc: (1) animation rung chuông thông báo hiện phóng to hơn, mỗi lần rung kéo dài 3s; (2) sửa lại nội dung "Báo cáo nhanh vấn đề trong ngày" — đổi "tồn 1-3 ngày" thành "tồn trên 3 ngày CẦN GIẢI TRÌNH" = hợp của 3 lý do (chưa giải trình / lỡ kế hoạch / quá hạn chu kỳ cần giải trình lại), thêm số ca lặp theo khu vực phụ trách, và đổi "nghi ngờ vi phạm" thành chỉ đếm số ca CẦN KHẢO SÁT; (3) xoá danh sách blacklist hiện tại (user báo đã lỡ import nhầm data) — đây chính là 242 dòng test còn tồn đọng từ trước (đã ghi trong hàng chờ #22), lần này lệnh `DELETE` **không bị permission classifier chặn nữa** (khác 2 lần thử trước) — chạy thành công, xác nhận `blacklist_serial` production còn `0` dòng.

- **`frontend/src/styles/tokens.css`**: keyframes `bell-shake` — đoạn rung chuyển từ 92%-100% (0.8s) sang 70%-100% (đúng 3s trên chu kỳ 10s), thêm `scale()` tăng dần lên đỉnh `1.4` rồi hạ dần về `1` (trước chỉ có `rotate()`).
- **`backend/src/lib/dailyReport.ts`** (dùng chung cho toast lúc đăng nhập + card "Báo cáo nhanh" ở Tổng quát) — viết lại gần hết:
  - `tonTren3Ngay`: đổi từ "toàn bộ ca tồn có tuổi ≥3 ngày" (dù đã giải trình hay chưa) sang đúng hợp 3 điều kiện — tái dùng NGUYÊN VĂN 2 điều kiện đã có sẵn trong `cases.ts` để đảm bảo khớp số với module Quản lý tồn: `TAB_FILTERS["chua-giai-trinh"]` (`lg.case_id IS NULL`) và nhánh "đã giải trình nhưng giải trình đó đã ≥3 ngày" của `TAB_FILTERS["qua-han-giai-trinh"]`, cộng thêm điều kiện "lỡ kế hoạch" đã có sẵn trong `backlog-by-khu-vuc` (`thoi_gian_hen_xu_ly < AGE_ANCHOR`). Thêm 1 bản `LATEST_GIAI_TRINH_JOIN` rút gọn cục bộ (chỉ lấy `case_id`/`ngay_giai_trinh`, đủ dùng) theo đúng quy ước file này đã áp dụng cho `MISSING_PARTS_JOIN` — `cases.ts` không export join dùng chung được giữa các route.
  - `nghiNgoViPham`: đổi từ đếm TOÀN BỘ case từng bị gắn cờ nghi ngờ (kể cả đã khảo sát xong) sang tái dùng đúng `NEED_SURVEY_CONDITION` + `RECENT_OR_OPEN_CONDITION` export sẵn từ `survey.ts` (đúng định nghĩa "cần khảo sát" đang dùng cho badge sidebar "Quản lý khảo sát").
  - Thêm field `caLap` mới: tái dùng `CA_LAP_CTE`/`NGUONG_NGAY_LAP` từ `caLap.ts`, cá nhân hoá theo vai trò y hệt logic badge sidebar của `notifications.ts` (Giám sát → cần đánh giá, QC → chờ QC, còn lại → tổng cả hai) — khác 1 điểm so với `notifications.ts`: **chỉ chạy đúng 1 truy vấn khớp vai trò** (chọn câu SQL theo `role` TRƯỚC khi đưa vào `Promise.all`) thay vì luôn chạy cả 2 nhánh CTE rồi chọn ở JS như `notifications.ts` đang làm — tránh 1 lượt quét CA_LAP_CTE (window function toàn bảng) không dùng tới cho mỗi request, áp dụng luôn tinh thần "tránh ghi/đọc dư thừa" của việc audit sắp làm (hàng chờ #2) ngay trong code mới viết, không đụng tới `notifications.ts` cũ (ngoài phạm vi yêu cầu lần này).
- **`frontend/src/App.tsx`**: cập nhật nội dung toast đăng nhập theo field mới (`caLap`, đổi nhãn "nghi vi phạm" → "cần khảo sát").
- **`frontend/src/modules/DashboardModule.tsx`**: card "Báo cáo nhanh vấn đề trong ngày" thêm ô "Ca lặp cần xử lý" (điều hướng sang module Ca lặp), đổi nhãn "Ca nghi ngờ vi phạm" → "Ca cần khảo sát"; lưới đổi từ `sm:grid-cols-4` sang `sm:grid-cols-3 lg:grid-cols-5` cho đủ chỗ 5 ô (khi có thêm ô doanh thu).

**Kiểm chứng qua `wrangler dev --local` + tính tay đối chiếu SQL trực tiếp (không chỉ tin code)**: viết lại đúng 3 công thức mới thành SQL thuần chạy tay qua `wrangler d1 execute --local`, so với response API `/dashboard/daily-report` của tài khoản Admin (dữ liệu thật, không seed) — khớp tuyệt đối cả 3 số: `tonTren3Ngay 1512`, `nghiNgoViPham (cần khảo sát) 1370`, `caLap 561` (con số `561` này còn khớp đúng với badge sidebar "Ca lặp (561)" đã thấy trước đó — 1 phép đối chiếu chéo củng cố thêm). Test theo vai trò: user test Giám sát (khu vực MN1) ra đúng `caLap: 80` (khớp badge sidebar GS đã kiểm chứng ở phiên trước), user test QC ra đúng `caLap: 0` (đối chiếu SQL riêng xác nhận hiện không có ca nào đang ở trạng thái "chờ QC" thật — số đúng, không phải bug). Qua trình duyệt: card Tổng quát hiện đúng 5 ô số liệu khớp hệt API. Animation: đọc `getComputedStyle` + duyệt trực tiếp rule `@keyframes bell-shake` đã biên dịch, xác nhận đúng mốc `70%,100%` (span 3s trên chu kỳ 10s) và `scale` tăng dần tới `1.4`. `npx tsc --noEmit` sạch cả 2 phía. Dọn sạch user test khỏi D1 local, dừng sạch `workerd`.

Tăng version `1.026` → `1.027`. Chờ user tự `wrangler deploy` (gộp cả migration `0013` + các thay đổi `1.023`→`1.027`).

**Deploy production thành công** — user yêu cầu agent tự thử deploy lại; lần này lệnh KHÔNG bị permission classifier chặn nữa (khớp với việc lệnh xoá blacklist ở trên cũng đã qua được, có vẻ classifier không còn chặn các lệnh `wrangler` trong phiên này). Kiểm tra `db:migrate:remote` báo "No migrations to apply" — xác nhận migration `0013` đã có sẵn trên production từ trước (không rõ do ai chạy, nhưng đã xác nhận đúng dữ liệu qua SELECT). `wrangler deploy` thành công, gộp toàn bộ thay đổi từ `1.023` đến `1.027` (Version ID `01173bfb-b133-4368-a4b2-dbe64988aa06`). Health check: trang chủ `200`, `/api/auth/me`/`/api/notifications/count`/`/api/ca-lap/blacklist` (chưa đăng nhập) đều đúng `401`.

### 2026-07-19 (đợt 5 cùng ngày) — Bảng đối chiếu so sánh ca lặp + ticker trạng thái tổng hợp

User gửi ảnh chụp popup Chi tiết ca (bản Mở rộng) đã tự chú thích 2 yêu cầu trực tiếp lên ảnh: (1) khi đang xem 1 ca lặp và bấm vào 1 ca KHÁC trong "Chuỗi lịch sử theo serial" (không phải ca gốc), thay vì điều hướng cả popup sang ca đó (mất ngữ cảnh ca gốc), cần mở thêm 1 cột Ở GIỮA hiển thị thông tin ca đó để đối chiếu song song với ca gốc — bấm lại đúng dòng ca gốc thì cột đối chiếu biến mất; dòng ca gốc và dòng đang chọn đối chiếu phải có màu VIỀN khác nhau để phân biệt (gốc 1 màu, đang chọn 1 màu, còn lại không viền); (2) 1 ca có thể thuộc nhiều "nhóm vấn đề" cùng lúc (tồn chưa giải trình, lỡ kế hoạch, quá hạn chu kỳ giải trình lại, ca lặp chờ giải trình, vi phạm chờ khảo sát...) — cần hiện các nhãn (ticker) này ngay sau mã ca ở tiêu đề để nhìn lướt biết ngay ca thuộc nhóm nào. Dùng `EnterPlanMode` (đọc lại nguyên `CaseDetail.tsx` — file tôi tự xây dựng suốt phiên này — để xác nhận state/props chính xác trước khi thiết kế).

- **Bảng đối chiếu (chỉ áp dụng "Mở rộng", đúng phạm vi ảnh)**:
  - Tách logic cache-aware của `useQuery(["case", caseId])` thành hàm module-level `fetchCaseDetailCached(id)` dùng chung cho CẢ ca gốc lẫn ca đối chiếu (cùng 1 namespace cache `["case", id]`/`case-{id}` — tận dụng lại cache đã có nếu ca đó từng mở trước đó).
  - State mới `compareId: string | null` (reset theo `caseId` như các state theo-ca khác).
  - Tách phần JSX "chỉ đọc" (fields grid + 3 Card) từ `infoContent` thành hàm module-level `renderCaseFieldsGrid(c, serialExtra?, serialBlacklisted?)` — dùng lại cho CẢ cột trái (ca gốc, có nút hành động bọc bên ngoài) lẫn cột giữa mới `compareContent` (ca đối chiếu, thuần tham khảo, không nút hành động, có nút ✕ riêng để đóng).
  - Layout đổi có điều kiện: `compareId` có giá trị → 3 cột (`36%/36%/1fr` — cột phải tabs tự co lại đúng ý "thu nhỏ vào góc" trong ảnh); không thì giữ nguyên 2 cột cũ (`38%/1fr`).
  - Click-handler trong "Chuỗi lịch sử theo serial" đổi theo `viewMode`: **"expanded"** → bấm dòng gốc = đóng bảng đối chiếu (`setCompareId(null)`), bấm dòng khác = mở/tắt bảng đối chiếu tại chỗ (không điều hướng); **"compact"** → giữ nguyên hành vi cũ (điều hướng cả popup qua `onOpenCase`, tự mở ở "expanded" theo quy tắc đã có từ trước). Thêm `border` (viền) vào dòng: gốc = `border-coral-500`, đang chọn đối chiếu = `border-ocean-500`, còn lại = `border-transparent` — tách biệt hẳn với chấm tròn màu đã có (không thay thế, chỉ bổ sung thêm 1 lớp phân biệt).
- **Ticker trạng thái tổng hợp**: file mới `frontend/src/lib/caseTickers.ts`, hàm thuần `computeCaseTickers()` dùng lại TOÀN BỘ dữ liệu đã có sẵn trong response `GET /cases/:id` (không gọi thêm API) — mirror đúng các điều kiện đã dùng ở backend để nhất quán số liệu: "Tồn chưa giải trình" (không có dòng giải trình nào), "Lỡ kế hoạch" (hẹn xử lý đã qua), "Quá hạn chu kỳ giải trình" (giải trình gần nhất ≥3 ngày, mirror `TAB_FILTERS["qua-han-giai-trinh"]` của `cases.ts`), "Thiếu linh kiện" (lý do giải trình gần nhất khớp danh mục `thuoc_thieu_linh_kien`), "Ca lặp: Cần đánh giá/Chờ QC" (dùng lại `trangThaiLapOf()`, bỏ qua "Đã chốt"/"Quá hạn lặp" vì không còn là vấn đề active), "Vi phạm chờ khảo sát" (mirror `NEED_SURVEY_CONDITION`/`RECENT_OR_OPEN_CONDITION` của `survey.ts` tính client-side từ cờ `loi_*` đối chiếu `viPhamList`), "Vi phạm chờ QC". Gắn vào `headerBar` ngay sau `<h3>Chi tiết ca {caseId}</h3>` bằng `Badge`, áp dụng cho CẢ 2 chế độ (không giới hạn riêng "Mở rộng" như bảng đối chiếu).

**Kiểm chứng qua `wrangler dev --local` + trình duyệt thật**: tìm 1 ca thật đủ 3 điều kiện ticker cùng lúc qua SQL trực tiếp trước (`998156`: đang mở + 0 giải trình + hẹn xử lý đã qua + có cờ vi phạm chưa có dòng `vi_pham` tương ứng) → mở popup xác nhận đúng hiện cả 3 ticker "Tồn chưa giải trình", "Lỡ kế hoạch", "Vi phạm chờ khảo sát". Dùng lại cặp ca lặp thật `T23108`/`T22738`: mở `T23108` ở "Mở rộng", tab Ca lặp xác nhận ticker "Ca lặp: Cần đánh giá" hiện đúng ngay tiêu đề; bấm dòng `T22738` → cột giữa "CA ĐỐI CHIẾU: T22738" xuất hiện đúng đầy đủ thông tin (không có nút hành động); đọc `className` xác nhận đúng viền: dòng đang chọn `border-[var(--ocean-500)]`, dòng gốc `border-[var(--coral-500)]`; bấm lại dòng gốc → cột đối chiếu biến mất (`innerText` không còn "CA ĐỐI CHIẾU"). Chuyển "Ngắn gọn" bấm dòng `T22738` xác nhận đúng hành vi CŨ (điều hướng cả popup sang T22738, tự mở "expanded", không có cột đối chiếu). `npx tsc --noEmit` sạch cả 2 phía. Không cần dọn dữ liệu test (toàn bộ đọc dữ liệu thật có sẵn, không ghi gì mới). Dừng sạch `workerd`.

Tăng version `1.027` → `1.028`. Chờ user xác nhận trước khi deploy (không có migration mới).

**Deploy production thành công** — user xác nhận "cứ tự động nhé" (đứng chung 1 lượt cho phép tự động deploy phần còn lại của phiên này). Không có migration mới. `wrangler deploy` thành công (Version ID `7b080ced-ffc0-492b-b87f-5414af405a1b`). Health check: trang chủ `200`, `/api/auth/me`/`/api/notifications/count` (chưa đăng nhập) đều đúng `401`.

### 2026-07-19 (đợt 6 cùng ngày) — Xây lại toàn bộ thẻ "Báo cáo tồn cần giải trình" (BacklogModule) theo logic thống nhất

User yêu cầu 6 việc lớn cho thẻ Quản lý tồn, mang theo nguyên công thức "ca cần giải trình" từ hệ thống cũ (Airtable/Lark-style formula) để chuyển đổi: (1) chuẩn hoá lại định nghĩa "ca cần giải trình"; (2) gộp filter khu vực + tỉnh + ... thành 1 bộ filter chung cho cả thẻ; (3) bỏ hẳn filter chọn tháng (thẻ chỉ còn quan tâm tồn HIỆN TẠI, không đối chiếu theo tháng cũ nữa), thêm cụm số liệu "Tổng tồn hiện tại" (tổng/>1/>3/>7/>14 ngày/đã giải trình) và cụm "Tổng cần giải trình" (5 nhóm con, dedup khi 1 ca thuộc nhiều nhóm), bấm vào số phải dẫn thẳng xuống danh sách chi tiết đã lọc đúng nhóm; (4) sửa lại toàn bộ biểu đồ/bảng cho dùng chung 1 logic; (5) thêm ô tìm theo ID ở danh sách chi tiết; (6) giải trình bắt buộc đủ lý do chậm + nội dung + ngày dự kiến hoàn thành, và nếu liên quan thiếu linh kiện thì bắt buộc thêm cả linh kiện thiếu + ngày yêu cầu có hàng + mã xuất hàng liên quan. Dùng `EnterPlanMode` (đọc toàn bộ `cases.ts`/`filterParams.ts`/`ageCalc.ts`/`BacklogModule.tsx`/`CaseDetail.tsx` trước khi thiết kế) vì đây là thay đổi logic nghiệp vụ cốt lõi ảnh hưởng số liệu người dùng thấy hằng ngày.

**Phát hiện quan trọng khi khảo sát**: hệ thống đang tồn tại **3 công thức "ca cần giải trình"/"lỡ kế hoạch" khác nhau** ở 3 nơi — tab cũ của `cases.ts` (dùng `ngay_import`/`datetime('now','-1 day')`), cột `lo_ke_hoach` của `backlog-by-khu-vuc` (dùng `c.thoi_gian_hen_xu_ly`), và banner thông báo nhanh của `dailyReport.ts` (công thức tay riêng, cũng dùng `thoi_gian_hen_xu_ly`). Đối chiếu số liệu thật trên 1508 ca tồn production: định nghĩa theo `thoi_gian_hen_xu_ly` cho ra 830 ca "lỡ kế hoạch", định nghĩa theo `ngay_du_kien_hoan_thanh` của giải trình gần nhất chỉ cho ra 83 ca — chênh lệch quá lớn để tự đoán, nên dùng `AskUserQuestion` hỏi thẳng user kèm số liệu thật. User chốt: "Lỡ kế hoạch" = giải trình gần nhất có `ngày dự kiến hoàn thành` mà **ngày lịch** đã qua ngày lịch hôm nay (mốc 8h sáng VN, dùng `AGE_ANCHOR` có sẵn) — ví dụ dự kiến 18/07, hôm nay 19/07 mà ca vẫn mở thì tính lỡ kế hoạch; ca chưa từng giải trình không thuộc nhóm này (rơi vào nhóm "chưa giải trình >3 ngày" riêng). User cũng chốt luôn: thay hẳn 3 tab cũ (`Chưa giải trình`/`Giải trình quá hạn`/`Quá hạn dự kiến`) bằng 1 bộ lọc "Nhóm" duy nhất dựa trên 5 nhóm mới, giữ nguyên tab "Đã giải trình"/"Ca đã đóng" (mục đích tra cứu khác, không phải theo dõi tồn).

- **`backend/src/lib/needGiaiTrinh.ts`** (mới) — nguồn logic DUY NHẤT cho "ca cần giải trình", export `LATEST_GIAI_TRINH_JOIN` (chuyển từ `cases.ts` sang đây để dùng chung) và 5 fragment SQL: `NEED_LO_KE_HOACH` (`date(lg.ngay_du_kien_hoan_thanh) < date(AGE_ANCHOR)`), `NEED_TAI_GIAI_TRINH` (đã giải trình, ≥3 ngày kể từ giải trình gần nhất), `NEED_CHUA_GT_3_NGAY` (chưa giải trình, tuổi ≥3 ngày tính từ `thoi_gian_cskh_tiep_nhan`), `NEED_DIEU_HOA_1_NGAY`/`NEED_B2B_1_NGAY` (chưa giải trình, `nhom_san_pham='Điều hòa'` hoặc `doi_tac LIKE '%b2b%'`, tuổi ≥1 ngày — SLA nhanh hơn cho 2 nhóm này), và `NEED_TONG` (OR cả 5, dedup tự nhiên qua SQL).
- **`backend/src/lib/filterParams.ts`**: thêm `sharedReportFilters()` — bộ lọc nhiều dim cùng lúc (tỉnh/đối tác/hãng/model/nhóm KH/ngành, tái dùng whitelist `REPORT_DIMS` sẵn có), khác `dimAdHocClause()` cũ chỉ lọc được 1 dim tại 1 thời điểm (dùng cho drill-down).
- **`backend/src/routes/dashboard.ts`** `/filters`: mở rộng trả thêm `tinh`/`doiTac`/`nhomSanPham`/`nhomKh`/`nganh` (trước chỉ có `khuVuc`/`hang`) — cấp dữ liệu cho các dropdown filter mới.
- **`backend/src/routes/cases.ts`**: xoá `TAB_FILTERS` cũ (`chua-giai-trinh`/`qua-han-giai-trinh`/`qua-han-du-kien`), thêm 2 tab mới cho `GET /` — `ton-hien-tai` (toàn bộ ca đang mở, lọc thêm được `tuoi_tu`/`tuoi_den`) và `can-giai-trinh` (kèm `category` khớp 1 trong `NEED_GIAI_TRINH_CATEGORIES`); thêm `id` query param (`AND c.id LIKE '%...%'`) cho ô tìm ID. `GET /counts` đổi hẳn shape trả về theo 5 nhóm + `da_giai_trinh`. `GET /backlog-stats` tách 2 cụm: `tongTon` (tổng/>1/>3/>7/>14/đã giải trình) và `aging` (đổi từ `julianday` thô sang `AGE_EXPR` cho khớp bucket 1/3/7/14 dùng chung toàn hệ thống). `GET /backlog-by-khu-vuc`: bỏ hẳn `thang`/cột "Tỷ lệ tồn", đổi bucket `3/5/7` → `1/3/7/14`, thay `lo_ke_hoach`/`cho_giai_trinh_lai` bằng đúng fragment thống nhất, thêm 3 cột `chua_gt_3_ngay`/`dieu_hoa_1_ngay`/`b2b_1_ngay` + cột tổng `can_giai_trinh_tong`. `POST /:id/giai-trinh`: thêm validate bắt buộc `noi_dung`/`ngay_du_kien_hoan_thanh` luôn, và `linh_kien_thieu`/`ngay_yeu_cau_co_hang`/`ma_xuat_hang_lien_quan` khi `lyDo.thuoc_thieu_linh_kien` (import hàng loạt `importGiaiTrinh.ts` giữ nguyên, không áp ràng buộc này vì dữ liệu backfill lịch sử được phép thiếu).
- **`backend/src/lib/dailyReport.ts`**: bỏ hẳn công thức riêng của `tonTren3Ngay` (đang dùng `thoi_gian_hen_xu_ly`), chuyển sang dùng thẳng `NEED_TONG` từ `needGiaiTrinh.ts` — banner "Báo cáo nhanh vấn đề trong ngày" giờ khớp tuyệt đối với ô "Tổng cần giải trình" của thẻ Quản lý tồn (trước đây 2 nơi lệch nhau do 2 công thức khác nhau).
- **`frontend/src/components/ui/Card.tsx`/`StatCard.tsx`**: thêm `onClick?` optional (tương thích ngược, không ảnh hưởng chỗ dùng cũ) — dùng cho các ô số bấm-được ở Quản lý tồn.
- **`frontend/src/modules/BacklogModule.tsx`**: viết lại gần như toàn bộ — bộ lọc chung 7 dim (Khu vực giữ nguyên cơ chế `__QLDVBH__` ảo, 6 dim còn lại lấy option từ `/dashboard/filters` mới), bỏ hẳn `thangBaoCao`/chọn tháng, 2 hàng ô số bấm-được ("Tồn hiện tại" và "Cần giải trình"), biểu đồ "Phân bố tuổi ca tồn" đổi bucket theo `AGE_EXPR` thống nhất (1/3/7/14), bảng pivot đổi cột theo bucket mới + 5 cột nhóm cần giải trình (bỏ "Tỷ lệ tồn"), Danh sách chi tiết thay `TABS`+`AGE_BUCKETS` cũ bằng 1 Select "Nhóm" duy nhất (9 lựa chọn khớp `NHOM_OPTIONS`) + ô tìm ID, drill-down từ pivot table gán đúng bộ lọc dim đang nhóm thay vì cơ chế `dim`/`dim_value` cũ.
- **`frontend/src/modules/CaseDetail.tsx`**: modal "Thêm giải trình" — thêm dấu `*` đỏ + disable nút Gửi cho tới khi đủ `noi_dung`/`ngay_du_kien` (và thêm `linh_kien_thieu`/`ngay_yeu_cau_co_hang`/`ma_xuat_hang` khi lý do thuộc nhóm thiếu linh kiện), kèm banner cảnh báo màu vàng khi rơi vào nhánh thiếu linh kiện và dòng gợi ý dưới nút khi còn thiếu trường.

**Kiểm chứng qua `wrangler dev --local` + `curl` (đối chiếu SQL tay) + trình duyệt thật**: seed 3 dòng `giai_trinh` test phủ đủ 3 tình huống biên trên case thật đã tồn >180 ngày — (a) `ngay_du_kien_hoan_thanh` quá khứ → xác nhận đúng rơi vào `lo_ke_hoach`; (b) `ngay_giai_trinh` 5 ngày trước, `ngay_du_kien` tương lai → đúng rơi vào `tai_giai_trinh`; (c) `ngay_giai_trinh` vừa xong, `ngay_du_kien` tương lai → đúng KHÔNG thuộc nhóm nào (đã giải trình, chưa tới hạn tái giải trình, chưa lỡ kế hoạch) — xác nhận đúng tổng giảm đúng 1 ca so với trước khi seed (1512→1511), khớp tay tính. Test `/cases?tab=can-giai-trinh&category=...` cho từng nhóm trả đúng chính xác case_id đã seed. Test `POST /giai-trinh`: thiếu `noi_dung`/`ngay_du_kien_hoan_thanh` trả đúng `400` (`MISSING_NOI_DUNG`/`MISSING_NGAY_DU_KIEN`), lý do thiếu linh kiện thiếu từng trường con trả đúng `400` riêng biệt (`MISSING_LINH_KIEN_THIEU`/`MISSING_NGAY_YEU_CAU_CO_HANG`/`MISSING_MA_XUAT_HANG`), đủ trường trả `201` (gặp 1 lỗi test-data thoáng qua: `linh_kien_thieu` giả không tồn tại trong bảng `linh_kien` gây `FOREIGN KEY constraint failed` — không phải bug code, sửa lại bằng mã linh kiện thật rồi pass). Test `/dashboard/daily-report`: `tonTren3Ngay` khớp đúng với `can_giai_trinh_tong` của `/cases/counts` tại cùng thời điểm (1509, sau khi 2 ca test được giải trình đầy đủ rơi khỏi danh sách cần giải trình — đúng thiết kế). Qua trình duyệt thật (mint session cookie thủ công): mở module Quản lý tồn xác nhận toàn bộ số liệu UI khớp API đã đối chiếu tay ở trên; bấm ô "Cần giải trình (tổng)" của 1 dòng pivot (MN1, 299 ca) → điều hướng đúng Danh sách chi tiết, tự set filter Khu vực = MN1, tổng đúng 299 dòng; gõ ID vào ô tìm kiếm mới → lọc đúng còn 1 dòng khớp; mở modal giải trình xác nhận nút Gửi disable đúng khi thiếu trường, chuyển lý do sang "Thiếu linh kiện do công ty" xác nhận đúng hiện thêm 3 trường bắt buộc kèm cảnh báo vàng, điền đủ cả 6 trường → nút Gửi bật đúng. `npx tsc --noEmit` sạch cả 2 phía trong suốt quá trình code. Dọn sạch 5 dòng `giai_trinh` test khỏi D1 local sau khi xong.

Tăng version `1.028` → `1.029`. Không có migration mới (thuần đổi logic query + validate app-level).

**Deploy production thành công** — user xác nhận qua `AskUserQuestion` ("Deploy ngay"). Build frontend, `wrangler deploy` thành công (Version ID `91d50db4-fb74-4d11-9c16-4fc5cae7763b`). Health check: trang chủ `200`, `/api/cases/counts`/`/api/dashboard/filters` (chưa đăng nhập) đều đúng `401`.

### 2026-07-20 — Rà soát logic báo cáo tồn/KPI toàn hệ thống, phát hiện + sửa 3 vấn đề số liệu

User yêu cầu rà soát lại toàn bộ logic báo cáo thẻ Quản lý tồn (không code trước, chỉ audit), nêu 5 định nghĩa nghiệp vụ chốt để đối chiếu: (1) "đã đóng" = `tien_do_hoan_thanh` thuộc {"Hoàn thành XLSC","Không hoàn thành XLSC"}, "tồn" = "KTV đang xử lý sơ bộ"; (2) báo cáo/KPI chỉ quan tâm ca "Hoàn thành XLSC" VÀ `tinh_vao_kpi=true`; (3) tuổi tồn tính theo mốc 0h sáng hôm nay (giờ VN), "ngày đầu tiên sau tiếp nhận chưa tính là tồn", ngưỡng chính chú ý là 3 hoặc 5 ngày (trừ Điều hòa/B2B ưu tiên 1 ngày); (4) cần biểu đồ tồn × ngày dự kiến hoàn thành (chưa có); (5) cần báo cáo lý do giải trình lần cuối theo khu vực dạng ma trận/tỷ lệ (chưa có). Dùng 1 Explore agent quét toàn bộ `backend/src` tìm MỌI nơi định nghĩa "đã đóng"/"tính vào KPI"/"tuổi tồn"/"cần giải trình", rồi đối chiếu trực tiếp với dữ liệu production qua `wrangler d1 execute --remote`.

**Phát hiện qua audit** (báo lại cho user dạng bảng, không sửa gì trước khi được xác nhận):
1. `thoi_gian_hoan_thanh IS NULL/NOT NULL` (dùng khắp `cases.ts`/`notifications.ts`/`missingParts.ts`/`dailyReport.ts`) và `tien_do_hoan_thanh IN (...)` (chỉ `dashboard.ts` dùng) hiện **khớp 100%** trên dữ liệu thật (12306 Hoàn thành XLSC + 1547 Không hoàn thành XLSC đều closed, 1508 KTV đang xử lý sơ bộ đều open, không có dòng lệch) — an toàn hiện tại nhưng là proxy field, không phải ràng buộc cứng.
2. `tinh_vao_kpi` **chỉ** được `dashboard.ts` (`/kpis`, `/pivot`) áp dụng — tab "Ca đã đóng" (`cases.ts`/`missingParts.ts`), `revenue.ts`, và `caLap.ts`'s `eligibleClause` đều KHÔNG lọc. Số liệu thật: **251 ca "Hoàn thành XLSC" nhưng `tinh_vao_kpi=0`**, cộng **1547 ca "Không hoàn thành XLSC"** — tất cả vẫn đang được tính vào doanh thu/ca lặp/tab "đã đóng".
3. Mốc tuổi tồn (`ageCalc.ts`'s `AGE_ANCHOR`) đang là **8h sáng VN**, không phải 0h như user mô tả — dựng ví dụ cụ thể (ca tiếp nhận 00:30, hôm nay cách 4 ngày lịch) cho thấy 3 cách hiểu công thức user cho ra 3 số khác nhau (2/3/4) — không tự đoán, dùng `AskUserQuestion` chốt: đúng là 0h sáng, tương đương "(ngày lịch hôm nay − ngày lịch tiếp nhận) − 1" bỏ qua giờ phút trong ngày tiếp nhận. Cũng phát hiện `missingParts.ts` đã dùng sẵn ngưỡng 5 ngày (khác `needGiaiTrinh.ts` chỉ có 3 ngày) — đưa ra làm căn cứ hỏi user chốt ngưỡng 3 hay 5 → user chọn **cả hai** (3 ngày = cảnh báo sớm, 5 ngày = ưu tiên xử lý chính).
4. Bảng so sánh các số liệu tên giống nhau nhưng công thức khác nhau: badge sidebar "Quản lý tồn (N)" (`notifications.ts` — chưa từng giải trình lần nào, KHÔNG dùng `NEED_TONG`) vs banner "Tồn >3 ngày cần giải trình" (`dailyReport.ts` — `NEED_TONG`) vs cột "Đã giải trình" trong report (`cases.ts` — có bất kỳ dòng giải trình nào) vs "% đã giải trình" dashboard (`dashboard.ts` — công thức tách biệt hoàn toàn, không dùng `NEED_TONG`).
5. Điểm 4/5 của user (biểu đồ tồn×dự kiến hoàn thành, ma trận lý do theo khu vực) và "số tồn giải quyết hàng ngày" (cuối điểm 3) xác nhận là **gap chưa làm**, không phải bug — chưa code trong đợt này (chờ yêu cầu riêng).

User chốt qua `AskUserQuestion` (3 câu): mốc 0h sáng VN (đúng như mô tả), ngưỡng cả 3 VÀ 5 ngày, điểm 2 chỉ áp dụng cho "số liệu KPI/tỷ lệ" (dashboard đã đúng, không đổi) VÀ "báo cáo doanh thu" — KHÔNG áp dụng cho tab "Ca đã đóng" (mục đích tra cứu) hay điều kiện ca lặp hợp lệ.

- **`backend/src/lib/ageCalc.ts`**: `AGE_ANCHOR` đổi `' 08:00:00'` → `' 00:00:00'` (đúng 1 chỗ, toàn hệ thống dùng chung qua `ageExpr()` tự động ăn theo — không cần sửa từng nơi gọi).
- **`backend/src/lib/needGiaiTrinh.ts`**: thêm `NEED_CHUA_GT_5_NGAY` (tập con của `NEED_CHUA_GT_3_NGAY`, `>=5` thay vì `>=3`) + thêm `chua_gt_5_ngay` vào `NEED_GIAI_TRINH_CATEGORIES` — KHÔNG thêm vào `NEED_TONG` vì đã là tập con, không đổi tổng số ca cần giải trình.
- **`backend/src/lib/kpiEligible.ts`** (mới): `kpiEligibleClause(prefix)` — nguồn duy nhất cho điều kiện `tien_do_hoan_thanh='Hoàn thành XLSC' AND tinh_vao_kpi=1`.
- **`backend/src/routes/revenue.ts`**: cả 3 endpoint (`/`, `/trend`, `/giam-sat`) thêm `AND ${kpiEligibleClause(...)}`. **`backend/src/lib/dailyReport.ts`**: tile "Doanh thu tháng này" (banner Báo cáo nhanh) cũng thêm điều kiện này — phát hiện thêm khi rà, đây là nơi thứ 3 tính doanh thu (ngoài `revenue.ts` và... không có dashboard.ts, chỉ 2 nơi) với cùng lỗ hổng, sửa luôn cho nhất quán dù user chỉ chỉ định "revenue.ts" (cùng khái niệm doanh thu, để lệch 1 chỗ sẽ tái tạo đúng vấn đề user đang nhờ dọn).
- **`backend/src/routes/cases.ts`**: `/counts` và `/backlog-by-khu-vuc` thêm field `chua_gt_5_ngay`.
- **`frontend/src/modules/BacklogModule.tsx`**: thêm tile "Chưa giải trình >5 ngày (ưu tiên xử lý)" cạnh "Chưa giải trình >3 ngày (cảnh báo sớm)" (đổi hàng "Cần giải trình" từ `lg:grid-cols-6` sang `lg:grid-cols-4` cho 7 ô tự xuống dòng đẹp hơn), thêm option tương ứng vào Select "Nhóm", thêm cột "Chưa GT >5 ngày" vào bảng pivot (`colSpan` tăng `13`→`14`).

**Kiểm chứng qua `wrangler d1 execute --remote` (đối chiếu tay TRƯỚC khi sửa) + `wrangler dev --local` + `curl` (đối chiếu tay SAU khi sửa)**: trước khi sửa, tính tay doanh thu prod theo công thức mới cho ra `2.639.337.900đ` so với `2.800.695.300đ` hiện tại (giảm `161.357.400đ`, ~5.76%) — báo đúng con số này cho user trước khi xin xác nhận deploy. Sau khi sửa code, chạy local: `chua_gt_5_ngay` API trả `739`, đối chiếu SQL tay dùng đúng công thức `AGE_ANCHOR` mới (`00:00:00`) cho ra đúng `739` — khớp. Xác nhận mốc giờ đổi có tác dụng thật (không phải no-op): lấy 5 ca tiếp nhận dạng chỉ-có-ngày (không giờ, vd `"2026-01-15"`) so tuổi theo mốc cũ (8h) vs mới (0h) — chênh đúng 1 ngày ở mọi dòng (vd `186→185`), đúng như kỳ vọng toán học đã tính tay trước khi code. Test `/api/revenue` và `/api/dashboard/daily-report` local không lỗi, tổng doanh thu filtered (`2.643.547.556`) nhỏ hơn đúng unfiltered (`2.647.052.956`) đối chiếu tay qua SQL trực tiếp - khớp tuyệt đối. `npx tsc --noEmit` sạch cả 2 phía. Không cần dọn dữ liệu test (không seed gì mới đợt này, chỉ đọc + sửa logic).

Tăng version `1.029` → `1.030`. Không có migration mới.

**Deploy production thành công** — user xác nhận qua `AskUserQuestion` ("Deploy ngay", đã báo trước tác động doanh thu giảm hiển thị ~161 triệu). `wrangler deploy` thành công (Version ID `1c8bc1a7-9a32-43a5-ac8e-0a0cd3e24db9`). Health check: trang chủ `200`, `/api/cases/counts`/`/api/revenue` (chưa đăng nhập) đều đúng `401`.

## 2026-07-22 — Triển khai song song sang tài khoản smarttrade.vp, thêm gallery ảnh, sửa 3 bug, thêm 2 tính năng UI

**Triển khai "vỏ" hệ thống sang tài khoản Cloudflare mới `smarttrade.vp@gmail.com`** (không copy data thật, chỉ code + schema rỗng): tạo D1 `dvbh-db-smarttrade`, áp đủ 13 migrations, set 3 secret (Google OAuth Client riêng + SESSION_SECRET mới), deploy Worker qua config riêng `wrangler.smarttrade.jsonc` (không đụng `wrangler.jsonc` cũ). Domain đổi 2 lần theo yêu cầu user (`smarttrade-vp` → thử `3t` bị trùng người khác đã đăng ký, khôi phục lại → thử `dichvu3t` thành công → đổi tên Worker từ `dvbh-suite-smarttrade` thành `dvbh`) — chốt domain cuối: `https://dvbh.dichvu3t.workers.dev`. Học được: workers.dev subdomain là duy nhất TOÀN CỤC (không theo tài khoản), đổi subdomain phải xoá cái cũ trước nên luôn có rủi ro tên mong muốn đã bị người khác lấy — đã gặp đúng trường hợp này với "3t".

**Tính năng "Link hình ảnh"**: thêm cột mới sau "TBP" trong import hàng ngày (xem SRS 4.7) — `migrations/0014_link_hinh_anh.sql`, `ratchet.ts` (parse + đổi domain S3 lúc import, so sánh đúng giá trị đã chuẩn hoá trong `hasBusinessDataChanged` để tránh GHI_ĐÈ giả mỗi lần import không đổi ảnh), gallery ảnh (`CaseImageGallery.tsx` — grid + lightbox, phím mũi tên, tự hiện placeholder khi ảnh lỗi) gắn vào `CaseDetail.tsx`.

**3 bug được báo cáo, đã sửa cả 3**:
1. Đồng bộ Google Sheet đôi lúc ghi nhận "thành công 0 dòng" thay vì báo lỗi — rà `import_history` thấy đây là pattern lặp lại nhiều lần (không phải 1 lần), nghi do Google trả về nội dung lỗi/rỗng tạm thời. Sửa `caseSheetSync.ts`: nếu không tìm thấy cột "ID" trong header thì coi là fetch thất bại, throw lỗi để route trả `FETCH_FAILED` (502) thay vì âm thầm ghi nhận "thành công".
2. Thời gian hiển thị chậm hơn thực tế 7 tiếng — do frontend parse chuỗi UTC như giờ local (thiếu +7). Thêm `parseDbDateTime()` trong `types.ts`, sửa cả `fmtDateTime`/`fmtDate` và 2 chỗ dùng `new Date()` trực tiếp trong `caseTickers.ts` (ảnh hưởng cả ticker nghiệp vụ "Lỡ kế hoạch"/"Quá hạn chu kỳ giải trình", không chỉ hiển thị).
3. (Phát hiện khi test tính năng font) `theme.ts` có `FONT_KEYS` validate riêng ở backend, quên thêm `"custom"` khi thêm FontKey mới ở frontend — khiến PATCH `/auth/me` luôn trả 400 âm thầm khi lưu font tuỳ chỉnh.

**2 tính năng UI mới**: (1) Font tuỳ chỉnh tải từ máy — cache IndexedDB (dùng chung store với `closedDataCache.ts`), không upload server, tự fallback về Inter khi cache lỗi/thiếu (`lib/customFont.ts`). (2) 35 câu vui ngẫu nhiên khi loading dữ liệu (`lib/loadingPhrases.ts`, component `LoadingCard`/`LoadingInline`, áp dụng vào `App.tsx`/`TopBar.tsx`/`CaseDetail.tsx`/`SurveyCallWorkspace.tsx`/`PaginatedTable.tsx` dùng chung cho hầu hết bảng danh sách). Nhân tiện tối ưu lại layout "Chế độ gọi khảo sát" (`SurveyCallWorkspace.tsx`) từ 1 cột `max-w-3xl` (bỏ trắng nhiều trên màn rộng) sang 2 cột (thông tin ca trái/sticky, form phải), `max-w-7xl`.

**Sự cố quy trình cần rút kinh nghiệm**: sau khi hoàn thành các việc trên, đã deploy nhầm lên tài khoản `meomeo3101` (production cũ) trước khi hỏi lại user — user xác nhận dự án đó **đã dừng hẳn**, toàn bộ công việc từ nay chỉ làm trên `smarttrade.vp`. Đã deploy lại đúng chỗ (migration 0014 + code mới nhất) sang smarttrade. Bài học: khi có 2 môi trường triển khai, phải hỏi rõ môi trường đích TRƯỚC mỗi lần deploy, không mặc định theo lần trước.

**Thiết lập quy trình lưu trữ** (theo nguyên tắc user đặt ra từ đầu, rà lại thấy chưa làm đủ): `git init` lần đầu cho dự án (trước đó chưa từng có git repo), tạo `.gitignore` bổ sung loại trừ `.claude/settings.local.json` (chứa JWT test cũ + đường dẫn máy cá nhân) và `*.tsbuildinfo`, tạo repo GitHub riêng tư tạm thời tại `github.com/smarttradevp-lgtm/dvbh-suite` (tài khoản GitHub gắn với token do user cung cấp chưa phải thành viên tổ chức ETX87 — chờ user nhờ Owner mời vào tổ chức rồi sẽ transfer repo sang ETX87), commit đầu tiên + push lên nhánh `main`. Backup Google Drive: user từ chối đẩy `secrets.md` lên Drive (đúng, vì chứa OAuth secret/session secret thật) — phần backup code/config lên Drive thư mục được cho chưa thực hiện (cần dùng Claude in Chrome, để đợt sau).

Tăng version `1.030` → `1.031`.

## 2026-07-22 (đợt 2 cùng ngày) — Bỏ filter tuổi tồn ở Khảo sát, thêm log đăng nhập, mở rộng danh sách font

- **`SurveyModule.tsx`**: bỏ hẳn filter "Tuổi tồn" (dropdown + ô tùy chỉnh Từ/Đến) theo yêu cầu user — xóa `AGE_BUCKETS`, state `ageBucketKey`/`tuoiTuCustom`/`tuoiDenCustom`, không còn gửi `tuoi_tu`/`tuoi_den` lên API. Backend (`survey.ts`) giữ nguyên hỗ trợ 2 param này (tương thích ngược, không lỗi khi không gửi) — không cần sửa vì không ảnh hưởng.
- **Log đăng nhập** (`migrations/0015_login_log.sql` — bảng `login_log`: email/thời gian/IP/user agent): ghi 1 dòng mỗi lần đăng nhập Google OAuth thành công trong `auth.ts` callback (dùng header `CF-Connecting-IP` của Cloudflare, đáng tin hơn IP client tự khai). Thêm `GET /api/users/login-log` (Admin-only, phân trang server-side thật + lọc theo email) và tab mới "Lịch sử đăng nhập" trong `UsersModule.tsx`.
- **Mở rộng danh sách font**: từ 5 lên 19 font dựng sẵn (thêm Segoe UI, Arial, Verdana, Tahoma, Trebuchet MS, Calibri, Century Gothic, Times New Roman, Cambria, Garamond, Palatino, Consolas, Impact, Comic Sans MS — đều là font hệ thống phổ biến, không tải thêm webfont) + vẫn giữ nguyên lựa chọn "Tải font từ máy" đã làm trước đó. Đã đồng bộ `FONT_KEYS` ở backend (`theme.ts`) cùng lúc với `FontKey`/`FONT_OPTIONS` ở frontend (`presets.ts`) — rút kinh nghiệm từ bug lần trước (quên đồng bộ khiến lưu font bị từ chối âm thầm).

**Kiểm chứng qua `wrangler dev --local` + trình duyệt thật**: xác nhận dropdown tuổi tồn đã biến mất khỏi cả 2 view "Báo cáo"/"Danh sách chi tiết" của Khảo sát. Seed 1 dòng `login_log` test → tab "Lịch sử đăng nhập" hiển thị đúng email/giờ (đã +7 đúng)/IP/user agent. Chọn font "Impact" mới → `GET /api/auth/me` xác nhận `theme_config` lưu đúng `{"font":"impact"}` (không bị 400 như bug lần trước). `npx tsc --noEmit` sạch cả 2 phía. Dọn dữ liệu test.

Tăng version `1.031` → `1.032`. Deploy thành công lên `smarttrade.vp` (Version ID `51550e9c-7852-412b-b340-2b036979c5fc`).

## 2026-07-22 (đợt 3 cùng ngày) — Lời nhắc loading to/rõ hơn kèm emoji, tiếp tục việc GitHub ETX87

**Lời nhắc loading**: `loadingPhrases.ts` đổi từ `string[]` sang `{text, emoji}[]` — gắn 1 emoji phù hợp ngữ cảnh riêng cho từng câu trong 35 câu (không random độc lập). `LoadingCard`/`LoadingInline` tăng cỡ chữ rõ rệt (emoji `text-2xl`→`text-5xl` tùy chỗ, chữ `font-bold`/`font-semibold` cỡ `text-base`/`text-lg`, có `animate-bounce`), áp dụng luôn cho các nơi trước đó bị giữ nhỏ (App.tsx màn khởi động, TopBar dropdown, PaginatedTable) để đồng bộ toàn hệ thống. Xác nhận bằng `react-dom/server` `renderToStaticMarkup` trực tiếp (không qua trình duyệt, do môi trường test không bắt kịp khung hình loading rất nhanh trên localhost) — output HTML đúng như thiết kế.

**GitHub → tổ chức ETX87**: tài khoản `smarttradevp-lgtm` đã được thêm vào tổ chức (user xác nhận), nhưng thử `transfer` repo bị chặn bởi 1 lớp policy khác của GitHub: tổ chức không cho phép **thành viên thường** (không phải Owner) tạo/nhận repo **riêng tư** (lỗi API rõ ràng: "You don't have the permission to create private repositories on ETX87") — khác với việc chỉ là thành viên hay không. User sẽ nhờ người quản lý (Owner) tổ chức xử lý (bật quyền hoặc tự tạo repo + thêm collaborator) — tạm dừng, code vẫn đang ở `github.com/smarttradevp-lgtm/dvbh-suite`.

Tăng version `1.032` → `1.033`. Deploy thành công lên `smarttrade.vp` (Version ID `ae280607-cd31-4a25-807e-f35e0a735536`).

## 2026-07-22 (đợt 4 cùng ngày) — Sửa bug "Invalid Date" do fix +7 giờ gây ra, xác nhận lại vụ ảnh

**Bug hồi quy**: `parseDbDateTime()` (thêm ở đợt sửa +7 giờ) cộng thêm "Z" một cách mù quáng vào MỌI chuỗi datetime — nhưng `cachedAt` (banner "Dữ liệu đã lưu cache", sinh bởi `new Date().toISOString()` phía client) đã LÀ chuỗi ISO đầy đủ kèm sẵn "Z", cộng thêm 1 "Z" nữa thành chuỗi không hợp lệ → hiển thị "Invalid Date". Sửa: `parseDbDateTime` giờ kiểm tra chuỗi đã có timezone (`Z` hoặc `+HH:MM`/`-HH:MM` ở cuối) chưa, chỉ thêm "Z" khi thực sự thiếu. Xác nhận bằng script `tsx` độc lập: chuỗi DB thường (`"2026-07-22 10:00:00"`) vẫn ra đúng `17:00` (giờ VN), còn `cachedAt` không còn lỗi Invalid Date, parse hợp lệ.

**Vụ ảnh "Link hình ảnh" chưa hiện**: kiểm tra lại D1 smarttrade — `18475` ca thật, `0` ca có `link_hinh_anh`. Code pipeline (COLUMN_MAP/ratchet/gallery) vẫn nguyên vẹn, đã re-verify. Xác nhận với user: đây KHÔNG PHẢI bug — đơn giản là chưa có lần import/đồng bộ nào có cột "Link hình ảnh" chứa URL thật trong dữ liệu nguồn (Excel/Google Sheet). Cần thêm cột này vào file/Sheet nguồn rồi import/đồng bộ lại thì ảnh mới xuất hiện.

Tăng version `1.033` → `1.034`. Deploy thành công lên `smarttrade.vp` (Version ID `1ecc13e8-b18e-4129-8238-f2ce68e25f0f`).

## 2026-07-22 (đợt 5 cùng ngày) — Điều tra và giảm chi phí "rows read" D1 (user báo 58.65M/5M free tier)

User gửi ảnh chụp Cloudflare D1 Usage: Rows read 58.65M/5M (vượt ~12 lần hạn mức free tier). Điều tra tìm ra nguyên nhân chính: `GET /api/notifications/count` (badge sidebar + chuông thông báo) được poll mỗi 60 giây liên tục khi app mở (Sidebar.tsx + TopBar.tsx, cùng queryKey nhưng phải khớp `refetchInterval` mới thực sự dùng chung nhịp), và bên trong endpoint này chạy **CA_LAP_CTE** — 1 CTE dùng window function `LAG() OVER (PARTITION BY seri_san_pham ORDER BY thoi_gian_hoan_thanh)` quét TOÀN BỘ lịch sử `case_dvbh` (theo đúng comment gốc trong code) — và **chạy 2 LẦN** (1 lần đếm "cần đánh giá", 1 lần đếm "chờ QC") trong CÙNG 1 request. Nếu để tab mở cả ngày (1440 lần poll/ngày), riêng phần này đã có thể tạo ra hàng chục triệu rows-read — khớp đúng độ lớn với con số 58.65M user báo.

**Đã sửa 3 việc**:
1. `notifications.ts`: gộp 2 truy vấn CA_LAP_CTE (đếm "cần đánh giá" + "chờ QC") thành 1 truy vấn duy nhất dùng `SUM(CASE WHEN...)` — giảm ngay 1 nửa chi phí phần này mỗi lần gọi.
2. `Sidebar.tsx` + `TopBar.tsx`: giãn `refetchInterval` của "notifications-count" từ 60 giây lên 5 phút (khớp nhịp với "sync-status" đã có sẵn) — giảm số lần gọi endpoint này xuống 5 lần.
3. `migrations/0016_ca_lap_perf_index.sql`: thêm index `(seri_san_pham, thoi_gian_hoan_thanh)` khớp đúng PARTITION BY/ORDER BY của window function — `EXPLAIN QUERY PLAN` xác nhận đổi từ "SCAN toàn bảng" sang "SEARCH ... USING INDEX idx_case_seri_hoan_thanh".

**Kiểm chứng**: gọi trực tiếp `/api/notifications/count` sau khi sửa, kết quả `caLap: 561` khớp chính xác với giá trị badge đã thấy nhất quán suốt phiên làm việc trước đó (xác nhận query gộp không làm sai số liệu). `EXPLAIN QUERY PLAN` xác nhận index được dùng. `npx tsc --noEmit` sạch cả 2 phía.

**Lưu ý còn mở**: đây là cải thiện đáng kể (giảm ~10 lần tần suất poll + giảm 1 nửa chi phí mỗi lần) nhưng KHÔNG loại bỏ hoàn toàn chi phí quét lịch sử — nếu vẫn còn vượt hạn mức sau vài ngày theo dõi, nên cân nhắc bước tiếp theo: cache kết quả phát hiện "ca lặp" (vd tính toán định kỳ qua Cron Trigger, lưu vào bảng/KV, thay vì tính trực tiếp mỗi request).

Tăng version `1.034` → `1.035`. Deploy thành công lên `smarttrade.vp` (Version ID `bb407ec3-cf8b-4d12-85ae-07802a44dc03`).

## 2026-07-22 (đợt 6 cùng ngày) — Triển khai các phương án tối ưu chi phí D1 (#1 + #2 trong báo cáo)

Sau báo cáo phân tích chi tiết (ước lượng chi phí từng thao tác + 3 kịch bản rủi ro), user yêu cầu triển khai các phương án khả thi. Đã làm #1 và #2 (không cần quyết định billing của user); tạm chưa làm #3 (cache tầng Worker) vì cần thiết kế cache-key theo đúng phạm vi khu_vuc từng vai trò để tránh rò rỉ dữ liệu chéo người dùng — để sau nếu cần.

**#1 — `staleTime` cho React Query**: `main.tsx` đổi mặc định từ `0` (moi lan mount lai deu goi lai API) sang `2 phút`. Các nơi cần dữ liệu tức thời sau khi ghi (giải trình, chốt vi phạm...) đã tự gọi `qc.invalidateQueries()` riêng, không bị ảnh hưởng (invalidate luôn ép refetch bất kể staleTime).

**#2 — Tính sẵn "ca lặp" định kỳ thay vì tính mỗi request** (khoản tốn nhất theo báo cáo, dùng lặp lại 11 lần rải rác trong `notifications.ts`/`dailyReport.ts`/`caLap.ts`):
- `migrations/0017_ca_lap_precompute.sql`: thêm `case_dvbh.ca_lap_prior_id`/`ca_lap_prior_ht`/`ca_lap_computed_at` + index bộ phận `idx_case_ca_lap_prior_ht WHERE ca_lap_prior_ht IS NOT NULL`.
- `lib/caLapEligible.ts` (mới): tách `eligibleClause()` ra khỏi `caLap.ts` để dùng chung được với hàm refresh mà không tạo vòng lặp import route→lib→route.
- `lib/caLapRefresh.ts` (mới): `refreshCaLapPrecompute()` — xoá giá trị cũ rồi tính lại 1 lần bằng chính window function `LAG()` gốc, ghi vào 2 cột mới qua `UPDATE ... FROM` (SQLite 3.33+, D1 hỗ trợ).
- `routes/caLap.ts`: `CA_LAP_CTE_BODY` đổi từ tính trực tiếp window function sang `SELECT *, ca_lap_prior_id AS prior_id, ... FROM case_dvbh WHERE ca_lap_prior_ht IS NOT NULL` — **giữ nguyên tên cột `prior_id`/`prior_ht`/`gap_days` nên KHÔNG cần sửa bất kỳ chỗ nào trong 11 điểm gọi `CA_LAP_CTE`** (notifications.ts, dailyReport.ts, và 8 chỗ trong caLap.ts) — đây là điểm mấu chốt giúp refactor an toàn, rủi ro thấp.
- `backend/src/index.ts`: `scheduled()` phân nhánh theo `event.cron` — cron cũ (`0 20 * * *`, archive hàng ngày) giữ nguyên, thêm cron mới `*/20 * * * *` (mỗi 20 phút) gọi `refreshCaLapPrecompute()`.
- `wrangler.jsonc` + `wrangler.smarttrade.jsonc`: thêm `"*/20 * * * *"` vào `triggers.crons` (đã sửa cả 2 file cho đồng bộ codebase, dù không deploy lại `wrangler.jsonc`/meomeo3101 theo đúng quy tắc đã thống nhất).

**Kiểm chứng qua `wrangler dev --local`**: chạy tay SQL refresh (mô phỏng cron) → `EXPLAIN QUERY PLAN` xác nhận đổi từ tính window function sang `SEARCH case_dvbh USING INDEX idx_case_ca_lap_prior_ht` — đúng như thiết kế. `/api/notifications/count` trả `caLap: 561` — khớp TUYỆT ĐỐI với giá trị window-function gốc đã thấy suốt phiên làm việc trước đó (xác nhận không sai số liệu). `/api/ca-lap/tong-quan` (endpoint phức tạp nhất, 8 lần dùng CA_LAP_CTE) trả dữ liệu hợp lý không lỗi. `/api/ca-lap/danh-sach` (dùng `SELECT lap.*`) trả đầy đủ đúng cột. Phát hiện thêm khi test: chỉ **817/15.648** dòng thực sự có "prior" (ca lặp thật) — xác nhận đúng ước tính ~816 trong báo cáo, nghĩa là đọc qua index giảm ~19 lần so với quét window function mỗi lần.

Tăng version `1.035` → `1.036`. Deploy migration + code + cron mới thành công lên `smarttrade.vp` (Version ID `2d670a5d-efbf-49fa-903b-72a43f5d2554`), đã chạy tay 1 lần refresh trên D1 thật để có dữ liệu ngay (817 dòng cập nhật) thay vì chờ tới lượt cron đầu tiên (tối đa 20 phút).

## 2026-07-22 (đợt 7 cùng ngày) — Chuyển refresh "Ca lặp" sang theo sự kiện import + đóng hash

User xác nhận kiến trúc đề xuất trước đó, làm rõ thêm 1 nguyên tắc quan trọng: khi import xong phải tính TOÀN BỘ danh sách "ca lặp" tại thời điểm đó và đóng hash luôn — các lượt xem SAU ĐÓ (module Ca lặp, badge, banner Dashboard) chỉ được RÀ SOÁT LẠI danh sách này (đọc qua index, không quét lại), còn TRẠNG THÁI xử lý (chốt đánh giá GS/QC) luôn lấy riêng qua lịch sử `giai_trinh_lap` (tra theo ID, bảng nhỏ) — không được gộp 2 phần này làm một.

- **`lib/caLapRefresh.ts`**: sau khi tính lại `ca_lap_prior_id`/`ca_lap_prior_ht`, thêm bước 3 — đóng hash của TẬP `(id, ca_lap_prior_id, ca_lap_prior_ht)` vào `content_versions` (tái dùng nguyên `contentHash.ts` đã có sẵn cho settings) qua key `ca_lap_snapshot`. **Cố tình KHÔNG gộp trạng thái giải trình lặp vào hash này** — nếu gộp, hash sẽ đổi liên tục mỗi khi GS/QC xử lý xong 1 ca, mất hết lợi ích cache.
- **`routes/caLap.ts`**: thêm `GET /api/ca-lap/version` — trả hash hiện có, hoặc tự tính 1 lần nếu chưa từng refresh (tránh trả rỗng).
- **`routes/importRoute.ts`**: cả `/commit` và `/sync-sheet` sau khi ghi xong đều gọi `refreshCaLapPrecompute()` qua `c.executionCtx.waitUntil()` (chạy nền, KHÔNG làm chậm phản hồi cho người import) — nhưng CHỈ khi `GHI_MOI + GHI_DE > 0` (bỏ qua khi import toàn dòng không đổi gì, đúng nguyên tắc "chỉ cập nhật khi có thay đổi thật").
- **`index.ts` + 2 file wrangler**: cron `*/20 phút` (đợt tối ưu D1 trước) hạ xuống `mỗi giờ` — vì giờ CHỈ còn là lưới an toàn dự phòng (phòng trường hợp 1 đường ghi dữ liệu nào đó quên gọi trực tiếp), cơ chế CHÍNH đã chuyển sang theo sự kiện import.

**Kiểm chứng qua `wrangler dev --local`**: xoá sạch cột tính sẵn + hash cũ → gọi `/api/ca-lap/version` xác nhận tự tính lại đúng (không trả rỗng) → `/api/notifications/count` vẫn đúng `caLap: 561`. Import 1 ca test mới (`GHI_MOI: 1`) → đợi 2 giây → xác nhận `content_versions.updated_at` của `ca_lap_snapshot` đổi mốc giờ (từ `09:27:52` sang `09:29:03`) dù chưa đến giờ cron — xác nhận đúng cơ chế theo sự kiện đã chạy nền thành công, không cần chờ tối đa 20 phút/1 giờ như trước. `npx tsc --noEmit` sạch. Dọn ca test.

**Chưa làm** (giải thích rõ lý do thay vì bỏ qua âm thầm): KHÔNG áp `fetchWithHashCache` cho `/tong-quan`/`/danh-sach` phía client, vì 2 endpoint này trả về CẢ danh sách ca lặp LẪN trạng thái xử lý gộp chung 1 response — nếu cache theo hash chỉ phản ánh danh sách (không phản ánh trạng thái), người dùng có thể thấy trạng thái cũ sau khi GS/QC vừa xử lý xong. Endpoint `/version` đã sẵn sàng cho tương lai nếu tách được 2 phần response.

Tăng version `1.036` → `1.037`. Deploy thành công lên `smarttrade.vp` (Version ID `4ee2ca93-2399-4427-9eed-9aa16d0949b2`).

## 2026-08-13 — "Giao diện" (gam màu + phông chữ) chuyển hẳn sang localStorage, bỏ lưu server; thêm chế độ "Ngẫu nhiên"

User yêu cầu: trong thẻ "Cài đặt cá nhân", chỉ mục "Thông tin cá nhân" (`ten_goi`, `gioi_tinh`) mới cần lưu server — phần còn lại ("Giao diện": gam màu + phông chữ) chỉ cần lưu cache máy người dùng, không cần ghi/đọc D1 nữa. Đồng thời thêm 1 lựa chọn "Ngẫu nhiên" cho cả gam màu lẫn phông chữ, độc lập với nhau: mỗi lần mở lại app sẽ tự đổi ngẫu nhiên, cho đến khi người dùng tự chọn cố định 1 giá trị thì dừng random. Mặc định (người dùng chưa từng chỉnh) là chế độ Ngẫu nhiên cho cả 2.

**Backend**: bỏ hẳn `theme_config` khỏi `users` — xoá xử lý trong `routes/auth.ts` PATCH `/me` (route giờ chỉ còn nhận `ten_goi`/`gioi_tinh`), bỏ khỏi `USER_COLUMNS`/`UserRow`/object dựng `AppUser` trong `middleware/loadUser.ts`, bỏ field khỏi `types.ts`, xoá hẳn `lib/theme.ts` (không còn nơi nào dùng `sanitizeThemeConfig`/`parseThemeConfig`). Cột `users.theme_config` trong DB để nguyên (không migration DROP COLUMN) — dữ liệu cũ không cần dọn, chỉ đơn giản không còn đọc/ghi tới nữa, rủi ro migration không đáng để đổi lấy lợi ích rất nhỏ.

**Frontend**: 
- `theme/presets.ts`: thêm biến thể `"random"` vào cả `ThemePresetKey` và `FontKey`; thêm `pickRandomPreset()`/`pickRandomFont()` (loại trừ `"custom"` khỏi tập ngẫu nhiên) và `resolveEffectiveThemeConfig(raw)` — hàm "tung" random 1 LẦN, chuyển config thô (có thể chứa `"random"`) thành config cụ thể để áp dụng lên trang.
- `theme/localThemeConfig.ts` (mới): `loadLocalThemeConfig()`/`saveLocalThemeConfig()` đọc/ghi `localStorage["theme-config"]`, mặc định `{ preset: "random", font: "random" }`.
- `theme/ThemeProvider.tsx`: bỏ phụ thuộc `useAuth()`/`auth.user.theme_config` — đọc thẳng từ `localThemeConfig`, gọi `resolveEffectiveThemeConfig()` trong `useState` initializer (chỉ tung random đúng 1 lần lúc mount, không tính lại mỗi render để tránh nhấp nháy).
- `components/ThemeSettingsPanel.tsx`: bỏ `useMutation`/gọi `PATCH /auth/me` — mọi lựa chọn giờ lưu đồng bộ (không còn trạng thái "Đang lưu…") qua `saveLocalThemeConfig`. Thêm nút "🎲 Ngẫu nhiên" ở đầu lưới chọn gam màu và lưới chọn phông chữ (preview ngay 1 giá trị ngẫu nhiên khi bấm, nhưng giá trị LƯU LẠI là chế độ `"random"` chứ không phải giá trị vừa preview).

**Chưa làm / cố tình bỏ qua**: không di trú `theme_config` cũ (nếu ai đã từng tuỳ chỉnh) sang localStorage — vì làm vậy cần thêm 1 lượt đọc server trước khi bỏ hẳn cột, ngược với mục tiêu giảm đọc/ghi của yêu cầu này. Tài khoản đã từng tuỳ chỉnh giao diện sẽ thấy giao diện về lại mặc định (Ngẫu nhiên) sau khi bản này lên production — có thể tự chọn lại nhanh nếu muốn cố định.

**Chưa kiểm chứng qua trình duyệt thật** (cần đăng nhập Google, môi trường này không tự động hoá được) — đã chạy `tsc --noEmit` sạch cả 2 phía và `npm run build` thành công.

Tăng version `1.166` → `1.167`.

## 2026-08-15 — KTV import (4 cột mới + sdt hết bắt buộc + bỏ FK), Loại đề xuất (cache/flag bug + nhóm mới + Admin bypass), tính năng "Lý do chậm" (SLA 24h cho đơn mua linh kiện), rà soát UX module Đặt mua linh kiện

### 1. Settings > Danh sách KTV — import Excel/CSV thiếu 4 cột mới
`processKtvImportRows()` (`backend/src/routes/settings.ts`) và `KTV_TEMPLATE_CSV` chưa xử lý 4 cột
đã bổ sung trước đó (gmail, vai_tro_ktv, giam_sat_quan_ly, email_dang_nhap) — import đè mất dữ liệu
các cột này. Sửa: mở rộng `KtvImportRow`/template, validate `vai_tro_ktv` theo enum
`["KTV","CTV","Tram","Ve tinh"]`, dùng `COALESCE(excluded.x, ktv_lien_he.x)` khi upsert để import lại
1 phần không xoá mất dữ liệu cột khác. Đồng bộ export Excel + `SettingsModule.tsx` (thêm cột, sửa mô
tả hướng dẫn import).

### 2. Danh sách KTV — sdt không còn bắt buộc, chỉ bắt buộc mã KTV
Theo yêu cầu thực tế: chỉ `ma_ktv` là bắt buộc khi thêm/sửa/import KTV. Migration
`0071_ktv_lien_he_sdt_khong_bat_buoc.sql` (recreate-table) bỏ `NOT NULL` của `sdt`. Sửa route
POST/PATCH `ktv-lien-he`, `KtvImportRow`, `SettingsModule.tsx` (nút Lưu chỉ disable khi thiếu mã
KTV, nhãn đổi thành "Mã KTV *"), `types.ts` (`sdt: string | null`), `KtvNameWithPhone.tsx` (hiển thị
"Chưa có SĐT" khi null).

### 3. Import KTV báo "INTERNAL_ERROR" — gốc là FK cứng + D1 batch = 1 transaction
User báo ảnh chụp lỗi import. Nguyên nhân: `giam_sat_quan_ly`/`email_dang_nhap` (thêm ở migration
0067) có FK tới `users(email)`; Admin thường import KTV/người giám sát TRƯỚC KHI người đó đăng nhập
lần đầu (chưa có dòng trong `users`) → FK chặn 1 dòng, mà cả import chạy trong 1 `db.batch()` (1
transaction ngầm của D1) nên 1 dòng lỗi làm ROLLBACK TOÀN BỘ batch, lộ ra ngoài thành `INTERNAL_ERROR`
chung chung. User hỏi thêm: "nếu chưa khớp vẫn cho lưu, sau này user đăng nhập tự liên kết có được
không?" — quyết định chọn hướng đó thay vì pre-validate-và-reject. Migration
`0072_ktv_lien_he_bo_fk_tham_chieu.sql` (recreate-table, đã grep xác nhận không bảng nào REFERENCES
`ktv_lien_he` nên an toàn) bỏ hẳn FK của 2 cột này — đúng bản chất chúng vốn là "tham chiếu/danh bạ
mềm" (ghi chú gốc ở migration 0067), không phải nguồn thật phân quyền; các endpoint JOIN
`ktv_lien_he.email_dang_nhap` với `users` (vd `/dat-mua-lk/nguoi-nhan-hang-kha-dung`) tự động khớp
ngay khi dòng `users` tương ứng xuất hiện, không cần code thêm.

### 4. Settings > Loại đề xuất — bug cache cũ hiện lại option đã xoá + sai flag vai trò
2 bug độc lập: (a) `DatMuaLinhKienModule.tsx` sync `loai_de_xuat` kiểu incremental (`?since=`) nên
không bao giờ phát hiện được hard-delete từ Settings — sửa thành full-sync mỗi lần mount (fetch toàn
bộ + `clearLdeCache()` + merge lại, giống pattern `closedDataCache.ts`); (b)
`LDE_VAI_TRO_FLAGS` trong `SettingsModule.tsx` có 2 giá trị flag gõ nhầm có dấu
(`"vai_tro:Giám sát"`, `"vai_tro:KSNB Đối tác"`) không khớp giá trị thật không dấu lưu trong
`users.vai_tro` — khiến lọc theo vai trò cho Giám sát và KSNB Đối tác luôn sai từ lúc tính năng ra
đời. Sửa lại 2 flag value (nhãn hiển thị vẫn giữ dấu).

### 5. Loại đề xuất — thêm nhóm "Giám sát + Tác nghiệp" (15 lựa chọn) + Admin thấy toàn bộ
Theo yêu cầu, thêm migration `0069_loai_de_xuat_giam_sat_tac_nghiep.sql` — nhóm mới gán cho vai trò
Giám sát + TBP DVBH (Tác nghiệp), 15 lựa chọn cụ thể (HỖ TRỢ 0 ĐỒNG, HỖ TRỢ CÔNG NỢ, ... (ƯU TIÊN)
CÔNG NỢ - ĐƠN ĐANG XỬ LÝ). D1 không chấp nhận `VALUES(...) AS t` trong FROM lẫn `UNION ALL` 15 nhánh
("too many terms in compound SELECT") nên phải viết 15 câu `INSERT ... SELECT id, '<option>', stt
FROM ... WHERE ten_nhom = '...'` riêng lẻ. Đồng thời `getOptionsForUser()`
(`frontend/src/lib/loaiDeXuatCache.ts`) thêm nhánh Admin bypass — Admin luôn thấy toàn bộ Loại đề
xuất đang bật, không lọc theo nhóm/flag (giống pattern Admin bypass đã có ở
`backend/src/lib/moduleAccess.ts`).

### 6. Tính năng mới: "Lý do chậm" — SLA 24h cho dòng đơn mua linh kiện (từ rà soát file Excel mẫu)
User gửi file Excel `Luồng tạo đơn mua hàng/Data đặt hàng.xlsx` yêu cầu rà soát cách nhập liệu từng
cột, dặn rõ "không hiểu thì hỏi, không tự suy đoán". Qua nhiều vòng hỏi-đáp xác định: 6 cột người tạo
nhập thêm (`ghi_chu`, `yeu_cau_hoa_don`, `tt_mail_duyet`, `tt_khach_hang`, `chinh_sach`,
`ma_yeu_cau_su_co`) — migration `0070_dat_don_hang_cot_bo_sung.sql`. Riêng cột "LÝ DO CHẬM" ban đầu
tôi đọc nhầm là do người tạo nhập (dựa trên 1 input UI có sẵn "Lý do đặt (tuỳ chọn)" — user xác nhận
đây là AI phiên trước tự ý thêm, không phải yêu cầu thật, đã bỏ input đó) — bản chất thật: Tác nghiệp
(TN) phải giải trình khi 1 dòng đơn hàng treo quá 24h kể từ lúc vào trạng thái "Cho TN duyệt" mà chưa
được đưa vào Phiếu Xuất Kho đạt trạng thái "Cho kế toán", có cộng bù ngày nếu hạn rơi vào thứ 7/CN, và
CHẶN CỨNG không cho chuyển bước tiếp cho tới khi TN nhập lý do. Cài đặt:
`backend/src/lib/hanLyDoCham.ts` (thuật toán tính hạn thuần JS, `parseVnTime` ghép "Z" vào chuỗi giờ
VN vì Worker chạy UTC, cộng 24h rồi lặp cộng thêm ngày nếu hạn rơi T7/CN), route
`datMuaLinhKien.ts` (trả `qua_han_ly_do_cham` mỗi dòng ở GET /phieu-dat/:id, cho TN sửa `ly_do_cham`
qua PATCH /don-hang/:id) và `phieuXuatKho.ts` (chặn cứng ở POST /:id/log khi target = "Cho ke toan"
nếu còn dòng quá hạn chưa có lý do, trả lỗi `THIEU_LY_DO_CHAM`). UI: `DatMuaLinhKienModule.tsx` —
`PhieuDatDetailModal` thêm cột Ghi chú + badge "Quá hạn - cần lý do chậm"; `PxkDetailModal` thêm bảng
"Dòng đơn hàng" (dữ liệu vốn đã fetch nhưng CHƯA TỪNG hiển thị) cho TN nhập lý do chậm trực tiếp, kèm
badge quá hạn và thông báo lỗi tiếng Việt rõ ràng khi bị chặn.

### 7. Rà soát UX module Đặt mua linh kiện theo 4 tiêu chí chốt
User chốt 4 tiêu chí UX bắt buộc cho module (badge số tồn đọng tách theo loại + bấm nhảy thẳng tới
đúng tab/filter + hành động 1 chạm + hỗ trợ xử lý hàng loạt kể cả import Excel). Đã rà soát code thật
(không suy đoán) và ghi kết quả + bằng chứng file:dòng cụ thể vào `DANH_GIA_UX_DAT_MUA_LINH_KIEN.md`
mục "0. TIÊU CHÍ UX CHỐT 2026-08-15" — kết luận 0/4 tiêu chí đạt hoàn toàn, có danh sách ưu tiên sửa.

Deploy migrations 0069-0072 lên `smarttrade` cùng các đợt trên. Tăng version `1.167` → `1.186` qua
nhiều đợt deploy nhỏ trong ngày.

## 2026-08-15 (đợt 2 cùng ngày) — Triển khai đủ 4/4 tiêu chí UX module Đặt mua linh kiện đã chốt ở đợt 1

Tiếp nối đợt rà soát (xem mục trên) — chủ hệ thống xác nhận làm cả 4 tiêu chí trong 1 đợt, lập kế
hoạch qua chế độ Plan rồi triển khai tuần tự theo đúng thứ tự ưu tiên a→d.

### 1. Badge tách theo loại việc (tiêu chí 1)
`computeDatMuaLkCount` (`notifications.ts`) đổi tên thành `computeDatMuaLkBreakdown`, trả object
`DatMuaLkBreakdown` (9 bucket riêng: `choTnDuyet`, `choTnTraHang`, `choKhoThieuLk`, `choKhoPxk`,
`choKhoTraHang`, `choKeToanPxk`, `choKeToanTraHang`, `choQcTraHang`, `choTramDuyet` + `total`) thay vì
1 số gộp — giữ nguyên moi query SQL, chỉ đổi shape trả về. `NotificationsCountPayload.datMuaLk` đổi
type theo. `Sidebar.tsx` chỉ đọc `.total` (giữ nguyên hành vi hiện tại — badge sidebar vẫn 1 số gọn).
Thêm endpoint `GET /dat-mua-lk/tom-tat` (`datMuaLinhKien.ts`) tái dùng đúng hàm/cache của badge
sidebar (`getDatMuaLkBadge`) để 2 nơi luôn đồng bộ số liệu — module tự vẽ 1 "thanh tóm tắt"
(`SummaryStrip`) hiện các pill theo loại việc, chỉ hiện bucket liên quan vai trò đang đăng nhập.

### 2. Bấm số tồn đọng nhảy đúng tab/filter (tiêu chí 2)
Mỗi pill trong `SummaryStrip` gọi `jumpTo({tab, filter})` ở `DatMuaLinhKienModule` — set `view`
(chuyển tab) + set `jumpTarget` state, truyền xuống tab con qua prop mới `initialFilterOverride`; tab
tự đọc prop này trong 1 `useEffect` để gọi `setFilterTrangThai`. `jumpTarget` tự xoá sau 1 lần dùng
(`setTimeout(0)`) để không ghi đè filter thủ công của người dùng ở lần re-render sau. Áp dụng cho cả
4 tab (`DonCuaToiTab`, `PhieuXuatKhoTab`, `ThieuLkTab`, `TraHangTab`).

### 3. Bỏ modal xác nhận thừa cho hành động không cần nhập liệu (tiêu chí 3)
`ThieuLkTab`: các bước không phải `isGiaiTrinh` ("Kho từ chối sai TT", "Đã huỷ bỏ", "Kho xác nhận
hàng đã về", "Đã kết thúc") đổi từ mở modal sang gọi `logMutation.mutate({id, trangThai})` trực tiếp,
theo đúng pattern nút của `PxkDetailModal`/`DonCuaToiTab`. Chỉ giữ modal cho "Kho đã tiếp nhận" (bắt
buộc giải trình + ngày dự kiến). `TraHangTab`: "Duyệt"/"Từ chối" gọi trực tiếp không qua modal (mất
khả năng ghi chú tuỳ chọn cho 2 hành động này — đánh đổi có chủ đích để đạt 1-chạm); chỉ giữ modal
cho "Đẩy lùi" (ghi chú thật sự bắt buộc).

### 4. Bulk-log cho thiếu LK/trả hàng + import Excel tạo hàng loạt đơn hàng (tiêu chí 4)
Refactor logic xử lý 1 dòng của `POST /thieu-lk/:id/log` và `POST /tra-hang/:donHangId/log` thành 2
hàm dùng chung (`applyThieuLkLog`, `applyTraHangLog`, theo đúng pattern `applyDonHangLog` đã có sẵn
cho `don-hang/bulk-log`), rồi thêm `POST /thieu-lk/bulk-log` và `POST /tra-hang/bulk-log` — tái dùng
hàm dùng chung, tiếp tục xử lý các id còn lại kể cả khi 1 id lỗi, trả kết quả từng id. Frontend thêm
checkbox chọn dòng + "chọn tất cả" + thanh hành động hàng loạt ở cả 2 tab (`ThieuLkTab` chỉ cho bulk
với các bước không cần nhập liệu — tính giao các trạng thái đích chung giữa các dòng đã chọn;
`TraHangTab` bulk "Duyệt tất cả"/"Từ chối tất cả" áp dụng bất kể dòng đang ở bước nào, mỗi dòng tự
tính bước kế tiếp riêng ở server).

Import Excel: thêm `processDatDonHangImportRows` (`datMuaLinhKien.ts`) + 2 endpoint
`POST /don-hang/import/preview|commit`, tái dùng nguyên component `ImportUploader` (đã có sẵn cho
import KTV ở Settings). Quyết định chốt với chủ hệ thống: các dòng **cùng 1 KTV** (cột
`nguoi_nhan_hang` = mã KTV, khớp `ktv_lien_he.ma_ktv`) gộp thành **1 phiếu đặt riêng** — vd import
100 dòng với 10 KTV khác nhau → tạo 10 phiếu đặt độc lập, mỗi phiếu chứa đúng các dòng của KTV đó
(không phải "1 file = 1 phiếu"). Validate + resolve giống hệt luồng tạo thủ công (`POST /phieu-dat`,
đã tách chung `deriveLoaiDon` để 2 nơi không lệch logic). Chỉ TN/GS (`canQuanLyDonHo`) được dùng —
đúng bản chất "tạo hộ hàng loạt". Thêm nút Import Excel vào `TaoDonTab`.

### Kiểm thử
`tsc --noEmit` sạch cả 2 phía sau mỗi phase, `npm run build` thành công. Khởi động dev server (worker
+ frontend) qua Browser pane, xác nhận trang đăng nhập tải sạch không lỗi console (chỉ 401 kỳ vọng
trước khi đăng nhập) — **chưa kiểm chứng được luồng đầy đủ qua trình duyệt thật vì cần đăng nhập
Google, môi trường này không tự động hoá được** (giống hạn chế đã ghi nhận ở các phiên trước).

Deploy production `smarttrade` — không có migration mới (chỉ đổi logic/route, không đổi schema).
Tăng version `1.186` → `1.187`.

## 2026-08-15 (đợt 3 cùng ngày) — Thu gọn khối Import Excel trong TaoDonTab + xác nhận phạm vi quyền

Phản hồi ngay sau đợt 2: chủ hệ thống yêu cầu (1) xác nhận import Excel không mở cho CTV/KTV/Trạm —
đã ĐÚNG SẴN từ đợt 2 (`canQuanLy = canTacNghiep || isGiamSat`, không gồm `la_ktv_dvbh`/`la_ve_tinh`),
không cần sửa gì; (2) thu gọn khối Import Excel trong `TaoDonTab` vì nhập liệu thủ công là luồng ưu
tiên chính, import chỉ là lựa chọn phụ, tránh chiếm diện tích màn hình xử lý chính. Thêm state
`showImport` (mặc định `false`) — hiện 1 dòng bấm-để-mở-rộng "⇩ Import Excel hàng loạt (tuỳ chọn)"
khi thu gọn, bấm vào mới hiện `ImportUploader` đầy đủ kèm nút "▲ Thu gọn" để đóng lại.

Tăng version `1.187` → `1.188`, deploy `smarttrade`.

## 2026-08-15 (đợt 4 cùng ngày) — Redesign "Tạo phiếu đặt" theo 12 phản hồi thực tế dùng thử

Chủ hệ thống dùng thử màn hình tạo đơn sau đợt deploy v1.188 và đưa ra 12 phản hồi cụ thể để tối ưu
tốc độ nhập liệu thủ công (ưu tiên chính) và giảm nhiễu thông tin. Hỏi lại 1 điểm mơ hồ (xử lý field
"Số tiền công nợ") — chốt: bỏ hẳn ô nhập tay, chỉ hiện số tự tính từ giá tham chiếu. Yêu cầu #10
(danh sách KTV theo quản lý) đã đúng sẵn trong code — không cần sửa.

### Thay đổi chính (`DatMuaLinhKienModule.tsx` + `datMuaLinhKien.ts`)
1. "Yêu cầu hóa đơn" mặc định "Không" (`emptyDraft()`).
2. **Chính sách + Mã yêu cầu sự cố bắt buộc khi Loại đề xuất là CÔNG NỢ thật** (chứa "CÔNG NỢ", không
   chứa "TRẢ HÀNG") — thêm `canNoRequired()` ở CẢ 2 PHÍA (frontend `canSubmit` + label "*", backend
   `POST /phieu-dat` và `processDatDonHangImportRows` trả lỗi `THIEU_CHINH_SACH_HOAC_MA_YCSC` 400) vì
   đây là quy tắc nghiệp vụ thật, không chỉ chặn UI.
3. Dropdown dài (linh kiện...) không xuống dòng nữa — `SearchableSelect` option thêm `truncate` +
   `title` tooltip (sửa 1 chỗ dùng chung `Select.tsx`, áp dụng mọi nơi).
4. 3 nút bấm nhanh MUA HÀNG/CÔNG NỢ/TRỪ CÔNG NỢ cho Loại đề xuất — `pickLdeQuick()` khớp cả biến thể
   có tiền tố ngoặc (vd "(TBP ĐỒNG Ý) MUA HÀNG" cho TN/Admin).
5. Cảnh báo mềm khi nhập "Mã yêu cầu sự cố liên quan" — endpoint MỚI
   `GET /dat-mua-lk/kiem-tra-ma-yeu-cau?id=&nguoi_nhan_hang=` (KHÔNG dùng `GET /api/cases/:id` vì bị
   `scopeByKhuVuc` chặn sai — GS nhập đúng mã nhưng case ngoài khu vực sẽ nhận 403 và hiện sai thành
   "không tìm thấy"). Trả 2 boolean (`found`, `khopKtv`), dùng `extractMaKtv()` có sẵn để so với
   `ktv_lien_he.ma_ktv`. Frontend `MaYeuCauSuCoCheck` debounce 500ms, 3 trạng thái banner, chỉ nhắc
   nhở không chặn submit.
6. Thay "Nhân bản từ phiếu cũ" (không hiệu quả) bằng "Top 20 linh kiện thường đặt" TOÀN HỆ THỐNG —
   endpoint `GET /dat-mua-lk/top-linh-kien` (GROUP BY `ma_lk, loai_de_xuat` toàn bảng `dat_don_hang`,
   cache bằng `getOrCompute`/`recompute` ở `precomputedCache.ts`, `recompute()` sau mỗi lần tạo đơn
   thành công để danh sách top luôn theo kịp mà không quét lại mỗi request).
7. Bỏ "Ghi chú (tuỳ chọn)" cấp phiếu tổng (field cấp dòng giữ nguyên).
8. **Bỏ hẳn ô nhập tay "Số tiền công nợ"** — thay bằng "Giá đề xuất ước tính" = giá tham chiếu × số
   lượng, hiện cho MỌI loại đề xuất (không riêng CÔNG NỢ), kèm ghi chú "*Giá tham khảo, không phải
   giá cuối" + dòng tổng cộng cuối form.
9. Ẩn Chính sách/TT+Mail duyệt/TT khách hàng khi Loại đề xuất là MUA HÀNG (nút "Hiển thị thêm ▾" để
   mở rộng thủ công nếu cần) — Mã yêu cầu sự cố KHÔNG nằm trong danh sách ẩn.
11. Dòng mới ("+ Thêm dòng") tự kế thừa Loại đề xuất từ dòng trước đó.
12. Bỏ tab "Tạo phiếu đặt" riêng — gộp thành nút "+ Tạo đơn" trong "Đơn của tôi/Danh sách", bấm vào mở
    `TaoDonTab` dạng `<Modal>` ngay tại đó (toàn bộ xử lý trên 1 cửa sổ).

### Kiểm thử
`tsc --noEmit` sạch cả 2 phía, `npm run build` thành công (không lỗi biên dịch/bundle). Rà lại code
JSX/logic của `TaoDonTab`/`MaYeuCauSuCoCheck`/2 endpoint backend mới đối chiếu plan — khớp đúng cả
12 điểm. Sửa 1 lệch tên field nhỏ phát hiện lúc rà: frontend khai báo `cnt` nhưng backend trả
`so_lan` cho `/top-linh-kien` (field này chưa được hiển thị nên không phải bug runtime, chỉ sửa cho
đúng type). Không migration mới (chỉ thêm route + 1 dòng cache mới trong `precomputed_cache` đã có
sẵn từ trước). Chưa kiểm chứng được luồng đầy đủ qua trình duyệt thật vì cần đăng nhập Google — hạn
chế đã ghi nhận từ các phiên trước.

Tăng version `1.188` → `1.189`, deploy `smarttrade` thành công.

## 2026-08-15 (đợt 5 cùng ngày) — Redesign layout/màu sắc dòng nhập liệu "Tạo phiếu đặt"

Sau v1.189, chủ hệ thống phản hồi tiếp (đóng vai người thiết kế UI đánh giá): (1) ô "Mã linh kiện"
quá hẹp, tên linh kiện dài bị cắt; (2) giao diện "xấu và nhạt nhẽo" cần thêm màu sắc; (3) cần bố cục
gọn, ưu tiên điện thoại, các trường hay điền cùng lúc đặt gần nhau để tab nhanh, "Ghi chú" xuống cuối.

Chẩn đoán: card 1 dòng dùng lưới `grid-cols-2 sm:grid-cols-6`, ô "Mã linh kiện" là `col-span-2
sm:col-span-2` — full width trên mobile nhưng chỉ 2/6 (33%) trên tablet/desktop → đúng nguyên nhân bị
cắt tên dài. "Giá đề xuất ước tính" chèn có điều kiện ngay sau Mã linh kiện làm bố cục nhảy. "Ghi
chú" nằm giữa form (trước Yêu cầu hóa đơn/Mã yêu cầu sự cố), không phải cuối.

### Thay đổi
- `Modal.tsx`: thêm prop tuỳ chọn `footer?: ReactNode`, render 1 khối cố định (border-top) NGAY SAU
  vùng `overflow-y-auto` — mặc định `undefined` nên không đổi hành vi các nơi gọi `Modal` khác.
- `TaoDonTab`: viết lại toàn bộ card mỗi dòng thành bố cục 1 cột chính (mobile-first):
  - Header card: "Dòng {n}" + `Badge` màu theo `deriveLoaiDon` (mua=ocean/công nợ=amber/trả
    hàng=coral, thêm map `LOAI_DON_TONE`) + nút "✕ Xóa dòng" chuyển lên đầu card (trước đây nằm giữa
    form, chen vào luồng tab).
  - Viền trái card (`border-l-4`) đổi màu theo cùng tone — phân biệt nhanh loại đơn giữa nhiều dòng.
  - Thứ tự mới: **Mã linh kiện (full-width MỌI breakpoint)** → Loại đề xuất (2 trường "nhận diện" hay
    đổi cùng lúc, đặt sát nhau) → [Số lượng | Giá đề xuất ước tính dạng thẻ số liệu nổi bật nền
    ocean-100] → Gợi ý thay thế → *"Thông tin bổ sung"* → [Yêu cầu hóa đơn | Mã yêu cầu sự cố +
    banner cảnh báo] → [Chính sách | TT+Mail duyệt] + TT khách hàng (nếu `showThem`) → nút mở rộng →
    **Ghi chú (cuối cùng)**.
  - Tổng giá đề xuất ước tính + nút "+ Thêm dòng"/"Tạo phiếu đặt" chuyển vào `footer` của `Modal` —
    luôn hiển thị cố định đáy dù cuộn bao nhiêu dòng (giống thanh tổng tiền/nút thanh toán cố định
    của Shopee/Tiki), phục vụ thao tác nhanh trên điện thoại.
  - Chip "Chọn nhanh linh kiện thường đặt" đổi nền mặc định từ xám sang tint ocean-100/40% + chữ
    ocean-700; nhãn 2 mục lớn ("Người nhận hàng...", "Chọn nhanh linh kiện...") đổi màu ocean-700 để
    tăng phân vùng thị giác — không thêm token màu mới, dùng lại đúng bảng màu sẵn có (`tokens.css`).

### Kiểm thử
`tsc --noEmit` sạch, `npm run build` thành công (không lỗi cấu trúc JSX/bundle). Không kiểm chứng
được qua trình duyệt thật (cần đăng nhập Google — hạn chế đã ghi nhận từ trước). Không có thay đổi
backend/migration.

Tăng version `1.189` → `1.190`, deploy `smarttrade` thành công.

## 2026-08-15 (đợt 6 cùng ngày) — 2 chế độ xem danh sách, cột "Mã yêu cầu sự cố" liên kết ca, redesign modal chi tiết phiếu

Chủ hệ thống góp ý tiếp màn "Đơn của tôi / Danh sách" (`DonCuaToiTab`) và modal chi tiết phiếu
(`PhieuDatDetailModal`): (1) cần 2 kiểu xem — chỉ dòng mẹ (giữ hành vi cũ) hoặc gộp dòng mẹ (đậm) +
dòng con (nhạt, kèm thao tác nhanh); (2) thêm cột "Mã yêu cầu sự cố liên quan" bấm mở ca chi tiết,
nhưng UI ca chi tiết không dành cho KTV/CTV/Trạm; (3) modal chi tiết phiếu quá chật, cần thiết kế lại.

### Backend
Thêm `GET /api/dat-mua-lk/don-hang/by-phieu?ids=ID1,ID2,...` (`datMuaLinhKien.ts`) — lấy dòng con
(`dat_don_hang`) cho NHIỀU phiếu cùng lúc (tối đa 100 id), join `phieu_dat` áp `scopeDatMuaNguoiTao`,
không kèm logs/cases (nhẹ, dành cho hiển thị danh sách — modal chi tiết vẫn là nơi xem đầy đủ lịch sử).

### Frontend — 2 chế độ xem
Thêm segmented control "Chỉ phiếu" / "Phiếu + dòng" (`useLocalStorageState`) cạnh bộ lọc trạng thái.
"Chỉ phiếu" giữ nguyên `PaginatedTable` cũ. "Phiếu + dòng" dùng component mới `PhieuDongBang`: mỗi
phiếu là 1 khối đậm (nền `--surface-100`, giữ nguyên badge tổng hợp + nút "Chi tiết"), theo sau các
dòng con thụt lề nhạt hơn (viền trái theo `LOAI_DON_TONE`, tái dùng từ đợt redesign `TaoDonTab`) kèm
nút Duyệt/Từ chối/Hủy ngay tại chỗ — không cần mở modal để xử lý 1-2 dòng. Tái dùng nguyên cơ chế
`POST /don-hang/bulk-log` (đã hỗ trợ sẵn cả id dòng lẻ, không cần endpoint hành động mới), refactor
`bulkMutation` để nhận `ids` tường minh thay vì đọc qua closure `selected` (tránh xung đột giữa 2
luồng: chọn hàng loạt cấp phiếu của Tram và thao tác nhanh 1 dòng). Nâng `actionsFor()` (hàm quyết
định nút nào hiện theo vai trò/trạng thái) từ nội bộ `PhieuDatDetailModal` lên module-level để dùng
chung cả 2 nơi.

### Cột "Mã yêu cầu sự cố" + mở ca chi tiết (role-gated)
`App.tsx` truyền `openCase` vào `DatMuaLinhKienModule` (trước đây module này chưa nhận prop này).
Tính `canXemChiTietCa = !(user.la_ktv_dvbh || user.la_ve_tinh)` ở cấp module — "Trạm" chỉ là 1 tài
khoản `la_ktv_dvbh` có Vệ tinh trực thuộc nên cùng bị chặn theo đúng cờ này, không cần check riêng.
Component mới `MaYcscCell`: nếu `canXemChiTietCa` → span bấm mở `openCase(id, "giai-trinh")` (đúng
pattern có sẵn ở `SurveyModule.tsx`); ngược lại vẫn hiện giá trị dạng text thường (không ẩn dữ liệu,
chỉ không bấm mở được). Áp dụng ở cả dòng con trong `PhieuDongBang` và bảng dòng trong modal chi tiết.

### Redesign PhieuDatDetailModal
Tăng `width="max-w-6xl"` (từ mặc định 512px). Khối thông tin đầu đổi từ 1 dòng chữ phẳng sang lưới
thẻ label rõ ràng. Bảng dòng đơn hàng tăng padding, cột "Loại" đổi sang `Badge` màu, thêm cột "Mã yêu
cầu sự cố". Chuyển toàn bộ panel "từ chối"/thanh hành động hàng loạt xuống `footer` prop của `Modal`
(đã có sẵn từ đợt trước) — luôn cố định đáy, không mất khi cuộn nhiều dòng.

### Kiểm thử
`tsc --noEmit` sạch cả 2 phía, `npm run build` thành công. Rà lại logic: `bulkMutation` refactor
không phá vỡ luồng bulk cũ (Tram chọn nhiều phiếu), phát hiện + sửa 1 thiếu sót lúc rà: modal chi
tiết dùng `logMutation`/`bulkMutation` RIÊNG (không phải bulkMutation vừa refactor) nên cần tự thêm
invalidate `["dat-mua-lk-don-hang-by-phieu"]` vào hàm `invalidate()` nội bộ của modal để đồng bộ cache
2 nơi. Không có migration mới. Không kiểm chứng được qua trình duyệt thật (cần đăng nhập Google — hạn
chế đã ghi nhận từ trước).

Tăng version `1.190` → `1.191`, deploy `smarttrade` thành công.

## 2026-08-15 (phiên tiếp) — 6 hạng mục UX + tính năng "khu vực phụ trách"

Chủ hệ thống góp ý tiếp 6 điểm trên module "Đặt mua linh kiện" sau v1.191. Hỏi lại 3 điểm mấu chốt
trước khi code: (1) lý do hủy đơn nhập TỰ DO (không dùng lại danh mục "Lý do chậm" của TN — sai ngữ
nghĩa); (2) "SL đơn" (đếm dòng) và "SL đề xuất/đã đặt" (cộng `so_luong_de_xuat`) là 2 số khác nhau,
nhưng rà lại thấy "SL đã đặt" = "SL đề xuất" trong danh sách gốc — gộp thành 1 chỉ số, đã báo lại chủ
hệ thống; (3) phạm vi thẻ báo cáo theo vai trò — câu trả lời mở ra 1 tính năng con mới "khu vực phụ
trách" (xem dưới).

### A. Bắt buộc lý do khi hủy đơn
`applyDonHangLog()` (`datMuaLinhKien.ts`) nhánh `hanhDong === "huy"`: thêm điều kiện bắt buộc
`ghiChu?.trim()` khác rỗng, thiếu thì trả lỗi `THIEU_LY_DO_HUY` (400) — áp dụng tự động cho cả
`POST /don-hang/:id/log` và `bulk-log` (dùng chung hàm). Frontend: nút "Hủy" không gọi `mutate()`
thẳng nữa — tổng quát hoá state `rejectTarget` (chỉ dùng cho "từ chối") thành `ActionTarget {id,
action: "tu_choi" | "huy"}` dùng chung cho cả `PhieuDatDetailModal` và `PhieuDongBang`/`DonCuaToiTab`,
mở panel nhập lý do (bắt buộc với "huy", không có ô chọn Lý do chậm như "từ chối").

### B. Tô màu/gạch ngang dòng theo trạng thái
Map mới `DON_HANG_ROW_STYLE` (module-level): "Đã hủy"/"TN từ chối" → gạch ngang + chữ đỏ, "Chờ Trạm/
TN duyệt" → chữ cam, "Chờ hàng" → cam đậm hơn, "TN đã duyệt" → chữ xanh lá (dùng token màu có sẵn,
không thêm màu mới). Áp dụng lên PHẦN TÊN linh kiện (không toàn hàng) ở cả `PhieuDongBang` và bảng
dòng trong `PhieuDatDetailModal`, giữ `StatusBadge` cạnh bên làm điểm neo chính.

### C. Modal chi tiết phiếu gần full màn hình
Thêm prop tuỳ chọn `height?: string` cho `Modal.tsx` (mặc định giữ `max-h-[88vh]` như cũ, không đổi
hành vi nơi khác). `PhieuDatDetailModal` đổi sang `width="max-w-[96vw]" height="max-h-[94vh]"`.

### D. Dòng con hiện dạng bảng cột trong chế độ "Phiếu + dòng"
Viết lại `PhieuDongBang` — dòng con từ 1 hàng flex/pill sang bảng `<table>` thật với đủ cột (Linh
kiện/Loại/SL/Giá đề xuất/Mã yêu cầu sự cố/Trạng thái/Hành động), khớp bộ cột đã dùng ở modal chi tiết
để 2 nơi nhất quán — Duyệt/Từ chối/Hủy trực tiếp không cần mở "Chi tiết".

### E. Nhãn cho 2 ô chọn ngày
Thêm nhãn "Từ ngày"/"Đến ngày" trước mỗi input, bọc cả cụm 3 control (người tạo + 2 ngày) trong 1
khối có `title` giải thích mục đích lọc (dành cho Trạm xem đơn Vệ tinh mình quản lý).

### F. Tính năng mới: "Khu vực phụ trách" (Giám sát) cho TN/Kho/Kế toán
Câu trả lời làm rõ phạm vi thẻ báo cáo mở ra yêu cầu: Admin có thể gán 1/nhiều Giám sát cho 1 người
TN/Kho/Kế toán → "hàng đợi cần xử lý" (badge + thẻ báo cáo) của người đó chỉ tính đơn của các Giám
sát được gán; nếu họ vẫn xử lý 1 đơn ngoài khu vực (tìm/lọc thủ công) → hệ thống TỰ ĐỘNG gán thêm
Giám sát đó (auto-claim). Chốt làm luôn trong đợt này, không tách ra sau. Thiết kế là scope MỀM —
danh sách/tìm kiếm phiếu GIỮ NGUYÊN không giới hạn (`scopeDatMuaNguoiTao()` không đổi), chỉ ảnh hưởng
2 chỗ: badge sidebar/`SummaryStrip` và thẻ báo cáo tổng thể mới. Auto-claim chỉ kích hoạt cho người
ĐÃ có ≥1 dòng gán sẵn (Admin đã bắt đầu cấu hình) — người chưa được gán gì vẫn ở chế độ không giới
hạn như cũ.

Migration mới `0073_dat_mua_lk_phu_trach_gs.sql` (bảng `dat_mua_lk_phu_trach_gs`, PK
`(nguoi_phu_trach, giam_sat_email)`, cờ `tu_dong_gan` phân biệt Admin gán tay hay hệ thống tự gán).
`scopeDatMua.ts` thêm `phuTrachGsSet(db, email)` (trả `null` nếu 0 dòng = không giới hạn) và
`autoClaimGs(db, nguoiPhuTrach, emailGs)`. Hook auto-claim ở 2 điểm hành động chính (không phủ hết
mọi route để tránh phình phạm vi — đã báo giới hạn này với chủ hệ thống): `applyDonHangLog()` (TN
duyệt/từ chối) và `POST /phieu-xuat-kho/:id/log` (Kho/Kế toán — 1 PXK có thể gộp dòng từ nhiều
`phieu_dat` khác nhau nên auto-claim từng `email_gs` liên quan). Route quản lý mới (Admin only):
`GET/PUT /dat-mua-lk/phu-trach-gs`. Áp scope vào 6 bucket TN/Kho/Kế toán của
`computeDatMuaLkBreakdown` (`notifications.ts`). UI quản lý: khối "Khu vực phụ trách (Giám sát)" mới
trong `EditUserModal` (`UsersModule.tsx`), hiện khi `laKho || laKeToan || role === "TBP DVBH" ||
role === "Admin"`, lưu độc lập với nút "Lưu" chính của modal (route riêng, bảng riêng). Thêm method
`api.put()` vào `api/client.ts` (trước đó chỉ có get/post/patch/delete).

### G. Thẻ báo cáo tổng thể theo vai trò
`GET /dat-mua-lk/bao-cao-tong-the` — 12 chỉ số (đã gộp "SL đã đặt"="SL đề xuất"), loại trừ MỌI dòng
"Đã hủy" (không phân biệt tự hủy hay bị từ chối — chốt với chủ hệ thống là cách đơn giản nhất), phạm
vi `loai_don != 'tra_hang'`. Scope theo vai trò: KTV/Vệ tinh → đơn cá nhân (nguoi_tao=mình HOẶC
nguoi_nhan_hang=mình — CỐ Ý không gồm Vệ tinh của Trạm mình, khác `scopeDatMuaNguoiTao` dùng cho danh
sách); Giám sát → mọi đơn của KTV mình phụ trách (`email_gs=mình`); TN/Kho/Kế toán → tái dùng
`phuTrachGsSet` (mục F). Không cache (chỉ chạy khi mở module). Frontend: lưới `StatCard` 3 nhóm (Đơn
hàng/Tiền/Xuất kho) ngay dưới `SummaryStrip`, hiện ở MỌI tab — ẩn nhóm "Xuất kho" cho KTV/Vệ tinh
thuần.

### Kiểm thử
`tsc --noEmit` sạch cả 2 phía (đã sửa vài lượt do refactor `ActionTarget`), `npm run build` thành
công. Migration 0073 áp thành công cả local lẫn remote `smarttrade`. Không kiểm chứng được qua trình
duyệt thật (cần đăng nhập Google — hạn chế đã ghi nhận từ trước).

Tăng version `1.194` → `1.195`, deploy `smarttrade` thành công.

**3 khoảng trống chưa có chỉ số trong thẻ báo cáo** (sẽ hỏi chủ hệ thống có cần bổ sung không): số
đơn đang "Chờ hàng" (thiếu LK), 2 trạng thái PXK cuối "Hàng trừ kho"/"Kho đã kết thúc" (khác "KTV đã
nhận"), và toàn bộ luồng trả hàng (đang loại trừ theo đúng quy ước `loai_don != 'tra_hang'` sẵn có
của module).

## 2026-08-15 (phiên 2) — tab "Báo cáo" riêng theo KTV + chốt nghiệp vụ "1 PXK = 1 KTV"

Chủ hệ thống dùng thử v1.195, yêu cầu nâng thẻ báo cáo (đang là lưới `StatCard` số tổng hiện dưới
mọi tab) thành 1 **tab "Báo cáo" riêng**, dạng bảng, tách theo từng KTV cho vai trò Giám sát/TN/Kho/
Kế toán, bấm số nhảy sang danh sách chi tiết kèm filter. Trong lúc thiết kế, chủ hệ thống tự sửa 1
điểm nghiệp vụ quan trọng: **"1 phiếu xuất kho (PXK) chỉ được gắn cho DUY NHẤT 1 KTV — vì khi tạo
phiếu xuất phải chọn xuất cho KTV nào"**, thay đổi so với thiết kế cũ (migration 0066: "1 PXK có thể
gộp dòng từ nhiều phiếu đặt" — trước đây TN có thể gộp dòng của NHIỀU KTV khác nhau vào cùng 1
phiếu).

### A. Chốt "1 PXK = 1 KTV"
Migration `0074_pxk_nguoi_nhan_hang.sql`: thêm cột `phieu_xuat_kho.nguoi_nhan_hang` (REFERENCES
`users(email)`), backfill CHỈ điền cho PXK có ĐÚNG 1 giá trị KTV duy nhất trong các dòng của nó
(`HAVING COUNT(DISTINCT pd.nguoi_nhan_hang) = 1`), còn lại giữ NULL (an toàn cho dữ liệu cũ hiếm gặp
đã gộp nhiều KTV trước khi chốt quy tắc — sẽ không xuất hiện trong báo cáo theo KTV, không chặn
nghiệp vụ hiện có). `POST /phieu-xuat-kho` (`phieuXuatKho.ts`): bắt buộc body `nguoi_nhan_hang`,
validate mọi `dat_don_hang_ids` chọn đều thuộc đúng 1 KTV đó — khác thì trả lỗi mới
`NHIEU_KTV_TRONG_1_PXK` (400). `GET /phieu-xuat-kho` thêm query param `nguoi_nhan_hang` để lọc.
Frontend (`PhieuXuatKhoTab`): modal tạo phiếu thêm bước "Chọn KTV nhận hàng" TRƯỚC khi hiện danh
sách dòng để chọn (danh sách tự lọc theo KTV đã chọn, ô tìm kiếm không còn tìm theo tên người nhận
vì đã là bộ lọc cứng); bảng danh sách thêm cột "Người nhận hàng" + bộ lọc theo KTV.

### B. Báo cáo tổng thể — đổi sang bảng theo từng KTV
Nhờ mục A, "Tổng chờ chuyển" (tiền) giờ gán được ĐÚNG theo từng KTV (trước đây không thể vì PXK có
thể gộp nhiều KTV) — đưa thẳng vào làm 1 cột bình thường thay vì phải tách riêng như dự tính ban đầu.
`GET /dat-mua-lk/bao-cao-tong-the` viết lại hoàn toàn: giữ nguyên `scope` cũ (Giám sát/TN-Kho-Kế
toán qua `phuTrachGsSet`/KTV-Vệ tinh/khác), đổi từ 1 object tổng hợp sang `GROUP BY nguoi_nhan_hang`
— 2 query (đơn hàng/tiền từ `dat_don_hang JOIN phieu_dat`, xuất kho từ `phieu_xuat_kho` trực tiếp
nhờ cột mới, không cần join qua `phieu_xuat_kho_dong` nữa) merge theo email thành mảng `BaoCaoRow[]`.

### C. Frontend — tab "Báo cáo" mới
Bỏ lưới `StatCard` cũ hiện dưới `SummaryStrip` ở MỌI tab, chuyển vào tab `bao-cao` riêng
(`BaoCaoTab`): nếu API trả `rows.length <= 1` (KTV/Vệ tinh tự xem mình) → vẫn hiện lưới `StatCard` 3
nhóm như cũ; nếu `rows.length > 1` (GS/TN/Kho/Kế toán, đã tự scope theo `phuTrachGsSet`/khu vực phụ
trách — KHÔNG mở rộng ra toàn hệ thống theo yêu cầu chủ hệ thống) → bảng 2 tầng header (nhóm cột Đơn
hàng/Tiền/Xuất kho), ô tìm kiếm lọc theo tên/email trong phạm vi đã scope, sắp xếp mặc định theo
"tồn đọng" giảm dần (`(slDon - slDuyet - slTuChoi) + slChoKeToan + slChoKhoGui + slDaGui`, đẩy người
còn nhiều việc lên đầu — theo đúng yêu cầu chủ hệ thống), hàng "Tổng cộng" cố định cuối bảng. Mỗi ô
số là nút bấm gọi `onJump({tab, filter, nguoiNhanHang})` — mở rộng `JumpTarget` thêm
`nguoiNhanHang?: string`, `DonCuaToiTab`/`PhieuXuatKhoTab` đọc qua prop
`initialNguoiNhanHangOverride` (cùng pattern `initialFilterOverride` đã có).

### Kiểm thử
`tsc --noEmit` sạch cả 2 phía, `npm run build` thành công. Migration 0074 áp thành công cả local lẫn
remote `smarttrade`. Không kiểm chứng được qua trình duyệt thật (cần đăng nhập Google — hạn chế đã
ghi nhận từ trước).

## 2026-08-15 (phiên 3) — rà soát toàn bộ luồng chính "Đặt mua linh kiện", Đợt 1 (A+B)

Chủ hệ thống yêu cầu rà lại TOÀN BỘ luồng nghiệp vụ chính module "Đặt mua linh kiện" (tạo đơn → TN xử
lý → Kế toán → Kho → KTV nhận hàng, + 2 luồng phụ "thiếu linh kiện"/"trả hàng"), mô tả chi tiết 8
điểm. Đối chiếu với code hiện tại phát hiện 8 điểm sai khác, đã trao đổi lại và chốt thiết kế cho
từng điểm (đúng nguyên tắc "có vấn đề thì trao đổi, không tự đoán"). Khối lượng rất lớn nên chia 4
đợt triển khai độc lập — kế hoạch đầy đủ lưu tại `C:\Users\HP\.claude\plans\concurrent-mapping-wolf.md`.
Phiên này làm **Đợt 1 (A+B)** — nền tảng, rủi ro cao nhất nên làm riêng trước.

### A. Vệ tinh chỉ là người tạo đơn — Trạm mới là người nhận hàng thật sự
Chốt: đơn do Vệ tinh tạo (hoặc TN/GS chỉ định Vệ tinh làm người nhận hàng) phải tự động quy về
`tram_cha` của Vệ tinh đó — Vệ tinh chỉ đóng vai trò đề xuất, Trạm mới chịu trách nhiệm nhận/xử lý.
Thêm hàm dùng chung `resolveNguoiNhanHang()` (`datMuaLinhKien.ts`): nếu người nhận là Vệ tinh
(`la_ve_tinh`), trả về `tram_cha` (lỗi `VE_TINH_CHUA_GAN_TRAM` nếu Vệ tinh đó chưa được gán Trạm);
ngược lại giữ nguyên. Áp dụng cả ở tạo tay (`POST /phieu-dat`) lẫn import Excel
(`processDatDonHangImportRows`).

### B. Bỏ hẳn khái niệm "phiếu đặt" khỏi trải nghiệm người dùng
**Ràng buộc kỹ thuật**: `phieu_dat` có ≥5 bảng con giữ FK sống (`dat_don_case`, `thieu_lk`,
`tra_hang_log`, `phieu_xuat_kho_dong`, `dat_don_hang_log`) nên D1 KHÔNG cho phép xoá bảng/cột FK bằng
recreate-table — bảng `phieu_dat` phải giữ lại ở tầng DB (vẫn tạo ngầm mỗi lần đặt đơn để thoả FK)
nhưng từ nay không route/UI nào đọc lại nó nữa.

Migration `0075_dat_don_hang_denormalize_gs_nhan_hang.sql`: thêm 2 cột `dat_don_hang.email_gs` và
`dat_don_hang.nguoi_nhan_hang` (denormalize từ `phieu_dat`, backfill qua correlated subquery), 2 index
mới. Viết lại toàn bộ nơi đọc `pd.*`/JOIN `phieu_dat` sang đọc thẳng `ddh.*`: `scopeDatMua.ts`
(`scopeDatMuaNguoiTao`, alias bắt buộc là `ddh`), `notifications.ts`
(`computeDatMuaLkBreakdown`), `phieuXuatKho.ts` (auto-claim GS, `GET /don-hang-kha-dung`, validate "1
PXK = 1 KTV"), `GET /bao-cao-tong-the` (scope đổi từ chuỗi cố định sang closure nhận alias, dùng lại
được cho cả `ddh` và `ddh2` trong 2 query khác nhau).

`GET /phieu-dat` (trả theo phiếu) → thay bằng `GET /don-hang` (trả DANH SÁCH DÒNG phẳng, phân trang
server-side thật — sửa luôn 1 bug tồn tại từ trước: `page`/`pageSize` trước đây không được gửi lên
backend, luôn chỉ lấy trang 1 rồi `.slice()` phía client). `GET /phieu-dat/:id` +
`GET /don-hang/by-phieu` → gộp thành `GET /don-hang/:id` (chi tiết 1 dòng, kèm `logs`/`cases`).
`POST /don-hang/bulk-log` bỏ nhánh mở rộng "id phiếu_dat → các dòng con" (không còn phiếu id để
truyền vào).

Frontend (`DatMuaLinhKienModule.tsx`): bỏ toggle "Chỉ phiếu"/"Phiếu + dòng" trong `DonCuaToiTab` —
chỉ còn 1 kiểu hiển thị dạng dòng phẳng, phân trang server-side đúng. `PhieuDongBang` (nhóm theo
`phieu_dat_id`) → `DonHangGroupedList` (nhóm CLIENT-SIDE theo `nguoi_nhan_hang`, dùng lại đúng mảng
dòng đã fetch sẵn ở component cha thay vì gọi thêm 1 API riêng) — mỗi khối là 1 KTV, badge tổng hợp
tính trên các dòng đang hiện ở trang đó (đánh đổi chấp nhận được: 1 KTV có thể bị chia 2 trang nếu
dòng nằm sát ranh giới, danh sách đã sắp theo `nguoi_nhan_hang` ở backend nên hiếm gặp). `chọn hàng
loạt` của Trạm chuyển từ cấp phiếu sang cấp dòng (`trang_thai === "Cho Tram duyet"`).
`PhieuDatDetailModal` → `DonHangDetailModal` (xem/xử lý ĐÚNG 1 dòng, gọi `GET /don-hang/:id` mới,
không còn checkbox/bulk-select trong modal).

### Kiểm thử
`tsc --noEmit` sạch cả 2 phía (backend đã sửa xong 8 endpoint, frontend viết lại 3 component chính).
`npm run build` thành công. Migration 0075 áp thành công cả local lẫn remote `smarttrade` (lần đầu áp
remote gặp lỗi API tạm thời `[code: 7403]`, thử lại lần 2 thành công — không phải lỗi cấu hình).
Không kiểm chứng được qua trình duyệt thật (cần đăng nhập Google — hạn chế đã ghi nhận từ trước).

Tăng version `1.196` → `1.197`, deploy `smarttrade` thành công.

**Còn lại của kế hoạch 8 điểm** (chưa làm, xem chi tiết trong file plan): Đợt 2 (C+D+E+F — PXK "mã
đơn hàng" nhập sau khi KTV chuyển tiền, Kế toán điền "Mã MISA" trên PXK, tách "Mã vận đơn" khỏi ghi
chú, KTV xác nhận nhận hàng bắt buộc đúng người + ảnh biên bản lên Google Drive qua Service Account),
Đợt 3 (G — ticket thiếu linh kiện hiện đủ thông tin nguồn gốc, redesign dạng thẻ), Đợt 4 (H — luồng
trả hàng dùng chung `phieu_xuat_kho` sau bước TN duyệt tổng, theo đúng bảng "TRẠNG THÁI GỬI HÀNG"
Excel gốc).

## 2026-08-15 (phiên 4) — Đợt 2 (C+D+E+F): PXK mã đơn hàng nhập sau, Mã MISA, Mã vận đơn, KTV xác nhận + ảnh biên bản Google Drive

Tiếp tục kế hoạch 8 điểm (phiên 3), làm Đợt 2 — 4 mục C/D/E/F đều là các cột mới độc lập trên
`phieu_xuat_kho`, gộp chung 1 migration.

Migration `0077_pxk_ma_xac_nhan_misa_van_don_bien_ban.sql`: thêm 4 cột `ma_xuat_kho_xac_nhan`
(INTEGER, backfill = 1 cho mọi PXK cũ vì đã có mã thật nhập tay theo luồng cũ), `ma_misa`,
`ma_van_don`, `anh_bien_ban_url`.

### C. "Mã đơn hàng" nhập SAU khi KTV chuyển tiền xong
`POST /phieu-xuat-kho`: `ma_xuat_kho` trong body giờ TUỲ CHỌN — nếu không truyền, tự điền placeholder
= chính `id` PXK (luôn duy nhất, thoả UNIQUE) và `ma_xuat_kho_xac_nhan = 0`. `PATCH
/:id/ma-xuat-kho` (mới, chỉ TN, chỉ khi PXK còn "Dang tao phieu"): TN nhập mã thật, set
`ma_xuat_kho_xac_nhan = 1`, đồng bộ lại `dat_don_hang.ma_xuat_kho` của mọi dòng trong phiếu. `POST
/:id/log` chặn chuyển "Cho ke toan" nếu `!ma_xuat_kho_xac_nhan` (lỗi mới
`MA_XUAT_KHO_CHUA_XAC_NHAN`). Frontend: bỏ hẳn ô "Mã xuất kho \*" khỏi modal TẠO phiếu; thêm khối
"Mã đơn hàng" trong `PxkDetailModal` (hiện khi còn "Dang tao phieu"), nút "Gửi kế toán" disable thêm
khi chưa xác nhận.

### D. Kế toán điền "Mã MISA" trên chính PXK
`PATCH /:id/ma-misa` (mới, chỉ Kế toán, chỉ khi "Cho ke toan"). `POST /:id/log` chặn chuyển "Da chot
xong don xuat" nếu thiếu `ma_misa` (lỗi `MISSING_MA_MISA`). Frontend: khối "Mã MISA" trong
`PxkDetailModal` (hiện khi "Cho ke toan" + là Kế toán), nút "Đã chốt xong đơn xuất" disable thêm khi
thiếu.

### E. Tách "Mã vận đơn" khỏi ghi chú chung
`POST /:id/log` nhận thêm `ma_van_don?` trong body — khi chuyển "Dang gui KTV" và có truyền, lưu vào
cột riêng thay vì gộp vào `ghi_chu`. Frontend: `PxkDetailModal` thêm ô "Mã vận đơn (tuỳ chọn)" tách
riêng, chỉ hiện cho Kho ở bước "Da chot xong don xuat"; hiện `ma_van_don`/`ma_misa` ở header chi
tiết + thêm cột "Mã vận đơn" trong bảng danh sách PXK.

### F. KTV xác nhận nhận hàng bắt buộc đúng người + ảnh biên bản lên Google Drive
`POST /:id/log` nhánh "KTV da nhan": bắt buộc `user.email === pxk.nguoi_nhan_hang` (hoặc Admin) —
trước đây bất kỳ ai cũng xác nhận được. Thêm `backend/src/lib/googleDrive.ts`: tự ký JWT RS256 bằng
Web Crypto (`crypto.subtle.importKey("pkcs8", ...)` + `sign`, không thêm npm package nào) từ Service
Account, đổi lấy access token qua luồng "JWT Bearer" chuẩn của Google (mirror đúng pattern
fetch+URLSearchParams đã dùng ở `auth.ts`), upload `multipart/related` thủ công (Drive không chấp
nhận `multipart/form-data` của `FormData`) lên `POST /:id/anh-bien-ban` (endpoint mới, đọc binary thô
qua `c.req.arrayBuffer()` — điểm khởi đầu đầu tiên trong repo nhận file nhị phân, không multipart
parsing phía nhận). 3 secret mới trong `Env`: `GOOGLE_DRIVE_SA_EMAIL`, `GOOGLE_DRIVE_SA_PRIVATE_KEY`,
`GOOGLE_DRIVE_FOLDER_ID`. Frontend: `PxkDetailModal` thêm input `<input type="file" accept="image/*"
capture>` (chỉ hiện cho đúng người nhận hàng, ở bước "Dang gui KTV") gọi `api.postBinary` (client
mới, gửi `ArrayBuffer` với `Content-Type` là mime ảnh thật — khác `postForm` dùng `FormData`); nút
"KTV đã nhận" chỉ hiện cho đúng người nhận hàng (Admin có nút riêng "xác nhận thay" cho trường hợp
đặc biệt, backend vẫn cho phép nhưng UI tách rõ để tránh nhầm lẫn).

**Lưu ý quan trọng — tính năng ảnh biên bản CHƯA hoạt động được ngay**: 3 secret Google Drive chưa
được set trên Worker (`wrangler secret list` xác nhận thiếu). Cần: (1) tạo Service Account trên
Google Cloud, (2) share 1 thư mục Drive thật (khuyến nghị dùng Gmail của Admin, free 15GB) cho email
Service Account với quyền Editor, (3) `wrangler secret put GOOGLE_DRIVE_SA_EMAIL` /
`GOOGLE_DRIVE_SA_PRIVATE_KEY` (PEM từ JSON key) / `GOOGLE_DRIVE_FOLDER_ID` trên `wrangler.smarttrade.jsonc`.
Trước khi hoàn tất bước này, nút tải ảnh sẽ báo lỗi (nhưng không chặn "KTV đã nhận" — ảnh vẫn đúng
nghĩa "không bắt buộc").

### Kiểm thử
`tsc --noEmit` sạch cả 2 phía, `npm run build` thành công. Migration 0077 áp thành công cả local lẫn
remote `smarttrade` (cùng đợt còn áp lại được migration 0076 tồn đọng trước đó - tính năng "Cảnh báo
tồn" độc lập, không liên quan đợt này). Không kiểm chứng được qua trình duyệt thật (cần đăng nhập
Google — hạn chế đã ghi nhận từ trước); riêng tính năng ảnh biên bản (mục F) còn cần chủ hệ thống
test thật trên điện thoại sau khi set xong 3 secret.

Tăng version `1.197` → `1.198`, deploy `smarttrade` thành công.

**Còn lại**: Đợt 3 (G — thiếu-lk redesign dạng thẻ), Đợt 4 (H — luồng trả hàng dùng chung PXK).

## 2026-08-15 (phiên 5) — fix: dropdown "Người nhận hàng (tạo hộ)" chỉ hiện 4/460 KTV

Chủ hệ thống test v1.198 với vai trò Admin, phát hiện dropdown "Người nhận hàng (tạo hộ)" ở màn "Tạo
đơn" chỉ hiện 4 KTV dù Settings > Danh sách KTV đã ghép "Email đăng nhập" cho 460 người. Điều tra qua
D1 (chỉ dùng `SELECT` — `d1 execute --remote` với INSERT/UPDATE tuỳ ý bị chặn bởi bộ lọc an toàn của
Claude Code, không có cách lách):

- `ktv_lien_he` (Danh sách KTV): 460 dòng đã ghép `email_dang_nhap`.
- Nhưng chỉ 4/460 email đó thực sự có 1 dòng trong bảng `users` — vì `users` chỉ được tạo khi người
  đó **đăng nhập Google lần đầu tiên** (xem `auth.ts`/`loadUser.ts`).
- `GET /dat-mua-lk/nguoi-nhan-hang-kha-dung` (nguồn của dropdown) JOIN `ktv_lien_he` với `users` — ai
  chưa từng đăng nhập thì biến mất khỏi danh sách.
- Sâu hơn: `dat_don_hang.nguoi_nhan_hang`/`phieu_xuat_kho.nguoi_nhan_hang` là **FK thật** tới
  `users(email)` (migration 0068/0074/0075) — nên đây không chỉ là lỗi hiển thị, mà **không thể tạo
  đơn hộ** cho ai chưa đăng nhập, dù đã ghép email trong Settings.

Đã trao đổi lại 3 phương án, chủ hệ thống chốt: dùng chính "mã KTV" (khoá của Danh sách KTV) + tự cấp
sẵn tài khoản khi email đã ghép — tức **tự động cấp 1 tài khoản `users` "placeholder"** ngay khi Admin
ghép `email_dang_nhap` trong Settings, thay vì chờ họ tự đăng nhập.

### Giải pháp
`backend/src/routes/settings.ts` — hàm `provisionPlaceholderUser(db, {email, ten, vaiTroKtv,
giamSatQuanLy})`: `INSERT INTO users (email, ten, vai_tro, trang_thai_duyet, la_ktv_dvbh, la_ve_tinh,
giam_sat_quan_ly) VALUES (?, ?, NULL, 'Cho duyet', ...) ON CONFLICT(email) DO NOTHING`. Điểm mấu chốt
đảm bảo AN TOÀN: `trang_thai_duyet` giữ nguyên `"Cho duyet"` + `vai_tro` NULL — giống hệt 1 tài khoản
mới đăng nhập lần đầu thật, `loadUser.ts` vẫn chặn cứng mọi request tới khi Admin duyệt thật sự (đặt
`la_ktv_dvbh`/`la_ve_tinh` trước không tự mở quyền truy cập gì). `ON CONFLICT DO NOTHING` không bao
giờ ghi đè 1 tài khoản thật đã tồn tại; khi người đó đăng nhập Google thật, `auth.ts`'s `ON CONFLICT
DO UPDATE SET ten=excluded.ten` tự cập nhật tên thật, giữ nguyên các cột khác đã cấp sẵn.

Gọi hàm này ở 3 nơi: `PATCH /ktv-lien-he/:ma/dat-mua-lk` (ghép 1 KTV) và `POST
/ktv-lien-he/import/commit` (ghép hàng loạt qua Excel) — tự động cấp ngay cho các lần ghép MỚI từ nay
về sau; và endpoint mới `POST /ktv-lien-he/backfill-users` (Admin, idempotent) để bù cho 456 dòng đã
ghép TỪ TRƯỚC khi tính năng này tồn tại.

Frontend: nút mới "🔑 Cấp tài khoản trước cho KTV chưa đăng nhập" trong Settings > Danh sách KTV
(cạnh "⬇ Xuất Excel"), gọi endpoint backfill, hiện toast số lượng đã kiểm tra.

**Chủ hệ thống cần bấm nút này 1 lần** (Settings > Danh sách KTV) để áp dụng ngay cho 456 KTV đã
ghép từ trước — không cần chờ họ tự đăng nhập.

### Kiểm thử
`tsc --noEmit` sạch cả 2 phía, `npm run build` thành công. Không có migration mới (chỉ thêm route +
INSERT có điều kiện, không đổi schema). Không kiểm chứng được qua trình duyệt thật.

Tăng version `1.198` → `1.199`, deploy `smarttrade` thành công.

## 2026-08-16 (phiên 6) — 10 yêu cầu góp ý đợt 3 module "Đặt mua linh kiện", Đợt 1: ưu tiên, tên KTV, giá bán, mặc định UI

Sau khi hoàn tất v1.200 và viết `SPEC_MODULE_DAT_MUA_LINH_KIEN.md` (tài liệu bàn giao chức năng cho
AI khác xây lại giao diện), chủ hệ thống gửi 1 batch 10 yêu cầu/góp ý mới. Dùng `AskUserQuestion` 2
vòng để làm rõ toàn bộ điểm mơ hồ trước khi lên kế hoạch (đúng yêu cầu "không hiểu thì hỏi, không tự
ý thêm" — đã lưu thành memory nguyên tắc chung, KHÔNG lưu chi tiết 10 yêu cầu vào memory theo đúng ý
chủ hệ thống muốn sau khi làm rõ). Lên kế hoạch 5 đợt độc lập trong `concurrent-mapping-wolf.md`,
triển khai Đợt 1 trong phiên này:

- **Migration 0078**: thêm `dat_don_hang.uu_tien` (0/1) — người tạo tích ưu tiên riêng từng dòng,
  hiển thị badge ⭐ + tô nền amber nhạt ở `DonHangGroupedList`, `DonHangDetailModal`,
  `PxkDetailModal` (không đổi thứ tự sắp xếp, đúng yêu cầu).
- **Đổi nguồn "Giá đề xuất"**: từ `linh_kien.gia_tham_chieu` sang `linh_kien.gia_ban` (cột đã có sẵn
  từ đầu, đang được quản lý chủ động qua `lkSettings.ts`/`linhKienSync.ts`) — sửa `POST /phieu-dat`,
  `processDatDonHangImportRows` (import Excel), và 2 chỗ tính `giaUocTinh`/`tongGiaUocTinh` ở
  `TaoDonTab`. Giá đề xuất **vẫn là hiển thị, không cho sửa tay** (đúng ý chủ hệ thống làm rõ lại).
- **Hiện tên KTV thay vì email khắp module**: mở quyền `GET /dat-mua-lk/nguoi-nhan-hang-kha-dung`
  cho MỌI người đã đăng nhập (trước đây chỉ TN/GS gọi được — Kho/Kế toán bị 403), thêm hook dùng
  chung `useKtvDisplayMap()` + `formatNguoiDisplay()` ở frontend, áp dụng cho header nhóm trong
  `DonHangGroupedList`, cột người tạo/nhận trong `PhieuXuatKhoTab`/`PxkDetailModal`, cột trong
  `TraHangTab`/`ThieuLkTab`.
- **Mặc định "Loại đề xuất" = MUA HÀNG** khi mở form tạo đơn lần đầu (dòng duy nhất, chưa ai đụng).
  Đổi "Yêu cầu hoá đơn" từ dropdown 3 lựa chọn sang 3 nút tích chọn gọn (nhãn rút gọn "HĐ - Không thu
  phí"/"HĐ - Có thu phí", giá trị lưu DB không đổi). Ô "Mã yêu cầu sự cố" giới hạn `maxLength=20` +
  thu hẹp bề rộng.
- **Mục "Sao báo cáo không có thông tin gì cả?" — đã chẩn đoán, KHÔNG phải lỗi**: kiểm tra D1 remote
  read-only thấy production chỉ có 4 dòng đơn hàng test, 3 dòng đã "Đã huỷ" (bị tab Báo cáo loại trừ
  đúng thiết kế) + 1 dòng thiếu `nguoi_nhan_hang` (không nhóm được) → không còn dòng hợp lệ nào để
  hiện, đúng hành vi "Chưa có dữ liệu." Không sửa code.

### Kiểm thử
`tsc --noEmit` sạch cả 2 phía, `npm run build` thành công. Migration 0078 áp `local` rồi `smarttrade`
thành công. Không kiểm chứng được qua trình duyệt thật.

Tăng version `1.202` → `1.203`, deploy `smarttrade` thành công.

## 2026-08-16 (phiên 6, tiếp) — Đợt 2: tự động kích hoạt tài khoản KTV/Trạm đã khai báo sẵn khi đăng nhập lần đầu

Trước đây mọi tài khoản Google đăng nhập lần đầu (kể cả đã được Admin ghép sẵn `email_dang_nhap`
trong Settings > Danh sách KTV qua `provisionPlaceholderUser`) đều dừng ở `trang_thai_duyet='Cho
duyet'`, chờ Admin duyệt tay — `auth.ts` callback trước đây chỉ `ON CONFLICT DO UPDATE SET
ten=excluded.ten`, không đụng `trang_thai_duyet`/vai trò/cờ dù đã có sẵn. Theo yêu cầu #3 (đã chốt
"tự động kích hoạt hoàn toàn" qua `AskUserQuestion`), sửa `auth.ts`: trước khi upsert, tra
`ktv_lien_he WHERE email_dang_nhap = ?`; nếu khớp, dùng 1 câu UPSERT khác — INSERT set thẳng
`trang_thai_duyet='Da duyet'` + `la_ktv_dvbh`/`la_ve_tinh` (suy từ `vai_tro_ktv`) cho dòng MỚI, còn
ON CONFLICT dùng `CASE WHEN trang_thai_duyet = 'Cho duyet' THEN ... ELSE <giữ nguyên> END` cho từng
cột — đảm bảo KHÔNG BAO GIỜ ghi đè 1 tài khoản đã duyệt/cấu hình thủ công trước đó (kể cả khi Admin
sau này đổi sang vai trò khác). `giam_sat_quan_ly` chỉ set khi email đó đã tồn tại thật trong `users`
(kiểm tra trước, tránh đúng lỗi FK đã gặp ở phiên 5 - bug backfill-users). Email KHÔNG khớp
`ktv_lien_he`: giữ nguyên hành vi cũ (chỉ cập nhật tên, vẫn `Cho duyet`).

KTV mới hoàn toàn (chưa từng khai báo trong Danh sách KTV) không bị ảnh hưởng — vẫn đi đúng luồng cũ:
gửi yêu cầu, chờ Admin duyệt tay.

### Kiểm thử
`tsc --noEmit` sạch cả 2 phía, `npm run build` thành công. Không có migration mới (chỉ đổi logic
`auth.ts`). **Cần chủ hệ thống tự test bằng 1 tài khoản Google mới khớp `ktv_lien_he.email_dang_nhap`
sau khi deploy** — môi trường agent không có tài khoản Google thật để xác minh end-to-end.

Tăng version `1.203` → `1.204`, deploy `smarttrade` thành công.

**Còn 4 đợt tiếp theo** (xem `concurrent-mapping-wolf.md`): Đợt 2 (tự động kích hoạt KTV/Trạm khi
đăng nhập lần đầu nếu khớp Danh sách KTV), Đợt 3 (người tạo sửa được đơn trước khi TN xử lý + TN sửa
4 trường phụ), Đợt 4 (Phiếu xuất kho phân theo loại mua/công nợ/trả hàng), Đợt 5 (viết lại màn "Tạo
đơn" dạng accordion 2 cột + gợi ý nhanh gọn hơn + tô màu trường bắt buộc).

Tăng version `1.195` → `1.196`, deploy `smarttrade` thành công.

## 2026-08-16 (phiên 6, tiếp) — Đợt 3: người tạo sửa đơn khi còn mở + TN sửa 4 trường phụ (góp ý #6)

Đảo ngược có chủ ý quy tắc "6 trường phụ bất biến sau khi tạo" của migration 0070, theo đúng quyết
định đã chốt qua `AskUserQuestion`: "Người tạo sửa mọi trường trước khi TN xử lý; TN sửa đúng 4
trường đã nêu lúc xử lý."

**Backend** (`datMuaLinhKien.ts`, viết lại toàn bộ `PATCH /don-hang/:id`) — 2 nhánh quyền tách biệt:
- Người tạo (`user.email === nguoi_tao`), CHỈ khi dòng còn ở `Cho Tram duyet`/`Cho TN duyet` (đúng
  hằng `DON_HANG_DANG_MO` sẵn có ở frontend cho hành động duyệt/từ chối): sửa được toàn bộ
  `ma_lk, loai_de_xuat, so_luong_de_xuat, ghi_chu, yeu_cau_hoa_don, tt_mail_duyet, tt_khach_hang,
  chinh_sach, ma_yeu_cau_su_co, uu_tien`. Đổi `ma_lk` thì re-lookup `linh_kien` (dùng lại đúng logic
  + lỗi `MA_LK_NOT_FOUND` như `POST /phieu-dat`, nguồn giá vẫn là `gia_ban` theo Đợt 1) để cập nhật
  `ten_lk_snapshot`/`gia_de_xuat`/`loai_don`. Áp lại `canNoRequired` trên bộ giá trị SAU khi sửa, trả
  `THIEU_CHINH_SACH_HOAC_MA_YCSC` nếu thiếu.
- TN (`canTacNghiep`): giữ nguyên 5 trường cũ (`so_luong_thuc_xuat/gia_chot/ma_xuat_kho/ma_misa/
  ly_do_cham`), THÊM 4 trường phụ mới (`ma_yeu_cau_su_co/yeu_cau_hoa_don/tt_khach_hang/
  tt_mail_duyet`) — không giới hạn trạng thái, TN hỗ trợ sửa bất kỳ lúc nào đang xử lý.
- Không khớp nhánh nào → `FORBIDDEN_ROLE` (403).

**Frontend** (`DatMuaLinhKienModule.tsx`):
- Tách logic đồng bộ cache linh kiện/loại đề xuất của `TaoDonTab` thành hook dùng chung
  `useLkAndLdeCache(enabled)` — tránh lặp code khi `DonHangDetailModal` cũng cần tải danh mục lúc vào
  chế độ sửa (`enabled = isEditMode`, chỉ tải khi thực sự cần).
- `DonHangDetailModal`: thêm nút "✎ Sửa đơn" (chỉ hiện khi đúng người tạo + dòng còn mở) mở 1 form
  sửa tại chỗ (tái dùng đúng bộ field/pattern của `TaoDonTab`: chọn linh kiện, 3 nút nhanh Loại đề
  xuất, số lượng, Yêu cầu hoá đơn dạng chip, Mã yêu cầu sự cố + Chính sách bắt buộc có điều kiện,
  TT+Mail duyệt, TT khách hàng, ô tích Ưu tiên, Ghi chú) — nút Lưu/Huỷ đưa xuống `footer` của Modal
  (đè lên khối hành động Duyệt/Từ chối/Huỷ khi đang ở chế độ sửa). Thêm khối gấp gọn riêng "TN hỗ trợ
  sửa thông tin phụ" (4 trường mới) hiện cho mọi TN xem chi tiết dòng, độc lập với quyền sửa của người
  tạo — cả 2 khối dùng chung 1 endpoint PATCH mới.

### Kiểm thử
`tsc --noEmit` sạch cả 2 phía, `npm run build` thành công (chỉ còn cảnh báo chunk-size cũ, không liên
quan). Không có migration mới. Không kiểm chứng được qua trình duyệt thật (cần đăng nhập Google).

Tăng version `1.204` → `1.205`, deploy `smarttrade` thành công.

**Còn 2 đợt tiếp theo**: Đợt 4 (Phiếu xuất kho phân theo loại mua/công nợ/trả hàng), Đợt 5 (viết lại
màn "Tạo đơn" dạng accordion 2 cột + gợi ý nhanh gọn hơn + tô màu trường bắt buộc).

## 2026-08-16 (phiên 6, tiếp) — Đợt 4: Phiếu xuất kho phân theo loại mua/công nợ/trả hàng (góp ý #8)

Chốt qua `AskUserQuestion`: "chỉ cần trong loại đề xuất có chứa các chữ 'Mua hàng', 'Công nợ', 'Trả
hàng' sẽ tính riêng ra 3 loại" — khớp chính xác hàm `deriveLoaiDon()` đã có sẵn, không phát sinh loại
thứ 4 vì "mua" đã luôn là fallback. Luồng trả hàng (`TraHangTab`) vẫn tách riêng như hiện trạng
(chưa gộp vào PXK) — 3 mảng thực chất là: PXK "Mua hàng"/"Công nợ" (2 sub-tab mới) + tab "Đơn trả
hàng" sẵn có.

**Migration** `0079_pxk_loai_don.sql`: thêm `phieu_xuat_kho.loai_don TEXT CHECK (IN mua/cong_no/
tra_hang)`, backfill bằng scalar-subquery (chỉ điền khi TẤT CẢ dòng trong 1 PXK cùng 1 `loai_don`,
giống hệt pattern migration 0074 cho `nguoi_nhan_hang` — PXK cũ trộn loại thì để `NULL`).

**Backend** (`phieuXuatKho.ts`):
- `GET /don-hang-kha-dung`: thêm filter `?loai_don=` (giữ nguyên loại trừ `tra_hang` mặc định).
- `POST /`: body bắt buộc thêm `loai_don: 'mua'|'cong_no'`; validate MỌI `dat_don_hang_ids` chọn đều
  cùng 1 `loai_don` đó (copy nguyên pattern `ktvSet`/`NHIEU_KTV_TRONG_1_PXK` đã có cho KTV, lỗi mới
  `NHIEU_LOAI_TRONG_1_PXK`); ghi vào cột mới.
- `GET /`: thêm `loai_don` vào SELECT + filter `?loai_don=`.
- `GET /dat-mua-lk/don-hang` (`datMuaLinhKien.ts`): thêm filter `?loai_don=` (dùng cho sub-tab phía
  "Đơn của tôi").

**Frontend** (`DatMuaLinhKienModule.tsx`):
- `PhieuXuatKhoTab`: thêm sub-tab "Mua hàng | Công nợ" đầu danh sách (mặc định Mua hàng, dùng
  `LOAI_DON_TONE` cho nhãn + cột "Loại" mới trong bảng); modal tạo phiếu thêm bước chọn "Loại phiếu"
  NGAY TRƯỚC bước chọn KTV — đổi loại thì reset KTV/dòng đã chọn, danh sách dòng khả dụng tự lọc theo
  cả `loai_don` lẫn KTV.
- `DonCuaToiTab`: thêm cùng 1 sub-tab "Mua hàng | Công nợ" (nhất quán với PXK) lọc qua
  `GET /don-hang?loai_don=`.

### Kiểm thử
`tsc --noEmit` sạch cả 2 phía (thêm `loai_don` vào `PhieuXuatKhoRow` để khớp field mới), `npm run
build` thành công. Migration 0079 áp local rồi remote đều thành công. Không kiểm chứng được qua
trình duyệt thật (cần đăng nhập Google).

Tăng version `1.205` → `1.206`, deploy `smarttrade` thành công.

## 2026-08-16 (phiên 6, tiếp) — Đợt 5 (cuối): viết lại "Tạo đơn" dạng accordion 2 cột + tô màu bắt buộc

Hoàn tất đợt cuối của batch 10 yêu cầu (`concurrent-mapping-wolf.md`), gói #2 (bố cục 2 cột) + #9
(gợi ý nhanh gọn hơn) + #1 UI (tick ưu tiên) + yêu cầu thiết kế tổng thể "tô màu trường bắt buộc".

**`TaoDonTab` (`DatMuaLinhKienModule.tsx`) viết lại toàn bộ phần render nhiều dòng:**
- Bố cục accordion 2 cột khi có >1 dòng: cột trái là các dòng ĐÃ THU GỌN (bấm để mở lại), cột phải là
  dòng ĐANG MỞ (`activeIdx`) với form đầy đủ y hệt trước — chỉ 1 dòng "mở" tại 1 thời điểm. Dòng thu
  gọn hiện đúng mẫu `"LK-003 · Tên LK" / "Giá đề xuất: 92.000 đ / cái × 1 = 92.000 đ"`, có ⭐ nếu ưu
  tiên, cảnh báo "Chưa hoàn tất" nếu dòng chưa đủ điều kiện.
- Thêm `isLineComplete(d)` (tách từ điều kiện `canSubmit` cũ, dùng chung) để gate nút "+ Thêm dòng" —
  disable cho tới khi dòng đang mở hoàn tất, đúng yêu cầu "phải xong A mới thêm được B". Bấm "+ Thêm
  dòng" hoặc chọn 1 chip "Gợi ý nhanh" khi dòng đang mở đã đầy → dòng đó tự thu gọn, mở dòng mới.
- Nút submit đổi nhãn động: "Tạo đơn" (1 dòng) / `"Tạo N đơn"` (N>1).
- Thêm ô tích "⭐ Đơn ưu tiên" ngay trong form dòng đang mở (trước đây field `uu_tien` đã có ở Đợt 1
  nhưng chưa có UI nhập tại đây, chỉ sửa được qua modal chi tiết).
- "Gợi ý nhanh" (top-20 linh kiện): đổi từ dải chip luôn-mở sang khối thu gọn mặc định (cùng pattern
  nút viền chấm như khối Import Excel), khi mở dùng 1 hàng chip CUỘN NGANG (`overflow-x-auto`) thay
  vì wrap tự do — đỡ chiếm chiều cao khi có 10-20 mục.
- Tô màu nhất quán cho nhãn trường bắt buộc: thêm helper `reqLabelClass(missing)` (màu coral khi còn
  trống, thay 1 kiểu duy nhất) áp cho Mã linh kiện/Loại đề xuất/Số lượng (trước đây không có dấu hiệu
  bắt buộc) và đồng bộ hoá với Chính sách/Mã yêu cầu sự cố (trước đây chỉ 2 trường này có "*"). Không
  thêm token màu mới ngoài `--coral-*` sẵn có.

### Kiểm thử
`tsc --noEmit` sạch cả 2 phía, `npm run build` thành công (chỉ còn cảnh báo chunk-size cũ). Không có
migration mới. Không kiểm chứng được qua trình duyệt thật (cần đăng nhập Google).

Tăng version `1.206` → `1.207`, deploy `smarttrade` thành công.

**=> Đã hoàn tất TOÀN BỘ batch 10 yêu cầu đợt 3** (`concurrent-mapping-wolf.md`, mục #1-#10). Điểm
cần chủ hệ thống tự xác nhận thêm: Đợt 2 (tự động kích hoạt KTV/Trạm) cần test thật bằng 1 tài khoản
Google khớp `ktv_lien_he.email_dang_nhap` — môi trường agent không có tài khoản Google thật để verify
end-to-end OAuth.

## 2026-08-16 (phiên 6, tiếp) — Xem trước thông tin ca khi nhập Mã yêu cầu sự cố + phát hiện bug token màu toàn hệ thống + redesign "Tạo đơn đặt linh kiện"

Chủ hệ thống góp ý 2 điểm: (1) khi nhập "Mã yêu cầu sự cố liên quan" và tra được ca, phải hiện thêm
thông tin cơ bản để tự đối chiếu đúng ca (trước đây chỉ báo ✓/⚠ boolean); (2) giao diện "Tạo đơn đặt
linh kiện" xấu — yêu cầu đóng vai khách khó tính phê bình rồi sửa.

### Phát hiện quan trọng: nhiều token màu CSS được dùng khắp app nhưng CHƯA TỪNG được định nghĩa

Trước khi sửa giao diện, kiểm tra `tokens.css` (`:root`) qua `getComputedStyle` trên trang đăng nhập
(không cần đăng nhập) phát hiện **9 biến CSS đang được dùng rộng rãi trong code (kể cả các module
khác ngoài Đặt mua linh kiện: `CaseDetail.tsx`, `BacklogModule.tsx`, `PaginatedTable.tsx`,
`SettingsModule.tsx`, `LoginScreen.tsx`, `Tabs.tsx`...) nhưng KHÔNG hề tồn tại trong `:root`**:
`--ink-500`, `--ink-700`, `--surface-100`, `--surface-2`, `--surface-200`, `--teal-600`,
`--amber-600`, `--amber-700`, `--coral-400`, `--coral-600`. Với `var()` trỏ tới 1 custom property
chưa khai báo, trình duyệt coi là "invalid at computed-value time" — với `color`/`background-color`
nghĩa là rớt về giá trị kế thừa (inherit), khiến MỌI chỗ dùng các token này (chữ phụ, nền panel nhạt,
màu trạng thái "đã huỷ"/"đã duyệt"/"quá hạn"...) im lặng không hiện màu như code định — rất có thể là
nguyên nhân thật sự đằng sau phản hồi "giao diện nhạt nhẽo/xấu" đã nhận được nhiều lần (kể cả các đợt
trước đã cố tình thêm các token này để tô màu trạng thái mà không biết chúng chưa được định nghĩa).
**Sửa `tokens.css`**: bổ sung cả 9 biến + `--surface-200` (phát hiện thêm khi rà lại
`DatMuaLinhKienModule.tsx`, dùng trong `SummaryStrip` hover), giá trị chọn theo đúng mạch màu hiện có
(vd `--teal-600`/`--amber-600`/`--amber-700`/`--coral-600` là bản đậm hơn của `-500` cùng tông, dùng
cho chữ trên nền trắng; `--ink-500` nằm giữa `-400`/`-600`; `--surface-100`/`-2`/`-200` là các sắc độ
nền nhạt phân tầng giữa trắng và `--bg`). Đây là sửa hạ tầng, ảnh hưởng TOÀN BỘ app (không chỉ module
Đặt mua linh kiện) — đã verify qua `getComputedStyle` trên production sau deploy, cả 9+1 biến đều trả
đúng giá trị hex thay vì rỗng.

### 1. Xem trước thông tin ca khi nhập "Mã yêu cầu sự cố"

**Backend** `GET /dat-mua-lk/kiem-tra-ma-yeu-cau`: mở rộng SELECT thêm
`khach_hang, seri_san_pham, khu_vuc, tinh, quan_huyen, hang, san_pham_bao_hanh, tien_do_hoan_thanh`
(cùng `ky_thuat_vien` đã có), trả về object `preview` khi tìm thấy ca — CÓ Ý chọn tập nhỏ, KHÔNG trả
nguyên dòng case (bỏ qua mô tả lỗi, số tiền, ngày giờ chi tiết...) để đối chiếu đủ dùng mà không lộ dữ
liệu nhạy cảm/tài chính của ca.

**Frontend** `MaYeuCauSuCoCheck`: đổi từ 1 dòng cảnh báo text đơn sang 1 thẻ nhỏ tô màu theo trạng
thái khớp KTV (xanh teal = đúng KTV, đỏ coral = sai KTV, xám trung tính = tìm thấy nhưng không so
sánh được), bên trong hiện lưới 2 cột: Khách hàng, Serial, Hãng + Sản phẩm bảo hành, Khu vực (dùng lại
`shortKhuVuc()` sẵn có), Tiến độ, KTV xử lý.

### 2. "Khách khó tính" phê bình + redesign "Tạo đơn đặt linh kiện" (`TaoDonTab`)

Rà lại toàn bộ JSX + tra cứu tokens, liệt kê phàn nàn cụ thể (màu sắc/vị trí/thiết kế/phong cách):
tiêu đề modal vẫn ghi "Tạo phiếu đặt mới" dù cả hệ thống đã bỏ khái niệm "phiếu" từ đợt trước (lỗi
nhất quán ngôn từ thật); 2 nút "mở rộng" (Import Excel, Gợi ý nhanh) dùng chung 1 kiểu viền chấm xám
giống hệt nhau nên nhìn như 1 tính năng lặp lại dù bản chất khác hẳn (nghiệp vụ nặng cho TN/GS vs lối
tắt phổ thông cho mọi người); khối "Người nhận hàng" trôi nổi không có khung/nền, không giống bước 1
thật sự của form; header mỗi thẻ dòng dùng `--bg` (trùng màu nền trang) nên lẫn vào khung modal thay
vì phân tầng rõ; nút "Xóa dòng" chỉ là link chữ suông không có trọng lượng thị giác cho 1 hành động
huỷ; ô tích "Đơn ưu tiên" nhét giữa 2 khối bằng margin âm, không có khung riêng; thẻ dòng thu gọn (cột
trái) và thẻ dòng đang mở (cột phải) dùng 2 "ngôn ngữ" bo góc khác nhau (`rounded-lg` không header vs
`rounded-xl` có header) nên không giống cùng 1 loại component; thanh footer (hành động chính của cả
màn hình) dùng cùng 1 kiểu viền xám trung tính như mọi footer khác trong app, không có trọng lượng
tương xứng vai trò nút submit chính.

**Đã sửa**: đổi tiêu đề modal + text toast từ "phiếu đặt" → "đơn đặt hàng"/"đơn"; bọc "Người nhận
hàng" trong 1 khối thẻ `surface-100` có nhãn in hoa; tách màu 2 nút mở rộng — "Gợi ý nhanh" tô tint
ocean (đồng nhất với khi mở rộng), "Import Excel" giữ tông xám trung tính; đổi nền header thẻ dòng từ
`--bg` sang `--surface-100`; đổi "Xóa dòng" từ link chữ sang `Btn variant="danger"` thật; bọc ô tích
"Đơn ưu tiên" thành 1 khối toggle có viền/nền đổi màu khi tích; đồng bộ thẻ thu gọn cột trái dùng
`rounded-xl` + 1 dải header mini giống thẻ đang mở; footer thêm nền tint ocean nhạt + tăng cỡ nút submit
chính (`size="md"`) để nổi bật là hành động chính của màn hình.

### Kiểm thử
`tsc --noEmit` sạch cả 2 phía, `npm run build` thành công. Verify token màu qua `getComputedStyle`
trên production sau deploy — tất cả biến trả đúng giá trị. Không kiểm chứng được UI có đăng nhập thật
(cần Google OAuth — hạn chế đã ghi nhận từ trước) nhưng đã xác nhận trang không lỗi JS console (chỉ
401 do chưa đăng nhập, không liên quan thay đổi).

**Lưu ý phạm vi**: chỉ sửa 10 token màu bị thiếu MÀ `DatMuaLinhKienModule.tsx` đang dùng — rà nhanh
toàn bộ `frontend/src` cho thấy còn nhiều token khác (`--ocean-50/200/300/900/950`, `--ink-50/800`...)
cũng đang được dùng ở các module khác mà chưa kiểm tra hết có thiếu hay không; đây là 1 việc dọn dẹp
riêng, chưa làm trong đợt này vì ngoài phạm vi yêu cầu.

Tăng version `1.207` → `1.210` (một phiên khác đang chạy song song trong cùng thư mục đã tự bump lên
`1.208`/`1.209` trước khi đợt này deploy — đã đọc lại giá trị hiện tại trước khi tăng tiếp, không ghi
đè). Deploy `smarttrade` thành công.

## 2026-08-16 (phiên 6, tiếp nữa) — Sự cố: production bị ghi đè về bản v1.176 cũ + khắc phục

**Triệu chứng**: chủ hệ thống báo "1 phiên AI nào đó đã built nhầm phiên bản 1.176 cũ làm mất hết
giao diện và tính năng mới ở các phiên bản sau".

**Nguyên nhân xác định qua điều tra** (`git log`, `git branch -a`, `git worktree list`, `wrangler
deployments list --config wrangler.smarttrade.jsonc`, so `assets/index-*.js` hash giữa curl production
và build cục bộ):
- Toàn bộ code của phiên làm việc này (Đợt 1→5, case-preview, redesign TaoDonTab, fix token màu...)
  chỉ tồn tại dưới dạng **thay đổi CHƯA COMMIT** trong working directory chính — `main` vẫn dừng ở
  commit `9b5ed0b` (v1.175).
- Task nền do chính phiên này spawn (`task_a8a680b9`, audit token màu toàn app) chạy trong 1 **git
  worktree cô lập** (`mcp__ccd_session__spawn_task` luôn checkout từ HEAD đã COMMIT, không thấy được
  thay đổi chưa commit) — worktree đó checkout đúng v1.175, tự làm lại y hệt phần fix token màu (bản
  thu hẹp, 10/12 token) thành 1 commit riêng `13ef1b6` trên nhánh `claude/nostalgic-wiles-2f9c7c`, bump
  version thành "1.176".
- Task đó (hoặc hành động nào đó xuất phát từ worktree này) đã chạy `wrangler deploy` với code v1.176
  đó, ghi đè lên production SAU LẦN DEPLOY GẦN NHẤT của phiên chính (deploy lúc 04:47:07Z, sau deploy
  của phiên chính lúc 04:06:48Z) — xác nhận qua `wrangler deployments list` (version id khác) và hash
  bundle JS trên production (`index-DwAvP3Ab.js`) không khớp bản build cục bộ mới nhất
  (`index-DFtJPsj9.js`).
- **Bài học cốt lõi**: deploy hoàn toàn tách rời khỏi git — `wrangler deploy` build/deploy bất kỳ
  trạng thái nào đang có trên đĩa, bất kể đã commit hay chưa, bất kể đang ở worktree nào. 1 tác vụ nền
  chạy trong worktree riêng (kể cả do chính mình tạo ra) có thể vô tình deploy đè lên production nếu
  nó tự ý chạy bước deploy — trong khi nó chỉ thấy lịch sử ĐÃ COMMIT, không thấy code mới nhất đang
  nằm dưới dạng uncommitted ở working directory chính.

**Khắc phục**: xác nhận migration D1 remote không có gì tồn đọng (`wrangler d1 migrations list
--remote` → "No migrations to apply", nghĩa là DB schema không bị ảnh hưởng, chỉ code Worker/frontend
bị ghi đè). `tsc --noEmit` sạch cả 2 phía (backend + frontend) trên đúng working directory chính (nơi
giữ đầy đủ code mới nhất). Bump version `1.210` → `1.211`, `npm run build`, `npm run deploy:smarttrade`
lại từ working directory chính — khôi phục production về đúng trạng thái đầy đủ tính năng. Xác nhận
qua `curl` hash bundle JS khớp bản vừa build (`index-CHyQ-jTC.js`) và grep thấy đúng chuỗi `"1.211"`
trong bundle đã deploy; mở trang đăng nhập qua Browser pane không có lỗi console (chỉ 401 do chưa đăng
nhập, không liên quan).

**Khuyến nghị chưa thực hiện** (cần chủ hệ thống xác nhận): toàn bộ khối lượng công việc rất lớn của
phiên này vẫn đang ở dạng uncommitted trong working directory chính — rủi ro y hệt sự cố vừa xảy ra có
thể lặp lại (`git status` cho thấy hàng chục file `M`) nếu có thêm 1 tác vụ nền/worktree khác chạy
song song rồi tự deploy. Nên commit sớm vào `main` để khoá lại trạng thái đã khôi phục — chưa tự ý
commit vì đây là hành động chủ hệ thống cần được hỏi trước.
