import type { ReactNode } from "react";
import { tr } from "../i18n/tr";
import anhBenNgoai from "../assets/odoo-demo/ben_ngoai.jpg";
import anhBenTrong from "../assets/odoo-demo/ben_trong.jpg";
import anhBaoCao from "../assets/odoo-demo/bao_cao.jpg";
import anhTemSerial from "../assets/odoo-demo/tem_serial.jpg";
import anhLichHen from "../assets/odoo-demo/lich_hen.jpg";

// Hinh minh hoa (demo) cho TUNG LOAI (anh cat san o assets/odoo-demo, loai khong co anh -> SVG) anh/video Odoo (2026-11-13, chu he thong): anh that can phien dang nhap OCRM nen khong
// nhung duoc -> moi o hien 1 hinh minh hoa dung chung theo loai (may ben ngoai, may mo cua thay loi loc, phieu bao cao, tem
// serial, phieu huy, nhat ky cuoc goi lich hen, video) + so thu tu goc phai giong luoi anh tren app Odoo. Ve bang SVG noi tuyen
// (khong tai file ngoai).

export type LoaiMinhHoa = "ben_ngoai" | "ben_trong" | "bao_cao" | "tem_serial" | "huy" | "lich_hen" | "video" | "khac";

export function loaiMinhHoa(kind: string | null | undefined, loaiFile?: string | null): LoaiMinhHoa {
  const k = kind ?? "";
  if (k === "image_out") return "ben_ngoai";
  if (k === "image_in") return "ben_trong";
  if (k === "image_report") return "bao_cao";
  if (k === "image_serial") return "tem_serial";
  if (k === "image_cancel") return "huy";
  if (k === "image_appointment" || k === "lich_hen") return "lich_hen";
  if ((loaiFile ?? "").startsWith("video/") || k.startsWith("video") || k === "clip" || k.endsWith("_clip")) return "video";
  return "khac";
}

/** Thu tu nhom hien thi. */
export const THU_TU_MINH_HOA: LoaiMinhHoa[] = ["ben_ngoai", "ben_trong", "bao_cao", "tem_serial", "huy", "lich_hen", "video", "khac"];

// Anh mau (2026-11-13, chu he thong gui luoi anh that tren app Odoo + anh nhat ky cuoc goi): cat tu anh that, ~5KB/anh, dung CHUNG
// cho moi o cung loai. Loai chua co anh mau (huy, video, khac) van dung hinh ve SVG ben duoi.
const ANH_MAU: Partial<Record<LoaiMinhHoa, string>> = {
  ben_ngoai: anhBenNgoai,
  ben_trong: anhBenTrong,
  bao_cao: anhBaoCao,
  tem_serial: anhTemSerial,
  lich_hen: anhLichHen,
};

const NEN: Record<LoaiMinhHoa, string> = {
  ben_ngoai: "#e0f2fe",
  ben_trong: "#dcfce7",
  bao_cao: "#fef9c3",
  tem_serial: "#ede9fe",
  huy: "#fee2e2",
  lich_hen: "#f1f5f9",
  video: "#e2e8f0",
  khac: "#f1f5f9",
};

function MinhHoa({ loai }: { loai: LoaiMinhHoa }): ReactNode {
  switch (loai) {
    case "ben_ngoai": // than may loc nuoc dung, mat kinh den + 2 bong logo
      return (
        <g>
          <rect x="30" y="10" width="40" height="78" rx="4" fill="#0f172a" />
          <rect x="34" y="16" width="32" height="52" rx="2" fill="#1e3a8a" />
          <circle cx="43" cy="30" r="5" fill="#93c5fd" />
          <circle cx="56" cy="44" r="7" fill="#bfdbfe" />
          <rect x="38" y="72" width="24" height="4" rx="2" fill="#475569" />
          <rect x="32" y="88" width="6" height="4" fill="#334155" />
          <rect x="62" y="88" width="6" height="4" fill="#334155" />
        </g>
      );
    case "ben_trong": // may mo cua, thay hang loi loc
      return (
        <g>
          <rect x="22" y="10" width="56" height="80" rx="4" fill="#ffffff" stroke="#64748b" strokeWidth="2" />
          <rect x="22" y="10" width="56" height="16" rx="4" fill="#1e3a8a" />
          {[30, 41, 52, 63].map((x) => (
            <g key={x}>
              <rect x={x} y="32" width="8" height="34" rx="3" fill="#e2e8f0" stroke="#94a3b8" />
              <rect x={x + 2} y="28" width="4" height="5" fill="#38bdf8" />
            </g>
          ))}
          <rect x="28" y="72" width="44" height="12" rx="2" fill="#f1f5f9" stroke="#cbd5e1" />
        </g>
      );
    case "bao_cao": // phieu bao cao co dong ke + con dau
      return (
        <g>
          <rect x="24" y="8" width="52" height="84" rx="3" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />
          <rect x="30" y="14" width="22" height="5" fill="#2563eb" />
          {[26, 33, 40, 47, 54, 61].map((y) => (
            <rect key={y} x="30" y={y} width={y % 2 ? 40 : 34} height="2.5" fill="#cbd5e1" />
          ))}
          <circle cx="60" cy="78" r="8" fill="none" stroke="#dc2626" strokeWidth="2" />
          <rect x="30" y="74" width="18" height="2.5" fill="#cbd5e1" />
        </g>
      );
    case "tem_serial": // tem dan co ma vach
      return (
        <g>
          <rect x="14" y="28" width="72" height="44" rx="4" fill="#ffffff" stroke="#7c3aed" strokeWidth="2" />
          {[20, 23, 25, 29, 31, 34, 38, 40, 43, 47, 49, 52, 56, 58, 61, 65, 67, 70, 74, 77].map((x, i) => (
            <rect key={x} x={x} y="36" width={i % 3 === 0 ? 2.5 : 1.3} height="22" fill="#1e1b4b" />
          ))}
          <rect x="22" y="62" width="56" height="3" fill="#a78bfa" />
        </g>
      );
    case "huy": // phieu bi gach cheo
      return (
        <g>
          <rect x="26" y="10" width="48" height="80" rx="3" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />
          {[22, 30, 38, 46].map((y) => (
            <rect key={y} x="32" y={y} width="36" height="2.5" fill="#cbd5e1" />
          ))}
          <path d="M34 56 L66 84 M66 56 L34 84" stroke="#dc2626" strokeWidth="5" strokeLinecap="round" />
        </g>
      );
    case "lich_hen": // nhat ky cuoc goi: the bo tron + mui ten goi di + gio
      return (
        <g>
          <rect x="12" y="30" width="76" height="40" rx="10" fill="#ffffff" stroke="#cbd5e1" />
          <rect x="20" y="38" width="22" height="5" rx="2" fill="#0f172a" />
          <rect x="45" y="37" width="7" height="7" rx="1.5" fill="#a855f7" />
          <path d="M22 60 L30 52 M24 52 L30 52 L30 58" stroke="#16a34a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <rect x="35" y="54" width="44" height="4" rx="2" fill="#86efac" />
        </g>
      );
    case "video": // may quay
      return (
        <g>
          <rect x="18" y="34" width="44" height="32" rx="6" fill="none" stroke="#0f172a" strokeWidth="4" />
          <path d="M62 44 L82 34 L82 66 L62 56 Z" fill="none" stroke="#0f172a" strokeWidth="4" strokeLinejoin="round" />
        </g>
      );
    default: // anh chung: khung tranh nui + mat troi
      return (
        <g>
          <rect x="16" y="22" width="68" height="56" rx="4" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />
          <circle cx="66" cy="36" r="6" fill="#facc15" />
          <path d="M20 74 L42 46 L58 64 L66 56 L80 74 Z" fill="#4ade80" />
        </g>
      );
  }
}

/** O 1 anh/video: hinh minh hoa theo loai + so thu tu goc phai + nhan "<loai> (n)", la link mo tab moi. */
export function OdooMediaTile({
  url,
  loai,
  so,
  nhan,
  phu,
  title,
}: {
  url: string;
  loai: LoaiMinhHoa;
  so: number;
  nhan: string;
  phu?: string;
  title?: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className="focus-ring group block rounded-lg border border-[var(--line)] bg-white hover:border-[var(--ocean-500)] hover:shadow-sm transition-colors overflow-hidden"
    >
      <div className="relative aspect-square" style={{ background: NEN[loai] }}>
        {ANH_MAU[loai] ? (
          <img src={ANH_MAU[loai]} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden>
            <MinhHoa loai={loai} />
          </svg>
        )}
        <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded bg-[#0e8a8a] text-white text-[10px] font-bold flex items-center justify-center">
          {so}
        </span>
        <span className="absolute bottom-1 left-1 rounded bg-white/85 px-1 text-[10px] font-semibold text-[var(--ocean-600)] opacity-0 group-hover:opacity-100 transition-opacity">
          ↗ {tr("Mở")}
        </span>
      </div>
      <div className="px-1 py-1 text-center">
        <div className="text-[11px] font-semibold leading-tight text-[var(--ink-700)] line-clamp-2">{nhan}</div>
        {phu && <div className="text-[10px] text-[var(--ink-400)]">{phu}</div>}
      </div>
    </a>
  );
}
