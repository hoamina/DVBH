# Danh gia tai doc/ghi sau 3 nam

Ngay danh gia: 2026-08-22. Pham vi: hanh vi frontend/backend hien tai, Cloudflare Worker + D1 + R2.

## 1. Gia dinh dung de tinh

- He thong hoat dong 3 nam, 365 ngay/nam.
- 20 nguoi dung lam viec 8 gio/ngay, lien tuc mo/chuyen cac module va xem du cac dang bao cao hien co.
- Mot "vong xem du" gom Dashboard, Ton/backlog, Thieu linh kien, Nap gas, Doanh thu, Khao sat/vi pham, Ca lap, Tranh chap va Bao cao dat mua linh kien.
- Code frontend hien tai phat sinh xap xi 50-60 API GET cho mot nguoi trong mot vong xem du (khong tinh export va mo tung chi tiet). Lay moc 55 GET/vong.
- Vi chua co so lieu nghiep vu dau vao trong repo, quy mo `case_dvbh` duoc tinh theo ba kich ban. Cac bang log/phu thuoc duoc uoc luong theo he so, khong coi la so lieu thuc te.

| Kich ban | Case moi/ngay | Case sau 3 nam | Ket qua goi (0,8/case) | Giai trinh (0,5/case) | Vi pham (0,15/case) |
|---|---:|---:|---:|---:|---:|
| Nho | 500 | 547.500 | 438.000 | 273.750 | 82.125 |
| Co so | 1.000 | 1.095.000 | 876.000 | 547.500 | 164.250 |
| Lon | 2.000 | 2.190.000 | 1.752.000 | 1.095.000 | 328.500 |

Ngoai cac bang tren, `login_log`, cac bang dat mua, phieu xuat kho, tranh chap va cac bang log trang thai deu tang don dieu. Kich thuoc tong D1 thuc te se lon hon dang ke do moi index la mot ban sao khoa duoc duy tri khi ghi.

## 2. Tai doc do 20 nguoi xem bao cao

### Mot vong xem du tat ca bao cao

- API request: `20 x 55 = 1.100 GET`.
- Voi bao cao da nam trong `cachedReport`, moi cache-hit van chay 1 SELECT `data_versions` va 1 SELECT `precomputed_cache`: xap xi 2 D1 query/request.
- Neu gia dinh 70% GET la endpoint cached/precomputed, 30% la danh sach, chi tiet hoac endpoint chua cache: rieng phan cache-hit da co khoang `1.100 x 70% x 2 = 1.540` D1 SELECT.
- 330 GET con lai thuong co COUNT + SELECT trang du lieu, hoac nhieu query tong hop; lay 2-4 query/GET tao them khoang 660-1.320 SELECT.
- Tong binh thuong cho mot vong: khoang 2.200-2.900 D1 statements, chua tinh row scan ben trong tung statement.

Neu moi nguoi lap 4 vong/ngay, tai giao dien co khoang 4.400 HTTP GET va 8.800-11.600 D1 statements/ngay. So statement nay khong nguy hiem; so row bi doc moi la bien quyet dinh chi phi va do tre.

### Polling tu dong

- Backlog co 5 query poll moi 3 phut. Neu ca 20 nguoi cung de module nay mo 8 gio: `20 x 5 x 160 = 16.000 GET/ngay`, tuong duong khoang 32.000 SELECT D1/ngay khi cache nong.
- TopBar/Sidebar va sync status poll moi 5 phut. Tuy React Query co the gop observer cung query key trong mot tab, moi nguoi van tao khoang 96 lan/query/ngay lam viec. Hai query nen duoc du tru them toi `20 x 96 x 2 = 3.840 GET/ngay`.
- Pipeline dat mua linh kien poll moi 5 phut: neu 20 nguoi cung mo, them toi 1.920 GET/ngay. Endpoint dem nay chua thay co cache version-tag va ben trong gom nhieu COUNT/subquery.

Kich ban xau khi nguoi dung de man hinh polling mo lien tuc co the dat 20.000-25.000 GET/ngay, tuong duong 40.000-50.000 SELECT nho ngay ca khi khong ai thao tac. Day la tai nen can kiem soat.

## 3. Cache nong, cache lanh va bo loc

### Cache nong

35 vi tri trong backend dang goi `cachedReport`. Cache-hit la tuong doi re: hai index lookup nho. Tuy nhien payload JSON duoc luu trong D1; payload bao cao lon van ton bang thong/CPU parse va bi gioi han boi kich thuoc row/response.

### Sau import hoac ghi du lieu

`bumpVersions` lam version cua domain thay doi. Moi cache key phu thuoc domain do se miss o lan doc ke tiep, chay lai query tong hop va ghi UPSERT vao `precomputed_cache`. Warm-up chi tinh san mot so bo tham so mac dinh va scope tong.

Neu 20 nguoi co cac scope khu vuc hoac bo loc khac nhau, mot dot import co the tao hang chuc cache miss gan dong thoi. Vi khong co single-flight/lock tren cache key, nhieu request trung key den cung luc van co the cung compute va cung UPSERT. Day la nguy co "cache stampede".

### No key cache do bo loc

Key bao gom endpoint, toan bo param va scope. Moi thang, khu vuc, hang, nhom san pham, doi tac, tinh/huyen, ky thuat vien va chieu GROUP BY tao key moi. Don rac chi giu toi 1.000 key `rpt:%` moi va xoa key qua 7 ngay khi luong import chay. Rui ro:

- To hop bo loc nhieu hon 1.000 lam cache bi thay lien tuc, ty le miss tang.
- Cung mot bao cao nhung 20 scope khac nhau khong chia se cache.
- Sau 0h VN, tat ca report cache tu het han do version tag co ngay; dot truy cap dau ngay co the dong loat tinh lai.

## 4. Row scan uoc luong

Trong kich ban co so 1,095 trieu case, mot query khong dung duoc index va quet toan bang doc xap xi 1,095 trieu row. Mot endpoint gom 5-10 phep COUNT/GROUP BY co the doc 5-11 trieu row cho mot cache miss. Neu 20 bo loc/scope cung miss sau import, mot endpoint co the tao 100-220 trieu row reads trong mot dot.

Code da co nhieu index va snapshot/cache, nhung van con cac mau nguy hiem:

- Correlated subquery lay log moi nhat: `SELECT ... ORDER BY id DESC LIMIT 1` lap theo tung dong cha. Khi index composite dung thieu hoac planner khong dung duoc, chi phi tang theo `so dong cha x so log`.
- COUNT tren danh sach co dieu kien phuc tap, `EXISTS`, `NOT EXISTS`, JSON va cac cot tinh tuoi; pagination chi gioi han SELECT ket qua, COUNT van co the quet tap lon.
- Export bo pagination (`export=true`) nap toan bo ket qua vao Worker va trinh duyet. Voi hang tram nghin den hon mot trieu dong, day la nguy co timeout, vuot memory va response size ro rang.
- OFFSET pagination cang ve trang sau cang phai bo qua nhieu row; sau 3 nam chi phi tang theo do sau trang.
- Endpoint pipeline dat mua co nhieu scalar COUNT trong mot SELECT. Moi lan poll co the quet lai cac bang dat hang/PXK/log nhieu lan.

## 5. Tai ghi

### Ghi do nguoi xem

- Dang nhap tao mot dong `login_log`; 20 nguoi x 1-3 lan/ngay = 20-60 INSERT/ngay, khong dang ke ve throughput nhung bang tang vo han neu khong retention.
- `/auth/me` co UPDATE `last_report_date` co dieu kien, toi da gan mot UPDATE/user/ngay.
- Moi cache miss tao mot UPSERT `precomputed_cache`. Sau import, sang ngay moi, hoac khi nguoi dung tao bo loc moi, ghi cache co the tang tu vai chuc den hang tram/ngay.
- Chi xem bao cao khong ghi vao bang nghiep vu, ngoai cac ghi phu tro tren.

### Ghi do import va tac nghiep

Import CRM la nguon ghi lon nhat: moi case moi/cap nhat tao mot INSERT/UPDATE `case_dvbh`; moi ghi con phai cap nhat tat ca index lien quan. Sau do code bump version, recompute cache dashboard va tuy luong co the warm bao cao.

O kich ban 1.000 case/ngay, neu 30% la moi va 70% bi ghi de, co khoang 1.000 row writes nghiep vu/ngay, nhung write amplification vat ly cao hon nhieu do bang co nhieu index. Neu file import luon ghi de ca dong du gia tri khong doi, chi phi index/WAL va invalidation cache bi lang phi. Code co `crm_hash`, can dam bao moi pipeline deu bo qua dong khong doi.

Moi thao tac khao sat, tranh chap, dat mua va phieu xuat kho thuong tao it nhat mot row log va mot UPDATE trang thai. Bang log tang nhanh hon bang cha va khong nen xoa tuy tien vi la audit trail; can archive/partition logic o tang ung dung hoac dua lich su lanh sang R2.

## 6. Cac van de nguy hiem can kiem soat

### P0 - can chan truoc khi data dat hang trieu dong

1. Export khong gioi han: cam export toan bo truc tiep tu Worker. Bat buoc gioi han so dong, xuat bat dong bo theo chunk, luu file R2 va tra link.
2. Cache stampede: them single-flight/lease theo cache key, hoac Durable Object/queue cho recompute; request sau dung stale value trong luc mot worker tinh lai.
3. Khong co ngan sach query: can dat gioi han thoi gian, row count, page size va bo loc ngay/thang cho moi endpoint danh sach/bao cao.
4. Chua co benchmark tren data 3 nam: can tao dataset synthetic 0,55M/1,1M/2,2M case va chay `EXPLAIN QUERY PLAN` + do `rows_read`, latency p50/p95/p99 cho tung endpoint.

### P1 - nguy co chi phi va lag cao

5. Polling 3 phut cua 5 bao cao backlog tao tai nen lon. Doi sang mot endpoint tong hop/version check nho, refetch khi version doi, hoac day su kien; dung polling khi tab an.
6. Pipeline counts poll lien tuc va gom nhieu COUNT. Nen precompute theo trang thai hien tai, cache theo version `dat_mua_lk`, hoac duy tri bang counter transactional.
7. Cache key cardinality toi da 1.000 khong duoc theo doi. Can metric hit/miss, so key, payload bytes, compute duration va ly do invalidation.
8. OFFSET pagination phai doi sang keyset/cursor cho `case_dvbh`, login log, tranh chap, dat mua, PXK va cac bang lich su.
9. Log retention: dat chinh sach cho `login_log`, partner call log, cache cu va log ky thuat khong mang gia tri audit lau dai. Audit nghiep vu can archive sang R2 thay vi xoa mu.

### P2 - toi uu va quan sat

10. Moi cache-hit dang ton hai SELECT. Co the gop version vao cache key/metadata hoac dung KV/Cache API cho payload nong, nhung phai giu scope va invalidation chinh xac.
11. Them index composite theo query thuc te cho moi `parent_id ORDER BY id DESC LIMIT 1`, khong chi index `parent_id`. Xac nhan bang EXPLAIN thay vi doan.
12. Theo doi D1 `rows_read/rows_written`, Worker CPU, response size, cache-hit ratio va import duration theo endpoint. Can canh bao theo toc do tang, khong chi theo tong request.

## 7. Nguong van hanh de de xuat

- API bao cao p95 < 2 giay khi cache miss; cache-hit p95 < 300 ms.
- Khong endpoint dong bo nao tra qua 10.000 dong hoac payload JSON qua 10 MB; muc thuc te nen thap hon.
- Page size toi da 100; export lon hon 10.000 dong chuyen sang job R2.
- Cache-hit ratio bao cao >= 90% trong ngay binh thuong; sau import phai hoi phuc trong 5 phut.
- Mot request bao cao khong duoc doc qua 5 lan quy mo bang chinh trong kich ban co so; endpoint vuot nguong phai snapshot/precompute.
- Polling dung khi `document.hidden`, va them jitter de 20 client khong ban request cung mot thoi diem.
- Dat canh bao khi D1 database/index tang > 3%/tuan bat thuong, `rows_read/request` tang > 2 lan baseline, hoac cache key cham moc 800/1.000.

## 8. Ket luan

20 nguoi dung khong tao rui ro throughput HTTP nghiem trong. Rui ro that su la write/invalidation lam cache lanh, bo loc tao nhieu key, polling lien tuc, va mot so query/list/export co chi phi ty le voi toan bo lich su 3 nam. O quy mo co so hon 1 trieu case, chi can mot bao cao miss cache gom nhieu full scan da co the doc hang trieu den hang chuc trieu row; 20 nguoi cung vao sau import co the khuynh dai thanh hang tram trieu row reads trong mot dot.

Thu tu xu ly hop ly: khoa export va page size, benchmark data 3 nam, loai cache stampede, giam polling, cursor pagination, sau do moi toi uu tung index/query theo D1 Insights.
