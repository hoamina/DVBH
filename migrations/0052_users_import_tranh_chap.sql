-- ----------------------------------------------------------
-- users.co_the_import_tranh_chap: quyen rieng (ngoai vai_tro) cho phep import hang loat tranh chap
-- theo ID (module "Tranh chap, KN") - CHOT 2026-08-12, cap tung tai khoan qua UsersModule.tsx (o tick
-- Admin bat/tat), giong pattern la_ksnb_doi_tac (migration 0035). Mac dinh 0 (tat) cho moi user hien
-- co - AN TOAN, khong tu dong cap quyen cho ai.
-- ----------------------------------------------------------
ALTER TABLE users ADD COLUMN co_the_import_tranh_chap INTEGER NOT NULL DEFAULT 0;
