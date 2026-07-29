# Yêu cầu: endpoint import tự động cho pipeline QuickSight (Python, chạy nền)

## Bối cảnh

Có 1 pipeline Python riêng (`F:\claude\auto qs`) tự động: đăng nhập QuickSight
(Playwright) → tải CSV 4 dashboard → chuẩn hóa đúng 45 cột (đúng format Excel
import hiện có, dùng chung `COLUMN_MAP` trong `backend/src/lib/ratchet.ts`) →
cần đẩy thẳng vào `case_dvbh` qua API, chạy tự động nhiều lần/ngày (không có
người ngồi trước máy để đăng nhập Google OAuth).

`POST /api/import/commit` hiện tại đã làm đúng nghiệp vụ cần (ratchet,
crm_hash, GHI_MOI/BO_QUA/GHI_DE, cache invalidation...) — **không cần viết lại
logic import**, chỉ cần 1 đường vào KHÔNG qua session cookie/OAuth.

## Yêu cầu cụ thể

Thêm 1 route mới, ví dụ `POST /api/import/external-commit`, trong
`backend/src/routes/importRoute.ts` (hoặc file riêng), với:

1. **Xác thực bằng API key tĩnh**, KHÔNG dùng `verifySessionMiddleware`/OAuth:
   - Header: `Authorization: Bearer <API_KEY>` (hoặc header riêng, tùy quy ước
     hiện có của dự án).
   - `API_KEY` lưu qua `wrangler secret put EXTERNAL_IMPORT_API_KEY` (secret
     riêng, KHÔNG trùng với secret khác), so sánh string đơn giản.
   - Sai/thiếu key → 401.

2. **Body giống hệt `/api/import/commit`**: `{ filename: string, rows: unknown[] }`,
   mỗi phần tử `rows[i]` là object đã map sang tên cột DB (snake_case, đúng
   `COLUMN_MAP` value) — pipeline Python sẽ tự map trước khi gửi, không cần
   sửa gì ở `COLUMN_MAP`/`BUSINESS_FIELDS`.

3. **Logic xử lý: gọi thẳng `processImport(c.env.DB, body.rows, true)`** —
   y hệt route `/commit` hiện tại, dùng chung code, không viết lại.

4. **Ghi `import_history`** giống route `/commit`, nhưng `nguoi_import` nên
   dùng user hệ thống có sẵn (`he-thong-tu-dong@dvbh.internal`, xem migration
   `0033_system_user_for_cron.sql`) thay vì `c.get("user").email` (vì không
   có session để lấy user thật).

5. **Vẫn gọi `scheduleCaLapRefreshIfChanged()`** sau khi commit, y hệt route
   `/commit`, để cache/snapshot R2 cập nhật đúng như luồng import thủ công.

6. Có thể giới hạn thêm (tùy chọn, không bắt buộc):
   - Rate limit / chỉ chấp nhận từ 1 vài IP cố định nếu muốn chặt hơn.
   - Log riêng các lần gọi external-commit để phân biệt với import thủ công
     trong `GET /api/import/history` (có thể thêm cột `loai` = `'quicksight_auto'`
     tương tự cách `import_history.loai` đã phân biệt `crm`/`giai_trinh_cu`...,
     xem migration `0028_import_history_loai.sql`).

## Điểm đã xác nhận, không cần hỏi lại

- Đơn vị `so_phut_xu_ly`: dù tên cột là "phút", thực tế đang lưu **giờ** (xác
  nhận với chủ hệ thống 2026-07-29, import thủ công hiện tại cũng đang gửi
  giờ, không có chuyển đổi nào trong code) — pipeline Python sẽ gửi giá trị
  giờ y như import thủ công, không cần backend chuyển đổi gì thêm.
- `link_hinh_anh`: pipeline Python đã sửa để nối các URL bằng dấu `,` (khớp
  đúng `parseLinkHinhAnh()` hiện có trong `ratchet.ts`), không cần sửa hàm đó.
- `TBP` → `khu_vuc`: đã đúng theo `COLUMN_MAP` hiện tại, không đổi.

## Sau khi có endpoint

Báo lại cho pipeline Python (`F:\claude\auto qs`) biết:
1. URL đầy đủ của endpoint mới (vd `https://dichvu3t.workers.dev/api/import/external-commit`).
2. Giá trị `API_KEY` (qua kênh an toàn, không paste vào chat công khai).

Pipeline sẽ tự cấu hình 2 biến môi trường (`CF_IMPORT_API_URL`,
`CF_IMPORT_API_KEY`) để gọi endpoint này ở cuối mỗi lần chạy.
