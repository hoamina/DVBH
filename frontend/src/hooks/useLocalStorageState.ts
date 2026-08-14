import { useEffect, useState } from "react";

/**
 * Nhu useState, nhung doc gia tri khoi tao tu localStorage (neu co) va tu ghi lai moi khi doi -
 * dung cho cac bo loc bao cao (khu vuc/hang/thang/dim...) de KHONG bi mat lua chon khi nguoi dung
 * chuyen sang thẻ khac roi quay lai (component unmount/remount lam useState thuong reset ve mac
 * dinh). Chi luu cuc bo tren may nguoi dung (khong dong bo len server) - giong pattern
 * col-widths:<storageKey> cua PaginatedTable.tsx va ACTIVE_MODULE_KEY cua App.tsx.
 */
export function useLocalStorageState<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const raw = window.localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* localStorage day/private mode - tinh nang phu, bo qua loi */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, state]);

  return [state, setState];
}
