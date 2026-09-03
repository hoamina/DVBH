# API tra cứu thông tin case bảo hành (dành cho đối tác "Đặt mua linh kiện")

Tài liệu này mô tả điểm nối API giữa hệ CRM/DVBH nội bộ (bên cung cấp — gọi tắt "hệ DVBH") và hệ
thống độc lập "Đặt mua linh kiện" (`linh-kien-app`). Mục 1–7 mô tả `GET /api/partner/case-lookup`
(tra cứu 1 case theo ID). Mục 8 mô tả 2 endpoint **ghi** mới thêm 2026-08-28: `POST /sync/ktv` và
`POST /sync/linh-kien` — dùng cho `linh-kien-app` đồng bộ danh bạ KTV/danh mục linh kiện của nó
(nguồn sự thật cho 2 danh mục này từ sau khi tách hệ) ngược về DVBH.

Mục đích của `case-lookup`: KTV bên đối tác nhập mã ID case bảo hành, hệ đối tác gọi API này để lấy
thông tin gốc của case đó, rồi tự đối chiếu/phân quyền (ví dụ: kiểm tra case đó có đúng do KTV này
phụ trách hay không) trước khi hiển thị cho người dùng cuối.

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
{ "found": false, "preview": null }
```

Xảy ra khi: `id` rỗng/thiếu, hoặc không có case nào khớp `id` trong hệ thống. Hai trường hợp này
**trả về response giống hệt nhau** để không lộ thông tin case nào tồn tại hay không — hệ đối tác
không nên cố phân biệt 2 case này.

### 3.2. Tìm thấy case

```json
{
  "found": true,
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
    "ly_do_qua_han": null
  }
}
```

### 3.3. Danh sách field trong `preview`

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

**Lưu ý về các field thời gian** (`ngay_mua`, `thoi_gian_cskh_tiep_nhan`, `thoi_gian_hen_xu_ly`,
`thoi_gian_hoan_thanh`): đây là chuỗi giờ **địa phương Việt Nam (UTC+7)** dạng text
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
