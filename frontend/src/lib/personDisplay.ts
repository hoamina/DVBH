import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

// Danh ba email -> ten hien thi DUNG CHUNG TOAN HE THONG (phan hoi 2026-08-19: "Toàn bộ hệ thống
// nếu tạo thông tin người dùng có tên => sẽ ưu tiên hiện tên dưới dạng Tên (mail). Riêng với
// KTV/Trạm/CTV sẽ hiện tên KTV (mail)"). Nguon: GET /api/auth/nguoi-directory (chi can dang nhap,
// khong gioi han theo vai_tro/module - khac GET /api/users (Admin-only) va endpoint KTV rieng cua
// module "Dat mua linh kien" (khoa theo requireDatMuaLkArea), ca 2 deu KHONG dung chung duoc cho
// moi module khac trong app).
export interface PersonDirectory {
  users: Map<string, string>;
  ktv: Map<string, string>;
}

export function usePersonDirectory(): PersonDirectory {
  const { data } = useQuery({
    queryKey: ["nguoi-directory"],
    queryFn: () => api.get<{ users: { email: string; ten: string }[]; ktv: { email: string; ten_hien_thi: string }[] }>("/auth/nguoi-directory"),
    staleTime: 5 * 60 * 1000,
  });
  return {
    users: new Map((data?.users ?? []).map((r) => [r.email, r.ten])),
    ktv: new Map((data?.ktv ?? []).map((r) => [r.email, r.ten_hien_thi])),
  };
}

// Uu tien ten KTV (do CSKH/Admin bien tap rieng trong "Danh sách KTV đã khai báo", thuong sat thuc
// te hon ten Google) truoc ten users.ten (tu dong dien tu profile Google luc dang nhap) - CHOT theo
// dung yeu cau "Riêng với KTV/Trạm/CTV sẽ hiện tên KTV". Khong tim thay o ca 2 -> tra nguyen email.
export function formatPersonDisplay(email: string | null | undefined, dir: PersonDirectory): string {
  if (!email) return "—";
  const ten = dir.ktv.get(email) ?? dir.users.get(email);
  return ten ? `${ten} (${email})` : email;
}
