# Rà soát luồng quy trình & thông tin nhập liệu — Module Sửa chữa bảo hành

**Mục đích tài liệu này:** trình bày lại toàn bộ hiểu biết hiện tại của tôi về quy trình, theo đúng
thứ tự thao tác thực tế và đúng tên trường sẽ nhập, để bạn tự đối chiếu và chỉ ra chỗ nào còn sai —
**không phải** tài liệu kỹ thuật (schema/route ở `Ke-hoach-Trien-khai_Quan-ly-Sua-chua-Bao-hanh.md`,
**tôi chưa cập nhật file đó** vì còn vài điểm ở mục 13 dưới đây cần bạn chốt trước, tránh phải thiết
kế lại bảng 2 lần). Chỗ nào tôi đang **suy luận/giả định** đánh dấu 🟡.

**Bản này đã gộp toàn bộ góp ý vòng 2** (phân miền, kho chỉ nhận thùng, phân loại trong/ngoài bảo
hành, phiếu trả tách theo KTV, upload ảnh lên Drive, luồng trả xác...).

---

## 1. Các vai trò tham gia

| Vai trò | Cờ trong hệ thống | Việc chính trong luồng này |
|---|---|---|
| KTV / CTV / Trạm | `la_ktv_dvbh` / `la_ve_tinh` (đã có) | Tạo phiếu gửi hàng, thêm dòng linh kiện lỗi, xác nhận đã gửi, xác nhận nhận hàng trả |
| Kho / điều vận tiếp nhận | `la_kho` (đã có) | Tiếp nhận **thùng hàng vật lý** (không mở kiểm từng linh kiện), đóng gói phiếu trả theo miền mình phụ trách |
| Admin bảo hành | `la_admin_bh` (**mới**) | Phân loại từng dòng LK, xác nhận trong/ngoài bảo hành, xác nhận hoàn tất sau khi NV sửa xong, tạo phiếu trả theo KTV, xử lý trả xác |
| NV sửa chữa (SCVP) | `la_nv_sua_chua` (**mới**) | Chẩn đoán, đề xuất linh kiện, chụp ảnh báo cáo, cập nhật kết quả — **không tự đóng ticket**, luôn phải qua Admin bảo hành xác nhận |
| Kế toán | `la_ke_toan` (đã có) | Duyệt đối soát trước khi gửi trả |

---

## 2. Phân miền Nam / Bắc — áp dụng xuyên suốt cả module

- Mỗi **Giám sát (GS)** được gán 1 miền (`Nam` hoặc `Bắc`).
- **KTV/CTV/Trạm** thừa hưởng miền theo GS phụ trách mình (hệ thống đã có sẵn quan hệ 1-1 này ở
  `users.giam_sat_quan_ly` — không cần thêm bảng mới, chỉ cần gắn thêm "miền" cho GS).
- **Kho** và **Admin bảo hành** cũng được gán miền riêng (trực tiếp trên tài khoản từng người).
- Mặc định mỗi người chỉ thấy hàng đợi thuộc miền mình. Miền có thể **hỗ trợ chéo** khi cần — nhưng
  hàng của miền khác **chỉ hiện lên khi được đánh dấu "cần hỗ trợ"**, không hiện mặc định.
- 🟡 Tôi hiểu "cần hỗ trợ" là 1 cờ bật tay (ví dụ Admin bảo hành/Kho bên thiếu người bấm "Cần hỗ trợ
  miền khác" trên 1 phiếu/1 dòng cụ thể) — không phải tự động theo tải công việc. Đúng không?

---

## 3. Luồng tổng quát (đã cập nhật)

```
[KTV] Tạo phiếu gửi hàng (Nháp, thuộc miền theo GS của KTV)
      → thêm 1..N dòng linh kiện/sản phẩm lỗi vào phiếu
      → Xác nhận đã gửi xe (hệ thống hỏi lại "Ngày gửi xe", mặc định = lúc bấm, có thể sửa)
                    ↓
[Kho - đúng miền, hoặc miền khác nếu được đánh dấu cần hỗ trợ]
      Tiếp nhận THÙNG HÀNG vật lý — chỉ đối chiếu số kiện/thùng, KHÔNG mở kiểm từng linh kiện
      → lúc này thông tin vận chuyển ở header mới bị khoá lại
                    ↓ (từng dòng LK trong phiếu bắt đầu chạy trạng thái riêng)
[Admin bảo hành - đúng miền] Với từng dòng LK:
   a) Xác nhận Trong bảo hành / Ngoài bảo hành
      - Ngoài bảo hành → nhập thêm: thông tin mail phê duyệt + mã phê duyệt (nếu có)
   b) Chọn hướng xử lý: Sửa chữa (gán NV) / Đổi mới / Từ chối-Huỷ / Chuyển kho
                    ↓
[NV sửa chữa - đúng miền] (chỉ khi hướng xử lý = Sửa chữa) Chẩn đoán → 1 trong 4 kết quả
   ├─ Không lỗi     → trả nguyên trạng
   ├─ Sửa được      → đề xuất linh kiện + ảnh báo cáo → Admin BH duyệt + nhập mã MISA → sửa xong
   ├─ Đề xuất đổi mới → Admin BH duyệt riêng → chuyển hướng Đổi mới
   └─ Trả xác        → mở luôn 1 "Phiếu trả xác" (mục 9)
      NV KHÔNG tự đóng ticket — luôn nộp kết quả lên, chờ Admin bảo hành xác nhận hoàn tất.
                    ↓
[Đổi mới HOẶC Sửa chữa có thay linh kiện] → tự mở 1 "Phiếu trả xác" song song (mục 9)
                    ↓
[Admin bảo hành] Xác nhận hoàn tất xử lý dòng này
                    ↓
[Admin bảo hành] Gom các dòng đã xong của CÙNG 1 KTV thành 1 hoặc nhiều "Phiếu trả bảo hành"
      (1 KTV có thể có nhiều phiếu trả cùng lúc, tách theo cách Admin bảo hành phân loại hàng hoá)
                    ↓
[Kho] Đóng gói theo từng phiếu trả — nhập mã vận đơn
                    ↓
[Kế toán] Duyệt đối soát (đối chiếu mã MISA) → cho phép gửi
                    ↓
[KTV] Xác nhận nhận hàng trả → (không nhận được → mở khiếu nại vận chuyển)
```

---

## 4. Bước 1 — KTV tạo phiếu gửi hàng (header)

Không đổi so với bản trước — xem lại nhanh:

| Trường | Bắt buộc? | Nguồn |
|---|---|---|
| Ngày tạo | Tự động | Hệ thống |
| Ngày gửi xe (dự kiến) | Có | Nhập tay lúc tạo — **sẽ được hỏi lại ở bước xác nhận gửi, xem mục 6** |
| Hình thức gửi | Có | Chọn: Xe nội bộ / Giao vận ngoài |
| Mã xe/tài xế **hoặc** Đơn vị vận chuyển + Mã vận đơn | Tuỳ hình thức | Nhập tay |
| Ghi chú vận chuyển | Không | Nhập tay |

Miền của phiếu = miền của KTV tạo (suy ra từ GS phụ trách).

---

## 5. Bước 2 — Thêm từng dòng linh kiện/sản phẩm lỗi vào phiếu

| Trường | Bắt buộc? | Nguồn |
|---|---|---|
| Mã ID sự cố (case) | Có — nhập trước tiên | Chọn từ case có sẵn (`case_dvbh.id`) → tự lấy khách hàng, hãng, sản phẩm bảo hành, serial, khu vực, KTV phụ trách |
| Linh kiện cần sửa (hoặc sản phẩm) | Có | Chọn từ danh mục `linh_kien` dùng chung với Đặt mua linh kiện (có thể là mã "chỉ dùng bảo hành") |
| Mô tả tình trạng lỗi | Có | Nhập tay |
| Ảnh lỗi | Không | **Upload trực tiếp** (không còn dán link tay) — xem mục 8 |
| Ghi chú | Không | Nhập tay |

---

## 6. Bước 3 — Xác nhận đã gửi xe (cập nhật chi tiết)

- KTV bấm "Xác nhận đã gửi xe" khi hàng thực sự rời trạm.
- Hệ thống **hỏi lại "Ngày gửi xe"** ngay lúc đó — ô này **mặc định điền theo đúng thời điểm bấm**
  (không phải ngày đã nhập lúc tạo phiếu).
- KTV có thể **sửa lại** ngày này nếu muốn (ví dụ xác nhận trễ so với lúc xe đi thật).
- Nếu KTV **huỷ hộp thoại này** (không xác nhận lại) → hệ thống **giữ nguyên ngày gửi xe đã nhập từ
  lúc tạo phiếu ban đầu**, không ghi đè bằng thời điểm bấm.
- Sau khi xác nhận: phiếu chuyển **Đã gửi**. Thông tin vận chuyển **vẫn sửa được** cho tới khi Kho xác
  nhận tiếp nhận (mục 7) — khớp với hiểu biết trước, bạn đã xác nhận đúng.

---

## 7. Bước 4 — Kho tiếp nhận (chỉ ở mức thùng hàng)

**Quan trọng:** Kho **không mở thùng kiểm từng linh kiện** — chỉ xác nhận **số kiện/thùng vật lý**
nhận được so với số đã khai.

| Trường | Bắt buộc? | Nguồn |
|---|---|---|
| Mã tra cứu | Có | Quét QR hoặc gõ tay |
| Số kiện/thùng khai báo | Hiển thị sẵn | Lấy từ phiếu |
| Số kiện/thùng thực nhận | Có | Kho nhập tay khi kiểm đếm |
| Ghi chú lệch (nếu có) | Tuỳ | Nhập tay |

Từ đây, thông tin vận chuyển ở header bị khoá; từng dòng LK trong phiếu chính thức vào hàng đợi xử lý
của Admin bảo hành.

---

## 8. Bước 5 — Admin bảo hành xử lý từng dòng

**a) Phân loại Trong bảo hành / Ngoài bảo hành**

| Trường | Bắt buộc? | Nguồn |
|---|---|---|
| Trong bảo hành / Ngoài bảo hành | Có | Chọn 1 trong 2 |
| Thông tin mail phê duyệt | Có, nếu chọn Ngoài bảo hành | Nhập tay (email/tham chiếu phê duyệt đã xin ngoài hệ thống) |
| Mã phê duyệt | Không bắt buộc, chỉ nếu có | Nhập tay |

🟡 Tôi đang hiểu: việc phê duyệt "ngoài bảo hành" **xảy ra ở ngoài hệ thống** (qua email với cấp trên),
Admin bảo hành chỉ **ghi lại bằng chứng** (mail + mã) khi đánh dấu dòng này là ngoài bảo hành — **không
phải** một hàng đợi phê duyệt trong app (khác với ý tưởng "case ngoại lệ có duyệt/từ chối trong app"
tôi từng thiết kế ở bản kế hoạch trước). Đúng không?

**b) Chọn hướng xử lý** (áp dụng cho cả 2 loại trong/ngoài bảo hành ở trên):

| Hướng xử lý | Bước tiếp theo |
|---|---|
| Sửa chữa | Gán 1 NV sửa chữa (`la_nv_sua_chua`) → mục 9 |
| Đổi mới | Xuất linh kiện/sản phẩm mới → tự mở Phiếu trả xác (mục 10) |
| Từ chối / Huỷ | Kết thúc, không xử lý |
| Chuyển kho | Kết thúc, nhập kho lại |

---

## 9. Bước 6 — NV sửa chữa chẩn đoán (chỉ khi hướng xử lý = Sửa chữa)

| Kết quả chẩn đoán | Trường cần nhập thêm |
|---|---|
| Không lỗi | (không cần thêm) |
| Sửa được | Linh kiện đề xuất + số lượng → tự mở Phiếu trả xác nếu linh kiện cũ cần theo dõi (mục 10) |
| Đề xuất đổi mới | Chờ Admin bảo hành duyệt riêng |
| Trả xác | Tự mở Phiếu trả xác ngay (mục 10) |

**Ảnh báo cáo sửa chữa** (mới bổ sung) — 3 nhóm ảnh riêng biệt, **mỗi nhóm tối đa 5 ảnh**:
1. Ảnh trước khi sửa
2. Ảnh sau khi sửa
3. Ảnh linh kiện lỗi

🟡 Ảnh "linh kiện lỗi" ở đây tôi hiểu là **ảnh NV tự chụp khi mở máy kiểm tra thực tế**, khác với ảnh
lỗi KTV đã upload lúc tạo dòng (mục 5, chụp từ hiện trường khách hàng) — 2 bộ ảnh riêng, không thay
thế nhau. Đúng không?

Sau khi đề xuất được duyệt: nhập **mã đơn MISA** (1 mã/1 dòng). NV cập nhật kết quả sửa xong, nhưng
**không tự đóng ticket** — Admin bảo hành phải bấm xác nhận hoàn tất thì dòng này mới coi là xong.

---

## 10. Luồng phụ — Phiếu trả xác

Áp dụng cho **mọi trường hợp có thay thế vật lý**: Đổi mới sản phẩm, hoặc Sửa chữa có thay linh kiện,
hoặc NV chẩn đoán ra kết quả "Trả xác". Hệ thống tự mở **1 Phiếu trả xác** gắn với dòng đó.

| Trường | Bắt buộc? | Ai xử lý |
|---|---|---|
| Trạng thái | Có | Kho hoặc Admin bảo hành chọn 1 trong: **Trả xác thành công** / **Huỷ bỏ** / **Tiêu huỷ** / **Trả xác cho KTV** |
| Thời gian trả xác | Có, khi xác nhận trạng thái | Tự điền theo lúc xác nhận, sửa được |
| Mã duyệt trả xác | Tuỳ | Nhập tay |
| Ghi chú | Không | Nhập tay |

🟡 Tôi đang hiểu phiếu trả xác này **tự động phát sinh** ngay khi dòng LK chuyển sang Đổi mới/Sửa có
thay LK/Trả xác — không cần Admin bảo hành bấm tạo thủ công. Đúng không?

---

## 11. Bước 7 — Phiếu trả bảo hành (đã tách hẳn khỏi "đóng gói theo phiếu gửi")

Thay đổi quan trọng so với bản trước: **phiếu trả không còn tự động 1-1 với phiếu gửi ban đầu**.

- **Admin bảo hành** là người **chủ động tạo phiếu trả**, theo từng KTV.
- 1 phiếu trả gộp nhiều **dòng LK đã xử lý xong** (có thể đến từ nhiều phiếu gửi khác nhau, miễn cùng
  1 KTV).
- Tại **cùng 1 thời điểm**, 1 KTV có thể có **nhiều phiếu trả khác nhau** đang tồn tại song song, tuỳ
  Admin bảo hành phân loại hàng hoá để tách.
- 🟡 Tôi chưa rõ **tiêu chí tách** thành nhiều phiếu trả — Admin bảo hành **tự chọn thủ công** dòng nào
  gộp vào phiếu trả nào (kiểu tick chọn rồi tạo phiếu), hay có **quy tắc cố định** (ví dụ tách riêng
  theo Trong/Ngoài bảo hành, theo loại hàng hoá lớn/nhỏ, theo đợt sửa xong trước-sau...)? Cần bạn nói
  rõ để thiết kế đúng màn "Tạo phiếu trả".

Sau khi Admin bảo hành tạo phiếu trả → Kho đóng gói theo đúng phiếu đó → Kế toán duyệt đối soát → Kho
gửi đi (mã vận đơn) → KTV xác nhận nhận (như bản trước, không đổi).

---

## 12. Ảnh & lưu trữ

Toàn bộ ảnh trong module (ảnh lỗi lúc tạo dòng, 3 nhóm ảnh báo cáo sửa chữa) chuyển từ "dán link Drive
thủ công" sang **upload trực tiếp trong app**, hệ thống tự đẩy lên **Google Drive của tài khoản Admin**
(đã cấp quyền OAuth cho việc này) và lưu lại link kết quả. Đây là một hạng mục kỹ thuật mới cần dựng
riêng (đăng ký OAuth Drive-scope cho tài khoản Admin, xin quyền upload — khác với OAuth đăng nhập hiện
có), sẽ ghi rõ ở bản kế hoạch kỹ thuật sau khi các điểm dưới đây được chốt.

---

## 13. Danh sách câu hỏi cần bạn xác nhận trước khi tôi cập nhật bản kế hoạch kỹ thuật

1. 🟡 Cờ "cần hỗ trợ" (mục 2) để hiện phiếu/dòng cho miền khác — bật tay theo từng phiếu/dòng, đúng
   không?
2. 🟡 "Ngoài bảo hành" (mục 8a) — phê duyệt xảy ra ngoài hệ thống (qua email), Admin bảo hành chỉ ghi
   lại bằng chứng, **không** có hàng đợi duyệt/từ chối trong app — đúng không? (Điều này thay hẳn thiết
   kế bảng `approvals`/`phe_duyet_ngoai_le_bh` tôi từng đề xuất trước.)
3. 🟡 Ảnh "linh kiện lỗi" ở bước NV chẩn đoán (mục 9) là ảnh chụp lại riêng, khác với ảnh lỗi KTV chụp
   lúc tạo dòng — đúng không?
4. 🟡 Phiếu trả xác (mục 10) tự động phát sinh, không cần Admin bảo hành tạo tay — đúng không?
5. **Tiêu chí tách nhiều phiếu trả cho cùng 1 KTV** (mục 11) — đây là câu tôi thật sự cần bạn mô tả rõ
   thêm, không dám tự suy đoán vì ảnh hưởng trực tiếp đến màn "Tạo phiếu trả" của Admin bảo hành.
6. Có bắt buộc mọi dòng LK phải gắn với 1 mã ID sự cố có sẵn không (câu hỏi còn tồn từ bản trước, chưa
   có câu trả lời trực tiếp)?
