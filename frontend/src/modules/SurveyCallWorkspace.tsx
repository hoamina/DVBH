import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { LoadingCard } from "../components/ui/LoadingCard";
import { Select } from "../components/ui/Select";
import { KhuVucFilterControl } from "../components/KhuVucFilterControl";
import { api, buildQuery } from "../api/client";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/AuthContext";
import { LOAI_LOI_META, fmtDateTime, type LoaiLoi, type CaseRow, type ViPhamRow } from "../types";
import { QLDVBH_FILTER_VALUE } from "../constants";
import { CanKhaoSatRow, neededLoaiLoi } from "./SurveyModule";

type QueueSource = "qua-han" | "can-khao-sat" | "ad-hoc";
interface QueueItem extends CanKhaoSatRow {
  __source: QueueSource;
}

const KET_QUA_GOI_OPTIONS = [
  { value: "Liên hệ thành công", label: "✅ Liên hệ thành công" },
  { value: "Không nghe máy", label: "📵 Không nghe máy" },
  { value: "Số sai / không liên lạc được", label: "🚫 Số sai / không liên lạc được" },
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
}: {
  onExit: () => void;
  openCase: (id: string) => void;
  initialKhuVuc?: string;
}) {
  const auth = useAuth();
  const me = auth.status === "authenticated" ? auth.user.email : "";
  const role = auth.status === "authenticated" ? auth.user.vai_tro : null;
  const myAreas = auth.status === "authenticated" ? auth.user.khu_vuc_phu_trach : [];
  const addToast = useToast();
  const qc = useQueryClient();

  const [khuVucFilter, setKhuVucFilter] = useState(initialKhuVuc ?? "");
  const [onlyMine, setOnlyMine] = useState(role === "CSKH");
  const [index, setIndex] = useState(0);
  const [sessionDone, setSessionDone] = useState(0);
  const [sessionRetry, setSessionRetry] = useState(0);
  const [calledIds, setCalledIds] = useState<Set<string>>(new Set());
  const [bumpOrder, setBumpOrder] = useState<Map<string, number>>(new Map());
  const bumpCounter = useRef(0);
  const [adHocId, setAdHocId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);

  const { data: khuVucOptions } = useQuery({
    queryKey: ["dashboard-filters"],
    queryFn: () => api.get<{ khuVuc: string[]; hang: string[] }>("/dashboard/filters"),
  });

  const quaHanQuery = useQuery({
    queryKey: ["survey", "qua-han-khao-sat", khuVucFilter, undefined, undefined],
    queryFn: () => api.get<{ rows: CanKhaoSatRow[] }>(`/survey${buildQuery({ tab: "qua-han-khao-sat", khu_vuc: khuVucFilter })}`),
  });
  const canKhaoSatQuery = useQuery({
    queryKey: ["survey", "can-khao-sat", khuVucFilter, undefined, undefined],
    queryFn: () => api.get<{ rows: CanKhaoSatRow[] }>(`/survey${buildQuery({ tab: "can-khao-sat", khu_vuc: khuVucFilter })}`),
  });
  const initialLoading = quaHanQuery.isLoading || canKhaoSatQuery.isLoading;

  const { data: adHocDetail, isFetching: adHocLoading } = useQuery({
    queryKey: ["survey-workspace-case", adHocId],
    queryFn: () => api.get<{ case: CaseRow; viPham: ViPhamRow[] }>(`/cases/${adHocId}`),
    enabled: adHocId !== null,
  });

  // Hang doi = quá hạn (khẩn cấp hơn, chưa khảo sát dù đã hoàn thành >3 ngày) truoc, roi den cần
  // khảo sát; loc theo onlyMine + bo qua ca da xu ly xong trong phien nay; bump len cuoi neu goi
  // khong lien he duoc (con_goi_lai) de quay lai thu sau, khong bi ket cung 1 cho.
  const pool = useMemo<QueueItem[]>(() => {
    const quaHanRows = (quaHanQuery.data?.rows ?? []).map((r) => ({ ...r, __source: "qua-han" as const }));
    const canKhaoSatRows = (canKhaoSatQuery.data?.rows ?? []).map((r) => ({ ...r, __source: "can-khao-sat" as const }));
    const merged = [...quaHanRows, ...canKhaoSatRows]
      .filter((r) => !calledIds.has(r.id))
      .filter((r) => !onlyMine || !r.assigned_to || r.assigned_to === me);
    const srcRank = (x: QueueItem) => (x.__source === "qua-han" ? 0 : 1);
    // Ca "goi lai sau" (da bump) luon xep sau MOI ca chua thu goi lan nao, bat ke tier khan cap -
    // neu khong, 1 ca qua han duy nhat con lai se cu quay lai ngay lap tuc sau khi bam "goi lai sau",
    // pha vo cam giac "tu dong next" ma telesale can.
    merged.sort((a, b) => {
      const bumpA = bumpOrder.get(a.id) ?? 0;
      const bumpB = bumpOrder.get(b.id) ?? 0;
      const attemptedDiff = (bumpA > 0 ? 1 : 0) - (bumpB > 0 ? 1 : 0);
      if (attemptedDiff !== 0) return attemptedDiff;
      const rankDiff = srcRank(a) - srcRank(b);
      if (rankDiff !== 0) return rankDiff;
      if (bumpA > 0 && bumpA !== bumpB) return bumpA - bumpB;
      return a.id.localeCompare(b.id);
    });
    return merged;
  }, [quaHanQuery.data, canKhaoSatQuery.data, calledIds, onlyMine, me, bumpOrder]);

  const currentIndex = pool.length === 0 ? -1 : Math.min(index, pool.length - 1);
  const queueRow = currentIndex >= 0 ? pool[currentIndex] : null;
  const adHocRow = adHocId && adHocDetail ? buildAdHocRow(adHocDetail) : null;
  const activeRow = adHocId ? adHocRow : queueRow;

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
      const res = await api.get<{ found: string | null }>(`/cases/search?q=${encodeURIComponent(q)}`);
      if (!res.found) {
        addToast("Không tìm thấy ca với ID / Serial này.");
        return;
      }
      setAdHocId(res.found);
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
    if (chosen.length === 0) {
      addToast("Chọn kết luận cho ít nhất 1 loại lỗi trước khi lưu.");
      return;
    }
    try {
      const data = await submitCall.mutateAsync({
        case_id: activeRow.id,
        doi_tuong_lien_he: contactType,
        ket_qua_cuoc_goi: callResult,
        ghi_chu: ghiChu || undefined,
        results: chosen.map((loai) => ({ loai_loi: loai, ket_luan: ketLuan[loai], ket_qua_cap_1: ketLuan[loai] === "loi" ? ketQuaCap1 : undefined })),
      });
      setCalledIds((prev) => new Set(prev).add(activeRow.id));
      setSessionDone((n) => n + 1);
      qc.invalidateQueries({ queryKey: ["survey"] });
      qc.invalidateQueries({ queryKey: ["survey-counts"] });
      if (adHocId) setAdHocId(null);
      if (data.boQua.length > 0) {
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
        if (callResult === "Liên hệ thành công") void submitSuccessCall();
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
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--line)] bg-[var(--surface)] flex-wrap">
        <div className="font-display font-bold text-base flex items-center gap-2 whitespace-nowrap">🎧 Chế độ gọi khảo sát</div>
        <Badge tone="ocean">{adHocId ? `Đang xem thủ công (hàng đợi: ${pool.length} ca)` : pool.length > 0 ? `Ca ${currentIndex + 1}/${pool.length}` : "0 ca trong hàng đợi"}</Badge>
        {sessionDone > 0 && <Badge tone="teal">Đã xử lý {sessionDone}</Badge>}
        {sessionRetry > 0 && <Badge tone="amber">Gọi lại sau {sessionRetry}</Badge>}
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-600)] whitespace-nowrap">
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(e) => {
              setOnlyMine(e.target.checked);
              setIndex(0);
            }}
          />
          Chỉ ca của tôi
        </label>
        <KhuVucFilterControl
          value={khuVucFilter}
          onChange={(v) => {
            setKhuVucFilter(v);
            setIndex(0);
          }}
          options={[{ value: "", label: "Tất cả khu vực" }, { value: QLDVBH_FILTER_VALUE, label: "Tất cả DVBH (MB/MN...)" }, ...(khuVucOptions?.khuVuc.map((k) => ({ value: k, label: k })) ?? [])]}
          myAreas={myAreas}
        />
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
        >
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Tìm theo ID / Serial…"
            className="focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm w-44"
          />
          <Btn size="sm" variant="ghost" disabled={searching} type="submit">
            🔍
          </Btn>
        </form>
        <Btn size="sm" variant="ghost" onClick={onExit} type="button">
          ✕ Thoát
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
                <div className="font-display font-bold text-lg mb-1">Hết ca cần khảo sát trong hàng đợi hiện tại!</div>
                <div className="text-sm text-[var(--ink-400)] mb-4">Đổi bộ lọc, hoặc làm mới để kiểm tra ca mới phát sinh.</div>
                <div className="flex justify-center gap-2">
                  <Btn
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      qc.invalidateQueries({ queryKey: ["survey"] });
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
                    </div>
                    <div className="text-xl font-display font-extrabold text-[var(--ink-900)] mt-0.5">{activeRow.khach_hang ?? "—"}</div>
                    <div className="text-sm text-[var(--ink-400)] mt-0.5">
                      {activeRow.khu_vuc ?? "—"}
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
                    <Btn size="sm" variant="ghost" type="button" onClick={() => openCase(activeRow.id)}>
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
                    {activeRow.ky_thuat_vien ?? "—"}
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
              </Card>
              </div>

              <div>
              {needed.length === 0 ? (
                <Card className="p-6 text-center text-sm text-[var(--ink-400)]">
                  Ca này hiện không còn lỗi nào cần khảo sát (có thể đã được người khác ghi nhận).
                  <div className="mt-3 flex justify-center gap-2">
                    <Btn size="sm" variant="ghost" type="button" onClick={() => openCase(activeRow.id)}>
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
