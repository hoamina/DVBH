-- Nhat ky dang nhap - ghi 1 dong moi lan dang nhap Google OAuth thanh cong (backend/src/routes/auth.ts
-- callback), phuc vu Admin tra cuu ai dang nhap luc nao tu dau (bao mat noi bo).
CREATE TABLE login_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT NOT NULL REFERENCES users(email),
    thoi_gian   TEXT NOT NULL DEFAULT (datetime('now')),
    ip          TEXT,
    user_agent  TEXT
);

CREATE INDEX idx_login_log_email ON login_log(email);
CREATE INDEX idx_login_log_thoi_gian ON login_log(thoi_gian DESC);
