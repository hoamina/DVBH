import { Badge, type BadgeTone } from "./Badge";

// Badge "Mức độ" (cot "Độ ưu tiên" CRM QuickSight / Odoo, migration 0126): Cao (mac dinh, ~99% ca) xam,
// Gấp cam, Rất gấp do dam. Dung chung Chi tiet ca + cot "Mức độ" danh sach ca.
export function mucDoBadge(mucDo: string | null | undefined) {
  if (!mucDo) return null;
  const tone: BadgeTone = mucDo === "Rất gấp" ? "coral" : mucDo === "Gấp" ? "orange" : "gray";
  return (
    <Badge tone={tone} solid={mucDo === "Rất gấp"}>
      {mucDo === "Cao" ? "Mức độ: Cao" : `⚡ ${mucDo}`}
    </Badge>
  );
}
