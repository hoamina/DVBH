# Deploy Checklist v1.178 - Settings "Loại đề xuất"

## Trước khi deploy

### 1. Local testing
```bash
# Terminal 1: Start backend (port 8787)
npm run dev:worker

# Terminal 2: Start frontend (port 5173)
npm run dev:frontend

# Terminal 3: Check migration applied locally
npx wrangler d1 execute dvbh-db --local --command="SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'settings_loai_de_xuat%'"
```

### 2. Typechecks
```bash
npm run typecheck --workspace frontend  # ✅ clean
npm run typecheck --workspace backend   # ✅ clean
```

### 3. Version bump
- [x] `frontend/src/version.ts`: 1.176 → 1.178

## Deploy commands (ĐÚNG THỨ TỰ)

```bash
# Step 1: Apply migration to REMOTE DB first
npm run db:migrate:smarttrade

# Step 2: Deploy code
npm run deploy:smarttrade
```

## Sau khi deploy - verify

1. Check version footer: "Phiên bản 1.178"
2. Settings → tab "Loại đề xuất" có hiện không?
3. Thử tạo nhóm mới (Admin only)
4. Module "Đặt mua linh kiện" → tab "Tạo đơn" → dropdown "Loại đề xuất" có options không?
5. Tạo thử 1 phiếu đặt → không còn INTERNAL_ERROR

## Rollback nếu lỗi

```bash
# KHÔNG rollback migration (data đã seed)
# Chỉ rollback code:
git revert HEAD
npm run deploy:smarttrade
```

## Changes summary

**Migration 0061**: `settings_loai_de_xuat_nhom` + `settings_loai_de_xuat` tables
- 2 nhóm seed: "KTV & Vệ tinh" (25 options) + "Admin / TBP DVBH" (24 options)

**Backend** (`routes/settings.ts`):
- `GET /settings/loai-de-xuat/nhom` - list nhóm
- `POST /settings/loai-de-xuat/nhom` - tạo nhóm (adminOnly)
- `PATCH /settings/loai-de-xuat/nhom/:id` - sửa nhóm (adminOnly)
- `GET /settings/loai-de-xuat?since=` - incremental sync
- `POST /settings/loai-de-xuat` - thêm option (adminOnly)
- `PATCH /settings/loai-de-xuat/:id` - sửa option (adminOnly)
- `DELETE /settings/loai-de-xuat/:id` - xóa option (adminOnly)
- Fix: `vai_tro_json` accept string (đã JSON.stringify từ frontend)

**Frontend**:
- `lib/loaiDeXuatCache.ts` - IndexedDB cache (pattern giống `linhKienCache.ts`)
- `SettingsModule.tsx` - tab "Loại đề xuất" mới
- `DatMuaLinhKienModule.tsx` - dùng cache thay vì hardcode constants

## Known issues

Không có issue đã biết. Nếu gặp lỗi INTERNAL_ERROR:
1. Check migration đã apply chưa: `npx wrangler d1 migrations list dvbh-db-smarttrade --remote --config wrangler.smarttrade.jsonc`
2. Check seed data: `npx wrangler d1 execute dvbh-db-smarttrade --remote --command="SELECT COUNT(*) FROM settings_loai_de_xuat" --config wrangler.smarttrade.jsonc`
