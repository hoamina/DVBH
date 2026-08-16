-- Migration 0072: Bo rang buoc FK cua giam_sat_quan_ly/email_dang_nhap toi users(email) - CHOT
-- 2026-08-15.
--
-- 2 cot nay tu migration 0067 da duoc chu thich ro la "THAM CHIEU/DANH BA - KHONG thay the
-- users.tram_cha/giam_sat_quan_ly (nguon that phan quyen duyet), chi de tra cuu + goi y luc Admin
-- ghep tai khoan dang nhap" - tuc la du lieu MEM, khong phai nguon that. FK cung lam sai thuc te:
-- Admin thuong import danh sach KTV/nguoi giam sat TRUOC KHI nguoi do dang nhap lan dau (chua co
-- dong trong bang users) - FK chan insert/update ca dong do, va vi ktv-lien-he/import/commit chay
-- trong 1 batch/transaction ngam nen 1 dong loi lam ROLLBACK CA BATCH (INTERNAL_ERROR, khong dong
-- nao duoc luu du cac dong khac hop le).
--
-- Bo FK giai quyet dung y muon "cho luu truoc, tu dong khop khi nguoi do dang nhap lan dau": cac
-- endpoint dang JOIN ktv_lien_he.email_dang_nhap voi users (vd GET /dat-mua-lk/nguoi-nhan-hang-kha-dung)
-- van hoat dong nguyen ven - JOIN don gian se tu dong bat dau khop ngay khi 1 dong users tuong ung
-- xuat hien, khong can code them.
--
-- Recreate-table an toan (da grep xac nhan khong bang nao REFERENCES ktv_lien_he).

CREATE TABLE ktv_lien_he_new (
    ma_ktv           TEXT PRIMARY KEY,
    ten_hien_thi     TEXT,
    sdt              TEXT,
    ghi_chu          TEXT,
    nguoi_cap_nhat   TEXT REFERENCES users(email),
    ngay_cap_nhat    TEXT NOT NULL DEFAULT (datetime('now')),
    gmail            TEXT,
    vai_tro_ktv      TEXT CHECK (vai_tro_ktv IN ('KTV', 'CTV', 'Tram', 'Ve tinh')),
    giam_sat_quan_ly TEXT,
    email_dang_nhap  TEXT
);

INSERT INTO ktv_lien_he_new
    (ma_ktv, ten_hien_thi, sdt, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat, gmail, vai_tro_ktv, giam_sat_quan_ly, email_dang_nhap)
SELECT
    ma_ktv, ten_hien_thi, sdt, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat, gmail, vai_tro_ktv, giam_sat_quan_ly, email_dang_nhap
FROM ktv_lien_he;

DROP TABLE ktv_lien_he;
ALTER TABLE ktv_lien_he_new RENAME TO ktv_lien_he;
