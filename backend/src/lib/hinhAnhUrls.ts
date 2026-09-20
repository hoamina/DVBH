/**
 * Chuoi link_hinh_anh luu trong case_dvbh la 1 JSON array cac URL DA duoc chuan hoa domain luc
 * import (xem parseLinkHinhAnh() trong lib/ratchet.ts - huong nguoc lai, luc GHI). Ham nay la huong
 * DOC: JSON.parse + loc trung + giai ma "%2F" (vai URL cu bi encode path khi luu) truoc khi tra ve
 * cho API doi tac (partnerApi.ts: /case-lookup va /cases) - dung LAI logic parse cua
 * frontend/src/components/CaseImageGallery.tsx (khong import duoc qua workspace khac nen chep lai,
 * giu 2 ben dong bo neu sua), nhung dung chung trong noi bo backend giua 2 diem goi tren.
 */
export function parseHinhAnhUrls(raw: string | number | null): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const urls: string[] = [];
    for (const v of parsed) {
      if (typeof v !== "string" || !v) continue;
      const normalized = v.replaceAll("%2F", "/");
      if (!seen.has(normalized)) {
        seen.add(normalized);
        urls.push(normalized);
      }
    }
    return urls;
  } catch {
    return [];
  }
}
