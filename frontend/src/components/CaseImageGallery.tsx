import { useEffect, useState } from "react";

// Loc trung URL ngay tai day (nguon dung chung cho ca tieu de dem so anh lan gallery ben duoi) -
// du lieu CRM doi luc chua cung 1 URL lap lai nhieu lan trong 1 ca, giu nguyen thu tu xuat hien dau tien.
// Chuan hoa "%2F" -> "/" TRUOC khi so trung: cung 1 anh doi luc bi ma hoa "/" thanh "%2F" o 1 vai
// URL (phan segment path cua S3 key), khien 2 URL thuc chat giong het nhau lai bi coi la khac nhau
// neu so sanh chuoi tho.
export function parseLinkHinhAnh(raw: string | null | undefined): string[] {
  if (!raw) return [];
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

// Gallery anh bao cao cong viec cua 1 ca - toi da 30 anh (gioi han o backend luc import). Grid
// thumbnail de luot nhanh, bam mo lightbox toan man hinh de xem/doi chieu chi tiet tung anh (zoom
// qua trinh duyet, dieu huong prev/next bang nut hoac phim mui ten - phuc vu rà soat nhieu anh lien tiep).
export function CaseImageGallery({ linkHinhAnh }: { linkHinhAnh: string | null | undefined }) {
  const urls = parseLinkHinhAnh(linkHinhAnh);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [brokenUrls, setBrokenUrls] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (lightboxIndex === null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight") setLightboxIndex((i) => (i === null ? null : (i + 1) % urls.length));
      if (e.key === "ArrowLeft") setLightboxIndex((i) => (i === null ? null : (i - 1 + urls.length) % urls.length));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxIndex, urls.length]);

  if (urls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-[var(--ink-400)] text-sm text-center">
        <span className="text-2xl">🖼️</span>
        Rất tiếc! báo cáo này hiện chưa có bất kỳ ảnh nào
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {urls.map((url, i) =>
          brokenUrls.has(url) ? (
            <div
              key={i}
              className="aspect-square rounded-lg border border-[var(--line)] bg-slate-50 flex flex-col items-center justify-center text-[var(--ink-400)] text-[10px] gap-0.5 p-1 text-center"
            >
              <span className="text-lg">🖼️</span>
              Không tải được
            </div>
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => setLightboxIndex(i)}
              className="focus-ring aspect-square rounded-lg border border-[var(--line)] overflow-hidden hover:opacity-80 transition-opacity"
              title={`Ảnh ${i + 1}/${urls.length}`}
            >
              <img
                src={url}
                alt={`Ảnh báo cáo ${i + 1}`}
                loading="lazy"
                className="w-full h-full object-cover"
                onError={() => setBrokenUrls((prev) => new Set(prev).add(url))}
              />
            </button>
          ),
        )}
      </div>

      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white text-lg"
          >
            ✕
          </button>

          {urls.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((i) => (i === null ? null : (i - 1 + urls.length) % urls.length));
              }}
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl flex items-center justify-center"
            >
              ‹
            </button>
          )}

          <img
            src={urls[lightboxIndex]}
            alt={`Ảnh báo cáo ${lightboxIndex + 1}`}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
          />

          {urls.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((i) => (i === null ? null : (i + 1) % urls.length));
              }}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl flex items-center justify-center"
            >
              ›
            </button>
          )}

          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 text-white text-xs bg-black/40 rounded-full px-3 py-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <span>
              {lightboxIndex + 1} / {urls.length}
            </span>
            <a href={urls[lightboxIndex]} target="_blank" rel="noreferrer" className="underline font-semibold">
              Mở ảnh gốc
            </a>
          </div>
        </div>
      )}
    </>
  );
}
