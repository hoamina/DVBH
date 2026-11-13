import { useMemo } from "react";
import { Badge, type BadgeTone } from "./ui/Badge";
import { Card } from "./ui/Card";
import { fmtDateTime, type LichHenItem } from "../types";
import { tr } from "../i18n/tr";
import { OdooMediaTile } from "./OdooMediaTile";

// Tab "Lịch hẹn" (CaseDetail, trong card "Thông tin xử lý") - nguon Odoo OCRM (model
// technical.service.appointment). 1 ca co the hen nhieu lan (hen lai/doi lich) - hien thi TOAN BO
// lich su, lan hen GAN NHAT (theo thoi_gian_hen, khong phai thu tu tao) duoc danh dau "Hiện tại".
// "Thời gian hẹn xử lý" o tab Co ban/Xu ly van la gia tri nay, khong doi (xem ocrm/transform_odoo.py).

export function parseLichHen(raw: string | null | undefined): LichHenItem[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map((p, i) => ({ ...p, stt: Number(p?.stt) || i + 1 })) : [];
  } catch {
    return [];
  }
}

const NGUOI_HEN_LABEL: Record<string, string> = {
  technician: tr("KTV hẹn lịch"),
  customer: tr("Khách hàng hẹn lịch"),
};

const TRANG_THAI: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: tr("Đang hoạt động"), tone: "teal" },
  moved: { label: tr("Đã chuyển"), tone: "amber" },
  cancelled: { label: tr("Đã hủy"), tone: "coral" },
};

function trangThaiBadge(code: string | null) {
  if (!code) return null;
  return TRANG_THAI[code] ?? { label: code, tone: "gray" as BadgeTone };
}

// Lan hen GAN NHAT theo thoi_gian_hen (chuoi "YYYY-MM-DD HH:MM:SS" so sanh dung thu tu thoi gian) -
// giong cong thuc "Thời gian hẹn xử lý" (ocrm/transform_odoo.py: hen[-1] sau khi sort).
function ganNhatStt(items: LichHenItem[]): number | null {
  let best: LichHenItem | null = null;
  for (const it of items) {
    if (!it.thoi_gian_hen) continue;
    if (!best || !best.thoi_gian_hen || it.thoi_gian_hen > best.thoi_gian_hen) best = it;
  }
  return best?.stt ?? null;
}

function LichHenItemCard({ item, isGanNhat }: { item: LichHenItem; isGanNhat: boolean }) {
  const anh = item.anh_bang_chung ?? [];
  const tt = trangThaiBadge(item.trang_thai);
  return (
    <Card className={`p-4 border-l-4 ${isGanNhat ? "border-l-[var(--ocean-500)]" : "border-l-slate-300"}`}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 w-7 h-7 rounded-full bg-[var(--ocean-500)] text-white text-sm font-bold flex items-center justify-center">
            {item.stt}
          </span>
          <div className="min-w-0">
            <div className="font-semibold text-sm text-[var(--ink-900)]">{fmtDateTime(item.thoi_gian_hen)}</div>
            {item.nguoi_hen_lich && <div className="text-xs text-[var(--ink-500)]">{NGUOI_HEN_LABEL[item.nguoi_hen_lich] ?? item.nguoi_hen_lich}</div>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isGanNhat && (
            <Badge tone="ocean" solid>
              {tr("Hiện tại")}</Badge>
          )}
          {tt && <Badge tone={tt.tone}>{tt.label}</Badge>}
        </div>
      </div>
      {item.ghi_chu && <div className="text-sm text-[var(--ink-700)] mt-2">{item.ghi_chu}</div>}
      {anh.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-semibold text-[var(--ink-500)] mb-1.5">{tr("Ảnh bằng chứng (")}{anh.length})</div>
          {/* Link OCRM ts/media can phien dang nhap OCRM, nhung <img> tu ten mien khac luon loi -> hien dang
              LINK mo tab moi, cung kieu o "Ảnh & video Odoo" (OdooMediaLinks, v1.584). */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,92px))] gap-2">
            {anh.filter((a) => /^https?:\/\//i.test(a.url ?? "")).map((a, i) => {
              const laVideo = (a.loai_file ?? "").startsWith("video/");
              const nhan = laVideo ? "Video" : tr("Ảnh lịch hẹn");
              return (
                <OdooMediaTile
                  key={`${a.url}-${i}`}
                  url={a.url}
                  loai={laVideo ? "video" : "lich_hen"}
                  so={i + 1}
                  nhan={`${nhan} (${i + 1})`}
                  title={`${nhan} ${i + 1}/${anh.length}`}
                />
              );
            })}
          </div>
        </div>
      )}
      {item.ngay_tao && <div className="text-[11px] text-[var(--ink-400)] mt-2">{tr("Tạo lúc")} {fmtDateTime(item.ngay_tao)}</div>}
    </Card>
  );
}

export function LichHenPanel({ items }: { items: LichHenItem[] }) {
  const ganNhatSttVal = useMemo(() => ganNhatStt(items), [items]);
  if (items.length === 0) {
    return <div className="text-sm text-[var(--ink-400)] italic">{tr("Ca này chưa có lịch hẹn kỹ thuật được ghi nhận (nguồn Odoo).")}</div>;
  }
  // Moi nhat len dau (theo thu tu tao, stt giam dan) de de thay lan hen gan nhat / hen lai gan day.
  const sorted = [...items].sort((a, b) => b.stt - a.stt);
  return (
    <div className="space-y-3">
      {sorted.map((item) => (
        <LichHenItemCard key={item.stt} item={item} isGanNhat={item.stt === ganNhatSttVal} />
      ))}
    </div>
  );
}
