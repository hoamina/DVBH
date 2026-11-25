# CLAUDE.md — DVBH (Worker `dvbh`), bản RÚT GỌN

> File này chỉ giữ luật chính + chỉ đường (giữ **dưới 10 KB** — app chủ trên đám mây đọc mọi kho).
> **Chi tiết đầy đủ** (từng route / lib, cron, chốt tồn, cache báo cáo, ngân sách đọc D1, R2, frontend, i18n, vai trò):
> [`CLAUDE-full.md`](CLAUDE-full.md) — mở khi cần đụng tới mảng tương ứng (tìm theo tên file / tên bảng / `v1.xxx`).
> **Quy ước ghi**: tính năng / quyết định mới → ghi chi tiết vào `CLAUDE-full.md`; ở đây chỉ thêm khi là LUẬT CHUNG mới.

## Hệ thống là gì

Web nội bộ quản lý ca DVBH (dịch vụ bảo hành): SLA, giải trình tồn (`giai_trinh`), vi phạm (`vi_pham`), khảo sát CSKH, doanh thu, và các
luồng phụ (ca trùng, nạp gas, tranh chấp…). Cloudflare Workers (Hono) phục vụ API + frontend tĩnh · D1 là DB duy nhất · R2 cho snapshot
JSON ca đã đóng · Cron Triggers. Chuỗi UI có dấu; cột DB / code không dấu.
**Đọc trước ở phiên mới:** `HANDOFF.md` (logic nghiệp vụ: ratchet, import 4 nhánh, vai trò, lưu trữ), `TONG_HOP_LOGIC.md`, `SRS_tong_hop.md`.

## Lệnh

```bash
npm run dev:worker       # wrangler dev, port 8787, D1 local (.wrangler/state)
npm run dev:frontend     # vite, port 5173
npm run build            # tsc -b + vite build
npm run typecheck --workspace backend
npm run typecheck --workspace frontend
npm run db:migrate:local
# ĐÍCH THẬT — luôn smarttrade:
npm run db:migrate:smarttrade
npm run deploy:smarttrade
npx wrangler d1 migrations list dvbh-db-smarttrade --remote --config wrangler.smarttrade.jsonc
```
Không có test suite — kiểm bằng typecheck + chạy local.

## Luật bắt buộc

1. **Đích deploy LUÔN là `smarttrade`** (`wrangler.smarttrade.jsonc` → Worker `dvbh`, D1 `dvbh-db-smarttrade`, R2 `dvbh-reports-smarttrade`).
   **KHÔNG BAO GIỜ** chạy `npm run deploy` / `db:migrate:remote` (không hậu tố — đích cũ bỏ không).
2. **Tăng `APP_VERSION`** (`frontend/src/version.ts`, +0.001, sửa tay chuỗi) trước mỗi `deploy:smarttrade`.
3. **Commit trước, deploy sau.** Commit xong đẩy `origin` + `etx87` (nhánh mặc định etx87: `docs/module-sua-chua-bao-hanh-plan`);
   không force-push; có commit tự động → `git fetch` + `git merge`.
4. Mỗi lần đổi code, trong CÙNG commit: ghi `nhat_ky_lam_viec.md` (mục mới ở CUỐI file), sửa đè mục liên quan `TONG_HOP_LOGIC.md`
   (+ `SRS_tong_hop.md` nếu yêu cầu đổi), thêm chi tiết vào `CLAUDE-full.md`. Không tạo tài liệu tóm tắt mới khác.
5. Không đẩy bí mật / báo cáo bảo mật lên repo; không ghi khoá / mật khẩu / lỗ hổng vào tài liệu.
6. `assets.run_worker_first: ["/api/*"]` trong CẢ 2 wrangler config là load-bearing — không xoá (`curl` không tái hiện lỗi).
7. **Cache báo cáo theo version-tag**: mọi đường ghi gọi `bumpVersions(db, [...domains])`; endpoint báo cáo bọc `cachedReport(db, key, domains, compute)`.
   Thêm / đổi bảng mà báo cáo đọc → sửa danh sách domain ở `cachedReport()` VÀ `YEU_CAU_BAO_CAO_TINH_SAN.md` (thiếu = trả số cũ mãi mãi).
   Domain `cases` chỉ bump khi import CRM thật.
8. **Ngân sách đọc D1** (từng có sự cố 5,7 triệu dòng/giờ): tính phí theo dòng QUÉT, không theo cột; không tái tạo kiểu `Promise.all` quạt
   hàng nghìn truy vấn trong code chốt tồn (`lib/chotTon.ts` = 1 lần đọc / nhóm quốc gia). Xem `KE_HOACH_TOI_UU_D1.md`.
9. **R2 chỉ có 1 đường ghi** (`recomputeDaDongDayChunks()` ở `daDongDayChunks.ts`). Thêm đường ghi R2 mới phải HỎI chủ hệ thống trước.
10. **Migration**: bảng đang bị FK tham chiếu (vd `users`, ~10 bảng con) KHÔNG dùng kiểu tạo lại bảng (`CREATE x_new` → `DROP` → `RENAME`);
    `grep -rn "REFERENCES <bảng>" migrations/` trước. `ALTER TABLE ADD COLUMN` luôn an toàn. Không bao giờ đổi tên file migration đã áp
    (2 file `0030_*` là cố ý). Xem số migration lớn nhất trong `migrations/` trước khi thêm.
11. `frontend/src/layout/navConfig.ts` `ROLE_MODULES` ↔ `backend/src/lib/moduleAccess.ts` `DEFAULT_MODULES_BY_ROLE` đồng bộ tay.
12. Cron chỉ có 4 trigger (Cloudflare tự bỏ trigger thừa) — thêm việc định kỳ thì gắn vào trigger sẵn có (`index.ts scheduled()`).
13. Giờ VN: `backend/src/lib/vnTime.ts`. Đa ngôn ngữ: chuỗi UI mới bọc `tr("<câu tiếng Việt>")` + thêm vào `i18n/tu-dien.json`, chạy `node frontend/scripts/i18n-kiem-tra.mjs`;
    không bọc giá trị dùng để so sánh / gửi server / làm khoá. Dữ liệu nghiệp vụ không dịch.

## Vai trò & đăng nhập

Google OAuth trong Worker, JWT cookie `dvbh_session`. Đăng nhập mới = "Cho duyet" tới khi Admin duyệt + gán vai trò + khu vực.
9 vai trò (`VAI_TRO_VALUES` ở `types.ts`): Admin, Viewer, QC, Giám sát, TBP DVBH, CSKH, TN CSKH, TBP CSKH, KSNB Đối tác — phạm vi module / khu vực
ở `navConfig.ts`, `moduleAccess.ts` (ghi đè theo người ở `users.modules`) và `HANDOFF.md`.

## Bản đồ mã

- `backend/src/index.ts` — mount router `/api/*`, cron; `routes/*.ts` 1 file / mảng (khớp `frontend/src/modules/`); `lib/*` logic dùng chung
  (`chotTon`, `dataVersions`, `reportCache`, `moduleAccess`, `daDongDayChunks`…); `middleware/` phiên + quyền.
- `frontend/src` — `App.tsx` (trạng thái đăng nhập, `CaseDetail` + `caseStack`), `modules/`, `layout/navConfig.ts`, `api/client.ts`,
  `lib/closedDataCache.ts` (IndexedDB ↔ R2), `i18n/`.
- API đối tác: `PARTNER_API_GUIDE.md`, `HUONG_DAN_API_TRA_CUU_CASE_THEO_ID.md` (app Đặt linh kiện gọi `GET /api/partner/case-lookup` — đừng thêm
  rate-limit chặt cho route này).

## Tài liệu

| File | Nội dung |
|---|---|
| `CLAUDE-full.md` | Toàn bộ chi tiết kỹ thuật (kiến trúc, cron, cache, D1, R2, frontend, vai trò) |
| `HANDOFF.md` | Bối cảnh nghiệp vụ gốc |
| `TONG_HOP_LOGIC.md`, `SRS_tong_hop.md` | Logic đang chạy, đặc tả yêu cầu |
| `nhat_ky_lam_viec.md` | Nhật ký từng đợt (mới nhất ở cuối) |

## Nhận việc từ Trợ lý Mây

- Nhãn `may:phan-tich` = chỉ ĐỌC mã soạn BRD, không sửa. Nhãn `may:tu-sua` = sửa ĐÚNG phạm vi issue `MAY-xxxxx`
  (BRD đã duyệt lưu vào `docs/yeu-cau/MAY-xxxxx.md`).
- Trước PR: `npm run build` phải xanh. Nhánh `may/may-xxxxx`, PR vào `main`, tiêu đề bắt đầu bằng mã, mô tả tiếng Việt
  (nguyên nhân · cách sửa · cách thử), ghi `Closes #<issue>`.
- KHÔNG: sửa secrets / luật bảo mật, deploy trần, đổi tính năng ngoài issue, xoá dữ liệu. Không chắc → bình luận `MÂY: CẦN NGƯỜI` + lý do rồi dừng.
  Deploy do workflow `may-deploy` làm sau khi duyệt — không tự deploy trong lúc sửa.
- Làm trong phiên thường mà giải quyết issue Mây đang mở (`gh issue list --label may:cho-duyet,may:tu-sua`) → ghi mã `MAY-xxxxx` ở dòng đầu commit.
- Ba làn xử lý và luật "máy chạy sai luật = lỗi": xem 2 mục cuối file (workflow Mây tự đồng bộ, không sửa tay).

<!-- may-ba-lan -->
## Ba làn xử lý của Trợ lý Mây (Giám đốc chốt 18/11/2026 — áp dụng VĨNH VIỄN cho app này)
Mỗi việc Mây giao thuộc MỘT trong ba làn. Khi viết ý tưởng / BRD, dòng đầu ghi `**Làn:** nhanh | thường | đầy đủ — <lý do 1 câu>`.
Mây xếp sai thì app ghi đúng làn: app ghi **nhanh** → Mây chuyển ngay sang làn nhanh (không đợi duyệt).
- **Làn nhanh** — xử lý trọn, KHÔNG qua duyệt, vài phút là xong (như Giám đốc chat trực tiếp với phiên này):
  lệnh của Giám đốc · cấp / sửa / thu hồi quyền cho người cụ thể · dữ liệu sai / trùng / kẹt (huỷ mềm, mở lại, đẩy lại, sửa trường có bằng chứng) ·
  thêm / sửa danh mục, cấu hình · lỗi rõ ràng sửa nhỏ không đổi luật · hỏi cách dùng (app đã làm được → hướng dẫn Cách 1 / Cách 2) · lấy số liệu.
  Cách làm: tra dữ liệu thật → ghi dữ liệu qua khối `may-thao-tac` (Mây tự ghi, lưu trước/sau) → sửa luôn nguyên nhân nếu là lỗi mã →
  kiểm → `## BÁO CÁO KẾT QUẢ` (Đã làm · Vì sao bị · Đã sửa · Không đụng tới). Cấp quyền: khai `cap_quyen` { nguoi, vai, vai_cao }.
- **Làn thường** — cải tiến nhỏ (thêm cột / bộ lọc / nút, đổi hiển thị, sắp xếp): ý tưởng + cách làm MỘT bản cụ thể, Giám đốc duyệt 1 lần là làm luôn.
- **Làn đầy đủ** — đổi luật / cách tính, tính năng lớn, đụng tiền / lương / thưởng / công nợ, phân quyền cả nhóm / chức danh, xoá thật,
  hồ sơ nhân sự, Upload Lada: đủ các bước ý tưởng → BRD → thẩm định → Giám đốc duyệt.
Phân vân giữa hai làn → chọn làn CAO hơn (an toàn hơn).

<!-- may-loi-du-lieu -->
## Máy chạy sai luật đã chốt = LỖI, sửa luôn (Giám đốc chốt 22/11/2026 — áp dụng VĨNH VIỄN)
- Dữ liệu / kết quả máy tạo ra sai so với luật Giám đốc đã chốt (đếm sai, chia sai người, lọc sai nhóm…) là **lỗi** → **làn nhanh**:
  sửa cho đúng luật đã chốt, chạy lại hoặc đếm số bản ghi bị sai, báo NGẮN (lỗi gì · vì sao · đã sửa · bao nhiêu bản ghi). Không đụng dữ liệu
  đã đẩy sang hệ thống ngoài (Lada…) — chỉ liệt kê để người điều phối xử lý.
- KHÔNG biến lỗi thành đề xuất đổi luật, KHÔNG hỏi lại Giám đốc điều luật đã chốt, KHÔNG viết dài theo khuôn làn đầy đủ.
- Người báo hỏi thêm việc khác trong cùng báo cáo → ghi 1 dòng "Tách việc riêng: …", không gộp vào bản sửa lỗi.
