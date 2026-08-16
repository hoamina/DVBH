# ĐÁNH GIÁ UX & WORKFLOW: MODULE ĐẶT MUA LINH KIỆN

**Ngày đánh giá:** 2026-08-14  
**Phương pháp:** Code review chi tiết theo từng vai trò + phân tích luồng nghiệp vụ  
**Phạm vi:** Toàn bộ quy trình từ tạo đơn → duyệt → xuất kho → thanh toán

> **Lưu ý (2026-08-15):** Phần I-V bên dưới là bản đánh giá gốc 2026-08-14, một số điểm ĐÃ ĐƯỢC SỬA
> trong các phiên làm việc sau đó (vd VẤN ĐỀ 13 "nhập ID thủ công" đã thay bằng picker checkbox,
> VẤN ĐỀ 5 "ly_do_cham" đặt tên nhầm đã tách rõ thành `ghi_chu` (người tạo) và `ly_do_cham` (SLA 24h
> do TN giải trình) - xem migration 0070/0072 + nhat_ky_lam_viec.md). Phần **0. TIÊU CHÍ UX CHỐT
> 2026-08-15** ở đầu file là bộ tiêu chí HIỆN HÀNH, đọc phần này trước, dùng phần I-V bên dưới làm
> tham khảo lịch sử/chi tiết.

---

## 0. TIÊU CHÍ UX CHỐT 2026-08-15 (RÀ SOÁT HIỆN TRẠNG)

4 tiêu chí do chủ hệ thống chốt, áp dụng cho **mọi vai trò** trong module "Đặt mua linh kiện":

1. Mỗi vai trò vào module thấy ngay việc cần xử lý + số tồn đọng rõ ràng theo từng loại (không phải
   số liệu chung chung).
2. Số tồn đọng bấm được → nhảy thẳng tới đúng màn hình/tab/filter xử lý, không bắt tự đi tìm lại.
3. Nút hành động "1 chạm" cho thao tác phổ biến nhất trên các màn hình xử lý.
4. Hỗ trợ xử lý hàng loạt theo đúng nhu cầu từng vai trò — kể cả import danh sách (Excel), không chỉ
   phê duyệt/từ chối hàng loạt.

### Kết quả rà soát 2026-08-14 (LỊCH SỬ - đã sửa xong, xem cập nhật bên dưới)

| # | Tiêu chí | Trạng thái | Bằng chứng |
|---|---|---|---|
| 1 | Số tồn đọng rõ theo từng loại | ⚠️ **CHƯA ĐẦY ĐỦ** | Badge sidebar (`GET /notifications/count` → `datMuaLk`, xem `computeDatMuaLkCount` trong `notifications.ts`) đã cá nhân hóa đúng theo vai trò (TN/Kho/Kế toán/QC/Trạm mỗi vai trò cộng đúng bucket của mình), nhưng **gộp thành 1 số duy nhất** trước khi trả ra sidebar. Vai trò có nhiều hàng đợi khác nhau (vd Kho: `thieu_lk` + PXK "đã chốt" + trả hàng "chờ kho") chỉ thấy 1 con số `(5)`, không biết 5 đó chia thế nào giữa 3 loại việc. Trong từng tab có breakdown (vd cột "Trạng thái" ở `DonCuaToiTab` hiện badge "X chờ duyệt / Y đồng ý..." theo từng phiếu), nhưng không có 1 màn hình tổng quan liệt kê rõ theo loại trước khi vào tab. |
| 2 | Số tồn đọng bấm được → nhảy đúng chỗ | ❌ **CHƯA ĐẠT** | `Sidebar.tsx` bấm vào mục "Đặt mua linh kiện" chỉ gọi `setActive(it.key)` — mở MODULE, không mang theo tab/filter nào. Mỗi tab có `useLocalStorageState` default lọc đúng theo vai trò (vd `PhieuXuatKhoTab`: Kế toán mặc định lọc "Cho ke toan") nhưng **chỉ áp dụng lần đầu tiên** vào module — sau đó giữ nguyên tab/filter cuối cùng người dùng để lại, không tự đưa người dùng tới đúng việc mới phát sinh. Vai trò có số gộp từ nhiều nguồn (Kho, Kế toán) không có cách nào bấm để biết nhảy tới tab nào. |
| 3 | Nút hành động 1 chạm | ⚠️ **KHÔNG ĐỒNG ĐỀU** | Đạt: `DonCuaToiTab` (duyệt đơn hàng của TN/Trạm) và `PxkDetailModal` (chuyển trạng thái PXK: Gửi kế toán/Đã chốt xong/Đang gửi KTV...) — nút gọi thẳng `mutate()`, không qua bước xác nhận phụ. **Chưa đạt**: `ThieuLkTab` (Kho xử lý báo thiếu LK) và `TraHangTab` (6 bước trả hàng) — MỌI hành động, kể cả "Duyệt"/"Kho xác nhận hàng đã về" vốn không bắt buộc nhập gì, đều phải mở modal rồi bấm "Xác nhận" thêm 1 lần → 2 chạm cho thao tác phổ biến nhất. |
| 4 | Xử lý hàng loạt đúng nhu cầu + import Excel | ❌ **CHƯA ĐẠT** | Có bulk duyệt/từ chối cho TN/Trạm (`POST /don-hang/bulk-log`) và bulk chọn dòng để gộp vào 1 Phiếu xuất kho. **Thiếu hoàn toàn**: bulk xử lý cho Kho (`ThieuLkTab` — không có `bulk-log` ở `datMuaLinhKien.ts`/`missingParts`), bulk duyệt cho luồng trả hàng 6 bước (Kế toán/Kho/QC/TN — `traHang.ts` chỉ có `POST /:id/log` và `/log-lui`, không có route bulk), bulk chuyển trạng thái nhiều Phiếu xuất kho cùng lúc (`PhieuXuatKhoTab` chỉ mở "Chi tiết" xử lý từng PXK). **Import Excel: không tồn tại ở bất kỳ đâu trong module này** — không ai (KTV/Trạm/TN/Kho) tạo được hàng loạt đơn hàng hay xử lý hàng loạt bằng file. Import Excel hiện chỉ có ở module Settings cho "Danh sách KTV" (dữ liệu tĩnh, không phải luồng nghiệp vụ đặt mua). |

### Cập nhật 2026-08-15: đã triển khai xong cả 4/4 tiêu chí

| # | Tiêu chí | Trạng thái | Cách đã làm |
|---|---|---|---|
| 1 | Số tồn đọng rõ theo từng loại | ✅ **ĐẠT** | `computeDatMuaLkCount` đổi tên thành `computeDatMuaLkBreakdown`, trả `DatMuaLkBreakdown` (9 bucket riêng + `total`) thay vì 1 số gộp (`backend/src/routes/notifications.ts`). Endpoint mới `GET /dat-mua-lk/tom-tat` tái dùng cùng hàm/cache. `DatMuaLinhKienModule.tsx` thêm `SummaryStrip` - dải pill hiện số theo từng loại việc, chỉ hiện bucket liên quan tới vai trò đang đăng nhập. |
| 2 | Số tồn đọng bấm được → nhảy đúng chỗ | ✅ **ĐẠT** | Mỗi pill trong `SummaryStrip` gọi `jumpTo({tab, filter})` - set `view` + truyền `initialFilterOverride` xuống đúng tab con qua prop, tab tự `setFilterTrangThai` trong 1 `useEffect`. `jumpTarget` tự xoá sau 1 lần dùng (setTimeout 0) để không ghi đè filter thủ công sau đó của người dùng. |
| 3 | Nút hành động 1 chạm | ✅ **ĐẠT** | `ThieuLkTab`: các bước không cần nhập liệu (Kho từ chối sai TT/Đã huỷ bỏ/Hàng đã về/Đã kết thúc) gọi `mutate()` trực tiếp, chỉ giữ modal cho "Kho đã tiếp nhận" (bắt buộc giải trình). `TraHangTab`: "Duyệt"/"Từ chối" gọi trực tiếp, chỉ giữ modal cho "Đẩy lùi" (ghi chú bắt buộc). |
| 4 | Xử lý hàng loạt đúng nhu cầu + import Excel | ✅ **ĐẠT** | Thêm `POST /thieu-lk/bulk-log` + `POST /tra-hang/bulk-log` (refactor logic 1-dòng thành hàm dùng chung `applyThieuLkLog`/`applyTraHangLog`, tái dùng ở cả route đơn lẻ và bulk), kèm UI chọn nhiều dòng + thanh hành động ở cả 2 tab. Thêm import Excel tạo hàng loạt đơn mua linh kiện ở `TaoDonTab` (`POST /don-hang/import/preview` + `/commit`, tái dùng `ImportUploader`) - các dòng cùng 1 KTV (cột `nguoi_nhan_hang` = mã KTV) tự gộp thành 1 phiếu đặt riêng. |

**Tổng kết: 4/4 tiêu chí đã đạt (2026-08-15).** Chi tiết kỹ thuật xem `nhat_ky_lam_viec.md` mục ngày
2026-08-15 (đợt 2) và memory `dat-mua-lk-4-tieu-chi-ux`.

---

## I. PHÂN TÍCH THEO VAI TRÒ

### 1. KTV/Trạm (la_ktv_dvbh = 1)

#### 1.1. Luồng công việc chính
1. **Tạo phiếu đặt** (tab "Tạo phiếu đặt")
   - Chọn linh kiện từ dropdown
   - Nhập số lượng, loại đơn (mua/công nợ/trả hàng)
   - Có thể thêm nhiều dòng
   - Submit → Phiếu chuyển trạng thái "Chờ TN duyệt" (vì KTV không phải Vệ tinh)

2. **Theo dõi đơn** (tab "Đơn của tôi / Danh sách")
   - Xem danh sách phiếu đã tạo
   - Click "Chi tiết" để xem lịch sử duyệt
   - Có thể hủy phiếu khi còn đang mở

#### 1.2. ✅ Điểm tốt
- **Cache linh kiện:** Dropdown load nhanh từ IndexedDB, UX mượt mà
- **Gợi ý thay thế:** Khi chọn linh kiện, hiện ngay các linh kiện thay thế cùng nhóm
- **Validation rõ ràng:** Không thể submit khi thiếu mã linh kiện hoặc số lượng ≤ 0
- **Multi-line:** Có thể đặt nhiều linh kiện trong 1 phiếu

#### 1.3. ⚠️ Vấn đề & cải thiện

**VẤN ĐỀ 1: Thiếu feedback khi tạo phiếu thành công**
- **Hiện trạng:** Toast "Đã tạo phiếu đặt XH-000123" xuất hiện 2-3 giây rồi mất
- **Vấn đề:** Người dùng không copy được mã phiếu để lưu lại
- **Đề xuất:** Sau khi tạo thành công, hiện modal với:
  ```
  ✓ Tạo phiếu thành công
  Mã phiếu: XH-000123
  [Copy mã] [Xem chi tiết] [Tạo phiếu mới]
  ```

**VẤN ĐỀ 2: Không có draft/autosave**
- **Hiện trạng:** Nếu điền form 10 dòng, rồi lỡ tay đóng trình duyệt → mất hết
- **Vấn đề:** Phải điền lại từ đầu, rất bực bội
- **Đề xuất:** Auto-save draft vào localStorage mỗi 5s:
  ```ts
  useEffect(() => {
    const timer = setInterval(() => {
      localStorage.setItem('phieu-dat-draft', JSON.stringify({ ghiChu, drafts }));
    }, 5000);
    return () => clearInterval(timer);
  }, [ghiChu, drafts]);
  ```

**VẤN ĐỀ 3: Dropdown linh kiện khó tìm khi có >100 items**
- **Hiện trạng:** Dropdown render tất cả linh kiện, scroll dài
- **Vấn đề:** Tìm mã "LK-456" trong 200 items rất khó
- **Đề xuất:** 
  - Option 1: Thêm search box trong dropdown (react-select có sẵn)
  - Option 2: Đổi sang input với autocomplete (combobox pattern)

**VẤN ĐỀ 4: Không có "Nhân bản phiếu cũ"**
- **Hiện trạng:** Nếu đặt lại đơn giống tháng trước, phải điền lại toàn bộ
- **Vấn đề:** Lặp lại công việc thủ công
- **Đề xuất:** Thêm nút "Tạo từ phiếu cũ" ở tab "Đơn của tôi" → copy toàn bộ dòng sang form mới

**VẤN ĐỀ 5: Field "Lý do đặt" (ly_do_cham) đặt tên gây nhầm lẫn**
- **Hiện trạng:** Field label là "Lý do đặt (tuỳ chọn)" nhưng DB column là `ly_do_cham`
- **Vấn đề:** `ly_do_cham` = "lý do chậm", nhưng đây là lý do ĐẶT hàng, không phải lý do chậm
- **Đề xuất:** 
  - Nếu không thể đổi DB column: comment rõ trong code
  - Nếu đổi được: migration đổi `ly_do_cham` → `ly_do_dat` hoặc `ghi_chu_don`

---

### 2. Vệ tinh (la_ve_tinh = 1)

#### 2.1. Luồng công việc
1. **Tạo đơn của mình:** Giống KTV, nhưng trạng thái đầu tiên là "Chờ Vệ tinh duyệt" (tự duyệt)
2. **Duyệt đơn của Trạm:** Tab "Đơn của tôi" có thêm:
   - Filter theo người tạo (dropdown chỉ hiện Vệ tinh thuộc Trạm này)
   - Checkbox chọn nhiều phiếu (trạng thái "Chờ Vệ tinh duyệt")
   - Nút "Duyệt tất cả" / "Từ chối tất cả"

#### 2.2. ✅ Điểm tốt
- **Bulk approval:** Duyệt hàng loạt tiết kiệm thời gian
- **Filter thông minh:** Chỉ hiện Vệ tinh của Trạm mình quản lý

#### 2.3. ⚠️ Vấn đề & cải thiện

**VẤN ĐỀ 6: Bulk approval không có preview trước khi duyệt**
- **Hiện trạng:** Chọn 10 phiếu → bấm "Duyệt tất cả" → xong
- **Vấn đề:** Không xem được nội dung 10 phiếu đó trước khi duyệt → dễ duyệt nhầm
- **Đề xuất:** Trước khi duyệt, hiện modal:
  ```
  Xác nhận duyệt 10 phiếu:
  - XH-000123: 3 dòng, tổng 5tr
  - XH-000124: 1 dòng, tổng 500k
  ...
  [Hủy] [Xác nhận duyệt]
  ```

**VẤN ĐỀ 7: Không có filter theo khoảng số tiền**
- **Hiện trạng:** Filter có "người tạo", "từ ngày", "đến ngày", nhưng không có filter theo giá trị đơn
- **Vấn đề:** Muốn ưu tiên duyệt đơn >10tr trước không làm được
- **Đề xuất:** Thêm filter "Tổng giá trị: từ ___ đến ___"

**VẤN ĐỀ 8: Trạm tự tạo đơn rồi tự duyệt → bỏ qua kiểm soát**
- **Hiện trạng:** Logic code (datMuaLinhKien.ts:134):
  ```ts
  user.la_ve_tinh ? "Cho Ve tinh duyet" : "Cho TN duyet"
  ```
  → Vệ tinh tự tạo đơn sẽ rơi vào trạng thái "Chờ Vệ tinh duyệt", tức là tự mình duyệt
- **Vấn đề:** Thiếu kiểm soát 4 mắt (người tạo ≠ người duyệt)
- **Đề xuất:** 
  - Option 1: Vệ tinh tự tạo đơn → skip bước "Chờ Vệ tinh duyệt", đi thẳng "Chờ TN duyệt"
  - Option 2: Vệ tinh tự tạo đơn → bắt buộc phải có Vệ tinh khác (cùng Trạm) duyệt

---

### 3. TN Tác nghiệp (TBP DVBH / Admin)

#### 3.1. Luồng công việc
1. **Duyệt phiếu đặt:** Tab "Đơn của tôi" filter "Chờ TN duyệt" → Click "Chi tiết" → Duyệt/Từ chối
2. **Quản lý phiếu số tiền:** Tab "Phiếu số tiền"
   - Xem danh sách phiếu số tiền (PST) do hệ thống tự tạo khi KTV tạo đơn
   - Click "Sửa" → Cập nhật trạng thái, URL bằng chứng
3. **Quản lý phiếu xuất kho:** Tab "Phiếu xuất kho"
   - Tạo phiếu xuất kho (PXK) từ nhiều dòng đơn hàng
   - Gán mã xuất kho cho từng dòng đơn hàng

#### 3.2. ✅ Điểm tốt
- **Centralized control:** TN là điểm kiểm soát chính, thấy được toàn bộ flow
- **Flexible PXK creation:** Có thể gộp nhiều dòng đơn vào 1 phiếu xuất kho

#### 3.3. ⚠️ Vấn đề & cải thiện

**VẤN ĐỀ 9: Phiếu số tiền (PST) tự động tạo nhưng không rõ khi nào tạo**
- **Hiện trạng:** Code không thấy logic tự tạo PST (có thể là trigger hoặc cron?)
- **Vấn đề:** TN không biết PST được tạo ra khi nào, từ đâu
- **Đề xuất:** 
  - Nếu PST tạo tự động: thêm comment rõ ràng trong code
  - Nếu PST tạo thủ công: cần có UI "Tạo phiếu số tiền" ở tab TN

**VẤN ĐỀ 10: Ràng buộc "Phải có PST duyệt mới gán mã xuất kho" quá cứng nhắc**
- **Hiện trạng:** Code (datMuaLinhKien.ts:301-308) check:
  ```ts
  if (isAssigningMaXuatKho && existing.loai_don !== "tra_hang") {
    const approved = await c.env.DB.prepare(
      "SELECT id FROM phieu_so_tien WHERE phieu_dat_id = ? AND trang_thai = 'TN da duyet' LIMIT 1"
    ).bind(existing.phieu_dat_id).first();
    if (!approved) return c.json({ error: "MISSING_PHIEU_SO_TIEN_APPROVED" }, 409);
  }
  ```
- **Vấn đề:** Nếu TN quên duyệt PST, không thể gán mã xuất kho → Kho bị block
- **Đề xuất:** 
  - Thêm error message rõ ràng: "Chưa thể gán mã xuất kho vì phiếu số tiền chưa được TN duyệt. Vui lòng liên hệ TN."
  - Hoặc thêm nút "Duyệt PST nhanh" ngay trong modal gán mã xuất kho (nếu TN đang thao tác)

**VẤN ĐỀ 11: Tab "Phiếu số tiền" UX kém**
- **Hiện trạng:** 
  - Bảng chỉ có cột: Mã PST, Phiếu đặt, Số tiền, Trạng thái, Bằng chứng, Ngày KTV chuyển
  - Click "Sửa" → Modal có dropdown trạng thái + input URL bằng chứng
- **Vấn đề:**
  - Không thấy được nội dung phiếu đặt (có bao nhiêu dòng, linh kiện gì) → phải mở tab khác tra
  - Field "Bằng chứng URL" không có preview → không biết link có đúng không
  - Không có upload file → phải upload lên Drive rồi copy link thủ công
- **Đề xuất:**
  - Thêm cột "Xem phiếu đặt" link sang modal chi tiết phiếu đặt
  - Preview ảnh bằng chứng nếu URL là ảnh (jpg/png)
  - Tích hợp upload R2 (nếu bật R2) hoặc ít nhất validate URL

**VẤN ĐỀ 12: Không có dashboard/báo cáo cho TN**
- **Hiện trạng:** TN không thấy overview: "Hôm nay có bao nhiêu phiếu chờ duyệt? Tuần này đã duyệt bao nhiêu? Giá trị trung bình?"
- **Vấn đề:** Không có số liệu để đo lường hiệu suất
- **Đề xuất:** Thêm tab "Thống kê" với:
  - Card: "Chờ duyệt (10)", "Đã duyệt tuần này (45)", "Tổng giá trị tuần (150tr)"
  - Biểu đồ: Số phiếu theo ngày, xu hướng

---

### 4. Kho (la_kho = 1)

#### 4.1. Luồng công việc
1. **Tạo phiếu xuất kho (PXK):** Tab "Phiếu xuất kho"
   - Nhập mã xuất kho
   - Nhập danh sách ID đơn hàng (cách nhau bởi dấu cách/phẩy)
   - Submit → Tạo PXK
2. **Xử lý thiếu linh kiện:** Tab "Thiếu linh kiện"
   - Xem danh sách báo thiếu
   - Cập nhật trạng thái: "Kho đã tiếp nhận" → "Kho xác nhận hàng đã về" / "Kho từ chối sai TT"

#### 4.2. ✅ Điểm tốt
- **Simple workflow:** Kho chỉ cần quan tâm đến việc xuất hàng, không bị phức tạp hóa

#### 4.3. ⚠️ Vấn đề & cải thiện

**VẤN ĐỀ 13: Tạo PXK bằng cách nhập ID thủ công → dễ sai**
- **Hiện trạng:** Code (DatMuaLinhKienModule.tsx:799):
  ```ts
  const ids = createData.don_hang_ids_raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  ```
  → Người dùng phải nhập: "DDH-000123 DDH-000124 DDH-000125"
- **Vấn đề:**
  - Gõ nhầm 1 ký tự → ID sai → tạo PXK thất bại
  - Không biết ID nào từ đâu → phải mở tab khác copy
- **Đề xuất:**
  - Thay bằng UI chọn checkbox: Hiện danh sách dòng đơn hàng "TN đã duyệt" + chưa có mã xuất kho
  - Checkbox chọn nhiều → Submit
  - Hoặc scan barcode nếu có in QR code trên đơn hàng

**VẤN ĐỀ 14: Không có preview trước khi tạo PXK**
- **Hiện trạng:** Nhập ID → Submit → Xong
- **Vấn đề:** Không biết mình đang xuất những linh kiện gì, tổng bao nhiêu
- **Đề xuất:** Sau khi nhập ID, hiện bảng preview:
  ```
  Xác nhận tạo phiếu xuất kho ABC-123:
  - DDH-000123: LK-456 (Tụ điện) x 10
  - DDH-000124: LK-789 (Điện trở) x 5
  Tổng: 15 món
  [Hủy] [Xác nhận]
  ```

**VẤN ĐỀ 15: Tab "Thiếu linh kiện" không có filter**
- **Hiện trạng:** Bảng hiện tất cả, không có filter trạng thái/ngày
- **Vấn đề:** Nếu có 100 dòng "Đã kết thúc", Kho phải scroll để tìm "Chờ kho xử lý"
- **Đề xuất:** Thêm filter dropdown "Trạng thái", mặc định filter "Chờ kho xử lý"

---

### 5. Kế toán (la_ke_toan = 1)

#### 5.1. Luồng công việc
1. **Xem đơn trả hàng:** Tab "Đơn trả hàng"
   - Filter trạng thái "Chờ kế toán duyệt mềm"
   - Duyệt/Từ chối
2. **Xem phiếu xuất kho:** Tab "Phiếu xuất kho" (read-only)

#### 5.2. ✅ Điểm tốt
- **Focused role:** Kế toán chỉ tập trung vào financial reconciliation

#### 5.3. ⚠️ Vấn đề & cải thiện

**VẤN ĐỀ 16: Kế toán không thấy được tổng số tiền**
- **Hiện trạng:** Tab "Đơn trả hàng" có cột: ID, Phiếu đặt, Mã LK, Số lượng, Trạng thái
- **Vấn đề:** Không có cột "Giá trị" → Kế toán không biết đang duyệt đơn bao nhiêu tiền
- **Đề xuất:** Thêm cột "Giá trị = gia_chot × so_luong_thuc_xuat"

**VẤN ĐỀ 17: Không có báo cáo tài chính**
- **Hiện trạng:** Kế toán không thấy: "Tháng này đã chi bao nhiêu? So với tháng trước?"
- **Vấn đề:** Không theo dõi được budget
- **Đề xuất:** Thêm tab "Báo cáo tài chính":
  - Tổng chi theo tháng
  - Breakdown theo loại linh kiện
  - So sánh YoY/MoM

---

### 6. QC (vai_tro = "QC")

#### 6.1. Luồng công việc
1. **Xác nhận đơn trả hàng:** Tab "Đơn trả hàng"
   - Filter "Chờ QC xác nhận"
   - Duyệt/Từ chối

#### 6.2. ✅ Điểm tốt
- **Clear separation:** QC chỉ xác nhận chất lượng, không can thiệp vào tài chính

#### 6.3. ⚠️ Vấn đề & cải thiện

**VẤN ĐỀ 18: QC không có checklist kiểm tra**
- **Hiện trạng:** QC chỉ có nút "Duyệt/Từ chối", không có form checklist
- **Vấn đề:** Không rõ QC kiểm tra những gì → inconsistent
- **Đề xuất:** Thêm form checklist:
  ```
  ☐ Hàng đã nhận về đúng số lượng
  ☐ Hàng không bị hư hỏng
  ☐ Hàng đúng mã linh kiện
  ☐ Giá trị phù hợp
  Ghi chú: _______________
  ```

---

## II. VẤN ĐỀ CHUNG (CROSS-ROLE)

### VẤN ĐỀ 19: Không có notification system
- **Hiện trạng:** Khi TN duyệt phiếu, KTV không biết → phải F5 refresh trang
- **Vấn đề:** Phản hồi chậm, người dùng không biết khi nào có update
- **Đề xuất:** 
  - Real-time: WebSocket hoặc Server-Sent Events (SSE)
  - Polling: Mỗi 30s poll API `/api/notifications` (đơn giản hơn)
  - UI: Badge số trên icon chuông ở TopBar

### VẤN ĐỀ 20: Không có search global
- **Hiện trạng:** Muốn tìm phiếu "XH-000123" → phải vào từng tab, từng filter
- **Vấn đề:** Mất thời gian
- **Đề xuất:** Search box ở TopBar: Nhập ID → Jump thẳng đến chi tiết

### VẤN ĐỀ 21: Không có export Excel ở mọi tab
- **Hiện trạng:** Chỉ 1 số module có nút "Xuất Excel", module này không có
- **Vấn đề:** TN muốn export báo cáo để gửi sếp không làm được
- **Đề xuất:** Thêm nút "Xuất Excel" ở mọi tab, export filtered rows

### VẤN ĐỀ 22: Loading states không rõ ràng
- **Hiện trạng:** Khi click "Duyệt", nút chỉ disabled, không có spinner
- **Vấn đề:** Người dùng không biết đang xử lý hay bị treo
- **Đề xuất:** 
  - Thêm spinner vào nút: `{create.isPending ? <Spinner /> : "Tạo phiếu"}`
  - Hoặc dùng skeleton loading cho table

### VẤN ĐỀ 23: Error messages quá kỹ thuật
- **Hiện trạng:** 
  - Toast: "Không thể tạo phiếu: MISSING_DON_HANG"
  - Toast: "Lỗi: MISSING_PHIEU_SO_TIEN_APPROVED"
- **Vấn đề:** Người dùng không hiểu `MISSING_DON_HANG` nghĩa là gì
- **Đề xuất:** Map error codes sang Vietnamese:
  ```ts
  const ERROR_MESSAGES: Record<string, string> = {
    MISSING_DON_HANG: "Vui lòng thêm ít nhất 1 dòng đơn hàng",
    MISSING_PHIEU_SO_TIEN_APPROVED: "Chưa thể gán mã xuất kho vì phiếu số tiền chưa được duyệt",
    // ...
  };
  ```

### VẤN ĐỀ 24: Không có help/documentation inline
- **Hiện trạng:** Field "Loại đơn" có 3 options: Mua, Công nợ, Trả hàng
- **Vấn đề:** Người dùng mới không biết khi nào chọn "Công nợ", khi nào chọn "Mua"
- **Đề xuất:** Thêm tooltip icon `ⓘ` bên cạnh label:
  ```
  Loại đơn ⓘ
  Tooltip: 
  - Mua: Đặt hàng mới, thanh toán ngay
  - Công nợ: Ghi nợ, thanh toán sau
  - Trả hàng: Hoàn trả linh kiện lỗi
  ```

---

## III. BUGS TIỀM ẨN (TỪPHÂN TÍCH CODE)

### BUG 1: Race condition khi tạo phiếu nhanh
- **Vị trí:** `nextSequentialId()` (backend/src/lib/idCounter.ts - chưa đọc nhưng đoán logic)
- **Vấn đề:** Nếu 2 user tạo phiếu cùng lúc, có thể sinh ra duplicate ID
- **Kiểm tra:** Cần xem implementation `nextSequentialId` có dùng transaction không

### BUG 2: Dropdown linh kiện có thể hiện item đã tắt
- **Vị trí:** `TaoDonTab` useEffect (DatMuaLinhKienModule.tsx:260)
  ```ts
  setDanhMuc(cached.filter((r) => r.bat_tat) as unknown as LkDanhMucRow[]);
  ```
- **Vấn đề:** Cache có thể chứa item `bat_tat=0` (đã tắt) từ lần sync cũ
- **Fix:** Cần filter `bat_tat=1` ở cả 2 nơi: cache load + incremental sync

### BUG 3: Bulk approval không handle partial failure
- **Vị trí:** `applyPhieuDatLog` loop (datMuaLinhKien.ts:276-279)
  ```ts
  for (const id of body.ids) {
    const result = await applyPhieuDatLog(c, id, body.hanh_dong, body.ghi_chu);
    results[id] = "error" in result ? result.error : result.nextTrangThai;
  }
  ```
- **Vấn đề:** Nếu duyệt 10 phiếu, phiếu thứ 5 lỗi → 4 phiếu đầu đã commit, 5 phiếu sau không chạy
- **Tác động:** Inconsistent state, user tưởng duyệt hết nhưng thực tế chỉ duyệt 1 nửa
- **Fix:** 
  - Option 1: Wrap toàn bộ loop trong 1 transaction (nhưng D1 batch có limit)
  - Option 2: UI phải hiện rõ: "Duyệt thành công 4/10. Thất bại: XH-000125 (PHIEU_DA_DONG), ..."

---

## IV. ƯU TIÊN FIX (ROADMAP)

### 🔴 CRITICAL (Làm ngay)
1. **VẤN ĐỀ 23:** Error messages tiếng Việt → UX tốt hơn ngay lập tức
2. **VẤN ĐỀ 13:** UI chọn đơn hàng thay vì nhập ID thủ công → giảm 90% lỗi nhập sai
3. **BUG 3:** Handle partial failure trong bulk approval → tránh data corruption

### 🟠 HIGH (Tuần này)
4. **VẤN ĐỀ 1:** Modal sau khi tạo phiếu thành công → UX mượt mà
5. **VẤN ĐỀ 2:** Autosave draft → tránh mất công
6. **VẤN ĐỀ 10:** Error message rõ ràng khi gán mã xuất kho bị block → giảm support ticket

### 🟡 MEDIUM (Tuần sau)
7. **VẤN ĐỀ 3:** Search trong dropdown linh kiện → tăng tốc độ làm việc
8. **VẤN ĐỀ 6:** Preview trước khi bulk approve → tăng độ chính xác
9. **VẤN ĐỀ 14:** Preview trước khi tạo PXK → tăng độ chính xác
10. **VẤN ĐỀ 19:** Notification system (polling đơn giản) → real-time feedback

### 🟢 LOW (Có thời gian)
11. **VẤN ĐỀ 4:** Tính năng nhân bản phiếu cũ
12. **VẤN ĐỀ 12:** Dashboard/báo cáo cho TN
13. **VẤN ĐỀ 17:** Báo cáo tài chính cho Kế toán
14. **VẤN ĐỀ 20:** Global search
15. **VẤN ĐỀ 24:** Inline help/tooltip

---

## V. KẾT LUẬN

**Điểm mạnh:**
- Logic nghiệp vụ rõ ràng, phân quyền chi tiết
- IndexedDB cache hoạt động tốt
- Bulk operations tiết kiệm thời gian

**Điểm yếu:**
- UX chưa polish: thiếu feedback, preview, error handling
- Một số workflow quá thủ công (nhập ID thay vì chọn UI)
- Thiếu báo cáo/dashboard để theo dõi KPI

**Khuyến nghị:**
- Ưu tiên fix 3 vấn đề CRITICAL trước (1-2 ngày)
- Sau đó cải thiện UX theo roadmap HIGH → MEDIUM → LOW
- Cần test thực tế với user để validate assumptions

**Tổng kết:** Module hoạt động được nhưng cần nhiều cải thiện UX để đạt "production-ready quality".
