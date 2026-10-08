// Tab "Luồng mail" trong Chi tiet ca - luong mail doi tra cua ca keo tu he theodoidoimay qua backend DVBH
// (GET /api/cases/:id/mail-timeline -> backend/src/lib/mailTimeline.ts). Goi theo yeu cau khi mo ca,
// khong luu D1 (giong lib/linhKienTimeline.ts).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Badge, type AnyBadgeTone } from "./ui/Badge";
import { Card } from "./ui/Card";
import { Field } from "./ui/Field";
import { LoadingInline } from "./ui/LoadingInline";

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

export interface MailTimelineResult {
  configured: boolean;
  ok: boolean;
  error: string | null;
  found: boolean;
  luong: MailLuong | null;
  thu: MailThu[];
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

// Cac truong nhay cam / da co o the Thong tin ca - an khoi bang de xuat.
const AN_TRUONG_DE_XUAT = new Set(["SĐT", "Địa chỉ"]);

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

export function LuongMailPanel({ caseId }: { caseId: string }) {
  const { data, isLoading } = useMailTimeline(caseId);
  const [moRong, setMoRong] = useState<Record<number, boolean>>({});

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
  const tt = TRANG_THAI[l.trang_thai] ?? { label: l.trang_thai, tone: "gray" as const };
  const moc: { label: string; at: string | null; who?: string }[] = [
    { label: "Phát sinh", at: l.origin_at, who: l.origin_name || l.origin_email },
    { label: "Karofi tiếp nhận", at: l.tiep_nhan_at },
    { label: "Đề xuất đổi", at: l.de_xuat_at, who: l.de_xuat_from },
    { label: l.duyet_xac_nhan ? "Duyệt (đã xác nhận)" : "Duyệt", at: l.duyet_at, who: l.duyet_from },
    { label: "Giao xử lý", at: l.giao_xu_ly_at },
    { label: "Lên SO", at: l.len_so_at },
    { label: "Lên DO", at: l.len_do_at },
  ];
  const deXuat = Object.entries(l.de_xuat ?? {}).filter(([k, v]) => v && !AN_TRUONG_DE_XUAT.has(k));

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge tone={tt.tone} solid>
              {tt.label}
            </Badge>
            {l.loai_yeu_cau && <Badge tone="gray">{l.loai_yeu_cau}</Badge>}
            {l.serial && <span className="text-xs font-mono text-[var(--ink-500)]">{l.serial}</span>}
          </div>
          <span className="text-xs text-[var(--ink-400)]">{l.msg_count} thư</span>
        </div>
        <ol className="space-y-1.5">
          {moc.map((m, i) => {
            const truoc = moc.slice(0, i).reverse().find((x) => x.at)?.at ?? null;
            return (
              <li key={m.label} className="flex items-baseline gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full shrink-0 ${m.at ? "bg-[var(--teal-500)]" : "bg-slate-300"}`} />
                <span className={`w-36 shrink-0 ${m.at ? "font-semibold text-[var(--ink-900)]" : "text-[var(--ink-400)]"}`}>{m.label}</span>
                <span className={m.at ? "text-[var(--ink-700)]" : "text-[var(--ink-400)]"}>{fmtVn(m.at)}</span>
                {m.at && truoc && <span className="text-xs text-[var(--ink-400)]">+{khoang(truoc, m.at)}</span>}
                {m.at && m.who && <span className="text-xs text-[var(--ink-500)] truncate">· {m.who}</span>}
              </li>
            );
          })}
        </ol>
      </Card>

      {deXuat.length > 0 && (
        <Card className="p-3">
          <div className="text-xs font-semibold text-[var(--ink-500)] mb-2">Nội dung đề xuất đổi</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {deXuat.map(([k, v]) => (
              <Field
                key={k}
                label={k}
                value={/^https?:\/\//.test(v) ? <a className="text-[var(--ocean-600)] hover:underline" href={v} target="_blank" rel="noreferrer">Mở link</a> : v}
              />
            ))}
          </div>
        </Card>
      )}

      <div>
        <div className="text-xs font-semibold text-[var(--ink-500)] mb-2">Các thư trong luồng</div>
        <div className="space-y-2">
          {data.thu.map((t, i) => {
            const mocThu = MOC_THU[t.moc];
            const dai = t.body_new.length > 280;
            return (
              <Card key={`${t.gmail_id}-${i}`} className="p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    <span className="font-semibold text-sm truncate">{t.from_name || t.from_email}</span>
                    {t.from_name && <span className="text-xs text-[var(--ink-400)]">{t.from_email}</span>}
                    {t.la_de_xuat === 1 && <Badge tone="amber">Đề xuất</Badge>}
                    {t.la_duyet === 1 && <Badge tone="teal">Duyệt</Badge>}
                    {mocThu && <Badge tone={mocThu.tone}>{mocThu.label}</Badge>}
                    {t.nguon === "trich_dan" && <Badge tone="gray">Từ trích dẫn</Badge>}
                  </div>
                  <span className="text-xs text-[var(--ink-500)]">{fmtVn(t.sent_at)}</span>
                </div>
                <div className="text-xs text-[var(--ink-400)] mb-1.5 truncate">{t.subject}</div>
                {t.body_new && (
                  <div className="text-sm text-[var(--ink-700)] whitespace-pre-line">
                    {dai && !moRong[i] ? `${t.body_new.slice(0, 280)}…` : t.body_new}
                    {dai && (
                      <button type="button" className="ml-1 text-xs font-semibold text-[var(--ocean-600)] hover:underline" onClick={() => setMoRong((s) => ({ ...s, [i]: !s[i] }))}>
                        {moRong[i] ? "Thu gọn" : "Xem thêm"}
                      </button>
                    )}
                  </div>
                )}
                {(t.attachments.length > 0 || t.gmail_link) && (
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-[var(--ink-500)] flex-wrap">
                    {t.attachments.length > 0 && <span>📎 {t.attachments.map((a) => a.name).join(", ")}</span>}
                    {t.gmail_link && (
                      <a className="text-[var(--ocean-600)] hover:underline" href={t.gmail_link} target="_blank" rel="noreferrer">
                        Mở trong Gmail theo dõi
                      </a>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
