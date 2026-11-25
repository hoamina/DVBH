import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { tr } from "../i18n/tr";
import { phamViHienTai, quocGiaHienTai } from "../lib/phamVi";
import { Btn } from "./ui/Btn";
import { Modal } from "./ui/Modal";

/** 1 lan Admin sua tay so "da giai trinh" (bang giai_trinh_daily_log_sua, migration 0180). */
export interface SuaTayGiaiTrinh {
  ngay: string;
  khu_vuc: string;
  can_giai_trinh: number;
  da_cu: number;
  da_moi: number;
  ly_do: string;
  nguoi_sua: string;
  sua_luc: string;
}

export interface OSuaGiaiTrinh {
  ngay: string;
  nhanKhuVuc: string;
  /** Moi ma goc cua dong (B2B cu/moi da gop) - backend tim dung dong chot co du lieu ngay do. */
  maGoc: string[];
  can: number;
  da: number;
  lichSu: SuaTayGiaiTrinh[];
}

/**
 * Admin sua tay so "đã giải trình" cua 1 o (ngay x khu vuc) trong bang "Tỷ lệ giải trình theo ngày" (2026-11-25, v1.659, chu he thong:
 * "admin click vào ngày để sửa số ca giải trình ví dụ 27/28 => sửa thành 28/28 (vì 1 số trường hợp GS xin đánh giá muộn)").
 * PUT /api/cases/giai-trinh-daily-log - sua DUNG pham vi dang xem (gui qg + pv), bat buoc ly do, gioi han 0..can.
 */
export function SuaSoGiaiTrinhModal({ o, onClose, onDone }: { o: OSuaGiaiTrinh | null; onClose: () => void; onDone: () => void }) {
  const [da, setDa] = useState("");
  const [lyDo, setLyDo] = useState("");
  const [loi, setLoi] = useState("");
  const [dangLuu, setDangLuu] = useState(false);
  const [dangLoaiTru, setDangLoaiTru] = useState(false);
  useEffect(() => {
    if (o) {
      setDa(String(o.can));
      setLyDo("");
      setLoi("");
    }
  }, [o]);
  if (!o) return null;
  const so = Number(da);
  const hopLe = da.trim() !== "" && Number.isInteger(so) && so >= 0 && so <= o.can && lyDo.trim() !== "";
  const luu = async () => {
    if (!hopLe) return;
    setDangLuu(true);
    setLoi("");
    try {
      await api.put("/cases/giai-trinh-daily-log", { ngay: o.ngay, khu_vuc: o.maGoc, da_giai_trinh: so, ly_do: lyDo.trim(), qg: quocGiaHienTai(), pv: phamViHienTai() });
      onDone();
      onClose();
    } catch (e) {
      setLoi(e instanceof ApiError ? e.detail || e.code || e.message : String(e));
    } finally {
      setDangLuu(false);
    }
  };
  const [y, m, d] = o.ngay.split("-");
  // "Loại trừ" truc tiep (v1.661, chu he thong "thêm nút loại trừ trực tiếp"): them ngay loai tru cho (ngay, khu vuc) qua API Cai dat
  // POST /settings/giai-trinh-exclude-ngay (Admin) - ly do lam ghi chu (hien duoi chu "Loại trừ"). Loai tru ap cho MOI pham vi (khong theo
  // quoc gia / NSKX). Xoa loai tru o Cai dat > Ngay loai tru giai trinh.
  const loaiTru = async () => {
    if (!lyDo.trim()) return;
    if (!window.confirm(tr("Loại trừ {0} ngày {1} khỏi lũy kế / tỷ lệ giải trình?", o.nhanKhuVuc, `${d}/${m}/${y}`))) return;
    setDangLoaiTru(true);
    setLoi("");
    try {
      await api.post("/settings/giai-trinh-exclude-ngay", { ngay: o.ngay, khuVucList: o.maGoc, ghiChu: lyDo.trim() });
      onDone();
      onClose();
    } catch (e) {
      setLoi(e instanceof ApiError ? e.detail || e.code || e.message : String(e));
    } finally {
      setDangLoaiTru(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={tr("Sửa số đã giải trình · {0} · {1}", o.nhanKhuVuc, `${d}/${m}/${y}`)}
      width="max-w-md"
      footer={
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--line)]">
          <Btn
            variant="ghost"
            size="sm"
            className="mr-auto text-slate-700"
            onClick={() => void loaiTru()}
            disabled={!lyDo.trim() || dangLuu}
            loading={dangLoaiTru}
            title={lyDo.trim() ? tr("Loại trừ khu vực này ngày này khỏi lũy kế / tỷ lệ (lý do làm ghi chú)") : tr("Nhập lý do trước khi loại trừ")}
          >
            {tr("⊘ Loại trừ ngày này")}
          </Btn>
          <Btn variant="ghost" size="sm" onClick={onClose}>
            {tr("Huỷ")}
          </Btn>
          <Btn size="sm" onClick={() => void luu()} disabled={!hopLe || dangLoaiTru} loading={dangLuu}>
            {tr("Lưu")}
          </Btn>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <div>
          {tr("Số đang chốt:")} <b className="font-mono">{o.da}/{o.can}</b>
        </div>
        <label className="block">
          <span className="text-xs text-[var(--ink-500)]">{tr("Số đã giải trình mới (0 – {0})", o.can)}</span>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="number"
              min={0}
              max={o.can}
              value={da}
              onChange={(e) => setDa(e.target.value)}
              className="focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5 w-24 font-mono"
              autoFocus
            />
            <span className="font-mono text-[var(--ink-500)]">/ {o.can}</span>
          </div>
        </label>
        <label className="block">
          <span className="text-xs text-[var(--ink-500)]">{tr("Lý do sửa (bắt buộc)")}</span>
          <textarea
            value={lyDo}
            onChange={(e) => setLyDo(e.target.value)}
            rows={2}
            placeholder={tr("VD: GS xin đánh giá muộn, đã giải trình đủ ca")}
            className="focus-ring mt-1 w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5"
          />
        </label>
        <p className="text-xs text-[var(--ink-500)]">
          {tr("Chỉ sửa số của phạm vi đang xem (quốc gia / NSKX). Ảnh Telegram đã gửi không đổi. Mỗi lần sửa được ghi lại.")}{" "}
          {tr("Nút Loại trừ bỏ ô này khỏi lũy kế (mọi phạm vi), lý do thành ghi chú; bỏ loại trừ ở Settings › Ngày loại trừ giải trình.")}
        </p>
        {loi && (
          <p role="alert" className="text-xs text-red-700">
            {loi}
          </p>
        )}
        {o.lichSu.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-[var(--ink-600)] mb-1">{tr("Lịch sử sửa")}</div>
            <ul className="text-xs space-y-1">
              {o.lichSu.map((s, i) => (
                <li key={i} className="text-[var(--ink-600)]">
                  <span className="font-mono">{s.sua_luc.slice(0, 16)}</span> · {s.nguoi_sua} · <span className="font-mono">{s.da_cu}/{s.can_giai_trinh} → {s.da_moi}/{s.can_giai_trinh}</span> · {s.ly_do}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
