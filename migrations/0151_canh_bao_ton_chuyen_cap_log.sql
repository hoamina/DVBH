-- ============================================================
-- Log "ca chuyen sang Ton TBP (Canh bao ton Cap 1 - TP DVBH) / Ton CEO (Cap 2)" (CHOT 2026-10-29, chu he thong):
-- "khi 1 don chuyen sang trang thai ton TBP hoac ton CEO se luu log trong muc giai trinh ton (chi luu log de nam
-- van de chu khong tinh la duoc giai trinh)".
--
-- BANG RIENG, KHONG ghi vao giai_trinh: moi cong thuc "da giai trinh" / need_giai_trinh / ty le / badge / Ly do
-- ton gan nhat / snapshot deu doc giai_trinh, nen log nay khong the bi tinh nham. Chi GET /api/cases/:id doc bang
-- nay (hien trong tab "GT ton" cua Chi tiet ca).
--
-- Ghi o lib/canhBaoTon.ts ghiLogChuyenCapCanhBao(): moi lan snapshot Canh bao ton (pham vi goc, "canh_bao_ton|all")
-- duoc chot / tu-heal / bo sung luong doi tra -> so voi snapshot chot GAN NHAT truoc do, ca nao co trong cap hom
-- nay ma khong co trong cap do o lan truoc -> 1 dong. UNIQUE (case_id, cap, ngay) + ON CONFLICT DO NOTHING: chay
-- lai trong ngay (cron moi gio, Admin lam moi) khong ghi lap. Ca roi khoi cap roi quay lai -> ghi them dong moi.
-- ============================================================

CREATE TABLE canh_bao_ton_chuyen_cap_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id     TEXT NOT NULL,
    cap         INTEGER NOT NULL CHECK (cap IN (1, 2)),   -- 1 = Ton TBP (TP DVBH), 2 = Ton CEO
    ngay        TEXT NOT NULL,                            -- 'YYYY-MM-DD' gio VN - ngay chot Canh bao ton
    chi_tieu    TEXT NOT NULL,                            -- JSON mang key chi tieu (vd ["ton14","vipSvip5"])
    created_at  TEXT NOT NULL,                            -- nowVN()

    UNIQUE (case_id, cap, ngay)
);
