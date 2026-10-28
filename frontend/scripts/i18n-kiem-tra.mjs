// Kiem tra i18n (2026-10-28):
//   node frontend/scripts/i18n-kiem-tra.mjs            -> liet ke cau trong tr("...") CHUA co trong src/i18n/tu-dien.json
//   node frontend/scripts/i18n-kiem-tra.mjs --json     -> in cac cau chua dich dang JSON mau (de dich roi gop vao tu dien)
//   node frontend/scripts/i18n-kiem-tra.mjs --con-lai  -> liet ke chuoi tieng Viet CHUA boc tr() (de ra soat bang tay)
//   node frontend/scripts/i18n-kiem-tra.mjs --thua     -> cau trong tu dien khong con dung trong code
//     (binh thuong co vai cau "thua" co y: gia tri lua chon dang chuoi cua <Select> nhu "Tất cả nhóm KH" - Select tu
//      dich bang tr(bien) luc hien thi, nen khong co tr("...") nao trong code; dung xoa nhung cau do)
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BO_QUA } from "./i18n-boc.mjs";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const TU_DIEN = path.join(SRC, "i18n/tu-dien.json");
const VN = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/;

function tatCaFile(dir) {
  const out = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) {
      if (d.name !== "i18n") out.push(...tatCaFile(p));
    } else if (/\.tsx?$/.test(d.name) && !d.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

const khoa = new Map(); // cau -> [file:dong]
const conLai = [];
for (const file of tatCaFile(SRC)) {
  const rel = path.relative(SRC, file).replace(/\\/g, "/");
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const dong = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "tr") {
      const a = node.arguments[0];
      if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) {
        if (!khoa.has(a.text)) khoa.set(a.text, []);
        khoa.get(a.text).push(`${rel}:${dong(node)}`);
      }
      node.arguments.slice(1).forEach(visit); // tr() long trong tham so cua tr() khac
      return; // khong xet chuoi khoa ben trong tr()
    }
    if (!BO_QUA.has(rel)) {
      if (ts.isJsxText(node) && VN.test(node.text)) conLai.push([rel, dong(node), "jsx", node.text.trim().replace(/\s+/g, " ")]);
      else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && VN.test(node.text)) {
        const p = node.parent;
        let ngu = ts.SyntaxKind[p.kind];
        if (ts.isPropertyAssignment(p)) ngu = `prop:${p.name.getText(sf)}`;
        else if (ts.isJsxAttribute(p)) ngu = `attr:${p.name.getText(sf)}`;
        else if (ts.isCallExpression(p)) ngu = `call:${p.expression.getText(sf).slice(-30)}`;
        conLai.push([rel, dong(node), ngu, node.text]);
      } else if (ts.isTemplateExpression(node) && VN.test(node.getText(sf))) {
        conLai.push([rel, dong(node), `tpl<${ts.SyntaxKind[node.parent.kind]}>`, node.getText(sf).slice(0, 120)]);
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const tuDien = fs.existsSync(TU_DIEN) ? JSON.parse(fs.readFileSync(TU_DIEN, "utf8")) : {};
const args = process.argv.slice(2);
if (args.includes("--con-lai")) {
  for (const [f, d, ngu, s] of conLai) console.log(`${f}:${d}\t${ngu}\t${s}`);
  console.log(`\n${conLai.length} chuoi tieng Viet chua boc tr()`);
} else if (args.includes("--thua")) {
  const thua = Object.keys(tuDien).filter((k) => !khoa.has(k));
  thua.forEach((k) => console.log(k));
  console.log(`\n${thua.length} cau thua`);
} else {
  const thieu = [...khoa.keys()].filter((k) => !tuDien[k] || !tuDien[k][0] || !tuDien[k][1]);
  if (args.includes("--json")) console.log(JSON.stringify(Object.fromEntries(thieu.map((k) => [k, ["", ""]])), null, 1));
  else {
    for (const k of thieu) console.log(`${khoa.get(k)[0]}\t${k}`);
    console.log(`\n${khoa.size} cau dung tr(), ${thieu.length} cau chua dich`);
  }
}
