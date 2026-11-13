import { useEffect, useRef, useState } from "react";
import type { AnhVideoOdooItem, SoLuongAnh } from "../types";
import { tr } from "../i18n/tr";


// Loc trung URL ngay tai day (nguon dung chung cho ca tieu de dem so anh lan gallery ben duoi) -
// du lieu CRM doi luc chua cung 1 URL lap lai nhieu lan trong 1 ca, giu nguyen thu tu xuat hien dau tien.
// Chuan hoa "%2F" -> "/" TRUOC khi so trung: cung 1 anh doi luc bi ma hoa "/" thanh "%2F" o 1 vai
// URL (phan segment path cua S3 key), khien 2 URL thuc chat giong het nhau lai bi coi la khac nhau
// neu so sanh chuoi tho.
// Ban chep cua backend/src/lib/hinhAnhUrls.ts splitImageUrls() (khac workspace, giu 2 ben dong bo) -
// cat tai MOI cho bat dau "http(s)://" (khong phu thuoc dau phan cach) vi du lieu thuc te co nhieu
// dang noi URL: ";" xen rac "0" (CRM tu 31/07), va file Excel "cap nhat 1 cot" lam URL DINH LIEN nhau
// ("a.jpeg0https://..." / "a.jpeg,nullhttps://..." / "a.jpeghttps://..." - ~4.900 ca, vd 1330894).
// Rac "0"/"null"/dau phan cach dinh sau duoi file bi cat bo; dang "URL, Ten file.jpeg" giu nguyen.
const DUOI_FILE_RE = /(\.(?:jpe?g|png|gif|webp|heic|bmp|mp4|mov))(?:[\s,;]*(?:null|0))*[\s,;]*$/i;
function splitImageUrls(raw: string): string[] {
  return raw
    .split(/(?=https?:\/\/)/i)
    .map((s) => s.trim().replace(DUOI_FILE_RE, "$1").replace(/[\s,;]+$/, ""))
    .filter((s) => /^https?:\/\//i.test(s));
}

export function parseLinkHinhAnh(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const urls: string[] = [];
    for (const v of parsed) {
      if (typeof v !== "string" || !v) continue;
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

// URL video (vd bao cao dinh kem quay man hinh) lan trong danh sach "anh" - phan biet qua duoi
// ".mp4" o cuoi path (bo qua query/hash) de render <video> thay vi <img>, tranh loi vo hinh o <img>.
function isVideoUrl(url: string): boolean {
  return /\.mp4(?:[?#]|$)/i.test(url);
}

// Fallback khi 1 URL KHONG the hotlink truc tiep qua <img src> (xac nhan voi chu he thong
// 2026-07-31: mot so URL KAROFI tra ve trang HTML cua trinh xem "CRM Media" (Smarthiz) thay vi anh
// nhi phan that - <img> luon that bai vi trinh duyet khong decode duoc HTML nhu anh). Trang do lai
// hien thi anh binh thuong khi dieu huong THANG toi (JS cua no tu fetch + render anh), nen anh nao
// <img> that bai se duoc chuyen sang nhung <iframe> toi URL nay thay vi chi bao "Khong tai duoc".
//
// Domain doi dieu kien: DB dang luu domain S3 cua Smarttrade (LINK_HINH_ANH_S3_BASE trong
// backend/src/lib/ratchet.ts) - domain nay hotlink duoc cho da so anh, nhung mot so anh (nguon
// KAROFI) chi ton tai that su o storage rieng cua KAROFI. Da xac nhan voi chu he thong 2026-07-31
// bang 3 cap URL that: doi domain S3 sang domain KAROFI ("srt-iam-api.karofi.com/storage/key/",
// CUNG path suffix "crm/incident/images/...") roi boc qua auth-media.smarthiz.vn thi anh hien dung -
// chi ap dung domain KAROFI o day, KHONG doi domain luu trong DB (S3 van la lua chon dung cho da so
// anh, chi fallback sang KAROFI khi <img> that bai).
const LINK_HINH_ANH_S3_BASE = "https://srt-iotp-prod-storage.s3.ap-southeast-1.amazonaws.com/";
const LINK_HINH_ANH_KAROFI_BASE = "https://srt-iam-api.karofi.com/storage/key/";

// Cong thuc encode CHINH XAC da xac nhan voi chu he thong 2026-07-31 qua 3 cap URL that (khong phai
// encodeURIComponent don thuan - chu he thong da tu mo link va bat duoc dang trinh duyet redirect
// toi, dang nay giu nguyen ":" va "," nhung ma hoa "/" thanh "%2F"): encodeURI() truoc (ma hoa
// khoang trang + ky tu Unicode/dau tieng Viet, GIU NGUYEN "/" ":" ","), sau do thay tiep TOAN BO "/"
// con lai (ke ca trong "https://") thanh "%2F".
function authMediaUrl(url: string): string {
  const karofiUrl = url.startsWith(LINK_HINH_ANH_S3_BASE) ? LINK_HINH_ANH_KAROFI_BASE + url.slice(LINK_HINH_ANH_S3_BASE.length) : url;
  const mediaParam = encodeURI(karofiUrl).replaceAll("/", "%2F");
  return `https://auth-media.smarthiz.vn/?media=${mediaParam}`;
}

// Gallery anh bao cao cong viec cua 1 ca - toi da 30 anh (gioi han o backend luc import). Grid
// thumbnail de luot nhanh, bam mo lightbox toan man hinh de xem/doi chieu chi tiet tung anh (zoom
// qua trinh duyet, dieu huong prev/next bang nut hoac phim mui ten - phuc vu rà soat nhieu anh lien tiep).
const ZOOM_MIN = 1;
const ZOOM_MAX = 6;
const ZOOM_DBLCLICK = 2.5;

// "Số lượng ảnh" (case_dvbh.so_luong_anh, migration 0143) - dem anh/video theo 5 nhom that cua Odoo
// (nguon Odoo CHUA co link anh xem duoc lau dai, xem types.ts) -> chi hien badge tom tat tong so, xem
// CaseDetail.tsx. Tra null khi khong co/khong hop le/tong = 0 (an badge).
export function parseSoLuongAnh(raw: string | null | undefined): SoLuongAnh | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return null;
    const out: SoLuongAnh = {
      ben_trong: Number(o.ben_trong) || 0,
      ben_ngoai: Number(o.ben_ngoai) || 0,
      bao_cao: Number(o.bao_cao) || 0,
      tem_serial: Number(o.tem_serial) || 0,
      bang_chung_huy: Number(o.bang_chung_huy) || 0,
    };
    const total = out.ben_trong + out.ben_ngoai + out.bao_cao + out.tem_serial + out.bang_chung_huy;
    return total > 0 ? out : null;
  } catch {
    return null;
  }
}

export function CaseImageGallery({ linkHinhAnh }: { linkHinhAnh: string | null | undefined }) {
  const urls = parseLinkHinhAnh(linkHinhAnh);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [brokenUrls, setBrokenUrls] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
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

  // Reset zoom/pan/rotation moi khi doi anh (chuyen prev/next hoac mo lai lightbox) - tranh anh moi
  // bi hien lech vi trí hoac giu nguyen goc xoay cua anh truoc.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
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
        {tr("Rất tiếc! báo cáo này hiện chưa có bất kỳ ảnh nào")}</div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {urls.map((url, i) =>
          brokenUrls.has(url) ? (
            <button
              key={i}
              type="button"
              onClick={() => setLightboxIndex(i)}
              className="focus-ring aspect-square rounded-lg border border-[var(--line)] bg-slate-50 flex flex-col items-center justify-center text-[var(--ink-400)] text-[10px] gap-0.5 p-1 text-center hover:opacity-80 transition-opacity"
              title={tr("Ảnh {0}/{1} — bấm để xem qua CRM Media", i + 1, urls.length)}
            >
              <span className="text-lg">🖼️</span>
              {tr("Bấm để xem")}</button>
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => setLightboxIndex(i)}
              className="focus-ring relative aspect-square rounded-lg border border-[var(--line)] overflow-hidden hover:opacity-80 transition-opacity"
              title={`${isVideoUrl(url) ? "Video" : tr("Ảnh")} ${i + 1}/${urls.length}`}
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
                  alt={tr("Ảnh báo cáo {0}", i + 1)}
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
          ) : brokenUrls.has(urls[lightboxIndex]) ? (
            <iframe
              key={urls[lightboxIndex]}
              src={authMediaUrl(urls[lightboxIndex])}
              onClick={(e) => e.stopPropagation()}
              title={tr("Ảnh báo cáo {0} (qua CRM Media)", lightboxIndex + 1)}
              className="w-[90vw] h-[85vh] rounded-lg shadow-2xl bg-white"
            />
          ) : (
            <img
              src={urls[lightboxIndex]}
              alt={tr("Ảnh báo cáo {0}", lightboxIndex + 1)}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={onImageMouseDown}
              onDoubleClick={toggleDoubleClickZoom}
              onError={() => setBrokenUrls((prev) => new Set(prev).add(urls[lightboxIndex]))}
              draggable={false}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom})`,
                cursor: zoom > ZOOM_MIN ? (dragging ? "grabbing" : "grab") : "zoom-in",
                // Xoay 90/270 thi chieu rong/cao thuc te cua anh bi doi cho - hoan doi luon
                // gioi han max-height/max-width de anh khong bi tran ra ngoai vung xem.
                maxHeight: rotation % 180 !== 0 ? "90vw" : "85vh",
                maxWidth: rotation % 180 !== 0 ? "85vh" : "90vw",
              }}
              className="object-contain rounded-lg shadow-2xl select-none"
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
            {!isVideoUrl(urls[lightboxIndex]) && !brokenUrls.has(urls[lightboxIndex]) && (
              <>
                <button
                  type="button"
                  title={tr("Thu nhỏ")}
                  disabled={zoom <= ZOOM_MIN}
                  onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - 0.4))}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent text-sm leading-none"
                >
                  −
                </button>
                <span className="tabular-nums w-9 text-center">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  title={tr("Phóng to")}
                  disabled={zoom >= ZOOM_MAX}
                  onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + 0.4))}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent text-sm leading-none"
                >
                  +
                </button>
                {zoom > ZOOM_MIN && (
                  <button type="button" title={tr("Về kích thước gốc")} onClick={() => setZoom(ZOOM_MIN)} className="underline hover:no-underline">
                    100%
                  </button>
                )}
                <span className="w-px h-3 bg-white/25" />
                <button
                  type="button"
                  title={tr("Xoay trái")}
                  onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/20 text-sm leading-none"
                >
                  ↺
                </button>
                <button
                  type="button"
                  title={tr("Xoay phải")}
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/20 text-sm leading-none"
                >
                  ↻
                </button>
                <span className="w-px h-3 bg-white/25" />
              </>
            )}
            <span>
              {lightboxIndex + 1} / {urls.length}
            </span>
            <a
              href={brokenUrls.has(urls[lightboxIndex]) ? authMediaUrl(urls[lightboxIndex]) : urls[lightboxIndex]}
              target="_blank"
              rel="noreferrer"
              className="underline font-semibold"
            >
              {isVideoUrl(urls[lightboxIndex]) ? tr("Mở video gốc") : brokenUrls.has(urls[lightboxIndex]) ? tr("Mở qua CRM Media") : tr("Mở ảnh gốc")}
            </a>
          </div>
        </div>
      )}
    </>
  );
}

// "Ảnh & Video Odoo" (case_dvbh.anh_video_odoo, migration 0166) - toan bo anh/video cua phieu Odoo, "url" =
// https://ocrm.happinno.com/ts/media/<public_token>. Da thu that 2026-11-12: link nay CAN phien dang nhap
// OCRM (chua dang nhap -> 404; dang nhap -> chuyen huong sang link ky so prodktv.happinno.com het han ~15
// phut), va cookie OCRM KHONG duoc gui khi nhung <img> tu trang khac ten mien -> nhung anh thang luon loi.
// Vi vay chi hien dang LINK mo tab moi (dieu huong cap cao nhat thi cookie OCRM duoc gui), khong <img>.
export function parseAnhVideoOdoo(raw: string | null | undefined): AnhVideoOdooItem[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((p) => p && typeof p.url === "string" && /^https?:\/\//i.test(p.url))
      .map((p, i) => ({ ...p, stt: Number(p.stt) || i + 1 }));
  } catch {
    return [];
  }
}

// Nhan nhom anh theo "kind" cua Odoo (khop 5 nhom cua so_luong_anh: in = ben trong, out = ben ngoai).
const NHAN_KIND_ODOO: Record<string, string> = {
  image_in: "Ảnh bên trong",
  image_out: "Ảnh bên ngoài",
  image_report: "Ảnh báo cáo",
  image_serial: "Ảnh tem serial",
  image_cancel: "Ảnh bằng chứng huỷ",
  image_appointment: "Ảnh lịch hẹn",
  clip: "Video",
  video_after_close: "Video sau đóng ca",
  location_clip: "Video vị trí",
};

function nhanKindOdoo(m: AnhVideoOdooItem): string {
  const k = m.kind ?? "";
  if (NHAN_KIND_ODOO[k]) return tr(NHAN_KIND_ODOO[k]);
  if (k.startsWith("video") || (m.loai_file ?? "").startsWith("video/")) return "Video";
  return k || tr("Ảnh");
}

// Video = loai_file video/* hoac kind clip / location_clip / video_* (v1.585 them nhan clip - truoc chi xet "video*").
export function laVideoOdoo(m: AnhVideoOdooItem): boolean {
  const k = m.kind ?? "";
  return (m.loai_file ?? "").startsWith("video/") || k.startsWith("video") || k === "clip" || k.endsWith("_clip");
}

/** Dem anh / video tu anh_video_odoo + so theo tung nhom (nhan da dich) - DUNG CHUNG cho badge dau chi tiet ca va tieu de
 * "Hình ảnh báo cáo công việc" (2026-11-13: badge cu dem so_luong_anh chi 5 nhom anh -> 15, muc anh dem moi file -> 18). */
export function demAnhVideoOdoo(items: AnhVideoOdooItem[]): { anh: number; video: number; theoNhom: [string, number][] } {
  const nhom = new Map<string, number>();
  let video = 0;
  for (const m of items) {
    if (laVideoOdoo(m)) video++;
    const n = nhanKindOdoo(m);
    nhom.set(n, (nhom.get(n) ?? 0) + 1);
  }
  return { anh: items.length - video, video, theoNhom: [...nhom.entries()] };
}

function ngayGioNgan(s: string | null): string {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : "";
}

export function OdooMediaLinks({ items }: { items: AnhVideoOdooItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-xs text-[var(--ink-500)] mb-1.5">
        {tr("Ảnh & video Odoo — bấm để mở ở tab mới (cần đăng nhập OCRM)")}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {items.map((m, i) => {
          const laVideo = laVideoOdoo(m);
          const ngay = ngayGioNgan(m.ngay_tao);
          return (
            <a
              key={`${m.url}-${i}`}
              href={m.url}
              target="_blank"
              rel="noopener noreferrer"
              title={[nhanKindOdoo(m), m.ten_file, m.ngay_tao].filter(Boolean).join(" · ")}
              className="focus-ring aspect-square rounded-lg border border-[var(--line)] bg-slate-50 hover:bg-slate-100 flex flex-col items-center justify-center gap-0.5 p-1 text-center text-[11px] text-[var(--ink-600)] transition-colors"
            >
              <span className="text-xl">{laVideo ? "🎬" : "🖼️"}</span>
              <span className="font-semibold leading-tight">{nhanKindOdoo(m)}</span>
              {ngay && <span className="text-[10px] text-[var(--ink-400)]">{ngay}</span>}
              <span className="text-[10px] text-[var(--brand-600,#2563eb)]">↗ {tr("Mở")}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
