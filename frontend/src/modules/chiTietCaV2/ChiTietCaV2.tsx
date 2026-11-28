// Giao dien Chi tiet ca v2 - "8 buoc quy trinh" phong cach Apple (2026-11-27, mau chi-tiet-ca-8-buoc v5 Giam doc duyet).
// CHI doi cach HIEN THI: moi khoi noi dung (giai trinh, don LK, PO, lich hen, bao hanh, vi pham...) la DUNG LAI nguyen khoi
// CaseDetail.tsx da dung o v1 (truyen vao qua props) - khong chep logic, khong doi quyen, khong goi them API.
// Luong 8 buoc tinh o lib/buocQuyTrinh.ts (dung chung voi tab Tien trinh chung cua v1).
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CaseRow } from "../../types";
import { fmtDateTime } from "../../types";
import type { TabItem } from "../../components/ui/Tabs";
import { tr } from "../../i18n/tr";
import { fmtKhoang, type BuocQuyTrinh, type KetQuaBuocQuyTrinh, type TrangThaiBuoc } from "../../lib/buocQuyTrinh";
import "./chiTietCaV2.css";

export interface KhoiNoiDung {
  key: string;
  tieuDe: string;
  cu: string; // vi tri cu o v1 (de nguoi dung quen giao dien cu tim lai)
  node: ReactNode;
  dem?: number;
}

export interface ChiTietCaV2Props {
  c: CaseRow;
  kq: KetQuaBuocQuyTrinh;
  // Noi dung day du cua tung buoc (1..8) - khoi DUNG LAI tu v1.
  khoiTheoBuoc: Record<number, KhoiNoiDung[]>;
  // Thong tin ngoai 8 buoc (Tien trinh chung, Vi pham, Khao sat, Ca lap, Nap gas, Tranh chap, Doi tra, NSKX).
  tabPhu: TabItem[];
  noiDungTabPhu: (key: string) => ReactNode;
  tabPhuDangChon: string;
  onChonTabPhu: (key: string) => void;
  // Nut thao tac chinh - luon de ngoai, khong giau trong phan xo.
  hanhDong: ReactNode;
  // Ca doi chieu (bam ca khac trong chuoi serial o Ca lap) - hien canh tren dai tab phu.
  doiChieu: ReactNode;
  // Yeu cau dieu huong tu ngoai (chip "nhay tab" cua v1, module khac mo ca thang 1 tab): mo buoc `so` hoac cuon toi dai tab phu.
  yeuCauMo?: { so: number | null; tabPhu: boolean; seq: number } | null;
}

const MAU_BUOC: Record<number, string> = {
  1: "#0071e3",
  2: "#5856d6",
  3: "#ff9500",
  4: "#ff6b00",
  5: "#2fb350",
  6: "#1d8a3c",
  7: "#af52de",
  8: "#8240a8",
};

const ICON_BUOC: Record<number, string> = {
  1: "M12 5v14M5 12h14",
  2: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  3: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z",
  4: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0",
  5: "M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  6: "M20 6 9 17l-5-5",
  7: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  8: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
};

function nhanTrangThai(t: TrangThaiBuoc): string {
  if (t === "xong") return tr("Đã xong");
  if (t === "dang") return tr("Đang xử lý");
  if (t === "bo_qua") return tr("Bỏ qua");
  return tr("Chưa tới");
}

function IconBuoc({ so }: { so: number }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_BUOC[so]} />
    </svg>
  );
}

function gioNgan(b: BuocQuyTrinh): string {
  return b.luc ? fmtDateTime(b.luc) : "";
}

export function ChiTietCaV2({ c, kq, khoiTheoBuoc, tabPhu, noiDungTabPhu, tabPhuDangChon, onChonTabPhu, hanhDong, doiChieu, yeuCauMo }: ChiTietCaV2Props) {
  const [moBuoc, setMoBuoc] = useState<number | null>(null);
  const [chonBuoc, setChonBuoc] = useState<number | null>(kq.buocHienTai?.so ?? null);
  const [hienTabTrong, setHienTabTrong] = useState(false);
  const theRefs = useRef<Record<number, HTMLElement | null>>({});
  const stripRef = useRef<HTMLDivElement | null>(null);
  const phuRef = useRef<HTMLElement | null>(null);

  // Doi ca (popup mo ca khac) -> ve lai buoc hien tai, dong the dang mo.
  useEffect(() => {
    setMoBuoc(null);
    setChonBuoc(kq.buocHienTai?.so ?? null);
  }, [c.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dien thoai (dai 8 o cuon ngang): cuon ngang toi o dang xu ly de nhin 1 giay biet ca dang o dau (chi cuon NGANG, khong keo trang).
  useEffect(() => {
    const strip = stripRef.current;
    const o = strip?.querySelector<HTMLElement>(".cdv2-tile.dang");
    if (!strip || !o || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollLeft = o.offsetLeft - strip.offsetLeft - (strip.clientWidth - o.offsetWidth) / 2;
  }, [c.id, kq.buocHienTai?.so]);

  const den = (so: number, mo: boolean) => {
    setChonBuoc(so);
    if (mo) setMoBuoc(so);
    requestAnimationFrame(() => theRefs.current[so]?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  useEffect(() => {
    if (!yeuCauMo) return;
    if (yeuCauMo.so) den(yeuCauMo.so, true);
    else if (yeuCauMo.tabPhu) requestAnimationFrame(() => phuRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [yeuCauMo?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabCoNoiDung = tabPhu.filter((t) => t.count === undefined || t.count > 0 || t.key === tabPhuDangChon || t.key === "tien-trinh-chung");
  const tabTrong = tabPhu.filter((t) => !tabCoNoiDung.includes(t));
  const tabHien = hienTabTrong ? tabPhu : tabCoNoiDung;

  return (
    <div className="cdv2">
      {/* Tom tat + dai 8 o */}
      <section className="cdv2-card cdv2-strip-card">
        <div className="cdv2-sum">
          <div className="cdv2-sum-t">
            <b>{kq.tomTat}</b>
            <span className="cdv2-muted">
              {" · "}
              {tr("{0}/8 xong", kq.soXong)}
              {kq.tomTatTong ? ` · ${kq.tomTatTong}` : ""}
            </span>
          </div>
          <div className="cdv2-acts">{hanhDong}</div>
        </div>
        <div className="cdv2-meta">
          <div>
            <span>{tr("Khách hàng")}</span>
            <b>{c.khach_hang ?? "—"}</b>
          </div>
          <div>
            <span>{tr("Sản phẩm · Serial")}</span>
            <b>{[c.hang, c.san_pham_bao_hanh ?? c.nhom_san_pham, c.seri_san_pham].filter(Boolean).join(" · ") || "—"}</b>
          </div>
          <div>
            <span>{tr("Kỹ thuật viên")}</span>
            <b>{c.ktv_trien_khai || c.ky_thuat_vien || "—"}</b>
          </div>
          <div>
            <span>{tr("Khu vực")}</span>
            <b>{[c.khu_vuc, c.doi_tac].filter(Boolean).join(" · ") || "—"}</b>
          </div>
        </div>
        <div className="cdv2-strip" role="list" ref={stripRef}>
          {kq.buoc.map((b) => (
            <button
              key={b.so}
              type="button"
              role="listitem"
              disabled={b.trangThai === "bo_qua"}
              className={`cdv2-tile ${b.trangThai} ${chonBuoc === b.so ? "on" : ""}`}
              title={[`${b.so}. ${b.ten}`, nhanTrangThai(b.trangThai), gioNgan(b), b.nguoi ?? "", ...b.chiSo, b.ghiChu ?? ""].filter(Boolean).join("\n")}
              onClick={() => den(b.so, true)}
            >
              <span className="cdv2-tc">{b.trangThai === "xong" ? "✓" : b.so}</span>
              <span className="cdv2-tn">{b.tenNgan}</span>
              <span className="cdv2-td">
                {b.trangThai === "bo_qua" ? b.ghiChu ?? tr("Bỏ qua") : b.luc ? fmtDateTime(b.luc).slice(0, 11) : b.ghiChu ?? nhanTrangThai(b.trangThai)}
              </span>
              <span className="cdv2-ts">{b.cachTruocMs !== null ? `+${fmtKhoang(b.cachTruocMs)}` : b.trangThai === "dang" ? tr("đang chờ") : " "}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Luoi the buoc */}
      <div className="cdv2-grid">
        {kq.buoc.map((b) => {
          const khoi = khoiTheoBuoc[b.so] ?? [];
          const mo = moBuoc === b.so;
          return (
            <article
              key={b.so}
              ref={(el) => {
                theRefs.current[b.so] = el;
              }}
              className={`cdv2-sc ${b.trangThai} ${mo ? "open" : ""} ${chonBuoc === b.so ? "sel" : ""}`}
              style={{ ["--c" as string]: MAU_BUOC[b.so] }}
            >
              <header className="cdv2-sc-h">
                <span className="cdv2-ic">
                  <IconBuoc so={b.so} />
                </span>
                <h4 className="cdv2-sc-t">
                  <span className="cdv2-no">{tr("Bước {0}", b.so)}</span>
                  {b.ten}
                </h4>
                <span className={`cdv2-pill ${b.trangThai}`}>{nhanTrangThai(b.trangThai)}</span>
              </header>
              {b.trangThai === "bo_qua" ? (
                <p className="cdv2-skip">{b.ghiChu ?? tr("Bước này không áp dụng cho ca.")}</p>
              ) : (
                <div className="cdv2-pt">
                  <div>
                    <div className="cdv2-lab">{tr("Người thực hiện")}</div>
                    <div className="cdv2-val">{b.nguoi ?? b.ai}</div>
                  </div>
                  <div>
                    <div className="cdv2-lab">{tr("Thời gian")}</div>
                    <div className="cdv2-val tnum">{b.luc ? fmtDateTime(b.luc) : "—"}</div>
                    {b.cachTruocMs !== null && <div className="cdv2-subv">{tr("+{0} so với bước trước", fmtKhoang(b.cachTruocMs))}</div>}
                  </div>
                </div>
              )}
              {b.trangThai !== "bo_qua" && b.ghiChu && <p className="cdv2-skip">{b.ghiChu}</p>}
              {b.chiSo.length > 0 && (
                <div className="cdv2-chips">
                  {b.chiSo.map((s, i) => (
                    <span key={i} className="cdv2-chip">
                      {s}
                    </span>
                  ))}
                </div>
              )}
              {mo && (
                <div className="cdv2-more">
                  {khoi.length === 0 && <div className="cdv2-muted">{tr("Chưa có dữ liệu chi tiết cho bước này.")}</div>}
                  {khoi.map((k) => (
                    <section key={k.key} className="cdv2-khoi">
                      <div className="cdv2-khoi-h">
                        <b>{k.tieuDe}</b>
                        {k.dem !== undefined && <span className="cdv2-dem">{k.dem}</span>}
                        <span className="cdv2-cu">{tr("cũ: {0}", k.cu)}</span>
                      </div>
                      {k.node}
                    </section>
                  ))}
                </div>
              )}
              <footer className="cdv2-sc-f">
                {!mo && khoi.length > 0 && (
                  <span className="cdv2-muted small">{khoi.map((k) => (k.dem ? `${k.tieuDe} (${k.dem})` : k.tieuDe)).join(" · ")}</span>
                )}
                <button type="button" className="cdv2-lnk" onClick={() => (mo ? setMoBuoc(null) : den(b.so, true))}>
                  {mo ? tr("▴ Thu gọn") : tr("▾ Xem đầy đủ")}
                </button>
              </footer>
            </article>
          );
        })}
      </div>

      {doiChieu && <section className="cdv2-card">{doiChieu}</section>}

      {/* Thong tin ngoai 8 buoc */}
      <section className="cdv2-card" ref={phuRef} style={{ scrollMarginTop: 12 }}>
        <div className="cdv2-ftitle">{tr("Thông tin ngoài 8 bước")}</div>
        <div className="cdv2-otabs" role="tablist">
          {tabHien.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === tabPhuDangChon}
              className={`${t.key === tabPhuDangChon ? "on" : ""} ${t.count === 0 ? "z" : ""}`}
              onClick={() => onChonTabPhu(t.key)}
            >
              {t.label}
              {t.count !== undefined && <span className="c">{t.count}</span>}
            </button>
          ))}
          {tabTrong.length > 0 && (
            <button type="button" className="more" onClick={() => setHienTabTrong((v) => !v)}>
              {hienTabTrong ? tr("Thu gọn ▲") : tr("+{0} mục trống ▾", tabTrong.length)}
            </button>
          )}
        </div>
        <div className="cdv2-phu">{noiDungTabPhu(tabPhuDangChon)}</div>
      </section>

      {/* Dien thoai: nut thao tac chinh ghim thanh kinh mo duoi day (tren may tinh nut nam trong the tom tat). */}
      <div className="cdv2-bar">{hanhDong}</div>
    </div>
  );
}
