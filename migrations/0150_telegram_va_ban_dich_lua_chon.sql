-- "Đa quốc gia" GĐ4 (2026-10-29, SRS §12 - chu he thong chot Q3/Q6):
-- (1) Q6 - anh Telegram 08:00 / 17:30 gui RIENG TUNG NUOC vao nhom cua nuoc do (lib/telegram.ts nhomTelegramCuaPhamVi).
--     VN = nhom dang dung tu truoc; nuoc khac Admin nhap o Cai dat -> "Quốc gia". "Tất cả" / NSKX thoi gui.
-- (2) Q3 - INDO dung CHUNG danh muc; moi lua chon trong Cai dat co them ban dich EN / ID, giao dien hien theo ngon ngu
--     nguoi dung (frontend lib/banDichDuLieu.ts). Lua chon hien co: dich san ben duoi (AI dich, chu he thong chot); them
--     moi ve sau Admin nhap tay. Gia tri LUU trong du lieu (giai_trinh.ly_do_cham, vi_pham.ket_qua_cap_1...) van la tieng
--     Viet - chi dich luc hien thi; Excel + anh Telegram giu tieng Viet.

ALTER TABLE quoc_gia ADD COLUMN telegram_chat_id TEXT;
UPDATE quoc_gia SET telegram_chat_id = '-1004389265476' WHERE ma = 'VN';

ALTER TABLE settings_ly_do ADD COLUMN ban_dich_en TEXT;
ALTER TABLE settings_ly_do ADD COLUMN ban_dich_id TEXT;
ALTER TABLE settings_ly_do_cham ADD COLUMN ban_dich_en TEXT;
ALTER TABLE settings_ly_do_cham ADD COLUMN ban_dich_id TEXT;
ALTER TABLE settings_loai_vi_pham ADD COLUMN ban_dich_en TEXT;
ALTER TABLE settings_loai_vi_pham ADD COLUMN ban_dich_id TEXT;
ALTER TABLE settings_phan_loai_tranh_chap ADD COLUMN ban_dich_en TEXT;
ALTER TABLE settings_phan_loai_tranh_chap ADD COLUMN ban_dich_id TEXT;
ALTER TABLE settings_ket_qua_xu_ly_tranh_chap ADD COLUMN ban_dich_en TEXT;
ALTER TABLE settings_ket_qua_xu_ly_tranh_chap ADD COLUMN ban_dich_id TEXT;
ALTER TABLE settings_ly_do_ton_tranh_chap ADD COLUMN ban_dich_en TEXT;
ALTER TABLE settings_ly_do_ton_tranh_chap ADD COLUMN ban_dich_id TEXT;
ALTER TABLE settings_loai_yeu_cau_bo_qua_lap ADD COLUMN ban_dich_en TEXT;
ALTER TABLE settings_loai_yeu_cau_bo_qua_lap ADD COLUMN ban_dich_id TEXT;
ALTER TABLE settings_loai_yeu_cau_doi_tra ADD COLUMN ban_dich_en TEXT;
ALTER TABLE settings_loai_yeu_cau_doi_tra ADD COLUMN ban_dich_id TEXT;
ALTER TABLE settings_luu_y_loi_linh_kien_doi_tra ADD COLUMN ban_dich_en TEXT;
ALTER TABLE settings_luu_y_loi_linh_kien_doi_tra ADD COLUMN ban_dich_id TEXT;
ALTER TABLE settings_loai_de_xuat ADD COLUMN ban_dich_en TEXT;
ALTER TABLE settings_loai_de_xuat ADD COLUMN ban_dich_id TEXT;
ALTER TABLE settings_loai_de_xuat_nhom ADD COLUMN ban_dich_en TEXT;
ALTER TABLE settings_loai_de_xuat_nhom ADD COLUMN ban_dich_id TEXT;
ALTER TABLE settings_loai_vi_pham ADD COLUMN nhom_loi_en TEXT;
ALTER TABLE settings_loai_vi_pham ADD COLUMN nhom_loi_id TEXT;

-- settings_ly_do.ten_ly_do
UPDATE settings_ly_do SET ban_dich_en = 'Case already closed', ban_dich_id = 'Kasus sudah ditutup' WHERE ten_ly_do = 'Case đã được kết thúc' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'Resolution plan not agreed yet', ban_dich_id = 'Rencana penanganan belum disepakati' WHERE ten_ly_do = 'Chưa thống nhất phương án xử lý' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'Awaiting case cancellation approval', ban_dich_id = 'Menunggu persetujuan pembatalan kasus' WHERE ten_ly_do = 'Chờ duyệt hủy ca' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'Awaiting repair at warranty department', ban_dich_id = 'Menunggu perbaikan di bagian garansi' WHERE ten_ly_do = 'Chờ sửa chữa ở phòng BH' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'Awaiting part exchange/return from warranty dept (PBH)', ban_dich_id = 'Menunggu penukaran/retur suku cadang dari bagian garansi (PBH)' WHERE ten_ly_do = 'Chờ xử lý đổi trả linh kiện từ phòng PBH' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'Due to technician', ban_dich_id = 'Karena teknisi' WHERE ten_ly_do = 'Do KTV' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'Due to customer', ban_dich_id = 'Karena pelanggan' WHERE ten_ly_do = 'Do Khách hàng' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'Goods in transit from 3T to technician', ban_dich_id = 'Barang dalam pengiriman dari 3T ke teknisi' WHERE ten_ly_do = 'Do hàng đang chuyển từ 3T đến KTV' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'KRF software system error', ban_dich_id = 'Kesalahan sistem perangkat lunak KRF' WHERE ten_ly_do = 'Do hệ thống phần mềm KRF lỗi' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'Warehouse shipped late', ban_dich_id = 'Gudang terlambat mengirim barang' WHERE ten_ly_do = 'Do kho gửi hàng chậm' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'Due to weather', ban_dich_id = 'Karena cuaca' WHERE ten_ly_do = 'Do thời tiết' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'Slow internal procedures', ban_dich_id = 'Prosedur internal lambat' WHERE ten_ly_do = 'Do thủ tục nội bộ chậm' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'Due to construction progress', ban_dich_id = 'Karena progres proyek konstruksi' WHERE ten_ly_do = 'Do tiến độ công trình' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'Due to dispatching', ban_dich_id = 'Karena penjadwalan/dispatch' WHERE ten_ly_do = 'Do điều phối' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'Carrier delivered late', ban_dich_id = 'Jasa pengiriman terlambat' WHERE ten_ly_do = 'Do đơn vị vận chuyển chậm' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'Difficult terrain', ban_dich_id = 'Medan sulit' WHERE ten_ly_do = 'Do địa hình khó' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'Partner has not delivered unit, materials or parts, or delivered short', ban_dich_id = 'Mitra belum mengirim unit, material atau suku cadang, atau kurang kirim' WHERE ten_ly_do = 'Do đối tác chưa giao máy, vật tư, linh kiện hoặc giao thiếu' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'Explained via dispute', ban_dich_id = 'Dijelaskan melalui sengketa' WHERE ten_ly_do = 'Giải trình qua tranh chấp' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'Other', ban_dich_id = 'Lainnya' WHERE ten_ly_do = 'Khác' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'Customer has not accepted the quotation', ban_dich_id = 'Pelanggan belum menyetujui penawaran harga' WHERE ten_ly_do = 'Khách hàng chưa đồng ý với báo giá' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'Missing parts (company side)', ban_dich_id = 'Kekurangan suku cadang (dari perusahaan)' WHERE ten_ly_do = 'Thiếu linh kiện do công ty' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'Missing parts (no spare stock)', ban_dich_id = 'Kekurangan suku cadang (tidak ada stok cadangan)' WHERE ten_ly_do = 'Thiếu linh kiện do không dự phòng' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'Dispute case to be handled', ban_dich_id = 'Termasuk sengketa yang perlu ditangani' WHERE ten_ly_do = 'Thuộc diện tranh chấp cần xử lý' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'Being repaired at partner technician/station', ban_dich_id = 'Sedang diperbaiki di mitra teknisi/stasiun' WHERE ten_ly_do = 'Đang sửa máy tại nhà CTV/Trạm' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'Done but case not closed / closed late', ban_dich_id = 'Selesai tetapi kasus belum ditutup / terlambat ditutup' WHERE ten_ly_do = 'Đã xong nhưng chưa đóng ca/đóng ca chậm' AND ban_dich_en IS NULL;
UPDATE settings_ly_do SET ban_dich_en = 'B2B partner (ETX) automatic', ban_dich_id = 'Mitra B2B (ETX) otomatis' WHERE ten_ly_do = 'Đối tác B2B (ETX) tự động' AND ban_dich_en IS NULL;
-- settings_ly_do_cham.ten_ly_do
UPDATE settings_ly_do_cham SET ban_dich_en = 'Due to technician', ban_dich_id = 'Karena teknisi' WHERE ten_ly_do = 'Do KTV' AND ban_dich_en IS NULL;
UPDATE settings_ly_do_cham SET ban_dich_en = 'Factory out of stock', ban_dich_id = 'Pabrik kehabisan stok' WHERE ten_ly_do = 'Do nhà máy hết hàng' AND ban_dich_en IS NULL;
UPDATE settings_ly_do_cham SET ban_dich_en = 'Waiting for stock to arrive at warehouse', ban_dich_id = 'Menunggu barang masuk gudang' WHERE ten_ly_do = 'Do chờ hàng về kho' AND ban_dich_en IS NULL;
UPDATE settings_ly_do_cham SET ban_dich_en = 'Due to warranty department (PBH)', ban_dich_id = 'Karena bagian garansi (PBH)' WHERE ten_ly_do = 'Do PBH' AND ban_dich_en IS NULL;
UPDATE settings_ly_do_cham SET ban_dich_en = 'App error', ban_dich_id = 'Aplikasi error' WHERE ten_ly_do = 'Do App lỗi' AND ban_dich_en IS NULL;
UPDATE settings_ly_do_cham SET ban_dich_en = 'Due to ĐMX', ban_dich_id = 'Karena ĐMX' WHERE ten_ly_do = 'Do ĐMX' AND ban_dich_en IS NULL;
UPDATE settings_ly_do_cham SET ban_dich_en = 'Warehouse out of stock', ban_dich_id = 'Gudang kehabisan stok' WHERE ten_ly_do = 'Do Kho hết hàng' AND ban_dich_en IS NULL;
UPDATE settings_ly_do_cham SET ban_dich_en = 'Payment not transferred yet', ban_dich_id = 'Pembayaran belum ditransfer' WHERE ten_ly_do = 'Do chưa chuyển tiền' AND ban_dich_en IS NULL;
UPDATE settings_ly_do_cham SET ban_dich_en = 'Leave, holiday or weekend', ban_dich_id = 'Cuti, hari libur atau akhir pekan' WHERE ten_ly_do = 'Do nghỉ phép, lễ, cuối tuần' AND ban_dich_en IS NULL;
UPDATE settings_ly_do_cham SET ban_dich_en = 'Awaiting approval', ban_dich_id = 'Menunggu persetujuan' WHERE ten_ly_do = 'Do chờ phê duyệt' AND ban_dich_en IS NULL;
UPDATE settings_ly_do_cham SET ban_dich_en = 'Slow repair', ban_dich_id = 'Perbaikan lambat' WHERE ten_ly_do = 'Do sửa chữa chậm' AND ban_dich_en IS NULL;
UPDATE settings_ly_do_cham SET ban_dich_en = 'No parts available', ban_dich_id = 'Suku cadang tidak tersedia' WHERE ten_ly_do = 'Không có linh kiện' AND ban_dich_en IS NULL;
-- settings_loai_vi_pham.ten_loi
UPDATE settings_loai_vi_pham SET ban_dich_en = 'Technician has not contacted customer', ban_dich_id = 'Teknisi belum menghubungi pelanggan' WHERE ten_loi = 'KTV chưa liên hệ' AND ban_dich_en IS NULL;
UPDATE settings_loai_vi_pham SET ban_dich_en = 'Late contact or missed appointment with customer per rules', ban_dich_id = 'Terlambat menghubungi atau tidak menepati janji dengan pelanggan sesuai aturan' WHERE ten_loi = 'Liên hệ chậm hoặc sai hẹn với KH theo quy định' AND ban_dich_en IS NULL;
UPDATE settings_loai_vi_pham SET ban_dich_en = 'Contacted but appointment time not updated or not set', ban_dich_id = 'Sudah menghubungi tetapi jam janji belum diperbarui atau belum dibuat' WHERE ten_loi = 'Đã liên hệ nhưng chưa cập nhật giờ hẹn hoặc chưa hẹn' AND ban_dich_en IS NULL;
UPDATE settings_loai_vi_pham SET ban_dich_en = 'Contacted and appointment updated but time missed', ban_dich_id = 'Sudah menghubungi dan memperbarui janji tetapi tidak tepat waktu' WHERE ten_loi = 'Đã liên hệ và cập nhật thời gian hẹn nhưng sai giờ hẹn' AND ban_dich_en IS NULL;
UPDATE settings_loai_vi_pham SET ban_dich_en = 'Did not follow technician operating procedure', ban_dich_id = 'Tidak mengikuti prosedur kerja teknisi' WHERE ten_loi = 'Thực hiện sai quy trình nghiệp vụ kỹ thuật viên' AND ban_dich_en IS NULL;
UPDATE settings_loai_vi_pham SET ban_dich_en = 'Violated appearance standards with customer', ban_dich_id = 'Melanggar standar penampilan saat bertemu pelanggan' WHERE ten_loi = 'Vi phạm quy chuẩn diện mạo khi tiếp xúc với KH' AND ban_dich_en IS NULL;
UPDATE settings_loai_vi_pham SET ban_dich_en = 'Did not follow technical professional standards', ban_dich_id = 'Tidak mengikuti standar profesional teknis' WHERE ten_loi = 'Thực hiện sai quy chuẩn chuyên môn nghiệp vụ kỹ thuật' AND ban_dich_en IS NULL;
UPDATE settings_loai_vi_pham SET ban_dich_en = 'Violated communication standards in direct customer contact', ban_dich_id = 'Melanggar standar komunikasi saat bertemu langsung pelanggan' WHERE ten_loi = 'Vi phạm quy chuẩn giao tiếp khi tiếp xúc trực tiếp KH' AND ban_dich_en IS NULL;
UPDATE settings_loai_vi_pham SET ban_dich_en = 'Reported wrong information on the record or in software', ban_dich_id = 'Melaporkan informasi salah di berita acara atau perangkat lunak' WHERE ten_loi = 'Lỗi báo cáo thông tin sai trên biên bản hoặc trên phần mềm' AND ban_dich_en IS NULL;
UPDATE settings_loai_vi_pham SET ban_dich_en = 'No service record, or record without signature, or no copy left for customer', ban_dich_id = 'Tidak membuat berita acara, atau tanpa tanda tangan, atau tidak meninggalkan salinan untuk pelanggan' WHERE ten_loi = 'Không lập biên bản hoặc lập BB mà không có chữ ký hoặc không để lại bản lưu cho KH' AND ban_dich_en IS NULL;
UPDATE settings_loai_vi_pham SET ban_dich_en = 'Reported wrong revenue information', ban_dich_id = 'Melaporkan informasi pendapatan yang salah' WHERE ten_loi = 'Báo cáo sai thông tin doanh thu' AND ban_dich_en IS NULL;
UPDATE settings_loai_vi_pham SET ban_dich_en = 'Closed case before warranty job was completed', ban_dich_id = 'Menutup kasus sebelum pekerjaan garansi selesai' WHERE ten_loi = 'Đóng ca khi chưa hoàn thành sự vụ bảo hành' AND ban_dich_en IS NULL;
UPDATE settings_loai_vi_pham SET ban_dich_en = 'Left personal contact details with customer', ban_dich_id = 'Meninggalkan informasi pribadi kepada pelanggan' WHERE ten_loi = 'Để lại thông tin cá nhân cho KH' AND ban_dich_en IS NULL;
UPDATE settings_loai_vi_pham SET ban_dich_en = 'Other error', ban_dich_id = 'Kesalahan lain' WHERE ten_loi = 'Lỗi khác' AND ban_dich_en IS NULL;
UPDATE settings_loai_vi_pham SET ban_dich_en = 'Ungrouped error', ban_dich_id = 'Kesalahan belum dikelompokkan' WHERE ten_loi = 'Lỗi chưa phân nhóm' AND ban_dich_en IS NULL;
UPDATE settings_loai_vi_pham SET ban_dich_en = 'Reported wrong revenue information (not reported to manager)', ban_dich_id = 'Melaporkan informasi pendapatan salah (tidak dilaporkan ke atasan)' WHERE ten_loi = 'Báo cáo sai thông tin doanh thu (không báo cáo quản lý)' AND ban_dich_en IS NULL;
UPDATE settings_loai_vi_pham SET ban_dich_en = 'No error', ban_dich_id = 'Tidak ada kesalahan' WHERE ten_loi = 'Không có lỗi' AND ban_dich_en IS NULL;
-- settings_phan_loai_tranh_chap.ten_phan_loai
UPDATE settings_phan_loai_tranh_chap SET ban_dich_en = 'Customer disagrees with advice/solution', ban_dich_id = 'Pelanggan belum setuju dengan saran/solusi' WHERE ten_phan_loai = 'KH chưa đồng ý về tư vấn/Giải pháp' AND ban_dich_en IS NULL;
UPDATE settings_phan_loai_tranh_chap SET ban_dich_en = 'Customer demands unit replacement', ban_dich_id = 'Pelanggan menuntut penggantian unit' WHERE ten_phan_loai = 'KH đòi đổi máy' AND ban_dich_en IS NULL;
UPDATE settings_phan_loai_tranh_chap SET ban_dich_en = 'Technician chose wrongly', ban_dich_id = 'Teknisi salah memilih' WHERE ten_phan_loai = 'KTV chọn sai' AND ban_dich_en IS NULL;
UPDATE settings_phan_loai_tranh_chap SET ban_dich_en = 'Complaint', ban_dich_id = 'Keluhan' WHERE ten_phan_loai = 'Khiếu nại' AND ban_dich_en IS NULL;
UPDATE settings_phan_loai_tranh_chap SET ban_dich_en = 'Other (skip)', ban_dich_id = 'Lainnya (abaikan)' WHERE ten_phan_loai = 'Khác (bỏ qua)' AND ban_dich_en IS NULL;
UPDATE settings_phan_loai_tranh_chap SET ban_dich_en = 'Other (needs review)', ban_dich_id = 'Lainnya (perlu ditinjau)' WHERE ten_phan_loai = 'Khác (cần rà soát)' AND ban_dich_en IS NULL;
UPDATE settings_phan_loai_tranh_chap SET ban_dich_en = 'Exchange/return', ban_dich_id = 'Tukar/retur' WHERE ten_phan_loai = 'Đổi trả' AND ban_dich_en IS NULL;
-- settings_ket_qua_xu_ly_tranh_chap.ten_ket_qua
UPDATE settings_ket_qua_xu_ly_tranh_chap SET ban_dich_en = 'Cannot be resolved', ban_dich_id = 'Tidak dapat ditangani' WHERE ten_ket_qua = 'Không thể xử lý' AND ban_dich_en IS NULL;
UPDATE settings_ket_qua_xu_ly_tranh_chap SET ban_dich_en = 'Advised', ban_dich_id = 'Sudah dikonsultasikan' WHERE ten_ket_qua = 'Đã tư vấn' AND ban_dich_en IS NULL;
UPDATE settings_ket_qua_xu_ly_tranh_chap SET ban_dich_en = 'Fully resolved', ban_dich_id = 'Sudah ditangani tuntas' WHERE ten_ket_qua = 'Đã xử lý dứt điểm' AND ban_dich_en IS NULL;
-- settings_ly_do_ton_tranh_chap.ten_ly_do
UPDATE settings_ly_do_ton_tranh_chap SET ban_dich_en = 'Transferred to complaint resolution team', ban_dich_id = 'Dialihkan ke tim penyelesaian keluhan' WHERE ten_ly_do = 'Chuyển GQKN xử lý' AND ban_dich_en IS NULL;
UPDATE settings_ly_do_ton_tranh_chap SET ban_dich_en = 'Customer care has not responded', ban_dich_id = 'Layanan pelanggan belum merespons' WHERE ten_ly_do = 'Do CSKH chưa phản hồi' AND ban_dich_en IS NULL;
UPDATE settings_ly_do_ton_tranh_chap SET ban_dich_en = 'Supervisor has not decided the plan', ban_dich_id = 'Supervisor belum memutuskan rencana' WHERE ten_ly_do = 'Do GS chưa chốt phương án' AND ban_dich_en IS NULL;
UPDATE settings_ly_do_ton_tranh_chap SET ban_dich_en = 'Director has not approved', ban_dich_id = 'Direktur belum menyetujui' WHERE ten_ly_do = 'Do GĐ chưa phê duyệt' AND ban_dich_en IS NULL;
UPDATE settings_ly_do_ton_tranh_chap SET ban_dich_en = 'Due to customer/dealer/distributor', ban_dich_id = 'Karena pelanggan/dealer/distributor' WHERE ten_ly_do = 'Do KH/ĐL/NPP' AND ban_dich_en IS NULL;
UPDATE settings_ly_do_ton_tranh_chap SET ban_dich_en = 'Technician needs to add information', ban_dich_id = 'Teknisi perlu melengkapi informasi' WHERE ten_ly_do = 'Do KTV cần bổ sung thông tin' AND ban_dich_en IS NULL;
UPDATE settings_ly_do_ton_tranh_chap SET ban_dich_en = 'QC has not responded', ban_dich_id = 'QC belum merespons' WHERE ten_ly_do = 'Do QC chưa phản hồi' AND ban_dich_en IS NULL;
UPDATE settings_ly_do_ton_tranh_chap SET ban_dich_en = 'Waiting for parts (long wait or unavailable)', ban_dich_id = 'Menunggu suku cadang (lama atau tidak tersedia)' WHERE ten_ly_do = 'Do chờ linh kiện (chờ lâu hoặc không có)' AND ban_dich_en IS NULL;
UPDATE settings_ly_do_ton_tranh_chap SET ban_dich_en = 'Due to other 3T departments', ban_dich_id = 'Karena departemen lain di 3T' WHERE ten_ly_do = 'Do các bộ phận khác của 3T' AND ban_dich_en IS NULL;
UPDATE settings_ly_do_ton_tranh_chap SET ban_dich_en = 'Due to other KRF departments', ban_dich_id = 'Karena departemen lain di KRF' WHERE ten_ly_do = 'Do các bộ phận khác của KRF' AND ban_dich_en IS NULL;
UPDATE settings_ly_do_ton_tranh_chap SET ban_dich_en = 'Other (external factors: weather, terrain, ...)', ban_dich_id = 'Lainnya (faktor eksternal: cuaca, medan, ...)' WHERE ten_ly_do = 'Khác (yếu tố khách quan: thời tiết, địa hình,...)' AND ban_dich_en IS NULL;
-- settings_loai_yeu_cau_bo_qua_lap.loai_yeu_cau
UPDATE settings_loai_yeu_cau_bo_qua_lap SET ban_dich_en = 'Supermarket labels/posters', ban_dich_id = 'Pemasangan stiker, poster supermarket' WHERE loai_yeu_cau = 'Dán tem, poster siêu thị' AND ban_dich_en IS NULL;
-- settings_loai_yeu_cau_doi_tra.loai_yeu_cau
UPDATE settings_loai_yeu_cau_doi_tra SET ban_dich_en = 'Install exchange unit', ban_dich_id = 'Pemasangan unit pengganti' WHERE loai_yeu_cau = 'Lắp máy đổi trả' AND ban_dich_en IS NULL;
UPDATE settings_loai_yeu_cau_doi_tra SET ban_dich_en = 'NSKX - Collect exchange unit at NSKX warehouse', ban_dich_id = 'NSKX - Ambil unit pengganti di gudang NSKX' WHERE loai_yeu_cau = 'NSKX- Lấy máy đổi trả tại kho NSKX' AND ban_dich_en IS NULL;
UPDATE settings_loai_yeu_cau_doi_tra SET ban_dich_en = 'NSKX - Install NSKX exchange unit', ban_dich_id = 'NSKX - Pasang unit pengganti NSKX' WHERE loai_yeu_cau = 'NSKX-Lắp máy đổi trả NSKX' AND ban_dich_en IS NULL;
UPDATE settings_loai_yeu_cau_doi_tra SET ban_dich_en = 'Product exchange/return', ban_dich_id = 'Tukar/retur produk' WHERE loai_yeu_cau = 'Đổi trả sản phẩm' AND ban_dich_en IS NULL;
-- settings_luu_y_loi_linh_kien_doi_tra.luu_y_loi_linh_kien
UPDATE settings_luu_y_loi_linh_kien_doi_tra SET ban_dich_en = '[Other services] Install new unit, swap old unit', ban_dich_id = '[Layanan lain] Pasang unit baru, tukar unit lama' WHERE luu_y_loi_linh_kien = '[Các nghiệp vụ khác] Lắp máy mới đổi máy cũ' AND ban_dich_en IS NULL;
UPDATE settings_luu_y_loi_linh_kien_doi_tra SET ban_dich_en = '[Installation] [CNL] Install new unit, swap old unit', ban_dich_id = '[Pemasangan] [CNL] Pasang unit baru, tukar unit lama' WHERE luu_y_loi_linh_kien = '[Lắp máy] [CNL] Lắp máy mới đổi máy cũ' AND ban_dich_en IS NULL;
UPDATE settings_luu_y_loi_linh_kien_doi_tra SET ban_dich_en = '[Installation] [GD] Install new unit, swap old unit', ban_dich_id = '[Pemasangan] [GD] Pasang unit baru, tukar unit lama' WHERE luu_y_loi_linh_kien = '[Lắp máy] [GD] Lắp máy mới đổi máy cũ' AND ban_dich_en IS NULL;
UPDATE settings_luu_y_loi_linh_kien_doi_tra SET ban_dich_en = '[Installation] [MNL] Install new unit, swap old unit', ban_dich_id = '[Pemasangan] [MNL] Pasang unit baru, tukar unit lama' WHERE luu_y_loi_linh_kien = '[Lắp máy] [MNL] Lắp máy mới đổi máy cũ' AND ban_dich_en IS NULL;
UPDATE settings_luu_y_loi_linh_kien_doi_tra SET ban_dich_en = '[Installation] [ĐH] Install new unit, swap old unit', ban_dich_id = '[Pemasangan] [ĐH] Pasang unit baru, tukar unit lama' WHERE luu_y_loi_linh_kien = '[Lắp máy] [ĐH] Lắp máy mới đổi máy cũ' AND ban_dich_en IS NULL;
UPDATE settings_luu_y_loi_linh_kien_doi_tra SET ban_dich_en = '[Installation] Unit swap only', ban_dich_id = '[Pemasangan] Hanya tukar unit' WHERE luu_y_loi_linh_kien = '[Lắp đặt] Chỉ đổi máy' AND ban_dich_en IS NULL;
UPDATE settings_luu_y_loi_linh_kien_doi_tra SET ban_dich_en = '[Recall] [CNL] Collect unit with transport', ban_dich_id = '[Penarikan] [CNL] Ambil unit dengan pengiriman' WHERE luu_y_loi_linh_kien = '[Thu hồi] [CNL] Thu máy có vận chuyển' AND ban_dich_en IS NULL;
UPDATE settings_luu_y_loi_linh_kien_doi_tra SET ban_dich_en = '[Recall] [MLN] Collect unit with transport', ban_dich_id = '[Penarikan] [MLN] Ambil unit dengan pengiriman' WHERE luu_y_loi_linh_kien = '[Thu hồi] [MLN] Thu máy có vận chuyển' AND ban_dich_en IS NULL;
UPDATE settings_luu_y_loi_linh_kien_doi_tra SET ban_dich_en = '[Recall] [MLN] Collect unit without transport', ban_dich_id = '[Penarikan] [MLN] Ambil unit tanpa pengiriman' WHERE luu_y_loi_linh_kien = '[Thu hồi] [MLN] Thu máy không vận chuyển' AND ban_dich_en IS NULL;
UPDATE settings_luu_y_loi_linh_kien_doi_tra SET ban_dich_en = '[Recall] [MNL] Collect unit with transport', ban_dich_id = '[Penarikan] [MNL] Ambil unit dengan pengiriman' WHERE luu_y_loi_linh_kien = '[Thu hồi] [MNL] Thu máy có vận chuyển' AND ban_dich_en IS NULL;
UPDATE settings_luu_y_loi_linh_kien_doi_tra SET ban_dich_en = '[Recall] [MNL] Collect unit without transport', ban_dich_id = '[Penarikan] [MNL] Ambil unit tanpa pengiriman' WHERE luu_y_loi_linh_kien = '[Thu hồi] [MNL] Thu máy không vận chuyển' AND ban_dich_en IS NULL;
UPDATE settings_luu_y_loi_linh_kien_doi_tra SET ban_dich_en = '[Recall] [ĐH] Collect unit with transport', ban_dich_id = '[Penarikan] [ĐH] Ambil unit dengan pengiriman' WHERE luu_y_loi_linh_kien = '[Thu hồi] [ĐH] Thu máy có vận chuyển' AND ban_dich_en IS NULL;
UPDATE settings_luu_y_loi_linh_kien_doi_tra SET ban_dich_en = '[Recall] [ĐH] Collect unit without transport', ban_dich_id = '[Penarikan] [ĐH] Ambil unit tanpa pengiriman' WHERE luu_y_loi_linh_kien = '[Thu hồi] [ĐH] Thu máy không vận chuyển' AND ban_dich_en IS NULL;
-- settings_loai_de_xuat.ten_option
UPDATE settings_loai_de_xuat SET ban_dich_en = 'PURCHASE', ban_dich_id = 'PEMBELIAN' WHERE ten_option = 'MUA HÀNG' AND ban_dich_en IS NULL;
UPDATE settings_loai_de_xuat SET ban_dich_en = 'ON CREDIT', ban_dich_id = 'PIUTANG' WHERE ten_option = 'CÔNG NỢ' AND ban_dich_en IS NULL;
UPDATE settings_loai_de_xuat SET ban_dich_en = 'DEDUCT FROM CREDIT', ban_dich_id = 'POTONG PIUTANG' WHERE ten_option = 'TRỪ CÔNG NỢ' AND ban_dich_en IS NULL;
UPDATE settings_loai_de_xuat SET ban_dich_en = 'RESERVE PURCHASE', ban_dich_id = 'PEMBELIAN CADANGAN' WHERE ten_option = 'MUA DỰ TRỮ' AND ban_dich_en IS NULL;
UPDATE settings_loai_de_xuat SET ban_dich_en = 'ON CREDIT - ORDER IN PROGRESS', ban_dich_id = 'PIUTANG - PESANAN DIPROSES' WHERE ten_option = 'CÔNG NỢ - ĐƠN ĐANG XỬ LÝ' AND ban_dich_en IS NULL;
UPDATE settings_loai_de_xuat SET ban_dich_en = 'RETURN - CREDIT', ban_dich_id = 'RETUR - PIUTANG' WHERE ten_option = 'TRẢ HÀNG CÔNG NỢ' AND ban_dich_en IS NULL;
UPDATE settings_loai_de_xuat SET ban_dich_en = 'RETURN - PROVINCIAL PARTS', ban_dich_id = 'RETUR - SUKU CADANG PROVINSI' WHERE ten_option = 'TRẢ HÀNG LK TỈNH' AND ban_dich_en IS NULL;
UPDATE settings_loai_de_xuat SET ban_dich_en = 'RETURN - SPECIAL PARTS', ban_dich_id = 'RETUR - SUKU CADANG KHUSUS' WHERE ten_option = 'TRẢ HÀNG LK ĐẶC THÙ' AND ban_dich_en IS NULL;
UPDATE settings_loai_de_xuat SET ban_dich_en = 'RETURN - RESERVE STOCK', ban_dich_id = 'RETUR - STOK CADANGAN' WHERE ten_option = 'TRẢ HÀNG DỮ TRỮ' AND ban_dich_en IS NULL;
UPDATE settings_loai_de_xuat SET ban_dich_en = 'RETURN - OTHER PARTS', ban_dich_id = 'RETUR - SUKU CADANG LAIN' WHERE ten_option = 'TRẢ HÀNG LK KHÁC' AND ban_dich_en IS NULL;
UPDATE settings_loai_de_xuat SET ban_dich_en = 'FREE SUPPORT (0 VND)', ban_dich_id = 'DUKUNGAN GRATIS (0 VND)' WHERE ten_option = 'HỖ TRỢ 0 ĐỒNG' AND ban_dich_en IS NULL;
UPDATE settings_loai_de_xuat SET ban_dich_en = 'CREDIT SUPPORT', ban_dich_id = 'DUKUNGAN PIUTANG' WHERE ten_option = 'HỖ TRỢ CÔNG NỢ' AND ban_dich_en IS NULL;
UPDATE settings_loai_de_xuat SET ban_dich_en = 'FREE SUPPORT (0 VND) (MT CHANNEL)', ban_dich_id = 'DUKUNGAN GRATIS (0 VND) (KANAL MT)' WHERE ten_option = 'HỖ TRỢ 0 ĐỒNG (KÊNH MT)' AND ban_dich_en IS NULL;
UPDATE settings_loai_de_xuat SET ban_dich_en = 'CREDIT SUPPORT (MT CHANNEL)', ban_dich_id = 'DUKUNGAN PIUTANG (KANAL MT)' WHERE ten_option = 'HỖ TRỢ CÔNG NỢ (KÊNH MT)' AND ban_dich_en IS NULL;
UPDATE settings_loai_de_xuat SET ban_dich_en = 'OUT-OF-WARRANTY SUPPORT TG12-NSKX', ban_dich_id = 'DUKUNGAN DI LUAR GARANSI TG12-NSKX' WHERE ten_option = 'HỖ TRỢ NGOÀI BẢO HÀNH TG12-NSKX' AND ban_dich_en IS NULL;
UPDATE settings_loai_de_xuat SET ban_dich_en = 'OUT-OF-WARRANTY SUPPORT TG12-NPP', ban_dich_id = 'DUKUNGAN DI LUAR GARANSI TG12-NPP' WHERE ten_option = 'HỖ TRỢ NGOÀI BẢO HÀNH TG12-NPP' AND ban_dich_en IS NULL;
UPDATE settings_loai_de_xuat SET ban_dich_en = 'DEDUCT FROM CREDIT TG12-NSKX', ban_dich_id = 'POTONG PIUTANG TG12-NSKX' WHERE ten_option = 'TRỪ CÔNG NỢ TG12-NSKX' AND ban_dich_en IS NULL;
UPDATE settings_loai_de_xuat SET ban_dich_en = 'DEDUCT FROM CREDIT TG12-NPP', ban_dich_id = 'POTONG PIUTANG TG12-NPP' WHERE ten_option = 'TRỪ CÔNG NỢ TG12-NPP' AND ban_dich_en IS NULL;
UPDATE settings_loai_de_xuat SET ban_dich_en = 'ON CREDIT (SHIPPED FROM INTERMEDIATE WAREHOUSE)', ban_dich_id = 'PIUTANG (DIKIRIM DARI GUDANG PERANTARA)' WHERE ten_option = 'CÔNG NỢ (XUẤT HÀNG TỪ KHO TRUNG GIAN)' AND ban_dich_en IS NULL;
-- settings_loai_de_xuat_nhom.ten_nhom
UPDATE settings_loai_de_xuat_nhom SET ban_dich_en = 'Technicians & Satellites', ban_dich_id = 'Teknisi & Satelit' WHERE ten_nhom = 'KTV & Vệ tinh' AND ban_dich_en IS NULL;
UPDATE settings_loai_de_xuat_nhom SET ban_dich_en = 'Admin / Head of Warranty Service', ban_dich_id = 'Admin / Kepala Layanan Garansi' WHERE ten_nhom = 'Admin / TBP DVBH' AND ban_dich_en IS NULL;
UPDATE settings_loai_de_xuat_nhom SET ban_dich_en = 'Supervisors + Operations', ban_dich_id = 'Supervisor + Operasional' WHERE ten_nhom = 'Giám sát + Tác nghiệp' AND ban_dich_en IS NULL;
-- settings_loai_vi_pham.nhom_loi
UPDATE settings_loai_vi_pham SET nhom_loi_en = 'Other error', nhom_loi_id = 'Kesalahan lain' WHERE nhom_loi = 'Lỗi khác' AND nhom_loi_en IS NULL;
UPDATE settings_loai_vi_pham SET nhom_loi_en = 'Procedure, appointment, attire errors', nhom_loi_id = 'Kesalahan prosedur, janji, pakaian' WHERE nhom_loi = 'Lỗi quy trình, sai hẹn, trang phục' AND nhom_loi_en IS NULL;
UPDATE settings_loai_vi_pham SET nhom_loi_en = 'Technical errors', nhom_loi_id = 'Kesalahan teknis' WHERE nhom_loi = 'Lỗi chuyên môn' AND nhom_loi_en IS NULL;
UPDATE settings_loai_vi_pham SET nhom_loi_en = 'Consulting errors', nhom_loi_id = 'Kesalahan konsultasi' WHERE nhom_loi = 'Lỗi tư vấn' AND nhom_loi_en IS NULL;
UPDATE settings_loai_vi_pham SET nhom_loi_en = 'Reporting errors', nhom_loi_id = 'Kesalahan pelaporan' WHERE nhom_loi = 'Lỗi báo cáo' AND nhom_loi_en IS NULL;
UPDATE settings_loai_vi_pham SET nhom_loi_en = 'Serious errors', nhom_loi_id = 'Kesalahan berat' WHERE nhom_loi = 'Lỗi nghiêm trọng' AND nhom_loi_en IS NULL;
UPDATE settings_loai_vi_pham SET nhom_loi_en = 'No error', nhom_loi_id = 'Tidak ada kesalahan' WHERE nhom_loi = 'Không lỗi' AND nhom_loi_en IS NULL;

UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'settings';
-- settings_ly_do co cache trinh duyet theo hash noi dung - xoa hash cu de lan doc sau tinh lai (co them 2 cot ban dich).
DELETE FROM content_versions WHERE ten_bang = 'settings_ly_do';
