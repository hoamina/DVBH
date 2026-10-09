-- 2026-10-09: "Danh sach loai tru" khao sat (Quan ly khao sat, TN CSKH/TBP CSKH quan ly).
-- Moi dong = 1 KTV (khoa on dinh ma_ktv - phan "(ma)" dau chuoi case_dvbh.ky_thuat_vien, xem lib/ktvCode.ts)
-- + 1 nhom loi (loai_loi dung dung gia tri vi_pham.loai_loi) + khoang ngay [tu_ngay, den_ngay] (YYYY-MM-DD, so
-- voi NGAY CSKH TIEP NHAN ca). Ca cua KTV do tiep nhan trong khoang -> nghi ngo loai do KHONG con bat buoc
-- khao sat (lib/surveyConditions.ts NEED_SURVEY_CONDITION). Bang nho, doc trong NOT EXISTS theo (loai_loi, ma_ktv).
CREATE TABLE khao_sat_loai_tru (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ma_ktv      TEXT NOT NULL,
    ten_ktv     TEXT,
    loai_loi    TEXT NOT NULL CHECK (loai_loi IN ('Loi 120 phut', 'Hen qua 24h', 'Loi lo ke hoach', 'KH hen lai')),
    tu_ngay     TEXT NOT NULL,
    den_ngay    TEXT NOT NULL,
    ghi_chu     TEXT,
    nguon       TEXT NOT NULL DEFAULT 'thu_cong' CHECK (nguon IN ('thu_cong', 'import')),
    nguoi_tao   TEXT NOT NULL,
    ngay_tao    TEXT NOT NULL,
    CHECK (tu_ngay <= den_ngay)
);

CREATE INDEX idx_khao_sat_loai_tru_loai_ktv ON khao_sat_loai_tru (loai_loi, ma_ktv);
