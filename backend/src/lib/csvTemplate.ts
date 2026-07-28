import type { Context } from "hono";

// U+FEFF (BOM UTF-8) - viet bang escape ﻿ (khong go ky tu tho truc tiep) de tranh bi mat/sai
// lech qua cac lop encoding trung gian (editor, git, terminal) vi day la ky tu khong hien thi.
const UTF8_BOM = "﻿";

/**
 * Tra ve file .csv voi BOM UTF-8 o dau noi dung - Excel (dac biet ban Windows, trinh doc CSV pho
 * bien nhat cua nguoi dung noi bo) khong tu nhan dang duoc encoding UTF-8 khi mo file .csv TRUC
 * TIEP tren may (bang cach double-click) NEU thieu BOM, du HTTP response header da khai bao dung
 * "charset=utf-8" - Excel doc file cuc bo bo qua header nay, chi doc/doan encoding qua vai byte dau
 * file. Thieu BOM => tieu de/gia tri tieng Viet co dau (vd "DANH GIA NAP GAS" co dau) hien thi mo
 * (mojibake). BOM la giai phap chuan cho van de nay, duoc Excel/LibreOffice/Google Sheet deu nhan
 * dang dung - hau het trinh doc/parser CSV khac (bao gom SheetJS dung o ImportUploader.tsx frontend)
 * tu dong bo qua BOM khi doc lai, nen KHONG anh huong nguoc lai luong import file mau da tai ve.
 */
export function csvTemplateResponse(c: Context, csv: string, filename: string) {
  return c.body(UTF8_BOM + csv, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename=${filename}`,
  });
}
