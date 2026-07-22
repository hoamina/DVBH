import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "../components/ui/Tabs";
import { Btn } from "../components/ui/Btn";
import { Badge, statusTone } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { ChartCanvas } from "../components/chart/ChartCanvas";
import { api, buildQuery } from "../api/client";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/AuthContext";
import { LOAI_LOI_META, LOAI_LOI_KEYS, type LoaiLoi, type ViPhamRow } from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { QLDVBH_FILTER_VALUE } from "../constants";
import { SurveyCallWorkspace } from "./SurveyCallWorkspace";

interface FunnelData {
  nghiNgo: number;
  canKhaoSat: number;
  choQc: number;
  daXuLy: number;
}
interface LeaderboardRow {
  nhom?: string;
  giam_sat_email?: string;
  giam_sat?: string | null;
  so_vi_pham: number;
}
interface TrendRow {
  ngay: string;
  so_cuoc_goi: number;
}

export interface CanKhaoSatRow {
  id: string;
  khach_hang: string | null;
  khu_vuc: string | null;
  assigned_to: string | null;
  need_loi_120p: number;
  need_loi_qua_han_24h: number;
  need_loi_lo_ke_hoach: number;
  need_loi_kh_hen_lai: number;
  mo_ta_loi?: string | null;
  ky_thuat_vien?: string | null;
  tinh?: string | null;
  quan_huyen?: string | null;
  thoi_gian_cskh_tiep_nhan?: string | null;
  thoi_gian_hen_xu_ly?: string | null;
  thoi_gian_hoan_thanh?: string | null;
  link_crm?: string | null;
  noi_dung_xu_ly?: string | null;
}

interface KhuVucRow {
  khu_vuc: string;
  can_khao_sat: number;
  qua_han_khao_sat: number;
  cho_qc: number;
  da_xu_ly: number;
}

export const FLAG_TO_LOAI: Record<string, LoaiLoi> = {
  need_loi_120p: "Loi 120 phut",
  need_loi_qua_han_24h: "Hen qua 24h",
  need_loi_lo_ke_hoach: "Loi lo ke hoach",
  need_loi_kh_hen_lai: "KH hen lai",
};

export function neededLoaiLoi(row: CanKhaoSatRow): LoaiLoi[] {
  return Object.entries(FLAG_TO_LOAI)
    .filter(([field]) => (row as unknown as Record<string, number>)[field])
    .map(([, loai]) => loai);
}

const VIEWS = [
  { key: "bao-cao", label: "Báo cáo" },
  { key: "danh-sach", label: "Danh sách chi tiết" },
];

const PAGE_SIZE = 20;

export function SurveyModule({ openCase }: { openCase: (id: string) => void }) {
  const [view, setView] = useState("bao-cao");
  const [tab, setTab] = useState("can-khao-sat");
  const [page, setPage] = useState(1);
  const [khuVucFilter, setKhuVucFilter] = useState("");
  const auth = useAuth();
  const role = auth.status === "authenticated" ? auth.user.vai_tro : null;
  const addToast = useToast();
  const qc = useQueryClient();

  const isQC = role === "QC" || role === "Admin";
  const isLead = role === "TN CSKH" || role === "TBP CSKH" || role === "Admin";
  const canSurvey = ["CSKH", "TN CSKH", "TBP CSKH", "Admin"].includes(role ?? "");

  const filterParams = { khu_vuc: khuVucFilter };

  const { data: canKhaoSat } = useQuery({
    queryKey: ["survey", "can-khao-sat", khuVucFilter],
    queryFn: () => api.get<{ rows: CanKhaoSatRow[] }>(`/survey${buildQuery({ tab: "can-khao-sat", ...filterParams })}`),
    enabled: view === "danh-sach" && tab === "can-khao-sat",
  });
  const { data: quaHanKhaoSat } = useQuery({
    queryKey: ["survey", "qua-han-khao-sat", khuVucFilter],
    queryFn: () => api.get<{ rows: CanKhaoSatRow[] }>(`/survey${buildQuery({ tab: "qua-han-khao-sat", ...filterParams })}`),
    enabled: view === "danh-sach" && tab === "qua-han-khao-sat",
  });
  const { data: choQc } = useQuery({
    queryKey: ["survey", "cho-qc", khuVucFilter],
    queryFn: () => api.get<{ rows: ViPhamRow[] }>(`/survey${buildQuery({ tab: "cho-qc", ...filterParams })}`),
    enabled: view === "danh-sach" && tab === "cho-qc",
  });
  const { data: daXuLy } = useQuery({
    queryKey: ["survey", "da-xu-ly", khuVucFilter],
    queryFn: () => api.get<{ rows: ViPhamRow[] }>(`/survey${buildQuery({ tab: "da-xu-ly", ...filterParams })}`),
    enabled: view === "danh-sach" && tab === "da-xu-ly",
  });
  const { data: counts } = useQuery({
    queryKey: ["survey-counts", khuVucFilter],
    queryFn: () => api.get<Record<string, number>>(`/survey/counts${buildQuery(filterParams)}`),
  });
  const { data: khuVucStats } = useQuery({
    queryKey: ["survey-by-khu-vuc", khuVucFilter],
    queryFn: () => api.get<{ rows: KhuVucRow[] }>(`/survey/by-khu-vuc${buildQuery({ khu_vuc: khuVucFilter })}`),
  });
  const { data: khuVucOptions } = useQuery({
    queryKey: ["dashboard-filters"],
    queryFn: () => api.get<{ khuVuc: string[]; hang: string[] }>("/dashboard/filters"),
  });
  const { data: funnel } = useQuery({
    queryKey: ["vi-pham-funnel"],
    queryFn: () => api.get<FunnelData>("/vi-pham/funnel"),
  });
  const { data: ktvBoard } = useQuery({
    queryKey: ["vi-pham-leaderboard", "ktv"],
    queryFn: () => api.get<{ rows: LeaderboardRow[] }>("/vi-pham/leaderboard?by=ktv"),
  });
  const { data: giamSatBoard } = useQuery({
    queryKey: ["vi-pham-leaderboard", "giam-sat"],
    queryFn: () => api.get<{ rows: LeaderboardRow[] }>("/vi-pham/leaderboard?by=giam-sat"),
  });
  const { data: trend } = useQuery({
    queryKey: ["survey-trend"],
    queryFn: () => api.get<{ rows: TrendRow[] }>("/survey/trend?days=30"),
  });
  const trendRows = trend?.rows ?? [];

  const groupedViPham = useMemo(() => {
    const list = tab === "cho-qc" ? choQc?.rows ?? [] : daXuLy?.rows ?? [];
    const g = new Map<string, ViPhamRow[]>();
    for (const v of list) {
      if (!g.has(v.case_id)) g.set(v.case_id, []);
      g.get(v.case_id)!.push(v);
    }
    return Array.from(g.entries()).map(([caseId, vs]) => ({ caseId, vs }));
  }, [tab, choQc, daXuLy]);

  function drillDown(khuVuc: string, targetTab: string) {
    setKhuVucFilter(khuVuc);
    setTab(targetTab);
    setPage(1);
    setView("danh-sach");
  }

  const [callModal, setCallModal] = useState<CanKhaoSatRow | null>(null);
  const [assignModal, setAssignModal] = useState<CanKhaoSatRow | null>(null);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

  const qcDecide = useMutation({
    mutationFn: ({ id, chot }: { id: string; chot: boolean }) => api.patch(`/vi-pham/${id}/cap2`, { chot }),
    onSuccess: (_d, vars) => {
      addToast(`QC đã ${vars.chot ? "chốt" : "bỏ"} vi phạm cấp 2 cho ${vars.id}`);
      qc.invalidateQueries({ queryKey: ["survey"] });
      qc.invalidateQueries({ queryKey: ["survey-counts"] });
    },
  });

  async function handleExport() {
    const res = await api.get<{ rows: Record<string, unknown>[] }>(`/survey${buildQuery({ tab, export: true, ...filterParams })}`);
    await exportRowsToExcel(res.rows, `khao_sat_${tab}.xlsx`);
  }

  return (
    <div className="anim-in">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="text-sm text-[var(--ink-600)] max-w-2xl">
          Các ca được hệ thống tự động gắn cờ <b>“nghi ngờ vi phạm – cần khảo sát”</b>. CSKH xác minh thực tế qua điện thoại trước khi kết luận có vi phạm hay không.
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-1 mt-2">
        <Select
          value={khuVucFilter}
          onChange={(v) => {
            setKhuVucFilter(v);
            setPage(1);
          }}
          options={[
            { value: "", label: "Tất cả khu vực" },
            { value: QLDVBH_FILTER_VALUE, label: "Tất cả DVBH (MB/MN...)" },
            ...(khuVucOptions?.khuVuc.map((k) => ({ value: k, label: k })) ?? []),
          ]}
        />
      </div>

      <Tabs active={view} onChange={setView} tabs={VIEWS} />

      {view === "bao-cao" ? (
        <div className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <Card className="p-4 lg:col-span-2">
              <div className="font-display font-bold text-sm mb-3">Phễu xử lý vi phạm</div>
              <ChartCanvas
                type="bar"
                data={{
                  labels: ["Nghi ngờ vi phạm", "Cần khảo sát", "Chờ QC chốt cấp 2", "Đã xử lý xong"],
                  datasets: [
                    {
                      label: "Số ca",
                      data: [funnel?.nghiNgo ?? 0, funnel?.canKhaoSat ?? 0, funnel?.choQc ?? 0, funnel?.daXuLy ?? 0],
                      backgroundColor: ["#D98A1F", "#1591C9", "#D84C4C", "#159C93"],
                      borderRadius: 6,
                    },
                  ],
                }}
                options={{ indexAxis: "y" as const }}
              />
            </Card>
            <Card className="p-4">
              <div className="font-display font-bold text-sm mb-3">Xu hướng cuộc gọi khảo sát (30 ngày)</div>
              <ChartCanvas
                type="line"
                data={{
                  labels: trendRows.map((r) => new Date(r.ngay).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })),
                  datasets: [{ label: "Số cuộc gọi", data: trendRows.map((r) => r.so_cuoc_goi), borderColor: "#159C93", backgroundColor: "rgba(21,156,147,0.1)", tension: 0.35, fill: true, pointRadius: 2 }],
                }}
              />
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Card className="p-4">
              <div className="font-display font-bold text-sm mb-3">Top 10 KTV nhiều vi phạm đã xác nhận nhất</div>
              <ChartCanvas
                type="bar"
                data={{
                  labels: (ktvBoard?.rows ?? []).map((r) => r.nhom ?? "—"),
                  datasets: [{ label: "Số vi phạm", data: (ktvBoard?.rows ?? []).map((r) => r.so_vi_pham), backgroundColor: "#D84C4C", borderRadius: 6 }],
                }}
                options={{ indexAxis: "y" as const }}
              />
            </Card>
            <Card className="p-4">
              <div className="font-display font-bold text-sm mb-3">Top 10 Giám sát nhiều vi phạm đã xác nhận nhất</div>
              <ChartCanvas
                type="bar"
                data={{
                  labels: (giamSatBoard?.rows ?? []).map((r) => r.giam_sat ?? r.giam_sat_email ?? "—"),
                  datasets: [{ label: "Số vi phạm", data: (giamSatBoard?.rows ?? []).map((r) => r.so_vi_pham), backgroundColor: "#D98A1F", borderRadius: 6 }],
                }}
                options={{ indexAxis: "y" as const }}
              />
            </Card>
          </div>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <div className="font-display font-bold text-sm">Báo cáo khảo sát theo khu vực</div>
                <div className="text-xs text-[var(--ink-400)] mt-0.5">Bấm vào 1 ô số để lọc thẳng xuống danh sách chi tiết.</div>
              </div>
              <Btn variant="ghost" size="sm" onClick={() => exportRowsToExcel(khuVucStats?.rows ?? [], "bao_cao_khao_sat_khu_vuc.xlsx")}>
                ⬇ Xuất Excel
              </Btn>
            </div>
            <div className="overflow-x-auto">
              <table className="dense w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                    <th className="py-2 pr-3">Khu vực</th>
                    <th className="py-2 pr-3">Cần khảo sát</th>
                    <th className="py-2 pr-3">Quá hạn khảo sát</th>
                    <th className="py-2 pr-3">Chờ QC chốt cấp 2</th>
                    <th className="py-2 pr-3">Đã xử lý xong</th>
                  </tr>
                </thead>
                <tbody>
                  {(khuVucStats?.rows ?? []).map((r) => (
                    <tr key={r.khu_vuc} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                      <td className="py-2 pr-3 font-semibold">{r.khu_vuc}</td>
                      <td className="py-2 pr-3 font-mono">
                        <button className="text-[var(--ocean-600)] hover:underline" onClick={() => drillDown(r.khu_vuc, "can-khao-sat")}>
                          {r.can_khao_sat}
                        </button>
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        <button className="text-[var(--ocean-600)] hover:underline" onClick={() => drillDown(r.khu_vuc, "qua-han-khao-sat")}>
                          {r.qua_han_khao_sat}
                        </button>
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        <button className="text-[var(--ocean-600)] hover:underline" onClick={() => drillDown(r.khu_vuc, "cho-qc")}>
                          {r.cho_qc}
                        </button>
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        <button className="text-[var(--ocean-600)] hover:underline" onClick={() => drillDown(r.khu_vuc, "da-xu-ly")}>
                          {r.da_xu_ly}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(khuVucStats?.rows ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[var(--ink-400)] text-sm">
                        Không có dữ liệu.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex justify-end mb-2 gap-2">
            {canSurvey && (tab === "can-khao-sat" || tab === "qua-han-khao-sat") && (
              <Btn size="sm" onClick={() => setWorkspaceOpen(true)}>
                🎧 Vào chế độ gọi khảo sát
              </Btn>
            )}
            <Btn variant="ghost" size="sm" onClick={handleExport}>
              ⬇ Xuất Excel
            </Btn>
          </div>
          <Tabs
            active={tab}
            onChange={(k) => {
              setTab(k);
              setPage(1);
            }}
            tabs={[
              { key: "can-khao-sat", label: "Cần khảo sát", count: counts?.["can-khao-sat"] },
              { key: "qua-han-khao-sat", label: "Quá hạn khảo sát", count: counts?.["qua-han-khao-sat"] },
              { key: "cho-qc", label: "Chờ QC chốt cấp 2", count: counts?.["cho-qc"] },
              { key: "da-xu-ly", label: "Đã xử lý xong", count: counts?.["da-xu-ly"] },
            ]}
          />

          {tab === "can-khao-sat" && isLead && (
            <div className="flex justify-end mb-2">
              <Btn variant="ghost" size="sm" onClick={() => setBulkAssignOpen(true)}>
                ⇄ Gán CSKH hàng loạt
              </Btn>
            </div>
          )}
          {bulkAssignOpen && <BulkAssignModal onClose={() => setBulkAssignOpen(false)} />}

          {tab === "qua-han-khao-sat" && (
            <div className="text-xs text-[var(--ink-400)] mb-2">Ca đã hoàn thành quá 3 ngày mà chưa khảo sát — có thể gọi hoặc bỏ qua nếu đã quá muộn.</div>
          )}

          {(tab === "can-khao-sat" || tab === "qua-han-khao-sat") &&
            (() => {
              const fullRows = tab === "can-khao-sat" ? canKhaoSat?.rows ?? [] : quaHanKhaoSat?.rows ?? [];
              const columns: Column<CanKhaoSatRow>[] = [
                { key: "id", header: "Ca", render: (row) => (
                  <span className="font-mono text-[var(--ocean-600)] font-semibold cursor-pointer" onClick={() => openCase(row.id)}>
                    {row.id}
                  </span>
                ) },
                { key: "khach_hang", header: "Khách hàng / Khu vực", render: (row) => (
                  <>
                    {row.khach_hang}
                    <div className="text-xs text-[var(--ink-400)]">{row.khu_vuc}</div>
                  </>
                ) },
                { key: "loai_loi", header: "Loại lỗi nghi ngờ", render: (row) => (
                  <div className="flex flex-wrap gap-1">
                    {neededLoaiLoi(row).map((loai) => (
                      <Badge key={loai} tone="ocean">
                        {LOAI_LOI_META[loai].short}
                      </Badge>
                    ))}
                  </div>
                ) },
                { key: "assigned_to", header: "Phân công", render: (row) => <span className="text-xs">{row.assigned_to || <span className="italic text-[var(--ink-400)]">Chưa phân công</span>}</span> },
                {
                  key: "action",
                  header: "",
                  className: "text-right",
                  render: (row) =>
                    canSurvey ? (
                      <div className="flex gap-1.5 justify-end">
                        {isLead && (
                          <Btn size="sm" variant="ghost" onClick={() => setAssignModal(row)}>
                            Phân công
                          </Btn>
                        )}
                        <Btn size="sm" onClick={() => setCallModal(row)}>
                          Gọi khảo sát
                        </Btn>
                      </div>
                    ) : null,
                },
              ];
              return (
                <PaginatedTable
                  columns={columns}
                  rows={fullRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
                  isLoading={false}
                  isError={false}
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={fullRows.length}
                  onPageChange={setPage}
                  rowKey={(row) => row.id}
                  emptyText="Không có mục nào."
                />
              );
            })()}

          {(tab === "cho-qc" || tab === "da-xu-ly") &&
            (() => {
              const columns: Column<(typeof groupedViPham)[number]>[] = [
                {
                  key: "caseId",
                  header: "Ca",
                  render: ({ caseId }) => (
                    <span className="font-mono text-[var(--ocean-600)] font-semibold cursor-pointer" onClick={() => openCase(caseId)}>
                      #{caseId}
                    </span>
                  ),
                },
                {
                  key: "khach_hang",
                  header: "Khách hàng / Khu vực",
                  render: ({ vs }) => (
                    <>
                      {vs[0].khach_hang}
                      <div className="text-xs text-[var(--ink-400)]">{vs[0].khu_vuc}</div>
                    </>
                  ),
                },
                {
                  key: "ket_qua",
                  header: "Kết quả khảo sát",
                  render: ({ vs }) => (
                    <div className="flex flex-wrap gap-1">
                      {vs.map((v) => (
                        <Badge key={v.id} tone={statusTone(v.chot_bo_cap_2 !== null ? (v.chot_bo_cap_2 ? "đã xác nhận" : "Không vi phạm") : "chờ QC")}>
                          {LOAI_LOI_META[v.loai_loi]?.short ?? v.loai_loi} · {v.ket_qua_cap_1}
                        </Badge>
                      ))}
                    </div>
                  ),
                },
                {
                  key: "action",
                  header: "",
                  className: "text-right",
                  render: ({ caseId, vs }) => (
                    <div className="text-right">
                      {tab === "cho-qc" && isQC && (
                        <div className="flex gap-1.5 justify-end flex-wrap">
                          {vs.map((v) => (
                            <span key={v.id} className="flex gap-1">
                              <Btn size="sm" variant="success" onClick={() => qcDecide.mutate({ id: v.id, chot: true })}>
                                Chốt {LOAI_LOI_META[v.loai_loi]?.short}
                              </Btn>
                              <Btn size="sm" variant="danger" onClick={() => qcDecide.mutate({ id: v.id, chot: false })}>
                                Bỏ {LOAI_LOI_META[v.loai_loi]?.short}
                              </Btn>
                            </span>
                          ))}
                        </div>
                      )}
                      {tab === "cho-qc" && !isQC && <span className="text-xs text-[var(--ink-400)] italic">Chờ QC xử lý</span>}
                      {tab === "da-xu-ly" && (
                        <Btn size="sm" variant="ghost" onClick={() => openCase(caseId)}>
                          Xem chi tiết
                        </Btn>
                      )}
                    </div>
                  ),
                },
              ];
              return (
                <PaginatedTable
                  columns={columns}
                  rows={groupedViPham.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
                  isLoading={false}
                  isError={false}
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={groupedViPham.length}
                  onPageChange={setPage}
                  rowKey={({ caseId }) => caseId}
                  emptyText="Không có mục nào."
                />
              );
            })()}
        </div>
      )}

      {callModal && <CallSurveyModal row={callModal} onClose={() => setCallModal(null)} />}
      {assignModal && <AssignModal row={assignModal} onClose={() => setAssignModal(null)} />}
      {workspaceOpen && <SurveyCallWorkspace onExit={() => setWorkspaceOpen(false)} openCase={openCase} initialKhuVuc={khuVucFilter} />}
    </div>
  );
}

function CallSurveyModal({ row, onClose }: { row: CanKhaoSatRow; onClose: () => void }) {
  const needed = neededLoaiLoi(row);
  const [selected, setSelected] = useState<Record<string, boolean>>(Object.fromEntries(needed.map((k) => [k, false])));
  const [ketLuan, setKetLuan] = useState<Record<string, "loi" | "khong_loi">>(Object.fromEntries(needed.map((k) => [k, "khong_loi"])));
  const [meta, setMeta] = useState({ doiTuong: "Khách hàng", ketQua: "Liên hệ thành công", ketQuaCap1: "Loi khong lien he", ghiChu: "" });
  const addToast = useToast();
  const qc = useQueryClient();

  const submit = useMutation({
    mutationFn: (results: { loai_loi: LoaiLoi; ket_luan: "loi" | "khong_loi"; ket_qua_cap_1?: string }[]) =>
      api.post<{ id: string; daGhiNhan: LoaiLoi[]; boQua: LoaiLoi[] }>("/survey/calls", {
        case_id: row.id,
        doi_tuong_lien_he: meta.doiTuong,
        ket_qua_cuoc_goi: meta.ketQua,
        ghi_chu: meta.ghiChu || undefined,
        results,
      }),
    onSuccess: (data) => {
      if (data.boQua.length > 0) {
        const boQuaLabel = data.boQua.map((l) => LOAI_LOI_META[l]?.short ?? l).join(", ");
        addToast(
          data.daGhiNhan.length > 0
            ? `Đã lưu ${data.daGhiNhan.length} lỗi. Riêng "${boQuaLabel}" đã được người khác ghi nhận trước đó nên không lưu trùng.`
            : `Ca ${row.id}: "${boQuaLabel}" đã được người khác ghi nhận trước đó, không có gì để lưu thêm.`,
        );
      } else {
        addToast(`Đã ghi nhận kết quả khảo sát ca ${row.id}`);
      }
      qc.invalidateQueries({ queryKey: ["survey"] });
      qc.invalidateQueries({ queryKey: ["survey-counts"] });
      onClose();
    },
    onError: () => addToast("Không thể ghi nhận kết quả khảo sát."),
  });

  function submitForm(e: React.FormEvent) {
    e.preventDefault();
    const chosen = Object.keys(selected).filter((k) => selected[k]) as LoaiLoi[];
    if (chosen.length === 0) return;
    submit.mutate(chosen.map((loai) => ({ loai_loi: loai, ket_luan: ketLuan[loai], ket_qua_cap_1: ketLuan[loai] === "loi" ? meta.ketQuaCap1 : undefined })));
  }

  const anyLoi = Object.keys(selected).some((k) => selected[k] && ketLuan[k] === "loi");

  return (
    <Modal open onClose={onClose} title={`Ghi nhận cuộc gọi khảo sát — Ca ${row.id}`} width="max-w-xl">
      <form onSubmit={submitForm} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Đối tượng liên hệ</label>
            <Select value={meta.doiTuong} onChange={(v) => setMeta({ ...meta, doiTuong: v })} options={["Khách hàng", "KTV", "Người thân KH"]} className="w-full mt-1" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Kết quả cuộc gọi</label>
            <Select value={meta.ketQua} onChange={(v) => setMeta({ ...meta, ketQua: v })} options={["Liên hệ thành công", "Không nghe máy", "Số sai / không liên lạc được"]} className="w-full mt-1" />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--ink-400)] block mb-2">Chọn (các) loại lỗi khảo sát trong cuộc gọi này — mỗi loại kết luận độc lập</label>
          <div className="space-y-2.5">
            {needed.map((loai) => (
              <div key={loai} className="border border-[var(--line)] rounded-xl p-3 flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-2 font-semibold text-sm flex-1 min-w-[160px]">
                  <input type="checkbox" checked={selected[loai]} onChange={(e) => setSelected({ ...selected, [loai]: e.target.checked })} />
                  {LOAI_LOI_META[loai].label}
                </label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={!selected[loai]}
                    onClick={() => setKetLuan({ ...ketLuan, [loai]: "khong_loi" })}
                    className={`focus-ring px-2.5 py-1 rounded-lg text-xs font-semibold border ${ketLuan[loai] === "khong_loi" ? "bg-[var(--teal-500)] text-white border-[var(--teal-500)]" : "border-[var(--line)] text-[var(--ink-600)]"} disabled:opacity-30`}
                  >
                    Không lỗi
                  </button>
                  <button
                    type="button"
                    disabled={!selected[loai]}
                    onClick={() => setKetLuan({ ...ketLuan, [loai]: "loi" })}
                    className={`focus-ring px-2.5 py-1 rounded-lg text-xs font-semibold border ${ketLuan[loai] === "loi" ? "bg-[var(--coral-500)] text-white border-[var(--coral-500)]" : "border-[var(--line)] text-[var(--ink-600)]"} disabled:opacity-30`}
                  >
                    Lỗi
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        {anyLoi && (
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Kết quả cấp 1 (áp dụng cho các loại kết luận "Lỗi")</label>
            <Select
              value={meta.ketQuaCap1}
              onChange={(v) => setMeta({ ...meta, ketQuaCap1: v })}
              options={[
                { value: "Loi khong lien he", label: "Lỗi không liên hệ" },
                { value: "Loi sai bao cao", label: "Lỗi sai báo cáo" },
                { value: "Loi khac", label: "Lỗi khác" },
              ]}
              className="w-full mt-1"
            />
          </div>
        )}
        <div>
          <label className="text-xs font-semibold text-[var(--ink-400)]">Diễn giải / ghi chú</label>
          <textarea rows={2} value={meta.ghiChu} onChange={(e) => setMeta({ ...meta, ghiChu: e.target.value })} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose} type="button">
            Hủy
          </Btn>
          <Btn disabled={submit.isPending}>{submit.isPending ? "Đang lưu…" : "Lưu kết quả khảo sát"}</Btn>
        </div>
      </form>
    </Modal>
  );
}

function AssignModal({ row, onClose }: { row: CanKhaoSatRow; onClose: () => void }) {
  const { data: cskhList } = useQuery({
    queryKey: ["cskh-list"],
    queryFn: () => api.get<{ rows: { email: string; ten: string | null }[] }>("/survey/cskh-list"),
  });
  const [cskh, setCskh] = useState("");
  const [openAll, setOpenAll] = useState(false);
  const addToast = useToast();
  const qc = useQueryClient();

  const submit = useMutation({
    mutationFn: () => api.post("/survey/assign", { case_id: row.id, assigned_to: openAll ? null : cskh || null }),
    onSuccess: () => {
      addToast(`Đã phân công khảo sát ca ${row.id}`);
      qc.invalidateQueries({ queryKey: ["survey"] });
      qc.invalidateQueries({ queryKey: ["survey-counts"] });
      onClose();
    },
  });

  return (
    <Modal open onClose={onClose} title={`Phân công khảo sát — Ca ${row.id}`}>
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={openAll} onChange={(e) => setOpenAll(e.target.checked)} /> Mở cho tất cả CSKH cùng nhận (ai gọi trước được tính năng suất)
        </label>
        {!openAll && (
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Phân công cho CSKH cụ thể</label>
            <Select
              value={cskh}
              onChange={setCskh}
              options={[{ value: "", label: "— Chọn CSKH —" }, ...(cskhList?.rows ?? []).map((u) => ({ value: u.email, label: u.ten ?? u.email }))]}
              className="w-full mt-1"
            />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>
            Hủy
          </Btn>
          <Btn onClick={() => submit.mutate()} disabled={submit.isPending || (!openAll && !cskh)}>
            Xác nhận phân công
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

interface BulkAssignSummary {
  capNhat: number;
  loi: number;
  errors: string[];
}

function BulkAssignModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"idle" | "preview">("idle");
  const [preview, setPreview] = useState<BulkAssignSummary | null>(null);
  const [rows, setRows] = useState<{ id?: string; assigned_to?: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addToast = useToast();
  const qc = useQueryClient();

  async function handleDownload() {
    const res = await api.get<{ rows: CanKhaoSatRow[] }>("/survey?tab=can-khao-sat&export=true");
    await exportRowsToExcel(res.rows, "can_khao_sat_gan_cskh.xlsx");
  }

  const previewMutation = useMutation({
    mutationFn: (rows: { id?: string; assigned_to?: string }[]) => api.post<BulkAssignSummary>("/survey/assign-bulk/preview", { rows }),
    onSuccess: (summary) => {
      setPreview(summary);
      setStep("preview");
    },
    onError: () => addToast("Không đọc được file, kiểm tra lại định dạng."),
  });

  const commitMutation = useMutation({
    mutationFn: () => api.post<BulkAssignSummary>("/survey/assign-bulk/commit", { rows }),
    onSuccess: (summary) => {
      addToast(`Đã gán CSKH cho ${summary.capNhat} ca`);
      qc.invalidateQueries({ queryKey: ["survey"] });
      qc.invalidateQueries({ queryKey: ["survey-counts"] });
      onClose();
    },
    onError: () => addToast("Gán CSKH hàng loạt thất bại, thử lại sau."),
  });

  async function handleFileChosen(file: File) {
    const XLSX = await import("xlsx");
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      const workbook = XLSX.read(data, { type: "binary" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json<{ id?: string; assigned_to?: string }>(sheet, { defval: "" });
      setRows(parsed);
      previewMutation.mutate(parsed);
    };
    reader.readAsBinaryString(file);
  }

  return (
    <Modal open onClose={onClose} title="Gán CSKH hàng loạt" width="max-w-xl">
      <div className="text-sm text-[var(--ink-600)] mb-4">
        1. Tải danh sách hiện tại (có cột <b className="font-mono">assigned_to</b>) → 2. Điền email CSKH phụ trách cho từng dòng trong Excel → 3. Tải file đã điền lên
        đây để cập nhật hàng loạt.
      </div>
      <Btn variant="ghost" size="sm" onClick={handleDownload} className="mb-4">
        ⬇ Tải danh sách hiện tại
      </Btn>

      {step === "idle" && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer border-2 border-dashed border-[var(--ocean-100)] rounded-2xl p-8 text-center hover:border-[var(--ocean-400)] hover:bg-[var(--ocean-100)]/20 transition-colors"
        >
          <div className="text-2xl mb-2">⇩</div>
          <div className="font-semibold text-sm text-[var(--ink-900)]">{previewMutation.isPending ? "Đang phân tích file…" : "Bấm để chọn file đã điền"}</div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileChosen(file);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {step === "preview" && preview && (
        <div className="anim-in">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl bg-[var(--teal-500)]/10 p-3">
              <div className="text-xs text-[var(--ink-400)]">Sẽ cập nhật</div>
              <div className="text-xl font-bold text-[var(--teal-500)]">{preview.capNhat}</div>
            </div>
            <div className="rounded-xl bg-[var(--coral-500)]/10 p-3">
              <div className="text-xs text-[var(--ink-400)]">Lỗi</div>
              <div className="text-xl font-bold text-[var(--coral-500)]">{preview.loi}</div>
            </div>
          </div>
          {preview.errors.length > 0 && (
            <div className="text-xs text-[var(--coral-500)] mb-4 max-h-24 overflow-y-auto">
              {preview.errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Btn onClick={() => commitMutation.mutate()} disabled={commitMutation.isPending || preview.capNhat === 0}>
              {commitMutation.isPending ? "Đang cập nhật…" : "Xác nhận gán CSKH"}
            </Btn>
            <Btn
              variant="ghost"
              onClick={() => {
                setStep("idle");
                setPreview(null);
              }}
            >
              Hủy
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}
