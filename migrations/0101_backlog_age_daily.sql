-- Bao cao "Tuoi ton trung binh" (Quan ly ton) - chot 08:00 sang gio VN moi ngay (xem
-- lib/backlogAgeSnapshot.ts). Moi dong la 1 to hop (ngay, dim, gia_tri) da tong hop san tong tuoi
-- ton + so ca tai moc 08:00, de tinh trung binh = tong_tuoi / so_ca o client (khong tinh lai tren
-- server moi lan xem). dim = 'khu_vuc' | 'tinh' | 'hang' | 'doi_tac' | 'nhom_kh' | 'ky_thuat_vien' |
-- 'tong' (dong tong toan he thong, gia_tri = 'tat_ca'). Rieng dim='khu_vuc' co them 1 dong
-- gia_tri = '__nhom_qldvbh__' gop cac khu_vuc LIKE '%qldvbh%' (giong nhom loc "QLDVBH" da co san o
-- Quan ly ton).
CREATE TABLE backlog_age_daily (
  ngay TEXT NOT NULL,        -- 'YYYY-MM-DD' (gio VN)
  dim TEXT NOT NULL,
  gia_tri TEXT NOT NULL,
  tong_tuoi INTEGER NOT NULL,
  so_ca INTEGER NOT NULL,
  PRIMARY KEY (ngay, dim, gia_tri)
);

CREATE INDEX idx_backlog_age_daily_ngay ON backlog_age_daily(ngay);

-- Manifest hash tung THANG - client so hash cuc bo (IndexedDB) voi hash server de biet thang nao can
-- tai lai GET /api/backlog-age-report/data?thang=. Hash tinh tu toan bo dong backlog_age_daily cua
-- thang do (xem lib/backlogAgeSnapshot.ts), KHONG ghi gi len R2 - du lieu da tong hop rat nho, phuc
-- vu truc tiep tu D1 la du re.
CREATE TABLE backlog_age_month_manifest (
  thang TEXT PRIMARY KEY,    -- 'YYYY-MM'
  hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
