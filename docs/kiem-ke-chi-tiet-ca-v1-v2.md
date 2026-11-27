# Kiểm kê popup Chi tiết ca (v1 hiện tại) → vị trí trong giao diện v2 (8 bước)

> Lập ngày 27/11/2026 từ mã nguồn (chỉ đọc): `frontend/src/modules/CaseDetail.tsx` (3.355 dòng), `frontend/src/App.tsx` (ngăn xếp ca, quyền, tab hợp lệ) và các component trong `frontend/src/components/`.
> Mục đích: bảng đối chiếu để phiên dựng v2 **không rơi mục nào** của popup cũ. Giai đoạn này chỉ đổi giao diện, không đổi logic nghiệp vụ.
> Đối chiếu với bảng "E2. Kiểm kê" trong mẫu Giám đốc duyệt (`mau-goc-v5-apple.html`); mục E2 bỏ sót nằm ở phần cuối file.

## 5W1H (tóm tắt)

| | |
|---|---|
| **Who** | Người dựng v2 dùng để rà soát; mọi vai trò xem popup (Admin, Viewer, QC, Giám sát, TBP DVBH, CSKH, TN CSKH, TBP CSKH, KSNB Đối tác) là người hưởng kết quả. |
| **When** | Trước khi deploy v2 làm giao diện mặc định. |
| **Where** | File này; cột "Vị trí đề xuất v2" là chỗ cần đặt trong thẻ bước / dãy tab "Thông tin ngoài 8 bước". |
| **What** | Danh sách đầy đủ nhãn · nút · hộp thoại · điều kiện quyền của popup cũ. |
| **Why** | Giám đốc yêu cầu "đảm bảo đủ thông tin cần hiển thị" khi thay giao diện mặc định. |
| **How** | Đi từng dòng; dòng đánh dấu ⚠️ là chỗ mẫu E2 chưa nói tới → phải bổ sung vào v2. |

## 0. Quy ước + phát hiện chung

**Ký hiệu cột "Ghi?"**: ✏️ = có thao tác ghi (gọi API ghi) · 👁 = chỉ xem · 💾 = chỉ lưu trên máy (localStorage).

**Rút gọn vai trò**: GS = Giám sát · TBP = TBP DVBH · KSNB = KSNB Đối tác (cờ `la_ksnb_doi_tac`).

**Nhận xét về "logic chọn tab theo vai trò"**: popup cũ **không ẩn/hiện tab theo vai trò**. Mọi vai trò thấy cùng bộ tab; chỉ có (a) tab `NSKX` phụ thuộc module `ql-nskx` + đối tác NSKX + quốc gia VN, (b) tab rỗng bị gom vào "+N tab trống" (trừ `Thông tin`, `NSKX`, `Tiến trình chung`, `GT tồn`, và tab đang mở), (c) **nút ghi** bị ẩn/khóa theo cờ quyền tính ở `App.tsx:166-175`. Các dòng ~664–673 là bộ tab con của thẻ Thông tin theo "Kiểu 1/2/3", dòng ~2764–2800 là danh sách tab chính (Ngắn gọn thêm tab `Thông tin`).

**Cờ quyền (App.tsx:166-175 + trong CaseDetail)**

| Cờ | Vai trò được | Dùng cho |
|---|---|---|
| `canGiaiTrinh` | GS, TBP, Admin | "+ Thêm giải trình" (tab GT tồn) |
| `canGsLap` | GS, Admin | Đánh giá lặp phần Giám sát, Bỏ qua nhanh, Blacklist |
| `canQcLap` | QC, Admin | Đánh giá lặp phần QC, Bỏ qua nhanh, Blacklist |
| `canNapGas` | GS, TBP, Admin | Form Chốt đánh giá nạp gas |
| `canHuyCa` | Admin | Hủy ca / Bỏ hủy ca |
| `canGiaiTrinhViPham` | GS, Admin | "Giải trình thay" (vi phạm) |
| `canChotCap2ViPham` | QC, Admin | "Chốt lỗi" / "Bỏ lỗi" + sửa Kết quả cấp 1 |
| `canTaoViPhamThuCong` | mọi vai trò **trừ Viewer** | "+ Tạo vi phạm thủ công" |
| `canWriteTranhChap(user, khu_vuc)` | KSNB, TBP, Admin, QC; GS chỉ khi ca thuộc khu vực phụ trách | Tiếp nhận / thêm log tranh chấp; thao tác luồng Đổi trả |
| `canConfirmAiTranhChap` | như trên + TBP CSKH; CSKH/TN CSKH khi đúng khu vực phụ trách | "Đúng là tranh chấp" / "Không phải tranh chấp" |
| `canWriteCskhPhase` | KSNB, TBP, Admin, QC | "+ Thêm log" khi tiến trình đang ở giai đoạn CSKH |
| `canEditTienTrinhMeta` | KSNB, TBP, Admin | Sửa phân loại / mức độ tranh chấp |
| `KTV_PHONE_EDIT_ROLES` | Admin, CSKH, TN CSKH, TBP CSKH | Sửa SĐT KTV (các vai trò khác chỉ xem) |
| Admin (KhuVucField) | Admin | ✎ Sửa khu vực + Khôi phục theo CRM |
| `duocSua` (server trả) | GS khu vực mình + CSKH, TN CSKH, TBP, TBP CSKH, Admin | Sửa doanh thu chuẩn / xuất HĐ / hạn BH (DtHdBhPanel) |
| NSKX xác nhận lõi | GS khu vực, TBP, Admin | Lưu xác nhận lõi lọc |
| `coNskx` | người có module `ql-nskx` | Hiện tab NSKX |

**Tab mở mặc định**: Mở rộng → `giai-trinh` (GT tồn); Ngắn gọn / điện thoại (<768px) → `info`. Module ngoài có thể mở thẳng 1 tab: `openCase(id, tab)`. ⚠️ `VALID_TABS` ở `App.tsx:188-191` chỉ liệt kê `nskx, tien-trinh-chung, giai-trinh, vi-pham, khao-sat, ca-lap, nap-gas, tranh-chap, luong-mail` (+`info` ở Ngắn gọn) — **thiếu** `bien-ban-hop, bao-hanh-app, mua-hang, thieu-hang, po-dat-hang, qc-thuc-te`, nên khi đổi chế độ xem / bấm sang ca liên quan, các tab này bị đưa về tab đầu (hành vi có sẵn của v1). v2 cần nhận đúng các khóa tab cũ để link từ module ngoài không gãy.

---

## 1. Thanh tiêu đề (cố định trên cùng, 2 chế độ xem)

| # | Mục | Nằm ở đâu trong v1 | Ai thấy | Ghi? | Vị trí đề xuất v2 |
|---|---|---|---|---|---|
| 1.1 | Tiêu đề "Chi tiết ca {mã}" | headerBar | Tất cả | 👁 | Giữ nguyên thanh tiêu đề |
| 1.2 | Nhãn trạng thái ca: Đang tồn đọng / Đã hoàn thành / Thất bại (`caseStatusBadge`) | headerBar | Tất cả | 👁 | Giữ nguyên |
| 1.3 | Nhãn Mức độ (`mucDoBadge`) | headerBar | Tất cả | 👁 | Giữ nguyên |
| 1.4 | Nhãn số ảnh / video (Odoo) (`soLuongAnhBadge`) | headerBar | Tất cả | 👁 | Giữ nguyên |
| 1.5 | Nhãn "KH không hài lòng" (`khongHaiLongBadge`) | headerBar | Tất cả | 👁 | Giữ nguyên |
| 1.6 | Nhãn "🚫 Đã hủy: {lý do}" (`huy_bo_at`) | headerBar | Tất cả | 👁 | Giữ nguyên |
| 1.7 | Dãy nhãn cảnh báo `computeCaseTickers` (tồn chưa giải trình, lỡ kế hoạch, ca lặp cần xử lý, vi phạm chờ khảo sát, cấp 1 / cấp 2…) | headerBar | Tất cả | 👁 | Giữ nguyên |
| 1.8 | Nút "🔗 Link CRM" | headerBar (+ trường Link CRM trong Phân loại & nguồn gốc) | Tất cả | 👁 | Giữ nguyên; trường trong Bước 1 giữ thêm |
| 1.9 | Nút "Hủy ca" (+ hộp thoại Xác nhận hủy ca, ô Lý do tùy chọn) | headerBar | Admin | ✏️ `POST /cases/:id/huy` | Giữ nguyên |
| 1.10 | Nút "Bỏ hủy ca" khi ca đã hủy | headerBar | Admin | ✏️ `POST /cases/:id/bo-huy` | Giữ nguyên |
| 1.11 | "← Quay lại" và "⏮ Về ca {gốc}" (khi mở ca khác từ chuỗi serial / Đổi trả) | headerBar (`canGoBack`) | Tất cả | 👁 | Giữ nguyên |
| 1.12 | Banner "💾 Dữ liệu khách hàng đã lưu về máy bạn · 🕐 {giờ} · 🔄 Đồng bộ lại" (ca đã đóng, đọc từ IndexedDB) | headerBar (Mở rộng) / đầu tab Thông tin (Ngắn gọn) | Tất cả (ca đã đóng) | 👁 + làm mới cache | Giữ nguyên ở thanh tiêu đề; Ngắn gọn: đầu thân popup |
| 1.13 | Nút chuyển "Ngắn gọn / Mở rộng" (ẩn trên điện thoại) | headerBar | Tất cả | 💾 (ngăn xếp ca) | Giữ nguyên + thêm nút v1 / v2 cạnh đó |
| 1.14 | Nút ✕ đóng popup (+ bấm nền mờ ở Ngắn gọn) | headerBar | Tất cả | 👁 | Giữ nguyên |
| 1.15 | Trạng thái tải (`LoadingInline`) khi chưa có dữ liệu | Thân popup | Tất cả | 👁 | Giữ nguyên |

## 2. Khung popup, chế độ xem, so sánh 2 ca

| # | Mục | Nằm ở đâu trong v1 | Ai thấy | Ghi? | Vị trí đề xuất v2 |
|---|---|---|---|---|---|
| 2.1 | **Mở rộng**: hộp 95vw × 92vh, 2 cột — cột trái "Thông tin" luôn hiện + cột phải dãy tab | CaseDetail (expanded) | Máy tính | 👁 | v2: dải 8 bước + lưới thẻ + dãy tab ngoài 8 bước (khung 98% theo mẫu) |
| 2.2 | **Ngắn gọn**: ngăn kéo phải rộng `max-w-2xl`, 1 dãy tab, mặc định tab Thông tin; điện thoại luôn ở chế độ này | CaseDetail (compact) | Điện thoại / máy tính chọn | 👁 | v2: thanh 8 chấm + danh sách bước dọc (theo mẫu) |
| 2.3 | ⚠️ **So sánh 2 ca (`compareId`)**: bấm 1 dòng khác trong "Chuỗi lịch sử theo serial" (tab Ca lặp, chỉ ở Mở rộng) → mở **cột giữa "Ca đối chiếu: {mã}"** (có nhãn trạng thái / mức độ / ảnh / không hài lòng / cảnh báo / Link CRM, nút ✕ đóng) hiển thị lại toàn bộ thẻ Thông tin (kể cả 4 tab con, ⚙, Kiểu xem) ở chế độ chỉ xem. Bấm dòng của ca đang xem để đóng. Ở Ngắn gọn bấm dòng → chuyển popup sang ca đó | Tab Ca lặp → cột giữa | Tất cả | 👁 | **E2 không nhắc.** Cần chỗ đứng trong v2: nút "So sánh" trên dòng chuỗi serial ở tab Ca lặp, mở khung đối chiếu cạnh thẻ Thông tin (hoặc ngăn kéo phụ) |
| 2.4 | ⚠️ **Kiểu xem 1 / 2 / 3** của thẻ Thông tin (Kiểu 1: 7 tab con; Kiểu 2: 5 tab; Kiểu 3: 1 tab xếp dọc) — lưu từng máy, dùng chung cho ca gốc + ca đối chiếu | Đầu thẻ Thông tin | Tất cả | 💾 | E2 chỉ nói "giữ nút ⚙". Cần quyết: v2 bỏ Kiểu xem (Bước 1 xếp dọc như Kiểu 3) hay giữ |
| 2.5 | Nút ⚙ "Thông tin hiển thị" — tick ẩn/hiện từng trường theo 4 nhóm (Cơ bản 18 trường, Xử lý 12, Bổ sung 5, Lỗi 1: "Thông số nước"), nút "Hiện tất cả"; lưu trên máy | Đầu thẻ Thông tin | Tất cả | 💾 `dvbh_case_info_an_truong` | Bước 1 › Thông tin case (giữ nguyên, dùng chung khóa lưu) |
| 2.6 | Dãy tab "+N tab trống ▾ / Thu gọn ▲" (gom tab rỗng) | Cạnh thanh tab | Tất cả | 💾 (trạng thái) | Dãy tab "Thông tin ngoài 8 bước" — "+N mục trống" (E2 đã có) |
| 2.7 | Cache ca đã đóng (IndexedDB + `detailVersion` kiểm tra còn mới) + `Đồng bộ lại` | `fetchCaseDetailCached` | Tất cả | 💾 | Giữ nguyên (logic) — v2 dùng chung nguồn dữ liệu |
| 2.8 | Reset form dở dang khi đổi `caseId` (nạp gas, blacklist, ca lặp, so sánh, Kiểu tab…) | `useEffect([caseId])` | — | — | Giữ hành vi khi v2 đổi ca |

## 3. Cột / tab "Thông tin" (thẻ Thông tin case)

Nằm ở cột trái (Mở rộng) hoặc tab `Thông tin` (Ngắn gọn). Mọi trường bên dưới đều có thể ẩn bằng ⚙ (khóa = nhãn).

### 3.1 Tab con "Cơ bản" → v2: **Bước 1 › Thông tin case** (và thẻ tóm tắt đầu popup)

| # | Trường / nút | Ai thấy | Ghi? | Vị trí đề xuất v2 |
|---|---|---|---|---|
| 3.1.1 | Khách hàng | Tất cả | 👁 | Thẻ tóm tắt đầu popup + Bước 1 |
| 3.1.2 | Serial (bấm → hộp thoại "Các ca trùng serial") | Tất cả | 👁 | Bước 1 |
| 3.1.3 | Nút "➕ Blacklist" cạnh Serial (hoặc nhãn "🚫 Đã blacklist", serial gạch ngang) + hộp thoại Xác nhận thêm vào blacklist | `canGsLap` hoặc `canQcLap` (GS, QC, Admin) | ✏️ `POST /ca-lap/blacklist` | Bước 1 |
| 3.1.4 | ID Lada (`LadaIds`, chỉ khi ca có liên kết Lada) | Tất cả | 👁 | Bước 1 ⚠️ E2 không nêu |
| 3.1.5 | Khu vực + nút ✎ Sửa khu vực (hộp thoại chọn khu vực) + nhãn "Sửa tay · {người} · {giờ} · CRM: {gốc}" + "Khôi phục theo CRM" | Xem: tất cả · Sửa: **Admin** | ✏️ `PATCH/DELETE /cases/:id/khu-vuc` | Bước 1 ⚠️ E2 không nêu |
| 3.1.6 | Địa chỉ: ca Odoo (mã `SC…`) luôn 2 dòng Mới / Cũ ("— (Odoo không nhập)"); ca khác: địa chỉ mới quy đổi từ tỉnh cũ (`DiaChiCaCu`) | Tất cả | 👁 | Bước 1 (ẩn riêng Mới / Cũ qua ⚙) |
| 3.1.7 | Hãng / Nhóm SP | Tất cả | 👁 | Thẻ tóm tắt + Bước 1 |
| 3.1.8 | Trạm triển khai (tên + SĐT, bấm mở hộp thoại SĐT KTV) | Xem: tất cả · Sửa SĐT: Admin, CSKH, TN CSKH, TBP CSKH | ✏️ `POST/DELETE /settings/ktv-lien-he` | Thẻ tóm tắt + Bước 1 ⚠️ hộp thoại SĐT E2 không nêu |
| 3.1.9 | KTV triển khai ("= Trạm triển khai" nếu trùng) + trạng thái Odoo: ✓ Đã nhận việc / Chưa xác nhận nhận việc, check-in (xổ ▾ danh sách, "Lệch > 200m"), lý do trả việc | Tất cả | 👁 | Bước 1 / Bước 5 tùy v2 (giữ trong Bước 1) |
| 3.1.10 | Khung **"Thời hạn và SLA"**: Tiếp nhận CSKH · Hẹn xử lý · Thời gian hoàn thành · Dự kiến hoàn thành (giải trình gần nhất) · Đúng hạn / Xử lý 24h · Đúng hạn không loại trừ (giờ) · SLA Odoo (Trễ SLA Xh / Quá SLA / Kịp SLA, lệch khu vực) | Tất cả | 👁 | Chia theo bước: Tiếp nhận → Bước 1; Hẹn → Bước 2; Hoàn thành → Bước 6; SLA Odoo → chip SLA từng bước; vẫn giữ nguyên khung trong Bước 1 để không rơi trường ⚠️ |
| 3.1.11 | Ngày import · Cập nhật gần nhất | Tất cả | 👁 | Bước 1 |

### 3.2 Tab con "Xử lý" → **Bước 1 / Bước 6** (giữ nguyên nhóm trong Bước 1 › Thông tin case)

| # | Trường | Ghi chú | Vị trí đề xuất v2 |
|---|---|---|---|
| 3.2.1 | Nhóm / Loại yêu cầu · Mức độ · Cách thức xử lý · Sản phẩm bảo hành · Hình thức bảo hành | Chỉ xem | Bước 1 |
| 3.2.2 | Ghi chú loại dịch vụ (chỉ khi có) | Chỉ xem | Bước 1 |
| 3.2.3 | Tiến độ hoàn thành + dòng con "↳ {trạng thái Odoo}" | Chỉ xem | Bước 6 (Đóng ca) |
| 3.2.4 | Lý do hủy · Lý do quá hạn | Chỉ xem | Bước 1 / Bước 6 |
| 3.2.5 | Hiện tượng lỗi (Odoo: KH báo / KTV xác định, đánh dấu khác nhau) · Mô tả lỗi · Lưu ý lỗi linh kiện | Chỉ xem | Bước 1 ⚠️ E2 không nêu riêng |
| 3.2.6 | **Nội dung xử lý chi tiết** | Chỉ xem | Bước 6 (E2 đã nêu) |

### 3.3 Tab con "Bổ sung" → **Bước 6 / Bước 1**

| # | Mục | Ai thấy | Ghi? | Vị trí đề xuất v2 |
|---|---|---|---|---|
| 3.3.1 | **Hình ảnh báo cáo công việc (N ảnh · M video)**: thư viện ảnh `CaseImageGallery` (lưới thu nhỏ, mở phóng to, zoom, ‹ ›, về kích thước gốc) + liên kết Ảnh & Video Odoo (`OdooMediaLinks`, mở tab mới, phân nhóm) | Tất cả | 👁 | Bước 6 (E2 đã nêu) |
| 3.3.2 | **Doanh thu / Doanh thu và thu phí**: DT sản phẩm · DT linh kiện · DT dịch vụ · Thu phí (Odoo: mất phí / không thu, đã thu, đã nhập thu tiền) | Tất cả | 👁 | Bước 6 (E2 đã nêu) |
| 3.3.3 | ⚠️ **Khối "Doanh thu chuẩn · Xuất hóa đơn · Hạn bảo hành"** (`DtHdBhPanel`): xem DT chuẩn (Đã sửa / theo CRM) + "CRM gốc: SP/LK/DV — người · giờ · lý do"; nút ✎ Sửa doanh thu (3 ô số + Lý do bắt buộc) + Khôi phục theo CRM; Đơn xuất hóa đơn Có/Không (nút Tự động / Có / Không; mã MISA, KT chốt); Hạn bảo hành (ngày mua +24 tháng / ngày SX +36 tháng; nút Tự động / Còn BH / Hết BH); "▾ Nhật ký sửa (N)" | Xem: tất cả · Sửa: theo `duocSua` (GS khu vực mình, CSKH, TN CSKH, TBP, TBP CSKH, Admin) | ✏️ `PUT/DELETE /sua-doanh-thu/ca/:id/{doanh-thu,hoa-don,bao-hanh}` | Bước 6 › Doanh thu — **E2 chỉ nêu "Doanh thu và thu phí", không nêu khối sửa có ghi này** |
| 3.3.4 | **Phân loại & nguồn gốc**: Đối tác · Ngày mua · Ngày sản xuất · Nhóm khách hàng · Bảo hành nhà máy (ngày xuất kho, mã) · Ngành / Loại ngành · Link CRM | Tất cả | 👁 | Bước 1 (E2 đã nêu) |

### 3.4 Tab con "Lỗi" (`loi-linh-kien`, đếm số LK lỗi) → **Bước 3** (E2: "tab con Lỗi (lỗi linh kiện)")

| # | Mục | Ghi? | Vị trí đề xuất v2 |
|---|---|---|---|
| 3.4.1 | Dải "Thông số nước tại nhà KH" (TDS tại vòi / nước thải…, ẩn được qua ⚙ nhóm Lỗi) | 👁 | Bước 3 ⚠️ E2 không nêu |
| 3.4.2 | `LoiLinhKienPanel`: từng linh kiện báo lỗi (hiện tượng, nhóm lỗi — nguyên nhân, cách xử lý, ghi chú), gắn dưới mỗi LK các **đơn bảo hành Odoo** (trạng thái: Chưa tiếp nhận / Đang sửa chữa / Đã sửa xong / Hoàn thành / Hủy / Từ chối) kèm nhãn trạng thái **sửa chữa app Gửi BH** (KTV đã đóng thùng → … → KTV đã nhận lại) và nhóm đơn "không khớp"; bấm "Chi tiết ›" mở thẻ đầy đủ | 👁 | Bước 3 (+ đơn BH → Bước 8 theo E2) |

### 3.5 Tab con "Gửi BH" (`bao-hanh`, đếm đơn BH Odoo) → E2: **Bước 8**

| # | Mục | Ghi? | Vị trí đề xuất v2 |
|---|---|---|---|
| 3.5.1 | "Nguồn Odoo (N) — chi tiết theo linh kiện ở mục Lỗi" + `DonBaoHanhOdooList`: mã đơn, "Mở trên Odoo ↗", Thông tin bảo hành (linh kiện, SL, đơn giá, thành tiền, tình trạng lỗi, ghi chú), Thông tin cập nhật (người tạo, ngày tạo, ngày hoàn thành, cập nhật Odoo, đồng bộ về dvbh), "Linh kiện báo lỗi (cha)", đánh dấu "Đã lưu trữ" | 👁 | Bước 8 (E2). Lưu ý Kiểu 3 không xếp riêng mục này vì đã hiện trong "Lỗi" |

### 3.6 Tab con "Lịch hẹn" (`lich-hen`) → **Bước 2**

| # | Mục | Ghi? | Vị trí đề xuất v2 |
|---|---|---|---|
| 3.6.1 | Từng lịch hẹn: bên hẹn (KTV / Khách hàng), trạng thái (Đang hoạt động / Đã chuyển / Đã hủy), nhãn "Hiện tại", thời gian, ảnh / video bằng chứng (mở tab mới), "Tạo lúc"; trống: "Ca này chưa có lịch hẹn kỹ thuật" | 👁 | Bước 2 |

### 3.7 Tab con "Xin hủy" (`yeu-cau-huy`) → **Bước 1** (E2)

| # | Mục | Ghi? | Vị trí đề xuất v2 |
|---|---|---|---|
| 3.7.1 | Thẻ "Đang chờ duyệt hủy / Đã xử lý": Người xin hủy · Thời điểm · Lý do · Ghi chú; thẻ "Quyết định của CSKH": lý do quyết định, ghi chú CSKH, ghi chú KTV, lý do / ghi chú hủy cuối (nguồn Odoo, 1 trạng thái hiện tại) | 👁 | Bước 1 |

### 3.8 Hộp thoại "Các ca trùng serial {serial}"
Danh sách ca cùng serial (mới nhất trên đầu; ca đang xem đánh dấu "📍 Ca đang xem", "🚫 Đã hủy", tiếp nhận / hoàn thành / KTV / tiến độ); bấm 1 ca → mở ca đó (đẩy vào ngăn xếp, có "← Quay lại"). Ai thấy: tất cả · 👁. **Vị trí v2:** giữ nguyên, mở từ Serial ở Bước 1 (E2 đã nêu).

---

## 4. Các tab còn lại (dãy tab chính) — nội dung, nút, quyền

Khóa tab v1 ghi trong ngoặc. Số đếm trên tab lấy theo bảng dưới.

| # | Tab v1 (khóa · số đếm) | Nội dung hiển thị | Nút / hộp thoại + điều kiện quyền | Ghi? | Vị trí đề xuất v2 |
|---|---|---|---|---|---|
| 4.1 | **GT tồn** (`giai-trinh` · số lần giải trình) — tab mặc định ở Mở rộng | `GiaiTrinhLichSu`: "Lịch sử giải trình" (gộp theo lý do giống nhau, "×N lần", "▸ Xem N giải trình trước", "Hiện từng giải trình / Gộp lý do giống nhau"), chip lý do + YC có hàng (quá hẹn), mã xuất hàng, chip nhảy sang tab Mua hàng / Thiếu hàng / PO đặt hàng, "Luồng giải trình theo ngày" (chấm theo ngày: bỏ sót, đổi lý do, ngày đóng, Chủ nhật, hôm nay chưa giải trình); **Nhật ký hệ thống** (chuyển Tồn TBP cấp 1 / Tồn CEO cấp 2 + chỉ tiêu cảnh báo — chỉ để log, không tính là giải trình) | **"+ Thêm giải trình"** (`canGiaiTrinh`: GS, TBP, Admin) → hộp thoại "Thêm giải trình — Ca X": Lý do chậm\*, (nếu lý do thuộc thiếu LK: Linh kiện thiếu\*, Ngày yêu cầu có hàng\*, Mã xuất hàng liên quan\*), Nội dung\*, Ngày dự kiến hoàn thành mới\*; tự điền theo giải trình gần nhất; Hủy / Gửi giải trình. Áp dụng cả ca đã đóng | ✏️ `POST /cases/:id/giai-trinh` | Bước 6 › Giải trình tồn (E2). ⚠️ Các chip nhảy tab (Mua hàng/Thiếu hàng/PO) và "Luồng giải trình theo ngày" E2 không nêu — cần giữ, chip phải trỏ sang Bước 3 / Bước 4 |
| 4.2 | **Biên bản họp** (`bien-ban-hop` · số biên bản) | Ô nhập "Ghi nội dung cuộc họp về ca này…" + "Nhật ký biên bản họp" (giờ · người ghi · nội dung) | "+ Lưu biên bản họp" — **mọi vai trò xem popup** (không có cờ riêng ở UI; server kiểm) | ✏️ `POST /cases/:id/bien-ban-hop` (chỉ thêm) | Bước 6 › Biên bản họp (E2) |
| 4.3 | **Vi phạm** (`vi-pham` · số vi phạm) | Mỗi vi phạm: loại lỗi, nhãn trạng thái (Nghi ngờ / chờ QC / đã xác nhận / Không vi phạm), "✓ Đã đẩy sang app vi phạm", Kết quả cấp 1, Người ghi nhận, Ngày ghi nhận, **Ghi chú mô tả lỗi** (hoặc ghi chú cuộc gọi khảo sát), khối giải trình: "Giải trình của KTV" (từ app vi phạm) / "Giải trình của giám sát", ảnh bằng chứng, **Chốt lỗi của QC** (kết quả, người, ngày chốt cấp 2); "Không có lỗi — không cần giải trình" | "+ Tạo vi phạm thủ công" (mọi vai trò trừ Viewer) → hộp thoại: Loại lỗi\* (danh mục + "Không có lỗi"), Ghi chú (bắt buộc với loại lỗi bắt buộc ghi chú), Ngày ghi nhận · "**Giải trình thay**" (GS, Admin) → hộp thoại: Ngày giải trình\*, Nội dung, Ghi chú, tối đa 5 ảnh · "**Chốt lỗi** / **Bỏ lỗi**" + ô chọn lại Kết quả cấp 1 (QC, Admin; chỉ khi đang chờ QC, không áp dụng "Không lỗi") | ✏️ `POST /vi-pham/case/:id`, `POST /vi-pham/:id/giai-trinh` (+ `/anh`), `PATCH /vi-pham/:id/cap2` | Mã lỗi trên đúng bước + "Hồ sơ vi phạm" trong từng lỗi (E2); nút "⚠ Ghi nhận lỗi" = Tạo vi phạm thủ công. Tab "Vi phạm" ngoài 8 bước cũng nằm trong dãy (theo yêu cầu bố cục) |
| 4.4 | **Khảo sát** (`khao-sat` · số cuộc gọi + 1 nếu có khảo sát Odoo) | Thẻ "Khảo sát CSKH (Odoo)" (cuộc gọi, đánh giá, lý do, ghi chú); mỗi cuộc gọi CSKH: kết quả, "Cần gọi lại / Không cần gọi lại", giờ, nhãn loại khảo sát, đối tượng liên hệ, người thực hiện, lý do thất bại, ghi chú | Không có nút | 👁 | Ngoài 8 bước › Khảo sát (E2) |
| 4.5 | **Ca lặp** (`ca-lap` · 1 nếu có phát hiện) | "Ca liền trước: {mã} · hoàn thành …" + nhãn số ngày; nhãn trạng thái lặp; **Chuỗi lịch sử theo serial** (mỗi dòng: giờ hoàn thành, (GS: … QC: …), ID ca, KTV, tiến độ, cách thức xử lý rút gọn bấm xem đủ, "↳ cách ca sau X ngày", "📍 Ca đang xem"); trống: "Không phát hiện ca lặp (cùng serial, hoàn thành trong 45 ngày)" | "🔒 Xử lý ca lặp" (`canGsLap`/`canQcLap`) hoặc "👁 Xem giải trình lặp" (người khác) → `CaLapEvalModal`: Giám sát (lần 1: Hình thức xử lý, Đánh giá lặp, mô tả → 🔒 Chốt lặp) + QC chốt (lần 2: Đánh giá, Hình thức, ghi chú → 🔒 Chốt lặp) · trên từng dòng chuỗi: "🔒 Đánh giá lặp", **"Bỏ qua"** (lưu nhanh Bỏ qua + Tính lương), "Không tính lặp", "🔗 CRM" (GS, QC, Admin) · bấm dòng = **so sánh 2 ca** (xem 2.3) | ✏️ `POST /ca-lap/:id/gs`, `/qc` | Ngoài 8 bước › Ca lặp (E2). ⚠️ "Bỏ qua" nhanh + so sánh 2 ca E2 không nêu |
| 4.6 | **Nạp gas** (`nap-gas` · 1 nếu đã chốt) | Ghi chú "chưa được CRM đánh dấu Nghi ngờ nạp gas"; nếu đã chốt: nhãn đánh giá + Phí dịch vụ + người · giờ chốt; "Chưa có đánh giá nạp gas"; cảnh báo khóa sau 45 ngày kể từ hoàn thành | Form "Đánh giá nạp gas" + "Phí dịch vụ" + "🔒 Chốt đánh giá / Chốt lại" (`canNapGas`: GS, TBP, Admin; khóa khi quá 45 ngày) | ✏️ `PATCH /nap-gas/:id/danh-gia` | Ngoài 8 bước › Nạp gas (E2) |
| 4.7 | **Bảo hành** (`bao-hanh-app` · số đơn) — app Gửi bảo hành (suachua) | `SuaChuaPanel`: từng đơn (LK, mã thùng, mở trên app Gửi BH, hướng xử lý, KTV đề xuất, ngày tạo, tổng thời gian xử lý, luồng mốc, "▾ Xem chi tiết": KTV gửi, SL khai / thực nhận, sự cố tiếp nhận, loại BH, LK thực tế, loại đối trừ, **xử lý xác**, phiếu trả, mã vận đơn trả, mã đơn hàng, mã MISA, ghi chú Admin / NV, kế toán từ chối, KTV báo không nhận được, KTV đánh giá; log) | Link mở app ngoài; không có nút ghi trong popup | 👁 | Bước 6 › Bảo hành (E2). ⚠️ Các trường "xử lý xác / phiếu trả / KTV gửi / nhận lại" liên quan **Bước 7 Trả xác 3T** và **Bước 8 Xác nhận xác** — E2 ghi "❌ cần nguồn" nhưng dữ liệu này có sẵn ở đây |
| 4.8 | **Mua hàng** (`mua-hang` · số đơn LK) | "Hệ Đặt mua linh kiện": `MuaHangDonList` (luồng đặt → giao ngang, đơn hủy thu gọn, "▾ chi tiết"); trạng thái tải / chưa cấu hình / lỗi kết nối; "Không có đơn nào gắn với ca này" | Link mở app Đặt linh kiện | 👁 | Bước 3 (E2: đơn LK, trạng thái phiếu) |
| 4.9 | **Thiếu hàng** (`thieu-hang` · số yêu cầu) | `ThieuHangTicketList` (luồng ngang từng ticket, ticket hủy thu gọn); trống: có yêu cầu nhưng chưa có chi tiết / không có | Không | 👁 | Bước 4 (E2) |
| 4.10 | **PO đặt hàng** (`po-dat-hang` · số PO) | Banner đồng bộ Google Sheet (CacheBanner, "Đồng bộ lại" / "Đang đồng bộ lần đầu…"); `PoDatHangList` (PO khớp theo ID CRM / mã LK thiếu + PO có "ID đặt hàng" trùng mã đặt hàng của ca; nhãn lý do liên quan; ghi chú; "▾ chi tiết") | **"🔍 Xem đầy đủ"** → hộp thoại hiện toàn bộ cột gốc của sheet | 👁 (+ làm mới cache) | Bước 4 (E2). ⚠️ Banner đồng bộ Sheet và hộp thoại "Xem đầy đủ" E2 không nêu |
| 4.11 | **QC thực tế** (`qc-thuc-te` · số dòng) | Banner đồng bộ Sheet; mỗi dòng: tên KTV, kết quả (Đạt / Không đạt), ID CRM, Ngày KTV đóng ca, Số lượng lỗi, Điểm chuẩn / trừ / thực, Ngày đánh giá, Người đánh giá, Đánh giá lỗi báo cáo CRM, Chi tiết đánh giá, Ghi chú | "🔍 Xem đầy đủ" (hộp thoại toàn bộ cột sheet) | 👁 | Bước 6 › QC thực tế (E2). ⚠️ như 4.10 |
| 4.12 | **Tranh chấp** (`tranh-chap` · số tiến trình) | Thông báo trạng thái (AI nghi tranh chấp đang chờ xác nhận / chưa có tiến trình / chưa được CRM đánh dấu); mỗi tiến trình `TienTrinhPanel`: phân loại, mức độ (sửa được), lịch log (trạng thái xử lý, người, ghi chú, người đang chờ xử lý), log con (phản hồi) | **"Đúng là tranh chấp" / "Không phải tranh chấp"** (ca "chờ xác nhận AI" + `canConfirmAiTranhChap`) · **"+ Tạo yêu cầu giải quyết tranh chấp, khiếu nại"** (chưa có tiến trình mở + `canWriteTranhChap`) → hộp thoại **TiepNhanModal** (phân loại, mức độ, trạng thái xử lý, ghi chú, dự kiến xong, kết quả, hài lòng sau tranh chấp, lý do tồn) · trong từng tiến trình: **"+ Thêm log"** (`canWrite`, tiến trình chưa đóng; giai đoạn CSKH chỉ TBP/Admin/QC/KSNB), sửa log (tác giả), thêm log con (`canWriteLogCon`), sửa phân loại / mức độ (`canEditTienTrinhMeta`), nút mở ca (trong module Tranh chấp) | ✏️ `POST /tranh-chap/:caseId/tiep-nhan`, `/xac-nhan-ai`, `/tien-trinh/:id/log`, `/log/:id/log-con`, `PATCH /log/:id`, `PATCH /tien-trinh/:id` | Ngoài 8 bước › Tranh chấp (E2 chỉ nêu hộp thoại Tiếp nhận). ⚠️ Cần giữ toàn bộ nút trong từng tiến trình + 2 nút Xác nhận AI |
| 4.13 | **Đổi trả** (`luong-mail` · số thư) | `LuongMailPanel`: luồng đổi trả (Phát sinh → Karofi đã tiếp nhận → Chờ duyệt đổi → Đã duyệt → Karofi giao xử lý → Đã lên SO → Đã lên DO), thẻ "Ca mới đổi cho KH" (mã ca đổi bấm mở ca, sản phẩm, mở ca mới, tiến độ, đổi trả thành công, nhãn tự gán / gợi ý / nhiều ứng viên), danh sách thư (‹ Thư trước / ›, nhãn Đề xuất / Duyệt, "Mở link") + nhật ký thao tác | (`canWriteTranhChap`) "Thêm vào luồng đổi trả", "Kết thúc / Mở lại luồng", "Gán ca đổi" (ô nhập mã + "Chọn ca này"), "Không có ca mới", "Bỏ xác nhận", "Bỏ gán / nhập lại" | ✏️ `POST /cases/:id/doi-tra/:action` | Ngoài 8 bước › Đổi trả (E2) |
| 4.14 | **NSKX** (`nskx` — chỉ khi `coNskx` + đối tác NSKX + VN; luôn hiện, không bị gom) | Luồng ngang Tiếp nhận → Hoàn thành → Đánh giá lõi → Đặt lõi (đơn TG12 bên app Linh kiện); Đánh giá lõi lọc (Chưa đánh giá / Có thay / Không thay / Tự động không thay / Không áp dụng); lịch sử xác nhận; thông tin đặt lõi (mã đơn, linh kiện, loại đề xuất, trạng thái, ngày tạo); linh kiện sửa chữa trên ca | Nút mở đặt lõi; form xác nhận (Có thay / Không thay / Không áp dụng, chọn lõi — gợi ý "Lõi thường dùng", ô "Chỉ lõi lọc", ghi chú) + "Lưu xác nhận" (GS khu vực, TBP, Admin; người khác thấy dòng "Chỉ Giám sát khu vực / TBP DVBH / Admin được xác nhận lõi lọc") | ✏️ `PUT /ql-nskx/:id/loi-loc` | Ngoài 8 bước › NSKX (E2) |
| 4.15 | **Tiến trình chung** (`tien-trinh-chung` · số mốc) | "Luồng xử lý ca" (đường ngang: Tiếp nhận → GT tồn → Đặt LK → Giao LK → Bảo hành → Đổi trả → Khảo sát → Vi phạm → Tranh chấp → Đóng ca, mốc đang chờ tô nổi); thanh tổng thời gian (xử lý case, tranh chấp / KN, đặt hàng, sửa chữa bảo hành, thiếu hàng, tính theo ngày); chip lọc theo nguồn (ca / giải trình / vi phạm / tranh chấp / bảo hành / LK / đổi trả / khác — bấm ẩn, có số đếm) + "Hiện log phụ (N)"; dòng thời gian dọc theo ngày: giờ, nhãn loại, người, tóm tắt, "↳ cách mốc trước X ngày", nhóm mốc cùng loại "▸ Xem N log (gồm M log phụ)", "▸ Xem thêm" | Bấm mốc có `jumpTab` → nhảy tới tab / tab con tương ứng (`jumpToTab`: Cơ bản, Lỗi, Gửi BH, Lịch hẹn, Xin hủy hoặc tab chính) | 👁 | Ngoài 8 bước › Tiến trình chung (E2 chỉ nói "nhật ký dọc đầy đủ"). ⚠️ Cần giữ luồng ngang tổng, thanh tổng thời gian, chip lọc nguồn, log phụ, và logic `jumpTab` → đích mới trong v2 |

---

## 5. Hộp thoại (đã gom) — danh mục để v2 không thiếu

| Hộp thoại | Mở từ | Quyền | Có trong E2? |
|---|---|---|---|
| Thêm giải trình — Ca X | Tab GT tồn | GS, TBP, Admin | ✅ |
| Giải trình thay cho KTV (ngày, nội dung, ghi chú, ≤5 ảnh) | Tab Vi phạm | GS, Admin | ✅ |
| Tạo vi phạm thủ công | Tab Vi phạm | Mọi vai trò trừ Viewer | ✅ |
| Xử lý / Đánh giá ca lặp (`CaLapEvalModal`) — mở từ nút đầu tab hoặc từ 1 dòng bất kỳ trong chuỗi | Tab Ca lặp | GS, QC, Admin (người khác chỉ xem) | ✅ |
| Xác nhận thêm vào blacklist | Serial ở thẻ Thông tin | GS, QC, Admin | ✅ |
| Các ca trùng serial | Serial ở thẻ Thông tin | Tất cả | ✅ |
| Xác nhận hủy ca | Thanh tiêu đề | Admin | ✅ |
| Tiếp nhận xử lý tranh chấp (`TiepNhanModal`) | Tab Tranh chấp | `canWriteTranhChap` | ✅ |
| ⚠️ Sửa khu vực ca | ✎ cạnh Khu vực | Admin | ❌ |
| ⚠️ Thông tin liên hệ KTV (SĐT) | Bấm tên Trạm / KTV | Xem: tất cả · sửa: Admin, CSKH, TN CSKH, TBP CSKH | ❌ |
| ⚠️ Sửa doanh thu (3 ô + lý do) — khung nội tuyến trong DtHdBhPanel | Khối Doanh thu | `duocSua` | ❌ |
| ⚠️ "Xem đầy đủ" (toàn bộ cột sheet) PO đặt hàng / QC thực tế | Tab PO / QC thực tế | Tất cả | ❌ |
| ⚠️ Thêm / sửa log tranh chấp, log con, sửa phân loại & mức độ (`TienTrinhPanel` hộp thoại) | Tab Tranh chấp | xem 4.12 | ❌ (E2 chỉ nêu Tiếp nhận) |
| ⚠️ Bảng ⚙ "Thông tin hiển thị" | Đầu thẻ Thông tin | Tất cả | ✅ (nút ⚙) |

---

## 6. Bỏ sót so với mẫu E2

Bảng E2 của mẫu (`mau-goc-v5-apple.html`, mục "E2. Kiểm kê") **chưa nêu** hoặc nêu chưa đủ những mục sau — v2 cần có chỗ đứng cho chúng trước khi bỏ v1:

**A. Không có dòng nào trong E2 (rơi hẳn nếu làm theo E2)**
1. **So sánh 2 ca (`compareId`, cột đối chiếu)** — mở từ chuỗi lịch sử serial ở tab Ca lặp (mục 2.3).
2. **Kiểu xem 1 / 2 / 3** của thẻ Thông tin (mục 2.4) — cần quyết định bỏ hay giữ.
3. **✎ Sửa khu vực (Admin) + nhãn "Sửa tay" + "Khôi phục theo CRM"** (mục 3.1.5).
4. **Hộp thoại SĐT KTV** — sửa số điện thoại cho Admin / CSKH / TN CSKH / TBP CSKH (mục 3.1.8).
5. **Khối "Doanh thu chuẩn · Xuất hóa đơn · Hạn bảo hành"** — có thao tác sửa / khôi phục + nhật ký sửa; E2 chỉ nêu "Doanh thu và thu phí" (mục 3.3.3).
6. **"Xem đầy đủ" (toàn bộ cột Google Sheet)** ở tab PO đặt hàng và QC thực tế + **banner đồng bộ Sheet** (4.10, 4.11).
7. **"Bỏ qua" nhanh** trên từng dòng chuỗi serial (lưu Bỏ qua + Tính lương, không mở hộp thoại) và nhãn "Không tính lặp" (4.5).
8. **Nút Xác nhận AI** "Đúng là tranh chấp / Không phải tranh chấp" và **toàn bộ thao tác trong từng tiến trình tranh chấp** (+ Thêm log, log con, sửa log, sửa phân loại / mức độ) (4.12).
9. **Thao tác luồng Đổi trả**: thêm / kết thúc / mở lại luồng, gán ca đổi máy, "Không có ca mới", điều hướng thư trước / sau (4.13).
10. **Xác nhận lõi lọc NSKX** (form ghi) — E2 chỉ nêu tab (4.14).

**B. Nêu chung chung, dễ bị bỏ sót khi dựng**
11. **Khung "Thời hạn và SLA"** (Đúng hạn không loại trừ, SLA Odoo, Dự kiến hoàn thành theo giải trình gần nhất) — chỉ được nhắc ngầm qua "Cơ bản · Xử lý" (3.1.10).
12. **Dải "Thông số nước tại nhà KH"** trong tab Lỗi (3.4.1) và trường **Hiện tượng lỗi / Mô tả lỗi / Lưu ý lỗi linh kiện** (3.2.5).
13. **ID Lada**, **Bảo hành nhà máy**, **trạng thái nhận việc / check-in / lý do trả việc (Odoo)** (3.1.4, 3.1.9, 3.3.4).
14. **Chip nhảy tab trong GT tồn** (sang Mua hàng / Thiếu hàng / PO) và **"Luồng giải trình theo ngày"** (4.1).
15. **Tiến trình chung**: luồng ngang tổng, thanh tổng thời gian, chip lọc nguồn, "Hiện log phụ", `jumpTab` → đích mới (E2 chỉ nói "nhật ký dọc đầy đủ") (4.15).
16. **Khóa tab cũ khi gọi từ module ngoài** (`openCase(id, tab)`, `jumpToTab`) và `VALID_TABS` thiếu 6 khóa (mục 0).

**C. Ánh xạ cần Giám đốc / người dựng xác nhận**
17. E2 xếp **tab con "Gửi BH"** (đơn BH Odoo) vào **Bước 8 Xác nhận xác** và tab **Bảo hành** (app Gửi BH) vào **Bước 6**; trong khi dữ liệu thực tế "xử lý xác / KTV gửi / kho đã nhận / phiếu trả / KTV đã nhận lại" nằm ở **tab Bảo hành (app Sửa chữa)** (4.7). Bước 7 **Trả xác 3T** hiện "❌ cần nguồn" nhưng có thể lấy từ đây — nên xem lại để Bước 7 / 8 không để trống.
18. **Bước 6 Đóng ca** nhận 6 nhóm nội dung (Giải trình tồn, Biên bản họp, Bảo hành, QC thực tế, Hình ảnh, Doanh thu + Nội dung xử lý) — nên dùng "Xem đầy đủ" chia nhóm để không quá dài, nhưng vẫn không rơi mục nào.

---

*Không có bản chỉnh sửa mã nào trong đợt kiểm kê này; chỉ file này được thêm mới.*
