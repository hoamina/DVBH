/**
 * Chuoi link_hinh_anh luu trong case_dvbh la 1 JSON array cac URL DA duoc chuan hoa domain luc
 * import (xem parseLinkHinhAnh() trong lib/ratchet.ts - huong nguoc lai, luc GHI). Ham nay la huong
 * DOC: JSON.parse + loc trung + giai ma "%2F" (vai URL cu bi encode path khi luu) truoc khi tra ve
 * cho API doi tac (partnerApi.ts: /case-lookup va /cases) - dung LAI logic parse cua
 * frontend/src/components/CaseImageGallery.tsx (khong import duoc qua workspace khac nen chep lai,
 * giu 2 ben dong bo neu sua), nhung dung chung trong noi bo backend giua 2 diem goi tren.
 */

const DUOI_FILE_RE = /(\.(?:jpe?g|png|gif|webp|heic|bmp|mp4|mov))(?:[\s,;]*(?:null|0))*[\s,;]*$/i;

/**
 * Tach 1 chuoi tho (co the chua NHIEU URL) thanh danh sach URL rieng - cat tai MOI cho bat dau
 * "http(s)://", KHONG phu thuoc dau phan cach. Ly do (2026-10-03): du lieu thuc te co it nhat 4 dang
 * noi URL - ",key.com/" (goc), ";" xen rac "0" (CRM tu 31/07, vd 1330894), va file Excel "cap nhat 1
 * cot" ghep bang cong thuc lam URL DINH LIEN nhau: "a.jpeg0https://..." / "a.jpeg,nullhttps://..." /
 * "a.jpeghttps://..." (~4.900 ca). Rac "0"/"null"/dau phan cach dinh SAU duoi file bi cat bo. Dang
 * KAROFI "URL, Ten file.jpeg" giu nguyen (khong co "http" o giua nen khong bi cat).
 */
export function splitImageUrls(raw: string): string[] {
  return raw
    .split(/(?=https?:\/\/)/i)
    .map((s) => s.trim().replace(DUOI_FILE_RE, "$1").replace(/[\s,;]+$/, ""))
    .filter((s) => /^https?:\/\//i.test(s));
}

export function parseHinhAnhUrls(raw: string | number | null): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const urls: string[] = [];
    for (const v of parsed) {
      if (typeof v !== "string" || !v) continue;
      // Phan tu da luu co the van chua nhieu URL dinh nhau (du lieu luu truoc ban fix) - tach lai.
      for (const s of splitImageUrls(v)) {
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
