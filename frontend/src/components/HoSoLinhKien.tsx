import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { fmtDate, fmtDateTime, type Paged } from "../types";
import { Badge, type BadgeTone } from "./ui/Badge";
import { LoadingInline } from "./ui/LoadingInline";
import { shortKhuVuc } from "../lib/khuVucShortLabel";
import { linhKienLoaiDonLabel, linhKienTrangThaiLabel } from "../lib/linhKienTimeline";
import { fmtSl } from "./TonKhoLk";

// "Ho so linh kien" (GD2 ton kho linh kien, 2026-10-08) - bam 1 ma LK o tab "Linh kiện thiếu": tra loi nhanh
// "dang ton o kho nao, SL bao nhieu, KTV nao dang giu, ca nao dang cho, kho xu ly thieu hang chua, don/PO the nao".
//   - Ton tung kho / KTV: ton_kho_lk (keo tu linh-kien-app, /api/ton-kho-lk/ma/:ma).
//   - Ca dang bao thieu: /api/missing-parts?ma_lk= (dung scope khu vuc cua nguoi xem).
//   - Lich su dat hang + ticket thieu hang: linh-kien-app, goi luc mo (/api/ton-kho-lk/ma/:ma/lich-su, khong luu).
//   - PO / mua hang / bao hanh (Google Sheet): phan "sheetSection" do noi goi truyen vao (giu nguyen nhu cu).

interface TonRow {
  nguon: "kho" | "ktv";
  ma_kho: string;
  ten_kho: string | null;
  ma_ktv: string | null;
  ten_ktv: string | null;
  khu_vuc_ma: string | null;
  cuoi_ky: number | null;
  nhom: "MB" | "MN" | null;
}

interface CaThieu {
  id: string;
  khach_hang: string | null;
  khu_vuc: string | null;
  ky_thuat_vien: string | null;
  tuoi_ton: number | null;
  nhom_kh: string | null;
  last_ngay_yeu_cau_co_hang: string | null;
}

interface LichSuOrder {
  id: string;
  loai_don: string;
  loai_de_xuat: string | null;
  trang_thai_hien_tai: string | null;
  so_luong_de_xuat: number | null;
  so_luong_thuc_xuat: number | null;
  ngay_tao: string;
  khu_vuc_ma: string | null;
  nguoi_nhan_hang_ten: string | null;
  case_ids: string | null;
}

interface LichSuThieuLk {
  id: string;
  dat_don_hang_id: string;
  ly_do: string | null;
  ngay_tao: string;
  ngay_du_kien_co_hang: string | null;
  ngay_hang_ve_thuc_te: string | null;
  trang_thai: string | null;
  ngay_cap_nhat: string | null;
}

const THIEU_LK_TRANG_THAI: Record<string, { label: string; tone: BadgeTone; mo: boolean }> = {
  "Cho kho xu ly": { label: "Chờ kho xử lý", tone: "coral", mo: true },
  "Kho da tiep nhan": { label: "Kho đã tiếp nhận", tone: "amber", mo: true },
  "Kho xac nhan hang da ve": { label: "Kho xác nhận hàng đã về", tone: "teal", mo: false },
  "Kho tu choi sai TT": { label: "Kho từ chối (sai thông tin)", tone: "gray", mo: false },
  "Da huy bo": { label: "Đã hủy bỏ", tone: "gray", mo: false },
  "Da ket thuc": { label: "Đã kết thúc", tone: "gray", mo: false },
};

function Section({ title, tone, children }: { title: string; tone: string; children: ReactNode }) {
  return (
    <div>
      <div className={`font-semibold text-xs uppercase tracking-wide mb-1.5 ${tone}`}>{title}</div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-xs text-[var(--ink-400)] italic py-1.5">{text}</div>;
}

const TH = "py-1.5 pr-3";
const TR = "border-b border-[var(--line)] last:border-0 even:bg-[var(--surface-100)]/60";

export function HoSoLinhKien({ maLk, openCase, sheetSection }: { maLk: string; openCase?: (id: string, tab?: string) => void; sheetSection: ReactNode }) {
  const tonQ = useQuery({ queryKey: ["ton-kho-lk-ma", maLk], queryFn: () => api.get<{ rows: TonRow[] }>(`/ton-kho-lk/ma/${encodeURIComponent(maLk)}`) });
  const caQ = useQuery({
    queryKey: ["missing-parts-ma-lk", maLk],
    queryFn: () => api.get<Paged<CaThieu>>(`/missing-parts?ma_lk=${encodeURIComponent(maLk)}&pageSize=200`),
  });
  const lsQ = useQuery({
    queryKey: ["ton-kho-lk-lich-su", maLk],
    queryFn: () => api.get<{ orders: LichSuOrder[]; thieu_lk: LichSuThieuLk[] }>(`/ton-kho-lk/ma/${encodeURIComponent(maLk)}/lich-su`),
    retry: false,
  });

  const ton = tonQ.data?.rows ?? [];
  const kho = ton.filter((r) => r.nguon === "kho" || !!r.nhom);
  const ktv = ton.filter((r) => r.nguon === "ktv" && !r.nhom && (r.cuoi_ky ?? 0) > 0);
  const cases = caQ.data?.rows ?? [];
  const khuVucCa = useMemo(() => new Set(cases.map((c) => shortKhuVuc(c.khu_vuc))), [cases]);
  const ktvSorted = useMemo(
    () => [...ktv].sort((a, b) => Number(khuVucCa.has(b.khu_vuc_ma ?? "")) - Number(khuVucCa.has(a.khu_vuc_ma ?? "")) || (b.cuoi_ky ?? 0) - (a.cuoi_ky ?? 0)),
    [ktv, khuVucCa],
  );

  const sum = (rows: TonRow[]) => rows.reduce((s, r) => s + (r.cuoi_ky ?? 0), 0);
  const tonMb = sum(ton.filter((r) => r.nhom === "MB"));
  const tonMn = sum(ton.filter((r) => r.nhom === "MN"));
  const tonKtv = sum(ktv);
  const ktvCungKv = ktv.filter((r) => khuVucCa.has(r.khu_vuc_ma ?? ""));
  const thieuLk = lsQ.data?.thieu_lk ?? [];
  const ticketMo = thieuLk.filter((t) => THIEU_LK_TRANG_THAI[t.trang_thai ?? ""]?.mo);

  // Nhan dinh nhanh (dong dau tien) - thu tu uu tien xu ly: kho MB/MN co hang -> KTV cung khu vuc -> KTV noi khac -> het.
  const nhanDinh: { tone: BadgeTone; text: string } | null = tonQ.isLoading
    ? null
    : tonMb + tonMn > 0
      ? { tone: "teal", text: `Kho đang có hàng (MB ${fmtSl(tonMb)} · MN ${fmtSl(tonMn)}) — có thể điều chuyển cho ca đang thiếu.` }
      : ktvCungKv.length > 0
        ? { tone: "teal", text: `Kho MB/MN hết, nhưng ${ktvCungKv.length} KTV cùng khu vực với ca thiếu đang giữ hàng (${fmtSl(sum(ktvCungKv))}).` }
        : ktv.length > 0
          ? { tone: "amber", text: `Kho MB/MN hết; chỉ KTV khu vực khác đang giữ (${ktv.length} người, ${fmtSl(tonKtv)}).` }
          : { tone: "coral", text: "Hết hàng toàn hệ thống (kho + KTV) — cần đặt PO / theo dõi hàng về." };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="ocean">Tồn MB {fmtSl(tonMb)}</Badge>
        <Badge tone="ocean">Tồn MN {fmtSl(tonMn)}</Badge>
        <Badge tone="gray">KTV giữ {fmtSl(tonKtv)} ({ktv.length} người)</Badge>
        <Badge tone="coral">{cases.length} ca đang thiếu</Badge>
        <Badge tone={ticketMo.length ? "amber" : "gray"}>{ticketMo.length} ticket thiếu hàng đang mở</Badge>
      </div>
      {nhanDinh && (
        <div
          className={`rounded-lg px-3 py-2 text-sm font-semibold ${
            nhanDinh.tone === "teal"
              ? "bg-[var(--teal-100)] text-[var(--teal-600)]"
              : nhanDinh.tone === "amber"
                ? "bg-[var(--amber-100)] text-[var(--amber-600)]"
                : "bg-[var(--coral-100)] text-[var(--coral-600)]"
          }`}
        >
          {nhanDinh.text}
        </div>
      )}

      <Section title={`Ca đang báo thiếu (${cases.length})`} tone="text-[var(--coral-600)]">
        {caQ.isLoading ? (
          <LoadingInline />
        ) : cases.length === 0 ? (
          <Empty text="Không có ca nào trong phạm vi bạn xem." />
        ) : (
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="dense w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--ink-400)] uppercase border-b border-[var(--line)]">
                  <th className={TH}>Mã ca</th>
                  <th className={TH}>Khu vực</th>
                  <th className={TH}>KTV</th>
                  <th className={TH}>Khách hàng</th>
                  <th className={`${TH} text-right`}>Tuổi tồn</th>
                  <th className={TH}>Ngày cần hàng</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id} className={`${TR} ${openCase ? "cursor-pointer hover:bg-slate-50" : ""}`} onClick={() => openCase?.(c.id, "giai-trinh")}>
                    <td className={`${TH} font-mono font-semibold text-[var(--ocean-600)]`}>{c.id}</td>
                    <td className={TH}>{shortKhuVuc(c.khu_vuc)}</td>
                    <td className={TH}>{c.ky_thuat_vien ?? "—"}</td>
                    <td className={TH}>{c.khach_hang ?? "—"}</td>
                    <td className={`${TH} text-right`}>{c.tuoi_ton ?? "—"}</td>
                    <td className={TH}>{c.last_ngay_yeu_cau_co_hang ? fmtDate(c.last_ngay_yeu_cau_co_hang) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="grid md:grid-cols-2 gap-4">
        <Section title="Tồn theo kho công ty" tone="text-[var(--ocean-600)]">
          {tonQ.isLoading ? (
            <LoadingInline />
          ) : kho.length === 0 ? (
            <Empty text="Không kho công ty nào có mã này." />
          ) : (
            <table className="dense w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--ink-400)] uppercase border-b border-[var(--line)]">
                  <th className={TH}>Kho</th>
                  <th className={TH}>Tính vào</th>
                  <th className={`${TH} text-right`}>SL tồn</th>
                </tr>
              </thead>
              <tbody>
                {kho.map((r) => (
                  <tr key={r.ma_kho} className={TR}>
                    <td className={TH}>
                      <span className="font-mono font-semibold">{r.ma_kho}</span>
                      {r.ten_kho && <span className="text-[var(--ink-400)]"> · {r.ten_kho}</span>}
                    </td>
                    <td className={TH}>{r.nhom ? <Badge tone="ocean">{r.nhom}</Badge> : <span className="text-[var(--ink-400)]">Không tính</span>}</td>
                    <td className={`${TH} text-right font-semibold`}>{fmtSl(r.cuoi_ky)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title={`KTV đang giữ hàng (${ktv.length})`} tone="text-[var(--teal-600)]">
          {tonQ.isLoading ? (
            <LoadingInline />
          ) : ktvSorted.length === 0 ? (
            <Empty text="Không KTV nào đang giữ mã này." />
          ) : (
            <div className="max-h-64 overflow-y-auto">
              <table className="dense w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--ink-400)] uppercase border-b border-[var(--line)]">
                    <th className={TH}>KTV / kho</th>
                    <th className={TH}>Khu vực</th>
                    <th className={`${TH} text-right`}>SL</th>
                  </tr>
                </thead>
                <tbody>
                  {ktvSorted.map((r) => (
                    <tr key={r.ma_kho} className={TR}>
                      <td className={TH}>
                        {r.ten_ktv ?? r.ten_kho ?? r.ma_kho}
                        <span className="text-[var(--ink-400)] font-mono"> · {r.ma_kho}</span>
                        {!r.ma_ktv && <span className="text-[var(--amber-600)]"> (chưa khớp KTV)</span>}
                      </td>
                      <td className={TH}>
                        {r.khu_vuc_ma ?? "—"}
                        {khuVucCa.has(r.khu_vuc_ma ?? "") && (
                          <span className="ml-1">
                            <Badge tone="teal">Cùng KV ca thiếu</Badge>
                          </span>
                        )}
                      </td>
                      <td className={`${TH} text-right font-semibold`}>{fmtSl(r.cuoi_ky)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>

      <Section title={`Ticket thiếu hàng — kho xử lý (${thieuLk.length})`} tone="text-[var(--amber-600)]">
        {lsQ.isLoading ? (
          <LoadingInline />
        ) : lsQ.isError ? (
          <Empty text="Không tải được dữ liệu từ hệ Đặt mua linh kiện." />
        ) : thieuLk.length === 0 ? (
          <Empty text="Chưa có ticket thiếu hàng nào cho mã này." />
        ) : (
          <div className="overflow-x-auto max-h-56 overflow-y-auto">
            <table className="dense w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--ink-400)] uppercase border-b border-[var(--line)]">
                  <th className={TH}>Ticket</th>
                  <th className={TH}>Trạng thái</th>
                  <th className={TH}>Lý do</th>
                  <th className={TH}>Tạo lúc</th>
                  <th className={TH}>Dự kiến có hàng</th>
                  <th className={TH}>Hàng về thực tế</th>
                </tr>
              </thead>
              <tbody>
                {thieuLk.map((t) => {
                  const tt = THIEU_LK_TRANG_THAI[t.trang_thai ?? ""];
                  return (
                    <tr key={t.id} className={TR}>
                      <td className={`${TH} font-mono`}>
                        {t.id}
                        <div className="text-[var(--ink-400)]">{t.dat_don_hang_id}</div>
                      </td>
                      <td className={TH}>{tt ? <Badge tone={tt.tone}>{tt.label}</Badge> : (t.trang_thai ?? "—")}</td>
                      <td className={TH}>{t.ly_do ?? "—"}</td>
                      <td className={TH}>{fmtDateTime(t.ngay_tao)}</td>
                      <td className={TH}>{t.ngay_du_kien_co_hang ? fmtDate(t.ngay_du_kien_co_hang) : "—"}</td>
                      <td className={TH}>{t.ngay_hang_ve_thuc_te ? fmtDate(t.ngay_hang_ve_thuc_te) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={`Lịch sử đặt hàng — hệ Đặt mua linh kiện (${lsQ.data?.orders.length ?? 0} đơn gần nhất)`} tone="text-[var(--indigo-600)]">
        {lsQ.isLoading ? (
          <LoadingInline />
        ) : lsQ.isError ? (
          <Empty text="Không tải được dữ liệu từ hệ Đặt mua linh kiện." />
        ) : (lsQ.data?.orders.length ?? 0) === 0 ? (
          <Empty text="Chưa có đơn đặt hàng nào cho mã này." />
        ) : (
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="dense w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--ink-400)] uppercase border-b border-[var(--line)]">
                  <th className={TH}>Đơn</th>
                  <th className={TH}>Loại</th>
                  <th className={TH}>Trạng thái</th>
                  <th className={`${TH} text-right`}>SL đề xuất / thực xuất</th>
                  <th className={TH}>Người nhận</th>
                  <th className={TH}>KV</th>
                  <th className={TH}>Ngày tạo</th>
                  <th className={TH}>Ca</th>
                </tr>
              </thead>
              <tbody>
                {lsQ.data!.orders.map((o) => (
                  <tr key={o.id} className={TR}>
                    <td className={`${TH} font-mono`}>{o.id}</td>
                    <td className={TH}>
                      {linhKienLoaiDonLabel(o.loai_don)}
                      {o.loai_de_xuat && <div className="text-[var(--ink-400)]">{o.loai_de_xuat}</div>}
                    </td>
                    <td className={TH}>{linhKienTrangThaiLabel(o.trang_thai_hien_tai)}</td>
                    <td className={`${TH} text-right`}>
                      {fmtSl(o.so_luong_de_xuat)} / {o.so_luong_thuc_xuat === null ? "—" : fmtSl(o.so_luong_thuc_xuat)}
                    </td>
                    <td className={TH}>{o.nguoi_nhan_hang_ten ?? "—"}</td>
                    <td className={TH}>{o.khu_vuc_ma ?? "—"}</td>
                    <td className={TH}>{fmtDateTime(o.ngay_tao)}</td>
                    <td className={TH}>
                      {(o.case_ids ?? "")
                        .split(",")
                        .filter(Boolean)
                        .map((id) => (
                          <button key={id} type="button" className="font-mono text-[var(--ocean-600)] hover:underline mr-1" onClick={() => openCase?.(id)}>
                            {id}
                          </button>
                        ))}
                      {!o.case_ids && "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {sheetSection}
    </div>
  );
}
