import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../components/ui/Btn";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { Tabs } from "../components/ui/Tabs";
import { Select } from "../components/ui/Select";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { api, buildQuery } from "../api/client";
import { getAllFromCache, getLastCacheTimestamp, mergeLinhKienToCache } from "../lib/linhKienCache";
import { fmtDateTime, fmtVND } from "../types";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/AuthContext";
import { useLocalStorageState } from "../hooks/useLocalStorageState";

// Module "Dat mua linh kien" (Phase 2) - thay the quy trinh dat hang linh kien tren Google
// Sheets/AppSheet, xem plan "Module Dat Mua Linh Kien". Tabs hien theo co vai tro (la_ktv_dvbh/
// la_ve_tinh/la_kho/la_ke_toan) + vai_tro chuan (Giam sat theo doi, TBP DVBH/Admin = TN tac nghiep).

interface LkDanhMucRow {
  ma_linh_kien: string;
  ten_linh_kien: string;
  gia_tham_chieu: number | null;
  don_vi: string | null;
  bat_tat: number;
}

interface DonHangRow {
  id: string;
  phieu_dat_id: string;
  loai_don: "mua" | "cong_no" | "tra_hang";
  ma_lk: string;
  ten_lk_snapshot: string | null;
  loai_de_xuat: string | null;
  so_luong_de_xuat: number;
  so_luong_thuc_xuat: number | null;
  gia_de_xuat: number | null;
  gia_chot: number | null;
  ly_do_cham: string | null;
  ma_xuat_kho: string | null;
  ma_misa: string | null;
  so_tien_cong_no: number | null;
  nguoi_tao: string;
  ngay_tao: string;
  cases?: { id: string; khach_hang: string | null; khu_vuc: string | null }[];
}

interface PhieuDatRow {
  id: string;
  nguoi_tao: string;
  ngay_tao: string;
  email_gs: string | null;
  ghi_chu: string | null;
  trang_thai: string;
  so_dong: number;
}

interface PhieuDatLogRow {
  id: number;
  phieu_dat_id: string;
  trang_thai: string;
  nguoi_xu_ly: string;
  ngay_xu_ly: string;
  ghi_chu: string | null;
}

interface PhieuSoTienRow {
  id: string;
  phieu_dat_id: string;
  so_tien: number;
  ghi_chu: string | null;
  trang_thai: string;
  bang_chung_url: string | null;
  ngay_ktv_chuyen: string | null;
  nguoi_tao: string;
  ngay_tao: string;
}

interface PhieuXuatKhoRow {
  id: string;
  ma_xuat_kho: string;
  nguoi_tao: string;
  ngay_tao: string;
  ghi_chu: string | null;
  trang_thai: string;
  so_dong: number;
}

interface ThieuLkRow {
  id: string;
  dat_don_hang_id: string;
  ly_do: string | null;
  nguoi_tao: string;
  ngay_tao: string;
  trang_thai: string;
}

// Dong dat_don_hang (loai_don='tra_hang'), kem trang thai rieng luong tra hang - xem
// backend/src/routes/traHang.ts (buoc 3 ke hoach "Luong tao don mua hang").
interface TraHangRow extends DonHangRow {
  trang_thai_tra_hang: string;
}

const PHIEU_DAT_TRANG_THAI_TONE: Record<string, BadgeTone> = {
  "Cho Ve tinh duyet": "amber",
  "Cho TN duyet": "ocean",
  "TN da duyet": "teal",
  "TN tu choi": "coral",
  "Da huy": "gray",
};

const PXK_TRANG_THAI_TONE: Record<string, BadgeTone> = {
  "KT xac nhan": "ocean",
  "Kho xac nhan": "amber",
  "Dang gui": "amber",
  "KTV da nhan": "teal",
  "KT huy": "gray",
};

const TRA_HANG_TRANG_THAI_TONE: Record<string, BadgeTone> = {
  "Cho ke toan duyet mem": "amber",
  "Cho kho xac nhan": "amber",
  "Cho QC xac nhan": "ocean",
  "Cho TN duyet tong": "ocean",
  "Da hoan thanh": "teal",
  "Tu choi": "coral",
  "Da huy": "gray",
};

const THIEU_LK_TRANG_THAI_TONE: Record<string, BadgeTone> = {
  "Cho kho xu ly": "amber",
  "Kho da tiep nhan": "ocean",
  "Kho xac nhan hang da ve": "teal",
  "Kho tu choi sai TT": "coral",
  "Da huy bo": "gray",
  "Da ket thuc": "teal",
};

function StatusBadge({ value, tones }: { value: string; tones: Record<string, BadgeTone> }) {
  return <Badge tone={tones[value] ?? "gray"}>{value}</Badge>;
}

export function DatMuaLinhKienModule({ forceView }: { forceView?: string } = {}) {
  const auth = useAuth();
  const user = auth.status === "authenticated" ? auth.user : null;
  const addToast = useToast();
  const qc = useQueryClient();

  const canCreatePhieuDat = !!(user?.la_ktv_dvbh || user?.la_ve_tinh);
  const canTacNghiep = user?.vai_tro === "TBP DVBH" || user?.vai_tro === "Admin";
  const canKho = !!user?.la_kho || user?.vai_tro === "Admin";
  const canKeToan = !!user?.la_ke_toan || user?.vai_tro === "Admin";
  const canQC = user?.vai_tro === "QC" || user?.vai_tro === "Admin";

  const tabs = [
    ...(canCreatePhieuDat ? [{ key: "tao-don", label: "Tạo phiếu đặt" }] : []),
    { key: "don-cua-toi", label: "Đơn của tôi / Danh sách" },
    ...(canTacNghiep ? [{ key: "phieu-so-tien", label: "Phiếu số tiền" }] : []),
    ...(canTacNghiep || canKho ? [{ key: "phieu-xuat-kho", label: "Phiếu xuất kho" }] : []),
    { key: "thieu-lk", label: "Thiếu linh kiện" },
    ...(canTacNghiep || canKho || canKeToan || canQC ? [{ key: "tra-hang", label: "Đơn trả hàng" }] : []),
  ];
  const [view, setView] = useLocalStorageState("filters:dat-mua-lk-view", tabs[0]?.key ?? "don-cua-toi");
  const activeView = forceView && tabs.some((t) => t.key === forceView) ? forceView : tabs.some((t) => t.key === view) ? view : tabs[0]?.key ?? "don-cua-toi";

  return (
    <div className="anim-in">
      <Tabs active={activeView} onChange={setView} tabs={tabs} />
      {activeView === "tao-don" && <TaoDonTab addToast={addToast} qc={qc} canQuanLy={canTacNghiep || user?.vai_tro === "Giam sat"} />}
      {activeView === "don-cua-toi" && (
        <DonCuaToiTab user={user} addToast={addToast} qc={qc} canTacNghiep={canTacNghiep} canBulkTram={canCreatePhieuDat && !user?.tram_cha} />
      )}
      {activeView === "phieu-so-tien" && <PhieuSoTienTab addToast={addToast} qc={qc} canTacNghiep={canTacNghiep} />}
      {activeView === "phieu-xuat-kho" && <PhieuXuatKhoTab addToast={addToast} qc={qc} canTacNghiep={canTacNghiep} canKho={canKho} />}
      {activeView === "thieu-lk" && <ThieuLkTab addToast={addToast} qc={qc} canKho={canKho} canKeToan={canKeToan} />}
      {activeView === "tra-hang" && <TraHangTab addToast={addToast} qc={qc} canKeToan={canKeToan} canKho={canKho} canQC={canQC} canTacNghiep={canTacNghiep} />}
    </div>
  );
}

// ---------- Tab "Tao don" ----------

interface DonHangDraft {
  ma_lk: string;
  loai_don: "mua" | "cong_no" | "tra_hang";
  loai_de_xuat: string;
  so_luong_de_xuat: number;
  ly_do_cham: string;
  so_tien_cong_no: string;
}

function emptyDraft(): DonHangDraft {
  return { ma_lk: "", loai_don: "mua", loai_de_xuat: "", so_luong_de_xuat: 1, ly_do_cham: "", so_tien_cong_no: "" };
}

// Goi y ma LK cung nhom thay the - buoc 2 ke hoach "Luong tao don mua hang", ap dung cho MOI nguoi
// dung (khong rieng Kho/TN). GS/TN co them nut "Them vao nhom thay the" de bo sung nhanh tai day.
function ThayTheGoiY({ maLk, canQuanLy, addToast }: { maLk: string; canQuanLy: boolean; addToast: (msg: string) => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["lk-thay-the", maLk],
    queryFn: () => api.get<{ rows: LkDanhMucRow[] }>(`/lk-settings/thay-the/${encodeURIComponent(maLk)}`),
  });
  const { data: nhomData } = useQuery({
    queryKey: ["lk-nhom-thay-the"],
    queryFn: () => api.get<{ rows: { id: number; ten_nhom: string; ma_lk_list: string[] }[] }>("/lk-settings/nhom-thay-the"),
    enabled: canQuanLy,
  });

  const themVaoNhom = useMutation({
    mutationFn: (nhomId: number) => {
      const nhom = nhomData?.rows.find((n) => n.id === nhomId);
      const maLkList = Array.from(new Set([...(nhom?.ma_lk_list ?? []), maLk]));
      return api.patch(`/lk-settings/nhom-thay-the/${nhomId}`, { ma_lk_list: maLkList });
    },
    onSuccess: () => {
      addToast(`Đã thêm ${maLk} vào nhóm thay thế`);
      qc.invalidateQueries({ queryKey: ["lk-nhom-thay-the"] });
      qc.invalidateQueries({ queryKey: ["lk-thay-the", maLk] });
    },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });

  const rows = data?.rows ?? [];

  return (
    <div className="col-span-2 sm:col-span-6 -mt-1 text-xs flex items-center gap-2 flex-wrap">
      {rows.length > 0 && (
        <span className="text-[var(--ink-500)]">
          Có thể thay thế bằng: {rows.map((r) => `${r.ma_linh_kien} - ${r.ten_linh_kien}`).join(", ")}
        </span>
      )}
      {canQuanLy && (nhomData?.rows.length ?? 0) > 0 && (
        <Select
          value=""
          onChange={(v) => v && themVaoNhom.mutate(Number(v))}
          options={[
            { value: "", label: "+ Thêm vào nhóm thay thế" },
            ...(nhomData?.rows ?? []).map((n) => ({ value: String(n.id), label: n.ten_nhom })),
          ]}
        />
      )}
    </div>
  );
}

function TaoDonTab({ addToast, qc, canQuanLy }: { addToast: (msg: string) => void; qc: ReturnType<typeof useQueryClient>; canQuanLy: boolean }) {
  const [danhMuc, setDanhMuc] = useState<LkDanhMucRow[]>([]);
  const syncedRef = useRef(false);

  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;

    (async () => {
      // 1. Hien thi ngay tu cache
      const cached = await getAllFromCache();
      if (cached.length > 0) {
        setDanhMuc(cached.filter((r) => r.bat_tat) as unknown as LkDanhMucRow[]);
      }

      // 2. Incremental sync: chi fetch nhung LK co ngay_cap_nhat > timestamp moi nhat trong cache
      const since = await getLastCacheTimestamp();
      const url = since ? `/lk-settings/danh-muc?since=${encodeURIComponent(since)}` : "/lk-settings/danh-muc";
      const { rows } = await api.get<{ rows: LkDanhMucRow[] }>(url);

      if (rows.length > 0) {
        await mergeLinhKienToCache(rows as unknown as import("../types").LinhKienRow[]);
        // Merge vao state hien tai
        setDanhMuc((prev) => {
          const map = new Map(prev.map((r) => [r.ma_linh_kien, r]));
          for (const r of rows) map.set(r.ma_linh_kien, r);
          return Array.from(map.values()).filter((r) => r.bat_tat);
        });
      }
    })();
  }, []);

  const [ghiChu, setGhiChu] = useState("");
  const [drafts, setDrafts] = useState<DonHangDraft[]>([emptyDraft()]);

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/dat-mua-lk/phieu-dat", {
        ghi_chu: ghiChu.trim() || undefined,
        don_hang: drafts.map((d) => ({
          ma_lk: d.ma_lk,
          loai_don: d.loai_don,
          loai_de_xuat: d.loai_de_xuat.trim() || undefined,
          so_luong_de_xuat: d.so_luong_de_xuat,
          ly_do_cham: d.ly_do_cham.trim() || undefined,
          so_tien_cong_no: d.loai_don === "cong_no" ? Number(d.so_tien_cong_no) || undefined : undefined,
        })),
      }),
    onSuccess: (res) => {
      addToast(`Đã tạo phiếu đặt ${res.id}`);
      setGhiChu("");
      setDrafts([emptyDraft()]);
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-phieu-dat"] });
    },
    onError: (err) => addToast("Không thể tạo phiếu: " + (err instanceof Error ? err.message : String(err))),
  });

  function updateDraft(idx: number, patch: Partial<DonHangDraft>) {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }

  const canSubmit = drafts.every((d) => d.ma_lk.trim() && d.so_luong_de_xuat > 0);

  return (
    <div className="mt-4 max-w-3xl">
      <Card className="p-4">
        <div className="font-display font-bold text-sm mb-3">Phiếu đặt mới</div>
        <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Ghi chú (tuỳ chọn)</label>
        <input
          value={ghiChu}
          onChange={(e) => setGhiChu(e.target.value)}
          className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mb-4"
        />

        <div className="space-y-3">
          {drafts.map((d, idx) => (
            <div key={idx} className="border border-[var(--line)] rounded-xl p-3 grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
              <div className="col-span-2 sm:col-span-2">
                <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Mã linh kiện</label>
                <Select
                  value={d.ma_lk}
                  onChange={(v) => updateDraft(idx, { ma_lk: v })}
                  options={[{ value: "", label: "-- Chọn --" }, ...danhMuc.map((m) => ({ value: m.ma_linh_kien, label: `${m.ma_linh_kien} - ${m.ten_linh_kien}` }))]}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Loại đơn</label>
                <Select
                  value={d.loai_don}
                  onChange={(v) => updateDraft(idx, { loai_don: v as DonHangDraft["loai_don"] })}
                  options={[
                    { value: "mua", label: "Mua" },
                    { value: "cong_no", label: "Công nợ" },
                    { value: "tra_hang", label: "Trả hàng" },
                  ]}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Số lượng</label>
                <input
                  type="number"
                  min={1}
                  value={d.so_luong_de_xuat}
                  onChange={(e) => updateDraft(idx, { so_luong_de_xuat: Number(e.target.value) })}
                  className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                />
              </div>
              {d.loai_don === "cong_no" && (
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Số tiền công nợ</label>
                  <input
                    type="number"
                    value={d.so_tien_cong_no}
                    onChange={(e) => updateDraft(idx, { so_tien_cong_no: e.target.value })}
                    className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                  />
                </div>
              )}
              <div className="col-span-2 sm:col-span-1 flex justify-end">
                <Btn variant="danger" size="sm" onClick={() => setDrafts((prev) => prev.filter((_, i) => i !== idx))} disabled={drafts.length === 1}>
                  Xóa dòng
                </Btn>
              </div>
              {d.ma_lk.trim() && <ThayTheGoiY maLk={d.ma_lk.trim()} canQuanLy={canQuanLy} addToast={addToast} />}
              <div className="col-span-2 sm:col-span-6">
                <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Lý do đặt (tuỳ chọn)</label>
                <input
                  value={d.ly_do_cham}
                  onChange={(e) => updateDraft(idx, { ly_do_cham: e.target.value })}
                  className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mt-4">
          <Btn variant="ghost" size="sm" onClick={() => setDrafts((prev) => [...prev, emptyDraft()])}>
            + Thêm dòng
          </Btn>
          <Btn onClick={() => create.mutate()} disabled={!canSubmit || create.isPending}>
            {create.isPending ? "Đang tạo..." : "Tạo phiếu đặt"}
          </Btn>
        </div>
      </Card>
    </div>
  );
}

// ---------- Modal chi tiet phieu dat ----------

function PhieuDatDetailModal({
  id,
  onClose,
  addToast,
  qc,
  canTacNghiep,
  currentEmail,
}: {
  id: string;
  onClose: () => void;
  addToast: (msg: string) => void;
  qc: ReturnType<typeof useQueryClient>;
  canTacNghiep: boolean;
  currentEmail: string;
}) {
  const [ghiChu, setGhiChu] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["dat-mua-lk-phieu-dat-detail", id],
    queryFn: () => api.get<{ phieuDat: PhieuDatRow; donHang: DonHangRow[]; logs: PhieuDatLogRow[] }>(`/dat-mua-lk/phieu-dat/${id}`),
  });

  const logMutation = useMutation({
    mutationFn: (hanh_dong: string) =>
      api.post(`/dat-mua-lk/phieu-dat/${id}/log`, { hanh_dong, ghi_chu: ghiChu.trim() || undefined }),
    onSuccess: () => {
      setGhiChu("");
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-phieu-dat-detail", id] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-phieu-dat"] });
      addToast("Đã cập nhật trạng thái phiếu");
    },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });

  const pd = data?.phieuDat;
  const trangThai = pd?.trang_thai ?? "";
  const canDuyet = canTacNghiep && (trangThai === "Cho TN duyet");
  const canHuy = (currentEmail === pd?.nguoi_tao || canTacNghiep) && !["TN da duyet", "Da huy"].includes(trangThai);

  return (
    <Modal open title={`Phiếu đặt ${id}`} onClose={onClose}>
      {isLoading ? (
        <div className="text-sm text-[var(--ink-500)] py-4 text-center">Đang tải...</div>
      ) : !data ? null : (
        <div className="space-y-4 text-sm">
          <div className="flex gap-4 items-center flex-wrap">
            <span>Người tạo: <strong>{pd?.nguoi_tao}</strong></span>
            <span>{fmtDateTime(pd?.ngay_tao ?? "")}</span>
            <StatusBadge value={trangThai} tones={PHIEU_DAT_TRANG_THAI_TONE} />
          </div>
          {pd?.ghi_chu && <div className="text-[var(--ink-500)]">{pd.ghi_chu}</div>}

          <div>
            <div className="font-semibold mb-1">Dòng đơn hàng</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[var(--surface-2)]">
                    <th className="px-2 py-1 text-left border border-[var(--line)]">Mã</th>
                    <th className="px-2 py-1 text-left border border-[var(--line)]">Tên LK</th>
                    <th className="px-2 py-1 text-left border border-[var(--line)]">Loại</th>
                    <th className="px-2 py-1 text-right border border-[var(--line)]">SL đề xuất</th>
                    <th className="px-2 py-1 text-right border border-[var(--line)]">Giá đề xuất</th>
                    <th className="px-2 py-1 text-right border border-[var(--line)]">Giá chốt</th>
                    <th className="px-2 py-1 text-left border border-[var(--line)]">Mã xuất kho</th>
                  </tr>
                </thead>
                <tbody>
                  {data.donHang.map((d) => (
                    <tr key={d.id} className="hover:bg-[var(--surface-2)]">
                      <td className="px-2 py-1 border border-[var(--line)] font-mono">{d.ma_lk}</td>
                      <td className="px-2 py-1 border border-[var(--line)]">{d.ten_lk_snapshot ?? d.ma_lk}</td>
                      <td className="px-2 py-1 border border-[var(--line)]">{d.loai_don}</td>
                      <td className="px-2 py-1 border border-[var(--line)] text-right">{d.so_luong_de_xuat}</td>
                      <td className="px-2 py-1 border border-[var(--line)] text-right">{d.gia_de_xuat != null ? fmtVND(d.gia_de_xuat) : "—"}</td>
                      <td className="px-2 py-1 border border-[var(--line)] text-right">{d.gia_chot != null ? fmtVND(d.gia_chot) : "—"}</td>
                      <td className="px-2 py-1 border border-[var(--line)]">{d.ma_xuat_kho ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="font-semibold mb-1">Lịch sử</div>
            <div className="space-y-1">
              {data.logs.map((l) => (
                <div key={l.id} className="text-xs text-[var(--ink-600)]">
                  <span className="font-medium">{l.trang_thai}</span> — {l.nguoi_xu_ly} lúc {fmtDateTime(l.ngay_xu_ly)}
                  {l.ghi_chu && <span className="ml-1 text-[var(--ink-400)]">({l.ghi_chu})</span>}
                </div>
              ))}
            </div>
          </div>

          {(canDuyet || canHuy) && (
            <div className="border-t border-[var(--line)] pt-3 space-y-2">
              <input
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                placeholder="Ghi chú (tuỳ chọn)"
                className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
              <div className="flex gap-2 flex-wrap">
                {canDuyet && (
                  <>
                    <Btn size="sm" onClick={() => logMutation.mutate("duyet")} disabled={logMutation.isPending}>Duyệt</Btn>
                    <Btn size="sm" variant="danger" onClick={() => logMutation.mutate("tu_choi")} disabled={logMutation.isPending}>Từ chối</Btn>
                  </>
                )}
                {canHuy && (
                  <Btn size="sm" variant="ghost" onClick={() => logMutation.mutate("huy")} disabled={logMutation.isPending}>Hủy phiếu</Btn>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ---------- Tab "Don cua toi / Danh sach" ----------

function DonCuaToiTab({
  user,
  addToast,
  qc,
  canTacNghiep,
  canBulkTram,
}: {
  user: { email: string; vai_tro: string | null } | null;
  addToast: (msg: string) => void;
  qc: ReturnType<typeof useQueryClient>;
  canTacNghiep: boolean;
  canBulkTram: boolean;
}) {
  const [filterTrangThai, setFilterTrangThai] = useLocalStorageState("filters:dmlk-trang-thai", "");
  const [filterNguoiTao, setFilterNguoiTao] = useState("");
  const [filterTuNgay, setFilterTuNgay] = useState("");
  const [filterDenNgay, setFilterDenNgay] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dat-mua-lk-phieu-dat", filterTrangThai, filterNguoiTao, filterTuNgay, filterDenNgay],
    queryFn: () =>
      api.get<{ rows: PhieuDatRow[] }>(
        "/dat-mua-lk/phieu-dat" +
          buildQuery({
            trang_thai: filterTrangThai || undefined,
            nguoi_tao: filterNguoiTao || undefined,
            tu_ngay: filterTuNgay || undefined,
            den_ngay: filterDenNgay || undefined,
          }),
      ),
  });

  const { data: veTinhData } = useQuery({
    queryKey: ["dat-mua-lk-ve-tinh-cua-toi"],
    queryFn: () => api.get<{ rows: { email: string; ten: string | null }[] }>("/dat-mua-lk/ve-tinh-cua-toi"),
    enabled: canBulkTram,
  });

  const bulkMutation = useMutation({
    mutationFn: (hanh_dong: "duyet" | "tu_choi") => api.post("/dat-mua-lk/phieu-dat/bulk-log", { ids: [...selected], hanh_dong }),
    onSuccess: () => {
      setSelected(new Set());
      addToast("Đã xử lý hàng loạt");
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-phieu-dat"] });
    },
  });

  const rowsCoTheChon = (data?.rows ?? []).filter((r) => r.trang_thai === "Cho Ve tinh duyet");

  function toggleSelectAll() {
    setSelected((s) => (s.size === rowsCoTheChon.length ? new Set() : new Set(rowsCoTheChon.map((r) => r.id))));
  }
  function toggleSelectOne(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const cols: Column<PhieuDatRow>[] = [
    ...(canBulkTram
      ? [
          {
            key: "chon",
            header: <input type="checkbox" checked={rowsCoTheChon.length > 0 && selected.size === rowsCoTheChon.length} onChange={toggleSelectAll} />,
            render: (r: PhieuDatRow) =>
              r.trang_thai === "Cho Ve tinh duyet" ? <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelectOne(r.id)} /> : null,
          } as Column<PhieuDatRow>,
        ]
      : []),
    { key: "id", header: "Mã phiếu", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "nguoi_tao", header: "Người tạo", render: (r) => r.nguoi_tao },
    { key: "ngay_tao", header: "Ngày tạo", render: (r) => fmtDateTime(r.ngay_tao) },
    { key: "so_dong", header: "Số dòng", render: (r) => r.so_dong },
    { key: "trang_thai", header: "Trạng thái", render: (r) => <StatusBadge value={r.trang_thai} tones={PHIEU_DAT_TRANG_THAI_TONE} /> },
    { key: "actions", header: "", render: (r) => <Btn size="sm" variant="ghost" onClick={() => setDetailId(r.id)}>Chi tiết</Btn> },
  ];

  return (
    <div className="mt-4">
      <div className="flex gap-2 mb-3 flex-wrap">
        <Select
          value={filterTrangThai}
          onChange={setFilterTrangThai}
          options={[
            { value: "", label: "Tất cả trạng thái" },
            { value: "Cho Ve tinh duyet", label: "Chờ Vệ tinh duyệt" },
            { value: "Cho TN duyet", label: "Chờ TN duyệt" },
            { value: "TN da duyet", label: "TN đã duyệt" },
            { value: "TN tu choi", label: "TN từ chối" },
            { value: "Da huy", label: "Đã hủy" },
          ]}
        />
        {canBulkTram && (
          <>
            <Select
              value={filterNguoiTao}
              onChange={setFilterNguoiTao}
              options={[
                { value: "", label: "Tất cả người tạo" },
                ...(veTinhData?.rows ?? []).map((v) => ({ value: v.email, label: v.ten || v.email })),
              ]}
            />
            <input
              type="date"
              value={filterTuNgay}
              onChange={(e) => setFilterTuNgay(e.target.value)}
              className="focus-ring bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
            <input
              type="date"
              value={filterDenNgay}
              onChange={(e) => setFilterDenNgay(e.target.value)}
              className="focus-ring bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </>
        )}
      </div>
      {canBulkTram && selected.size > 0 && (
        <div className="flex items-center gap-2 mb-3 bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-3 py-2">
          <span className="text-sm">Đã chọn {selected.size} phiếu</span>
          <Btn size="sm" onClick={() => bulkMutation.mutate("duyet")} disabled={bulkMutation.isPending}>Duyệt tất cả</Btn>
          <Btn size="sm" variant="danger" onClick={() => bulkMutation.mutate("tu_choi")} disabled={bulkMutation.isPending}>Từ chối tất cả</Btn>
        </div>
      )}
      <PaginatedTable columns={cols} rows={(data?.rows ?? []).slice((page - 1) * 20, page * 20)} isLoading={isLoading} isError={isError} page={page} pageSize={20} total={data?.rows.length ?? 0} onPageChange={setPage} rowKey={(r) => r.id} />
      {detailId && (
        <PhieuDatDetailModal
          id={detailId}
          onClose={() => setDetailId(null)}
          addToast={addToast}
          qc={qc}
          canTacNghiep={canTacNghiep}
          currentEmail={user?.email ?? ""}
        />
      )}
    </div>
  );
}

// ---------- Tab "Phieu so tien" (TN) ----------

function PhieuSoTienTab({
  addToast,
  qc,
  canTacNghiep,
}: {
  addToast: (msg: string) => void;
  qc: ReturnType<typeof useQueryClient>;
  canTacNghiep: boolean;
}) {
  const [filterTrangThai, setFilterTrangThai] = useLocalStorageState("filters:dmlk-pst-tt", "");
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<{ trang_thai: string; bang_chung_url: string }>>({});
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dat-mua-lk-pst", filterTrangThai],
    queryFn: () => api.get<{ rows: PhieuSoTienRow[] }>("/dat-mua-lk/phieu-so-tien" + buildQuery({ trang_thai: filterTrangThai || undefined })),
  });

  const patchMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/dat-mua-lk/phieu-so-tien/${id}`, editData),
    onSuccess: () => {
      setEditId(null);
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-pst"] });
      addToast("Đã cập nhật phiếu số tiền");
    },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });

  const PST_TONE: Record<string, BadgeTone> = {
    "Cho KTV chuyen": "amber",
    "KTV da chuyen": "ocean",
    "TN da duyet": "teal",
    "TN tu choi": "coral",
    "Da huy": "gray",
  };

  const cols: Column<PhieuSoTienRow>[] = [
    { key: "id", header: "Mã PST", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "phieu_dat_id", header: "Phiếu đặt", render: (r) => <span className="font-mono text-xs">{r.phieu_dat_id}</span> },
    { key: "so_tien", header: "Số tiền", render: (r) => fmtVND(r.so_tien) },
    { key: "trang_thai", header: "Trạng thái", render: (r) => <StatusBadge value={r.trang_thai} tones={PST_TONE} /> },
    {
      key: "bang_chung_url", header: "Bằng chứng",
      render: (r) => r.bang_chung_url ? <a href={r.bang_chung_url} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline text-xs">Xem</a> : "—",
    },
    { key: "ngay_ktv_chuyen", header: "Ngày KTV chuyển", render: (r) => r.ngay_ktv_chuyen ? fmtDateTime(r.ngay_ktv_chuyen) : "—" },
    {
      key: "actions", header: "",
      render: (r) => (
        <Btn size="sm" variant="ghost" onClick={() => { setEditId(r.id); setEditData({ trang_thai: r.trang_thai, bang_chung_url: r.bang_chung_url ?? "" }); }}>
          Sửa
        </Btn>
      ),
    },
  ];

  return (
    <div className="mt-4">
      <div className="flex gap-2 mb-3">
        <Select
          value={filterTrangThai}
          onChange={setFilterTrangThai}
          options={[
            { value: "", label: "Tất cả" },
            { value: "Cho KTV chuyen", label: "Chờ KTV chuyển" },
            { value: "KTV da chuyen", label: "KTV đã chuyển" },
            { value: "TN da duyet", label: "TN đã duyệt" },
            { value: "TN tu choi", label: "TN từ chối" },
          ]}
        />
      </div>
      <PaginatedTable columns={cols} rows={(data?.rows ?? []).slice((page - 1) * 20, page * 20)} isLoading={isLoading} isError={isError} page={page} pageSize={20} total={data?.rows.length ?? 0} onPageChange={setPage} rowKey={(r) => r.id} />
      {editId && (
        <Modal open title={`Cập nhật phiếu số tiền ${editId}`} onClose={() => setEditId(null)}>
          <div className="space-y-3 text-sm">
            <div>
              <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Trạng thái</label>
              <Select
                value={editData.trang_thai ?? ""}
                onChange={(v) => setEditData((p) => ({ ...p, trang_thai: v }))}
                options={[
                  { value: "Cho KTV chuyen", label: "Chờ KTV chuyển" },
                  { value: "KTV da chuyen", label: "KTV đã chuyển" },
                  ...(canTacNghiep ? [{ value: "TN da duyet", label: "TN đã duyệt" }, { value: "TN tu choi", label: "TN từ chối" }] : []),
                  { value: "Da huy", label: "Đã hủy" },
                ]}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">URL bằng chứng</label>
              <input
                value={editData.bang_chung_url ?? ""}
                onChange={(e) => setEditData((p) => ({ ...p, bang_chung_url: e.target.value }))}
                className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="sm" onClick={() => setEditId(null)}>Hủy</Btn>
              <Btn size="sm" onClick={() => patchMutation.mutate(editId)} disabled={patchMutation.isPending}>Lưu</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------- Tab "Phieu xuat kho" (TN/Kho) ----------

function PhieuXuatKhoTab({
  addToast, qc, canTacNghiep, canKho,
}: {
  addToast: (msg: string) => void; qc: ReturnType<typeof useQueryClient>;
  canTacNghiep: boolean; canKho: boolean;
}) {
  const [filterTrangThai, setFilterTrangThai] = useLocalStorageState("filters:dmlk-pxk-tt", "");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createData, setCreateData] = useState({ ma_xuat_kho: "", ghi_chu: "", don_hang_ids_raw: "" });
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dat-mua-lk-pxk", filterTrangThai],
    queryFn: () => api.get<{ rows: PhieuXuatKhoRow[] }>("/phieu-xuat-kho" + buildQuery({ trang_thai: filterTrangThai || undefined })),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const ids = createData.don_hang_ids_raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
      return api.post<{ id: string }>("/phieu-xuat-kho", {
        ma_xuat_kho: createData.ma_xuat_kho.trim(),
        ghi_chu: createData.ghi_chu.trim() || undefined,
        dat_don_hang_ids: ids,
      });
    },
    onSuccess: (res) => {
      addToast(`Đã tạo phiếu xuất kho ${res.id}`);
      setShowCreate(false);
      setCreateData({ ma_xuat_kho: "", ghi_chu: "", don_hang_ids_raw: "" });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk"] });
    },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });

  const cols: Column<PhieuXuatKhoRow>[] = [
    { key: "id", header: "Mã PXK", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "ma_xuat_kho", header: "Mã xuất kho", render: (r) => r.ma_xuat_kho },
    { key: "nguoi_tao", header: "Người tạo", render: (r) => r.nguoi_tao },
    { key: "ngay_tao", header: "Ngày tạo", render: (r) => fmtDateTime(r.ngay_tao) },
    { key: "so_dong", header: "Số dòng", render: (r) => r.so_dong },
    { key: "trang_thai", header: "Trạng thái", render: (r) => <StatusBadge value={r.trang_thai} tones={PXK_TRANG_THAI_TONE} /> },
    { key: "actions", header: "", render: (r) => <Btn size="sm" variant="ghost" onClick={() => setDetailId(r.id)}>Chi tiết</Btn> },
  ];

  return (
    <div className="mt-4">
      <div className="flex gap-2 mb-3 flex-wrap justify-between">
        <Select
          value={filterTrangThai}
          onChange={setFilterTrangThai}
          options={[
            { value: "", label: "Tất cả" },
            { value: "KT xac nhan", label: "KT xác nhận" },
            { value: "Kho xac nhan", label: "Kho xác nhận" },
            { value: "Dang gui", label: "Đang gửi" },
            { value: "KTV da nhan", label: "KTV đã nhận" },
            { value: "KT huy", label: "KT hủy" },
          ]}
        />
        {canTacNghiep && <Btn size="sm" onClick={() => setShowCreate(true)}>+ Tạo phiếu xuất kho</Btn>}
      </div>
      <PaginatedTable columns={cols} rows={(data?.rows ?? []).slice((page - 1) * 20, page * 20)} isLoading={isLoading} isError={isError} page={page} pageSize={20} total={data?.rows.length ?? 0} onPageChange={setPage} rowKey={(r) => r.id} />
      {showCreate && (
        <Modal open title="Tạo phiếu xuất kho" onClose={() => setShowCreate(false)}>
          <div className="space-y-3 text-sm">
            <div>
              <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Mã xuất kho *</label>
              <input
                value={createData.ma_xuat_kho}
                onChange={(e) => setCreateData((p) => ({ ...p, ma_xuat_kho: e.target.value }))}
                className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Mã đơn hàng (cách nhau bởi dấu phẩy hoặc xuống dòng) *</label>
              <textarea
                rows={3}
                value={createData.don_hang_ids_raw}
                onChange={(e) => setCreateData((p) => ({ ...p, don_hang_ids_raw: e.target.value }))}
                placeholder="DDH-001, DDH-002, ..."
                className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Ghi chú</label>
              <input
                value={createData.ghi_chu}
                onChange={(e) => setCreateData((p) => ({ ...p, ghi_chu: e.target.value }))}
                className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Hủy</Btn>
              <Btn size="sm" onClick={() => createMutation.mutate()} disabled={!createData.ma_xuat_kho.trim() || !createData.don_hang_ids_raw.trim() || createMutation.isPending}>Tạo</Btn>
            </div>
          </div>
        </Modal>
      )}
      {detailId && (
        <PxkDetailModal id={detailId} onClose={() => setDetailId(null)} addToast={addToast} qc={qc} canTacNghiep={canTacNghiep} canKho={canKho} />
      )}
    </div>
  );
}

function PxkDetailModal({
  id, onClose, addToast, qc, canTacNghiep, canKho,
}: {
  id: string; onClose: () => void; addToast: (msg: string) => void;
  qc: ReturnType<typeof useQueryClient>; canTacNghiep: boolean; canKho: boolean;
}) {
  const [ghiChu, setGhiChu] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["pxk-detail", id],
    queryFn: () =>
      api.get<{
        phieuXuatKho: PhieuXuatKhoRow & { trang_thai: string };
        donHang: DonHangRow[];
        logs: Array<{ id: number; trang_thai: string; nguoi_xu_ly: string; ngay_xu_ly: string; ghi_chu: string | null }>;
      }>(`/phieu-xuat-kho/${id}`),
  });

  const logMutation = useMutation({
    mutationFn: (trang_thai: string) =>
      api.post(`/phieu-xuat-kho/${id}/log`, { trang_thai, ghi_chu: ghiChu.trim() || undefined }),
    onSuccess: () => {
      setGhiChu("");
      qc.invalidateQueries({ queryKey: ["pxk-detail", id] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk"] });
      addToast("Đã cập nhật trạng thái");
    },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });

  const trangThai = data?.phieuXuatKho?.trang_thai ?? "";
  const isDong = ["KTV da nhan", "KT huy"].includes(trangThai);

  return (
    <Modal open title={`Phiếu xuất kho ${id}`} onClose={onClose}>
      {isLoading ? (
        <div className="text-sm text-[var(--ink-500)] py-4 text-center">Đang tải...</div>
      ) : !data ? null : (
        <div className="space-y-4 text-sm">
          <div className="flex gap-3 items-center flex-wrap">
            <span className="font-mono font-bold">{data.phieuXuatKho.ma_xuat_kho}</span>
            <StatusBadge value={trangThai} tones={PXK_TRANG_THAI_TONE} />
            <span className="text-[var(--ink-500)] text-xs">{fmtDateTime(data.phieuXuatKho.ngay_tao)}</span>
          </div>
          <div className="text-xs space-y-0.5">
            {data.logs.map((l) => (
              <div key={l.id} className="text-[var(--ink-600)]">
                <span className="font-medium">{l.trang_thai}</span> — {l.nguoi_xu_ly} {fmtDateTime(l.ngay_xu_ly)}
                {l.ghi_chu && <span className="ml-1 text-[var(--ink-400)]">({l.ghi_chu})</span>}
              </div>
            ))}
          </div>
          {!isDong && (
            <div className="border-t border-[var(--line)] pt-3 space-y-2">
              <input
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                placeholder="Ghi chú (tuỳ chọn)"
                className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
              <div className="flex gap-2 flex-wrap">
                {canKho && trangThai === "KT xac nhan" && (
                  <Btn size="sm" onClick={() => logMutation.mutate("Kho xac nhan")} disabled={logMutation.isPending}>Kho xác nhận</Btn>
                )}
                {canKho && trangThai === "Kho xac nhan" && (
                  <Btn size="sm" onClick={() => logMutation.mutate("Dang gui")} disabled={logMutation.isPending}>Đang gửi</Btn>
                )}
                {trangThai === "Dang gui" && (
                  <Btn size="sm" onClick={() => logMutation.mutate("KTV da nhan")} disabled={logMutation.isPending}>KTV đã nhận</Btn>
                )}
                {canTacNghiep && (
                  <Btn size="sm" variant="danger" onClick={() => logMutation.mutate("KT huy")} disabled={logMutation.isPending}>KT hủy</Btn>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ---------- Tab "Thieu linh kien" ----------

function ThieuLkTab({
  addToast, qc, canKho, canKeToan,
}: {
  addToast: (msg: string) => void; qc: ReturnType<typeof useQueryClient>; canKho: boolean; canKeToan: boolean;
}) {
  const [filterTrangThai, setFilterTrangThai] = useLocalStorageState("filters:dmlk-tlk-tt", "");
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionTrangThai, setActionTrangThai] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dat-mua-lk-thieu-lk", filterTrangThai],
    queryFn: () => api.get<{ rows: ThieuLkRow[] }>("/dat-mua-lk/thieu-lk" + buildQuery({ trang_thai: filterTrangThai || undefined })),
  });

  const logMutation = useMutation({
    mutationFn: () => api.post(`/dat-mua-lk/thieu-lk/${actionId}/log`, { trang_thai: actionTrangThai, ghi_chu: ghiChu.trim() || undefined }),
    onSuccess: () => {
      setActionId(null);
      setGhiChu("");
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-thieu-lk"] });
      addToast("Đã cập nhật trạng thái thiếu LK");
    },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });

  const NEXT_STATES = (trangThai: string): string[] => {
    if (trangThai === "Cho kho xu ly") return ["Kho da tiep nhan", "Kho tu choi sai TT"];
    if (trangThai === "Kho da tiep nhan") return ["Kho xac nhan hang da ve", "Da huy bo"];
    if (trangThai === "Kho xac nhan hang da ve") return ["Da ket thuc"];
    return [];
  };

  const cols: Column<ThieuLkRow>[] = [
    { key: "id", header: "Mã TLK", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "dat_don_hang_id", header: "Đơn hàng", render: (r) => <span className="font-mono text-xs">{r.dat_don_hang_id}</span> },
    { key: "nguoi_tao", header: "Người báo", render: (r) => r.nguoi_tao },
    { key: "ngay_tao", header: "Ngày báo", render: (r) => fmtDateTime(r.ngay_tao) },
    { key: "ly_do", header: "Lý do", render: (r) => r.ly_do ?? "—" },
    { key: "trang_thai", header: "Trạng thái", render: (r) => <StatusBadge value={r.trang_thai} tones={THIEU_LK_TRANG_THAI_TONE} /> },
    {
      key: "actions", header: "",
      render: (r) => {
        const nexts = NEXT_STATES(r.trang_thai);
        if (!canKho || nexts.length === 0) return null;
        return (
          <div className="flex gap-1">
            {nexts.map((s) => (
              <Btn key={s} size="sm" variant="ghost" onClick={() => { setActionId(r.id); setActionTrangThai(s); setGhiChu(""); }}>
                {s}
              </Btn>
            ))}
          </div>
        );
      },
    },
  ];

  return (
    <div className="mt-4">
      <div className="flex gap-2 mb-3">
        <Select
          value={filterTrangThai}
          onChange={setFilterTrangThai}
          options={[
            { value: "", label: "Tất cả" },
            { value: "Cho kho xu ly", label: "Chờ kho xử lý" },
            { value: "Kho da tiep nhan", label: "Kho đã tiếp nhận" },
            { value: "Kho xac nhan hang da ve", label: "Hàng đã về" },
            { value: "Da ket thuc", label: "Đã kết thúc" },
          ]}
        />
      </div>
      <PaginatedTable columns={cols} rows={(data?.rows ?? []).slice((page - 1) * 20, page * 20)} isLoading={isLoading} isError={isError} page={page} pageSize={20} total={data?.rows.length ?? 0} onPageChange={setPage} rowKey={(r) => r.id} />
      {actionId && (
        <Modal open title={`Chuyển sang: ${actionTrangThai}`} onClose={() => setActionId(null)}>
          <div className="space-y-3 text-sm">
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder="Ghi chú (tuỳ chọn)"
              className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="sm" onClick={() => setActionId(null)}>Hủy</Btn>
              <Btn size="sm" onClick={() => logMutation.mutate()} disabled={logMutation.isPending}>Xác nhận</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------- Tab "Don tra hang" (tach hoan toan khoi mua/cong no - buoc 3 ke hoach) ----------

function TraHangTab({
  addToast, qc, canKeToan, canKho, canQC, canTacNghiep,
}: {
  addToast: (msg: string) => void; qc: ReturnType<typeof useQueryClient>;
  canKeToan: boolean; canKho: boolean; canQC: boolean; canTacNghiep: boolean;
}) {
  const [filterTrangThai, setFilterTrangThai] = useLocalStorageState("filters:dmlk-th-tt", "");
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionHanhDong, setActionHanhDong] = useState<"duyet" | "tu_choi" | "huy">("duyet");
  const [layLuiId, setLayLuiId] = useState<string | null>(null);
  const [ghiChu, setGhiChu] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["tra-hang", filterTrangThai],
    queryFn: () => api.get<{ rows: TraHangRow[] }>("/tra-hang" + buildQuery({ trang_thai: filterTrangThai || undefined })),
  });

  const logMutation = useMutation({
    mutationFn: () => api.post(`/tra-hang/${actionId}/log`, { hanh_dong: actionHanhDong, ghi_chu: ghiChu.trim() || undefined }),
    onSuccess: () => {
      setActionId(null);
      setGhiChu("");
      qc.invalidateQueries({ queryKey: ["tra-hang"] });
      addToast("Đã cập nhật trạng thái đơn trả hàng");
    },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });

  const layLuiMutation = useMutation({
    mutationFn: () => api.post(`/tra-hang/${layLuiId}/log-lui`, { ghi_chu: ghiChu.trim() }),
    onSuccess: () => {
      setLayLuiId(null);
      setGhiChu("");
      qc.invalidateQueries({ queryKey: ["tra-hang"] });
      addToast("Đã đẩy lùi 1 bước");
    },
    onError: (err) => addToast("Lỗi: " + (err instanceof Error ? err.message : String(err))),
  });

  function canXuLy(trangThai: string): boolean {
    if (trangThai === "Cho ke toan duyet mem") return canKeToan;
    if (trangThai === "Cho kho xac nhan") return canKho;
    if (trangThai === "Cho QC xac nhan") return canQC;
    if (trangThai === "Cho TN duyet tong") return canTacNghiep;
    return false;
  }

  const DA_DONG = ["Da hoan thanh", "Tu choi", "Da huy"];
  const CO_THE_DAY_LUI = ["Cho kho xac nhan", "Cho QC xac nhan", "Cho TN duyet tong"];

  const cols: Column<TraHangRow>[] = [
    { key: "id", header: "Mã đơn hàng", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "ma_lk", header: "Mã LK", render: (r) => r.ma_lk },
    { key: "ten_lk_snapshot", header: "Tên LK", render: (r) => r.ten_lk_snapshot ?? r.ma_lk },
    { key: "so_luong_de_xuat", header: "SL", render: (r) => r.so_luong_de_xuat },
    { key: "nguoi_tao", header: "Người tạo", render: (r) => r.nguoi_tao },
    { key: "ngay_tao", header: "Ngày tạo", render: (r) => fmtDateTime(r.ngay_tao) },
    { key: "trang_thai_tra_hang", header: "Trạng thái", render: (r) => <StatusBadge value={r.trang_thai_tra_hang} tones={TRA_HANG_TRANG_THAI_TONE} /> },
    {
      key: "actions", header: "",
      render: (r) => {
        if (DA_DONG.includes(r.trang_thai_tra_hang)) return null;
        return (
          <div className="flex gap-1">
            {canXuLy(r.trang_thai_tra_hang) && (
              <>
                <Btn size="sm" onClick={() => { setActionId(r.id); setActionHanhDong("duyet"); setGhiChu(""); }}>Duyệt</Btn>
                <Btn size="sm" variant="danger" onClick={() => { setActionId(r.id); setActionHanhDong("tu_choi"); setGhiChu(""); }}>Từ chối</Btn>
              </>
            )}
            {(canKeToan || canKho) && CO_THE_DAY_LUI.includes(r.trang_thai_tra_hang) && (
              <Btn size="sm" variant="ghost" onClick={() => { setLayLuiId(r.id); setGhiChu(""); }}>Đẩy lùi</Btn>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="mt-4">
      <div className="flex gap-2 mb-3">
        <Select
          value={filterTrangThai}
          onChange={setFilterTrangThai}
          options={[
            { value: "", label: "Tất cả" },
            { value: "Cho ke toan duyet mem", label: "Chờ kế toán duyệt mềm" },
            { value: "Cho kho xac nhan", label: "Chờ kho xác nhận" },
            { value: "Cho QC xac nhan", label: "Chờ QC xác nhận" },
            { value: "Cho TN duyet tong", label: "Chờ TN duyệt tổng" },
            { value: "Da hoan thanh", label: "Đã hoàn thành" },
            { value: "Tu choi", label: "Từ chối" },
            { value: "Da huy", label: "Đã huỷ" },
          ]}
        />
      </div>
      <PaginatedTable columns={cols} rows={(data?.rows ?? []).slice((page - 1) * 20, page * 20)} isLoading={isLoading} isError={isError} page={page} pageSize={20} total={data?.rows.length ?? 0} onPageChange={setPage} rowKey={(r) => r.id} />
      {actionId && (
        <Modal open title={actionHanhDong === "duyet" ? "Duyệt bước tiếp theo" : "Từ chối đơn trả hàng"} onClose={() => setActionId(null)}>
          <div className="space-y-3 text-sm">
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder="Ghi chú (tuỳ chọn)"
              className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="sm" onClick={() => setActionId(null)}>Hủy</Btn>
              <Btn size="sm" onClick={() => logMutation.mutate()} disabled={logMutation.isPending}>Xác nhận</Btn>
            </div>
          </div>
        </Modal>
      )}
      {layLuiId && (
        <Modal open title="Đẩy lùi 1 bước" onClose={() => setLayLuiId(null)}>
          <div className="space-y-3 text-sm">
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder="Lý do đẩy lùi (bắt buộc)"
              className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="sm" onClick={() => setLayLuiId(null)}>Hủy</Btn>
              <Btn size="sm" onClick={() => layLuiMutation.mutate()} disabled={layLuiMutation.isPending || !ghiChu.trim()}>Xác nhận</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
