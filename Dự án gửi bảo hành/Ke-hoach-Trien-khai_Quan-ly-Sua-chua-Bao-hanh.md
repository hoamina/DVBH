# Kế hoạch triển khai — Module "Quản lý sửa chữa bảo hành"

**Trạng thái:** Đang lập kế hoạch — **chưa đụng vào code gốc**. Tài liệu này chốt lại thiết kế sau
khi đối chiếu 2 file phân tích (`He-thong-quy-trinh-bao-hanh_Phan-tich-va-De-xuat.md`,
`Danh-gia-va-Hoan-thien-Quy-trinh-Bao-hanh.md`) với kiến trúc thực tế của hệ thống DVBH đang chạy,
và các quyết định đã chốt với chủ hệ thống ngày 2026-08-16.

## 0. Quyết định đã chốt

| Câu hỏi | Quyết định |
|---|---|
| Lưu ảnh (thùng hàng, sau sửa chữa) | **Google Drive** (không dùng R2 — hạn chế kinh tế). Lưu dưới dạng link Drive trong DB, không upload binary qua Worker. |
| Vai trò "Admin bảo hành" / "NV sửa chữa (SCVP)" | Thêm **2 cờ vai trò mới** `la_admin_bh`, `la_nv_sua_chua` trên bảng `users`, cấp qua màn Settings/Users — theo đúng pattern `la_kho`/`la_ke_toan` hiện có, không tạo `vai_tro` mới. |
| Vị trí module | **Độc lập hoàn toàn** — module mới "Quản lý sửa chữa bảo hành" trong sidebar, không phải tab con của `dat-mua-lk`. |
| `debt_adjustments` (trừ công nợ KTV) | **Chưa làm ở giai đoạn này.** Bảng `approvals` (phê duyệt case ngoại lệ) vẫn giữ vì độc lập với công nợ, nhưng bỏ hẳn nhánh "trừ công nợ" ra khỏi MVP — sẽ bổ sung sau nếu cần. |
| Nguồn linh kiện cho đề xuất sửa chữa | Dùng chung bảng `linh_kien` với "Đặt mua linh kiện" (không tách danh mục riêng), nhưng thêm cờ `chi_danh_cho_bao_hanh` để ẩn các mã chỉ phục vụ bảo hành khỏi picker bên mua hàng — xem mục 1.1. |
| Deploy | **Demo/mockup trước** (1 trang HTML tĩnh, dữ liệu giả) để duyệt UI/UX từng màn, **sau đó mới** build thật vào `backend/`, `frontend/` và migration D1. |

## 1. Tái sử dụng hạ tầng có sẵn (không xây lại)

| Cần | Đã có sẵn | Dùng lại như thế nào |
|---|---|---|
| Người gửi (KTV/CTV/Trạm) | `users` + `la_ktv_dvbh`, `la_ve_tinh`, `tram_cha` | Không tạo bảng `partners` riêng |
| Tra Serial/Model | `case_dvbh.seri_san_pham` (đã index) | Ticket có thể **liên kết tới 1 case** có sẵn (autocomplete theo serial/case), hoặc nhập tay nếu là linh kiện/lõi lọc không có case |
| Danh mục linh kiện | `linh_kien` (đã có, IndexedDB cache ở frontend — **CHỈNH LẠI 2026-08-16**: bảng `lk_danh_muc` ở bản nháp đầu đã bị gộp vào `linh_kien` và xoá từ [migration 0060](../migrations/0060_unify_linh_kien.sql), toàn hệ thống giờ chỉ còn 1 bảng danh mục linh kiện duy nhất) | Đề xuất linh kiện sửa chữa dùng thẳng `linh_kien`, không tạo danh mục riêng — nhưng cần thêm 1 cột lọc, xem mục 1.1 |
| State machine + lịch sử | Pattern `dat_don_hang_log` / `tra_hang_log` | Copy nguyên pattern: 1 cột `trang_thai` + 1 bảng `*_log` insert-only |
| Cache báo cáo | `data_versions` + `cachedReport()` | Thêm 1 domain mới `sua_chua_bh` |
| Badge sidebar | `notifications/count` | Thêm 1 `countKey` mới |

## 1.1. Linh kiện "chỉ dùng bảo hành" — cờ mới trên bảng `linh_kien` dùng chung

Chốt 2026-08-16: linh kiện cho module sửa chữa bảo hành lấy từ đúng danh mục `linh_kien` dùng chung
với "Đặt mua linh kiện" — không tách danh mục riêng. Nhưng **một số mã chỉ phục vụ sửa chữa bảo hành**
(không bán/không mua ngoài), nên bên mua hàng không được thấy các mã này khi lên đơn.

- Thêm 1 cột boolean mới: `linh_kien.chi_danh_cho_bao_hanh` (mặc định `0`).
- **Không tách API riêng** — endpoint `GET /api/settings/linh-kien` (đã có, `settings.ts:410`) vẫn trả
  về toàn bộ danh mục kèm cột mới này, giữ đúng cơ chế cache/hash hiện tại
  (`GET /api/settings/linh-kien/version`).
- **Lọc ở tầng client**, đúng pattern đã dùng cho `lib/loaiDeXuatCache.ts` (lọc theo `vai_tro_json`
  không cần gọi API riêng): picker chọn linh kiện trong `DatMuaLinhKienModule.tsx` ẩn các dòng
  `chi_danh_cho_bao_hanh = 1`; picker trong module Sửa chữa bảo hành hiển thị toàn bộ, không lọc gì.
- Thêm 1 checkbox **"Chỉ dùng cho bảo hành (ẩn khỏi Đặt mua linh kiện)"** vào form CRUD linh kiện đã
  có sẵn ở Settings module (`lkSettings.ts` / phần "Add lk_danh_muc management UI to Settings module").

## 2. Vai trò & phân quyền

| Vai trò | Cờ | Thấy gì trong module |
|---|---|---|
| KTV/CTV/Trạm | `la_ktv_dvbh` / `la_ve_tinh` (đã có) | Tạo phiếu gửi, tra cứu tiến độ đơn của mình, xác nhận nhận hàng trả |
| Kho | `la_kho` (đã có) | Điểm tiếp nhận chung, đóng gói lô trả |
| **Admin bảo hành** | `la_admin_bh` (**mới**) | Phân loại phiếu sau khi kho nhận, duyệt đề xuất linh kiện, duyệt case ngoại lệ, duyệt đổi mới sau chẩn đoán |
| **NV sửa chữa (SCVP)** | `la_nv_sua_chua` (**mới**) | Nhận việc, chẩn đoán, đề xuất linh kiện, cập nhật kết quả sửa |
| Kế toán | `la_ke_toan` (đã có) | Duyệt đối soát trước khi gửi trả, xem mã MISA |
| Admin (hệ thống) | `vai_tro = Admin` | Toàn quyền + cấu hình danh mục |

Migration cần thêm: 2 cột boolean `la_admin_bh`, `la_nv_sua_chua` trên `users` (giống style migration
0053 `dat_mua_lk_users`). `effectiveModules()` (`backend/src/lib/moduleAccess.ts`) tự cấp module mới
khi 1 trong 2 cờ này = true, theo đúng cách `dat-mua-lk`/`tra-hang` đang tự cấp qua
`la_ktv_dvbh`/`la_ve_tinh`/`la_kho`/`la_ke_toan`.

## 3. Mô hình dữ liệu D1 (đặt tên theo văn phong hiện có: không dấu, snake_case)

**CHỐT LẠI 2026-08-16 sau khi đối chiếu quy trình thực tế:** đây là thiết kế **header + nhiều dòng**,
đúng y hệt pattern `phieu_dat` + `dat_don_hang` (module Đặt mua linh kiện) — không phải "1 phiếu = 1
sản phẩm lỗi" như bản nháp đầu. Người tạo lập **1 phiếu gửi hàng** (thông tin vận chuyển), rồi **thêm
nhiều dòng linh kiện/sản phẩm lỗi** vào phiếu đó; phiếu ở trạng thái **Nháp** cho tới khi xác nhận đã
thực sự gửi xe/giao vận đi — hành động "xác nhận gửi" là 1 bước riêng, tách khỏi lúc tạo phiếu.

```
lookup_codes                  -- ma tra cuu dung chung (QR hoac ghi tay), sinh ngay tu luc con Nhap
  id, code (unique, ngan vd "BH-A3F9"), entity_type ('phieu_gui'|'phieu_tra'),
  entity_id, created_at, created_by

phieu_gui_bh                  -- HEADER 1 lan gui hang - thay the "lo_gui_bh" o ban nhap dau
  id, lookup_code_id (FK), nguoi_tao (email), ngay_tao,
  ngay_gui_xe, hinh_thuc_gui ('xe_noi_bo'|'giao_van'),
  ma_xe_hoac_tai_xe, don_vi_van_chuyen, ma_van_don,          -- tat ca sua duoc den khi kho tiep nhan
  ghi_chu, trang_thai ('nhap'|'da_gui'), created_at, updated_at

tiep_nhan_kho_bh              -- diem tiep nhan cua kho, gan theo phieu_gui_bh (ca thung hang)
  id, lookup_code_id (FK), so_luong_khai, so_luong_thuc_nhan, trang_thai_doi_chieu,
  nguoi_nhan, thoi_gian_nhan, ghi_chu

phieu_sua_chua_bh             -- 1 DONG = 1 linh kien/san pham loi trong phieu_gui_bh
  id, phieu_gui_id (FK phieu_gui_bh), case_id (FK case_dvbh — chon truoc, tu do lay het thong tin
  phu: khach hang, model, serial, khu vuc, KTV phu trach — KHONG nhap tay lai),
  ma_lk (FK linh_kien.ma_linh_kien, NULL neu chon "ca san pham" thay vi 1 linh kien cu the),
  mo_ta_loi, anh_url (link Google Drive, tuy chon), ghi_chu (tuy chon),
  tiep_nhan_kho_id (FK, gan sau khi kho xac nhan nhan ca phieu),
  trang_thai (state machine rieng tung dong — chi bat dau chay tu khi phieu_gui_bh.trang_thai='da_gui'),
  trang_thai_cho ('khong_cho'|'cho_linh_kien'|'cho_phe_duyet'),
  nguoi_sua_chua (email NV, gan sau khi Admin BH phan loai), phuong_an_xu_ly,
  created_at, updated_at

phieu_sua_chua_bh_log         -- event log, insert-only (dung y het dat_don_hang_log)
  id, phieu_id (FK phieu_sua_chua_bh), tu_trang_thai, den_trang_thai, thoi_gian, nguoi_thuc_hien, ghi_chu

de_xuat_linh_kien_bh          -- NV sua chua de xuat linh kien thay the
  id, phieu_id (FK), ma_lk (FK linh_kien.ma_linh_kien), so_luong, ngay_de_xuat, trang_thai_duyet,
  ma_don_misa (nhap tay, 1 gia tri/dong, chuan hoa)

phe_duyet_ngoai_le_bh         -- case ngoai chinh sach chuan (doi moi sau chan doan, sua dich vu tinh phi...)
  id, phieu_id (FK), loai_de_xuat, nguoi_de_xuat, nguoi_duyet, trang_thai ('cho_duyet'|'da_duyet'|'tu_choi'),
  ngay_de_xuat, ngay_duyet, ghi_chu

lo_tra_bh                     -- goi hang tra ve KTV
  id, phieu_id (FK), lookup_code_id (FK), ma_van_don, ngay_dong_goi, ngay_ke_toan_duyet,
  ngay_gui, ngay_ktv_nhan
```

**Không có bảng `products`/`serials`/`partners` riêng** — dùng thẳng `case_dvbh`/`users` như mục 1.
**Không có `debt_adjustments`** ở giai đoạn này theo quyết định mục 0.

## 4. State machine (rút gọn từ luồng to-be đã review, bỏ nhánh công nợ)

```
[phieu_gui_bh] Tao phieu (Nhap) → Them 1..N dong LK (moi dong chon ID su co co san → tu dong lay
  het thong tin phu, chi chon them LK/san pham loi + mo ta + anh/ghi chu neu can) → Sua duoc header
  (ngay gui xe, ma xe/van don...) tuy y trong luc con Nhap
  → Xac nhan da gui xe/giao van (hanh dong RIENG, chi bam khi thuc te da di gui) → trang_thai='da_gui'
  → tu day cac dong LK trong phieu moi bat dau chay state machine rieng tung dong:

[phieu_sua_chua_bh, tung dong] Cho kho nhan → Da nhan (kho) → Cho Admin BH phan loai
   → [Sua chua] → Cho chan doan → (Khong loi | Sua duoc | De xuat doi moi | Tra xac)
        - Khong loi           → Dong goi tra
        - Sua duoc            → Cho duyet de xuat LK → Da duyet → Dang sua → Dong goi tra
        - De xuat doi moi     → Cho Admin BH duyet đổi mới → (Duyet: chuyen nhanh Doi moi | Tu choi: Tra xac)
        - Tra xac             → Dong goi tra hoac Huy tai cho
   → [Doi moi]  → Xuat kho LK moi → Dong goi tra
   → [Tu choi]  → Huy / tra nguyen trang
   → [Chuyen kho] → Nhap kho lai (ket thuc)
   → [Ngoai le - can phe duyet] → phe_duyet_ngoai_le_bh → Duyet: quay lai 1 trong 4 nhanh tren | Tu choi: Huy
Dong goi tra → Ke toan duyet → Gui tra KTV → KTV xac nhan nhan → Dong phieu
                                            → Khong nhan duoc → Khieu nai van chuyen
```

Mỗi lần đổi `trang_thai` ghi 1 dòng vào `phieu_sua_chua_bh_log`. Ngưỡng escalate (từ chối đề xuất
linh kiện quá N lần → đẩy quản lý) và định nghĩa "thất lạc vận chuyển" — **để trống ở bản demo**, sẽ
chốt số cụ thể với đội vận hành trước khi build thật (đúng câu hỏi đã nêu ở bản review gốc).

## 5. Route backend dự kiến (`backend/src/routes/suaChuaBaoHanh.ts`, chưa tạo)

```
POST   /api/sua-chua-bh/phieu-gui                    KTV tao phieu gui (header, trang_thai=nhap), sinh lookup_code
PATCH  /api/sua-chua-bh/phieu-gui/:id                 Sua thong tin van chuyen (chi khi con Nhap)
POST   /api/sua-chua-bh/phieu-gui/:id/dong-lk         Them 1 dong LK vao phieu (chon case_id → auto-fill)
DELETE /api/sua-chua-bh/dong-lk/:id                   Xoa 1 dong LK (chi khi phieu con Nhap)
POST   /api/sua-chua-bh/phieu-gui/:id/xac-nhan-gui    Chuyen Nhap → Da gui (khoa header, cac dong LK bat dau chay state machine)
GET    /api/sua-chua-bh/phieu-gui/:code               Tra cuu theo ma (dung cho ca KTV lan kho quet/go tay)
GET    /api/sua-chua-bh/phieu                         Danh sach dong LK (scope theo vai tro)
GET    /api/sua-chua-bh/phieu/:id                     Chi tiet 1 dong LK + lich su
POST   /api/sua-chua-bh/tiep-nhan-kho/:code           Kho xac nhan nhan (doi chieu SL) theo ca phieu_gui
POST   /api/sua-chua-bh/phieu/:id/phan-loai         Admin BH phan loai (5 nhanh)
POST   /api/sua-chua-bh/phieu/:id/chan-doan         NV sua chua ghi ket qua chan doan
POST   /api/sua-chua-bh/phieu/:id/de-xuat-lk        NV de xuat linh kien
POST   /api/sua-chua-bh/de-xuat-lk/:id/duyet        Admin BH duyet + nhap ma MISA
POST   /api/sua-chua-bh/phieu/:id/dong-goi          Dong goi lo tra
POST   /api/sua-chua-bh/lo-tra/:id/duyet-ke-toan     Ke toan duyet doi soat
POST   /api/sua-chua-bh/lo-tra/:id/xac-nhan-nhan     KTV xac nhan nhan hang
POST   /api/sua-chua-bh/phieu/:id/phe-duyet-ngoai-le  Tao/duyet case ngoai le
```

Scope theo vai trò viết riêng `scopeSuaChuaBh.ts` (giống `scopeDatMua.ts`) — KTV chỉ thấy phiếu của
mình/Trạm mình, NV sửa chữa chỉ thấy phiếu được gán, Admin BH/Kho/Kế toán xem theo hàng đợi của bước
mình phụ trách.

## 6. Danh sách màn hình (theo vai trò) — sẽ mock trước ở bước demo

| # | Màn hình | Vai trò | Ghi chú UX |
|---|---|---|---|
| 1 | Tạo phiếu gửi hàng (header) + thêm dòng LK | KTV/CTV/Trạm | 2 khối tách biệt: (a) thông tin vận chuyển (ngày gửi xe, mã xe/vận đơn) — sửa được tới khi kho nhận; (b) danh sách dòng LK trong phiếu, mỗi dòng bắt đầu bằng **chọn mã ID sự cố có sẵn** (tự động lấy hết thông tin phụ) rồi chỉ chọn LK/sản phẩm lỗi + mô tả + ảnh/ghi chú tuỳ chọn. Phiếu ở trạng thái **Nháp** cho tới khi bấm "Xác nhận đã gửi" — tách riêng khỏi lúc tạo/lưu nháp; mã tra cứu (QR/ghi tay) hiện ngay từ lúc tạo nháp |
| 2 | Tra cứu đơn của tôi | KTV/CTV/Trạm | Danh sách theo **phiếu** (mỗi phiếu có thể chứa nhiều dòng LK, mỗi dòng tiến độ riêng) + timeline trạng thái trực quan, không cần hỏi ai |
| 3 | Điểm tiếp nhận kho | Kho | 1 ô nhập/quét mã to, nổi bật; đối chiếu số lượng tự động, cảnh báo đỏ khi lệch |
| 4 | Hàng đợi phân loại | Admin bảo hành | Danh sách phiếu "chờ phân loại", thao tác 1-chạm chọn nhánh, gán NV sửa chữa ngay tại dòng |
| 5 | Việc của tôi (sửa chữa) | NV sửa chữa | Form chẩn đoán 4 lựa chọn rõ ràng (không lỗi/sửa được/đề xuất đổi mới/trả xác), kèm ảnh |
| 6 | Duyệt đề xuất linh kiện | Admin bảo hành | Duyệt hàng loạt + nhập mã MISA 1 dòng/1 mã |
| 7 | Hàng đợi phê duyệt ngoại lệ | Admin bảo hành / cấp trên | Case ngoài chính sách chuẩn, có escalate khi quá hạn |
| 8 | Đóng gói lô trả + duyệt kế toán | Kho / Kế toán | Checklist đóng gói, mã vận đơn |
| 9 | Xác nhận nhận hàng trả | KTV | 1-chạm xác nhận + đánh giá kết quả nhanh |
| 10 | Gán vai trò Admin BH / NV sửa chữa | Admin hệ thống (Settings/Users) | Thêm 2 checkbox mới vào form user hiện có |
| 11 | Dashboard tổng quan | Admin BH / TBP DVBH | SLA theo khâu, tồn theo trạng thái, top linh kiện lỗi |

## 7. Lộ trình

1. **Demo/mockup UI** (đang làm — xem file demo đính kèm) — duyệt từng màn trước khi viết dòng code
   thật nào, tránh làm lại.
2. Sau khi duyệt UI: migration D1 (bảng ở mục 3 + 2 cột `users`), route backend (mục 5), scope module.
3. Build thật frontend theo đúng UI đã duyệt ở demo, dùng chung component `ui/` hiện có
   (`Modal`, `Select`, `PaginatedTable`, `StatCard`...).
4. Đăng ký module vào `navConfig.ts` + `moduleAccess.ts` (đồng bộ tay 2 file như quy tắc hiện có),
   thêm badge `countKey` mới vào `notifications/count`.
5. Chốt với đội vận hành: ngưỡng escalate, định nghĩa thất lạc vận chuyển, có bắt buộc serial lúc
   tạo phiếu không (câu hỏi đã nêu trong bản review gốc, vẫn còn mở).
6. Deploy `smarttrade` theo quy trình chuẩn (bump `APP_VERSION`, `deploy:smarttrade`).
