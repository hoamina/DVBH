-- 2026-10-29 (chu he thong): bat/tat thu cung "3T Pet" (widget Worker 3t-pet) o 2 cap.
-- (1) Ca nhan: users.bat_pet_3t - moi user tu bat/tat cho chinh minh (PATCH /api/auth/me { bat_pet_3t }).
-- (2) He thong: cai_dat_he_thong khoa 'bat_pet_3t' - Admin tat thi tat voi MOI nguoi, bat ke cai dat ca nhan
--     (PATCH /api/auth/pet-3t-he-thong). Bang khoa/gia tri chung cho cac co he thong ve sau (khong FK sang users
--     de khong lam users bi tham chieu them - xem rang buoc recreate-table trong CLAUDE.md).
ALTER TABLE users ADD COLUMN bat_pet_3t INTEGER NOT NULL DEFAULT 1;

CREATE TABLE cai_dat_he_thong (
  khoa       TEXT PRIMARY KEY,
  gia_tri    TEXT NOT NULL,
  updated_at TEXT,
  updated_by TEXT
);

INSERT INTO cai_dat_he_thong (khoa, gia_tri) VALUES ('bat_pet_3t', '1');
