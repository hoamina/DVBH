// Menu rieng "Báo cáo theo ngành" (2026-11-20, chu he thong: "tách menu riêng" cho nhan vien lay so nhanh). Dung lai nguyen
// components/BaoCaoNganhCard (cung API GET /dashboard/bao-cao-nganh); man nay chi them o chon ky Tháng / Tuần + cong tac SLA cu/moi
// NGAY TREN BAO CAO. Ky + bo loc Ngành / Hãng / Khu vực deu luu tren may (localStorage, khoa rieng "filters:bao-cao-nganh-*").
// Quyen: ai xem duoc "dashboard" thi tu co menu nay (App.tsx + backend moduleAccess.effectiveModules).
import { Select } from "../components/ui/Select";
import { BaoCaoNganhCard } from "../components/BaoCaoNganhCard";
import { SlaCheDoToggle, useSlaCheDo } from "../components/SlaCheDoToggle";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { isoWeekOf, isoWeekRange, isoWeeksInYear } from "../lib/isoWeek";
import { tr } from "../i18n/tr";

const homNayVn = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const ngayVn = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const truNgay = (iso: string, n: number) => new Date(Date.parse(iso) - n * 86400000).toISOString().slice(0, 10);
const thangSau = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return `${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, "0")}`;
};

export function BaoCaoNganhModule() {
  const tuanNay = isoWeekOf();
  const thangNay = homNayVn().slice(0, 7);
  const [cheDoKy, setCheDoKy] = useLocalStorageState<"tuan" | "thang">("filters:bao-cao-nganh-ky", "tuan");
  const [tuanChon, setTuanChon] = useLocalStorageState("filters:bao-cao-nganh-tuan", "");
  const [thangChon, setThangChon] = useLocalStorageState("filters:bao-cao-nganh-thang", "");
  // Rong = tuan / thang hien tai (luon "troi" theo ngay, khong ket o ky cu khi mo lai hom sau).
  const [y, w] = (tuanChon || `${tuanNay.year}-${tuanNay.week}`).split("-").map(Number);
  const thang = /^\d{4}-\d{2}$/.test(thangChon) ? thangChon : thangNay;
  const laTuanNay = y === tuanNay.year && w === tuanNay.week;

  const ky = (() => {
    if (cheDoKy === "tuan") {
      const r = isoWeekRange(y, w);
      return { tu: r.tu_ngay, den: r.den_ngay };
    }
    return { tu: `${thang}-01`, den: `${thangSau(thang)}-01` };
  })();
  const sla = useSlaCheDo(ky.tu);

  const chonTuan = (t: { year: number; week: number }) => setTuanChon(t.year === tuanNay.year && t.week === tuanNay.week ? "" : `${t.year}-${t.week}`);
  const doiTuan = (buoc: number) => {
    const t = isoWeekOf(new Date(Date.parse(ky.tu) + buoc * 7 * 86400000).toISOString().slice(0, 10));
    if (t.year > tuanNay.year || (t.year === tuanNay.year && t.week > tuanNay.week)) return;
    chonTuan(t);
  };
  const tuanOptions = [tuanNay.year, tuanNay.year - 1].flatMap((nam) =>
    Array.from({ length: isoWeeksInYear(nam) }, (_, i) => i + 1)
      .filter((t) => nam < tuanNay.year || t <= tuanNay.week)
      .reverse()
      .map((t) => {
        const r = isoWeekRange(nam, t);
        const nay = nam === tuanNay.year && t === tuanNay.week;
        return { value: `${nam}-${t}`, label: `${tr("Tuần {0}/{1}", t, nam)} · ${ngayVn(r.tu_ngay)}–${ngayVn(truNgay(r.den_ngay, 1))}${nay ? ` (${tr("tuần này")})` : ""}` };
      }),
  );
  const thangOptions = Array.from({ length: 13 }, (_, i) => {
    const [ny, nm] = thangNay.split("-").map(Number);
    const d = new Date(Date.UTC(ny, nm - 1 - i, 1));
    const v = d.toISOString().slice(0, 7);
    return { value: v, label: `${tr("Tháng {0}", `${v.slice(5, 7)}/${v.slice(0, 4)}`)}${i === 0 ? ` (${tr("tháng hiện tại")})` : ""}` };
  });

  const kyLabel =
    cheDoKy === "tuan"
      ? `${tr("Tuần {0}/{1}", w, y)} · ${ngayVn(ky.tu)} → ${ngayVn(truNgay(ky.den, 1))}`
      : tr("Tháng {0}", `${thang.slice(5, 7)}/${thang.slice(0, 4)}`);
  const nutO = "px-2 py-1.5 rounded-lg border border-[var(--line)] text-sm hover:bg-[var(--surface-100)] disabled:opacity-40";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex rounded-lg border border-[var(--line)] overflow-hidden text-sm" role="group" aria-label={tr("Xem theo")}>
          {(["tuan", "thang"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setCheDoKy(k)}
              className={`px-3 py-1.5 ${cheDoKy === k ? "bg-[var(--ocean-600)] text-white font-semibold" : "bg-white text-[var(--ink-600)] hover:bg-[var(--surface-100)]"}`}
            >
              {k === "thang" ? tr("Theo tháng") : tr("Theo tuần")}
            </button>
          ))}
        </div>
        {cheDoKy === "tuan" ? (
          <>
            <button type="button" className={nutO} title={tr("Tuần trước")} onClick={() => doiTuan(-1)}>◀</button>
            <Select value={`${y}-${w}`} onChange={(v) => { const [a, b] = v.split("-"); chonTuan({ year: Number(a), week: Number(b) }); }} options={tuanOptions} />
            <button type="button" className={nutO} title={tr("Tuần sau")} disabled={laTuanNay} onClick={() => doiTuan(1)}>▶</button>
            {!laTuanNay && (
              <button type="button" className="px-2 py-1.5 rounded-lg text-sm font-semibold text-[var(--ocean-600)] hover:underline" onClick={() => chonTuan(tuanNay)}>
                {tr("Tuần này")}
              </button>
            )}
          </>
        ) : (
          <Select value={thang} onChange={(v) => setThangChon(v === thangNay ? "" : v)} options={thangOptions} />
        )}
        <span className="ml-2 text-xs font-semibold text-[var(--ink-400)]">{tr("Cách tính SLA:")}</span>
        <SlaCheDoToggle value={sla.cheDo} onChange={sla.setCheDo} khoa={sla.khoa} />
        {sla.khoa && <span className="text-xs text-[var(--ink-400)]">{tr("SLA mới chỉ tính từ tháng 11/2026")}</span>}
      </div>
      <BaoCaoNganhCard tuNgay={ky.tu} denNgay={ky.den} sla={sla.apDung} kyLabel={kyLabel} />
    </div>
  );
}
