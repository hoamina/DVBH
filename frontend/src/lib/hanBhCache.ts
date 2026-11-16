/**
 * Bảng "Hạn bảo hành" (module Sửa DT · HĐ · BH) lưu sẵn trong IndexedDB theo nước / phạm vi / tháng (2026-11-16).
 * Mỗi lần mở: gửi {moc, khoa} của lần trước -> server chỉ trả ca thay đổi + danh sách ca cần bỏ (xem backend
 * routes/suaDoanhThu.ts GET /bao-hanh); trộn theo ID rồi lưu lại. Server đổi "khoa" (sang ngày mới, có ca huỷ / đổi khu vực,
 * đổi người dùng / phân quyền) -> trả cả tháng và bản lưu được thay toàn bộ. Không đọc/ghi được IndexedDB -> coi như chưa có bản lưu.
 */
import { api } from "../api/client";
import { phamViHienTai, quocGiaHienTai } from "./phamVi";

const DB_NAME = "dvbh-han-bh";
const STORE = "thang";

interface BanLuu<T> {
  moc: string;
  khoa: string;
  rows: T[];
}
interface TraVe<T> {
  full: boolean;
  rows: T[];
  xoa: string[];
  moc: string;
  khoa: string;
}

function moDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no idb"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function doc<T>(key: string): Promise<BanLuu<T> | null> {
  try {
    const db = await moDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as BanLuu<T>) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}
async function ghi<T>(key: string, v: BanLuu<T>): Promise<void> {
  try {
    const db = await moDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(v, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // bỏ qua - lần sau tải cả tháng
  }
}

/** Đọc bản lưu (để hiện ngay) - không gọi server. */
export async function docBanLuuHanBh<T>(thang: string): Promise<T[] | null> {
  return (await doc<T>(khoaLuu(thang)))?.rows ?? null;
}

function khoaLuu(thang: string) {
  return `${quocGiaHienTai() ?? ""}|${phamViHienTai()}|${thang}`;
}

/** Tải (full hoặc delta) + trộn + lưu; trả bảng đầy đủ của tháng. */
export async function taiHanBh<T extends { id: string }>(thang: string): Promise<T[]> {
  const key = khoaLuu(thang);
  const cu = await doc<T>(key);
  const q = cu ? `&moc=${encodeURIComponent(cu.moc)}&khoa=${encodeURIComponent(cu.khoa)}` : "";
  const kq = await api.get<TraVe<T>>(`/sua-doanh-thu/bao-hanh?thang=${thang}${q}`);
  let rows: T[];
  if (kq.full || !cu) {
    rows = kq.rows;
  } else {
    const m = new Map(cu.rows.map((r) => [r.id, r]));
    for (const id of kq.xoa) m.delete(id);
    for (const r of kq.rows) m.set(r.id, r);
    rows = [...m.values()];
  }
  await ghi(key, { moc: kq.moc, khoa: kq.khoa, rows });
  return rows;
}
