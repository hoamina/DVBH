import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "../components/ui/Tabs";
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
  fmtVND,
  type LinhKienRow,
  type LyDoRow,
  type PhanLoaiTranhChapRow,
  type KetQuaXuLyTranhChapRow,
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

interface KtvImportSummary {
  thanhCong: number;
  loi: number;
  errors: string[];
}

const PAGE_SIZE = 20;

interface SheetUrlRow {
  loai_dong_bo: string;
  url: string | null;
  updated_at: string;
  updated_by: string | null;
}

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
  const [addOpen, setAddOpen] = useState(false);
  const [newReason, setNewReason] = useState({ ten: "", thieu: false, tranhChap: false });
  const [addLinhKienOpen, setAddLinhKienOpen] = useState(false);
  const [newLinhKien, setNewLinhKien] = useState({ ma: "", ten: "", gia: "" });
  const [addPhanLoaiOpen, setAddPhanLoaiOpen] = useState(false);
  const [newPhanLoai, setNewPhanLoai] = useState("");
  const [addKetQuaOpen, setAddKetQuaOpen] = useState(false);
  const [newKetQua, setNewKetQua] = useState("");
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
  const [editingUrls, setEditingUrls] = useState<Record<string, string>>({});
  const [lyDoPage, setLyDoPage] = useState(1);
  const [linhKienPage, setLinhKienPage] = useState(1);
  const [phanLoaiPage, setPhanLoaiPage] = useState(1);
  const [ketQuaPage, setKetQuaPage] = useState(1);
  const [greetingGifPage, setGreetingGifPage] = useState(1);
  const [greetingMessagePage, setGreetingMessagePage] = useState(1);
  const [ktvPage, setKtvPage] = useState(1);
  const [ktvModalOpen, setKtvModalOpen] = useState(false);
  const [editingKtvMa, setEditingKtvMa] = useState<string | null>(null);
  const [ktvForm, setKtvForm] = useState({ ma_ktv: "", ten_hien_thi: "", sdt: "", ghi_chu: "" });

  const { data: reasons } = useQuery({
    queryKey: ["settings-ly-do"],
    queryFn: () => fetchWithHashCache<{ rows: LyDoRow[] }>("settings-ly-do", "/settings/ly-do/version", "/settings/ly-do"),
  });
  const { data: parts } = useQuery({
    queryKey: ["settings-linh-kien"],
    queryFn: () => fetchWithHashCache<{ rows: LinhKienRow[] }>("settings-linh-kien", "/settings/linh-kien/version", "/settings/linh-kien"),
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

  const togglePart = useMutation({
    mutationFn: ({ ma, bat_tat }: { ma: string; bat_tat: boolean }) => api.patch(`/settings/linh-kien/${ma}`, { bat_tat }),
    onSuccess: () => {
      addToast("Đã cập nhật danh mục linh kiện");
      qc.invalidateQueries({ queryKey: ["settings-linh-kien"] });
    },
  });

  const syncSheetMutation = useMutation({
    mutationFn: () => api.post<{ moi: number; capNhat: number; boQua: number; loi: number }>("/settings/linh-kien/sync-sheet"),
    onSuccess: (res) => {
      addToast(`Đồng bộ xong: ${res.moi} mã mới, ${res.capNhat} mã cập nhật, ${res.boQua} không đổi${res.loi ? `, ${res.loi} lỗi` : ""}`);
      qc.invalidateQueries({ queryKey: ["settings-linh-kien"] });
    },
    onError: () => addToast("Đồng bộ Google Sheet thất bại, thử lại sau."),
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

  const addLinhKienMutation = useMutation({
    mutationFn: () =>
      api.post("/settings/linh-kien", {
        ma_linh_kien: newLinhKien.ma,
        ten_linh_kien: newLinhKien.ten,
        gia_ban: newLinhKien.gia ? Number(newLinhKien.gia) : undefined,
      }),
    onSuccess: () => {
      addToast("Đã thêm linh kiện mới");
      setNewLinhKien({ ma: "", ten: "", gia: "" });
      setAddLinhKienOpen(false);
      qc.invalidateQueries({ queryKey: ["settings-linh-kien"] });
    },
    onError: () => addToast("Không thể thêm linh kiện (mã có thể đã tồn tại)."),
  });

  const saveKtvMutation = useMutation({
    mutationFn: () =>
      api.post("/settings/ktv-lien-he", {
        ma_ktv: ktvForm.ma_ktv,
        ten_hien_thi: ktvForm.ten_hien_thi || undefined,
        sdt: ktvForm.sdt,
        ghi_chu: ktvForm.ghi_chu || undefined,
      }),
    onSuccess: () => {
      addToast(editingKtvMa ? "Đã cập nhật số điện thoại KTV" : "Đã thêm số điện thoại KTV");
      setKtvModalOpen(false);
      setEditingKtvMa(null);
      setKtvForm({ ma_ktv: "", ten_hien_thi: "", sdt: "", ghi_chu: "" });
      qc.invalidateQueries({ queryKey: KTV_PHONE_QUERY_KEY });
    },
    onError: () => addToast("Không thể lưu, thử lại sau."),
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

  const phanLoaiColumns: Column<PhanLoaiTranhChapRow>[] = [
    { key: "ten_phan_loai", header: "Tên phân loại", render: (r) => <span className="font-medium">{r.ten_phan_loai}</span> },
    { key: "bat_tat", header: "Bật / Tắt", render: (r) => <ToggleSwitch checked={!!r.bat_tat} onChange={() => togglePhanLoai.mutate({ id: r.id, bat_tat: !r.bat_tat })} /> },
  ];

  const ketQuaColumns: Column<KetQuaXuLyTranhChapRow>[] = [
    { key: "ten_ket_qua", header: "Tên kết quả", render: (r) => <span className="font-medium">{r.ten_ket_qua}</span> },
    { key: "bat_tat", header: "Bật / Tắt", render: (r) => <ToggleSwitch checked={!!r.bat_tat} onChange={() => toggleKetQua.mutate({ id: r.id, bat_tat: !r.bat_tat })} /> },
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
    { key: "nguoi_tao", header: "Người tạo", render: (r) => <span className="text-xs">{r.nguoi_tao ?? "—"}</span> },
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
          {r.created_by ? ` · ${r.created_by}` : ""}
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

  const linhKienColumns: Column<LinhKienRow>[] = [
    { key: "ma_linh_kien", header: "Mã", render: (p) => <span className="font-mono text-xs">{p.ma_linh_kien}</span> },
    { key: "ten_linh_kien", header: "Tên linh kiện", render: (p) => <span className="font-medium">{p.ten_linh_kien}</span> },
    { key: "gia_ban", header: "Giá bán", render: (p) => <span className="font-mono">{fmtVND(p.gia_ban)}</span> },
    { key: "nguoi_cap_nhat", header: "Người cập nhật", render: (p) => p.nguoi_cap_nhat },
    { key: "ngay_cap_nhat", header: "Ngày cập nhật", render: (p) => <span className="text-xs">{p.ngay_cap_nhat}</span> },
    { key: "bat_tat", header: "Hiển thị", render: (p) => <ToggleSwitch checked={!!p.bat_tat} onChange={() => togglePart.mutate({ ma: p.ma_linh_kien, bat_tat: !p.bat_tat })} /> },
  ];

  const ktvColumns: Column<KtvLienHeRow>[] = [
    { key: "ma_ktv", header: "Mã KTV", render: (r) => <span className="font-mono text-xs">{r.ma_ktv}</span> },
    { key: "ten_hien_thi", header: "Tên hiển thị", render: (r) => <span className="font-medium">{r.ten_hien_thi ?? "—"}</span> },
    { key: "sdt", header: "Số điện thoại", render: (r) => <span className="font-mono">{r.sdt}</span> },
    { key: "ghi_chu", header: "Ghi chú", render: (r) => <span className="text-xs text-[var(--ink-600)]">{r.ghi_chu ?? "—"}</span> },
    { key: "nguoi_cap_nhat", header: "Người cập nhật", render: (r) => <span className="text-xs">{r.nguoi_cap_nhat ?? "—"}</span> },
    { key: "ngay_cap_nhat", header: "Ngày cập nhật", render: (r) => <span className="text-xs">{r.ngay_cap_nhat}</span> },
    {
      key: "action",
      header: "",
      className: "text-right whitespace-nowrap",
      render: (r) => (
        <div className="flex gap-2 justify-end">
          <button
            className="text-xs text-[var(--ocean-600)] hover:underline"
            onClick={() => {
              setEditingKtvMa(r.ma_ktv);
              setKtvForm({ ma_ktv: r.ma_ktv, ten_hien_thi: r.ten_hien_thi ?? "", sdt: r.sdt, ghi_chu: r.ghi_chu ?? "" });
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
    },
  ];

  return (
    <div className="anim-in">
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "ly-do", label: "Lý do chậm" },
          { key: "linh-kien", label: "Danh mục linh kiện" },
          { key: "ktv-lien-he", label: "SĐT kỹ thuật viên" },
          { key: "phan-loai-tranh-chap", label: "Phân loại tranh chấp" },
          { key: "ket-qua-xu-ly-tranh-chap", label: "Kết quả xử lý tranh chấp" },
          { key: "loi-chao", label: "Lời chào" },
          { key: "giai-trinh-exclude-ngay", label: "Ngày loại trừ giải trình" },
          { key: "sheet-urls", label: "Link đồng bộ Google Sheet" },
          { key: "partner-keys", label: "API đối tác" },
        ]}
      />
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
      {tab === "linh-kien" && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-[var(--ink-600)]">Danh mục linh kiện dùng khi giải trình ca "thiếu linh kiện".</div>
            <div className="flex gap-2 shrink-0">
              <Btn
                variant="ghost"
                size="sm"
                onClick={() =>
                  exportRowsToExcel(parts?.rows ?? [], "danh_muc_linh_kien.xlsx", "Data", {
                    ma_linh_kien: "Mã",
                    ten_linh_kien: "Tên linh kiện",
                    gia_ban: "Giá bán",
                    nguoi_cap_nhat: "Người cập nhật",
                    ngay_cap_nhat: "Ngày cập nhật",
                    bat_tat: "Hiển thị",
                  })
                }
              >
                ⬇ Xuất Excel
              </Btn>
              <Btn variant="ghost" size="sm" onClick={() => syncSheetMutation.mutate()} disabled={syncSheetMutation.isPending}>
                {syncSheetMutation.isPending ? "Đang đồng bộ…" : "🔄 Đồng bộ từ Google Sheet"}
              </Btn>
              <Btn size="sm" onClick={() => setAddLinhKienOpen(true)}>
                + Thêm linh kiện
              </Btn>
            </div>
          </div>
          <PaginatedTable
            columns={linhKienColumns}
            rows={(parts?.rows ?? []).slice((linhKienPage - 1) * PAGE_SIZE, linhKienPage * PAGE_SIZE)}
            isLoading={false}
            isError={false}
            page={linhKienPage}
            pageSize={PAGE_SIZE}
            total={(parts?.rows ?? []).length}
            onPageChange={setLinhKienPage}
            rowKey={(p) => p.ma_linh_kien}
            emptyText="Chưa có linh kiện nào."
            storageKey="settings-linh-kien"
          />
        </div>
      )}

      {tab === "ktv-lien-he" && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-[var(--ink-600)]">
              Số điện thoại kỹ thuật viên — hiển thị cạnh tên KTV ở các màn hình CSKH gọi khảo sát. CSKH cũng có thể tự thêm/sửa/xóa bằng cách bấm vào tên KTV khi xem 1 ca.
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
                    nguoi_cap_nhat: "Người cập nhật",
                    ngay_cap_nhat: "Ngày cập nhật",
                  })
                }
              >
                ⬇ Xuất Excel
              </Btn>
              <Btn
                size="sm"
                onClick={() => {
                  setEditingKtvMa(null);
                  setKtvForm({ ma_ktv: "", ten_hien_thi: "", sdt: "", ghi_chu: "" });
                  setKtvModalOpen(true);
                }}
              >
                + Thêm SĐT
              </Btn>
            </div>
          </div>
          <ImportUploader<KtvImportSummary>
            description={
              <>
                Nhập hàng loạt SĐT KTV từ file Excel/CSV (cột <b className="font-mono">ma_ktv</b>, <b className="font-mono">sdt</b> bắt buộc). Mã KTV đã có sẽ được cập nhật lại.
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

      <Modal open={addLinhKienOpen} onClose={() => setAddLinhKienOpen(false)} title="Thêm linh kiện mới">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Mã linh kiện</label>
            <input value={newLinhKien.ma} onChange={(e) => setNewLinhKien({ ...newLinhKien, ma: e.target.value })} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Tên linh kiện</label>
            <input value={newLinhKien.ten} onChange={(e) => setNewLinhKien({ ...newLinhKien, ten: e.target.value })} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Giá bán</label>
            <input type="number" value={newLinhKien.gia} onChange={(e) => setNewLinhKien({ ...newLinhKien, gia: e.target.value })} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
          </div>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setAddLinhKienOpen(false)}>
              Hủy
            </Btn>
            <Btn onClick={() => addLinhKienMutation.mutate()} disabled={!newLinhKien.ma.trim() || !newLinhKien.ten.trim() || addLinhKienMutation.isPending}>
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
        title={editingKtvMa ? "Sửa số điện thoại KTV" : "Thêm số điện thoại KTV"}
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Mã KTV</label>
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
            <Btn onClick={() => saveKtvMutation.mutate()} disabled={!ktvForm.ma_ktv.trim() || !ktvForm.sdt.trim() || saveKtvMutation.isPending}>
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
    </div>
  );
}
