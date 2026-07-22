/**
 * Cache ben (IndexedDB) cho danh muc gan tinh (lý do tồn, bảng giá linh kiện) - noi dung
 * duoc nen gzip truoc khi luu (CompressionStream, co san trong trinh duyet, khong can thu
 * vien ngoai) va kem hash noi dung lay tu server. Moi lan load: hoi hash server (endpoint
 * re, xem backend/src/lib/contentHash.ts) truoc, khop voi hash da luu thi dung thang du
 * lieu cache (giai nen), khac thi moi tai lai toan bo va nen luu lai.
 */

import { api } from "../api/client";

const DB_NAME = "dvbh-static-cache";
const STORE_NAME = "cache";
const DB_VERSION = 1;

interface StoredEntry {
  hash: string;
  compressed: boolean;
  payload: ArrayBuffer | string;
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

async function getStored(key: string): Promise<StoredEntry | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve((req.result as StoredEntry) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function setStored(key: string, entry: StoredEntry): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(entry, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // khong luu duoc cache thi bo qua - lan sau chi don gian coi nhu cache-miss
  }
}

async function compressJson(json: string): Promise<{ compressed: boolean; payload: ArrayBuffer | string }> {
  try {
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
    const payload = await new Response(stream).arrayBuffer();
    return { compressed: true, payload };
  } catch {
    return { compressed: false, payload: json }; // trinh duyet khong ho tro CompressionStream - luu tho, van dung duoc
  }
}

async function decompressToJson(entry: StoredEntry): Promise<string> {
  if (!entry.compressed) return entry.payload as string;
  const stream = new Blob([entry.payload as ArrayBuffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

export async function fetchWithHashCache<T>(key: string, versionUrl: string, dataUrl: string): Promise<T> {
  const { hash } = await api.get<{ hash: string }>(versionUrl);
  const stored = await getStored(key);
  if (stored && stored.hash === hash) {
    try {
      return JSON.parse(await decompressToJson(stored)) as T;
    } catch {
      // cache hong (vd doi dinh dang nen) - roi xuong tai lai server ben duoi
    }
  }

  const fresh = await api.get<T>(dataUrl);
  const { compressed, payload } = await compressJson(JSON.stringify(fresh));
  await setStored(key, { hash, compressed, payload });
  return fresh;
}
