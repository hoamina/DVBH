import { useState } from "react";
import { useToast } from "../components/ui/Toast";

/**
 * Boc 1 ham "Xuat Excel" (goi API export=true roi exportRowsToExcel): bat loi -> toast, khoa nut khi dang chay.
 * Truoc 2026-10-09 cac nut Xuat Excel khong bat loi - API loi (vd qua gioi han bind D1 o Ca lap) thi bam "im
 * lang", nguoi dung tuong khong tai duoc file. Dung: const exp = useExportRunner(); <Btn onClick={exp.run(fn)}
 * disabled={exp.busy}>{exp.busy ? "⏳ Đang xuất…" : "⬇ Xuất Excel"}</Btn>.
 */
export function useExportRunner() {
  const addToast = useToast();
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<unknown> | unknown) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      addToast(`Không xuất được file Excel: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}
