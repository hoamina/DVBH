-- "Đa quốc gia" GĐ2 (2026-10-29, SRS §12): bat dau ep pham vi quoc gia theo users.pham_vi_quoc_gia (lib/phamVi.ts).
-- Chu he thong chot: nhan vien hien tai mac dinh VN (Admin giu toan bo de quan tri), tai khoan moi cung mac dinh VN
-- (loadUser.ts / auth.ts / settings.ts ghi '["VN"]' luc tao), ca khong khop mau ID -> VN.
--
-- Pham vi theo nuoc dung CUNG co che "doi ten bang" voi NSKX (migration 0136): view case_hieu_luc_<hau to> + ban sao cac
-- bang so chot/cache. File nay tao san cho VN (vn, vn_nskx, vn_khong_nskx - NSKX chi co nghia o VN) va ID; nuoc them sau
-- tao tu dong luc chay (lib/quocGiaKichHoat.ts, cung ham sinh ra cac lenh duoi day tu DDL bang goc).
--
-- Chep lich su so chot hien co sang ban VN (moi du lieu truoc ngay nay la VN) de bieu do / so sanh cua nguoi xem VN
-- khong bi trong: goc -> _vn, _nskx -> _vn_nskx, _khong_nskx -> _vn_khong_nskx. KHONG chep precomputed_cache (tu tinh lai).

UPDATE users SET pham_vi_quoc_gia = '["VN"]' WHERE vai_tro IS NOT 'Admin' AND pham_vi_quoc_gia IS NULL;

-- ---------- pham vi: vn ----------
CREATE VIEW IF NOT EXISTS case_hieu_luc_vn AS SELECT * FROM case_dvbh WHERE huy_bo_at IS NULL AND quoc_gia = 'VN';
CREATE TABLE IF NOT EXISTS precomputed_cache_vn (
  key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS daily_snapshot_vn (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ngay            TEXT NOT NULL,              
    scope_key       TEXT NOT NULL,              
    generated_at    TEXT NOT NULL,              
    generated_by    TEXT NOT NULL,              
    payload         TEXT NOT NULL,              

    UNIQUE (ngay, scope_key)
);
CREATE TABLE IF NOT EXISTS giai_trinh_daily_log_vn (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ngay            TEXT NOT NULL,              
    khu_vuc         TEXT NOT NULL,
    can_giai_trinh  INTEGER NOT NULL,           
    da_giai_trinh   INTEGER NOT NULL,           
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE (ngay, khu_vuc)
);
CREATE TABLE IF NOT EXISTS canh_bao_ton_daily_log_vn (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ngay                TEXT NOT NULL,              
    khu_vuc             TEXT NOT NULL,
    ton_14_ngay         INTEGER NOT NULL,
    vip_svip_5_ngay     INTEGER NOT NULL,
    loc_tong_3_ngay     INTEGER NOT NULL,
    tranh_chap_3_ngay   INTEGER NOT NULL,
    ton_20_ngay         INTEGER NOT NULL,
    vip_svip_7_ngay     INTEGER NOT NULL,
    loc_tong_5_ngay     INTEGER NOT NULL,
    tranh_chap_5_ngay   INTEGER NOT NULL,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')), luong_doi_tra_7_ngay INTEGER, luong_doi_tra_10_ngay INTEGER,

    UNIQUE (ngay, khu_vuc)
);
CREATE TABLE IF NOT EXISTS backlog_age_daily_vn (
  ngay TEXT NOT NULL,        
  dim TEXT NOT NULL,
  gia_tri TEXT NOT NULL,
  tong_tuoi INTEGER NOT NULL,
  so_ca INTEGER NOT NULL,
  PRIMARY KEY (ngay, dim, gia_tri)
);
CREATE TABLE IF NOT EXISTS backlog_age_month_manifest_vn (
  thang TEXT PRIMARY KEY,    
  hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ton_ktv_daily_vn (
    ngay            TEXT PRIMARY KEY,           
    generated_at    TEXT NOT NULL,              
    payload         TEXT NOT NULL               
);
CREATE INDEX IF NOT EXISTS idx_backlog_age_daily_ngay_vn ON backlog_age_daily_vn(ngay);

-- ---------- pham vi: vn_nskx ----------
CREATE VIEW IF NOT EXISTS case_hieu_luc_vn_nskx AS SELECT * FROM case_dvbh WHERE huy_bo_at IS NULL AND quoc_gia = 'VN' AND doi_tac IN ('NSKX', '[NSKX]');
CREATE TABLE IF NOT EXISTS precomputed_cache_vn_nskx (
  key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS daily_snapshot_vn_nskx (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ngay            TEXT NOT NULL,              
    scope_key       TEXT NOT NULL,              
    generated_at    TEXT NOT NULL,              
    generated_by    TEXT NOT NULL,              
    payload         TEXT NOT NULL,              

    UNIQUE (ngay, scope_key)
);
CREATE TABLE IF NOT EXISTS giai_trinh_daily_log_vn_nskx (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ngay            TEXT NOT NULL,              
    khu_vuc         TEXT NOT NULL,
    can_giai_trinh  INTEGER NOT NULL,           
    da_giai_trinh   INTEGER NOT NULL,           
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE (ngay, khu_vuc)
);
CREATE TABLE IF NOT EXISTS canh_bao_ton_daily_log_vn_nskx (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ngay                TEXT NOT NULL,              
    khu_vuc             TEXT NOT NULL,
    ton_14_ngay         INTEGER NOT NULL,
    vip_svip_5_ngay     INTEGER NOT NULL,
    loc_tong_3_ngay     INTEGER NOT NULL,
    tranh_chap_3_ngay   INTEGER NOT NULL,
    ton_20_ngay         INTEGER NOT NULL,
    vip_svip_7_ngay     INTEGER NOT NULL,
    loc_tong_5_ngay     INTEGER NOT NULL,
    tranh_chap_5_ngay   INTEGER NOT NULL,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')), luong_doi_tra_7_ngay INTEGER, luong_doi_tra_10_ngay INTEGER,

    UNIQUE (ngay, khu_vuc)
);
CREATE TABLE IF NOT EXISTS backlog_age_daily_vn_nskx (
  ngay TEXT NOT NULL,        
  dim TEXT NOT NULL,
  gia_tri TEXT NOT NULL,
  tong_tuoi INTEGER NOT NULL,
  so_ca INTEGER NOT NULL,
  PRIMARY KEY (ngay, dim, gia_tri)
);
CREATE TABLE IF NOT EXISTS backlog_age_month_manifest_vn_nskx (
  thang TEXT PRIMARY KEY,    
  hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ton_ktv_daily_vn_nskx (
    ngay            TEXT PRIMARY KEY,           
    generated_at    TEXT NOT NULL,              
    payload         TEXT NOT NULL               
);
CREATE INDEX IF NOT EXISTS idx_backlog_age_daily_ngay_vn_nskx ON backlog_age_daily_vn_nskx(ngay);

-- ---------- pham vi: vn_khong_nskx ----------
CREATE VIEW IF NOT EXISTS case_hieu_luc_vn_khong_nskx AS SELECT * FROM case_dvbh WHERE huy_bo_at IS NULL AND quoc_gia = 'VN' AND COALESCE(doi_tac, '') NOT IN ('NSKX', '[NSKX]');
CREATE TABLE IF NOT EXISTS precomputed_cache_vn_khong_nskx (
  key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS daily_snapshot_vn_khong_nskx (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ngay            TEXT NOT NULL,              
    scope_key       TEXT NOT NULL,              
    generated_at    TEXT NOT NULL,              
    generated_by    TEXT NOT NULL,              
    payload         TEXT NOT NULL,              

    UNIQUE (ngay, scope_key)
);
CREATE TABLE IF NOT EXISTS giai_trinh_daily_log_vn_khong_nskx (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ngay            TEXT NOT NULL,              
    khu_vuc         TEXT NOT NULL,
    can_giai_trinh  INTEGER NOT NULL,           
    da_giai_trinh   INTEGER NOT NULL,           
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE (ngay, khu_vuc)
);
CREATE TABLE IF NOT EXISTS canh_bao_ton_daily_log_vn_khong_nskx (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ngay                TEXT NOT NULL,              
    khu_vuc             TEXT NOT NULL,
    ton_14_ngay         INTEGER NOT NULL,
    vip_svip_5_ngay     INTEGER NOT NULL,
    loc_tong_3_ngay     INTEGER NOT NULL,
    tranh_chap_3_ngay   INTEGER NOT NULL,
    ton_20_ngay         INTEGER NOT NULL,
    vip_svip_7_ngay     INTEGER NOT NULL,
    loc_tong_5_ngay     INTEGER NOT NULL,
    tranh_chap_5_ngay   INTEGER NOT NULL,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')), luong_doi_tra_7_ngay INTEGER, luong_doi_tra_10_ngay INTEGER,

    UNIQUE (ngay, khu_vuc)
);
CREATE TABLE IF NOT EXISTS backlog_age_daily_vn_khong_nskx (
  ngay TEXT NOT NULL,        
  dim TEXT NOT NULL,
  gia_tri TEXT NOT NULL,
  tong_tuoi INTEGER NOT NULL,
  so_ca INTEGER NOT NULL,
  PRIMARY KEY (ngay, dim, gia_tri)
);
CREATE TABLE IF NOT EXISTS backlog_age_month_manifest_vn_khong_nskx (
  thang TEXT PRIMARY KEY,    
  hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ton_ktv_daily_vn_khong_nskx (
    ngay            TEXT PRIMARY KEY,           
    generated_at    TEXT NOT NULL,              
    payload         TEXT NOT NULL               
);
CREATE INDEX IF NOT EXISTS idx_backlog_age_daily_ngay_vn_khong_nskx ON backlog_age_daily_vn_khong_nskx(ngay);

-- ---------- pham vi: id ----------
CREATE VIEW IF NOT EXISTS case_hieu_luc_id AS SELECT * FROM case_dvbh WHERE huy_bo_at IS NULL AND quoc_gia = 'ID';
CREATE TABLE IF NOT EXISTS precomputed_cache_id (
  key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS daily_snapshot_id (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ngay            TEXT NOT NULL,              
    scope_key       TEXT NOT NULL,              
    generated_at    TEXT NOT NULL,              
    generated_by    TEXT NOT NULL,              
    payload         TEXT NOT NULL,              

    UNIQUE (ngay, scope_key)
);
CREATE TABLE IF NOT EXISTS giai_trinh_daily_log_id (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ngay            TEXT NOT NULL,              
    khu_vuc         TEXT NOT NULL,
    can_giai_trinh  INTEGER NOT NULL,           
    da_giai_trinh   INTEGER NOT NULL,           
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE (ngay, khu_vuc)
);
CREATE TABLE IF NOT EXISTS canh_bao_ton_daily_log_id (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ngay                TEXT NOT NULL,              
    khu_vuc             TEXT NOT NULL,
    ton_14_ngay         INTEGER NOT NULL,
    vip_svip_5_ngay     INTEGER NOT NULL,
    loc_tong_3_ngay     INTEGER NOT NULL,
    tranh_chap_3_ngay   INTEGER NOT NULL,
    ton_20_ngay         INTEGER NOT NULL,
    vip_svip_7_ngay     INTEGER NOT NULL,
    loc_tong_5_ngay     INTEGER NOT NULL,
    tranh_chap_5_ngay   INTEGER NOT NULL,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')), luong_doi_tra_7_ngay INTEGER, luong_doi_tra_10_ngay INTEGER,

    UNIQUE (ngay, khu_vuc)
);
CREATE TABLE IF NOT EXISTS backlog_age_daily_id (
  ngay TEXT NOT NULL,        
  dim TEXT NOT NULL,
  gia_tri TEXT NOT NULL,
  tong_tuoi INTEGER NOT NULL,
  so_ca INTEGER NOT NULL,
  PRIMARY KEY (ngay, dim, gia_tri)
);
CREATE TABLE IF NOT EXISTS backlog_age_month_manifest_id (
  thang TEXT PRIMARY KEY,    
  hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ton_ktv_daily_id (
    ngay            TEXT PRIMARY KEY,           
    generated_at    TEXT NOT NULL,              
    payload         TEXT NOT NULL               
);
CREATE INDEX IF NOT EXISTS idx_backlog_age_daily_ngay_id ON backlog_age_daily_id(ngay);

-- ---------- chep lich su so chot (moi du lieu truoc nay la VN) ----------
INSERT INTO daily_snapshot_vn (id, ngay, scope_key, generated_at, generated_by, payload) SELECT id, ngay, scope_key, generated_at, generated_by, payload FROM daily_snapshot;
INSERT INTO giai_trinh_daily_log_vn (id, ngay, khu_vuc, can_giai_trinh, da_giai_trinh, created_at) SELECT id, ngay, khu_vuc, can_giai_trinh, da_giai_trinh, created_at FROM giai_trinh_daily_log;
INSERT INTO backlog_age_daily_vn (ngay, dim, gia_tri, tong_tuoi, so_ca) SELECT ngay, dim, gia_tri, tong_tuoi, so_ca FROM backlog_age_daily;
INSERT INTO backlog_age_month_manifest_vn (thang, hash, updated_at) SELECT thang, hash, updated_at FROM backlog_age_month_manifest;
INSERT INTO ton_ktv_daily_vn (ngay, generated_at, payload) SELECT ngay, generated_at, payload FROM ton_ktv_daily;
INSERT INTO canh_bao_ton_daily_log_vn (id, ngay, khu_vuc, ton_14_ngay, vip_svip_5_ngay, loc_tong_3_ngay, tranh_chap_3_ngay, ton_20_ngay, vip_svip_7_ngay, loc_tong_5_ngay, tranh_chap_5_ngay, created_at, luong_doi_tra_7_ngay, luong_doi_tra_10_ngay) SELECT id, ngay, khu_vuc, ton_14_ngay, vip_svip_5_ngay, loc_tong_3_ngay, tranh_chap_3_ngay, ton_20_ngay, vip_svip_7_ngay, loc_tong_5_ngay, tranh_chap_5_ngay, created_at, luong_doi_tra_7_ngay, luong_doi_tra_10_ngay FROM canh_bao_ton_daily_log;
INSERT INTO daily_snapshot_vn_nskx (id, ngay, scope_key, generated_at, generated_by, payload) SELECT id, ngay, scope_key, generated_at, generated_by, payload FROM daily_snapshot_nskx;
INSERT INTO giai_trinh_daily_log_vn_nskx (id, ngay, khu_vuc, can_giai_trinh, da_giai_trinh, created_at) SELECT id, ngay, khu_vuc, can_giai_trinh, da_giai_trinh, created_at FROM giai_trinh_daily_log_nskx;
INSERT INTO backlog_age_daily_vn_nskx (ngay, dim, gia_tri, tong_tuoi, so_ca) SELECT ngay, dim, gia_tri, tong_tuoi, so_ca FROM backlog_age_daily_nskx;
INSERT INTO backlog_age_month_manifest_vn_nskx (thang, hash, updated_at) SELECT thang, hash, updated_at FROM backlog_age_month_manifest_nskx;
INSERT INTO ton_ktv_daily_vn_nskx (ngay, generated_at, payload) SELECT ngay, generated_at, payload FROM ton_ktv_daily_nskx;
INSERT INTO canh_bao_ton_daily_log_vn_nskx (id, ngay, khu_vuc, ton_14_ngay, vip_svip_5_ngay, loc_tong_3_ngay, tranh_chap_3_ngay, ton_20_ngay, vip_svip_7_ngay, loc_tong_5_ngay, tranh_chap_5_ngay, created_at, luong_doi_tra_7_ngay, luong_doi_tra_10_ngay) SELECT id, ngay, khu_vuc, ton_14_ngay, vip_svip_5_ngay, loc_tong_3_ngay, tranh_chap_3_ngay, ton_20_ngay, vip_svip_7_ngay, loc_tong_5_ngay, tranh_chap_5_ngay, created_at, luong_doi_tra_7_ngay, luong_doi_tra_10_ngay FROM canh_bao_ton_daily_log_nskx;
INSERT INTO daily_snapshot_vn_khong_nskx (id, ngay, scope_key, generated_at, generated_by, payload) SELECT id, ngay, scope_key, generated_at, generated_by, payload FROM daily_snapshot_khong_nskx;
INSERT INTO giai_trinh_daily_log_vn_khong_nskx (id, ngay, khu_vuc, can_giai_trinh, da_giai_trinh, created_at) SELECT id, ngay, khu_vuc, can_giai_trinh, da_giai_trinh, created_at FROM giai_trinh_daily_log_khong_nskx;
INSERT INTO backlog_age_daily_vn_khong_nskx (ngay, dim, gia_tri, tong_tuoi, so_ca) SELECT ngay, dim, gia_tri, tong_tuoi, so_ca FROM backlog_age_daily_khong_nskx;
INSERT INTO backlog_age_month_manifest_vn_khong_nskx (thang, hash, updated_at) SELECT thang, hash, updated_at FROM backlog_age_month_manifest_khong_nskx;
INSERT INTO ton_ktv_daily_vn_khong_nskx (ngay, generated_at, payload) SELECT ngay, generated_at, payload FROM ton_ktv_daily_khong_nskx;
INSERT INTO canh_bao_ton_daily_log_vn_khong_nskx (id, ngay, khu_vuc, ton_14_ngay, vip_svip_5_ngay, loc_tong_3_ngay, tranh_chap_3_ngay, ton_20_ngay, vip_svip_7_ngay, loc_tong_5_ngay, tranh_chap_5_ngay, created_at, luong_doi_tra_7_ngay, luong_doi_tra_10_ngay) SELECT id, ngay, khu_vuc, ton_14_ngay, vip_svip_5_ngay, loc_tong_3_ngay, tranh_chap_3_ngay, ton_20_ngay, vip_svip_7_ngay, loc_tong_5_ngay, tranh_chap_5_ngay, created_at, luong_doi_tra_7_ngay, luong_doi_tra_10_ngay FROM canh_bao_ton_daily_log_khong_nskx;
