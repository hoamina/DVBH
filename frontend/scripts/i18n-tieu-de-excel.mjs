// Liet ke NHAN COT EXCEL (tieng Viet) chua co trong i18n/tu-dien.json (2026-11-19).
// Tieu de file tai ve dich luc ghi file (lib/excelChung.ts tieuDeExcel) -> nhan chua co trong tu dien se giu tieng Viet.
// Quet: (1) object nhan cot `key: "Nhan"` trong cac khoi *LABELS* / *_EXPORT_* / exportRowsToExcel(..., {...}); (2) khoa chuoi
// "Nhan": gia tri trong cac ham tao dong xuat (out["..."] / { "Nhan": ... }). Chi lay chuoi co dau tieng Viet.
// Chay: node frontend/scripts/i18n-tieu-de-excel.mjs [--json]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const goc = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const tuDien = JSON.parse(fs.readFileSync(path.join(goc, "i18n", "tu-dien.json"), "utf8"));
const CO_DAU = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀ-ỹĐ]/;

function* tep(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) yield* tep(p);
    else if (/\.(ts|tsx)$/.test(e.name)) yield p;
  }
}

const thieu = new Map(); // nhan -> Set(file:dong)
for (const p of tep(goc)) {
  const dong = fs.readFileSync(p, "utf8").split(/\r?\n/);
  // Vung "nhan cot": tu dong chua tu khoa toi dong dong "}" cung muc thut (don gian: 400 dong sau tu khoa, dung o "};"/"})").
  let trongVung = 0;
  dong.forEach((l, i) => {
    if (/LABELS?\b|_EXPORT_|exportLabels|ExportLabels|exportRowsToExcel\(|exportRows|out\[|COT_EXCEL|nhanCot|tieuDe/i.test(l)) trongVung = 120;
    if (trongVung <= 0) return;
    trongVung--;
    if (/\btr\(/.test(l) && !/:\s*tr\(/.test(l)) {
      // chuoi da boc tr() o vi tri render - bo qua phan do
    }
    const cacChuoi = [
      ...[...l.matchAll(/:\s*"([^"\\]{2,80})"/g)].map((m) => m[1]), // key: "Nhan"
      ...[...l.matchAll(/"([^"\\]{2,80})"\s*:/g)].map((m) => m[1]), // "Nhan": gia tri
      ...[...l.matchAll(/out\[\s*"([^"\\]{2,80})"\s*\]/g)].map((m) => m[1]),
    ];
    for (const s of cacChuoi) {
      if (!CO_DAU.test(s) || tuDien[s]) continue;
      if (/^[a-z_]+$/.test(s)) continue;
      const k = thieu.get(s) ?? new Set();
      k.add(`${path.relative(goc, p).replace(/\\/g, "/")}:${i + 1}`);
      thieu.set(s, k);
    }
  });
}

const ds = [...thieu.entries()].sort((a, b) => a[0].localeCompare(b[0], "vi"));
if (process.argv.includes("--json")) console.log(JSON.stringify(ds.map(([k]) => k), null, 1));
else {
  for (const [k, v] of ds) console.log(`${k}\t${[...v].slice(0, 2).join(", ")}`);
  console.log(`\n${ds.length} nhan chua co ban dich`);
}
