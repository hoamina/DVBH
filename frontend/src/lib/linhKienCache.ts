// IndexedDB cache cho danh sach linh kien - chi dong bo incremental (rows co ngay_cap_nhat
// moi hon timestamp cache) de giam D1 rows_read. Tuong tu closedDataCache.ts nhung don gian
// hon (khong can manifest hash, chi can 1 timestamp duy nhat).

import type { LinhKienRow } from "../types";

const DB_NAME = "dvbh_lk_cache";
const DB_VERSION = 1;
const STORE_NAME = "linh_kien";

interface CacheEntry {
  ma_linh_kien: string; // PK
  ten_linh_kien: string;
  gia_ban: number | null;
  gia_tham_chieu: number | null;
  don_vi: string | null;
  ghi_chu: string | null;
  anh_demo: string | null;
  bat_tat: number;
  chi_sua_chua: number;
  nguoi_cap_nhat: string | null;
  ngay_cap_nhat: string | null; // ISO timestamp
}

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      dbInstance = req.result;
      resolve(dbInstance);
    };
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "ma_linh_kien" });
      }
    };
  });
}

// Doc tat ca LK tu cache (dung cho initial render truoc khi fetch incremental).
export async function getAllFromCache(): Promise<CacheEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

// Lay timestamp moi nhat trong cache (de gui len server qua ?since=).
export async function getLastCacheTimestamp(): Promise<string | null> {
  const rows = await getAllFromCache();
  if (rows.length === 0) return null;
  const timestamps = rows.map((r) => r.ngay_cap_nhat).filter((t): t is string => !!t);
  if (timestamps.length === 0) return null;
  return timestamps.sort().reverse()[0]; // ISO string sort lexicographically
}

// Merge incremental updates vao cache (upsert by ma_linh_kien).
export async function mergeLinhKienToCache(rows: LinhKienRow[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const row of rows) {
      store.put({
        ma_linh_kien: row.ma_linh_kien,
        ten_linh_kien: row.ten_linh_kien,
        gia_ban: row.gia_ban,
        gia_tham_chieu: row.gia_tham_chieu,
        don_vi: row.don_vi,
        ghi_chu: row.ghi_chu,
        anh_demo: row.anh_demo,
        bat_tat: row.bat_tat,
        chi_sua_chua: row.chi_sua_chua,
        nguoi_cap_nhat: row.nguoi_cap_nhat,
        ngay_cap_nhat: row.ngay_cap_nhat,
      });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Xoa toan bo cache (dung khi Admin yeu cau "Tai lai toan bo" hoac co loi).
export async function clearLinhKienCache(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
