import { useState } from "react";
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

const PAGE_SIZE = 20;

// Khop dung cot hien tren PaginatedTable "columns" ben duoi.
const USER_EXPORT_LABELS: Record<string, string> = {
  email: "Email",
  ten: "Tên",
  vai_tro: "Vai trò",
  khu_vuc_phu_trach: "Khu vực phụ trách",
  trang_thai_duyet: "Trạng thái",
  la_ksnb_doi_tac: "KSNB Đối tác",
};

interface LoginLogRow {
  id: number;
  email: string;
  thoi_gian: string;
  ip: string | null;
  user_agent: string | null;
}

export function UsersModule() {
  const [tab, setTab] = useState("cho-duyet");
  const [page, setPage] = useState(1);
  const [logEmailFilter, setLogEmailFilter] = useState("");
  const addToast = useToast();
  const qc = useQueryClient();
  const [editUser, setEditUser] = useState<UserRow | null>(null);

  const { data } = useQuery({
    queryKey: ["users", tab],
    queryFn: () => api.get<{ rows: UserRow[] }>(`/users?tab=${tab}`),
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

  const decide = useMutation({
    mutationFn: ({ email, ok }: { email: string; ok: boolean }) => api.patch(`/users/${encodeURIComponent(email)}`, { trang_thai_duyet: ok ? "Da duyet" : "Tu choi" }),
    onSuccess: (_d, vars) => {
      addToast(vars.ok ? "Đã duyệt tài khoản" : "Đã từ chối tài khoản");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const saveEdit = useMutation({
    mutationFn: ({ email, vai_tro, khu_vuc, la_ksnb_doi_tac }: { email: string; vai_tro: string; khu_vuc: string[]; la_ksnb_doi_tac: boolean }) =>
      api.patch(`/users/${encodeURIComponent(email)}`, { vai_tro, khu_vuc_phu_trach: khu_vuc, la_ksnb_doi_tac }),
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
      render: (u) => (
        <div className="flex flex-wrap gap-1 items-center">
          {u.vai_tro ? <Badge tone="ocean">{u.vai_tro}</Badge> : <span className="text-xs text-[var(--ink-400)] italic">Chưa gán</span>}
          {!!u.la_ksnb_doi_tac && <Badge tone="amber">KSNB Đối tác</Badge>}
        </div>
      ),
    },
    {
      key: "khu_vuc_phu_trach",
      header: "Khu vực phụ trách",
      render: (u) =>
        u.khu_vuc_phu_trach.length ? (
          <div className="flex flex-wrap gap-1 max-w-xs">
            {u.khu_vuc_phu_trach.map((kv) => (
              <Badge key={kv} tone="gray">
                {kv}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-[var(--ink-400)]">—</span>
        ),
    },
    {
      key: "trang_thai_duyet",
      header: "Trạng thái",
      render: (u) => <Badge tone={u.trang_thai_duyet === "Da duyet" ? "teal" : u.trang_thai_duyet === "Cho duyet" ? "amber" : "coral"}>{u.trang_thai_duyet}</Badge>,
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
          <div className="text-right">
            <Btn size="sm" variant="ghost" onClick={() => setEditUser(u)}>
              Phân quyền
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
          <Btn variant="ghost" size="sm" onClick={() => exportRowsToExcel(data?.rows ?? [], "quan_ly_user.xlsx", "Data", USER_EXPORT_LABELS)}>
            ⬇ Xuất Excel
          </Btn>
        )}
      </div>
      <Tabs
        active={tab}
        onChange={(k) => {
          setTab(k);
          setPage(1);
        }}
        tabs={[
          { key: "cho-duyet", label: "Chờ duyệt" },
          { key: "da-duyet", label: "Đã duyệt / khác" },
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
          />
        </>
      ) : (
        <PaginatedTable
          columns={columns}
          rows={(data?.rows ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
          isLoading={false}
          isError={false}
          page={page}
          pageSize={PAGE_SIZE}
          total={(data?.rows ?? []).length}
          onPageChange={setPage}
          rowKey={(u) => u.email}
          emptyText="Không có người dùng nào."
        />
      )}
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSave={(vai_tro, khu_vuc, la_ksnb_doi_tac) => saveEdit.mutate({ email: editUser.email, vai_tro, khu_vuc, la_ksnb_doi_tac })}
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
  onSave: (vaiTro: string, khuVuc: string[], laKsnbDoiTac: boolean) => void;
}) {
  const [role, setRole] = useState(user.vai_tro ?? ROLES[0]);
  const [kv, setKv] = useState<Set<string>>(new Set(user.khu_vuc_phu_trach));
  const [laKsnb, setLaKsnb] = useState(!!user.la_ksnb_doi_tac);
  // Danh sach khu vuc lay truc tiep tu du lieu case_dvbh that (khong hardcode) vi gia tri
  // thuc te la ma doi nhom CRM (vd "(qldvbh.mb2) Quan ly khu vuc MB2"), khong phai ten tinh/thanh.
  const { data: filters } = useQuery({
    queryKey: ["dashboard-filters"],
    queryFn: () => api.get<{ khuVuc: string[]; hang: string[] }>("/dashboard/filters"),
  });
  const khuVucOptions = filters?.khuVuc ?? [];

  function toggle(k: string) {
    const s = new Set(kv);
    s.has(k) ? s.delete(k) : s.add(k);
    setKv(new Set(s));
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
              >
                {k}
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
            Được xem toàn bộ + ghi log xử lý tranh chấp (module "Tranh chấp, khiếu nại"), độc lập với vai trò ở trên.
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>
            Hủy
          </Btn>
          <Btn onClick={() => onSave(role, Array.from(kv), laKsnb)}>Lưu</Btn>
        </div>
      </div>
    </Modal>
  );
}
