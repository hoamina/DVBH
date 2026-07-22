/**
 * Ha tang dung chung cho 2 luong import du lieu lich su (giai trinh cu, khao sat cu):
 * khong ap dung ratchet (chi ghi 1 lan, la log vinh vien), nhung van phai:
 *   - validate case_id ton tai trong case_dvbh
 *   - dam bao FK users(email) khong vo bang cach tu tao user "Cho duyet" cho
 *     bat ky email nao xuat hien trong file (nguoi giai trinh/thuc hien/chot)
 *     ma chua co trong he thong - giong het co che tu dong tao user khi dang
 *     nhap Google lan dau, chi khac la chua duoc duyet nen chua dang nhap duoc.
 */

const CHUNK_SIZE_SELECT = 100;
export const CHUNK_SIZE_BATCH = 500;

export async function findExistingCaseIds(db: D1Database, ids: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE_SELECT) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE_SELECT);
    if (chunk.length === 0) continue;
    const placeholders = chunk.map(() => "?").join(", ");
    const { results } = await db
      .prepare(`SELECT id FROM case_dvbh WHERE id IN (${placeholders})`)
      .bind(...chunk)
      .all<{ id: string }>();
    for (const row of results) found.add(row.id);
  }
  return found;
}

export async function ensureUsersExist(db: D1Database, emails: (string | null | undefined)[]): Promise<void> {
  const uniqueEmails = Array.from(new Set(emails.filter((e): e is string => !!e && e.trim().length > 0)));
  if (uniqueEmails.length === 0) return;

  const existing = new Set<string>();
  for (let i = 0; i < uniqueEmails.length; i += CHUNK_SIZE_SELECT) {
    const chunk = uniqueEmails.slice(i, i + CHUNK_SIZE_SELECT);
    const placeholders = chunk.map(() => "?").join(", ");
    const { results } = await db
      .prepare(`SELECT email FROM users WHERE email IN (${placeholders})`)
      .bind(...chunk)
      .all<{ email: string }>();
    for (const row of results) existing.add(row.email);
  }

  const missing = uniqueEmails.filter((e) => !existing.has(e));
  if (missing.length === 0) return;

  const statements = missing.map((email) =>
    db.prepare("INSERT INTO users (email, trang_thai_duyet) VALUES (?, 'Cho duyet')").bind(email),
  );
  for (let i = 0; i < statements.length; i += CHUNK_SIZE_BATCH) {
    await db.batch(statements.slice(i, i + CHUNK_SIZE_BATCH));
  }
}

export async function loadActiveLyDoNames(db: D1Database): Promise<Set<string>> {
  const { results } = await db.prepare("SELECT ten_ly_do FROM settings_ly_do").all<{ ten_ly_do: string }>();
  return new Set(results.map((r) => r.ten_ly_do));
}

// giai_trinh.linh_kien_thieu tham chieu ma_linh_kien (khoa ngoai), nhung nguoi dung khi go
// file backfill thuong dan ten day du (ten_linh_kien, giong cach hien thi trong dropdown chon
// linh kien tren form thu cong) chu khong go dung ma - map ca 2 chieu ve ma_linh_kien de chap
// nhan duoc ca 2 cach nhap, tranh vo FK constraint luc commit (preview khong bat loi nay truoc).
export async function loadLinhKienLookup(db: D1Database): Promise<Map<string, string>> {
  const { results } = await db.prepare("SELECT ma_linh_kien, ten_linh_kien FROM linh_kien").all<{
    ma_linh_kien: string;
    ten_linh_kien: string;
  }>();
  const lookup = new Map<string, string>();
  for (const row of results) {
    lookup.set(row.ma_linh_kien, row.ma_linh_kien);
    lookup.set(row.ten_linh_kien, row.ma_linh_kien);
  }
  return lookup;
}

export async function runBatched(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  for (let i = 0; i < statements.length; i += CHUNK_SIZE_BATCH) {
    const chunk = statements.slice(i, i + CHUNK_SIZE_BATCH);
    if (chunk.length > 0) await db.batch(chunk);
  }
}
