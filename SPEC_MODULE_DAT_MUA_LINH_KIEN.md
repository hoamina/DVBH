# Đặc tả chức năng module "Đặt mua linh kiện" (để AI khác xây lại giao diện)

> Tài liệu này mô tả Ở MỨC CHỨC NĂNG VÀ DỮ LIỆU: màn hình nào cần có, mỗi màn hình cần nhập/hiển thị
> thông tin gì, luồng xử lý ra sao. KHÔNG mô tả layout/kích thước/vị trí pixel — phần đó do AI xây
> giao diện tự quyết định.

## 1. Module này dùng để làm gì

Quản lý toàn bộ quy trình mua linh kiện sửa chữa cho kỹ thuật viên (KTV): từ lúc KTV/Trạm đề xuất mua
1 linh kiện → Tác nghiệp (TN) duyệt → Kế toán xử lý sổ sách → Kho đóng gói/giao hàng → KTV xác nhận
đã nhận hàng. Kèm theo 2 luồng phụ độc lập: "báo thiếu linh kiện" (khi kho không đủ hàng để giao) và
"trả hàng" (KTV trả lại linh kiện đã nhận).

## 2. Vai trò người dùng và quyền hạn

Một người dùng có thể có **nhiều cờ vai trò cùng lúc** (không loại trừ nhau), quyền được xây dựng dựa
trên tổ hợp các cờ này:

| Vai trò / cờ | Ý nghĩa | Được làm gì trong module |
|---|---|---|
| KTV (`la_ktv_dvbh`) | Kỹ thuật viên hiện trường | Tự tạo đơn xin mua linh kiện cho bản thân, xem đơn của mình, xác nhận đã nhận hàng khi mình là người nhận |
| Vệ tinh (`la_ve_tinh`) | Nhân sự phụ, gắn với 1 "Trạm" (`tram_cha` trỏ tới 1 tài khoản KTV) | Tự tạo đơn NHƯNG người nhận hàng thực tế luôn là Trạm của mình (không phải chính họ) |
| Trạm | Chính là 1 tài khoản KTV có Vệ tinh trực thuộc — không phải vai trò riêng, chỉ là 1 KTV có `la_ktv_dvbh` | Ngoài việc của KTV, còn duyệt/từ chối đơn do các Vệ tinh của mình tạo (bước đầu tiên) |
| Tác nghiệp/TN (`vai_tro = "TBP DVBH"` hoặc `Admin`) | Người vận hành trung tâm | Duyệt/từ chối mọi đơn, tạo đơn hộ KTV khác, tạo phiếu xuất kho, xử lý luồng thiếu LK bước cuối, duyệt trả hàng bước cuối |
| Giám sát (`vai_tro = "Giam sat"`) | Theo dõi 1 nhóm KTV | CHỈ xem/theo dõi (không có nút hành động nào) — thấy được PXK, trả hàng, báo cáo của những KTV mình phụ trách |
| Kho (`la_kho`) | Quản lý kho | Xử lý luồng thiếu linh kiện, xử lý bước giao hàng trong Phiếu xuất kho, xử lý bước kho trong luồng trả hàng |
| Kế toán (`la_ke_toan`) | Kế toán | Điền mã MISA và chốt sổ trên Phiếu xuất kho, xử lý bước đầu trong luồng trả hàng |
| QC (`vai_tro = "QC"`) | Kiểm soát chất lượng | Chỉ tham gia luồng trả hàng (1 bước xác nhận) |
| Admin | Toàn quyền | Làm được mọi hành động của mọi vai trò trên |

Ghi chú quan trọng: **KTV/Vệ tinh/Trạm (nhóm "hiện trường") không được xem chi tiết case CRM** — họ
thấy mã case (nếu có liên kết) dưới dạng text thường, không bấm mở được. Các vai trò còn lại (TN,
Kho, Kế toán, QC, Giám sát, Admin) bấm vào mã case sẽ mở được popup chi tiết case.

## 3. Các thực thể dữ liệu (tên bảng chỉ để tham khảo, AI xây giao diện không cần quan tâm tên bảng
   thật, chỉ cần biết CÓ NHỮNG TRƯỜNG DỮ LIỆU NÀO)

### 3.1. Dòng đơn hàng (đơn vị xử lý chính — KHÔNG có khái niệm "phiếu" gộp nhiều dòng ở tầng giao diện)

Mỗi dòng = 1 yêu cầu mua/công nợ/trả 1 loại linh kiện với 1 số lượng nhất định.

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| id | text | Mã dòng, vd `DDH-000123` |
| loai_don | enum | `mua` / `cong_no` / `tra_hang` — tự suy ra từ "Loại đề xuất" (xem 3.6) |
| ma_lk, ten_lk_snapshot | text | Mã + tên linh kiện (tên chụp lại tại thời điểm tạo, phòng khi danh mục đổi tên sau) |
| loai_de_xuat | text | Giá trị chọn từ danh mục "Loại đề xuất" (vd "MUA HÀNG", "CÔNG NỢ", "TRỪ CÔNG NỢ", "TRẢ HÀNG", "HỖ TRỢ", "THẺ BẢO HÀNH"...) |
| so_luong_de_xuat | số | Số lượng đề xuất lúc tạo |
| so_luong_thuc_xuat | số, có thể null | Số lượng TN chốt thực tế xuất |
| gia_de_xuat | tiền, có thể null | Giá tham khảo chụp lại từ danh mục linh kiện lúc tạo (KHÔNG phải giá cuối) |
| gia_chot | tiền, có thể null | Giá TN chốt cuối cùng |
| ly_do_cham | text, có thể null | TN giải trình lý do xử lý chậm (bắt buộc điền nếu quá hạn 24h kể từ lúc "Chờ TN duyệt", có cộng thêm T7/CN) |
| ma_xuat_kho | text, có thể null | Mã đơn hàng thực tế (đồng bộ từ Phiếu xuất kho chứa dòng này) |
| ma_misa | text | Trường cũ cấp-dòng, hiện KHÔNG còn dùng ở giao diện (mã MISA giờ nhập ở cấp Phiếu xuất kho) |
| so_tien_cong_no | tiền, chỉ có khi loai_don=cong_no | Không còn dùng nhập tay — chỉ để tham khảo lịch sử |
| nguoi_tao | email | Người tạo dòng (có thể khác người nhận hàng, nếu TN/GS tạo hộ) |
| nguoi_nhan_hang | email | KTV thực sự sẽ nhận linh kiện này (nếu người tạo là Vệ tinh → LUÔN tự động là Trạm của Vệ tinh đó, không thể chọn khác) |
| email_gs | email, có thể null | Giám sát theo dõi dòng này (suy ra từ người nhận hàng) |
| ngay_tao, updated_at | datetime | |
| ghi_chu | text | Ghi chú của người tạo |
| yeu_cau_hoa_don | text | "Có"/"Không" — có cần xuất hoá đơn không |
| tt_mail_duyet | text | Thông tin mail duyệt (dùng cho đơn công nợ/hỗ trợ) |
| tt_khach_hang | text | Thông tin khách hàng liên quan |
| chinh_sach | text | Chính sách áp dụng — **bắt buộc** nếu loại đề xuất chứa "CÔNG NỢ" và không chứa "TRẢ HÀNG" |
| ma_yeu_cau_su_co | text | Mã case CRM liên quan — **bắt buộc** cùng điều kiện với chinh_sach ở trên; hệ thống có cảnh báo mềm kiểm tra mã này có tồn tại và có đúng KTV xử lý không (không chặn submit) |
| trạng thái | text (tính từ log, xem 4.1) | |
| case liên kết | danh sách 0..N case (id, khách hàng, khu vực) | Có thể gắn/gỡ nhiều case CRM vào 1 dòng đơn |
| lịch sử xử lý (logs) | danh sách | Mỗi log: trạng thái, người xử lý, thời gian, ghi chú |

### 3.2. Phiếu xuất kho (PXK) — gộp nhiều dòng đơn hàng ĐÃ ĐƯỢC TN DUYỆT của **CÙNG 1 KTV** thành 1 lần giao

Quy tắc cứng: **1 Phiếu xuất kho chỉ gắn cho đúng 1 KTV** (không được trộn dòng của nhiều KTV khác
nhau vào cùng 1 phiếu).

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| id | text | Mã phiếu, vd `PXK-000123` |
| ma_xuat_kho | text | "Mã đơn hàng" — do TN nhập SAU (thường sau khi KTV chuyển tiền xong); lúc mới tạo hệ thống tự điền placeholder = chính id phiếu |
| ma_xuat_kho_xac_nhan | 0/1 | 0 = còn placeholder (TN chưa nhập mã thật), 1 = đã nhập mã thật |
| ma_misa | text, có thể null | Kế toán điền — bắt buộc trước khi được "chốt xong đơn xuất" |
| ma_van_don | text, có thể null | Mã vận đơn (Kho nhập lúc chuyển sang bước gửi KTV) |
| anh_bien_ban_url | text (link), có thể null | Ảnh biên bản giao nhận — do CHÍNH người nhận hàng chụp/tải lên (lưu trên Google Drive) |
| nguoi_tao | email | Luôn là TN |
| nguoi_nhan_hang | email | KTV duy nhất của phiếu này |
| ngay_tao | datetime | |
| ghi_chu | text | |
| so_tien_can_chuyen | tiền, có thể null | Số tiền KTV cần chuyển khoản trước (tùy chọn, có thể không có) |
| trang_thai_chuyen_tien | text, có thể null | `Cho KTV chuyen` / `KTV da chuyen` / `TN da duyet` — ĐIỀU KIỆN CHẶN riêng, không phải bước chính |
| bang_chung_chuyen_tien_url | text, có thể null | Ảnh/link bằng chứng KTV đã chuyển khoản |
| ngay_ktv_chuyen | datetime, có thể null | |
| trạng thái chính | text (tính từ log, xem 4.2) | |
| danh sách dòng đơn hàng trong phiếu | danh sách | Mỗi dòng đầy đủ thông tin như 3.1, kèm cờ "quá hạn lý do chậm" nếu có |
| lịch sử xử lý (logs) | danh sách | |

### 3.3. Ticket "thiếu linh kiện" — mở tự động khi TN từ chối 1 dòng đơn với lý do được đánh dấu "gây thiếu hàng"

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| id | text | Mã ticket, vd `TLK-000045` |
| dat_don_hang_id | text | Dòng đơn hàng gốc bị thiếu |
| ly_do_cham_id / ten_ly_do | | Lý do chậm được chọn khi TN từ chối (tham chiếu danh mục lý do) |
| ngay_du_kien_co_hang | date, có thể null | Kho điền khi giải trình |
| nguoi_tao | email | Người mở ticket (thường là TN) |
| ngay_tao | datetime | |
| trạng thái | text (tính từ log, xem 4.3) | |
| **Thông tin nguồn gốc nên hiển thị kèm** (join từ dòng đơn hàng gốc) | | Mã LK, tên LK, loại đơn (mua/công nợ/trả hàng), loại đề xuất, số lượng đề xuất, người nhận hàng (KTV nào đang chờ) — để người xử lý không phải mở thêm màn khác mới biết đang thiếu linh kiện gì cho ai |

### 3.4. Đơn trả hàng — vẫn là 1 "dòng đơn hàng" (mục 3.1) nhưng có `loai_don = 'tra_hang'`, đi qua state machine RIÊNG hoàn toàn tách biệt (xem 4.4), không qua các bước duyệt mua/công nợ thông thường.

### 3.5. Danh mục KTV (tra cứu, không phải màn hình chính của module này nhưng module đọc dữ liệu từ đây)

Mỗi KTV có: mã KTV, tên hiển thị, số điện thoại, email đăng nhập (có thể chưa từng đăng nhập lần
nào), giám sát quản lý, trạm cha (nếu là Vệ tinh).

### 3.6. Danh mục "Loại đề xuất" và danh mục linh kiện

- Danh mục linh kiện: mã, tên, giá tham chiếu, đơn vị tính, còn dùng hay không.
- Danh mục "Loại đề xuất": danh sách text tuỳ biến được (Admin cấu hình ở màn Cài đặt riêng, không
  thuộc phạm vi module này), mỗi loại tự map sang 1 trong 3 nhóm `mua`/`cong_no`/`tra_hang` theo quy
  tắc: chứa chữ "TRẢ HÀNG" → nhóm trả hàng; chứa chữ "CÔNG NỢ" (và không phải trả hàng) → nhóm công
  nợ; còn lại → nhóm mua hàng.

## 4. Các luồng trạng thái (state machine)

### 4.1. Dòng đơn hàng (mua/công nợ — KHÔNG áp dụng cho trả hàng, xem 4.4)

```
[Vệ tinh tạo] → Chờ Trạm duyệt → (Trạm duyệt) → Chờ TN duyệt
[KTV/Trạm tự tạo] ─────────────────────────────→ Chờ TN duyệt
Chờ Trạm duyệt → (Trạm từ chối) → Đã huỷ
Chờ TN duyệt → (TN duyệt) → TN đã duyệt  [→ có thể được gom vào 1 Phiếu xuất kho]
Chờ TN duyệt → (TN từ chối, bắt buộc chọn 1 lý do chậm)
    → nếu lý do đó được đánh dấu "gây thiếu hàng": Chờ hàng (đồng thời tự mở 1 ticket "thiếu linh kiện", xem 4.3)
    → ngược lại: TN từ chối
Bất kỳ trạng thái nào chưa đóng → (người tạo/Trạm/Admin bấm Huỷ, BẮT BUỘC nhập lý do tự do) → Đã huỷ
"Chờ hàng" → (ticket thiếu LK được xử lý xong/hàng về/huỷ ticket) → tự động quay lại TN đã duyệt
```

Trạng thái đóng (không xử lý được nữa): `TN đã duyệt` (đã đóng theo nghĩa "xong bước duyệt", tiếp
tục sang PXK), `TN từ chối`, `Đã huỷ`.

### 4.2. Phiếu xuất kho — đúng 8 trạng thái cố định

```
Đang tạo phiếu
  → (TN gửi, ĐIỀU KIỆN: đã nhập mã đơn hàng thật + không có dòng nào quá hạn lý do chậm + nếu có yêu cầu chuyển tiền thì TN đã duyệt bằng chứng)
  → Chờ kế toán
  → (Kế toán chốt xong, ĐIỀU KIỆN: đã điền mã MISA)
  → Đã chốt xong đơn xuất
  → (Kho chọn 1 trong 2 hướng)
     → Đang gửi KTV (cần giao vật lý)
         → (đúng người nhận hàng, hoặc Admin, xác nhận) → KTV đã nhận   [đóng]
         → (Kho tự đóng khi KTV không phản hồi) → Kho đã kết thúc      [đóng]
     → Hàng trừ kho (không cần giao vật lý, vd trừ thẳng vào tồn kho KTV đang giữ)  [đóng]
  Nhánh huỷ: từ "Đang tạo phiếu" hoặc "Chờ kế toán" → Kế toán huỷ (do Kế toán hoặc TN)  [đóng]
```

Điều kiện chặn phụ (không phải 1 bước trạng thái, mà là điều kiện chặn việc chuyển từ "Đang tạo
phiếu" sang "Chờ kế toán"): nếu phiếu có khai báo "số tiền KTV cần chuyển", thì KTV phải đính bằng
chứng chuyển khoản và TN phải duyệt bằng chứng đó trước.

### 4.3. Ticket thiếu linh kiện

```
Chờ kho xử lý
  → Kho đã tiếp nhận (BẮT BUỘC nhập giải trình lý do thiếu hàng thật + tuỳ chọn ngày dự kiến có hàng)
  → Kho xác nhận hàng đã về  → (tự động đưa dòng đơn hàng gốc quay lại "TN đã duyệt")
  → (TN) Đã kết thúc  [đóng — bước đóng hồ sơ hành chính]
Ở bất kỳ bước nào (trừ khi đã đóng): 
  → Kho từ chối sai thông tin  → (tự động đưa dòng đơn hàng gốc quay lại "TN đã duyệt")  [đóng]
  → Đã huỷ bỏ (người tạo ticket hoặc Kho)  → (tự động đưa dòng đơn hàng gốc quay lại "TN đã duyệt")  [đóng]
```

### 4.4. Đơn trả hàng (state machine hoàn toàn riêng, không dùng chung với 4.1)

```
Chờ kế toán duyệt mềm
  → (Kế toán) → Chờ kho xác nhận
  → (Kho) → Chờ QC xác nhận
  → (QC) → Chờ TN duyệt tổng
  → (TN) → Chờ kế toán xác nhận nhập kho
  → (Kế toán) → Chờ kho xác nhận nhập kho
  → (Kho) → Đã hoàn thành  [đóng]
Ở bất kỳ bước nào (người phụ trách bước đó): có thể "Từ chối" → Từ chối [đóng]
Người tạo (hoặc TN): có thể "Huỷ" ở bất kỳ lúc nào chưa đóng → Đã huỷ [đóng]
Kế toán/Kho: có thể "Đẩy lùi 1 bước" (bắt buộc nhập lý do) từ bất kỳ bước nào (trừ bước đầu) về bước liền trước.
```

## 5. Danh sách màn hình cần có

### Màn hình A — "Đơn của tôi / Danh sách" (màn chính, ai cũng vào được)

**Hiển thị**: danh sách các dòng đơn hàng (mua + công nợ, KHÔNG gồm trả hàng — trả hàng có màn riêng
D). Mỗi dòng hiện: mã dòng, mã+tên linh kiện, loại đề xuất (kèm màu/nhãn phân biệt mua/công nợ), số
lượng đề xuất, giá đề xuất, trạng thái (có màu/gạch ngang phân biệt: đã huỷ/bị từ chối gạch ngang đỏ,
đang chờ duyệt màu cam, đã duyệt màu xanh), người tạo, người nhận hàng, ngày tạo, mã yêu cầu sự cố
liên quan (bấm mở case nếu được phép — xem mục 2).

Vì 1 người nhận hàng (KTV) có thể có nhiều dòng, nên gom nhóm hiển thị theo từng KTV (mỗi khối = 1
KTV, có dòng tổng hợp SL/tổng tiền của khối đó) — hữu ích cho TN/Trạm xử lý hàng loạt.

**Bộ lọc cần có**: trạng thái, người nhận hàng (khi người xem có quyền xem nhiều KTV), khoảng ngày
tạo + người tạo (khi người xem là Trạm — để lọc theo từng Vệ tinh mình quản lý).

**Hành động** (tuỳ theo vai trò + trạng thái dòng, có thể làm trên từng dòng riêng lẻ HOẶC chọn nhiều
dòng xử lý hàng loạt):
- Duyệt (Trạm duyệt đơn Vệ tinh / TN duyệt đơn thường)
- Từ chối — Trạm từ chối không cần lý do; TN từ chối BẮT BUỘC chọn 1 lý do chậm từ danh mục
- Huỷ — bất kỳ lúc nào còn mở, BẮT BUỘC nhập lý do tự do
- "+ Tạo đơn" — mở màn tạo đơn (mục B)
- Bấm vào 1 dòng → mở modal "Chi tiết đơn" (mục C)

### Màn hình B — Modal "Tạo đơn" (mở từ nút "+ Tạo đơn")

Cho phép tạo NHIỀU dòng đơn hàng trong 1 lần (KTV thường tạo 1 dòng, TN/Trạm có thể tạo nhiều dòng
cho nhiều linh kiện khác nhau cùng lúc).

**Thông tin cấp toàn bộ đơn** (chỉ hiện với TN/Giám sát — người "tạo hộ"):
- Người nhận hàng: chọn 1 KTV cụ thể (mặc định là chính người đang tạo nếu không chọn)

**Mỗi dòng cần nhập**:
- Mã linh kiện (chọn từ danh mục, tìm kiếm theo mã/tên)
- Loại đề xuất (chọn từ danh mục; có vài nút bấm nhanh cho các loại phổ biến: "MUA HÀNG", "CÔNG NỢ",
  "TRỪ CÔNG NỢ")
- Số lượng đề xuất
- (Hiển thị, không phải ô nhập) Giá đề xuất ước tính = giá tham chiếu × số lượng — chỉ mang tính tham khảo
- Yêu cầu hoá đơn (Có/Không, mặc định "Không")
- Mã yêu cầu sự cố liên quan (có cảnh báo mềm: kiểm tra mã case có tồn tại không, có đúng KTV xử lý
  không — không chặn submit, chỉ nhắc)
- Chính sách áp dụng
- Thông tin mail duyệt
- Thông tin khách hàng
- Ghi chú

Trong đó **Chính sách** và **Mã yêu cầu sự cố** trở thành BẮT BUỘC khi Loại đề xuất thuộc nhóm "công
nợ" (chứa chữ CÔNG NỢ, không phải trả hàng). Với loại "MUA HÀNG" thuần, nhóm 3 trường Chính
sách/Thông tin mail duyệt/Thông tin khách hàng có thể ẩn mặc định (có nút mở rộng thủ công nếu cần).

**Chức năng hỗ trợ nhập nhanh mong muốn có**:
- Gợi ý "chọn nhanh linh kiện thường đặt" — hiện danh sách linh kiện được đặt nhiều nhất toàn hệ
  thống, bấm 1 phát điền vào dòng đang trống (hoặc thêm dòng mới)
- Gợi ý linh kiện thay thế khi đã chọn 1 mã linh kiện (nếu có cấu hình thay thế)
- Nút "+ Thêm dòng" — dòng mới kế thừa sẵn Loại đề xuất của dòng trước đó (đỡ chọn lại)
- Hiển thị tổng giá ước tính của toàn bộ đơn
- Nút submit tạo đơn — nên đặt cố định luôn nhìn thấy được (không bị cuộn mất khi đơn có nhiều dòng)
- Có lựa chọn "Import Excel hàng loạt" (chỉ TN/Giám sát) — tải lên file với các cột: người nhận hàng
  (mã KTV), mã linh kiện, loại đề xuất, số lượng, và các trường tuỳ chọn còn lại; các dòng cùng 1 KTV
  tự động gộp thành 1 đơn; có bước xem trước kết quả trước khi xác nhận ghi vào hệ thống, báo rõ dòng
  nào lỗi.

### Màn hình C — Modal "Chi tiết đơn" (mở khi bấm vào 1 dòng)

**Hiển thị**: đầy đủ thông tin dòng đơn hàng (mục 3.1), badge trạng thái, danh sách case liên kết
(gắn thêm/gỡ được), toàn bộ lịch sử xử lý (ai, lúc nào, chuyển sang trạng thái gì, ghi chú gì), cảnh
báo nếu dòng đang quá hạn xử lý (quá 24h ở "Chờ TN duyệt" mà chưa có lý do chậm).

**Cho TN sửa được** (chỉ khi còn ở trạng thái phù hợp): số lượng thực xuất, giá chốt, lý do chậm.

**Hành động**: giống các nút ở màn A (duyệt/từ chối/huỷ) áp dụng cho đúng 1 dòng này; xoá dòng (chỉ
khi dòng còn đang mở, chưa được xử lý).

### Màn hình D — "Phiếu xuất kho" (list, dành cho TN/Kho/Kế toán/Giám sát xem)

**Hiển thị**: danh sách phiếu xuất kho. Mỗi phiếu hiện: mã phiếu, mã đơn hàng (hoặc placeholder nếu
TN chưa nhập mã thật), mã MISA, mã vận đơn, người tạo, người nhận hàng (KTV), ngày tạo, số dòng gộp
trong phiếu, số tiền cần chuyển + trạng thái chuyển tiền (nếu có), trạng thái chính (8 trạng thái mục
4.2, có màu phân biệt).

**Bộ lọc**: trạng thái, người nhận hàng (KTV).

**Hành động chính**: "+ Tạo phiếu xuất kho" (chỉ TN) — mở modal tạo (mục E). Bấm vào 1 phiếu → mở
modal chi tiết (mục F).

### Màn hình E — Modal "Tạo phiếu xuất kho" (chỉ TN)

**Bước 1**: chọn 1 KTV nhận hàng (bắt buộc, quyết định toàn bộ các dòng sẽ được chọn ở bước 2 chỉ có
thể thuộc đúng KTV này).

**Bước 2**: chọn 1 hoặc nhiều dòng đơn hàng đã "TN đã duyệt" và CHƯA thuộc phiếu xuất kho nào, thuộc
đúng KTV đã chọn (danh sách chọn có ô tìm kiếm).

**Thông tin tuỳ chọn khi tạo**:
- Ghi chú
- Số tiền cần KTV chuyển khoản trước (tuỳ chọn — có thể bỏ trống, đặt sau)
- **Không cần nhập "Mã đơn hàng" lúc này** — trường này để trống, hệ thống tự điền tạm, TN nhập mã
  thật sau (xem mục F)

### Màn hình F — Modal "Chi tiết phiếu xuất kho"

**Hiển thị**: toàn bộ thông tin phiếu (mục 3.2), danh sách các dòng đơn hàng gộp trong phiếu (đầy đủ
thông tin từng dòng, có cảnh báo dòng nào "quá hạn lý do chậm"), lịch sử xử lý phiếu.

**Các ô nhập xuất hiện CÓ ĐIỀU KIỆN theo đúng người/đúng bước**:
- TN, khi phiếu đang "Đang tạo phiếu": ô nhập "Mã đơn hàng thật" + nút lưu (bắt buộc điền trước khi
  gửi kế toán được)
- Kế toán, khi phiếu đang "Chờ kế toán": ô nhập "Mã MISA" + nút lưu (bắt buộc điền trước khi "chốt
  xong đơn xuất" được)
- Kho, khi chuyển sang bước "Đang gửi KTV": ô nhập "Mã vận đơn" (tuỳ chọn, tách riêng khỏi ô ghi chú
  chung) + ô ghi chú
- Đúng người nhận hàng (KTV), khi phiếu đang "Đang gửi KTV": ô tải lên ảnh biên bản giao nhận (tuỳ
  chọn, không bắt buộc phải có trước khi xác nhận nhận hàng) — ảnh lưu lên Google Drive, hệ thống chỉ
  giữ lại đường link xem
- Khu vực "chuyển tiền" (nếu phiếu có khai báo số tiền cần chuyển): KTV đính link/ảnh bằng chứng đã
  chuyển khoản; TN duyệt lại bằng chứng đó

**Các nút hành động chuyển trạng thái** (hiện/ẩn theo đúng vai trò + đúng bước hiện tại, theo state
machine mục 4.2): Gửi kế toán, Kế toán huỷ, Chốt xong đơn xuất, Gửi KTV / Hàng trừ kho, Kho đã kết
thúc, **Xác nhận đã nhận hàng — CHỈ hiện cho đúng người nhận hàng (Admin có thể xác nhận thay nhưng
nên là nút phụ, không lộ ra như nút chính để tránh nhầm lẫn)**.

### Màn hình G — "Thiếu linh kiện"

**Hiển thị dạng thẻ/card, mỗi ticket 1 khối**, thông tin cần thấy ngay không phải mở thêm màn khác:
mã ticket, mã + tên linh kiện đang thiếu, loại đơn (mua/công nợ), người nhận hàng (KTV nào đang chờ),
lý do chậm gốc, ngày báo thiếu, ngày dự kiến có hàng (nếu đã có), trạng thái (màu phân biệt theo 6
trạng thái mục 4.3).

**Bộ lọc**: trạng thái (mặc định Kho vào sẽ thấy ngay hàng đợi "Chờ kho xử lý").

**Hành động** (chọn 1 hoặc nhiều ticket xử lý hàng loạt được, trừ bước cần giải trình):
- Kho: "Kho đã tiếp nhận" (mở form nhỏ bắt nhập lý do thiếu hàng thật + ngày dự kiến có hàng, bắt
  buộc), "Kho xác nhận hàng đã về", "Kho từ chối sai thông tin"
- TN: "Đã kết thúc" (chỉ khi đã ở bước "hàng đã về")
- Người tạo ticket (hoặc Kho): "Đã huỷ bỏ" ở bất kỳ bước nào chưa đóng

### Màn hình H — "Đơn trả hàng"

**Hiển thị**: danh sách các dòng đơn hàng loại trả hàng — mã đơn, mã+tên linh kiện, số lượng, người
tạo, ngày tạo, trạng thái (7 bước mục 4.4, có màu phân biệt).

**Bộ lọc**: trạng thái.

**Hành động** (chọn nhiều dòng xử lý hàng loạt được với Duyệt/Từ chối vì 2 hành động này không cần
nhập gì thêm):
- Người phụ trách đúng bước hiện tại (Kế toán/Kho/QC/TN theo đúng thứ tự): Duyệt, Từ chối
- Kế toán/Kho: "Đẩy lùi 1 bước" (mở form nhỏ bắt nhập lý do, bắt buộc)
- Người tạo/TN: Huỷ

### Màn hình I — "Báo cáo"

Nội dung hiển thị tự đổi theo vai trò người xem, không cần 2 màn riêng:

- **Với KTV/Vệ tinh** (chỉ xem số liệu của chính mình): hiển thị dạng các thẻ số liệu tổng hợp, chia
  3 nhóm — "Đơn hàng" (số đơn, số lượng đề xuất/đã đặt, số bị từ chối, số được duyệt, số thực duyệt),
  "Tiền" (tổng tiền thực tế, tổng tiền đang chờ chuyển, tổng tiền đặt mua ước tính), "Xuất kho" (số
  đang chờ kế toán, số đang chờ kho gửi, số đã gửi, số đã xác nhận nhận hàng).
- **Với Giám sát/TN/Kho/Kế toán** (xem theo phạm vi nhiều KTV mình phụ trách): hiển thị dạng BẢNG,
  mỗi dòng = 1 KTV, đủ 12 cột số liệu như trên (chia theo 3 nhóm), có 1 dòng "Tổng cộng" ở cuối. Có ô
  tìm kiếm theo tên/email KTV trong phạm vi đang xem. Sắp xếp mặc định: KTV có nhiều việc tồn đọng
  nhất lên đầu.
- **Bấm vào bất kỳ con số nào** phải nhảy thẳng sang đúng màn hình danh sách tương ứng (Đơn của tôi /
  Phiếu xuất kho) kèm sẵn bộ lọc trạng thái + lọc theo đúng KTV đó — không bắt người dùng phải tự lọc
  lại thủ công.

Toàn bộ số liệu ở màn Báo cáo loại trừ các dòng "Đã huỷ" và loại trừ toàn bộ luồng trả hàng (trả hàng
có báo cáo riêng nếu cần, hiện chưa có).

## 6. Các hành vi/chức năng UX mong muốn áp dụng xuyên suốt module

1. **Thanh tóm tắt "việc cần xử lý"** ở đầu module — mỗi người xem thấy ngay các con số việc đang chờ
   MÌNH xử lý (không phải toàn hệ thống), bấm vào 1 con số nhảy thẳng tới đúng danh sách đã lọc sẵn.
2. **Xử lý hàng loạt (bulk action)** — được chọn nhiều dòng/ticket/phiếu cùng lúc và áp dụng 1 hành
   động chung, hệ thống xử lý từng dòng độc lập và báo cáo rõ dòng nào thành công/thất bại kèm lý do,
   không phải "được ăn cả ngã về không".
3. **Không dùng modal xác nhận thừa cho hành động không cần nhập gì** (vd Duyệt) — bấm là chạy luôn;
   chỉ hiện form nhập khi hành động thực sự cần thông tin (lý do từ chối/huỷ/đẩy lùi/giải trình).
4. **Yêu cầu lý do khi huỷ đơn** — nhập tự do, không dùng lại danh mục lý do nghiệp vụ khác.
5. **Phân biệt màu/trạng thái trực quan**: đã huỷ/từ chối gạch ngang + màu đỏ nhạt; đang chờ duyệt
   màu cam; đã duyệt/hoàn thành màu xanh — áp dụng nhất quán cho mọi màn danh sách.
6. **Gợi ý nhập liệu nhanh** ở màn tạo đơn: chọn nhanh linh kiện hay dùng, 3 nút loại đề xuất phổ
   biến, kế thừa loại đề xuất từ dòng trước khi thêm dòng mới, cảnh báo mềm khi nhập mã case.
7. **Nhập liệu hàng loạt qua Excel** cho khâu tạo đơn (dành cho TN/Giám sát), có bước xem trước +
   báo lỗi rõ ràng theo từng dòng trước khi ghi thật vào hệ thống.
8. **Modal chi tiết đủ rộng, không gò bó** — với nhiều cột dữ liệu (đơn hàng, phiếu xuất kho) cần đủ
   không gian để đọc thoải mái, không phải cuộn ngang.
9. **Khu vực phụ trách (chỉ áp dụng cho TN/Kho/Kế toán)**: Admin có thể gán 1 người TN/Kho/Kế toán
   theo dõi 1 hoặc nhiều Giám sát cụ thể — khi đó "việc cần xử lý" (thanh tóm tắt + báo cáo) của
   người đó CHỈ tính đơn thuộc các Giám sát được gán, còn nếu chưa được Admin gán gì thì mặc định
   thấy toàn hệ thống. Nếu người này vẫn chủ động tìm và xử lý 1 đơn ngoài phạm vi đang gán, hệ thống
   tự động mở rộng phạm vi phụ trách của họ thêm Giám sát đó (không cần Admin phải cấu hình lại tay).
   Việc này KHÔNG giới hạn khả năng tìm kiếm/xem — mọi người trong 4 vai trò TN/Kho/Kế toán/Giám sát
   luôn tìm kiếm được toàn bộ dữ liệu, khu vực phụ trách chỉ ảnh hưởng đến "con số việc cần làm" mặc
   định hiển thị cho họ.
10. **Ưu tiên thiết kế cho điện thoại** — người dùng hiện trường (KTV) chủ yếu thao tác trên điện
    thoại; các nút hành động chính và tổng số liệu quan trọng (vd tổng tiền, nút submit) nên luôn dễ
    thấy dù nội dung có cuộn dài.
