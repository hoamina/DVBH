# API Giải trình tồn B2B — khoá PHẠM VI TOÀN BỘ

**ETX · Tài liệu kỹ thuật cho người dùng nội bộ** · Phiên bản 1.0 · 14/09/2026

Khoá phạm vi toàn bộ đọc được nhật ký giải trình tồn của **mọi đối tác B2B**, mỗi lần một đối tác.
Khoá này **không đưa cho đối tác** — khoá của đối tác chỉ đọc được đúng đơn vị của họ.

| | |
|---|---|
| **Địa chỉ gốc** | `https://api-doitac-b3u3aav3ja-as.a.run.app` |
| **Phiên bản API** | 1.0 |
| **Xác thực** | Header `X-Api-Key` |
| **Dữ liệu cập nhật** | Ngay khi ETX ghi giải trình (đo thực tế: 9 giây) |
| **Hạn lưu** | 60 ngày gần nhất |
| **Tốc độ** | 60 lần gọi mỗi phút |

Giữ khoá như mật khẩu: chỉ đặt trên máy chủ, không nhúng vào trang web hay bảng tính chia sẻ. Khoá
chỉ hiện một lần lúc cấp, ETX không lưu bản gốc nên không gửi lại được. Nghi lộ thì báo để thu hồi.

---

## 1. Hai đường dẫn

### `GET /v1/doi-tac` — danh sách đối tác đọc được

```bash
curl -H "X-Api-Key: $KHOA" "https://api-doitac-b3u3aav3ja-as.a.run.app/v1/doi-tac"
```

```json
{ "so_doi_tac": 59,
  "doi_tac": [ { "ma": "3T", "ten": "3T Nội bộ", "so_dong": 12,
                 "du_lieu_den": "2026-09-14T12:58:22+07:00" } ] }
```

`so_dong` là **tổng** số dòng nhật ký đang lưu của đối tác đó — tính cả dòng cũ hơn 60 ngày, vì
hạn 60 ngày chỉ áp lúc đọc. Đừng dùng nó để đoán số dòng một lượt gọi sẽ trả (đo 14/09: A041 có
`so_dong` 4.896 nhưng 30 ngày gần nhất chỉ 613 dòng). Nó chỉ dùng để **bỏ qua đối tác chưa có dòng
nào** (`so_dong` = 0 — đo 14/09 có 2 đối tác như vậy trên tổng 59).

### `GET /v1/giai-trinh-ton?doi_tac=<mã>` — nhật ký của một đối tác

```bash
curl -H "X-Api-Key: $KHOA" \
  "https://api-doitac-b3u3aav3ja-as.a.run.app/v1/giai-trinh-ton?doi_tac=A041&tu=2026-08-16&den=2026-09-14"
```

**`doi_tac` là bắt buộc.** Thiếu nó là lỗi `400 thieu_doi_tac`, không phải mặc định lấy tất cả.

API **không gộp** mọi đối tác vào một lượt trả: 60 ngày × 59 đối tác là hàng chục MB. Muốn lấy hết
thì lặp theo danh sách ở `/v1/doi-tac` (xem ví dụ mục 4).

---

## 2. Tham số

| Tham số | Mặc định | Ghi chú |
|---|---|---|
| `doi_tac` | — | **Bắt buộc.** Mã đối tác lấy từ `/v1/doi-tac`. Không chứa `/` hay `_`. |
| `tu`, `den` | 30 ngày gần nhất | `YYYY-MM-DD`. Mỗi lần tối đa 60 ngày. |
| `order_id` | — | Lọc một ca theo ID Lada hoặc ID truy xuất. |
| `so_dong` | 200 | 1–1000 dòng mỗi trang. |
| `tiep` | — | Con trỏ sang trang, lấy ở trường `tiep` của trang trước. |
| `dinh_dang` | `json` | `excel` để tải thẳng file .xlsx. |

Hỏi vắt qua hạn lưu 60 ngày thì `tu` bị kéo về sàn và phần trả về có `ghi_chu` nói rõ; hỏi **hẳn**
ra ngoài hạn thì báo lỗi `ngoai_han_luu` kèm ngày sớm nhất còn tra được.

---

## 3. Mã lỗi riêng của khoá toàn bộ

| HTTP | `loi.ma` | Khi nào | Cần làm |
|---|---|---|---|
| 400 | `thieu_doi_tac` | Không truyền `doi_tac`. | Thêm `doi_tac=<mã>`; danh sách mã ở `/v1/doi-tac`. |
| 400 | `tham_so_sai` | `doi_tac` quá 40 ký tự hoặc chứa `/`, `_`. | Dùng đúng mã lấy từ `/v1/doi-tac`. |
| 404 | `khong_co_doi_tac` | Không có mã đó, hoặc mã chưa có dữ liệu dựng sẵn. | Đối chiếu lại với `/v1/doi-tac`. |

Các mã lỗi còn lại (`thieu_khoa`, `khoa_khong_hop_le`, `khoa_da_thu_hoi`, `khoang_qua_dai`,
`ngoai_han_luu`, `tiep_khong_hop_le`, `du_lieu_da_doi`, `qua_toc_do`, `loi_he_thong`) giống hệt tài
liệu cho đối tác — xem `API_DOI_TAC_cho_doi_tac.md`, mục *Mã lỗi*. Cấu trúc mỗi dòng nhật ký cũng
lấy ở tài liệu đó, mục *Dữ liệu trả về*.

---

## 4. Lấy trọn nhật ký của tất cả đối tác

```python
import time, requests

GOC  = "https://api-doitac-b3u3aav3ja-as.a.run.app"
KHOA = "etxdt_..."                       # đặt ở biến môi trường, đừng viết thẳng vào mã
H    = {"X-Api-Key": KHOA}

def goi(duong, **ts):
    while True:
        r = requests.get(f"{GOC}{duong}", headers=H, params=ts, timeout=60)
        if r.status_code == 429:                       # quá tốc độ → chờ đúng số giây máy chủ bảo
            time.sleep(int(r.headers.get("Retry-After", "5")) + 1)
            continue
        r.raise_for_status()
        return r.json()

tat_ca = []
for dt in goi("/v1/doi-tac")["doi_tac"]:
    if not dt["so_dong"]:                              # đối tác không có dòng nào → bỏ qua
        continue
    tiep = None
    while True:
        ts = {"doi_tac": dt["ma"], "tu": "2026-08-16", "den": "2026-09-14", "so_dong": 1000}
        if tiep:
            ts["tiep"] = tiep
        b = goi("/v1/giai-trinh-ton", **ts)
        for d in b["dong"]:
            tat_ca.append({**d, "ma_doi_tac": dt["ma"], "ten_doi_tac": dt["ten"]})
        tiep = b.get("tiep")
        if not tiep:
            break

print(len(tat_ca), "dòng")
```

Hai điểm dễ vấp:
- **Sang trang phải giữ nguyên tham số.** Đổi `tu`/`den`/`order_id` giữa chừng, hoặc dữ liệu vừa
  được dựng lại, thì con trỏ hết hạn và API trả `409 du_lieu_da_doi` — bỏ `tiep`, lấy lại từ đầu.
- **Tốc độ tính theo khoá.** Lặp 59 đối tác × nhiều trang rất dễ chạm trần 60 lần/phút; cứ theo
  `Retry-After` như ví dụ là đủ, không cần tự đặt độ trễ.

---

## 5. Thông tin cá nhân

API **không** trả số điện thoại, số căn cước hay địa chỉ nhà của khách. Trường `ten_khach` là tên
điểm giao của đối tác (ví dụ *DMX Bình Tân*), không phải khách lẻ.

---

*Cấp khoá, thu hồi khoá hoặc báo lỗi: liên hệ đầu mối kỹ thuật của ETX.*
