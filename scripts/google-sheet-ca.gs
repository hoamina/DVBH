/**
 * Google Apps Script: kéo dữ liệu ca từ DVBH về Google Sheet (2026-10-29).
 *
 * Nguồn: GET https://dvbh.dichvu3t.workers.dev/api/partner/google-sheet-ca (PARTNER_API_GUIDE.md mục 15)
 *   = ca ĐANG TỒN + ca HOÀN THÀNH trong SO_NGAY ngày gần nhất, lọc theo KHU_VUC bên dưới.
 * Ghi vào sheet theo ID: dòng đã có ID thì cập nhật 28 cột A..AB, ID mới thêm xuống cuối.
 * Không xóa dòng nào; các cột tự thêm bên phải cột AB (ghi chú...) giữ nguyên.
 *
 * Cài đặt (1 lần):
 *  1. Mở Google Sheet → Tiện ích mở rộng → Apps Script → dán toàn bộ file này → Lưu.
 *  2. Tải lại Sheet → menu "DVBH" → "Cài API key" → dán key do Admin DVBH cấp
 *     (Cài đặt → API đối tác). Key lưu trong Script Properties, không nằm trong code.
 *  3. Menu "DVBH" → "Bật tự cập nhật hằng ngày" (chạy khoảng 9h–10h sáng mỗi ngày).
 *  4. Muốn kéo ngay: menu "DVBH" → "Làm mới ngay".
 * Lần đầu chạy, Google sẽ hỏi quyền (gọi URL bên ngoài + sửa bảng tính) → Cho phép.
 */

const BASE_URL = "https://dvbh.dichvu3t.workers.dev/api/partner/google-sheet-ca";
const SHEET_NAME = "Sheet1"; // tên tab nhận dữ liệu
const SO_NGAY = 3; // ca hoàn thành trong bao nhiêu ngày gần nhất
const KHU_VUC = [
  "(qldvbh.mb3) Quản lý khu vực MB3",
  "(qlkddv.3t) Quản lý kinh doanh dịch vụ",
  "(qldvbh.mn2) Quản lý khu vực MN2",
  "(qldvbh.mn1) Quản lý khu vực MN1",
  "Phòng bảo hành 3T miền Nam",
  "(qldvbh.mn3) Quản lý khu vực MN3",
  "(qldvbh.mb2) Quản lý khu vực MB2",
  "(qldvbh.mb1) Quản lý khu vực MB1",
  "Phòng bảo hành 3T miền Bắc",
  "(qlb2b.b2b-mn) Quản lý B2B Miền Bắc",
  "(qlb2b.b2b-mn) Quản lý B2B Miền Nam",
];
const COT_NGAY = ["Thời gian CSKH tiếp nhận", "Thời gian hẹn xử lý", "Thời gian hoàn thành"];
const COT_SO = ["ID", "XLSC Doanh thu sản phẩm", "XLSC Doanh thu linh kiện", "XLSC Doanh thu dịch vụ"];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("DVBH")
    .addItem("Làm mới ngay", "keoDuLieuDvbh")
    .addItem("Cài API key", "caiApiKey")
    .addItem("Bật tự cập nhật hằng ngày", "batTuCapNhat")
    .addItem("Tắt tự cập nhật", "tatTuCapNhat")
    .addToUi();
}

function caiApiKey() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt("API key DVBH", "Dán API key do Admin DVBH cấp:", ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  PropertiesService.getScriptProperties().setProperty("DVBH_API_KEY", r.getResponseText().trim());
  ui.alert("Đã lưu API key.");
}

function batTuCapNhat() {
  tatTuCapNhat();
  ScriptApp.newTrigger("keoDuLieuDvbh").timeBased().everyDays(1).atHour(9).create();
  SpreadsheetApp.getActive().toast("Đã bật tự cập nhật mỗi ngày (khoảng 9h–10h).", "DVBH");
}

function tatTuCapNhat() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "keoDuLieuDvbh")
    .forEach((t) => ScriptApp.deleteTrigger(t));
}

/** "YYYY-MM-DD HH:MM:SS" (giờ VN) -> Date; giá trị khác giữ nguyên. Múi giờ Script nên là GMT+7. */
function sangNgay_(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(v));
  if (!m) return v;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}

function goiApi_(apiKey, page) {
  const q = [
    "page=" + page,
    "pageSize=2000",
    "so_ngay=" + SO_NGAY,
    "khu_vuc=" + encodeURIComponent(KHU_VUC.join(",")),
  ].join("&");
  const res = UrlFetchApp.fetch(BASE_URL + "?" + q, {
    headers: { "X-API-Key": apiKey },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error("DVBH trả lỗi " + res.getResponseCode() + ": " + res.getContentText().slice(0, 300));
  }
  return JSON.parse(res.getContentText());
}

function keoDuLieuDvbh() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return; // đang có lần chạy khác
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty("DVBH_API_KEY");
    if (!apiKey) throw new Error('Chưa cài API key: menu "DVBH" → "Cài API key".');

    // 1. Kéo đủ mọi trang
    let page = 1;
    let columns = null;
    const rows = [];
    for (;;) {
      const d = goiApi_(apiKey, page);
      columns = d.columns;
      rows.push(...d.rows);
      if (rows.length >= d.total || d.rows.length === 0) break;
      page++;
    }
    const nCot = columns.length;
    const iNgay = COT_NGAY.map((t) => columns.indexOf(t));
    const iSo = COT_SO.map((t) => columns.indexOf(t));
    const chuanHoa = (r) =>
      r.map((v, i) => {
        if (v === "" || v === null) return "";
        if (iNgay.indexOf(i) >= 0) return sangNgay_(v);
        if (iSo.indexOf(i) >= 0 && /^\d+(\.\d+)?$/.test(String(v))) return Number(v);
        return v;
      });

    // 2. Đọc sheet hiện có, ghép theo ID (cột A)
    const ss = SpreadsheetApp.getActive();
    const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, nCot).setValues([columns]);
    const last = sh.getLastRow();
    const cu = last > 1 ? sh.getRange(2, 1, last - 1, nCot).getValues() : [];
    const viTri = new Map();
    cu.forEach((r, i) => {
      const id = String(r[0]).trim();
      if (id) viTri.set(id, i);
    });

    let capNhat = 0;
    const moi = [];
    rows.forEach((r) => {
      const dong = chuanHoa(r);
      const i = viTri.get(String(r[0]).trim());
      if (i === undefined) moi.push(dong);
      else {
        cu[i] = dong;
        capNhat++;
      }
    });

    // 3. Ghi 1 lần cho phần cũ + 1 lần cho dòng mới (chỉ cột A..AB)
    if (cu.length) sh.getRange(2, 1, cu.length, nCot).setValues(cu);
    if (moi.length) sh.getRange(cu.length + 2, 1, moi.length, nCot).setValues(moi);
    if (cu.length + moi.length > 0) COT_NGAY.forEach((t) => {
      const c = columns.indexOf(t) + 1;
      if (c > 0) sh.getRange(2, c, cu.length + moi.length, 1).setNumberFormat("dd/mm/yyyy hh:mm");
    });

    const tb = "Cập nhật " + capNhat + " ca, thêm mới " + moi.length + " ca (DVBH trả " + rows.length + " ca).";
    sh.getRange(1, 1).setNote("Lần kéo gần nhất: " + new Date().toLocaleString("vi-VN") + "\n" + tb);
    ss.toast(tb, "DVBH");
  } finally {
    lock.releaseLock();
  }
}
