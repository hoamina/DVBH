import { useState } from "react";

/**
 * "Cach thuc xu ly" trong "Chuoi lich su theo serial" (tab Ca lap cua CaseDetail, va popup ket qua
 * tim serial trung nhieu ca o TopBar) - du lieu thuc te thuong la ca 1 nhat ky dai (700+ ky tu,
 * nhieu lan cap nhat CRM gop lai), khong phai 1 nhan ngan nhu KTV/tien do. CRM co quy uoc noi bo bat
 * dau bang "[CTXL] <tom tat cach xu ly>" roi moi den "[NOTE] <nhat ky chi tiet>" - uu tien hien phan
 * TOM TAT (truoc "[NOTE]") lam preview mac dinh, vi day moi la thong tin GS/QC can luot nhanh de so
 * sanh cach xu ly co lap lai qua nhieu lan hay khong; bam vao de xem full (bao gom ca nhat ky) khi
 * can dieu tra sau, thay vi cat ky tu vo nghia hoac nhoi ca 700 ky tu vao 1 dong danh sach dang lam
 * mat kha nang doi chieu nhanh.
 */
function ctxlSummary(text: string): string {
  const noteIdx = text.indexOf("[NOTE]");
  return (noteIdx > -1 ? text.slice(0, noteIdx) : text).trim();
}

export function CachThucXuLyLine({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const summary = ctxlSummary(text);
  const hasMore = summary !== text.trim();

  return (
    <div
      className={`text-[11px] text-[var(--ink-400)] mt-0.5 ${hasMore ? "cursor-pointer hover:text-[var(--ink-600)]" : ""}`}
      onClick={(e) => {
        if (!hasMore) return;
        e.stopPropagation();
        setExpanded((v) => !v);
      }}
    >
      <span className={expanded ? "whitespace-pre-wrap" : "truncate block"} title={expanded ? undefined : summary}>
        🛠 {expanded ? text : summary || text}
      </span>
      {hasMore && <span className="text-[var(--ocean-500)] font-semibold">{expanded ? " Thu gọn ↑" : " Xem đầy đủ ↓"}</span>}
    </div>
  );
}
