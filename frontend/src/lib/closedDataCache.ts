/**
 * Cache noi bo tren may nguoi dung (IndexedDB) cho du lieu "da dong" (case da hoan thanh -
 * co thoi_gian_hoan_thanh) vi mac dinh khong con thay doi nua: danh sach Ca luu tru va
 * chi tiet 1 ca da hoan thanh. Dung IndexedDB thay vi localStorage vi han muc luu tru lon
 * hon nhieu (localStorage ~5-10MB, khong du khi danh sach luu tru phinh to theo thoi gian).
 * Bao boc try/catch vi 1 so trinh duyet/che do rieng tu co the chan IndexedDB - khi do
 * coi nhu cache-miss, luon fetch server, khong lam hong luong chinh.
 */

const DB_NAME = "dvbh-closed-cache";
const STORE_NAME = "cache";
const DB_VERSION = 1;

export interface CacheEntry<T> {
  data: T;
  cachedAt: string;
  /** Gia tri doi chieu (vd MAX(updated_at) tu /api/cases/data-version) - neu khac gia tri server tra
   * ve luc sau, coi nhu cache cu can tai lai. Khong bat buoc: noi khong dung version (vd cache 1 ca
   * theo id trong CaseDetail.tsx) thi de trong, van hoat dong nhu truoc gio. */
  version?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getCachedEntry<T>(key: string): Promise<CacheEntry<T> | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve((req.result as CacheEntry<T>) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function setCachedEntry<T>(key: string, data: T, version?: string): Promise<CacheEntry<T>> {
  const entry: CacheEntry<T> = { data, cachedAt: new Date().toISOString(), version };
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(entry, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // khong luu duoc cache thi bo qua, van tra ve entry de dung ngay trong phien nay
  }
  return entry;
}

/** Xoa toan bo cache khi dang xuat - tranh may dung chung lo du lieu giua 2 tai khoan khac pham vi truy cap. */
export async function clearAllCache(): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
  } catch {
    // bo qua neu khong xoa duoc
  }
}
