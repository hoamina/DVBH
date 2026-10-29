-- "Đa quốc gia" GĐ1 - nen du lieu (2026-10-29, ke hoach duyet voi chu he thong): sap co nguon Odoo INDO (Indonesia),
-- sau do PLP va vai nuoc khac. GĐ1 CHI them cau hinh + cot, KHONG doi hanh vi: moi ca hien co la VN, moi user giu
-- pham vi "toan bo" (NULL) cho toi GĐ2 (ep quyen phia server, lib/phamVi.ts them chieu quoc gia).
--
-- Quoc gia / nguon cua 1 ca xac dinh tu MAU ID (GLOB SQLite) luc import (lib/quocGia.ts xacDinhQuocGia, chi dong
-- GHI_MOI - id khong doi nen quoc gia khong doi). Them nuoc moi = them dong vao 2 bang duoi qua Cai dat -> "Quốc gia",
-- khong sua code. Du lieu that hien co 3 dang ID: so thuan (CRM cu, vd 1014874), T + so (CRM 3T, vd T23453),
-- SC + so (Odoo VN, vd SC261002575).

CREATE TABLE quoc_gia (
  ma TEXT PRIMARY KEY CHECK (length(ma) BETWEEN 2 AND 5 AND ma NOT GLOB '*[^A-Z]*'),
  ten TEXT NOT NULL,
  thu_tu INTEGER NOT NULL DEFAULT 0,
  kich_hoat INTEGER NOT NULL DEFAULT 1,
  nguoi_sua TEXT,
  ngay_sua TEXT
);

-- Mau ID -> quoc gia + nguon. Khop theo do_uu_tien tang dan (so nho xet truoc), cung uu tien thi mau dai hon truoc.
CREATE TABLE quoc_gia_mau_id (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mau_glob TEXT NOT NULL UNIQUE,
  ma_quoc_gia TEXT NOT NULL REFERENCES quoc_gia(ma),
  nguon TEXT NOT NULL,
  do_uu_tien INTEGER NOT NULL DEFAULT 100,
  ghi_chu TEXT,
  nguoi_sua TEXT,
  ngay_sua TEXT
);

INSERT INTO quoc_gia (ma, ten, thu_tu) VALUES ('VN', 'Việt Nam', 1), ('ID', 'Indonesia', 2);

INSERT INTO quoc_gia_mau_id (mau_glob, ma_quoc_gia, nguon, do_uu_tien, ghi_chu) VALUES
  ('SC[0-9]*', 'VN', 'odoo_vn', 10, 'Odoo Việt Nam'),
  ('T[0-9]*', 'VN', 'crm_3t', 10, 'CRM 3T'),
  ('[0-9]*', 'VN', 'crm_cu', 50, 'CRM cũ (ID toàn số)');

-- Moi ca hien co la VN -> DEFAULT 'VN' du, KHONG can UPDATE backfill (tranh ghi lai ca bang case_dvbh).
-- Index (quoc_gia, ...) de GĐ2 them khi bat dau loc theo nuoc (index tren bang lon ton rows_written 1 lan).
ALTER TABLE case_dvbh ADD COLUMN quoc_gia TEXT NOT NULL DEFAULT 'VN';

-- Pham vi quoc gia user duoc xem: JSON mang ma nuoc (vd ["VN"]), NULL = toan bo. GĐ1 chi luu, GĐ2 moi ep.
ALTER TABLE users ADD COLUMN pham_vi_quoc_gia TEXT;
