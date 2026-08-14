-- ============================================================
-- Bao cao "dong bang" 08:00 sang VN + delta trong ngay cho banner "Bao cao nhanh van de trong ngay"
-- (Tong quat). Snapshot luu danh sach case id theo tung bucket (khong chi so dem) de luc xem bao cao
-- co the doi chieu voi log moi hon moc generated_at va tinh ra "da xu ly trong ngay" - xem
-- backend/src/lib/dailySnapshot.ts. 1 dong / (ngay, scope_key) - UPSERT khi cron 08:00 chay hoac
-- Admin bam "Lam moi bao cao" (khong tich luy lich su nhieu dong/ngay).
-- ============================================================

CREATE TABLE daily_snapshot (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ngay            TEXT NOT NULL,              -- 'YYYY-MM-DD' theo gio VN (getVnDateStr())
    scope_key       TEXT NOT NULL,              -- '<role_variant>|<scope>', vd 'khac|all', 'qc|all', 'giam_sat|MB,MN'
    generated_at    TEXT NOT NULL,              -- datetime('now') UTC - moc dung de so log "moi hon"
    generated_by    TEXT NOT NULL,              -- email admin, hoac 'auto'
    payload         TEXT NOT NULL,              -- JSON DailySnapshotPayload (xem dailySnapshot.ts)

    UNIQUE (ngay, scope_key)
);
