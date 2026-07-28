import { useEffect, useRef, useState } from "react";

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

// URL video (vd bao cao dinh kem quay man hinh) lan trong danh sach "anh" - phan biet qua duoi
// ".mp4" o cuoi path (bo qua query/hash) de render <video> thay vi <img>, tranh loi vo hinh o <img>.
function isVideoUrl(url: string): boolean {
  return /\.mp4(?:[?#]|$)/i.test(url);
}

// Gallery anh bao cao cong viec cua 1 ca - toi da 30 anh (gioi han o backend luc import). Grid
// thumbnail de luot nhanh, bam mo lightbox toan man hinh de xem/doi chieu chi tiet tung anh (zoom
// qua trinh duyet, dieu huong prev/next bang nut hoac phim mui ten - phuc vu rà soat nhieu anh lien tiep).
const ZOOM_MIN = 1;
const ZOOM_MAX = 6;
const ZOOM_DBLCLICK = 2.5;

export function CaseImageGallery({ linkHinhAnh }: { linkHinhAnh: string | null | undefined }) {
  const urls = parseLinkHinhAnh(linkHinhAnh);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [brokenUrls, setBrokenUrls] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const zoomWrapRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

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

  // Reset zoom/pan moi khi doi anh (chuyen prev/next hoac mo lai lightbox) - tranh anh moi bi
  // hien lech vi trí do giu lai pan/zoom cua anh truoc.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [lightboxIndex]);

  // zoom ve 1x thi luon reset pan ve {0,0} - tranh anh o scale(1) nhung van bi dich chuyen do con
  // giu pan cu tu luc dang zoom.
  useEffect(() => {
    if (zoom <= ZOOM_MIN) setPan({ x: 0, y: 0 });
  }, [zoom]);

  // Lan chuot de zoom - gan qua addEventListener (khong dung onWheel cua React) vi can { passive:
  // false } de preventDefault() chan cuon trang phia sau lightbox, React co the gan wheel handler
  // o che do passive theo mac dinh trinh duyet nen khong dam bao preventDefault hoat dong.
  useEffect(() => {
    const el = zoomWrapRef.current;
    if (!el || lightboxIndex === null) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z - e.deltaY * 0.0018)));
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [lightboxIndex]);

  function onImageMouseDown(e: React.MouseEvent) {
    if (zoom <= ZOOM_MIN) return;
    e.stopPropagation();
    dragState.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    setDragging(true);
  }

  useEffect(() => {
    if (!dragging) return;
    function onMouseMove(e: MouseEvent) {
      if (!dragState.current) return;
      setPan({
        x: dragState.current.panX + (e.clientX - dragState.current.startX),
        y: dragState.current.panY + (e.clientY - dragState.current.startY),
      });
    }
    function onMouseUp() {
      dragState.current = null;
      setDragging(false);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragging]);

  function toggleDoubleClickZoom(e: React.MouseEvent) {
    e.stopPropagation();
    setZoom((z) => (z > ZOOM_MIN ? ZOOM_MIN : ZOOM_DBLCLICK));
  }

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
              className="focus-ring relative aspect-square rounded-lg border border-[var(--line)] overflow-hidden hover:opacity-80 transition-opacity"
              title={`${isVideoUrl(url) ? "Video" : "Ảnh"} ${i + 1}/${urls.length}`}
            >
              {isVideoUrl(url) ? (
                <>
                  <video
                    src={url}
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                    onError={() => setBrokenUrls((prev) => new Set(prev).add(url))}
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <span className="w-6 h-6 rounded-full bg-black/50 text-white text-xs flex items-center justify-center">▶</span>
                  </span>
                </>
              ) : (
                <img
                  src={url}
                  alt={`Ảnh báo cáo ${i + 1}`}
                  loading="lazy"
                  className="w-full h-full object-cover"
                  onError={() => setBrokenUrls((prev) => new Set(prev).add(url))}
                />
              )}
            </button>
          ),
        )}
      </div>

      {lightboxIndex !== null && (
        <div
          ref={zoomWrapRef}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 overflow-hidden"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white text-lg z-10"
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
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl flex items-center justify-center z-10"
            >
              ‹
            </button>
          )}

          {isVideoUrl(urls[lightboxIndex]) ? (
            <video
              key={urls[lightboxIndex]}
              src={urls[lightboxIndex]}
              controls
              autoPlay
              onClick={(e) => e.stopPropagation()}
              className="max-h-[85vh] max-w-[90vw] rounded-lg shadow-2xl"
            />
          ) : (
            <img
              src={urls[lightboxIndex]}
              alt={`Ảnh báo cáo ${lightboxIndex + 1}`}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={onImageMouseDown}
              onDoubleClick={toggleDoubleClickZoom}
              draggable={false}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                cursor: zoom > ZOOM_MIN ? (dragging ? "grabbing" : "grab") : "zoom-in",
              }}
              className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl select-none"
            />
          )}

          {urls.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((i) => (i === null ? null : (i + 1) % urls.length));
              }}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl flex items-center justify-center z-10"
            >
              ›
            </button>
          )}

          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2.5 text-white text-xs bg-black/40 rounded-full px-3 py-1.5 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {!isVideoUrl(urls[lightboxIndex]) && (
              <>
                <button
                  type="button"
                  title="Thu nhỏ"
                  disabled={zoom <= ZOOM_MIN}
                  onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - 0.4))}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent text-sm leading-none"
                >
                  −
                </button>
                <span className="tabular-nums w-9 text-center">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  title="Phóng to"
                  disabled={zoom >= ZOOM_MAX}
                  onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + 0.4))}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent text-sm leading-none"
                >
                  +
                </button>
                {zoom > ZOOM_MIN && (
                  <button type="button" title="Về kích thước gốc" onClick={() => setZoom(ZOOM_MIN)} className="underline hover:no-underline">
                    100%
                  </button>
                )}
                <span className="w-px h-3 bg-white/25" />
              </>
            )}
            <span>
              {lightboxIndex + 1} / {urls.length}
            </span>
            <a href={urls[lightboxIndex]} target="_blank" rel="noreferrer" className="underline font-semibold">
              {isVideoUrl(urls[lightboxIndex]) ? "Mở video gốc" : "Mở ảnh gốc"}
            </a>
          </div>
        </div>
      )}
    </>
  );
}
