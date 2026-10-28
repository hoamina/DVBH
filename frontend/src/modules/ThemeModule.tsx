import { Card } from "../components/ui/Card";
import { PersonalInfoPanel } from "../components/PersonalInfoPanel";
import { ThemeSettingsPanel } from "../components/ThemeSettingsPanel";
import { PetSettingsPanel } from "../components/PetSettingsPanel";
import { tr } from "../i18n/tr";

export function ThemeModule() {
  return (
    <div className="anim-in space-y-4">
      <Card className="p-4 max-w-2xl">
        <div className="font-display font-bold text-sm mb-1">{tr("Thông tin cá nhân")}</div>
        <div className="text-sm text-[var(--ink-600)] mb-4">{tr("Tên gọi và giới tính chỉ dùng để cá nhân hóa lời chào ở đầu trang — không ảnh hưởng tên hiển thị ở nơi khác.")}</div>
        <PersonalInfoPanel />
      </Card>
      <Card className="p-4 max-w-2xl">
        <div className="font-display font-bold text-sm mb-1">{tr("Giao diện")}</div>
        <div className="text-sm text-[var(--ink-600)] mb-4">{tr("Chọn gam màu và phông chữ — chỉ lưu trên máy/trình duyệt này (không đồng bộ sang máy khác, không ảnh hưởng người dùng khác).")}</div>
        <ThemeSettingsPanel />
      </Card>
      <Card className="p-4 max-w-2xl">
        <div className="font-display font-bold text-sm mb-1">{tr("Thú cưng 3T Pet")}</div>
        <div className="text-sm text-[var(--ink-600)] mb-4">{tr("Tắt thì game không tải và không chạy trên máy bạn. Lưu theo tài khoản.")}</div>
        <PetSettingsPanel />
      </Card>
    </div>
  );
}
