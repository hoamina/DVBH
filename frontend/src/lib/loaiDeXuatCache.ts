// IndexedDB cache cho loai_de_xuat options - incremental sync giong linhKienCache.ts.
// Moi entry luu ca vai_tro_json de client tu loc theo user, khong can them API.

const DB_NAME = "dvbh_lde_cache";
const DB_VERSION = 1;
const STORE_NAME = "loai_de_xuat";

export interface LdeEntry {
  id: number; // keyPath
  nhom_id: number;
  ten_option: string;
  bat_tat: number;
  stt: number;
  ten_nhom: string;
  vai_tro_json: string; // JSON array string
  ngay_cap_nhat: string | null;
}

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { dbInstance = req.result; resolve(dbInstance); };
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

export async function getAllLdeFromCache(): Promise<LdeEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function getLastLdeCacheTimestamp(): Promise<string | null> {
  const rows = await getAllLdeFromCache();
  if (rows.length === 0) return null;
  const timestamps = rows.map((r) => r.ngay_cap_nhat).filter((t): t is string => !!t);
  if (timestamps.length === 0) return null;
  return timestamps.sort().reverse()[0];
}

export async function mergeLdeToCache(rows: LdeEntry[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const row of rows) store.put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearLdeCache(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Loc options phu hop voi user hien tai dua tren vai_tro_json cua moi nhom.
export function getOptionsForUser(
  user: { la_ktv_dvbh?: boolean; la_ve_tinh?: boolean; vai_tro?: string | null } | null,
  entries: LdeEntry[],
): string[] {
  const active = entries.filter((e) => e.bat_tat);

  // CHOT 2026-08-14: Admin luon xem duoc TOAN BO loai de xuat dang bat tren he thong, bo qua loc
  // theo nhom/flag - giong pattern Admin bypass o backend/src/lib/moduleAccess.ts (tranh truong hop
  // Admin tu khoa lua chon cua chinh minh qua checklist vai_tro_json cua tung nhom).
  let matched: LdeEntry[];
  if (user?.vai_tro === "Admin") {
    matched = active;
  } else {
    const userFlags = new Set<string>();
    if (user?.la_ktv_dvbh) userFlags.add("la_ktv_dvbh");
    if (user?.la_ve_tinh) userFlags.add("la_ve_tinh");
    if (user?.vai_tro) userFlags.add(`vai_tro:${user.vai_tro}`);

    const matchedNhomIds = new Set(
      active
        .filter((e) => {
          try {
            const roles: string[] = JSON.parse(e.vai_tro_json || "[]");
            return roles.some((r) => userFlags.has(r));
          } catch {
            return false;
          }
        })
        .map((e) => e.nhom_id),
    );
    matched = active.filter((x) => matchedNhomIds.has(x.nhom_id));
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const e of [...matched].sort((a, b) => a.stt - b.stt || a.id - b.id)) {
    if (!seen.has(e.ten_option)) { seen.add(e.ten_option); result.push(e.ten_option); }
  }
  return result;
}
