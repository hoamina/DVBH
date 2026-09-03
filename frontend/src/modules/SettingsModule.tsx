import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "../components/ui/Tabs";
import { Select } from "../components/ui/Select";
import { Card } from "../components/ui/Card";
import { Btn } from "../components/ui/Btn";
import { Modal } from "../components/ui/Modal";
import { ToggleSwitch } from "../components/ui/ToggleSwitch";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { StatCard } from "../components/ui/StatCard";
import { ImportUploader } from "../components/ImportUploader";
import { api } from "../api/client";
import { useToast } from "../components/ui/Toast";
import {
  type LyDoRow,
  type LyDoChamMuaLkRow,
  type PhanLoaiTranhChapRow,
  type KetQuaXuLyTranhChapRow,
  type LoaiYeuCauBoQuaLapRow,
  type LoaiYeuCauDoiTraRow,
  type LuuYLoiLinhKienDoiTraRow,
  type GreetingGifRow,
  type GreetingMessageRow,
  type GiaiTrinhExcludeNgayRow,
  type PartnerApiKeyRow,
  type KtvLienHeRow,
} from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { fetchWithHashCache } from "../lib/staticListCache";
import { KTV_PHONE_QUERY_KEY } from "../lib/ktvPhone";
import { shortKhuVuc } from "../lib/khuVucShortLabel";
import { usePersonDirectory, formatPersonDisplay } from "../lib/personDisplay";

interface KtvImportSummary {
  thanhCong: number;
  loi: number;
  errors: string[];
}

const PAGE_SIZE = 20;

// KHOA CHINH SUA (2026-09-04): ktv_lien_he (tru popup KtvNameWithPhone.tsx o cac man CSKH - muc dich
// khac, giu nguyen theo yeu cau) chuyen sang dong bo tu he "linh-kien-app" doc lap qua POST
// /api/partner/sync/ktv (cron 1h/lan, ghi de khong merge - xem routes/partnerApi.ts). Sua tay o tab
// "Danh sách KTV" nay se bi ghi de trong toi da 1h nen khoa het duong ghi qua UI (giu nguyen route
// backend - chi khoa frontend, xem feedback nguoi dung).
const KTV_LIST_LOCKED = true;

interface SheetUrlRow {
  loai_dong_bo: string;
  url: string | null;
  updated_at: string;
  updated_by: string | null;
}

interface LdeNhomRow {
  id: number;
  ten_nhom: string;
  vai_tro_json: string;
  bat_tat: number;
  nguoi_cap_nhat: string | null;
  ngay_cap_nhat: string;
}

interface LdeOptionRow {
  id: number;
  nhom_id: number;
  ten_option: string;
  bat_tat: number;
  stt: number;
  nguoi_cap_nhat: string | null;
  ngay_cap_nhat: string;
}

const LDE_VAI_TRO_FLAGS = [
  { flag: "la_ktv_dvbh", label: "KTV DVBH" },
  { flag: "la_ve_tinh", label: "Vệ tinh" },
  { flag: "vai_tro:Admin", label: "Admin" },
  { flag: "vai_tro:Viewer", label: "Viewer" },
  { flag: "vai_tro:QC", label: "QC" },
  { flag: "vai_tro:Giam sat", label: "Giám sát" },
  { flag: "vai_tro:TBP DVBH", label: "TBP DVBH" },
  { flag: "vai_tro:CSKH", label: "CSKH" },
  { flag: "vai_tro:TN CSKH", label: "TN CSKH" },
  { flag: "vai_tro:TBP CSKH", label: "TBP CSKH" },
  { flag: "vai_tro:KSNB Doi tac", label: "KSNB Đối tác" },
];

const LOAI_DONG_BO_LABELS: Record<string, string> = {
  case: "Ca mới (import CRM hàng ngày)",
  linh_kien: "Bảng giá linh kiện",
  giai_trinh_cu: "Giải trình cũ",
  giai_trinh_lap_cu: "Giải trình lặp cũ",
  khao_sat_cu: "Khảo sát cũ",
  nap_gas_danh_gia_cu: "Đánh giá nạp gas cũ",
};

export function SettingsModule() {
  const [tab, setTab] = useState("ly-do");
  const addToast = useToast();
  const qc = useQueryClient();
  const personDir = usePersonDirectory();
  const [addOpen, setAddOpen] = useState(false);
  const [newReason, setNewReason] = useState({ ten: "", thieu: false, tranhChap: false });
  const [addPhanLoaiOpen, setAddPhanLoaiOpen] = useState(false);
  const [newPhanLoai, setNewPhanLoai] = useState("");
  const [addKetQuaOpen, setAddKetQuaOpen] = useState(false);
  const [newKetQua, setNewKetQua] = useState("");
  const [addLoaiYeuCauBoQuaLapOpen, setAddLoaiYeuCauBoQuaLapOpen] = useState(false);
  const [newLoaiYeuCauBoQuaLap, setNewLoaiYeuCauBoQuaLap] = useState("");
  const [ddSettingsSub, setDdSettingsSub] = useState<"loai-yeu-cau" | "luu-y-loi-linh-kien">("loai-yeu-cau");
  const [addLoaiYeuCauDoiTraOpen, setAddLoaiYeuCauDoiTraOpen] = useState(false);
  const [newLoaiYeuCauDoiTra, setNewLoaiYeuCauDoiTra] = useState("");
  const [addLuuYLoiLinhKienDoiTraOpen, setAddLuuYLoiLinhKienDoiTraOpen] = useState(false);
  const [newLuuYLoiLinhKienDoiTra, setNewLuuYLoiLinhKienDoiTra] = useState("");
  const [addGreetingGifOpen, setAddGreetingGifOpen] = useState(false);
  const [newGreetingGif, setNewGreetingGif] = useState("");
  const [addGreetingMessageOpen, setAddGreetingMessageOpen] = useState(false);
  const [newGreetingMessage, setNewGreetingMessage] = useState("");
  const [addExcludeNgayOpen, setAddExcludeNgayOpen] = useState(false);
  const [newExcludeNgay, setNewExcludeNgay] = useState<{ ngay: string; khuVucList: string[]; toanBo: boolean; ghiChu: string }>({
    ngay: "",
    khuVucList: [],
    toanBo: false,
    ghiChu: "",
  });
  const [addPartnerKeyOpen, setAddPartnerKeyOpen] = useState(false);
  const [newPartnerKey, setNewPartnerKey] = useState({ tenDoiTac: "", ghiChu: "" });
  const [createdPartnerKey, setCreatedPartnerKey] = useState<{ tenDoiTac: string; apiKey: string } | null>(null);
  const [partnerKeyPage, setPartnerKeyPage] = useState(1);
  // "Mua hàng" (phản hồi 2026-08-19: gộp settings liên quan module Đặt mua linh kiện vào 1 thẻ
  // chung) - sub-tab con giữa "Lý do chậm (Đặt mua LK)" (mới, bảng settings_ly_do_cham - KHÁC
  // "Lý do chậm" ở trên dùng cho giải trình ca tồn) và "Loại đề xuất" (dời nguyên từ tab riêng cũ).
  const [muaHangSub, setMuaHangSub] = useState<"ly-do-cham" | "loai-de-xuat">("ly-do-cham");
  const [lyDoChamOpen, setLyDoChamOpen] = useState(false);
  const [editingLyDoChamId, setEditingLyDoChamId] = useState<number | null>(null);
  const [lyDoChamForm, setLyDoChamForm] = useState({
    ten_ly_do: "", muaHang: true, baoHanh: false, quan_ly_don_thieu_linh_kien: false, bat_tat: true, stt: "0",
  });
  const [lyDoChamPage, setLyDoChamPage] = useState(1);
  const [ldeNhomOpen, setLdeNhomOpen] = useState(false);
  const [editingNhomId, setEditingNhomId] = useState<number | null>(null);
  const [nhomForm, setNhomForm] = useState({ ten_nhom: "", vai_tro_flags: [] as string[], bat_tat: true });
  const [ldeOptionOpen, setLdeOptionOpen] = useState(false);
  const [editingOptionId, setEditingOptionId] = useState<number | null>(null);
  const [optionNhomId, setOptionNhomId] = useState<number | null>(null);
  const [optionForm, setOptionForm] = useState({ ten_option: "", stt: "0", bat_tat: true });
  const [editingUrls, setEditingUrls] = useState<Record<string, string>>({});
  const [lyDoPage, setLyDoPage] = useState(1);
  const [phanLoaiPage, setPhanLoaiPage] = useState(1);
  const [ketQuaPage, setKetQuaPage] = useState(1);
  const [loaiYeuCauBoQuaLapPage, setLoaiYeuCauBoQuaLapPage] = useState(1);
  const [loaiYeuCauDoiTraPage, setLoaiYeuCauDoiTraPage] = useState(1);
  const [luuYLoiLinhKienDoiTraPage, setLuuYLoiLinhKienDoiTraPage] = useState(1);
  const [greetingGifPage, setGreetingGifPage] = useState(1);
  const [greetingMessagePage, setGreetingMessagePage] = useState(1);
  const [ktvPage, setKtvPage] = useState(1);
  const [ktvModalOpen, setKtvModalOpen] = useState(false);
  const [editingKtvMa, setEditingKtvMa] = useState<string | null>(null);
  const [ktvForm, setKtvForm] = useState({
    ma_ktv: "", ten_hien_thi: "", sdt: "", ghi_chu: "",
    gmail: "", vai_tro_ktv: "", giam_sat_quan_ly: "", email_dang_nhap: "",
  });

  const { data: driveStatus } = useQuery({
    queryKey: ["settings-google-drive-status"],
    queryFn: () => api.get<{ connected: boolean; google_email?: string; authorized_by?: string; authorized_at?: string }>("/settings/google-drive/status"),
  });

  const { data: reasons } = useQuery({
    queryKey: ["settings-ly-do"],
    queryFn: () => fetchWithHashCache<{ rows: LyDoRow[] }>("settings-ly-do", "/settings/ly-do/version", "/settings/ly-do"),
  });
  const { data: lyDoChamRows } = useQuery({
    queryKey: ["settings-ly-do-cham"],
    queryFn: () => api.get<{ rows: LyDoChamMuaLkRow[] }>("/settings/ly-do-cham"),
  });
  const { data: ktvLienHe } = useQuery({
    queryKey: KTV_PHONE_QUERY_KEY,
    queryFn: () => fetchWithHashCache<{ rows: KtvLienHeRow[] }>("settings-ktv-lien-he", "/settings/ktv-lien-he/version", "/settings/ktv-lien-he"),
  });
  const { data: sheetUrls } = useQuery({
    queryKey: ["settings-sheet-urls"],
    queryFn: () => api.get<{ rows: SheetUrlRow[] }>("/settings/sheet-urls"),
  });
  const { data: phanLoaiTranhChap } = useQuery({
    queryKey: ["settings-phan-loai-tranh-chap"],
    queryFn: () => api.get<{ rows: PhanLoaiTranhChapRow[] }>("/settings/phan-loai-tranh-chap"),
  });
  const { data: ketQuaXuLyTranhChap } = useQuery({
    queryKey: ["settings-ket-qua-xu-ly-tranh-chap"],
    queryFn: () => api.get<{ rows: KetQuaXuLyTranhChapRow[] }>("/settings/ket-qua-xu-ly-tranh-chap"),
  });
  const { data: loaiYeuCauBoQuaLap } = useQuery({
    queryKey: ["settings-loai-yeu-cau-bo-qua-lap"],
    queryFn: () => api.get<{ rows: LoaiYeuCauBoQuaLapRow[] }>("/settings/loai-yeu-cau-bo-qua-lap"),
  });
  // Goi y DISTINCT loai_yeu_cau tu case_dvbh - chi tai khi mo modal "Them" (tranh quet ca bang moi lan
  // vao Settings, xem routes/settings.ts GET /loai-yeu-cau-bo-qua-lap/goi-y).
  const { data: loaiYeuCauGoiY } = useQuery({
    queryKey: ["settings-loai-yeu-cau-goi-y"],
    queryFn: () => api.get<{ rows: string[] }>("/settings/loai-yeu-cau-bo-qua-lap/goi-y"),
    enabled: addLoaiYeuCauBoQuaLapOpen,
  });
  const { data: loaiYeuCauDoiTra } = useQuery({
    queryKey: ["settings-loai-yeu-cau-doi-tra"],
    queryFn: () => api.get<{ rows: LoaiYeuCauDoiTraRow[] }>("/settings/loai-yeu-cau-doi-tra"),
  });
  const { data: loaiYeuCauDoiTraGoiY } = useQuery({
    queryKey: ["settings-loai-yeu-cau-doi-tra-goi-y"],
    queryFn: () => api.get<{ rows: string[] }>("/settings/loai-yeu-cau-doi-tra/goi-y"),
    enabled: addLoaiYeuCauDoiTraOpen,
  });
  const { data: luuYLoiLinhKienDoiTra } = useQuery({
    queryKey: ["settings-luu-y-loi-linh-kien-doi-tra"],
    queryFn: () => api.get<{ rows: LuuYLoiLinhKienDoiTraRow[] }>("/settings/luu-y-loi-linh-kien-doi-tra"),
  });
  const { data: luuYLoiLinhKienDoiTraGoiY } = useQuery({
    queryKey: ["settings-luu-y-loi-linh-kien-doi-tra-goi-y"],
    queryFn: () => api.get<{ rows: string[] }>("/settings/luu-y-loi-linh-kien-doi-tra/goi-y"),
    enabled: addLuuYLoiLinhKienDoiTraOpen,
  });
  const { data: greetingGifs } = useQuery({
    queryKey: ["settings-greeting-gif"],
    queryFn: () => api.get<{ rows: GreetingGifRow[] }>("/settings/greeting-gif"),
  });
  const { data: greetingMessages } = useQuery({
    queryKey: ["settings-greeting-message"],
    queryFn: () => api.get<{ rows: GreetingMessageRow[] }>("/settings/greeting-message"),
  });
  const { data: excludeNgayRows } = useQuery({
    queryKey: ["settings-giai-trinh-exclude-ngay"],
    queryFn: () => api.get<{ rows: GiaiTrinhExcludeNgayRow[] }>("/settings/giai-trinh-exclude-ngay"),
  });
  const { data: dashboardFilters } = useQuery({
    queryKey: ["dashboard-filters"],
    queryFn: () => api.get<{ khuVuc: string[] }>("/dashboard/filters"),
  });
  const { data: partnerKeys } = useQuery({
    queryKey: ["settings-partner-keys"],
    queryFn: () => api.get<{ rows: PartnerApiKeyRow[] }>("/settings/partner-keys"),
  });
  const { data: ldeNhomData } = useQuery({
    queryKey: ["settings-lde-nhom"],
    queryFn: () => api.get<{ rows: LdeNhomRow[] }>("/settings/loai-de-xuat/nhom"),
  });
  const { data: ldeOptionsData } = useQuery({
    queryKey: ["settings-lde-options"],
    queryFn: () => api.get<{ rows: LdeOptionRow[] }>("/settings/loai-de-xuat"),
  });

  const toggleReason = useMutation({
    mutationFn: ({ id, field, value }: { id: number; field: "bat_tat" | "thuoc_thieu_linh_kien" | "thuoc_tranh_chap"; value: boolean }) =>
      api.patch(`/settings/ly-do/${id}`, { [field]: value }),
    onSuccess: () => {
      addToast("Đã cập nhật cài đặt lý do chậm");
      qc.invalidateQueries({ queryKey: ["settings-ly-do"] });
    },
  });

  const addReasonMutation = useMutation({
    mutationFn: () => api.post("/settings/ly-do", { ten_ly_do: newReason.ten, thuoc_thieu_linh_kien: newReason.thieu, thuoc_tranh_chap: newReason.tranhChap }),
    onSuccess: () => {
      addToast("Đã thêm lý do chậm mới");
      setNewReason({ ten: "", thieu: false, tranhChap: false });
      setAddOpen(false);
      qc.invalidateQueries({ queryKey: ["settings-ly-do"] });
    },
  });

  // Toggle nhanh 1 cot boolean (bat_tat / quan_ly_don_thieu_linh_kien) ngay trong bang, khong can
  // mo modal "Sửa" - giong pattern toggleReason o tren.
  const toggleLyDoChamMutation = useMutation({
    mutationFn: ({ id, field, value }: { id: number; field: "bat_tat" | "quan_ly_don_thieu_linh_kien"; value: boolean }) =>
      api.patch(`/settings/ly-do-cham/${id}`, { [field]: value }),
    onSuccess: () => {
      addToast("Đã cập nhật lý do chậm");
      qc.invalidateQueries({ queryKey: ["settings-ly-do-cham"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-ly-do-cham"] });
    },
    onError: () => addToast("Không thể cập nhật, thử lại sau."),
  });

  function openAddLyDoCham() {
    setEditingLyDoChamId(null);
    setLyDoChamForm({ ten_ly_do: "", muaHang: true, baoHanh: false, quan_ly_don_thieu_linh_kien: false, bat_tat: true, stt: String((lyDoChamRows?.rows ?? []).length) });
    setLyDoChamOpen(true);
  }
  function openEditLyDoCham(r: LyDoChamMuaLkRow) {
    setEditingLyDoChamId(r.id);
    setLyDoChamForm({
      ten_ly_do: r.ten_ly_do,
      muaHang: r.he_thong_su_dung.includes("Mua hàng"),
      baoHanh: r.he_thong_su_dung.includes("Bảo hành"),
      quan_ly_don_thieu_linh_kien: !!r.quan_ly_don_thieu_linh_kien,
      bat_tat: !!r.bat_tat,
      stt: String(r.stt),
    });
    setLyDoChamOpen(true);
  }

  const saveLyDoChamMutation = useMutation({
    mutationFn: () => {
      const heThong = [lyDoChamForm.muaHang && "Mua hàng", lyDoChamForm.baoHanh && "Bảo hành"].filter(Boolean).join(", ");
      const body = {
        ten_ly_do: lyDoChamForm.ten_ly_do.trim(),
        he_thong_su_dung: heThong,
        quan_ly_don_thieu_linh_kien: lyDoChamForm.quan_ly_don_thieu_linh_kien,
        bat_tat: lyDoChamForm.bat_tat,
        stt: Number(lyDoChamForm.stt) || 0,
      };
      return editingLyDoChamId ? api.patch(`/settings/ly-do-cham/${editingLyDoChamId}`, body) : api.post("/settings/ly-do-cham", body);
    },
    onSuccess: () => {
      addToast(editingLyDoChamId ? "Đã cập nhật lý do chậm" : "Đã thêm lý do chậm mới");
      setLyDoChamOpen(false);
      setEditingLyDoChamId(null);
      qc.invalidateQueries({ queryKey: ["settings-ly-do-cham"] });
      qc.invalidateQueries({ queryKey: ["dat-mua-lk-ly-do-cham"] });
    },
    onError: () => addToast("Không thể lưu, thử lại sau."),
  });

  const saveUrlMutation = useMutation({
    mutationFn: ({ loai, url }: { loai: string; url: string }) => api.patch(`/settings/sheet-urls/${loai}`, { url: url || null }),
    onSuccess: () => {
      addToast("Đã lưu link đồng bộ");
      qc.invalidateQueries({ queryKey: ["settings-sheet-urls"] });
    },
    onError: () => addToast("Không lưu được link, thử lại sau."),
  });

  const togglePhanLoai = useMutation({
    mutationFn: ({ id, bat_tat }: { id: number; bat_tat: boolean }) => api.patch(`/settings/phan-loai-tranh-chap/${id}`, { bat_tat }),
    onSuccess: () => {
      addToast("Đã cập nhật phân loại tranh chấp");
      qc.invalidateQueries({ queryKey: ["settings-phan-loai-tranh-chap"] });
    },
  });

  const addPhanLoaiMutation = useMutation({
    mutationFn: () => api.post("/settings/phan-loai-tranh-chap", { ten_phan_loai: newPhanLoai }),
    onSuccess: () => {
      addToast("Đã thêm phân loại tranh chấp mới");
      setNewPhanLoai("");
      setAddPhanLoaiOpen(false);
      qc.invalidateQueries({ queryKey: ["settings-phan-loai-tranh-chap"] });
    },
    onError: () => addToast("Không thể thêm (tên có thể đã tồn tại)."),
  });

  const toggleKetQua = useMutation({
    mutationFn: ({ id, bat_tat }: { id: number; bat_tat: boolean }) => api.patch(`/settings/ket-qua-xu-ly-tranh-chap/${id}`, { bat_tat }),
    onSuccess: () => {
      addToast("Đã cập nhật kết quả xử lý tranh chấp");
      qc.invalidateQueries({ queryKey: ["settings-ket-qua-xu-ly-tranh-chap"] });
    },
  });

  const addKetQuaMutation = useMutation({
    mutationFn: () => api.post("/settings/ket-qua-xu-ly-tranh-chap", { ten_ket_qua: newKetQua }),
    onSuccess: () => {
      addToast("Đã thêm kết quả xử lý tranh chấp mới");
      setNewKetQua("");
      setAddKetQuaOpen(false);
      qc.invalidateQueries({ queryKey: ["settings-ket-qua-xu-ly-tranh-chap"] });
    },
    onError: () => addToast("Không thể thêm (tên có thể đã tồn tại)."),
  });

  const toggleLoaiYeuCauBoQuaLap = useMutation({
    mutationFn: ({ id, bat_tat }: { id: number; bat_tat: boolean }) => api.patch(`/settings/loai-yeu-cau-bo-qua-lap/${id}`, { bat_tat }),
    onSuccess: () => {
      addToast("Đã cập nhật danh sách bỏ qua đánh giá lặp");
      qc.invalidateQueries({ queryKey: ["settings-loai-yeu-cau-bo-qua-lap"] });
    },
  });

  const addLoaiYeuCauBoQuaLapMutation = useMutation({
    mutationFn: () => api.post("/settings/loai-yeu-cau-bo-qua-lap", { loai_yeu_cau: newLoaiYeuCauBoQuaLap }),
    onSuccess: () => {
      addToast("Đã thêm loại yêu cầu bỏ qua đánh giá lặp");
      setNewLoaiYeuCauBoQuaLap("");
      setAddLoaiYeuCauBoQuaLapOpen(false);
      qc.invalidateQueries({ queryKey: ["settings-loai-yeu-cau-bo-qua-lap"] });
    },
    onError: () => addToast("Không thể thêm (loại yêu cầu này có thể đã có trong danh sách)."),
  });

  const toggleLoaiYeuCauDoiTra = useMutation({
    mutationFn: ({ id, bat_tat }: { id: number; bat_tat: boolean }) => api.patch(`/settings/loai-yeu-cau-doi-tra/${id}`, { bat_tat }),
    onSuccess: () => {
      addToast("Đã cập nhật danh sách Loại yêu cầu (Theo dõi đổi trả)");
      qc.invalidateQueries({ queryKey: ["settings-loai-yeu-cau-doi-tra"] });
    },
  });

  const addLoaiYeuCauDoiTraMutation = useMutation({
    mutationFn: () => api.post("/settings/loai-yeu-cau-doi-tra", { loai_yeu_cau: newLoaiYeuCauDoiTra }),
    onSuccess: () => {
      addToast("Đã thêm loại yêu cầu");
      setNewLoaiYeuCauDoiTra("");
      setAddLoaiYeuCauDoiTraOpen(false);
      qc.invalidateQueries({ queryKey: ["settings-loai-yeu-cau-doi-tra"] });
    },
    onError: () => addToast("Không thể thêm (loại yêu cầu này có thể đã có trong danh sách)."),
  });

  const toggleLuuYLoiLinhKienDoiTra = useMutation({
    mutationFn: ({ id, bat_tat }: { id: number; bat_tat: boolean }) => api.patch(`/settings/luu-y-loi-linh-kien-doi-tra/${id}`, { bat_tat }),
    onSuccess: () => {
      addToast("Đã cập nhật danh sách Lưu ý lỗi linh kiện (Theo dõi đổi trả)");
      qc.invalidateQueries({ queryKey: ["settings-luu-y-loi-linh-kien-doi-tra"] });
    },
  });

  const addLuuYLoiLinhKienDoiTraMutation = useMutation({
    mutationFn: () => api.post("/settings/luu-y-loi-linh-kien-doi-tra", { luu_y_loi_linh_kien: newLuuYLoiLinhKienDoiTra }),
    onSuccess: () => {
      addToast("Đã thêm giá trị");
      setNewLuuYLoiLinhKienDoiTra("");
      setAddLuuYLoiLinhKienDoiTraOpen(false);
      qc.invalidateQueries({ queryKey: ["settings-luu-y-loi-linh-kien-doi-tra"] });
    },
    onError: () => addToast("Không thể thêm (giá trị này có thể đã có trong danh sách)."),
  });

  const toggleGreetingGif = useMutation({
    mutationFn: ({ id, bat_tat }: { id: number; bat_tat: boolean }) => api.patch(`/settings/greeting-gif/${id}`, { bat_tat }),
    onSuccess: () => {
      addToast("Đã cập nhật GIF chào mừng");
      qc.invalidateQueries({ queryKey: ["settings-greeting-gif"] });
    },
  });

  const addGreetingGifMutation = useMutation({
    mutationFn: () => api.post("/settings/greeting-gif", { gif_url: newGreetingGif }),
    onSuccess: () => {
      addToast("Đã thêm GIF chào mừng mới");
      setNewGreetingGif("");
      setAddGreetingGifOpen(false);
      qc.invalidateQueries({ queryKey: ["settings-greeting-gif"] });
    },
    onError: () => addToast("Không thể thêm (link có thể đã tồn tại)."),
  });

  const toggleGreetingMessage = useMutation({
    mutationFn: ({ id, bat_tat }: { id: number; bat_tat: boolean }) => api.patch(`/settings/greeting-message/${id}`, { bat_tat }),
    onSuccess: () => {
      addToast("Đã cập nhật lời chào");
      qc.invalidateQueries({ queryKey: ["settings-greeting-message"] });
    },
  });

  const addGreetingMessageMutation = useMutation({
    mutationFn: () => api.post("/settings/greeting-message", { noi_dung: newGreetingMessage }),
    onSuccess: () => {
      addToast("Đã thêm lời chào mới");
      setNewGreetingMessage("");
      setAddGreetingMessageOpen(false);
      qc.invalidateQueries({ queryKey: ["settings-greeting-message"] });
    },
    onError: () => addToast("Không thể thêm (nội dung có thể đã tồn tại)."),
  });

  const addExcludeNgayMutation = useMutation({
    mutationFn: () =>
      api.post("/settings/giai-trinh-exclude-ngay", {
        ngay: newExcludeNgay.ngay,
        khuVucList: newExcludeNgay.toanBo ? ["__ALL__"] : newExcludeNgay.khuVucList,
        ghiChu: newExcludeNgay.ghiChu || undefined,
      }),
    onSuccess: () => {
      addToast("Đã thêm ngày loại trừ");
      setNewExcludeNgay({ ngay: "", khuVucList: [], toanBo: false, ghiChu: "" });
      setAddExcludeNgayOpen(false);
      qc.invalidateQueries({ queryKey: ["settings-giai-trinh-exclude-ngay"] });
    },
    onError: () => addToast("Không thể thêm ngày loại trừ."),
  });

  const deleteExcludeNgayMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/settings/giai-trinh-exclude-ngay/${id}`),
    onSuccess: () => {
      addToast("Đã xóa ngày loại trừ");
      qc.invalidateQueries({ queryKey: ["settings-giai-trinh-exclude-ngay"] });
    },
  });

  const addPartnerKeyMutation = useMutation({
    mutationFn: () =>
      api.post<PartnerApiKeyRow>("/settings/partner-keys", {
        ten_doi_tac: newPartnerKey.tenDoiTac,
        ghi_chu: newPartnerKey.ghiChu || undefined,
      }),
    onSuccess: (row) => {
      setCreatedPartnerKey({ tenDoiTac: row.ten_doi_tac, apiKey: row.api_key });
      setNewPartnerKey({ tenDoiTac: "", ghiChu: "" });
      setAddPartnerKeyOpen(false);
      qc.invalidateQueries({ queryKey: ["settings-partner-keys"] });
    },
    onError: () => addToast("Không thể tạo key (tên đối tác trống?)."),
  });

  const togglePartnerKeyMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => api.patch(`/settings/partner-keys/${id}`, { active }),
    onSuccess: (_data, vars) => {
      addToast(vars.active ? "Đã cấp lại key" : "Đã thu hồi key");
      qc.invalidateQueries({ queryKey: ["settings-partner-keys"] });
    },
  });

  const saveNhomMutation = useMutation({
    mutationFn: () => {
      const body = { ten_nhom: nhomForm.ten_nhom.trim(), vai_tro_json: JSON.stringify(nhomForm.vai_tro_flags), bat_tat: nhomForm.bat_tat };
      return editingNhomId
        ? api.patch(`/settings/loai-de-xuat/nhom/${editingNhomId}`, body)
        : api.post("/settings/loai-de-xuat/nhom", body);
    },
    onSuccess: () => {
      addToast(editingNhomId ? "Đã cập nhật nhóm" : "Đã thêm nhóm mới");
      setLdeNhomOpen(false);
      setEditingNhomId(null);
      setNhomForm({ ten_nhom: "", vai_tro_flags: [], bat_tat: true });
      qc.invalidateQueries({ queryKey: ["settings-lde-nhom"] });
    },
    onError: () => addToast("Không thể lưu nhóm."),
  });

  const saveOptionMutation = useMutation({
    mutationFn: () => {
      const body = { ten_option: optionForm.ten_option.trim(), stt: Number(optionForm.stt) || 0, bat_tat: optionForm.bat_tat };
      return editingOptionId
        ? api.patch(`/settings/loai-de-xuat/${editingOptionId}`, body)
        : api.post("/settings/loai-de-xuat", { nhom_id: optionNhomId, ...body });
    },
    onSuccess: () => {
      addToast(editingOptionId ? "Đã cập nhật option" : "Đã thêm option mới");
      setLdeOptionOpen(false);
      setEditingOptionId(null);
      setOptionNhomId(null);
      setOptionForm({ ten_option: "", stt: "0", bat_tat: true });
      qc.invalidateQueries({ queryKey: ["settings-lde-options"] });
    },
    onError: () => addToast("Không thể lưu option."),
  });

  const deleteOptionMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/settings/loai-de-xuat/${id}`),
    onSuccess: () => {
      addToast("Đã xóa option");
      qc.invalidateQueries({ queryKey: ["settings-lde-options"] });
    },
    onError: () => addToast("Không thể xóa option."),
  });

  const saveKtvMutation = useMutation({
    // 2 loi goi: POST goc (ten_hien_thi/sdt/ghi_chu, dung chung voi CSKH) upsert truoc de dam bao
    // dong ton tai, roi PATCH rieng .../dat-mua-lk (Admin-only, 4 cot moi migration 0067) - man
    // hinh Settings chi Admin vao duoc (xem ROLE_MODULES) nen gop 1 form/1 nut Luu duy nhat cho don
    // gian, khong can tach UI theo quyen.
    mutationFn: async () => {
      await api.post("/settings/ktv-lien-he", {
        ma_ktv: ktvForm.ma_ktv,
        ten_hien_thi: ktvForm.ten_hien_thi || undefined,
        sdt: ktvForm.sdt,
        ghi_chu: ktvForm.ghi_chu || undefined,
      });
      await api.patch(`/settings/ktv-lien-he/${encodeURIComponent(ktvForm.ma_ktv.trim())}/dat-mua-lk`, {
        gmail: ktvForm.gmail || null,
        vai_tro_ktv: ktvForm.vai_tro_ktv || null,
        giam_sat_quan_ly: ktvForm.giam_sat_quan_ly || null,
        email_dang_nhap: ktvForm.email_dang_nhap || null,
      });
    },
    onSuccess: () => {
      addToast(editingKtvMa ? "Đã cập nhật KTV" : "Đã thêm KTV");
      setKtvModalOpen(false);
      setEditingKtvMa(null);
      setKtvForm({ ma_ktv: "", ten_hien_thi: "", sdt: "", ghi_chu: "", gmail: "", vai_tro_ktv: "", giam_sat_quan_ly: "", email_dang_nhap: "" });
      qc.invalidateQueries({ queryKey: KTV_PHONE_QUERY_KEY });
    },
    onError: () => addToast("Không thể lưu, thử lại sau."),
  });

  // Cap tai khoan placeholder cho KTV da ghep "Email đăng nhập" TU TRUOC nhung chua tung dang nhap
  // Google that (2026-08-15: phat hien "Người nhận hàng" chỉ hiện 4/460 KTV vì dat_don_hang/
  // phieu_xuat_kho.nguoi_nhan_hang la FK that toi users(email) - xem provisionPlaceholderUser
  // backend). Cac lan ghep MOI sau nay tu dong duoc cap (hook o PATCH .../dat-mua-lk va
  // import/commit) - nut nay chi bu du lieu cu, bam lai nhieu lan cung an toan (idempotent).
  const backfillUsersMutation = useMutation({
    mutationFn: () => api.post<{ ok: boolean; checked: number }>("/settings/ktv-lien-he/backfill-users", {}),
    onSuccess: (res) => addToast(`Đã kiểm tra ${res.checked} KTV đã ghép email - tự động cấp tài khoản trước cho người chưa đăng nhập lần nào`),
    onError: () => addToast("Không thể cấp tài khoản, thử lại sau."),
  });

  const deleteKtvMutation = useMutation({
    mutationFn: (ma: string) => api.delete(`/settings/ktv-lien-he/${encodeURIComponent(ma)}`),
    onSuccess: () => {
      addToast("Đã xóa số điện thoại KTV");
      qc.invalidateQueries({ queryKey: KTV_PHONE_QUERY_KEY });
    },
    onError: () => addToast("Không thể xóa, thử lại sau."),
  });

  const lyDoColumns: Column<LyDoRow>[] = [
    { key: "ten_ly_do", header: "Tên lý do", render: (r) => <span className="font-medium">{r.ten_ly_do}</span> },
    { key: "bat_tat", header: "Bật / Tắt", render: (r) => <ToggleSwitch checked={!!r.bat_tat} onChange={() => toggleReason.mutate({ id: r.id, field: "bat_tat", value: !r.bat_tat })} /> },
    {
      key: "thuoc_thieu_linh_kien",
      header: "Thuộc thiếu linh kiện",
      render: (r) => <ToggleSwitch checked={!!r.thuoc_thieu_linh_kien} onChange={() => toggleReason.mutate({ id: r.id, field: "thuoc_thieu_linh_kien", value: !r.thuoc_thieu_linh_kien })} />,
    },
    {
      key: "thuoc_tranh_chap",
      header: "Thuộc tranh chấp",
      render: (r) => <ToggleSwitch checked={!!r.thuoc_tranh_chap} onChange={() => toggleReason.mutate({ id: r.id, field: "thuoc_tranh_chap", value: !r.thuoc_tranh_chap })} />,
    },
  ];

  const lyDoChamColumns: Column<LyDoChamMuaLkRow>[] = [
    { key: "stt", header: "STT", render: (r) => <span className="text-xs text-[var(--ink-500)]">{r.stt}</span> },
    { key: "ten_ly_do", header: "Tên lý do", render: (r) => <span className="font-medium">{r.ten_ly_do}</span> },
    {
      key: "he_thong_su_dung",
      header: "Hệ thống sử dụng",
      render: (r) => (
        <div className="flex gap-1 flex-wrap">
          {r.he_thong_su_dung.includes("Mua hàng") && <span className="text-xs bg-[var(--ocean-100)] text-[var(--ocean-700)] rounded px-1.5 py-0.5">Mua hàng</span>}
          {r.he_thong_su_dung.includes("Bảo hành") && <span className="text-xs bg-[var(--teal-100)] text-[var(--teal-600)] rounded px-1.5 py-0.5">Bảo hành</span>}
        </div>
      ),
    },
    {
      key: "quan_ly_don_thieu_linh_kien",
      header: "Tự tạo ticket Thiếu LK",
      render: (r) => (
        <ToggleSwitch
          checked={!!r.quan_ly_don_thieu_linh_kien}
          onChange={() => toggleLyDoChamMutation.mutate({ id: r.id, field: "quan_ly_don_thieu_linh_kien", value: !r.quan_ly_don_thieu_linh_kien })}
        />
      ),
    },
    {
      key: "bat_tat",
      header: "Bật / Tắt",
      render: (r) => <ToggleSwitch checked={!!r.bat_tat} onChange={() => toggleLyDoChamMutation.mutate({ id: r.id, field: "bat_tat", value: !r.bat_tat })} />,
    },
    {
      key: "action",
      header: "",
      render: (r) => (
        <button className="text-xs text-[var(--ocean-600)] hover:underline" onClick={() => openEditLyDoCham(r)}>
          Sửa
        </button>
      ),
    },
  ];

  const phanLoaiColumns: Column<PhanLoaiTranhChapRow>[] = [
    { key: "ten_phan_loai", header: "Tên phân loại", render: (r) => <span className="font-medium">{r.ten_phan_loai}</span> },
    { key: "bat_tat", header: "Bật / Tắt", render: (r) => <ToggleSwitch checked={!!r.bat_tat} onChange={() => togglePhanLoai.mutate({ id: r.id, bat_tat: !r.bat_tat })} /> },
  ];

  const ketQuaColumns: Column<KetQuaXuLyTranhChapRow>[] = [
    { key: "ten_ket_qua", header: "Tên kết quả", render: (r) => <span className="font-medium">{r.ten_ket_qua}</span> },
    { key: "bat_tat", header: "Bật / Tắt", render: (r) => <ToggleSwitch checked={!!r.bat_tat} onChange={() => toggleKetQua.mutate({ id: r.id, bat_tat: !r.bat_tat })} /> },
  ];

  const loaiYeuCauBoQuaLapColumns: Column<LoaiYeuCauBoQuaLapRow>[] = [
    { key: "loai_yeu_cau", header: "Loại yêu cầu", render: (r) => <span className="font-medium">{r.loai_yeu_cau}</span> },
    {
      key: "bat_tat",
      header: "Đang bỏ qua",
      render: (r) => (
        <ToggleSwitch checked={!!r.bat_tat} onChange={() => toggleLoaiYeuCauBoQuaLap.mutate({ id: r.id, bat_tat: !r.bat_tat })} />
      ),
    },
    { key: "nguoi_cap_nhat", header: "Người cập nhật", render: (r) => <span className="text-xs">{r.nguoi_cap_nhat ? formatPersonDisplay(r.nguoi_cap_nhat, personDir) : "—"}</span> },
  ];

  const loaiYeuCauDoiTraColumns: Column<LoaiYeuCauDoiTraRow>[] = [
    { key: "loai_yeu_cau", header: "Loại yêu cầu", render: (r) => <span className="font-medium">{r.loai_yeu_cau}</span> },
    {
      key: "bat_tat",
      header: "Đang áp dụng",
      render: (r) => <ToggleSwitch checked={!!r.bat_tat} onChange={() => toggleLoaiYeuCauDoiTra.mutate({ id: r.id, bat_tat: !r.bat_tat })} />,
    },
    { key: "nguoi_cap_nhat", header: "Người cập nhật", render: (r) => <span className="text-xs">{r.nguoi_cap_nhat ? formatPersonDisplay(r.nguoi_cap_nhat, personDir) : "—"}</span> },
  ];

  const luuYLoiLinhKienDoiTraColumns: Column<LuuYLoiLinhKienDoiTraRow>[] = [
    { key: "luu_y_loi_linh_kien", header: "Lưu ý lỗi linh kiện", render: (r) => <span className="font-medium">{r.luu_y_loi_linh_kien}</span> },
    {
      key: "bat_tat",
      header: "Đang áp dụng",
      render: (r) => <ToggleSwitch checked={!!r.bat_tat} onChange={() => toggleLuuYLoiLinhKienDoiTra.mutate({ id: r.id, bat_tat: !r.bat_tat })} />,
    },
    { key: "nguoi_cap_nhat", header: "Người cập nhật", render: (r) => <span className="text-xs">{r.nguoi_cap_nhat ? formatPersonDisplay(r.nguoi_cap_nhat, personDir) : "—"}</span> },
  ];

  const greetingGifColumns: Column<GreetingGifRow>[] = [
    {
      key: "gif_url",
      header: "GIF",
      render: (r) => (
        <a href={r.gif_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[var(--ocean-600)] hover:underline">
          <img src={r.gif_url} alt="" className="w-10 h-10 object-cover rounded-md" />
          <span className="text-xs break-all">{r.gif_url}</span>
        </a>
      ),
    },
    { key: "bat_tat", header: "Bật / Tắt", render: (r) => <ToggleSwitch checked={!!r.bat_tat} onChange={() => toggleGreetingGif.mutate({ id: r.id, bat_tat: !r.bat_tat })} /> },
  ];

  const greetingMessageColumns: Column<GreetingMessageRow>[] = [
    { key: "noi_dung", header: "Nội dung", render: (r) => <span className="font-medium">{r.noi_dung}</span> },
    { key: "bat_tat", header: "Bật / Tắt", render: (r) => <ToggleSwitch checked={!!r.bat_tat} onChange={() => toggleGreetingMessage.mutate({ id: r.id, bat_tat: !r.bat_tat })} /> },
  ];

  const excludeNgayColumns: Column<GiaiTrinhExcludeNgayRow>[] = [
    { key: "ngay", header: "Ngày", render: (r) => <span className="font-mono font-medium">{r.ngay}</span> },
    {
      key: "khu_vuc",
      header: "Khu vực",
      render: (r) => (r.khu_vuc === "__ALL__" ? <span className="font-semibold text-[var(--coral-500)]">Tất cả khu vực</span> : shortKhuVuc(r.khu_vuc)),
    },
    { key: "ghi_chu", header: "Ghi chú", render: (r) => <span className="text-xs text-[var(--ink-600)]">{r.ghi_chu ?? "—"}</span> },
    { key: "nguoi_tao", header: "Người tạo", render: (r) => <span className="text-xs">{r.nguoi_tao ? formatPersonDisplay(r.nguoi_tao, personDir) : "—"}</span> },
    {
      key: "action",
      header: "",
      render: (r) => (
        <button className="text-xs text-[var(--coral-500)] hover:underline" onClick={() => deleteExcludeNgayMutation.mutate(r.id)}>
          Xóa
        </button>
      ),
    },
  ];

  const partnerKeyColumns: Column<PartnerApiKeyRow>[] = [
    { key: "ten_doi_tac", header: "Đối tác", render: (r) => <span className="font-medium">{r.ten_doi_tac}</span> },
    { key: "api_key", header: "API Key", render: (r) => <span className="font-mono text-xs">{r.api_key}</span> },
    {
      key: "active",
      header: "Trạng thái",
      render: (r) =>
        r.active ? (
          <span className="text-[var(--teal-500)] font-semibold">Đang hoạt động</span>
        ) : (
          <span className="text-[var(--coral-500)] font-semibold">Đã thu hồi</span>
        ),
    },
    { key: "ghi_chu", header: "Ghi chú", render: (r) => <span className="text-xs text-[var(--ink-600)]">{r.ghi_chu ?? "—"}</span> },
    {
      key: "created_at",
      header: "Ngày tạo",
      render: (r) => (
        <span className="text-xs text-[var(--ink-400)]">
          {r.created_at}
          {r.created_by ? ` · ${formatPersonDisplay(r.created_by, personDir)}` : ""}
        </span>
      ),
    },
    {
      key: "action",
      header: "",
      render: (r) => (
        <button
          className={r.active ? "text-xs text-[var(--coral-500)] hover:underline" : "text-xs text-[var(--ocean-600)] hover:underline"}
          onClick={() => togglePartnerKeyMutation.mutate({ id: r.id, active: !r.active })}
        >
          {r.active ? "Thu hồi" : "Cấp lại"}
        </button>
      ),
    },
  ];


  const ktvColumns: Column<KtvLienHeRow>[] = [
    { key: "ma_ktv", header: "Mã KTV", render: (r) => <span className="font-mono text-xs">{r.ma_ktv}</span> },
    { key: "ten_hien_thi", header: "Tên hiển thị", render: (r) => <span className="font-medium">{r.ten_hien_thi ?? "—"}</span> },
    { key: "sdt", header: "Số điện thoại", render: (r) => <span className="font-mono">{r.sdt ?? "—"}</span> },
    { key: "vai_tro_ktv", header: "Vai trò", render: (r) => <span className="text-xs">{r.vai_tro_ktv ?? "—"}</span> },
    { key: "gmail", header: "Gmail", render: (r) => <span className="text-xs">{r.gmail ?? "—"}</span> },
    { key: "giam_sat_quan_ly", header: "Giám sát", render: (r) => <span className="text-xs">{r.giam_sat_quan_ly ?? "—"}</span> },
    {
      key: "email_dang_nhap",
      header: "Tài khoản đăng nhập",
      render: (r) => (r.email_dang_nhap ? <span className="text-xs">{r.email_dang_nhap}</span> : <span className="text-xs text-[var(--ink-400)] italic">Chưa ghép</span>),
    },
    { key: "ghi_chu", header: "Ghi chú", render: (r) => <span className="text-xs text-[var(--ink-600)]">{r.ghi_chu ?? "—"}</span> },
    { key: "nguoi_cap_nhat", header: "Người cập nhật", render: (r) => <span className="text-xs">{r.nguoi_cap_nhat ? formatPersonDisplay(r.nguoi_cap_nhat, personDir) : "—"}</span> },
    { key: "ngay_cap_nhat", header: "Ngày cập nhật", render: (r) => <span className="text-xs">{r.ngay_cap_nhat}</span> },
    ...(KTV_LIST_LOCKED
      ? []
      : [
          {
            key: "action",
            header: "",
            className: "text-right whitespace-nowrap",
            render: (r: KtvLienHeRow) => (
              <div className="flex gap-2 justify-end">
                <button
                  className="text-xs text-[var(--ocean-600)] hover:underline"
                  onClick={() => {
                    setEditingKtvMa(r.ma_ktv);
                    setKtvForm({
                      ma_ktv: r.ma_ktv, ten_hien_thi: r.ten_hien_thi ?? "", sdt: r.sdt ?? "", ghi_chu: r.ghi_chu ?? "",
                      gmail: r.gmail ?? "", vai_tro_ktv: r.vai_tro_ktv ?? "", giam_sat_quan_ly: r.giam_sat_quan_ly ?? "", email_dang_nhap: r.email_dang_nhap ?? "",
                    });
                    setKtvModalOpen(true);
                  }}
                >
                  Sửa
                </button>
                <button className="text-xs text-[var(--coral-500)] hover:underline" onClick={() => deleteKtvMutation.mutate(r.ma_ktv)}>
                  Xóa
                </button>
              </div>
            ),
          } satisfies Column<KtvLienHeRow>,
        ]),
  ];

  return (
    <div className="anim-in">
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "ly-do", label: "Lý do chậm" },
          { key: "ktv-lien-he", label: "Danh sách KTV" },
          { key: "phan-loai-tranh-chap", label: "Phân loại tranh chấp" },
          { key: "ket-qua-xu-ly-tranh-chap", label: "Kết quả xử lý tranh chấp" },
          { key: "loai-yeu-cau-bo-qua-lap", label: "Bỏ qua đánh giá lặp" },
          { key: "theo-doi-doi-tra", label: "Theo dõi đổi trả" },
          { key: "loi-chao", label: "Lời chào" },
          { key: "giai-trinh-exclude-ngay", label: "Ngày loại trừ giải trình" },
          { key: "sheet-urls", label: "Link đồng bộ Google Sheet" },
          { key: "partner-keys", label: "API đối tác" },
          { key: "mua-hang", label: "Mua hàng" },
          { key: "google-drive", label: "Google Drive" },
        ]}
      />
      {tab === "google-drive" && (
        <div className="mt-4 max-w-xl">
          <Card>
            <div className="text-sm text-[var(--ink-600)] mb-3">
              Tài khoản Google được dùng để lưu ảnh linh kiện lên Drive. Ảnh sẽ thuộc dung lượng lưu trữ của chính tài khoản này (không phải Service Account —
              Service Account không có dung lượng lưu trữ riêng nên không thể tạo file).
            </div>
            {driveStatus?.connected ? (
              <div className="space-y-2">
                <div className="text-sm">
                  ✅ Đã kết nối: <b>{driveStatus.google_email}</b>
                </div>
                <div className="text-xs text-[var(--ink-500)]">
                  Kết nối bởi {driveStatus.authorized_by} lúc {driveStatus.authorized_at}
                </div>
                <Btn variant="ghost" size="sm" onClick={() => { window.location.href = "/api/settings/google-drive/authorize"; }}>
                  🔄 Kết nối lại (đổi tài khoản khác)
                </Btn>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-sm text-[var(--coral-600)]">⚠ Chưa kết nối — tải ảnh linh kiện sẽ báo lỗi cho đến khi kết nối.</div>
                <Btn size="sm" onClick={() => { window.location.href = "/api/settings/google-drive/authorize"; }}>
                  Kết nối tài khoản Google Drive
                </Btn>
              </div>
            )}
          </Card>
        </div>
      )}
      {tab === "ly-do" && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-[var(--ink-600)]">
              Cấu hình danh sách lý do chậm dùng khi giải trình ca tồn. Đánh dấu "Thuộc thiếu linh kiện" để đẩy ca vào module <b>Ca thiếu linh kiện</b>.
            </div>
            <div className="flex gap-2 shrink-0">
              <Btn
                variant="ghost"
                size="sm"
                onClick={() =>
                  exportRowsToExcel(reasons?.rows ?? [], "ly_do_cham.xlsx", "Data", {
                    id: "ID",
                    ten_ly_do: "Tên lý do",
                    bat_tat: "Bật / Tắt",
                    thuoc_thieu_linh_kien: "Thuộc thiếu linh kiện",
                    thuoc_tranh_chap: "Thuộc tranh chấp",
                  })
                }
              >
                ⬇ Xuất Excel
              </Btn>
              <Btn size="sm" onClick={() => setAddOpen(true)}>
                + Thêm lý do
              </Btn>
            </div>
          </div>
          <PaginatedTable
            columns={lyDoColumns}
            rows={(reasons?.rows ?? []).slice((lyDoPage - 1) * PAGE_SIZE, lyDoPage * PAGE_SIZE)}
            isLoading={false}
            isError={false}
            page={lyDoPage}
            pageSize={PAGE_SIZE}
            total={(reasons?.rows ?? []).length}
            onPageChange={setLyDoPage}
            rowKey={(r) => r.id}
            emptyText="Chưa có lý do chậm nào."
            storageKey="settings-ly-do"
          />
        </div>
      )}
      {tab === "ktv-lien-he" && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-[var(--ink-600)]">
              Danh sách KTV — số điện thoại hiển thị cạnh tên KTV ở các màn hình CSKH gọi khảo sát (CSKH vẫn tự thêm/sửa/xóa được bằng cách bấm vào tên KTV khi xem 1 ca). Vai trò/Gmail/Giám sát/Tài khoản đăng nhập chỉ dùng cho module "Đặt mua linh kiện".
              {KTV_LIST_LOCKED && (
                <div className="mt-1.5 text-[var(--amber-600)] font-medium">
                  🔒 Đã khoá thêm/sửa/xóa/nhập file tại đây — danh sách này được đồng bộ tự động (hàng giờ) từ hệ thống "Đặt mua linh kiện" độc lập. Chỉ xem/xuất Excel.
                </div>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <Btn
                variant="ghost"
                size="sm"
                onClick={() =>
                  exportRowsToExcel(ktvLienHe?.rows ?? [], "sdt_ky_thuat_vien.xlsx", "Data", {
                    ma_ktv: "Mã KTV",
                    ten_hien_thi: "Tên hiển thị",
                    sdt: "Số điện thoại",
                    ghi_chu: "Ghi chú",
                    gmail: "Gmail",
                    vai_tro_ktv: "Vai trò KTV",
                    giam_sat_quan_ly: "Giám sát quản lý",
                    email_dang_nhap: "Email đăng nhập",
                    nguoi_cap_nhat: "Người cập nhật",
                    ngay_cap_nhat: "Ngày cập nhật",
                  })
                }
              >
                ⬇ Xuất Excel
              </Btn>
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => backfillUsersMutation.mutate()}
                disabled={backfillUsersMutation.isPending}
                title='Cấp tài khoản trước cho KTV đã ghép "Email đăng nhập" nhưng chưa từng đăng nhập Google lần nào - giúp họ hiện ra trong danh sách "Người nhận hàng" ngay cả khi chưa đăng nhập'
              >
                {backfillUsersMutation.isPending ? "Đang cấp..." : "🔑 Cấp tài khoản trước cho KTV chưa đăng nhập"}
              </Btn>
              {!KTV_LIST_LOCKED && (
                <Btn
                  size="sm"
                  onClick={() => {
                    setEditingKtvMa(null);
                    setKtvForm({ ma_ktv: "", ten_hien_thi: "", sdt: "", ghi_chu: "", gmail: "", vai_tro_ktv: "", giam_sat_quan_ly: "", email_dang_nhap: "" });
                    setKtvModalOpen(true);
                  }}
                >
                  + Thêm SĐT
                </Btn>
              )}
            </div>
          </div>
          {!KTV_LIST_LOCKED && (
            <ImportUploader<KtvImportSummary>
              description={
                <>
                  Nhập hàng loạt KTV từ file Excel/CSV. Bắt buộc: <b className="font-mono">ma_ktv</b>. Tùy chọn: <b className="font-mono">sdt</b>, <b className="font-mono">ten_hien_thi</b>, <b className="font-mono">ghi_chu</b>, <b className="font-mono">gmail</b>, <b className="font-mono">vai_tro_ktv</b> (KTV/CTV/Tram/Ve tinh), <b className="font-mono">giam_sat_quan_ly</b>, <b className="font-mono">email_dang_nhap</b>. Mã KTV đã có sẽ được cập nhật — 4 cột cuối chỉ ghi đè nếu ô có giá trị.
                </>
              }
              templateUrl="/api/settings/ktv-lien-he/template"
              previewUrl="/settings/ktv-lien-he/import/preview"
              commitUrl="/settings/ktv-lien-he/import/commit"
              buildBody={(rows) => ({ rows })}
              renderSummary={(s) => (
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <StatCard label="Sẵn sàng ghi" value={s.thanhCong} tone="teal" />
                  <StatCard label="Dòng lỗi" value={s.loi} tone={s.loi > 0 ? "amber" : "gray"} />
                </div>
              )}
              getErrors={(s) => s.errors}
              successMessage={(s) => `Import thành công: ${s.thanhCong} SĐT kỹ thuật viên`}
              invalidateKeys={[KTV_PHONE_QUERY_KEY]}
            />
          )}
          <PaginatedTable
            columns={ktvColumns}
            rows={(ktvLienHe?.rows ?? []).slice((ktvPage - 1) * PAGE_SIZE, ktvPage * PAGE_SIZE)}
            isLoading={false}
            isError={false}
            page={ktvPage}
            pageSize={PAGE_SIZE}
            total={(ktvLienHe?.rows ?? []).length}
            onPageChange={setKtvPage}
            rowKey={(r) => r.ma_ktv}
            emptyText="Chưa có số điện thoại KTV nào."
            storageKey="settings-ktv-lien-he"
          />
        </div>
      )}

      {tab === "phan-loai-tranh-chap" && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-[var(--ink-600)]">
              Danh mục phân loại dùng khi KSNB Đối tác "Tiếp nhận" 1 ca tranh chấp (module <b>Tranh chấp, KN</b>).
            </div>
            <Btn size="sm" onClick={() => setAddPhanLoaiOpen(true)}>
              + Thêm phân loại
            </Btn>
          </div>
          <PaginatedTable
            columns={phanLoaiColumns}
            rows={(phanLoaiTranhChap?.rows ?? []).slice((phanLoaiPage - 1) * PAGE_SIZE, phanLoaiPage * PAGE_SIZE)}
            isLoading={false}
            isError={false}
            page={phanLoaiPage}
            pageSize={PAGE_SIZE}
            total={(phanLoaiTranhChap?.rows ?? []).length}
            onPageChange={setPhanLoaiPage}
            rowKey={(r) => r.id}
            emptyText="Chưa có phân loại tranh chấp nào."
            storageKey="settings-phan-loai-tranh-chap"
          />
        </div>
      )}

      {tab === "ket-qua-xu-ly-tranh-chap" && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-[var(--ink-600)]">
              Danh mục "Kết quả xử lý" bắt buộc chọn khi đóng 1 tiến trình tranh chấp với trạng thái "Đã kết thúc tranh chấp" (module <b>Tranh chấp, KN</b>).
            </div>
            <Btn size="sm" onClick={() => setAddKetQuaOpen(true)}>
              + Thêm kết quả
            </Btn>
          </div>
          <PaginatedTable
            columns={ketQuaColumns}
            rows={(ketQuaXuLyTranhChap?.rows ?? []).slice((ketQuaPage - 1) * PAGE_SIZE, ketQuaPage * PAGE_SIZE)}
            isLoading={false}
            isError={false}
            page={ketQuaPage}
            pageSize={PAGE_SIZE}
            total={(ketQuaXuLyTranhChap?.rows ?? []).length}
            onPageChange={setKetQuaPage}
            rowKey={(r) => r.id}
            emptyText="Chưa có kết quả xử lý nào."
            storageKey="settings-ket-qua-xu-ly-tranh-chap"
          />
        </div>
      )}

      {tab === "loai-yeu-cau-bo-qua-lap" && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-[var(--ink-600)]">
              Case có "Loại yêu cầu" trong danh sách này (vd: Dán tem, poster siêu thị…) sẽ được loại hoàn toàn khỏi phạm vi xét <b>Ca lặp</b> — không tính vào "cần rà soát" và không tham gia ghép cặp lặp, giống điều kiện "Hình thức bảo hành ≠ Gọi điện tư vấn" có sẵn.
            </div>
            <Btn size="sm" onClick={() => setAddLoaiYeuCauBoQuaLapOpen(true)}>
              + Thêm loại yêu cầu
            </Btn>
          </div>
          <PaginatedTable
            columns={loaiYeuCauBoQuaLapColumns}
            rows={(loaiYeuCauBoQuaLap?.rows ?? []).slice((loaiYeuCauBoQuaLapPage - 1) * PAGE_SIZE, loaiYeuCauBoQuaLapPage * PAGE_SIZE)}
            isLoading={false}
            isError={false}
            page={loaiYeuCauBoQuaLapPage}
            pageSize={PAGE_SIZE}
            total={(loaiYeuCauBoQuaLap?.rows ?? []).length}
            onPageChange={setLoaiYeuCauBoQuaLapPage}
            rowKey={(r) => r.id}
            emptyText="Chưa có loại yêu cầu nào bị bỏ qua."
            storageKey="settings-loai-yeu-cau-bo-qua-lap"
          />
        </div>
      )}

      {tab === "theo-doi-doi-tra" && (
        <div className="mt-4">
          <div className="text-sm text-[var(--ink-600)] mb-4">
            Tab "Theo dõi đổi trả" (module Tranh chấp, KN) tự động phát hiện case đủ ĐỒNG THỜI 2 điều kiện dưới đây (AND) khi import — "Loại yêu cầu" thuộc danh sách 1 <b>và</b> "Lưu ý lỗi linh kiện" thuộc danh sách 2. Chỉ giá trị đang <b>bật</b> mới tính vào điều kiện.
          </div>
          <div className="flex items-center gap-2 mb-4">
            <Btn size="sm" variant={ddSettingsSub === "loai-yeu-cau" ? "primary" : "ghost"} onClick={() => setDdSettingsSub("loai-yeu-cau")}>
              Loại yêu cầu
            </Btn>
            <Btn size="sm" variant={ddSettingsSub === "luu-y-loi-linh-kien" ? "primary" : "ghost"} onClick={() => setDdSettingsSub("luu-y-loi-linh-kien")}>
              Lưu ý lỗi linh kiện
            </Btn>
          </div>
          {ddSettingsSub === "loai-yeu-cau" ? (
            <>
              <div className="flex items-center justify-end mb-3">
                <Btn size="sm" onClick={() => setAddLoaiYeuCauDoiTraOpen(true)}>
                  + Thêm loại yêu cầu
                </Btn>
              </div>
              <PaginatedTable
                columns={loaiYeuCauDoiTraColumns}
                rows={(loaiYeuCauDoiTra?.rows ?? []).slice((loaiYeuCauDoiTraPage - 1) * PAGE_SIZE, loaiYeuCauDoiTraPage * PAGE_SIZE)}
                isLoading={false}
                isError={false}
                page={loaiYeuCauDoiTraPage}
                pageSize={PAGE_SIZE}
                total={(loaiYeuCauDoiTra?.rows ?? []).length}
                onPageChange={setLoaiYeuCauDoiTraPage}
                rowKey={(r) => r.id}
                emptyText="Chưa có loại yêu cầu nào."
                storageKey="settings-loai-yeu-cau-doi-tra"
              />
            </>
          ) : (
            <>
              <div className="flex items-center justify-end mb-3">
                <Btn size="sm" onClick={() => setAddLuuYLoiLinhKienDoiTraOpen(true)}>
                  + Thêm giá trị
                </Btn>
              </div>
              <PaginatedTable
                columns={luuYLoiLinhKienDoiTraColumns}
                rows={(luuYLoiLinhKienDoiTra?.rows ?? []).slice((luuYLoiLinhKienDoiTraPage - 1) * PAGE_SIZE, luuYLoiLinhKienDoiTraPage * PAGE_SIZE)}
                isLoading={false}
                isError={false}
                page={luuYLoiLinhKienDoiTraPage}
                pageSize={PAGE_SIZE}
                total={(luuYLoiLinhKienDoiTra?.rows ?? []).length}
                onPageChange={setLuuYLoiLinhKienDoiTraPage}
                rowKey={(r) => r.id}
                emptyText="Chưa có giá trị nào."
                storageKey="settings-luu-y-loi-linh-kien-doi-tra"
              />
            </>
          )}
        </div>
      )}

      {tab === "loi-chao" && (
        <div className="mt-4 space-y-6">
          <div className="text-sm text-[var(--ink-600)]">
            Popup chào mừng ngẫu nhiên hiện khi đăng nhập/mở lại web — mỗi lần hiện, hệ thống chọn ngẫu nhiên 1 GIF và 1 lời chào đang <b>bật</b> trong 2 danh sách dưới đây.
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold">Danh sách GIF</div>
              <Btn size="sm" onClick={() => setAddGreetingGifOpen(true)}>
                + Thêm GIF
              </Btn>
            </div>
            <PaginatedTable
              columns={greetingGifColumns}
              rows={(greetingGifs?.rows ?? []).slice((greetingGifPage - 1) * PAGE_SIZE, greetingGifPage * PAGE_SIZE)}
              isLoading={false}
              isError={false}
              page={greetingGifPage}
              pageSize={PAGE_SIZE}
              total={(greetingGifs?.rows ?? []).length}
              onPageChange={setGreetingGifPage}
              rowKey={(r) => r.id}
              emptyText="Chưa có GIF nào."
              storageKey="settings-greeting-gif"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold">Danh sách lời chào</div>
              <Btn size="sm" onClick={() => setAddGreetingMessageOpen(true)}>
                + Thêm lời chào
              </Btn>
            </div>
            <PaginatedTable
              columns={greetingMessageColumns}
              rows={(greetingMessages?.rows ?? []).slice((greetingMessagePage - 1) * PAGE_SIZE, greetingMessagePage * PAGE_SIZE)}
              isLoading={false}
              isError={false}
              page={greetingMessagePage}
              pageSize={PAGE_SIZE}
              total={(greetingMessages?.rows ?? []).length}
              onPageChange={setGreetingMessagePage}
              rowKey={(r) => r.id}
              emptyText="Chưa có lời chào nào."
              storageKey="settings-greeting-message"
            />
          </div>
        </div>
      )}

      {tab === "giai-trinh-exclude-ngay" && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3 gap-3">
            <div className="text-sm text-[var(--ink-600)]">
              Danh sách ngày <b>không tính</b> vào lũy kế/tỷ lệ giải trình tháng của "Quản lý tồn" (bảng "Báo cáo tồn theo khu vực" và "Tỷ lệ giải trình theo ngày"). <b>Mọi Chủ nhật đã tự động bị loại trừ</b>, không
              cần thêm ở đây — chỉ thêm các ngày khác (vd nghỉ lễ).
            </div>
            <Btn size="sm" onClick={() => setAddExcludeNgayOpen(true)}>
              + Thêm ngày loại trừ
            </Btn>
          </div>
          <PaginatedTable
            columns={excludeNgayColumns}
            rows={excludeNgayRows?.rows ?? []}
            isLoading={false}
            isError={false}
            page={1}
            pageSize={(excludeNgayRows?.rows ?? []).length || 1}
            total={(excludeNgayRows?.rows ?? []).length}
            onPageChange={() => {}}
            rowKey={(r) => r.id}
            emptyText="Chưa có ngày loại trừ nào ngoài Chủ nhật."
            storageKey="settings-giai-trinh-exclude-ngay"
          />
        </div>
      )}

      {tab === "sheet-urls" && (
        <Card className="p-4">
          <div className="text-sm text-[var(--ink-600)] mb-4">
            Cấu hình link Google Sheet (dạng "Xuất bản lên web" → TSV) dùng để đồng bộ tự động cho từng loại dữ liệu. Để trống nếu chưa cần dùng loại đồng bộ đó — nút "Đồng bộ" tương ứng
            sẽ ẩn cho tới khi có link.
          </div>
          <div className="space-y-3">
            {(sheetUrls?.rows ?? []).map((row) => {
              const currentValue = editingUrls[row.loai_dong_bo] ?? row.url ?? "";
              return (
                <div key={row.loai_dong_bo} className="border border-[var(--line)] rounded-xl p-3">
                  <div className="font-semibold text-sm mb-1.5">{LOAI_DONG_BO_LABELS[row.loai_dong_bo] ?? row.loai_dong_bo}</div>
                  <div className="flex gap-2">
                    <input
                      value={currentValue}
                      onChange={(e) => setEditingUrls({ ...editingUrls, [row.loai_dong_bo]: e.target.value })}
                      placeholder="https://docs.google.com/spreadsheets/.../pub?...&output=tsv"
                      className="focus-ring flex-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-xs font-mono"
                    />
                    <Btn size="sm" onClick={() => saveUrlMutation.mutate({ loai: row.loai_dong_bo, url: currentValue.trim() })} disabled={saveUrlMutation.isPending}>
                      Lưu
                    </Btn>
                  </div>
                  {row.url && (
                    <div className="text-xs text-[var(--ink-400)] mt-1.5">
                      Cập nhật lần cuối: {row.updated_at}
                      {row.updated_by ? ` bởi ${row.updated_by}` : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {tab === "partner-keys" && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3 gap-3">
            <div className="text-sm text-[var(--ink-600)]">
              Key cấp cho đối tác bên ngoài để tự động quét dữ liệu CRM qua <code>GET /api/partner/cases</code> (xem <b>PARTNER_API_GUIDE.md</b>). Mỗi key hiện đầy đủ
              <b> đúng 1 lần</b> ngay sau khi tạo — sau đó chỉ còn xem được bản che.
            </div>
            <Btn size="sm" onClick={() => setAddPartnerKeyOpen(true)}>
              + Cấp key mới
            </Btn>
          </div>
          <PaginatedTable
            columns={partnerKeyColumns}
            rows={(partnerKeys?.rows ?? []).slice((partnerKeyPage - 1) * PAGE_SIZE, partnerKeyPage * PAGE_SIZE)}
            isLoading={false}
            isError={false}
            page={partnerKeyPage}
            pageSize={PAGE_SIZE}
            total={(partnerKeys?.rows ?? []).length}
            onPageChange={setPartnerKeyPage}
            rowKey={(r) => r.id}
            emptyText="Chưa cấp key nào cho đối tác."
            storageKey="settings-partner-keys"
          />
        </div>
      )}

      {tab === "mua-hang" && (
        <div className="mt-4">
          <div className="flex gap-1 border-b border-[var(--line)] mb-4">
            {(
              [
                { key: "ly-do-cham", label: "Lý do chậm (Đặt mua LK)" },
                { key: "loai-de-xuat", label: "Loại đề xuất" },
              ] as const
            ).map((s) => (
              <button
                key={s.key}
                onClick={() => setMuaHangSub(s.key)}
                className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                  muaHangSub === s.key ? "border-[var(--ocean-500)] text-[var(--ocean-600)]" : "border-transparent text-[var(--ink-500)] hover:text-[var(--ink-700)]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {muaHangSub === "ly-do-cham" && (
            <div>
              <div className="flex items-center justify-between mb-3 gap-3">
                <div className="text-sm text-[var(--ink-600)]">
                  Danh sách lý do chậm dùng khi tác nghiệp (TN) bấm "Chờ hàng"/"Từ chối" trên 1 dòng đơn đặt mua linh kiện. "Hệ thống sử dụng" quyết định lý do có hiện ra
                  hay không tuỳ luồng (hiện chỉ luồng Mua hàng đang dùng). Bật "Tự tạo ticket Thiếu LK" để chọn lý do đó tự động chuyển dòng sang trạng thái{" "}
                  <b>Chờ hàng</b> + tạo phiếu bên module <b>Ca thiếu linh kiện</b>; tắt thì chọn lý do đó là từ chối thường (<b>TN từ chối</b>).
                </div>
                <Btn size="sm" onClick={openAddLyDoCham}>
                  + Thêm lý do
                </Btn>
              </div>
              <PaginatedTable
                columns={lyDoChamColumns}
                rows={(lyDoChamRows?.rows ?? []).slice((lyDoChamPage - 1) * PAGE_SIZE, lyDoChamPage * PAGE_SIZE)}
                isLoading={false}
                isError={false}
                page={lyDoChamPage}
                pageSize={PAGE_SIZE}
                total={(lyDoChamRows?.rows ?? []).length}
                onPageChange={setLyDoChamPage}
                rowKey={(r) => r.id}
                emptyText="Chưa có lý do chậm nào."
                storageKey="settings-ly-do-cham"
              />
            </div>
          )}
          {muaHangSub === "loai-de-xuat" && (
            <div className="space-y-6">
          <div className="flex items-center justify-between mb-1 gap-3">
            <div className="text-sm text-[var(--ink-600)]">
              Danh sách loại đề xuất dùng khi tạo phiếu đặt mua linh kiện. Mỗi nhóm có thể gán cho nhiều vai trò/flag khác nhau.
            </div>
            <Btn size="sm" onClick={() => { setEditingNhomId(null); setNhomForm({ ten_nhom: "", vai_tro_flags: [], bat_tat: true }); setLdeNhomOpen(true); }}>
              + Thêm nhóm
            </Btn>
          </div>
          {(ldeNhomData?.rows ?? []).map((nhom) => {
            const nhomOptions = (ldeOptionsData?.rows ?? []).filter((o) => o.nhom_id === nhom.id).sort((a, b) => a.stt - b.stt || a.id - b.id);
            let flags: string[] = [];
            try { flags = JSON.parse(nhom.vai_tro_json || "[]"); } catch { flags = []; }
            const flagLabels = flags.map((f) => LDE_VAI_TRO_FLAGS.find((x) => x.flag === f)?.label ?? f);
            return (
              <Card key={nhom.id} className="p-4">
                <div className="flex items-center justify-between mb-3 gap-3">
                  <div>
                    <span className="font-semibold text-sm">{nhom.ten_nhom}</span>
                    {!nhom.bat_tat && <span className="ml-2 text-xs text-[var(--coral-500)] font-semibold">[Đã tắt]</span>}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {flagLabels.map((l) => (
                        <span key={l} className="inline-block text-xs bg-[var(--ocean-50)] text-[var(--ocean-600)] border border-[var(--ocean-200)] rounded px-1.5 py-0.5">{l}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Btn variant="ghost" size="sm" onClick={() => {
                      setEditingNhomId(nhom.id);
                      setNhomForm({ ten_nhom: nhom.ten_nhom, vai_tro_flags: flags, bat_tat: !!nhom.bat_tat });
                      setLdeNhomOpen(true);
                    }}>Sửa nhóm</Btn>
                    <Btn size="sm" onClick={() => {
                      setEditingOptionId(null);
                      setOptionNhomId(nhom.id);
                      setOptionForm({ ten_option: "", stt: String(nhomOptions.length), bat_tat: true });
                      setLdeOptionOpen(true);
                    }}>+ Option</Btn>
                  </div>
                </div>
                {nhomOptions.length === 0 ? (
                  <div className="text-xs text-[var(--ink-400)] italic">Chưa có option nào trong nhóm này.</div>
                ) : (
                  <div className="border border-[var(--line)] rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--surface-2)] text-xs text-[var(--ink-500)]">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold">Tên option</th>
                          <th className="text-center px-3 py-2 font-semibold w-16">STT</th>
                          <th className="text-center px-3 py-2 font-semibold w-20">Bật/Tắt</th>
                          <th className="px-3 py-2 w-20"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {nhomOptions.map((opt) => (
                          <tr key={opt.id} className="border-t border-[var(--line)]">
                            <td className="px-3 py-2">
                              <span className={opt.bat_tat ? "font-medium" : "text-[var(--ink-400)] line-through"}>{opt.ten_option}</span>
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-[var(--ink-500)]">{opt.stt}</td>
                            <td className="px-3 py-2 text-center">
                              <ToggleSwitch
                                checked={!!opt.bat_tat}
                                onChange={() =>
                                  api.patch(`/settings/loai-de-xuat/${opt.id}`, { bat_tat: !opt.bat_tat }).then(() => {
                                    addToast(opt.bat_tat ? "Đã tắt option" : "Đã bật option");
                                    qc.invalidateQueries({ queryKey: ["settings-lde-options"] });
                                  })
                                }
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex justify-end gap-2">
                                <button className="text-xs text-[var(--ocean-600)] hover:underline" onClick={() => {
                                  setEditingOptionId(opt.id);
                                  setOptionNhomId(opt.nhom_id);
                                  setOptionForm({ ten_option: opt.ten_option, stt: String(opt.stt), bat_tat: !!opt.bat_tat });
                                  setLdeOptionOpen(true);
                                }}>Sửa</button>
                                <button className="text-xs text-[var(--coral-500)] hover:underline" onClick={() => deleteOptionMutation.mutate(opt.id)}>Xóa</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
          {(ldeNhomData?.rows ?? []).length === 0 && (
            <div className="text-sm text-[var(--ink-400)] italic">Chưa có nhóm loại đề xuất nào. Nhấn "+ Thêm nhóm" để bắt đầu.</div>
          )}
            </div>
          )}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Thêm lý do chậm mới">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Tên lý do</label>
            <input value={newReason.ten} onChange={(e) => setNewReason({ ...newReason, ten: e.target.value })} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={newReason.thieu} onChange={(e) => setNewReason({ ...newReason, thieu: e.target.checked })} /> Thuộc nhóm thiếu linh kiện
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={newReason.tranhChap} onChange={(e) => setNewReason({ ...newReason, tranhChap: e.target.checked })} /> Thuộc nhóm tranh chấp
          </label>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setAddOpen(false)}>
              Hủy
            </Btn>
            <Btn onClick={() => addReasonMutation.mutate()} disabled={!newReason.ten.trim() || addReasonMutation.isPending}>
              Thêm
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={addPhanLoaiOpen} onClose={() => setAddPhanLoaiOpen(false)} title="Thêm phân loại tranh chấp mới">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Tên phân loại</label>
            <input
              value={newPhanLoai}
              onChange={(e) => setNewPhanLoai(e.target.value)}
              placeholder="Vd: Đổi trả, Khiếu nại…"
              className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setAddPhanLoaiOpen(false)}>
              Hủy
            </Btn>
            <Btn onClick={() => addPhanLoaiMutation.mutate()} disabled={!newPhanLoai.trim() || addPhanLoaiMutation.isPending}>
              Thêm
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={addKetQuaOpen} onClose={() => setAddKetQuaOpen(false)} title="Thêm kết quả xử lý tranh chấp mới">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Tên kết quả</label>
            <input
              value={newKetQua}
              onChange={(e) => setNewKetQua(e.target.value)}
              placeholder="Vd: Đã xử lý dứt điểm, Đã tư vấn…"
              className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setAddKetQuaOpen(false)}>
              Hủy
            </Btn>
            <Btn onClick={() => addKetQuaMutation.mutate()} disabled={!newKetQua.trim() || addKetQuaMutation.isPending}>
              Thêm
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal
        open={addLoaiYeuCauBoQuaLapOpen}
        onClose={() => {
          setAddLoaiYeuCauBoQuaLapOpen(false);
          setNewLoaiYeuCauBoQuaLap("");
        }}
        title="Thêm loại yêu cầu bỏ qua đánh giá lặp"
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Loại yêu cầu</label>
            <div className="mt-1">
              <Select
                value={newLoaiYeuCauBoQuaLap}
                onChange={setNewLoaiYeuCauBoQuaLap}
                className="w-full"
                options={[
                  { value: "", label: "-- Chọn loại yêu cầu --" },
                  ...(loaiYeuCauGoiY?.rows ?? [])
                    .filter((lyc) => !(loaiYeuCauBoQuaLap?.rows ?? []).some((r) => r.loai_yeu_cau === lyc))
                    .map((lyc) => ({ value: lyc, label: lyc })),
                ]}
              />
            </div>
            <div className="text-xs text-[var(--ink-400)] mt-1">Danh sách lấy từ các giá trị "Loại yêu cầu" đã từng xuất hiện trong dữ liệu import.</div>
          </div>
          <div className="flex justify-end gap-2">
            <Btn
              variant="ghost"
              onClick={() => {
                setAddLoaiYeuCauBoQuaLapOpen(false);
                setNewLoaiYeuCauBoQuaLap("");
              }}
            >
              Hủy
            </Btn>
            <Btn onClick={() => addLoaiYeuCauBoQuaLapMutation.mutate()} disabled={!newLoaiYeuCauBoQuaLap.trim() || addLoaiYeuCauBoQuaLapMutation.isPending}>
              Thêm
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal
        open={addLoaiYeuCauDoiTraOpen}
        onClose={() => {
          setAddLoaiYeuCauDoiTraOpen(false);
          setNewLoaiYeuCauDoiTra("");
        }}
        title="Thêm loại yêu cầu (Theo dõi đổi trả)"
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Loại yêu cầu</label>
            <div className="mt-1">
              <Select
                value={newLoaiYeuCauDoiTra}
                onChange={setNewLoaiYeuCauDoiTra}
                className="w-full"
                options={[
                  { value: "", label: "-- Chọn loại yêu cầu --" },
                  ...(loaiYeuCauDoiTraGoiY?.rows ?? [])
                    .filter((lyc) => !(loaiYeuCauDoiTra?.rows ?? []).some((r) => r.loai_yeu_cau === lyc))
                    .map((lyc) => ({ value: lyc, label: lyc })),
                ]}
              />
            </div>
            <div className="text-xs text-[var(--ink-400)] mt-1">Danh sách lấy từ các giá trị "Loại yêu cầu" đã từng xuất hiện trong dữ liệu import.</div>
          </div>
          <div className="flex justify-end gap-2">
            <Btn
              variant="ghost"
              onClick={() => {
                setAddLoaiYeuCauDoiTraOpen(false);
                setNewLoaiYeuCauDoiTra("");
              }}
            >
              Hủy
            </Btn>
            <Btn onClick={() => addLoaiYeuCauDoiTraMutation.mutate()} disabled={!newLoaiYeuCauDoiTra.trim() || addLoaiYeuCauDoiTraMutation.isPending}>
              Thêm
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal
        open={addLuuYLoiLinhKienDoiTraOpen}
        onClose={() => {
          setAddLuuYLoiLinhKienDoiTraOpen(false);
          setNewLuuYLoiLinhKienDoiTra("");
        }}
        title="Thêm giá trị (Lưu ý lỗi linh kiện — Theo dõi đổi trả)"
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Lưu ý lỗi linh kiện</label>
            <div className="mt-1">
              <Select
                value={newLuuYLoiLinhKienDoiTra}
                onChange={setNewLuuYLoiLinhKienDoiTra}
                className="w-full"
                options={[
                  { value: "", label: "-- Chọn giá trị --" },
                  ...(luuYLoiLinhKienDoiTraGoiY?.rows ?? [])
                    .filter((lyc) => !(luuYLoiLinhKienDoiTra?.rows ?? []).some((r) => r.luu_y_loi_linh_kien === lyc))
                    .map((lyc) => ({ value: lyc, label: lyc })),
                ]}
              />
            </div>
            <div className="text-xs text-[var(--ink-400)] mt-1">Danh sách lấy từ các giá trị "Lưu ý lỗi linh kiện" đã từng xuất hiện trong dữ liệu import.</div>
          </div>
          <div className="flex justify-end gap-2">
            <Btn
              variant="ghost"
              onClick={() => {
                setAddLuuYLoiLinhKienDoiTraOpen(false);
                setNewLuuYLoiLinhKienDoiTra("");
              }}
            >
              Hủy
            </Btn>
            <Btn onClick={() => addLuuYLoiLinhKienDoiTraMutation.mutate()} disabled={!newLuuYLoiLinhKienDoiTra.trim() || addLuuYLoiLinhKienDoiTraMutation.isPending}>
              Thêm
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={addGreetingGifOpen} onClose={() => setAddGreetingGifOpen(false)} title="Thêm GIF chào mừng mới">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Link GIF trực tiếp</label>
            <input
              value={newGreetingGif}
              onChange={(e) => setNewGreetingGif(e.target.value)}
              placeholder="Vd: https://media1.tenor.com/m/xxxx/ten-file.gif"
              className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
            <div className="text-xs text-[var(--ink-400)] mt-1">Cần là link ảnh trực tiếp (đuôi .gif), không phải link trang xem của Tenor/Giphy.</div>
          </div>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setAddGreetingGifOpen(false)}>
              Hủy
            </Btn>
            <Btn onClick={() => addGreetingGifMutation.mutate()} disabled={!newGreetingGif.trim() || addGreetingGifMutation.isPending}>
              Thêm
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={addGreetingMessageOpen} onClose={() => setAddGreetingMessageOpen(false)} title="Thêm lời chào mới">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Nội dung lời chào</label>
            <input
              value={newGreetingMessage}
              onChange={(e) => setNewGreetingMessage(e.target.value)}
              placeholder="Vd: Chào bạn! Rất vui vì lại được đồng hành cùng bạn hôm nay."
              className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setAddGreetingMessageOpen(false)}>
              Hủy
            </Btn>
            <Btn onClick={() => addGreetingMessageMutation.mutate()} disabled={!newGreetingMessage.trim() || addGreetingMessageMutation.isPending}>
              Thêm
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={addExcludeNgayOpen} onClose={() => setAddExcludeNgayOpen(false)} title="Thêm ngày loại trừ">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Ngày</label>
            <input
              type="date"
              value={newExcludeNgay.ngay}
              onChange={(e) => setNewExcludeNgay((s) => ({ ...s, ngay: e.target.value }))}
              className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-medium mb-2">
              <input
                type="checkbox"
                checked={newExcludeNgay.toanBo}
                onChange={(e) => setNewExcludeNgay((s) => ({ ...s, toanBo: e.target.checked, khuVucList: [] }))}
              />
              Tất cả khu vực
            </label>
            {!newExcludeNgay.toanBo && (
              <div className="max-h-48 overflow-y-auto border border-[var(--line)] rounded-lg p-2 space-y-1">
                {(dashboardFilters?.khuVuc ?? []).map((kv) => (
                  <label key={kv} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newExcludeNgay.khuVucList.includes(kv)}
                      onChange={(e) =>
                        setNewExcludeNgay((s) => ({
                          ...s,
                          khuVucList: e.target.checked ? [...s.khuVucList, kv] : s.khuVucList.filter((x) => x !== kv),
                        }))
                      }
                    />
                    {kv}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Ghi chú (tùy chọn)</label>
            <input
              value={newExcludeNgay.ghiChu}
              onChange={(e) => setNewExcludeNgay((s) => ({ ...s, ghiChu: e.target.value }))}
              placeholder="Vd: Nghỉ lễ Quốc khánh"
              className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setAddExcludeNgayOpen(false)}>
              Hủy
            </Btn>
            <Btn
              onClick={() => addExcludeNgayMutation.mutate()}
              disabled={!newExcludeNgay.ngay || (!newExcludeNgay.toanBo && newExcludeNgay.khuVucList.length === 0) || addExcludeNgayMutation.isPending}
            >
              Thêm
            </Btn>
          </div>
        </div>
      </Modal>


      <Modal
        open={ktvModalOpen}
        onClose={() => {
          setKtvModalOpen(false);
          setEditingKtvMa(null);
        }}
        title={editingKtvMa ? "Sửa KTV" : "Thêm KTV"}
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Mã KTV *</label>
            <input
              value={ktvForm.ma_ktv}
              onChange={(e) => setKtvForm({ ...ktvForm, ma_ktv: e.target.value })}
              disabled={!!editingKtvMa}
              placeholder="Vd: huannt.mb"
              className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm disabled:bg-slate-50 disabled:text-[var(--ink-400)]"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Tên hiển thị</label>
            <input value={ktvForm.ten_hien_thi} onChange={(e) => setKtvForm({ ...ktvForm, ten_hien_thi: e.target.value })} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Số điện thoại</label>
            <input value={ktvForm.sdt} onChange={(e) => setKtvForm({ ...ktvForm, sdt: e.target.value })} placeholder="09xxxxxxxx" className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
          </div>
          <div className="border-t border-[var(--line)] pt-3">
            <div className="text-xs font-semibold text-[var(--ink-400)] mb-2">Dùng cho module "Đặt mua linh kiện" (chỉ Admin sửa)</div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[var(--ink-400)]">Vai trò</label>
                <Select
                  value={ktvForm.vai_tro_ktv}
                  onChange={(v) => setKtvForm({ ...ktvForm, vai_tro_ktv: v })}
                  options={[
                    { value: "", label: "-- Chưa phân loại --" },
                    { value: "KTV", label: "KTV" },
                    { value: "CTV", label: "CTV" },
                    { value: "Tram", label: "Trạm" },
                    { value: "Ve tinh", label: "Vệ tinh" },
                  ]}
                  className="w-full mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--ink-400)]">Gmail</label>
                <input value={ktvForm.gmail} onChange={(e) => setKtvForm({ ...ktvForm, gmail: e.target.value })} placeholder="vd: nguyenvana@gmail.com" className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--ink-400)]">Email Giám sát phụ trách</label>
                <input value={ktvForm.giam_sat_quan_ly} onChange={(e) => setKtvForm({ ...ktvForm, giam_sat_quan_ly: e.target.value })} placeholder="Email tài khoản Giám sát" className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--ink-400)]">Tài khoản đăng nhập đã ghép (nếu có)</label>
                <input value={ktvForm.email_dang_nhap} onChange={(e) => setKtvForm({ ...ktvForm, email_dang_nhap: e.target.value })} placeholder="Email tài khoản đã đăng nhập hệ thống" className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Ghi chú</label>
            <textarea value={ktvForm.ghi_chu} onChange={(e) => setKtvForm({ ...ktvForm, ghi_chu: e.target.value })} rows={2} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
          </div>
          <div className="flex justify-end gap-2">
            <Btn
              variant="ghost"
              onClick={() => {
                setKtvModalOpen(false);
                setEditingKtvMa(null);
              }}
            >
              Hủy
            </Btn>
            <Btn onClick={() => saveKtvMutation.mutate()} disabled={!ktvForm.ma_ktv.trim() || saveKtvMutation.isPending}>
              {editingKtvMa ? "Lưu" : "Thêm"}
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={addPartnerKeyOpen} onClose={() => setAddPartnerKeyOpen(false)} title="Cấp key API cho đối tác mới">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Tên đối tác</label>
            <input
              value={newPartnerKey.tenDoiTac}
              onChange={(e) => setNewPartnerKey({ ...newPartnerKey, tenDoiTac: e.target.value })}
              placeholder="Vd: Đối tác XYZ"
              className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Ghi chú (tùy chọn)</label>
            <input
              value={newPartnerKey.ghiChu}
              onChange={(e) => setNewPartnerKey({ ...newPartnerKey, ghiChu: e.target.value })}
              placeholder="Vd: Dùng cho hệ thống đối soát nội bộ của đối tác"
              className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setAddPartnerKeyOpen(false)}>
              Hủy
            </Btn>
            <Btn onClick={() => addPartnerKeyMutation.mutate()} disabled={!newPartnerKey.tenDoiTac.trim() || addPartnerKeyMutation.isPending}>
              Tạo key
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={!!createdPartnerKey} onClose={() => setCreatedPartnerKey(null)} title="Đã tạo key mới">
        {createdPartnerKey && (
          <div className="space-y-3">
            <div className="text-sm text-[var(--ink-600)]">
              Key cho đối tác <b>{createdPartnerKey.tenDoiTac}</b> — sao chép và gửi cho đối tác ngay, hệ thống <b>sẽ không hiển thị lại</b> key này sau khi đóng cửa sổ này.
            </div>
            <div className="flex gap-2">
              <input readOnly value={createdPartnerKey.apiKey} className="focus-ring flex-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-xs font-mono" />
              <Btn
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(createdPartnerKey.apiKey);
                  addToast("Đã sao chép key");
                }}
              >
                Sao chép
              </Btn>
            </div>
            <div className="flex justify-end">
              <Btn variant="ghost" onClick={() => setCreatedPartnerKey(null)}>
                Đóng
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={ldeNhomOpen} onClose={() => { setLdeNhomOpen(false); setEditingNhomId(null); }} title={editingNhomId ? "Sửa nhóm loại đề xuất" : "Thêm nhóm loại đề xuất"}>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Tên nhóm</label>
            <input
              value={nhomForm.ten_nhom}
              onChange={(e) => setNhomForm({ ...nhomForm, ten_nhom: e.target.value })}
              placeholder="Vd: KTV & Vệ tinh"
              className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)] block mb-2">Vai trò / flag được dùng nhóm này</label>
            <div className="border border-[var(--line)] rounded-lg p-2 space-y-1 max-h-52 overflow-y-auto">
              {LDE_VAI_TRO_FLAGS.map(({ flag, label }) => (
                <label key={flag} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={nhomForm.vai_tro_flags.includes(flag)}
                    onChange={(e) =>
                      setNhomForm((s) => ({
                        ...s,
                        vai_tro_flags: e.target.checked ? [...s.vai_tro_flags, flag] : s.vai_tro_flags.filter((f) => f !== flag),
                      }))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={nhomForm.bat_tat} onChange={(e) => setNhomForm({ ...nhomForm, bat_tat: e.target.checked })} />
            Nhóm đang bật
          </label>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => { setLdeNhomOpen(false); setEditingNhomId(null); }}>Hủy</Btn>
            <Btn onClick={() => saveNhomMutation.mutate()} disabled={!nhomForm.ten_nhom.trim() || saveNhomMutation.isPending}>
              {editingNhomId ? "Lưu" : "Thêm"}
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={ldeOptionOpen} onClose={() => { setLdeOptionOpen(false); setEditingOptionId(null); }} title={editingOptionId ? "Sửa option" : "Thêm option"}>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Tên option</label>
            <input
              value={optionForm.ten_option}
              onChange={(e) => setOptionForm({ ...optionForm, ten_option: e.target.value })}
              placeholder="Vd: MUA HÀNG"
              className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Thứ tự (STT)</label>
            <input
              type="number"
              value={optionForm.stt}
              onChange={(e) => setOptionForm({ ...optionForm, stt: e.target.value })}
              className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={optionForm.bat_tat} onChange={(e) => setOptionForm({ ...optionForm, bat_tat: e.target.checked })} />
            Đang bật
          </label>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => { setLdeOptionOpen(false); setEditingOptionId(null); }}>Hủy</Btn>
            <Btn onClick={() => saveOptionMutation.mutate()} disabled={!optionForm.ten_option.trim() || saveOptionMutation.isPending}>
              {editingOptionId ? "Lưu" : "Thêm"}
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal
        open={lyDoChamOpen}
        onClose={() => { setLyDoChamOpen(false); setEditingLyDoChamId(null); }}
        title={editingLyDoChamId ? "Sửa lý do chậm" : "Thêm lý do chậm mới"}
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Tên lý do</label>
            <input
              value={lyDoChamForm.ten_ly_do}
              onChange={(e) => setLyDoChamForm({ ...lyDoChamForm, ten_ly_do: e.target.value })}
              placeholder="Vd: Do nhà máy hết hàng"
              className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)] block mb-1">Hệ thống sử dụng</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={lyDoChamForm.muaHang} onChange={(e) => setLyDoChamForm({ ...lyDoChamForm, muaHang: e.target.checked })} />
                Mua hàng
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={lyDoChamForm.baoHanh} onChange={(e) => setLyDoChamForm({ ...lyDoChamForm, baoHanh: e.target.checked })} />
                Bảo hành
              </label>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={lyDoChamForm.quan_ly_don_thieu_linh_kien}
              onChange={(e) => setLyDoChamForm({ ...lyDoChamForm, quan_ly_don_thieu_linh_kien: e.target.checked })}
            />
            Tự tạo ticket "Thiếu linh kiện" (chuyển dòng sang Chờ hàng)
          </label>
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Thứ tự (STT)</label>
            <input
              type="number"
              value={lyDoChamForm.stt}
              onChange={(e) => setLyDoChamForm({ ...lyDoChamForm, stt: e.target.value })}
              className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={lyDoChamForm.bat_tat} onChange={(e) => setLyDoChamForm({ ...lyDoChamForm, bat_tat: e.target.checked })} />
            Đang bật
          </label>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => { setLyDoChamOpen(false); setEditingLyDoChamId(null); }}>Hủy</Btn>
            <Btn
              onClick={() => saveLyDoChamMutation.mutate()}
              disabled={!lyDoChamForm.ten_ly_do.trim() || (!lyDoChamForm.muaHang && !lyDoChamForm.baoHanh) || saveLyDoChamMutation.isPending}
            >
              {editingLyDoChamId ? "Lưu" : "Thêm"}
            </Btn>
          </div>
        </div>
      </Modal>

    </div>
  );
}
