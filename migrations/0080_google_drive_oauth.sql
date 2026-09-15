-- ============================================================
-- Uy quyen OAuth nguoi dung that de upload anh (bien ban PXK, linh kien...) len Google Drive -
-- THAY THE Service Account JWT (xem lib/googleDrive.ts uploadToDrive()) cho cac endpoint can luu
-- anh vao 1 folder Drive ca nhan.
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
--
-- IF NOT EXISTS: bang nay da tung duoc tao tren D1 production qua 1 migration cung ten bang nhung
-- khac so thu tu tren 1 nhanh khac chua bao gio merge vao main (xem
-- [[branch-docs-sua-chua-bao-hanh-unmerged-drift]] trong memory) - xac nhan 2026-09-15 dung schema
-- va da co san 1 tai khoan duoc ket noi (smarttrade.vp@gmail.com, 2026-08-17). Dung IF NOT EXISTS
-- de migration nay ap dung an toan tren ca 2 truong hop: DB moi (chua co bang) va DB production
-- hien tai (da co bang + du lieu, chi can d1_migrations ghi nhan ten file nay la da ap dung).
-- ============================================================

CREATE TABLE IF NOT EXISTS google_drive_oauth (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  google_email TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  authorized_by TEXT NOT NULL,
  authorized_at TEXT NOT NULL
);
