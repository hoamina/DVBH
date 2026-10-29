import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useToast } from "./ui/Toast";
import { tr } from "../i18n/tr";

// Cot "Bản dịch (EN / ID)" cho moi bang lua chon trong Cai dat (2026-10-29, migration 0150, "Đa quốc gia" SRS §12 Q3).
// 2 o nhap, luu khi roi o (PUT /api/ban-dich). Bo trong = hien tieng Viet. Lua chon co san da duoc dich san luc trien khai;
// lua chon them moi Admin tu nhap. Giao dien nguoi dung doc ban dich o lan tai trang sau (lib/banDichDuLieu.ts).
// truong: "ban_dich" (ten lua chon) hoac "nhom_loi" (cot Nhom loi cua bang loai loi vi pham).
export function BanDichCell({
  bang,
  id,
  en,
  idn,
  truong = "ban_dich",
  queryKey,
  canEdit = true,
}: {
  bang: string;
  id: number;
  en: string | null | undefined;
  idn: string | null | undefined;
  truong?: "ban_dich" | "nhom_loi";
  queryKey?: unknown[];
  canEdit?: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const luu = useMutation({
    mutationFn: (b: Record<string, string>) => api.put("/ban-dich", { bang, id, ...b }),
    onSuccess: () => {
      if (queryKey) qc.invalidateQueries({ queryKey });
      toast(tr("Đã lưu bản dịch"));
    },
    onError: (e: Error) => toast(e.message),
  });
  const kEn = truong === "ban_dich" ? "ban_dich_en" : "nhom_loi_en";
  const kId = truong === "ban_dich" ? "ban_dich_id" : "nhom_loi_id";
  const o = "focus-ring w-full px-1.5 py-0.5 rounded border border-[var(--line)] text-[11px] bg-[var(--surface)]";
  if (!canEdit) {
    return (
      <div className="text-[11px] text-[var(--ink-500)] leading-tight">
        <div>EN: {en || "—"}</div>
        <div>ID: {idn || "—"}</div>
      </div>
    );
  }
  const nhap = (key: string, cu: string | null | undefined, nhan: string) => (
    <input
      key={`${id}-${key}-${cu ?? ""}`}
      className={o}
      defaultValue={cu ?? ""}
      placeholder={nhan}
      title={nhan}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v !== (cu ?? "")) luu.mutate({ [key]: v });
      }}
    />
  );
  return (
    <div className="flex flex-col gap-0.5 min-w-[160px]">
      {nhap(kEn, en, "English")}
      {nhap(kId, idn, "Indonesia")}
    </div>
  );
}
