import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Btn } from "./ui/Btn";
import { api } from "../api/client";
import { useToast } from "./ui/Toast";
import { useAuth } from "../auth/AuthContext";
import type { GioiTinh } from "../auth/AuthContext";

const GIOI_TINH_OPTIONS: { key: GioiTinh | null; label: string }[] = [
  { key: null, label: "Không xác định" },
  { key: "nam", label: "Nam" },
  { key: "nu", label: "Nữ" },
];

// Ten goi + gioi tinh dung rieng de ca nhan hoa loi chao tren TopBar (xem Greeting.tsx +
// backend/src/lib/greeting.ts) - khong anh huong den ten hien thi/avatar o noi khac trong he thong.
export function PersonalInfoPanel() {
  const auth = useAuth();
  const addToast = useToast();
  const qc = useQueryClient();
  const user = auth.status === "authenticated" ? auth.user : null;

  const [tenGoi, setTenGoi] = useState(user?.ten_goi ?? "");
  const [gioiTinh, setGioiTinh] = useState<GioiTinh | null>(user?.gioi_tinh ?? null);

  const save = useMutation({
    mutationFn: (body: { ten_goi: string | null; gioi_tinh: GioiTinh | null }) => api.patch("/auth/me", body),
    onSuccess: () => {
      addToast("Đã lưu thông tin cá nhân");
      qc.invalidateQueries();
    },
    onError: () => addToast("Không lưu được, thử lại sau."),
  });

  if (!user) return null;

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-[var(--ink-400)]">Tên gọi (dùng trong lời chào)</label>
        <input
          value={tenGoi}
          onChange={(e) => setTenGoi(e.target.value)}
          placeholder={user.ten ? `Để trống sẽ dùng "${user.ten}" (tên Google)` : "Để trống sẽ dùng tên Google"}
          maxLength={50}
          className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-[var(--ink-400)] block mb-1.5">Giới tính (để chọn cách gọi phù hợp trong lời chào)</label>
        <div className="flex gap-1.5">
          {GIOI_TINH_OPTIONS.map((o) => (
            <button
              key={o.label}
              onClick={() => setGioiTinh(o.key)}
              className={`focus-ring px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                gioiTinh === o.key ? "bg-[var(--ocean-500)] text-white border-[var(--ocean-500)]" : "border-[var(--line)] text-[var(--ink-600)] hover:border-[var(--ocean-400)]"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <Btn size="sm" disabled={save.isPending} onClick={() => save.mutate({ ten_goi: tenGoi.trim() || null, gioi_tinh: gioiTinh })}>
          {save.isPending ? "Đang lưu…" : "Lưu thông tin"}
        </Btn>
      </div>
    </div>
  );
}
