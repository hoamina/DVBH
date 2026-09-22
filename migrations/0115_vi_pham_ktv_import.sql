-- Migration 0115: Import vi pham hang loat tu Excel (yeu cau chu he thong 2026-09-22), cho
-- CSKH/TN CSKH/TBP CSKH/QC/Admin. 2 nhanh:
--   (a) co ID case -> ghi vao bang vi_pham HIEN CO (nhu tao thu cong tung ca, chi khac la bulk) -
--       KHONG can migration gi them cho nhanh nay.
--   (b) KHONG co ID case -> vi pham nay khong the ghi vao vi_pham (case_id NOT NULL + REFERENCES
--       case_dvbh, va vi_pham dang co con FK song tu vi_pham_giai_trinh nen KHONG the dung pattern
--       "recreate table" de noi long constraint nay - xem CLAUDE.md "D1 khong tat duoc FK giua
--       migration"). Tao bang RIENG vi_pham_ktv, gan truc tiep vao ky_thuat_vien (chuoi day du,
--       cung dinh dang voi case_dvbh.ky_thuat_vien) + ngay_ghi_nhan, khong qua case_dvbh/case_id.
--       khu_vuc luu SNAPSHOT tai thoi diem import (suy tu case gan nhat cua KTV do - xem
--       routes/importViPham.ts), KHONG dong bo lai sau nay du KTV doi khu vuc.
--       Van qua "cho QC chot cap 2" nhu vi_pham binh thuong (chot_bo_cap_2 NULL luc insert, QC
--       chot/bo qua PATCH /api/vi-pham-ktv/:id/cap2) - CHOT voi chu he thong 2026-09-22.
CREATE TABLE vi_pham_ktv (
    id                  TEXT PRIMARY KEY,          -- vd: LK-000001 (tien to rieng, phan biet voi "L-" cua vi_pham)
    ky_thuat_vien       TEXT NOT NULL,              -- chuoi day du "(ma_ktv) Ten hien thi", suy tu case gan nhat
    khu_vuc             TEXT,                       -- snapshot tai thoi diem import, xem chu thich tren
    loai_loi            TEXT NOT NULL DEFAULT 'Khac' CHECK (loai_loi IN (
                            'Loi 120 phut', 'Hen qua 24h',
                            'Loi lo ke hoach', 'KH hen lai', 'Khac'
                        )),                         -- KHONG cho 'KSNB' (danh rieng cho dong bo Sheet tu dong)
    ket_qua_cap_1       TEXT NOT NULL,              -- khong CHECK cung (danh muc dong o settings_loai_vi_pham,
                                                     -- validate o app - xem lib/ketQuaCap1.ts), != 'Khong loi'
    ghi_chu             TEXT,
    nguoi_ghi_nhan      TEXT NOT NULL REFERENCES users(email),
    ngay_ghi_nhan       TEXT NOT NULL,
    chot_bo_cap_2       INTEGER,                    -- NULL = cho QC, 1 = chot, 0 = bo (giong het vi_pham)
    nguoi_chot          TEXT REFERENCES users(email),
    ngay_chot           TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),

    CONSTRAINT chk_ktv_cap2_sau_cap1 CHECK (chot_bo_cap_2 IS NULL OR ket_qua_cap_1 IS NOT NULL),
    -- Dedup idempotency cho import lap (vd nguoi dung upload nham 2 lan cung file).
    UNIQUE (ky_thuat_vien, ngay_ghi_nhan, loai_loi, ket_qua_cap_1)
);
CREATE INDEX idx_vi_pham_ktv_ky_thuat_vien ON vi_pham_ktv (ky_thuat_vien);
CREATE INDEX idx_vi_pham_ktv_ngay_ghi_nhan ON vi_pham_ktv (ngay_ghi_nhan);
CREATE INDEX idx_vi_pham_ktv_cho_qc ON vi_pham_ktv (id) WHERE chot_bo_cap_2 IS NULL;

INSERT INTO id_counters (ten_bang, gia_tri_hien_tai) VALUES ('vi_pham_ktv', 0);
