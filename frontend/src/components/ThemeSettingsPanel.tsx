import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Btn } from "./ui/Btn";
import { api } from "../api/client";
import { useToast } from "./ui/Toast";
import { useAuth } from "../auth/AuthContext";
import {
  THEME_PRESETS,
  FONT_OPTIONS,
  DEFAULT_FONT,
  applyThemeColors,
  applyFont,
  deriveAccentShades,
  deriveSidebarShades,
  resolveThemeColors,
  type FontKey,
  type ThemeConfig,
  type ThemeCustomColors,
  type ThemePresetKey,
} from "../theme/presets";
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

// Noi dung chon giao dien dung chung: hien tren trang rieng "Giao dien" (module giao-dien),
// khong con ghep chung voi Settings de moi vai tro deu tiep can duoc nhu nhau.
export function ThemeSettingsPanel() {
  const auth = useAuth();
  const addToast = useToast();
  const qc = useQueryClient();
  const currentConfig = auth.status === "authenticated" ? auth.user.theme_config : null;

  const [customColors, setCustomColors] = useState<ThemeCustomColors>(() => resolveThemeColors(currentConfig));
  const [showCustomEditor, setShowCustomEditor] = useState(currentConfig?.preset === "custom");
  const [font, setFont] = useState<FontKey>(currentConfig?.font ?? DEFAULT_FONT);
  const [customFontFileName, setCustomFontFileName] = useState<string | null>(null);
  const [customFontBusy, setCustomFontBusy] = useState(false);
  const customFontInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (font === "custom") getCustomFontFileName().then(setCustomFontFileName);
  }, [font]);

  const save = useMutation({
    mutationFn: (config: ThemeConfig) => api.patch("/auth/me", { theme_config: config }),
    onSuccess: (_d, config) => {
      applyThemeColors(resolveThemeColors(config));
      applyFont(config.font);
      addToast("Đã lưu giao diện");
      qc.invalidateQueries();
    },
    onError: () => addToast("Không lưu được giao diện, thử lại sau."),
  });

  function currentBaseConfig(): ThemeConfig {
    if (showCustomEditor) return { preset: "custom", custom: customColors };
    const preset = (currentConfig?.preset && currentConfig.preset !== "custom" ? currentConfig.preset : "ocean") as ThemePresetKey;
    return { preset };
  }

  function pickPreset(key: (typeof THEME_PRESETS)[number]["key"]) {
    setShowCustomEditor(false);
    save.mutate({ preset: key, font });
  }

  function previewField(key: keyof ThemeCustomColors, value: string) {
    let next = { ...customColors, [key]: value };
    if (key === "accent") next = { ...next, ...deriveAccentShades(value), ...deriveSidebarShades(value) };
    setCustomColors(next);
    applyThemeColors(next);
  }

  function pickFont(key: FontKey) {
    setFont(key);
    applyFont(key);
    save.mutate({ ...currentBaseConfig(), font: key });
  }

  // Font tuy chinh: chi luu cache tren trinh duyet nay (xem lib/customFont.ts), server chi luu
  // marker "custom". Thu load font truoc (saveCustomFont da goi FontFace.load() ben trong) de bat
  // som file hong/sai dinh dang - neu loi thi KHONG doi giao dien hien tai, chi bao toast.
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
      setFont("custom");
      setCustomFontFileName(file.name);
      save.mutate({ ...currentBaseConfig(), font: "custom" });
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
          {THEME_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => pickPreset(p.key)}
              className={`focus-ring rounded-xl border p-2.5 text-left transition-colors ${
                currentConfig?.preset === p.key && !showCustomEditor ? "border-[var(--ocean-500)] ring-1 ring-[var(--ocean-500)]" : "border-[var(--line)] hover:border-[var(--ocean-400)]"
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
            onClick={() => setShowCustomEditor(true)}
            className={`focus-ring rounded-xl border p-2.5 text-left transition-colors ${
              showCustomEditor ? "border-[var(--ocean-500)] ring-1 ring-[var(--ocean-500)]" : "border-[var(--line)] hover:border-[var(--ocean-400)]"
            }`}
          >
            <div className="text-lg mb-1">🎨</div>
            <div className="text-xs font-semibold">Tùy chỉnh…</div>
          </button>
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
            <Btn size="sm" disabled={save.isPending} onClick={() => save.mutate({ preset: "custom", custom: customColors, font })}>
              {save.isPending ? "Đang lưu…" : "Lưu gam màu tùy chỉnh"}
            </Btn>
          </div>
        </div>
      )}

      <div className="border-t border-[var(--line)] pt-4">
        <div className="text-xs font-semibold text-[var(--ink-400)] mb-2">Phông chữ</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {FONT_OPTIONS.map((f) => (
            <button
              key={f.key}
              onClick={() => pickFont(f.key)}
              style={{ fontFamily: f.stack }}
              className={`focus-ring rounded-xl border p-2.5 text-left transition-colors ${
                font === f.key ? "border-[var(--ocean-500)] ring-1 ring-[var(--ocean-500)]" : "border-[var(--line)] hover:border-[var(--ocean-400)]"
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
            style={font === "custom" ? { fontFamily: `"${CUSTOM_FONT_FAMILY}", "Inter", ui-sans-serif, system-ui, sans-serif` } : undefined}
            className={`focus-ring rounded-xl border p-2.5 text-left transition-colors disabled:opacity-50 ${
              font === "custom" ? "border-[var(--ocean-500)] ring-1 ring-[var(--ocean-500)]" : "border-[var(--line)] hover:border-[var(--ocean-400)]"
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
        {font === "custom" && (
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
