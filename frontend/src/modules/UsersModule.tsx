import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "../components/ui/Tabs";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { api } from "../api/client";
import { useToast } from "../components/ui/Toast";
import type { UserRow } from "../types";
import { ROLES } from "../constants";
import { exportRowsToExcel } from "../lib/exportExcel";

const PAGE_SIZE = 20;

export function UsersModule() {
  const [tab, setTab] = useState("cho-duyet");
  const [page, setPage] = useState(1);
  const addToast = useToast();
  const qc = useQueryClient();
  const [editUser, setEditUser] = useState<UserRow | null>(null);

  const { data } = useQuery({
    queryKey: ["users", tab],
    queryFn: () => api.get<{ rows: UserRow[] }>(`/users?tab=${tab}`),
  });

  const decide = useMutation({
    mutationFn: ({ email, ok }: { email: string; ok: boolean }) => api.patch(`/users/${encodeURIComponent(email)}`, { trang_thai_duyet: ok ? "Da duyet" : "Tu choi" }),
    onSuccess: (_d, vars) => {
      addToast(vars.ok ? "Đã duyệt tài khoản" : "Đã từ chối tài khoản");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const saveEdit = useMutation({
    mutationFn: ({ email, vai_tro, khu_vuc }: { email: string; vai_tro: string; khu_vuc: string[] }) =>
      api.patch(`/users/${encodeURIComponent(email)}`, { vai_tro, khu_vuc_phu_trach: khu_vuc }),
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
    { key: "vai_tro", header: "Vai trò", render: (u) => (u.vai_tro ? <Badge tone="ocean">{u.vai_tro}</Badge> : <span className="text-xs text-[var(--ink-400)] italic">Chưa gán</span>) },
    { key: "khu_vuc_phu_trach", header: "Khu vực phụ trách", render: (u) => <span className="text-xs">{u.khu_vuc_phu_trach.length ? u.khu_vuc_phu_trach.join(", ") : "—"}</span> },
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

  return (
    <div className="anim-in">
      <div className="flex items-center justify-between mb-1">
        <div />
        <Btn variant="ghost" size="sm" onClick={() => exportRowsToExcel(data?.rows ?? [], "quan_ly_user.xlsx")}>
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
          { key: "cho-duyet", label: "Chờ duyệt" },
          { key: "da-duyet", label: "Đã duyệt / khác" },
        ]}
      />
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
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSave={(vai_tro, khu_vuc) => saveEdit.mutate({ email: editUser.email, vai_tro, khu_vuc })}
        />
      )}
    </div>
  );
}

function EditUserModal({ user, onClose, onSave }: { user: UserRow; onClose: () => void; onSave: (vaiTro: string, khuVuc: string[]) => void }) {
  const [role, setRole] = useState(user.vai_tro ?? ROLES[0]);
  const [kv, setKv] = useState<Set<string>>(new Set(user.khu_vuc_phu_trach));
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
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>
            Hủy
          </Btn>
          <Btn onClick={() => onSave(role, Array.from(kv))}>Lưu</Btn>
        </div>
      </div>
    </Modal>
  );
}
