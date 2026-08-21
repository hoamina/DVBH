-- ============================================================
-- "Bien ban hop" - nhat ky ghi chu cac cuoc hop ve 1 ca, hien trong CaseDetail.tsx o 1 tab rieng
-- ngay sau tab "Giai trinh". Append-only (khong sua/xoa qua UI) - moi lan ghi la 1 dong moi, moi
-- nhat hien truoc. Noi dung tu do (textarea), nguoi ghi + thoi gian lay tu session dang dang nhap
-- (khong cho nguoi dung tu nhap de tranh gia mao).
-- ============================================================

CREATE TABLE bien_ban_hop (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id     TEXT NOT NULL REFERENCES case_dvbh(id),
    noi_dung    TEXT NOT NULL,
    nguoi_ghi   TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_bien_ban_hop_case_id ON bien_ban_hop(case_id);
