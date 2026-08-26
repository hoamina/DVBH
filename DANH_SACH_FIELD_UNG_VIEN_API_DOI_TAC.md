# Danh sách field ứng viên cho API tra cứu case (hệ "Đặt mua linh kiện" tách riêng gọi vào)

Bối cảnh: hệ "Đặt mua linh kiện" (đã tách thành Cloudflare Worker riêng, 2026-08-19) gọi
`GET /api/partner/case-lookup?id=...` (xem [partnerApi.ts:225](backend/src/routes/partnerApi.ts:225))
để KTV nhập mã ID case bảo hành và xác nhận thông tin trước khi tạo đề xuất mua linh kiện.
Server đối tác tự kiểm tra ID đó có thuộc KTV gọi hay không sau khi nhận phản hồi — hệ này không
lọc theo `doi_tac` ở phía DVBH (đã xác nhận 2026-08-26).

Liệt kê toàn bộ cột của `case_dvbh` ([migrations/0001_init.sql](migrations/0001_init.sql)) để chọn field
cần gửi. Đánh dấu theo cột `Chọn gửi?` — điền `x` vào field muốn thêm, để trống nghĩa là không gửi.

| Cột | Ý nghĩa | Chọn gửi? |
|---|---|---|
| `ky_thuat_vien` | KTV phụ trách case | (đã có) |
| `khach_hang` | Tên khách hàng | (đã có) |
| `seri_san_pham` | Số seri sản phẩm | (đã có) |
| `khu_vuc` | Khu vực | (đã có) |
| `tinh` | Tỉnh/thành | (đã có) |
| `quan_huyen` | Quận/huyện | (đã có) |
| `hang` | Hãng sản phẩm | (đã có) |
| `san_pham_bao_hanh` | Tên/loại sản phẩm bảo hành | (đã có) |
| `tien_do_hoan_thanh` | Trạng thái tiến độ case | (đã có) |
| `mo_ta_loi` | Mô tả lỗi khách báo | |
| `nhom_san_pham` | Nhóm sản phẩm | |
| `nhom_yeu_cau` | Nhóm yêu cầu | |
| `loai_yeu_cau` | Loại yêu cầu | |
| `hinh_thuc_bao_hanh` | Hình thức bảo hành | |
| `ngay_mua` | Ngày mua sản phẩm | |
| `thoi_gian_cskh_tiep_nhan` | Thời gian CSKH tiếp nhận | |
| `thoi_gian_hen_xu_ly` | Thời gian hẹn xử lý | |
| `thoi_gian_hoan_thanh` | Thời gian hoàn thành (nếu đã đóng) | |
| `doi_tac` | Đối tác ghi nhận case | |
| `link_crm` | Link case gốc trên CRM | |
| `noi_dung_xu_ly` | Nội dung KTV đã xử lý | |
| `luu_y_loi_linh_kien` | Lưu ý lỗi linh kiện (liên quan trực tiếp mua linh kiện) | |
| `cach_thuc_xu_ly` | Cách thức xử lý | |
| `nganh` / `loai_nganh` | Ngành hàng | |
| `nhom_kh` | Nhóm khách hàng | |
| `dt_san_pham`, `dt_linh_kien`, `dt_dich_vu` | Dữ liệu tài chính/định giá nội bộ |
| `ly_do_qua_han` | Giải trình nội bộ |