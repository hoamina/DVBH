-- ============================================================
-- Bang nap_gas_danh_gia: log "chot" danh gia nap gas rieng cho tab "Nghi ngo nap gas" - THAY THE
-- viec muon dung tam bang giai_trinh chung (von thiet ke cho luong "giai trinh ca ton" khac muc
-- dich) de xac dinh "da/chua danh gia". Moi ca CHI co 1 dong (case_id la PRIMARY KEY, khong phai
-- 1 log nhieu dong nhu giai_trinh) - "chot lai" (sua danh gia) se UPSERT ghi de dong cu, giu lai
-- gia tri nguoi_chot/ngay_chot cua LAN CHOT GAN NHAT, dung idiom giong vi_pham.chot_bo_cap_2 (xem
-- backend/src/routes/viPham.ts PATCH /:id/cap2) - toggle/ghi de qua lai, khong phai append-only.
--
-- 2 cot lua chon (danh_gia_nap_gas, phi_dich_vu) luu MA NOI BO khong dau (giong CaLapLoai/
-- HinhThucXuLy trong backend/src/types.ts) - nhan hien thi co dau tra ve qua map rieng o tang FE
-- (NAP_GAS_DANH_GIA_META/NAP_GAS_PHI_DICH_VU_META trong frontend/src/types.ts), khong luu thang
-- chuoi co dau xuong DB de tranh sai lech khi so sanh/GROUP BY trong SQL.
-- ============================================================
CREATE TABLE nap_gas_danh_gia (
    case_id             TEXT PRIMARY KEY REFERENCES case_dvbh(id),
    danh_gia_nap_gas    TEXT NOT NULL CHECK (danh_gia_nap_gas IN (
                            'Tu nap gas', 'Khong nap gas', 'Gui ve Hang nap gas',
                            'Tu nap gas thay Block', 'Sua chua khac', 'Kiem tra'
                        )),
    phi_dich_vu         TEXT NOT NULL CHECK (phi_dich_vu IN (
                            'Khong thu phi DV', 'Khong nap gas', 'Da thu phi DV', 'Loi khong thu phi DV'
                        )),
    nguoi_chot          TEXT NOT NULL REFERENCES users(email),
    ngay_chot           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_nap_gas_danh_gia_ngay_chot ON nap_gas_danh_gia (ngay_chot);
