// Ghi bu so chot "Tuoi ton TB" (backlog_age_daily_<pham vi>) cho cac ngay chot 08:00 bi loi / thieu (2026-11-21, chu he thong: "Có, tính bù").
// Cach tinh GIONG lib/backlogAgeSnapshot.ts generateBacklogAgeSnapshot: ca ton luc 08:00 ngay D = tiep nhan truoc D 08:00 va (chua dong HOAC
// dong tu D 08:00), bo ca huy; tuoi = CAST(julianday(D 08:00) - julianday(tiep nhan) AS INTEGER); dim tong / khu_vuc (+__nhom_qldvbh__) / tinh
// (tinh + U+001F + tinh_moi) / hang / doi_tac / nhom_kh / ky_thuat_vien. Dim nganh_hang KHONG dung toi (da ghi bu rieng v1.638-1.639).
// Khac so chot that: khu vuc / KTV... lay theo gia tri HIEN TAI cua ca (khong biet gia tri luc 08:00 ngay do), ca huy sau ngay do bi bo.
//
//   node scripts/bu-tuoi-ton-tb.mjs kiem-tra   -> tinh cac ngay DA CO so chot dung, in chenh lech voi so da luu (khong ghi gi)
//   node scripts/bu-tuoi-ton-tb.mjs tao-sql    -> ghi .wrangler/bu-tuoi-ton-tb.sql (DELETE + INSERT cac ngay can bu, cap nhat manifest)
//   roi: npx wrangler d1 execute dvbh-db-smarttrade --remote --config wrangler.smarttrade.jsonc --file .wrangler/bu-tuoi-ton-tb.sql
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const DB = "dvbh-db-smarttrade";
const CONFIG = "wrangler.smarttrade.jsonc";
const MOC_DOC = "2026-11-04 08:00:00"; // ca dong tu moc nay tro di (ngay bu som nhat)

// Pham vi -> loc ca (giong view case_hieu_luc_<pv>) + ngay can bu (do tren production 21/11: thieu, hoac so chot loi 09/11 VN, 10/11 PH).
const NSKX = (r) => r.doi_tac === "NSKX" || r.doi_tac === "[NSKX]";
const PHAM_VI = {
  vn: { loc: (r) => r.quoc_gia === "VN", ngay: ["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-15"] },
  vn_nskx: { loc: (r) => r.quoc_gia === "VN" && NSKX(r), ngay: ["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-09", "2026-11-15"] },
  vn_khong_nskx: { loc: (r) => r.quoc_gia === "VN" && !NSKX(r), ngay: ["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-15"] },
  ph: { loc: (r) => r.quoc_gia === "PH", ngay: ["2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-15"] },
};
// Ngay co so chot that dung de doi chieu cach tinh (che do kiem-tra).
const NGAY_DOI_CHIEU = ["2026-11-10", "2026-11-13", "2026-11-17", "2026-11-20"];

const DIMS = ["khu_vuc", "tinh", "hang", "doi_tac", "nhom_kh", "ky_thuat_vien"];

// Goi thang wrangler.js bang node (khong qua shell: shell Windows tach cau SQL thanh nhieu tham so).
function d1(sql) {
  const out = execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "execute", DB, "--remote", "--config", CONFIG, "--json", "--command", sql], {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
}

function docCa() {
  const cot = "c.quoc_gia, c.doi_tac, c.khu_vuc, c.tinh, c.tinh_moi, c.hang, c.nhom_kh, c.ky_thuat_vien, c.thoi_gian_cskh_tiep_nhan AS tn, julianday(c.thoi_gian_cskh_tiep_nhan) AS jd, c.thoi_gian_hoan_thanh AS ht";
  return d1(
    `SELECT ${cot} FROM case_dvbh c INDEXED BY idx_case_ton WHERE c.thoi_gian_hoan_thanh IS NULL AND c.huy_bo_at IS NULL AND c.archived_at IS NULL ` +
      `UNION ALL SELECT ${cot} FROM case_dvbh c INDEXED BY idx_case_hoan_thanh_not_null WHERE c.thoi_gian_hoan_thanh >= '${MOC_DOC}' AND c.huy_bo_at IS NULL`,
  );
}

/** Dong so chot (dim, gia_tri, tong_tuoi, so_ca) cua 1 ngay cho tap ca da loc pham vi. */
function tinhNgay(ca, ngay) {
  const m = `${ngay} 08:00:00`;
  const jdMoc = Date.parse(`${ngay}T08:00:00Z`) / 86400000 + 2440587.5;
  const gop = new Map();
  const cong = (dim, gt, tuoi) => {
    const k = `${dim}\u0000${gt}`;
    const cu = gop.get(k) ?? [0, 0];
    gop.set(k, [cu[0] + tuoi, cu[1] + 1]);
  };
  let tong = 0;
  let n = 0;
  for (const r of ca) {
    if (!r.tn || r.tn >= m || (r.ht !== null && r.ht < m)) continue;
    const tuoi = r.jd === null ? 0 : Math.trunc(jdMoc - r.jd + 1e-9);
    tong += tuoi;
    n++;
    if ((r.khu_vuc ?? "").toLowerCase().includes("qldvbh")) cong("khu_vuc", "__nhom_qldvbh__", tuoi);
    for (const dim of DIMS) {
      if (dim === "tinh") {
        if ((r.tinh ?? "") !== "" || (r.tinh_moi ?? "") !== "") cong(dim, `${r.tinh ?? ""}\u001f${r.tinh_moi ?? ""}`, tuoi);
      } else if (r[dim] !== null && r[dim] !== undefined && r[dim] !== "") cong(dim, r[dim], tuoi);
    }
  }
  const dong = [["tong", "tat_ca", tong, n]];
  for (const [k, [t, c]] of gop) {
    const i = k.indexOf("\u0000");
    dong.push([k.slice(0, i), k.slice(i + 1), t, c]);
  }
  return dong;
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const che = process.argv[2];
const ca = docCa();
console.log(`Doc ${ca.length} ca`);

if (che === "kiem-tra") {
  for (const [pv, { loc }] of Object.entries(PHAM_VI)) {
    const tap = ca.filter(loc);
    for (const ngay of NGAY_DOI_CHIEU) {
      const moi = new Map(tinhNgay(tap, ngay).map(([d, g, t, n]) => [`${d}|${g}`, [t, n]]));
      const cu = d1(`SELECT dim, gia_tri, tong_tuoi, so_ca FROM backlog_age_daily_${pv} WHERE ngay = '${ngay}' AND dim IN ('tong','khu_vuc')`);
      const tongCu = cu.find((r) => r.dim === "tong");
      const tongMoi = moi.get("tong|tat_ca");
      let lechKv = 0;
      for (const r of cu.filter((r) => r.dim === "khu_vuc")) lechKv += Math.abs((moi.get(`khu_vuc|${r.gia_tri}`)?.[1] ?? 0) - r.so_ca);
      console.log(`${pv} ${ngay}: so ca luu ${tongCu?.so_ca} / tinh ${tongMoi?.[1]} · tong tuoi luu ${tongCu?.tong_tuoi} / tinh ${tongMoi?.[0]} · lech so ca theo khu vuc ${lechKv}`);
    }
  }
} else if (che === "tao-sql") {
  const cau = [];
  for (const [pv, { loc, ngay: dsNgay }] of Object.entries(PHAM_VI)) {
    const tap = ca.filter(loc);
    for (const ngay of dsNgay) {
      const dong = tinhNgay(tap, ngay);
      console.log(`${pv} ${ngay}: ${dong[0][3]} ca, TB ${(dong[0][2] / (dong[0][3] || 1)).toFixed(2)} ngay, ${dong.length} dong`);
      cau.push(`DELETE FROM backlog_age_daily_${pv} WHERE ngay = '${ngay}' AND dim <> 'nganh_hang';`);
      for (let i = 0; i < dong.length; i += 200) {
        const lo = dong.slice(i, i + 200);
        cau.push(`INSERT INTO backlog_age_daily_${pv} (ngay, dim, gia_tri, tong_tuoi, so_ca) VALUES ${lo.map(([d, g, t, n]) => `('${ngay}', ${q(d)}, ${q(g)}, ${t}, ${n})`).join(", ")};`);
      }
    }
    // Doi hash thang de may khach tai lai thang 11 (chot 08:00 ke tiep tinh lai hash dung tu toan bo dong).
    cau.push(`UPDATE backlog_age_month_manifest_${pv} SET hash = hash || '.bu20261121', updated_at = datetime('now') WHERE thang = '2026-11';`);
  }
  writeFileSync(".wrangler/bu-tuoi-ton-tb.sql", cau.join("\n") + "\n");
  console.log(`Ghi .wrangler/bu-tuoi-ton-tb.sql (${cau.length} cau)`);
} else {
  console.log("Dung: node scripts/bu-tuoi-ton-tb.mjs kiem-tra | tao-sql");
}
