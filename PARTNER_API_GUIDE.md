# API tra cứu thông tin case bảo hành (dành cho đối tác "Đặt mua linh kiện")

Tài liệu này mô tả điểm nối API giữa hệ CRM/DVBH nội bộ (bên cung cấp — gọi tắt "hệ DVBH") và hệ
thống độc lập "Đặt mua linh kiện" (`linh-kien-app`). Mục 1–7 mô tả `GET /api/partner/case-lookup`
(tra cứu 1 case theo ID). Mục 8 mô tả 2 endpoint **ghi** mới thêm 2026-08-28: `POST /sync/ktv` và
`POST /sync/linh-kien` — dùng cho `linh-kien-app` đồng bộ danh bạ KTV/danh mục linh kiện của nó
(nguồn sự thật cho 2 danh mục này từ sau khi tách hệ) ngược về DVBH.

Mục đích của `case-lookup`: KTV bên đối tác nhập mã ID case bảo hành, hệ đối tác gọi API này để lấy
thông tin gốc của case đó, rồi tự đối chiếu/phân quyền (ví dụ: kiểm tra case đó có đúng do KTV này
phụ trách hay không) trước khi hiển thị cho người dùng cuối.

Mục 9 mô tả tích hợp **2 chiều** mới (thêm 2026-09-11) với hệ độc lập "Giải trình vi phạm"
(`vipham.dichvu3t.workers.dev` — **chưa xây dựng tại thời điểm viết tài liệu này**, mục 9 là hợp
đồng API để đội xây hệ đó triển khai đúng): DVBH chủ động báo sang khi có ca nghi ngờ vi phạm mới
(chiều 1), và hệ đó gọi ngược `POST /sync/giai-trinh-vi-pham` để trả kết quả giải trình về (chiều 2,
cùng dạng "ghi" như mục 8).

**Quan trọng — mô hình phân quyền**: endpoint này KHÔNG lọc dữ liệu theo đối tác hay theo KTV. Bất
kỳ request nào có API key hợp lệ đều có thể tra cứu **bất kỳ ID case nào** trong hệ thống. Toàn bộ
việc kiểm tra "người gọi có được phép xem case này không" là trách nhiệm của **hệ thống đối tác**,
thực hiện SAU KHI nhận response. Vì vậy:
- API key phải được giữ bí mật tuyệt đối ở phía server đối tác — **không bao giờ** đưa vào code
  chạy trên trình duyệt/app client, không log ra nơi không kiểm soát được.
- Hệ đối tác phải tự chịu trách nhiệm không hiển thị thông tin case cho người dùng không có quyền
  xem case đó.

---

## 1. Thông tin kết nối

| | |
|---|---|
| Base URL | `https://dvbh.dichvu3t.workers.dev` |
| Endpoint | `GET /api/partner/case-lookup` |
| Giao thức | HTTPS bắt buộc |
| Xác thực | Header `X-API-Key: <key được cấp riêng>` |

API key được cấp riêng cho từng đối tác, có thể thu hồi độc lập. Liên hệ bên vận hành hệ DVBH để
được cấp key (không tự tạo, không dùng chung key với hệ thống khác).

## 2. Request

```
GET /api/partner/case-lookup?id=<ma_case>
X-API-Key: <api_key_cua_doi_tac>
```

| Tham số | Bắt buộc | Mô tả |
|---|---|---|
| `id` (query string) | Có | Mã case cần tra cứu (mã ID gốc từ CRM, ví dụ `CASE-2026-00123`). Case-sensitive, so khớp chính xác. |
| Header `X-API-Key` | Có | API key được cấp. Thiếu hoặc sai key → lỗi 401 (xem mục 4). |

Nếu thiếu tham số `id` hoặc `id` rỗng, API trả về **thành công** với `found: false` (không phải lỗi
400) — xem mục 3.

## 3. Response

Content-Type: `application/json`. HTTP status luôn là `200` khi request hợp lệ về mặt xác thực,
kể cả khi không tìm thấy case (dùng field `found` để phân biệt, KHÔNG dựa vào HTTP status cho
trường hợp không tìm thấy).

### 3.1. Không tìm thấy case

```json
{ "found": false, "preview": null, "giaiTrinh": [] }
```

Xảy ra khi: `id` rỗng/thiếu, hoặc không có case nào khớp `id` trong hệ thống. Hai trường hợp này
**trả về response giống hệt nhau** để không lộ thông tin case nào tồn tại hay không — hệ đối tác
không nên cố phân biệt 2 case này.

### 3.2. Tìm thấy case

```json
{
  "found": true,
  "giaiTrinh": [
    { "case_id": "1324863", "ly_do_cham": "Thieu linh kien", "noi_dung": "Cho hang ve",
      "ngay_giai_trinh": "2026-08-21 09:00:00" }
  ],
  "preview": {
    "ky_thuat_vien": "Nguyen Van A",
    "khach_hang": "Tran Thi B",
    "seri_san_pham": "SN123456789",
    "khu_vuc": "Mien Bac",
    "tinh": "Ha Noi",
    "quan_huyen": "Cau Giay",
    "hang": "Samsung",
    "san_pham_bao_hanh": "Tu lanh Inverter",
    "tien_do_hoan_thanh": "Dang xu ly",
    "mo_ta_loi": "May khong lam lanh",
    "nhom_san_pham": "Tu lanh",
    "nhom_yeu_cau": "Bao hanh",
    "loai_yeu_cau": "Sua chua",
    "hinh_thuc_bao_hanh": "Tai nha",
    "ngay_mua": "2025-03-10",
    "thoi_gian_cskh_tiep_nhan": "2026-08-20 09:15:00",
    "thoi_gian_hen_xu_ly": "2026-08-21 14:00:00",
    "thoi_gian_hoan_thanh": null,
    "doi_tac": "Ten doi tac ghi nhan case",
    "link_crm": "https://crm.example.com/case/123",
    "noi_dung_xu_ly": "Da kiem tra gas, can thay linh kien X",
    "luu_y_loi_linh_kien": "Block lam lanh",
    "cach_thuc_xu_ly": "Sua tai cho",
    "nganh": "Dien lanh",
    "loai_nganh": "Gia dung",
    "nhom_kh": "Ca nhan",
    "dt_san_pham": 12500000,
    "dt_linh_kien": 350000,
    "dt_dich_vu": 200000,
    "ly_do_qua_han": null,
    "ngay_import": "2026-08-19 08:02:11",
    "ngay_cap_nhat_gan_nhat": "2026-08-21 07:06:00",
    "dung_han": "Dung han",
    "xu_ly_24h_bucket": "Duoi 24h",
    "ly_do_huy": null,
    "link_hinh_anh": ["https://s3.example.com/anh1.jpg", "https://s3.example.com/anh2.jpg"]
  }
}
```

### 3.3. Trường `giaiTrinh` (thêm 2026-09-07)

Mảng lịch sử giải trình chậm trễ của case (bảng `giai_trinh` nội bộ), sắp xếp mới nhất trước
(`ngay_giai_trinh DESC`). Mảng rỗng `[]` nếu case chưa từng có giải trình nào — khác `preview`
(luôn `null` khi không tìm thấy case), field này luôn là mảng kể cả khi không tìm thấy case (`[]`).

| Field | Kiểu | Ý nghĩa |
|---|---|---|
| `case_id` | string | ID case (trùng `id` truy vấn) |
| `ly_do_cham` | string | Lý do chậm trễ đã chọn |
| `noi_dung` | string, có thể null | Nội dung giải trình chi tiết |
| `ngay_giai_trinh` | string | Thời điểm giải trình, giờ VN dạng `YYYY-MM-DD HH:MM:SS` (cùng quy ước với các field thời gian khác — xem lưu ý cuối mục 3.3.1) |

### 3.3.1. Danh sách field trong `preview`

| Field | Kiểu | Có thể null? | Ý nghĩa |
|---|---|---|---|
| `ky_thuat_vien` | string | Có | Tên KTV phụ trách case |
| `khach_hang` | string | Có | Tên khách hàng |
| `seri_san_pham` | string | Có | Số seri sản phẩm |
| `khu_vuc` | string | Có | Khu vực (miền) |
| `tinh` | string | Có | Tỉnh/thành phố |
| `quan_huyen` | string | Có | Quận/huyện |
| `hang` | string | Có | Hãng sản phẩm |
| `san_pham_bao_hanh` | string | Có | Tên/loại sản phẩm bảo hành |
| `tien_do_hoan_thanh` | string | Có | Trạng thái tiến độ hiện tại của case (chuỗi mô tả, không phải enum cố định — không nên hard-code so khớp giá trị) |
| `mo_ta_loi` | string | Có | Mô tả lỗi khách hàng báo |
| `nhom_san_pham` | string | Có | Nhóm sản phẩm |
| `nhom_yeu_cau` | string | Có | Nhóm yêu cầu |
| `loai_yeu_cau` | string | Có | Loại yêu cầu |
| `hinh_thuc_bao_hanh` | string | Có | Hình thức bảo hành |
| `ngay_mua` | string | Có | Ngày mua sản phẩm |
| `thoi_gian_cskh_tiep_nhan` | string | Có | Thời điểm CSKH tiếp nhận case |
| `thoi_gian_hen_xu_ly` | string | Có | Thời điểm hẹn xử lý |
| `thoi_gian_hoan_thanh` | string | Có | Thời điểm hoàn thành — `null` nếu case chưa đóng |
| `doi_tac` | string | Có | Tên đối tác ghi nhận case gốc (đối tác bán hàng/lắp đặt, không phải đối tác gọi API này) |
| `link_crm` | string | Có | Đường link case gốc trên CRM nội bộ |
| `noi_dung_xu_ly` | string | Có | Nội dung KTV đã ghi nhận khi xử lý |
| `luu_y_loi_linh_kien` | string | Có | Ghi chú lỗi linh kiện liên quan |
| `cach_thuc_xu_ly` | string | Có | Cách thức xử lý case |
| `nganh` | string | Có | Ngành hàng |
| `loai_nganh` | string | Có | Loại ngành hàng |
| `nhom_kh` | string | Có | Nhóm khách hàng |
| `dt_san_pham` | number | Có | Định giá/giá trị sản phẩm (đơn vị VND) |
| `dt_linh_kien` | number | Có | Định giá/giá trị linh kiện (đơn vị VND) |
| `dt_dich_vu` | number | Có | Định giá/giá trị dịch vụ (đơn vị VND) |
| `ly_do_qua_han` | string | Có | Lý do case quá hạn (nếu có) |
| `ngay_import` | string | Có | Thời điểm case này được import vào hệ DVBH (thêm 2026-09-11) |
| `ngay_cap_nhat_gan_nhat` | string | Có | Thời điểm case được cập nhật gần nhất (thêm 2026-09-11) |
| `dung_han` | string | Có | Trạng thái đúng/trễ hạn xử lý (chuỗi mô tả, không phải enum cố định — thêm 2026-09-11) |
| `xu_ly_24h_bucket` | string | Có | Nhóm thời gian xử lý theo mốc 24h (chuỗi mô tả — thêm 2026-09-11) |
| `ly_do_huy` | string | Có | Lý do hủy case (chỉ có giá trị nếu case đã bị hủy — thêm 2026-09-11) |
| `link_hinh_anh` | array of string | Không (luôn là mảng, có thể rỗng `[]`) | Danh sách URL ảnh báo cáo công việc do KTV upload, đã lọc trùng và chuẩn hóa (thêm 2026-09-11) |

**Lưu ý về các field thời gian** (`ngay_mua`, `thoi_gian_cskh_tiep_nhan`, `thoi_gian_hen_xu_ly`,
`thoi_gian_hoan_thanh`, `ngay_import`, `ngay_cap_nhat_gan_nhat`): đây là chuỗi giờ **địa phương Việt
Nam (UTC+7)** dạng text
(`YYYY-MM-DD` hoặc `YYYY-MM-DD HH:MM:SS`), **không phải** UTC/ISO-8601 có hậu tố `Z`. Không được tự
ý cộng/trừ offset timezone khi parse — parse trực tiếp như giờ VN.

## 4. Mã lỗi

| HTTP status | `error` | Ý nghĩa | Hành động phía đối tác |
|---|---|---|---|
| 401 | `MISSING_API_KEY` | Thiếu header `X-API-Key` | Kiểm tra lại cấu hình gửi header |
| 401 | `INVALID_API_KEY` | Key sai hoặc đã bị thu hồi/vô hiệu hóa | Liên hệ bên vận hành để cấp lại/kiểm tra trạng thái key — **không retry liên tục**, key sai sẽ luôn sai |
| 429 | `TOO_MANY_REQUESTS_IP` | Vượt giới hạn 60 request/phút tính theo địa chỉ IP gọi đến | Giãn tần suất gọi, xem mục 5 |
| 429 | `TOO_MANY_REQUESTS_KEY` | Vượt giới hạn 200 request/phút tính theo API key | Giãn tần suất gọi, xem mục 5 |

Response lỗi có dạng `{ "error": "<MA_LOI>" }`. Không có case "case tồn tại nhưng không có quyền
xem" — như đã nêu ở mục 3.1, mọi trường hợp không hợp lệ về ID đều trả `found: false` với HTTP 200,
không phải lỗi.

## 5. Giới hạn tần suất (rate limit)

Có 2 lớp giới hạn độc lập, áp dụng đồng thời:

1. **Theo IP nguồn**: tối đa 60 request/phút cho mỗi địa chỉ IP gọi đến (tính theo cửa sổ trượt 60
   giây). Nếu nhiều dịch vụ/đối tác khác cùng đi qua 1 IP (NAT/proxy dùng chung), giới hạn này tính
   gộp.
2. **Theo API key**: tối đa 200 request/phút cho mỗi key, không phụ thuộc IP gọi từ đâu.

**Khuyến nghị thiết kế phía đối tác**:
- Nếu tra cứu theo hành vi gõ phím của người dùng (KTV gõ mã case), nên **debounce tối thiểu
  300–500ms** trước khi gọi API, tránh gọi trên từng ký tự.
- Khi nhận `429`, dùng backoff (chờ vài giây rồi thử lại), không retry ngay lập tức trong vòng lặp.
- Đây là API tra cứu **từng bản ghi theo thời gian thực**, không phải API để đồng bộ/export hàng
  loạt dữ liệu. Nếu có nhu cầu lấy số lượng lớn case định kỳ, cần trao đổi riêng — không dùng
  endpoint này để quét toàn bộ ID.

## 6. Ví dụ gọi API

```bash
curl -s "https://dvbh.dichvu3t.workers.dev/api/partner/case-lookup?id=CASE-2026-00123" \
  -H "X-API-Key: <api_key_cua_doi_tac>"
```

Response mẫu (không tìm thấy):
```json
{ "found": false, "preview": null }
```

## 7. Lưu ý bảo mật khi tích hợp

- Gọi API này **chỉ từ server phía đối tác** (backend-to-backend), không gọi trực tiếp từ trình
  duyệt/app của người dùng cuối — API key sẽ lộ nếu nhúng vào client.
- Không log toàn bộ response ra nơi không kiểm soát được truy cập — response chứa dữ liệu khách
  hàng và định giá (`dt_san_pham`, `dt_linh_kien`, `dt_dich_vu`).
- Nếu nghi ngờ API key bị lộ, báo ngay cho bên vận hành hệ DVBH để thu hồi/cấp lại key — không tự
  ý dùng tiếp trong lúc chờ xử lý.
- Endpoint chỉ hỗ trợ tra cứu 1 case theo đúng 1 ID mỗi lần gọi — không hỗ trợ tìm kiếm mờ, wildcard,
  hay trả danh sách nhiều case.

## 8. Đồng bộ danh bạ KTV / danh mục linh kiện (ghi — chỉ dành cho `linh-kien-app`)

Khác với `case-lookup` (chỉ đọc, dùng chung cho nhiều đối tác), 2 endpoint dưới đây **ghi đè dữ
liệu** và chỉ dành riêng cho hệ "Đặt mua linh kiện" — dùng key riêng, không dùng chung key với
`case-lookup`. Cùng auth (`X-API-Key`) và cùng giới hạn IP 60 req/phút như mục 5.1, không có giới
hạn riêng theo key (tần suất gọi thấp — cron 1h/lần + bấm tay).

### 8.1. `POST /api/partner/sync/ktv`

```
POST /api/partner/sync/ktv
X-API-Key: <api_key_rieng_cho_dong_bo>
Content-Type: application/json

{ "rows": [
  { "ma_ktv": "KTV001", "ten_hien_thi": "Nguyễn Văn A", "sdt": "0912345678", "ghi_chu": null,
    "gmail": "a@gmail.com", "vai_tro_ktv": "KTV", "giam_sat_quan_ly": "gs@gmail.com",
    "email_dang_nhap": "a@gmail.com" }
] }
```

Tối đa **200 dòng/lần gọi** (vượt quá → `400 { "error": "TOO_MANY_ROWS" }`). Chỉ `ma_ktv` bắt buộc.
Upsert theo `ma_ktv`. `vai_tro_ktv` nếu có phải là 1 trong `KTV`, `CTV`, `Tram`, `Ve tinh`. Response
thành công: `{ "upserted": <so dong ghi thanh cong>, "errors": [<mo ta dong loi, neu co>] }`.

### 8.2. `POST /api/partner/sync/linh-kien`

```
POST /api/partner/sync/linh-kien
X-API-Key: <api_key_rieng_cho_dong_bo>
Content-Type: application/json

{ "rows": [
  { "ma_linh_kien": "LK001", "ten_linh_kien": "Block máy lạnh 1HP", "gia_ban": 1200000,
    "gia_tham_chieu": 1150000, "don_vi": "Cái", "ghi_chu": null, "anh_demo": "https://...",
    "bat_tat": true, "dac_thu": false, "chi_sua_chua": false }
] }
```

Tối đa **200 dòng/lần gọi**. `ma_linh_kien`/`ten_linh_kien` bắt buộc (thiếu 1 trong 2 → dòng đó bị
bỏ qua, ghi vào `errors`, không chặn các dòng còn lại). Upsert theo `ma_linh_kien`, **ghi đè toàn bộ
field được gửi** (khác `/sync/ktv` — không giữ giá trị cũ cho field nào). Response:
`{ "upserted": <so dong ghi thanh cong>, "errors": [...] }`.

## 9. Giải trình vi phạm — 2 chiều (dành riêng cho `vipham.dichvu3t.workers.dev`)

Bối cảnh: mỗi khi CSKH khảo sát điện thoại và ghi nhận **nghi ngờ vi phạm** cho 1 case (KTV làm sai
SLA — trễ 120 phút / quá 24h / lỡ kế hoạch / khách hẹn lại), DVBH cần cho KTV cơ hội tự giải trình
**trước khi** QC ra quyết định cuối (chốt/bỏ vi phạm cấp 2). Việc giải trình này diễn ra ở 1 hệ độc
lập (`vipham.dichvu3t.workers.dev`, do đội khác xây dựng, tương tự mô hình tách hệ "Đặt mua linh
kiện" đã làm trước đây). Có 2 chiều gọi API **độc lập nhau**, không phải request/response của cùng
1 lần gọi:

- **Chiều 1 (mục 9.1)**: DVBH chủ động gọi SANG hệ vipham, thông báo "có ca X vừa bị nghi ngờ vi
  phạm Y, cần KTV giải trình". DVBH là bên gọi (client), hệ vipham là bên nhận (server) — **đội xây
  hệ vipham cần tự implement endpoint nhận này**.
- **Chiều 2 (mục 9.2)**: sau khi KTV giải trình xong bên hệ vipham, hệ đó gọi VÀO DVBH để lưu kết
  quả — giống hệt mô hình `/sync/ktv`/`/sync/linh-kien` ở mục 8 (DVBH là server, hệ vipham là
  client, xác thực bằng `X-API-Key` riêng).

Cả 2 endpoint (nhận ở mục 9.1, gửi ở mục 9.2) hiện đều xử lý theo đơn vị **1 lỗi cụ thể của 1 case**
(`vi_pham_id`), không phải theo case — nếu 1 case bị nghi ngờ cùng lúc nhiều loại lỗi (ví dụ vừa trễ
120 phút vừa lỡ kế hoạch), mỗi lỗi sẽ có 1 lượt thông báo/giải trình riêng, `vi_pham_id` khác nhau.

### 9.1. DVBH gọi SANG hệ vipham (thông báo có ca cần giải trình)

**Đội xây hệ vipham cần tự dựng 1 endpoint nhận đúng hợp đồng dưới đây** — DVBH sẽ gọi tới:

```
POST <VIPHAM_APP_URL>/api/nhan-vi-pham
X-API-Key: <VIPHAM_APP_API_KEY — do team vipham cấp cho DVBH, DVBH cấu hình làm secret>
Content-Type: application/json

{
  "vi_pham_id": "L-000123",
  "case_id": "1324863",
  "loai_loi": "Loi 120 phut",
  "ket_qua_cap_1": "Loi khong lien he",
  "khach_hang": "Tran Thi B",
  "khu_vuc": "Mien Bac",
  "ky_thuat_vien": "Nguyen Van A",
  "seri_san_pham": "SN123456789",
  "ngay_ghi_nhan": "2026-09-11 09:15:23",
  "nguoi_ghi_nhan": "cskh@dichvu3t.vn"
}
```

| Field | Kiểu | Ý nghĩa |
|---|---|---|
| `vi_pham_id` | string | ID duy nhất của lỗi này (dùng để gửi giải trình về ở mục 9.2 — **bắt buộc lưu lại**, đây là khoá nối 2 chiều) |
| `case_id` | string | ID case bảo hành |
| `loai_loi` | string | 1 trong: `Loi 120 phut`, `Hen qua 24h`, `Loi lo ke hoach`, `KH hen lai` |
| `ket_qua_cap_1` | string, có thể null | Kết luận cấp 1 của CSKH — 1 trong `Loi khong lien he`, `Loi sai bao cao`, `Loi khac` (không bao giờ là `Khong loi`/null trong lời gọi này — DVBH chỉ báo sang khi CSKH đã kết luận CÓ nghi ngờ) |
| `khach_hang` | string, có thể null | Tên khách hàng |
| `khu_vuc` | string, có thể null | Khu vực |
| `ky_thuat_vien` | string, có thể null | Tên KTV phụ trách case (đối tượng cần giải trình) |
| `seri_san_pham` | string, có thể null | Số seri sản phẩm |
| `ngay_ghi_nhan` | string | Giờ VN địa phương (UTC+7) dạng `YYYY-MM-DD HH:MM:SS`, **không phải** UTC/ISO-8601 — cùng quy ước với mục 3.3.1 |
| `nguoi_ghi_nhan` | string | Email CSKH đã ghi nhận |

**Cần thêm thông tin case đầy đủ (khách hàng/sản phẩm/lịch sử xử lý/ảnh báo cáo/...) để hiển thị màn
hình giải trình cho KTV?** Payload trên chỉ có 9 field tối thiểu. Đội vipham nên tự gọi
`GET /api/partner/case-lookup?id=<case_id>` (dùng đúng `case_id` nhận được ở trên, xem mục 1–3 phía
trên tài liệu này — cần 1 API key `case-lookup` riêng, xin cấp cùng lúc với key mục 9.3) ngay khi
KTV mở màn hình giải trình, thay vì DVBH nhồi thêm field vào payload thông báo 1 chiều này — endpoint
`case-lookup` vốn đã dùng chung cho nhiều hệ độc lập (`Đặt mua linh kiện` và giờ cả `vipham`) nên
không cần tạo thêm 1 hợp đồng riêng.

**Lưu ý quan trọng — đây là thông báo một chiều, không có cơ chế đảm bảo/thử lại:**
- DVBH gọi bất đồng bộ (`waitUntil`, không chặn response chính của CSKH), **không đọc/kiểm tra
  response trả về**, và **không retry** nếu request lỗi/timeout/hệ vipham đang down.
- Nếu hệ vipham bỏ lỡ 1 lượt gọi (downtime, lỗi mạng...), DVBH **sẽ không gọi lại** — không có hàng
  đợi, không có cơ chế "gửi lại các thông báo đã lỡ". Nếu cần đảm bảo không bỏ sót, đội vipham nên tự
  chủ động đối soát định kỳ (ví dụ tự hỏi lại DVBH qua endpoint tra cứu case nếu cần, hoặc yêu cầu bổ
  sung 1 API tra cứu riêng — trao đổi thêm với bên vận hành DVBH nếu cần).
- Vì vậy `<VIPHAM_APP_URL>/api/nhan-vi-pham` nên trả về nhanh (không cần xử lý nặng ngay lúc nhận,
  có thể nhận rồi xử lý nền phía vipham) — nhưng dù trả lỗi hay timeout, DVBH cũng không biết và
  không xử lý gì thêm.
- Trước khi `VIPHAM_APP_URL`/`VIPHAM_APP_API_KEY` được cấu hình phía DVBH (secret, xem mục 9.3),
  DVBH **không gọi gì cả** (tự động bỏ qua, không lỗi) — tức là chiều 1 hiện tại đang **tắt** cho
  tới khi đội vipham sẵn sàng nhận và báo lại thông tin URL/key.

### 9.2. Hệ vipham gọi VÀO DVBH (trả kết quả giải trình)

```
POST https://dvbh.dichvu3t.workers.dev/api/partner/sync/giai-trinh-vi-pham
X-API-Key: <api_key_rieng_cap_cho_vipham>
Content-Type: application/json

{ "rows": [
  { "vi_pham_id": "L-000123", "nguoi_giai_trinh": "Nguyen Van A",
    "ngay_giai_trinh": "2026-09-11", "noi_dung_giai_trinh": "Do khach yeu cau doi lich, da bao CSKH truoc",
    "ghi_chu": null,
    "anh_urls": ["https://vipham.dichvu3t.workers.dev/anh/abc.jpg", "https://vipham.dichvu3t.workers.dev/anh/def.jpg"] }
] }
```

| Field | Bắt buộc | Kiểu | Ý nghĩa |
|---|---|---|---|
| `vi_pham_id` | Có | string | ID lỗi đang giải trình — **phải trùng đúng** giá trị đã nhận ở mục 9.1 (khoá nối 2 chiều). Nếu ID không tồn tại trong DVBH, dòng đó bị từ chối riêng (`VI_PHAM_NOT_FOUND`, xem bảng response), không chặn các dòng khác |
| `nguoi_giai_trinh` | Không | string, có thể null | Tên/định danh KTV đã giải trình — DVBH lưu dạng chữ tự do, không đối chiếu với danh bạ KTV nội bộ |
| `ngay_giai_trinh` | Có | string | Ngày giải trình, khuyến nghị dạng `YYYY-MM-DD` (chỉ ngày, không cần giờ) |
| `noi_dung_giai_trinh` | Không | string, có thể null | Nội dung giải trình |
| `ghi_chu` | Không | string, có thể null | Ghi chú thêm |
| `anh_urls` | Không | mảng string | URL ảnh bằng chứng, **tối đa 5 phần tử** (thừa sẽ bị cắt bớt, không báo lỗi) |

**Quan trọng — ảnh bằng chứng**: DVBH **chỉ lưu chuỗi URL** nhận được, **không tải/lưu trữ ảnh**.
Hệ vipham phải tự lưu trữ ảnh ở nơi truy cập được **công khai và lâu dài** (URL này sẽ được hiển thị
trực tiếp dưới dạng link trong màn hình chi tiết case của DVBH — nếu URL hết hạn/bị xoá phía
vipham, DVBH sẽ chỉ hiển thị link chết, không có bản sao dự phòng nào).

Tối đa **200 dòng/lần gọi** (vượt quá → `400 { "error": "TOO_MANY_ROWS" }`).

**Response** (HTTP 200 nếu xác thực hợp lệ — lỗi được báo theo TỪNG dòng, không chặn cả batch):
```json
{ "results": [
  { "vi_pham_id": "L-000123", "ok": true },
  { "vi_pham_id": "L-999999", "ok": false, "error": "VI_PHAM_NOT_FOUND" }
] }
```

| `error` (trong `results[]`) | Ý nghĩa |
|---|---|
| `VI_PHAM_NOT_FOUND` | `vi_pham_id` không tồn tại trong DVBH — kiểm tra lại đã dùng đúng ID nhận được ở mục 9.1 chưa |
| `INVALID_ROW` | Thiếu `vi_pham_id` hoặc `ngay_giai_trinh` |

Mã lỗi ở mức toàn request (không phải từng dòng), giống mục 4:

| HTTP status | `error` | Ý nghĩa |
|---|---|---|
| 401 | `MISSING_API_KEY` | Thiếu header `X-API-Key` |
| 401 | `INVALID_API_KEY` | Key sai hoặc đã bị thu hồi |
| 400 | `INVALID_BODY` | `rows` không phải mảng |
| 400 | `TOO_MANY_ROWS` | Gửi quá 200 dòng/lần |
| 429 | `TOO_MANY_REQUESTS_IP` | Vượt 60 request/phút theo IP — xem mục 5 |

Ví dụ gọi:
```bash
curl -s -X POST "https://dvbh.dichvu3t.workers.dev/api/partner/sync/giai-trinh-vi-pham" \
  -H "X-API-Key: <api_key_rieng_cap_cho_vipham>" \
  -H "Content-Type: application/json" \
  -d '{"rows":[{"vi_pham_id":"L-000123","ngay_giai_trinh":"2026-09-11","noi_dung_giai_trinh":"Test"}]}'
```

### 9.3. Cấp API key — cần 2 key riêng biệt, 2 chiều khác nhau

Đây là điểm dễ nhầm lẫn nhất khi tích hợp — có **2 key khác nhau, do 2 bên cấp cho nhau**, không
dùng chung, không dùng lại key của mục 8 (`/sync/ktv`/`/sync/linh-kien`):

1. **Key DVBH dùng khi gọi SANG hệ vipham** (mục 9.1): do **đội vipham tạo và cấp cho DVBH**. Bên
   vận hành DVBH sẽ cấu hình giá trị này (cùng `VIPHAM_APP_URL`) làm secret nội bộ
   (`VIPHAM_APP_API_KEY`/`VIPHAM_APP_URL`) — đội vipham chỉ cần gửi 2 giá trị này qua kênh liên lạc
   an toàn (không qua chat/email thường), không cần thao tác gì trên DVBH.
2. **Key DVBH cấp CHO hệ vipham để gọi vào `/sync/giai-trinh-vi-pham`** (mục 9.2): liên hệ bên vận
   hành DVBH để được cấp (giống cách cấp key `case-lookup` ở mục 1) — đội vipham lưu bí mật phía
   server của mình, không nhúng vào client/app di động.
