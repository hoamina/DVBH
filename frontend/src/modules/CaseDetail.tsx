import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, statusTone } from "../components/ui/Badge";
import { Field } from "../components/ui/Field";
import { Card } from "../components/ui/Card";
import { Select } from "../components/ui/Select";
import { Btn } from "../components/ui/Btn";
import { Tabs, type TabItem } from "../components/ui/Tabs";
import { Modal } from "../components/ui/Modal";
import { CacheBanner } from "../components/ui/CacheBanner";
import { CaseImageGallery, parseLinkHinhAnh } from "../components/CaseImageGallery";
import { LoadingInline } from "../components/ui/LoadingInline";
import { TiepNhanModal, TienTrinhPanel } from "../components/TienTrinhPanel";
import { api, buildQuery } from "../api/client";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/AuthContext";
import { getCachedEntry, setCachedEntry, type CacheEntry } from "../lib/closedDataCache";
import { fetchWithHashCache } from "../lib/staticListCache";
import { trangThaiLapOf } from "../lib/caLapStatus";
import { computeCaseTickers } from "../lib/caseTickers";
import {
  TRANG_THAI_LABELS,
  TRANG_THAI_DONG,
  canWriteTranhChap,
  describeTranhChapError,
  type TienTrinhRow,
  type PhanLoaiTranhChapRow,
  type KetQuaXuLyTranhChapRow,
} from "../lib/tranhChapShared";
import {
  fmtDateTime,
  fmtDate,
  fmtVND,
  parseDbDateTime,
  LOAI_LOI_META,
  CA_LAP_META,
  CA_LAP_KEYS,
  HINH_THUC_XU_LY_META,
  HINH_THUC_XU_LY_KEYS,
  NAP_GAS_DANH_GIA_META,
  NAP_GAS_DANH_GIA_KEYS,
  NAP_GAS_PHI_DICH_VU_META,
  NAP_GAS_PHI_DICH_VU_KEYS,
  type CaseRow,
  type GiaiTrinhRow,
  type LyDoRow,
  type LinhKienRow,
  type ViPhamRow,
  type CaLapDetection,
  type NapGasDanhGiaRow,
  type Paged,
} from "../types";

type ViewMode = "compact" | "expanded";

interface CaseDetailResponse {
  case: CaseRow;
  giaiTrinh: GiaiTrinhRow[];
  ketQuaGoi: unknown[];
  viPham: ViPhamRow[];
  caLap: CaLapDetection;
  napGasDanhGia: NapGasDanhGiaRow | null;
}

async function fetchCaseDetail(caseId: string): Promise<CaseDetailResponse> {
  return api.get<CaseDetailResponse>(`/cases/${caseId}`);
}

// Dung chung cho ca ca goc VA ca doi chieu (cung 1 namespace cache "case-{id}"/["case", id] -
// tan dung lai du lieu da tung mo truoc do cho ca nao). Xem comment goc o cho goi lan dau ve ly do
// dieu kien "caLap !== undefined" bat buoc phai co (bug ca "1255604").
async function fetchCaseDetailCached(id: string): Promise<CacheEntry<CaseDetailResponse>> {
  const cacheKey = `case-${id}`;
  const cached = await getCachedEntry<CaseDetailResponse>(cacheKey);
  if (cached && cached.data.case.thoi_gian_hoan_thanh && cached.data.caLap !== undefined) return cached;

  const fresh = await fetchCaseDetail(id);
  if (fresh.case.thoi_gian_hoan_thanh) return setCachedEntry(cacheKey, fresh);
  return { data: fresh, cachedAt: new Date().toISOString() };
}

// Phan "chi doc" cua thong tin khach hang (fields grid + 3 Card) - dung chung cho ca goc (cot trai,
// co them nut hanh dong bao quanh o noi goi) va ca doi chieu (cot giua, thuan tham khao, khong nut
// hanh dong). "serialExtra" la phan tu dat canh Serial (nut them Blacklist hoac badge da blacklist).
function renderCaseFieldsGrid(c: CaseRow, serialExtra?: ReactNode, serialBlacklisted?: boolean) {
  return (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm mb-4">
        <Field label="Khách hàng" value={c.khach_hang ?? "—"} />
        <Field
          label="Serial"
          value={
            <span className="flex items-center gap-2">
              <span className={`font-mono ${serialBlacklisted ? "line-through text-[var(--ink-400)]" : ""}`}>{c.seri_san_pham ?? "—"}</span>
              {serialExtra}
            </span>
          }
        />
        <Field label="Khu vực / Tỉnh" value={`${c.khu_vuc ?? "—"} — ${c.tinh ?? "—"} ${c.quan_huyen ? "— " + c.quan_huyen : ""}`} />
        <Field label="Hãng / Nhóm SP" value={`${c.hang ?? "—"} — ${c.nhom_san_pham ?? "—"}`} />
        <Field label="Kỹ thuật viên" value={c.ky_thuat_vien ?? "—"} />
        <Field label="Tiếp nhận CSKH" value={fmtDateTime(c.thoi_gian_cskh_tiep_nhan)} />
        <Field label="Hẹn xử lý" value={fmtDateTime(c.thoi_gian_hen_xu_ly)} />
        <Field label="Thời gian hoàn thành" value={fmtDateTime(c.thoi_gian_hoan_thanh)} />
        <Field label="Dự kiến hoàn thành (giải trình gần nhất)" value={fmtDateTime(c.last_ngay_du_kien_hoan_thanh)} />
        <Field label="Ngày import" value={fmtDateTime(c.ngay_import)} />
        <Field label="Cập nhật gần nhất" value={fmtDateTime(c.ngay_cap_nhat_gan_nhat)} />
        <Field label="Đúng hạn / Xử lý 24h" value={`${c.dung_han ?? "—"} / ${c.xu_ly_24h_bucket ?? "—"}`} />
      </div>

      <Card className="p-4 mb-3">
        <div className="font-display font-bold text-sm mb-3">Thông tin xử lý</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
          <Field label="Nhóm / Loại yêu cầu" value={`${c.nhom_yeu_cau ?? "—"} — ${c.loai_yeu_cau ?? "—"}`} />
          <Field label="Cách thức xử lý" value={c.cach_thuc_xu_ly ?? "—"} />
          <Field label="Sản phẩm bảo hành" value={c.san_pham_bao_hanh ?? "—"} />
          <Field label="Hình thức bảo hành" value={c.hinh_thuc_bao_hanh ?? "—"} />
          <Field label="Tiến độ hoàn thành" value={c.tien_do_hoan_thanh ?? "—"} />
          <Field label="Lý do hủy" value={c.ly_do_huy ?? "—"} />
          <Field label="Lý do quá hạn" value={c.ly_do_qua_han ?? "—"} />
          <div className="col-span-2">
            <Field label="Mô tả lỗi" value={c.mo_ta_loi ?? "—"} />
          </div>
          <div className="col-span-2">
            <Field label="Lưu ý lỗi linh kiện" value={c.luu_y_loi_linh_kien ?? "—"} />
          </div>
          <div className="col-span-2">
            <Field label="Nội dung xử lý chi tiết" value={c.noi_dung_xu_ly ?? "—"} />
          </div>
        </div>
      </Card>

      <Card className="p-4 mb-3">
        <div className="font-display font-bold text-sm mb-3">
          Hình ảnh báo cáo công việc
          {parseLinkHinhAnh(c.link_hinh_anh).length > 0 && ` (${parseLinkHinhAnh(c.link_hinh_anh).length})`}
        </div>
        <CaseImageGallery linkHinhAnh={c.link_hinh_anh} />
      </Card>

      <Card className="p-4 mb-3">
        <div className="font-display font-bold text-sm mb-3">Doanh thu</div>
        <div className="grid grid-cols-3 gap-x-4 gap-y-2.5 text-sm">
          <Field label="DT sản phẩm" value={fmtVND(c.dt_san_pham)} />
          <Field label="DT linh kiện" value={fmtVND(c.dt_linh_kien)} />
          <Field label="DT dịch vụ" value={fmtVND(c.dt_dich_vu)} />
        </div>
      </Card>

      <Card className="p-4">
        <div className="font-display font-bold text-sm mb-3">Phân loại &amp; nguồn gốc</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
          <Field label="Đối tác" value={c.doi_tac ?? "—"} />
          <Field label="Ngày mua" value={fmtDate(c.ngay_mua)} />
          <Field label="Nhóm khách hàng" value={c.nhom_kh ?? "—"} />
          <Field label="Ngành / Loại ngành" value={`${c.nganh ?? "—"} — ${c.loai_nganh ?? "—"}`} />
          <Field
            label="Link CRM"
            value={
              c.link_crm ? (
                <a href={c.link_crm} target="_blank" rel="noreferrer" className="text-[var(--ocean-600)] underline">
                  Mở trên CRM
                </a>
              ) : (
                "—"
              )
            }
          />
        </div>
      </Card>
    </>
  );
}

export function CaseDetail({
  caseId,
  viewMode,
  tab,
  onTabChange,
  onViewModeChange,
  rootCaseId,
  onClose,
  onOpenCase,
  canGiaiTrinh,
  canGsLap,
  canQcLap,
  canNapGas,
  canHuyCa,
  canGoBack,
  onBack,
  onBackToRoot,
}: {
  caseId: string | null;
  viewMode: ViewMode;
  tab: string;
  onTabChange: (tab: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
  rootCaseId: string | null;
  onClose: () => void;
  onOpenCase: (id: string) => void;
  canGiaiTrinh: boolean;
  canGsLap: boolean;
  canQcLap: boolean;
  canNapGas: boolean;
  canHuyCa: boolean;
  canGoBack: boolean;
  onBack: () => void;
  onBackToRoot: () => void;
}) {
  const addToast = useToast();
  const qc = useQueryClient();

  const { data: entry, isLoading } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => fetchCaseDetailCached(caseId!),
    enabled: caseId !== null,
  });

  const syncCaseMutation = useMutation({
    mutationFn: async () => {
      const fresh = await fetchCaseDetail(caseId!);
      return fresh.case.thoi_gian_hoan_thanh ? setCachedEntry(`case-${caseId}`, fresh) : { data: fresh, cachedAt: new Date().toISOString() };
    },
    onSuccess: (newEntry) => qc.setQueryData(["case", caseId], newEntry),
  });

  const data = entry?.data;
  const isFromCache = !!(data?.case.thoi_gian_hoan_thanh && entry);

  // Ca "doi chieu" (Phan 1: bang so sanh) - chi mot cot phu, doc-only, dung LAI dung namespace
  // cache ["case", id] nhu ca goc de tan dung du lieu da tung mo truoc do cho ca nao.
  const [compareId, setCompareId] = useState<string | null>(null);
  const { data: compareEntry } = useQuery({
    queryKey: ["case", compareId],
    queryFn: () => fetchCaseDetailCached(compareId!),
    enabled: compareId !== null,
  });
  const compareData = compareEntry?.data;
  const compareC = compareData?.case;

  const { data: lyDoData } = useQuery({
    queryKey: ["settings-ly-do"],
    queryFn: () => fetchWithHashCache<{ rows: LyDoRow[] }>("settings-ly-do", "/settings/ly-do/version", "/settings/ly-do"),
    enabled: caseId !== null,
  });
  const { data: linhKienData } = useQuery({
    queryKey: ["settings-linh-kien"],
    queryFn: () => fetchWithHashCache<{ rows: LinhKienRow[] }>("settings-linh-kien", "/settings/linh-kien/version", "/settings/linh-kien"),
    enabled: caseId !== null,
  });

  // "Tranh chap, khieu nai" - tab moi, dung chung component TienTrinhPanel/TiepNhanModal voi
  // module TranhChapModule.tsx (xem components/TienTrinhPanel.tsx). Dung CHUNG queryKey
  // "settings-phan-loai-tranh-chap"/"settings-ket-qua-xu-ly-tranh-chap" voi module do de tan dung
  // cache neu ca 2 dang mo cung luc.
  const auth = useAuth();
  const currentUser = auth.status === "authenticated" ? auth.user : null;
  const { data: phanLoaiOptions } = useQuery({
    queryKey: ["settings-phan-loai-tranh-chap"],
    queryFn: () => api.get<{ rows: PhanLoaiTranhChapRow[] }>("/settings/phan-loai-tranh-chap"),
    enabled: caseId !== null,
  });
  const { data: ketQuaOptions } = useQuery({
    queryKey: ["settings-ket-qua-xu-ly-tranh-chap"],
    queryFn: () => api.get<{ rows: KetQuaXuLyTranhChapRow[] }>("/settings/ket-qua-xu-ly-tranh-chap"),
    enabled: caseId !== null,
  });
  // "trang_thai" truyen du ca 4 gia tri (ke ca 2 trang thai dong) - khac danh sach chinh cua
  // TranhChapModule (mac dinh an dong), o day can XEM DUOC TOAN BO lich su tien trinh cua ca nay.
  const { data: tienTrinhCaseData } = useQuery({
    queryKey: ["tranh-chap-tien-trinh-case", caseId],
    queryFn: () =>
      api.get<Paged<TienTrinhRow>>(
        `/tranh-chap/tien-trinh${buildQuery({ case_id: caseId!, trang_thai: Object.keys(TRANG_THAI_LABELS).join(","), pageSize: 50 })}`,
      ),
    enabled: caseId !== null,
  });
  const [tiepNhanTranhChapOpen, setTiepNhanTranhChapOpen] = useState(false);

  const tiepNhanTranhChap = useMutation({
    mutationFn: (body: { phan_loai_tranh_chap: string; muc_do: string; ghi_chu?: string; thoi_gian_du_kien_xong?: string }) =>
      api.post(`/tranh-chap/${caseId}/tiep-nhan`, body),
    onSuccess: () => {
      addToast("Đã tiếp nhận xử lý tranh chấp");
      setTiepNhanTranhChapOpen(false);
      qc.invalidateQueries({ queryKey: ["tranh-chap-tien-trinh-case", caseId] });
      qc.invalidateQueries({ queryKey: ["tranh-chap-cho-xu-ly"] });
      qc.invalidateQueries({ queryKey: ["tranh-chap-tien-trinh"] });
      qc.invalidateQueries({ queryKey: ["tranh-chap-tien-trinh-stats"] });
      qc.invalidateQueries({ queryKey: ["notifications-count"] });
    },
    onError: (err) => addToast(describeTranhChapError(err, "Không thể tiếp nhận, thử lại sau.")),
  });

  const [giaiTrinhModalOpen, setGiaiTrinhModalOpen] = useState(false);
  const [caLapModalOpen, setCaLapModalOpen] = useState(false);
  const [blacklistConfirmOpen, setBlacklistConfirmOpen] = useState(false);
  const [huyCaConfirmOpen, setHuyCaConfirmOpen] = useState(false);
  const [huyCaLyDo, setHuyCaLyDo] = useState("");

  const activeLyDo = (lyDoData?.rows ?? []).filter((l) => l.bat_tat);
  const activeLinhKien = (linhKienData?.rows ?? []).filter((l) => l.bat_tat);

  const [form, setForm] = useState({ ly_do_cham: "", noi_dung: "", linh_kien_thieu: "", ngay_du_kien: "", ngay_yeu_cau_co_hang: "", ma_xuat_hang: "" });
  const [gsLapForm, setGsLapForm] = useState({ chot_danh_gia_lap: "", dien_giai_lap: "" });
  const [qcLapForm, setQcLapForm] = useState({ qc_chot: "", qc_ghi_chu: "" });
  const [napGasForm, setNapGasForm] = useState({ danh_gia_nap_gas: "", phi_dich_vu: "" });
  const [hinhThucForm, setHinhThucForm] = useState("");
  const lyDoChon = activeLyDo.find((l) => l.ten_ly_do === form.ly_do_cham) ?? activeLyDo[0];
  const giaiTrinhList = data?.giaiTrinh ?? [];

  // Reset cac form nhap dang do (KHONG con reset tab/viewMode o day nua - 2 thu do gio do App.tsx
  // dieu khien theo tung tang cua case stack, xem comment o App.tsx) moi khi caseId doi - tranh du
  // lieu go do o ca A "ri" sang ca B khi dieu huong qua chuoi ca lap ma chua luu.
  useEffect(() => {
    setGsLapForm({ chot_danh_gia_lap: "", dien_giai_lap: "" });
    setQcLapForm({ qc_chot: "", qc_ghi_chu: "" });
    setNapGasForm({ danh_gia_nap_gas: "", phi_dich_vu: "" });
    setHinhThucForm("");
    setCaLapModalOpen(false);
    setBlacklistConfirmOpen(false);
    setCompareId(null);
  }, [caseId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mo modal giai trinh, tu dong dien lai theo lan giai trinh gan nhat de giam go lai noi dung
  // giong het lan truoc - rieng 2 truong ngay (du kien hoan thanh / yeu cau co hang) de trong,
  // vi ngay cu da qua han nen khong nen fill lai mac dinh.
  function openGiaiTrinhModal() {
    const last = giaiTrinhList[0];
    const lyDoValid = last && activeLyDo.some((l) => l.ten_ly_do === last.ly_do_cham) ? last.ly_do_cham : "";
    setForm({
      ly_do_cham: lyDoValid,
      noi_dung: last?.noi_dung ?? "",
      linh_kien_thieu: last?.linh_kien_thieu ?? "",
      ngay_du_kien: "",
      ngay_yeu_cau_co_hang: "",
      ma_xuat_hang: last?.ma_xuat_hang_lien_quan ?? "",
    });
    setGiaiTrinhModalOpen(true);
  }

  const submit = useMutation({
    mutationFn: () =>
      api.post(`/cases/${caseId}/giai-trinh`, {
        ly_do_cham: lyDoChon?.ten_ly_do,
        noi_dung: form.noi_dung || undefined,
        linh_kien_thieu: lyDoChon?.thuoc_thieu_linh_kien ? form.linh_kien_thieu || undefined : undefined,
        ngay_du_kien_hoan_thanh: form.ngay_du_kien || undefined,
        ngay_yeu_cau_co_hang: lyDoChon?.thuoc_thieu_linh_kien ? form.ngay_yeu_cau_co_hang || undefined : undefined,
        ma_xuat_hang_lien_quan: lyDoChon?.thuoc_thieu_linh_kien ? form.ma_xuat_hang || undefined : undefined,
      }),
    onSuccess: () => {
      addToast(`Đã ghi nhận giải trình cho ca ${caseId}`);
      setForm({ ly_do_cham: "", noi_dung: "", linh_kien_thieu: "", ngay_du_kien: "", ngay_yeu_cau_co_hang: "", ma_xuat_hang: "" });
      setGiaiTrinhModalOpen(false);
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      qc.invalidateQueries({ queryKey: ["backlog"] });
      qc.invalidateQueries({ queryKey: ["backlog-counts"] });
      qc.invalidateQueries({ queryKey: ["missing-parts"] });
    },
    onError: () => addToast("Không thể ghi nhận giải trình, thử lại sau."),
  });

  const c = data?.case;
  const caLap = data?.caLap;

  const viPhamList = data?.viPham ?? [];

  // Gia tri "hieu luc" thuc su dung de hien thi/luu/kiem tra disabled - UU TIEN gia tri nguoi dung
  // vua sua (form state) > gia tri da luu tren server > mac dinh nghiep vu. Truoc day cac cho Luu
  // deu kiem tra thang state RAW (vd "!gsLapForm.chot_danh_gia_lap") nen khi mo lai 1 ca DA CO danh
  // gia (chi hien qua fallback server, form state van rong) nut Luu bi disable oan, hoac khi luu se
  // gui "undefined" de va XOA MAT du lieu cu (dien_giai_lap) chi vi nguoi dung khong dung toi o.
  // "Hinh thuc xu ly" rieng: mac dinh nghiep vu la "Tinh luong" (khong phai rong) - xem them trong
  // nhat_ky_lam_viec.md muc sua bug chon "Bo qua" khong luu duoc.
  const effectiveHinhThuc = hinhThucForm || caLap?.giaiTrinhLap?.chot_hinh_thuc_xu_ly || "Tinh luong";
  const effectiveChotDanhGiaLap = gsLapForm.chot_danh_gia_lap || caLap?.giaiTrinhLap?.chot_danh_gia_lap || "";
  const effectiveDienGiaiLap = gsLapForm.dien_giai_lap || caLap?.giaiTrinhLap?.dien_giai_lap || "";
  const effectiveQcChot = qcLapForm.qc_chot || caLap?.giaiTrinhLap?.qc_chot || "";
  const effectiveQcGhiChu = qcLapForm.qc_ghi_chu || caLap?.giaiTrinhLap?.qc_ghi_chu || "";

  const napGasDanhGia = data?.napGasDanhGia ?? null;
  // Chi hien tab/form "Danh gia nap gas" cho ca THUOC DIEN nghi ngo nap gas VA da dong voi dung
  // trang thai "Hoan thanh XLSC" - khop chinh xac NAP_GAS_ELIGIBLE o backend/src/routes/napGas.ts
  // (ca dang ton hoac hoan thanh voi tien do khac se KHONG the chot danh gia o backend, nen an tab
  // di cho gon thay vi hien 1 form luon bao loi khi bam Luu).
  const napGasEligible = !!(c && c.nghi_ngo_nap_gas === 1 && c.tien_do_hoan_thanh === "Hoàn thành XLSC");
  const effectiveNapGasDanhGia = napGasForm.danh_gia_nap_gas || napGasDanhGia?.danh_gia_nap_gas || "";
  const effectiveNapGasPhiDichVu = napGasForm.phi_dich_vu || napGasDanhGia?.phi_dich_vu || "";

  // "Tranh chap, khieu nai" - CHI ca DA DONG (Hoan thanh XLSC hoac Khong hoan thanh XLSC) VA co
  // "Nghi ngo tranh chap" moi thuoc dien - khop dung TRANH_CHAP_ELIGIBLE o backend/src/routes/tranhChap.ts.
  const tranhChapEligible = !!(c && c.nghi_ngo_tranh_chap === 1 && (c.tien_do_hoan_thanh === "Hoàn thành XLSC" || c.tien_do_hoan_thanh === "Không hoàn thành XLSC"));
  const tienTrinhListForCase = tienTrinhCaseData?.rows ?? [];
  // Cho phep "Tiep nhan" tien trinh MOI (ke ca lan 2 tro di) khi: ca thuoc dien, CHUA co tien trinh
  // nao, HOAC toan bo tien trinh hien co deu da o trang thai dong - khop dung dieu kien backend
  // POST /:caseId/tiep-nhan (chi 409 TIEN_TRINH_DANG_MO khi tien trinh gan nhat con mo).
  const canTiepNhanTranhChapMoi =
    tranhChapEligible && (tienTrinhListForCase.length === 0 || tienTrinhListForCase.every((tt) => tt.trang_thai_xu_ly && TRANG_THAI_DONG.includes(tt.trang_thai_xu_ly)));

  const lapStatus = caLap?.detection
    ? trangThaiLapOf({
        gap_days: caLap.detection.gapDays,
        chot_danh_gia_lap: caLap.giaiTrinhLap?.chot_danh_gia_lap ?? null,
        qc_chot: caLap.giaiTrinhLap?.qc_chot ?? null,
      })
    : null;

  // Ca lap CHI phat sinh tren ca DA DONG (co thoi_gian_hoan_thanh) - ma ca da dong luon doc tu
  // closedDataCache (IndexedDB) TRUOC ca goi API (xem queryFn ["case", caseId] o tren). Neu chi
  // invalidateQueries, react-query se goi lai queryFn nhung queryFn lai tra ve dung cache CU (vi
  // case.thoi_gian_hoan_thanh khong doi), khong bao gio thay du lieu giai_trinh_lap moi vua luu -
  // phai fetch that + ghi de closedDataCache, dung y het pattern cua syncCaseMutation o tren.
  async function refreshCaLapQueries() {
    const fresh = await fetchCaseDetail(caseId!);
    const newEntry = fresh.case.thoi_gian_hoan_thanh ? await setCachedEntry(`case-${caseId}`, fresh) : { data: fresh, cachedAt: new Date().toISOString() };
    qc.setQueryData(["case", caseId], newEntry);
    qc.invalidateQueries({ queryKey: ["ca-lap-list"] });
    qc.invalidateQueries({ queryKey: ["ca-lap-status"] });
    qc.invalidateQueries({ queryKey: ["ca-lap-tong-quan"] });
  }

  const addBlacklist = useMutation({
    mutationFn: () => api.post("/ca-lap/blacklist", { seri_san_pham: c?.seri_san_pham }),
    onSuccess: async () => {
      addToast(`Đã thêm serial ${c?.seri_san_pham} vào blacklist`);
      setBlacklistConfirmOpen(false);
      await refreshCaLapQueries();
      qc.invalidateQueries({ queryKey: ["ca-lap-blacklist"] });
    },
    onError: () => addToast("Không thể thêm serial vào blacklist, thử lại sau."),
  });

  // "Huy ca" (Admin) - an ca khoi moi hang doi can xu ly + KPI (xem backend/src/routes/cases.ts
  // POST /:id/huy, /bo-huy), co the dao nguoc. Sau khi doi trang thai, phai fetch lai that (giong
  // refreshCaLapQueries/refreshNapGasQueries) vi case co the da nam trong closedDataCache (IndexedDB),
  // roi invalidate cac danh sach "can xu ly" khac ma ca nay vua bien mat/xuat hien tro lai.
  async function refreshAfterHuyCa() {
    const fresh = await fetchCaseDetail(caseId!);
    const newEntry = fresh.case.thoi_gian_hoan_thanh ? await setCachedEntry(`case-${caseId}`, fresh) : { data: fresh, cachedAt: new Date().toISOString() };
    qc.setQueryData(["case", caseId], newEntry);
    qc.invalidateQueries({ queryKey: ["notifications-count"] });
    qc.invalidateQueries({ queryKey: ["backlog-list"] });
    qc.invalidateQueries({ queryKey: ["backlog-stats"] });
    qc.invalidateQueries({ queryKey: ["backlog-counts"] });
    qc.invalidateQueries({ queryKey: ["backlog-by-khu-vuc"] });
    qc.invalidateQueries({ queryKey: ["survey-counts"] });
    qc.invalidateQueries({ queryKey: ["survey-bao-cao-khu-vuc"] });
    qc.invalidateQueries({ queryKey: ["ca-lap-list"] });
    qc.invalidateQueries({ queryKey: ["ca-lap-status"] });
    qc.invalidateQueries({ queryKey: ["ca-lap-tong-quan"] });
    qc.invalidateQueries({ queryKey: ["missing-parts"] });
    qc.invalidateQueries({ queryKey: ["nap-gas"] });
  }

  const huyCa = useMutation({
    mutationFn: () => api.post(`/cases/${caseId}/huy`, { ly_do: huyCaLyDo || undefined }),
    onSuccess: async () => {
      addToast(`Đã hủy ca ${caseId}`);
      setHuyCaConfirmOpen(false);
      setHuyCaLyDo("");
      await refreshAfterHuyCa();
    },
    onError: () => addToast("Không thể hủy ca, thử lại sau."),
  });

  const boHuyCa = useMutation({
    mutationFn: () => api.post(`/cases/${caseId}/bo-huy`, {}),
    onSuccess: async () => {
      addToast(`Đã bỏ hủy ca ${caseId}`);
      await refreshAfterHuyCa();
    },
    onError: () => addToast("Không thể bỏ hủy ca, thử lại sau."),
  });

  // Giam sat "Chot lap": 1 nut duy nhat luu ca Hinh thuc xu ly + Danh gia lap + Dien giai cung luc
  // (gop 3 API rieng le truoc day thanh 1 lan goi /gs, xem backend/src/routes/caLap.ts).
  const saveGsLap = useMutation({
    mutationFn: () =>
      api.post(`/ca-lap/${caseId}/gs`, {
        chot_danh_gia_lap: effectiveChotDanhGiaLap,
        dien_giai_lap: effectiveDienGiaiLap || undefined,
        chot_hinh_thuc_xu_ly: effectiveHinhThuc,
      }),
    onSuccess: async () => {
      addToast("Đã chốt lặp (Giám sát)");
      await refreshCaLapQueries();
    },
    onError: () => addToast("Không thể chốt lặp, thử lại sau."),
  });

  const saveQcLap = useMutation({
    mutationFn: () => api.post(`/ca-lap/${caseId}/qc`, { qc_chot: effectiveQcChot, qc_ghi_chu: effectiveQcGhiChu || undefined }),
    onSuccess: async () => {
      addToast("Đã chốt lặp (QC)");
      await refreshCaLapQueries();
    },
    onError: () => addToast("Không thể chốt lặp, thử lại sau."),
  });

  // Nap gas cung la ca DA DONG (chi ap dung khi thoi_gian_hoan_thanh + tien_do_hoan_thanh = "Hoan
  // thanh XLSC" - xem NAP_GAS_ELIGIBLE trong backend/src/routes/napGas.ts), nen dung y het pattern
  // refreshCaLapQueries() o tren: phai fetch that + ghi de closedDataCache, khong the chi
  // invalidateQueries suong (queryFn se tra ve dung cache cu vi thoi_gian_hoan_thanh khong doi).
  async function refreshNapGasQueries() {
    const fresh = await fetchCaseDetail(caseId!);
    const newEntry = fresh.case.thoi_gian_hoan_thanh ? await setCachedEntry(`case-${caseId}`, fresh) : { data: fresh, cachedAt: new Date().toISOString() };
    qc.setQueryData(["case", caseId], newEntry);
    qc.invalidateQueries({ queryKey: ["nap-gas"] });
    qc.invalidateQueries({ queryKey: ["nap-gas-by-khu-vuc"] });
    qc.invalidateQueries({ queryKey: ["notifications-count"] });
  }

  const saveNapGas = useMutation({
    mutationFn: () =>
      api.patch(`/nap-gas/${caseId}/danh-gia`, { danh_gia_nap_gas: effectiveNapGasDanhGia, phi_dich_vu: effectiveNapGasPhiDichVu }),
    onSuccess: async () => {
      addToast("Đã chốt đánh giá nạp gas");
      await refreshNapGasQueries();
    },
    onError: () => addToast("Không thể chốt đánh giá nạp gas, thử lại sau."),
  });

  if (!caseId) return null;

  // Noi dung "Thong tin khach hang" - o "expanded" la 1 cot ghim ben trai (luon hien), o "compact"
  // la 1 tab nhu ban thiet ke cu. Banner cache chi hien O DAY (trong noi dung) khi "compact" - ban
  // "expanded" hien gon hon ngay trong thanh tieu de (xem headerBar) vi tren do con nhieu cho trong.
  const infoContent = c && (
    <>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Badge tone={c.thoi_gian_hoan_thanh ? "teal" : "amber"}>{c.thoi_gian_hoan_thanh ? "Đã hoàn thành" : "Đang tồn đọng"}</Badge>
        {c.huy_bo_at && (
          <Badge tone="gray" solid>
            🚫 Đã hủy{c.huy_bo_ly_do ? `: ${c.huy_bo_ly_do}` : ""}
          </Badge>
        )}
        {canHuyCa &&
          (c.huy_bo_at ? (
            <Btn size="sm" variant="ghost" onClick={() => boHuyCa.mutate()} disabled={boHuyCa.isPending}>
              {boHuyCa.isPending ? "Đang bỏ hủy…" : "Bỏ hủy ca"}
            </Btn>
          ) : (
            <Btn size="sm" variant="danger" onClick={() => setHuyCaConfirmOpen(true)}>
              Hủy ca
            </Btn>
          ))}
      </div>

      {viewMode === "compact" && isFromCache && entry && (
        <CacheBanner cachedAt={entry.cachedAt} onSync={() => syncCaseMutation.mutate()} isSyncing={syncCaseMutation.isPending} />
      )}

      {!c.thoi_gian_hoan_thanh && canGiaiTrinh && (
        <div className="flex justify-end mb-3">
          <Btn size="sm" onClick={openGiaiTrinhModal}>
            + Thêm giải trình
          </Btn>
        </div>
      )}

      {renderCaseFieldsGrid(
        c,
        caLap?.serialBlacklisted ? (
          <Badge tone="gray">🚫 Đã blacklist</Badge>
        ) : (
          c.seri_san_pham &&
          (canGsLap || canQcLap) && (
            <button
              type="button"
              onClick={() => setBlacklistConfirmOpen(true)}
              className="text-xs font-bold text-white bg-[var(--coral-500)] rounded-full px-3 py-1 shadow-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              ➕ Blacklist
            </button>
          )
        ),
        caLap?.serialBlacklisted,
      )}
    </>
  );

  // Cot doi chieu (Phan 1) - thuan tham khao, khong nut hanh dong, chi hien khi co compareId.
  const compareContent = compareId && (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold text-[var(--ocean-600)] uppercase tracking-wide">Ca đối chiếu: {compareId}</div>
        <button
          type="button"
          onClick={() => setCompareId(null)}
          className="focus-ring w-6 h-6 rounded hover:bg-slate-100 text-[var(--ink-400)] text-xs shrink-0"
        >
          ✕
        </button>
      </div>
      {!compareC && <LoadingInline />}
      {compareC && (
        <>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Badge tone={compareC.thoi_gian_hoan_thanh ? "teal" : "amber"}>{compareC.thoi_gian_hoan_thanh ? "Đã hoàn thành" : "Đang tồn đọng"}</Badge>
          </div>
          {renderCaseFieldsGrid(
            compareC,
            compareData?.caLap.serialBlacklisted ? <Badge tone="gray">🚫 Đã blacklist</Badge> : undefined,
            compareData?.caLap.serialBlacklisted,
          )}
        </>
      )}
    </>
  );

  const giaiTrinhContent = c && (
    <>
      {!c.thoi_gian_hoan_thanh && canGiaiTrinh && (
        <div className="flex justify-end mb-4">
          <Btn size="sm" onClick={openGiaiTrinhModal}>
            + Thêm giải trình
          </Btn>
        </div>
      )}

      <div>
        <div className="font-display font-bold text-sm mb-3">Lịch sử giải trình</div>
        {giaiTrinhList.length === 0 && <div className="text-sm text-[var(--ink-400)] italic">Chưa có giải trình nào cho ca này.</div>}
        <div className="space-y-3">
          {giaiTrinhList.map((l) => (
            <div key={l.id} className="relative pl-4 border-l-2 border-[var(--ocean-100)]">
              <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-[var(--ocean-500)]"></div>
              <div className="text-xs text-[var(--ink-400)] mb-0.5">
                {fmtDateTime(l.ngay_giai_trinh)} · {l.nguoi_giai_trinh}
              </div>
              <div className="text-sm font-semibold">{l.ly_do_cham}</div>
              <div className="text-sm text-[var(--ink-600)]">{l.noi_dung}</div>
              {l.linh_kien_thieu && <div className="text-xs text-[var(--amber-500)] font-semibold mt-0.5">Linh kiện thiếu: {l.linh_kien_thieu}</div>}
              {l.ngay_yeu_cau_co_hang && <div className="text-xs text-[var(--ink-400)] mt-0.5">Ngày yêu cầu có hàng: {fmtDate(l.ngay_yeu_cau_co_hang)}</div>}
              {l.ma_xuat_hang_lien_quan && <div className="text-xs text-[var(--ink-400)]">Mã xuất hàng liên quan: {l.ma_xuat_hang_lien_quan}</div>}
            </div>
          ))}
        </div>
      </div>
    </>
  );

  const viPhamContent = (
    <div>
      {viPhamList.length === 0 && <div className="text-sm text-[var(--ink-400)] italic">Chưa ghi nhận vi phạm nào cho ca này.</div>}
      <div className="space-y-3">
        {viPhamList.map((v) => {
          const trangThai = v.chot_bo_cap_2 !== null ? (v.chot_bo_cap_2 ? "đã xác nhận" : "Không vi phạm") : v.ket_qua_cap_1 ? "chờ QC" : "Nghi ngờ";
          return (
            <Card key={v.id} className="p-3">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-1.5">
                <span className="font-semibold text-sm">{LOAI_LOI_META[v.loai_loi]?.label ?? v.loai_loi}</span>
                <Badge tone={statusTone(trangThai)}>{trangThai}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-[var(--ink-600)]">
                <Field label="Kết quả cấp 1" value={v.ket_qua_cap_1 ?? "Chưa khảo sát"} />
                <Field label="Người ghi nhận" value={v.nguoi_ghi_nhan} />
                <Field label="Ngày ghi nhận" value={fmtDateTime(v.ngay_ghi_nhan)} />
                {v.chot_bo_cap_2 !== null && (
                  <>
                    <Field label="Người chốt cấp 2" value={v.nguoi_chot ?? "—"} />
                    <Field label="Ngày chốt cấp 2" value={fmtDateTime(v.ngay_chot)} />
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );

  const caLapContent = (
    <div>
      {!caLap?.detection && <div className="text-sm text-[var(--ink-400)] italic">Không phát hiện ca lặp (cùng serial, hoàn thành trong 45 ngày) cho ca này.</div>}
      {caLap?.detection && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-1.5 mb-3 text-sm">
            <span>
              Ca liền trước: <span className="font-mono font-semibold">{caLap.detection.priorId}</span>
              <span className="text-[var(--ink-400)]"> · hoàn thành {fmtDateTime(caLap.detection.priorHt)}</span>
            </span>
            <Badge tone={caLap.detection.gapDays <= 45 ? "coral" : "gray"}>{caLap.detection.gapDays.toFixed(1)} ngày</Badge>
          </div>

          {caLap.detection.gapDays <= 45 && lapStatus && (
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <Badge tone={lapStatus.tone}>{lapStatus.label}</Badge>
              <Btn size="sm" variant={canGsLap || canQcLap ? "primary" : "subtle"} onClick={() => setCaLapModalOpen(true)}>
                {canGsLap || canQcLap ? "🔒 Xử lý ca lặp" : "👁 Xem giải trình lặp"}
              </Btn>
            </div>
          )}

          {/* Danh sach ca lap uu tien len tren, la noi dung chinh cua tab - de nguoi
              dung tien tra cuu chuoi ca lien quan ma khong bi form giai trinh choan
              man hinh (form giai trinh nay chuyen vao Modal rieng, bam nut o tren de mo). */}
          <div>
            <div className="text-xs font-semibold text-[var(--ink-400)] uppercase tracking-wide mb-2">
              Chuỗi lịch sử theo serial ({caLap.lichSu.length} ca, mới nhất trên đầu)
            </div>
            <div>
              {caLap.lichSu.map((h, i) => {
                const isCurrent = h.id === caseId;
                const isCompareSelected = h.id === compareId;
                const next = caLap.lichSu[i + 1];
                const gapDays =
                  next?.thoi_gian_hoan_thanh && h.thoi_gian_hoan_thanh
                    ? (parseDbDateTime(h.thoi_gian_hoan_thanh).getTime() - parseDbDateTime(next.thoi_gian_hoan_thanh).getTime()) / 86400000
                    : null;
                // "expanded": bam dong gia goc se dong bang doi chieu, bam dong khac se
                // mo/dong bang doi chieu tai cho (khong dieu huong ca popup). "compact": giu
                // nguyen hanh vi cu - dieu huong ca popup sang ca do (mo o "expanded").
                function handleRowClick() {
                  if (viewMode === "expanded") {
                    if (isCurrent) setCompareId(null);
                    else setCompareId((prev) => (prev === h.id ? null : h.id));
                  } else if (!isCurrent) {
                    onOpenCase(h.id);
                  }
                }
                return (
                  <div key={h.id}>
                    <div
                      onClick={handleRowClick}
                      className={`flex items-start gap-2 py-1.5 px-1.5 -mx-1.5 rounded-lg border cursor-pointer hover:bg-slate-50 ${
                        isCurrent ? "border-[var(--coral-500)]" : isCompareSelected ? "border-[var(--ocean-500)]" : "border-transparent"
                      }`}
                    >
                      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${isCurrent ? "bg-[var(--coral-500)]" : "bg-[var(--teal-500)]"}`}></span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold">{fmtDateTime(h.thoi_gian_hoan_thanh)}</span>
                          {h.link_crm && (
                            <a href={h.link_crm} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                              <Btn size="sm" variant="subtle" type="button">
                                🔗 CRM
                              </Btn>
                            </a>
                          )}
                        </div>
                        <div className="text-xs text-[var(--ink-600)]">
                          ID <span className="font-mono">{h.id}</span> · {h.ky_thuat_vien ?? "—"}
                          {h.tien_do_hoan_thanh && ` · ${h.tien_do_hoan_thanh}`}
                        </div>
                      </div>
                    </div>
                    {gapDays !== null && <div className="text-[11px] text-[var(--ink-400)] pl-4 pb-1">↳ cách ca sau {gapDays.toFixed(1)} ngày</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );

  const napGasContent = (
    <div>
      {!napGasEligible && <div className="text-sm text-[var(--ink-400)] italic">Ca này không thuộc diện "Nghi ngờ nạp gas".</div>}
      {napGasEligible && (
        <>
          {canNapGas ? (
            <Card className="p-3 space-y-2">
              <label className="text-xs font-semibold text-[var(--ink-400)]">Đánh giá nạp gas</label>
              <Select
                value={effectiveNapGasDanhGia}
                onChange={(v) => setNapGasForm({ ...napGasForm, danh_gia_nap_gas: v })}
                className="w-full"
                options={[{ value: "", label: "— Chọn đánh giá —" }, ...NAP_GAS_DANH_GIA_KEYS.map((k) => ({ value: k, label: NAP_GAS_DANH_GIA_META[k].label }))]}
              />
              <label className="text-xs font-semibold text-[var(--ink-400)]">Phí dịch vụ</label>
              <Select
                value={effectiveNapGasPhiDichVu}
                onChange={(v) => setNapGasForm({ ...napGasForm, phi_dich_vu: v })}
                className="w-full"
                options={[{ value: "", label: "— Chọn phí dịch vụ —" }, ...NAP_GAS_PHI_DICH_VU_KEYS.map((k) => ({ value: k, label: NAP_GAS_PHI_DICH_VU_META[k].label }))]}
              />
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <Btn
                  size="sm"
                  onClick={() => saveNapGas.mutate()}
                  disabled={!effectiveNapGasDanhGia || !effectiveNapGasPhiDichVu || saveNapGas.isPending}
                >
                  {saveNapGas.isPending ? "Đang lưu…" : napGasDanhGia ? "🔒 Chốt lại đánh giá" : "🔒 Chốt đánh giá"}
                </Btn>
                {napGasDanhGia && (
                  <span className="text-xs text-[var(--ink-400)]">
                    {napGasDanhGia.nguoi_chot} · {fmtDateTime(napGasDanhGia.ngay_chot)}
                  </span>
                )}
              </div>
            </Card>
          ) : (
            <div className="text-xs flex flex-wrap items-center gap-1.5">
              {napGasDanhGia ? (
                <>
                  <Badge tone="ocean">{NAP_GAS_DANH_GIA_META[napGasDanhGia.danh_gia_nap_gas].label}</Badge>
                  <span className="text-[var(--ink-400)]">Phí dịch vụ: {NAP_GAS_PHI_DICH_VU_META[napGasDanhGia.phi_dich_vu].label}</span>
                  <span className="text-[var(--ink-400)]">
                    · {napGasDanhGia.nguoi_chot} · {fmtDateTime(napGasDanhGia.ngay_chot)}
                  </span>
                </>
              ) : (
                <span className="text-[var(--ink-400)] italic">Chưa có đánh giá nạp gas.</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );

  const tranhChapContent = (
    <div className="space-y-4">
      {!tranhChapEligible && <div className="text-sm text-[var(--ink-400)] italic">Ca này không thuộc diện tranh chấp.</div>}
      {tranhChapEligible && tienTrinhListForCase.length === 0 && (
        <div className="text-sm text-[var(--ink-400)] italic">Ca này chưa có tiến trình xử lý tranh chấp nào.</div>
      )}
      {tranhChapEligible && canTiepNhanTranhChapMoi && currentUser && canWriteTranhChap(currentUser, c?.khu_vuc ?? null) && (
        <div className="flex justify-end">
          <Btn size="sm" onClick={() => setTiepNhanTranhChapOpen(true)}>
            + Tiếp nhận xử lý tranh chấp
          </Btn>
        </div>
      )}
      {tienTrinhListForCase.map((tt) => (
        <TienTrinhPanel key={tt.id} id={tt.id} currentUser={currentUser} phanLoaiOptions={phanLoaiOptions?.rows.filter((r) => r.bat_tat) ?? []} ketQuaOptions={ketQuaOptions?.rows.filter((r) => r.bat_tat) ?? []} />
      ))}
    </div>
  );

  const tabsList: TabItem[] =
    viewMode === "compact"
      ? [
          { key: "info", label: "Thông tin khách hàng" },
          { key: "giai-trinh", label: "Giải trình tồn", count: giaiTrinhList.length },
          { key: "vi-pham", label: "Vi phạm ghi nhận", count: viPhamList.length },
          { key: "ca-lap", label: "Ca lặp", count: caLap?.detection ? 1 : 0 },
          { key: "nap-gas", label: "Đánh giá nạp gas", count: napGasDanhGia ? 1 : 0 },
          { key: "tranh-chap", label: "Tranh chấp, KN", count: tienTrinhListForCase.length },
        ]
      : [
          { key: "giai-trinh", label: "Giải trình tồn", count: giaiTrinhList.length },
          { key: "vi-pham", label: "Vi phạm ghi nhận", count: viPhamList.length },
          { key: "ca-lap", label: "Ca lặp", count: caLap?.detection ? 1 : 0 },
          { key: "nap-gas", label: "Đánh giá nạp gas", count: napGasDanhGia ? 1 : 0 },
          { key: "tranh-chap", label: "Tranh chấp, KN", count: tienTrinhListForCase.length },
        ];

  const viewModeToggle = (
    <div className="flex items-center rounded-lg border border-[var(--line)] overflow-hidden text-xs font-semibold shrink-0">
      <button
        type="button"
        onClick={() => onViewModeChange("compact")}
        className={`px-2.5 py-1.5 ${viewMode === "compact" ? "bg-[var(--ocean-500)] text-white" : "text-[var(--ink-400)] hover:bg-slate-50"}`}
      >
        Ngắn gọn
      </button>
      <button
        type="button"
        onClick={() => onViewModeChange("expanded")}
        className={`px-2.5 py-1.5 ${viewMode === "expanded" ? "bg-[var(--ocean-500)] text-white" : "text-[var(--ink-400)] hover:bg-slate-50"}`}
      >
        Mở rộng
      </button>
    </div>
  );

  // Ticker "nhom van de" gan sau ma ca - de nhin luot biet ca dang thuoc nhom nao (tong ton chua
  // giai trinh, lo ke hoach, ca lap can xu ly, vi pham cho khao sat...) ma khong can mo tung tab.
  const tickers = c ? computeCaseTickers(c, giaiTrinhList, viPhamList, activeLyDo, caLap) : [];

  // Thanh tieu de dung chung cho ca 2 che do - rieng banner cache RUT GON (chi 1 dong "gio +
  // nut dong bo") chi hien khi "expanded" (khoang trong giua tieu de va nut dong/mo rong o ban
  // nay rat rong, con "compact" da co CacheBanner day du trong noi dung nen khong lap lai o day).
  const headerBar = (
    <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--line)] shrink-0 flex-wrap">
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        {canGoBack && (
          <>
            <Btn size="sm" variant="ghost" type="button" onClick={onBack}>
              ← Quay lại
            </Btn>
            <Btn size="sm" variant="ghost" type="button" onClick={onBackToRoot}>
              ⏮ Về ca {rootCaseId}
            </Btn>
          </>
        )}
        <h3 className="font-display font-bold text-[var(--ink-900)] truncate">Chi tiết ca {caseId}</h3>
        {tickers.map((t, i) => (
          <Badge key={i} tone={t.tone}>
            {t.label}
          </Badge>
        ))}
        {c?.link_crm && (
          <a href={c.link_crm} target="_blank" rel="noreferrer">
            <Btn size="sm" variant="subtle" type="button">
              🔗 Link CRM
            </Btn>
          </a>
        )}
      </div>

      {viewMode === "expanded" && isFromCache && entry && (
        <div className="flex items-center gap-2 text-xs text-[var(--ink-400)] shrink-0">
          <span>
            💾 Dữ liệu khách hàng đã lưu về máy bạn · 🕐 {fmtDateTime(entry.cachedAt)}
          </span>
          <button
            type="button"
            onClick={() => syncCaseMutation.mutate()}
            disabled={syncCaseMutation.isPending}
            className="focus-ring font-semibold text-[var(--ocean-600)] hover:underline disabled:opacity-40 disabled:no-underline"
          >
            {syncCaseMutation.isPending ? "Đang đồng bộ…" : "🔄 Đồng bộ lại"}
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 shrink-0">
        {viewModeToggle}
        <button onClick={onClose} className="focus-ring w-8 h-8 rounded-lg hover:bg-slate-100 text-[var(--ink-400)] shrink-0">
          ✕
        </button>
      </div>
    </div>
  );

  return (
    <div className={viewMode === "expanded" ? "fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,32,51,0.45)] backdrop-blur-[2px] p-3 sm:p-6" : "fixed inset-0 z-50"}>
      {viewMode === "compact" && <div onClick={onClose} className="absolute inset-0 bg-[rgba(6,32,51,0.45)]"></div>}

      <div
        className={
          viewMode === "expanded"
            ? "bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-[1500px] h-[92vh] flex flex-col overflow-hidden anim-in"
            : "absolute right-0 top-0 h-full w-full max-w-2xl bg-[var(--surface)] shadow-2xl flex flex-col anim-in"
        }
      >
        {headerBar}

        {isLoading && (
          <div className="p-5">
            <LoadingInline />
          </div>
        )}

        {c && viewMode === "expanded" && (
          <div
            className={`flex-1 min-h-0 grid grid-cols-1 ${
              compareId ? "md:grid-cols-[minmax(280px,36%)_minmax(280px,36%)_minmax(240px,1fr)]" : "md:grid-cols-[minmax(320px,38%)_1fr]"
            } divide-y md:divide-y-0 md:divide-x divide-[var(--line)] overflow-hidden`}
          >
            {/* Cot trai: Thong tin khach hang cua CA GOC - LUON hien thi, khong con nam sau tab, de
                "toan canh" khong bien mat khi nguoi dung chuyen qua cac the phu ben phai. */}
            <div className="overflow-y-auto p-5">{infoContent}</div>

            {/* Cot giua: ca doi chieu (Phan 1) - chi xuat hien khi nguoi dung bam 1 ca KHAC trong
                "Chuoi lich su theo serial" o tab Ca lap, de GS/QC doi chieu song song voi ca goc
                ma khong mat ngu canh (khong dieu huong ca popup). */}
            {compareId && <div className="overflow-y-auto p-5 bg-[var(--ocean-100)]/10">{compareContent}</div>}

            {/* Cot phai: cac the phu co the doi qua lai (Giai trinh ton / Vi pham / Ca lap) */}
            <div className="overflow-y-auto p-5">
              <Tabs active={tab} onChange={onTabChange} tabs={tabsList} />
              {tab === "giai-trinh" && giaiTrinhContent}
              {tab === "vi-pham" && viPhamContent}
              {tab === "ca-lap" && caLapContent}
              {tab === "nap-gas" && napGasContent}
              {tab === "tranh-chap" && tranhChapContent}
            </div>
          </div>
        )}

        {c && viewMode === "compact" && (
          <div className="overflow-y-auto flex-1 p-5">
            <Tabs active={tab} onChange={onTabChange} tabs={tabsList} />
            {tab === "info" && infoContent}
            {tab === "giai-trinh" && giaiTrinhContent}
            {tab === "vi-pham" && viPhamContent}
            {tab === "ca-lap" && caLapContent}
            {tab === "nap-gas" && napGasContent}
            {tab === "tranh-chap" && tranhChapContent}
          </div>
        )}
      </div>

      {giaiTrinhModalOpen && (() => {
        const thieuLinhKien = lyDoChon?.thuoc_thieu_linh_kien === 1;
        const missingRequired =
          !lyDoChon ||
          !form.noi_dung.trim() ||
          !form.ngay_du_kien ||
          (thieuLinhKien && (!form.linh_kien_thieu || !form.ngay_yeu_cau_co_hang || !form.ma_xuat_hang.trim()));
        return (
      <Modal open onClose={() => setGiaiTrinhModalOpen(false)} title={`Thêm giải trình — Ca ${caseId}`} width="max-w-xl">
          {giaiTrinhList.length > 0 && (
            <div className="text-xs text-[var(--ocean-600)] bg-[var(--ocean-100)]/50 rounded-lg px-3 py-2 mb-3">
              Đã tự động điền lại theo giải trình gần nhất — kiểm tra lại nội dung trước khi gửi.
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (missingRequired) return;
              submit.mutate();
            }}
            className="space-y-3"
          >
            <div>
              <label className="text-xs font-semibold text-[var(--ink-400)]">
                Lý do chậm <span className="text-[var(--coral-500)]">*</span>
              </label>
              <Select
                value={form.ly_do_cham || lyDoChon?.ten_ly_do || ""}
                onChange={(v) => setForm({ ...form, ly_do_cham: v })}
                className="w-full mt-1"
                options={activeLyDo.map((l) => ({ value: l.ten_ly_do, label: l.ten_ly_do }))}
              />
            </div>
            {thieuLinhKien && (
              <>
                <div className="text-xs text-[var(--amber-600)] bg-[var(--amber-100)]/50 rounded-lg px-3 py-2">
                  Lý do liên quan thiếu linh kiện — bắt buộc nhập đầy đủ linh kiện thiếu, ngày yêu cầu có hàng và mã xuất hàng liên quan.
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--ink-400)]">
                    Linh kiện thiếu <span className="text-[var(--coral-500)]">*</span>
                  </label>
                  <Select
                    value={form.linh_kien_thieu}
                    onChange={(v) => setForm({ ...form, linh_kien_thieu: v })}
                    className="w-full mt-1"
                    options={[{ value: "", label: "— Chọn linh kiện —" }, ...activeLinhKien.map((l) => ({ value: l.ma_linh_kien, label: `${l.ma_linh_kien} · ${l.ten_linh_kien}` }))]}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[var(--ink-400)]">
                      Ngày yêu cầu có hàng <span className="text-[var(--coral-500)]">*</span>
                    </label>
                    <input
                      type="date"
                      value={form.ngay_yeu_cau_co_hang}
                      onChange={(e) => setForm({ ...form, ngay_yeu_cau_co_hang: e.target.value })}
                      className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[var(--ink-400)]">
                      Mã xuất hàng liên quan <span className="text-[var(--coral-500)]">*</span>
                    </label>
                    <input
                      value={form.ma_xuat_hang}
                      onChange={(e) => setForm({ ...form, ma_xuat_hang: e.target.value })}
                      placeholder="Vd: XK-000123"
                      className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                    />
                  </div>
                </div>
              </>
            )}
            <div>
              <label className="text-xs font-semibold text-[var(--ink-400)]">
                Nội dung giải trình <span className="text-[var(--coral-500)]">*</span>
              </label>
              <textarea
                value={form.noi_dung}
                onChange={(e) => setForm({ ...form, noi_dung: e.target.value })}
                rows={3}
                placeholder="Mô tả tình trạng xử lý, kế hoạch tiếp theo…"
                className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--ink-400)]">
                Ngày dự kiến hoàn thành mới <span className="text-[var(--coral-500)]">*</span>
              </label>
              <input
                type="date"
                value={form.ngay_du_kien}
                onChange={(e) => setForm({ ...form, ngay_du_kien: e.target.value })}
                className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
            <div className="flex justify-end items-center gap-2 pt-1">
              {missingRequired && <span className="text-xs text-[var(--ink-400)] mr-auto">Vui lòng điền đủ các trường bắt buộc (*).</span>}
              <Btn variant="ghost" type="button" onClick={() => setGiaiTrinhModalOpen(false)}>
                Hủy
              </Btn>
              <Btn disabled={submit.isPending || missingRequired}>{submit.isPending ? "Đang gửi…" : "Gửi giải trình"}</Btn>
            </div>
          </form>
        </Modal>
        );
      })()}

      {caLapModalOpen && caLap?.detection && (
        <Modal open onClose={() => setCaLapModalOpen(false)} title={`Giải trình / Chốt lặp — Ca ${caseId}`} width="max-w-xl">
          <Card className="p-3 divide-y divide-[var(--line)]">
            <div className="pb-2.5">
              <div className="text-xs font-semibold text-[var(--ink-400)] uppercase tracking-wide mb-1.5">Giám sát (lần 1)</div>
              {canGsLap ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--ink-400)]">Hình thức xử lý</label>
                  <Select
                    value={effectiveHinhThuc}
                    onChange={setHinhThucForm}
                    className="w-full"
                    options={HINH_THUC_XU_LY_KEYS.map((k) => ({ value: k, label: HINH_THUC_XU_LY_META[k].label }))}
                  />
                  <label className="text-xs font-semibold text-[var(--ink-400)]">Đánh giá lặp</label>
                  <Select
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
                    {caLap.giaiTrinhLap?.nguoi_giai_trinh && (
                      <span className="text-xs text-[var(--ink-400)]">
                        {caLap.giaiTrinhLap.nguoi_giai_trinh} · {fmtDateTime(caLap.giaiTrinhLap.ngay_giai_trinh)}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-xs flex flex-wrap items-center gap-1.5">
                  {caLap.giaiTrinhLap?.chot_danh_gia_lap ? (
                    <>
                      <Badge tone="ocean">{CA_LAP_META[caLap.giaiTrinhLap.chot_danh_gia_lap].label}</Badge>
                      <span className="text-[var(--ink-400)]">
                        Hình thức: {caLap.giaiTrinhLap.chot_hinh_thuc_xu_ly ? HINH_THUC_XU_LY_META[caLap.giaiTrinhLap.chot_hinh_thuc_xu_ly].label : "—"}
                      </span>
                      {caLap.giaiTrinhLap.nguoi_giai_trinh && (
                        <span className="text-[var(--ink-400)]">
                          · {caLap.giaiTrinhLap.nguoi_giai_trinh} · {fmtDateTime(caLap.giaiTrinhLap.ngay_giai_trinh)}
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
                  <Select
                    value={effectiveQcChot}
                    onChange={(v) => setQcLapForm({ ...qcLapForm, qc_chot: v })}
                    className="w-full"
                    options={[{ value: "", label: "— Chọn đánh giá —" }, ...CA_LAP_KEYS.map((k) => ({ value: k, label: CA_LAP_META[k].label }))]}
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
                    {caLap.giaiTrinhLap?.nguoi_qc && (
                      <span className="text-xs text-[var(--ink-400)]">
                        {caLap.giaiTrinhLap.nguoi_qc} · {fmtDateTime(caLap.giaiTrinhLap.ngay_qc)}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-xs flex flex-wrap items-center gap-1.5">
                  {caLap.giaiTrinhLap?.qc_chot ? (
                    <>
                      <Badge tone="teal">{CA_LAP_META[caLap.giaiTrinhLap.qc_chot].label}</Badge>
                      {caLap.giaiTrinhLap.nguoi_qc && (
                        <span className="text-[var(--ink-400)]">
                          · {caLap.giaiTrinhLap.nguoi_qc} · {fmtDateTime(caLap.giaiTrinhLap.ngay_qc)}
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
        </Modal>
      )}

      {blacklistConfirmOpen && (
        <Modal open onClose={() => setBlacklistConfirmOpen(false)} title="Xác nhận thêm vào blacklist" width="max-w-md">
          <div className="text-sm text-[var(--ink-600)] mb-4">
            Thêm serial <span className="font-mono font-semibold">{c?.seri_san_pham}</span> vào blacklist? Serial này sẽ bị loại khỏi phát hiện Ca lặp cho tất cả các ca liên quan.
          </div>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setBlacklistConfirmOpen(false)}>
              Hủy
            </Btn>
            <Btn onClick={() => addBlacklist.mutate()} disabled={addBlacklist.isPending}>
              {addBlacklist.isPending ? "Đang thêm…" : "Xác nhận thêm"}
            </Btn>
          </div>
        </Modal>
      )}

      {huyCaConfirmOpen && (
        <Modal open onClose={() => setHuyCaConfirmOpen(false)} title="Xác nhận hủy ca" width="max-w-md">
          <div className="text-sm text-[var(--ink-600)] mb-4">
            Hủy ca <span className="font-mono font-semibold">{caseId}</span>? Ca sẽ bị ẩn khỏi mọi hàng đợi cần xử lý (giải trình tồn, khảo sát, ca lặp, thiếu linh kiện, nạp gas) và không tính vào KPI/doanh thu — vẫn xem được ở đây và trong "Danh sách tổng". Có thể bỏ hủy sau nếu cần.
          </div>
          <div className="mb-4">
            <label className="text-xs font-semibold text-[var(--ink-400)]">Lý do hủy (tùy chọn)</label>
            <textarea
              rows={2}
              value={huyCaLyDo}
              onChange={(e) => setHuyCaLyDo(e.target.value)}
              className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setHuyCaConfirmOpen(false)}>
              Hủy bỏ
            </Btn>
            <Btn variant="danger" onClick={() => huyCa.mutate()} disabled={huyCa.isPending}>
              {huyCa.isPending ? "Đang hủy…" : "Xác nhận hủy ca"}
            </Btn>
          </div>
        </Modal>
      )}

      {tiepNhanTranhChapOpen && c && (
        <TiepNhanModal
          caseRow={{ id: c.id, khach_hang: c.khach_hang, khu_vuc: c.khu_vuc }}
          phanLoaiOptions={phanLoaiOptions?.rows.filter((r) => r.bat_tat) ?? []}
          onClose={() => setTiepNhanTranhChapOpen(false)}
          onSubmit={(body) => tiepNhanTranhChap.mutate(body)}
          isPending={tiepNhanTranhChap.isPending}
        />
      )}
    </div>
  );
}
