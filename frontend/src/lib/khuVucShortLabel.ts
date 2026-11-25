/**
 * Rut gon ten khu vuc de tiet kiem dien tich hien thi (bang bao cao, pivot, dropdown, cot Khu vuc...)
 * ap dung TOAN HE THONG - CHOT 2026-08-06 theo yeu cau chu he thong. CHI doi nhan HIEN THI, KHONG
 * doi gia tri that (case_dvbh.khu_vuc, filter query param, khu_vuc_phu_trach...) - cac cho do van
 * phai dung nguyen chuoi CRM goc de khop dung logic scope/filter/permission.
 * Khu vuc khong co trong bang nay (CRM them moi/doi ten) tra ve nguyen chuoi goc - khong mat du lieu.
 */
export const KHU_VUC_SHORT_LABELS: Record<string, string> = {
  "(qldvbh.mb1) Quản lý khu vực MB1": "MB1",
  "(qldvbh.mb2) Quản lý khu vực MB2": "MB2",
  "(qldvbh.mb3) Quản lý khu vực MB3": "MB3",
  "(qldvbh.mn1) Quản lý khu vực MN1": "MN1",
  "(qldvbh.mn2) Quản lý khu vực MN2": "MN2",
  "(qldvbh.mn3) Quản lý khu vực MN3": "MN3",
  "(qlkddv.3t) Quản lý kinh doanh dịch vụ": "KDDV",
  "(qlb2b.b2b-mn) Quản lý B2B Miền Bắc": "B2B MB",
  "(qlb2b.b2b-mn) Quản lý B2B Miền Nam": "B2B MN",
  // CRM doi ma B2B tu 10/2026 (xem KHU_VUC_GOP ben duoi) - ma moi cung nhan rut gon voi ma cu (2026-11-20).
  "(qlb2b.b2b-mb) Quản lý B2B Miền Nam": "B2B MN",
  "(qlb2b.b2b-mb) Quản lý B2B Miền Bắc": "B2B MB",
  "Phòng bảo hành 3T miền Bắc": "SCVP MB",
  "Phòng bảo hành 3T miền Nam": "SCVP MN",
};

export function shortKhuVuc(raw: string | null | undefined): string {
  if (!raw) return "—";
  return KHU_VUC_SHORT_LABELS[raw] ?? raw;
}

/** Thu tu CO DINH cua khu vuc tren moi bao cao (2026-11-20, chu he thong: "tu dong sort cac khu vuc… khong de sap xep lung tung"):
 * MB1-3, MN1-3, roi B2B, KDDV, SCVP; khu vuc khac xep sau theo ten (A-Z, so tu nhien). */
const THU_TU_KHU_VUC = ["MB1", "MB2", "MB3", "MN1", "MN2", "MN3", "B2B MB", "B2B MN", "KDDV", "SCVP MB", "SCVP MN"];

/** So sanh 2 ten nhom: khu vuc (ten goc hoac ten rut gon) theo THU_TU_KHU_VUC; con lai (KTV, tinh, doi tac...) A-Z tieng Viet,
 * so tu nhien ("Trạm 2" < "Trạm 10"). Dung cho moi bang xep theo nhom. */
export function soSanhNhom(a: string | null | undefined, b: string | null | undefined): number {
  const ten = (x: string | null | undefined) => shortKhuVuc(khuVucGop(x ?? "")) || "";
  const ta = ten(a);
  const tb = ten(b);
  const ia = THU_TU_KHU_VUC.indexOf(ta);
  const ib = THU_TU_KHU_VUC.indexOf(tb);
  if (ia !== ib) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  return ta.localeCompare(tb, "vi", { numeric: true, sensitivity: "base" });
}

/**
 * Gop khu vuc "la" ve khu vuc chuan DE HIEN THI bao cao theo khu vuc (2026-11-19, chu he thong chon "gop vao khu vuc chuan"):
 *  - CRM doi ma B2B tu 10/2026: "(qlb2b.b2b-mb) Quản lý B2B Miền Nam" (moi) = "(qlb2b.b2b-mn) Quản lý B2B Miền Nam" (cu); tuong tu
 *    Mien Bac nguoc lai. KHONG doi du lieu (quyen GS dang gan theo ca 2 ma) - chi gop dong khi hien thi.
 *  - Tai khoan CTV/TEST bi ghi vao cot khu vuc: du lieu da sua ve khu vuc chuan (migration 0177 + importProcessor), nhung so chot
 *    theo ngay da luu (giai_trinh_daily_log...) van mang ten cu -> gop o day.
 * Khu vuc khong co trong bang -> giu nguyen.
 */
export const KHU_VUC_GOP: Record<string, string> = {
  "(qlb2b.b2b-mb) Quản lý B2B Miền Nam": "(qlb2b.b2b-mn) Quản lý B2B Miền Nam",
  "(qlb2b.b2b-mb) Quản lý B2B Miền Bắc": "(qlb2b.b2b-mn) Quản lý B2B Miền Bắc",
  "(huydg.bn-mb) CTV Bắc Ninh - Đào Gia Huy - NS-3919": "(qldvbh.mb3) Quản lý khu vực MB3",
  "(huydg.bn-mb) CTV Bắc Ninh - Đào Gia Huy - NS-3919 - NS-3919": "(qldvbh.mb3) Quản lý khu vực MB3",
  "(hoant.hd-mb) CTV Hải Dương - Nguyễn Thị Hoa - NS - 3959": "(qldvbh.mb3) Quản lý khu vực MB3",
  "(gskv.test) GS Khu Vực-TEST": "(teamkdbl.krf) Kinh doanh bán lẻ KRF",
};

// Gia tri ghi thang bang ten rut gon ("MB2", "B2B MN"...) -> ten day du (khu vuc chuan dau tien co nhan do).
const TEN_DAY_DU_THEO_NHAN: Record<string, string> = {};
for (const [goc, nhan] of Object.entries(KHU_VUC_SHORT_LABELS)) if (!(nhan in TEN_DAY_DU_THEO_NHAN) && !(goc in KHU_VUC_GOP)) TEN_DAY_DU_THEO_NHAN[nhan] = goc;

export function khuVucGop(raw: string): string {
  return KHU_VUC_GOP[raw] ?? TEN_DAY_DU_THEO_NHAN[raw] ?? raw;
}

/** Tai khoan CTV/TEST ghi nham vao cot khu vuc: KHONG gop vao khu vuc chuan o cac bang SO CHOT THEO NGAY (2026-11-23, chu he thong
 * "Bỏ gộp ngày cũ"). Luc chot, ca do nam o khu vuc rieng nen Giam sat khu vuc chuan khong thay de giai trinh, Telegram 17:30 cung
 * khong tinh vao - gop lai se phat oan khu vuc chuan (vd MB3 17/11: chot 22/22, gop thanh 22/23). Tu 20/11 du lieu da ve khu vuc
 * chuan (migration 0177) nen khong con dong ten CTV/TEST moi. B2B doi ma van gop (GS duoc gan ca 2 ma nen luc do van thay ca). */
const KHONG_GOP_SO_CHOT = new Set(Object.keys(KHU_VUC_GOP).filter((k) => !k.startsWith("(qlb2b.")));

/** Gop cac dong { khu_vuc, days: [{ ngay, ...so }] } co cung khu vuc chuan - cong cac cot so theo tung ngay.
 * Chi dung cho bang so chot theo ngay. Dong CTV/TEST (KHONG_GOP_SO_CHOT) BI AN (2026-11-25, v1.654, chu he thong "Ẩn dòng CTV"):
 * khong gop vao khu vuc chuan (v1.652) va cung khong hien dong rieng -> Tổng cộng / luy ke (cong tu cac dong tren trinh duyet) cung
 * khong tinh ca do, khop anh Telegram 17:30. */
export function gopDongTheoKhuVuc<D extends { ngay: string }, R extends { khu_vuc: string; days: D[] }>(rows: R[]): R[] {
  const theo = new Map<string, R>();
  for (const r of rows) {
    if (KHONG_GOP_SO_CHOT.has(r.khu_vuc)) continue;
    const k = khuVucGop(r.khu_vuc);
    const cu = theo.get(k);
    if (!cu) {
      theo.set(k, { ...r, khu_vuc: k, days: r.days.map((d) => ({ ...d })) });
      continue;
    }
    for (const d of r.days) {
      const dd = cu.days.find((x) => x.ngay === d.ngay);
      if (!dd) { cu.days.push({ ...d }); continue; }
      for (const [key, v] of Object.entries(d)) {
        if (typeof v === "number") (dd as Record<string, unknown>)[key] = (Number((dd as Record<string, unknown>)[key]) || 0) + v;
      }
    }
  }
  return [...theo.values()];
}

/** Gop cac dong bao cao THEO KHU VUC co cung khu vuc chuan (khuVucGop) thanh 1 dong (2026-11-20, chu he thong: "báo cáo có lựa chọn
 * khu vực đang nhảy nhầm khu vực"). `cong(nhom, kvChuan)` cong cac dong cua 1 nhom (tinh lai ty le tu tu/mau). Dong tra ve co `_kv` =
 * cac ma goc noi bang dau phay (backend khuVucAdHocClause nhan nhieu gia tri) - dung khi bam dong de loc / drill-down, khong mat ca cua
 * ma cu. Nhom chi 1 dong giu nguyen dong goc (chi doi khu_vuc ve ma chuan qua `cong`). Bo khu vuc an khoi bao cao sau khi gop
 * (vd "(gskv.test)" -> KRF ban le). Ket qua da xep theo thu tu co dinh (soSanhNhom). */
export function gopTheoKhuVuc<T>(rows: T[], layKv: (r: T) => string, cong: (nhom: T[], kvChuan: string) => T, anKhoi: readonly string[] = []): (T & { _kv: string })[] {
  const theo = new Map<string, T[]>();
  for (const r of rows) {
    const k = khuVucGop(layKv(r) ?? "");
    const ds = theo.get(k);
    if (ds) ds.push(r);
    else theo.set(k, [r]);
  }
  return [...theo.entries()]
    .filter(([k]) => !anKhoi.includes(k))
    .map(([k, ds]) => ({ ...(ds.length === 1 && layKv(ds[0]) === k ? ds[0] : cong(ds, k)), _kv: [...new Set(ds.map(layKv))].join(",") }))
    .sort((a, b) => soSanhNhom(layKv(a), layKv(b)));
}

/** Gop 1 map { khu_vuc goc: {so...} } theo khu vuc chuan - cong cac truong so (nong). Dung cho payload so chot theo khu vuc. */
export function gopMapTheoKhuVuc<V extends object>(map: Record<string, V> | undefined): Record<string, V> {
  const out: Record<string, V> = {};
  for (const [kv, v] of Object.entries(map ?? {})) {
    const k = khuVucGop(kv);
    const cu = out[k] as Record<string, unknown> | undefined;
    if (!cu) { out[k] = { ...v }; continue; }
    for (const [f, x] of Object.entries(v as Record<string, unknown>)) if (typeof x === "number") cu[f] = (Number(cu[f]) || 0) + x;
  }
  return out;
}

/** { khu vuc chuan: "ma goc 1,ma goc 2" } tu danh sach ma goc - de bam 1 dong da gop van loc dung ca cac ma cu. */
export function maGocTheoKhuVuc(dsGoc: Iterable<string>): Record<string, string> {
  const theo: Record<string, Set<string>> = {};
  for (const g of dsGoc) (theo[khuVucGop(g)] ??= new Set()).add(g);
  return Object.fromEntries(Object.entries(theo).map(([k, s]) => [k, [...s].join(",")]));
}
