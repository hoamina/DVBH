-- Migration 0071: sdt tren ktv_lien_he KHONG con bat buoc - CHOT 2026-08-15: chi ma_ktv la bat buoc
-- khi them/import KTV (danh sach KTV dung chung cho CSKH goi khao sat + module "Dat mua linh kien"
-- chon "nguoi nhan hang", ma sau khong phai KTV nao cung can co san SDT ngay luc tao).
--
-- Recreate-table an toan o day: da grep xac nhan khong bang nao REFERENCES ktv_lien_he (xem CLAUDE.md
-- ve gioi han nay). Giu nguyen toan bo cot khac tu 0049 + 0067, chi bo NOT NULL cua sdt.

CREATE TABLE ktv_lien_he_new (
    ma_ktv           TEXT PRIMARY KEY,
    ten_hien_thi     TEXT,
    sdt              TEXT,
    ghi_chu          TEXT,
    nguoi_cap_nhat   TEXT REFERENCES users(email),
    ngay_cap_nhat    TEXT NOT NULL DEFAULT (datetime('now')),
    gmail            TEXT,
    vai_tro_ktv      TEXT CHECK (vai_tro_ktv IN ('KTV', 'CTV', 'Tram', 'Ve tinh')),
    giam_sat_quan_ly TEXT REFERENCES users(email),
    email_dang_nhap  TEXT REFERENCES users(email)
);

INSERT INTO ktv_lien_he_new
    (ma_ktv, ten_hien_thi, sdt, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat, gmail, vai_tro_ktv, giam_sat_quan_ly, email_dang_nhap)
SELECT
    ma_ktv, ten_hien_thi, sdt, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat, gmail, vai_tro_ktv, giam_sat_quan_ly, email_dang_nhap
FROM ktv_lien_he;

DROP TABLE ktv_lien_he;
ALTER TABLE ktv_lien_he_new RENAME TO ktv_lien_he;
