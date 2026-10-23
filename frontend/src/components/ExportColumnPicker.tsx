import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Btn } from "./ui/Btn";
import { applyExportTemplate, clearExportTemplate, loadExportTemplate, saveExportTemplate } from "../lib/exportTemplate";

// Bang chon cot truoc khi tai Excel (CHOT 2026-10-23) - mo qua pickExportColumns() tu lib/exportExcel.ts (ham xuat
// duoc goi tu ~36 noi, ngoai cay React) nen tu tao 1 React root rieng gan vao body, dong la go bo. Chi xu ly tren
// may nguoi dung: mau luu localStorage (lib/exportTemplate.ts), khong goi server.

type Item = { col: string; on: boolean };

function ExportColumnPicker({
  filename,
  columns,
  tplKey,
  onDone,
}: {
  filename: string;
  columns: string[];
  tplKey: string;
  onDone: (cols: string[] | null) => void;
}) {
  const coMau = useMemo(() => !!loadExportTemplate(tplKey), [tplKey]);
  const [items, setItems] = useState<Item[]>(() => applyExportTemplate(columns, loadExportTemplate(tplKey)));
  const [ghiNho, setGhiNho] = useState(true);
  const [tim, setTim] = useState("");
  const [keoIdx, setKeoIdx] = useState<number | null>(null);

  const soBat = items.filter((i) => i.on).length;
  const timThuong = tim.trim().toLowerCase();

  const doiCho = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    setItems((prev) => {
      const next = [...prev];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      return next;
    });
  };
  const datTatCa = (on: boolean) => setItems((prev) => prev.map((i) => ({ ...i, on })));

  const taiTheoLuaChon = () => {
    if (ghiNho) saveExportTemplate(tplKey, { order: items.map((i) => i.col), hidden: items.filter((i) => !i.on).map((i) => i.col) });
    onDone(items.filter((i) => i.on).map((i) => i.col));
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-3" onMouseDown={(e) => e.target === e.currentTarget && onDone(null)}>
      <div className="w-full max-w-lg max-h-[88vh] flex flex-col rounded-xl bg-[var(--surface,white)] shadow-2xl border border-[var(--line)]">
        <div className="px-4 pt-4 pb-2 border-b border-[var(--line)]">
          <div className="font-display font-bold text-[var(--ink-900)]">Chọn cột tải về</div>
          <div className="text-xs text-[var(--ink-400)] mt-0.5 truncate" title={filename}>
            {filename} · {soBat}/{items.length} cột{coMau ? " · đang dùng mẫu đã lưu" : ""}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <input
              value={tim}
              onChange={(e) => setTim(e.target.value)}
              placeholder="Tìm cột…"
              className="focus-ring flex-1 bg-[var(--surface-100)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
            />
            <button type="button" className="text-xs font-semibold text-[var(--ocean-600)] hover:underline" onClick={() => datTatCa(true)}>
              Chọn hết
            </button>
            <button type="button" className="text-xs font-semibold text-[var(--ocean-600)] hover:underline" onClick={() => datTatCa(false)}>
              Bỏ hết
            </button>
          </div>
          <div className="text-[11px] text-[var(--ink-400)] mt-1">Kéo thả (≡) hoặc bấm ↑ ↓ để đổi vị trí cột.</div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-1">
          {items.map((it, idx) => {
            if (timThuong && !it.col.toLowerCase().includes(timThuong)) return null;
            return (
              <div
                key={it.col}
                draggable={!timThuong}
                onDragStart={() => setKeoIdx(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (keoIdx !== null) doiCho(keoIdx, idx);
                  setKeoIdx(null);
                }}
                onDragEnd={() => setKeoIdx(null)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-[var(--surface-100)] ${keoIdx === idx ? "opacity-40" : ""}`}
              >
                <span className={`select-none text-[var(--ink-400)] ${timThuong ? "opacity-30" : "cursor-grab"}`} title="Kéo để đổi vị trí">
                  ≡
                </span>
                <input type="checkbox" checked={it.on} onChange={() => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, on: !x.on } : x)))} />
                <span className={`flex-1 truncate ${it.on ? "text-[var(--ink-900)]" : "text-[var(--ink-400)] line-through"}`} title={it.col}>
                  {it.col}
                </span>
                <button type="button" className="px-1 text-[var(--ink-400)] hover:text-[var(--ink-900)] disabled:opacity-20" disabled={idx === 0} onClick={() => doiCho(idx, idx - 1)}>
                  ↑
                </button>
                <button type="button" className="px-1 text-[var(--ink-400)] hover:text-[var(--ink-900)] disabled:opacity-20" disabled={idx === items.length - 1} onClick={() => doiCho(idx, idx + 1)}>
                  ↓
                </button>
              </div>
            );
          })}
        </div>

        <div className="px-4 py-3 border-t border-[var(--line)] space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <label className="flex items-center gap-1.5 text-[var(--ink-600)]">
              <input type="checkbox" checked={ghiNho} onChange={(e) => setGhiNho(e.target.checked)} />
              Ghi nhớ lựa chọn cho lần tải sau (trên máy này)
            </label>
            <button
              type="button"
              className="font-semibold text-[var(--ocean-600)] hover:underline"
              onClick={() => {
                clearExportTemplate(tplKey);
                setItems(columns.map((col) => ({ col, on: true })));
              }}
            >
              Khôi phục mặc định
            </button>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Btn variant="ghost" size="sm" onClick={() => onDone(null)}>
              Hủy
            </Btn>
            <Btn variant="subtle" size="sm" onClick={() => onDone(columns)}>
              Tải mặc định
            </Btn>
            <Btn size="sm" disabled={soBat === 0} onClick={taiTheoLuaChon}>
              Tải theo lựa chọn
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Mo bang chon cot, tra ve danh sach cot (dung thu tu) can xuat, hoac null neu nguoi dung huy. */
export function pickExportColumns(filename: string, columns: string[], tplKey: string): Promise<string[] | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (cols: string[] | null) => {
      root.unmount();
      host.remove();
      resolve(cols);
    };
    root.render(<ExportColumnPicker filename={filename} columns={columns} tplKey={tplKey} onDone={done} />);
  });
}
