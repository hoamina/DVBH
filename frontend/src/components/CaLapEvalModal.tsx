import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "./ui/Modal";
import { Card } from "./ui/Card";
import { Btn } from "./ui/Btn";
import { Badge } from "./ui/Badge";
import { ChoiceSelect } from "./ui/ChoiceSelect";
import { LoadingInline } from "./ui/LoadingInline";
import { api } from "../api/client";
import { useToast } from "./ui/Toast";
import { setCachedEntry } from "../lib/closedDataCache";
import { fmtDateTime, CA_LAP_META, CA_LAP_KEYS, HINH_THUC_XU_LY_META, HINH_THUC_XU_LY_KEYS, type CaLapDetection } from "../types";

interface DetectionResponse {
  detection: CaLapDetection["detection"];
  giaiTrinhLap: CaLapDetection["giaiTrinhLap"];
}

/**
 * "Xu ly ca lap" tach thanh component dung chung (CHOT 2026-08-05) - truoc chi mo duoc cho DUNG ca
 * dang hien trong CaseDetail (dong cung 1 khoi state/mutation voi phan con lai cua trang), gio nhan
 * "caseId" bat ky lam prop de mo duoc TRUC TIEP tu 1 dong bat ky trong "Chuoi lich su theo serial"
 * (khong bat buoc phai dieu huong vao dung ca do truoc). Tu fetch detection/giaiTrinhLap rieng qua
 * GET /api/ca-lap/:caseId/detection (nhe hon GET /cases/:id day du) thay vi doc tu prop cha.
 */
export function CaLapEvalModal({
  caseId,
  canGsLap,
  canQcLap,
  onClose,
}: {
  caseId: string;
  canGsLap: boolean;
  canQcLap: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const addToast = useToast();
  const [gsLapForm, setGsLapForm] = useState({ chot_danh_gia_lap: "", dien_giai_lap: "" });
  const [hinhThucForm, setHinhThucForm] = useState("");
  const [qcLapForm, setQcLapForm] = useState({ qc_chot: "", qc_ghi_chu: "" });
  const [qcHinhThucForm, setQcHinhThucForm] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["ca-lap-detection", caseId],
    queryFn: () => api.get<DetectionResponse>(`/ca-lap/${caseId}/detection`),
  });
  const detection = data?.detection;
  const giaiTrinhLap = data?.giaiTrinhLap;

  // Gia tri "hieu luc" - uu tien gia tri nguoi dung vua sua (form state) > gia tri da luu tren
  // server > mac dinh nghiep vu - khop dung pattern goc o CaseDetail.tsx (tranh nut Luu bi disable
  // oan khi mo lai 1 ca DA co danh gia, hoac gui "undefined" de xoa mat du lieu cu).
  const effectiveHinhThuc = hinhThucForm || giaiTrinhLap?.chot_hinh_thuc_xu_ly || "Tinh luong";
  const effectiveChotDanhGiaLap = gsLapForm.chot_danh_gia_lap || giaiTrinhLap?.chot_danh_gia_lap || "";
  const effectiveDienGiaiLap = gsLapForm.dien_giai_lap || giaiTrinhLap?.dien_giai_lap || "";
  const effectiveQcChot = qcLapForm.qc_chot || giaiTrinhLap?.qc_chot || "";
  const effectiveQcGhiChu = qcLapForm.qc_ghi_chu || giaiTrinhLap?.qc_ghi_chu || "";
  // CHOT 2026-08-05: QC gio duoc sua lai "Hinh thuc xu ly" (truoc chi Giam sat dat duoc) - mac dinh
  // hien gia tri Giam sat da chot (hoac da luu truoc do cua chinh QC), KHONG phai luon "Tinh luong"
  // nhu ben Giam sat, vi QC dang RA SOAT lai lua chon co san chu khong bat dau tu dau.
  const effectiveQcHinhThuc = qcHinhThucForm || giaiTrinhLap?.chot_hinh_thuc_xu_ly || "Tinh luong";

  async function refreshAfterSave() {
    const fresh = await api.get<{ case: { thoi_gian_hoan_thanh: string | null } } & Record<string, unknown>>(`/cases/${caseId}`);
    if (fresh.case.thoi_gian_hoan_thanh) await setCachedEntry(`case-${caseId}`, fresh);
    qc.setQueryData(["case", caseId], { data: fresh, cachedAt: new Date().toISOString() });
    qc.invalidateQueries({ queryKey: ["ca-lap-detection", caseId] });
    qc.invalidateQueries({ queryKey: ["ca-lap-list"] });
    qc.invalidateQueries({ queryKey: ["ca-lap-status"] });
    qc.invalidateQueries({ queryKey: ["ca-lap-tong-quan"] });
  }

  const saveGsLap = useMutation({
    mutationFn: () =>
      api.post(`/ca-lap/${caseId}/gs`, {
        chot_danh_gia_lap: effectiveChotDanhGiaLap,
        dien_giai_lap: effectiveDienGiaiLap || undefined,
        chot_hinh_thuc_xu_ly: effectiveHinhThuc,
      }),
    onSuccess: async () => {
      addToast("Đã chốt lặp (Giám sát)");
      await refreshAfterSave();
    },
    onError: () => addToast("Không thể chốt lặp, thử lại sau."),
  });

  const saveQcLap = useMutation({
    mutationFn: () =>
      api.post(`/ca-lap/${caseId}/qc`, {
        qc_chot: effectiveQcChot,
        qc_ghi_chu: effectiveQcGhiChu || undefined,
        chot_hinh_thuc_xu_ly: effectiveQcHinhThuc,
      }),
    onSuccess: async () => {
      addToast("Đã chốt lặp (QC)");
      await refreshAfterSave();
    },
    onError: () => addToast("Không thể chốt lặp, thử lại sau."),
  });

  if (isLoading) {
    return (
      <Modal open onClose={onClose} title={`Giải trình / Chốt lặp — Ca ${caseId}`} width="max-w-xl">
        <LoadingInline className="text-sm font-semibold text-[var(--ink-600)]" />
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={`Giải trình / Chốt lặp — Ca ${caseId}`} width="max-w-xl">
      <div className="space-y-3">
        {!detection && (
          <div className="bg-slate-50 border border-[var(--line)] rounded-lg p-2.5 text-xs text-[var(--ink-500)] italic">
            💡 Lưu ý: Ca này không (còn) thuộc diện ca lặp (cách ca liền trước quá 45 ngày, hoặc không có ca liền trước cùng serial) nhưng bạn vẫn có thể thực hiện đánh giá.
          </div>
        )}
        <Card className="p-3 divide-y divide-[var(--line)]">
          <div className="pb-2.5">
          <div className="text-xs font-semibold text-[var(--ink-400)] uppercase tracking-wide mb-1.5">Giám sát (lần 1)</div>
          {canGsLap ? (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--ink-400)]">Hình thức xử lý</label>
              <ChoiceSelect
                value={effectiveHinhThuc}
                onChange={setHinhThucForm}
                className="w-full"
                options={HINH_THUC_XU_LY_KEYS.map((k) => ({ value: k, label: HINH_THUC_XU_LY_META[k].label }))}
              />
              <label className="text-xs font-semibold text-[var(--ink-400)]">Đánh giá lặp</label>
              <ChoiceSelect
                value={effectiveChotDanhGiaLap}
                onChange={(v) => setGsLapForm({ ...gsLapForm, chot_danh_gia_lap: v })}
                className="w-full"
                options={[{ value: "", label: "— Chọn đánh giá —" }, ...CA_LAP_KEYS.map((k) => ({ value: k, label: CA_LAP_META[k].label }))]}
              />
              <textarea
                value={effectiveDienGiaiLap}
                onChange={(e) => setGsLapForm({ ...gsLapForm, dien_giai_lap: e.target.value })}
                rows={2}
                placeholder="Mô tả nguyên nhân, bối cảnh…"
                className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-xs"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <Btn size="sm" onClick={() => saveGsLap.mutate()} disabled={!effectiveChotDanhGiaLap || saveGsLap.isPending}>
                  {saveGsLap.isPending ? "Đang lưu…" : "🔒 Chốt lặp"}
                </Btn>
                {giaiTrinhLap?.nguoi_giai_trinh && (
                  <span className="text-xs text-[var(--ink-400)]">
                    {giaiTrinhLap.nguoi_giai_trinh} · {fmtDateTime(giaiTrinhLap.ngay_giai_trinh)}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs flex flex-wrap items-center gap-1.5">
              {giaiTrinhLap?.chot_danh_gia_lap ? (
                <>
                  <Badge tone="ocean">{CA_LAP_META[giaiTrinhLap.chot_danh_gia_lap].label}</Badge>
                  <span className="text-[var(--ink-400)]">Hình thức: {giaiTrinhLap.chot_hinh_thuc_xu_ly ? HINH_THUC_XU_LY_META[giaiTrinhLap.chot_hinh_thuc_xu_ly].label : "—"}</span>
                  {giaiTrinhLap.nguoi_giai_trinh && (
                    <span className="text-[var(--ink-400)]">
                      · {giaiTrinhLap.nguoi_giai_trinh} · {fmtDateTime(giaiTrinhLap.ngay_giai_trinh)}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-[var(--ink-400)] italic">Chưa có giải trình.</span>
              )}
            </div>
          )}
        </div>

        <div className="pt-2.5">
          <div className="text-xs font-semibold text-[var(--ink-400)] uppercase tracking-wide mb-1.5">QC chốt (lần 2)</div>
          {canQcLap ? (
            <div className="space-y-1.5">
              <ChoiceSelect
                value={effectiveQcChot}
                onChange={(v) => {
                  setQcLapForm((prev) => ({ ...prev, qc_chot: v }));
                  // CHOT 2026-08-05 diem 3: chon "QC chot" khac "Bo qua" thi tu dong goi y "Hinh thuc
                  // xu ly" = "Tinh lap khong tinh luong" - CHI khi QC CHUA tung tu tay sua truong nay
                  // trong phien lam viec nay (qcHinhThucForm con rong) VA Giam sat cung chua tung dat
                  // gia tri nao (khong ghi de mat lua chon co san) - QC van doi lai duoc binh thuong
                  // sau do qua ChoiceSelect "Hinh thuc xu ly" ben duoi.
                  if (qcHinhThucForm === "" && v !== "Bo qua" && !giaiTrinhLap?.chot_hinh_thuc_xu_ly) {
                    setQcHinhThucForm("Tinh lap khong tinh luong");
                  }
                }}
                className="w-full"
                options={[{ value: "", label: "— Chọn đánh giá —" }, ...CA_LAP_KEYS.map((k) => ({ value: k, label: CA_LAP_META[k].label }))]}
              />
              <label className="text-xs font-semibold text-[var(--ink-400)]">Hình thức xử lý</label>
              <ChoiceSelect
                value={effectiveQcHinhThuc}
                onChange={setQcHinhThucForm}
                className="w-full"
                options={HINH_THUC_XU_LY_KEYS.map((k) => ({ value: k, label: HINH_THUC_XU_LY_META[k].label }))}
              />
              <textarea
                value={effectiveQcGhiChu}
                onChange={(e) => setQcLapForm({ ...qcLapForm, qc_ghi_chu: e.target.value })}
                rows={2}
                placeholder="Ghi chú kiểm tra, đối chiếu…"
                className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-xs"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <Btn size="sm" onClick={() => saveQcLap.mutate()} disabled={!effectiveQcChot || saveQcLap.isPending}>
                  {saveQcLap.isPending ? "Đang lưu…" : "🔒 Chốt lặp"}
                </Btn>
                {giaiTrinhLap?.nguoi_qc && (
                  <span className="text-xs text-[var(--ink-400)]">
                    {giaiTrinhLap.nguoi_qc} · {fmtDateTime(giaiTrinhLap.ngay_qc)}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs flex flex-wrap items-center gap-1.5">
              {giaiTrinhLap?.qc_chot ? (
                <>
                  <Badge tone="teal">{CA_LAP_META[giaiTrinhLap.qc_chot].label}</Badge>
                  {giaiTrinhLap.nguoi_qc && (
                    <span className="text-[var(--ink-400)]">
                      · {giaiTrinhLap.nguoi_qc} · {fmtDateTime(giaiTrinhLap.ngay_qc)}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-[var(--ink-400)] italic">Chưa có chốt từ QC.</span>
              )}
            </div>
          )}
        </div>
      </Card>
      </div>
    </Modal>
  );
}
