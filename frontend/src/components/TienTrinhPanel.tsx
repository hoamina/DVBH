import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "./ui/Btn";
import { Badge } from "./ui/Badge";
import { Select } from "./ui/Select";
import { Modal } from "./ui/Modal";
import { api } from "../api/client";
import { fmtDateTime } from "../types";
import { useToast } from "./ui/Toast";
import { shortKhuVuc } from "../lib/khuVucShortLabel";
import { useAuth, type AppUser } from "../auth/AuthContext";
import { usePersonDirectory, formatPersonDisplay } from "../lib/personDisplay";
import {
  TRANG_THAI_LABELS,
  TRANG_THAI_TONE,
  TRANG_THAI_DONG,
  TRANG_THAI_CAN_KET_QUA,
  GIAM_SAT_STATUS_OPTIONS,
  CSKH_STATUS_OPTIONS,
  phaseOfStatus,
  MUC_DO_OPTIONS,
  MUC_DO_TONE,
  MUC_DO_LABELS,
  HAI_LONG_OPTIONS,
  canWriteTranhChap,
  canEditTienTrinhMeta,
  canWriteCskhPhase,
  phanLoaiTone,
  describeTranhChapError,
  deriveGiamSatSuggestion,
  type ChoXuLyCase,
  type TranhChapLogRow,
  type TienTrinhDetail,
  type PhanLoaiTranhChapRow,
  type KetQuaXuLyTranhChapRow,
  type GiamSatInfo,
} from "../lib/tranhChapShared";

/**
 * Modal "Tiep nhan xu ly tranh chap" - dung chung boi TranhChapModule.tsx (tab "Cho xu ly") va
 * CaseDetail.tsx (tab "Tranh chap, khieu nai" khi ca chua co tien trinh nao).
 */
export function TiepNhanModal({
  caseRow,
  phanLoaiOptions,
  ketQuaOptions,
  onClose,
  onSubmit,
  isPending,
}: {
  caseRow: ChoXuLyCase;
  phanLoaiOptions: PhanLoaiTranhChapRow[];
  ketQuaOptions: KetQuaXuLyTranhChapRow[];
  onClose: () => void;
  onSubmit: (body: {
    phan_loai_tranh_chap: string;
    muc_do: string;
    trang_thai_xu_ly: string;
    ghi_chu?: string;
    thoi_gian_du_kien_xong?: string;
    ket_qua_xu_ly?: string;
    hai_long_sau_tranh_chap?: string;
  }) => void;
  isPending: boolean;
}) {
  const [phanLoai, setPhanLoai] = useState(phanLoaiOptions[0]?.ten_phan_loai ?? "");
  const [mucDo, setMucDo] = useState("Binh thuong");
  // Trang thai dau tien LUON thuoc giai doan Giam sat (chot 2026-07-31 diem 1/3) - mac dinh "chua xu
  // ly", nhung co the chon thang 1 trong 2 trang thai dong de ket thuc tranh chap ngay luc tiep nhan.
  const [trangThai, setTrangThai] = useState("Giam sat chua xu ly");
  const [ngayDuKien, setNgayDuKien] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [ketQua, setKetQua] = useState("");
  const [haiLong, setHaiLong] = useState("");
  const canKetQua = TRANG_THAI_CAN_KET_QUA.includes(trangThai);

  return (
    <Modal open onClose={onClose} title={`Tiếp nhận xử lý tranh chấp — ${caseRow.id}`}>
      <div className="space-y-3">
        <div className="text-sm text-[var(--ink-600)]">
          {caseRow.khach_hang ?? "—"} · {shortKhuVuc(caseRow.khu_vuc)}
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--ink-400)]">Phân loại tranh chấp</label>
          {phanLoaiOptions.length ? (
            <Select value={phanLoai} onChange={setPhanLoai} options={phanLoaiOptions.map((p) => p.ten_phan_loai)} className="w-full mt-1" />
          ) : (
            <div className="text-xs text-[var(--coral-500)] mt-1">Chưa có phân loại nào — vào Settings → Phân loại tranh chấp để thêm trước.</div>
          )}
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--ink-400)]">Mức độ</label>
          <Select value={mucDo} onChange={setMucDo} options={MUC_DO_OPTIONS} className="w-full mt-1" />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--ink-400)]">Trạng thái</label>
          <Select value={trangThai} onChange={setTrangThai} options={GIAM_SAT_STATUS_OPTIONS} className="w-full mt-1" />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--ink-400)]">Ngày dự kiến xử lý xong</label>
          <input type="date" value={ngayDuKien} onChange={(e) => setNgayDuKien(e.target.value)} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
        </div>
        {canKetQua && (
          <>
            <div>
              <label className="text-xs font-semibold text-[var(--ink-400)]">Kết quả xử lý *</label>
              {ketQuaOptions.length ? (
                <Select
                  value={ketQua}
                  onChange={setKetQua}
                  options={[{ value: "", label: "Chọn kết quả xử lý…" }, ...ketQuaOptions.map((k) => ({ value: k.ten_ket_qua, label: k.ten_ket_qua }))]}
                  className="w-full mt-1"
                />
              ) : (
                <div className="text-xs text-[var(--coral-500)] mt-1">Chưa có danh mục — vào Settings → Kết quả xử lý tranh chấp để thêm trước.</div>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--ink-400)]">Hài lòng sau tranh chấp *</label>
              <Select value={haiLong} onChange={setHaiLong} options={[{ value: "", label: "Chọn mức hài lòng…" }, ...HAI_LONG_OPTIONS]} className="w-full mt-1" />
            </div>
          </>
        )}
        <div>
          <label className="text-xs font-semibold text-[var(--ink-400)]">Ghi chú</label>
          <textarea value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} rows={2} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>
            Hủy
          </Btn>
          <Btn
            onClick={() =>
              onSubmit({
                phan_loai_tranh_chap: phanLoai,
                muc_do: mucDo,
                trang_thai_xu_ly: trangThai,
                ghi_chu: ghiChu.trim() || undefined,
                thoi_gian_du_kien_xong: ngayDuKien || undefined,
                ket_qua_xu_ly: canKetQua ? ketQua : undefined,
                hai_long_sau_tranh_chap: canKetQua ? haiLong : undefined,
              })
            }
            disabled={!phanLoai || !mucDo || !trangThai || (canKetQua && (!ketQua || !haiLong)) || isPending}
          >
            Tiếp nhận
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

const MUC_DO_ACCENT: Record<string, string> = { "Binh thuong": "var(--line)", Cao: "var(--amber-500)", "Rat nghiem trong": "var(--coral-500)" };
const TRANG_THAI_DOT: Record<string, string> = {
  "Giam sat chua xu ly": "var(--ink-400)",
  "Giam sat dang xu ly": "var(--amber-500)",
  "Giam sat dong hoan thanh": "var(--teal-500)",
  "Giam sat dong that bai": "var(--coral-500)",
  "Giam sat chuyen CSKH": "var(--ocean-500)",
  "CSKH chua tiep nhan": "var(--ink-400)",
  "CSKH dang xu ly": "var(--ocean-500)",
  "CSKH khong can xu ly": "var(--ink-400)",
  "CSKH xu ly xong": "var(--teal-500)",
};

/** So ngay qua han (duong) / con lai (am) so voi hom nay, gio VN - null neu khong co han hoac da dong. */
function dueUrgency(dueDate: string | null, isDaDong: boolean): { label: string; tone: "coral" | "amber" } | null {
  if (!dueDate || isDaDong) return null;
  const todayVN = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const diffDays = Math.round((new Date(`${todayVN}T00:00:00Z`).getTime() - new Date(`${dueDate.slice(0, 10)}T00:00:00Z`).getTime()) / 86400000);
  if (diffDays > 0) return { label: `⚠ Quá hạn ${diffDays} ngày`, tone: "coral" };
  if (diffDays === 0) return { label: "⏰ Đến hạn hôm nay", tone: "amber" };
  if (diffDays === -1) return { label: "⏰ Sắp đến hạn (còn 1 ngày)", tone: "amber" };
  return null;
}

/**
 * Noi dung 1 tien trinh tranh chap: header "me" (trang thai/phan loai/muc do/canh bao qua han) +
 * timeline log "con" (thu gon, chi hien chi tiet khi can) + nut "+ Them log" mo popup rieng thay vi
 * hien san form inline. CHI dung boi CaseDetail.tsx (tab "Tranh chap, khieu nai" trong the chi tiet
 * ca) - nhan "detail" (tienTrinh + logs) tu 1 lan fetch gom cua CA (xem GET
 * /tranh-chap/tien-trinh?case_id=...), KHONG tu fetch rieng theo id nua (CHOT 2026-08-20, rao soat
 * lag: truoc day moi panel tu goi GET /tien-trinh/:id, N+1 khi ca co nhieu tien trinh). "onOpenCase"
 * luon bo qua (undefined) vi da o trong dung ngu canh ca do san - an nut "Xem ca su vu".
 */
export function TienTrinhPanel({
  id,
  detail,
  giaiTrinhNguoiGiaiTrinh,
  currentUser,
  phanLoaiOptions,
  ketQuaOptions,
  onOpenCase,
}: {
  id: string;
  // Du lieu day du (tienTrinh + logs) da duoc CaseDetail.tsx tai san 1 LAN cho TOAN BO tien trinh
  // cua ca (xem GET /tranh-chap/tien-trinh?case_id=...) - CHOT 2026-08-20 (rao soat lag): bo hoan
  // toan viec tung TienTrinhPanel tu goi rieng GET /tien-trinh/:id (N+1 request khi ca co nhieu
  // tien trinh). Component nay LA CONSUMER DUY NHAT cua du lieu tien trinh nen khong can fallback
  // tu fetch rieng nua - luon nhan qua prop.
  detail: TienTrinhDetail;
  // Email nguoi_giai_trinh cua ca (giai_trinh, da tai san o CaseDetail.tsx) - nguon phu de suy ra
  // "Giam sat de xuat" cung voi log tranh chap, xem deriveGiamSatSuggestion().
  giaiTrinhNguoiGiaiTrinh: string[];
  currentUser: AppUser | null;
  phanLoaiOptions: PhanLoaiTranhChapRow[];
  ketQuaOptions: KetQuaXuLyTranhChapRow[];
  onOpenCase?: (id: string) => void;
}) {
  const addToast = useToast();
  const qc = useQueryClient();
  const personDir = usePersonDirectory();
  const [addLogOpen, setAddLogOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<TranhChapLogRow | null>(null);
  const [editMetaOpen, setEditMetaOpen] = useState(false);
  // "Log con" (CHOT 2026-08-20) - ghi chu tien do phu vao dung log CHINH dang mo, khong doi trang
  // thai. "logConOpenFor" = id cua log CHINH dang mo form them nhanh (chi 1 tai 1 thoi diem).
  const [logConOpenFor, setLogConOpenFor] = useState<number | null>(null);
  const [logConText, setLogConText] = useState("");

  const data = detail;

  function invalidateAfterWrite() {
    // Khong con query rieng theo id de invalidate (xem "detail" prop o tren) - invalidate query
    // gom cua ca ("tranh-chap-tien-trinh-case", xem CaseDetail.tsx) la du de keo lai du lieu moi.
    qc.invalidateQueries({ queryKey: ["tranh-chap-tien-trinh"] });
    qc.invalidateQueries({ queryKey: ["tranh-chap-tien-trinh-stats"] });
    qc.invalidateQueries({ queryKey: ["tranh-chap-tien-trinh-case"] });
    qc.invalidateQueries({ queryKey: ["notifications-count"] });
  }

  const addLog = useMutation({
    mutationFn: (body: {
      trang_thai_xu_ly: string;
      thoi_gian_du_kien_xong?: string;
      ghi_chu?: string;
      ket_qua_xu_ly?: string;
      hai_long_sau_tranh_chap?: string;
    }) => api.post(`/tranh-chap/tien-trinh/${encodeURIComponent(id)}/log`, body),
    onSuccess: () => {
      addToast("Đã thêm log xử lý");
      setAddLogOpen(false);
      invalidateAfterWrite();
    },
    onError: (err) => addToast(describeTranhChapError(err, "Không thể thêm log, thử lại sau.")),
  });

  const addLogCon = useMutation({
    mutationFn: ({ logId, noiDung }: { logId: number; noiDung: string }) => api.post(`/tranh-chap/log/${logId}/log-con`, { noi_dung: noiDung }),
    onSuccess: () => {
      addToast("Đã thêm log con");
      setLogConOpenFor(null);
      setLogConText("");
      invalidateAfterWrite();
    },
    onError: (err) => addToast(describeTranhChapError(err, "Không thể thêm log con, thử lại sau.")),
  });

  const editLog = useMutation({
    mutationFn: ({
      logId,
      body,
    }: {
      logId: number;
      body: { trang_thai_xu_ly?: string; thoi_gian_du_kien_xong?: string; ghi_chu?: string; ket_qua_xu_ly?: string; hai_long_sau_tranh_chap?: string };
    }) => api.patch(`/tranh-chap/log/${logId}`, body),
    onSuccess: () => {
      addToast("Đã cập nhật log");
      setEditingLog(null);
      invalidateAfterWrite();
    },
    onError: (err) => addToast(describeTranhChapError(err, "Không thể sửa log, thử lại sau.")),
  });

  const editMeta = useMutation({
    mutationFn: (body: { phan_loai_tranh_chap?: string; muc_do?: string }) => api.patch(`/tranh-chap/tien-trinh/${encodeURIComponent(id)}`, body),
    onSuccess: () => {
      addToast("Đã cập nhật phân loại/mức độ");
      setEditMetaOpen(false);
      invalidateAfterWrite();
    },
    onError: (err) => addToast(describeTranhChapError(err, "Không thể cập nhật, thử lại sau.")),
  });

  const tt = data.tienTrinh;
  const logs = data.logs;
  const latestLog = logs[0];
  const isDaDong = latestLog ? TRANG_THAI_DONG.includes(latestLog.trang_thai_xu_ly) : false;
  const currentPhase = phaseOfStatus(latestLog?.trang_thai_xu_ly ?? null);
  // Them 2026-08-20: giai doan CSKH la trach nhiem cua KSNB Doi tac/TBP DVBH/Admin - an nut "+ Them
  // log" voi Giam sat khu vuc (van xem duoc, canWriteTranhChap van cho, chi khong ghi them duoc nua)
  // khi tien trinh dang o giai doan nay, khop voi canWriteCskhPhase() phia backend.
  // CHOT 2026-08-22: nguoi dang duoc "Dang cho nguoi xu ly" cua log MOI NHAT duoc mo quyen ghi log
  // CHINH + log con cho DUNG tien trinh nay, bat ke vai tro/khu_vuc/giai doan - ho dang "giu bong",
  // can giai trinh duoc ngay ca khi khong thuoc nhom vai tro binh thuong. Khop dung backend (POST
  // /tien-trinh/:id/log, POST /log/:logId/log-con).
  const isAssignedToMe = !!currentUser && !!latestLog?.dang_cho_nguoi_xu_ly && latestLog.dang_cho_nguoi_xu_ly === currentUser.email;
  const canWrite = currentUser
    ? (canWriteTranhChap(currentUser, tt.khu_vuc ?? null) && (currentPhase !== "cskh" || canWriteCskhPhase(currentUser))) || isAssignedToMe
    : false;
  // CHOT 2026-08-21: "log con" (ghi chu giai trinh, KHONG doi trang thai) noi long hon log CHINH -
  // chi can canWriteTranhChap (khong doi hoi them canWriteCskhPhase khi dang o giai doan CSKH) - tat
  // ca vai tro duoc phep xu ly tien trinh nay deu them duoc log con mien tien trinh CHUA DONG. Khop
  // dung thay doi phia backend POST /log/:logId/log-con.
  const canWriteLogCon = currentUser ? canWriteTranhChap(currentUser, tt.khu_vuc ?? null) || isAssignedToMe : false;
  const canEditMeta = currentUser ? canEditTienTrinhMeta(currentUser) && !isDaDong : false;
  const urgency = latestLog ? dueUrgency(latestLog.thoi_gian_du_kien_xong, isDaDong) : null;
  // "Giam sat de xuat" - suy tu lich su cua CHINH ca nay (log tranh chap + giai_trinh, ca hai deu da
  // co san o client), khong con truy van bang users (xem deriveGiamSatSuggestion()).
  const giamSatDeXuat = deriveGiamSatSuggestion(logs, giaiTrinhNguoiGiaiTrinh, personDir);

  return (
    <div className="space-y-3">
      {/* ---- "Me": tien trinh - trang thai/phan loai/muc do/canh bao noi bat ---- */}
      <div
        className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
        style={{ borderLeft: `4px solid ${urgency?.tone === "coral" ? "var(--coral-500)" : MUC_DO_ACCENT[tt.muc_do] ?? "var(--line)"}` }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-mono text-xs text-[var(--ink-400)]">{tt.id}</span>
              {latestLog && <Badge tone={TRANG_THAI_TONE[latestLog.trang_thai_xu_ly] ?? "gray"}>{TRANG_THAI_LABELS[latestLog.trang_thai_xu_ly] ?? latestLog.trang_thai_xu_ly}</Badge>}
            </div>
            <div className="font-display font-bold text-base text-[var(--ink-900)] truncate">{tt.khach_hang ?? "—"}</div>
            <div className="text-xs text-[var(--ink-400)] mt-0.5">
              {shortKhuVuc(tt.khu_vuc)} · Tạo {fmtDateTime(tt.ngay_tao)}
              {giamSatDeXuat.length > 0 && <> · GS từng xử lý: {giamSatDeXuat.map((g) => g.ten ?? g.email).join(", ")}</>}
            </div>
          </div>
          {onOpenCase && (
            <Btn variant="ghost" size="sm" onClick={() => onOpenCase(tt.case_id)} className="shrink-0">
              Xem ca sự vụ ({tt.case_id}) →
            </Btn>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mt-3">
          <Badge tone={phanLoaiTone(tt.phan_loai_tranh_chap)}>{tt.phan_loai_tranh_chap}</Badge>
          <Badge tone={MUC_DO_TONE[tt.muc_do] ?? "gray"}>{MUC_DO_LABELS[tt.muc_do] ?? tt.muc_do}</Badge>
          {canEditMeta && (
            <button className="text-xs text-[var(--ocean-600)] underline ml-0.5" onClick={() => setEditMetaOpen(true)}>
              ✎ Sửa
            </button>
          )}
        </div>

        {urgency && (
          <div
            className={`mt-3 inline-flex items-center gap-1.5 text-xs font-bold rounded-lg px-2.5 py-1.5 ${
              urgency.tone === "coral" ? "bg-[var(--coral-100)] text-[var(--coral-500)]" : "bg-[var(--amber-100)] text-[var(--amber-500)]"
            }`}
          >
            {urgency.label}
          </div>
        )}
      </div>

      {/* ---- "Con": timeline log xu ly ---- */}
      <div>
        <div className="flex items-center justify-between mb-2 px-0.5">
          <div className="text-xs font-semibold text-[var(--ink-400)] uppercase tracking-wide">Lịch sử xử lý ({logs.length})</div>
          {canWrite && !isDaDong && (
            <Btn size="sm" variant="subtle" onClick={() => setAddLogOpen(true)}>
              + Thêm log
            </Btn>
          )}
        </div>

        {logs.length === 0 && <div className="text-xs text-[var(--ink-400)] italic px-0.5">Chưa có log nào.</div>}

        <div className="space-y-2.5">
          {logs.map((log, idx) => {
            const isLatest = idx === 0;
            const isAuthor = currentUser?.email === log.nguoi_xu_ly;
            // Fix 2026-08-27: log.created_at la cot audit RAW UTC (nowUtcSqlite(), khac ngay_xu_ly
            // VN-local) - da quy doi dung qua "+ Z" o tren, KHONG tru them 7 nua (tru truoc day lam
            // cua so sua "con 24h" thanh ~31h thuc te).
            const hoursSince = (Date.now() - new Date(log.created_at.replace(" ", "T") + "Z").getTime()) / 3600000;
            const canEdit = isLatest && isAuthor && hoursSince < 24;
            // CHOT 2026-08-28: "nhac nho nho" khoang cach ngay giua log nay va log LIEN TIEP TRUOC DO
            // (logs xep moi nhat truoc, nen "truoc do" = logs[idx+1]) - khong phan biet co doi nguoi
            // xu ly hay khong, chi la khoang cach thoi gian giua 2 lan cap nhat lien tiep. Ca 2 deu la
            // cot created_at RAW UTC nen tru truc tiep khong can quy doi mui gio. Cung thiet ke (nhan
            // "↳ cach moc truoc X.X ngay", so thap phan) voi tab "Tien trinh chung" (CaseDetail.tsx) -
            // theo yeu cau nguoi dung dong bo giao dien, nhung to dam mau hon de de nhin hon.
            const prevLog = logs[idx + 1];
            const daysSincePrev = prevLog
              ? (new Date(log.created_at.replace(" ", "T") + "Z").getTime() - new Date(prevLog.created_at.replace(" ", "T") + "Z").getTime()) / 86400000
              : null;
            return (
              <div key={log.id} className="relative pl-4">
                <span
                  className="absolute -left-[3px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--surface)]"
                  style={{ background: TRANG_THAI_DOT[log.trang_thai_xu_ly] ?? "var(--ink-400)" }}
                ></span>
                {idx < logs.length - 1 && <span className="absolute left-[1.5px] top-4 bottom-[-14px] w-px bg-[var(--line)]"></span>}
                <div className="border border-[var(--line)] rounded-xl p-2.5 text-sm bg-[var(--surface)]">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Badge tone={TRANG_THAI_TONE[log.trang_thai_xu_ly] ?? "gray"}>{TRANG_THAI_LABELS[log.trang_thai_xu_ly] ?? log.trang_thai_xu_ly}</Badge>
                    {canEdit && (
                      <button className="text-xs text-[var(--ocean-600)] underline" onClick={() => setEditingLog(log)}>
                        Sửa (còn {Math.max(0, Math.ceil(24 - hoursSince))}h)
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-[var(--ink-400)] mt-1">
                    {formatPersonDisplay(log.nguoi_xu_ly, personDir)} · {fmtDateTime(log.ngay_xu_ly)}
                    {log.thoi_gian_du_kien_xong ? ` · Dự kiến xong: ${log.thoi_gian_du_kien_xong}` : ""}
                  </div>
                  {/* CHOT 2026-08-20: log.dang_cho_nguoi_xu_ly da duoc luu tu truoc nhung chua tung
                      hien trong dong lich su - chi thay o cot rieng cua bang "Quan ly tien trinh"
                      (TranhChapModule.tsx), MAT DAU VET ngay tren chinh log da "day" viec cho ai. Hien
                      lai o day de minh bach: ai xem lai lich su cung biet log nay da chuyen giao cho ai. */}
                  {log.dang_cho_nguoi_xu_ly && (
                    <div className="text-xs text-[var(--ocean-600)] font-semibold mt-1">→ Đang chờ: {formatPersonDisplay(log.dang_cho_nguoi_xu_ly, personDir)}</div>
                  )}
                  {(log.ket_qua_xu_ly || log.hai_long_sau_tranh_chap) && (
                    <div className="text-xs mt-1.5 flex gap-1.5 flex-wrap">
                      {log.ket_qua_xu_ly && <Badge tone="ocean">{log.ket_qua_xu_ly}</Badge>}
                      {log.hai_long_sau_tranh_chap && (
                        <Badge tone="teal">{HAI_LONG_OPTIONS.find((h) => h.value === log.hai_long_sau_tranh_chap)?.label ?? log.hai_long_sau_tranh_chap}</Badge>
                      )}
                    </div>
                  )}
                  {log.ghi_chu && <div className="text-xs mt-1.5 whitespace-pre-wrap text-[var(--ink-600)]">{log.ghi_chu}</div>}

                  {/* "Log con" (CHOT 2026-08-20, quyen noi long 2026-08-21) - ghi chu tien do phu trong
                      luc log CHINH nay dang mo, khong doi trang thai. Chi log MOI NHAT (isLatest) cua
                      tien trinh CHUA DONG moi cho them moi (khop dieu kien backend POST
                      /log/:logId/log-con) - quyen la canWriteLogCon (RONG HON canWrite cua log chinh,
                      khong doi hoi canWriteCskhPhase), nhung log con DA CO thi hien voi MOI log (lich
                      su khong bien mat khi co log moi hon). */}
                  {log.logCon.length > 0 && (
                    <div className="mt-2 pl-2.5 border-l-2 border-[var(--line)] space-y-1">
                      {log.logCon.map((lc) => (
                        <div key={lc.id} className="text-xs">
                          <span className="text-[var(--ink-400)]">
                            {formatPersonDisplay(lc.nguoi_ghi, personDir)} · {fmtDateTime(lc.created_at)}
                          </span>
                          <div className="text-[var(--ink-600)] whitespace-pre-wrap">{lc.noi_dung}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isLatest && canWriteLogCon && !isDaDong && (
                    logConOpenFor === log.id ? (
                      <div className="mt-2 space-y-1.5">
                        <textarea
                          value={logConText}
                          onChange={(e) => setLogConText(e.target.value)}
                          rows={2}
                          autoFocus
                          placeholder="Ghi chú tiến độ xử lý…"
                          className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-xs"
                        />
                        <div className="flex items-center gap-2">
                          <Btn
                            size="sm"
                            disabled={!logConText.trim() || addLogCon.isPending}
                            onClick={() => addLogCon.mutate({ logId: log.id, noiDung: logConText.trim() })}
                          >
                            {addLogCon.isPending ? "Đang lưu…" : "Lưu"}
                          </Btn>
                          <Btn size="sm" variant="ghost" onClick={() => { setLogConOpenFor(null); setLogConText(""); }}>
                            Hủy
                          </Btn>
                        </div>
                      </div>
                    ) : (
                      <button className="text-xs text-[var(--ocean-600)] underline mt-1.5" onClick={() => { setLogConOpenFor(log.id); setLogConText(""); }}>
                        + Thêm log con
                      </button>
                    )
                  )}
                </div>
                {daysSincePrev !== null && (
                  <div className="text-[11px] font-semibold text-[var(--coral-600)] pt-1.5">
                    ↳ cách log trước <strong>{daysSincePrev.toFixed(1)} ngày</strong>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {isDaDong && <div className="text-xs text-[var(--ink-400)] italic mt-2 px-0.5">Tiến trình đã đóng.</div>}
      </div>

      {addLogOpen && (
        <LogFormModal
          title="Thêm log xử lý mới"
          submitLabel="Thêm log"
          // CHOT 2026-08-28: "dang_cho_nguoi_xu_ly" ke thua tu log GAN NHAT thay vi luon rong - truoc
          // day form nay luon bat dau trong, khien nguoi dang duoc gan (VD Giam sat X dang "giu bong")
          // vo tinh XOA MAT phan gan cua chinh minh moi khi ho tu them 1 log cap nhat ma khong chu dong
          // chon lai ten minh trong dropdown - dan toi mat quyen ghi log tiep theo (isAssignedToMe dua
          // vao dung gia tri nay). Nguoi dung van sua/xoa duoc binh thuong, chi khac o gia tri MAC DINH.
          initial={{
            trang_thai_xu_ly: "",
            thoi_gian_du_kien_xong: latestLog?.thoi_gian_du_kien_xong ?? "",
            ghi_chu: "",
            ket_qua_xu_ly: "",
            hai_long_sau_tranh_chap: "",
            dang_cho_nguoi_xu_ly: latestLog?.dang_cho_nguoi_xu_ly ?? "",
          }}
          ketQuaOptions={ketQuaOptions}
          latestTrangThai={latestLog?.trang_thai_xu_ly ?? null}
          giamSatPhuTrach={giamSatDeXuat}
          onClose={() => setAddLogOpen(false)}
          onSubmit={(body) => addLog.mutate(body)}
          isPending={addLog.isPending}
        />
      )}

      {editingLog && (
        <LogFormModal
          title={`Sửa log — ${TRANG_THAI_LABELS[editingLog.trang_thai_xu_ly] ?? editingLog.trang_thai_xu_ly}`}
          submitLabel="Lưu"
          initial={{
            trang_thai_xu_ly: editingLog.trang_thai_xu_ly,
            thoi_gian_du_kien_xong: editingLog.thoi_gian_du_kien_xong ?? "",
            ghi_chu: editingLog.ghi_chu ?? "",
            ket_qua_xu_ly: editingLog.ket_qua_xu_ly ?? "",
            hai_long_sau_tranh_chap: editingLog.hai_long_sau_tranh_chap ?? "",
            dang_cho_nguoi_xu_ly: editingLog.dang_cho_nguoi_xu_ly ?? "",
          }}
          ketQuaOptions={ketQuaOptions}
          // Giai doan tinh tu log NGAY TRUOC log dang sua (khong phai chinh no) - editingLog luon la
          // logs[0] (chi log moi nhat moi sua duoc, xem canEdit), nen log truoc no la logs[1].
          latestTrangThai={logs[1]?.trang_thai_xu_ly ?? null}
          onClose={() => setEditingLog(null)}
          onSubmit={(body) => editLog.mutate({ logId: editingLog.id, body })}
          isPending={editLog.isPending}
        />
      )}

      {editMetaOpen && (
        <EditMetaModal
          phanLoai={tt.phan_loai_tranh_chap}
          mucDo={tt.muc_do}
          phanLoaiOptions={phanLoaiOptions}
          onClose={() => setEditMetaOpen(false)}
          onSubmit={(body) => editMeta.mutate(body)}
          isPending={editMeta.isPending}
        />
      )}
    </div>
  );
}

function LogFormModal({
  title,
  submitLabel,
  initial,
  ketQuaOptions,
  latestTrangThai,
  giamSatPhuTrach = [],
  onClose,
  onSubmit,
  isPending,
}: {
  title: string;
  submitLabel: string;
  initial: { trang_thai_xu_ly: string; thoi_gian_du_kien_xong: string; ghi_chu: string; ket_qua_xu_ly: string; hai_long_sau_tranh_chap: string; dang_cho_nguoi_xu_ly?: string | null };
  ketQuaOptions: KetQuaXuLyTranhChapRow[];
  // Trang thai cua log NGAY TRUOC log dang them/sua - quyet dinh giai doan (Giam sat/CSKH) duoc phep
  // chon o day (chot 2026-07-31 diem 1: khong cho quay lai giai doan Giam sat sau khi da chuyen CSKH).
  latestTrangThai: string | null;
  // Giam sat suy tu lich su cua CHINH ca nay (log tranh chap + giai_trinh, xem
  // deriveGiamSatSuggestion() trong tranhChapShared.ts) - dung tu dong dien "Dang cho nguoi xu ly"
  // khi CSKH "Chuyen lai giam sat xu ly". CHOT 2026-08-20 (rao soat lag): doi tu "Giam sat phu trach
  // KHU VUC" (tra cuu qua users.khu_vuc_phu_trach, quet ca bang users moi lan mo tien trinh) sang
  // "Giam sat DA TUNG XU LY CA NAY" (suy tu du lieu co san o client, khong quet DB nua).
  giamSatPhuTrach?: GiamSatInfo[];
  onClose: () => void;
  onSubmit: (body: { trang_thai_xu_ly: string; thoi_gian_du_kien_xong?: string; ghi_chu?: string; ket_qua_xu_ly?: string; hai_long_sau_tranh_chap?: string; dang_cho_nguoi_xu_ly?: string | null }) => void;
  isPending: boolean;
}) {
  const [trangThai, setTrangThai] = useState(initial.trang_thai_xu_ly);
  const [ngayDuKien, setNgayDuKien] = useState(initial.thoi_gian_du_kien_xong);
  const [ghiChu, setGhiChu] = useState(initial.ghi_chu);
  const [ketQua, setKetQua] = useState(initial.ket_qua_xu_ly);
  const [haiLong, setHaiLong] = useState(initial.hai_long_sau_tranh_chap);
  const [dangCho, setDangCho] = useState(initial.dang_cho_nguoi_xu_ly || "");

  const auth = useAuth();
  const user = auth.status === "authenticated" ? auth.user : null;

  const canKetQua = TRANG_THAI_CAN_KET_QUA.includes(trangThai);
  const currentPhase = phaseOfStatus(latestTrangThai);
  let phaseOptions: { value: string; label: string }[] = currentPhase === "cskh"
    ? CSKH_STATUS_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))
    : GIAM_SAT_STATUS_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }));

  const isKsnbOrAdmin = !!user?.la_ksnb_doi_tac || user?.vai_tro === "Admin";
  if (isKsnbOrAdmin && currentPhase === "cskh") {
    if (!phaseOptions.some((opt) => opt.value === "Giam sat chua xu ly")) {
      phaseOptions.push({ value: "Giam sat chua xu ly", label: "Chuyển lại giám sát xử lý" });
    }
  }

  const { data: handlingUsersData } = useQuery({
    queryKey: ["tranh-chap-handling-users"],
    queryFn: () => api.get<{ rows: { email: string; ten: string; vai_tro: string }[] }>("/tranh-chap/handling-users"),
  });
  const handlingUsers = handlingUsersData?.rows ?? [];

  // "Chuyen lai giam sat xu ly" (trangThai === "Giam sat chua xu ly" trong LUC dang o giai doan CSKH,
  // khac voi gia tri nay xuat hien binh thuong o giai doan Giam sat) cung can chon "Dang cho nguoi xu
  // ly" - CHOT 2026-08-20: tu dong dien Giam sat DA TUNG XU LY ca nay (neu xac dinh duoc DUY NHAT
  // 1 nguoi tu deriveGiamSatSuggestion()), nguoi tao log van chon lai duoc neu sai.
  const isChuyenLaiGiamSat = trangThai === "Giam sat chua xu ly" && currentPhase === "cskh";
  const showDangCho = trangThai === "Giam sat dang xu ly" || trangThai === "CSKH dang xu ly" || isChuyenLaiGiamSat;

  function handleTrangThaiChange(value: string) {
    setTrangThai(value);
    if (value === "Giam sat chua xu ly" && currentPhase === "cskh" && !dangCho && giamSatPhuTrach.length === 1) {
      setDangCho(giamSatPhuTrach[0].email);
    }
  }

  return (
    <Modal open onClose={onClose} title={title} width="max-w-lg">
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-[var(--ink-400)]">Trạng thái xử lý</label>
          <Select value={trangThai} onChange={handleTrangThaiChange} options={[{ value: "", label: "Chọn trạng thái…" }, ...phaseOptions]} className="w-full mt-1" />
        </div>
        {showDangCho && (
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Đang chờ người xử lý{isChuyenLaiGiamSat ? " *" : ""}</label>
            <Select
              value={dangCho}
              onChange={setDangCho}
              options={[
                { value: "", label: "Chọn người xử lý…" },
                ...handlingUsers.map((u) => ({ value: u.email, label: `${u.ten} (${u.vai_tro} - ${u.email})` })),
              ]}
              className="w-full mt-1"
            />
            {isChuyenLaiGiamSat && (
              <div className="text-[11px] text-[var(--ink-400)] mt-1">
                {giamSatPhuTrach.length === 1
                  ? `Đã tự động chọn Giám sát từng xử lý ca này — chọn lại nếu không đúng.`
                  : giamSatPhuTrach.length > 1
                    ? `Ca này từng có nhiều Giám sát xử lý (${giamSatPhuTrach.map((g) => g.ten ?? g.email).join(", ")}) — vui lòng chọn.`
                    : `Không xác định được Giám sát từng xử lý ca này — vui lòng chọn thủ công.`}
              </div>
            )}
          </div>
        )}
        <div>
          <label className="text-xs font-semibold text-[var(--ink-400)]">Ngày dự kiến xử lý xong</label>
          <input
            type="date"
            value={ngayDuKien}
            onChange={(e) => setNgayDuKien(e.target.value)}
            className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
          />
        </div>
        {canKetQua && (
          <>
            <div>
              <label className="text-xs font-semibold text-[var(--ink-400)]">Kết quả xử lý *</label>
              {ketQuaOptions.length ? (
                <Select
                  value={ketQua}
                  onChange={setKetQua}
                  options={[
                    { value: "", label: "Chọn kết quả xử lý…" },
                    ...ketQuaOptions.map((k) => ({ value: k.ten_ket_qua, label: k.ten_ket_qua })),
                  ]}
                  className="w-full mt-1"
                />
              ) : (
                <div className="text-xs text-[var(--coral-500)] mt-1">Chưa có danh mục — vào Settings → Kết quả xử lý tranh chấp để thêm trước.</div>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--ink-400)]">Hài lòng sau tranh chấp *</label>
              <Select value={haiLong} onChange={setHaiLong} options={[{ value: "", label: "Chọn mức hài lòng…" }, ...HAI_LONG_OPTIONS]} className="w-full mt-1" />
            </div>
          </>
        )}
        <div>
          <label className="text-xs font-semibold text-[var(--ink-400)]">Ghi chú</label>
          <textarea
            value={ghiChu}
            onChange={(e) => setGhiChu(e.target.value)}
            rows={3}
            placeholder="Ghi chú…"
            className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>
            Hủy
          </Btn>
          <Btn
            onClick={() =>
              onSubmit({
                trang_thai_xu_ly: trangThai,
                thoi_gian_du_kien_xong: ngayDuKien || undefined,
                ghi_chu: ghiChu.trim() || undefined,
                ket_qua_xu_ly: canKetQua ? ketQua : undefined,
                hai_long_sau_tranh_chap: canKetQua ? haiLong : undefined,
                dang_cho_nguoi_xu_ly: showDangCho ? dangCho || null : null,
              })
            }
            disabled={!trangThai || (canKetQua && (!ketQua || !haiLong)) || (isChuyenLaiGiamSat && !dangCho) || isPending}
          >
            {isPending ? "Đang lưu…" : submitLabel}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

function EditMetaModal({
  phanLoai,
  mucDo,
  phanLoaiOptions,
  onClose,
  onSubmit,
  isPending,
}: {
  phanLoai: string;
  mucDo: string;
  phanLoaiOptions: PhanLoaiTranhChapRow[];
  onClose: () => void;
  onSubmit: (body: { phan_loai_tranh_chap: string; muc_do: string }) => void;
  isPending: boolean;
}) {
  const [phanLoaiValue, setPhanLoaiValue] = useState(phanLoai);
  const [mucDoValue, setMucDoValue] = useState(mucDo);

  return (
    <Modal open onClose={onClose} title="Sửa phân loại / mức độ" width="max-w-md">
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-[var(--ink-400)]">Phân loại tranh chấp</label>
          <Select value={phanLoaiValue} onChange={setPhanLoaiValue} options={phanLoaiOptions.map((p) => p.ten_phan_loai)} className="w-full mt-1" />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--ink-400)]">Mức độ</label>
          <Select value={mucDoValue} onChange={setMucDoValue} options={MUC_DO_OPTIONS} className="w-full mt-1" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>
            Hủy
          </Btn>
          <Btn onClick={() => onSubmit({ phan_loai_tranh_chap: phanLoaiValue, muc_do: mucDoValue })} disabled={isPending}>
            {isPending ? "Đang lưu…" : "Lưu"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
