import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../../components/ui/Btn";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { api } from "../../api/client";
import { fmtVND } from "../../types";
import { useAuth } from "../../auth/AuthContext";
import { ImportUploader } from "../../components/ImportUploader";
import { StatCard } from "../../components/ui/StatCard";
import { getOptionsForUser } from "../../lib/loaiDeXuatCache";
import type { DonHangDraft, DatDonHangImportSummary, NguoiNhanHangKhaDungRow } from "./types";
import { YEU_CAU_HOA_DON_OPTIONS, CHINH_SACH_OPTIONS, YEU_CAU_HOA_DON_SHORT_LABELS } from "./constants";
import {
  describeApiError, deriveLoaiDon, canNoRequired, reqLabelClass, pickLdeQuick, emptyDraft,
  useLkAndLdeCache, useLinhKienRankMap, LOAI_DON_TONE, invalidatePipelineCounts, ktvOptionLabel,
} from "./helpers";
import { LinhKienPicker, ThayTheGoiY } from "./LinhKienPicker";
import { MaYeuCauSuCoCheck } from "./MaYeuCauSuCoCheck";

export function TaoDonTab({
  addToast, qc, canQuanLy, onClose,
}: {
  addToast: (msg: string) => void; qc: ReturnType<typeof useQueryClient>; canQuanLy: boolean; onClose: () => void;
}) {
  const { danhMuc, ldeEntries } = useLkAndLdeCache(true);

  const [nguoiNhanHang, setNguoiNhanHang] = useState("");
  const [drafts, setDrafts] = useState<DonHangDraft[]>([emptyDraft()]);
  // SUA (phan hoi 2026-08-19): gop toan bo "Thong tin bo sung" (Yeu cau hoa don + Ma YCSC + Chinh
  // sach + TT khach hang + TT mail duyet) thanh 1 khoi collapsible DUY NHAT (truoc day tach 2 co che
  // an/hien khac nhau: nua dau luon hien, nua sau co nut "Hien thi them" rieng) - mac dinh AN, chi tu
  // mo khi batBuoc (loai cong no can Chinh sach/Ma YCSC) hoac da co du lieu san (sua don cu/import)
  // hoac nguoi dung tu bam mo.
  const [infoExpandedIdx, setInfoExpandedIdx] = useState<Set<number>>(new Set());
  // CHOT 2026-08-17 (rà soát "Tạo Đơn Linh Kiện 2.0" #1): bỏ accordion 2 cột (sidebar 240px thu gọn +
  // panel dang mo tach rieng) - danh sach dong gio la 1 COT DOC DUY NHAT, dong dang mo (activeIdx)
  // render TAI DUNG VI TRI cua no trong mang drafts (khong tach panel rieng), cac dong khac thu gon
  // thanh 1 hang gon. Dong moi them luon nam CUOI danh sach (dung thu tu drafts) va tu cuon toi +
  // nhap nhay 1 nhip (xem activeRowRef/justAdded) - khac phuc dung loi "dong moi khong hien" da bao.
  const [activeIdx, setActiveIdx] = useState(0);
  // Loai de xuat "khac" (ngoai 3 nut nhanh Mua hang/Cong no/Tru cong no) - CHOT #4: gop Loai de xuat +
  // So luong vao 1 hang, chi hien Select day du khi bam "khac..." (hoac gia tri hien tai von da la
  // loai it dung, vd sua tu don cu / import).
  const [otherLdeIdx, setOtherLdeIdx] = useState<Set<number>>(new Set());
  // Nhac ly do khi "+ Them dong" bi khoa (dong dang mo chua xong) - CHOT #1: chi hien SAU KHI nguoi
  // dung thuc su bam (khong hien san truoc khi ho thu), tu bien mat ngay khi dong da hoan tat.
  const [addBlockedHint, setAddBlockedHint] = useState(false);
  // Cuon toi + nhap nhay dong vua duoc them (khong ap dung khi chi bam mo lai 1 dong da thu gon -
  // tranh nhap nhay lien tuc gay roi mat khi duyet qua nhieu dong).
  const activeRowRef = useRef<HTMLDivElement | null>(null);
  const [justAdded, setJustAdded] = useState(false);
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeIdx]);
  useEffect(() => {
    if (!justAdded) return;
    const t = setTimeout(() => setJustAdded(false), 650);
    return () => clearTimeout(t);
  }, [justAdded]);

  const auth = useAuth();
  const currentEmail = auth.status === "authenticated" ? auth.user.email : "";
  const loaiDeXuatOptions = getOptionsForUser(auth.status === "authenticated" ? auth.user : null, ldeEntries);

  // CHOT 2026-08-16 (dot 3 gop y #4): mac dinh "Loai de xuat" la "MUA HANG" thay vi de trong - chi
  // dien 1 lan khi danh sach loai de xuat vua tai xong VA dong duy nhat con "nguyen" (chua ai dong,
  // tranh ghi de luc nguoi dung da chon).
  useEffect(() => {
    if (loaiDeXuatOptions.length === 0) return;
    const matched = pickLdeQuick(loaiDeXuatOptions, "MUA HÀNG");
    if (!matched) return;
    setDrafts((prev) => (prev.length === 1 && !prev[0].loai_de_xuat ? [{ ...prev[0], loai_de_xuat: matched }] : prev));
  }, [loaiDeXuatOptions.length]);

  // BO (phan hoi 2026-08-18): tinh nang "goi y nhanh linh kien thuong dat" (top-linh-kien, toan he
  // thong, khong doi theo thoi gian) da TRUNG LAP voi xep hang 30 ngay tich hop san trong
  // LinhKienPicker (badge 🔥 #N hay dat) - giu ca 2 gay roi, nguoi dung yeu cau bo ban nay, chi con 1
  // nguon xep hang duy nhat (xem useLinhKienRankMap).

  // Giai doan 4b - TN/GS tao ho chon "nguoi nhan hang" khac chinh minh, lay tu Danh sach KTV da
  // ghep tai khoan dang nhap (xem Settings > Danh sach KTV). Rong = mac dinh chinh nguoi tao.
  const { data: nguoiNhanHangData } = useQuery({
    queryKey: ["dat-mua-lk-nguoi-nhan-hang-kha-dung"],
    queryFn: () => api.get<{ rows: NguoiNhanHangKhaDungRow[] }>("/dat-mua-lk/nguoi-nhan-hang-kha-dung"),
    enabled: canQuanLy,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/dat-mua-lk/phieu-dat", {
        nguoi_nhan_hang: nguoiNhanHang || undefined,
        don_hang: drafts.map((d) => ({
          ma_lk: d.ma_lk,
          loai_de_xuat: d.loai_de_xuat.trim(),
          so_luong_de_xuat: d.so_luong_de_xuat,
          ghi_chu: d.ghi_chu.trim() || undefined,
          yeu_cau_hoa_don: d.yeu_cau_hoa_don.trim() || undefined,
          tt_mail_duyet: d.tt_mail_duyet.trim() || undefined,
          tt_khach_hang: d.tt_khach_hang.trim() || undefined,
          chinh_sach: d.chinh_sach.trim() || undefined,
          ma_yeu_cau_su_co: d.ma_yeu_cau_su_co.trim() || undefined,
          uu_tien: d.uu_tien || undefined,
        })),
      }),
    onSuccess: (res) => {
      addToast(`Đã tạo đơn đặt hàng ${res.id}`);
      setNguoiNhanHang("");
      setDrafts([emptyDraft()]);
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-tom-tat"] });
      invalidatePipelineCounts(qc);
      onClose();
    },
    onError: (err) => addToast("Không thể tạo đơn: " + describeApiError(err)),
  });

  function updateDraft(idx: number, patch: Partial<DonHangDraft>) {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }

  // Dieu kien 1 dong "xong" - dung chung cho canSubmit (toan bo phieu) VA gate nut "+ Them dong"
  // (chi 1 dong, dot 3 gop y #2: "phai xong A moi them duoc B").
  function isLineComplete(d: DonHangDraft): boolean {
    return !!(
      d.ma_lk.trim() &&
      d.loai_de_xuat.trim() &&
      d.so_luong_de_xuat > 0 &&
      (!canNoRequired(d.loai_de_xuat) || (d.chinh_sach.trim() && d.ma_yeu_cau_su_co.trim()))
    );
  }

  const canSubmit = drafts.every(isLineComplete);
  const [showImport, setShowImport] = useState(false);

  function themDong() {
    if (!isLineComplete(drafts[activeIdx])) {
      setAddBlockedHint(true);
      return;
    }
    setAddBlockedHint(false);
    setDrafts((prev) => [...prev, { ...emptyDraft(), loai_de_xuat: prev[activeIdx]?.loai_de_xuat ?? "" }]);
    setActiveIdx(drafts.length);
    setJustAdded(true);
  }

  function deleteDraft(idx: number) {
    if (drafts.length === 1) return;
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
    setActiveIdx((cur) => (idx < cur ? cur - 1 : idx === cur ? Math.max(0, cur - 1) : cur));
  }

  const tongGiaUocTinh = drafts.reduce((sum, d) => {
    const lk = d.ma_lk.trim() ? danhMuc.find((m) => m.ma_linh_kien === d.ma_lk) : undefined;
    return sum + (lk?.gia_ban != null ? lk.gia_ban * d.so_luong_de_xuat : 0);
  }, 0);
  // CHOT #4 (ra soat "Tao Don Linh Kien 2.0"): thanh tong luon hien du 3 so (dong / cai / tien) thay
  // vi truoc day chi hien 1-trong-2 (tien HOAC so dong) - tra loi dung yeu cau "vai click biet duoc
  // may cai, gia tri bao nhieu tien" ma khong can mo tung dong.
  const tongSoLuong = drafts.reduce((sum, d) => sum + (d.so_luong_de_xuat || 0), 0);

  return (
    <Modal
      open
      title="🧾 Tạo đơn đặt linh kiện"
      onClose={onClose}
      width="max-w-4xl"
      // Thanh tong tien + nut hanh dong co dinh o day (khong nam trong vung cuon) - phan hoi UX
      // 2026-08-15 dot 2: don nhieu dong tren dien thoai phai cuon het moi thay nut "Tao phieu dat",
      // giong pattern gio hang (Shopee/Tiki) tong tien/nut thanh toan luon co dinh. To nen ocean nhat
      // (phan hoi thiet ke: day la hanh dong CHINH cua ca man hinh, thanh xam trung tinh nhu moi
      // footer khac trong app khong du noi bat).
      footer={
        <div className="flex flex-col gap-1.5 -mx-5 -my-3 px-5 py-3 bg-[var(--ocean-100)]/35">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <span className="text-[var(--ink-500)]">{drafts.length} dòng · {tongSoLuong} cái</span>
              {tongGiaUocTinh > 0 && (
                <>
                  <span className="text-[var(--ink-500)]"> · </span>
                  <span className="font-bold text-[var(--ocean-700)]">{fmtVND(tongGiaUocTinh)}</span>
                  <span className="ml-1 text-[11px] text-[var(--ink-400)]">(*Giá tham khảo)</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Btn variant="ghost" size="sm" onClick={themDong}>
                + Thêm dòng
              </Btn>
              <Btn size="md" onClick={() => create.mutate()} disabled={!canSubmit || create.isPending}>
                {create.isPending ? "Đang tạo..." : drafts.length > 1 ? `Tạo ${drafts.length} đơn` : "Tạo đơn"}
              </Btn>
            </div>
          </div>
          {/* CHOT #1: chi hien ly do SAU KHI da bam thu (addBlockedHint) VA dong dang mo van con thieu -
              tu bien mat ngay khi dong hoan tat, khong con phu thuoc tooltip title (khong hien tren
              mobile cham). */}
          {addBlockedHint && !isLineComplete(drafts[activeIdx]) && (
            <div className="text-[11px] text-[var(--coral-600)] text-right font-medium">
              ⚠ Điền xong Mã linh kiện/Số lượng (dòng {activeIdx + 1}) trước khi thêm dòng mới
            </div>
          )}
        </div>
      }
    >
      {/* CHOT #2 (ra soat module): gop "Nguoi nhan hang" + Import Excel vao CHUNG 1 khoi toolbar thay
          vi 2 khoi tach roi xep chong - Import van thu gon mac dinh (chi TN/GS can, tranh roi cho
          nguoi chi tao tay 1 dong), bam "⇩ Import" moi bung khung keo-tha (co san nut "Tai mau" ben
          trong ImportUploader, khong can them nut rieng). */}
      {canQuanLy && (
        <div className="mb-3 bg-[var(--surface-100)] border border-[var(--line)] rounded-xl p-3">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-[11px] font-bold uppercase tracking-wide text-[var(--ocean-700)] mb-1.5">👤 Người nhận hàng</label>
              <Select
                value={nguoiNhanHang}
                onChange={setNguoiNhanHang}
                options={[
                  { value: "", label: "-- Chính tôi --" },
                  ...(nguoiNhanHangData?.rows ?? []).map((r) => ({ value: r.email_dang_nhap, label: ktvOptionLabel(r, nguoiNhanHangData?.rows ?? []) })),
                ]}
              />
            </div>
            <Btn variant="ghost" size="sm" onClick={() => setShowImport((v) => !v)}>
              {showImport ? "▲ Ẩn Import" : "⇩ Import Excel"}
            </Btn>
          </div>
          <div className="text-[11px] text-[var(--ink-500)] mt-1.5">Tạo hộ cho KTV/Trạm khác — bỏ trống nếu bạn tự nhận hàng.</div>
          {showImport && (
            <div className="mt-3 pt-3 border-t border-[var(--line)]">
              <ImportUploader<DatDonHangImportSummary>
                description={
                  <>
                    Nhập hàng loạt đơn mua linh kiện từ Excel/CSV — các dòng cùng 1 KTV (cột{" "}
                    <b className="font-mono">nguoi_nhan_hang</b> = mã KTV) sẽ gộp thành 1 phiếu đặt. Bắt buộc:{" "}
                    <b className="font-mono">nguoi_nhan_hang</b>, <b className="font-mono">ma_lk</b>,{" "}
                    <b className="font-mono">loai_de_xuat</b>, <b className="font-mono">so_luong_de_xuat</b>. Tùy chọn:{" "}
                    <b className="font-mono">ghi_chu</b>, <b className="font-mono">yeu_cau_hoa_don</b>,{" "}
                    <b className="font-mono">tt_mail_duyet</b>, <b className="font-mono">tt_khach_hang</b>,{" "}
                    <b className="font-mono">chinh_sach</b>, <b className="font-mono">ma_yeu_cau_su_co</b>.
                  </>
                }
                templateUrl="/api/dat-mua-lk/don-hang/import/template"
                previewUrl="/dat-mua-lk/don-hang/import/preview"
                commitUrl="/dat-mua-lk/don-hang/import/commit"
                buildBody={(rows) => ({ rows })}
                renderSummary={(s) => (
                  <div className="grid grid-cols-3 gap-3 mb-2">
                    <StatCard label="Dòng hợp lệ" value={s.thanhCong} tone="teal" />
                    <StatCard label="Dòng lỗi" value={s.loi} tone={s.loi > 0 ? "amber" : "gray"} />
                    <StatCard label="Số phiếu sẽ tạo" value={s.soPhieu} tone="ocean" />
                  </div>
                )}
                getErrors={(s) => s.errors}
                successMessage={(s) => `Đã tạo ${s.soPhieu} phiếu đặt cho ${s.ktvList.length} KTV (${s.thanhCong} dòng)`}
                invalidateKeys={[["dat-mua-lk-don-hang"], ["dat-mua-lk-tom-tat"]]}
              />
            </div>
          )}
        </div>
      )}

      {/* CHOT #1 (ra soat "Tao Don Linh Kien 2.0"): bo accordion 2 cot - danh sach dong gio la 1 COT
          DOC DUY NHAT theo DUNG thu tu drafts (khong tach "dong dang mo" ra rieng 1 vi tri co dinh).
          Dong nao idx===activeIdx thi render full form tai cho, con lai render 1 hang gon full-width -
          dong moi them luon nam CUOI danh sach nhu no von la, khong con bi "an" trong 1 sidebar hep. */}
      <div className="space-y-2">
        {drafts.map((d, idx) => {
          if (idx !== activeIdx) {
            const loaiDonThu = deriveLoaiDon(d.loai_de_xuat);
            const toneThu = LOAI_DON_TONE[loaiDonThu];
            const lkThu = d.ma_lk.trim() ? danhMuc.find((m) => m.ma_linh_kien === d.ma_lk) : undefined;
            const giaTongThu = lkThu?.gia_ban != null ? lkThu.gia_ban * d.so_luong_de_xuat : null;
            const completeThu = isLineComplete(d);
            // SUA (ra soat #7): rut gon truoc day CHI hien gia (an luon tren mobile, va AN HOAN TOAN
            // khi khong ro gia ban) - thieu ca so luong/ma YCSC/yeu cau hoa don khi thu gon. Gio LUON
            // hien du: SL (chip), gia uoc tinh (neu co), Mã YCSC (neu co), icon 🧾 khi co yeu cau hoa
            // don - moi thu 1 chip/icon nho gon tren CUNG 1 dong, khong can mo dong moi xem duoc.
            return (
              <button
                key={idx}
                onClick={() => setActiveIdx(idx)}
                // SUA (phan hoi 2026-08-18 lan 2): dong uu_tien them ring NOI BAT bao quanh CA O (khong
                // chi icon ⭐ nho trong tieu de). SUA (phan hoi 2026-08-19: bao mau viền vàng bị lẫn khi
                // dòng mới kế thừa loại "Công nợ" cũng dùng amber) - doi sang cam THAT (token --orange-*
                // rieng, khac amber) de KHONG con trung mau voi border-l-4 loai don.
                className={`focus-ring w-full text-left bg-white border border-[var(--line)] ${toneThu.border} border-l-4 rounded-xl overflow-hidden text-xs hover:shadow-sm transition-shadow flex items-center gap-2.5 px-3 py-2 ${d.uu_tien ? "ring-2 ring-[var(--orange-500)]" : ""}`}
              >
                <span className="font-mono text-[10px] text-[var(--ink-400)] shrink-0">Dòng {idx + 1}</span>
                <span className="flex-1 min-w-0 flex items-center gap-1 font-semibold text-[var(--ink-900)]">
                  {d.uu_tien && <span title="Ưu tiên">⭐</span>}
                  <span className="truncate">{d.ma_lk ? `${d.ma_lk} · ${lkThu?.ten_linh_kien ?? d.ma_lk}` : "(Chưa chọn linh kiện)"}</span>
                </span>
                <span className="shrink-0 hidden sm:inline text-[var(--ink-500)] font-mono">×{d.so_luong_de_xuat}</span>
                {giaTongThu != null && <span className="text-[var(--ocean-700)] font-semibold shrink-0 hidden md:inline">{fmtVND(giaTongThu)}</span>}
                {d.ma_yeu_cau_su_co.trim() && (
                  <span className="shrink-0 hidden md:inline text-[10px] font-mono text-[var(--ink-500)] bg-[var(--surface-100)] border border-[var(--line)] rounded px-1.5 py-0.5" title={`Mã yêu cầu sự cố: ${d.ma_yeu_cau_su_co}`}>
                    🎫 {d.ma_yeu_cau_su_co}
                  </span>
                )}
                {d.yeu_cau_hoa_don.trim() !== YEU_CAU_HOA_DON_OPTIONS[0] && (
                  <span className="shrink-0" title={YEU_CAU_HOA_DON_SHORT_LABELS[d.yeu_cau_hoa_don] ?? d.yeu_cau_hoa_don}>🧾</span>
                )}
                <span className="shrink-0"><Badge tone={completeThu ? "teal" : "coral"}>{completeThu ? "✓" : "⚠ Chưa xong"}</Badge></span>
              </button>
            );
          }

          const loaiDon = deriveLoaiDon(d.loai_de_xuat);
          const batBuoc = canNoRequired(d.loai_de_xuat);
          const lk = d.ma_lk.trim() ? danhMuc.find((m) => m.ma_linh_kien === d.ma_lk) : undefined;
          const giaUocTinh = lk?.gia_ban != null ? lk.gia_ban * d.so_luong_de_xuat : null;
          const tone = LOAI_DON_TONE[loaiDon];
          // "khac..." mo Select day du - tu dong mo neu gia tri hien tai KHONG khop 1 trong 3 nut
          // nhanh (vd sua tu don cu / import co san loai it dung), khong chi khi nguoi dung tu bam.
          const quickValues = (["MUA HÀNG", "CÔNG NỢ", "TRỪ CÔNG NỢ"] as const)
            .map((kw) => pickLdeQuick(loaiDeXuatOptions, kw))
            .filter((v): v is string => !!v);
          const isOtherValue = d.loai_de_xuat.trim() !== "" && !quickValues.includes(d.loai_de_xuat);
          const showOtherSelect = otherLdeIdx.has(idx) || isOtherValue;
          // SUA (phan hoi 2026-08-19): gop "Thong tin bo sung" thanh 1 khoi DUY NHAT, mac dinh AN -
          // chi tu mo khi batBuoc (Chinh sach/Ma YCSC bat buoc cho loai cong no) HOAC da co san du lieu
          // (sua don cu/import) HOAC nguoi dung tu bam mo rong.
          const infoHasData = !!(
            d.yeu_cau_hoa_don.trim() !== YEU_CAU_HOA_DON_OPTIONS[0] ||
            d.ma_yeu_cau_su_co.trim() ||
            d.chinh_sach.trim() ||
            d.tt_mail_duyet.trim() ||
            d.tt_khach_hang.trim()
          );
          const showInfoBoSung = batBuoc || infoHasData || infoExpandedIdx.has(idx);
          return (
            <div
              key={idx}
              ref={activeRowRef}
              // SUA (phan hoi 2026-08-18 lan 2): dong uu_tien them ring-2 bao QUANH CA THE (ve ngoai
              // border-box, khong dung do voi border-l-4 mau loai_don) - "toan bo o chua linh kien do"
              // gio noi bat het muc ngay ca khi dang mo rong xem/sua, khong chi luc thu gon. KHONG doi
              // bg cua chinh div nay (van bg-white) - vung noi dung o duoi (p-3, cac o nhap) ke thua
              // bg-white nay nguyen ven, chi header strip ben duoi doi mau. SUA (phan hoi 2026-08-19:
              // "màu viền vàng bị lẫn" khi dòng mới kế thừa loại "Công nợ" cũng amber-500) - đổi hẳn
              // sang cam THAT (token --orange-* rieng, khac amber) de 2 khai niem "loại đơn" và
              // "ưu tiên" KHONG con dung chung 1 mau nua.
              className={`bg-white border border-[var(--line)] ${tone.border} border-l-4 rounded-xl overflow-hidden shadow-sm transition-shadow ${justAdded ? "shadow-[0_0_0_3px_var(--teal-100)]" : ""} ${d.uu_tien ? "ring-2 ring-[var(--orange-500)]" : ""}`}
            >
              {/* Header dong: so thu tu + loai don (mau phan biet) + xoa dong - dua nut xoa len dau
                  de luon de thay, khong chen vao giua luong tab cua cac o nhap (phan hoi UX dot 2).
                  Phan hoi thiet ke: doi nen tu --bg (trung voi nen TRANG - lam header lan vao khung
                  modal) sang --surface-100 that su phan tang; "Xoa dong" doi tu link chu suong sang
                  nut that (Btn danger) cho ro trong luong hanh dong xoa. Tickbox Uu tien CHINH LA o o
                  day, bam tich TRUC TIEP ngay tren tieu de - khong con la 1 badge chi-doc + 1 checkbox
                  rieng o duoi nua, gio CHI 1 o duy nhat lam ca 2 viec: vua la cong tac tich vua la dau
                  hieu hien thi (mau cam, xem giai thich o className cua the ben tren). */}
              <div className={`flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--line)] ${d.uu_tien ? "bg-[var(--orange-100)]" : "bg-[var(--surface-100)]"}`}>
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="font-mono text-[11px] text-[var(--ink-400)] shrink-0">Dòng {idx + 1}{drafts.length > 1 ? ` / ${drafts.length}` : ""}</span>
                  <Badge tone={tone.tone}>{tone.label}</Badge>
                  <label
                    className={`flex items-center gap-1.5 text-xs font-semibold rounded-full pl-1.5 pr-2.5 py-1 cursor-pointer transition-colors select-none ${
                      d.uu_tien ? "bg-[var(--orange-600)] text-white" : "bg-white border border-[var(--line)] text-[var(--ink-500)] hover:border-[var(--orange-500)]/60"
                    }`}
                    title="Đánh dấu dòng này là ưu tiên"
                  >
                    <input
                      type="checkbox"
                      checked={d.uu_tien}
                      onChange={(e) => updateDraft(idx, { uu_tien: e.target.checked })}
                      className="w-3.5 h-3.5 accent-[var(--orange-600)]"
                    />
                    ⭐ Ưu tiên
                  </label>
                </div>
                <Btn size="sm" variant="danger" onClick={() => deleteDraft(idx)} disabled={drafts.length === 1}>
                  ✕ Xóa dòng
                </Btn>
              </div>

              <div className="p-3 flex flex-col gap-3">
                {/* 1) Ma linh kien - luon full-width MOI breakpoint (truoc day bi ket 33% tren
                    tablet/desktop khien ten linh kien dai bi cat - phan hoi UX dot 2 diem chinh).
                    autoFocus CHI khi day la dong VUA duoc them (justAdded) va dang la dong active -
                    phan hoi 2026-08-19 #6: chuyen thang toi o nhap ma LK, khoi phai cuon tim. */}
                <div>
                  <label className={reqLabelClass(!d.ma_lk.trim())}>Mã linh kiện *</label>
                  <LinhKienPicker value={d.ma_lk} onChange={(v) => updateDraft(idx, { ma_lk: v })} options={danhMuc} autoFocus={justAdded} />
                </div>

                {/* 2+3+4) Loai de xuat + So luong + Gia uoc tinh GOP 1 HANG (phan hoi 2026-08-19: "sắp
                    xếp thành 1 dòng") - truoc day gia uoc tinh nam rieng 1 dong phu ben duoi. */}
                <div>
                  <label className={reqLabelClass(!d.loai_de_xuat.trim() || !(d.so_luong_de_xuat > 0))}>Loại đề xuất · Số lượng · Giá ước tính *</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex gap-1 flex-wrap flex-1 min-w-[160px]">
                      {(["MUA HÀNG", "CÔNG NỢ", "TRỪ CÔNG NỢ"] as const).map((kw) => {
                        const matched = pickLdeQuick(loaiDeXuatOptions, kw);
                        if (!matched) return null;
                        return (
                          <Btn
                            key={kw}
                            size="sm"
                            variant={d.loai_de_xuat === matched ? "primary" : "ghost"}
                            onClick={() => {
                              updateDraft(idx, { loai_de_xuat: matched });
                              // SUA BUG (phan hoi 2026-08-19 #5): bam nut nhanh khac PHAI xoa "ket dinh"
                              // che do "khac..." cua dong nay - truoc day chi set gia tri loai_de_xuat
                              // nhung khong xoa otherLdeIdx, khien nut "khac…" + o Select van hien SAI
                              // (ket "dinh" o che do khac du gia tri thuc te da doi sang 1 trong 3 nut
                              // nhanh).
                              setOtherLdeIdx((s) => {
                                if (!s.has(idx)) return s;
                                const next = new Set(s);
                                next.delete(idx);
                                return next;
                              });
                            }}
                          >
                            {kw}
                          </Btn>
                        );
                      })}
                      <Btn
                        size="sm"
                        variant={showOtherSelect ? "primary" : "ghost"}
                        onClick={() => setOtherLdeIdx((s) => new Set(s).add(idx))}
                      >
                        khác…
                      </Btn>
                    </div>
                    {/* SUA (phan hoi 2026-08-18): nen chim bg-surface-100 (dong bo voi moi o nhap lieu
                        khac trong module) thay vi bg-white - card cha da la bg-white nen truoc day o
                        nhap "an" luon vao nen, chi phan biet duoc qua 1 duong vien mong. Hover cua nut
                        +/- doi sang surface-200 (dam hon 1 nac) de van con phan biet duoc trang thai
                        hover so voi nen tinh surface-100. */}
                    <div className="flex items-center border border-[var(--line)] rounded-lg overflow-hidden shrink-0 bg-[var(--surface-100)]">
                      <button
                        type="button"
                        onClick={() => updateDraft(idx, { so_luong_de_xuat: Math.max(1, d.so_luong_de_xuat - 1) })}
                        className="focus-ring w-7 h-8 flex items-center justify-center text-[var(--ink-600)] font-bold bg-[var(--surface-100)] hover:bg-[var(--surface-200)]"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={d.so_luong_de_xuat}
                        onChange={(e) => updateDraft(idx, { so_luong_de_xuat: Number(e.target.value) })}
                        className="focus-ring w-11 text-center text-sm bg-[var(--surface-100)] border-x border-[var(--line)] py-1.5"
                      />
                      <button
                        type="button"
                        onClick={() => updateDraft(idx, { so_luong_de_xuat: d.so_luong_de_xuat + 1 })}
                        className="focus-ring w-7 h-8 flex items-center justify-center text-[var(--ink-600)] font-bold bg-[var(--surface-100)] hover:bg-[var(--surface-200)]"
                      >
                        +
                      </button>
                    </div>
                    <div className="text-[11px] text-[var(--ink-500)] shrink-0 whitespace-nowrap">
                      {giaUocTinh != null ? <b className="text-[var(--ocean-700)]">{fmtVND(giaUocTinh)}</b> : <span className="text-[var(--ink-400)]">Giá: —</span>}
                    </div>
                  </div>
                  {showOtherSelect && (
                    <Select
                      value={d.loai_de_xuat}
                      onChange={(v) => updateDraft(idx, { loai_de_xuat: v })}
                      options={[{ value: "", label: "-- Chọn --" }, ...loaiDeXuatOptions.map((o) => ({ value: o, label: o }))]}
                      className="w-full mt-1"
                    />
                  )}
                </div>

                {/* Tickbox Uu tien da chuyen len HEADER (phan hoi 2026-08-18 lan 3) - bo khoi day, xem
                    comment o header phia tren. */}

                {d.ma_lk.trim() && <ThayTheGoiY maLk={d.ma_lk.trim()} canQuanLy={canQuanLy} addToast={addToast} />}

                {/* "Thong tin bo sung" - mac dinh AN (phan hoi 2026-08-19 #5), chi tu mo khi batBuoc/
                    da co du lieu/nguoi dung tu bam. Gop het Yeu cau hoa don + Ma YCSC + Chinh sach vao
                    1 hang, TT khach hang + TT+Mail duyet vao 1 hang (phan hoi 2026-08-19: "gộp chung
                    1 dòng"). */}
                {showInfoBoSung ? (
                  <>
                    <div className="flex items-center gap-2 -my-1">
                      <div className="h-px flex-1 bg-[var(--line)]" />
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-400)]">Thông tin bổ sung (tuỳ chọn)</span>
                      <div className="h-px flex-1 bg-[var(--line)]" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Yêu cầu hóa đơn</label>
                        <div className="flex gap-1 flex-wrap">
                          {YEU_CAU_HOA_DON_OPTIONS.map((o) => (
                            <Btn
                              key={o}
                              type="button"
                              size="sm"
                              variant={d.yeu_cau_hoa_don === o ? "primary" : "ghost"}
                              onClick={() => updateDraft(idx, { yeu_cau_hoa_don: o })}
                            >
                              {YEU_CAU_HOA_DON_SHORT_LABELS[o] ?? o}
                            </Btn>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className={reqLabelClass(batBuoc && !d.ma_yeu_cau_su_co.trim())}>Mã YCSC liên quan{batBuoc ? " *" : ""}</label>
                        <input
                          value={d.ma_yeu_cau_su_co}
                          onChange={(e) => updateDraft(idx, { ma_yeu_cau_su_co: e.target.value })}
                          maxLength={20}
                          className={`focus-ring w-full bg-[var(--surface-100)] border rounded-lg px-2.5 py-1.5 text-sm ${batBuoc && !d.ma_yeu_cau_su_co.trim() ? "border-[var(--coral-400)]" : "border-[var(--line)]"}`}
                        />
                      </div>
                      <div>
                        <label className={reqLabelClass(batBuoc && !d.chinh_sach.trim())}>Chính sách{batBuoc ? " *" : ""}</label>
                        <Select
                          value={d.chinh_sach}
                          onChange={(v) => updateDraft(idx, { chinh_sach: v })}
                          options={[{ value: "", label: "-- Không chọn --" }, ...CHINH_SACH_OPTIONS.map((o) => ({ value: o, label: o }))]}
                        />
                      </div>
                    </div>
                    <MaYeuCauSuCoCheck value={d.ma_yeu_cau_su_co} nguoiNhanHang={nguoiNhanHang || currentEmail} />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">TT khách hàng</label>
                        <input
                          value={d.tt_khach_hang}
                          onChange={(e) => updateDraft(idx, { tt_khach_hang: e.target.value })}
                          placeholder="Tên/SĐT/địa chỉ khách hàng liên quan"
                          className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">TT+Mail duyệt</label>
                        <input
                          value={d.tt_mail_duyet}
                          onChange={(e) => updateDraft(idx, { tt_mail_duyet: e.target.value })}
                          placeholder="Mã/nội dung email phê duyệt đặc biệt (nếu có)"
                          className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setInfoExpandedIdx((s) => new Set(s).add(idx))}
                    className="focus-ring self-start text-xs font-semibold text-[var(--ink-500)] hover:text-[var(--ocean-600)]"
                  >
                    + Thông tin bổ sung (Hóa đơn/Chính sách/TT khách hàng…) ▾
                  </button>
                )}

                {/* Ghi chu - luon o CUOI CUNG cua card (phan hoi UX dot 2). */}
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--ink-600)] mb-1">Ghi chú (tuỳ chọn)</label>
                  <input
                    value={d.ghi_chu}
                    onChange={(e) => updateDraft(idx, { ghi_chu: e.target.value })}
                    className="focus-ring w-full bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

