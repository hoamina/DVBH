import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

/*
 * "Dia gioi cu / moi" (2026-10-10) - xu ly HOAN TOAN o client (server chi tra du lieu tho, xem backend
 * routes/diaGioi.ts + filterParams.ts diaGioiLoc):
 * - Ten tinh/huyen/xa trong du lieu co 2 kieu: co tien to ("Tỉnh", "Thành phố", "Quận", "Huyện", "Xã", "Phường"...)
 *   va khong ("Hà Nội"), con lech kieu bo dau ("Hoà"/"Hòa") -> gom ve 1 KHOA (bo tien to + bo dau + chu thuong) va hien
 *   1 ten chuan CO tien to (vd "Hà Nội" + "Thành phố Hà Nội" -> "Thành phố Hà Nội").
 * - Ca QuickSight cu: chi co tinh/huyen CU. Ca Odoo (tu 1/10): luon co tinh/xa MOI, co them tinh/huyen cu khi da dong.
 * - Che do "cu": nhom theo tinh cu (ca chua co tinh cu -> nhom trong). Che do "moi": ca co tinh_moi dung tinh_moi, ca
 *   chua co -> quy doi tinh cu -> tinh moi theo bang "Quy đổi tỉnh" (Cài đặt, bang tinh_quy_doi). Cap 2: cu = Quan/Huyen,
 *   moi = Xa/Phuong moi (ca cu khong co -> nhom trong; khong quy doi huyen -> xa duoc vi cap huyen da bo).
 */

export type DiaGioiMode = "cu" | "moi";

// ---------- Che do (luu tren may, dung chung moi man hinh) ----------

const MODE_KEY = "dvbh_dia_gioi_mode";
const listeners = new Set<() => void>();
function readMode(): DiaGioiMode {
  try {
    return localStorage.getItem(MODE_KEY) === "moi" ? "moi" : "cu";
  } catch {
    return "cu";
  }
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === MODE_KEY && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}
export function setDiaGioiMode(m: DiaGioiMode) {
  localStorage.setItem(MODE_KEY, m);
  listeners.forEach((l) => l());
}
export function useDiaGioiMode(): [DiaGioiMode, (m: DiaGioiMode) => void] {
  return [useSyncExternalStore(subscribe, readMode), setDiaGioiMode];
}

/** Goi fn khi nguoi dung doi che do (khong goi lan mount) - dung de xoa bo loc tinh/huyen cua che do cu. */
export function useOnDiaGioiModeChange(fn: () => void) {
  const [mode] = useDiaGioiMode();
  const prev = useRef(mode);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (prev.current !== mode) {
      prev.current = mode;
      fnRef.current();
    }
  }, [mode]);
}

export const DIA_GIOI_LABEL: Record<DiaGioiMode, string> = { cu: "Địa giới cũ", moi: "Địa giới mới" };
export const NHAN_CAP_1: Record<DiaGioiMode, string> = { cu: "Tỉnh cũ", moi: "Tỉnh mới" };
export const NHAN_CAP_2: Record<DiaGioiMode, string> = { cu: "Quận/Huyện", moi: "Xã/Phường mới" };
const NHAN_TRONG_1: Record<DiaGioiMode, string> = { cu: "(Chưa có tỉnh cũ)", moi: "(Không rõ tỉnh)" };
const NHAN_TRONG_2: Record<DiaGioiMode, string> = { cu: "(Chưa có quận/huyện)", moi: "(Chưa có xã mới)" };

// ---------- Chuan hoa ten ----------

// Chi tien to CO DAU (+ "TP"): ban khong dau de bo nham ten that (vd phuong "Quan Hoa" -> "Hoa").
const TIEN_TO_RE = /^\s*(thành phố|tp\.|tp|tỉnh|quận|huyện|thị xã|thị trấn|xã|phường|đặc khu)(\s+|(?<=\.))/i;
// Ten bien the -> khoa chuan (sau khi da bo tien to + bo dau).
const KHOA_ALIAS: Record<string, string> = {
  "thua thien hue": "hue",
  "hcm": "ho chi minh",
  "sai gon": "ho chi minh",
};

function boDau(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/** Bo tien to hanh chinh (giu nguyen hoa/thuong + dau cua phan con lai). */
export function boTienTo(raw: string): string {
  return raw.normalize("NFC").trim().replace(/\s+/g, " ").replace(TIEN_TO_RE, "").trim();
}
export function coTienTo(raw: string): boolean {
  return TIEN_TO_RE.test(raw.normalize("NFC"));
}

/** Khoa so khop: bo tien to, bo dau, chu thuong, gop dau gach/khoang trang. "" = trong. */
export function khoaTen(raw: string | null | undefined): string {
  if (!raw) return "";
  let k = boDau(boTienTo(raw)).toLowerCase().replace(/[\s\-–.,]+/g, " ").trim();
  // Ten dang so ("Quận 1" -> "1") de nguyen; "Thừa Thiên Huế" -> "huế"...
  k = KHOA_ALIAS[k] ?? k;
  return k;
}

const clean = (raw: string) => raw.normalize("NFC").trim().replace(/\s+/g, " ");
const isBlank = (v: string | null | undefined) => !v || !v.trim();

// ---------- Bang quy doi + chi muc ----------

export interface QuyDoiRow {
  tinh_cu: string;
  tinh_moi: string;
  nguoi_sua?: string | null;
  ngay_sua?: string | null;
}

export class DiaGioiIndex {
  private cuByKey = new Map<string, string>();
  private moiByCuKey = new Map<string, string>();
  private moiByKey = new Map<string, string>();

  constructor(rows: QuyDoiRow[]) {
    for (const r of rows) {
      const kCu = khoaTen(r.tinh_cu);
      const moi = clean(r.tinh_moi);
      // 1 khoa co the co nhieu dong (vd admin them "Hà Tây"): giu ten cu chuan dau tien (dong co tien to uu tien).
      const daCo = this.cuByKey.get(kCu);
      if (!daCo || (!coTienTo(daCo) && coTienTo(r.tinh_cu))) this.cuByKey.set(kCu, clean(r.tinh_cu));
      this.moiByCuKey.set(kCu, moi);
      const kMoi = khoaTen(moi);
      if (!this.moiByKey.has(kMoi)) this.moiByKey.set(kMoi, moi);
    }
  }

  /** Ten tinh cu chuan ("" = trong). Ten khong co trong bang -> giu nguyen ten da lam sach. */
  tinhCu(raw: string | null | undefined): string {
    if (isBlank(raw)) return "";
    return this.cuByKey.get(khoaTen(raw)) ?? clean(raw!);
  }

  /** Ten tinh moi chuan tu gia tri tinh_moi tho. */
  tinhMoiTho(raw: string | null | undefined): string {
    if (isBlank(raw)) return "";
    return this.moiByKey.get(khoaTen(raw)) ?? clean(raw!);
  }

  /** Tinh moi cua 1 ca: co tinh_moi thi dung, khong thi quy doi tinh cu theo bang. "" = khong xac dinh. */
  tinhMoi(tinh: string | null | undefined, tinhMoi: string | null | undefined): string {
    if (!isBlank(tinhMoi)) return this.tinhMoiTho(tinhMoi);
    if (isBlank(tinh)) return "";
    return this.moiByCuKey.get(khoaTen(tinh)) ?? `${this.tinhCu(tinh)} (chưa quy đổi)`;
  }

  tinh(mode: DiaGioiMode, row: { tinh?: string | null; tinh_moi?: string | null }): string {
    return mode === "moi" ? this.tinhMoi(row.tinh, row.tinh_moi) : this.tinhCu(row.tinh);
  }
}

/** Nhan hien thi cho 1 khoa nhom ("" -> nhan nhom trong theo che do). */
export function nhanTinh(mode: DiaGioiMode, ten: string): string {
  return ten || NHAN_TRONG_1[mode];
}
export function nhanCap2(mode: DiaGioiMode, ten: string): string {
  return ten || NHAN_TRONG_2[mode];
}

/** Sap theo ten bo tien to (de "Thành phố Hà Nội" nam o van H), nhom trong cuoi cung. */
export function soSanhTen(a: string, b: string): number {
  if (!a) return b ? 1 : 0;
  if (!b) return -1;
  return boTienTo(a).localeCompare(boTienTo(b), "vi");
}

// ---------- Hook: chi muc quy doi (re, dung cho moi noi can quy doi ten) ----------

export function useTinhQuyDoi() {
  return useQuery({
    queryKey: ["dia-gioi-quy-doi"],
    queryFn: () => api.get<{ rows: QuyDoiRow[]; canEdit: boolean }>("/dia-gioi/quy-doi"),
    staleTime: 30 * 60_000,
  });
}

export function useDiaGioiIndex() {
  const [mode, setMode] = useDiaGioiMode();
  const { data } = useTinhQuyDoi();
  const idx = useMemo(() => new DiaGioiIndex(data?.rows ?? []), [data]);
  return { mode, setMode, idx, ready: !!data };
}

// ---------- Hook: cay lua chon + bo loc "dg_loc" ----------

type ToHop = [string | null, string | null, string | null, string | null]; // tinh, quan_huyen, tinh_moi, xa_moi

interface NutCap2 {
  ten: string;
  raw: Set<string>;
  tenCoTienTo: Set<string>;
}
interface NutTinh {
  ten: string;
  rawT: Set<string>; // gia tri tho cot tinh (cu)
  rawTm: Set<string>; // gia tri tho cot tinh_moi
  cap2: Map<string, NutCap2>;
}

function dungCay(idx: DiaGioiIndex, rows: ToHop[], mode: DiaGioiMode): Map<string, NutTinh> {
  const cay = new Map<string, NutTinh>();
  for (const [t, qh, tm, xm] of rows) {
    const ten = mode === "moi" ? idx.tinhMoi(t, tm) : idx.tinhCu(t);
    let nut = cay.get(ten);
    if (!nut) cay.set(ten, (nut = { ten, rawT: new Set(), rawTm: new Set(), cap2: new Map() }));
    if (mode === "moi" && !isBlank(tm)) nut.rawTm.add(tm!);
    else nut.rawT.add(t ?? "");
    const c2 = mode === "moi" ? xm : qh;
    const k2 = khoaTen(c2);
    let n2 = nut.cap2.get(k2);
    if (!n2) nut.cap2.set(k2, (n2 = { ten: "", raw: new Set(), tenCoTienTo: new Set() }));
    n2.raw.add(c2 ?? "");
    if (!isBlank(c2) && coTienTo(c2!)) n2.tenCoTienTo.add(clean(c2!));
  }
  // Ten cap 2: uu tien ban CO tien to neu chi co 1 kieu (vd "Quận Ba Đình"); nhieu kieu khac nhau (vd "Thị xã Kỳ Anh"
  // + "Huyện Kỳ Anh" ma du lieu tho "Kỳ Anh" khong phan biet duoc) -> hien ten tran.
  for (const nut of cay.values()) {
    for (const [k2, n2] of nut.cap2) {
      if (!k2) n2.ten = "";
      else if (n2.tenCoTienTo.size === 1) n2.ten = [...n2.tenCoTienTo][0];
      else {
        const mau = [...n2.raw].find((r) => !isBlank(r))!;
        n2.ten = boTienTo(mau);
      }
    }
  }
  return cay;
}

/** Gia tri option cho nhom TRONG ("" da dung lam "Tat ca" o cac dropdown). */
export const DG_TRONG = "__trong__";

export interface DiaGioiOption {
  value: string;
  label: string;
}

/** Khoa luu trong bo loc (localStorage) cho cap 2 = khoa chuan hoa, tranh lech ten giua 2 kieu ghi. */
export function useDiaGioiLoc() {
  const { mode, setMode, idx, ready: quyDoiReady } = useDiaGioiIndex();
  const { data: toHop } = useQuery({
    queryKey: ["dia-gioi-to-hop"],
    queryFn: () => api.get<{ rows: ToHop[] }>("/dia-gioi/to-hop"),
    staleTime: 30 * 60_000,
  });
  const ready = quyDoiReady && !!toHop;
  const cay = useMemo(() => dungCay(idx, toHop?.rows ?? [], mode), [idx, toHop, mode]);

  const tinhOptions: DiaGioiOption[] = useMemo(
    () =>
      [...cay.keys()]
        .sort(soSanhTen)
        .map((ten) => ({ value: ten || DG_TRONG, label: nhanTinh(mode, ten) })),
    [cay, mode],
  );

  /** Dua 1 gia tri tinh dang luu (co the la ten tho kieu cu, hoac ten cua che do kia) ve khoa cua che do hien tai;
   * khong khop -> null (bo qua). */
  const chuanTinh = (v: string): string | null => {
    if (v === DG_TRONG) return cay.has("") ? "" : null;
    if (!v) return null;
    if (cay.has(v)) return v;
    const k = khoaTen(v);
    for (const ten of cay.keys()) if (khoaTen(ten) === k) return ten;
    return null;
  };

  const cap2Options = (tinh: string): DiaGioiOption[] => {
    const nut = cay.get(chuanTinh(tinh) ?? "\u0000");
    if (!nut) return [];
    return [...nut.cap2.entries()]
      .sort((a, b) => soSanhTen(a[1].ten, b[1].ten))
      .map(([k2, n2]) => ({ value: k2 || DG_TRONG, label: nhanCap2(mode, n2.ten) }));
  };

  /**
   * Dung query param "dg_loc" tu lua chon (ten tinh theo che do hien tai; cap 2 = khoa, chi ap dung khi chon dung 1 tinh).
   * Tra undefined khi khong loc. Khi chua tai xong du lieu ma DANG co lua chon -> null (noi goi tam hoan query).
   */
  const buildDgLoc = (tinhs: string[], cap2s: string[] = []): string | undefined | null => {
    if (tinhs.filter(Boolean).length === 0) return undefined;
    if (!ready) return null;
    const t = new Set<string>();
    const tm = new Set<string>();
    const c2 = new Set<string>();
    const nuts = tinhs.map(chuanTinh).filter((v): v is string => v !== null).map((v) => cay.get(v)!);
    if (nuts.length === 0) return undefined;
    for (const nut of nuts) {
      nut.rawT.forEach((v) => t.add(v));
      nut.rawTm.forEach((v) => tm.add(v));
    }
    if (nuts.length === 1) {
      // cap 2 nhan khoa (tu dropdown) hoac ten tho (drill-down tu bang bao cao) - deu dua ve khoaTen.
      for (const k2 of cap2s.filter(Boolean)) nuts[0].cap2.get(k2 === DG_TRONG ? "" : khoaTen(k2))?.raw.forEach((v) => c2.add(v));
    }
    const loc =
      mode === "moi"
        ? { m: "moi", t: [...t], tm: [...tm], ...(c2.size ? { x: [...c2] } : {}) }
        : { m: "cu", t: [...t], ...(c2.size ? { h: [...c2] } : {}) };
    return JSON.stringify(loc);
  };

  const nhanCap2Cua = (tinh: string, k2: string): string => cap2Options(tinh).find((o) => o.value === k2 || o.value === khoaTen(k2))?.label ?? k2;

  return { mode, setMode, idx, ready, tinhOptions, cap2Options, chuanTinh, buildDgLoc, nhanCap2Cua };
}
