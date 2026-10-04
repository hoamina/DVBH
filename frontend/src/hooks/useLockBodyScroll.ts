import { useEffect } from "react";

// Khoa cuon trang nen khi popup (CaseDetail, Modal) dang mo - bug 2026-10-04: lan chuot tren vung popup
// khong co gi de cuon (tab noi dung ngan, header, nen mo) hoac da cuon het thi su kien lan "xuyen" xuong
// trang goc (thanh cuon cua <html>), nhin nhu popup dung yen con nen phia sau troi. Dem so popup dang
// mo (popup long nhau: Modal mo tren CaseDetail) - chi tra lai overflow khi popup CUOI CUNG dong, tranh
// dong Modal con lam mo khoa trong khi CaseDetail van dang mo.
let lockCount = 0;
let savedOverflow = "";

export function useLockBodyScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    if (lockCount === 0) {
      savedOverflow = root.style.overflow;
      root.style.overflow = "hidden";
    }
    lockCount++;
    return () => {
      lockCount--;
      if (lockCount === 0) root.style.overflow = savedOverflow;
    };
  }, [active]);
}
