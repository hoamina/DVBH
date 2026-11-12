-- "Ảnh & Video Odoo" (2026-11-12): GOM het moi nhom anh/video cua phieu tu Odoo OCRM (ben trong/ngoai/
-- bao cao/tem serial/bang chung huy, video, anh linh kien hong, anh bang chung lich hen...) thanh 1
-- cot tuy chon (JSON array - pipeline auto qs ocrm/media.py). "url" cua moi phan tu la permalink ON
-- DINH cua Odoo (dang https://ocrm.happinno.com/ts/media/<public_token>, luu co dinh trong DB Odoo -
-- xac nhan 2026-11-12, khong phai link ky so het han nhu "so_luong_anh" tung gia dinh), nen mo truc
-- tiep tu UI duoc ma khong can dang nhap Odoo. Ca QuickSight de NULL.
ALTER TABLE case_dvbh ADD COLUMN anh_video_odoo TEXT;
