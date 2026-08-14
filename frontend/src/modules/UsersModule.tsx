import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "../components/ui/Tabs";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { api, buildQuery } from "../api/client";
import { useToast } from "../components/ui/Toast";
import { fmtDateTime, type UserRow } from "../types";
import { ROLES } from "../constants";
import { exportRowsToExcel } from "../lib/exportExcel";
import { ROLE_MODULES, MODULE_TITLES } from "../layout/navConfig";
import { shortKhuVuc } from "../lib/khuVucShortLabel";
import { useAuth, type VaiTro } from "../auth/AuthContext";

const PAGE_SIZE = 20;

const MH_FLAGS = ["la_ktv_dvbh", "la_ve_tinh", "la_kho", "la_ke_toan"] as const;
const BC_MODULE_KEYS = ["dashboard", "revenue", "backlog", "missing-parts", "tranh-chap", "nap-gas", "survey", "ca-lap", "danh-sach-tong", "import", "settings", "users", "giao-dien"];
const MH_MODULE_KEYS = ["dat-mua-lk", "tra-hang"];

function computeEffectiveMods(u: UserRow): string[] {
  if (u.vai_tro === "Admin") return ROLE_MODULES["Admin"];
  const base: string[] = u.modules ?? (u.vai_tro ? (ROLE_MODULES[u.vai_tro as VaiTro] ?? []) : []);
  if (MH_FLAGS.some((f) => !!(u as unknown as Record<string, unknown>)[f])) {
    return [...new Set([...base, ...MH_MODULE_KEYS])];
  }
  return base;
}

function getUserSystems(u: UserRow): ("BC" | "MH")[] {
  const mods = computeEffectiveMods(u);
  const result: ("BC" | "MH")[] = [];
  if (MH_FLAGS.some((f) => !!(u as unknown as Record<string, unknown>)[f]) || MH_MODULE_KEYS.some((m) => mods.includes(m))) {
    result.push("MH");
  }
  if (BC_MODULE_KEYS.some((m) => mods.includes(m))) result.push("BC");
  return result;
}

// CHOT 2026-08-01: danh sach module co the tuy chinh RIENG theo tung tai khoan (users.modules,
// migration 0042) - chi gom nhom "Tong quan"/"Van hanh" cua NAV_GROUPS (navConfig.ts). "He thong"
// (import/settings/users) LUON gan cung vai_tro=Admin, khong dua vao day; "giao-dien" (Ca nhan)
// luon co san cho moi tai khoan, cung khong can tick.
const CUSTOMIZABLE_MODULE_KEYS = ["dashboard", "revenue", "backlog", "missing-parts", "tranh-chap", "nap-gas", "survey", "ca-lap", "danh-sach-tong"];

// Khop dung cot hien tren PaginatedTable "columns" ben duoi.
const USER_EXPORT_LABELS: Record<string, string> = {
  email: "Email",
  ten: "Tên",
  vai_tro: "Vai trò",
  khu_vuc_phu_trach: "Khu vực phụ trách",
  trang_thai_duyet: "Trạng thái",
  la_ksnb_doi_tac: "KSNB Đối tác",
  modules: "Module tùy chỉnh",
  bi_khoa: "Khóa tài khoản",
  co_the_import_tranh_chap: "Được import tranh chấp",
};

interface LoginLogRow {
  id: number;
  email: string;
  thoi_gian: string;
  ip: string | null;
  user_agent: string | null;
}

export function UsersModule() {
  const auth = useAuth();
  const currentEmail = auth.status === "authenticated" ? auth.user.email : null;
  const [tab, setTab] = useState("cho-duyet");
  const [page, setPage] = useState(1);
  const [logEmailFilter, setLogEmailFilter] = useState("");
  const [searchText, setSearchText] = useState("");
  const [filterVaiTro, setFilterVaiTro] = useState("");
  const [filterModule, setFilterModule] = useState("");
  const addToast = useToast();
  const qc = useQueryClient();
  const [editUser, setEditUser] = useState<UserRow | null>(null);

  const { data } = useQuery({
    queryKey: ["users", tab, searchText, filterVaiTro],
    queryFn: () => {
      const p = new URLSearchParams({ tab });
      if (searchText) p.set("search", searchText);
      if (filterVaiTro) p.set("vai_tro", filterVaiTro);
      return api.get<{ rows: UserRow[] }>(`/users?${p}`);
    },
    enabled: tab !== "login-log",
  });

  const { data: loginLog } = useQuery({
    queryKey: ["users-login-log", logEmailFilter, page],
    queryFn: () =>
      api.get<{ rows: LoginLogRow[]; page: number; pageSize: number; total: number }>(
        `/users/login-log${buildQuery({ email: logEmailFilter, page, pageSize: PAGE_SIZE })}`,
      ),
    enabled: tab === "login-log",
  });

  const visibleRows = useMemo(() => {
    const rows = data?.rows ?? [];
    if (!filterModule) return rows;
    return rows.filter((u) => computeEffectiveMods(u).includes(filterModule));
  }, [data?.rows, filterModule]);

  const decide = useMutation({
    mutationFn: ({ email, ok }: { email: string; ok: boolean }) => api.patch(`/users/${encodeURIComponent(email)}`, { trang_thai_duyet: ok ? "Da duyet" : "Tu choi" }),
    onSuccess: (_d, vars) => {
      addToast(vars.ok ? "Đã duyệt tài khoản" : "Đã từ chối tài khoản");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const toggleLock = useMutation({
    mutationFn: ({ email, bi_khoa }: { email: string; bi_khoa: boolean }) => api.patch(`/users/${encodeURIComponent(email)}`, { bi_khoa }),
    onSuccess: (_d, vars) => {
      addToast(vars.bi_khoa ? "Đã khóa tài khoản" : "Đã mở khóa tài khoản");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const saveEdit = useMutation({
    mutationFn: ({
      email,
      vai_tro,
      khu_vuc,
      la_ksnb_doi_tac,
      modules,
      co_the_import_tranh_chap,
      la_ktv_dvbh,
      la_ve_tinh,
      la_kho,
      la_ke_toan,
      tram_cha,
      giam_sat_quan_ly,
    }: {
      email: string;
      vai_tro: string;
      khu_vuc: string[];
      la_ksnb_doi_tac: boolean;
      modules: string[] | null;
      co_the_import_tranh_chap: boolean;
      la_ktv_dvbh: boolean;
      la_ve_tinh: boolean;
      la_kho: boolean;
      la_ke_toan: boolean;
      tram_cha: string | null;
      giam_sat_quan_ly: string | null;
    }) =>
      api.patch(`/users/${encodeURIComponent(email)}`, {
        vai_tro,
        khu_vuc_phu_trach: khu_vuc,
        la_ksnb_doi_tac,
        modules,
        co_the_import_tranh_chap,
        la_ktv_dvbh,
        la_ve_tinh,
        la_kho,
        la_ke_toan,
        tram_cha: tram_cha || null,
        giam_sat_quan_ly: giam_sat_quan_ly || null,
      }),
    onSuccess: () => {
      addToast("Đã cập nhật phân quyền");
      setEditUser(null);
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const columns: Column<UserRow>[] = [
    {
      key: "user",
      header: "Người dùng",
      render: (u) => (
        <>
          <div className="font-semibold">{u.ten ?? "(chưa cập nhật tên)"}</div>
          <div className="text-xs text-[var(--ink-400)] font-mono">{u.email}</div>
        </>
      ),
    },
    {
      key: "vai_tro",
      header: "Vai trò",
      render: (u) => {
        const systems = getUserSystems(u);
        return (
          <div className="flex flex-wrap gap-1 items-center">
            {u.vai_tro ? <Badge tone="ocean">{u.vai_tro}</Badge> : <span className="text-xs text-[var(--ink-400)] italic">Chưa gán</span>}
            {!!u.la_ksnb_doi_tac && <Badge tone="amber">KSNB Đối tác</Badge>}
            {!!u.co_the_import_tranh_chap && <Badge tone="gray">Được import tranh chấp</Badge>}
            {u.modules !== null && <Badge tone="teal">Module tùy chỉnh ({u.modules.length})</Badge>}
            {systems.includes("BC") && <Badge tone="ocean">BC</Badge>}
            {systems.includes("MH") && <Badge tone="coral">MH</Badge>}
          </div>
        );
      },
    },
    {
      key: "khu_vuc_phu_trach",
      header: "Khu vực phụ trách",
      render: (u) =>
        u.khu_vuc_phu_trach.length ? (
          <div className="flex flex-wrap gap-1 max-w-xs">
            {u.khu_vuc_phu_trach.map((kv) => (
              <span key={kv} title={kv}>
                <Badge tone="gray">{shortKhuVuc(kv)}</Badge>
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-[var(--ink-400)]">—</span>
        ),
    },
    ...(tab === "mua-hang"
      ? ([
          {
            key: "he_thong_flags",
            header: "Vai trò hệ thống",
            render: (u: UserRow) => (
              <div className="flex flex-wrap gap-1">
                {!!u.la_ktv_dvbh && <Badge tone="ocean">KTV DVBH</Badge>}
                {!!u.la_ve_tinh && <Badge tone="teal">Vệ tinh</Badge>}
                {!!u.la_kho && <Badge tone="amber">Kho</Badge>}
                {!!u.la_ke_toan && <Badge tone="coral">Kế toán</Badge>}
                {u.tram_cha && <span className="text-xs text-[var(--ink-400)]">Trạm: {u.tram_cha}</span>}
              </div>
            ),
          },
        ] as Column<UserRow>[])
      : []),
    {
      key: "trang_thai_duyet",
      header: "Trạng thái",
      render: (u) => (
        <div className="flex flex-wrap gap-1 items-center">
          <Badge tone={u.trang_thai_duyet === "Da duyet" ? "teal" : u.trang_thai_duyet === "Cho duyet" ? "amber" : "coral"}>{u.trang_thai_duyet}</Badge>
          {!!u.bi_khoa && <Badge tone="coral">Đã khóa</Badge>}
        </div>
      ),
    },
    {
      key: "action",
      header: "",
      className: "text-right",
      render: (u) =>
        u.trang_thai_duyet === "Cho duyet" ? (
          <div className="flex gap-1.5 justify-end">
            <Btn size="sm" variant="success" onClick={() => decide.mutate({ email: u.email, ok: true })}>
              Duyệt
            </Btn>
            <Btn size="sm" variant="danger" onClick={() => decide.mutate({ email: u.email, ok: false })}>
              Từ chối
            </Btn>
          </div>
        ) : (
          <div className="flex gap-1.5 justify-end">
            <Btn size="sm" variant="ghost" onClick={() => setEditUser(u)}>
              Phân quyền
            </Btn>
            <Btn
              size="sm"
              variant={u.bi_khoa ? "success" : "danger"}
              disabled={u.email === currentEmail}
              title={u.email === currentEmail ? "Không thể tự khóa tài khoản đang đăng nhập" : undefined}
              onClick={() => toggleLock.mutate({ email: u.email, bi_khoa: !u.bi_khoa })}
            >
              {u.bi_khoa ? "Mở khóa" : "Khóa"}
            </Btn>
          </div>
        ),
    },
  ];

  const loginLogColumns: Column<LoginLogRow>[] = [
    { key: "email", header: "Email", render: (r) => <span className="font-mono text-sm">{r.email}</span> },
    { key: "thoi_gian", header: "Thời gian đăng nhập", render: (r) => fmtDateTime(r.thoi_gian) },
    { key: "ip", header: "Địa chỉ IP", render: (r) => <span className="font-mono text-xs">{r.ip ?? "—"}</span> },
    { key: "user_agent", header: "Trình duyệt / thiết bị", render: (r) => <span className="text-xs text-[var(--ink-400)] break-all">{r.user_agent ?? "—"}</span> },
  ];

  return (
    <div className="anim-in">
      <div className="flex items-center justify-between mb-1">
        <div />
        {tab !== "login-log" && (
          <Btn variant="ghost" size="sm" onClick={() => exportRowsToExcel(visibleRows, "quan_ly_user.xlsx", "Data", USER_EXPORT_LABELS)}>
            ⬇ Xuất Excel
          </Btn>
        )}
      </div>
      {tab !== "login-log" && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo email hoặc tên…"
            className="focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm w-64"
          />
          <Select
            value={filterVaiTro}
            onChange={(v) => {
              setFilterVaiTro(v);
              setPage(1);
            }}
            options={[{ value: "", label: "Tất cả vai trò" }, ...ROLES.map((r) => ({ value: r, label: r }))]}
          />
          <Select
            value={filterModule}
            onChange={(v) => {
              setFilterModule(v);
              setPage(1);
            }}
            options={[{ value: "", label: "Tất cả màn hình" }, ...Object.entries(MODULE_TITLES).map(([k, v]) => ({ value: k, label: v }))]}
          />
        </div>
      )}
      <Tabs
        active={tab}
        onChange={(k) => {
          setTab(k);
          setPage(1);
          setSearchText("");
          setFilterVaiTro("");
          setFilterModule("");
        }}
        tabs={[
          { key: "cho-duyet", label: "Chờ duyệt" },
          { key: "da-duyet", label: "Đã duyệt / khác" },
          { key: "da-duyet-chua-vai-tro", label: "Đã duyệt chưa vai trò" },
          { key: "mua-hang", label: "Hệ thống mua hàng" },
          { key: "login-log", label: "Lịch sử đăng nhập" },
        ]}
      />
      {tab === "login-log" ? (
        <>
          <div className="flex items-center gap-2 mt-3 mb-1">
            <input
              value={logEmailFilter}
              onChange={(e) => {
                setLogEmailFilter(e.target.value);
                setPage(1);
              }}
              placeholder="Lọc theo email…"
              className="focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm w-64"
            />
          </div>
          <PaginatedTable
            columns={loginLogColumns}
            rows={loginLog?.rows ?? []}
            isLoading={false}
            isError={false}
            page={page}
            pageSize={PAGE_SIZE}
            total={loginLog?.total ?? 0}
            onPageChange={setPage}
            rowKey={(r) => r.id}
            emptyText="Chưa có lượt đăng nhập nào."
            storageKey="users-login-log"
          />
        </>
      ) : (
        <PaginatedTable
          columns={columns}
          rows={visibleRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
          isLoading={false}
          isError={false}
          page={page}
          pageSize={PAGE_SIZE}
          total={visibleRows.length}
          onPageChange={setPage}
          rowKey={(u) => u.email}
          emptyText="Không có người dùng nào."
          storageKey="users-list"
        />
      )}
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSave={(vai_tro, khu_vuc, la_ksnb_doi_tac, modules, co_the_import_tranh_chap, la_ktv_dvbh, la_ve_tinh, la_kho, la_ke_toan, tram_cha, giam_sat_quan_ly) =>
            saveEdit.mutate({ email: editUser.email, vai_tro, khu_vuc, la_ksnb_doi_tac, modules, co_the_import_tranh_chap, la_ktv_dvbh, la_ve_tinh, la_kho, la_ke_toan, tram_cha, giam_sat_quan_ly })
          }
        />
      )}
    </div>
  );
}

function EditUserModal({
  user,
  onClose,
  onSave,
}: {
  user: UserRow;
  onClose: () => void;
  onSave: (vaiTro: string, khuVuc: string[], laKsnbDoiTac: boolean, modules: string[] | null, coTheImportTranhChap: boolean, laKtvDvbh: boolean, laVeTinh: boolean, laKho: boolean, laKeToan: boolean, tramCha: string | null, giamSatQuanLy: string | null) => void;
}) {
  const [role, setRole] = useState(user.vai_tro ?? ROLES[0]);
  const [kv, setKv] = useState<Set<string>>(new Set(user.khu_vuc_phu_trach));
  const [laKsnb, setLaKsnb] = useState(!!user.la_ksnb_doi_tac);
  const [coTheImportTranhChap, setCoTheImportTranhChap] = useState(!!user.co_the_import_tranh_chap);
  const [laKtvDvbh, setLaKtvDvbh] = useState(!!user.la_ktv_dvbh);
  const [laVeTinh, setLaVeTinh] = useState(!!user.la_ve_tinh);
  const [laKho, setLaKho] = useState(!!user.la_kho);
  const [laKeToan, setLaKeToan] = useState(!!user.la_ke_toan);
  const [tramCha, setTramCha] = useState(user.tram_cha ?? "");
  const [giamSatQuanLy, setGiamSatQuanLy] = useState(user.giam_sat_quan_ly ?? "");
  // Khoi tao 1 LAN tu du lieu hien co (user.modules neu da tuy chinh, khong thi mac dinh theo
  // vai_tro hien tai cua user) - KHONG tu dong reset lai khi doi Vai tro trong modal (tranh mat du
  // lieu da tick neu Admin lo doi qua lai vai tro truoc khi Luu).
  const [moduleSet, setModuleSet] = useState<Set<string>>(
    () => new Set((user.modules ?? (user.vai_tro ? ROLE_MODULES[user.vai_tro as VaiTro] : [])).filter((m) => CUSTOMIZABLE_MODULE_KEYS.includes(m))),
  );
  // Danh sach khu vuc lay truc tiep tu du lieu case_dvbh that (khong hardcode) vi gia tri
  // thuc te la ma doi nhom CRM (vd "(qldvbh.mb2) Quan ly khu vuc MB2"), khong phai ten tinh/thanh.
  // "full_khu_vuc=true" - Admin van can gan duoc khu_vuc_phu_trach cho 2 khu_vuc "an khoi bao cao"
  // (van la don vi kinh doanh that, chi khong hien trong thong ke tong hop), khac bo loc bao cao.
  const { data: filters } = useQuery({
    queryKey: ["dashboard-filters", "full"],
    queryFn: () => api.get<{ khuVuc: string[]; hang: string[] }>("/dashboard/filters?full_khu_vuc=true"),
  });
  const khuVucOptions = filters?.khuVuc ?? [];

  function toggle(k: string) {
    const s = new Set(kv);
    s.has(k) ? s.delete(k) : s.add(k);
    setKv(new Set(s));
  }

  function toggleModule(m: string) {
    const s = new Set(moduleSet);
    s.has(m) ? s.delete(m) : s.add(m);
    setModuleSet(new Set(s));
  }

  return (
    <Modal open onClose={onClose} title={`Phân quyền — ${user.ten ?? user.email}`}>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-[var(--ink-400)]">Vai trò</label>
          <Select value={role} onChange={setRole} options={ROLES} className="w-full mt-1" />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--ink-400)] block mb-1.5">Khu vực được xem / quản lý</label>
          <div className="flex flex-wrap gap-1.5">
            {khuVucOptions.map((k) => (
              <button
                key={k}
                onClick={() => toggle(k)}
                className={`focus-ring px-2.5 py-1 rounded-lg text-xs font-semibold border ${kv.has(k) ? "bg-[var(--ocean-500)] text-white border-[var(--ocean-500)]" : "border-[var(--line)] text-[var(--ink-600)]"}`}
                title={k}
              >
                {shortKhuVuc(k)}
              </button>
            ))}
            {khuVucOptions.length === 0 && <span className="text-xs text-[var(--ink-400)] italic">Chưa có dữ liệu khu vực (chưa import case nào).</span>}
          </div>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={laKsnb} onChange={(e) => setLaKsnb(e.target.checked)} className="w-4 h-4" />
            <span className="font-semibold">Là KSNB Đối tác</span>
          </label>
          <div className="text-xs text-[var(--ink-400)] mt-1">
            Được xem toàn bộ + ghi log xử lý tranh chấp (module "Tranh chấp, KN"), độc lập với vai trò ở trên.
          </div>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={coTheImportTranhChap} onChange={(e) => setCoTheImportTranhChap(e.target.checked)} className="w-4 h-4" />
            <span className="font-semibold">Được import tranh chấp theo ID</span>
          </label>
          <div className="text-xs text-[var(--ink-400)] mt-1">Cho phép tải file Excel/CSV để tạo hàng loạt tiến trình tranh chấp (module "Tranh chấp, KN"), thay vì tạo tay từng ca.</div>
        </div>
        <div className="border-t border-[var(--line)] pt-3">
          <div className="text-xs font-semibold text-[var(--ink-400)] mb-2">Module đặt mua linh kiện</div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={laKtvDvbh} onChange={(e) => setLaKtvDvbh(e.target.checked)} className="w-4 h-4" />
              <span>Là KTV DVBH (tạo phiếu đặt)</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={laVeTinh} onChange={(e) => setLaVeTinh(e.target.checked)} className="w-4 h-4" />
              <span>Là Vệ tinh (tạo phiếu đặt, thuộc trạm cha)</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={laKho} onChange={(e) => setLaKho(e.target.checked)} className="w-4 h-4" />
              <span>Là Kho (xử lý phiếu xuất kho, thiếu LK)</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={laKeToan} onChange={(e) => setLaKeToan(e.target.checked)} className="w-4 h-4" />
              <span>Là Kế toán (xử lý phiếu số tiền)</span>
            </label>
          </div>
          <div className="mt-3 space-y-2">
            <div>
              <label className="block text-xs font-semibold text-[var(--ink-400)] mb-1">Trạm cha (email — dành cho Vệ tinh)</label>
              <input
                value={tramCha}
                onChange={(e) => setTramCha(e.target.value)}
                placeholder="email@example.com"
                className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--ink-400)] mb-1">Giám sát quản lý (email)</label>
              <input
                value={giamSatQuanLy}
                onChange={(e) => setGiamSatQuanLy(e.target.value)}
                placeholder="email@example.com"
                className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
          </div>
        </div>
        {role === "Admin" ? (
          <div className="text-xs text-[var(--ink-400)] italic">Vai trò Admin luôn xem được toàn bộ module - không cần tùy chỉnh riêng.</div>
        ) : (
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)] block mb-1.5">Module được xem (thẻ trong sidebar)</label>
            <div className="flex flex-wrap gap-1.5">
              {CUSTOMIZABLE_MODULE_KEYS.map((m) => (
                <button
                  key={m}
                  onClick={() => toggleModule(m)}
                  className={`focus-ring px-2.5 py-1 rounded-lg text-xs font-semibold border ${moduleSet.has(m) ? "bg-[var(--teal-500)] text-white border-[var(--teal-500)]" : "border-[var(--line)] text-[var(--ink-600)]"}`}
                >
                  {MODULE_TITLES[m]}
                </button>
              ))}
            </div>
            <div className="text-xs text-[var(--ink-400)] mt-1">
              "Import data"/"Settings"/"Quản lý User" luôn chỉ dành cho Admin, không tùy chỉnh được ở đây. "Cài đặt cá nhân" luôn có sẵn cho mọi tài khoản.
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>
            Hủy
          </Btn>
          <Btn onClick={() => onSave(role, Array.from(kv), laKsnb, role === "Admin" ? null : Array.from(moduleSet), coTheImportTranhChap, laKtvDvbh, laVeTinh, laKho, laKeToan, tramCha || null, giamSatQuanLy || null)}>Lưu</Btn>
        </div>
      </div>
    </Modal>
  );
}
