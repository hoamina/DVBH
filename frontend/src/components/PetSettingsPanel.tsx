import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ToggleSwitch } from "./ui/ToggleSwitch";
import { api } from "../api/client";
import { useToast } from "./ui/Toast";
import { useAuth } from "../auth/AuthContext";
import { apDungPet3T } from "../lib/pet3t";
import { tr } from "../i18n/tr";

// Bat/tat thu cung 3T Pet (migration 0147). Ca nhan: users.bat_pet_3t (PATCH /auth/me). Admin thay them cong tac toan
// he thong (PATCH /auth/pet-3t-he-thong) - tat thi khoa cong tac ca nhan cua moi nguoi. Ghi nguoc vao object user cua
// AuthContext (giong ngon_ngu) de mo lai man nay khong hien trang thai cu.
export function PetSettingsPanel() {
  const auth = useAuth();
  const addToast = useToast();
  const user = auth.status === "authenticated" ? auth.user : null;

  const [caNhan, setCaNhan] = useState(user?.bat_pet_3t ?? true);
  const [heThong, setHeThong] = useState(user?.pet_3t_he_thong ?? true);

  const luuCaNhan = useMutation({
    mutationFn: (bat: boolean) => api.patch("/auth/me", { bat_pet_3t: bat }),
    onSuccess: (_r, bat) => {
      setCaNhan(bat);
      if (user) user.bat_pet_3t = bat;
      addToast(bat ? tr("Đã bật thú cưng 3T Pet") : tr("Đã tắt thú cưng 3T Pet"));
      apDungPet3T(bat && heThong);
    },
    onError: () => addToast(tr("Không lưu được, thử lại sau.")),
  });

  const luuHeThong = useMutation({
    mutationFn: (bat: boolean) => api.patch("/auth/pet-3t-he-thong", { bat }),
    onSuccess: (_r, bat) => {
      setHeThong(bat);
      if (user) user.pet_3t_he_thong = bat;
      addToast(bat ? tr("Đã bật 3T Pet cho toàn hệ thống") : tr("Đã tắt 3T Pet cho toàn hệ thống"));
      apDungPet3T(bat && caNhan);
    },
    onError: () => addToast(tr("Không lưu được, thử lại sau.")),
  });

  if (!user) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{tr("Hiện thú cưng 3T Pet cho tôi")}</div>
          {!heThong && <div className="text-xs text-[var(--ink-400)]">{tr("Admin đã tắt")}</div>}
        </div>
        <ToggleSwitch checked={heThong && caNhan} disabled={!heThong || luuCaNhan.isPending} onChange={() => luuCaNhan.mutate(!caNhan)} />
      </div>
      {user.vai_tro === "Admin" && (
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--line)]">
          <div>
            <div className="text-sm font-semibold">{tr("Bật 3T Pet cho toàn hệ thống (Admin)")}</div>
            <div className="text-xs text-[var(--ink-400)]">{tr("Tắt thì game tắt với tất cả mọi người, bất kể cài đặt cá nhân (áp dụng từ lần tải trang sau của họ).")}</div>
          </div>
          <ToggleSwitch checked={heThong} disabled={luuHeThong.isPending} onChange={() => luuHeThong.mutate(!heThong)} />
        </div>
      )}
    </div>
  );
}
