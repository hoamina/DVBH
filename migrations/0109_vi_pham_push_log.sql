-- Nhat ky moi lan DVBH bao (push) sang he ngoai "vipham.dichvu3t.workers.dev" qua
-- pushViPhamToVipham() (xem backend/src/lib/viPhamBenNgoai.ts) - truoc day fire-and-forget hoan
-- toan (chi console.error khi loi), khong luu vet gi ca nen khong the biet ty le thanh cong/that
-- bai hay phat hien case nao bi "rot" khoi vipham do downtime/loi mang phia ho. Bang nay CHI de
-- giam sat/doi soat sau nay (chua co canh bao/report tu dong) - KHONG doi hanh vi fire-and-forget
-- hien co (van khong retry, van khong chan luong chinh).
CREATE TABLE vi_pham_push_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    vi_pham_id      TEXT NOT NULL,
    case_id         TEXT NOT NULL,
    loai_su_kien    TEXT NOT NULL,
    nguon_cap_nhat  TEXT,
    ok              INTEGER NOT NULL,
    http_status     INTEGER,
    error           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);
CREATE INDEX idx_vi_pham_push_log_vi_pham ON vi_pham_push_log (vi_pham_id);
CREATE INDEX idx_vi_pham_push_log_created ON vi_pham_push_log (created_at);
