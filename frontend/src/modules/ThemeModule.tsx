import { Card } from "../components/ui/Card";
import { PersonalInfoPanel } from "../components/PersonalInfoPanel";
import { ThemeSettingsPanel } from "../components/ThemeSettingsPanel";

export function ThemeModule() {
  return (
    <div className="anim-in space-y-4">
      <Card className="p-4 max-w-2xl">
        <div className="font-display font-bold text-sm mb-1">Thông tin cá nhân</div>
        <div className="text-sm text-[var(--ink-600)] mb-4">Tên gọi và giới tính chỉ dùng để cá nhân hóa lời chào ở đầu trang — không ảnh hưởng tên hiển thị ở nơi khác.</div>
        <PersonalInfoPanel />
      </Card>
      <Card className="p-4 max-w-2xl">
        <div className="font-display font-bold text-sm mb-1">Giao diện</div>
        <div className="text-sm text-[var(--ink-600)] mb-4">Chọn gam màu và phông chữ cho riêng tài khoản của bạn — lưu tự động, không ảnh hưởng người dùng khác.</div>
        <ThemeSettingsPanel />
      </Card>
    </div>
  );
}
