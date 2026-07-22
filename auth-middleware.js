/**
 * MIDDLEWARE XAC THUC + PHAN QUYEN - HE THONG QUAN LY GIAI TRINH TON DVBH
 *
 * Luong hoat dong:
 * 1. Nguoi dung dang nhap Google qua Firebase Auth o Frontend, nhan ve ID Token.
 * 2. Moi request goi API dinh kem header: Authorization: Bearer <ID Token>.
 * 3. verifyAuth: xac thuc token voi Firebase Admin SDK, tra ve email.
 * 4. loadUser: tra bang `users` theo email.
 *    - Chua ton tai      -> tu tao voi trang_thai_duyet = 'Cho duyet', vai_tro = null,
 *                            tra loi 403 PENDING_APPROVAL
 *    - Ton tai nhung
 *      trang_thai_duyet != 'Da duyet' -> tra loi 403 PENDING_APPROVAL / REJECTED
 *    - Da duyet           -> gan req.user = { email, vai_tro, khu_vuc_phu_trach }, next()
 * 5. requireRole(...roles): chan route theo vai tro.
 * 6. scopeByKhuVuc: tu dong gioi han cau query theo khu vuc phu trach,
 *    tru vai tro Admin/Viewer duoc xem toan bo.
 */

const admin = require('firebase-admin');
const { Pool } = require('pg');

const pool = new Pool();

const ROLES_XEM_TOAN_BO = ['Admin', 'Viewer', 'TBP DVBH', 'TBP CSKH'];

async function verifyAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!idToken) {
    return res.status(401).json({ error: 'MISSING_TOKEN' });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.authEmail = decoded.email;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'INVALID_TOKEN' });
  }
}

async function loadUser(req, res, next) {
  const { rows } = await pool.query(
    'SELECT email, ten, vai_tro, khu_vuc_phu_trach, trang_thai_duyet FROM users WHERE email = $1',
    [req.authEmail],
  );

  let user = rows[0];

  // Lan dau dang nhap -> tu tao tai khoan cho duyet
  if (!user) {
    const insertResult = await pool.query(
      `INSERT INTO users (email, trang_thai_duyet)
       VALUES ($1, 'Cho duyet')
       RETURNING email, ten, vai_tro, khu_vuc_phu_trach, trang_thai_duyet`,
      [req.authEmail],
    );
    user = insertResult.rows[0];
  }

  if (user.trang_thai_duyet === 'Cho duyet') {
    return res.status(403).json({ error: 'PENDING_APPROVAL' });
  }
  if (user.trang_thai_duyet === 'Tu choi') {
    return res.status(403).json({ error: 'REJECTED' });
  }

  req.user = user;
  next();
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.vai_tro)) {
      return res.status(403).json({ error: 'FORBIDDEN_ROLE' });
    }
    next();
  };
}

/**
 * Tra ve mang khu vuc duoc phep xem, hoac null neu duoc xem toan bo.
 * Dung trong tang query de append dieu kien WHERE khu_vuc = ANY($khuVuc).
 */
function scopeByKhuVuc(req) {
  if (ROLES_XEM_TOAN_BO.includes(req.user.vai_tro)) {
    return null; // khong gioi han
  }
  return req.user.khu_vuc_phu_trach || [];
}

module.exports = { verifyAuth, loadUser, requireRole, scopeByKhuVuc };
