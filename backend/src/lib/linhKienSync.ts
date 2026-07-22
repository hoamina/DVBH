/**
 * Dong bo danh muc linh kien tu Google Sheet publish dang TSV.
 * Cot theo thu tu thuc te: Ma linh kien, Ten linh kien, Gia ban, ANH DEMO,
 * NGUOI CAP NHAT (email ngoai he thong CRM), NGAY CAP NHAT (DD/MM/YYYY HH:MM[:SS]).
 */

export interface SheetRow {
  maLinhKien: string;
  tenLinhKien: string;
  giaBan: number | null;
  anhDemo: string | null;
  nguoiCapNhat: string | null;
  ngayCapNhat: string | null;
}

export interface SyncSummary {
  moi: number;
  capNhat: number;
  boQua: number;
  loi: number;
}

const CHUNK_SIZE_SELECT = 100;
const CHUNK_SIZE_BATCH = 500;

/** "[040-079]" -> "040-079"; giu nguyen neu khong co dau ngoac */
function stripBrackets(raw: string): string {
  const trimmed = raw.trim();
  const m = trimmed.match(/^\[(.*)\]$/);
  return (m ? m[1] : trimmed).trim();
}

/** "11/04/2025 13:48:28" hoac "21/05/2026 14:58" -> "2025-04-11 13:48:28" */
function parseSheetDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min, ss] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")} ${hh.padStart(2, "0")}:${min}:${ss ?? "00"}`;
}

export function parseTsv(tsvText: string): SheetRow[] {
  const lines = tsvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: SheetRow[] = [];
  // Dong dau la header, bo qua
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    const maRaw = cols[0] ?? "";
    if (!maRaw.trim()) continue;
    const gia = Number(cols[2]);
    rows.push({
      maLinhKien: stripBrackets(maRaw),
      tenLinhKien: (cols[1] ?? "").trim(),
      giaBan: Number.isFinite(gia) ? gia : null,
      anhDemo: (cols[3] ?? "").trim() || null,
      nguoiCapNhat: (cols[4] ?? "").trim() || null,
      ngayCapNhat: parseSheetDate(cols[5] ?? ""),
    });
  }
  return rows;
}

export async function syncLinhKienFromSheet(db: D1Database, sheetUrl: string): Promise<SyncSummary> {
  const res = await fetch(sheetUrl);
  if (!res.ok) throw new Error(`Khong tai duoc Google Sheet (HTTP ${res.status})`);
  const tsvText = await res.text();
  const parsedRows = parseTsv(tsvText);

  // Sheet co the chua ma linh kien trung lap (nguoi nhap lieu them lai) - giu dong cuoi cung
  // gap nhau de tranh 2 cau INSERT cung PRIMARY KEY trong cung 1 batch.
  const dedupByMa = new Map<string, SheetRow>();
  for (const row of parsedRows) dedupByMa.set(row.maLinhKien, row);
  const sheetRows = Array.from(dedupByMa.values());

  const existingByMa = new Map<string, { ten_linh_kien: string; gia_ban: number | null; anh_demo: string | null }>();
  const allMa = sheetRows.map((r) => r.maLinhKien);
  for (let i = 0; i < allMa.length; i += CHUNK_SIZE_SELECT) {
    const chunk = allMa.slice(i, i + CHUNK_SIZE_SELECT);
    if (chunk.length === 0) continue;
    const placeholders = chunk.map(() => "?").join(", ");
    const { results } = await db
      .prepare(`SELECT ma_linh_kien, ten_linh_kien, gia_ban, anh_demo FROM linh_kien WHERE ma_linh_kien IN (${placeholders})`)
      .bind(...chunk)
      .all<{ ma_linh_kien: string; ten_linh_kien: string; gia_ban: number | null; anh_demo: string | null }>();
    for (const row of results) {
      existingByMa.set(row.ma_linh_kien, row);
    }
  }

  const summary: SyncSummary = { moi: 0, capNhat: 0, boQua: 0, loi: 0 };
  const statements: D1PreparedStatement[] = [];

  for (const row of sheetRows) {
    if (!row.maLinhKien || !row.tenLinhKien) {
      summary.loi++;
      continue;
    }
    const existing = existingByMa.get(row.maLinhKien);

    if (!existing) {
      summary.moi++;
    } else {
      const changed = existing.ten_linh_kien !== row.tenLinhKien || existing.gia_ban !== row.giaBan || existing.anh_demo !== row.anhDemo;
      if (!changed) {
        summary.boQua++;
        continue;
      }
      summary.capNhat++;
    }

    // Dung upsert (khong phai INSERT/UPDATE rieng) de an toan tuyet doi voi PRIMARY KEY,
    // ke ca khi existingByMa vo tinh khong khop chinh xac trang thai that trong DB
    // (vd do 1 lan chay truoc bi loi giua chung, hoac sheet co ma trung sau khi de-dup).
    statements.push(
      db
        .prepare(
          `INSERT INTO linh_kien (ma_linh_kien, ten_linh_kien, gia_ban, anh_demo, nguoi_cap_nhat, ngay_cap_nhat, bat_tat)
           VALUES (?, ?, ?, ?, ?, ?, 1)
           ON CONFLICT(ma_linh_kien) DO UPDATE SET
             ten_linh_kien = excluded.ten_linh_kien,
             gia_ban = excluded.gia_ban,
             anh_demo = excluded.anh_demo,
             nguoi_cap_nhat = excluded.nguoi_cap_nhat,
             ngay_cap_nhat = excluded.ngay_cap_nhat`,
        )
        .bind(row.maLinhKien, row.tenLinhKien, row.giaBan, row.anhDemo, row.nguoiCapNhat, row.ngayCapNhat ?? new Date().toISOString()),
    );
  }

  for (let i = 0; i < statements.length; i += CHUNK_SIZE_BATCH) {
    const chunk = statements.slice(i, i + CHUNK_SIZE_BATCH);
    if (chunk.length > 0) await db.batch(chunk);
  }

  return summary;
}
