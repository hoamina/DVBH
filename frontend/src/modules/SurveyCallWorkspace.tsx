import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../components/ui/Btn";
import { Badge, statusTone } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { LoadingCard } from "../components/ui/LoadingCard";
import { Select } from "../components/ui/Select";
import { KhuVucFilterControl } from "../components/KhuVucFilterControl";
import { KtvNameWithPhone, KTV_PHONE_EDIT_ROLES } from "../components/KtvNameWithPhone";
import { api, buildQuery } from "../api/client";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/AuthContext";
import { LOAI_LOI_META, fmtDateTime, type LoaiLoi, type CaseRow, type ViPhamRow, type KetQuaGoiRow } from "../types";
import { QLDVBH_FILTER_VALUE } from "../constants";
import { CanKhaoSatRow, neededLoaiLoi } from "./SurveyModule";
import { useSurveyCandidates } from "../hooks/useSurveyCandidates";
import { shortKhuVuc } from "../lib/khuVucShortLabel";

type QueueSource = "qua-han" | "can-khao-sat" | "ad-hoc";
interface QueueItem extends CanKhaoSatRow {
  __source: QueueSource;
}

const KET_QUA_GOI_OPTIONS = [
  { value: "Liên hệ thành công", label: "✅ Liên hệ thành công" },
  { value: "Không nghe máy", label: "📵 Không nghe máy" },
  { value: "Số sai / không liên lạc được", label: "🚫 Số sai / không liên lạc được" },
  { value: "Không cần khảo sát", label: "➖ Không cần khảo sát" },
];

const LY_DO_THAT_BAI_OPTIONS = ["Khách không nghe máy", "Thuê bao không liên lạc được", "Số điện thoại sai", "Khách hẹn gọi lại giờ khác", "Khác"];

function buildAdHocRow(detail: { case: CaseRow; viPham: ViPhamRow[] }): QueueItem {
  const c = detail.case;
  const already = new Set(detail.viPham.map((v) => v.loai_loi));
  return {
    id: c.id,
    khach_hang: c.khach_hang,
    khu_vuc: c.khu_vuc,
    assigned_to: c.assigned_to,
    need_loi_120p: c.loi_120p === 1 && !already.has("Loi 120 phut") ? 1 : 0,
    need_loi_qua_han_24h: c.loi_qua_han_24h === 1 && !already.has("Hen qua 24h") ? 1 : 0,
    need_loi_lo_ke_hoach: c.loi_lo_ke_hoach === 1 && !already.has("Loi lo ke hoach") ? 1 : 0,
    need_loi_kh_hen_lai: c.loi_kh_hen_lai === 1 && !already.has("KH hen lai") ? 1 : 0,
    mo_ta_loi: c.mo_ta_loi,
    ky_thuat_vien: c.ky_thuat_vien,
    tinh: c.tinh,
    quan_huyen: c.quan_huyen,
    thoi_gian_cskh_tiep_nhan: c.thoi_gian_cskh_tiep_nhan,
    thoi_gian_hen_xu_ly: c.thoi_gian_hen_xu_ly,
    thoi_gian_hoan_thanh: c.thoi_gian_hoan_thanh,
    link_crm: c.link_crm,
    noi_dung_xu_ly: c.noi_dung_xu_ly,
    __source: "ad-hoc",
  };
}

export function SurveyCallWorkspace({
  onExit,
  openCase,
  initialKhuVuc,
  initialAdHocId,
}: {
  onExit: () => void;
  openCase: (id: string, tab?: string) => void;
  initialKhuVuc?: string;
  initialAdHocId?: string;
}) {
  const auth = useAuth();
  const me = auth.status === "authenticated" ? auth.user.email : "";
  const role = auth.status === "authenticated" ? auth.user.vai_tro : null;
  const myAreas = auth.status === "authenticated" ? auth.user.khu_vuc_phu_trach : [];
  const addToast = useToast();
  const qc = useQueryClient();

  const [khuVucFilter, setKhuVucFilter] = useState(initialKhuVuc ?? "");
  // CHOT 2026-08-02: hang doi gioi han theo thang mo ca (thoi_gian_cskh_tiep_nhan) - mac dinh thang
  // hien tai, xem hooks/useSurveyCandidates.ts + backend/src/routes/survey.ts GET /candidates.
  const [thang, setThang] = useState(new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7));
  const [onlyMine, setOnlyMine] = useState(role === "CSKH");
  // Tach rieng voi onlyMine: ca chua gan ai chi duoc nap vao pool sau khi bam nut "Goi them ca
  // chua gan" (xem man hinh het hang doi ben duoi) - khong tu dong bat, khong luu qua phien lam
  // viec khac (reset ve false moi lan mo lai workspace).
  const [includeUnassigned, setIncludeUnassigned] = useState(false);
  // "Goi ca ca qua han" - CHOT 2026-08-22 lan 7: mac dinh TAT (khong gop nhanh "qua-han" vao hang
  // doi goi) - truoc day workspace luon gop CA 2 nhanh (qua-han uu tien truoc + can-khao-sat), chu
  // he thong phan anh ca qua han (vd 1276749, da qua han tu lau) van xuat hien lam nham la thuoc
  // "Can goi" (1515 ca). Gio phai chu dong tich moi thay ca qua han trong hang doi.
  const [includeOverdue, setIncludeOverdue] = useState(false);
  const [index, setIndex] = useState(0);
  const [sessionDone, setSessionDone] = useState(0);
  const [sessionRetry, setSessionRetry] = useState(0);
  const [calledIds, setCalledIds] = useState<Set<string>>(new Set());
  const [bumpOrder, setBumpOrder] = useState<Map<string, number>>(new Map());
  const bumpCounter = useRef(0);
  const [adHocId, setAdHocId] = useState<string | null>(initialAdHocId ?? null);
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [workspaceSort, setWorkspaceSort] = useState<"default" | "ngay-tao" | "ktv">("default");
  const [workspaceKtv, setWorkspaceKtv] = useState("");

  const { data: khuVucOptions } = useQuery({
    queryKey: ["dashboard-filters"],
    queryFn: () => api.get<{ khuVuc: string[]; hang: string[] }>("/dashboard/filters"),
  });
  const { data: monthOptions } = useQuery({
    queryKey: ["dashboard-months"],
    queryFn: () => api.get<{ months: string[] }>("/dashboard/months"),
  });
  const thangSelectOptions = (monthOptions?.months ?? []).map((m) => ({ value: m, label: m }));
  if (!thangSelectOptions.some((o) => o.value === thang)) {
    thangSelectOptions.unshift({ value: thang, label: `${thang} (hiện tại)` });
  }

  // Doc song tu D1, gioi han theo thang mo ca (xem hooks/useSurveyCandidates.ts) - dung chung
  // hook/queryKey voi SurveyModule.tsx nen 2 man cung mo 1 thang se chia se 1 lan fetch.
  const { canKhaoSat: canKhaoSatAll, quaHanKhaoSat: quaHanKhaoSatAll, isLoading: candidatesLoading, refetch: refetchCandidates } = useSurveyCandidates({ thang });

  const availableWorkspaceKtvs = useMemo(() => {
    const ktvs = new Set<string>();
    const merged = [...(quaHanKhaoSatAll ?? []), ...(canKhaoSatAll ?? [])];
    for (const r of merged) {
      if (r.ky_thuat_vien) ktvs.add(r.ky_thuat_vien.trim());
    }
    return Array.from(ktvs).sort((a, b) => a.localeCompare(b, "vi"));
  }, [quaHanKhaoSatAll, canKhaoSatAll]);

  function matchKhuVuc(khuVuc: string | null): boolean {
    if (!khuVucFilter) return true;
    if (khuVucFilter === QLDVBH_FILTER_VALUE) return !!khuVuc && khuVuc.includes("qldvbh");
    const set = new Set(
      khuVucFilter
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    );
    return !!khuVuc && set.has(khuVuc);
  }

  const initialLoading = candidatesLoading;

  const { data: adHocDetail, isFetching: adHocLoading } = useQuery({
    queryKey: ["survey-workspace-case", adHocId],
    queryFn: () => api.get<{ case: CaseRow; viPham: ViPhamRow[] }>(`/cases/${adHocId}`),
    enabled: adHocId !== null,
  });

  // Hang doi = quá hạn (khẩn cấp hơn, chưa khảo sát dù đã hoàn thành >3 ngày) truoc, roi den cần
  // khảo sát; loc theo onlyMine + bo qua ca da xu ly xong trong phien nay; bump len cuoi neu goi
  // khong lien he duoc (con_goi_lai) de quay lai thu sau, khong bi ket cung 1 cho.
  const pool = useMemo<QueueItem[]>(() => {
    // "includeOverdue" mac dinh FALSE (CHOT 2026-08-22 lan 7) - nhanh "qua-han" chi gop vao hang doi
    // khi CSKH chu dong tich "Gọi cả ca quá hạn", tranh nham la thuoc "Cần gọi".
    const quaHanRows = includeOverdue ? quaHanKhaoSatAll.filter((r) => matchKhuVuc(r.khu_vuc)).map((r) => ({ ...r, __source: "qua-han" as const })) : [];
    const canKhaoSatRows = canKhaoSatAll.filter((r) => matchKhuVuc(r.khu_vuc)).map((r) => ({ ...r, __source: "can-khao-sat" as const }));
    let merged = [...quaHanRows, ...canKhaoSatRows]
      .filter((r) => !calledIds.has(r.id))
      .filter((r) => !onlyMine || !r.assigned_to || r.assigned_to === me)
      // Khi onlyMine bat: ca chua gan ai (tier 1) chi vao pool sau khi CSKH chu dong bam "Goi them
      // ca chua gan" (includeUnassigned) - truoc do hang doi chi gom ca da gan dung minh (tier 0).
      // Khi onlyMine tat (lead xem toan doi), khong tier hoa - giu nguyen hanh vi cu.
      .filter((r) => !onlyMine || includeUnassigned || r.assigned_to === me);

    // Lọc theo KTV trong workspace
    if (workspaceKtv) {
      merged = merged.filter((r) => r.ky_thuat_vien?.trim() === workspaceKtv.trim());
    }

    const srcRank = (x: QueueItem) => (x.__source === "qua-han" ? 0 : 1);
    // Ca da gan dung nguoi dang goi (tier 0) luon xep truoc ca chua gan ai (tier 1) - dung cho ca
    // 2 che do onlyMine: bat (chi tier 0 cho toi khi bam nut mo rong) hoac tat (tier hoa toan bo
    // hang doi cua ca doi, nhung van uu tien ca da gan cho minh truoc).
    const tierOf = (x: QueueItem) => (x.assigned_to === me ? 0 : 1);
    // Ca "goi lai sau" (da bump) luon xep sau MOI ca chua thu goi lan nao, bat ke tier khan cap -
    // neu khong, 1 ca qua han duy nhat con lai se cu quay lai ngay lap tuc sau khi bam "goi lai sau",
    // pha vo cam giac "tu dong next" ma telesale can.
    merged.sort((a, b) => {
      const bumpA = bumpOrder.get(a.id) ?? 0;
      const bumpB = bumpOrder.get(b.id) ?? 0;
      const attemptedDiff = (bumpA > 0 ? 1 : 0) - (bumpB > 0 ? 1 : 0);
      if (attemptedDiff !== 0) return attemptedDiff;

      // Sắp xếp theo chế độ lựa chọn
      if (workspaceSort === "ngay-tao") {
        const da = a.thoi_gian_cskh_tiep_nhan ? new Date(a.thoi_gian_cskh_tiep_nhan).getTime() : 0;
        const db = b.thoi_gian_cskh_tiep_nhan ? new Date(b.thoi_gian_cskh_tiep_nhan).getTime() : 0;
        if (da !== db) return da - db; // cũ nhất trước
      } else if (workspaceSort === "ktv") {
        const ktvA = a.ky_thuat_vien ?? "";
        const ktvB = b.ky_thuat_vien ?? "";
        const ktvDiff = ktvA.localeCompare(ktvB, "vi");
        if (ktvDiff !== 0) return ktvDiff;
        const da = a.thoi_gian_cskh_tiep_nhan ? new Date(a.thoi_gian_cskh_tiep_nhan).getTime() : 0;
        const db = b.thoi_gian_cskh_tiep_nhan ? new Date(b.thoi_gian_cskh_tiep_nhan).getTime() : 0;
        if (da !== db) return da - db;
      } else {
        const tierDiff = tierOf(a) - tierOf(b);
        if (tierDiff !== 0) return tierDiff;
        const rankDiff = srcRank(a) - srcRank(b);
        if (rankDiff !== 0) return rankDiff;
      }

      if (bumpA > 0 && bumpA !== bumpB) return bumpA - bumpB;
      return a.id.localeCompare(b.id);
    });
    return merged;
  }, [quaHanKhaoSatAll, canKhaoSatAll, khuVucFilter, calledIds, onlyMine, includeUnassigned, includeOverdue, me, bumpOrder, workspaceKtv, workspaceSort]);

  // Con ca chua gan ai trong pham vi loc hien tai (chua tinh includeUnassigned) - dung de quyet
  // dinh co hien nut "Goi them ca chua gan" hay khong (chi hien khi tier 0 that su da can).
  const hasUnassignedAvailable = useMemo(() => {
    if (!onlyMine || includeUnassigned) return false;
    const quaHanRows = includeOverdue ? quaHanKhaoSatAll.filter((r) => matchKhuVuc(r.khu_vuc)) : [];
    const canKhaoSatRows = canKhaoSatAll.filter((r) => matchKhuVuc(r.khu_vuc));
    return [...quaHanRows, ...canKhaoSatRows].some((r) => !calledIds.has(r.id) && !r.assigned_to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quaHanKhaoSatAll, canKhaoSatAll, khuVucFilter, calledIds, onlyMine, includeUnassigned, includeOverdue]);

  const currentIndex = pool.length === 0 ? -1 : Math.min(index, pool.length - 1);
  const queueRow = currentIndex >= 0 ? pool[currentIndex] : null;
  const adHocRow = adHocId && adHocDetail ? buildAdHocRow(adHocDetail) : null;
  const activeRow = adHocId ? adHocRow : queueRow;

  // Lich su cuoc goi truoc do + cac loi DA CHOT cua ca dang xem - CHOT 2026-08-22 lan 2, chu he
  // thong yeu cau "them log lich su goi khi vao che do cuoc goi" de CSKH biet cac lan lien he truoc,
  // tranh hoi lai/lam lai viec da lam. Lan 4: them "viPham" - "khong hieu tai sao ca do van phai
  // goi lai" khi case da co loi duoc chot tu truoc (vd ca con_loi_chua_goi: da chot 2/3 loi, con
  // 1 loi chua goi) - can hien ro KET LUAN da chot cho tung loai_loi, khong chi log cuoc goi tho.
  const { data: callHistoryData } = useQuery({
    queryKey: ["survey-call-history-by-case", activeRow?.id],
    queryFn: () => api.get<{ rows: KetQuaGoiRow[]; viPham: ViPhamRow[] }>(`/survey/call-history-by-case${buildQuery({ case_id: activeRow?.id })}`),
    enabled: !!activeRow?.id,
  });
  const callHistoryRows = callHistoryData?.rows ?? [];
  const priorViPham = callHistoryData?.viPham ?? [];

  function goNext() {
    if (pool.length === 0) return;
    setIndex((currentIndex + 1) % pool.length);
  }
  function goPrev() {
    if (pool.length === 0) return;
    setIndex((currentIndex - 1 + pool.length) % pool.length);
  }

  async function handleSearch() {
    const q = searchQ.trim();
    if (!q) return;
    const foundIdx = pool.findIndex((r) => r.id === q);
    if (foundIdx >= 0) {
      setIndex(foundIdx);
      setAdHocId(null);
      setSearchQ("");
      return;
    }
    setSearching(true);
    try {
      // Khong can popup nhieu ket qua nhu TopBar (xem GlobalSearch) - workspace nay chi can 1 ca de
      // khao sat ad-hoc, lay ca dau tien (moi hoan thanh nhat, do /search ORDER BY thoi_gian_hoan_thanh
      // DESC) neu Serial trung nhieu ca.
      const res = await api.get<{ matches: { id: string }[] }>(`/cases/search?q=${encodeURIComponent(q)}`);
      const foundId = res.matches[0]?.id ?? null;
      if (!foundId) {
        addToast("Không tìm thấy ca với ID / Serial này.");
        return;
      }
      setAdHocId(foundId);
      setSearchQ("");
    } finally {
      setSearching(false);
    }
  }

  // ---- Form ghi nhan cuoc goi ----
  const [contactType, setContactType] = useState("Khách hàng");
  const [callResult, setCallResult] = useState("Liên hệ thành công");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [ketLuan, setKetLuan] = useState<Record<string, "loi" | "khong_loi">>({});
  const [ketQuaCap1, setKetQuaCap1] = useState("Loi khong lien he");
  const [ghiChu, setGhiChu] = useState("");
  const [lyDoThatBai, setLyDoThatBai] = useState(LY_DO_THAT_BAI_OPTIONS[0]);
  const [canGoiLai, setCanGoiLai] = useState(true);

  useEffect(() => {
    if (!activeRow) return;
    const needed = neededLoaiLoi(activeRow);
    setContactType("Khách hàng");
    setCallResult("Liên hệ thành công");
    setSelected(Object.fromEntries(needed.map((k) => [k, false])));
    setKetLuan(Object.fromEntries(needed.map((k) => [k, "khong_loi"])));
    setKetQuaCap1("Loi khong lien he");
    setGhiChu("");
    setLyDoThatBai(LY_DO_THAT_BAI_OPTIONS[0]);
    setCanGoiLai(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRow?.id]);

  const submitCall = useMutation({
    mutationFn: (payload: {
      case_id: string;
      doi_tuong_lien_he: string;
      ket_qua_cuoc_goi: string;
      ghi_chu?: string;
      ly_do_that_bai?: string;
      can_goi_lai?: boolean;
      results: { loai_loi: LoaiLoi; ket_luan: "loi" | "khong_loi"; ket_qua_cap_1?: string }[];
    }) => api.post<{ id: string; daGhiNhan: LoaiLoi[]; boQua: LoaiLoi[] }>("/survey/calls", payload),
  });

  async function submitSuccessCall() {
    if (!activeRow) return;
    const needed = neededLoaiLoi(activeRow);
    const chosen = needed.filter((k) => selected[k]);
    if (callResult === "Liên hệ thành công" && chosen.length === 0) {
      addToast("Chọn kết luận cho ít nhất 1 loại lỗi trước khi lưu.");
      return;
    }
    try {
      const data = await submitCall.mutateAsync({
        case_id: activeRow.id,
        doi_tuong_lien_he: contactType,
        ket_qua_cuoc_goi: callResult,
        ghi_chu: ghiChu || undefined,
        results: callResult === "Không cần khảo sát"
          ? needed.map((loai) => ({ loai_loi: loai, ket_luan: "khong_loi" as const }))
          : chosen.map((loai) => ({ loai_loi: loai, ket_luan: ketLuan[loai], ket_qua_cap_1: ketLuan[loai] === "loi" ? ketQuaCap1 : undefined })),
      });
      // Case chi thuc su "xong" (roi khoi hang doi) khi TAT CA loai_loi can khao sat da co ket qua -
      // gom ca loai vua ghi nhan (daGhiNhan) LAN loai da duoc nguoi khac ghi nhan truoc do (boQua).
      // Neu agent chi chon 1 phan (vd 1/2 loai_loi), cac loai con lai VAN can xu ly - khong duoc
      // them vao calledIds (se an vinh vien case khoi hang doi phien nay, xem BUG report).
      const resolvedThisRound = new Set([...data.daGhiNhan, ...data.boQua]);
      const remaining = needed.filter((k) => !resolvedThisRound.has(k));
      if (remaining.length === 0) {
        setCalledIds((prev) => new Set(prev).add(activeRow.id));
      } else {
        // Dung dung co che "goi lai sau" cua submitFailedCall - day case xuong cuoi hang doi thay vi
        // an di, van tu dong chuyen sang ca tiep theo qua currentIndex.
        bumpCounter.current += 1;
        setBumpOrder((prev) => new Map(prev).set(activeRow.id, bumpCounter.current));
      }
      setSessionDone((n) => n + 1);
      qc.invalidateQueries({ queryKey: ["survey-counts"] });
      refetchCandidates();
      if (adHocId) setAdHocId(null);
      if (remaining.length > 0) {
        const remainLabel = remaining.map((l) => LOAI_LOI_META[l]?.short ?? l).join(", ");
        addToast(`Đã lưu kết quả cho ca ${activeRow.id}. Còn "${remainLabel}" chưa xử lý — ca sẽ quay lại cuối hàng đợi để hoàn tất.`);
      } else if (data.boQua.length > 0) {
        const label = data.boQua.map((l) => LOAI_LOI_META[l]?.short ?? l).join(", ");
        addToast(
          data.daGhiNhan.length > 0
            ? `Đã lưu ${data.daGhiNhan.length} lỗi cho ca ${activeRow.id}. "${label}" người khác đã ghi nhận trước — chuyển ca tiếp theo.`
            : `Ca ${activeRow.id}: "${label}" đã được người khác ghi nhận trước, không có gì để lưu thêm — chuyển ca tiếp theo.`,
        );
      } else {
        addToast(`Đã ghi nhận kết quả khảo sát ca ${activeRow.id} — chuyển ca tiếp theo.`);
      }
    } catch {
      addToast("Không thể lưu kết quả khảo sát, thử lại.");
    }
  }

  async function submitFailedCall() {
    if (!activeRow) return;
    try {
      await submitCall.mutateAsync({
        case_id: activeRow.id,
        doi_tuong_lien_he: contactType,
        ket_qua_cuoc_goi: callResult,
        ghi_chu: ghiChu || undefined,
        ly_do_that_bai: lyDoThatBai,
        can_goi_lai: canGoiLai,
        results: [],
      });
      bumpCounter.current += 1;
      setBumpOrder((prev) => new Map(prev).set(activeRow.id, bumpCounter.current));
      setSessionRetry((n) => n + 1);
      if (adHocId) setAdHocId(null);
      addToast(`Đã lưu cuộc gọi chưa liên hệ được cho ca ${activeRow.id} — sẽ quay lại cuối hàng đợi.`);
    } catch {
      addToast("Không thể lưu cuộc gọi, thử lại.");
    }
  }

  useEffect(() => {
    function isEditableTarget(el: EventTarget | null) {
      if (!(el instanceof HTMLElement)) return false;
      return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
    }
    function handler(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === "Enter") {
        if (!activeRow || neededLoaiLoi(activeRow).length === 0) return;
        e.preventDefault();
        if (callResult === "Liên hệ thành công" || callResult === "Không cần khảo sát") void submitSuccessCall();
        else void submitFailedCall();
        return;
      }
      // PageDown/PageUp de bo qua/quay lai bang phim, nhung chi khi khong dang go trong
      // input/textarea/select - tranh xung dot voi thao tac cuon trong o ghi chu hay tim kiem.
      if (isEditableTarget(e.target)) return;
      if (e.key === "PageDown") {
        e.preventDefault();
        goNext();
      } else if (e.key === "PageUp") {
        e.preventDefault();
        goPrev();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRow, callResult, selected, ketLuan, ketQuaCap1, ghiChu, lyDoThatBai, canGoiLai, currentIndex, pool.length]);

  const needed = activeRow ? neededLoaiLoi(activeRow) : [];
  const anyLoi = Object.keys(selected).some((k) => selected[k] && ketLuan[k] === "loi");
  const btnStyle = (active: boolean, tone: "teal" | "coral") =>
    `focus-ring px-2.5 py-1 rounded-lg text-xs font-semibold border ${
      active ? (tone === "teal" ? "bg-[var(--teal-500)] text-white border-[var(--teal-500)]" : "bg-[var(--coral-500)] text-white border-[var(--coral-500)]") : "border-[var(--line)] text-[var(--ink-600)]"
    } disabled:opacity-30`;

  return (
    <div className="fixed inset-0 z-40 bg-slate-50 flex flex-col anim-in">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--line)] bg-[var(--surface)] flex-nowrap overflow-x-auto">
        <div className="font-display font-bold text-sm flex items-center gap-1 whitespace-nowrap shrink-0">🎧 Gọi khảo sát</div>
        <Badge tone="ocean">{adHocId ? `Thủ công (${pool.length})` : pool.length > 0 ? `Ca ${currentIndex + 1}/${pool.length}` : "0 ca"}</Badge>
        {sessionDone > 0 && <Badge tone="teal">Xử lý: {sessionDone}</Badge>}
        {sessionRetry > 0 && <Badge tone="amber">Gọi lại: {sessionRetry}</Badge>}
        <div className="flex-1 min-w-2" />
        <label className="flex items-center gap-1 text-xs font-semibold text-[var(--ink-600)] whitespace-nowrap shrink-0">
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(e) => {
              setOnlyMine(e.target.checked);
              setIncludeUnassigned(false);
              setIndex(0);
            }}
          />
          Của tôi
        </label>
        <label className="flex items-center gap-1 text-xs font-semibold text-[var(--ink-600)] whitespace-nowrap shrink-0">
          <input
            type="checkbox"
            checked={includeOverdue}
            onChange={(e) => {
              setIncludeOverdue(e.target.checked);
              setIndex(0);
            }}
          />
          +Quá hạn
        </label>
        <Select
          value={thang}
          onChange={(v) => {
            setThang(v);
            setIndex(0);
          }}
          options={thangSelectOptions}
          className="!py-1 shrink-0"
        />
        <KhuVucFilterControl
          value={khuVucFilter}
          onChange={(v) => {
            setKhuVucFilter(v);
            setIndex(0);
          }}
          options={[{ value: "", label: "Tất cả khu vực" }, { value: QLDVBH_FILTER_VALUE, label: "Tất cả DVBH (MB/MN...)" }, ...(khuVucOptions?.khuVuc.map((k) => ({ value: k, label: k })) ?? [])]}
          myAreas={myAreas}
        />
        <Select
          value={workspaceSort}
          onChange={(v) => {
            setWorkspaceSort(v as "default" | "ngay-tao" | "ktv");
            setIndex(0);
          }}
          options={[
            { value: "default", label: "⏱ Mặc định" },
            { value: "ngay-tao", label: "📅 Ngày tạo" },
            { value: "ktv", label: "👤 Theo KTV" },
          ]}
          className="!py-1 shrink-0"
        />
        <Select
          value={workspaceKtv}
          onChange={(v) => {
            setWorkspaceKtv(v);
            setIndex(0);
          }}
          options={[
            { value: "", label: "Tất cả KTV" },
            ...availableWorkspaceKtvs.map((k) => ({ value: k, label: `KTV: ${k}` })),
          ]}
          className="!py-1 shrink-0"
        />
        <form
          className="flex items-center gap-1 shrink-0"
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
        >
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Tìm ID/Serial…"
            className="focus-ring border border-[var(--line)] rounded-lg px-2 py-1 text-xs w-28"
          />
          <Btn size="sm" variant="ghost" disabled={searching} type="submit">
            🔍
          </Btn>
        </form>
        <Btn size="sm" variant="ghost" onClick={onExit} type="button">
          ✕
        </Btn>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="w-full max-w-7xl mx-auto">
          <div className="max-w-3xl mx-auto lg:max-w-none">
            <div className="text-xs text-[var(--ink-400)] mb-3 text-right">Phím tắt: PageUp/PageDown chuyển ca · Ctrl+Enter lưu nhanh</div>
          </div>

          {(adHocId && adHocLoading) || (!adHocId && initialLoading) ? (
            <div className="max-w-3xl mx-auto">
              <LoadingCard label={adHocId ? `Đang tải ca ${adHocId}…` : "Đang tải hàng đợi…"} />
            </div>
          ) : null}

          {!adHocId && !initialLoading && !queueRow && (
            <div className="max-w-3xl mx-auto">
              <Card className="p-8 text-center">
                <div className="text-2xl mb-2">🎉</div>
                <div className="font-display font-bold text-lg mb-1">
                  {hasUnassignedAvailable ? "Hết ca đã giao cho bạn trong hàng đợi hiện tại!" : "Hết ca cần khảo sát trong hàng đợi hiện tại!"}
                </div>
                <div className="text-sm text-[var(--ink-400)] mb-4">
                  {hasUnassignedAvailable ? "Vẫn còn ca chưa gán ai trong hệ thống — bạn có thể nhận thêm." : "Đổi bộ lọc, hoặc làm mới để kiểm tra ca mới phát sinh."}
                </div>
                <div className="flex justify-center gap-2 flex-wrap">
                  {hasUnassignedAvailable && (
                    <Btn
                      type="button"
                      onClick={() => {
                        setIncludeUnassigned(true);
                        setIndex(0);
                      }}
                    >
                      🔓 Gọi thêm ca chưa gán
                    </Btn>
                  )}
                  <Btn
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      refetchCandidates();
                    }}
                  >
                    ↻ Làm mới hàng đợi
                  </Btn>
                  <Btn onClick={onExit} type="button">
                    ✕ Thoát chế độ gọi
                  </Btn>
                </div>
              </Card>
            </div>
          )}

          {activeRow && (!adHocId ? true : !adHocLoading) && (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,42%)_1fr] gap-5 items-start">
              <div className="lg:sticky lg:top-0 self-start">
              <Card className="p-5">
                <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-lg font-bold text-[var(--ocean-600)]">{activeRow.id}</span>
                      {adHocId && <Badge tone="amber">Tìm thủ công</Badge>}
                      {activeRow.__source === "qua-han" && <Badge tone="coral">Quá hạn khảo sát</Badge>}
                      {!adHocId && (activeRow.assigned_to === me ? <Badge tone="ocean">Của bạn</Badge> : <Badge tone="gray">Chưa gán ai</Badge>)}
                    </div>
                    <div className="text-xl font-display font-extrabold text-[var(--ink-900)] mt-0.5">{activeRow.khach_hang ?? "—"}</div>
                    <div className="text-sm text-[var(--ink-400)] mt-0.5">
                      {shortKhuVuc(activeRow.khu_vuc)}
                      {activeRow.tinh ? ` — ${activeRow.tinh}` : ""}
                      {activeRow.quan_huyen ? ` — ${activeRow.quan_huyen}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap justify-end">
                    {activeRow.link_crm && (
                      <a href={activeRow.link_crm} target="_blank" rel="noreferrer">
                        <Btn size="sm" variant="subtle" type="button">
                          📞 Mở CRM
                        </Btn>
                      </a>
                    )}
                    <Btn size="sm" variant="ghost" type="button" onClick={() => openCase(activeRow.id, "vi-pham")}>
                      Xem hồ sơ đầy đủ
                    </Btn>
                  </div>
                </div>

                {needed.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {needed.map((loai) => (
                      <Badge key={loai} tone="ocean">
                        {LOAI_LOI_META[loai].label}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-3 bg-slate-50 rounded-xl p-3">
                  <div>
                    <span className="text-[var(--ink-400)]">Kỹ thuật viên: </span>
                    <KtvNameWithPhone kyThuatVien={activeRow.ky_thuat_vien} canEdit={!!role && KTV_PHONE_EDIT_ROLES.includes(role)} />
                  </div>
                  <div>
                    <span className="text-[var(--ink-400)]">Tiếp nhận CSKH: </span>
                    {fmtDateTime(activeRow.thoi_gian_cskh_tiep_nhan)}
                  </div>
                  <div>
                    <span className="text-[var(--ink-400)]">Hẹn xử lý: </span>
                    {fmtDateTime(activeRow.thoi_gian_hen_xu_ly)}
                  </div>
                  <div>
                    <span className="text-[var(--ink-400)]">Hoàn thành: </span>
                    {activeRow.thoi_gian_hoan_thanh ? fmtDateTime(activeRow.thoi_gian_hoan_thanh) : <span className="italic">Đang tồn đọng</span>}
                  </div>
                </div>

                {activeRow.mo_ta_loi && (
                  <div className="text-sm mb-1.5">
                    <span className="font-semibold">Mô tả lỗi: </span>
                    {activeRow.mo_ta_loi}
                  </div>
                )}
                {activeRow.noi_dung_xu_ly && (
                  <div className="text-sm">
                    <span className="font-semibold">Nội dung xử lý: </span>
                    {activeRow.noi_dung_xu_ly}
                  </div>
                )}

                {callHistoryRows.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[var(--line)]">
                    <div className="text-xs font-semibold text-[var(--ink-400)] mb-1.5">Lịch sử gọi trước đó ({callHistoryRows.length})</div>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {callHistoryRows.map((h) => {
                        // Gan dung vi_pham (loi da chot) vao dung cuoc goi da tao ra no - CHOT
                        // 2026-08-22 lan 6, chu he thong yeu cau "cho loi da chot di dung voi log
                        // lich su cua cuoc goi do cho de nhin" (truoc do 2 khoi tach roi nhau, kho
                        // doi chieu cuoc goi nao chot loi nao).
                        const viPhamCuaCuocGoiNay = priorViPham.filter((v) => v.ket_qua_goi_id === h.id);
                        return (
                          <div key={h.id} className="text-xs border border-[var(--line)] rounded-lg p-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="font-semibold">{fmtDateTime(h.ngay_gio_thuc_hien)}</span>
                              <span className="text-[var(--ink-400)]">{h.nguoi_thuc_hien}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                              <Badge tone={h.ket_qua_cuoc_goi === "Liên hệ thành công" ? "teal" : h.ket_qua_cuoc_goi === "Không cần khảo sát" ? "gray" : "amber"}>
                                {h.ket_qua_cuoc_goi ?? "Chưa liên hệ được"}
                              </Badge>
                              {h.can_goi_lai === 1 && <Badge tone="amber">Cần gọi lại</Badge>}
                            </div>
                            {h.ly_do_that_bai && <div className="mt-0.5 text-[var(--ink-400)]">Lý do: {h.ly_do_that_bai}</div>}
                            {h.ghi_chu && <div className="mt-0.5 text-[var(--ink-600)]">{h.ghi_chu}</div>}
                            {viPhamCuaCuocGoiNay.length > 0 && (
                              <div className="mt-1 pt-1 border-t border-[var(--line)] flex flex-wrap gap-1">
                                {viPhamCuaCuocGoiNay.map((v) => (
                                  <Badge key={v.id} tone={statusTone(v.chot_bo_cap_2 !== null ? (v.chot_bo_cap_2 ? "đã xác nhận" : "Không vi phạm") : "chờ QC")}>
                                    {LOAI_LOI_META[v.loai_loi]?.label ?? v.loai_loi} · {v.ket_qua_cap_1 === "Khong loi" ? "Không lỗi" : v.ket_qua_cap_1}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>
              </div>

              <div>
              {needed.length === 0 ? (
                <Card className="p-6 text-center text-sm text-[var(--ink-400)]">
                  Ca này hiện không còn lỗi nào cần khảo sát (có thể đã được người khác ghi nhận).
                  <div className="mt-3 flex justify-center gap-2">
                    <Btn size="sm" variant="ghost" type="button" onClick={() => openCase(activeRow.id, "vi-pham")}>
                      Xem hồ sơ
                    </Btn>
                    {adHocId ? (
                      <Btn size="sm" type="button" onClick={() => setAdHocId(null)}>
                        Quay lại hàng đợi
                      </Btn>
                    ) : (
                      <Btn size="sm" type="button" onClick={goNext}>
                        Bỏ qua ⏭
                      </Btn>
                    )}
                  </div>
                </Card>
              ) : (
                <Card className="p-5">
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="text-xs font-semibold text-[var(--ink-400)]">Đối tượng liên hệ</label>
                      <Select value={contactType} onChange={setContactType} options={["Khách hàng", "KTV", "Người thân KH"]} className="w-full mt-1" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-[var(--ink-400)]">Kết quả cuộc gọi</label>
                      <Select value={callResult} onChange={setCallResult} options={KET_QUA_GOI_OPTIONS} className="w-full mt-1" />
                    </div>
                  </div>

                  {callResult === "Liên hệ thành công" ? (
                    <>
                      <div className="mb-3">
                        <label className="text-xs font-semibold text-[var(--ink-400)] block mb-2">Chọn kết luận cho từng loại lỗi nghi ngờ</label>
                        <div className="space-y-2.5">
                          {needed.map((loai) => (
                            <div key={loai} className="border border-[var(--line)] rounded-xl p-3 flex items-center gap-3 flex-wrap">
                              <label className="flex items-center gap-2 font-semibold text-sm flex-1 min-w-[160px]">
                                <input type="checkbox" checked={!!selected[loai]} onChange={(e) => setSelected({ ...selected, [loai]: e.target.checked })} />
                                {LOAI_LOI_META[loai].label}
                              </label>
                              <div className="flex gap-1">
                                <button type="button" disabled={!selected[loai]} onClick={() => setKetLuan({ ...ketLuan, [loai]: "khong_loi" })} className={btnStyle(ketLuan[loai] === "khong_loi", "teal")}>
                                  Không lỗi
                                </button>
                                <button type="button" disabled={!selected[loai]} onClick={() => setKetLuan({ ...ketLuan, [loai]: "loi" })} className={btnStyle(ketLuan[loai] === "loi", "coral")}>
                                  Lỗi
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {anyLoi && (
                        <div className="mb-3">
                          <label className="text-xs font-semibold text-[var(--ink-400)]">Kết quả cấp 1 (áp dụng cho các loại kết luận "Lỗi")</label>
                          <Select
                            value={ketQuaCap1}
                            onChange={setKetQuaCap1}
                            options={[
                              { value: "Loi khong lien he", label: "Lỗi không liên hệ" },
                              { value: "Loi sai bao cao", label: "Lỗi sai báo cáo" },
                              { value: "Loi khac", label: "Lỗi khác" },
                            ]}
                            className="w-full mt-1"
                          />
                        </div>
                      )}
                      <div className="mb-4">
                        <label className="text-xs font-semibold text-[var(--ink-400)]">Ghi chú</label>
                        <textarea rows={2} value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
                      </div>
                      <div className="flex justify-between items-center gap-2 flex-wrap">
                        <div className="flex gap-2">
                          <Btn variant="ghost" type="button" onClick={goPrev}>
                            ◀ Ca trước
                          </Btn>
                          <Btn variant="ghost" type="button" onClick={goNext}>
                            Bỏ qua ⏭
                          </Btn>
                        </div>
                        <Btn onClick={submitSuccessCall} disabled={submitCall.isPending || !Object.keys(selected).some((k) => selected[k])}>
                          {submitCall.isPending ? "Đang lưu…" : "💾 Lưu & gọi ca tiếp theo"}
                        </Btn>
                      </div>
                    </>
                  ) : callResult === "Không cần khảo sát" ? (
                    <>
                      <div className="bg-[var(--ocean-50)] text-[var(--ocean-700)] border border-[var(--ocean-100)] rounded-xl p-4 text-xs mb-4">
                        ℹ️ <strong>Lưu ý:</strong> Ca này sẽ được ghi nhận là <strong>Không lỗi</strong> cho toàn bộ các loại lỗi nghi ngờ ({needed.map((l) => LOAI_LOI_META[l]?.short ?? l).join(", ")}). Hệ thống sẽ tự động hoàn thành khảo sát ca này và chuyển sang ca tiếp theo.
                      </div>
                      <div className="mb-4">
                        <label className="text-xs font-semibold text-[var(--ink-400)]">Ghi chú lý do không cần khảo sát</label>
                        <textarea rows={2} value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} placeholder="Nhập lý do tại đây..." className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
                      </div>
                      <div className="flex justify-between items-center gap-2 flex-wrap">
                        <div className="flex gap-2">
                          <Btn variant="ghost" type="button" onClick={goPrev}>
                            ◀ Ca trước
                          </Btn>
                          <Btn variant="ghost" type="button" onClick={goNext}>
                            Bỏ qua ⏭
                          </Btn>
                        </div>
                        <Btn onClick={submitSuccessCall} disabled={submitCall.isPending}>
                          {submitCall.isPending ? "Đang lưu…" : "💾 Lưu & gọi ca tiếp theo"}
                        </Btn>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="text-xs font-semibold text-[var(--ink-400)]">Lý do chưa liên hệ được</label>
                          <Select value={lyDoThatBai} onChange={setLyDoThatBai} options={LY_DO_THAT_BAI_OPTIONS} className="w-full mt-1" />
                        </div>
                        <label className="flex items-center gap-2 text-sm font-semibold mt-6">
                          <input type="checkbox" checked={canGoiLai} onChange={(e) => setCanGoiLai(e.target.checked)} /> Cần gọi lại sau
                        </label>
                      </div>
                      <div className="mb-4">
                        <label className="text-xs font-semibold text-[var(--ink-400)]">Ghi chú</label>
                        <textarea rows={2} value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
                      </div>
                      <div className="flex justify-between items-center gap-2 flex-wrap">
                        <div className="flex gap-2">
                          <Btn variant="ghost" type="button" onClick={goPrev}>
                            ◀ Ca trước
                          </Btn>
                          <Btn variant="ghost" type="button" onClick={goNext}>
                            Bỏ qua ⏭
                          </Btn>
                        </div>
                        <Btn variant="success" onClick={submitFailedCall} disabled={submitCall.isPending}>
                          {submitCall.isPending ? "Đang lưu…" : "📵 Lưu cuộc gọi & tiếp theo"}
                        </Btn>
                      </div>
                    </>
                  )}
                </Card>
              )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
