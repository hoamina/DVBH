-- ============================================================
-- Uy quyen OAuth nguoi dung that de upload "anh linh kien" len Google Drive - THAY THE cach cu
-- (Service Account JWT, xem lib/googleDrive.ts uploadPublicImage() truoc sua doi nay).
--
-- LY DO: Service Account KHONG CO storage quota rieng - Google tra ve 403
-- "Service Accounts do not have storage quota" bat ke folder co duoc chia se Editor hay khong,
-- TRU KHI file duoc tao trong 1 Shared Drive (yeu cau Google Workspace tra phi - tai khoan
-- @gmail.com ca nhan khong co Shared Drive). Da xac nhan truc tiep qua Google Drive API
-- (2026-08-17). Giai phap: uy quyen 1 tai khoan Google THAT (qua OAuth, scope drive.file) de file
-- duoc tao thuoc quota cua chinh nguoi do, khong phai Service Account.
--
-- Bang nay la 1 SINGLETON (id luon = 1) - he thong chi can 1 tai khoan Drive duoc uy quyen tai 1
-- thoi diem. refresh_token duoc ma hoa AES-GCM truoc khi luu (xem lib/secretBox.ts) vi day la bi
-- mat tuong duong mat khau - khong luu plaintext trong D1.
-- ============================================================

CREATE TABLE google_drive_oauth (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  google_email TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  authorized_by TEXT NOT NULL,
  authorized_at TEXT NOT NULL
);
