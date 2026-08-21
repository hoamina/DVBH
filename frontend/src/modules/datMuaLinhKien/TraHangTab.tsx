import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { PaginatedTable, type Column } from "../../components/ui/PaginatedTable";
import { api, buildQuery, ApiError } from "../../api/client";
import { fmtDateTime } from "../../types";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import type { TraHangRow } from "./types";
import { TRA_HANG_TRANG_THAI_TONE, TRA_HANG_GIAI_DOAN_2, TRA_HANG_TRANG_THAI_OPTIONS, TRA_HANG_BULK_ERROR_MESSAGES } from "./constants";
import { describeApiError, formatNguoiDisplay, useKtvDisplayMap, invalidatePipelineCounts, trangThaiLabel } from "./helpers";
import { ActiveFiltersBar, TrangThaiChipFilter, BulkConfirmButton } from "./SharedUi";

// ---------- Tab "Don tra hang" (tach hoan toan khoi mua/cong no - buoc 3 ke hoach) ----------

export function TraHangTab({
  addToast, qc, canKeToan, canKho, canQC, canTacNghiep, initialFilterOverride,
}: {
  addToast: (msg: string) => void; qc: ReturnType<typeof useQueryClient>;
  canKeToan: boolean; canKho: boolean; canQC: boolean; canTacNghiep: boolean; initialFilterOverride?: string;
}) {
  // Uu tien QC > Ke toan > Kho > TN cho mac dinh (chi anh huong lan dau) - 1 nguoi hiem khi giu qua
  // 1 trong 4 flag nay cung luc (ngoai Admin, da tu roi tabs[0] khac o component cha).
  const [filterTrangThai, setFilterTrangThai] = useLocalStorageState(
    "filters:dmlk-th-tt",
    canQC ? "Cho QC xac nhan" : canKeToan ? "Cho ke toan duyet mem" : canKho ? "Cho kho xac nhan" : canTacNghiep ? "Cho TN duyet tong" : "",
  );
  useEffect(() => {
    if (initialFilterOverride !== undefined) setFilterTrangThai(initialFilterOverride);
  }, [initialFilterOverride]);
  const [layLuiId, setLayLuiId] = useState<string | null>(null);
  // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #13): "Tu choi" o dung 1 buoc CUOI CO TINH QUYET
  // DINH nhat ("Cho TN duyet tong") moi can mo modal nhap ly do bat buoc - 3 buoc KT/Kho/QC dau
  // chuoi van giu "bam thang" nhu cu (khong doi hanh vi cho da so truong hop).
  const [tuChoiTnId, setTuChoiTnId] = useState<string | null>(null);
  const [ghiChu, setGhiChu] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const ktvDisplayMap = useKtvDisplayMap();
  // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #21): loc theo "Nguoi tao", KHONG tai dung API
  // "ve-tinh-cua-toi" (phuc vu dung quan he Tram-Ve tinh, khong khop ngu canh Ke toan/Kho/QC/TN thuc
  // su dung man nay).
  const [filterNguoiTao, setFilterNguoiTao] = useState("");

  // GD4 (phan hoi Codex #16): ve trang 1 + xoa selection dang chon khi doi bo loc.
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [filterTrangThai, filterNguoiTao]);

  // GD4 (phan hoi Codex #17): phan trang server-side that su - truoc day tai TOAN BO dong khop
  // trang_thai roi loc/slice o client, "nguoi_tao" gio cung loc server-side (xem GET /tra-hang) de
  // total/trang khop dung sau khi loc, khong con lech nhu khi loc them 1 lop o client tren du lieu
  // da phan trang.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["tra-hang", filterTrangThai, filterNguoiTao, page],
    queryFn: () => api.get<{ rows: TraHangRow[]; total: number }>("/tra-hang" + buildQuery({ trang_thai: filterTrangThai || undefined, nguoi_tao: filterNguoiTao || undefined, page, pageSize: 20 })),
  });
  // Nguon rieng cho dropdown "Nguoi tao" - can danh sach KHONG bi gioi han boi trang hien tai cua
  // danh sach chinh, nen goi 1 truy van rong hon (pageSize lon) chi loc theo trang_thai, cung pattern
  // da dung o MissingPartsModule cho nhu cau tuong tu.
  const { data: nguoiTaoOptionsData } = useQuery({
    queryKey: ["tra-hang-nguoi-tao-options", filterTrangThai],
    queryFn: () => api.get<{ rows: TraHangRow[] }>("/tra-hang" + buildQuery({ trang_thai: filterTrangThai || undefined, page: 1, pageSize: 500 })),
  });
  const nguoiTaoOptions = [...new Set((nguoiTaoOptionsData?.rows ?? []).map((r) => r.nguoi_tao))];

  // Ban thang, khong qua modal (tieu chi UX #3, sua 2026-08-15) - "Duyet"/"Tu choi" khong bat buoc
  // nhap gi them nen khong can buoc "Xac nhan" phu. Modal chi con giu cho "Day lui" (ghiChu bat
  // buoc, xem layLuiMutation ben duoi).
  const logMutation = useMutation({
    mutationFn: (args: { id: string; hanhDong: "duyet" | "tu_choi" | "huy"; ghiChu?: string }) =>
      api.post(`/tra-hang/${args.id}/log`, { hanh_dong: args.hanhDong, ghi_chu: args.ghiChu?.trim() || undefined }),
    onSuccess: () => {
      setTuChoiTnId(null);
      setGhiChu("");
      qc.invalidateQueries({ queryKey: ["tra-hang"] });
      invalidatePipelineCounts(qc);
      addToast("Đã cập nhật trạng thái đơn trả hàng");
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : undefined;
      addToast(code === "MISSING_GHI_CHU" ? "Cần nhập lý do khi từ chối bước TN duyệt tổng" : "Lỗi: " + describeApiError(err));
    },
  });

  const layLuiMutation = useMutation({
    mutationFn: () => api.post(`/tra-hang/${layLuiId}/log-lui`, { ghi_chu: ghiChu.trim() }),
    onSuccess: () => {
      setLayLuiId(null);
      setGhiChu("");
      qc.invalidateQueries({ queryKey: ["tra-hang"] });
      invalidatePipelineCounts(qc);
      addToast("Đã đẩy lùi 1 bước");
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  function canXuLy(trangThai: string): boolean {
    if (trangThai === "Cho ke toan duyet mem") return canKeToan;
    if (trangThai === "Cho kho xac nhan") return canKho;
    if (trangThai === "Cho QC xac nhan") return canQC;
    if (trangThai === "Cho TN duyet tong") return canTacNghiep;
    if (trangThai === "Cho ke toan xac nhan nhap kho") return canKeToan;
    if (trangThai === "Cho kho xac nhan nhap kho") return canKho;
    return false;
  }

  const DA_DONG = ["Da hoan thanh", "Tu choi", "Da huy"];
  const CO_THE_DAY_LUI = ["Cho kho xac nhan", "Cho QC xac nhan", "Cho TN duyet tong", "Cho ke toan xac nhan nhap kho", "Cho kho xac nhan nhap kho"];

  // Bulk-log (tieu chi UX #4, them 2026-08-15) - "Duyet"/"Tu choi" khong bat buoc nhap gi nen ap
  // dung duoc hang loat, khac dong nhau ve trang_thai_tra_hang (moi dong tu tinh buoc ke tiep rieng
  // o server) - chi can canXuLy() dung cho trang thai hien tai cua dong do.
  const rowsCoTheChon = (data?.rows ?? []).filter((r) => canXuLy(r.trang_thai_tra_hang));
  function toggleSelectAll() {
    setSelected((s) => (s.size === rowsCoTheChon.length && rowsCoTheChon.length > 0 ? new Set() : new Set(rowsCoTheChon.map((r) => r.id))));
  }
  function toggleSelectOne(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const bulkMutation = useMutation({
    mutationFn: (hanhDong: "duyet" | "tu_choi") => api.post<{ results: Record<string, string> }>("/tra-hang/bulk-log", { ids: [...selected], hanh_dong: hanhDong }),
    onSuccess: (res) => {
      const entries = Object.entries(res.results);
      const failed = entries.filter(([, v]) => v in TRA_HANG_BULK_ERROR_MESSAGES);
      // Phase 4 (bulk retry): giu lai dung cac dong loi trong `selected` khi that bai 1 phan, xem
      // comment day du o DonCuaToiTab.tsx (cung pattern).
      setSelected(new Set(failed.map(([id]) => id)));
      if (failed.length === 0) addToast(`Đã xử lý thành công ${entries.length} dòng`);
      else addToast(`Thành công ${entries.length - failed.length}/${entries.length} dòng. Thất bại: ${failed.map(([id, code]) => `${id}: ${TRA_HANG_BULK_ERROR_MESSAGES[code] ?? code}`).join("; ")} — đã giữ lại các dòng lỗi, bấm lại để thử lại`);
      qc.invalidateQueries({ queryKey: ["tra-hang"] });
      invalidatePipelineCounts(qc);
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  const cols: Column<TraHangRow>[] = [
    {
      key: "chon",
      header: <input type="checkbox" checked={rowsCoTheChon.length > 0 && selected.size === rowsCoTheChon.length} onChange={toggleSelectAll} />,
      render: (r: TraHangRow) => (canXuLy(r.trang_thai_tra_hang) ? <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelectOne(r.id)} /> : null),
    },
    { key: "id", header: "Mã đơn hàng", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "ma_lk", header: "Mã LK", render: (r) => r.ma_lk },
    { key: "ten_lk_snapshot", header: "Tên LK", render: (r) => r.ten_lk_snapshot ?? r.ma_lk },
    { key: "so_luong_de_xuat", header: "SL", render: (r) => r.so_luong_de_xuat },
    { key: "nguoi_tao", header: "Người tạo", render: (r) => formatNguoiDisplay(r.nguoi_tao, ktvDisplayMap) },
    { key: "ngay_tao", header: "Ngày tạo", render: (r) => fmtDateTime(r.ngay_tao) },
    {
      key: "trang_thai_tra_hang", header: "Trạng thái",
      render: (r) => (
        <Badge tone={TRA_HANG_TRANG_THAI_TONE[r.trang_thai_tra_hang] ?? "gray"} solid={TRA_HANG_GIAI_DOAN_2.has(r.trang_thai_tra_hang)}>
          {r.trang_thai_tra_hang}
        </Badge>
      ),
    },
    {
      key: "actions", header: "",
      render: (r) => {
        if (DA_DONG.includes(r.trang_thai_tra_hang)) return null;
        return (
          <div className="flex gap-1">
            {canXuLy(r.trang_thai_tra_hang) && (
              <>
                <Btn size="sm" disabled={logMutation.isPending} loading={logMutation.isPending} onClick={() => logMutation.mutate({ id: r.id, hanhDong: "duyet" })}>Duyệt</Btn>
                <Btn
                  size="sm"
                  variant="danger"
                  disabled={logMutation.isPending}
                  onClick={() => {
                    if (r.trang_thai_tra_hang === "Cho TN duyet tong") {
                      setTuChoiTnId(r.id);
                      setGhiChu("");
                    } else {
                      logMutation.mutate({ id: r.id, hanhDong: "tu_choi" });
                    }
                  }}
                >
                  Từ chối
                </Btn>
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
      <div className="mb-3">
        <TrangThaiChipFilter value={filterTrangThai} onChange={setFilterTrangThai} options={TRA_HANG_TRANG_THAI_OPTIONS} />
      </div>
      {nguoiTaoOptions.length > 1 && (
        <div className="flex gap-2 mb-3 flex-wrap">
          <Select
            value={filterNguoiTao}
            onChange={(v) => { setFilterNguoiTao(v); setPage(1); }}
            options={[{ value: "", label: "Tất cả người tạo" }, ...nguoiTaoOptions.map((email) => ({ value: email, label: formatNguoiDisplay(email, ktvDisplayMap) }))]}
          />
        </div>
      )}
      {/* SUA (ra soat #3): bo chip "Trạng thái: ..." - da hien TRUNG voi chip dang to sang trong
          TrangThaiChipFilter ngay ben tren. */}
      <ActiveFiltersBar
        chips={[
          ...(filterNguoiTao ? [{ label: "Người tạo đã lọc", onClear: () => setFilterNguoiTao("") }] : []),
        ]}
      />
      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3 bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-3 py-2">
          <span className="text-sm">Đã chọn {selected.size} dòng</span>
          <BulkConfirmButton
            label="Duyệt tất cả"
            confirmLabel={`Xác nhận duyệt ${selected.size} dòng?`}
            count={selected.size}
            onConfirm={() => bulkMutation.mutate("duyet")}
            disabled={bulkMutation.isPending}
            loading={bulkMutation.isPending}
          />
          <BulkConfirmButton
            label="Từ chối tất cả"
            confirmLabel={`Xác nhận từ chối ${selected.size} dòng?`}
            count={selected.size}
            variant="danger"
            onConfirm={() => bulkMutation.mutate("tu_choi")}
            disabled={bulkMutation.isPending}
            loading={bulkMutation.isPending}
          />
        </div>
      )}
      <PaginatedTable columns={cols} rows={data?.rows ?? []} isLoading={isLoading} isError={isError} page={page} pageSize={20} total={data?.total ?? 0} onPageChange={setPage} rowKey={(r) => r.id} storageKey="dmlk-tra-hang-list" />
      {layLuiId && (
        <Modal open title="Đẩy lùi 1 bước" onClose={() => setLayLuiId(null)}>
          <div className="space-y-3 text-sm">
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              // CHOT (ra soat module #21): giu input tu do (day la hanh dong it xay ra, ly do rat da
              // dang tuy ca cu the - chuan hoa cung se khong phu het, ep chon "Khac" thuong xuyen thi
              // vo nghia) - chi doi placeholder rong thanh vi du cu the de goi y muc do chi tiet can
              // viet.
              placeholder="VD: xác nhận sai số lượng, cần Kho kiểm lại"
              className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="sm" onClick={() => setLayLuiId(null)}>Hủy</Btn>
              <Btn size="sm" onClick={() => layLuiMutation.mutate()} disabled={layLuiMutation.isPending || !ghiChu.trim()}>Xác nhận</Btn>
            </div>
          </div>
        </Modal>
      )}
      {tuChoiTnId && (
        <Modal open title={`Từ chối dòng ${tuChoiTnId} — TN duyệt tổng`} onClose={() => setTuChoiTnId(null)}>
          <div className="space-y-3 text-sm">
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder="Lý do từ chối (bắt buộc)"
              className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="sm" onClick={() => setTuChoiTnId(null)}>Hủy</Btn>
              <Btn
                size="sm"
                variant="danger"
                onClick={() => logMutation.mutate({ id: tuChoiTnId, hanhDong: "tu_choi", ghiChu })}
                disabled={logMutation.isPending || !ghiChu.trim()}
              >
                Xác nhận từ chối
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
