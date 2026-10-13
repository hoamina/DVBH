-- "Phạm vi báo cáo: Tất cả / NSKX / Không NSKX" (2026-10-13, chot voi chu he thong): nut tren TopBar CHI anh huong viec
-- XEM bao cao/danh sach (moi nghiep vu khac chay binh thuong). NSKX = doi_tac 'NSKX' hoac '[NSKX]' (cach ghi CRM cu,
-- du lieu import truoc 07/2026 - cung doi tac, giong partnerDanhSachTon.ts).
-- Backend (lib/phamVi.ts) boc D1 cua request GET co ?pv=nskx|khong_nskx bang 1 proxy DOI TEN trong SQL:
--   case_hieu_luc -> case_hieu_luc_<pv>  (view duoi day)
--   case_dvbh [alias] INDEXED BY idx -> view / subquery da loc (giu duong doc theo index)
--   cac bang so chot + cache ben duoi -> ban sao "_<pv>"
-- => moi logic tinh / chot 08:00 / tu ghi bu (self-heal) chay NGUYEN VAN nhung doc + ghi dung bo du lieu cua pham vi,
-- KHONG bao gio ghi de so "Tất cả". Cron chot them 2 pham vi tu ngay trien khai (khong co lich su truoc do).

CREATE VIEW case_hieu_luc_nskx AS SELECT * FROM case_dvbh WHERE huy_bo_at IS NULL AND doi_tac IN ('NSKX', '[NSKX]');
CREATE VIEW case_hieu_luc_khong_nskx AS SELECT * FROM case_dvbh WHERE huy_bo_at IS NULL AND COALESCE(doi_tac, '') NOT IN ('NSKX', '[NSKX]');

-- ---------- pham vi: nskx ----------
CREATE TABLE precomputed_cache_nskx (
  key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE daily_snapshot_nskx (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ngay TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  generated_by TEXT NOT NULL,
  payload TEXT NOT NULL,
  UNIQUE (ngay, scope_key)
);
CREATE TABLE giai_trinh_daily_log_nskx (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ngay TEXT NOT NULL,
  khu_vuc TEXT NOT NULL,
  can_giai_trinh INTEGER NOT NULL,
  da_giai_trinh INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (ngay, khu_vuc)
);
CREATE TABLE backlog_age_daily_nskx (
  ngay TEXT NOT NULL,
  dim TEXT NOT NULL,
  gia_tri TEXT NOT NULL,
  tong_tuoi INTEGER NOT NULL,
  so_ca INTEGER NOT NULL,
  PRIMARY KEY (ngay, dim, gia_tri)
);
CREATE INDEX idx_backlog_age_daily_nskx_ngay ON backlog_age_daily_nskx(ngay);
CREATE TABLE backlog_age_month_manifest_nskx (
  thang TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE ton_ktv_daily_nskx (
  ngay TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE canh_bao_ton_daily_log_nskx (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ngay TEXT NOT NULL,
  khu_vuc TEXT NOT NULL,
  ton_14_ngay INTEGER NOT NULL,
  vip_svip_5_ngay INTEGER NOT NULL,
  loc_tong_3_ngay INTEGER NOT NULL,
  tranh_chap_3_ngay INTEGER NOT NULL,
  ton_20_ngay INTEGER NOT NULL,
  vip_svip_7_ngay INTEGER NOT NULL,
  loc_tong_5_ngay INTEGER NOT NULL,
  tranh_chap_5_ngay INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  luong_doi_tra_7_ngay INTEGER,
  luong_doi_tra_10_ngay INTEGER,
  UNIQUE (ngay, khu_vuc)
);

-- ---------- pham vi: khong_nskx ----------
CREATE TABLE precomputed_cache_khong_nskx (
  key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE daily_snapshot_khong_nskx (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ngay TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  generated_by TEXT NOT NULL,
  payload TEXT NOT NULL,
  UNIQUE (ngay, scope_key)
);
CREATE TABLE giai_trinh_daily_log_khong_nskx (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ngay TEXT NOT NULL,
  khu_vuc TEXT NOT NULL,
  can_giai_trinh INTEGER NOT NULL,
  da_giai_trinh INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (ngay, khu_vuc)
);
CREATE TABLE backlog_age_daily_khong_nskx (
  ngay TEXT NOT NULL,
  dim TEXT NOT NULL,
  gia_tri TEXT NOT NULL,
  tong_tuoi INTEGER NOT NULL,
  so_ca INTEGER NOT NULL,
  PRIMARY KEY (ngay, dim, gia_tri)
);
CREATE INDEX idx_backlog_age_daily_khong_nskx_ngay ON backlog_age_daily_khong_nskx(ngay);
CREATE TABLE backlog_age_month_manifest_khong_nskx (
  thang TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE ton_ktv_daily_khong_nskx (
  ngay TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE canh_bao_ton_daily_log_khong_nskx (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ngay TEXT NOT NULL,
  khu_vuc TEXT NOT NULL,
  ton_14_ngay INTEGER NOT NULL,
  vip_svip_5_ngay INTEGER NOT NULL,
  loc_tong_3_ngay INTEGER NOT NULL,
  tranh_chap_3_ngay INTEGER NOT NULL,
  ton_20_ngay INTEGER NOT NULL,
  vip_svip_7_ngay INTEGER NOT NULL,
  loc_tong_5_ngay INTEGER NOT NULL,
  tranh_chap_5_ngay INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  luong_doi_tra_7_ngay INTEGER,
  luong_doi_tra_10_ngay INTEGER,
  UNIQUE (ngay, khu_vuc)
);
