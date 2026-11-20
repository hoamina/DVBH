-- 2026-11-20 (v1.646) - Giam dung luong + luot ghi D1: bo 3 index tren case_dvbh khong co truy van nao dung.
-- Moi index tren case_dvbh ton dung luong VA ton them 1 "row written" moi lan import ghi cot do.
--   idx_case_assigned_to   : index TOAN BANG (162k dong, chi 3 dong co gia tri); code chi UPDATE assigned_to, khong WHERE theo no.
--   idx_case_dt_sua        : cot dt_sua_at da chuyen sang bang phu case_dt_sua (migration 0172, v1.619) - cot cu khong dung,
--                            index rong; bo truoc cung giup buoc DROP COLUMN sau nay (CLAUDE.md "How to move columns out").
--   idx_case_id_khach_hang : khong cau SQL nao loc theo id_khach_hang (theodoidoimay tu noi ca phia ben do).
-- Can tra cuu lai theo cot nao thi tao lai index (CREATE INDEX ... chi doc 1 lan).
DROP INDEX IF EXISTS idx_case_assigned_to;
DROP INDEX IF EXISTS idx_case_dt_sua;
DROP INDEX IF EXISTS idx_case_id_khach_hang;
