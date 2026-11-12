-- "Ảnh & Video Odoo" (2026-11-12): GOM het moi nhom anh/video cua phieu tu Odoo OCRM (ben trong/ngoai/
-- bao cao/tem serial/bang chung huy, video, anh linh kien hong, anh bang chung lich hen...) thanh 1
-- cot tuy chon (JSON array - pipeline auto qs ocrm/media.py). "url" cua moi phan tu la permalink ON
-- DINH cua Odoo (dang https://ocrm.happinno.com/ts/media/<public_token>, luu co dinh trong DB Odoo -
-- khong het han). Link nay CAN phien dang nhap OCRM (thu that 2026-11-12: chua dang nhap -> 404) va khong
-- nhung <img> duoc tu ten mien khac -> UI chi hien link mo tab moi. Ca QuickSight de NULL.
ALTER TABLE case_dvbh ADD COLUMN anh_video_odoo TEXT;
