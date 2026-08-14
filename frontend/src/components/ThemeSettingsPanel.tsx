import { useEffect, useRef, useState } from "react";
import { Btn } from "./ui/Btn";
import { useToast } from "./ui/Toast";
import {
  THEME_PRESETS,
  FONT_OPTIONS,
  DEFAULT_FONT,
  applyThemeColors,
  applyFont,
  deriveAccentShades,
  deriveSidebarShades,
  resolveThemeColors,
  pickRandomPreset,
  pickRandomFont,
  type FontKey,
  type ThemeConfig,
  type ThemeCustomColors,
  type ThemePresetKey,
} from "../theme/presets";
import { loadLocalThemeConfig, saveLocalThemeConfig } from "../theme/localThemeConfig";
import { isSupportedFontFile, saveCustomFont, clearCustomFont, getCustomFontFileName, applyCustomFontFromCache, CUSTOM_FONT_FAMILY } from "../lib/customFont";

const CUSTOM_FIELDS: { key: keyof ThemeCustomColors; label: string }[] = [
  { key: "accent", label: "Nút bấm" },
  { key: "bg", label: "Nền trang" },
  { key: "surface", label: "Thẻ" },
  { key: "topbar", label: "Thanh top" },
  { key: "line", label: "Viền" },
  { key: "ink", label: "Chữ" },
  { key: "sidebarFrom", label: "Menu trái (trên)" },
  { key: "sidebarTo", label: "Menu trái (dưới)" },
];

// Noi dung chon giao dien dung chung: hien tren trang rieng "Giao dien" (module giao-dien).
// Tu 2026-08-13: CHI luu localStorage may nay (khong con PATCH len server) - xem
// theme/localThemeConfig.ts. Vi vay moi thao tac o day AP DUNG NGAY (khong con trang thai
// "dang luu" bat dong bo).
export function ThemeSettingsPanel() {
  const addToast = useToast();
  const [config, setConfig] = useState<ThemeConfig>(() => loadLocalThemeConfig());
  const [customColors, setCustomColors] = useState<ThemeCustomColors>(() => resolveThemeColors(config.preset === "custom" ? config : { preset: "ocean" }));
  const [showCustomEditor, setShowCustomEditor] = useState(config.preset === "custom");
  const [customFontFileName, setCustomFontFileName] = useState<string | null>(null);
  const [customFontBusy, setCustomFontBusy] = useState(false);
  const customFontInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (config.font === "custom") getCustomFontFileName().then(setCustomFontFileName);
  }, [config.font]);

  function persist(next: ThemeConfig) {
    setConfig(next);
    saveLocalThemeConfig(next);
    addToast("Đã lưu giao diện (trên máy này)");
  }

  function currentBaseConfig(): ThemeConfig {
    if (showCustomEditor) return { preset: "custom", custom: customColors, font: config.font };
    const preset = config.preset !== "custom" ? config.preset : "ocean";
    return { preset, font: config.font };
  }

  function pickPreset(key: Exclude<ThemePresetKey, "random">) {
    setShowCustomEditor(key === "custom");
    const next = { ...currentBaseConfig(), preset: key };
    applyThemeColors(resolveThemeColors(next));
    persist(next);
  }

  // Bat che do ngau nhien: moi lan mo lai app se tu doi sang 1 gam mau khac (xem
  // resolveEffectiveThemeConfig trong presets.ts, goi luc app khoi dong). Xem ngay 1 ban preview o
  // day cho nguoi dung biet hieu ung, nhung gia tri LUU LAI la "random" (che do), khong phai mau
  // vua preview.
  function pickRandomColorMode() {
    setShowCustomEditor(false);
    applyThemeColors(resolveThemeColors({ preset: pickRandomPreset() }));
    persist({ ...currentBaseConfig(), preset: "random" });
  }

  function previewField(key: keyof ThemeCustomColors, value: string) {
    let next = { ...customColors, [key]: value };
    if (key === "accent") next = { ...next, ...deriveAccentShades(value), ...deriveSidebarShades(value) };
    setCustomColors(next);
    applyThemeColors(next);
  }

  function saveCustom() {
    persist({ preset: "custom", custom: customColors, font: config.font });
  }

  function pickFont(key: Exclude<FontKey, "random">) {
    applyFont(key);
    persist({ ...currentBaseConfig(), font: key });
  }

  // Tuong tu pickRandomColorMode nhung cho phong chu - doc lap voi che do mau (co the ngau nhien
  // mau + co dinh font, hoac nguoc lai).
  function pickRandomFontMode() {
    applyFont(pickRandomFont());
    persist({ ...currentBaseConfig(), font: "random" });
  }

  // Font tuy chinh: chi luu cache tren trinh duyet nay (xem lib/customFont.ts). Thu load truoc
  // (saveCustomFont da goi FontFace.load() ben trong) de bat som file hong/sai dinh dang - neu loi
  // thi KHONG doi giao dien hien tai, chi bao toast.
  async function handleFontFileChosen(file: File) {
    if (!isSupportedFontFile(file)) {
      addToast("File không đúng định dạng font (.ttf/.otf/.woff/.woff2).");
      return;
    }
    setCustomFontBusy(true);
    try {
      await saveCustomFont(file);
      const ok = await applyCustomFontFromCache();
      if (!ok) throw new Error("APPLY_FAILED");
      setCustomFontFileName(file.name);
      persist({ ...currentBaseConfig(), font: "custom" });
    } catch {
      addToast("Không đọc được file font này, kiểm tra lại file và thử lại.");
    } finally {
      setCustomFontBusy(false);
    }
  }

  async function handleClearCustomFont() {
    await clearCustomFont();
    setCustomFontFileName(null);
    pickFont(DEFAULT_FONT);
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs font-semibold text-[var(--ink-400)] mb-2">Gam màu dựng sẵn</div>
        <div className="grid grid-cols-3 gap-2.5">
          <button
            onClick={pickRandomColorMode}
            className={`focus-ring rounded-xl border p-2.5 text-left transition-colors ${
              config.preset === "random" ? "border-[var(--ocean-500)] ring-1 ring-[var(--ocean-500)]" : "border-[var(--line)] hover:border-[var(--ocean-400)]"
            }`}
          >
            <div className="text-lg mb-1">🎲</div>
            <div className="text-xs font-semibold">Ngẫu nhiên</div>
          </button>
          {THEME_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => pickPreset(p.key)}
              className={`focus-ring rounded-xl border p-2.5 text-left transition-colors ${
                config.preset === p.key && !showCustomEditor ? "border-[var(--ocean-500)] ring-1 ring-[var(--ocean-500)]" : "border-[var(--line)] hover:border-[var(--ocean-400)]"
              }`}
            >
              <div className="flex gap-1 mb-1.5">
                <span className="w-4 h-4 rounded-full inline-block" style={{ background: p.colors.accent }} />
                <span className="w-4 h-4 rounded-full inline-block border border-[var(--line)]" style={{ background: p.colors.bg }} />
                <span className="w-4 h-4 rounded-full inline-block" style={{ background: p.colors.sidebarFrom }} title="Màu menu trái" />
              </div>
              <div className="text-xs font-semibold">{p.label}</div>
            </button>
          ))}
          <button
            onClick={() => {
              setShowCustomEditor(true);
              setCustomColors(resolveThemeColors(config.preset === "custom" ? config : { preset: "ocean" }));
            }}
            className={`focus-ring rounded-xl border p-2.5 text-left transition-colors ${
              showCustomEditor ? "border-[var(--ocean-500)] ring-1 ring-[var(--ocean-500)]" : "border-[var(--line)] hover:border-[var(--ocean-400)]"
            }`}
          >
            <div className="text-lg mb-1">🎨</div>
            <div className="text-xs font-semibold">Tùy chỉnh…</div>
          </button>
        </div>
        <div className="text-[11px] text-[var(--ink-400)] mt-2">
          "Ngẫu nhiên": mỗi lần mở lại ứng dụng sẽ tự đổi sang 1 gam màu khác. Chọn hẳn 1 gam màu (hoặc tự tùy chỉnh) để cố định, không đổi nữa.
        </div>
      </div>

      {showCustomEditor && (
        <div className="anim-in border-t border-[var(--line)] pt-4">
          <div className="text-xs font-semibold text-[var(--ink-400)] mb-2">Tự chọn màu từng vị trí</div>
          <div className="grid grid-cols-2 gap-3">
            {CUSTOM_FIELDS.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-2 border border-[var(--line)] rounded-lg px-2.5 py-1.5">
                <span className="text-xs font-medium">{f.label}</span>
                <input
                  type="color"
                  value={customColors[f.key]}
                  onChange={(e) => previewField(f.key, e.target.value)}
                  className="w-8 h-8 rounded border border-[var(--line)] cursor-pointer"
                />
              </div>
            ))}
          </div>
          <div className="text-[11px] text-[var(--ink-400)] mt-2">Chọn màu nhấn ("Nút bấm") sẽ tự gợi ý lại 2 màu menu trái — chỉnh tiếp riêng nếu muốn khác đi.</div>
          <div className="flex justify-end mt-3">
            <Btn size="sm" onClick={saveCustom}>
              Lưu gam màu tùy chỉnh
            </Btn>
          </div>
        </div>
      )}

      <div className="border-t border-[var(--line)] pt-4">
        <div className="text-xs font-semibold text-[var(--ink-400)] mb-2">Phông chữ</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <button
            onClick={pickRandomFontMode}
            className={`focus-ring rounded-xl border p-2.5 text-left transition-colors ${
              config.font === "random" ? "border-[var(--ocean-500)] ring-1 ring-[var(--ocean-500)]" : "border-[var(--line)] hover:border-[var(--ocean-400)]"
            }`}
          >
            <div className="text-base mb-1">🎲</div>
            <div className="text-xs font-semibold">Ngẫu nhiên</div>
          </button>
          {FONT_OPTIONS.map((f) => (
            <button
              key={f.key}
              onClick={() => pickFont(f.key)}
              style={{ fontFamily: f.stack }}
              className={`focus-ring rounded-xl border p-2.5 text-left transition-colors ${
                config.font === f.key ? "border-[var(--ocean-500)] ring-1 ring-[var(--ocean-500)]" : "border-[var(--line)] hover:border-[var(--ocean-400)]"
              }`}
            >
              <div className="text-base mb-1">Aa Bb</div>
              <div className="text-xs font-semibold" style={{ fontFamily: "inherit" }}>
                {f.label}
              </div>
            </button>
          ))}
          <button
            onClick={() => customFontInputRef.current?.click()}
            disabled={customFontBusy}
            style={config.font === "custom" ? { fontFamily: `"${CUSTOM_FONT_FAMILY}", "Inter", ui-sans-serif, system-ui, sans-serif` } : undefined}
            className={`focus-ring rounded-xl border p-2.5 text-left transition-colors disabled:opacity-50 ${
              config.font === "custom" ? "border-[var(--ocean-500)] ring-1 ring-[var(--ocean-500)]" : "border-[var(--line)] hover:border-[var(--ocean-400)]"
            }`}
          >
            <div className="text-base mb-1">{customFontBusy ? "⏳" : "⇩"}</div>
            <div className="text-xs font-semibold">{customFontBusy ? "Đang tải…" : "Tải font từ máy…"}</div>
          </button>
          <input
            ref={customFontInputRef}
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFontFileChosen(file);
              e.target.value = "";
            }}
          />
        </div>
        <div className="text-[11px] text-[var(--ink-400)] mt-2">
          "Ngẫu nhiên": mỗi lần mở lại ứng dụng sẽ tự đổi sang 1 phông chữ khác. Chọn hẳn 1 phông chữ để cố định, không đổi nữa.
        </div>
        {config.font === "custom" && (
          <div className="flex items-center gap-2 mt-2.5 text-xs text-[var(--ink-400)]">
            <span>
              Đang dùng font riêng: <span className="font-semibold text-[var(--ink-600)]">{customFontFileName ?? "…"}</span>
            </span>
            <button onClick={handleClearCustomFont} className="focus-ring font-semibold text-[var(--coral-500)] hover:underline">
              Xoá, dùng mặc định
            </button>
          </div>
        )}
        <div className="text-[11px] text-[var(--ink-400)] mt-2">
          Font tải từ máy chỉ lưu trên trình duyệt này (không đồng bộ sang máy/trình duyệt khác) — nếu mở ở nơi khác chưa có font này, hệ thống tự dùng lại font mặc định.
        </div>
      </div>
    </div>
  );
}
