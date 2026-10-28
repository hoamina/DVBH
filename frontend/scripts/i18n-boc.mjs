// Codemod i18n (2026-10-28): boc cac chuoi tieng Viet HIEN THI tren giao dien bang tr("...") (src/i18n/tr.ts).
//
//   node frontend/scripts/i18n-boc.mjs [--ghi] [file...]   (mac dinh: chi in thong ke, khong ghi)
//
// CHI boc o cac vi tri chac chan la hien thi - KHONG dong vao so sanh/logic/payload gui server/tieu de Excel:
//  - JSX text (<div>Xin chào</div>)
//  - thuoc tinh JSX trong DANH SACH TRANG (title, placeholder, label, aria-label...)
//  - bieu thuc trong JSX con ({ok ? "Có" : "Không"}) va trong thuoc tinh danh sach trang
//  - gia tri thuoc tinh object co ten trong danh sach trang (label:, title:, header:...)
//  - doi so dau cua addToast/alert/confirm/setError... va new Error(...)
// Template string `Ca ${id}` -> tr("Ca {0}", id). Chay lai nhieu lan an toan (chuoi da boc tr() bi bo qua).
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const VN = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/;

export const ATTR_HIEN_THI = new Set([
  "title", "placeholder", "aria-label", "label", "alt", "emptyText", "emptyLabel", "header", "subtitle", "sub",
  "description", "desc", "hint", "help", "tooltip", "text", "caption", "tieuDe", "moTa", "confirmText", "cancelText",
  "okText", "okLabel", "confirmLabel", "cancelLabel", "message", "loadingText", "note", "info", "unit", "suffix",
  "prefix", "heading", "legend", "labelOn", "labelOff", "buttonLabel", "submitLabel", "chuThich", "goiY", "huongDan",
  "tieuDePhu", "nhan", "noiDung", "giaiThich", "mo_ta_cach_tinh", "cachTinh", "badge", "tag", "emptyMessage",
]);
export const PROP_HIEN_THI = new Set([
  "label", "title", "header", "sub", "subtitle", "desc", "description", "placeholder", "tooltip", "help", "hint",
  "emptyText", "tieuDe", "moTa", "text", "caption", "note", "nhan", "giaiThich", "huongDan", "info", "chuThich",
  "goiY", "tip", "heading", "legend", "unit", "emptyLabel", "cachTinh", "tieuDePhu", "noiDung", "badge", "short",
  "shortLabel", "labelShort", "longLabel", "nhanNgan", "nhanDai", "ten_hien_thi", "tenHienThi", "confirmText",
  "subLabel", "detail", "explain", "giaiThichCachTinh",
]);
export const HAM_HIEN_THI = new Set([
  "addToast", "toast", "alert", "confirm", "prompt", "setError", "setErr", "setLoi", "setMsg", "setMessage",
  "setThongBao", "setNotice", "setInfo", "setWarning", "setCanhBao", "showToast", "notify", "setErrorMsg",
  "setStatusMsg", "setKetQua", "setHint", "setLoiNhap", "setFormError", "setThongBaoLoi",
]);

const coVN = (s) => VN.test(s);

function giaiMaEntity(s) {
  return s
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");
}

// Chuoi hien thi that cua JSX text theo quy tac khoang trang cua JSX.
function jsxTextHienThi(raw) {
  const dong = raw.split(/\r?\n/);
  const out = [];
  dong.forEach((d, i) => {
    let s = d.replace(/\t/g, " ");
    if (i > 0) s = s.replace(/^\s+/, "");
    if (i < dong.length - 1) s = s.replace(/\s+$/, "");
    if (s) out.push(s);
  });
  return giaiMaEntity(out.join(" "));
}

function tenThuocTinh(name) {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function tenHam(expr) {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return null;
}

function laTrCall(node) {
  return node && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "tr";
}

function laSoSanh(node) {
  const p = node.parent;
  if (!p) return false;
  if (ts.isBinaryExpression(p)) {
    const k = p.operatorToken.kind;
    return [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(k);
  }
  if (ts.isCaseClause(p) || ts.isElementAccessExpression(p) || ts.isImportDeclaration(p) || ts.isLiteralTypeNode(p)) return true;
  if (ts.isPropertyAssignment(p) && p.name === node) return true;
  if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && /^(includes|startsWith|endsWith|indexOf|has|get|set|split|replace|match|test)$/.test(p.expression.name.text)) return true;
  return false;
}

export function xuLyFile(file, { ghi = false, epDong = null } = {}) {
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = []; // {start, end, build(render)}
  const daCo = new Set();
  const them = (start, end, build) => {
    const k = `${start}:${end}`;
    if (daCo.has(k)) return;
    daCo.add(k);
    edits.push({ start, end, build });
  };

  // Boc 1 bieu thuc chuoi (literal/template) - tra ve true neu da boc.
  function bocChuoi(node, trongJsxAttr = false) {
    if (!node) return;
    if (ts.isParenthesizedExpression(node)) return bocChuoi(node.expression, trongJsxAttr);
    if (ts.isConditionalExpression(node)) {
      bocChuoi(node.whenTrue);
      bocChuoi(node.whenFalse);
      return;
    }
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) return bocChuoi(node.right);
      if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
        bocChuoi(node.left);
        bocChuoi(node.right);
        return;
      }
      if (op === ts.SyntaxKind.PlusToken) {
        bocChuoi(node.left);
        bocChuoi(node.right);
      }
      return;
    }
    if (laTrCall(node.parent)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!coVN(node.text)) return;
      const s = node.text;
      const core = s.trim();
      const lead = s.slice(0, s.length - s.trimStart().length);
      const trail = s.slice(s.trimEnd().length);
      them(node.getStart(sf), node.getEnd(), () => {
        const goi = `tr(${JSON.stringify(core)})`;
        if (!lead && !trail) return goi;
        return [lead && JSON.stringify(lead), goi, trail && JSON.stringify(trail)].filter(Boolean).join(" + ");
      });
      return;
    }
    if (ts.isTemplateExpression(node)) {
      let khoa = node.head.text;
      node.templateSpans.forEach((sp, i) => {
        khoa += `{${i}}` + sp.literal.text;
      });
      if (!coVN(khoa)) {
        // van boc chuoi long ben trong bien (vd `${ok ? "Có" : "Không"}`)
        node.templateSpans.forEach((sp) => bocChuoi(sp.expression));
        return;
      }
      node.templateSpans.forEach((sp) => bocChuoi(sp.expression));
      const core = khoa.trim();
      const lead = khoa.slice(0, khoa.length - khoa.trimStart().length);
      const trail = khoa.slice(khoa.trimEnd().length);
      them(node.getStart(sf), node.getEnd(), (render) => {
        const args = node.templateSpans.map((sp) => render(sp.expression.getStart(sf), sp.expression.getEnd()));
        const goi = `tr(${JSON.stringify(core)}${args.map((a) => ", " + a).join("")})`;
        if (!lead && !trail) return goi;
        return [lead && JSON.stringify(lead), goi, trail && JSON.stringify(trail)].filter(Boolean).join(" + ");
      });
    }
  }

  function visit(node) {
    if (epDong && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node))) {
      const dong = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      if (epDong.has(dong) && !laSoSanh(node) && !ts.isJsxAttribute(node.parent)) bocChuoi(node);
    }
    if (ts.isJsxText(node)) {
      if (coVN(node.text)) {
        const hien = jsxTextHienThi(node.text);
        const core = hien.trim();
        if (core) {
          const lead = /^\s/.test(hien) ? " " : "";
          const trail = /\s$/.test(hien) ? " " : "";
          them(node.getStart(sf), node.getEnd(), () => `${lead}{tr(${JSON.stringify(core)})}${trail}`);
        }
      }
    } else if (ts.isJsxAttribute(node)) {
      const ten = node.name.getText(sf);
      if (ATTR_HIEN_THI.has(ten) && node.initializer) {
        if (ts.isStringLiteral(node.initializer)) {
          const s = giaiMaEntity(node.initializer.text);
          if (coVN(s)) them(node.initializer.getStart(sf), node.initializer.getEnd(), () => `{tr(${JSON.stringify(s.trim())})}`);
        } else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
          bocChuoi(node.initializer.expression);
        }
      }
    } else if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      bocChuoi(node.expression);
    } else if (ts.isPropertyAssignment(node)) {
      const ten = tenThuocTinh(node.name);
      if (ten && PROP_HIEN_THI.has(ten)) bocChuoi(node.initializer);
    } else if (ts.isCallExpression(node)) {
      const ten = tenHam(node.expression);
      if (ten && HAM_HIEN_THI.has(ten) && node.arguments[0]) bocChuoi(node.arguments[0]);
    } else if (ts.isNewExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === "Error" && node.arguments?.[0]) bocChuoi(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  if (edits.length === 0) return { file, soCho: 0, keys: [] };
  edits.sort((a, b) => a.start - b.start || b.end - a.end);

  // render(start,end): doan nguon [start,end) da ap cac edit nam tron ben trong (ho tro long nhau).
  function render(start, end) {
    let out = "";
    let pos = start;
    for (const e of edits) {
      if (e.start < pos || e.start < start || e.end > end) continue;
      out += text.slice(pos, e.start) + e.build(render);
      pos = e.end;
    }
    return out + text.slice(pos, end);
  }
  let moi = render(0, text.length);

  // import { tr }
  if (!/import\s*\{[^}]*\btr\b[^}]*\}\s*from\s*["'][^"']*i18n\/tr["']/.test(moi)) {
    let rel = path.relative(path.dirname(file), path.join(SRC, "i18n/tr")).replace(/\\/g, "/");
    if (!rel.startsWith(".")) rel = "./" + rel;
    const dongImport = `import { tr } from "${rel}";\n`;
    const sf2 = ts.createSourceFile(file, moi, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const imps = sf2.statements.filter((s) => ts.isImportDeclaration(s));
    const viTri = imps.length ? imps[imps.length - 1].getEnd() + 1 : 0;
    moi = moi.slice(0, viTri) + dongImport + moi.slice(viTri);
  }
  if (ghi) fs.writeFileSync(file, moi, "utf8");
  return { file, soCho: edits.length };
}

function tatCaFile(dir) {
  const out = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) {
      if (d.name === "i18n") continue;
      out.push(...tatCaFile(p));
    } else if (/\.(tsx?)$/.test(d.name) && !d.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

// File KHONG boc: noi dung xuat Excel (tieu de cot Excel giu tieng Viet).
export const BO_QUA = new Set(["lib/exportExcel.ts", "lib/exportTemplate.ts"]);

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const ghi = args.includes("--ghi");
  // --ep <file>: danh sach "duong/dan.tsx:dong" (tuong doi src) - boc MOI chuoi tieng Viet tren dong do (tru so sanh/khoa object)
  const iEp = args.indexOf("--ep");
  const ep = new Map();
  if (iEp >= 0) {
    for (const d of fs.readFileSync(args[iEp + 1], "utf8").split(/\r?\n/)) {
      const m = d.trim().match(/^(.+):(\d+)$/);
      if (!m) continue;
      const f = path.resolve(SRC, m[1]);
      if (!ep.has(f)) ep.set(f, new Set());
      ep.get(f).add(Number(m[2]));
    }
    args.splice(iEp, 2);
  }
  const chiDinh = args.filter((a) => !a.startsWith("--")).map((a) => path.resolve(a));
  const files = (chiDinh.length ? chiDinh : ep.size ? [...ep.keys()] : tatCaFile(SRC)).filter(
    (f) => !BO_QUA.has(path.relative(SRC, f).replace(/\\/g, "/")),
  );
  let tong = 0;
  for (const f of files) {
    const r = xuLyFile(f, { ghi, epDong: ep.get(f) ?? null });
    if (r.soCho) {
      tong += r.soCho;
      console.log(String(r.soCho).padStart(5), path.relative(SRC, f));
    }
  }
  console.log(`Tong: ${tong} cho ${ghi ? "DA GHI" : "(chay thu, them --ghi de ghi)"}`);
}
