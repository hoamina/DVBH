export function ToggleSwitch({ checked, onChange, disabled = false }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={disabled ? undefined : onChange}
      disabled={disabled}
      className={`focus-ring w-10 rounded-full transition-colors relative ${checked ? "bg-[var(--teal-500)]" : "bg-slate-300"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      style={{ height: 22 }}
    >
      <span
        className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[20px]" : "translate-x-[2px]"}`}
      ></span>
    </button>
  );
}
