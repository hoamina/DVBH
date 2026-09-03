-- Migration 0105: Bo FK cua nguoi_cap_nhat toi users(email) - CHOT 2026-09-04.
--
-- Phat hien khi trien khai "/api/partner/sync/ktv" (routes/partnerApi.ts, dong bo tu he doc lap
-- "Dat mua linh kien"): route do dung nguoi_cap_nhat = "sync:<ten_doi_tac>" (vd "sync:linh-kien-app
-- sync (ghi)") de Admin phan biet dong nao do he ngoai tu dong ghi - gia tri nay KHONG phai email
-- that trong bang users nen bi FK chan, loi SQLITE_CONSTRAINT_FOREIGNKEY (500 INTERNAL_ERROR) moi
-- lan dong bo KTV, dung linh_kien.nguoi_cap_nhat da tung gap va bo FK y het ly do nay o migration
-- 0003 ("de dong bo Google Sheet - co the la email ngoai he thong").
--
-- Recreate-table an toan (da grep xac nhan khong bang nao REFERENCES ktv_lien_he, giong 0071/0072).

CREATE TABLE ktv_lien_he_new (
    ma_ktv           TEXT PRIMARY KEY,
    ten_hien_thi     TEXT,
    sdt              TEXT,
    ghi_chu          TEXT,
    nguoi_cap_nhat   TEXT,
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
