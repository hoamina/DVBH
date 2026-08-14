-- ============================================================
-- Danh ba SDT ky thuat vien (CHOT 2026-08-06) - CSKH khao sat vi pham thinh thoang phai goi truc tiep
-- cho KTV, truoc day phai tra SDT o ngoai he thong. "case_dvbh.ky_thuat_vien" la text tu do tu CRM,
-- dang "(ma) Loai - Khu vuc - Ten" (vd "(huannt.mb) Tram Bac Ninh - TNHH TM va DV 3T Bac Ninh") - phan
-- "(ma)" o dau chuoi on dinh, phan con lai co the doi (da kiem tra du lieu that: cung ma xuat hien ca
-- dang thuong lan dang co hau to "(huy bo)") nen dung "ma_ktv" (trich tu trong dau ngoac don dau
-- chuoi, xem backend/src/lib/ktvCode.ts) lam khoa, KHONG dung nguyen chuoi ky_thuat_vien.
-- ============================================================

CREATE TABLE ktv_lien_he (
    ma_ktv          TEXT PRIMARY KEY,
    ten_hien_thi    TEXT,
    sdt             TEXT NOT NULL,
    ghi_chu         TEXT,
    nguoi_cap_nhat  TEXT REFERENCES users(email),
    ngay_cap_nhat   TEXT NOT NULL DEFAULT (datetime('now'))
);
