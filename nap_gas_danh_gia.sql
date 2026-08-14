PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE nap_gas_danh_gia (
    case_id             TEXT PRIMARY KEY REFERENCES case_dvbh(id),
    danh_gia_nap_gas    TEXT NOT NULL CHECK (danh_gia_nap_gas IN (
                            'Tu nap gas', 'Khong nap gas', 'Gui ve Hang nap gas',
                            'Tu nap gas thay Block', 'Sua chua khac', 'Kiem tra'
                        )),
    phi_dich_vu         TEXT NOT NULL CHECK (phi_dich_vu IN (
                            'Khong thu phi DV', 'Khong nap gas', 'Da thu phi DV', 'Loi khong thu phi DV'
                        )),
    nguoi_chot          TEXT NOT NULL REFERENCES users(email),
    ngay_chot           TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1204396','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-06-30 13:39:46');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1206286','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-06-30 13:40:22');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1214650','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-06-30 15:10:13');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1224501','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-06-30 15:12:39');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1252215','Tu nap gas thay Block','Loi khong thu phi DV','nguyenquantb13061985@gmail.com','2026-07-24 14:08:01');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1200087','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-24 16:18:29');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1214996','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-24 16:19:50');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1215249','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-24 16:29:31');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1223613','Tu nap gas thay Block','Da thu phi DV','xuan.nguyen190388@gmail.com','2026-07-24 16:31:14');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1227259','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-24 16:34:18');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1228016','Tu nap gas thay Block','Da thu phi DV','xuan.nguyen190388@gmail.com','2026-07-24 16:34:50');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1229089','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-24 16:37:05');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1229709','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-24 16:41:14');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1229951','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-24 16:42:27');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1231421','Tu nap gas thay Block','Da thu phi DV','xuan.nguyen190388@gmail.com','2026-07-24 16:43:33');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1232438','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-24 16:45:03');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1232605','Tu nap gas thay Block','Da thu phi DV','xuan.nguyen190388@gmail.com','2026-07-24 16:48:41');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1255854','Sua chua khac','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-25 10:04:51');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1256635','Sua chua khac','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-25 10:05:00');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1257332','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-25 10:06:04');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1256093','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-25 10:06:14');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1259115','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-25 10:07:07');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1259615','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-25 10:07:18');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1259743','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-25 10:08:19');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1254652','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-25 10:08:33');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1259963','Sua chua khac','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-25 10:08:44');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1262402','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-25 10:08:53');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1262919','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-25 10:10:29');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1265360','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-25 10:10:41');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1259920','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-25 10:11:35');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1262573','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-25 10:34:45');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1262844','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-25 10:36:31');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1260009','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-25 10:36:44');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1253421','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-25 10:37:53');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1252720','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-25 10:38:40');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1247113','Tu nap gas thay Block','Da thu phi DV','xuan.nguyen190388@gmail.com','2026-07-25 10:50:31');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1247375','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-25 10:50:50');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1252004','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-25 10:51:47');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1249582','Tu nap gas thay Block','Da thu phi DV','xuan.nguyen190388@gmail.com','2026-07-25 10:52:21');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1217110','Sua chua khac','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-27 14:12:51');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1227203','Tu nap gas','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-27 14:13:59');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1229183','Tu nap gas','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-27 16:23:37');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1230745','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-27 16:24:46');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1232260','Sua chua khac','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-27 16:25:25');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1232720','Tu nap gas thay Block','Da thu phi DV','xuan.nguyen190388@gmail.com','2026-07-27 16:38:32');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1233255','Tu nap gas','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-27 16:40:38');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1234198','Tu nap gas thay Block','Da thu phi DV','xuan.nguyen190388@gmail.com','2026-07-27 16:46:23');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1201903','Kiem tra','Khong nap gas','nguyenquantb13061985@gmail.com','2026-07-27 17:24:06');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1235659','Tu nap gas','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-29 15:16:32');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1235726','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-29 15:19:40');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1235833','Tu nap gas','Da thu phi DV','xuan.nguyen190388@gmail.com','2026-07-29 15:22:19');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1236641','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-29 15:22:29');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1236694','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-29 15:24:27');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1236874','Tu nap gas thay Block','Da thu phi DV','xuan.nguyen190388@gmail.com','2026-07-29 15:37:30');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1237222','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-29 15:45:04');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1237802','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-29 15:48:42');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1238189','Sua chua khac','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-29 15:48:52');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1238695','Tu nap gas thay Block','Da thu phi DV','xuan.nguyen190388@gmail.com','2026-07-29 15:50:41');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1239056','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-29 15:51:38');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1239453','Sua chua khac','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-29 15:51:52');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1240493','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-29 15:55:01');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1240635','Sua chua khac','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-29 15:55:08');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1240772','Tu nap gas thay Block','Da thu phi DV','xuan.nguyen190388@gmail.com','2026-07-29 15:56:38');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1240805','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-29 15:56:47');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1240833','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-29 16:33:34');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1241232','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-29 16:41:58');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1241520','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-29 16:43:47');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1242073','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-29 16:51:45');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1242105','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-29 16:52:35');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1242327','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-29 16:53:15');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1243716','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-29 16:54:54');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1243854','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-29 16:55:56');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1244082','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-29 16:56:07');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1244566','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-29 16:56:15');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1270788','Sua chua khac','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-30 09:35:18');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1267591','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-30 09:37:54');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1262300','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-30 09:39:04');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1269764','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-30 09:39:30');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1263056','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-30 11:39:21');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1267532','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-30 11:40:20');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1259434','Tu nap gas','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-30 11:43:33');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1254338','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-30 11:43:51');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1266018','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-30 11:44:07');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1260984','Sua chua khac','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-30 11:44:40');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1264139','Tu nap gas','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-30 11:45:13');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1256966','Sua chua khac','Da thu phi DV','xuan.nguyen190388@gmail.com','2026-07-30 11:55:54');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1264648','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-30 15:25:39');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1272011','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-30 15:29:03');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1267894','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-30 15:31:15');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1273335','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-30 15:41:49');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1263347','Tu nap gas thay Block','Da thu phi DV','xuan.nguyen190388@gmail.com','2026-07-30 15:42:43');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1270911','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-30 15:45:56');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1265814','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-30 15:53:37');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1253818','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-30 15:54:11');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1246488','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-30 15:54:34');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1252800','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-30 15:54:54');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1249741','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-30 15:55:15');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1246184','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-30 15:55:55');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1274618','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-31 10:22:01');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1274524','Kiem tra','Khong nap gas','xuan.nguyen190388@gmail.com','2026-07-31 10:25:31');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1272179','Tu nap gas thay Block','Da thu phi DV','xuan.nguyen190388@gmail.com','2026-07-31 10:30:32');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1273336','Tu nap gas thay Block','Khong thu phi DV','xuan.nguyen190388@gmail.com','2026-07-31 10:31:36');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1264574','Kiem tra','Khong thu phi DV','luongthebao260882@gmail.com','2026-07-31 15:14:39');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1264418','Tu nap gas','Khong thu phi DV','luongthebao260882@gmail.com','2026-07-31 15:15:47');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1238349','Kiem tra','Khong thu phi DV','luongthebao260882@gmail.com','2026-07-31 15:17:39');
INSERT INTO "nap_gas_danh_gia" ("case_id","danh_gia_nap_gas","phi_dich_vu","nguoi_chot","ngay_chot") VALUES('1235557','Tu nap gas thay Block','Khong thu phi DV','luongthebao260882@gmail.com','2026-07-31 15:21:34');
