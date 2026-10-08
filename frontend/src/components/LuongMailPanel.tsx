// Tab "Luồng mail" trong Chi tiet ca - luong mail doi tra cua ca keo tu he theodoidoimay qua backend DVBH
// (GET /api/cases/:id/mail-timeline -> backend/src/lib/mailTimeline.ts). Goi theo yeu cau khi mo ca,
// khong luu D1 (giong lib/linhKienTimeline.ts).
// Bo cuc (v1.433): moc xu ly dang log -> ca moi -> de xuat (thu gon) -> nhat ky thu 1 dong/thu; noi dung thu doc
// trong 1 popup chung (danh sach thu ben trai + noi dung ben phai). Noi dung da duoc he theodoidoimay lam gon
// (noi_dung: bo bang dan phang/chu ky; tom_tat: 1 dong) - body_new chi dung cho "Xem nguyên văn".
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Badge, type AnyBadgeTone } from "./ui/Badge";
import { Btn } from "./ui/Btn";
import { Card } from "./ui/Card";
import { Field } from "./ui/Field";
import { LoadingInline } from "./ui/LoadingInline";
import { Modal } from "./ui/Modal";

interface MailThu {
  nguon: "gmail" | "trich_dan";
  gmail_id: string;
  from_name: string;
  from_email: string;
  to_addr: string;
  cc_addr: string;
  subject: string;
  sent_at: string;
  body_new: string;
  noi_dung?: string; // da lam gon (he cu chua co -> fallback body_new)
  tom_tat?: string;
  attachments: { name: string; size: number; type: string }[];
  la_de_xuat: number;
  la_duyet: number;
  moc: string;
  gmail_link: string | null;
}

interface MailLuong {
  trang_thai: string;
  loai_yeu_cau: string;
  serial: string;
  subject: string;
  origin_name: string;
  origin_email: string;
  origin_at: string | null;
  msg_count: number;
  tiep_nhan_at: string | null;
  de_xuat_at: string | null;
  de_xuat_from: string;
  duyet_at: string | null;
  duyet_from: string;
  duyet_xac_nhan: number;
  giao_xu_ly_at: string | null;
  len_so_at: string | null;
  len_do_at: string | null;
  de_xuat: Record<string, string>;
}

interface MailCaMoi {
  id_khach_hang: string;
  ca_moi_id: string | null;
  trang_thai_gan: string;
  ca_moi_tn_at: string | null;
  ca_moi_ht_at: string | null;
  ca_moi_tien_do: string;
  ca_moi_san_pham: string;
  ung_vien: { id: string; tn_at: string | null; ht_at: string | null; san_pham: string; tien_do: string; khop_model: boolean }[];
}

export interface MailTimelineResult {
  configured: boolean;
  ok: boolean;
  error: string | null;
  found: boolean;
  luong: MailLuong | null;
  thu: MailThu[];
  ca_moi: MailCaMoi | null;
}

export function useMailTimeline(caseId: string | null | undefined) {
  return useQuery({
    queryKey: ["mail-timeline", caseId],
    queryFn: () => api.get<MailTimelineResult>(`/cases/${encodeURIComponent(caseId!)}/mail-timeline`),
    enabled: !!caseId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

const TRANG_THAI: Record<string, { label: string; tone: AnyBadgeTone }> = {
  phat_sinh: { label: "Phát sinh", tone: "gray" },
  tiep_nhan: { label: "Karofi đã tiếp nhận", tone: "sky" },
  cho_duyet: { label: "Chờ duyệt đổi", tone: "amber" },
  da_duyet: { label: "Đã duyệt đổi", tone: "teal" },
  giao_xu_ly: { label: "Karofi giao xử lý", tone: "indigo" },
  da_len_so: { label: "Đã lên SO", tone: "violet" },
  da_len_do: { label: "Đã lên DO", tone: "ocean" },
};

const MOC_THU: Record<string, { label: string; tone: AnyBadgeTone }> = {
  tiep_nhan: { label: "Tiếp nhận", tone: "sky" },
  giao_xu_ly: { label: "Giao xử lý", tone: "indigo" },
  len_so: { label: "Lên SO", tone: "violet" },
  len_do: { label: "Lên DO", tone: "ocean" },
  len_so_do: { label: "Lên SO + DO", tone: "violet" },
};

// Trang thai noi ca moi (he theodoidoimay): tu gan khi dung 1 ung vien cung ID KH + khop model;
// con lai nguoi dung xac nhan tren trang bao cao cua he do.
const CA_MOI_GAN: Record<string, { label: string; tone: AnyBadgeTone }> = {
  tu_dong: { label: "Tự gán (khớp model)", tone: "teal" },
  xac_nhan: { label: "Đã xác nhận", tone: "teal" },
  goi_y: { label: "Gợi ý - chờ xác nhận", tone: "amber" },
  nhieu_ung_vien: { label: "Nhiều ứng viên - chờ xác nhận", tone: "amber" },
  chua_co: { label: "Chưa có ca mới", tone: "gray" },
  khong_co_id_kh: { label: "Ca gốc chưa có ID khách hàng", tone: "gray" },
};

// Cac truong nhay cam / da co o the Thong tin ca - an khoi bang de xuat.
const AN_TRUONG_DE_XUAT = new Set(["SĐT", "Địa chỉ"]);
// 4 truong chinh hien khi bang de xuat dang thu gon.
const TRUONG_CHINH = ["Model máy lỗi", "Máy/Linh kiện đề xuất đổi", "Lý do đổi", "Chính sách đổi hàng"];
// Dong ghi chu he theodoidoimay chen vao noi_dung thay cho bang de xuat bi dan phang (src/gonThu.ts).
const GHI_CHU_BANG = /^\[Bảng đề xuất đổi[^\]]*\]$/;

const fmtVn = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))
    : "—";

const fmtNgan = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** "1 ngày 3 giờ" giua 2 moc (de nhin thoi gian xu ly tung buoc). */
function khoang(from: string | null, to: string | null): string {
  if (!from || !to) return "";
  const phut = Math.round((Date.parse(to) - Date.parse(from)) / 60000);
  if (phut < 0) return "";
  if (phut < 60) return `${phut} phút`;
  const gio = Math.floor(phut / 60);
  if (gio < 24) return `${gio} giờ ${phut % 60 ? `${phut % 60} phút` : ""}`.trim();
  return `${Math.floor(gio / 24)} ngày ${gio % 24 ? `${gio % 24} giờ` : ""}`.trim();
}

const tenNguoiGui = (t: MailThu) => t.from_name || t.from_email.split("@")[0];
const noiDung = (t: MailThu) => t.noi_dung ?? t.body_new;
const tomTat = (t: MailThu) => t.tom_tat ?? t.body_new.split("\n").find((s) => s.trim().length > 3)?.trim() ?? "";

function NhanThu({ t }: { t: MailThu }) {
  const mocThu = MOC_THU[t.moc];
  return (
    <>
      {t.la_de_xuat === 1 && <Badge tone="amber">Đề xuất</Badge>}
      {t.la_duyet === 1 && <Badge tone="teal">Duyệt</Badge>}
      {mocThu && <Badge tone={mocThu.tone}>{mocThu.label}</Badge>}
    </>
  );
}

function BangDeXuat({ rows }: { rows: [string, string][] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
      {rows.map(([k, v]) => (
        <Field
          key={k}
          label={k}
          value={
            /^https?:\/\//.test(v) ? (
              <a className="text-[var(--ocean-600)] hover:underline" href={v} target="_blank" rel="noreferrer">
                Mở link
              </a>
            ) : (
              v
            )
          }
        />
      ))}
    </div>
  );
}

function CaMoiCard({ cm, onOpenCase }: { cm: MailCaMoi; onOpenCase?: (id: string) => void }) {
  const gan = CA_MOI_GAN[cm.trang_thai_gan] ?? { label: cm.trang_thai_gan, tone: "gray" as const };
  const moCa = (id: string) =>
    onOpenCase ? (
      <button type="button" className="font-mono font-semibold text-[var(--ocean-600)] hover:underline" onClick={() => onOpenCase(id)}>
        {id}
      </button>
    ) : (
      <span className="font-mono font-semibold">{id}</span>
    );
  const choXacNhan = !cm.ca_moi_id && cm.ung_vien.length > 0;
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div className="text-xs font-semibold text-[var(--ink-500)]">Ca mới đổi cho KH</div>
        <Badge tone={gan.tone}>{gan.label}</Badge>
      </div>
      {cm.ca_moi_id ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <Field label="Mã ca mới" value={moCa(cm.ca_moi_id)} />
          <Field label="Sản phẩm" value={cm.ca_moi_san_pham || "—"} />
          <Field label="Mở ca mới" value={fmtVn(cm.ca_moi_tn_at)} />
          <Field label="Tiến độ" value={cm.ca_moi_tien_do || "—"} />
          {cm.ca_moi_ht_at && /^Hoàn thành/i.test(cm.ca_moi_tien_do) && <Field label="Đổi trả thành công" value={fmtVn(cm.ca_moi_ht_at)} />}
        </div>
      ) : choXacNhan ? (
        <div className="space-y-1">
          <div className="text-xs text-[var(--ink-500)]">Ca cùng ID khách hàng mở sau khi duyệt (xác nhận trên trang báo cáo Theo dõi đổi máy):</div>
          {cm.ung_vien.map((u) => (
            <div key={u.id} className="flex items-baseline gap-2 text-sm flex-wrap">
              {moCa(u.id)}
              <span className="text-xs text-[var(--ink-500)]">{fmtVn(u.tn_at)}</span>
              <span className="text-xs text-[var(--ink-700)] truncate">{u.san_pham}</span>
              {u.khop_model && <Badge tone="teal">Khớp model</Badge>}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-[var(--ink-400)] italic">
          {cm.trang_thai_gan === "khong_co_id_kh"
            ? "Ca gốc chưa có ID khách hàng từ pipeline - chưa tìm được ca mới."
            : "Chưa thấy ca nào cùng ID khách hàng được mở sau khi duyệt."}
        </div>
      )}
    </Card>
  );
}

/** Popup doc mail: danh sach thu (trai) + noi dung thu dang chon (phai), nut thu truoc/sau. */
function DocMailModal({
  thu,
  idx,
  setIdx,
  deXuat,
  onClose,
}: {
  thu: MailThu[];
  idx: number;
  setIdx: (i: number) => void;
  deXuat: [string, string][];
  onClose: () => void;
}) {
  const [nguyenVan, setNguyenVan] = useState(false);
  const t = thu[idx];
  const chon = (i: number) => {
    setIdx(i);
    setNguyenVan(false);
  };
  const dong = nguyenVan ? [t.body_new] : noiDung(t).split("\n");
  return (
    <Modal
      open
      onClose={onClose}
      title={`Mail đổi trả (${thu.length} thư)`}
      width="max-w-5xl"
      height="h-[88vh]"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Btn variant="ghost" size="sm" disabled={idx === 0} onClick={() => chon(idx - 1)}>
            ‹ Thư trước
          </Btn>
          <span className="text-xs text-[var(--ink-500)]">
            {idx + 1} / {thu.length}
          </span>
          <Btn variant="ghost" size="sm" disabled={idx === thu.length - 1} onClick={() => chon(idx + 1)}>
            Thư sau ›
          </Btn>
        </div>
      }
    >
      <div className="flex gap-4 h-full min-h-0">
        <ol className="hidden md:block w-64 shrink-0 overflow-y-auto border-r border-[var(--line)] pr-2 -my-1">
          {thu.map((x, i) => (
            <li key={`${x.gmail_id}-${i}`}>
              <button
                type="button"
                onClick={() => chon(i)}
                className={`w-full text-left rounded-lg px-2 py-1.5 my-0.5 ${i === idx ? "bg-[var(--ocean-100)]" : "hover:bg-slate-50"}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-semibold truncate">{tenNguoiGui(x)}</span>
                  <span className="text-[11px] text-[var(--ink-400)] shrink-0">{fmtNgan(x.sent_at)}</span>
                </div>
                <div className="text-xs text-[var(--ink-500)] truncate">{tomTat(x)}</div>
                <div className="flex gap-1 mt-0.5 flex-wrap empty:hidden">
                  <NhanThu t={x} />
                </div>
              </button>
            </li>
          ))}
        </ol>

        <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="font-semibold text-[var(--ink-900)] mb-1">{t.subject}</div>
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            <NhanThu t={t} />
            {t.nguon === "trich_dan" && <Badge tone="gray">Khôi phục từ trích dẫn</Badge>}
          </div>
          <div className="text-xs text-[var(--ink-500)] space-y-0.5 mb-3 border-b border-[var(--line)] pb-2">
            <div>
              <b className="text-[var(--ink-700)]">{t.from_name || t.from_email}</b> {t.from_name && `<${t.from_email}>`} · {fmtVn(t.sent_at)}
            </div>
            {t.to_addr && <div className="break-words">Đến: {t.to_addr}</div>}
            {t.cc_addr && <div className="break-words">CC: {t.cc_addr}</div>}
          </div>
          <div className="text-sm text-[var(--ink-700)] whitespace-pre-line break-words space-y-1">
            {dong.map((s, i) =>
              GHI_CHU_BANG.test(s.trim()) && deXuat.length ? (
                <div key={i} className="my-2 rounded-lg border border-[var(--line)] p-3 bg-slate-50/60">
                  <div className="text-xs font-semibold text-[var(--ink-500)] mb-2">Bảng đề xuất đổi</div>
                  <BangDeXuat rows={deXuat} />
                </div>
              ) : (
                <div key={i}>{s}</div>
              ),
            )}
          </div>
          <div className="flex items-center gap-3 mt-3 pt-2 border-t border-[var(--line)] text-xs text-[var(--ink-500)] flex-wrap">
            {t.attachments.length > 0 && <span>📎 {t.attachments.map((a) => a.name).join(", ")}</span>}
            <button type="button" className="text-[var(--ocean-600)] hover:underline" onClick={() => setNguyenVan((v) => !v)}>
              {nguyenVan ? "Xem bản gọn" : "Xem nguyên văn"}
            </button>
            {t.gmail_link && (
              <a className="text-[var(--ocean-600)] hover:underline" href={t.gmail_link} target="_blank" rel="noreferrer">
                Mở trong Gmail theo dõi
              </a>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function LuongMailPanel({ caseId, onOpenCase }: { caseId: string; onOpenCase?: (id: string) => void }) {
  const { data, isLoading } = useMailTimeline(caseId);
  const [docIdx, setDocIdx] = useState<number | null>(null);
  const [moDeXuat, setMoDeXuat] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--ink-500)]">
        <LoadingInline /> Đang tải luồng mail…
      </div>
    );
  }
  if (!data || !data.configured) return <div className="text-xs text-[var(--ink-400)] italic">Chưa cấu hình kết nối hệ Theo dõi đổi máy.</div>;
  if (!data.ok) return <div className="text-xs text-red-600 italic">Không tải được luồng mail ({data.error}).</div>;
  if (!data.found || !data.luong) {
    return <div className="text-sm text-[var(--ink-400)] italic">Chưa có luồng mail đổi trả nào gắn với ca này.</div>;
  }

  const l = data.luong;
  const thu = data.thu;
  const tt = TRANG_THAI[l.trang_thai] ?? { label: l.trang_thai, tone: "gray" as const };
  const cm = data.ca_moi;
  const moc: { label: string; at: string | null; who?: string }[] = [
    { label: "Phát sinh", at: l.origin_at, who: l.origin_name || l.origin_email },
    { label: "Karofi tiếp nhận", at: l.tiep_nhan_at },
    { label: "Đề xuất đổi", at: l.de_xuat_at, who: l.de_xuat_from },
    { label: l.duyet_xac_nhan ? "Duyệt (đã xác nhận)" : "Duyệt", at: l.duyet_at, who: l.duyet_from },
    { label: "Giao xử lý", at: l.giao_xu_ly_at },
    { label: "Lên SO", at: l.len_so_at },
    { label: "Lên DO", at: l.len_do_at },
  ];
  if (l.duyet_at) {
    moc.push({ label: "Mở ca mới", at: cm?.ca_moi_id ? cm.ca_moi_tn_at : null, who: cm?.ca_moi_id ?? undefined });
    moc.push({
      label: "Đổi trả thành công",
      at: cm?.ca_moi_id && cm.ca_moi_ht_at && /^Hoàn thành/i.test(cm.ca_moi_tien_do) ? cm.ca_moi_ht_at : null,
    });
  }
  const deXuat = Object.entries(l.de_xuat ?? {}).filter(([k, v]) => v && !AN_TRUONG_DE_XUAT.has(k));
  const deXuatChinh = TRUONG_CHINH.map((k) => [k, l.de_xuat?.[k] ?? ""] as [string, string]).filter(([, v]) => v);

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge tone={tt.tone} solid>
              {tt.label}
            </Badge>
            {l.loai_yeu_cau && <Badge tone="gray">{l.loai_yeu_cau}</Badge>}
            {l.serial && <span className="text-xs font-mono text-[var(--ink-500)]">{l.serial}</span>}
          </div>
          {thu.length > 0 && (
            <Btn variant="subtle" size="sm" onClick={() => setDocIdx(thu.length - 1)}>
              ✉ Đọc mail ({thu.length})
            </Btn>
          )}
        </div>
        <ol className="space-y-1">
          {moc.map((m, i) => {
            const truoc = moc.slice(0, i).reverse().find((x) => x.at)?.at ?? null;
            return (
              <li key={m.label} className="flex items-baseline gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full shrink-0 ${m.at ? "bg-[var(--teal-500)]" : "bg-slate-300"}`} />
                <span className={`w-36 shrink-0 ${m.at ? "font-semibold text-[var(--ink-900)]" : "text-[var(--ink-400)]"}`}>{m.label}</span>
                <span className={`shrink-0 ${m.at ? "text-[var(--ink-700)]" : "text-[var(--ink-400)]"}`}>{fmtVn(m.at)}</span>
                {m.at && truoc && <span className="text-xs text-[var(--ink-400)] shrink-0">+{khoang(truoc, m.at)}</span>}
                {m.at && m.who && <span className="text-xs text-[var(--ink-500)] truncate">· {m.who}</span>}
              </li>
            );
          })}
        </ol>
      </Card>

      {cm && <CaMoiCard cm={cm} onOpenCase={onOpenCase} />}

      {deXuat.length > 0 && (
        <Card className="p-3">
          <button type="button" className="w-full flex items-center justify-between gap-2 text-left" onClick={() => setMoDeXuat((v) => !v)}>
            <span className="text-xs font-semibold text-[var(--ink-500)]">Nội dung đề xuất đổi</span>
            <span className="text-xs text-[var(--ocean-600)]">{moDeXuat ? "Thu gọn ▴" : `Xem đủ ${deXuat.length} trường ▾`}</span>
          </button>
          <div className="mt-2">
            <BangDeXuat rows={moDeXuat ? deXuat : deXuatChinh} />
          </div>
        </Card>
      )}

      {thu.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="px-3 pt-2.5 pb-1.5 text-xs font-semibold text-[var(--ink-500)]">Nhật ký mail · bấm 1 thư để đọc</div>
          <ol className="divide-y divide-[var(--line)]">
            {thu.map((t, i) => (
              <li key={`${t.gmail_id}-${i}`}>
                <button type="button" onClick={() => setDocIdx(i)} className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-start gap-3">
                  <span className="text-xs text-[var(--ink-400)] w-[78px] shrink-0 pt-0.5 tabular-nums">{fmtNgan(t.sent_at)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-[var(--ink-900)] truncate max-w-[220px]">{tenNguoiGui(t)}</span>
                      <NhanThu t={t} />
                    </span>
                    <span className="block text-xs text-[var(--ink-500)] truncate">{tomTat(t)}</span>
                  </span>
                  {t.attachments.length > 0 && <span className="text-xs text-[var(--ink-400)] shrink-0 pt-0.5">📎{t.attachments.length}</span>}
                  <span className="text-[var(--ink-400)] shrink-0">›</span>
                </button>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {docIdx !== null && thu[docIdx] && <DocMailModal thu={thu} idx={docIdx} setIdx={setDocIdx} deXuat={deXuat} onClose={() => setDocIdx(null)} />}
    </div>
  );
}
