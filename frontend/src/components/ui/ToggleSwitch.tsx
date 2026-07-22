export function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`focus-ring w-10 rounded-full transition-colors relative ${checked ? "bg-[var(--teal-500)]" : "bg-slate-300"}`}
      style={{ height: 22 }}
    >
      <span
        className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[20px]" : "translate-x-[2px]"}`}
      ></span>
    </button>
  );
}
