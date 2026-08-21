import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Modal } from "../../components/ui/Modal";
import { PaginatedTable, type Column } from "../../components/ui/PaginatedTable";
import { api, buildQuery } from "../../api/client";
import { fmtDateTime } from "../../types";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import type { ThieuLkRow, LyDoChamRow } from "./types";
import { THIEU_LK_TRANG_THAI_TONE, THIEU_LK_TRANG_THAI_OPTIONS } from "./constants";
import { describeApiError, formatNguoiDisplay, useKtvDisplayMap, invalidatePipelineCounts, trangThaiLabel } from "./helpers";
import { StatusBadge, TrangThaiChipFilter, BulkConfirmButton } from "./SharedUi";

// ---------- Tab "Thieu linh kien" ----------

export function ThieuLkTab({
  addToast, qc, canKho, canTacNghiep, currentEmail, initialFilterOverride,
}: {
  addToast: (msg: string) => void; qc: ReturnType<typeof useQueryClient>; canKho: boolean; canTacNghiep: boolean; currentEmail: string;
  initialFilterOverride?: string;
}) {
  // Kho mac dinh loc dung hang doi cua ho ("Cho kho xu ly"), con lai giu "Tat ca".
  const [filterTrangThai, setFilterTrangThai] = useLocalStorageState("filters:dmlk-tlk-tt", canKho ? "Cho kho xu ly" : "");
  useEffect(() => {
    if (initialFilterOverride !== undefined) setFilterTrangThai(initialFilterOverride);
  }, [initialFilterOverride]);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionTrangThai, setActionTrangThai] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [ngayDuKien, setNgayDuKien] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const ktvDisplayMap = useKtvDisplayMap();

  // GD4 (phan hoi Codex #16): ve trang 1 + xoa selection dang chon khi doi bo loc trang thai.
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [filterTrangThai]);

  // GD4 (phan hoi Codex #17): phan trang server-side - truoc day tai het toan bo dong khop bo loc
  // roi tu slice o client, moi lan doi trang van doc lai het du lieu tu D1.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dat-mua-lk-thieu-lk", filterTrangThai, page],
    queryFn: () => api.get<{ rows: ThieuLkRow[]; total: number }>("/dat-mua-lk/thieu-lk" + buildQuery({ trang_thai: filterTrangThai || undefined, page, pageSize: 20 })),
  });

  // "Kho da tiep nhan" = buoc Kho giai trinh ly do thieu hang that su + bao ngay du kien co hang
  // (dung cot trong Excel goc) - bat buoc ghi_chu, khong nhu cac buoc khac chi tuy chon.
  const isGiaiTrinh = actionTrangThai === "Kho da tiep nhan";
  // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #20): goi y nhanh (chip) cho o giai trinh bat buoc -
  // KHONG bulk hoa buoc nay (moi ticket thuong co ly do thuc te khac nhau, 1 ly do chung ap cho ca
  // loat se lam sai lech dung muc dich giai trinh THAT), thay vao do toi uu luong DON LE nhanh hon
  // bang chip goi y tu danh muc "Mua hang" da co san (settings_ly_do_cham) - Kho van go tu do binh
  // thuong, chip chi giup dien nhanh cac ly do hay gap.
  const { data: giaiTrinhGoiYData } = useQuery({
    queryKey: ["dat-mua-lk-ly-do-cham"],
    queryFn: () => api.get<{ rows: LyDoChamRow[] }>("/dat-mua-lk/ly-do-cham?he_thong=" + encodeURIComponent("Mua hàng")),
    enabled: canKho,
  });

  // Nhan tham so truc tiep (khong doc qua state actionId/actionTrangThai) de cac nut khong can nhap
  // lieu co the ban thang mutate() ma khong mo modal (tieu chi UX #3, sua 2026-08-15) - modal "Xac
  // nhan" van goi ham nay voi actionId/actionTrangThai hien tai cho truong hop isGiaiTrinh.
  const logMutation = useMutation({
    mutationFn: (args: { id: string; trangThai: string; ghiChu?: string; ngayDuKien?: string }) =>
      api.post(`/dat-mua-lk/thieu-lk/${args.id}/log`, {
        trang_thai: args.trangThai,
        ghi_chu: args.ghiChu?.trim() || undefined,
        ngay_du_kien_co_hang: args.ngayDuKien || undefined,
      }),
    onSuccess: () => {
      setActionId(null);
      setGhiChu("");
      setNgayDuKien("");
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-thieu-lk"] });
      invalidatePipelineCounts(qc);
      addToast("Đã cập nhật trạng thái thiếu LK");
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  // "Da ket thuc" la cua TN (khop cot "Admin xu ly" trong Excel goc), con lai la Kho. "Da huy bo"
  // cung mo cho chinh TN da tao ticket (nguoi_tao), khong chi Kho - khop quyen da co san o backend
  // (POST /thieu-lk/:id/log: isCancel cho phep nguoi_tao huy bat ky luc nao con dang mo).
  const NEXT_STATES = (r: ThieuLkRow): { trangThai: string; canDo: boolean }[] => {
    const isCreator = r.nguoi_tao === currentEmail;
    if (r.trang_thai === "Cho kho xu ly")
      return [
        { trangThai: "Kho da tiep nhan", canDo: canKho },
        { trangThai: "Kho tu choi sai TT", canDo: canKho },
        { trangThai: "Da huy bo", canDo: isCreator },
      ];
    if (r.trang_thai === "Kho da tiep nhan")
      return [
        { trangThai: "Kho xac nhan hang da ve", canDo: canKho },
        { trangThai: "Da huy bo", canDo: canKho || isCreator },
      ];
    if (r.trang_thai === "Kho xac nhan hang da ve") return [{ trangThai: "Da ket thuc", canDo: canTacNghiep }];
    return [];
  };

  // Bulk-log (tieu chi UX #4, them 2026-08-15) - chi ap dung cho cac buoc KHONG can nhap lieu bat
  // buoc ("Kho da tiep nhan" can giai trinh rieng tung dong nen loai khoi bulk). Thanh hanh dong chi
  // hien cac trang thai dich CHUNG cho toan bo dong da chon (giao cua tap NEXT_STATES tung dong).
  const BULK_ELIGIBLE_STATES = ["Kho xac nhan hang da ve", "Kho tu choi sai TT", "Da huy bo", "Da ket thuc"];
  const eligibleBulkStates = (r: ThieuLkRow) => NEXT_STATES(r).filter((s) => s.canDo && BULK_ELIGIBLE_STATES.includes(s.trangThai)).map((s) => s.trangThai);
  const rowsCoTheChon = (data?.rows ?? []).filter((r) => eligibleBulkStates(r).length > 0);
  const selectedRows = (data?.rows ?? []).filter((r) => selected.has(r.id));
  const commonBulkStates =
    selectedRows.length === 0
      ? []
      : selectedRows.reduce<string[]>((acc, r, i) => (i === 0 ? eligibleBulkStates(r) : acc.filter((s) => eligibleBulkStates(r).includes(s))), []);

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
    mutationFn: (trangThai: string) => api.post<{ results: Record<string, string> }>("/dat-mua-lk/thieu-lk/bulk-log", { ids: [...selected], trang_thai: trangThai }),
    onSuccess: (res) => {
      const entries = Object.entries(res.results);
      const failed = entries.filter(([, v]) => v !== "ok");
      // Phase 4 (bulk retry): giu lai dung cac dong loi trong `selected` khi that bai 1 phan, xem
      // comment day du o DonCuaToiTab.tsx (cung pattern).
      setSelected(new Set(failed.map(([lineId]) => lineId)));
      addToast(
        failed.length === 0
          ? `Đã xử lý thành công ${entries.length} dòng`
          : `Thành công ${entries.length - failed.length}/${entries.length} dòng — đã giữ lại các dòng lỗi, bấm lại để thử lại`,
      );
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-thieu-lk"] });
      invalidatePipelineCounts(qc);
    },
    onError: (err) => addToast("Lỗi: " + describeApiError(err)),
  });

  // UI redesign (phan hoi Codex 2026-08-19, muc P2 "rut gon cot mac dinh"): dat_don_hang_id/ten_ly_do
  // chuyen sang optionalColumns (an mac dinh) - deu la thong tin tra cuu phu, khong can de quyet dinh
  // buoc xu ly tiep theo (trang_thai + ngay_du_kien_co_hang moi la thu can nhin ngay).
  const cols: Column<ThieuLkRow>[] = [
    {
      key: "chon",
      header: <input type="checkbox" checked={rowsCoTheChon.length > 0 && selected.size === rowsCoTheChon.length} onChange={toggleSelectAll} />,
      render: (r: ThieuLkRow) => (eligibleBulkStates(r).length > 0 ? <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelectOne(r.id)} /> : null),
    },
    { key: "id", header: "Mã TLK", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    {
      key: "linh_kien", header: "Linh kiện",
      render: (r) =>
        r.ma_lk ? (
          <>
            <div className="font-mono text-[10px] text-[var(--ink-400)]">{r.ma_lk}</div>
            <div className="font-medium">{r.ten_lk_snapshot ?? r.ma_lk}</div>
          </>
        ) : (
          <span className="text-[var(--ink-400)]">—</span>
        ),
    },
    { key: "nguoi_tao", header: "TN báo", render: (r) => formatNguoiDisplay(r.nguoi_tao, ktvDisplayMap) },
    { key: "ngay_tao", header: "Ngày báo", render: (r) => fmtDateTime(r.ngay_tao) },
    { key: "ngay_du_kien_co_hang", header: "Ngày dự kiến có hàng", render: (r) => r.ngay_du_kien_co_hang ?? "—" },
    { key: "trang_thai", header: "Trạng thái", render: (r) => <StatusBadge value={r.trang_thai} tones={THIEU_LK_TRANG_THAI_TONE} /> },
    {
      key: "actions", header: "",
      render: (r) => {
        const nexts = NEXT_STATES(r).filter((s) => s.canDo);
        if (nexts.length === 0) return null;
        return (
          <div className="flex gap-1">
            {nexts.map((s) =>
              s.trangThai === "Kho da tiep nhan" ? (
                // CHOT (ra soat module #20): "…" cuoi nhan = quy uoc quen thuoc (giong menu he dieu
                // hanh) bao "bam se hoi them truoc khi chay", phan biet voi cac nut ben canh chay
                // ngay khong hoi gi (dung y CHOT UX #3 cu - khong quay lai them modal cho MOI nut).
                <Btn key={s.trangThai} size="sm" variant="ghost" onClick={() => { setActionId(r.id); setActionTrangThai(s.trangThai); setGhiChu(""); setNgayDuKien(""); }}>
                  {s.trangThai}…
                </Btn>
              ) : (
                <Btn key={s.trangThai} size="sm" variant="ghost" disabled={logMutation.isPending} onClick={() => logMutation.mutate({ id: r.id, trangThai: s.trangThai })}>
                  {/* "Da ket thuc" la hanh dong cua TN, con lai la cua Kho - cung 1 cot hanh dong
                      chung nen them tien to nho phan biet vai tro thay vi tach cot rieng (se de
                      trong rat nhieu o vi da so dong chi 1 trong 2 vai tro co nut - lang phi khong
                      gian bang von da 8+ cot, dac biet hep tren mobile). */}
                  {s.trangThai === "Da ket thuc" ? <span className="text-[var(--ink-400)]">TN: </span> : null}
                  {s.trangThai}
                </Btn>
              ),
            )}
          </div>
        );
      },
    },
  ];
  const optionalCols: Column<ThieuLkRow>[] = [
    { key: "dat_don_hang_id", header: "Đơn hàng", render: (r) => <span className="font-mono text-xs">{r.dat_don_hang_id}</span> },
    // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #20, sua lai gia dinh sai o vong ra soat truoc):
    // day la LY DO TN CHON LUC TU CHOI/BAO CHO HANG (tu dong sinh ticket khi ly do co co
    // quan_ly_don_thieu_linh_kien=1, xem migration 0065 + applyDonHangLog) - KHONG PHAI "tu PXK" nhu
    // gia dinh ban dau. Doi nhan cho dung nguon goc, tranh nham voi hanh dong "Kho da tiep nhan"
    // giai trinh THUC TE ngay ben canh (2 khai niem "ly do" khac nhau dung canh nhau).
    { key: "ten_ly_do", header: "Lý do TN báo", render: (r) => r.ten_ly_do ?? "—" },
  ];

  return (
    <div className="mt-4">
      <div className="mb-3">
        <TrangThaiChipFilter value={filterTrangThai} onChange={setFilterTrangThai} options={THIEU_LK_TRANG_THAI_OPTIONS} />
      </div>
      {/* SUA (ra soat #3): bo <ActiveFiltersBar> - chip duy nhat cua no (trạng thái) da hien TRUNG voi
          chip dang to sang trong TrangThaiChipFilter ngay ben tren, khong con bo loc nao khac trong
          tab nay nen ca thanh nay tro thanh khong-lam-gi vinh vien neu giu lai. */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3 bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-3 py-2">
          <span className="text-sm">Đã chọn {selected.size} dòng</span>
          {commonBulkStates.length === 0 ? (
            <span className="text-xs text-[var(--ink-500)]">Các dòng đã chọn không có bước xử lý chung — chọn lại theo cùng trạng thái</span>
          ) : (
            commonBulkStates.map((s) => (
              <BulkConfirmButton
                key={s}
                label={s}
                confirmLabel={`Xác nhận chuyển ${selected.size} dòng sang "${trangThaiLabel(THIEU_LK_TRANG_THAI_OPTIONS, s)}"?`}
                count={selected.size}
                onConfirm={() => bulkMutation.mutate(s)}
                disabled={bulkMutation.isPending}
                loading={bulkMutation.isPending}
              />
            ))
          )}
        </div>
      )}
      {/* storageKey (phan hoi 2026-08-18 muc 4): bat "⚙ Tuy chinh cot" (an bot/keo rong) - khong them
          onRowClick vi bang nay khong co man hinh "chi tiet" rieng, thao tac lam ngay tai cot Hanh
          dong cuoi hang. */}
      <PaginatedTable columns={cols} optionalColumns={optionalCols} rows={data?.rows ?? []} isLoading={isLoading} isError={isError} page={page} pageSize={20} total={data?.total ?? 0} onPageChange={setPage} rowKey={(r) => r.id} storageKey="dmlk-thieu-lk-list" />
      {actionId && (
        <Modal open title={`Chuyển sang: ${actionTrangThai}`} onClose={() => setActionId(null)}>
          <div className="space-y-3 text-sm">
            {isGiaiTrinh && (
              <div>
                <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Ngày dự kiến có hàng</label>
                <input
                  type="date"
                  value={ngayDuKien}
                  onChange={(e) => setNgayDuKien(e.target.value)}
                  className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                />
              </div>
            )}
            <div>
              {isGiaiTrinh && <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Giải thích lý do thiếu hàng *</label>}
              <input
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                placeholder={isGiaiTrinh ? "Bắt buộc - giải thích thực tế vì sao thiếu hàng" : "Ghi chú (tuỳ chọn)"}
                className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
              {isGiaiTrinh && (giaiTrinhGoiYData?.rows.length ?? 0) > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-1.5">
                  {(giaiTrinhGoiYData?.rows ?? []).map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setGhiChu(l.ten_ly_do)}
                      className="focus-ring px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--surface-100)] text-[var(--ink-600)] border border-[var(--line)] hover:border-[var(--ocean-400)] hover:text-[var(--ocean-700)]"
                    >
                      {l.ten_ly_do}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="sm" onClick={() => setActionId(null)}>Hủy</Btn>
              <Btn
                size="sm"
                onClick={() => actionId && logMutation.mutate({ id: actionId, trangThai: actionTrangThai, ghiChu, ngayDuKien: isGiaiTrinh ? ngayDuKien : undefined })}
                disabled={logMutation.isPending || (isGiaiTrinh && !ghiChu.trim())}
              >
                Xác nhận
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

