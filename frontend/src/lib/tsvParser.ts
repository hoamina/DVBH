// Parser TSV (tab-separated) co ho tro truong bao trong dau ngoac kep ("..."), giong quy uoc CSV
// nhung dau phan cach la tab thay vi dau phay - Google Sheets "pub?output=tsv" bao truong theo cach
// nay khi noi dung co chua tab/xuong dong/dau ngoac kep, split("\t")/split("\n") don gian se lam
// lech hang.
export interface ParsedTsv {
  headers: string[];
  rows: Record<string, string>[];
}

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    // Dau ngoac kep CHI danh dau bat dau truong duoc bao khi no la ky tu DAU TIEN cua truong (field
    // con rong) - dung quy uoc CSV/TSV chuan. Neu khong kiem tra field === "", 1 dau ngoac kep don
    // le nam GIUA noi dung khong duoc bao (vd ghi chu "12" ống nước" - dau ngoac lien quan don vi,
    // khong phai bao truong) se lam parser nham lan chuyen sang che do "trong ngoac kep", nuot mat
    // tab/xuong dong cho den khi gap dau ngoac ke tiep, lam sai lech ca so hang lan noi dung -
    // chinh la nguyen nhan gay mat ~50% so dong khi kiem thu thuc te voi sheet "xu ly thieu hang".
    if (ch === '"' && field === "") {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === "\t") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // dong cuoi khong co "\n" ket thuc
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function parseTsv(text: string): ParsedTsv {
  const rows = parseRows(text);
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1).filter((r) => r.some((cell) => cell.trim() !== ""));
  return {
    headers,
    rows: dataRows.map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = (r[idx] ?? "").trim();
      });
      return obj;
    }),
  };
}
