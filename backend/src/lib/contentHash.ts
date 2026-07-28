/**
 * Hash noi dung cho danh muc gan tinh (settings_ly_do, linh_kien) - luu vao bang
 * content_versions rieng (doc re, khong dong cham bang chinh) de client so sanh
 * truoc khi quyet dinh co can tai lai toan bo danh sach hay khong (xem
 * frontend/src/lib/staticListCache.ts). Hash duoc tinh lai moi khi co ghi thanh
 * cong vao bang tuong ung (xem settings.ts), nen luc doc chi can 1 SELECT don
 * tren content_versions, khong bao gio phai doc lai toan bo bang lon de kiem tra.
 */

import { nowVN } from "./vnTime";

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeAndStoreHash(db: D1Database, tenBang: string, rows: unknown[]): Promise<string> {
  const hash = await sha256Hex(JSON.stringify(rows));
  await db
    .prepare(
      `INSERT INTO content_versions (ten_bang, hash, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(ten_bang) DO UPDATE SET hash = excluded.hash, updated_at = excluded.updated_at`,
    )
    .bind(tenBang, hash, nowVN())
    .run();
  return hash;
}

/** Dung cho GET /version: neu chua co hash (lan dau sau migrate) thi tinh 1 lan roi luu, cac lan sau chi doc bang nho. */
export async function getOrComputeHash(db: D1Database, tenBang: string, table: string, orderBy: string): Promise<string> {
  const existing = await db.prepare("SELECT hash FROM content_versions WHERE ten_bang = ?").bind(tenBang).first<{ hash: string }>();
  if (existing) return existing.hash;

  const { results } = await db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all();
  return computeAndStoreHash(db, tenBang, results);
}
