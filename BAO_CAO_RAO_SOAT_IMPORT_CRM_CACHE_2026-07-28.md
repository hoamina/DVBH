# Rà soát import CRM hằng ngày, snapshot và cache

**Phạm vi:** rà soát tĩnh mã nguồn trong working tree ngày 28-07-2026. Báo cáo không truy cập được D1/R2 production, vì vậy không thể xác nhận số liệu/snapshot thực tế sau ngày 25; các mục đó cần kiểm chứng bằng truy vấn vận hành ở phần cuối.

## Kết luận ngắn

Luồng import CRM hiện tại đã tránh được lỗi N+1: đọc trước theo `id` từng lô 100 và ghi theo `db.batch()` lô 500. Quy tắc nghiệp vụ cơ bản cũng đúng: không có `id` thì thêm, dữ liệu nghiệp vụ khác thì ghi đè, trùng thì bỏ qua.

Tuy nhiên nó **chưa tối ưu theo yêu cầu giảm đọc/ghi**: mỗi lần preview và commit đều đọc `SELECT *` cho toàn bộ ID trong file; các ca chưa hoàn thành nhưng không thay đổi vẫn bị `UPDATE` chỉ để cập nhật mốc thời gian. Sau commit có thay đổi, 5 chuỗi xử lý nền được kích hoạt song song, trong đó có các quét/tính lại lớn. Đây là nguồn chi phí lớn hơn chính lệnh UPSERT.

Snapshot JSON cho cache máy người dùng **mới chỉ có trong mã chưa commit/deploy**. Nó dùng R2, không phải D1, không nén gzip, và chỉ phủ hai tập dữ liệu (ca đã đóng theo ngày, ứng viên khảo sát), chưa phải “tất cả các thẻ báo cáo”. Điều này giải thích hợp lý việc từ ngày 25 chưa thấy JSON mới trong hệ thống đang chạy.

## Luồng đang có

```text
Import CRM (preview hoặc commit)
  -> SELECT * case_dvbh WHERE id IN (...) [mỗi 100 ID]
  -> so sánh JavaScript từng dòng
  -> commit: INSERT / UPDATE theo batch 500
  -> nếu GHI_MOI + GHI_DE > 0, chạy nền song song:
       1. refresh ca lặp
       2. tính lại dashboard filters/months
       3. bump version cases + warm báo cáo mặc định
       4. dựng JSON R2 ca đã đóng cho các ngày bị ảnh hưởng
       5. dựng JSON R2 ứng viên khảo sát
```

Các điểm mã chính: `backend/src/lib/importProcessor.ts`, `backend/src/routes/importRoute.ts`, `backend/src/lib/daDongDayChunks.ts`, `backend/src/lib/surveySnapshot.ts`.

## 1. Đối chiếu ID và chi phí đọc/ghi

### Đánh giá hiện trạng

| Quy tắc mong muốn | Hiện trạng | Đánh giá |
| --- | --- | --- |
| ID mới → thêm | `INSERT` | Đúng |
| ID có sẵn, business field khác → ghi đè | `UPDATE` toàn bộ business field | Đúng |
| Hoàn toàn giống → bỏ qua | Ca đã hoàn thành: bỏ qua; ca chưa hoàn thành: vẫn `UPDATE` mốc thời gian và cờ ratchet | Chưa đúng mục tiêu giảm ghi |
| Preview | Chạy toàn bộ bước đọc/so sánh giống commit | Hợp lý để hiển thị số liệu, nhưng preview rồi commit làm đọc lại 2 lần |

`SELECT *` đang lấy toàn bộ cột của `case_dvbh` chỉ để so sánh. Ngoài payload lớn, cùng một file được đọc hai lần khi người dùng bấm preview rồi commit. `db.batch()` chỉ giảm round-trip; nó không biến 500 thay đổi hàng thành một lần ghi logic duy nhất.

### Không nên gộp tất cả dữ liệu vào một ô JSON

Không nên lưu toàn bộ CRM thành một dòng JSON để đổi lấy “một read/write”. Cách này làm mất index/query SQL cho báo cáo, gây tranh chấp khi nhiều dòng thay đổi, buộc đọc/ghi cả khối lớn khi chỉ sửa một case, khó kiểm toán và có rủi ro giới hạn kích thước. Nó đổi loại chi phí chứ không giải quyết đúng bài toán.

### Phương án khuyến nghị: hash chuẩn hoá theo dòng

Thêm cột `crm_hash` (SHA-256) cho `case_dvbh`, được tạo từ **các business field đã chuẩn hoá đúng như lúc ghi**. Không đưa các cột kỹ thuật như `updated_at`, `ngay_import`, `ngay_cap_nhat_gan_nhat` vào hash. Cần xử lý riêng các cờ ratchet vì chúng không được phép tự giảm từ `1` về `0`.

Luồng đề xuất:

1. Khử trùng `id` ngay trong file (quy định rõ: dòng cuối thắng hoặc báo lỗi trùng).
2. Chuẩn hoá dữ liệu và tính `incoming_hash` tại worker.
3. Chỉ đọc các cột cần thiết: `id, crm_hash, thoi_gian_hoan_thanh, seri_san_pham, loi_*`. Không dùng `SELECT *`.
4. `crm_hash` khớp và không có cờ ratchet nào cần nâng → `BO_QUA`, không ghi.
5. Hash khác → `UPDATE` dữ liệu và `crm_hash`; ID mới → `INSERT` kèm hash.
6. Với ca mở cần lưu “lần nhìn thấy trong file”, dùng một cột riêng như `last_seen_import_at`, chỉ cập nhật khi thực sự cần nghiệp vụ đó. Không để cột này làm cache/report/snapshot bị coi là dữ liệu CRM đã đổi.

Hash không làm một file N dòng thành một lần đọc: vẫn cần biết hash của N ID. Nhưng nó giảm mạnh dữ liệu đọc, chi phí so sánh và đặc biệt loại bỏ `UPDATE` không cần thiết. Với D1, đây là hướng đúng hơn blob JSON.

### Chồng chéo cần xử lý

1. `preview` rồi `commit` đọc cùng tập ID hai lần. Cách đơn giản và an toàn: trả một `previewToken` chứa hash file + thời hạn ngắn; commit dùng lại quyết định preview nếu token còn hợp lệ. Nếu dữ liệu có thể bị sửa đồng thời, commit vẫn kiểm tra lại hash/version tối thiểu trước ghi.
2. File có ID trùng chưa được khử trùng trong `processImport`. Có thể sinh nhiều `UPDATE` cùng ID trong một batch, sai số đếm và kết quả phụ thuộc thứ tự dòng. Cần chặn hoặc gộp trước khi truy vấn.
3. Nhánh `CAP_NHAT_MOC_THOI_GIAN` ghi lại mọi case đang mở dù business data không đổi. Đây là write amplification rõ nhất. Cần xác nhận nghiệp vụ có bắt buộc ghi “đã xuất hiện trong file hôm nay” không; nếu không, bỏ nhánh ghi này.
4. Dữ liệu thay đổi kích hoạt đồng thời refresh ca lặp, cache dashboard, warm nhiều báo cáo, hai loại snapshot R2. Có chủ đích, nhưng cần một hàng đợi/đợt refresh có `import_run_id` và trạng thái để tránh import kế tiếp chồng lên import trước và để quan sát lỗi.

## 2. JSON tĩnh cho cache máy người dùng

### Đã hoạt động chưa?

Trong working tree, logic có mặt nhưng chưa phải bằng chứng nó đang chạy production:

- Các file `daDongDayChunks.ts`, `surveySnapshot.ts`, migrations `0029`, `0030_r2_snapshot_manifest.sql`, binding `REPORTS` trong `wrangler.jsonc` đều là file mới/chưa được commit theo `git status`.
- Chỉ import CRM có `GHI_MOI + GHI_DE > 0` mới gọi dựng snapshot, thông qua `waitUntil`. Lần import toàn `BO_QUA` hoặc chỉ `CAP_NHAT_MOC_THOI_GIAN` sẽ không tạo JSON.
- Không có backfill cho dữ liệu trước khi tính năng được triển khai. Do đó import ngày 25 mà không phát sinh ghi mới/ghi đè sẽ không tạo snapshot cho dữ liệu cũ.
- `waitUntil` chạy sau khi API đã trả thành công; lỗi R2/D1 ở nền hiện không được ghi vào `import_history` hay bảng job. Người dùng thấy import thành công nhưng snapshot có thể thất bại im lặng.
- JSON hiện là `JSON.stringify(...)` rồi `R2.put(...)`, không nén gzip/brotli. R2 cũng là object storage, không phải database D1.

### Hai snapshot hiện có

| Snapshot | Khi ghi | Nội dung | Cache máy |
| --- | --- | --- | --- |
| `da-dong/day/YYYY-MM-DD.json` | CRM có `GHI_MOI/GHI_DE`; chỉ các ngày bị ảnh hưởng | `case_dvbh` đã đóng, theo ngày | IndexedDB, so SHA-256 qua manifest |
| `survey/candidates.json` | CRM có `GHI_MOI/GHI_DE` | Case còn mở/có cờ vi phạm | IndexedDB, so SHA-256 qua manifest |

Hash manifest là thiết kế hợp lý: client chỉ tải nội dung khi hash khác. Tuy vậy, server vẫn phải dựng lại payload để tính hash sau mỗi import có thay đổi; đây là đánh đổi chấp nhận được nếu chỉ tạo một lần/đợt import.

### Cách kiểm chứng vận hành

Sau deploy + migration, kiểm tra:

```sql
SELECT * FROM da_dong_chunk_manifest ORDER BY updated_at DESC LIMIT 20;
SELECT * FROM r2_snapshot_manifest;
SELECT ten_file, ghi_moi, ghi_de, bo_qua, thoi_gian FROM import_history ORDER BY thoi_gian DESC LIMIT 20;
```

Đồng thời kiểm tra object tương ứng trong bucket `dvbh-reports`. Nếu manifest trống trong khi import có `ghi_moi + ghi_de > 0`, cần xem log Worker của tác vụ `waitUntil`.

## 3. Dùng chung dữ liệu tĩnh cho các thẻ báo cáo

Ý tưởng “tính một lần sau import, người dùng chỉ đọc cache” là hợp lý cho dữ liệu tĩnh. Hệ thống hiện có hai mức nhưng chưa đồng nhất:

- **D1 `precomputed_cache` + `data_versions`:** nhiều endpoint báo cáo đã cache JSON tính sẵn theo version domain. Endpoint vẫn đọc ít nhất cache/version mỗi lần, nhưng không chạy SQL nặng khi version khớp. `warmDefaultReports()` tính trước các biến thể mặc định sau import.
- **R2 + IndexedDB:** chỉ áp dụng cho danh sách chi tiết đã đóng và ứng viên khảo sát. Đây mới là mức tránh tải lại dữ liệu lớn về máy người dùng.

Không nên buộc tất cả thẻ dùng một “cache toàn cục” duy nhất. Cache phải chia theo **dataset, tham số, phạm vi quyền và version phụ thuộc**. Ví dụ scope khu vực của Giám sát phải là một phần cache key, nếu không có thể lộ dữ liệu ngoài quyền.

Kiến trúc nên chốt:

1. Báo cáo tổng hợp/card nhỏ: D1 `precomputed_cache`, key gồm endpoint + params + scope + version domain. Warm các mặc định sau import; biến thể hiếm tính lazy một lần.
2. Bảng chi tiết lớn, ít đổi: snapshot R2 theo partition tự nhiên (ngày/tháng/khu vực), manifest hash trong D1, IndexedDB client. Không snapshot cả `case_dvbh` nếu UI không cần tải hết.
3. Dữ liệu động trong ngày (giải trình, gán CSKH, trạng thái vi phạm): tách thành dataset/version riêng, không làm invalid snapshot CRM tĩnh.
4. Một registry mô tả cache (`key`, domains, scope, kiểu dữ liệu, trigger) để tránh endpoint cùng dữ liệu nhưng tự cache theo cách khác nhau.

## 4. Vấn đề phát hiện và mức ưu tiên

### P0 — cần xử lý trước khi tin vào snapshot

1. Mã snapshot/R2 và migrations đang nằm trong thay đổi chưa commit/deploy. Cần deploy worker, áp migrations, rồi backfill snapshot lần đầu có kiểm soát.
2. Không có trạng thái/ghi lỗi cho background snapshot. Cần bảng `snapshot_jobs` hoặc ghi vào `import_history` với `snapshot_status`, `started_at`, `finished_at`, `error`; retry idempotent theo `import_run_id`.

### P1 — giảm đọc/ghi import

1. Thêm `crm_hash`, đổi `SELECT *` thành projection tối thiểu, bỏ `UPDATE` cho case mở không đổi nếu không có yêu cầu nghiệp vụ bắt buộc.
2. Khử trùng ID trong file trước khi preview/commit.
3. Chống chạy chồng các refresh nền: serialise theo `import_run_id` hoặc debounce/coalesce các import gần nhau.
4. Backfill snapshot một lần sau deploy; không trông chờ import “không thay đổi” tự dựng lịch sử.

### P2 — hoàn thiện cache và quan sát

1. Nén payload snapshot khi kích thước lớn (gzip/brotli hoặc dùng `CompressionStream` phù hợp Worker), lưu `contentEncoding`/phiên bản schema trong manifest; đo trước/sau rồi mới bật.
2. Ghi metrics: số ID input/unique, số row đọc, số insert/update/skip, thời lượng từng pha, số snapshot đã ghi/bỏ qua, bytes R2.
3. Soát lại lịch sử migration: hiện có cả `0030_revert_thoi_gian_wallclock_utc.sql` và `0030_r2_snapshot_manifest.sql`. Cần đặt số migration duy nhất, tăng dần trước khi áp remote để tránh thứ tự/đánh dấu migration không rõ ràng.

## Thứ tự triển khai đề xuất

1. Không deploy phần snapshot riêng lẻ: chốt migration unique, deploy đầy đủ binding R2 + worker + migrations.
2. Thêm job log và lệnh backfill có giới hạn; chạy thử một ngày/tháng, đối chiếu manifest/R2/UI.
3. Thêm `crm_hash` và dedup file; đo số write giảm được bằng metrics.
4. Quyết định số phận `CAP_NHAT_MOC_THOI_GIAN` với chủ nghiệp vụ. Nếu chỉ là dấu kỹ thuật, loại khỏi ghi hằng ngày.
5. Chuẩn hoá registry cache và mở rộng snapshot chỉ cho các danh sách chi tiết có kích thước lớn, nhu cầu lặp lại cao.

## Phụ lục — Kiến trúc mục tiêu để giữ D1 dưới ngân sách đọc

### Nguyên tắc thiết kế

Không cho màn hình người dùng truy vấn/tổng hợp trực tiếp `case_dvbh` cho dữ liệu CRM tĩnh. `case_dvbh` là **source of truth**; các bảng/JSON báo cáo là **materialized views** được xây ở pipeline import. Người dùng chỉ nhận manifest/version, rồi dùng IndexedDB hoặc snapshot object đã được xây sẵn.

Mục tiêu “10.000 dòng import = xấp xỉ 10.000 row read để quyết định insert/update/skip” là khả thi khi lookup theo primary key và không chạy lại preview độc lập. Nó không đồng nghĩa toàn hệ thống chỉ có 10.000 read: mỗi báo cáo có truy vấn quét sẽ cộng thêm read. Vì vậy không thể “rebuild toàn bộ mọi báo cáo bằng SQL quét toàn bảng” sau từng import nếu muốn ngân sách thấp; phải hoặc tính **incremental theo delta**, hoặc chỉ chấp nhận một số ít full rebuild đã đo trước.

Theo tài liệu Cloudflare hiện hành, D1 Free giới hạn 5 triệu rows read/ngày và 100.000 rows written/ngày; D1 tính cả row scan, không chỉ rows trả về. Mỗi query trả `meta.rows_read`/`meta.rows_written` để đo chính xác. Index giảm read nhưng tăng write ở cột index. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)

### Luồng đích

```text
1. Client gửi file + file_hash
2. Import Worker chuẩn hoá, dedup ID, tính row_hash
3. D1 lookup PK: id + crm_hash + tối thiểu old fields cần tính delta
4. Một transaction/batch ghi case mới hoặc đổi thật; tạo import_run + change_log
5. Một worker job duy nhất đọc change_log và cập nhật materialized report theo DELTA
6. Worker xuất snapshot JSON version mới + manifest hash (chỉ partition bị đổi)
7. Client chỉ GET manifest; hash không đổi => IndexedDB, không tải JSON
```

### Ba tầng dữ liệu

| Tầng | Lưu gì | Ai đọc | Cách cập nhật |
| --- | --- | --- | --- |
| `case_dvbh` | Dữ liệu CRM chuẩn, `crm_hash` | Import, tra cứu chi tiết | Insert/update khi hash khác |
| `report_*` | KPI/tổng hợp theo ngày-tháng/khu vực/hãng/KTV; số đếm/tổng | API card/báo cáo | Delta: trừ đóng góp bản cũ, cộng đóng góp bản mới |
| R2 + IndexedDB | Danh sách chi tiết tĩnh theo partition | Client | Xuất lại chỉ partition/hash bị đổi |

### Delta thay vì quét full dữ liệu

Mỗi case có thể được biến thành nhiều “đóng góp” cho report, ví dụ `month=2026-07, khu_vuc=A, hang=X, status=closed` với `count=1`, `sum_so_phut=...`. Khi case đổi:

1. Lấy bản cũ tối thiểu cần tính báo cáo.
2. Trừ đóng góp của bản cũ khỏi các aggregate bị ảnh hưởng.
3. Ghi case mới.
4. Cộng đóng góp của bản mới.
5. Đánh dấu các partition detail bị đổi để xuất JSON.

Như vậy 10.000 dòng đổi tạo chi phí tỷ lệ với 10.000 thay đổi và số ít aggregate mỗi dòng, thay vì `số dòng toàn bảng × số thẻ báo cáo`. Với các báo cáo phức tạp (window function/ca lặp, logic phụ thuộc nhiều dòng cùng serial), có thể giữ refresh theo serial bị ảnh hưởng như hiện tại; không được làm full scan theo từng report.

### Cách triển khai an toàn theo giai đoạn

1. **Đo trước:** bọc từng query import/refresh để log `meta.rows_read`, `meta.rows_written`, duration, `import_run_id`, query group. Không tối ưu mù.
2. **Giảm ngay:** dedup ID; bỏ `SELECT *`; thêm `crm_hash`; bỏ write mốc thời gian không cần thiết; preview token để tránh đọc lại.
3. **Tách job:** import chỉ ghi source + change log. Một job tuần tự xây cache, có trạng thái `queued/running/succeeded/failed`; import mới gộp vào job đang chờ thay vì kích nhiều `waitUntil` song song.
4. **Materialize các card đắt nhất trước:** dashboard KPI, filter, tháng, backlog, ca lặp. So sánh output với cách SQL cũ trong giai đoạn chuyển đổi.
5. **Snapshot detail:** partition theo ngày/tháng và scope dữ liệu, manifest có `schema_version`, `content_hash`, `row_count`, `generated_from_import_run`. Client không tải lại khi hash khớp.
6. **Fallback:** API luôn có thể tính trực tiếp khi chưa có snapshot, nhưng không được tự ghi snapshot trong request đọc.

### Kỷ luật vận hành bắt buộc

- Không gọi cùng lúc nhiều full refresh sau import; chỉ một orchestrator/cache job quản lý thứ tự và retry.
- Không dùng `SELECT DISTINCT`/JOIN lớn trong request của người dùng cho dữ liệu tĩnh; kết quả phải là materialized JSON/table.
- Mọi cache key phải có scope quyền, params và schema/version; không dùng cache toàn cục chung cho dữ liệu bị giới hạn khu vực.
- R2 `PutObject` là Class A và `GetObject` là Class B; hash manifest giúp tránh get payload không cần thiết. Có thể đặt Cache API/CDN trước R2 khi dùng custom domain/route để cache hit không phát sinh origin fetch. [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [R2 Cache API](https://developers.cloudflare.com/r2/examples/cache-api/)

## Giới hạn của kết luận

Không có quyền đọc Cloudflare production trong đợt rà soát này. Vì vậy báo cáo xác định được nguyên nhân khả dĩ rất mạnh từ đường đi mã nguồn và trạng thái git, nhưng không khẳng định bucket/DB hiện tại có hay không có object. Ba truy vấn vận hành ở trên cùng log Worker là bước bắt buộc để chốt nguyên nhân thực tế.
