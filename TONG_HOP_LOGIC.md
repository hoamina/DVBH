# Tổng hợp logic — Hệ DVBH (Quản lý giải trình tồn DVBH, Worker `dvbh`)

> Mô tả logic **đang chạy thật** (theo code + `CLAUDE.md`, `HANDOFF.md`, `SRS_tong_hop.md` tới 17/11/2026). Yêu cầu đã chốt và lịch sử
> thiết kế: `SRS_tong_hop.md`; nhật ký: `nhat_ky_lam_viec.md`; chi tiết kỹ thuật (D1, R2, cron, giới hạn): `CLAUDE.md`. File này là bản
> tóm tắt nghiệp vụ để nắm nhanh — logic đổi thì sửa đè đúng mục. Không ghi tài khoản, mật khẩu, khoá.

## 1. Hệ thống là gì

- Quản lý **ca dịch vụ bảo hành (DVBH)** nhập từ CRM / Odoo: SLA, ca tồn và giải trình tồn, khảo sát CSKH & chốt vi phạm, doanh thu,
  ca lặp, nạp gas, tranh chấp, thiếu linh kiện, báo cáo NSKX…
- 1 Worker (Hono) phục vụ API + React build; D1 là CSDL duy nhất; R2 cho ảnh chụp JSON lớn chỉ-đọc (ca đã đóng theo ngày); Cron Triggers.
  Google OAuth tự triển khai, tài khoản mới chờ Admin duyệt + gán vai trò / khu vực. Đa ngôn ngữ VI / EN / ID, đa quốc gia (VN, ID…).

## 2. Vai trò

| Vai trò | Quyền chính |
|---|---|
| Admin | Toàn quyền |
| Viewer | Xem toàn bộ |
| QC | Như Viewer + chốt / bỏ vi phạm cấp 2 |
| Giám sát | Xem + giải trình theo khu vực phụ trách |
| TBP DVBH | Quản lý nhiều Giám sát |
| CSKH | Khảo sát + chốt vi phạm cấp 1 |
| TN CSKH | Như CSKH + phân công khảo sát, sửa dữ liệu khảo sát nhầm |
| TBP CSKH | Như TN CSKH + xem toàn bộ |
| KSNB Đối tác | Phạm vi đối tác riêng |

KTV không có tài khoản, chỉ là dữ liệu trên ca. Phạm vi xem theo khu vực, quốc gia và "Phạm vi báo cáo" (Tất cả / NSKX / Không NSKX).

## 3. Import ca hằng ngày

- So khớp theo ID ca, 4 nhánh mỗi dòng: **GHI_MOI** (ID mới) / **BO_QUA** (ca đã hoàn thành + không đổi) / **CAP_NHAT_MOC_THOI_GIAN**
  (ca tồn không đổi — chỉ cập nhật mốc + ratchet) / **GHI_DE** (có thay đổi).
- 4 cột nghi vi phạm (Lỗi 120', Quá hẹn 24h, Lỡ kế hoạch, KH hẹn lại) do CRM tính sẵn; **ratchet 1 chiều**: đã true thì giữ true, false
  thì nhận true từ import; rỗng = false.
- Cột "TBP" của file = Khu vực. Link ảnh tách thành mảng URL lúc import (≤ 30 ảnh / ca).
- Ca huỷ (`huy_bo_at`) bị loại ở mọi nơi qua VIEW `case_hieu_luc`. Báo cáo KTV gom theo MÃ KTV, hiện tên mới nhất.

## 4. Ca tồn & giải trình

- Ca tồn = chưa có thời gian hoàn thành. Giám sát giải trình định kỳ; mỗi lần 1 dòng log, không ghi đè, lưu vĩnh viễn.
- **Giải trình thiếu linh kiện bắt buộc chọn đơn DDH- (v1.677)**: lý do thuộc nhóm thiếu LK → ngoài mã LK thiếu + ngày yêu cầu có hàng, GS phải
  CHỌN mã đơn `DDH-…` của LK thiếu từ danh sách đơn của ca (API `case-timeline` app Đặt linh kiện: đơn ghi mã ca + mã DDH- đã ghi ở các giải trình
  trước; bỏ đơn trả hàng). Đơn **đã nhận hàng** (phiếu xuất kho ở KTV đã nhận / Hàng trừ kho / Kho đã kết thúc) hiện xám, không chọn được, ghi rõ
  ai xác nhận: **KTV đã nhận hàng** (KTV bấm) · **Hệ thống tự xác nhận đã nhận** (quá 10 ngày KTV không bấm — nhật ký phiếu ghi "Hệ thống tự xác
  nhận…") · **Kho đã kết thúc / trừ kho**. Server kiểm lại khi lưu (sai dạng / không thuộc ca / đã nhận → từ chối kèm lý do). App linh kiện không trả
  lời được → cho nhập tay, chỉ kiểm đúng dạng `DDH-xxxxxx`. Lưu vào cột cũ `ma_xuat_hang_lien_quan`. Import CSV giải trình cũ / ETX / log tự động
  không áp luật này.
- **Tổng cần giải trình** (`needGiaiTrinh.ts NEED_TONG`, 7 nhánh nối HOẶC, 1 ca đếm 1 lần): lỡ kế hoạch · tái giải trình (≥3 ngày từ lần GT
  gần nhất) · khách ĐMX chưa GT ≥3 ngày · chưa GT ≥ mốc của nước (VN 5) · Điều hòa chưa GT ≥1 ngày · VIP/S.VIP chưa GT ≥24h thực ·
  **Lọc tổng chưa GT ≥1 ngày** (thêm 20/11/2026, v1.649). Tuổi = 0h hôm nay − giờ CSKH tiếp nhận, làm tròn xuống. B2B ≥1 ngày và NSKX ≥2 ngày
  là chỉ tiêu phụ, không cộng vào Tổng. Tỷ lệ giải trình theo ngày lấy Tổng này làm mẫu số.
- **VIP/S.VIP ≥24h — 2 việc định kỳ (v1.669, `lib/vipTon24h.ts`)**:
  - **13:30 bổ sung**: ca VIP/S.VIP (`nhom_kh LIKE '%VIP%'`) CSKH tiếp nhận HÔM QUA từ 00:00 đến trước 12:00, lúc chốt sáng chưa đủ 24h thực nên
    chưa vào danh sách, đến 13:30 hôm nay VẪN TỒN (chưa hoàn thành / huỷ / lưu trữ) và không có giải trình trước mốc chốt → thêm vào nhóm
    "VIP/SVIP ≥24h" VÀ "Tổng cần giải trình" (+ theo khu vực) của mọi số chốt hôm nay; giữ nguyên mốc chốt nên giải trình sau mốc chốt (kể cả
    trước 13:30) tính "đã giải trình". Dấu `bo_sung_vip_1330|all` (danh sách ID đã thêm) chặn chạy lại; 14:00–17:00 mỗi giờ chạy bù nếu 13:30 lỗi (không chạy sau chốt 17:30).
  - **12:00 Telegram**: tin nhắn chữ vào nhóm Telegram của từng nước: số cần giải trình (chốt sáng) / đã giải trình / còn lại + %, theo khu vực,
    danh sách ca chưa giải trình (tối đa 40, ca tồn lâu nhất trước). Ca bổ sung 13:30 có trong số 17:30 (log + ảnh) của cùng ngày.
- Danh sách chi tiết, nhóm **Cảnh báo tồn** (Cấp 1/2, kể cả Luồng đổi trả): luôn là tập ca đã chốt 08:00, không tính sống. Ô tuổi tồn chỉ có với
  nhóm "Tổng tồn hiện tại" (các nhóm khác lọc tuổi qua bộ lọc cột "Tuổi tồn (ngày)").
- **Tuổi tồn TB** (Quản lý tồn) và **Tồn bình quân / ngày** (Báo cáo theo ngành) cùng đọc sổ chốt tồn 08:00 (`backlog_age_daily_<phạm vi>`) nhưng
  đo 2 thứ khác nhau: Tồn bình quân = tổng lượt ca tồn ÷ số ngày có số chốt (đơn vị **ca**); Tuổi tồn TB = tổng tuổi ÷ tổng lượt ca (đơn vị **ngày**).
  Ngày chốt lỗi được tính bù từ giờ tiếp nhận / đóng ca (khu vực, KTV… theo giá trị hiện tại của ca) — tháng 11/2026 đã đủ 21 ngày ở mọi chiều.
- Báo cáo tồn chốt 08:00 mỗi ngày (theo mốc tuổi tồn, theo KTV × ngày trong tháng), lũy kế tháng đã / cần giải trình (Chủ nhật và ngày
  loại trừ không tính), lý do giải trình theo tháng (lấy dòng cuối trong tháng).
- Danh sách chi tiết có thêm cột gửi bảo hành (v1.626): **Hạn BH** (ngày mua +24T / ngày SX +36T, mốc đến trước; chỉ ca tiếp nhận từ
  01/11/2026; GS sửa tay thắng), **Số LK Odoo báo gửi BH** (tổng SL đơn bảo hành Odoo của ca, bỏ huỷ / từ chối / lưu trữ), **Số LK thực tế đã
  gửi**, **Trạng thái đổi trả BH** (giai đoạn THẤP NHẤT trong các LK) + diễn giải ("2 LK Hoàn tất, 1 LK Thùng nháp"), **Tốc độ tồn đổi trả** =
  0h hôm nay − lần KTV bấm gửi xe cuối; ca đã xong hết thì = thời gian xử lý lâu nhất (gửi xe → kết thúc). 3 cột sau lấy từ app Gửi bảo hành
  (suachua): bỏ đơn huỷ / từ chối, đơn chưa tách = SL KTV khai; suachua tự đẩy tóm tắt theo ca 15 phút/lần (chỉ ca có thay đổi) cùng lần đẩy
  trạng thái đơn Odoo.

## 5. Khảo sát & chốt vi phạm 2 cấp

CSKH gọi khảo sát (1 cuộc có thể nhiều loại lỗi) → chốt cấp 1 → QC chốt / bỏ cấp 2 (final). Không nhảy cấp.
Tỷ lệ vi phạm = cấp 2 nếu có, không thì cấp 1 (khác "Không lỗi"). Có danh sách loại trừ khảo sát.

## 6. Mô-đun liên quan

- **Ca lặp** (cùng serial), **nạp gas**, **tranh chấp** (log riêng), **doanh thu** (sửa doanh thu có kiểm soát).
  Ô chọn tháng ở Ca lặp / Nạp gas / Khảo sát nhớ theo trình duyệt (dùng chung mọi nước): tháng đã nhớ không có dữ liệu ở nước đang xem → tự về
  tháng hiện tại (hoặc tháng mới nhất) (v1.662) — tránh trang trống trong khi badge menu (đếm tháng hiện tại) vẫn có số.
- **Nạp gas — ca cần đánh giá** = cờ `nghi_ngo_nap_gas` = 1 (pipeline auto qs tính, app chỉ ratchet) VÀ "Hoàn thành XLSC", theo tháng hoàn thành.
  Luật cờ (CRM và Odoo như nhau): lý do quá hạn "KTV/CTV/Trạm tự nạp gas, làm block" HOẶC "Cách thức xử lý" chứa ga / nạp / sạc / nap / sac
  (phân biệt hoa thường). Odoo bị tắt cờ 04/10–18/11/2026; ca VN hoàn thành từ 01/10 đã được bật bù bằng migration 0175.
- **Thiếu linh kiện**: tồn kho MB / MN / KTV kéo từ app Đặt linh kiện (mỗi giờ 8h–18h T2–T7, 1 phiên bản), tình trạng từng mã
  (kho có hàng → KTV giữ → hết hàng chưa / trễ / chờ PO), hồ sơ linh kiện.
- **PO đặt hàng**: nhận từ app EO mua hàng (mỗi dòng EO = 1 PO).
- **QL NSKX**: báo cáo ca đối tác NSKX theo tháng tiếp nhận, đánh giá lõi lọc (Có / Không thay), đặt lõi sang app Đặt linh kiện bằng tài
  khoản người bấm (đơn "HỖ TRỢ NGOÀI BẢO HÀNH TG12-NSKX"), đồng bộ trạng thái đơn lõi.
- Chi tiết ca, tab PO: PO theo ID CRM / mã LK thiếu + PO có "ID đặt hàng" trùng mã đặt hàng của ca (đơn LK, mã xuất hàng trong giải trình,
  ID Lada). PO liên quan trực tiếp (ID CRM = ID ca hoặc trùng ID đặt hàng) xếp trên cùng kèm lý do; còn lại là PO cùng mã LK thiếu.
- Hồ sơ linh kiện, cột "PO cho ca này" / ô "Ca thiếu đã có PO riêng" (v1.648): tách mọi mã trong "ID CRM" + "ID đặt hàng" của PO (ô có thể ghi
  nhiều mã), ghép về ca khi là mã ca; mã đơn `DDH-…` của ca (đơn ghi mã ca bên app linh kiện, hoặc đơn của ca trong `don_lk_gan_nhat` — khớp
  ID Lada / ghi trong giải trình); mã ticket `TLK-…` → đơn của ticket → ca. Ghi rõ đường ghép cạnh PO. Dữ liệu đơn/ticket = 200 đơn gần nhất
  của mã LK (gọi app linh kiện lúc mở hồ sơ). Mua hàng không ghi mã nào của ca trên EO thì ca vẫn hiện "—" (PO đặt chung theo mã LK).
- File tải về Danh sách chi tiết (Quản lý tồn): DT sản phẩm / linh kiện / dịch vụ = số SAU sửa tay; kèm "DT đã sửa tay" + 3 số CRM gốc
  + lý do (bảng `case_dt_sua`), Hạn bảo hành (Còn / Hết / Không tính). Tiêu đề file theo ngôn ngữ người dùng.
  Đơn LK gần nhất: ID, trạng thái, ngày đặt / duyệt / xuất / KTV nhận, mã LK của đơn, đơn đúng mã LK thiếu, cách khớp đơn, số đơn của ca.
  File chỉ giữ trường có nhãn (không bao giờ ra tên trường thô).
- Tỷ lệ giải trình theo ngày (Quản lý tồn): ngày loại trừ (Chủ nhật + ngày Admin thêm ở Cài đặt) hiện "Loại trừ" + lý do ngắn
  ("chủ nhật" / ghi chú Admin nhập / "ngày nghỉ"), không cộng vào lũy kế / tỷ lệ tháng. Màn Cài đặt › "Ngày loại trừ giải trình" có cột "Ngày tạo"
  (giờ VN; DB lưu UTC) và mặc định xếp ngày tạo mới nhất lên đầu; bấm tiêu đề Ngày / Ngày tạo để đổi chiều (v1.656).
  Tick "Tất cả khu vực" chỉ áp cho **quốc gia đang xem** lúc khai (v1.662; lưu `__ALL__:<mã nước>`, cột Khu vực ghi "Tất cả khu vực (VN)") —
  khai nghỉ lễ VN không làm PH (PLP) bị "Loại trừ". Ngày loại trừ chọn khu vực cụ thể vẫn theo tên khu vực (mỗi nước tên khác nhau).
  Số chốt theo ngày (Tỷ lệ giải trình, Cảnh báo tồn theo ngày) hiển thị đúng khu vực ghi lúc chốt: dòng của tài khoản CTV/TEST bị ghi nhầm
  vào cột khu vực (vd "CTV Bắc Ninh", "GS Khu Vực-TEST", KTV PH "Denver Y. Maniclang") KHÔNG gộp vào khu vực chuẩn (MB3 / KRF) — lúc chốt Giám sát khu vực chuẩn không thấy
  ca đó, Telegram 17:30 cũng không tính — và từ v1.654 bị ẨN hẳn (không dòng riêng), nên Tổng cộng / lũy kế (cộng từ các dòng) cũng không tính,
  khớp ảnh Telegram. Mã B2B cũ/mới vẫn gộp. Báo cáo đọc dữ liệu ca hiện tại vẫn gộp CTV/TEST về khu vực chuẩn.
  Kỳ xem: chọn tháng HOẶC "Từ – đến" ngày (cả 2 ngày hợp lệ thì thay tháng, tối đa 93 ngày; chọn lại tháng xoá khoảng; bảng Cảnh báo tồn theo
  ngày vẫn theo tháng). Cột "Tổng" khoá cứng sau Khu vực = đã GT / cần GT cộng cả kỳ đang xem, bỏ ngày loại trừ của từng khu vực (dòng Tổng cộng
  = lũy kế của kỳ); file tải thêm 3 cột "Tổng - Đã GT / Cần GT / Tỷ lệ %".
  Màu ô (v1.658, cả ô ngày, cột Tổng, dòng Tổng cộng; nền nhạt + chữ đậm cùng tông): 100% xanh nhạt, 95–<100% vàng, 80–<95% cam, <80% đỏ; không có
  ca không tô; cột Tổng + dòng Tổng cộng có viền tím riêng;
  Sửa tay số chốt (v1.659, CHỈ Admin): bấm ô khu vực × ngày → sửa "đã giải trình" (0..cần, cần giữ nguyên), bắt buộc lý do; sửa đúng sổ chốt của
  phạm vi đang xem (quốc gia / NSKX — phạm vi khác không tự đổi theo); mỗi lần sửa ghi `giai_trinh_daily_log_sua` (trước/sau, ai, lúc nào, lý do),
  ô đã sửa có ✎ + tooltip gốc → mới, nền xanh dương nhạt (khác xanh lá của ô 100%) + lý do in nghiêng dưới số (v1.660).
  Popup sửa có nút "⊘ Loại trừ ngày này" (v1.661, Admin): thêm ngày loại trừ cho khu vực đó (mọi mã gốc của dòng đã gộp) qua API Cài đặt, lý do = ghi
  chú; loại trừ áp cho MỌI phạm vi, bỏ ở Settings › Ngày loại trừ giải trình.
  Ngày lễ PH tự thêm (v1.667, `lib/ngayLeTuDong.ts`): mỗi ngày 03:00 VN lấy lịch lễ toàn quốc PH năm nay + năm sau từ Nager.Date, ghi dòng
  "Tất cả khu vực (PH)" ghi chú "Lễ PH (tự động): …"; ngày đã tự thêm mà Admin xoá thì không thêm lại; lễ Hồi giáo PH công bố từng năm có thể thiếu → thêm tay.
  Admin đang xem PH có nút "↻ Cập nhật ngày lễ PH" chạy ngay.
  Ô Chủ nhật = xám đậm nền trơn; ngày loại trừ Admin thêm (nghỉ phép, đào tạo…) = xám nhạt kẻ sọc (v1.660). Lũy kế / Tổng / Báo cáo tồn theo khu vực dùng số đã sửa; ảnh Telegram đã gửi không đổi. "Loại trừ" = xám kẻ sọc chéo, chữ xám (v1.657, trước là be — dễ lẫn với ô vàng/cam); ngày Tổng cộng có 1 số khu vực bị loại trừ = viền nét đứt sẫm (trước là nền hồng). Có chú thích màu trên bảng.
- Lý do giải trình cuối cùng theo tháng (Quản lý tồn): bảng + 2 biểu đồ (tỷ lệ từng lý do; từng lý do chia theo khu vực / nhóm PH),
  tính trên trình duyệt từ cùng dữ liệu bảng. Tên lý do hiện theo ngôn ngữ người xem (bản dịch EN/ID ở Cài đặt › Lý do, v1.663); file Excel giữ tiếng Việt.
  Dòng hệ thống tự ghi "Case đã được kết thúc" (lib/autoLogCaKetThuc.ts) KHÔNG phải lý do giải trình → bỏ qua, mỗi ca lấy giải trình cuối cùng còn lại
  trong tháng; ca chỉ có dòng tự động thì không tính (v1.664).
- **Chi tiết ca — 2 giao diện (v1.673)**: **v2 "8 bước quy trình" là mặc định**, nút **v1 | v2** trên thanh tiêu đề popup, lựa chọn lưu riêng từng máy
  (localStorage `case-detail-ui`). 8 bước: 1 Khởi tạo (giờ CSKH tiếp nhận) · 2 Xác nhận lịch hẹn (lần hẹn Odoo đầu tiên; không có thì "thời gian hẹn
  xử lý") · 3 Đặt linh kiện (đơn đầu tiên app Đặt mua LK) · 4 Mua hàng (yêu cầu thiếu LK / PO; xong khi mọi yêu cầu có ngày hàng về; có đơn LK mà
  không thiếu = bỏ qua "Kho có sẵn") · 5 Giao LK cho KTV (phiếu xuất kho) · 6 Đóng ca (thời gian hoàn thành) · 7–8 lấy từ App Bảo hành đổi trả (chốt 2026-11-28, v1.676):
  **7 Trả xác 3T = đơn gửi đổi trả** (KTV tạo đơn → gửi xe → Kho nhận → Admin BH nhận; đang = "Chờ KTV gửi" / "Đang gửi về kho" / "Kho đã nhận — chờ
  Admin BH nhận", xong khi Admin BH nhận đủ mọi phiếu gửi); **8 Xác nhận xác = tiến độ trả xác** (chỉ bắt đầu khi bước 7 xong: "Chờ xử lý xác" → vào thùng
  trả xác "Chờ trả xác cho đối tác" → kế toán duyệt thùng = xong "Trả xác thành công"; xác kết thúc ngoài thùng — tiêu huỷ / thất lạc / lưu kho / không có /
  xử lý ngoài — cũng là xong, ghi kết quả). Chưa có đơn gửi BH → cả 2 bước "Chưa có linh kiện bảo hành gửi nên chưa có xác"; đơn đã phân loại mà hướng
  không có xác → 8 bỏ qua "Không có xác". Xác = xác đơn vị Đổi mới / Trừ công nợ + xác linh kiện sau sửa chữa; đơn vị sửa chữa chưa xong → 8 "Đang sửa
  chữa — chờ xác định xác". Ca đã đóng không có đơn LK → bỏ qua 3–5; app LK / Bảo hành chưa tải được → "Chưa tải được dữ liệu",
  KHÔNG kết luận bỏ qua. Xác gồm (v1.675) xác đơn vị Đổi mới / Trừ công nợ VÀ xác linh kiện sau sửa chữa (đề xuất cấp LK đã xuất); đơn vị sửa chữa
  chưa xong → bước 7 "Đang sửa chữa — chờ xác định xác". Popup chi tiết (Mở rộng) = 98% × 98% màn hình ở cả v1 và v2. v1 và v2 hiện CÙNG thông tin (cùng bộ tính, cùng câu tóm tắt "Đang ở bước … — chờ …", x/8 xong, tổng thời gian) — chỉ khác cách trình bày. Bước "đang xử
  lý" = bước chưa xong đầu tiên (1–6 khi ca mở; 7–8 sau khi đóng). Chỉ HIỂN THỊ: chưa có SLA từng bước, chưa có mã lỗi theo bước. Bộ tính dùng
  chung `lib/buocQuyTrinh.ts`; nội dung từng bước v2 là nguyên khối của v1 (không đổi quyền / thao tác); khoá tab cũ (module ngoài mở ca
  thẳng 1 tab, chip "nhảy tab") được chuyển tới đúng bước / mục ngoài 8 bước. v1: đầu tab Tiến trình chung có luồng ngang 8 bước + "Xem chi
  tiết", mỗi sự kiện gắn nhãn bước (B1…B8), thêm sự kiện lịch hẹn Odoo và mốc gửi xác / kho nhận / admin nhận. Bảng kiểm kê nội dung v1 → v2:
  `docs/kiem-ke-chi-tiet-ca-v1-v2.md`.
- Chi tiết ca: tab "Tiến trình chung" (gộp log nhiều nguồn; đầu tab là luồng xử lý ca dạng ngang, mốc liền nhau cùng đối tượng — 1 đơn
  linh kiện / đơn bảo hành / luồng đổi trả / tranh chấp / cuộc gọi khảo sát + vi phạm — gộp 1 thẻ có luồng ngang mini; log chỉ ghi dữ liệu
  của phiếu xuất kho là log phụ, ẩn mặc định và rút thành chip; chia theo ngày; lọc theo nguồn), tab Mua hàng / Thiếu hàng (từ app Đặt linh kiện), luồng gửi bảo hành (từ app Bảo hành đổi trả).

## 7. Tổng quát & báo cáo

- Kỳ xem Tổng quát: chọn "Theo tháng" (1 tháng) HOẶC "Theo tuần" (tuần ISO, thứ 2 → CN, tính theo ngày hoàn thành; mặc định tuần hiện tại),
  không xem chồng 2 loại; ô kỳ tự ghi đầy đủ kỳ đang xem ("Tháng 11/2026 (hiện tại)" / "Tuần 47/2026 · 17/11–23/11 (tuần này)").
- Bố cục Tổng quát (v1.644): phần điều khiển ~3 dòng — dải "Hôm nay" (số chốt trong ngày: tồn >3 ngày cần GT, thiếu LK, ca lặp, cần
  khảo sát, doanh thu tháng; KHÔNG theo bộ lọc; bấm sang màn tương ứng, rê chuột xem đầu ngày / đã xử lý) · 1 dòng bộ lọc (Khu vực, Hãng,
  Model, Ngành, Tháng/Tuần + kỳ; từ màn tablet trở lên dính dưới thanh trên cùng khi cuộn) · công tắc SLA + 5 thẻ KPI thu gọn. Không có tiêu đề trang.
KPI, pivot theo nhiều chiều (khu vực, KTV, nhóm yêu cầu…), chọn tháng / tuần ISO, SLA ≤8h / ≤24h / ≤48h / ≤72h cạnh tỷ lệ ≤24h CRM,
top 10. **SLA cũ / SLA mới** (2026-11-20): SLA cũ = `dung_han` / `so_gio_xu_ly` từ pipeline (có loại trừ: QuickSight tra ma trận
và tính từ giờ hẹn khi KH hẹn lại; Odoo theo cờ "Trễ SLA khi đóng ca"). SLA mới (không loại trừ) = giờ từ tiếp nhận → đóng ca (liền 24/7)
so với mốc "SLA (giờ)" Odoo 18/30/42/90h, < mốc = Đúng hạn; ca không có mốc dùng SLA cũ → `COALESCE(dung_han_klt, dung_han)`, giờ
`COALESCE(so_gio_xu_ly_klt, so_gio_xu_ly)`; pipeline tính và gửi. Cùng mẫu số (ca tính KPI đã đóng), chỉ từ 11/2026. Công tắc SLA cũ/mới ở
Tổng quát (thẻ, Top 10 KTV, pivot) và QL NSKX; bảng "So sánh SLA cũ / SLA mới" ở Tổng quát; API `thong-ke-ktv` trả cả hai. Lũy kế chỉ SLA cũ.
Hãng (Tổng quát + Doanh thu) và Model (Tổng quát) chọn nhiều từ v1.645: tham số `hang` / `nhom_san_pham` nối "|" → `multiValueAdHocClause` (1 giá trị vẫn `= ?`, bộ lọc / link cũ giữ nguyên), giá trị lưu trên máy vẫn "Tất cả hãng" / "Tất cả Model" hoặc các giá trị nối "|"; hãng đã lưu không còn trong danh sách nước đang xem tự bỏ.
Tổng quát có bộ lọc Ngành (chọn nhiều, tham số `nganh` nối "|", `buildDashboardFilterClause` → `nganh IN (...)`, có lọc thì không dùng số chốt 08:00, giống Model) áp cho KPI, Top 10 KTV, pivot, so sánh SLA; thẻ Báo cáo nhanh 08:00 không đổi theo lọc.
"Báo cáo đúng hạn theo ngành" (tab "Báo cáo theo ngành" trong menu Tổng quát; tuần/tháng chọn ngay trên báo cáo, lọc Khu vực + Ngành + Hãng, kỳ + bộ lọc lưu trên máy): 24h đối tác KRF (Đối tác Karofi/Korihome/Livotec/NSKX/
Purastar/Simple Home) / Hãng khác, SLA, RTAT (giờ TB), tồn bình quân = TB số ca tồn 08:00 mỗi ngày (sổ chốt `backlog_age_daily` dim `nganh_hang` = Ngành × Hãng × Khu vực).
Khu vực lúc import: CRM/Odoo đôi khi ghi TÀI KHOẢN người (CTV/TEST/KTV) vào cột khu vực → import tự đổi về khu vực chuẩn theo mã "(…)" đầu chuỗi
(`lib/khuVucTheoKtv.ts` `MA_KHU_VUC_TAI_KHOAN`: CTV Bắc Ninh / Hải Dương → MB3, GS TEST → KRF bán lẻ, KTV PH Denver `denverym.svph` → MM); ca cũ chuyển bằng
migration (0177, 0182), đánh dấu như sửa tay (`khu_vuc_crm` giữ giá trị CRM). Tài khoản mới bị ghi nhầm → thêm mã vào đây + `KHU_VUC_GOP` + 1 migration.
Thứ tự khu vực cố định trên mọi báo cáo: MB1–3, MN1–3, B2B, KDDV, SCVP, còn lại A-Z (`soSanhNhom`). Mọi báo cáo nhóm theo khu vực gộp mã lạ về khu vực chuẩn trên trình duyệt (`lib/khuVucShortLabel.ts` `khuVucGop` / `gopTheoKhuVuc` / `gopMapTheoKhuVuc`: 2 mã B2B cũ/mới, tài khoản CTV/TEST/KTV, giá trị ghi bằng tên rút gọn), tính lại tỷ lệ từ tổng, bấm dòng đã gộp thì lọc theo mọi mã gốc (nối dấu phẩy). Tải Quản lý tồn có mẫu cố định
"Form tồn" (52 cột) + nối các cột hệ thống đang tích phía sau (không tích = nối tất cả).
Mọi danh sách ca có 2 mẫu cố định "Mẫu tính lương" (32 cột) và "Mẫu tính báo cáo" (67 cột = tiêu đề file xuất CRM, v1.651, `lib/exportMauTinhBaoCao.ts`): đọc dòng ca thô, tiêu đề tiếng Việt, ngày/số là ô Excel thật; Tên/Mã linh kiện, Nhóm lỗi, Nguyên nhân lỗi gộp từ "Linh kiện lỗi" Odoo (bỏ trùng, "; "); "Lý do không trả phí" = thu phí Odoo; checkin_time = check-in đầu tiên; Bộ phận xử lý = Khu vực; cột app không lưu (điện thoại, ảnh, CoreDB…) để trống.
Báo cáo chốt ngày ghi sẵn (1 lần đọc nguồn rồi lọc theo từng phạm vi trong bộ nhớ). Ảnh báo cáo hằng ngày gửi Telegram theo phạm vi.

**Phạm vi chốt (v1.646):** người dùng luôn xem 1 nước nên số chốt cho người xem chỉ ghi ở bảng theo nước (VN, VN × NSKX / Không NSKX, PH, ID…).
Phạm vi gốc "Tất cả quốc gia" chỉ còn dòng hệ thống: `canh_bao_ton|all` (giữ hết — nhật ký chuyển cấp TBP/CEO so với ngày trước), `khac|all` +
`chot_xong|all` (giữ 7 ngày — tự ghi log "Case đã được kết thúc", giải trình qua tranh chấp). Không chốt tuổi tồn / tồn KTV cho phạm vi gốc; 2 phạm
vi NSKX / Không NSKX không gắn nước thôi chốt. Cache báo cáo `rpt:%` quá 7 ngày (giữ ≤ 1000 khoá mới nhất) được dọn ở bảng gốc **và mọi bản sao
theo phạm vi** sau mỗi lần import.

**Lưu số chốt 08:00 (v1.647):** giữ đầy đủ 35 ngày gần nhất. Ngày cũ hơn được thu gọn lúc 03:00 VN (`lib/thuGonSnapshot.ts`): chỉ còn tổng
tồn, tồn trên 3/5/7/14 ngày và số theo khu vực (đủ cho biểu đồ "Số ca tồn theo mốc thời gian"), bỏ danh sách ID ca; dòng `canh_bao_ton|all`
giữ nguyên. Không tra lại được danh sách ca của một ngày quá 35 ngày.

## 8. Lịch chạy tự động (UTC, `wrangler.smarttrade.jsonc`)

| Lịch | Việc |
|---|---|
| `0 1-11 * * *` (8h–18h VN) | Tự chữa ảnh chụp R2 ca đã đóng, làm mới ca lặp, làm ấm cache báo cáo, kéo tồn kho LK |
| `30,40 0,10 * * *`, `15,20,25 10 * * *` | Chốt báo cáo ngày / các đợt thử lại |
| `0 20 * * *` (03:00 VN) | Đồng bộ vi phạm từ Sheet QC; tự thêm ngày lễ PH vào ngày loại trừ giải trình; thu gọn số chốt 08:00 cũ hơn 35 ngày; ngày 1: lưu trữ ca hoàn thành quá 3 tháng (ca tồn giữ vĩnh viễn, log giữ vĩnh viễn) |
| 3 lần / ngày | Đồng bộ 4 Google Sheet cũ (giải trình, giải trình lặp, khảo sát, nạp gas) |

## 9. Kết nối hệ khác

App Đặt linh kiện (tra ca cho đơn, tồn kho, lịch sử LK, đơn theo ca — khớp mã ca trên đơn + mã `DDH-xxxxxx` ghi ở ô "Mã xuất hàng liên quan" của mọi giải trình của ca (v1.665, đơn trạm đặt không chọn ca vẫn hiện ở chi tiết ca); trạng thái đơn hiện ở mọi nơi (chi tiết ca: GT tồn, Mua hàng, Thiếu hàng, NSKX; Hồ sơ linh kiện) = trạng thái MỚI NHẤT: đơn đã duyệt có phiếu xuất kho → trạng thái phiếu (vd "Chờ KTV chuyển tiền"), đơn còn chờ duyệt / chờ hàng → trạng thái đơn — cùng luật cột "ID đặt hàng gần nhất" (v1.666), đặt lõi) · App Bảo hành đổi trả · App EO mua hàng (PO) · App Khiếu nại
(tra ca CRM) · Vi phạm (`vipham`, Service Binding) · Pipeline QuickSight (import tự động + làm mới báo cáo) · Odoo. API đối tác: `PARTNER_API_GUIDE.md`.

## 10. Quy ước bắt buộc

Mọi thời gian lưu giờ Việt Nam (`nowVN()`), không dựa vào DEFAULT UTC của schema. D1: ≤ 100 tham số / câu, ≤ 100 cột / bảng, tính phí theo
dòng quét — giữ ngân sách đọc (`KE_HOACH_TOI_UU_D1.md`).

**Giao diện (gam màu + phông chữ)** là tuỳ chọn riêng từng máy (localStorage `theme-config`, Cài đặt cá nhân → Giao diện), mặc định **"Apple"** từ v1.672
(máy đã từng lưu gam khác giữ nguyên lựa chọn; trước đó mặc định "Đại dương").
Gam **Apple** (v1.671, phong cách sếp chọn — skill `giao-dien-apple`): ngoài màu còn bật lớp kiểu dáng `html[data-ui-style="apple"]` trong
`tokens.css` — bảng màu iOS, phông hệ thống kiểu San Francisco (chỉ khi đang để phông mặc định Inter), thẻ trắng bỏ viền thay bằng bóng mềm,
bo góc lớn hơn, nút chính viên thuốc, thanh trên kính mờ, menu bên sáng. Vòng viền tím của ô nhập giữ nguyên. Gam khác không bị ảnh hưởng.

## Cửa sổ thông tin eOffice (popup Giám đốc)

`GET /api/cua-so` (không cần đăng nhập) → Worker gọi `csApi` eOffice bằng secret `CUA_SO_KHOA`, đệm 60 giây, kèm tranh SVG. Frontend `CuaSoThongTin` hiện mỗi lần mở app (và khi quay lại sau ≥ 10 phút ẩn), nút "Vào app" khoá theo `khoaNutGiay`. Lỗi / chậm / chưa có khoá → không hiện, vào app bình thường. Cùng 1 bộ mã ở mọi app hệ DVBH (bản gốc ở linh-kien-app).
