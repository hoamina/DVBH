import type { BadgeTone } from "../../components/ui/Badge";
import { tr } from "../../i18n/tr";

// Hang so/dictionary dung chung cho module "Dat mua linh kien" (tach tu DatMuaLinhKienModule.tsx
// khi chia nho file - UI redesign Phase 3, phan hoi Codex 2026-08-19).

// Chuan hoa thong bao loi cho nguoi dung (UI redesign phan hoi Codex 2026-08-19, muc P1 "chuan hoa
// error message") - truoc do 14 onError deu chi lam addToast("Loi: " + err.message), nhung
// ApiError.message (xem api/client.ts) CHINH LA MA LOI KY THUAT THO (vd "FORBIDDEN_ROLE",
// "MA_LK_NOT_FOUND") vi ApiError ke thua Error va set super(code ?? ...) - khong phai cau tieng
// Viet. Uu tien ApiError.detail (backend co the tra rieng field "message" giai thich, xem comment
// request() trong api/client.ts) truoc, roi tra cuu dictionary theo ma, cuoi cung moi fallback hien
// ma tho kem tien to giai thich (van giu ma de ho tro/debug doi chieu duoc).
export const GENERIC_ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN_ROLE: tr("Bạn không có quyền thực hiện thao tác này"),
  MODULE_NOT_ALLOWED: tr("Tài khoản của bạn không có quyền truy cập module này"),
  NOT_FOUND: tr("Không tìm thấy dữ liệu (có thể đã bị xoá hoặc thay đổi)"),
  STATE_CHANGED: tr("Trạng thái vừa bị người khác thay đổi — tải lại trang và thử lại"),
  DA_DONG: tr("Dòng này đã đóng, không thể xử lý tiếp"),
  DONG_DA_DONG: tr("Dòng này đã đóng, không thể xử lý tiếp"),
  PHIEU_DA_DONG: tr("Phiếu này đã đóng, không thể xử lý tiếp"),
  INVALID_STATE: tr("Trạng thái hiện tại không cho phép thao tác này"),
  INVALID_TRANG_THAI: tr("Trạng thái đích không hợp lệ"),
  INVALID_HANH_DONG: tr("Hành động không hợp lệ"),
  INVALID_BODY: tr("Dữ liệu gửi lên không hợp lệ"),
  INVALID_DON_HANG: tr("Thông tin dòng đơn hàng chưa đầy đủ hoặc không hợp lệ"),
  INVALID_CONTENT_TYPE: tr("Định dạng file không hợp lệ"),
  EMPTY_FILE: tr("File rỗng, vui lòng chọn file khác"),
  MA_LK_NOT_FOUND: tr("Không tìm thấy mã linh kiện này trong danh mục"),
  MISSING_DON_HANG: tr("Cần chọn ít nhất 1 dòng đơn hàng"),
  MISSING_NGUOI_NHAN_HANG: tr("Cần chọn người nhận hàng"),
  MISSING_LOAI_DON: tr("Cần chọn loại đơn"),
  MISSING_MA_XUAT_KHO: tr("Cần nhập mã đơn hàng"),
  MISSING_MA_MISA: tr("Cần nhập mã MISA"),
  MISSING_SO_TIEN: tr("Cần nhập số tiền"),
  MISSING_BANG_CHUNG: tr("Cần nhập bằng chứng chuyển tiền"),
  MISSING_LY_DO_CHAM: tr("Cần chọn lý do chậm"),
  MISSING_GHI_CHU: tr("Cần nhập ghi chú/lý do"),
  MISSING_GIAI_TRINH: tr("Cần nhập giải trình"),
  MISSING_IDS: tr("Chưa chọn dòng nào để xử lý"),
  MISSING_CASE_ID: tr("Thiếu mã case"),
  MISSING_CHUYEN_TIEN_APPROVED: tr("Cần Tác nghiệp xác nhận chuyển tiền trước"),
  QUA_NHIEU_ID: tr("Chọn quá nhiều dòng cùng lúc, vui lòng chia nhỏ đợt xử lý"),
  THIEU_CHINH_SACH_HOAC_MA_YCSC: tr("Thiếu Chính sách hoặc Mã yêu cầu sự cố"),
  THIEU_LY_DO_HUY: tr("Cần nhập lý do huỷ"),
  THIEU_LY_DO_CHAM: tr("Cần chọn lý do chậm"),
  LY_DO_CHAM_KHONG_HOP_LE: tr("Lý do chậm không hợp lệ"),
  NGUOI_NHAN_HANG_KHONG_HOP_LE: tr("Người nhận hàng không hợp lệ"),
  NGUOI_NHAN_HANG_NGOAI_PHAM_VI: tr("Người nhận hàng này không thuộc phạm vi quản lý của bạn"),
  NGOAI_PHAM_VI_GS: tr("KTV này không thuộc quyền phụ trách của bạn"),
  VE_TINH_CHUA_GAN_TRAM: tr("Vệ tinh này chưa được gán Trạm phụ trách"),
  DON_HANG_KHONG_HOP_LE: tr("Một số dòng đơn hàng đã chọn không còn hợp lệ (đã bị đổi hoặc gán nơi khác)"),
  MA_XUAT_KHO_DA_TON_TAI: tr("Mã đơn hàng này đã được dùng cho phiếu khác"),
  MA_XUAT_KHO_CHUA_XAC_NHAN: tr("Cần nhập và xác nhận mã đơn hàng trước"),
  CASE_NOT_FOUND: tr("Không tìm thấy case này"),
  DA_CO_CA_THIEU_LK_DANG_MO: tr("Đã có ca thiếu linh kiện đang mở cho dòng này"),
  USE_TRA_HANG_ROUTE: tr("Dòng trả hàng xử lý ở tab Trả hàng riêng"),
};

// Ma loi tra ve tu applyDonHangLog (backend/src/routes/datMuaLinhKien.ts) khi 1 dong trong bulk-log
// khong hop le - dung de phan biet voi cac nextTrangThai hop le ("TN da duyet", "Cho TN duyet"...).
export const BULK_LOG_ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: tr("không tìm thấy dòng đơn hàng"),
  DONG_DA_DONG: tr("dòng đã đóng"),
  FORBIDDEN_ROLE: tr("không đủ quyền xử lý"),
  INVALID_STATE: tr("sai trạng thái hiện tại"),
  USE_TRA_HANG_ROUTE: tr("dòng trả hàng dùng tab riêng"),
  MISSING_LY_DO_CHAM: tr("thiếu lý do chậm"),
  LY_DO_CHAM_KHONG_HOP_LE: tr("lý do chậm không hợp lệ"),
  DA_CO_CA_THIEU_LK_DANG_MO: tr("đã có ca thiếu linh kiện đang mở cho dòng này"),
  STATE_CHANGED: tr("trạng thái vừa bị người khác thay đổi, tải lại và thử lại"),
  // 2 ma nay thuc te chi xay ra khi request khong den tu UI binh thuong (UI da chan truoc ca 2 truong
  // hop o phia client) - them vao day chi de PHONG THU: neu thieu, ma loi se KHONG khop bat ky key
  // nao trong dictionary nay, khien dong that bai bi dem NHAM thanh thanh cong trong toast bulk-log
  // (phat hien khi ra soat QA 2026-08-19, so sanh voi applyDonHangLog o backend).
  THIEU_LY_DO_HUY: tr("thiếu lý do huỷ"),
  INVALID_HANH_DONG: tr("hành động không hợp lệ ở trạng thái hiện tại"),
};

// Ma loi tra ve tu applyTraHangLog (backend/src/routes/traHang.ts) khi 1 dong trong bulk-log khong
// hop le - dung de phan biet voi cac nextTrangThai hop le.
export const TRA_HANG_BULK_ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: tr("không tìm thấy dòng trả hàng"),
  DA_DONG: tr("dòng đã đóng"),
  FORBIDDEN_ROLE: tr("không đủ quyền xử lý"),
  INVALID_STATE: tr("sai trạng thái hiện tại"),
  // CHOT (ra soat module #13): dong dang "Cho TN duyet tong" tu choi bat buoc ghi_chu - dong nay
  // KHONG the xu ly qua "Tu choi tat ca" hang loat (khong nhap duoc ghi_chu rieng tung dong), phai
  // mo tung dong de nhap ly do that su.
  MISSING_GHI_CHU: tr("cần nhập lý do khi từ chối bước TN duyệt tổng — mở từng dòng để nhập"),
  // Phat hien khi ra soat QA 2026-08-19: THIEU key nay khien 1 dong that bai do 2 nguoi cung xu ly
  // dong thoi (optimistic-concurrency, xem applyTraHangLog o backend) bi dem NHAM thanh thanh cong
  // trong toast bulk-log - day la truong hop THUC SU xay ra trong dung thao tac binh thuong (khong
  // can request bat thuong), khac 2 ma o BULK_LOG_ERROR_MESSAGES ben tren.
  STATE_CHANGED: tr("trạng thái vừa bị người khác thay đổi, tải lại và thử lại"),
};

// Trang thai cua 1 DONG don hang (dat_don_hang_log) - khong con o cap phieu.
export const DON_HANG_TRANG_THAI_TONE: Record<string, BadgeTone> = {
  "Cho Tram duyet": "amber",
  "Cho TBP xac nhan": "amber",
  "Cho TN duyet": "ocean",
  "TN da duyet": "teal",
  "TN tu choi": "coral",
  "Cho hang": "amber",
  "Da huy": "gray",
};

// Phan hoi UX muc 2 (2026-08-15): to mau/gach ngang TEN LINH KIEN theo trang thai dong don hang -
// chi ap dung len phan ten (khong toan hang, tranh roi mat), StatusBadge canh ben van la diem neo
// chinh. Dung lai cac token mau san co (--coral-*/--amber-*/--teal-*), khong them mau moi.
export const DON_HANG_ROW_STYLE: Record<string, string> = {
  "Da huy": "line-through text-[var(--coral-600)]",
  "TN tu choi": "line-through text-[var(--coral-600)]",
  "Cho Tram duyet": "text-[var(--amber-600)]",
  "Cho TBP xac nhan": "text-[var(--amber-600)]",
  "Cho TN duyet": "text-[var(--amber-600)]",
  "Cho hang": "text-[var(--amber-700)] font-medium",
  "TN da duyet": "text-[var(--teal-600)]",
};

export const PXK_TRANG_THAI_TONE: Record<string, BadgeTone> = {
  "Dang tao phieu": "ocean",
  "Cho ke toan": "amber",
  "Da chot xong don xuat": "amber",
  "Dang gui KTV": "amber",
  "KTV da nhan": "teal",
  "Ke toan huy": "gray",
  "Hang tru kho": "teal",
  "Kho da ket thuc": "teal",
};

export const CHUYEN_TIEN_TONE: Record<string, BadgeTone> = {
  "Cho KTV chuyen": "amber",
  "KTV da chuyen": "ocean",
  "TN da duyet": "teal",
};

export const TRA_HANG_TRANG_THAI_TONE: Record<string, BadgeTone> = {
  "Cho ke toan duyet mem": "amber",
  "Cho kho xac nhan": "amber",
  "Cho QC xac nhan": "ocean",
  "Cho TN duyet tong": "ocean",
  "Cho ke toan xac nhan nhap kho": "amber",
  "Cho kho xac nhan nhap kho": "amber",
  "Da hoan thanh": "teal",
  "Tu choi": "coral",
  "Da huy": "gray",
};
// CHOT (ra soat module "Dat Mua Linh Kien 2.0" #21): 2 giai doan "amber" (duyet dau vao KT/Kho vs
// xac nhan nhap kho KT/Kho) dung CHUNG 1 tone - khong them token mau moi (indigo trong tokens.css da
// ghi chu danh RIENG cho giao dien "modern clean v2" khac, dung lai o day pha vo dung quy uoc "mau
// accent co chu dich" ma file do de ra) - phan biet bang SAC DO trong CUNG 1 tone qua prop `solid`
// co san cua Badge (amber-100 nhat cho giai doan 1, amber-500 dam + chu trang cho giai doan 2).
export const TRA_HANG_GIAI_DOAN_2 = new Set(["Cho ke toan xac nhan nhap kho", "Cho kho xac nhan nhap kho"]);

// CHOT vong 7 (2026-08-17): dong dat_don_hang loai_don='tra_hang' gio hien chung trong "Don cua
// toi/Danh sach" (truoc chi xem duoc qua tab rieng "Don tra hang" da bo, hoac luong quy trinh) - can
// map ca 2 bo trang thai (dat_don_hang_log + tra_hang_log) vao 1 tones dung chung cho StatusBadge.
export const DON_HANG_TRANG_THAI_TONE_ALL: Record<string, BadgeTone> = { ...DON_HANG_TRANG_THAI_TONE, ...TRA_HANG_TRANG_THAI_TONE };

export const THIEU_LK_TRANG_THAI_TONE: Record<string, BadgeTone> = {
  "Cho kho xu ly": "amber",
  "Kho da tiep nhan": "ocean",
  "Kho xac nhan hang da ve": "teal",
  "Kho tu choi sai TT": "coral",
  "Da huy bo": "gray",
  "Da ket thuc": "teal",
};

// Mau cham tron nho cho lich su xu ly (DonHangDetailModal, CHOT ra soat module #18) - dung dung
// bang mau da co (BadgeTone), khong them token mau moi.
export const TRANG_THAI_DOT_TONE: Record<BadgeTone, string> = {
  ocean: "bg-[var(--ocean-500)]",
  teal: "bg-[var(--teal-500)]",
  amber: "bg-[var(--amber-500)]",
  coral: "bg-[var(--coral-500)]",
  orange: "bg-[var(--orange-500)]",
  gray: "bg-slate-400",
};


// Nhan rut gon KHONG con so thu tu (CHOT 2026-08-17 vong 4: "Bỏ ký tự B1. B2, B3 đi" - da thu qua ky
// hieu "B{n}." o vong 2 nhung chu he thong thay thua).
// CHOT (ra soat module "Dat Mua Linh Kien 2.0" #16): 6 nhan "tra_hang_*" deu doi sang tien to
// "Trả·" (dau cham giua, khong phai khoang trang) - truoc day "Trả KT"/"Trả Kho"/"Trả TN" doc len
// gan nhu trung voi cac nhan bare "KT"/"Kho"/"TN" cua luong PXK/tac nghiep khi luot nhanh qua thanh
// cuon ngang; dau "·" bien moi nhan thanh 1 TU GHEP rieng biet thay vi 2 tu roi de nham voi nhan bare.
export const STEP_SHORT_LABEL: Record<string, string> = {
  tram: tr("Trạm"),
  tp_dvbh: "TBP",
  tra_hang_kt: tr("Trả·KT"),
  tra_hang_kho: tr("Trả·Kho"),
  tra_hang_qc: tr("Trả·QC"),
  tra_hang_tn: tr("Trả·TN"),
  tra_hang_kt_nhap: tr("Trả·KT NK"),
  tra_hang_kho_nhap: tr("Trả·Kho NK"),
  tac_nghiep: "TN",
  cho_hang: tr("Chờ hàng"),
  thieu_lk: tr("Thiếu LK"),
  cho_tien: tr("Chờ tiền"),
  tao_pxk: "PXK",
  ke_toan: "KT",
  kho: "Kho",
  ktv: "KTV",
};

// Mo ta chi tiet cho tooltip (CHOT vong 7: "hiện tooltip giải thích về số lượng đơn đang chờ là đơn
// gì? để người dùng hiểu được việc mình cần làm") - thay the viec chi hien LAI ten day du (khong giai
// thich them) bang 1 cau mo ta ro dung "the mid nao" va "can lam gi", khop dung dinh nghia da chot voi
// chu he thong luc thiet ke backend GET /dat-mua-lk/luong-quy-trinh. Van dung thuoc tinh title (native
// tooltip) - KHONG tu ve tooltip vi nam trong container overflow-x-auto, de bi cat mep khi cuon ngang.
export const STEP_DESCRIPTION: Record<string, string> = {
  tram: tr("Đơn đang chờ Trạm duyệt trước khi chuyển lên cấp tiếp theo."),
  tp_dvbh: tr("Đơn linh kiện đặc thù đang chờ TBP DVBH xác nhận."),
  tra_hang_kt: tr("Đơn trả hàng đang chờ Kế toán duyệt mềm."),
  tra_hang_kho: tr("Đơn trả hàng đang chờ Kho xác nhận."),
  tra_hang_qc: tr("Đơn trả hàng đang chờ QC xác nhận."),
  tra_hang_tn: tr("Đơn trả hàng đang chờ TN duyệt tổng."),
  tra_hang_kt_nhap: tr("Đơn trả hàng đã duyệt, đang chờ Kế toán xác nhận nhập kho."),
  tra_hang_kho_nhap: tr("Đơn trả hàng đang chờ Kho xác nhận nhập kho."),
  tac_nghiep: tr("Đơn mua hàng/công nợ đang chờ Tác nghiệp duyệt."),
  cho_hang: tr("Đơn đã duyệt nhưng đang chờ hàng về kho."),
  thieu_lk: tr("Ticket báo thiếu linh kiện đang chờ Kho xử lý."),
  cho_tien: tr("Phiếu xuất kho có tiền cần chuyển nhưng chưa được xác nhận đã chuyển."),
  tao_pxk: tr("Phiếu xuất kho đã tạo nhưng chưa gửi Kế toán."),
  ke_toan: tr("Phiếu xuất kho đang chờ Kế toán chốt đơn xuất."),
  kho: tr("Phiếu xuất kho đã chốt, đang chờ Kho gửi hàng."),
  ktv: tr("Phiếu xuất kho đang chờ KTV xác nhận đã nhận hàng."),
};

// Danh sach option trang thai dung CHUNG cho TrangThaiChipFilter (hien thi) VA ActiveFiltersBar (chip
// "Dang loc" - tra cuu label dep tu gia tri raw dang luu trong filterTrangThai, xem trangThaiLabel).
// SUA (kiem thu qua dev-login local 2026-08-19): truoc day 4 noi goi ActiveFiltersBar hien THANG gia
// tri raw filterTrangThai (vd "Cho kho xu ly" khong dau) lam nhan chip thay vi nhan dep co dau - phat
// hien khi test qua localhost:5173 that (khong phai chi doc code).
export const DON_CUA_TOI_TRANG_THAI_OPTIONS = [
  { value: "", label: tr("Tất cả trạng thái") },
  { value: "Cho Tram duyet", label: tr("Chờ Trạm duyệt") },
  { value: "Cho TBP xac nhan", label: tr("Chờ TBP DVBH xác nhận") },
  { value: "Cho TN duyet", label: tr("Chờ TN duyệt") },
  { value: "TN da duyet", label: tr("TN đã duyệt") },
  { value: "TN tu choi", label: tr("TN từ chối") },
  { value: "Cho hang", label: tr("Chờ hàng") },
  { value: "Da huy", label: tr("Đã hủy") },
];
export const PXK_TRANG_THAI_OPTIONS = [
  { value: "", label: tr("Tất cả") },
  { value: "Dang tao phieu", label: tr("Đang tạo phiếu") },
  { value: "Cho ke toan", label: tr("Chờ kế toán") },
  { value: "Da chot xong don xuat", label: tr("Đã chốt xong đơn xuất") },
  { value: "Dang gui KTV", label: tr("Đang gửi KTV") },
  { value: "KTV da nhan", label: tr("KTV đã nhận") },
  { value: "Ke toan huy", label: tr("Kế toán huỷ") },
  { value: "Hang tru kho", label: tr("Hàng trừ kho") },
  { value: "Kho da ket thuc", label: tr("Kho đã kết thúc") },
];
// QA 2026-08-19: THIEU truoc day 2 trang thai "Kho tu choi sai TT"/"Da huy bo" - deu la trang thai
// HOP LE thuc su dat toi duoc (xem validNext o backend/src/routes/datMuaLinhKien.ts), nhung khong co
// trong danh sach loc nen nguoi dung khong the loc rieng cac ve da bi kho tu choi/huy bo, phai tu doc
// qua "Tat ca" - khac voi moi tab khac deu co day du option loc cho trang thai "huy/tu choi" cua no.
export const THIEU_LK_TRANG_THAI_OPTIONS = [
  { value: "", label: tr("Tất cả") },
  { value: "Cho kho xu ly", label: tr("Chờ kho xử lý") },
  { value: "Kho da tiep nhan", label: tr("Kho đã tiếp nhận") },
  { value: "Kho xac nhan hang da ve", label: tr("Hàng đã về") },
  { value: "Kho tu choi sai TT", label: tr("Kho từ chối (sai TT)") },
  { value: "Da huy bo", label: tr("Đã huỷ bỏ") },
  { value: "Da ket thuc", label: tr("Đã kết thúc") },
];
export const TRA_HANG_TRANG_THAI_OPTIONS = [
  { value: "", label: tr("Tất cả") },
  { value: "Cho ke toan duyet mem", label: tr("Chờ kế toán duyệt mềm") },
  { value: "Cho kho xac nhan", label: tr("Chờ kho xác nhận") },
  { value: "Cho QC xac nhan", label: tr("Chờ QC xác nhận") },
  { value: "Cho TN duyet tong", label: tr("Chờ TN duyệt tổng") },
  { value: "Cho ke toan xac nhan nhap kho", label: tr("Chờ kế toán xác nhận nhập kho") },
  { value: "Cho kho xac nhan nhap kho", label: tr("Chờ kho xác nhận nhập kho") },
  { value: "Da hoan thanh", label: tr("Đã hoàn thành") },
  { value: "Tu choi", label: tr("Từ chối") },
  { value: "Da huy", label: tr("Đã huỷ") },
];

export const PIPELINE_NOTCH = 10;
export const PIPELINE_SEG_WIDTH = 80;

export const PXK_MINI_STEPS = ["Dang tao phieu", "Cho ke toan", "Da chot xong don xuat", "Dang gui KTV", "KTV da nhan"] as const;
export const PXK_MINI_LABEL: Record<string, string> = {
  "Dang tao phieu": tr("Tạo phiếu"),
  "Cho ke toan": tr("Kế toán"),
  "Da chot xong don xuat": tr("Chốt xong"),
  "Dang gui KTV": tr("Gửi KTV"),
  "KTV da nhan": tr("KTV nhận"),
};
export const PXK_MINI_NHANH_RE = new Set(["Ke toan huy", "Hang tru kho", "Kho da ket thuc"]);
export const PXK_MINI_SEG_WIDTH = 62;

// YEU_CAU_HOA_DON_OPTIONS/CHINH_SACH_OPTIONS: gia tri co dinh theo sheet "Settings" file Excel goc
// (khong doi duoc qua Settings module - khac loai_de_xuat, danh sach nay it thay doi va gan chat voi
// logic nghiep vu chinh_sach/yeu_cau_hoa_don, khong can quan ly dong nhu loai_de_xuat).
export const YEU_CAU_HOA_DON_OPTIONS = ["Không", "Yêu cầu hóa đơn (KTV không thu phí dịch vụ)", "Yêu cầu hóa đơn (KTV có thu phí dịch vụ)"];
export const CHINH_SACH_OPTIONS = ["Trong CSBH", "Ngoài CSBH"];
// Nhan rut gon cho 3 nut tich chon YCHD (dot 3 gop y #4) - gia tri luu DB VAN la chuoi day du o
// YEU_CAU_HOA_DON_OPTIONS, chi doi nhan HIEN THI cho gon.
export const YEU_CAU_HOA_DON_SHORT_LABELS: Record<string, string> = {
  "Không": "Không",
  "Yêu cầu hóa đơn (KTV không thu phí dịch vụ)": "HĐ - Không thu phí",
  "Yêu cầu hóa đơn (KTV có thu phí dịch vụ)": "HĐ - Có thu phí",
};


// Cac trang thai 1 dong con "dang mo" - moi cho phep chon checkbox/hanh dong don le.
export const DON_HANG_DANG_MO = ["Cho Tram duyet", "Cho TBP xac nhan", "Cho TN duyet"];
