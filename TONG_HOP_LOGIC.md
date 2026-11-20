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
- File tải về Danh sách chi tiết (Quản lý tồn): DT sản phẩm / linh kiện / dịch vụ = số SAU sửa tay; kèm "DT đã sửa tay" + 3 số CRM gốc
  + lý do (bảng `case_dt_sua`), Hạn bảo hành (Còn / Hết / Không tính). Tiêu đề file theo ngôn ngữ người dùng.
  Đơn LK gần nhất: ID, trạng thái, ngày đặt / duyệt / xuất / KTV nhận, mã LK của đơn, đơn đúng mã LK thiếu, cách khớp đơn, số đơn của ca.
  File chỉ giữ trường có nhãn (không bao giờ ra tên trường thô).
- Tỷ lệ giải trình theo ngày (Quản lý tồn): ngày loại trừ (Chủ nhật + ngày Admin thêm ở Cài đặt) hiện "Loại trừ" + lý do ngắn
  ("chủ nhật" / ghi chú Admin nhập / "ngày nghỉ"), không cộng vào lũy kế / tỷ lệ tháng.
- Lý do giải trình cuối cùng theo tháng (Quản lý tồn): bảng + 2 biểu đồ (tỷ lệ từng lý do; từng lý do chia theo khu vực / nhóm PH),
  tính trên trình duyệt từ cùng dữ liệu bảng.
- Chi tiết ca: tab "Tiến trình chung" (gộp log nhiều nguồn; đầu tab là luồng xử lý ca dạng ngang, mốc liền nhau cùng đối tượng — 1 đơn
  linh kiện / đơn bảo hành / luồng đổi trả / tranh chấp / cuộc gọi khảo sát + vi phạm — gộp 1 thẻ có luồng ngang mini; log chỉ ghi dữ liệu
  của phiếu xuất kho là log phụ, ẩn mặc định và rút thành chip; chia theo ngày; lọc theo nguồn), tab Mua hàng / Thiếu hàng (từ app Đặt linh kiện), luồng gửi bảo hành (từ app Bảo hành đổi trả).

## 7. Tổng quát & báo cáo

- Kỳ xem Tổng quát: chọn "Theo tháng" (1 tháng) HOẶC "Theo tuần" (tuần ISO, thứ 2 → CN, tính theo ngày hoàn thành; mặc định tuần hiện tại),
  không xem chồng 2 loại; luôn có dòng "Đang xem: …".
KPI, pivot theo nhiều chiều (khu vực, KTV, nhóm yêu cầu…), chọn tháng / tuần ISO, SLA ≤8h / ≤24h / ≤48h / ≤72h cạnh tỷ lệ ≤24h CRM,
top 10. **SLA cũ / SLA mới** (2026-11-20): SLA cũ = `dung_han` / `so_gio_xu_ly` từ pipeline (có loại trừ: QuickSight tra ma trận
và tính từ giờ hẹn khi KH hẹn lại; Odoo theo cờ "Trễ SLA khi đóng ca"). SLA mới (không loại trừ) = giờ từ tiếp nhận → đóng ca (liền 24/7)
so với mốc "SLA (giờ)" Odoo 18/30/42/90h, < mốc = Đúng hạn; ca không có mốc dùng SLA cũ → `COALESCE(dung_han_klt, dung_han)`, giờ
`COALESCE(so_gio_xu_ly_klt, so_gio_xu_ly)`; pipeline tính và gửi. Cùng mẫu số (ca tính KPI đã đóng), chỉ từ 11/2026. Công tắc SLA cũ/mới ở
Tổng quát (thẻ, Top 10 KTV, pivot) và QL NSKX; bảng "So sánh SLA cũ / SLA mới" ở Tổng quát; API `thong-ke-ktv` trả cả hai. Lũy kế chỉ SLA cũ.
Tổng quát có bộ lọc Ngành (chọn nhiều, tham số `nganh` nối "|", `buildDashboardFilterClause` → `nganh IN (...)`, có lọc thì không dùng số chốt 08:00, giống Model) áp cho KPI, Top 10 KTV, pivot, so sánh SLA; thẻ Báo cáo nhanh 08:00 không đổi theo lọc.
"Báo cáo đúng hạn theo ngành" (tab "Báo cáo theo ngành" trong menu Tổng quát; tuần/tháng chọn ngay trên báo cáo, lọc Khu vực + Ngành + Hãng, kỳ + bộ lọc lưu trên máy): 24h đối tác KRF (Đối tác Karofi/Korihome/Livotec/NSKX/
Purastar/Simple Home) / Hãng khác, SLA, RTAT (giờ TB), tồn bình quân = TB số ca tồn 08:00 mỗi ngày (sổ chốt `backlog_age_daily` dim `nganh_hang` = Ngành × Hãng × Khu vực).
Thứ tự khu vực cố định trên mọi báo cáo: MB1–3, MN1–3, B2B, KDDV, SCVP, còn lại A-Z (`soSanhNhom`). Mọi báo cáo nhóm theo khu vực gộp mã lạ về khu vực chuẩn trên trình duyệt (`lib/khuVucShortLabel.ts` `khuVucGop` / `gopTheoKhuVuc` / `gopMapTheoKhuVuc`: 2 mã B2B cũ/mới, tài khoản CTV/TEST, giá trị ghi bằng tên rút gọn), tính lại tỷ lệ từ tổng, bấm dòng đã gộp thì lọc theo mọi mã gốc (nối dấu phẩy). Tải Quản lý tồn có mẫu cố định
"Form tồn" (52 cột) + nối các cột hệ thống đang tích phía sau (không tích = nối tất cả).
Báo cáo chốt ngày ghi sẵn (1 lần đọc nguồn rồi lọc theo từng phạm vi trong bộ nhớ). Ảnh báo cáo hằng ngày gửi Telegram theo phạm vi.

## 8. Lịch chạy tự động (UTC, `wrangler.smarttrade.jsonc`)

| Lịch | Việc |
|---|---|
| `0 1-11 * * *` (8h–18h VN) | Tự chữa ảnh chụp R2 ca đã đóng, làm mới ca lặp, làm ấm cache báo cáo, kéo tồn kho LK |
| `30,40 0,10 * * *`, `15,20,25 10 * * *` | Chốt báo cáo ngày / các đợt thử lại |
| `0 20 * * *` (03:00 VN) | Lưu trữ ca hoàn thành quá 3 tháng (ca tồn giữ vĩnh viễn, log giữ vĩnh viễn) |
| 3 lần / ngày | Đồng bộ 4 Google Sheet cũ (giải trình, giải trình lặp, khảo sát, nạp gas) |

## 9. Kết nối hệ khác

App Đặt linh kiện (tra ca cho đơn, tồn kho, lịch sử LK, đơn theo ca, đặt lõi) · App Bảo hành đổi trả · App EO mua hàng (PO) · App Khiếu nại
(tra ca CRM) · Vi phạm (`vipham`, Service Binding) · Pipeline QuickSight (import tự động + làm mới báo cáo) · Odoo. API đối tác: `PARTNER_API_GUIDE.md`.

## 10. Quy ước bắt buộc

Mọi thời gian lưu giờ Việt Nam (`nowVN()`), không dựa vào DEFAULT UTC của schema. D1: ≤ 100 tham số / câu, ≤ 100 cột / bảng, tính phí theo
dòng quét — giữ ngân sách đọc (`KE_HOACH_TOI_UU_D1.md`).
