import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, statusTone, type BadgeTone, type AnyBadgeTone } from "../components/ui/Badge";
import { Field } from "../components/ui/Field";
import { Card } from "../components/ui/Card";
import { Select } from "../components/ui/Select";
import { ChoiceSelect } from "../components/ui/ChoiceSelect";
import { Btn } from "../components/ui/Btn";
import { Tabs, type TabItem } from "../components/ui/Tabs";
import { Modal } from "../components/ui/Modal";
import { CacheBanner } from "../components/ui/CacheBanner";
import { CaseImageGallery, parseLinkHinhAnh } from "../components/CaseImageGallery";
import { CachThucXuLyLine } from "../components/CachThucXuLyLine";
import { CaLapEvalModal } from "../components/CaLapEvalModal";
import { KtvNameWithPhone, KTV_PHONE_EDIT_ROLES } from "../components/KtvNameWithPhone";
import { LoadingInline } from "../components/ui/LoadingInline";
import { TiepNhanModal, TienTrinhPanel } from "../components/TienTrinhPanel";
import { api, buildQuery } from "../api/client";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/AuthContext";
import { getCachedEntry, setCachedEntry, type CacheEntry } from "../lib/closedDataCache";
import { fetchWithHashCache } from "../lib/staticListCache";
import { trangThaiLapOf } from "../lib/caLapStatus";
import { computeCaseTickers } from "../lib/caseTickers";
import { usePurchaseWarrantyData } from "../hooks/usePurchaseWarrantyData";
import { matchMuaHang, matchBaoHanh, matchThieuHang, matchQcThucTe, matchPoDatHang, parseSheetDateTime } from "../lib/purchaseWarrantyMatch";
import { parseRawRow } from "../lib/purchaseWarrantySync";
import { shortKhuVuc } from "../lib/khuVucShortLabel";
import { usePersonDirectory, formatPersonDisplay } from "../lib/personDisplay";
import {
  TRANG_THAI_DONG,
  TRANG_THAI_LABELS,
  canWriteTranhChap,
  canConfirmAiTranhChap,
  describeTranhChapError,
  type TienTrinhDetail,
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
  NAP_GAS_DANH_GIA_META,
  NAP_GAS_DANH_GIA_KEYS,
  NAP_GAS_PHI_DICH_VU_META,
  NAP_GAS_PHI_DICH_VU_KEYS,
  type CaseRow,
  type GiaiTrinhRow,
  type BienBanHopRow,
  type LyDoRow,
  type LinhKienRow,
  type ViPhamRow,
  type CaLapDetection,
  type NapGasDanhGiaRow,
  type KetQuaGoiRow,
  parseLoaiKhaoSat,
} from "../types";

type ViewMode = "compact" | "expanded";

interface CaseDetailResponse {
  case: CaseRow;
  giaiTrinh: GiaiTrinhRow[];
  ketQuaGoi: KetQuaGoiRow[];
  viPham: ViPhamRow[];
  caLap: CaLapDetection;
  napGasDanhGia: NapGasDanhGiaRow | null;
  bienBanHop: BienBanHopRow[];
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

// parseDbDateTime() gia dinh CO gio (them "T00:00:00" truoc khi cong offset se sai dang neu goi
// truc tiep tren chuoi ngay thuan) - mot so ca backfill thang 7/2026 chi co ngay thuan, nen can them
// " 00:00:00" truoc khi parse. Dung chung cho "gap_days" hien thi trong tab Ca lap (badge tren cung +
// tung dong "Chuoi lich su theo serial" - CHOT 2026-08-20: 2 cho nay PHAI dung 1 cong thuc duy nhat).
function parseFlexibleDbDate(v: string) {
  return parseDbDateTime(v.includes(":") ? v : `${v} 00:00:00`);
}

// Phan "chi doc" cua thong tin khach hang (fields grid + 3 Card) - dung chung cho ca goc (cot trai,
// co them nut hanh dong bao quanh o noi goi) va ca doi chieu (cot giua, thuan tham khao, khong nut
// hanh dong). "serialExtra" la phan tu dat canh Serial (nut them Blacklist hoac badge da blacklist).
function renderCaseFieldsGrid(c: CaseRow, serialExtra?: ReactNode, serialBlacklisted?: boolean, canEditKtvPhone?: boolean) {
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
        <Field label="Khu vực / Tỉnh" value={`${shortKhuVuc(c.khu_vuc)} — ${c.tinh ?? "—"} ${c.quan_huyen ? "— " + c.quan_huyen : ""}`} />
        <Field label="Hãng / Nhóm SP" value={`${c.hang ?? "—"} — ${c.nhom_san_pham ?? "—"}`} />
        <Field label="Kỹ thuật viên" value={<KtvNameWithPhone kyThuatVien={c.ky_thuat_vien} canEdit={!!canEditKtvPhone} />} />
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

// "Lich su chung" (them 2026-08-22) - gop TAT CA log da co san cua 1 ca (giai trinh/bien ban hop/vi
// pham/khao sat/tranh chap/nap gas/ca lap) thanh 1 chuoi thoi gian duy nhat, to mau theo loai de luot
// nhanh van phan biet duoc. Dung LAI 100% du lieu da fetch san boi cac tab khac (khong goi them API
// nao) - xem buildLichSuChungEvents() trong component. 2 map nay CHI dung Tailwind class TINH (khong
// noi chuoi ${tone} vao className) vi Tailwind JIT chi nhan dien duoc class xuat hien nguyen van dang
// text trong source - class dung ghep dong se KHONG duoc bien dich vao CSS cuoi cung.
const TIMELINE_TONE_BORDER: Record<AnyBadgeTone, string> = {
  ocean: "border-[var(--ocean-100)]",
  teal: "border-[var(--teal-100)]",
  amber: "border-[var(--amber-100)]",
  coral: "border-[var(--coral-100)]",
  orange: "border-[var(--orange-100)]",
  gray: "border-slate-200",
  indigo: "border-[var(--indigo-100)]",
  violet: "border-violet-200",
  sky: "border-sky-200",
  rose: "border-rose-200",
  lime: "border-lime-200",
  cyan: "border-cyan-200",
  fuchsia: "border-fuchsia-200",
};
const TIMELINE_TONE_DOT: Record<AnyBadgeTone, string> = {
  ocean: "bg-[var(--ocean-500)]",
  teal: "bg-[var(--teal-500)]",
  amber: "bg-[var(--amber-500)]",
  coral: "bg-[var(--coral-500)]",
  orange: "bg-[var(--orange-500)]",
  gray: "bg-slate-400",
  indigo: "bg-[var(--indigo-500)]",
  violet: "bg-[var(--violet-500)]",
  sky: "bg-sky-500",
  rose: "bg-rose-500",
  lime: "bg-lime-500",
  cyan: "bg-cyan-500",
  fuchsia: "bg-fuchsia-500",
};

interface LichSuChungEvent {
  key: string;
  // Dung so (epoch ms) de sap xep + tinh khoang cach giua 2 moc lien tiep - KHONG the dung so sanh
  // chuoi truc tiep nhu ban dau nua vi tu them 2026-08-22, tab nay tron ca nguon D1 ("YYYY-MM-DD
  // HH:MM:SS") LAN nguon Google Sheet mua hang/bao hanh/thieu hang/QC/PO ("DD/MM/YYYY H:MM:SS", xem
  // parseSheetDateTime trong lib/purchaseWarrantyMatch.ts) - 2 dinh dang KHAC NHAU, so sanh chuoi se
  // sai thu tu.
  sortMs: number;
  // Chuoi da format san de hien thi (fmtDateTime() cho nguon D1, giu nguyen chuoi goc cho nguon
  // Google Sheet - dung quy uoc hien co cua cac tab mua-hang/bao-hanh/... o duoi, khong tu doi dinh
  // dang de tranh lech voi cach hien thi o tab nguon).
  displayTime: string;
  tone: AnyBadgeTone;
  typeLabel: string;
  actor: string | null;
  summary: string;
  // null = khong the/khong can nhay tab (vd moc "Case duoc mo/dong" - thong tin ca da hien san o cot
  // trai khi xem "mo rong", nhay sang "info" se ra man hinh trong o che do nay).
  jumpTab: string | null;
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
  const personDir = usePersonDirectory();

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
  // "case_id" - nhanh rieng cua GET /tranh-chap/tien-trinh (xem tranhChap.ts) tra ve TOAN BO lich su
  // tien trinh (ke ca da dong) CUA CA NAY trong 1 LAN goi duy nhat, gom san logs+logCon cho tung
  // tien trinh - CHOT 2026-08-20 (rao soat lag): thay the hoan toan cach cu (moi TienTrinhPanel tu
  // goi rieng GET /tien-trinh/:id, N+1 khi ca co nhieu tien trinh).
  const { data: tienTrinhCaseData } = useQuery({
    queryKey: ["tranh-chap-tien-trinh-case", caseId],
    queryFn: () => api.get<{ rows: TienTrinhDetail[] }>(`/tranh-chap/tien-trinh${buildQuery({ case_id: caseId! })}`),
    enabled: caseId !== null,
  });
  const [tiepNhanTranhChapOpen, setTiepNhanTranhChapOpen] = useState(false);

  const tiepNhanTranhChap = useMutation({
    mutationFn: (body: {
      phan_loai_tranh_chap: string;
      muc_do: string;
      trang_thai_xu_ly: string;
      ghi_chu?: string;
      thoi_gian_du_kien_xong?: string;
      ket_qua_xu_ly?: string;
      hai_long_sau_tranh_chap?: string;
    }) => api.post(`/tranh-chap/${caseId}/tiep-nhan`, body),
    onSuccess: () => {
      addToast("Đã tiếp nhận xử lý tranh chấp");
      setTiepNhanTranhChapOpen(false);
      qc.invalidateQueries({ queryKey: ["tranh-chap-tien-trinh-case", caseId] });
      qc.invalidateQueries({ queryKey: ["tranh-chap-cho-xu-ly"] });
      qc.invalidateQueries({ queryKey: ["tranh-chap-tien-trinh"] });
      qc.invalidateQueries({ queryKey: ["tranh-chap-tien-trinh-stats"] });
      qc.invalidateQueries({ queryKey: ["notifications-count"] });
      // Tao tien trinh truc tiep tu ca "cho xac nhan AI" duoc tinh la da xac nhan luon (xem CHOT
      // 2026-08-22 o backend POST /:caseId/tiep-nhan) - lam mat 1 ca khoi hang doi, can lam moi badge.
      qc.invalidateQueries({ queryKey: ["tranh-chap-cho-xac-nhan-ai"] });
      qc.invalidateQueries({ queryKey: ["tranh-chap-cho-xac-nhan-ai-count"] });
    },
    onError: (err) => addToast(describeTranhChapError(err, "Không thể tiếp nhận, thử lại sau.")),
  });

  // "Xac nhan AI" nhanh ngay trong the "Tranh chap" cua ca chi tiet (CHOT 2026-08-22) - cung 1 API
  // POST /:caseId/xac-nhan-ai voi tab "Cho xac nhan AI" cua TranhChapModule, chi khac cho hien nut.
  const xacNhanAiCaseDetail = useMutation({
    mutationFn: (ketQua: "dung" | "khong_phai") => api.post(`/tranh-chap/${caseId}/xac-nhan-ai`, { ket_qua: ketQua }),
    onSuccess: async (_data, ketQua) => {
      addToast(ketQua === "dung" ? "Đã xác nhận: Đúng là tranh chấp." : "Đã xác nhận: Không phải tranh chấp.");
      const fresh = await fetchCaseDetail(caseId!);
      const newEntry = fresh.case.thoi_gian_hoan_thanh ? await setCachedEntry(`case-${caseId}`, fresh) : { data: fresh, cachedAt: new Date().toISOString() };
      qc.setQueryData(["case", caseId], newEntry);
      qc.invalidateQueries({ queryKey: ["tranh-chap-cho-xac-nhan-ai"] });
      qc.invalidateQueries({ queryKey: ["tranh-chap-cho-xac-nhan-ai-count"] });
      qc.invalidateQueries({ queryKey: ["tranh-chap-cho-xu-ly"] });
    },
    onError: (err) => addToast(describeTranhChapError(err, "Không thể xác nhận, thử lại sau.")),
  });

  const [giaiTrinhModalOpen, setGiaiTrinhModalOpen] = useState(false);
  const [caLapModalOpen, setCaLapModalOpen] = useState(false);
  // "Danh gia lap" tu 1 dong BAT KY trong Chuoi lich su theo serial (CHOT 2026-08-05, khac
  // caLapModalOpen chi mo duoc cho DUNG ca dang hien) - luu case_id cua dong duoc bam, null = dong.
  const [evalRowCaseId, setEvalRowCaseId] = useState<string | null>(null);
  const [blacklistConfirmOpen, setBlacklistConfirmOpen] = useState(false);
  // CHOT 2026-08-12: modal "Xem day du" cho 1 dong Mua hang/Bao hanh (the rut gon o tab tuong ung
  // khong hien HET moi cot cua Google Sheet - vd idXuat/maSuCoLienQuan/nguonTao/tinhTrangBaoHanh/
  // maYeuCau/maYeuCauNhapTay) - luu ca nhan "labels" de Modal dung chung 1 renderer cho ca 2 dataset.
  // "raw" = TOAN BO cot goc tren sheet (xem SheetRow._raw trong lib/purchaseWarrantySync.ts), khong
  // chi tap con field da alias hoa cho the rut gon - modal "Xem day du" hien dung MOI thu da tai ve.
  const [detailModalRow, setDetailModalRow] = useState<{ title: string; raw: Record<string, string> } | null>(null);
  const [huyCaConfirmOpen, setHuyCaConfirmOpen] = useState(false);
  const [huyCaLyDo, setHuyCaLyDo] = useState("");

  const activeLyDo = (lyDoData?.rows ?? []).filter((l) => l.bat_tat);
  const activeLinhKien = (linhKienData?.rows ?? []).filter((l) => l.bat_tat);

  const [form, setForm] = useState({ ly_do_cham: "", noi_dung: "", linh_kien_thieu: "", ngay_du_kien: "", ngay_yeu_cau_co_hang: "", ma_xuat_hang: "" });
  const [napGasForm, setNapGasForm] = useState({ danh_gia_nap_gas: "", phi_dich_vu: "" });
  const lyDoChon = activeLyDo.find((l) => l.ten_ly_do === form.ly_do_cham) ?? activeLyDo[0];
  const giaiTrinhList = data?.giaiTrinh ?? [];
  // Email nguoi_giai_trinh duy nhat cua ca (da tai san cung data ca, khong fetch them) - nguon phu
  // cho deriveGiamSatSuggestion() trong tab "Tranh chap, khieu nai" (xem TienTrinhPanel).
  const giaiTrinhNguoiGiaiTrinhEmails = useMemo(
    () => Array.from(new Set(giaiTrinhList.map((l) => l.nguoi_giai_trinh).filter((email): email is string => !!email))),
    [giaiTrinhList],
  );
  const bienBanHopList = data?.bienBanHop ?? [];
  const [bienBanHopNoiDung, setBienBanHopNoiDung] = useState("");
  // CHOT 2026-08-16: an cac tab "rong" (count === 0) de giam roi mat thanh tab - chu he thong phan
  // hoi so tab qua nhieu kho quet nhanh. Khong luu qua localStorage (moi ca 1 trang thai rieng la hop
  // ly - tab rong o ca nay co the co du lieu o ca khac).
  const [showAllTabs, setShowAllTabs] = useState(false);

  // Reset cac form nhap dang do (KHONG con reset tab/viewMode o day nua - 2 thu do gio do App.tsx
  // dieu khien theo tung tang cua case stack, xem comment o App.tsx) moi khi caseId doi - tranh du
  // lieu go do o ca A "ri" sang ca B khi dieu huong qua chuoi ca lap ma chua luu.
  useEffect(() => {
    setNapGasForm({ danh_gia_nap_gas: "", phi_dich_vu: "" });
    setCaLapModalOpen(false);
    setEvalRowCaseId(null);
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
    onSuccess: async () => {
      addToast(`Đã ghi nhận giải trình cho ca ${caseId}`);
      setForm({ ly_do_cham: "", noi_dung: "", linh_kien_thieu: "", ngay_du_kien: "", ngay_yeu_cau_co_hang: "", ma_xuat_hang: "" });
      setGiaiTrinhModalOpen(false);
      // CHOT 2026-08-11 (mo rong 2026-08-12: giai trinh nay gio ap dung duoc cho MOI ca da dong, ke ca
      // da dong tu lau, khong con gioi han "trong vong 1 ngay" - xem POST /cases/:id/giai-trinh o
      // backend): fetchCaseDetailCached() doc IndexedDB (closedDataCache) TRUOC ca goi API (vi
      // c.thoi_gian_hoan_thanh da co san), nen chi invalidateQueries suong se khien queryFn tra ve
      // DUNG cache cu, khong bao gio thay log vua ghi (phai bam nut "Dong bo lai" thu cong moi thay) -
      // dung y het pattern refreshCaLapQueries/refreshAfterHuyCa/refreshNapGasQueries: fetch that + ghi
      // de closedDataCache truoc khi set lai query data - tu dong hien log moi, khong can nguoi dung
      // tu bam "Dong bo lai".
      const fresh = await fetchCaseDetail(caseId!);
      const newEntry = fresh.case.thoi_gian_hoan_thanh ? await setCachedEntry(`case-${caseId}`, fresh) : { data: fresh, cachedAt: new Date().toISOString() };
      qc.setQueryData(["case", caseId], newEntry);
      // CHOT 2026-07-30: fix bug "giai trinh xong khong tu cap nhat Danh sach chi tiet cua Quan ly
      // ton, phai load lai trang" - key cu "backlog" KHONG khop voi bat ky query nao thuc su dang
      // dung trong BacklogModule.tsx (da tach thanh "backlog-list"/"backlog-stats"/
      // "backlog-by-khu-vuc" tu truoc, invalidateQueries so khop CHINH XAC tung phan tu key, khong
      // phai so khop tien to chuoi - "backlog" != "backlog-list" nen khong bao gio khop) - liet ke
      // dung ca 3 key.
      qc.invalidateQueries({ queryKey: ["backlog-list"] });
      qc.invalidateQueries({ queryKey: ["backlog-stats"] });
      qc.invalidateQueries({ queryKey: ["backlog-by-khu-vuc"] });
      qc.invalidateQueries({ queryKey: ["backlog-counts"] });
      qc.invalidateQueries({ queryKey: ["missing-parts"] });
      qc.invalidateQueries({ queryKey: ["missing-parts-by-khu-vuc"] });
    },
    onError: () => addToast("Không thể ghi nhận giải trình, thử lại sau."),
  });

  // "Bien ban hop" (migration 0080) - append-only, dung LAI dung pattern "fetch that + ghi de
  // closedDataCache truoc khi setQueryData" nhu submit() o tren (giai trinh cung co the ap dung cho
  // ca DA DONG lau, doc chu thich chi tiet o do), de dong moi hien ngay khong can bam "Dong bo lai".
  const bienBanHopSubmit = useMutation({
    mutationFn: () => api.post(`/cases/${caseId}/bien-ban-hop`, { noi_dung: bienBanHopNoiDung.trim() }),
    onSuccess: async () => {
      addToast("Đã lưu biên bản họp");
      setBienBanHopNoiDung("");
      const fresh = await fetchCaseDetail(caseId!);
      const newEntry = fresh.case.thoi_gian_hoan_thanh ? await setCachedEntry(`case-${caseId}`, fresh) : { data: fresh, cachedAt: new Date().toISOString() };
      qc.setQueryData(["case", caseId], newEntry);
    },
    onError: () => addToast("Không thể lưu biên bản họp, thử lại sau."),
  });

  const c = data?.case;
  const caLap = data?.caLap;

  // Doi chieu "Don mua hang/bao hanh/xu ly thieu hang lien quan" - du lieu 3 Google Sheet da dong
  // bo NGAM ve cache trinh duyet (xem hooks/usePurchaseWarrantyData.ts, kich hoat tu App.tsx),
  // KHONG qua server. Chi tinh lai khi caseId/giaiTrinhList hoac du lieu sheet doi.
  const { muaHang, baoHanh, thieuHang, qcThucTe, poDatHang, isSyncing: purchaseSyncing, isRefreshing: purchaseRefreshing, lastSyncedAt: purchaseSyncedAt, refreshAll: refreshPurchaseData } =
    usePurchaseWarrantyData();
  const muaHangMatched = useMemo(() => (c ? matchMuaHang(c.id, giaiTrinhList, muaHang) : []), [c, giaiTrinhList, muaHang]);
  const baoHanhMatched = useMemo(() => (c ? matchBaoHanh(c.id, baoHanh) : []), [c, baoHanh]);
  const thieuHangMatched = useMemo(() => matchThieuHang(muaHangMatched, baoHanhMatched, thieuHang), [muaHangMatched, baoHanhMatched, thieuHang]);
  const qcThucTeMatched = useMemo(() => (c ? matchQcThucTe(c.id, qcThucTe) : []), [c, qcThucTe]);
  // Sap moi tao len tren - xem parseSheetDateTime() ve ly do khong dung localeCompare truc tiep tren
  // chuoi DD/MM/YYYY cua cot "Ngay tao".
  const poDatHangMatched = useMemo(
    () => (c ? [...matchPoDatHang(c.id, giaiTrinhList, poDatHang)].sort((a, b) => parseSheetDateTime(b.ngayTao) - parseSheetDateTime(a.ngayTao)) : []),
    [c, giaiTrinhList, poDatHang],
  );

  const viPhamList = data?.viPham ?? [];
  const ketQuaGoiList = data?.ketQuaGoi ?? [];

  const napGasDanhGia = data?.napGasDanhGia ?? null;
  // Chi hien tab/form "Danh gia nap gas" cho ca THUOC DIEN nghi ngo nap gas VA da dong voi dung
  // trang thai "Hoan thanh XLSC" - khop chinh xac NAP_GAS_ELIGIBLE o backend/src/routes/napGas.ts
  // (ca dang ton hoac hoan thanh voi tien do khac se KHONG the chot danh gia o backend, nen an tab
  // di cho gon thay vi hien 1 form luon bao loi khi bam Luu).
  // CHOT 2026-07-30: "nghi_ngo_nap_gas=1" KHONG con la dieu kien bat buoc de danh gia - Giam sat khu
  // vuc duoc chu dong danh gia BAT KY ca nao, chi con dung de hien thi thong tin (khong con chan
  // form). CHOT 2026-08-20: bo LUON dieu kien "da Hoan thanh XLSC" - mo quyen danh gia cho ca CHUA
  // DONG (chi o the "Ca chi tiet" nay, KHONG doi danh sach/bao cao thang "Nap gas" - noi do van chi
  // tinh ca da dong, theo dung xac nhan nguoi dung, xem NAP_GAS_ELIGIBLE trong backend napGas.ts).
  // Van khoa chot sau NAP_GAS_LOCK_DAYS ngay ke tu ngay hoan thanh (napGasLocked, chi ap dung khi ca
  // DA co thoi_gian_hoan_thanh) - khop dung backend PATCH /nap-gas/:id/danh-gia.
  const NAP_GAS_LOCK_DAYS = 45;
  const napGasEligible = !!(c && c.nghi_ngo_nap_gas === 1 && c.tien_do_hoan_thanh === "Hoàn thành XLSC");
  const napGasLocked = !!(c?.thoi_gian_hoan_thanh && (Date.now() - new Date(c.thoi_gian_hoan_thanh).getTime()) / 86400000 > NAP_GAS_LOCK_DAYS);
  const effectiveNapGasDanhGia = napGasForm.danh_gia_nap_gas || napGasDanhGia?.danh_gia_nap_gas || "";
  const effectiveNapGasPhiDichVu = napGasForm.phi_dich_vu || napGasDanhGia?.phi_dich_vu || "";

  // "Tranh chap, khieu nai" - CHOT 2026-08-05: bo dieu kien "ca phai da dong (Hoan thanh XLSC/Khong
  // hoan thanh XLSC)" - truoc day tranh chap "khong co khai niem dang ton", gio KSNB/Giam sat khu vuc
  // duoc chu dong tao yeu cau xu ly tranh chap/khieu nai cho CA CA DANG TON (chua hoan thanh), khong
  // chi ca da dong nua (khop dung backend POST /:caseId/tiep-nhan). "Nghi ngo tranh chap" (co CRM
  // import tu dong gan) van KHONG phai dieu kien bat buoc de tao tien trinh moi (tu CHOT 2026-07-30),
  // "tranhChapEligible" chi con dung de hien thi thong tin.
  const tranhChapEligible = !!(c && c.nghi_ngo_tranh_chap === 1 && (c.tien_do_hoan_thanh === "Hoàn thành XLSC" || c.tien_do_hoan_thanh === "Không hoàn thành XLSC"));
  const tienTrinhListForCase = tienTrinhCaseData?.rows ?? [];
  // Cho phep "Tiep nhan" tien trinh MOI (ke ca lan 2 tro di) khi: CHUA co tien trinh nao, HOAC toan
  // bo tien trinh hien co deu da o trang thai dong - khop dung dieu kien backend POST
  // /:caseId/tiep-nhan (chi 409 TIEN_TRINH_DANG_MO khi tien trinh gan nhat con mo).
  const canTiepNhanTranhChapMoi =
    tienTrinhListForCase.length === 0 ||
    tienTrinhListForCase.every((tt) => {
      const trangThai = tt.logs[0]?.trang_thai_xu_ly;
      return !!trangThai && TRANG_THAI_DONG.includes(trangThai);
    });

  // "Tien trinh chung" - gop CAC MANG DA CO SAN o tren (nguon D1, khong fetch them gi) CONG CAC nguon
  // Google Sheet (mua hang/bao hanh/thieu hang/QC thuc te/PO dat hang - da doi chieu SheetRow) thanh 1
  // chuoi thoi gian duy nhat, sap giam dan (moi nhat len dau). Dung "sortMs" (epoch ms) de sap xep chu
  // KHONG so sanh chuoi truc tiep nua - nguon D1 la "YYYY-MM-DD HH:MM:SS", nguon Sheet la "DD/MM/YYYY
  // H:MM:SS" (xem parseSheetDateTime, lib/purchaseWarrantyMatch.ts), 2 dinh dang khac nhau. Bo qua
  // caLap.lichSu (chuoi lich su THEO SERIAL, la cac CA KHAC chia se serial - khong phai log cua CHINH
  // ca dang xem). 5 nguon Google Sheet CHOT 2026-08-22 sau khi doi chieu TRUC TIEP header that cua tung
  // sheet qua curl (xem bang doi chieu day du trong SRS_tong_hop.md muc "Tien trinh chung - nguon du
  // lieu ngoai") - luong nay se duoc thay bang API that khi cac he thong lien quan tich hop truc tiep,
  // luc do CHI can doi lai noi tao 5 nhom moc ben duoi (khong doi kien truc merge/sort/UI).
  const tienTrinhChungEvents = useMemo<LichSuChungEvent[]>(() => {
    const events: LichSuChungEvent[] = [];

    const pushDb = (opts: { key: string; rawTs: string | null | undefined; tone: AnyBadgeTone; typeLabel: string; actor: string | null; summary: string; jumpTab: string | null }) => {
      if (!opts.rawTs) return;
      events.push({
        key: opts.key,
        sortMs: parseFlexibleDbDate(opts.rawTs).getTime(),
        displayTime: fmtDateTime(opts.rawTs),
        tone: opts.tone,
        typeLabel: opts.typeLabel,
        actor: opts.actor,
        summary: opts.summary,
        jumpTab: opts.jumpTab,
      });
    };
    // Nguon Google Sheet KHONG co truong "nguoi thuc hien" nhat quan giua cac moc (chu he thong chi
    // yeu cau dung 2 tieu chi "Thoi gian"/"Trang thai" cho nhom nay) nen actor luon null.
    const pushSheet = (opts: { key: string; rawTs: string | undefined; tone: AnyBadgeTone; typeLabel: string; summary: string; jumpTab: string }) => {
      const ms = parseSheetDateTime(opts.rawTs);
      if (!ms) return;
      events.push({ key: opts.key, sortMs: ms, displayTime: opts.rawTs ?? "", tone: opts.tone, typeLabel: opts.typeLabel, actor: null, summary: opts.summary, jumpTab: opts.jumpTab });
    };

    if (c?.thoi_gian_cskh_tiep_nhan) {
      pushDb({ key: "case-open", rawTs: c.thoi_gian_cskh_tiep_nhan, tone: "gray", typeLabel: "Ca được mở", actor: null, summary: "Tiếp nhận CSKH", jumpTab: null });
    }
    if (c?.thoi_gian_hoan_thanh) {
      pushDb({ key: "case-close", rawTs: c.thoi_gian_hoan_thanh, tone: "gray", typeLabel: "Ca được đóng", actor: null, summary: c.tien_do_hoan_thanh ?? "Hoàn thành", jumpTab: null });
    }

    for (const l of giaiTrinhList) {
      pushDb({
        key: `gt-${l.id}`,
        rawTs: l.ngay_giai_trinh,
        tone: "ocean",
        typeLabel: "GT tồn",
        actor: l.nguoi_giai_trinh,
        summary: l.noi_dung ? `${l.ly_do_cham}: ${l.noi_dung}` : l.ly_do_cham,
        jumpTab: "giai-trinh",
      });
    }

    for (const b of bienBanHopList) {
      pushDb({ key: `bbh-${b.id}`, rawTs: b.created_at, tone: "sky", typeLabel: "Biên bản họp", actor: b.nguoi_ghi, summary: b.noi_dung, jumpTab: "bien-ban-hop" });
    }

    for (const v of viPhamList) {
      pushDb({
        key: `vp-${v.id}-ghi-nhan`,
        rawTs: v.ngay_ghi_nhan,
        tone: "coral",
        typeLabel: `Vi phạm ghi nhận (${LOAI_LOI_META[v.loai_loi]?.short ?? v.loai_loi})`,
        actor: v.nguoi_ghi_nhan,
        summary: v.ket_qua_cap_1 ?? "Chưa khảo sát",
        jumpTab: "vi-pham",
      });
      if (v.chot_bo_cap_2 !== null && v.ngay_chot) {
        pushDb({
          key: `vp-${v.id}-chot`,
          rawTs: v.ngay_chot,
          tone: "coral",
          typeLabel: "Vi phạm chốt cấp 2",
          actor: v.nguoi_chot,
          summary: v.chot_bo_cap_2 ? "Đã xác nhận vi phạm" : "Không vi phạm",
          jumpTab: "vi-pham",
        });
      }
    }

    for (const k of ketQuaGoiList) {
      const loaiList = parseLoaiKhaoSat(k.loai_khao_sat);
      pushDb({
        key: `kqg-${k.id}`,
        rawTs: k.ngay_gio_thuc_hien,
        tone: "teal",
        typeLabel: `Khảo sát${loaiList.length ? " (" + loaiList.map((loai) => LOAI_LOI_META[loai]?.short ?? loai).join(", ") + ")" : ""}`,
        actor: k.nguoi_thuc_hien,
        summary: k.ket_qua_cuoc_goi ?? k.ghi_chu ?? "—",
        jumpTab: "khao-sat",
      });
    }

    // Log con (tranh_chap_log_con, xem migration 0092) CUNG tinh la 1 moc tien trinh rieng (chot
    // 2026-08-22) - phan hoi/trao doi them tren 1 log chinh, khong chi la "chi tiet" an trong log cha.
    // Tone co dinh "violet" cho CA nhom tranh chap (khong dung TRANG_THAI_TONE dong theo trang thai
    // nhu o tab "Tranh chap" rieng) - trong tab "Tien trinh chung" muc tieu la phan biet NGUON log,
    // trang thai cu the da the hien qua chinh chu typeLabel roi.
    for (const tt of tienTrinhListForCase) {
      for (const log of tt.logs) {
        pushDb({
          key: `tc-log-${log.id}`,
          rawTs: log.ngay_xu_ly,
          tone: "violet",
          typeLabel: `Tranh chấp: ${TRANG_THAI_LABELS[log.trang_thai_xu_ly] ?? log.trang_thai_xu_ly}`,
          actor: log.nguoi_xu_ly,
          summary: log.ghi_chu ?? "—",
          jumpTab: "tranh-chap",
        });
        for (const sub of log.logCon ?? []) {
          pushDb({ key: `tc-logcon-${sub.id}`, rawTs: sub.created_at, tone: "violet", typeLabel: "Tranh chấp: phản hồi", actor: sub.nguoi_ghi, summary: sub.noi_dung, jumpTab: "tranh-chap" });
        }
      }
    }

    if (napGasDanhGia) {
      pushDb({
        key: "nap-gas",
        rawTs: napGasDanhGia.ngay_chot,
        tone: "orange",
        typeLabel: "Đánh giá nạp gas",
        actor: napGasDanhGia.nguoi_chot,
        summary: `${NAP_GAS_DANH_GIA_META[napGasDanhGia.danh_gia_nap_gas]?.label ?? napGasDanhGia.danh_gia_nap_gas} · ${NAP_GAS_PHI_DICH_VU_META[napGasDanhGia.phi_dich_vu]?.label ?? napGasDanhGia.phi_dich_vu}`,
        jumpTab: "nap-gas",
      });
    }

    const glap = caLap?.giaiTrinhLap;
    if (glap?.ngay_giai_trinh) {
      pushDb({
        key: "ca-lap-gs",
        rawTs: glap.ngay_giai_trinh,
        tone: "indigo",
        typeLabel: "Đánh giá ca lặp (GS)",
        actor: glap.nguoi_giai_trinh,
        summary: `${glap.chot_danh_gia_lap ? (CA_LAP_META[glap.chot_danh_gia_lap]?.label ?? glap.chot_danh_gia_lap) : "—"}${glap.dien_giai_lap ? ": " + glap.dien_giai_lap : ""}`,
        jumpTab: "ca-lap",
      });
    }
    if (glap?.ngay_qc) {
      pushDb({
        key: "ca-lap-qc",
        rawTs: glap.ngay_qc,
        tone: "indigo",
        typeLabel: "Đánh giá ca lặp (QC)",
        actor: glap.nguoi_qc,
        summary: `${glap.qc_chot ? (CA_LAP_META[glap.qc_chot]?.label ?? glap.qc_chot) : "—"}${glap.qc_ghi_chu ? ": " + glap.qc_ghi_chu : ""}`,
        jumpTab: "ca-lap",
      });
    }

    // 5 nguon Google Sheet ben duoi - xem bang doi chieu day du "moc nao dung cot nao" trong
    // SRS_tong_hop.md (chot 2026-08-22, da doi chieu header that qua curl truoc khi viet). Tone co
    // dinh 1 mau/nguon (khong con doi theo trang thai duyet/ket qua nhu truoc) de phan biet NGUON
    // log ngay tu mau sac trong tab "Tien trinh chung" - trang thai cu the van doc duoc qua typeLabel.
    for (const r of muaHangMatched) {
      pushSheet({ key: `mh-${r.id}-1`, rawTs: r.ngayTao, tone: "amber", typeLabel: "Mua hàng: Tạo đề xuất", summary: r.loaiDeXuat || "—", jumpTab: "mua-hang" });
      pushSheet({
        key: `mh-${r.id}-2`,
        rawTs: r.ngayXacNhan,
        tone: "amber",
        typeLabel: "Mua hàng: Tác nghiệp tiếp nhận",
        summary: r.trangThaiDuyet && r.trangThaiDuyet !== "ĐỒNG Ý" ? `Trạng thái duyệt: ${r.trangThaiDuyet}` : "—",
        jumpTab: "mua-hang",
      });
      pushSheet({ key: `mh-${r.id}-3`, rawTs: r.ngayAdminTaoDonXuat, tone: "amber", typeLabel: "Mua hàng: Tác nghiệp tạo phiếu", summary: "—", jumpTab: "mua-hang" });
      pushSheet({ key: `mh-${r.id}-4`, rawTs: r.ngayKeToanDuyet, tone: "amber", typeLabel: "Mua hàng: Kế toán duyệt phiếu", summary: "—", jumpTab: "mua-hang" });
      pushSheet({ key: `mh-${r.id}-5`, rawTs: r.ngayKhoXacNhan, tone: "amber", typeLabel: "Mua hàng: Kho duyệt xuất hàng", summary: "—", jumpTab: "mua-hang" });
    }

    for (const r of baoHanhMatched) {
      pushSheet({ key: `bh-${r.id}-1`, rawTs: r.thoiGianTao, tone: "rose", typeLabel: "Bảo hành: Tạo đơn bảo hành", summary: "—", jumpTab: "bao-hanh" });
      pushSheet({ key: `bh-${r.id}-2`, rawTs: r.ngayGui, tone: "rose", typeLabel: "Bảo hành: KTV gửi đơn bảo hành", summary: "—", jumpTab: "bao-hanh" });
      pushSheet({ key: `bh-${r.id}-3`, rawTs: r.ngayKhoNhanHang, tone: "rose", typeLabel: "Bảo hành: Kho nhận hàng", summary: "—", jumpTab: "bao-hanh" });
      pushSheet({ key: `bh-${r.id}-4`, rawTs: r.ngayGioAdminNhanTuKho, tone: "rose", typeLabel: "Bảo hành: Admin nhận được linh kiện", summary: "—", jumpTab: "bao-hanh" });
      pushSheet({ key: `bh-${r.id}-5`, rawTs: r.ngayGioSuaXong, tone: "rose", typeLabel: "Bảo hành: Đã sửa xong", summary: "—", jumpTab: "bao-hanh" });
      pushSheet({ key: `bh-${r.id}-6`, rawTs: r.ngayKhoNhanHangTuAdmin, tone: "rose", typeLabel: "Bảo hành: Kế toán duyệt phiếu", summary: "—", jumpTab: "bao-hanh" });
      pushSheet({ key: `bh-${r.id}-7`, rawTs: r.ngayKhoGuiHangChoKtv, tone: "rose", typeLabel: "Bảo hành: Kho gửi linh kiện cho KTV", summary: "—", jumpTab: "bao-hanh" });
      pushSheet({ key: `bh-${r.id}-8`, rawTs: r.ngayKtvNhanHang, tone: "rose", typeLabel: "Bảo hành: KTV đã nhận được linh kiện", summary: "—", jumpTab: "bao-hanh" });
    }

    for (const r of thieuHangMatched) {
      pushSheet({ key: `th-${r.id}-1`, rawTs: r.ngayTao, tone: "lime", typeLabel: "Thiếu hàng: Tạo yêu cầu", summary: r.lyDoLuaChon || "—", jumpTab: "thieu-hang" });
      pushSheet({ key: `th-${r.id}-2`, rawTs: r.ngayTiepNhan, tone: "lime", typeLabel: "Thiếu hàng: Kho đã tiếp nhận", summary: "—", jumpTab: "thieu-hang" });
      pushSheet({ key: `th-${r.id}-3`, rawTs: r.ngayKhoXacNhan, tone: "lime", typeLabel: "Thiếu hàng: Kho xác nhận hàng về", summary: "—", jumpTab: "thieu-hang" });
      pushSheet({ key: `th-${r.id}-4`, rawTs: r.ngayAdminXuLy, tone: "lime", typeLabel: "Thiếu hàng: Admin kết thúc", summary: "—", jumpTab: "thieu-hang" });
    }

    qcThucTeMatched.forEach((r, i) => {
      pushSheet({ key: `qc-${r.idCrm}-${i}`, rawTs: r.ngayDanhGia, tone: "cyan", typeLabel: "QC thực tế", summary: r.ketQua || "—", jumpTab: "qc-thuc-te" });
    });

    // PO dat hang: CHI tinh vao "Tien trinh chung" khi "ID CRM" = ID ca dang xem (chot 2026-08-22,
    // hep hon poDatHangMatched dang dung o tab rieng - tab do con gop them ca khop qua ma linh kien
    // thieu, khong dung tieu chi do o day theo dung yeu cau).
    poDatHangMatched
      .filter((r) => r.idCrm === c?.id)
      .forEach((r, i) => {
        pushSheet({ key: `po-${r.id}-${i}`, rawTs: r.ngayTao, tone: "fuchsia", typeLabel: "PO đặt hàng", summary: r.tatCa || "—", jumpTab: "po-dat-hang" });
      });

    return events.filter((e) => e.sortMs > 0).sort((a, b) => b.sortMs - a.sortMs);
  }, [c, giaiTrinhList, bienBanHopList, viPhamList, ketQuaGoiList, tienTrinhListForCase, napGasDanhGia, caLap, muaHangMatched, baoHanhMatched, thieuHangMatched, qcThucTeMatched, poDatHangMatched]);

  // "Tieu de tom tat" (chot 2026-08-22) - 5 khoang thoi gian tinh theo "kieu bao trum" (min moc dau -
  // max moc cuoi cua CHINH nhom do, hoac "hien tai" neu con dang mo - CHI ap dung cho case/tranh chap
  // theo dung yeu cau; 3 nhom sheet con lai (dat hang/bao hanh/thieu hang) khong co tin hieu "da dong
  // hay chua" dang tin cay tren sheet nen CHI tinh khoang da ghi nhan duoc, khong suy doan "hien tai").
  const tienTrinhChungSummary = useMemo(() => {
    const dayDiff = (startMs: number, endMs: number) => (endMs - startMs) / 86400000;
    const envelopeDays = (rows: Record<string, string>[], fields: string[]): number | null => {
      const stamps: number[] = [];
      for (const r of rows) for (const f of fields) {
        const ms = parseSheetDateTime(r[f]);
        if (ms) stamps.push(ms);
      }
      return stamps.length >= 2 ? dayDiff(Math.min(...stamps), Math.max(...stamps)) : null;
    };

    const caseDuration = c?.thoi_gian_cskh_tiep_nhan
      ? dayDiff(parseFlexibleDbDate(c.thoi_gian_cskh_tiep_nhan).getTime(), c.thoi_gian_hoan_thanh ? parseFlexibleDbDate(c.thoi_gian_hoan_thanh).getTime() : Date.now())
      : null;

    let tranhChapDuration: number | null = null;
    if (tienTrinhListForCase.length > 0) {
      const starts = tienTrinhListForCase.map((tt) => parseFlexibleDbDate(tt.tienTrinh.ngay_tao).getTime());
      const latestTt = tienTrinhListForCase.reduce((a, b) => (parseFlexibleDbDate(b.tienTrinh.ngay_tao).getTime() > parseFlexibleDbDate(a.tienTrinh.ngay_tao).getTime() ? b : a));
      const latestLog = latestTt.logs[0]; // log[0] = moi nhat (xem canTiepNhanTranhChapMoi o tren, cung quy uoc)
      const isClosed = !!latestLog && TRANG_THAI_DONG.includes(latestLog.trang_thai_xu_ly);
      const endMs = isClosed ? parseFlexibleDbDate(latestLog.ngay_xu_ly).getTime() : Date.now();
      tranhChapDuration = dayDiff(Math.min(...starts), endMs);
    }

    const datHangDuration = envelopeDays(muaHangMatched, ["ngayTao", "ngayXacNhan", "ngayAdminTaoDonXuat", "ngayKeToanDuyet", "ngayKhoXacNhan"]);
    const baoHanhDuration = envelopeDays(baoHanhMatched, [
      "thoiGianTao",
      "ngayGui",
      "ngayKhoNhanHang",
      "ngayGioAdminNhanTuKho",
      "ngayGioSuaXong",
      "ngayKhoNhanHangTuAdmin",
      "ngayKhoGuiHangChoKtv",
      "ngayKtvNhanHang",
    ]);
    const thieuHangDuration = envelopeDays(thieuHangMatched, ["ngayTao", "ngayTiepNhan", "ngayKhoXacNhan", "ngayAdminXuLy"]);

    return { caseDuration, tranhChapDuration, datHangDuration, baoHanhDuration, thieuHangDuration };
  }, [c, tienTrinhListForCase, muaHangMatched, baoHanhMatched, thieuHangMatched]);

  const summaryItems: { label: string; value: number | null }[] = [
    { label: "Thời gian xử lý case", value: tienTrinhChungSummary.caseDuration },
    { label: "Thời gian xử lý tranh chấp, KN", value: tienTrinhChungSummary.tranhChapDuration },
    { label: "Thời gian đặt hàng", value: tienTrinhChungSummary.datHangDuration },
    { label: "Thời gian sửa chữa bảo hành", value: tienTrinhChungSummary.baoHanhDuration },
    { label: "Thời gian xử lý thiếu hàng", value: tienTrinhChungSummary.thieuHangDuration },
  ].filter((it) => it.value !== null);

  const tienTrinhChungContent = (
    <div>
      <div className="text-xs text-[var(--ink-400)] italic mb-3">
        Gộp toàn bộ mốc thời gian của ca này (giải trình, biên bản họp, vi phạm, khảo sát, tranh chấp, nạp gas, ca lặp, mua hàng, bảo hành, thiếu hàng, QC thực tế, PO đặt hàng) theo đúng thời
        gian tạo — bấm vào 1 dòng để mở tab chi tiết tương ứng.
      </div>
      {summaryItems.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--ink-600)] mb-4 p-2.5 rounded-lg bg-slate-50 border border-[var(--line)]">
          {summaryItems.map((it) => (
            <span key={it.label}>
              {it.label}: <strong className="text-[var(--ink-900)]">{it.value!.toFixed(1)} ngày</strong>
            </span>
          ))}
        </div>
      )}
      {tienTrinhChungEvents.length === 0 && <div className="text-sm text-[var(--ink-400)] italic">Chưa có mốc nào cho ca này.</div>}
      <div className="space-y-0">
        {tienTrinhChungEvents.map((e, i) => {
          const next = tienTrinhChungEvents[i + 1];
          const gapDays = next ? (e.sortMs - next.sortMs) / 86400000 : null;
          const inner = (
            <>
              <div className={`absolute -left-[5px] top-1 w-2 h-2 rounded-full ${TIMELINE_TONE_DOT[e.tone]}`}></div>
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                <Badge tone={e.tone}>{e.typeLabel}</Badge>
                <span className="text-xs text-[var(--ink-400)]">
                  {e.displayTime}
                  {e.actor ? ` · ${formatPersonDisplay(e.actor, personDir)}` : ""}
                </span>
              </div>
              <div className="text-sm text-[var(--ink-600)] whitespace-pre-wrap">{e.summary}</div>
            </>
          );
          return (
            <div key={e.key} className="pb-3">
              {e.jumpTab ? (
                <button
                  type="button"
                  onClick={() => onTabChange(e.jumpTab!)}
                  className={`relative pl-4 border-l-2 w-full text-left hover:bg-[var(--bg)] rounded-r-lg transition-colors ${TIMELINE_TONE_BORDER[e.tone]}`}
                >
                  {inner}
                </button>
              ) : (
                <div className={`relative pl-4 border-l-2 ${TIMELINE_TONE_BORDER[e.tone]}`}>{inner}</div>
              )}
              {gapDays !== null && gapDays > 0.05 && (
                <div className="text-[11px] text-[var(--ink-400)] pl-4 pt-1.5">
                  ↳ cách mốc trước <strong className="text-[var(--ink-700)]">{gapDays.toFixed(1)} ngày</strong>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

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

  // "Bo qua" nhanh 1 dong trong Chuoi lich su theo serial (CHOT 2026-08-05) - thay vi mo modal chon
  // tay, luu thang "Bo qua" + "Tinh luong" cho DUNG PHAN nguoi dung hien dang co quyen (canGsLap ->
  // goi /gs, canQcLap -> goi /qc, Admin co ca 2 quyen se goi ca 2 cung luc) - tai dung y het 2
  // endpoint /gs, /qc hien co (khong bypass requireRole cua tung endpoint), nen 1 Giam sat thuong
  // (khong phai QC/Admin) bam nut nay chi luu duoc phan Giam sat, khong dung cham toi phan QC.
  const boQuaLap = useMutation({
    mutationFn: async (targetCaseId: string) => {
      const calls: Promise<unknown>[] = [];
      if (canGsLap) calls.push(api.post(`/ca-lap/${targetCaseId}/gs`, { chot_danh_gia_lap: "Bo qua", chot_hinh_thuc_xu_ly: "Tinh luong" }));
      if (canQcLap) calls.push(api.post(`/ca-lap/${targetCaseId}/qc`, { qc_chot: "Bo qua", chot_hinh_thuc_xu_ly: "Tinh luong" }));
      await Promise.all(calls);
    },
    onSuccess: async () => {
      addToast("Đã bỏ qua đánh giá lặp");
      await refreshCaLapQueries();
    },
    onError: () => addToast("Không thể lưu, thử lại sau."),
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

      {canGiaiTrinh && (
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
        !!currentUser?.vai_tro && KTV_PHONE_EDIT_ROLES.includes(currentUser.vai_tro),
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
      {canGiaiTrinh && (
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
                {fmtDateTime(l.ngay_giai_trinh)} · {formatPersonDisplay(l.nguoi_giai_trinh, personDir)}
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

  const bienBanHopContent = (
    <div>
      <div className="mb-4">
        <textarea
          value={bienBanHopNoiDung}
          onChange={(e) => setBienBanHopNoiDung(e.target.value)}
          placeholder="Ghi nội dung cuộc họp về ca này…"
          rows={3}
          className="focus-ring w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm resize-y"
        />
        <div className="flex justify-end mt-2">
          <Btn size="sm" disabled={!bienBanHopNoiDung.trim() || bienBanHopSubmit.isPending} onClick={() => bienBanHopSubmit.mutate()}>
            {bienBanHopSubmit.isPending ? "Đang lưu…" : "+ Lưu biên bản họp"}
          </Btn>
        </div>
      </div>

      <div className="font-display font-bold text-sm mb-3">Nhật ký biên bản họp</div>
      {bienBanHopList.length === 0 && <div className="text-sm text-[var(--ink-400)] italic">Chưa có biên bản họp nào cho ca này.</div>}
      <div className="space-y-3">
        {bienBanHopList.map((b) => (
          <div key={b.id} className="relative pl-4 border-l-2 border-[var(--ocean-100)]">
            <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-[var(--ocean-500)]"></div>
            <div className="text-xs text-[var(--ink-400)] mb-0.5">
              {fmtDateTime(b.created_at)} · {formatPersonDisplay(b.nguoi_ghi, personDir)}
            </div>
            <div className="text-sm text-[var(--ink-600)] whitespace-pre-wrap">{b.noi_dung}</div>
          </div>
        ))}
      </div>
    </div>
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
                <Field label="Người ghi nhận" value={formatPersonDisplay(v.nguoi_ghi_nhan, personDir)} />
                <Field label="Ngày ghi nhận" value={fmtDateTime(v.ngay_ghi_nhan)} />
                {v.chot_bo_cap_2 !== null && (
                  <>
                    <Field label="Người chốt cấp 2" value={v.nguoi_chot ? formatPersonDisplay(v.nguoi_chot, personDir) : "—"} />
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

  const khaoSatContent = (
    <div>
      {ketQuaGoiList.length === 0 && <div className="text-sm text-[var(--ink-400)] italic">Chưa có cuộc gọi khảo sát nào cho ca này.</div>}
      <div className="space-y-3">
        {ketQuaGoiList.map((k) => {
          const loaiList = parseLoaiKhaoSat(k.loai_khao_sat);
          return (
            <Card key={k.id} className="p-3">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-1.5">
                <span className="font-semibold text-sm">{k.ket_qua_cuoc_goi ?? "—"}</span>
                <div className="flex items-center gap-1.5">
                  {k.can_goi_lai !== null && <Badge tone={k.can_goi_lai ? "amber" : "gray"}>{k.can_goi_lai ? "Cần gọi lại" : "Không cần gọi lại"}</Badge>}
                  <span className="text-xs text-[var(--ink-400)]">{fmtDateTime(k.ngay_gio_thuc_hien)}</span>
                </div>
              </div>
              {loaiList.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {loaiList.map((loai) => (
                    <Badge key={loai} tone="ocean">
                      {LOAI_LOI_META[loai]?.short ?? loai}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-[var(--ink-600)]">
                <Field label="Đối tượng liên hệ" value={k.doi_tuong_lien_he ?? "—"} />
                <Field label="Người thực hiện" value={formatPersonDisplay(k.nguoi_thuc_hien, personDir)} />
                {k.ly_do_that_bai && <Field label="Lý do thất bại" value={k.ly_do_that_bai} />}
                {k.ghi_chu && <Field label="Ghi chú" value={k.ghi_chu} />}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );

  // CHOT 2026-08-20: badge "X ngay" tren cung tab Ca lap truoc day hien caLap.detection.gapDays -
  // gia tri tinh san o backend theo cong thuc CU "hoan thanh ca nay - hoan thanh ca truoc" (xem
  // gap_days trong caLap.ts, van la nguon duy nhat cho nguong 45 ngay/dieu kien du lieu-lap-hay-khong
  // TOAN HE THONG - KHONG doi o day, pham vi rat rong). Chi doi SO HIEN THI cho khop cong thuc "dung"
  // (tiep nhan ca sau - hoan thanh ca truoc, xem parseFlexibleDbDate/gapDays trong .map ben duoi) -
  // tim lai chinh dong cua ca dang xem trong caLap.lichSu de tinh CUNG 1 cong thuc, fallback ve
  // gapDays cu neu khong tim thay du lieu (vd lichSu rong).
  const currentLichSuIdx = caLap?.lichSu.findIndex((h) => h.id === caseId) ?? -1;
  const currentLichSuRow = currentLichSuIdx >= 0 ? caLap!.lichSu[currentLichSuIdx] : undefined;
  const priorLichSuRow = currentLichSuIdx >= 0 ? caLap!.lichSu[currentLichSuIdx + 1] : undefined;
  const displayGapDays =
    priorLichSuRow?.thoi_gian_hoan_thanh && currentLichSuRow?.thoi_gian_cskh_tiep_nhan
      ? (parseFlexibleDbDate(currentLichSuRow.thoi_gian_cskh_tiep_nhan).getTime() - parseFlexibleDbDate(priorLichSuRow.thoi_gian_hoan_thanh).getTime()) / 86400000
      : caLap?.detection?.gapDays;

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
            <Badge tone={caLap.detection.gapDays <= 45 ? "coral" : "gray"}>{(displayGapDays ?? caLap.detection.gapDays).toFixed(1)} ngày</Badge>
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
                // CHOT 2026-08-05: "cach ca sau X ngay" = tu luc DONG ca truoc (next, cu hon vi da
                // sap xep DESC theo thoi_gian_cskh_tiep_nhan) den luc MO ca sau (h) - dung y nghia
                // nghiep vu "may lai hong sau bao lau", KHONG phai khoang cach giua 2 lan DONG ca
                // (cong thuc cu). Vd: ca truoc hoan thanh 15/07, ca sau tiep nhan 20/07 -> 5 ngay.
                // Dung parseFlexibleDbDate() dung chung (xem dinh nghia dau file).
                const gapDays =
                  next?.thoi_gian_hoan_thanh && h.thoi_gian_cskh_tiep_nhan
                    ? (parseFlexibleDbDate(h.thoi_gian_cskh_tiep_nhan).getTime() - parseFlexibleDbDate(next.thoi_gian_hoan_thanh).getTime()) / 86400000
                    : null;
                // CHOT 2026-08-07: Show button danh gia lap cho tat ca cac ca trong danh sach (ke ca ca hien tai)
                // ngoai tru ca bi huy bo (huy_bo_at), khong co KTV, hoac ca "Khong hoan thanh XLSC".
                const canEvalThisRow = !h.huy_bo_at && h.ky_thuat_vien && h.tien_do_hoan_thanh !== "Không hoàn thành XLSC";
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
                        isCurrent ? "border-[var(--coral-500)] bg-[var(--coral-100)]" : isCompareSelected ? "border-[var(--ocean-500)]" : "border-transparent"
                      }`}
                    >
                      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${isCurrent ? "bg-[var(--coral-500)]" : "bg-[var(--teal-500)]"}`}></span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold">
                            {/* CHOT 2026-08-12: lam noi bat ro rang dong ung voi ca DANG XEM trong
                                popup (truoc chi co border/cham mau nhat, chu he thong bao khong de
                                nhan ra giua danh sach nhieu dong) - them nen mau (xem className cha)
                                + nhan "Ca dang xem" ngay canh gio. */}
                            {isCurrent && <Badge tone="coral">📍 Ca đang xem</Badge>}{" "}
                            {fmtDateTime(h.thoi_gian_hoan_thanh)}
                            {/* Trang thai da chot (neu co) - CHOT 2026-08-05, xem chu thich lichSu
                                phia backend (LEFT JOIN giai_trinh_lap). Chi hien khi co IT NHAT 1
                                ben da chot, tranh "(GS: — QC: —)" ram tren moi dong chua ai xu ly. */}
                            {(h.chot_danh_gia_lap || h.qc_chot) && (
                              <span className="text-[var(--ink-400)] font-normal ml-1">
                                (GS: {h.chot_danh_gia_lap ? CA_LAP_META[h.chot_danh_gia_lap].label : "—"} QC: {h.qc_chot ? CA_LAP_META[h.qc_chot].label : "—"})
                              </span>
                            )}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* CHOT 2026-08-07: Show button danh gia lap cho tat ca cac ca trong danh sach (ke ca ca hien tai)
                                ngoai tru ca bi huy bo (huy_bo_at), khong co KTV, hoac ca "Khong hoan thanh XLSC". */}
                            {(canGsLap || canQcLap) && (
                              canEvalThisRow ? (
                                <>
                                  <Btn size="sm" variant="subtle" type="button" onClick={(e) => { e.stopPropagation(); setEvalRowCaseId(h.id); }}>
                                    🔒 Đánh giá lặp
                                  </Btn>
                                  {/* "Bo qua" nhanh (CHOT 2026-08-05) - luu thang "Bo qua" + "Tinh
                                      luong" cho phan nguoi dung hien co quyen, khong can mo modal. */}
                                  <Btn
                                    size="sm"
                                    variant="subtle"
                                    type="button"
                                    disabled={boQuaLap.isPending}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      boQuaLap.mutate(h.id);
                                    }}
                                  >
                                    Bỏ qua
                                  </Btn>
                                </>
                              ) : (
                                <span className="text-xs text-[var(--ink-400)] italic px-2 py-1 shrink-0">Không tính lặp</span>
                              )
                            )}
                            {h.link_crm && (
                              <a href={h.link_crm} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                                <Btn size="sm" variant="subtle" type="button">
                                  🔗 CRM
                                </Btn>
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-[var(--ink-600)]">
                          {/* CHOT 2026-08-12: "ID {id}" lam noi bat (dam + mau ocean, khop style dung
                              o SearchResultsPopup/DanhSachTongModule) tren MOI dong cua danh sach -
                              chu he thong can de mat thay so ID giua nhieu dong cung mau chu nhat. */}
                          <span className="font-mono font-semibold text-[var(--ocean-600)]">ID {h.id}</span> · {h.ky_thuat_vien ?? "—"}
                          {h.tien_do_hoan_thanh && ` · ${h.tien_do_hoan_thanh}`}
                        </div>
                        {/* Dong rieng (khong gop vao dong ID/KTV/tien do) - xem CachThucXuLyLine o
                            tren, du lieu thuc te la nhat ky dai nen can preview + bam de xem full,
                            khong the gop chung 1 dong dot-separated nhu KTV/tien do (qua dai). */}
                        {h.cach_thuc_xu_ly && <CachThucXuLyLine text={h.cach_thuc_xu_ly} />}
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
      {!napGasEligible && (
        <div className="text-xs text-[var(--ink-400)] italic mb-2">Ca này chưa được CRM đánh dấu "Nghi ngờ nạp gas" — vẫn có thể đánh giá thủ công bên dưới nếu cần.</div>
      )}
      {canNapGas && napGasLocked && (
        <div className="text-xs text-[var(--coral-500)] italic mb-2">
          🔒 Đã quá {NAP_GAS_LOCK_DAYS} ngày kể từ khi hoàn thành — khóa chốt đánh giá nạp gas.
        </div>
      )}
      {canNapGas && !napGasLocked ? (
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
                {formatPersonDisplay(napGasDanhGia.nguoi_chot, personDir)} · {fmtDateTime(napGasDanhGia.ngay_chot)}
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
                · {formatPersonDisplay(napGasDanhGia.nguoi_chot, personDir)} · {fmtDateTime(napGasDanhGia.ngay_chot)}
              </span>
            </>
          ) : (
            <span className="text-[var(--ink-400)] italic">Chưa có đánh giá nạp gas.</span>
          )}
        </div>
      )}
    </div>
  );

  // 3 tab tra cuu du lieu Google Sheet mua hang/bao hanh/xu ly thieu hang - CHOT 2026-08-02, xem
  // hooks/usePurchaseWarrantyData.ts + lib/purchaseWarrantyMatch.ts. Dung chung 1 banner dong bo
  // (CacheBanner) o dau moi tab vi ca 3 tap du lieu duoc dong bo CUNG LUC boi refreshAll().
  function muaHangTone(trangThai: string): BadgeTone {
    if (trangThai.includes("ĐỒNG Ý")) return "teal";
    if (trangThai.includes("TỪ CHỐI")) return "coral";
    return "gray";
  }
  function statusWordTone(text: string): BadgeTone {
    const t = text.toLowerCase();
    if (t.includes("hoàn thành") || t.includes("xong") || t.includes("đã xử lý")) return "teal";
    if (t.includes("từ chối") || t.includes("hủy")) return "coral";
    if (t.includes("đang")) return "amber";
    return "gray";
  }
  function qcKetQuaTone(ketQua: string): BadgeTone {
    if (ketQua.toLowerCase().includes("không đạt")) return "coral";
    if (ketQua.toLowerCase().includes("đạt")) return "teal";
    return "gray";
  }

  const purchaseSyncBanner = purchaseSyncedAt ? (
    <CacheBanner cachedAt={purchaseSyncedAt} onSync={refreshPurchaseData} isSyncing={purchaseRefreshing} />
  ) : (
    <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-slate-100 text-xs text-[var(--ink-600)]">
      <LoadingInline /> Đang đồng bộ dữ liệu mua hàng/bảo hành/QC từ Google Sheet lần đầu…
    </div>
  );

  const muaHangContent = (
    <div>
      {purchaseSyncBanner}
      {!purchaseSyncing && muaHangMatched.length === 0 && (
        <div className="text-sm text-[var(--ink-400)] italic">Không tìm thấy đơn mua hàng liên quan đến ca này.</div>
      )}
      <div className="space-y-3">
        {muaHangMatched.map((r) => (
          <Card key={r.id} className="p-3">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-1.5">
              <span className="font-semibold text-sm">{r.linhKien || "(chưa rõ linh kiện)"}</span>
              <div className="flex items-center gap-1.5">
                {r._region && <Badge tone="gray">{r._region}</Badge>}
                {r.trangThaiDuyet && <Badge tone={muaHangTone(r.trangThaiDuyet)}>{r.trangThaiDuyet}</Badge>}
              </div>
            </div>
            <div className="text-xs text-[var(--ink-400)] font-mono mb-2">{r.id}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-[var(--ink-600)]">
              <Field label="Mã linh kiện" value={r.maLinhKien || "—"} />
              <Field label="Loại đề xuất" value={r.loaiDeXuat || "—"} />
              <Field label="SL đề xuất / thực xuất" value={`${r.soLuongDeXuat || "—"} / ${r.soLuongThucXuat || "—"}`} />
              <Field label="Giá đề xuất" value={r.giaDeXuat || "—"} />
              <Field label="Ngày tạo" value={r.ngayTao || "—"} />
              <Field label="Ngày KTV nhận hàng" value={r.ngayKtvNhanHang || "—"} />
              <Field label="Trạng thái gửi hàng" value={r.trangThaiGuiHang || "—"} />
              {r.lyDoTuChoi && <Field label="Lý do từ chối" value={r.lyDoTuChoi} />}
            </div>
            <div className="flex justify-end mt-2">
              <Btn size="sm" variant="ghost" onClick={() => setDetailModalRow({ title: `Đơn mua hàng ${r.id}`, raw: parseRawRow(r) })}>
                🔍 Xem đầy đủ
              </Btn>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  const baoHanhContent = (
    <div>
      {purchaseSyncBanner}
      {!purchaseSyncing && baoHanhMatched.length === 0 && (
        <div className="text-sm text-[var(--ink-400)] italic">Không tìm thấy đơn bảo hành liên quan đến ca này.</div>
      )}
      <div className="space-y-3">
        {baoHanhMatched.map((r) => (
          <Card key={r.id} className="p-3">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-1.5">
              <span className="font-semibold text-sm">{r.modelSanPham || "(chưa rõ model)"}</span>
              <div className="flex items-center gap-1.5">
                {r._region && <Badge tone="gray">{r._region}</Badge>}
                {r.trangThai && <Badge tone={statusWordTone(r.trangThai)}>{r.trangThai}</Badge>}
              </div>
            </div>
            <div className="text-xs text-[var(--ink-400)] font-mono mb-2">{r.id}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-[var(--ink-600)]">
              <Field label="Serial" value={r.serial || "—"} />
              <Field label="Hãng" value={r.hang || "—"} />
              <Field label="Linh kiện sửa" value={r.linhKienSua || "—"} />
              <Field label="Tình trạng hư hỏng" value={r.tinhTrangHuHong || "—"} />
              <Field label="Phương án xử lý" value={r.phuongAnXuLy || "—"} />
              <Field label="Cách thức xử lý" value={r.cachThucXuLy || "—"} />
              <Field label="Nguyên nhân chậm" value={r.nguyenNhanCham || "—"} />
              <Field label="Người sửa" value={r.nguoiSua || "—"} />
              <Field label="Ngày gửi" value={r.ngayGui || "—"} />
              <Field label="Ngày giờ trả xong" value={r.ngayGioTraXong || "—"} />
              {r.danhGiaKetQua && <Field label="Đánh giá kết quả sau sửa chữa" value={r.danhGiaKetQua} />}
              {r.ghiChu && <Field label="Ghi chú" value={r.ghiChu} />}
            </div>
            <div className="flex justify-end mt-2">
              <Btn size="sm" variant="ghost" onClick={() => setDetailModalRow({ title: `Đơn bảo hành ${r.id}`, raw: parseRawRow(r) })}>
                🔍 Xem đầy đủ
              </Btn>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  const thieuHangContent = (
    <div>
      {purchaseSyncBanner}
      {!purchaseSyncing && thieuHangMatched.length === 0 && (
        <div className="text-sm text-[var(--ink-400)] italic">Không có yêu cầu xử lý thiếu hàng liên quan đến ca này.</div>
      )}
      <div className="space-y-3">
        {thieuHangMatched.map((r) => (
          <Card key={r.id} className="p-3">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-1.5">
              <span className="font-semibold text-sm">{r.lyDoLuaChon || "(chưa rõ lý do)"}</span>
              {r.trangThaiXuLy && <Badge tone={statusWordTone(r.trangThaiXuLy)}>{r.trangThaiXuLy}</Badge>}
            </div>
            <div className="text-xs text-[var(--ink-400)] font-mono mb-2">{r.id}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-[var(--ink-600)]">
              <Field label="Nguồn" value={r.nguon || "—"} />
              <Field label="Ngày dự kiến có hàng" value={r.ngayDuKienCoHang || "—"} />
              <Field label="Ngày kho xác nhận hàng về" value={r.ngayKhoXacNhan || "—"} />
              <Field label="Thay đổi ngày dự kiến" value={r.thayDoiNgayDuKien || "—"} />
              {r.giaiThichLyDo && <Field label="Giải thích lý do thiếu hàng" value={r.giaiThichLyDo} />}
              {r.ghiChu && <Field label="Ghi chú" value={r.ghiChu} />}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  const poDatHangContent = (
    <div>
      {purchaseSyncBanner}
      {!purchaseSyncing && poDatHangMatched.length === 0 && (
        <div className="text-sm text-[var(--ink-400)] italic">Không tìm thấy PO đặt hàng liên quan đến ca này.</div>
      )}
      <div className="space-y-3">
        {poDatHangMatched.map((r, i) => (
          <Card key={`${r.id}-${i}`} className="p-3">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-1.5">
              <span className="font-semibold text-sm">{r.tenLinhKien || "(chưa rõ linh kiện)"}</span>
              {r.trangThai && <Badge tone={statusWordTone(r.trangThai)}>{r.trangThai}</Badge>}
            </div>
            <div className="text-xs text-[var(--ink-400)] font-mono mb-2">{r.id}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-[var(--ink-600)]">
              <Field label="Mã linh kiện đề xuất" value={r.maLinhKienDeXuat || "—"} />
              <Field label="Đối tác" value={r.doiTac || "—"} />
              <Field label="Kho cần đặt hàng" value={r.khoCanDat || "—"} />
              <Field label="SL đặt / nhập Amis / còn thiếu" value={`${r.soLuongDat || "—"} / ${r.slNhapTheoAmis || "—"} / ${r.soLuongConThieu || "—"}`} />
              <Field label="Tốc độ hàng về" value={r.tocDoHangVe || "—"} />
              <Field label="Ngày dự kiến gần nhất" value={r.ngayDuKienGanNhat || "—"} />
              <Field label="Ngày về gần nhất toàn quốc" value={r.ngayVeGanNhatToanQuoc || "—"} />
              <Field label="Ngày tạo" value={r.ngayTao || "—"} />
              {r.canhBao && <Field label="Cảnh báo" value={r.canhBao} />}
              {r.ghiChu && <Field label="Ghi chú" value={r.ghiChu} />}
            </div>
            <div className="flex justify-end mt-2">
              <Btn size="sm" variant="ghost" onClick={() => setDetailModalRow({ title: `PO đặt hàng ${r.id}`, raw: parseRawRow(r) })}>
                🔍 Xem đầy đủ
              </Btn>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  const qcThucTeContent = (
    <div>
      {purchaseSyncBanner}
      {!purchaseSyncing && qcThucTeMatched.length === 0 && (
        <div className="text-sm text-[var(--ink-400)] italic">Không tìm thấy kết quả QC thực tế liên quan đến ca này.</div>
      )}
      <div className="space-y-3">
        {qcThucTeMatched.map((r, i) => (
          <Card key={`${r.idCrm}-${i}`} className="p-3">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-1.5">
              <span className="font-semibold text-sm">{r.tenKtv || "(chưa rõ KTV)"}</span>
              {r.ketQua && <Badge tone={qcKetQuaTone(r.ketQua)}>{r.ketQua}</Badge>}
            </div>
            <div className="text-xs text-[var(--ink-400)] font-mono mb-2">{r.idCrm}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-[var(--ink-600)]">
              <Field label="Ngày KTV đóng ca" value={r.ngayKtvDongCa || "—"} />
              <Field label="Số lượng lỗi" value={r.soLuongLoi || "—"} />
              <Field label="Điểm chuẩn / trừ / thực" value={`${r.diemTieuChuan || "—"} / ${r.diemTru || "—"} / ${r.diemThuc || "—"}`} />
              <Field label="Ngày đánh giá" value={r.ngayDanhGia || "—"} />
              <Field label="Người đánh giá" value={r.nguoiDanhGia || "—"} />
              {r.danhGiaLoi && <Field label="Đánh giá lỗi báo cáo CRM" value={r.danhGiaLoi} />}
              {r.chiTietDanhGia && <Field label="Chi tiết đánh giá lỗi báo cáo CRM" value={r.chiTietDanhGia} />}
              {r.ghiChu && <Field label="Ghi chú" value={r.ghiChu} />}
            </div>
            <div className="flex justify-end mt-2">
              <Btn size="sm" variant="ghost" onClick={() => setDetailModalRow({ title: `QC thực tế ${r.idCrm}`, raw: parseRawRow(r) })}>
                🔍 Xem đầy đủ
              </Btn>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  const canWriteTranhChapForCase = !!(currentUser && canWriteTranhChap(currentUser, c?.khu_vuc ?? null));
  // "Cho xac nhan AI" (nghi_ngo_tranh_chap = 2) ngay trong the chi tiet ca (CHOT 2026-08-22) - khop
  // dung dieu kien TRANH_CHAP_AI_CHO_XAC_NHAN + "NOT EXISTS tien_trinh" ben backend (list rong nghia
  // la chua tung tao tien trinh nao).
  const aiChoXacNhan = !!(c && c.nghi_ngo_tranh_chap === 2 && tienTrinhListForCase.length === 0);
  const canConfirmAiForCase = !!(currentUser && canConfirmAiTranhChap(currentUser, c?.khu_vuc ?? null));

  const tranhChapContent = (
    <div className="space-y-4">
      {tienTrinhListForCase.length === 0 && (
        <div className="text-sm text-[var(--ink-400)] italic">
          {aiChoXacNhan
            ? "AI phát hiện ca này có khả năng là tranh chấp, đang chờ xác nhận."
            : tranhChapEligible
              ? "Ca này chưa có tiến trình xử lý tranh chấp nào."
              : "Ca này chưa được CRM đánh dấu nghi ngờ tranh chấp — vẫn có thể tạo yêu cầu xử lý thủ công bên dưới nếu cần."}
        </div>
      )}
      {(aiChoXacNhan || (canTiepNhanTranhChapMoi && canWriteTranhChapForCase)) && (
        <div className="flex justify-end gap-2">
          {aiChoXacNhan && canConfirmAiForCase && (
            <>
              <Btn size="sm" variant="success" disabled={xacNhanAiCaseDetail.isPending} onClick={() => xacNhanAiCaseDetail.mutate("dung")}>
                Đúng là tranh chấp
              </Btn>
              <Btn size="sm" variant="ghost" disabled={xacNhanAiCaseDetail.isPending} onClick={() => xacNhanAiCaseDetail.mutate("khong_phai")}>
                Không phải tranh chấp
              </Btn>
            </>
          )}
          {canTiepNhanTranhChapMoi && canWriteTranhChapForCase && (
            <Btn size="sm" onClick={() => setTiepNhanTranhChapOpen(true)}>
              + Tạo yêu cầu giải quyết tranh chấp, khiếu nại
            </Btn>
          )}
        </div>
      )}
      {tienTrinhListForCase.map((tt) => (
        <TienTrinhPanel
          key={tt.tienTrinh.id}
          id={tt.tienTrinh.id}
          detail={tt}
          giaiTrinhNguoiGiaiTrinh={giaiTrinhNguoiGiaiTrinhEmails}
          currentUser={currentUser}
          phanLoaiOptions={phanLoaiOptions?.rows.filter((r) => r.bat_tat) ?? []}
          ketQuaOptions={ketQuaOptions?.rows.filter((r) => r.bat_tat) ?? []}
        />
      ))}
    </div>
  );

  const fullTabsList: TabItem[] =
    viewMode === "compact"
      ? [
          { key: "info", label: "Thông tin" },
          { key: "tien-trinh-chung", label: "Tiến trình chung", count: tienTrinhChungEvents.length },
          { key: "giai-trinh", label: "GT tồn", count: giaiTrinhList.length },
          { key: "bien-ban-hop", label: "Biên bản họp", count: bienBanHopList.length },
          { key: "vi-pham", label: "Vi phạm", count: viPhamList.length },
          { key: "khao-sat", label: "Khảo sát", count: ketQuaGoiList.length },
          { key: "ca-lap", label: "Ca lặp", count: caLap?.detection ? 1 : 0 },
          { key: "nap-gas", label: "Nạp gas", count: napGasDanhGia ? 1 : 0 },
          { key: "mua-hang", label: "Mua hàng", count: muaHangMatched.length },
          { key: "bao-hanh", label: "Bảo hành", count: baoHanhMatched.length },
          { key: "thieu-hang", label: "Thiếu hàng", count: thieuHangMatched.length },
          { key: "po-dat-hang", label: "PO đặt hàng", count: poDatHangMatched.length },
          { key: "qc-thuc-te", label: "QC thực tế", count: qcThucTeMatched.length },
          { key: "tranh-chap", label: "Tranh chấp", count: tienTrinhListForCase.length },
        ]
      : [
          { key: "tien-trinh-chung", label: "Tiến trình chung", count: tienTrinhChungEvents.length },
          { key: "giai-trinh", label: "GT tồn", count: giaiTrinhList.length },
          { key: "bien-ban-hop", label: "Biên bản họp", count: bienBanHopList.length },
          { key: "vi-pham", label: "Vi phạm", count: viPhamList.length },
          { key: "khao-sat", label: "Khảo sát", count: ketQuaGoiList.length },
          { key: "ca-lap", label: "Ca lặp", count: caLap?.detection ? 1 : 0 },
          { key: "nap-gas", label: "Nạp gas", count: napGasDanhGia ? 1 : 0 },
          { key: "mua-hang", label: "Mua hàng", count: muaHangMatched.length },
          { key: "bao-hanh", label: "Bảo hành", count: baoHanhMatched.length },
          { key: "thieu-hang", label: "Thiếu hàng", count: thieuHangMatched.length },
          { key: "po-dat-hang", label: "PO đặt hàng", count: poDatHangMatched.length },
          { key: "qc-thuc-te", label: "QC thực tế", count: qcThucTeMatched.length },
          { key: "tranh-chap", label: "Tranh chấp", count: tienTrinhListForCase.length },
        ];

  // "info"/"giai-trinh" la 2 tab loi luon hien; tab dang active cung luon hien (khong tu bien mat
  // khoi thanh khi dang xem no du no dang rong) - phan con lai chi an neu count === 0.
  const CORE_TAB_KEYS = new Set(["info", "tien-trinh-chung", "giai-trinh"]);
  const emptyTabKeys = new Set(fullTabsList.filter((t) => !CORE_TAB_KEYS.has(t.key) && t.key !== tab && !t.count).map((t) => t.key));
  const tabsList = showAllTabs ? fullTabsList : fullTabsList.filter((t) => !emptyTabKeys.has(t.key));

  const tabsBar = (
    <div>
      {emptyTabKeys.size > 0 && (
        <div className="flex justify-end -mt-1 mb-1.5">
          <button
            type="button"
            onClick={() => setShowAllTabs((v) => !v)}
            className="focus-ring text-xs font-semibold text-[var(--ocean-600)] hover:underline"
          >
            {showAllTabs ? "Thu gọn ▲" : `Xem thêm ${emptyTabKeys.size} tab trống ▾`}
          </button>
        </div>
      )}
      <Tabs active={tab} onChange={onTabChange} tabs={tabsList} />
    </div>
  );

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
              {tabsBar}
              {tab === "tien-trinh-chung" && tienTrinhChungContent}
              {tab === "giai-trinh" && giaiTrinhContent}
              {tab === "bien-ban-hop" && bienBanHopContent}
              {tab === "vi-pham" && viPhamContent}
              {tab === "khao-sat" && khaoSatContent}
              {tab === "ca-lap" && caLapContent}
              {tab === "nap-gas" && napGasContent}
              {tab === "mua-hang" && muaHangContent}
              {tab === "bao-hanh" && baoHanhContent}
              {tab === "thieu-hang" && thieuHangContent}
              {tab === "po-dat-hang" && poDatHangContent}
              {tab === "qc-thuc-te" && qcThucTeContent}
              {tab === "tranh-chap" && tranhChapContent}
            </div>
          </div>
        )}

        {c && viewMode === "compact" && (
          <div className="overflow-y-auto flex-1 p-5">
            {tabsBar}
            {tab === "info" && infoContent}
            {tab === "tien-trinh-chung" && tienTrinhChungContent}
            {tab === "giai-trinh" && giaiTrinhContent}
            {tab === "bien-ban-hop" && bienBanHopContent}
            {tab === "vi-pham" && viPhamContent}
            {tab === "khao-sat" && khaoSatContent}
            {tab === "ca-lap" && caLapContent}
            {tab === "nap-gas" && napGasContent}
            {tab === "mua-hang" && muaHangContent}
            {tab === "bao-hanh" && baoHanhContent}
            {tab === "thieu-hang" && thieuHangContent}
            {tab === "qc-thuc-te" && qcThucTeContent}
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
              <ChoiceSelect
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
                    options={activeLinhKien.map((l) => ({ value: l.ma_linh_kien, label: `${l.ma_linh_kien} · ${l.ten_linh_kien}` }))}
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

      {/* CHOT 2026-08-05: "Xu ly ca lap" tach thanh component dung chung CaLapEvalModal (nhan caseId
          lam prop) - dung 2 lan doc lap: nut o dau tab (danh gia CHINH ca dang mo) va tu 1 dong bat
          ky trong "Chuoi lich su theo serial" (danh gia ca do, xem evalRowCaseId). */}
      {caLapModalOpen && caLap?.detection && <CaLapEvalModal caseId={caseId!} canGsLap={canGsLap} canQcLap={canQcLap} onClose={() => setCaLapModalOpen(false)} />}
      {evalRowCaseId && <CaLapEvalModal caseId={evalRowCaseId} canGsLap={canGsLap} canQcLap={canQcLap} onClose={() => setEvalRowCaseId(null)} />}

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

      {detailModalRow && (
        <Modal open onClose={() => setDetailModalRow(null)} title={detailModalRow.title} width="max-w-lg">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {Object.entries(detailModalRow.raw).map(([header, value]) => (
              <Field key={header} label={header} value={value || "—"} />
            ))}
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
          ketQuaOptions={ketQuaOptions?.rows.filter((r) => r.bat_tat) ?? []}
          onClose={() => setTiepNhanTranhChapOpen(false)}
          onSubmit={(body) => tiepNhanTranhChap.mutate(body)}
          isPending={tiepNhanTranhChap.isPending}
        />
      )}
    </div>
  );
}
