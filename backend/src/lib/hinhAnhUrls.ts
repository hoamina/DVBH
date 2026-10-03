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
      // Tu 2026-07-31 CRM gui them dinh dang "url1;0;0;url2;;url3" (URL S3 day du noi bang ";" xen gia
      // tri rac "0"/rong) - ban parse luc import cu khong tach ";" nen ca chuoi bi luu thanh 1 phan tu
      // (~6.600 ca, vd 1330894, khong xem duoc anh). Tach lai o day + bo token khong phai URL.
      for (const part of v.split(";")) {
        const s = part.trim();
        if (!/^https?:\/\//i.test(s)) continue;
        const normalized = s.replaceAll("%2F", "/");
        if (!seen.has(normalized)) {
          seen.add(normalized);
          urls.push(normalized);
        }
      }
    }
    return urls;
  } catch {
    return [];
  }
}
