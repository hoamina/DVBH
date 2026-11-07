-- 7 nhom thong tin bo sung tu Odoo OCRM (2026-11-07) - pipeline auto qs ocrm/extras.py doc qua JSON-RPC,
-- moi nhom 1 object JSON (chuoi TEXT), ca QuickSight de NULL. Xem ratchet.ts OPTIONAL_FIELDS /
-- frontend/src/lib/odooBoSung.ts (parse + nhan hien thi).
--   hien_tuong_odoo : {kh_bao[], ktv_xac_dinh[]} - Hiện tượng lỗi cap phieu (KH báo / KTV xác định)
--   sla_odoo        : {khu_vuc_sla, sla_gio, bat_dau, han, qua_sla_luc, tre_khi_dong, so_gio_tre, khu_vuc, so_ngay_xu_ly}
--   bao_hanh_nha_may: {trang_thai, trang_thai_goc, ma, ngay_kich_hoat, ngay_het_han, so_thang, ngay_xuat_kho}
--   phi_odoo        : {mat_phi, ly_do_khong_thu_phi, da_thu, da_nhap_thu_tien}
--   khao_sat_odoo   : {cuoc_goi, hai_long, ly_do, ghi_chu} - ma danh muc Happiphone/Hub giu nguyen
--   thong_so_nuoc   : {nguon_nuoc, tds_vao, tds_ra, tds_tai_voi, tds_nuoc_thai, ph}
--   ktv_odoo        : {da_nhan_viec, ly_do_tra_viec, checkin[{thoi_diem, ktv, lech_m, lech_tren_200m, so_anh}]}
ALTER TABLE case_dvbh ADD COLUMN hien_tuong_odoo TEXT;
ALTER TABLE case_dvbh ADD COLUMN sla_odoo TEXT;
ALTER TABLE case_dvbh ADD COLUMN bao_hanh_nha_may TEXT;
ALTER TABLE case_dvbh ADD COLUMN phi_odoo TEXT;
ALTER TABLE case_dvbh ADD COLUMN khao_sat_odoo TEXT;
ALTER TABLE case_dvbh ADD COLUMN thong_so_nuoc TEXT;
ALTER TABLE case_dvbh ADD COLUMN ktv_odoo TEXT;
